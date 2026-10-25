// Único código que escreve em reservation_payments. Cada alteração termina em
// recompute(), que soma o ledger e grava a cache (amount_paid) e os estados
// derivados com as regras de reservationState. Chamar dentro da transação que
// alterou o ledger.
const { randomUUID } = require('crypto');
const { db } = require('../config/database');
const { cents } = require('./money');
const { httpError } = require('./httpError');
const state = require('./reservationState');

function ledgerTotal(reservationId, organizationId) {
  // Arredondar cada movimento em cêntimos evita acumular erro binário.
  return db.prepare('SELECT COALESCE(SUM(ROUND(amount * 100)), 0) AS cents FROM reservation_payments WHERE reservation_id = ? AND organization_id = ?')
    .get(reservationId, organizationId).cents / 100;
}

function addEntry(reservation, { id = randomUUID(), amount, method = null, paymentDate = null, notes = null }) {
  db.prepare('INSERT INTO reservation_payments (id, reservation_id, organization_id, amount, method, payment_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, reservation.id, reservation.organization_id, cents(amount) / 100, method, paymentDate, notes);
  return id;
}

// Reservas anteriores ao ledger guardavam só amount_paid: o saldo passa a um
// movimento antes de qualquer alteração.
function ensureLegacyPayment(reservation, notes = 'Saldo inicial migrado') {
  if (Number(reservation.amount_paid) <= 0) return;
  if (db.prepare('SELECT 1 FROM reservation_payments WHERE reservation_id = ? AND organization_id = ?').get(reservation.id, reservation.organization_id)) return;
  addEntry(reservation, { amount: reservation.amount_paid, method: reservation.payment_method || null,
    paymentDate: reservation.payment_date || null, notes });
}

// Movimentos da Stripe só mudam com a Stripe (reembolsos no painel).
function removeEntry(reservation, paymentId) {
  const payment = db.prepare('SELECT * FROM reservation_payments WHERE id = ? AND reservation_id = ? AND organization_id = ?')
    .get(paymentId, reservation.id, reservation.organization_id);
  if (!payment) throw httpError('Pagamento não encontrado', 404);
  if (payment.id.startsWith('stripe-')) throw httpError('Este movimento é gerido pela Stripe. Efetue o reembolso no painel Stripe.', 409);
  db.prepare('DELETE FROM reservation_payments WHERE id = ? AND organization_id = ?').run(paymentId, reservation.organization_id);
  return payment;
}

// O ledger tem de estar migrado (ensureLegacyPayment) antes da alteração.
// `deriveStatus: false` mantém o estado da reserva (ex.: estado escolhido
// pela equipa na edição). `fallbackPaymentStatus` é o estado do pagamento a
// conservar quando nada foi recebido.
function recompute(reservationId, organizationId, { deriveStatus = true, allowDowngrade = true, fallbackPaymentStatus } = {}) {
  const r = db.prepare('SELECT * FROM reservations WHERE id = ? AND organization_id = ?').get(reservationId, organizationId);
  if (!r) throw httpError('Reserva não encontrada', 404);
  const paid = ledgerTotal(r.id, organizationId);
  const paidCents = cents(paid), totalCents = cents(r.total_amount || 0);
  if (paidCents < 0) throw httpError('O movimento deixaria um saldo negativo. Corrige primeiro o ajuste associado.', 409);
  const refunded = Boolean(db.prepare(`SELECT 1 FROM reservation_payments WHERE reservation_id = ? AND organization_id = ?
    AND id LIKE 'stripe-refund-%'`).get(r.id, organizationId));
  const paymentStatus = state.paymentStatusFor({ paidCents, totalCents, current: fallbackPaymentStatus ?? r.payment_status, refunded });
  const depositCents = require('./paymentPolicy').requiredDepositCents(r);
  const status = deriveStatus ? state.statusAfterPayment({ status: r.status, paidCents, depositCents, allowDowngrade }) : r.status;
  db.prepare("UPDATE reservations SET amount_paid = ?, payment_status = ?, status = ?, updated_at = datetime('now') WHERE id = ? AND organization_id = ?")
    .run(paid, paymentStatus, status, r.id, organizationId);
  return { paid, paymentStatus, status, previousStatus: r.status, previousPaymentStatus: r.payment_status };
}

module.exports = { ledgerTotal, addEntry, ensureLegacyPayment, removeEntry, recompute };
