const { v4: uuidv4 } = require('uuid');
const { db } = require('../config/database');
const { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } = require('../services/calendarService');
const { sendConfirmationEmail, sendCancellationEmail, sendPaymentConfirmationEmail } = require('../services/emailService');
const { recordConsent } = require('../services/rgpdService');

// GET /api/reservations
async function getAll(req, res, next) {
  try {
    const { status, accommodation_id, from, to } = req.query;

    let query = `
      SELECT r.*, g.name as guest_name, g.email as guest_email, g.phone as guest_phone,
             a.name as accommodation_name
      FROM reservations r
      JOIN guests g ON r.guest_id = g.id
      JOIN accommodations a ON r.accommodation_id = a.id
      WHERE 1=1
    `;
    const params = [];

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
      WHERE r.id = ?
    `).get(req.params.id);

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
      notes, rgpd_consent, rgpd_ip, guests_data
    } = req.body;

    // Validação básica
    if (!guest?.name || !guest?.email || !accommodation_id || !check_in || !check_out) {
      return res.status(400).json({ error: 'Campos obrigatórios em falta' });
    }

    // Criar ou actualizar hóspede
    let guestRecord = db.prepare('SELECT * FROM guests WHERE email = ?').get(guest.email);

    if (!guestRecord) {
      const guestId = uuidv4();
      db.prepare(`
        INSERT INTO guests (id, name, email, phone, document_type, document_number, document_issuer_country,
          nationality, first_name, last_name, birth_date, birth_city, nif, country, address, postal_code, city)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(guestId, guest.name, guest.email, guest.phone || null,
             guest.document_type || null, guest.document_number || null,
             guest.document_issuer_country || null, guest.nationality || null,
             guest.first_name || null, guest.last_name || null, guest.birth_date || null,
             guest.birth_city || null, guest.nif || null, guest.country || null,
             guest.address || null, guest.postal_code || null, guest.city || null);
      guestRecord = db.prepare('SELECT * FROM guests WHERE id = ?').get(guestId);
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
        WHERE id = ?`).run(
        guest.name || null, guest.phone || null,
        guest.document_type || null, guest.document_number || null,
        guest.document_issuer_country || null,
        guest.nationality || null, guest.first_name || null,
        guest.last_name || null, guest.birth_date || null,
        guest.birth_city || null,
        guest.nif || null, guest.country || null,
        guest.address || null, guest.postal_code || null, guest.city || null,
        guestRecord.id
      );
      guestRecord = db.prepare('SELECT * FROM guests WHERE id = ?').get(guestRecord.id);
    }

    // Registar consentimento RGPD
    if (rgpd_consent) {
      recordConsent(guestRecord.id, rgpd_ip || req.ip);
    }

    // Calcular valores
    const accommodation = db.prepare('SELECT * FROM accommodations WHERE id = ?').get(accommodation_id);
    if (!accommodation) return res.status(404).json({ error: 'Alojamento não encontrado' });

    const checkIn = new Date(check_in);
    const checkOut = new Date(check_out);
    const nights = Math.round((checkOut - checkIn) / (1000 * 60 * 60 * 24));

    if (nights <= 0) return res.status(400).json({ error: 'Datas inválidas' });

    // Ler serviços e taxas das configurações
    const settingsRow = db.prepare("SELECT value FROM settings WHERE key = 'services'").get();
    const services = settingsRow ? JSON.parse(settingsRow.value) : [];
    const taxSvc = services.find(s => s.id === 'tourist_tax');
    const bkfSvc = services.find(s => s.id === 'breakfast');
    const bkfRate = bkfSvc?.value ?? 19;
    const bkfOn   = breakfast_included ? 1 : 0;

    const touristTax    = (taxSvc?.active !== false) ? (taxSvc?.value ?? 3) * num_guests * nights : 0;
    const breakfastCost = bkfOn ? bkfRate * num_guests * nights : 0;
    const totalAmount   = (accommodation.price_per_night * nights) + touristTax + breakfastCost;

    // Criar reserva
    const reservationId = `SP-${Date.now()}`;
    db.prepare(`
      INSERT INTO reservations (
        id, guest_id, accommodation_id, check_in, check_out, nights, num_guests,
        total_amount, breakfast_included, tourist_tax, channel, payment_method,
        notes, license_number, guests_data
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      reservationId, guestRecord.id, accommodation_id, check_in, check_out,
      nights, num_guests, totalAmount, bkfOn,
      touristTax, channel || 'direto', payment_method || null,
      notes || null, accommodation.license_number,
      JSON.stringify(guests_data || [])
    );

    const reservation = db.prepare('SELECT * FROM reservations WHERE id = ?').get(reservationId);

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
    const existing = db.prepare('SELECT * FROM reservations WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Reserva não encontrada' });

    const {
      check_in, check_out, num_guests, breakfast_included,
      channel, payment_method, notes, status, payment_status, guests_data, guest,
      accommodation_id
    } = req.body;

    const newAccommodationId = accommodation_id || existing.accommodation_id;
    const accommodation = db.prepare('SELECT * FROM accommodations WHERE id = ?')
      .get(newAccommodationId);
    if (!accommodation) return res.status(404).json({ error: 'Alojamento não encontrado' });

    const newCheckIn = check_in || existing.check_in;
    const newCheckOut = check_out || existing.check_out;
    const nights = Math.round(
      (new Date(newCheckOut) - new Date(newCheckIn)) / (1000 * 60 * 60 * 24)
    );
    const guests = num_guests || existing.num_guests;
    const bkfOn2 = breakfast_included !== undefined ? (breakfast_included ? 1 : 0) : existing.breakfast_included;
    // Ler taxas das configurações
    const settingsRow2 = db.prepare("SELECT value FROM settings WHERE key = 'services'").get();
    const services2 = settingsRow2 ? JSON.parse(settingsRow2.value) : [];
    const taxSvc2 = services2.find(s => s.id === 'tourist_tax');
    const bkfSvc2 = services2.find(s => s.id === 'breakfast');
    const bkfRate2 = bkfSvc2?.value ?? 19;
    const touristTax = (taxSvc2?.active !== false) ? (taxSvc2?.value ?? 3) * guests * nights : 0;
    const breakfastCost = bkfOn2 ? bkfRate2 * guests * nights : 0;

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
        WHERE id = ?`).run(
        guest.name || null, guest.phone || null,
        guest.document_type || null, guest.document_number || null,
        guest.document_issuer_country || null,
        guest.nationality || null, guest.first_name || null,
        guest.last_name || null, guest.birth_date || null,
        guest.birth_city || null,
        guest.nif || null, guest.country || null,
        guest.address || null, guest.postal_code || null, guest.city || null,
        existing.guest_id
      );
    }
    const totalAmount = (accommodation.price_per_night * nights) + touristTax + breakfastCost;

    db.prepare(`
      UPDATE reservations SET
        accommodation_id = ?, check_in = ?, check_out = ?, nights = ?, num_guests = ?,
        total_amount = ?, breakfast_included = ?, tourist_tax = ?,
        channel = ?, payment_method = ?, notes = ?, status = ?,
        payment_status = ?, guests_data = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      newAccommodationId,
      newCheckIn, newCheckOut, nights, guests, totalAmount, bkfOn2,
      touristTax,
      channel || existing.channel, payment_method || existing.payment_method,
      notes !== undefined ? notes : existing.notes, status || existing.status,
      payment_status || existing.payment_status,
      guests_data !== undefined ? JSON.stringify(guests_data) : (existing.guests_data || '[]'),
      req.params.id
    );

    const updated = db.prepare('SELECT * FROM reservations WHERE id = ?').get(req.params.id);

    // Atualizar no Google Calendar
    updateCalendarEvent(updated);

    // Email de pagamento se confirmado agora
    if (payment_status === 'pago' && existing.payment_status !== 'pago') {
      const guest = db.prepare('SELECT * FROM guests WHERE id = ?').get(updated.guest_id);
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
    const reservation = db.prepare('SELECT * FROM reservations WHERE id = ?').get(req.params.id);
    if (!reservation) return res.status(404).json({ error: 'Reserva não encontrada' });

    db.prepare(`
      UPDATE reservations SET status = 'cancelada', updated_at = datetime('now') WHERE id = ?
    `).run(req.params.id);

    // Remover do Google Calendar
    deleteCalendarEvent(reservation);

    // Email de cancelamento
    const guest = db.prepare('SELECT * FROM guests WHERE id = ?').get(reservation.guest_id);
    const accommodation = db.prepare('SELECT * FROM accommodations WHERE id = ?')
      .get(reservation.accommodation_id);
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
    const now = new Date();
    const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const lastOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      .toISOString().split('T')[0];

    const totalBilled = db.prepare(`
      SELECT COALESCE(SUM(total_amount), 0) as total
      FROM reservations WHERE status != 'cancelada'
    `).get();

    const confirmedReservations = db.prepare(`
      SELECT COUNT(*) as count FROM reservations WHERE status = 'confirmada'
    `).get();

    const nightsThisMonth = db.prepare(`
      SELECT COALESCE(SUM(nights), 0) as total
      FROM reservations
      WHERE status != 'cancelada'
        AND check_in >= ? AND check_in <= ?
    `).get(firstOfMonth, lastOfMonth);

    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const totalRooms = 4;
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

module.exports = { getAll, getById, create, update, cancel, getDashboardStats };