const { db } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const VOUCHER_TYPES = ['discount_pct', 'discount_fixed', 'credit_stay'];

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function getAll(req, res) {
  const vouchers = db.prepare(`
    SELECT v.*, a.name as accommodation_name
    FROM vouchers v
    LEFT JOIN accommodations a ON v.accommodation_id = a.id AND a.organization_id = v.organization_id
    WHERE v.organization_id = ?
    ORDER BY v.created_at DESC
  `).all(req.user.organization_id);
  res.json({ success: true, data: vouchers });
}

function validate(req, res) {
  const { code } = req.query;
  if (!code) return res.status(400).json({ error: 'Código obrigatório' });

  const voucher = db.prepare(`
    SELECT v.*, a.name as accommodation_name
    FROM vouchers v
    LEFT JOIN accommodations a ON v.accommodation_id = a.id
    WHERE v.code = ? AND v.organization_id = ? AND v.status = 'active'
  `).get(code.toUpperCase().trim(), req.user.organization_id);

  if (!voucher) return res.status(404).json({ error: 'Voucher inválido ou já utilizado' });

  const today = new Date().toISOString().slice(0, 10);
  if (voucher.valid_until && voucher.valid_until < today) {
    return res.status(400).json({ error: 'Voucher expirado' });
  }
  if (voucher.valid_from && voucher.valid_from > today) {
    return res.status(400).json({ error: 'Voucher ainda não está ativo' });
  }

  res.json({ success: true, data: voucher });
}

function create(req, res) {
  const { code, type, value, description, valid_from, valid_until, min_nights, accommodation_id, notes } = req.body;
  if (!type || !VOUCHER_TYPES.includes(type) || value == null) {
    return res.status(400).json({ error: 'Tipo e valor são obrigatórios' });
  }
  if (parseFloat(value) <= 0) return res.status(400).json({ error: 'O valor deve ser maior que 0' });
  if (type === 'discount_pct' && parseFloat(value) > 100) {
    return res.status(400).json({ error: 'Desconto percentual não pode exceder 100%' });
  }

  const voucherCode = (code || generateCode()).toUpperCase().trim();
  const existing = db.prepare('SELECT id FROM vouchers WHERE code = ? AND organization_id = ?').get(voucherCode, req.user.organization_id);
  if (existing) return res.status(409).json({ error: 'Este código já existe. Escolhe outro.' });

  if (accommodation_id) {
    const acc = db.prepare('SELECT id FROM accommodations WHERE id = ? AND organization_id = ?').get(accommodation_id, req.user.organization_id);
    if (!acc) return res.status(400).json({ error: 'Alojamento não encontrado' });
  }

  const id = uuidv4().slice(0, 8);
  db.prepare(`
    INSERT INTO vouchers (id, organization_id, code, type, value, description, valid_from, valid_until, min_nights, accommodation_id, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, req.user.organization_id, voucherCode, type,
    parseFloat(value), description || null,
    valid_from || null, valid_until || null,
    min_nights ? parseInt(min_nights) : 1,
    accommodation_id || null, notes || null
  );

  res.status(201).json({ success: true, data: db.prepare('SELECT * FROM vouchers WHERE id = ?').get(id) });
}

function update(req, res) {
  const existing = db.prepare('SELECT * FROM vouchers WHERE id = ? AND organization_id = ?').get(req.params.id, req.user.organization_id);
  if (!existing) return res.status(404).json({ error: 'Voucher não encontrado' });

  const { type, value, description, valid_from, valid_until, min_nights, accommodation_id, notes, status } = req.body;

  if (type && !VOUCHER_TYPES.includes(type)) return res.status(400).json({ error: 'Tipo inválido' });
  if (value !== undefined && parseFloat(value) <= 0) return res.status(400).json({ error: 'O valor deve ser maior que 0' });

  db.prepare(`
    UPDATE vouchers SET
      type = COALESCE(?, type),
      value = COALESCE(?, value),
      description = ?,
      valid_from = ?,
      valid_until = ?,
      min_nights = COALESCE(?, min_nights),
      accommodation_id = ?,
      notes = ?,
      status = COALESCE(?, status),
      updated_at = datetime('now')
    WHERE id = ? AND organization_id = ?
  `).run(
    type ?? null,
    value !== undefined ? parseFloat(value) : null,
    description !== undefined ? (description || null) : existing.description,
    valid_from !== undefined ? (valid_from || null) : existing.valid_from,
    valid_until !== undefined ? (valid_until || null) : existing.valid_until,
    min_nights !== undefined ? parseInt(min_nights) : null,
    accommodation_id !== undefined ? (accommodation_id || null) : existing.accommodation_id,
    notes !== undefined ? (notes || null) : existing.notes,
    status ?? null,
    req.params.id, req.user.organization_id
  );

  res.json({ success: true, data: db.prepare('SELECT * FROM vouchers WHERE id = ? AND organization_id = ?').get(req.params.id, req.user.organization_id) });
}

function apply(req, res) {
  const existing = db.prepare('SELECT * FROM vouchers WHERE id = ? AND organization_id = ?').get(req.params.id, req.user.organization_id);
  if (!existing) return res.status(404).json({ error: 'Voucher não encontrado' });
  if (existing.status !== 'active') return res.status(400).json({ error: 'Voucher não está ativo' });

  const { reservation_id } = req.body;
  db.prepare(`
    UPDATE vouchers SET status = 'used', used_at = datetime('now'), used_in_reservation_id = ?, updated_at = datetime('now')
    WHERE id = ? AND organization_id = ?
  `).run(reservation_id || null, req.params.id, req.user.organization_id);

  res.json({ success: true, data: db.prepare('SELECT * FROM vouchers WHERE id = ? AND organization_id = ?').get(req.params.id, req.user.organization_id) });
}

function remove(req, res) {
  const existing = db.prepare('SELECT * FROM vouchers WHERE id = ? AND organization_id = ?').get(req.params.id, req.user.organization_id);
  if (!existing) return res.status(404).json({ error: 'Voucher não encontrado' });
  if (existing.status === 'used') return res.status(400).json({ error: 'Não é possível eliminar um voucher já utilizado' });
  db.prepare('DELETE FROM vouchers WHERE id = ? AND organization_id = ?').run(req.params.id, req.user.organization_id);
  res.json({ success: true });
}

module.exports = { getAll, validate, create, update, apply, remove };
