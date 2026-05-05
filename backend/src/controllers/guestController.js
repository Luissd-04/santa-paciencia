const { db } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// POST /api/guests
async function create(req, res, next) {
  try {
    const {
      name, first_name, last_name, email, email_personal,
      phone, birth_date, birth_city, nif, nationality, country,
      document_type, document_number, document_issuer_country,
      address, postal_code, city
    } = req.body;

    if (!name && !first_name) {
      return res.status(400).json({ error: 'Nome é obrigatório' });
    }

    const fullName = name || `${first_name || ''} ${last_name || ''}`.trim();
    const effectiveEmail = email || `guest_${Date.now()}@sem-email.local`;
    const organizationId = req.user.organization_id;

    const existing = db.prepare('SELECT * FROM guests WHERE email = ? AND organization_id = ?').get(effectiveEmail, organizationId);
    if (existing) {
      return res.status(409).json({ error: 'Já existe um hóspede com este email', data: existing });
    }

    const id = uuidv4();
    db.prepare(`
      INSERT INTO guests (id, name, first_name, last_name, email, email_personal,
        phone, birth_date, birth_city, nif, nationality, country, organization_id,
        document_type, document_number, document_issuer_country, address, postal_code, city)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, fullName, first_name || null, last_name || null,
      effectiveEmail, email_personal || null,
      phone || null, birth_date || null, birth_city || null, nif || null,
      nationality || null, country || null, organizationId,
      document_type || null, document_number || null, document_issuer_country || null,
      address || null, postal_code || null, city || null
    );

    const guest = db.prepare('SELECT * FROM guests WHERE id = ? AND organization_id = ?').get(id, organizationId);
    res.status(201).json({ success: true, data: guest });
  } catch (err) {
    next(err);
  }
}

// GET /api/guests
async function getAll(req, res, next) {
  try {
    const { search } = req.query;
    const organizationId = req.user.organization_id;
    let guests;
    if (search && search.trim()) {
      const q = `%${search.trim().toLowerCase()}%`;
      guests = db.prepare(`
        SELECT g.*,
          COUNT(CASE WHEN r.status != 'cancelada' THEN 1 END) as reservation_count,
          MAX(CASE WHEN r.status != 'cancelada' THEN r.check_in END) as last_check_in
        FROM guests g
        LEFT JOIN reservations r ON r.guest_id = g.id AND r.organization_id = g.organization_id
        WHERE g.organization_id = ?
          AND (lower(g.name) LIKE ? OR lower(g.email) LIKE ? OR g.phone LIKE ?)
        GROUP BY g.id
        ORDER BY last_check_in DESC
        LIMIT 20
      `).all(organizationId, q, q, q);
    } else {
      guests = db.prepare(`
        SELECT g.*,
          COUNT(CASE WHEN r.status != 'cancelada' THEN 1 END) as reservation_count,
          MAX(CASE WHEN r.status != 'cancelada' THEN r.check_in END) as last_check_in
        FROM guests g
        LEFT JOIN reservations r ON r.guest_id = g.id AND r.organization_id = g.organization_id
        WHERE g.organization_id = ?
        GROUP BY g.id
        ORDER BY last_check_in DESC
      `).all(organizationId);
    }
    res.json({ success: true, data: guests });
  } catch (err) {
    next(err);
  }
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

    const {
      first_name, last_name, email, email_personal,
      phone, birth_date, birth_city, nif, nationality, country,
      document_type, document_number, document_issuer_country,
      address, postal_code, city,
      is_favorite, is_vip, is_unwanted
    } = req.body;

    const name = (first_name || last_name)
      ? `${first_name || ''} ${last_name || ''}`.trim()
      : existing.name;

    db.prepare(`
      UPDATE guests SET
        first_name = ?, last_name = ?, name = ?,
        email = ?, email_personal = ?,
        phone = ?, birth_date = ?, birth_city = ?, nif = ?,
        nationality = ?, country = ?,
        document_type = ?, document_number = ?, document_issuer_country = ?,
        address = ?, postal_code = ?, city = ?,
        is_favorite = ?, is_vip = ?, is_unwanted = ?
      WHERE id = ? AND organization_id = ?
    `).run(
      first_name ?? existing.first_name,
      last_name  ?? existing.last_name,
      name,
      email          ?? existing.email,
      email_personal ?? existing.email_personal,
      phone          ?? existing.phone,
      birth_date     ?? existing.birth_date,
      birth_city     ?? existing.birth_city,
      nif            ?? existing.nif,
      nationality    ?? existing.nationality,
      country        ?? existing.country,
      document_type  ?? existing.document_type,
      document_number        ?? existing.document_number,
      document_issuer_country ?? existing.document_issuer_country,
      address        ?? existing.address,
      postal_code    ?? existing.postal_code,
      city           ?? existing.city,
      is_favorite ? 1 : 0,
      is_vip      ? 1 : 0,
      is_unwanted ? 1 : 0,
      req.params.id,
      organizationId
    );

    const updated = db.prepare('SELECT * FROM guests WHERE id = ? AND organization_id = ?').get(req.params.id, organizationId);
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

    db.prepare("DELETE FROM reservations WHERE guest_id = ? AND organization_id = ?").run(req.params.id, organizationId);
    db.prepare("DELETE FROM guests WHERE id = ? AND organization_id = ?").run(req.params.id, organizationId);
    res.json({ success: true, message: 'Hóspede removido.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { create, getAll, getById, update, remove };
