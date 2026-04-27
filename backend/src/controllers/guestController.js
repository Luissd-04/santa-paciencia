const { db } = require('../config/database');

// GET /api/guests
async function getAll(req, res, next) {
  try {
    const guests = db.prepare(`
      SELECT g.*,
        COUNT(CASE WHEN r.status != 'cancelada' THEN 1 END) as reservation_count,
        MAX(CASE WHEN r.status != 'cancelada' THEN r.check_in END) as last_check_in
      FROM guests g
      LEFT JOIN reservations r ON r.guest_id = g.id
      GROUP BY g.id
      ORDER BY last_check_in DESC
    `).all();
    res.json({ success: true, data: guests });
  } catch (err) {
    next(err);
  }
}

// GET /api/guests/:id
async function getById(req, res, next) {
  try {
    const guest = db.prepare('SELECT * FROM guests WHERE id = ?').get(req.params.id);
    if (!guest) return res.status(404).json({ error: 'Hóspede não encontrado' });
    const reservations = db.prepare(`
      SELECT r.*, a.name as accommodation_name
      FROM reservations r
      JOIN accommodations a ON r.accommodation_id = a.id
      WHERE r.guest_id = ?
      ORDER BY r.check_in DESC
    `).all(req.params.id);
    res.json({ success: true, data: { ...guest, reservations } });
  } catch (err) {
    next(err);
  }
}

// PUT /api/guests/:id
async function update(req, res, next) {
  try {
    const existing = db.prepare('SELECT * FROM guests WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Hóspede não encontrado' });

    const {
      first_name, last_name, email, email_personal,
      phone, birth_date, nif, nationality, country,
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
        phone = ?, birth_date = ?, nif = ?,
        nationality = ?, country = ?,
        address = ?, postal_code = ?, city = ?,
        is_favorite = ?, is_vip = ?, is_unwanted = ?
      WHERE id = ?
    `).run(
      first_name ?? existing.first_name,
      last_name ?? existing.last_name,
      name,
      email ?? existing.email,
      email_personal ?? existing.email_personal,
      phone ?? existing.phone,
      birth_date ?? existing.birth_date,
      nif ?? existing.nif,
      nationality ?? existing.nationality,
      country ?? existing.country,
      address ?? existing.address,
      postal_code ?? existing.postal_code,
      city ?? existing.city,
      is_favorite ? 1 : 0,
      is_vip ? 1 : 0,
      is_unwanted ? 1 : 0,
      req.params.id
    );

    const updated = db.prepare('SELECT * FROM guests WHERE id = ?').get(req.params.id);
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/guests/:id
async function remove(req, res, next) {
  try {
    const guest = db.prepare('SELECT * FROM guests WHERE id = ?').get(req.params.id);
    if (!guest) return res.status(404).json({ error: 'Hóspede não encontrado' });

    const active = db.prepare(
      "SELECT COUNT(*) as c FROM reservations WHERE guest_id = ? AND status != 'cancelada'"
    ).get(req.params.id);

    if (active.c > 0) {
      return res.status(409).json({
        error: `Não é possível remover: o hóspede tem ${active.c} reserva(s) ativa(s). Cancele primeiro as reservas.`
      });
    }

    db.prepare("DELETE FROM reservations WHERE guest_id = ?").run(req.params.id);
    db.prepare("DELETE FROM guests WHERE id = ?").run(req.params.id);
    res.json({ success: true, message: 'Hóspede removido.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { getAll, getById, update, remove };
