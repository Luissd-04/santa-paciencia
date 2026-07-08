const { v4: uuidv4 } = require('uuid');
const { db } = require('../config/database');
const {
  calculateReservationTotals,
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

function safeJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function upsertAdditionalGuests(guestsData, organizationId) {
  if (!Array.isArray(guestsData) || !guestsData.length) return guestsData || [];
  return guestsData.map(g => {
    if (!g?.name) return g;
    const email = g.email?.trim() || null;
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

const { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent, createTaskCalendarEvent, updateTaskCalendarEvent } = require('../services/calendarService');
const { sendConfirmationEmail, sendCancellationEmail, sendPaymentConfirmationEmail, sendPreCheckinEmail } = require('../services/emailService');
const { recordConsent } = require('../services/rgpdService');
const {
  syncReservationOperationalTasks,
  syncOrganizationOperationalTasks,
} = require('../services/operationalTasksService');

const { isAuthenticated } = require('../config/google');

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

function getGcalSyncTasks(organizationId) {
  const row = db.prepare("SELECT value FROM organization_settings WHERE organization_id = ? AND key = 'gcal_sync_tasks'").get(organizationId);
  return row?.value === '1';
}

async function syncReservationTasksToCalendar(reservationId, organizationId, userId) {
  if (!isAuthenticated(userId, organizationId)) return;
  if (!getGcalSyncTasks(organizationId)) return;
  try {
    const tasks = db.prepare(
      "SELECT * FROM operational_events WHERE reservation_id = ? AND organization_id = ? AND auto_generated = 1 AND status != 'concluido'"
    ).all(reservationId, organizationId);
    for (const task of tasks) {
      if (task.google_event_id && task.google_calendar_user_id === userId) {
        await updateTaskCalendarEvent(task, { userId, organizationId });
      } else if (!task.google_event_id) {
        const eventId = await createTaskCalendarEvent(task, { userId, organizationId });
        if (eventId) {
          db.prepare('UPDATE operational_events SET google_event_id = ?, google_calendar_user_id = ? WHERE id = ?')
            .run(eventId, userId, task.id);
        }
      }
    }
  } catch (err) {
    console.error('Erro ao sincronizar tarefas da reserva:', err.message);
  }
}

// Returns conflicting reservation ID (if any) for the given accommodation + date range.
// Uses parent_id hierarchy: booking an alojamento blocks all child suites and vice versa.
function findConflict(organizationId, accommodationId, checkIn, checkOut, excludeId) {
  const accommodations = db.prepare('SELECT id, type, parent_id FROM accommodations WHERE organization_id = ?').all(organizationId);
  const idsToCheck = getAccommodationScope(accommodations, accommodationId);
  if (!idsToCheck.length) return null;

  const placeholders = idsToCheck.map(() => '?').join(',');
  let query = `
    SELECT r.id FROM reservations r
    WHERE r.status != 'cancelada'
      AND r.organization_id = ?
      AND r.check_in < ?
      AND r.check_out > ?
      AND r.accommodation_id IN (${placeholders})
  `;
  const params = [organizationId, checkOut, checkIn, ...idsToCheck];
  if (excludeId) { query += ' AND r.id != ?'; params.push(excludeId); }
  return db.prepare(query).get(...params) || null;
}

// GET /api/reservations/availability?check_in=&check_out=&exclude_id=
async function getAvailability(req, res, next) {
  try {
    const { check_in, check_out, exclude_id } = req.query;
    const organizationId = req.user.organization_id;
    if (!check_in || !check_out) {
      return res.json({ success: true, data: { unavailable: [] } });
    }

    let query = `SELECT DISTINCT accommodation_id FROM reservations WHERE organization_id = ? AND status != 'cancelada' AND check_in < ? AND check_out > ?`;
    const params = [organizationId, check_out, check_in];
    if (exclude_id) { query += ' AND id != ?'; params.push(exclude_id); }

    const conflicting = db.prepare(query).all(...params).map(r => r.accommodation_id);
    const blocked = getBlockedAccommodationIds(organizationId, check_in, check_out);

    if (!conflicting.length && !blocked.length) {
      return res.json({ success: true, data: { unavailable: [] } });
    }

    const allAccom = db.prepare('SELECT id, type, parent_id FROM accommodations WHERE organization_id = ?').all(organizationId);
    const unavailable = [...new Set([
      ...getUnavailableAccommodationIds(allAccom, conflicting),
      ...blocked,
    ])];
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
      const standard = calculateReservationTotals(acc, getOrganizationServices(orgId), {
        check_in: reservation.check_in,
        check_out: reservation.check_out,
        num_guests: reservation.num_guests,
        breakfast_included: reservation.breakfast_included,
        birth_dates: getReservationBirthDates(guestRow, safeJson(reservation.guests_data, [])),
        pricing_periods: periods,
      });
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
async function addPayment(req, res, next) {
  try {
    const { id } = req.params;
    const organizationId = req.user.organization_id;
    const { amount, method, payment_date, notes } = req.body;

    const numAmount = Number(amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: 'Montante inválido' });
    }

    const reservation = db.prepare('SELECT * FROM reservations WHERE id = ? AND organization_id = ?').get(id, organizationId);
    if (!reservation) return res.status(404).json({ error: 'Reserva não encontrada' });

    const reservationTotal = Number(reservation.total_amount) || 0;
    const paymentCap = Math.max(reservationTotal * 10, 1000000);
    if (numAmount > paymentCap) {
      return res.status(400).json({ error: `Montante excessivo (máximo permitido: €${paymentCap.toFixed(2)}).` });
    }

    const paymentId = `rp-${uuidv4()}`;
    db.prepare(`
      INSERT INTO reservation_payments (id, reservation_id, organization_id, amount, method, payment_date, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(paymentId, id, organizationId, numAmount, method || null, payment_date || null, notes || null);

    const { total_paid } = db.prepare('SELECT SUM(amount) as total_paid FROM reservation_payments WHERE reservation_id = ? AND organization_id = ?').get(id, organizationId);
    const newPaid = total_paid || 0;
    const autoStatus = getPaymentStatus(newPaid, reservation.total_amount, reservation.payment_status);

    db.prepare(`UPDATE reservations SET amount_paid = ?, payment_status = ?, updated_at = datetime('now') WHERE id = ? AND organization_id = ?`)
      .run(newPaid, autoStatus, id, organizationId);

    recordHistory({
      organizationId, reservationId: id, userId: req.user.id, action: 'payment_added',
      meta: { amount: numAmount, method: method || null, payment_date: payment_date || null },
    });

    res.json({ success: true, data: { id: paymentId, amount: numAmount, method, payment_date, notes, newTotalPaid: newPaid, newPaymentStatus: autoStatus } });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/reservations/:id/payments/:paymentId
async function deletePayment(req, res, next) {
  try {
    const { id, paymentId } = req.params;
    const organizationId = req.user.organization_id;

    const reservation = db.prepare('SELECT * FROM reservations WHERE id = ? AND organization_id = ?').get(id, organizationId);
    if (!reservation) return res.status(404).json({ error: 'Reserva não encontrada' });

    const payment = db.prepare('SELECT * FROM reservation_payments WHERE id = ? AND reservation_id = ? AND organization_id = ?').get(paymentId, id, organizationId);
    if (!payment) return res.status(404).json({ error: 'Pagamento não encontrado' });

    db.prepare('DELETE FROM reservation_payments WHERE id = ? AND organization_id = ?').run(paymentId, organizationId);

    const { total_paid } = db.prepare('SELECT SUM(amount) as total_paid FROM reservation_payments WHERE reservation_id = ? AND organization_id = ?').get(id, organizationId);
    const newPaid = total_paid || 0;
    const autoStatus = getPaymentStatus(newPaid, reservation.total_amount, 'pendente');

    db.prepare(`UPDATE reservations SET amount_paid = ?, payment_status = ?, updated_at = datetime('now') WHERE id = ? AND organization_id = ?`)
      .run(newPaid, autoStatus, id, organizationId);

    recordHistory({
      organizationId, reservationId: id, userId: req.user.id, action: 'payment_deleted',
      meta: { amount: payment.amount, method: payment.method || null, payment_date: payment.payment_date || null },
    });

    res.json({ success: true, newTotalPaid: newPaid, newPaymentStatus: autoStatus });
  } catch (err) {
    next(err);
  }
}

// PUT /api/reservations/:id/invoice — regista/atualiza a fatura da reserva (uma por reserva).
async function saveInvoice(req, res, next) {
  try {
    const { id } = req.params;
    const organizationId = req.user.organization_id;
    const { invoice_number, invoice_date, invoice_sent_date, invoice_sent_method } = req.body;

    const reservation = db.prepare('SELECT id FROM reservations WHERE id = ? AND organization_id = ?').get(id, organizationId);
    if (!reservation) return res.status(404).json({ error: 'Reserva não encontrada' });

    db.prepare(`UPDATE reservations SET
        invoice_number = ?, invoice_date = ?, invoice_sent_date = ?, invoice_sent_method = ?, updated_at = datetime('now')
      WHERE id = ? AND organization_id = ?`)
      .run(
        (invoice_number || '').trim() || null,
        invoice_date || null,
        invoice_sent_date || null,
        (invoice_sent_method || '').trim() || null,
        id, organizationId
      );

    const updated = db.prepare(
      'SELECT invoice_number, invoice_date, invoice_sent_date, invoice_sent_method FROM reservations WHERE id = ? AND organization_id = ?'
    ).get(id, organizationId);
    recordHistory({
      organizationId, reservationId: id, userId: req.user.id, action: 'invoice_saved',
      meta: { invoice_number: updated.invoice_number || null },
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

// POST /api/reservations
async function create(req, res, next) {
  try {
    const {
      guest, accommodation_id, check_in, check_out,
      num_guests, num_adults, num_children, breakfast_included, channel, payment_method,
      notes, rgpd_consent, rgpd_ip, guests_data, voucher_code,
      amount_paid, payment_date, payment_status: reqPaymentStatus,
      total_amount: manualTotalCreate, nightly_prices: nightlyPricesCreate
    } = req.body;
    const totalGuests = (num_adults != null || num_children != null)
      ? (Number(num_adults ?? 1) + Number(num_children ?? 0))
      : (num_guests || 1);
    const organizationId = req.user.organization_id;

    if (!accommodation_id || !check_in || !check_out) {
      return res.status(400).json({ error: 'Datas e alojamento são obrigatórios' });
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
          nationality, first_name, last_name, birth_date, birth_city, nif, country, address, postal_code, city, organization_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(guestId, guestName, guestEmail, guest?.phone || null,
             guest?.document_type || null, guest?.document_number || null,
             guest?.document_issuer_country || null, guest?.nationality || null,
             guest?.first_name || null, guest?.last_name || null, guest?.birth_date || null,
             guest?.birth_city || null, guest?.nif || null, guest?.country || null,
             guest?.address || null, guest?.postal_code || null, guest?.city || null, organizationId);
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
        address = COALESCE(?, address), postal_code = COALESCE(?, postal_code), city = COALESCE(?, city)
        WHERE id = ? AND organization_id = ?`).run(
        guest?.name || null, guest?.phone || null,
        guest?.document_type || null, guest?.document_number || null,
        guest?.document_issuer_country || null,
        guest?.nationality || null, guest?.first_name || null,
        guest?.last_name || null, guest?.birth_date || null,
        guest?.birth_city || null,
        guest?.nif || null, guest?.country || null,
        guest?.address || null, guest?.postal_code || null, guest?.city || null,
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
    if (!accommodation) return res.status(404).json({ error: 'Alojamento não encontrado' });
    if (totalGuests > Number(accommodation.max_guests || 0)) {
      return res.status(400).json({ error: `Este alojamento permite no máximo ${accommodation.max_guests} hóspedes.` });
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
      return res.status(400).json({ error: error.message });
    }

    // Verificar disponibilidade (anti double-booking)
    const conflict = findConflict(organizationId, accommodation_id, totals.checkIn, totals.checkOut, null);
    if (conflict) {
      return res.status(409).json({
        error: `Este alojamento já está ocupado nessas datas (reserva ${conflict.id}).`
      });
    }

    // Verificar bloqueios manuais (manutenção, uso pessoal, etc.)
    const block = findBlockConflict(organizationId, accommodation_id, totals.checkIn, totals.checkOut);
    if (block) {
      return res.status(409).json({
        error: `Estas datas estão bloqueadas${block.reason ? ` (${block.reason})` : ''}.`
      });
    }

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
        price_edited_at, price_edited_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      priceEdited ? req.user.id : null
    );
    if (appliedVoucherId) {
      db.prepare(
        "UPDATE vouchers SET status = 'used', used_at = datetime('now'), used_in_reservation_id = ?, updated_at = datetime('now') WHERE id = ? AND organization_id = ?"
      ).run(reservationId, appliedVoucherId, organizationId);
    }

    const reservation = db.prepare('SELECT * FROM reservations WHERE id = ? AND organization_id = ?').get(reservationId, organizationId);
    recordHistory({
      organizationId, reservationId, userId: req.user.id, action: 'created',
      meta: { check_in: reservation.check_in, check_out: reservation.check_out, accommodation_id: reservation.accommodation_id, total_amount: reservation.total_amount },
    });
    syncReservationOperationalTasks({
      ...reservation,
      guest_name: guestRecord.name,
      accommodation_name: accommodation.name,
    }, req.user.id);

    // Google Calendar (async, não bloqueia resposta)
    syncReservationTasksToCalendar(reservationId, organizationId, req.user.id);
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
      url: '/reservas',
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
    const organizationId = req.user.organization_id;
    const existing = db.prepare('SELECT * FROM reservations WHERE id = ? AND organization_id = ?').get(req.params.id, organizationId);
    if (!existing) return res.status(404).json({ error: 'Reserva não encontrada' });

    const {
      check_in, check_out, num_guests, num_adults, num_children, breakfast_included,
      channel, payment_method, notes, status, payment_status, guests_data, guest,
      accommodation_id, amount_paid, payment_date, total_amount: manualTotal,
      accommodations_data, nightly_prices: nightlyPricesUpdate
    } = req.body;

    const newAccommodationId = accommodation_id || existing.accommodation_id;
    const accommodation = db.prepare('SELECT * FROM accommodations WHERE id = ? AND organization_id = ?')
      .get(newAccommodationId, organizationId);
    if (!accommodation) return res.status(404).json({ error: 'Alojamento não encontrado' });

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
      return res.status(400).json({ error: error.message });
    }

    // Verificar disponibilidade (excluir a própria reserva)
    const conflict2 = findConflict(organizationId, newAccommodationId, totals.checkIn, totals.checkOut, req.params.id);
    if (conflict2) {
      return res.status(409).json({
        error: `Este alojamento já está ocupado nessas datas (reserva ${conflict2.id}).`
      });
    }

    // Verificar bloqueios manuais
    const block2 = findBlockConflict(organizationId, newAccommodationId, totals.checkIn, totals.checkOut);
    if (block2) {
      return res.status(409).json({
        error: `Estas datas estão bloqueadas${block2.reason ? ` (${block2.reason})` : ''}.`
      });
    }

    // Actualizar dados do hóspede se fornecidos
    if (guest) {
      db.prepare(`UPDATE guests SET
        name = COALESCE(?, name), phone = COALESCE(?, phone),
        document_type = COALESCE(?, document_type), document_number = COALESCE(?, document_number),
        document_issuer_country = COALESCE(?, document_issuer_country),
        nationality = COALESCE(?, nationality), first_name = COALESCE(?, first_name),
        last_name = COALESCE(?, last_name), birth_date = COALESCE(?, birth_date),
        birth_city = COALESCE(?, birth_city),
        nif = COALESCE(?, nif), country = COALESCE(?, country),
        address = COALESCE(?, address), postal_code = COALESCE(?, postal_code), city = COALESCE(?, city)
        WHERE id = ? AND organization_id = ?`).run(
        guest.name || null, guest.phone || null,
        guest.document_type || null, guest.document_number || null,
        guest.document_issuer_country || null,
        guest.nationality || null, guest.first_name || null,
        guest.last_name || null, guest.birth_date || null,
        guest.birth_city || null,
        guest.nif || null, guest.country || null,
        guest.address || null, guest.postal_code || null, guest.city || null,
        existing.guest_id,
        organizationId
      );
    }
    const newPaidAmt = amount_paid !== undefined ? Number(amount_paid) : (existing.amount_paid || 0);
    const effectiveTotal = manualTotal !== undefined ? Number(manualTotal) : totals.totalAmount;

    // Edição manual = total efetivo difere do padrão do calendário dinâmico
    // (sem overrides por noite). Preserva o registo anterior se continuar editada.
    let priceEditedAt = existing.price_edited_at || null;
    let priceEditedBy = existing.price_edited_by_user_id || null;
    try {
      const standard = calculateReservationTotals(accommodation, getOrganizationServices(organizationId), {
        check_in: newCheckIn,
        check_out: newCheckOut,
        num_guests: guests,
        breakfast_included: bkfOn2,
        birth_dates: getReservationBirthDates(guestForBirthDates, incomingGuestsData),
        pricing_periods: pricingPeriods2,
      });
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

    const newAccData = accommodations_data !== undefined
      ? JSON.stringify(accommodations_data)
      : (existing.accommodations_data || '[]');

    db.prepare(`
      UPDATE reservations SET
        accommodation_id = ?, check_in = ?, check_out = ?, nights = ?, num_guests = ?,
        num_adults = ?, num_children = ?,
        total_amount = ?, breakfast_included = ?, tourist_tax = ?,
        channel = ?, payment_method = ?, notes = ?, status = ?,
        payment_status = ?, guests_data = ?, accommodations_data = ?,
        amount_paid = ?, payment_date = ?, nightly_prices = ?,
        price_edited_at = ?, price_edited_by_user_id = ?, updated_at = datetime('now')
      WHERE id = ? AND organization_id = ?
    `).run(
      newAccommodationId,
      totals.checkIn, totals.checkOut, totals.nights, totals.guests,
      newAdults ?? totals.guests, newChildren ?? 0,
      manualTotal !== undefined ? Number(manualTotal) : totals.totalAmount, totals.breakfastIncluded,
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
      priceEditedAt, priceEditedBy,
      req.params.id,
      organizationId
    );

    const updated = db.prepare('SELECT * FROM reservations WHERE id = ? AND organization_id = ?').get(req.params.id, organizationId);
    const historyChanges = diffReservationFields(existing, updated);
    if (historyChanges.length) {
      recordHistory({
        organizationId, reservationId: req.params.id, userId: req.user.id, action: 'updated',
        changes: historyChanges,
        meta: reactivating ? { reactivated: true } : null,
      });
    }
    syncReservationOperationalTasks({
      ...updated,
      accommodation_name: accommodation.name,
    }, req.user.id);

    // Google Calendar tarefas (async)
    syncReservationTasksToCalendar(req.params.id, organizationId, req.user.id);

    // Atualizar no Google Calendar
    updateCalendarEvent(updated, {
      userId: updated.google_calendar_user_id || req.user.id,
      organizationId
    });

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
      url: '/reservas',
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

// GET /api/reservations/stats/dashboard
async function getDashboardStats(req, res, next) {
  try {
    const organizationId = req.user.organization_id;
    const now = new Date();
    const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const lastOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      .toISOString().split('T')[0];

    const totalBilled = db.prepare(`
      SELECT COALESCE(SUM(total_amount), 0) as total
      FROM reservations WHERE organization_id = ? AND status != 'cancelada'
    `).get(organizationId);

    const confirmedReservations = db.prepare(`
      SELECT COUNT(*) as count FROM reservations WHERE organization_id = ? AND status = 'confirmada'
    `).get(organizationId);

    const nightsThisMonth = db.prepare(`
      SELECT COALESCE(SUM(
        MIN(julianday(?), julianday(check_out)) - MAX(julianday(?), julianday(check_in))
      ), 0) as total
      FROM reservations
      WHERE organization_id = ?
        AND status != 'cancelada'
        AND check_in < ? AND check_out > ?
    `).get(lastOfMonth, firstOfMonth, organizationId, lastOfMonth, firstOfMonth);

    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const totalRooms = db.prepare(`
      SELECT COUNT(*) as c FROM accommodations
      WHERE organization_id = ?
        AND id NOT IN (
          SELECT DISTINCT parent_id FROM accommodations
          WHERE parent_id IS NOT NULL AND organization_id = ?
        )
    `).get(organizationId, organizationId).c || 1;
    const occupiedNights = nightsThisMonth.total;
    const occupancyRate = Math.round((occupiedNights / (daysInMonth * totalRooms)) * 100);

    res.json({
      success: true,
      data: {
        totalBilled: totalBilled.total,
        confirmedReservations: confirmedReservations.count,
        nightsThisMonth: nightsThisMonth.total,
        occupancyRate: Math.min(occupancyRate, 100)
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
      type: 'pending', priority: 'low', icon: 'clock',
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

module.exports = { getAll, getById, create, update, approve, cancel, hardDelete, getDashboardStats, getAvailability, getNotifications, addPayment, deletePayment, saveInvoice, setTaskStatus, getHistory };
