const { randomUUID } = require('crypto');
const { db } = require('../config/database');
const { localDateIso } = require('./reservationRules');

// Utilizações libertadas por cancelamento (released_at) não contam para o limite.
const USAGE_COUNT_SQL = '(SELECT COUNT(*) FROM voucher_redemptions vr WHERE vr.voucher_id = v.id AND vr.organization_id = v.organization_id AND vr.released_at IS NULL)';
const voucherError = (message, status = 400) => require('./httpError').httpError(message, status);
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
// Desconto arredondado ao cêntimo. Um crédito de estadia vale N noites: o
// preço das primeiras N noites da estadia (sem taxas nem extras).
function voucherDiscount(voucher, total, nightlyPrices = []) {
  const value = Number(voucher.value) || 0;
  let discount;
  if (voucher.type === 'discount_pct') discount = Math.round(total * value) / 100;
  else if (voucher.type === 'credit_stay') {
    discount = (Array.isArray(nightlyPrices) ? nightlyPrices : []).slice(0, Math.max(0, Math.floor(value)))
      .reduce((sum, night) => sum + Math.round((Number(night?.price) || 0) * 100), 0) / 100;
  } else discount = require('./money').roundEUR(value);
  return Math.max(0, Math.min(total, discount));
}

function activeRedemption(organizationId, reservationId) {
  return db.prepare(`SELECT vr.*, v.type, v.value, v.min_nights, v.accommodation_id AS voucher_accommodation_id, v.code
    FROM voucher_redemptions vr JOIN vouchers v ON v.id = vr.voucher_id AND v.organization_id = vr.organization_id
    WHERE vr.organization_id = ? AND vr.reservation_id = ? AND vr.released_at IS NULL
    ORDER BY vr.used_at DESC LIMIT 1`).get(organizationId, reservationId);
}

function refreshVoucherStatus(organizationId, voucherId) {
  const voucher = getVoucher(organizationId, voucherId);
  if (!voucher || !['active', 'used'].includes(voucher.status)) return;
  db.prepare(`UPDATE vouchers SET status = ?, updated_at = datetime('now') WHERE id = ? AND organization_id = ?`)
    .run(voucher.used_count >= voucher.max_uses ? 'used' : 'active', voucherId, organizationId);
}

// Uma reserva cancelada que nunca recebeu dinheiro devolve a utilização do
// voucher. Com qualquer pagamento recebido o voucher fica gasto.
// Chamar dentro da transação do cancelamento.
function releaseVoucherIfUnpaid(organizationId, reservationId) {
  const reservation = db.prepare('SELECT amount_paid FROM reservations WHERE id = ? AND organization_id = ?').get(reservationId, organizationId);
  if (!reservation || Math.round(Number(reservation.amount_paid || 0) * 100) > 0) return 0;
  if (db.prepare('SELECT 1 FROM reservation_payments WHERE reservation_id = ? AND organization_id = ? AND amount > 0').get(reservationId, organizationId)) return 0;
  const rows = db.prepare('SELECT id, voucher_id FROM voucher_redemptions WHERE organization_id = ? AND reservation_id = ? AND released_at IS NULL')
    .all(organizationId, reservationId);
  for (const row of rows) {
    db.prepare("UPDATE voucher_redemptions SET released_at = datetime('now') WHERE id = ?").run(row.id);
    db.prepare(`UPDATE vouchers SET used_in_reservation_id = NULL WHERE id = ? AND organization_id = ? AND used_in_reservation_id = ?`)
      .run(row.voucher_id, organizationId, reservationId);
    refreshVoucherStatus(organizationId, row.voucher_id);
  }
  return rows.length;
}

// Reativar uma reserva volta a consumir o voucher libertado. Se entretanto foi
// esgotado ou desativado, a reativação é recusada para não manter um desconto
// sem utilização associada. Chamar dentro da transação da reativação.
function reclaimReleasedVoucher(organizationId, reservationId) {
  const rows = db.prepare('SELECT id, voucher_id FROM voucher_redemptions WHERE organization_id = ? AND reservation_id = ? AND released_at IS NOT NULL')
    .all(organizationId, reservationId);
  for (const row of rows) {
    const voucher = getVoucher(organizationId, row.voucher_id);
    if (!voucher || !['active', 'used'].includes(voucher.status) || voucher.used_count >= voucher.max_uses) {
      throw voucherError(`O voucher${voucher ? ` ${voucher.code}` : ''} já não está disponível. Ajuste o total da reserva antes de a reativar.`, 409);
    }
    db.prepare('UPDATE voucher_redemptions SET released_at = NULL, used_at = datetime(\'now\') WHERE id = ?').run(row.id);
    db.prepare(`UPDATE vouchers SET used_at = datetime('now'), used_in_reservation_id = ?, updated_at = datetime('now') WHERE id = ? AND organization_id = ?`)
      .run(reservationId, row.voucher_id, organizationId);
    refreshVoucherStatus(organizationId, row.voucher_id);
  }
  return rows.length;
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
  const previous = db.prepare(`SELECT id, released_at FROM voucher_redemptions
    WHERE organization_id = ? AND voucher_id = ? AND reservation_reference = ?`).get(organizationId, voucherId, reservationId);
  if (previous && !previous.released_at) return voucher;
  if (previous) {
    if (reservation.status === 'cancelada') throw voucherError('Não é possível aplicar um voucher a uma reserva cancelada.');
    reclaimReleasedVoucher(organizationId, reservationId);
    return getVoucher(organizationId, voucherId);
  }
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
module.exports = { USAGE_COUNT_SQL, getVoucher, validateLimit, assertUsable, findUsableVoucher, voucherDiscount, redeemVoucher,
  activeRedemption, releaseVoucherIfUnpaid, reclaimReleasedVoucher };
