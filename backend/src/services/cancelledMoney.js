// Dinheiro recebido numa reserva cancelada sem política de pagamento (com
// política, o reembolso contratado é de paymentPolicyAutomation). A equipa
// decide: reembolsar (pela Stripe, se o pagamento foi online; à mão, com
// registo, caso contrário) ou reter, com o motivo. Enquanto não decide, a
// reserva aparece em «Precisa de atenção» e na ficha.
const { randomUUID } = require('crypto');
const { db } = require('../config/database');
const { cents } = require('./money');
const { httpError } = require('./httpError');
const ledger = require('./financialLedger');
const { recordHistory } = require('./reservationHistoryService');

const load = (organizationId, id) => db.prepare('SELECT * FROM reservations WHERE id = ? AND organization_id = ?').get(id, organizationId);

// Pagamentos online ainda por devolver (do modo Stripe atual).
function onlineRefundable(reservationId) {
  const { stripeConfig } = require('./stripeClient');
  return db.prepare(`SELECT * FROM stripe_payment_attempts WHERE reservation_id = ? AND livemode = ? AND captured_cents > refunded_cents
    AND payment_intent_id IS NOT NULL ORDER BY created_at`).all(reservationId, stripeConfig().livemode ? 1 : 0);
}

// Cancelada, com valores recebidos, sem decisão e fora do fluxo da política.
function isPending(r) {
  return r.status === 'cancelada' && cents(r.amount_paid || 0) > 0 && !r.money_resolution
    && (!r.policy_cancellation_json || r.online_payment_status === 'review_required');
}

// O que a ficha mostra (null quando não há nada a tratar nem decisão tomada).
function describe(r) {
  if (r.status !== 'cancelada') return null;
  const paid = cents(r.amount_paid || 0);
  if (!isPending(r) && !r.money_resolution) return null;
  const online = onlineRefundable(r.id).reduce((sum, a) => sum + a.captured_cents - a.refunded_cents, 0);
  return {
    pending: isPending(r), paid: paid / 100, online: Math.min(online, paid) / 100,
    manual: Math.max(0, paid - Math.min(online, paid)) / 100,
    resolution: r.money_resolution || null, note: r.money_resolution_note || null, resolved_at: r.money_resolved_at || null,
  };
}

function guard(r) {
  if (!r) throw httpError('Reserva não encontrada', 404);
  if (r.status !== 'cancelada') throw httpError('Só numa reserva cancelada.', 409);
  if (r.policy_cancellation_json && r.online_payment_status !== 'review_required') {
    throw httpError('Esta reserva tem um reembolso contratado pela política de pagamento.', 409);
  }
}

// Reembolsa `amount` (omitido: tudo o que está pago). A parte paga online
// devolve-se pela Stripe; o resto regista-se como reembolso manual.
async function refund(organizationId, id, { actorUserId = null, amount, method, note } = {}) {
  let r = load(organizationId, id);
  guard(r);
  const paidCents = cents(ledger.ledgerTotal(id, organizationId));
  if (paidCents <= 0) throw httpError('Não há valores recebidos para reembolsar.', 409);
  const wanted = amount === undefined || amount === null || amount === '' ? paidCents : cents(Number(amount));
  if (!Number.isSafeInteger(wanted) || wanted <= 0 || wanted > paidCents) throw httpError('Valor do reembolso inválido.', 400);
  const attempts = onlineRefundable(id);
  const onlinePart = Math.min(wanted, attempts.reduce((sum, a) => sum + a.captured_cents - a.refunded_cents, 0));
  const manualPart = wanted - onlinePart;
  const text = String(note || '').trim().slice(0, 300);

  if (onlinePart > 0) {
    const stripePayments = require('./stripePayments');
    const { getStripe, stripeConfig } = require('./stripeClient');
    if (!stripeConfig().ready) throw httpError('A Stripe não está disponível. Faça o reembolso no painel Stripe: o valor fica registado aqui.', 409);
    const stripe = getStripe();
    let left = onlinePart;
    for (const attempt of attempts) {
      if (left <= 0) break;
      const part = Math.min(left, attempt.captured_cents - attempt.refunded_cents);
      // A chave repete-se num novo pedido igual (resposta perdida) sem devolver duas vezes.
      await stripe.refunds.create({ payment_intent: attempt.payment_intent_id, amount: part,
        metadata: { integration: 'santa_paciencia', booking_id: id, source: 'cancelled_reservation' } },
      { idempotencyKey: `sp-cancel-refund-${attempt.id}-${attempt.refunded_cents}-${part}` });
      await stripePayments.reconcileAttempt(db.prepare('SELECT * FROM stripe_payment_attempts WHERE id = ?').get(attempt.id), stripe);
      left -= part;
    }
  }

  db.transaction(() => {
    r = load(organizationId, id);
    if (manualPart > 0) {
      ledger.ensureLegacyPayment(r);
      ledger.addEntry(r, { id: `rp-refund-${randomUUID()}`, amount: -manualPart / 100, method: String(method || '').trim().slice(0, 60) || 'Reembolso manual',
        paymentDate: require('./reservationRules').localDateIso(), notes: text || 'Reembolso registado pela equipa' });
    }
    const result = ledger.recompute(id, organizationId, { deriveStatus: false });
    const settled = cents(result.paid) <= 0;
    if (settled) {
      db.prepare("UPDATE reservations SET money_resolution = 'refunded', money_resolution_note = ?, money_resolved_at = datetime('now') WHERE id = ? AND organization_id = ?")
        .run(text || null, id, organizationId);
    }
    recordHistory({ organizationId, reservationId: id, userId: actorUserId, action: 'cancelled_money_refunded',
      meta: { amount: wanted / 100, online: onlinePart / 100, manual: manualPart / 100, ...(text ? { note: text } : {}) } });
  }).immediate();
  return describe(load(organizationId, id)) || { pending: false, paid: 0, resolution: 'refunded' };
}

