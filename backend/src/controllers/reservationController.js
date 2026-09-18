const { addPayment, deletePayment, saveInvoice } = require('./reservationPaymentsController');
const { ledgerTotal, ensureLegacyPayment, setPaidAmount } = require('../services/paymentLedger');
const { findConflict, unavailableUnits, validateExtraUnits } = require('../services/reservationAvailability');
const { validateReservationInput } = require('../services/reservationValidation');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../config/database');
const {
  calculateReservationTotals,
  buildNightlyPrices,
  getPaymentStatus,
  getReservationBirthDates,
  validateReservationBirthDates,
} = require('../services/reservationRules');
const {
  getAccommodationScope,
  getUnavailableAccommodationIds,
} = require('../services/availabilityRules');
const {
  findBlockConflict,
  getBlockedAccommodationIds,
} = require('../services/accommodationBlockService');
const { notifyOrganization } = require('../services/pushService');
const { recordHistory, diffReservationFields } = require('../services/reservationHistoryService');
const { getOccupancyStats, occupancyRate, firstOfMonth: firstDayOfMonth } = require('../services/occupancyStats');

function safeJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

// Total padrão do calendário dinâmico. Reservas multi-suite: base = soma, por
// suite, dos preços/noite dessa suite (períodos dinâmicos próprios); extras
// (taxa turística, pequeno-almoço, ocupação extra) contam uma única vez.
function computeStandardTotals(organizationId, resLike, primaryAccommodation, primaryPeriods, services, birthDates) {
  const single = calculateReservationTotals(primaryAccommodation, services, {
    check_in: resLike.check_in,
    check_out: resLike.check_out,
    num_guests: resLike.num_guests,
    breakfast_included: resLike.breakfast_included,
    birth_dates: birthDates,
    pricing_periods: primaryPeriods,
  });
  const accsData = safeJson(resLike.accommodations_data, []);
  if (!Array.isArray(accsData) || accsData.length <= 1) return single;

  let base = 0;
  for (const item of accsData) {
    const acc = db.prepare('SELECT * FROM accommodations WHERE id = ? AND organization_id = ?')
      .get(item.accommodation_id, organizationId);
    if (!acc) { base += Number(item.subtotal || 0); continue; }
    const periods = db.prepare('SELECT * FROM pricing_periods WHERE accommodation_id = ? AND organization_id = ? ORDER BY start_date ASC')
      .all(item.accommodation_id, organizationId);
    base += buildNightlyPrices(Number(acc.price_per_night || 0), single.checkIn, single.checkOut, periods)
      .reduce((sum, n) => sum + (Number(n.price) || 0), 0);
  }
  const extras = single.touristTax + single.breakfastCost + single.extraOccupancyCost;
  return { ...single, baseAmount: base, totalAmount: base + extras };
}

