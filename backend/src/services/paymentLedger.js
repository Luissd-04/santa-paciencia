const { randomUUID } = require('crypto');
const { db } = require('../config/database');
const cents = value => Math.round(Number(value || 0) * 100);

function ledgerTotal(reservationId, organizationId) {
  // Arredondar cada movimento em cêntimos evita acumular erro binário.
  return db.prepare('SELECT COALESCE(SUM(ROUND(amount * 100)), 0) AS cents FROM reservation_payments WHERE reservation_id = ? AND organization_id = ?')
    .get(reservationId, organizationId).cents / 100;
}

function ensureLegacyPayment(reservation) {
  if (Number(reservation.amount_paid) <= 0) return;
  if (db.prepare('SELECT 1 FROM reservation_payments WHERE reservation_id = ? AND organization_id = ?').get(reservation.id, reservation.organization_id)) return;
  db.prepare('INSERT INTO reservation_payments (id, reservation_id, organization_id, amount, method, payment_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(randomUUID(), reservation.id, reservation.organization_id, cents(reservation.amount_paid) / 100,
      reservation.payment_method || null, reservation.payment_date || null, 'Saldo inicial migrado');
}

function setPaidAmount(reservation, amount) {
  ensureLegacyPayment(reservation);
  const delta = cents(amount) - cents(ledgerTotal(reservation.id, reservation.organization_id));
  if (!delta) return;
  db.prepare('INSERT INTO reservation_payments (id, reservation_id, organization_id, amount, method, payment_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(randomUUID(), reservation.id, reservation.organization_id, delta / 100,
      reservation.payment_method || null, reservation.payment_date || null, 'Ajuste do saldo pela gestão da reserva');
}
module.exports = { ledgerTotal, ensureLegacyPayment, setPaidAmount };
