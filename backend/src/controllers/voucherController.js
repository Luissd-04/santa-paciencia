const { db } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const { USAGE_COUNT_SQL, getVoucher, validateLimit, findUsableVoucher, redeemVoucher } = require('../services/voucherService');

const VOUCHER_TYPES = ['discount_pct', 'discount_fixed', 'credit_stay'];

function generateCode(accommodationName = null) {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yy = String(now.getFullYear()).slice(-2);
  const initials = accommodationName
    ? accommodationName.split(/\s+/).map(w => w[0]?.toUpperCase() || '').filter(Boolean).join('').slice(0, 4)
    : '';
  return `SP${initials}${mm}${yy}`;
}

function getAll(req, res) {
  const vouchers = db.prepare(`
    SELECT v.*, ${USAGE_COUNT_SQL} AS used_count, a.name as accommodation_name
    FROM vouchers v
    LEFT JOIN accommodations a ON a.id = v.accommodation_id AND a.organization_id = v.organization_id
    WHERE v.organization_id = ?
    ORDER BY v.created_at DESC
  `).all(req.user.organization_id);
  res.json({ success: true, data: vouchers });
}

function validate(req, res) {
  const { code } = req.query;
  if (!code) return res.status(400).json({ error: 'Código obrigatório' });

  try {
    const voucher = findUsableVoucher(req.user.organization_id, code);
    res.json({ success: true, data: voucher });
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
}

function getReservations(req, res) {
  const voucher = getVoucher(req.user.organization_id, req.params.id);
  if (!voucher) return res.status(404).json({ error: 'Voucher não encontrado' });
  const requestedPage = Number(req.query.page ?? 1);
  if (!Number.isSafeInteger(requestedPage) || requestedPage < 1) return res.status(400).json({ error: 'Página inválida.' });
  const limit = 25;
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(voucher.used_count / limit)));
  const rows = db.prepare(`SELECT vr.id, vr.used_at, vr.discount_amount, vr.reservation_reference,
      r.id AS reservation_id, r.check_in, r.check_out, r.status, r.total_amount,
      g.name AS guest_name, a.name AS accommodation_name
    FROM voucher_redemptions vr
    LEFT JOIN reservations r ON r.id = vr.reservation_id AND r.organization_id = vr.organization_id
    LEFT JOIN guests g ON g.id = r.guest_id AND g.organization_id = vr.organization_id
    LEFT JOIN accommodations a ON a.id = r.accommodation_id AND a.organization_id = vr.organization_id
    WHERE vr.voucher_id = ? AND vr.organization_id = ?
    ORDER BY vr.used_at DESC, vr.id DESC LIMIT ? OFFSET ?`)
    .all(voucher.id, req.user.organization_id, limit, (page - 1) * limit);
  res.json({ success: true, data: rows, voucher,
    pagination: { page, total: voucher.used_count, totalPages: Math.max(1, Math.ceil(voucher.used_count / limit)) } });
}