function upsertAdditionalGuests(guestsData, organizationId) {
  if (!Array.isArray(guestsData) || !guestsData.length) return guestsData || [];
  return guestsData.map((g, i) => {
    if (!g?.name) return g;
    const email = g.email?.trim() || `guest_${Date.now()}_${i}@sem-email.local`;
    let existing = email
      ? db.prepare('SELECT id FROM guests WHERE email = ? AND organization_id = ?').get(email, organizationId)
      : null;
    if (!existing && g.id) {
      existing = db.prepare('SELECT id FROM guests WHERE id = ? AND organization_id = ?').get(g.id, organizationId);
    }
    if (existing) {
      db.prepare(`UPDATE guests SET
        name = COALESCE(?, name), phone = COALESCE(?, phone),
        nationality = COALESCE(?, nationality), country = COALESCE(?, country),
        birth_date = COALESCE(?, birth_date), birth_city = COALESCE(?, birth_city),
        document_type = COALESCE(?, document_type), document_number = COALESCE(?, document_number),
        document_issuer_country = COALESCE(?, document_issuer_country),
        nif = COALESCE(?, nif), updated_at = datetime('now')
        WHERE id = ? AND organization_id = ?
      `).run(g.name || null, g.phone || null, g.nationality || null, g.country || null,
             g.birth_date || null, g.birth_city || null, g.document_type || null,
             g.document_number || null, g.document_issuer_country || null, g.nif || null,
             existing.id, organizationId);
      return { ...g, id: existing.id };
    }
    const newId = uuidv4();
    const nameParts = (g.name || '').split(/\s+/);
    db.prepare(`INSERT INTO guests
      (id, organization_id, name, first_name, last_name, email, phone,
       nationality, country, birth_date, birth_city,
       document_type, document_number, document_issuer_country, nif)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(newId, organizationId, g.name,
           g.first_name || nameParts[0] || '', g.last_name || nameParts.slice(1).join(' ') || '',
           email, g.phone || null,
           g.nationality || null, g.country || null, g.birth_date || null, g.birth_city || null,
           g.document_type || null, g.document_number || null, g.document_issuer_country || null,
           g.nif || null);
    return { ...g, id: newId };
  });
}

function getOrganizationServices(organizationId) {
  const row = db.prepare("SELECT value FROM organization_settings WHERE organization_id = ? AND key = 'services'").get(organizationId);
  return row ? safeJson(row.value, []) : [];
}

const { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent, syncOperationalEventsToGoogle } = require('../services/calendarService');
const { sendConfirmationEmail, sendCancellationEmail, sendPaymentConfirmationEmail, sendPreCheckinEmail } = require('../services/emailService');
const { recordConsent } = require('../services/rgpdService');
const {
  syncReservationOperationalTasks,
  syncOrganizationOperationalTasks,
} = require('../services/operationalTasksService');

function publicUrl(req) {
  const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
  return `${proto}://${req.get('host')}`;
}

function ensurePublicToken(reservation) {
  if (reservation.public_token) return reservation.public_token;
  const token = uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '');
  db.prepare("UPDATE reservations SET public_token = ?, updated_at = datetime('now') WHERE id = ? AND organization_id = ?")
    .run(token, reservation.id, reservation.organization_id);
  reservation.public_token = token;
  return token;
}

function ensurePrecheckinToken(reservation) {
  if (reservation.precheckin_token) return reservation.precheckin_token;
  const token = uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '');
  const expiresAt = reservation.check_out || null;
  db.prepare("UPDATE reservations SET precheckin_token = ?, precheckin_token_expires_at = ?, updated_at = datetime('now') WHERE id = ? AND organization_id = ?")
    .run(token, expiresAt, reservation.id, reservation.organization_id);
  reservation.precheckin_token = token;
  reservation.precheckin_token_expires_at = expiresAt;
  return token;
}

// Sincroniza as tarefas auto-geradas de uma reserva (check-in/check-out/limpeza) com
// o Google Calendar e/ou o Google Tasks — ver syncOperationalEventsToGoogle em
// services/calendarService.js. A reserva em si (createCalendarEvent/updateCalendarEvent,
// chamados à parte) não passa por aqui — continua sempre automática.
function syncReservationTasksToGoogle(reservationId, organizationId, userId) {
  const tasks = db.prepare(
    "SELECT * FROM operational_events WHERE reservation_id = ? AND organization_id = ? AND auto_generated = 1 AND status != 'concluido'"
  ).all(reservationId, organizationId);
  if (!tasks.length) return;
  syncOperationalEventsToGoogle(tasks, { userId, organizationId })
    .catch(err => console.error('Erro ao sincronizar tarefas da reserva:', err.message));
}

// Returns conflicting reservation ID (if any) for the given accommodation + date range.
// Uses parent_id hierarchy: booking an alojamento blocks all child suites and vice versa.


// GET /api/reservations/availability?check_in=&check_out=&exclude_id=
async function getAvailability(req, res, next) {
  try {
    const { check_in, check_out, exclude_id } = req.query;
    const organizationId = req.user.organization_id;
    if (!check_in || !check_out) {
      return res.json({ success: true, data: { unavailable: [] } });
    }

    const unavailable = unavailableUnits(organizationId, check_in, check_out, exclude_id);
    res.json({ success: true, data: { unavailable } });
  } catch (err) {
    next(err);
  }
}

// GET /api/reservations
async function getAll(req, res, next) {
  try {
    const { status, accommodation_id, from, to } = req.query;
    const organizationId = req.user.organization_id;

    let query = `
      SELECT r.*, g.name as guest_name, g.email as guest_email, g.phone as guest_phone,
             a.name as accommodation_name
      FROM reservations r
      JOIN guests g ON r.guest_id = g.id
      JOIN accommodations a ON r.accommodation_id = a.id
      WHERE r.organization_id = ?
    `;
    const params = [organizationId];

    if (status) { query += ' AND r.status = ?'; params.push(status); }
    if (accommodation_id) { query += ' AND r.accommodation_id = ?'; params.push(accommodation_id); }
    if (from) { query += ' AND r.check_in >= ?'; params.push(from); }
    if (to) { query += ' AND r.check_out <= ?'; params.push(to); }

    query += ' ORDER BY r.check_in ASC';

    const reservations = db.prepare(query).all(...params);

    if (reservations.length) {
      const checkoutRows = db.prepare(`
        SELECT reservation_id, status FROM (
          SELECT oe.reservation_id, oe.status,
                 ROW_NUMBER() OVER (
                   PARTITION BY oe.reservation_id
                   ORDER BY (oe.date = r.check_out) DESC, oe.created_at DESC
                 ) as rn
          FROM operational_events oe
          JOIN reservations r ON r.id = oe.reservation_id
          WHERE oe.organization_id = ? AND oe.auto_kind = 'checkout'
        ) t WHERE rn = 1
      `).all(organizationId);
      const checkoutDoneMap = new Map(checkoutRows.map(row => [row.reservation_id, row.status === 'concluido']));
      reservations.forEach(r => {
        r.task_status = { checkout_done: checkoutDoneMap.get(r.id) || false };
      });
    }

    res.json({ success: true, data: reservations });
  } catch (err) {
    next(err);
  }
}

// GET /api/reservations/:id
async function getById(req, res, next) {
  try {
    const reservation = db.prepare(`
      SELECT r.*, g.name as guest_name, g.email as guest_email, g.phone as guest_phone,
             g.document_number, g.nationality, g.rgpd_consent,
             g.company as guest_company, g.nif as guest_nif,
             a.name as accommodation_name, a.license_number
      FROM reservations r
      JOIN guests g ON r.guest_id = g.id
      JOIN accommodations a ON r.accommodation_id = a.id
      WHERE r.id = ? AND r.organization_id = ?
    `).get(req.params.id, req.user.organization_id);

    if (!reservation) return res.status(404).json({ error: 'Reserva não encontrada' });

    reservation.payments = db.prepare(`
      SELECT * FROM reservation_payments
      WHERE reservation_id = ? AND organization_id = ?
      ORDER BY payment_date ASC, created_at ASC
    `).all(req.params.id, req.user.organization_id);

    // Estado das tarefas de check-in/check-out (para os botões "feito" na ficha)
    reservation.task_status = getReservationTaskStatus(req.user.organization_id, reservation);

    // Total padrão do calendário dinâmico (referência para desconto/acréscimo na ficha)
    try {
      const orgId = req.user.organization_id;
      const acc = db.prepare('SELECT * FROM accommodations WHERE id = ? AND organization_id = ?')
        .get(reservation.accommodation_id, orgId);
      const periods = db.prepare('SELECT * FROM pricing_periods WHERE accommodation_id = ? AND organization_id = ? ORDER BY start_date ASC')
        .all(reservation.accommodation_id, orgId);
      const guestRow = db.prepare('SELECT birth_date FROM guests WHERE id = ? AND organization_id = ?')
        .get(reservation.guest_id, orgId) || {};
      const standard = computeStandardTotals(
        orgId, reservation, acc, periods, getOrganizationServices(orgId),
        getReservationBirthDates(guestRow, safeJson(reservation.guests_data, []))
      );
      reservation.standard_total = standard.totalAmount;
      reservation.standard_nightly_prices = standard.nightlyPrices;
    } catch { /* referência indisponível */ }

    if (reservation.price_edited_by_user_id) {
      reservation.price_edited_by_name = db.prepare('SELECT name FROM users WHERE id = ?')
        .get(reservation.price_edited_by_user_id)?.name || null;
    }

    res.json({ success: true, data: reservation });
  } catch (err) {
    next(err);
  }
}

// POST /api/reservations/:id/payments
// POST /api/reservations
async function create(req, res, next) {
  try {
    const { reservation, reservationId, guestRecord, accommodation, organizationId } = db.transaction(() => {
    validateReservationInput(req.body);
    const {
      guest, accommodation_id, check_in, check_out,
      num_guests, num_adults, num_children, breakfast_included, channel, payment_method,
      notes, rgpd_consent, rgpd_ip, guests_data, voucher_code,
      amount_paid, payment_date, payment_status: reqPaymentStatus,
      total_amount: manualTotalCreate, nightly_prices: nightlyPricesCreate
    } = req.body;
    const initialStatus = req.body.status || 'confirmada';
    const extraUnits = req.body.accommodations_data || [];
    const totalGuests = (num_adults != null || num_children != null)
      ? (Number(num_adults ?? 1) + Number(num_children ?? 0))
      : (num_guests || 1);
    const organizationId = req.user.organization_id;

    if (!accommodation_id || !check_in || !check_out) {
      throw Object.assign(new Error(({ error: 'Datas e alojamento são obrigatórios' }).error), { status: 400 });
    }

    // Normalizar dados do hóspede — todos os campos são opcionais no backoffice
    const guestName  = guest?.name?.trim()  || 'Hóspede';
    const guestEmail = guest?.email?.trim() || `sp-interno-${Date.now()}@reserva.local`;

    // Criar ou actualizar hóspede
    let guestRecord = db.prepare('SELECT * FROM guests WHERE email = ? AND organization_id = ?').get(guestEmail, organizationId);

    if (!guestRecord) {
      const guestId = uuidv4();
      db.prepare(`
        INSERT INTO guests (id, name, email, phone, document_type, document_number, document_issuer_country,
          nationality, first_name, last_name, birth_date, birth_city, nif, country, address, postal_code, city, company, organization_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(guestId, guestName, guestEmail, guest?.phone || null,
             guest?.document_type || null, guest?.document_number || null,
             guest?.document_issuer_country || null, guest?.nationality || null,
             guest?.first_name || null, guest?.last_name || null, guest?.birth_date || null,
             guest?.birth_city || null, guest?.nif || null, guest?.country || null,
             guest?.address || null, guest?.postal_code || null, guest?.city || null,
             guest?.company || null, organizationId);
      guestRecord = db.prepare('SELECT * FROM guests WHERE id = ? AND organization_id = ?').get(guestId, organizationId);
    } else {
      db.prepare(`UPDATE guests SET
        name = COALESCE(?, name), phone = COALESCE(?, phone),
        document_type = COALESCE(?, document_type), document_number = COALESCE(?, document_number),
        document_issuer_country = COALESCE(?, document_issuer_country),
        nationality = COALESCE(?, nationality), first_name = COALESCE(?, first_name),
        last_name = COALESCE(?, last_name), birth_date = COALESCE(?, birth_date),
        birth_city = COALESCE(?, birth_city),
        nif = COALESCE(?, nif), country = COALESCE(?, country),
        address = COALESCE(?, address), postal_code = COALESCE(?, postal_code), city = COALESCE(?, city),
        company = COALESCE(?, company)
        WHERE id = ? AND organization_id = ?`).run(
        guest?.name || null, guest?.phone || null,
        guest?.document_type || null, guest?.document_number || null,
        guest?.document_issuer_country || null,
        guest?.nationality || null, guest?.first_name || null,
        guest?.last_name || null, guest?.birth_date || null,
        guest?.birth_city || null,
        guest?.nif || null, guest?.country || null,
        guest?.address || null, guest?.postal_code || null, guest?.city || null,
        guest?.company || null,
        guestRecord.id,
        organizationId
      );
      guestRecord = db.prepare('SELECT * FROM guests WHERE id = ? AND organization_id = ?').get(guestRecord.id, organizationId);
    }

    // Registar consentimento RGPD
    if (rgpd_consent) {
      recordConsent(guestRecord.id, rgpd_ip || req.ip, organizationId);
    }

    // Calcular valores
    const accommodation = db.prepare('SELECT * FROM accommodations WHERE id = ? AND organization_id = ?').get(accommodation_id, organizationId);
    if (!accommodation) throw Object.assign(new Error(({ error: 'Alojamento não encontrado' }).error), { status: 404 });
    if (totalGuests > Number(accommodation.max_guests || 0)) {
      throw Object.assign(new Error(({ error: `Este alojamento permite no máximo ${accommodation.max_guests} hóspedes.` }).error), { status: 400 });
    }

    const pricingPeriods = db.prepare(
      'SELECT * FROM pricing_periods WHERE accommodation_id = ? AND organization_id = ? ORDER BY start_date ASC'
    ).all(accommodation_id, organizationId);

    let totals;
    try {
      totals = calculateReservationTotals(accommodation, getOrganizationServices(organizationId), {
        check_in,
        check_out,
        num_guests: totalGuests,
        pricing_periods: pricingPeriods,
        breakfast_included,
        guest,
        guests_data: guests_data || [],
        nightly_prices: nightlyPricesCreate,
      });
    } catch (error) {
      throw Object.assign(new Error(({ error: error.message }).error), { status: 400 });
    }

    // Verificar disponibilidade (anti double-booking)
    const conflict = findConflict(organizationId, accommodation_id, totals.checkIn, totals.checkOut, null);
    if (conflict) {
      throw Object.assign(new Error(({
        error: `Este alojamento já está ocupado nessas datas (reserva ${conflict.id}).`
      }).error), { status: 409 });
    }

    // Verificar bloqueios manuais (manutenção, uso pessoal, etc.)
    const block = findBlockConflict(organizationId, accommodation_id, totals.checkIn, totals.checkOut);
    if (block) {
      throw Object.assign(new Error(({
        error: `Estas datas estão bloqueadas${block.reason ? ` (${block.reason})` : ''}.`
      }).error), { status: 409 });
    }

    validateExtraUnits(organizationId, extraUnits, accommodation_id, totals.checkIn, totals.checkOut, null);

    // Aplicar voucher se fornecido
    let voucherDiscount = 0;
    let appliedVoucherId = null;
    if (voucher_code) {
      const vCode = String(voucher_code).toUpperCase().trim();
      const voucher = db.prepare(
        "SELECT * FROM vouchers WHERE code = ? AND organization_id = ? AND status = 'active'"
      ).get(vCode, organizationId);
      if (voucher) {
        const today = new Date().toISOString().slice(0, 10);
        const dateOk = (!voucher.valid_from || voucher.valid_from <= today) && (!voucher.valid_until || voucher.valid_until >= today);
        if (dateOk) {
          appliedVoucherId = voucher.id;
          voucherDiscount = voucher.type === 'discount_pct'
            ? totals.totalAmount * (voucher.value / 100)
            : Math.min(voucher.value, totals.totalAmount);
        }
      }
    }
    const voucherAdjusted = Math.max(0, totals.totalAmount - voucherDiscount);
    const finalTotal = manualTotalCreate !== undefined ? Number(manualTotalCreate) : voucherAdjusted;

    // Edição manual = total gravado difere do padrão do calendário dinâmico
    // (sem overrides por noite), descontado o voucher. Fica registado quem/quando.
    let priceEdited = false;
    try {
      const standard = calculateReservationTotals(accommodation, getOrganizationServices(organizationId), {
        check_in, check_out, num_guests: totalGuests,
        pricing_periods: pricingPeriods, breakfast_included,
        guest, guests_data: guests_data || [],
      });
      priceEdited = Math.abs(finalTotal - Math.max(0, standard.totalAmount - voucherDiscount)) > 0.01;
    } catch { /* referência indisponível — não marcar */ }

    const paidAmt = Number(amount_paid) || 0;
    const autoPaymentStatus = getPaymentStatus(paidAmt, finalTotal, reqPaymentStatus || 'pendente');

    // Criar reserva
    const reservationId = `SP-${uuidv4().slice(0, 8).toUpperCase()}`;
    db.prepare(`
      INSERT INTO reservations (
        id, organization_id, guest_id, accommodation_id, check_in, check_out, nights, num_guests,
        num_adults, num_children,
        total_amount, breakfast_included, tourist_tax, channel, payment_method,
        notes, license_number, guests_data, amount_paid, payment_date, payment_status, nightly_prices,
        price_edited_at, price_edited_by_user_id, status, accommodations_data
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      reservationId, organizationId, guestRecord.id, accommodation_id, totals.checkIn, totals.checkOut,
      totals.nights, totals.guests,
      num_adults != null ? Number(num_adults) : totals.guests,
      num_children != null ? Number(num_children) : 0,
      finalTotal, totals.breakfastIncluded,
      totals.touristTax, channel || 'direto', payment_method || null,
      notes || null, accommodation.license_number,
      JSON.stringify(upsertAdditionalGuests(guests_data, organizationId)),
      paidAmt, payment_date || null, autoPaymentStatus,
      JSON.stringify(totals.nightlyPrices || []),
      priceEdited ? new Date().toISOString() : null,
      priceEdited ? req.user.id : null, initialStatus, JSON.stringify(extraUnits)
    );
    if (appliedVoucherId) {
      db.prepare(
        "UPDATE vouchers SET status = 'used', used_at = datetime('now'), used_in_reservation_id = ?, updated_at = datetime('now') WHERE id = ? AND organization_id = ?"
      ).run(reservationId, appliedVoucherId, organizationId);
    }

    const reservation = db.prepare('SELECT * FROM reservations WHERE id = ? AND organization_id = ?').get(reservationId, organizationId);
    ensureLegacyPayment(reservation);
    recordHistory({
      organizationId, reservationId, userId: req.user.id, action: 'created',
      meta: { check_in: reservation.check_in, check_out: reservation.check_out, accommodation_id: reservation.accommodation_id, total_amount: reservation.total_amount },
    });
    syncReservationOperationalTasks({
      ...reservation,
      guest_name: guestRecord.name,
      accommodation_name: accommodation.name,
    }, req.user.id);

      return { reservation, reservationId, guestRecord, accommodation, organizationId };
    }).immediate();

    // Google Calendar (async, não bloqueia resposta)
    syncReservationTasksToGoogle(reservationId, organizationId, req.user.id);
    createCalendarEvent(reservation, { userId: req.user.id, organizationId }).then(eventId => {
      if (eventId) {
        db.prepare('UPDATE reservations SET google_event_id = ?, google_calendar_user_id = ? WHERE id = ? AND organization_id = ?')
          .run(eventId, req.user.id, reservationId, organizationId);
      }
    });

    // Email de confirmação (async)
    sendConfirmationEmail(guestRecord, reservation, accommodation)
      .catch(err => console.warn('Email não enviado:', err.message));

    notifyOrganization(organizationId, 'new_reservation', {
      title: '🆕 Nova reserva',
      body: `${guestRecord.name} · ${accommodation.name} · ${reservation.check_in} → ${reservation.check_out}`,
      url: `/reservas?reserva=${reservation.id}`,
      excludeUserId: req.user.id,
    });

    res.status(201).json({
      success: true,
      data: { ...reservation, guest_name: guestRecord.name, accommodation_name: accommodation.name }
    });

  } catch (err) {
    next(err);
  }
}

// PUT /api/reservations/:id
async function update(req, res, next) {
  try {
    const { updated, accommodation, organizationId, cancelling, nextPaymentStatus, existing } = db.transaction(() => {
    validateReservationInput(req.body);
    const organizationId = req.user.organization_id;
    const existing = db.prepare('SELECT * FROM reservations WHERE id = ? AND organization_id = ?').get(req.params.id, organizationId);
    if (!existing) throw Object.assign(new Error(({ error: 'Reserva não encontrada' }).error), { status: 404 });

    const {
      check_in, check_out, num_guests, num_adults, num_children, breakfast_included,
      channel, payment_method, notes, status, payment_status, guests_data, guest,
      accommodation_id, amount_paid, payment_date, total_amount: manualTotal,
      accommodations_data, nightly_prices: nightlyPricesUpdate
    } = req.body;

    const newAccommodationId = accommodation_id || existing.accommodation_id;
    const accommodation = db.prepare('SELECT * FROM accommodations WHERE id = ? AND organization_id = ?')
      .get(newAccommodationId, organizationId);
    if (!accommodation) throw Object.assign(new Error(({ error: 'Alojamento não encontrado' }).error), { status: 404 });

    const pricingPeriods2 = db.prepare(
      'SELECT * FROM pricing_periods WHERE accommodation_id = ? AND organization_id = ? ORDER BY start_date ASC'
    ).all(newAccommodationId, organizationId);

    const newCheckIn = check_in || existing.check_in;
    const newCheckOut = check_out || existing.check_out;
    const newAdults = num_adults != null ? Number(num_adults) : existing.num_adults;
    const newChildren = num_children != null ? Number(num_children) : (existing.num_children ?? 0);
    const guests = (num_adults != null || num_children != null)
      ? (newAdults + newChildren)
      : (num_guests || existing.num_guests);
    const bkfOn2 = breakfast_included !== undefined ? (breakfast_included ? 1 : 0) : existing.breakfast_included;
    const incomingGuestsData = guests_data !== undefined ? guests_data : safeJson(existing.guests_data, []);
    const existingGuest = db.prepare('SELECT birth_date FROM guests WHERE id = ? AND organization_id = ?').get(existing.guest_id, organizationId) || {};
    const guestForBirthDates = guest || { birth_date: existingGuest.birth_date };
    // Preço por noite: usa o enviado; senão preserva o guardado (reconciliado por data).
    const incomingNightly = nightlyPricesUpdate !== undefined
      ? nightlyPricesUpdate
      : safeJson(existing.nightly_prices, []);
    let totals;
    try {
      totals = calculateReservationTotals(accommodation, getOrganizationServices(organizationId), {
        check_in: newCheckIn,
        check_out: newCheckOut,
        num_guests: guests,
        breakfast_included: bkfOn2,
        birth_dates: getReservationBirthDates(guestForBirthDates, incomingGuestsData),
        pricing_periods: pricingPeriods2,
        nightly_prices: incomingNightly,
      });
    } catch (error) {
      throw Object.assign(new Error(({ error: error.message }).error), { status: 400 });
    }

    // Cancelamento via mudança de estado (dropdown/wizard) — só na transição.
    const cancelling = existing.status !== 'cancelada' && status === 'cancelada';

    // Cancelar nunca deve falhar por disponibilidade — saltar as verificações.
    if (!cancelling) {
      // Verificar disponibilidade (excluir a própria reserva)
      const conflict2 = findConflict(organizationId, newAccommodationId, totals.checkIn, totals.checkOut, req.params.id);
      if (conflict2) {
        throw Object.assign(new Error(({
          error: `Este alojamento já está ocupado nessas datas (reserva ${conflict2.id}).`
        }).error), { status: 409 });
      }

      // Multi-suite: verificar também os quartos adicionais (não só a suite
      // principal) — sem isto seria possível fazer double-booking de um quarto
      // secundário via API, mesmo que a UI já bloqueie isso no cliente.
      if (Array.isArray(accommodations_data)) {
        for (const item of accommodations_data) {
          if (!item?.accommodation_id || item.accommodation_id === newAccommodationId) continue;
          const extraConflict = findConflict(organizationId, item.accommodation_id, totals.checkIn, totals.checkOut, req.params.id);
          if (extraConflict) {
            throw Object.assign(new Error(({
              error: `O alojamento adicional "${item.name || item.accommodation_id}" já está ocupado nessas datas (reserva ${extraConflict.id}).`
            }).error), { status: 409 });
          }
        }
      }

      // Verificar bloqueios manuais
      const block2 = findBlockConflict(organizationId, newAccommodationId, totals.checkIn, totals.checkOut);
      if (block2) {
        throw Object.assign(new Error(({
          error: `Estas datas estão bloqueadas${block2.reason ? ` (${block2.reason})` : ''}.`
        }).error), { status: 409 });
      }
    }

    if (!cancelling) validateExtraUnits(organizationId, accommodations_data ?? safeJson(existing.accommodations_data, []), newAccommodationId, totals.checkIn, totals.checkOut, req.params.id);

    // Actualizar dados do hóspede se fornecidos
    if (guest) {
      db.prepare(`UPDATE guests SET
        name = COALESCE(?, name), email = COALESCE(?, email), phone = COALESCE(?, phone),
        document_type = COALESCE(?, document_type), document_number = COALESCE(?, document_number),
        document_issuer_country = COALESCE(?, document_issuer_country),
        nationality = COALESCE(?, nationality), first_name = COALESCE(?, first_name),
        last_name = COALESCE(?, last_name), birth_date = COALESCE(?, birth_date),
        birth_city = COALESCE(?, birth_city),
        nif = COALESCE(?, nif), country = COALESCE(?, country),
        address = COALESCE(?, address), postal_code = COALESCE(?, postal_code), city = COALESCE(?, city),
        company = COALESCE(?, company)
        WHERE id = ? AND organization_id = ?`).run(
        guest.name || null, guest.email || null, guest.phone || null,
        guest.document_type || null, guest.document_number || null,
        guest.document_issuer_country || null,
        guest.nationality || null, guest.first_name || null,
        guest.last_name || null, guest.birth_date || null,
        guest.birth_city || null,
        guest.nif || null, guest.country || null,
        guest.address || null, guest.postal_code || null, guest.city || null,
        guest.company || null,
        existing.guest_id,
        organizationId
      );
    }
    const newPaidAmt = amount_paid !== undefined ? Number(amount_paid) : (existing.amount_paid || 0);
    const newAccData = accommodations_data !== undefined
      ? JSON.stringify(accommodations_data)
      : (existing.accommodations_data || '[]');
    // Multi-suite sem total explícito: preservar o total guardado — o recálculo
    // só conhece a suite principal e destruiria o valor das restantes.
    const accsCount = safeJson(newAccData, []).length;
    const effectiveTotal = manualTotal !== undefined
      ? Number(manualTotal)
      : (accsCount > 1 ? Number(existing.total_amount) : totals.totalAmount);

    // Edição manual = total efetivo difere do padrão do calendário dinâmico
    // (sem overrides por noite). Preserva o registo anterior se continuar editada.
    let priceEditedAt = existing.price_edited_at || null;
    let priceEditedBy = existing.price_edited_by_user_id || null;
    try {
      const standard = computeStandardTotals(
        organizationId,
        {
          check_in: newCheckIn,
          check_out: newCheckOut,
          num_guests: guests,
          breakfast_included: bkfOn2,
          accommodations_data: newAccData,
        },
        accommodation, pricingPeriods2, getOrganizationServices(organizationId),
        getReservationBirthDates(guestForBirthDates, incomingGuestsData)
      );
      const edited = Math.abs(effectiveTotal - standard.totalAmount) > 0.01;
      if (edited && Math.abs(effectiveTotal - Number(existing.total_amount)) > 0.01) {
        // Nova edição manual — atualizar quem/quando
        priceEditedAt = new Date().toISOString();
        priceEditedBy = req.user.id;
      } else if (!edited) {
        priceEditedAt = null;
        priceEditedBy = null;
      }
    } catch { /* referência indisponível — manter registo atual */ }
    const autoPaymentStatus2 = getPaymentStatus(newPaidAmt, effectiveTotal, payment_status || existing.payment_status || 'pendente');
    const reactivating = existing.status === 'cancelada' && status && status !== 'cancelada';
    const nextStatus = reactivating
      ? (existing.cancelled_previous_status || status)
      : status || (
        existing.status === 'aguardar_pagamento' && newPaidAmt > 0
          ? 'confirmada'
          : existing.status
      );
    const nextPaymentStatus = reactivating && payment_status === undefined
      ? (existing.cancelled_previous_payment_status || existing.payment_status || autoPaymentStatus2)
      : autoPaymentStatus2;

    db.prepare(`
      UPDATE reservations SET
        accommodation_id = ?, check_in = ?, check_out = ?, nights = ?, num_guests = ?,
        num_adults = ?, num_children = ?,
        total_amount = ?, breakfast_included = ?, tourist_tax = ?,
        channel = ?, payment_method = ?, notes = ?, status = ?,
        payment_status = ?, guests_data = ?, accommodations_data = ?,
        amount_paid = ?, payment_date = ?, nightly_prices = ?,
        cancelled_previous_status = ?, cancelled_previous_payment_status = ?,
        price_edited_at = ?, price_edited_by_user_id = ?, updated_at = datetime('now')
      WHERE id = ? AND organization_id = ?
    `).run(
      newAccommodationId,
      totals.checkIn, totals.checkOut, totals.nights, totals.guests,
      newAdults ?? totals.guests, newChildren ?? 0,
      effectiveTotal, totals.breakfastIncluded,
      totals.touristTax,
      channel || existing.channel,
      payment_method !== undefined ? (payment_method || null) : existing.payment_method,
      notes !== undefined ? notes : existing.notes, nextStatus,
      nextPaymentStatus,
      guests_data !== undefined ? JSON.stringify(upsertAdditionalGuests(guests_data, organizationId)) : (existing.guests_data || '[]'),
      newAccData,
      newPaidAmt,
      payment_date !== undefined ? (payment_date || null) : existing.payment_date,
      JSON.stringify(totals.nightlyPrices || []),
      cancelling ? existing.status : (existing.cancelled_previous_status || null),
      cancelling ? existing.payment_status : (existing.cancelled_previous_payment_status || null),
      priceEditedAt, priceEditedBy,
      req.params.id,
      organizationId
    );

    if (amount_paid !== undefined) setPaidAmount(existing, newPaidAmt);
    const updated = db.prepare('SELECT * FROM reservations WHERE id = ? AND organization_id = ?').get(req.params.id, organizationId);
    const historyChanges = diffReservationFields(existing, updated);
    if (historyChanges.length) {
      recordHistory({
        organizationId, reservationId: req.params.id, userId: req.user.id, action: 'updated',
        changes: historyChanges,
        meta: reactivating ? { reactivated: true } : (cancelling ? { cancelled: true } : null),
      });
    }
    syncReservationOperationalTasks({
      ...updated,
      accommodation_name: accommodation.name,
    }, req.user.id);

      return { updated, accommodation, organizationId, cancelling, nextPaymentStatus, existing };
    }).immediate();

    // Google Calendar tarefas (async)
    syncReservationTasksToGoogle(req.params.id, organizationId, req.user.id);

    // Google Calendar: cancelar remove o evento (paridade com o DELETE)
    if (cancelling) {
      deleteCalendarEvent(updated, {
        userId: updated.google_calendar_user_id || req.user.id,
        organizationId
      });
    } else {
      updateCalendarEvent(updated, {
        userId: updated.google_calendar_user_id || req.user.id,
        organizationId
      });
    }

    // Email + push de cancelamento (paridade com o DELETE)
    if (cancelling) {
      const guestRecord = db.prepare('SELECT * FROM guests WHERE id = ? AND organization_id = ?').get(updated.guest_id, organizationId);
      sendCancellationEmail(guestRecord, updated, accommodation)
        .catch(err => console.warn('Email não enviado:', err.message));
      notifyOrganization(organizationId, 'cancellation', {
        title: '❌ Reserva cancelada',
        body: `${guestRecord?.name || 'Hóspede'} · ${accommodation.name} · ${updated.check_in} → ${updated.check_out}`,
        url: `/reservas?reserva=${req.params.id}`,
        excludeUserId: req.user.id,
      });
    }

    // Email de pagamento se confirmado agora
    if (nextPaymentStatus === 'confirmado' && existing.payment_status !== 'confirmado') {
      const guestRecord = db.prepare('SELECT * FROM guests WHERE id = ? AND organization_id = ?').get(updated.guest_id, organizationId);
      sendPaymentConfirmationEmail(guestRecord, updated, accommodation)
        .catch(err => console.warn('Email não enviado:', err.message));
    }

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/reservations/:id  (cancela)
async function cancel(req, res, next) {
  try {
    const organizationId = req.user.organization_id;
    const reservation = db.prepare('SELECT * FROM reservations WHERE id = ? AND organization_id = ?').get(req.params.id, organizationId);
    if (!reservation) return res.status(404).json({ error: 'Reserva não encontrada' });

    db.prepare(`
      UPDATE reservations SET
        status = 'cancelada',
        cancelled_previous_status = CASE WHEN status != 'cancelada' THEN status ELSE cancelled_previous_status END,
        cancelled_previous_payment_status = payment_status,
        updated_at = datetime('now')
      WHERE id = ? AND organization_id = ?
    `).run(req.params.id, organizationId);
    recordHistory({ organizationId, reservationId: req.params.id, userId: req.user.id, action: 'cancelled' });
    syncReservationOperationalTasks({ ...reservation, status: 'cancelada' }, req.user.id);

    // Remover do Google Calendar
    deleteCalendarEvent(reservation, {
      userId: reservation.google_calendar_user_id || req.user.id,
      organizationId
    });

    // Email de cancelamento
    const guest = db.prepare('SELECT * FROM guests WHERE id = ? AND organization_id = ?').get(reservation.guest_id, organizationId);
    const accommodation = db.prepare('SELECT * FROM accommodations WHERE id = ? AND organization_id = ?')
      .get(reservation.accommodation_id, organizationId);
    sendCancellationEmail(guest, reservation, accommodation)
      .catch(err => console.warn('Email não enviado:', err.message));

    notifyOrganization(organizationId, 'cancellation', {
      title: '❌ Reserva cancelada',
      body: `${guest?.name || 'Hóspede'} · ${accommodation?.name || ''} · ${reservation.check_in} → ${reservation.check_out}`,
      url: `/reservas?reserva=${req.params.id}`,
      excludeUserId: req.user.id,
    });

    res.json({ success: true, message: 'Reserva cancelada' });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/reservations/:id/permanent  (apagar definitivamente)
// Pré-requisito: reserva tem de estar `cancelada`. Apaga em cascade os
// pagamentos e eventos operacionais ligados. NÃO toca em:
//   • hóspede (guests) — pode ter outras reservas
//   • vouchers usados — mantém auditoria de qual reserva consumiu o voucher
//   • organization_email_log — histórico de comunicação por compliance RGPD
async function hardDelete(req, res, next) {
  try {
    const organizationId = req.user.organization_id;
    const reservation = db.prepare('SELECT * FROM reservations WHERE id = ? AND organization_id = ?')
      .get(req.params.id, organizationId);
    if (!reservation) return res.status(404).json({ error: 'Reserva não encontrada' });
    if (reservation.status !== 'cancelada') {
      return res.status(409).json({ error: 'Só é possível apagar reservas já canceladas. Cancela primeiro.' });
    }

    db.transaction(() => {
      db.prepare('DELETE FROM reservation_payments WHERE reservation_id = ? AND organization_id = ?')
        .run(reservation.id, organizationId);
      db.prepare('DELETE FROM operational_events WHERE reservation_id = ? AND organization_id = ?')
        .run(reservation.id, organizationId);
      db.prepare('DELETE FROM reservation_history WHERE reservation_id = ? AND organization_id = ?')
        .run(reservation.id, organizationId);
      db.prepare('DELETE FROM reservations WHERE id = ? AND organization_id = ?')
        .run(reservation.id, organizationId);
    })();

    res.json({ success: true, message: 'Reserva apagada definitivamente.' });
  } catch (err) {
    next(err);
  }
}

async function approve(req, res, next) {
  try {
    const organizationId = req.user.organization_id;
    const reservation = db.prepare(`
      SELECT r.*, g.name as guest_name, g.email as guest_email
      FROM reservations r
      JOIN guests g ON r.guest_id = g.id AND r.organization_id = g.organization_id
      WHERE r.id = ? AND r.organization_id = ?
    `).get(req.params.id, organizationId);
    if (!reservation) return res.status(404).json({ error: 'Reserva não encontrada' });
    if (reservation.status === 'cancelada') return res.status(400).json({ error: 'Reserva cancelada não pode ser aprovada.' });

    ensurePublicToken(reservation);
    const precheckinToken = ensurePrecheckinToken(reservation);
    db.prepare("UPDATE reservations SET status = 'pre_checkin', updated_at = datetime('now') WHERE id = ? AND organization_id = ?")
      .run(req.params.id, organizationId);

    const updated = db.prepare('SELECT * FROM reservations WHERE id = ? AND organization_id = ?').get(req.params.id, organizationId);
    const guest = db.prepare('SELECT * FROM guests WHERE id = ? AND organization_id = ?').get(updated.guest_id, organizationId);
    const accommodation = db.prepare('SELECT * FROM accommodations WHERE id = ? AND organization_id = ?').get(updated.accommodation_id, organizationId);
    const preCheckinUrl = `${publicUrl(req)}/pre-checkin/${precheckinToken}`;

    recordHistory({ organizationId, reservationId: req.params.id, userId: req.user.id, action: 'approved' });
    sendPreCheckinEmail(guest, updated, accommodation, preCheckinUrl)
      .catch(err => console.warn('Email de pre-check-in não enviado:', err.message));
    syncReservationOperationalTasks({ ...updated, guest_name: guest.name, accommodation_name: accommodation.name }, req.user.id);

    res.json({ success: true, data: { ...updated, pre_checkin_url: preCheckinUrl } });
  } catch (err) {
    next(err);
  }
}

// POST /api/reservations/:id/send-precheckin
// Gera (se necessário) e envia o link de pré-checkin sem alterar o estado da
// reserva — ao contrário de approve(), serve para reservas criadas
// diretamente no backoffice (nascem "confirmada", nunca passam por "pendente").
async function sendPrecheckinLink(req, res, next) {
  try {
    const organizationId = req.user.organization_id;
    const reservation = db.prepare(`
      SELECT r.*, g.name as guest_name, g.email as guest_email
      FROM reservations r
      JOIN guests g ON r.guest_id = g.id AND r.organization_id = g.organization_id
      WHERE r.id = ? AND r.organization_id = ?
    `).get(req.params.id, organizationId);
    if (!reservation) return res.status(404).json({ error: 'Reserva não encontrada' });
    if (reservation.status === 'cancelada') return res.status(400).json({ error: 'Reserva cancelada não pode receber link de pré-checkin.' });

    ensurePublicToken(reservation);
    const precheckinToken = ensurePrecheckinToken(reservation);

    const guest = db.prepare('SELECT * FROM guests WHERE id = ? AND organization_id = ?').get(reservation.guest_id, organizationId);
    const accommodation = db.prepare('SELECT * FROM accommodations WHERE id = ? AND organization_id = ?').get(reservation.accommodation_id, organizationId);
    const preCheckinUrl = `${publicUrl(req)}/pre-checkin/${precheckinToken}`;

    const shouldSend = req.body?.send !== false;
    let emailSent = false;
    if (shouldSend) {
      if (guest.email) {
        try {
          await sendPreCheckinEmail(guest, reservation, accommodation, preCheckinUrl);
          emailSent = true;
        } catch (err) {
          console.warn('Email de pre-check-in não enviado:', err.message);
        }
      }
    }

    res.json({ success: true, data: { pre_checkin_url: preCheckinUrl, email_sent: emailSent } });
  } catch (err) {
    next(err);
  }
}

// GET /api/reservations/stats/dashboard
async function getDashboardStats(req, res, next) {
  try {
    const organizationId = req.user.organization_id;
    const now = new Date();
    // Janela [1 do mês, 1 do mês seguinte) — o limite superior é exclusivo para
    // que a última noite do mês (check-out no dia 1 seguinte) também conte.
    const monthStart = firstDayOfMonth(now.getFullYear(), now.getMonth() + 1);
    const nextMonthStart = now.getMonth() === 11
      ? firstDayOfMonth(now.getFullYear() + 1, 1)
      : firstDayOfMonth(now.getFullYear(), now.getMonth() + 2);

    const totalBilled = db.prepare(`
      SELECT COALESCE(SUM(total_amount), 0) as total
      FROM reservations WHERE organization_id = ? AND status != 'cancelada'
    `).get(organizationId);

    const confirmedReservations = db.prepare(`
      SELECT COUNT(*) as count FROM reservations WHERE organization_id = ? AND status = 'confirmada'
    `).get(organizationId);

    // Noites-quarto: uma reserva do alojamento inteiro (ou multi-suite) ocupa
    // várias unidades por noite, não apenas uma.
    const occupancy = getOccupancyStats(organizationId, monthStart, nextMonthStart);

    // Ocupação por unidade no mês corrente, para o painel "Disponibilidade".
    const unitRows = occupancy.unitIds.length ? db.prepare(`
      SELECT id, name, color, price_per_night FROM accommodations
      WHERE organization_id = ? AND id IN (${occupancy.unitIds.map(() => '?').join(',')})
      ORDER BY name
    `).all(organizationId, ...occupancy.unitIds) : [];
    const availability = unitRows.map(unit => {
      const nights = occupancy.byUnit[unit.id] || 0;
      return {
        id: unit.id,
        name: unit.name,
        color: unit.color,
        price_per_night: unit.price_per_night,
        nights,
        days_in_month: occupancy.totalDays,
        occupancy_rate: occupancyRate(nights, occupancy.totalDays),
      };
    });

    res.json({
      success: true,
      data: {
        totalBilled: totalBilled.total,
        confirmedReservations: confirmedReservations.count,
        nightsThisMonth: occupancy.occupiedNights,
        occupancyRate: occupancy.rate,
        month: monthStart.slice(0, 7),
        availability
      }
    });
  } catch (err) {
    next(err);
  }
}

// Tarefa operacional de check-in/check-out de uma reserva (a mais relevante:
// primeiro a que coincide com a data atual da reserva, senão a mais recente).
function findReservationTask(orgId, reservationId, kind, date) {
  return db.prepare(`
    SELECT * FROM operational_events
    WHERE organization_id = ? AND reservation_id = ? AND auto_kind = ?
    ORDER BY (date = ?) DESC, created_at DESC
  `).get(orgId, reservationId, kind, date);
}

function getReservationTaskStatus(orgId, reservation) {
  const checkin = findReservationTask(orgId, reservation.id, 'checkin', reservation.check_in);
  const checkout = findReservationTask(orgId, reservation.id, 'checkout', reservation.check_out);
  return {
    checkin_done: checkin?.status === 'concluido',
    checkout_done: checkout?.status === 'concluido',
  };
}

// POST /api/reservations/:id/task-status  { kind: 'checkin'|'checkout', done: bool }
// Marca a tarefa de check-in/check-out como feita (ou volta a planeado) a partir
// da ficha da reserva. Cria a tarefa já concluída se ainda não existir (ex.:
// geração automática desligada nas definições).
function setTaskStatus(req, res, next) {
  try {
    const orgId = req.user.organization_id;
    const kind = req.body?.kind;
    const done = !!req.body?.done;
    if (!['checkin', 'checkout'].includes(kind)) {
      return res.status(400).json({ success: false, error: 'Tipo de tarefa inválido.' });
    }

    const r = db.prepare(`
      SELECT r.*, a.name AS accommodation_name
      FROM reservations r
      JOIN accommodations a ON a.id = r.accommodation_id
      WHERE r.id = ? AND r.organization_id = ?
    `).get(req.params.id, orgId);
    if (!r) return res.status(404).json({ success: false, error: 'Reserva não encontrada.' });

    const date = kind === 'checkin' ? r.check_in : r.check_out;
    const existing = findReservationTask(orgId, r.id, kind, date);

    if (existing) {
      db.prepare(`
        UPDATE operational_events
        SET status = ?, completed_at = ?, updated_at = datetime('now')
        WHERE id = ? AND organization_id = ?
      `).run(done ? 'concluido' : 'planeado', done ? new Date().toISOString() : null, existing.id, orgId);
    } else if (done) {
      db.prepare(`
        INSERT OR IGNORE INTO operational_events (
          id, organization_id, title, type, date, accommodation_id,
          status, notes, reservation_id, created_by_user_id, completed_at,
          auto_generated, auto_kind, auto_key, important
        ) VALUES (?, ?, ?, ?, ?, ?, 'concluido', ?, ?, ?, ?, 1, ?, ?, 0)
      `).run(
        uuidv4(), orgId,
        `${kind === 'checkin' ? 'Check-in' : 'Check-out'} · ${r.accommodation_name}`,
        kind, date, r.accommodation_id,
        `Reserva ${r.id}`, r.id, req.user.id, new Date().toISOString(),
        kind, `${r.id}:${kind}:${date}:${r.accommodation_id || 'geral'}`
      );
    }

    recordHistory({
      organizationId: orgId, reservationId: r.id, userId: req.user.id, action: 'task_status',
      meta: { kind, done },
    });

    res.json({ success: true, data: getReservationTaskStatus(orgId, r) });
  } catch (err) {
    next(err);
  }
}

// GET /api/reservations/:id/history — timeline da reserva (staff)
function getHistory(req, res, next) {
  try {
    const organizationId = req.user.organization_id;
    const reservation = db.prepare('SELECT id FROM reservations WHERE id = ? AND organization_id = ?')
      .get(req.params.id, organizationId);
    if (!reservation) return res.status(404).json({ error: 'Reserva não encontrada' });

    const rows = db.prepare(`
      SELECT h.*, u.name AS user_name
      FROM reservation_history h
      LEFT JOIN users u ON u.id = h.user_id
      WHERE h.reservation_id = ? AND h.organization_id = ?
      ORDER BY h.created_at DESC, h.rowid DESC
    `).all(req.params.id, organizationId);

    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
}

function getNotifications(req, res, next) {
  try {
    const orgId = req.user.organization_id;
    const today    = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    const baseSelect = `
      SELECT r.id, r.check_in, r.check_out, r.status, r.total_amount, r.amount_paid,
             g.name as guest_name, a.name as accommodation_name
      FROM reservations r
      JOIN guests g ON g.id = r.guest_id
      JOIN accommodations a ON a.id = r.accommodation_id
      WHERE r.organization_id = ?`;

    // Check-ins/outs com a tarefa operacional já concluída não geram notificação
    // (o motivo do alerta está resolvido — marcado como feito na ficha ou nos eventos).
    const notDone = kind => `
      AND NOT EXISTS (
        SELECT 1 FROM operational_events e
        WHERE e.organization_id = r.organization_id
          AND e.reservation_id = r.id
          AND e.auto_kind = '${kind}'
          AND e.status = 'concluido'
      )`;

    const checkinsToday    = db.prepare(`${baseSelect} AND r.check_in = ?  AND r.status != 'cancelada' ${notDone('checkin')}`).all(orgId, today);
    const checkinsTomorrow = db.prepare(`${baseSelect} AND r.check_in = ?  AND r.status != 'cancelada' ${notDone('checkin')}`).all(orgId, tomorrow);
    const checkoutsToday   = db.prepare(`${baseSelect} AND r.check_out = ? AND r.status != 'cancelada' ${notDone('checkout')}`).all(orgId, today);
    const pending          = db.prepare(`${baseSelect} AND r.status = 'pendente'`).all(orgId);
    const unpaid           = db.prepare(`${baseSelect} AND r.status = 'confirmada' AND r.total_amount > 0 AND r.amount_paid < r.total_amount`).all(orgId);
    const importantTasks   = db.prepare(`
      SELECT e.id, e.title, e.date, e.start_time, e.type, e.reservation_id,
             a.name AS accommodation_name
      FROM operational_events e
      LEFT JOIN accommodations a ON a.id = e.accommodation_id AND a.organization_id = e.organization_id
      WHERE e.organization_id = ?
        AND e.status = 'planeado'
        AND e.important = 1
        AND e.date >= ?
        AND e.date <= ?
      ORDER BY e.date ASC, COALESCE(e.start_time, '99:99') ASC
    `).all(orgId, today, tomorrow);

    const notifications = [];

    checkinsToday.forEach(r => notifications.push({
      type: 'checkin_today', priority: 'high', icon: 'log-in',
      title: 'Check-in hoje',
      subtitle: `${r.guest_name} · ${r.accommodation_name}`,
      reservation_id: r.id,
    }));
    checkoutsToday.forEach(r => notifications.push({
      type: 'checkout_today', priority: 'high', icon: 'log-out',
      title: 'Check-out hoje',
      subtitle: `${r.guest_name} · ${r.accommodation_name}`,
      reservation_id: r.id,
    }));
    checkinsTomorrow.forEach(r => notifications.push({
      type: 'checkin_tomorrow', priority: 'high', icon: 'calendar-clock',
      title: 'Check-in amanhã',
      subtitle: `${r.guest_name} · ${r.accommodation_name}`,
      reservation_id: r.id,
    }));
    unpaid.forEach(r => {
      const em = Number(r.total_amount) - Number(r.amount_paid);
      notifications.push({
        type: 'unpaid', priority: 'medium', icon: 'circle-alert',
        title: 'Pagamento em falta',
        subtitle: `${r.guest_name} · €${em.toFixed(2)} por receber`,
        reservation_id: r.id,
      });
    });
    pending.forEach(r => notifications.push({
      type: 'pending', priority: 'high', icon: 'clock',
      title: 'Reserva pendente',
      subtitle: `${r.guest_name} · ${r.accommodation_name}`,
      reservation_id: r.id,
    }));
    importantTasks.forEach(e => notifications.push({
      type: 'important_task',
      priority: e.date === today ? 'high' : 'medium',
      icon: e.type === 'limpeza' ? 'sparkles' : 'circle-alert',
      title: e.type === 'limpeza' ? 'Limpeza importante' : 'Tarefa importante',
      subtitle: `${e.title}${e.date === tomorrow ? ' · amanhã' : ''}${e.accommodation_name ? ` · ${e.accommodation_name}` : ''}`,
      reservation_id: e.reservation_id,
      event_id: e.id,
    }));

    res.json({ success: true, data: { notifications } });
  } catch (err) {
    next(err);
  }
}

module.exports = { getAll, getById, create, update, approve, sendPrecheckinLink, cancel, hardDelete, getDashboardStats, getAvailability, getNotifications, addPayment, deletePayment, saveInvoice, setTaskStatus, getHistory };
