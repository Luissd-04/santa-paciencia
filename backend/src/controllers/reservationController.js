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

function safeJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
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
    if (!conflicting.length) return res.json({ success: true, data: { unavailable: [] } });

    const allAccom = db.prepare('SELECT id, type, parent_id FROM accommodations WHERE organization_id = ?').all(organizationId);
    res.json({ success: true, data: { unavailable: getUnavailableAccommodationIds(allAccom, conflicting) } });
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
             a.name as accommodation_name, a.license_number
      FROM reservations r
      JOIN guests g ON r.guest_id = g.id
      JOIN accommodations a ON r.accommodation_id = a.id
      WHERE r.id = ? AND r.organization_id = ?
    `).get(req.params.id, req.user.organization_id);

    if (!reservation) return res.status(404).json({ error: 'Reserva não encontrada' });
    res.json({ success: true, data: reservation });
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
      amount_paid, payment_date, payment_status: reqPaymentStatus
    } = req.body;
    const totalGuests = (num_adults != null && num_children != null)
      ? (Number(num_adults) + Number(num_children))
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
      recordConsent(guestRecord.id, rgpd_ip || req.ip);
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
    const finalTotal = Math.max(0, totals.totalAmount - voucherDiscount);

    const paidAmt = Number(amount_paid) || 0;
    const autoPaymentStatus = getPaymentStatus(paidAmt, finalTotal, reqPaymentStatus || 'pendente');

    // Criar reserva
    const reservationId = `SP-${Date.now()}`;
    db.prepare(`
      INSERT INTO reservations (
        id, organization_id, guest_id, accommodation_id, check_in, check_out, nights, num_guests,
        num_adults, num_children,
        total_amount, breakfast_included, tourist_tax, channel, payment_method,
        notes, license_number, guests_data, amount_paid, payment_date, payment_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      reservationId, organizationId, guestRecord.id, accommodation_id, totals.checkIn, totals.checkOut,
      totals.nights, totals.guests,
      num_adults != null ? Number(num_adults) : totals.guests,
      num_children != null ? Number(num_children) : 0,
      finalTotal, totals.breakfastIncluded,
      totals.touristTax, channel || 'direto', payment_method || null,
      notes || null, accommodation.license_number,
      JSON.stringify(guests_data || []),
      paidAmt, payment_date || null, autoPaymentStatus
    );
    if (appliedVoucherId) {
      db.prepare(
        "UPDATE vouchers SET status = 'used', used_at = datetime('now'), used_in_reservation_id = ?, updated_at = datetime('now') WHERE id = ? AND organization_id = ?"
      ).run(reservationId, appliedVoucherId, organizationId);
    }

    const reservation = db.prepare('SELECT * FROM reservations WHERE id = ? AND organization_id = ?').get(reservationId, organizationId);
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
      accommodation_id, amount_paid, payment_date
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
    if (guest || guests_data !== undefined || num_guests !== undefined) {
      const birthDateError = validateReservationBirthDates(guests, guestForBirthDates, incomingGuestsData);
      if (birthDateError) return res.status(400).json({ error: birthDateError });
    }
    let totals;
    try {
      totals = calculateReservationTotals(accommodation, getOrganizationServices(organizationId), {
        check_in: newCheckIn,
        check_out: newCheckOut,
        num_guests: guests,
        breakfast_included: bkfOn2,
        birth_dates: getReservationBirthDates(guestForBirthDates, incomingGuestsData),
        pricing_periods: pricingPeriods2,
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
    const autoPaymentStatus2 = getPaymentStatus(newPaidAmt, totals.totalAmount, payment_status || existing.payment_status || 'pendente');
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
        payment_status = ?, guests_data = ?,
        amount_paid = ?, payment_date = ?, updated_at = datetime('now')
      WHERE id = ? AND organization_id = ?
    `).run(
      newAccommodationId,
      totals.checkIn, totals.checkOut, totals.nights, totals.guests,
      newAdults ?? totals.guests, newChildren ?? 0,
      totals.totalAmount, totals.breakfastIncluded,
      totals.touristTax,
      channel || existing.channel,
      payment_method !== undefined ? (payment_method || null) : existing.payment_method,
      notes !== undefined ? notes : existing.notes, nextStatus,
      nextPaymentStatus,
      guests_data !== undefined ? JSON.stringify(guests_data) : (existing.guests_data || '[]'),
      newPaidAmt,
      payment_date !== undefined ? (payment_date || null) : existing.payment_date,
      req.params.id,
      organizationId
    );

    const updated = db.prepare('SELECT * FROM reservations WHERE id = ? AND organization_id = ?').get(req.params.id, organizationId);
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

    res.json({ success: true, message: 'Reserva cancelada' });
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

    const token = ensurePublicToken(reservation);
    db.prepare("UPDATE reservations SET status = 'pre_checkin', updated_at = datetime('now') WHERE id = ? AND organization_id = ?")
      .run(req.params.id, organizationId);

    const updated = db.prepare('SELECT * FROM reservations WHERE id = ? AND organization_id = ?').get(req.params.id, organizationId);
    const guest = db.prepare('SELECT * FROM guests WHERE id = ? AND organization_id = ?').get(updated.guest_id, organizationId);
    const accommodation = db.prepare('SELECT * FROM accommodations WHERE id = ? AND organization_id = ?').get(updated.accommodation_id, organizationId);
    const preCheckinUrl = `${publicUrl(req)}/pre-checkin/${token}`;

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
      SELECT COALESCE(SUM(nights), 0) as total
      FROM reservations
      WHERE organization_id = ?
        AND status != 'cancelada'
        AND check_in >= ? AND check_in <= ?
    `).get(organizationId, firstOfMonth, lastOfMonth);

    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const totalRooms = db.prepare(`
      SELECT COUNT(*) as c FROM accommodations WHERE organization_id = ?
    `).get(organizationId).c || 1;
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

    const checkinsToday    = db.prepare(`${baseSelect} AND r.check_in = ?  AND r.status != 'cancelada'`).all(orgId, today);
    const checkinsTomorrow = db.prepare(`${baseSelect} AND r.check_in = ?  AND r.status != 'cancelada'`).all(orgId, tomorrow);
    const checkoutsToday   = db.prepare(`${baseSelect} AND r.check_out = ? AND r.status != 'cancelada'`).all(orgId, today);
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

module.exports = { getAll, getById, create, update, approve, cancel, getDashboardStats, getAvailability, getNotifications };
