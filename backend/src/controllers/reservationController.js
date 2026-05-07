const { v4: uuidv4 } = require('uuid');
const { db } = require('../config/database');

function getExtraOccupancyCharge(accommodation, guests, nights, birthDates = [], checkIn = null) {
  if (!accommodation) return 0;
  const options = normalizeExtraOccupancyOptions(accommodation);
  const maxGuests = Number(accommodation.max_guests) || guests;
  const included = Math.max(1, Math.min(
    Number(accommodation.base_guests_included) || Math.min(maxGuests, 2),
    maxGuests
  ));
  let remainingGuests = Math.max(0, guests - included);
  if (!remainingGuests) return 0;
  const specialRates = getAgeSpecialRates(accommodation, birthDates, checkIn).slice(0, remainingGuests);
  let total = specialRates.reduce((sum, rate) => sum + (rate * nights), 0);
  remainingGuests -= specialRates.length;

  return options.reduce((runningTotal, option) => {
    if (remainingGuests <= 0) return runningTotal;
    const capacity = Math.max(0, Number(option.capacity) || 0);
    if (!capacity) return runningTotal;
    const guestsCovered = Math.min(remainingGuests, capacity);
    remainingGuests -= guestsCovered;
    const price = Number(option.price) || 0;
    if (option.charge_type === 'per_bed_night') return runningTotal + (price * nights);
    return runningTotal + (price * guestsCovered * nights);
  }, total);
}

function normalizeExtraOccupancyOptions(accommodation) {
  let options = [];
  const raw = accommodation.extra_occupancy_options;
  if (Array.isArray(raw)) {
    options = raw;
  } else if (typeof raw === 'string' && raw.trim()) {
    try { options = JSON.parse(raw); } catch { options = []; }
  }

  if (!options.length && accommodation.extra_bed_enabled) {
    options = [{
      type: accommodation.extra_bed_type || 'sofa_cama',
      capacity: Number(accommodation.extra_bed_capacity) || 0,
      price: Number(accommodation.extra_bed_price) || 0,
      charge_type: accommodation.extra_bed_charge_type || 'per_guest_night'
    }];
  }

  return options.map(option => ({
    capacity: Math.max(0, Number(option?.capacity) || 0),
    price: Math.max(0, Number(option?.price) || 0),
    charge_type: option?.charge_type === 'per_bed_night' ? 'per_bed_night' : 'per_guest_night'
  }));
}

function getAgeSpecialRates(accommodation, birthDates = [], checkIn = null) {
  const babyLimit = Number(accommodation.baby_age_limit ?? 2);
  const childLimit = Number(accommodation.child_age_limit ?? 12);
  const babyPrice = Number(accommodation.baby_price ?? 0);
  const childPrice = Number(accommodation.child_price ?? 0);
  return birthDates
    .map(date => {
      const age = getAgeAtDate(date, checkIn);
      if (age === null) return null;
      if (age < babyLimit) return { age, rate: babyPrice };
      if (age >= babyLimit && age < childLimit) return { age, rate: childPrice };
      return null;
    })
    .filter(Boolean)
    .sort((a, b) => a.age - b.age)
    .map(item => item.rate);
}

function getAgeAtDate(birthDate, refDate) {
  if (!birthDate || !refDate) return null;
  const birth = new Date(`${birthDate}T12:00:00`);
  const ref = new Date(`${refDate}T12:00:00`);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(ref.getTime()) || birth > ref) return null;
  let age = ref.getFullYear() - birth.getFullYear();
  const monthDiff = ref.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && ref.getDate() < birth.getDate())) age--;
  return age;
}

function getReservationBirthDates(guest = {}, guestsData = []) {
  const extra = Array.isArray(guestsData) ? guestsData : [];
  return [guest.birth_date, ...extra.map(g => g?.birth_date)].filter(Boolean);
}

function safeJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}
const { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } = require('../services/calendarService');
const { sendConfirmationEmail, sendCancellationEmail, sendPaymentConfirmationEmail } = require('../services/emailService');
const { recordConsent } = require('../services/rgpdService');

// Returns conflicting reservation ID (if any) for the given accommodation + date range.
// Uses parent_id hierarchy: booking an alojamento blocks all child suites and vice versa.
function findConflict(organizationId, accommodationId, checkIn, checkOut, excludeId) {
  const accom = db.prepare('SELECT id, type, parent_id FROM accommodations WHERE id = ? AND organization_id = ?').get(accommodationId, organizationId);
  if (!accom) return null;

  const idsToCheck = new Set([accommodationId]);
  if (accom.parent_id) {
    // Child suite — also check if parent alojamento is booked
    idsToCheck.add(accom.parent_id);
  } else if (accom.type === 'alojamento') {
    // Parent alojamento — also check all child suites
    db.prepare('SELECT id FROM accommodations WHERE organization_id = ? AND parent_id = ?').all(organizationId, accommodationId)
      .forEach(c => idsToCheck.add(c.id));
  }

  const placeholders = [...idsToCheck].map(() => '?').join(',');
  let query = `
    SELECT r.id FROM reservations r
    WHERE r.status != 'cancelada'
      AND r.organization_id = ?
      AND r.check_in < ?
      AND r.check_out > ?
      AND r.accommodation_id IN (${placeholders})
  `;
  const params = [organizationId, checkOut, checkIn, ...[...idsToCheck]];
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
    const unavailable = new Set(conflicting);

    // Propagate using parent_id hierarchy (single pass, no cascade)
    for (const conflictId of conflicting) {
      const acc = allAccom.find(a => a.id === conflictId);
      if (!acc) continue;
      if (acc.parent_id) {
        // Child suite directly booked → parent unavailable (can't book whole property)
        // Siblings are NOT affected
        unavailable.add(acc.parent_id);
      } else if (acc.type === 'alojamento') {
        // Parent directly booked → all children unavailable
        allAccom.filter(a => a.parent_id === conflictId).forEach(c => unavailable.add(c.id));
      }
    }

    res.json({ success: true, data: { unavailable: [...unavailable] } });
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
      num_guests, breakfast_included, channel, payment_method,
      notes, rgpd_consent, rgpd_ip, guests_data,
      amount_paid, payment_date, payment_status: reqPaymentStatus
    } = req.body;
    const organizationId = req.user.organization_id;

    // Validação básica
    if (!guest?.name || !guest?.email || !accommodation_id || !check_in || !check_out) {
      return res.status(400).json({ error: 'Campos obrigatórios em falta' });
    }

    // Criar ou actualizar hóspede
    let guestRecord = db.prepare('SELECT * FROM guests WHERE email = ? AND organization_id = ?').get(guest.email, organizationId);

    if (!guestRecord) {
      const guestId = uuidv4();
      db.prepare(`
        INSERT INTO guests (id, name, email, phone, document_type, document_number, document_issuer_country,
          nationality, first_name, last_name, birth_date, birth_city, nif, country, address, postal_code, city, organization_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(guestId, guest.name, guest.email, guest.phone || null,
             guest.document_type || null, guest.document_number || null,
             guest.document_issuer_country || null, guest.nationality || null,
             guest.first_name || null, guest.last_name || null, guest.birth_date || null,
             guest.birth_city || null, guest.nif || null, guest.country || null,
             guest.address || null, guest.postal_code || null, guest.city || null, organizationId);
      guestRecord = db.prepare('SELECT * FROM guests WHERE id = ? AND organization_id = ?').get(guestId, organizationId);
    } else {
      // Actualizar campos opcionais se fornecidos
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
    if (Number(num_guests) > Number(accommodation.max_guests || 0)) {
      return res.status(400).json({ error: `Este alojamento permite no máximo ${accommodation.max_guests} hóspedes.` });
    }

    const checkIn = new Date(check_in);
    const checkOut = new Date(check_out);
    const nights = Math.round((checkOut - checkIn) / (1000 * 60 * 60 * 24));

    if (nights <= 0) return res.status(400).json({ error: 'Datas inválidas' });

    // Verificar disponibilidade (anti double-booking)
    const conflict = findConflict(organizationId, accommodation_id, check_in, check_out, null);
    if (conflict) {
      return res.status(409).json({
        error: `Este alojamento já está ocupado nessas datas (reserva ${conflict.id}).`
      });
    }

    // Ler serviços e taxas das configurações
    const settingsRow = db.prepare("SELECT value FROM organization_settings WHERE organization_id = ? AND key = 'services'").get(organizationId);
    const services = settingsRow ? JSON.parse(settingsRow.value) : [];
    const taxSvc = services.find(s => s.id === 'tourist_tax');
    const bkfSvc = services.find(s => s.id === 'breakfast');
    const bkfRate = bkfSvc?.value ?? 19;
    const bkfOn   = breakfast_included ? 1 : 0;

    const touristTax    = (taxSvc?.active !== false) ? (taxSvc?.value ?? 3) * num_guests * nights : 0;
    const breakfastCost = bkfOn ? bkfRate * num_guests * nights : 0;
    const birthDates = getReservationBirthDates(guest, guests_data || []);
    const extraOccupancyCost = getExtraOccupancyCharge(accommodation, num_guests, nights, birthDates, check_in);
    const totalAmount   = (accommodation.price_per_night * nights) + extraOccupancyCost + touristTax + breakfastCost;

    const paidAmt = Number(amount_paid) || 0;
    const autoPaymentStatus = paidAmt >= totalAmount && paidAmt > 0
      ? 'confirmado'
      : paidAmt > 0
        ? 'parcial'
        : (reqPaymentStatus || 'pendente');

    // Criar reserva
    const reservationId = `SP-${Date.now()}`;
    db.prepare(`
      INSERT INTO reservations (
        id, organization_id, guest_id, accommodation_id, check_in, check_out, nights, num_guests,
        total_amount, breakfast_included, tourist_tax, channel, payment_method,
        notes, license_number, guests_data, amount_paid, payment_date, payment_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      reservationId, organizationId, guestRecord.id, accommodation_id, check_in, check_out,
      nights, num_guests, totalAmount, bkfOn,
      touristTax, channel || 'direto', payment_method || null,
      notes || null, accommodation.license_number,
      JSON.stringify(guests_data || []),
      paidAmt, payment_date || null, autoPaymentStatus
    );

    const reservation = db.prepare('SELECT * FROM reservations WHERE id = ? AND organization_id = ?').get(reservationId, organizationId);

    // Google Calendar (async, não bloqueia resposta)
    createCalendarEvent(reservation).then(eventId => {
      if (eventId) {
        db.prepare('UPDATE reservations SET google_event_id = ? WHERE id = ?')
          .run(eventId, reservationId);
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
      check_in, check_out, num_guests, breakfast_included,
      channel, payment_method, notes, status, payment_status, guests_data, guest,
      accommodation_id, amount_paid, payment_date
    } = req.body;

    const newAccommodationId = accommodation_id || existing.accommodation_id;
    const accommodation = db.prepare('SELECT * FROM accommodations WHERE id = ? AND organization_id = ?')
      .get(newAccommodationId, organizationId);
    if (!accommodation) return res.status(404).json({ error: 'Alojamento não encontrado' });

    const newCheckIn = check_in || existing.check_in;
    const newCheckOut = check_out || existing.check_out;
    const nights = Math.round(
      (new Date(newCheckOut) - new Date(newCheckIn)) / (1000 * 60 * 60 * 24)
    );
    const guests = num_guests || existing.num_guests;
    if (Number(guests) > Number(accommodation.max_guests || 0)) {
      return res.status(400).json({ error: `Este alojamento permite no máximo ${accommodation.max_guests} hóspedes.` });
    }
    const bkfOn2 = breakfast_included !== undefined ? (breakfast_included ? 1 : 0) : existing.breakfast_included;
    // Ler taxas das configurações
    const settingsRow2 = db.prepare("SELECT value FROM organization_settings WHERE organization_id = ? AND key = 'services'").get(organizationId);
    const services2 = settingsRow2 ? JSON.parse(settingsRow2.value) : [];
    const taxSvc2 = services2.find(s => s.id === 'tourist_tax');
    const bkfSvc2 = services2.find(s => s.id === 'breakfast');
    const bkfRate2 = bkfSvc2?.value ?? 19;
    const touristTax = (taxSvc2?.active !== false) ? (taxSvc2?.value ?? 3) * guests * nights : 0;
    const breakfastCost = bkfOn2 ? bkfRate2 * guests * nights : 0;
    const incomingGuestsData = guests_data !== undefined ? guests_data : safeJson(existing.guests_data, []);
    const birthDates = getReservationBirthDates(guest || {}, incomingGuestsData);
    const extraOccupancyCost = getExtraOccupancyCharge(accommodation, guests, nights, birthDates, newCheckIn);

    // Verificar disponibilidade (excluir a própria reserva)
    const conflict2 = findConflict(organizationId, newAccommodationId, newCheckIn, newCheckOut, req.params.id);
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
    const totalAmount = (accommodation.price_per_night * nights) + extraOccupancyCost + touristTax + breakfastCost;

    const newPaidAmt = amount_paid !== undefined ? Number(amount_paid) : (existing.amount_paid || 0);
    const autoPaymentStatus2 = newPaidAmt >= totalAmount && newPaidAmt > 0
      ? 'confirmado'
      : newPaidAmt > 0
        ? 'parcial'
        : (payment_status || existing.payment_status || 'pendente');

    db.prepare(`
      UPDATE reservations SET
        accommodation_id = ?, check_in = ?, check_out = ?, nights = ?, num_guests = ?,
        total_amount = ?, breakfast_included = ?, tourist_tax = ?,
        channel = ?, payment_method = ?, notes = ?, status = ?,
        payment_status = ?, guests_data = ?,
        amount_paid = ?, payment_date = ?, updated_at = datetime('now')
      WHERE id = ? AND organization_id = ?
    `).run(
      newAccommodationId,
      newCheckIn, newCheckOut, nights, guests, totalAmount, bkfOn2,
      touristTax,
      channel || existing.channel, payment_method || existing.payment_method,
      notes !== undefined ? notes : existing.notes, status || existing.status,
      autoPaymentStatus2,
      guests_data !== undefined ? JSON.stringify(guests_data) : (existing.guests_data || '[]'),
      newPaidAmt,
      payment_date !== undefined ? (payment_date || null) : existing.payment_date,
      req.params.id,
      organizationId
    );

    const updated = db.prepare('SELECT * FROM reservations WHERE id = ? AND organization_id = ?').get(req.params.id, organizationId);

    // Atualizar no Google Calendar
    updateCalendarEvent(updated);

    // Email de pagamento se confirmado agora
    if (autoPaymentStatus2 === 'confirmado' && existing.payment_status !== 'confirmado') {
      const guest = db.prepare('SELECT * FROM guests WHERE id = ? AND organization_id = ?').get(updated.guest_id, organizationId);
      sendPaymentConfirmationEmail(guest, updated, accommodation)
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
      UPDATE reservations SET status = 'cancelada', updated_at = datetime('now') WHERE id = ? AND organization_id = ?
    `).run(req.params.id, organizationId);

    // Remover do Google Calendar
    deleteCalendarEvent(reservation);

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
      type: 'checkin_tomorrow', priority: 'medium', icon: 'calendar-clock',
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

    res.json({ success: true, data: { notifications } });
  } catch (err) {
    next(err);
  }
}

module.exports = { getAll, getById, create, update, cancel, getDashboardStats, getAvailability, getNotifications };
