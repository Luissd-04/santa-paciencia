const { randomUUID } = require('crypto');
const { db } = require('../config/database');
const { localDateIso } = require('./reservationRules');

const USAGE_COUNT_SQL = '(SELECT COUNT(*) FROM voucher_redemptions vr WHERE vr.voucher_id = v.id AND vr.organization_id = v.organization_id)';
function voucherError(message, status = 400) { return Object.assign(new Error(message), { status }); }
function getVoucher(organizationId, id) {
  return db.prepare(`SELECT v.*, ${USAGE_COUNT_SQL} AS used_count FROM vouchers v
    WHERE v.id = ? AND v.organization_id = ?`).get(id, organizationId);
}
function validateLimit(value = 1, usedCount = 0) {
  const limit = Number(value);
  if (!['number', 'string'].includes(typeof value) || !Number.isSafeInteger(limit) || limit < 1) {
    throw voucherError('O limite de utilizações deve ser um número inteiro maior que zero.');
  }
  if (limit < usedCount) throw voucherError(`O limite não pode ser inferior às ${usedCount} utilizações já registadas.`);
  return limit;
}
function assertUsable(voucher, context = {}) {
  if (!voucher) throw voucherError('Voucher inválido.', 404);
  if (voucher.used_count >= voucher.max_uses || voucher.status === 'used') throw voucherError('O voucher atingiu o limite de utilizações.', 409);
  if (voucher.status !== 'active') throw voucherError('Voucher não está ativo.');
  const today = localDateIso();
  if (voucher.valid_until && voucher.valid_until < today) throw voucherError('Voucher expirado.');
  if (voucher.valid_from && voucher.valid_from > today) throw voucherError('Voucher ainda não está ativo.');
  if (context.nights !== undefined && context.nights < voucher.min_nights) throw voucherError(`O voucher exige pelo menos ${voucher.min_nights} noites.`);
  if (context.accommodation_id && voucher.accommodation_id &&
      voucher.accommodation_id !== context.accommodation_id && voucher.accommodation_id !== context.parent_id) {
    throw voucherError('Voucher não é válido para este alojamento.');
  }
  return voucher;
}
function findUsableVoucher(organizationId, code, context = {}) {
  const voucher = db.prepare(`SELECT v.*, ${USAGE_COUNT_SQL} AS used_count FROM vouchers v
    WHERE v.code = ? AND v.organization_id = ?`).get(String(code).trim().toUpperCase(), organizationId);
  return assertUsable(voucher, context);
}
function voucherDiscount(voucher, total) {
  return Math.min(total, voucher.type === 'discount_pct' ? total * voucher.value / 100 : voucher.value);
}

// Contagem, validação e registo na mesma transação: duas reservas não podem
// consumir a última utilização. Repetir a mesma reserva não consome outra vez.
const redeemTx = db.transaction((organizationId, voucherId, reservationId, discountAmount = null) => {
  const voucher = getVoucher(organizationId, voucherId);
  if (!voucher) throw voucherError('Voucher não encontrado.', 404);
  const reservation = db.prepare(`SELECT r.*, a.parent_id FROM reservations r
    JOIN accommodations a ON a.id = r.accommodation_id AND a.organization_id = r.organization_id
    WHERE r.id = ? AND r.organization_id = ?`).get(reservationId, organizationId);
  if (!reservation) throw voucherError('Reserva não encontrada.', 404);
  const previous = db.prepare(`SELECT id FROM voucher_redemptions
    WHERE organization_id = ? AND voucher_id = ? AND reservation_reference = ?`).get(organizationId, voucherId, reservationId);
  if (previous) return voucher;
  if (reservation.status === 'cancelada') throw voucherError('Não é possível aplicar um voucher a uma reserva cancelada.');
  assertUsable(voucher, reservation);
  db.prepare(`INSERT INTO voucher_redemptions
    (id, organization_id, voucher_id, reservation_id, reservation_reference, discount_amount)
    VALUES (?, ?, ?, ?, ?, ?)`).run(randomUUID(), organizationId, voucherId, reservationId, reservationId, discountAmount);
  db.prepare(`UPDATE vouchers SET status = CASE WHEN ? >= max_uses THEN 'used' ELSE 'active' END,
    used_at = datetime('now'), used_in_reservation_id = ?, updated_at = datetime('now')
    WHERE id = ? AND organization_id = ?`).run(voucher.used_count + 1, reservationId, voucherId, organizationId);
  return getVoucher(organizationId, voucherId);
});
function redeemVoucher(organizationId, voucherId, reservationId, discountAmount = null) {
  if (!reservationId) throw voucherError('A reserva é obrigatória para registar a utilização do voucher.');
  return redeemTx.immediate(organizationId, voucherId, reservationId, discountAmount);
}
module.exports = { USAGE_COUNT_SQL, getVoucher, validateLimit, assertUsable, findUsableVoucher, voucherDiscount, redeemVoucher };