// Fica com o dinheiro, com o motivo registado (ex.: política do alojamento).
function retain(organizationId, id, { actorUserId = null, reason } = {}) {
  const text = String(reason || '').trim();
  if (text.length < 3) throw httpError('Indique o motivo para reter o valor.', 400);
  return db.transaction(() => {
    const r = load(organizationId, id);
    guard(r);
    if (cents(r.amount_paid || 0) <= 0) throw httpError('Não há valores recebidos para reter.', 409);
    db.prepare("UPDATE reservations SET money_resolution = 'retained', money_resolution_note = ?, money_resolved_at = datetime('now') WHERE id = ? AND organization_id = ?")
      .run(text.slice(0, 300), id, organizationId);
    // Um pagamento a rever deixa de o estar: a decisão está tomada.
    if (r.online_payment_status === 'review_required') {
      const rows = db.prepare('SELECT COALESCE(SUM(captured_cents),0) AS c, COALESCE(SUM(refunded_cents),0) AS f FROM stripe_payment_attempts WHERE reservation_id = ?').get(id);
      const next = rows.f > 0 && rows.f >= rows.c ? 'refunded' : rows.f > 0 ? 'partially_refunded' : 'paid';
      db.prepare('UPDATE reservations SET online_payment_status = ? WHERE id = ? AND organization_id = ?').run(next, id, organizationId);
    }
    recordHistory({ organizationId, reservationId: id, userId: actorUserId, action: 'cancelled_money_retained',
      meta: { amount: cents(r.amount_paid || 0) / 100, reason: text.slice(0, 300) } });
    return describe(load(organizationId, id));
  }).immediate();
}

// Para o painel e o sino: reservas canceladas com dinheiro por tratar e
// pagamentos online a rever (também de reservas ativas).
function attention(organizationId) {
  const base = `SELECT r.id, r.check_in, r.check_out, r.amount_paid, r.total_amount, r.status, r.online_payment_status, g.name AS guest_name, a.name AS accommodation_name
    FROM reservations r JOIN guests g ON g.id = r.guest_id AND g.organization_id = r.organization_id
    JOIN accommodations a ON a.id = r.accommodation_id AND a.organization_id = r.organization_id WHERE r.organization_id = ?`;
  const cancelledWithMoney = db.prepare(`${base} AND r.status = 'cancelada' AND COALESCE(r.amount_paid, 0) > 0.004 AND r.money_resolution IS NULL
    AND (r.policy_cancellation_json IS NULL OR r.online_payment_status = 'review_required') ORDER BY r.check_in LIMIT 20`).all(organizationId);
  const paymentReview = db.prepare(`${base} AND r.online_payment_status = 'review_required' AND r.status != 'cancelada' ORDER BY r.check_in LIMIT 20`).all(organizationId);
  return { cancelledWithMoney, paymentReview };
}

module.exports = { isPending, describe, refund, retain, attention };