function create(req, res) {
  const { code, type, value, description, valid_from, valid_until, min_nights, accommodation_id, notes } = req.body;
  if (!type || !VOUCHER_TYPES.includes(type) || value == null) {
    return res.status(400).json({ error: 'Tipo e valor são obrigatórios' });
  }
  const parsedValue = type === 'credit_stay' ? parseInt(value) : parseFloat(value);
  if (!parsedValue || parsedValue <= 0) return res.status(400).json({ error: 'O valor deve ser maior que 0' });
  if (type === 'discount_pct' && parsedValue > 100) {
    return res.status(400).json({ error: 'Desconto percentual não pode exceder 100%' });
  }

  let maxUses;
  try { maxUses = validateLimit(req.body.max_uses); }
  catch (err) { return res.status(400).json({ error: err.message }); }
  let acc = null;
  if (accommodation_id) {
    acc = db.prepare('SELECT id, name FROM accommodations WHERE id = ? AND organization_id = ?').get(accommodation_id, req.user.organization_id);
    if (!acc) return res.status(400).json({ error: 'Alojamento não encontrado' });
  }

  let voucherCode;
  if (code) {
    voucherCode = code.toUpperCase().trim();
    if (db.prepare('SELECT id FROM vouchers WHERE code = ? AND organization_id = ?').get(voucherCode, req.user.organization_id)) {
      return res.status(409).json({ error: 'Este código já existe. Escolhe outro.' });
    }
  } else {
    const base = generateCode(acc?.name || null);
    voucherCode = base;
    let suffix = 1;
    while (db.prepare('SELECT id FROM vouchers WHERE code = ? AND organization_id = ?').get(voucherCode, req.user.organization_id)) {
      voucherCode = `${base}${suffix++}`;
    }
  }

  const id = uuidv4().slice(0, 8);
  db.prepare(`
    INSERT INTO vouchers (id, organization_id, code, type, value, description, valid_from, valid_until, min_nights, accommodation_id, notes, max_uses)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, req.user.organization_id, voucherCode, type,
    parsedValue, description || null,
    valid_from || null, valid_until || null,
    min_nights ? parseInt(min_nights) : 1,
    accommodation_id || null, notes || null, maxUses
  );

  res.status(201).json({ success: true, data: getVoucher(req.user.organization_id, id) });
}

function update(req, res) {
  return db.transaction(() => updateInTransaction(req, res)).immediate();
}

function updateInTransaction(req, res) {
  const existing = getVoucher(req.user.organization_id, req.params.id);
  if (!existing) return res.status(404).json({ error: 'Voucher não encontrado' });

  const { type, value, description, valid_from, valid_until, min_nights, accommodation_id, notes, status } = req.body;

  if (type && !VOUCHER_TYPES.includes(type)) return res.status(400).json({ error: 'Tipo inválido' });
  const effectiveType = type ?? existing.type;
  if (value !== undefined) {
    const pv = effectiveType === 'credit_stay' ? parseInt(value) : parseFloat(value);
    if (!pv || pv <= 0) return res.status(400).json({ error: 'O valor deve ser maior que 0' });
  }

  let maxUses;
  try { maxUses = validateLimit(req.body.max_uses !== undefined ? req.body.max_uses : existing.max_uses, existing.used_count); }
  catch (err) { return res.status(400).json({ error: err.message }); }
  if (status !== undefined && !['active', 'used', 'expired', 'cancelled'].includes(status)) {
    return res.status(400).json({ error: 'Estado inválido.' });
  }
  const requestedStatus = status ?? existing.status;
  const nextStatus = ['active', 'used'].includes(requestedStatus)
    ? (existing.used_count >= maxUses ? 'used' : 'active') : requestedStatus;
  if (accommodation_id && !db.prepare('SELECT 1 FROM accommodations WHERE id=? AND organization_id=?').get(accommodation_id, req.user.organization_id)) {
    return res.status(400).json({ error: 'Alojamento não encontrado.' });
  }
  // Padrão único: se a chave existe no body, usa o valor (incluindo string vazia
  // para apagar); se não, mantém o valor actual. Evita a mistura COALESCE+JS.
  const keep = (key, current) => req.body[key] !== undefined
    ? (req.body[key] === '' ? null : req.body[key])
    : current;

  db.prepare(`
    UPDATE vouchers SET
      type = ?,
      value = ?,
      description = ?,
      valid_from = ?,
      valid_until = ?,
      min_nights = ?,
      accommodation_id = ?,
      notes = ?,
      status = ?,
      max_uses = ?,
      updated_at = datetime('now')
    WHERE id = ? AND organization_id = ?
  `).run(
    keep('type', existing.type),
    value !== undefined
      ? (effectiveType === 'credit_stay' ? parseInt(value) : parseFloat(value))
      : existing.value,
    keep('description', existing.description),
    keep('valid_from', existing.valid_from),
    keep('valid_until', existing.valid_until),
    min_nights !== undefined ? parseInt(min_nights) : existing.min_nights,
    keep('accommodation_id', existing.accommodation_id),
    keep('notes', existing.notes),
    nextStatus, maxUses,
    req.params.id, req.user.organization_id
  );

  res.json({ success: true, data: getVoucher(req.user.organization_id, req.params.id) });
}

function apply(req, res) {
  try {
    const voucher = redeemVoucher(req.user.organization_id, req.params.id, req.body.reservation_id);
    res.json({ success: true, data: voucher });
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
}

function remove(req, res) {
  const existing = getVoucher(req.user.organization_id, req.params.id);
  if (!existing) return res.status(404).json({ error: 'Voucher não encontrado' });
  db.prepare('DELETE FROM vouchers WHERE id = ? AND organization_id = ?').run(req.params.id, req.user.organization_id);
  res.json({ success: true });
}

module.exports = { getAll, validate, create, update, apply, remove, getReservations };
