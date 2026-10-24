const { db } = require('../config/database');
const { purgeReservations } = require('../services/reservationPurge');
const { flushReservationTaskCleanup } = require('../services/operationalTasksService');

// POST /api/guests
async function create(req, res, next) {
  try {
    const {
      name, first_name, last_name, email, email_personal,
      phone, birth_date, birth_city, birth_country, nif, nationality, country,
      document_type, document_number, document_issuer_country,
      address, postal_code, city, residence_country, company, company_nif
    } = req.body;

    if (!name && !first_name) {
      return res.status(400).json({ error: 'Nome é obrigatório' });
    }

    const fullName = name || `${first_name || ''} ${last_name || ''}`.trim();
    const effectiveEmail = email || require('../services/guestService').placeholderEmail();
    const organizationId = req.user.organization_id;

    const existing = db.prepare('SELECT * FROM guests WHERE email = ? AND organization_id = ?').get(effectiveEmail, organizationId);
    if (existing) {
      return res.status(409).json({ error: 'Já existe um hóspede com este email', data: existing });
    }

    const guest = require('../services/guestService').insertGuest(organizationId, { ...req.body, name: fullName, email: effectiveEmail });
    res.status(201).json({ success: true, data: guest });
  } catch (err) {
    next(err);
  }
}

// GET /api/guests
async function getAll(req, res, next) {
  try {
    const result = require('../services/listQueries').listGuests(req.user.organization_id, req.query);
    res.json({ success: true, ...result });
  } catch (error) { next(error); }
}

// GET /api/guests/:id
async function getById(req, res, next) {
  try {
    const organizationId = req.user.organization_id;
    const guest = db.prepare('SELECT * FROM guests WHERE id = ? AND organization_id = ?').get(req.params.id, organizationId);
    if (!guest) return res.status(404).json({ error: 'Hóspede não encontrado' });
    const reservations = db.prepare(`
      SELECT r.*, a.name as accommodation_name
      FROM reservations r
      JOIN accommodations a ON r.accommodation_id = a.id
      WHERE r.guest_id = ? AND r.organization_id = ?
      ORDER BY r.check_in DESC
    `).all(req.params.id, organizationId);
    res.json({ success: true, data: { ...guest, reservations } });
  } catch (err) {
    next(err);
  }
}

// PUT /api/guests/:id
async function update(req, res, next) {
  try {
    const organizationId = req.user.organization_id;
    const existing = db.prepare('SELECT * FROM guests WHERE id = ? AND organization_id = ?').get(req.params.id, organizationId);
    if (!existing) return res.status(404).json({ error: 'Hóspede não encontrado' });

    const updated = require('../services/guestService').updateGuest(req.params.id, organizationId, req.body);
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/guests/:id
async function remove(req, res, next) {
  try {
    const organizationId = req.user.organization_id;
    const guest = db.prepare('SELECT * FROM guests WHERE id = ? AND organization_id = ?').get(req.params.id, organizationId);
    if (!guest) return res.status(404).json({ error: 'Hóspede não encontrado' });

    const active = db.prepare(
      "SELECT COUNT(*) as c FROM reservations WHERE guest_id = ? AND organization_id = ? AND status != 'cancelada'"
    ).get(req.params.id, organizationId);

    if (active.c > 0) {
      return res.status(409).json({
        error: `Não é possível remover: o hóspede tem ${active.c} reserva(s) ativa(s). Cancele primeiro as reservas.`
      });
    }

    db.transaction(() => {
      const cancelled = db.prepare('SELECT id FROM reservations WHERE guest_id = ? AND organization_id = ?')
        .all(req.params.id, organizationId).map(row => row.id);
      purgeReservations(organizationId, cancelled);
      db.prepare('DELETE FROM guests WHERE id = ? AND organization_id = ?').run(req.params.id, organizationId);
      require('../services/auditLog').recordAudit({ organizationId, userId: req.user.id, action: 'guest.deleted', targetType: 'guest', targetId: req.params.id,
        meta: { reservations_deleted: cancelled.length } });
    })();
    // O scheduler repete a fila se o Google falhar agora.
    flushReservationTaskCleanup(organizationId).catch(() => {});
    res.json({ success: true, message: 'Hóspede removido.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { create, getAll, getById, update, remove };
