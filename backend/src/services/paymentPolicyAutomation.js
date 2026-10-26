const { randomUUID } = require('crypto');
const { db } = require('../config/database');
const policy = require('./paymentPolicy');
const payments = require('./stripePayments');
const { activeCheckout } = require('./stripePaymentGuards');
const { stripeConfig, stripeEnabled, getStripe } = require('./stripeClient');
const { withSchedulerLease } = require('./schedulerLease');
const { recordHistory } = require('./reservationHistoryService');
const fail = message => { throw Object.assign(new Error(message), { status: 409 }); };
const row = id => db.prepare('SELECT * FROM reservations WHERE id=?').get(id);

async function reconcileReservation(id) {
  const attempts = db.prepare("SELECT * FROM stripe_payment_attempts WHERE reservation_id=? AND state IN ('creating','open','processing','paid')").all(id);
  for (const a of attempts) {
    if (Boolean(a.livemode) !== stripeConfig().livemode) fail('Existem pagamentos de outro ambiente Stripe nesta reserva.');
    if (!a.checkout_session_id && !a.payment_intent_id) fail('Pagamento ainda em criação; tente novamente.');
    await payments.reconcileAttempt(a);
  }
}
function cancellationQuote(r, now = new Date()) {
  const plan = policy.planFor(r, now);
  if (!plan) fail('Esta reserva não tem uma política de cancelamento online.');
  const existing = r.policy_cancellation_json && JSON.parse(r.policy_cancellation_json);
  return { refundCents: existing ? existing.refundCents : plan.refundCents,
    refundPercent: existing ? existing.refundPercent : plan.refundPercent,
    paidCents: policy.cents(r.amount_paid || 0), key: policy.consentKey(r), state: existing?.state || null };
}
async function cancelByPolicy(id, { reason = 'guest', expectedRefundCents, key, userId = null } = {}) {
  let r = row(id);
  if (!r?.payment_policy_json) fail('Política de cancelamento indisponível.');
  if (r.policy_cancellation_json) { await processRefunds(id); return cancellationQuote(row(id)); }
  if (db.prepare('SELECT 1 FROM stripe_payment_attempts WHERE reservation_id=?').get(id) && !stripeEnabled(r.organization_id)) fail('Pagamentos online indisponíveis. Contacte o alojamento.');
  if (!policy.describe(r).canCancel) fail('Esta reserva já não pode ser cancelada online.');
  await reconcileReservation(id);
  await payments.closeOpenCheckout(id);
  r = row(id);
  const quote = cancellationQuote(r);
  if (reason !== 'nonpayment' && (key !== quote.key || expectedRefundCents !== quote.refundCents)) fail('Os valores foram atualizados. Reveja o reembolso antes de confirmar.');
  db.transaction(() => {
    r = row(id);
    if (r.policy_cancellation_json) return;
    const currentQuote = cancellationQuote(r);
    if (reason !== 'nonpayment' && (key !== currentQuote.key || expectedRefundCents !== currentQuote.refundCents)) fail('Os valores foram atualizados. Reveja o reembolso antes de confirmar.');
    if (activeCheckout(id)) fail('Existe um pagamento em curso.');
    if (reason === 'nonpayment' && policy.cents(r.amount_paid) >= policy.cents(r.total_amount)) return;
    let refundCents = reason === 'nonpayment' ? 0 : quote.refundCents;
    let remaining = refundCents;
    const items = [];
    for (const a of db.prepare("SELECT * FROM stripe_payment_attempts WHERE reservation_id=? AND state='paid' ORDER BY created_at DESC, id").all(id)) {
      const amount = Math.min(remaining, a.captured_cents - a.refunded_cents);
      if (amount <= 0) continue;
      items.push({ attemptId: a.id, paymentIntent: a.payment_intent_id, amount, key: `sp-policy-refund-${randomUUID()}`, createdAt: new Date().toISOString(), refundId: null, state: 'pending' });
      remaining -= amount;
    }
    const cancellation = { reason, refundCents, refundPercent: reason === 'nonpayment' ? 0 : quote.refundPercent,
      requestedAt: new Date().toISOString(), state: remaining ? 'manual_review' : items.length ? 'pending' : 'complete', manualCents: remaining, items };
    db.prepare("UPDATE reservations SET policy_cancellation_json=?, cancelled_previous_status=status, cancelled_previous_payment_status=payment_status, status='cancelada', updated_at=datetime('now') WHERE id=?")
      .run(JSON.stringify(cancellation), id);
    require('./voucherService').releaseVoucherIfUnpaid(r.organization_id, id);
    require('./calendarService').detachReservationEvent(r.organization_id, id);
    recordHistory({ organizationId: r.organization_id, reservationId: id, userId, action: 'policy_cancelled', meta: { reason, refund: refundCents / 100, refund_percent: cancellation.refundPercent } });
    require('./reservationEvents').emit('reservation.cancelled', { organizationId: r.organization_id, reservationId: id, actorUserId: userId, payload: { reason, policy: true } });
  }).immediate();
  r = row(id);
  if (r.status !== 'cancelada') return cancellationQuote(r);
  try { require('./operationalTasksService').syncReservationOperationalTasks(r); } catch { console.warn('Sincronização operacional pendente após cancelamento.'); }
  require('./calendarService').kickCalendarQueue(r.organization_id);
  await processRefunds(id);
  await sendNotice(row(id), 'cancelled');
  return cancellationQuote(row(id));
}
async function processRefunds(id) {
  const r = row(id);
  if (!r?.policy_cancellation_json || !stripeEnabled(r.organization_id)) return;
  const c = JSON.parse(r.policy_cancellation_json);
  if (c.state === 'complete') return;
  const stripe = getStripe();
  for (const item of c.items) {
    if (['succeeded','failed','review'].includes(item.state)) continue;
    const a = db.prepare('SELECT * FROM stripe_payment_attempts WHERE id=? AND reservation_id=?').get(item.attemptId, id);
    if (!a || Boolean(a.livemode) !== stripeConfig().livemode) fail('Ambiente do reembolso inválido.');
    // Beyond Stripe's retention, never repeat an uncertain refund as a new one.
    if (!item.refundId && Date.now() - Date.parse(item.createdAt) > 23 * 3600000) { item.state = 'review'; continue; }
    let refund;
    try {
      refund = item.refundId ? await stripe.refunds.retrieve(item.refundId)
        : await stripe.refunds.create({ payment_intent: item.paymentIntent, amount: item.amount, metadata: { policy_reservation_id: id } }, { idempotencyKey: item.key });
    } catch (error) {
      if (error.type === 'StripeInvalidRequestError' && !['idempotency_key_in_use', 'lock_timeout'].includes(error.code)) { item.state = 'review'; continue; }
      throw error;
    }
    item.refundId = refund.id;
    item.state = refund.status === 'succeeded' ? 'succeeded' : ['failed','canceled'].includes(refund.status) ? 'failed' : 'pending';
    db.prepare('UPDATE reservations SET policy_cancellation_json=? WHERE id=?').run(JSON.stringify(c), id);
    await payments.reconcileAttempt(a);
  }
  c.state = c.manualCents || c.items.some(i => ['failed','review'].includes(i.state)) ? 'manual_review'
    : c.items.every(i => i.state === 'succeeded') ? 'complete' : 'pending';
  db.prepare('UPDATE reservations SET policy_cancellation_json=? WHERE id=?').run(JSON.stringify(c), id);
}
async function sendNotice(r, kind) {
  const field = kind === 'cancelled' ? 'policy_cancel_notice_at' : 'balance_notice_sent_at';
  if (r[field]) return true;
  const guest = db.prepare('SELECT email FROM guests WHERE id=? AND organization_id=?').get(r.guest_id, r.organization_id);
  let snapshot = {}; try { snapshot = JSON.parse(r.guest_snapshot || '{}'); } catch {}
  const email = snapshot.email || guest?.email;
  if (!require('./emailAddress').isDeliverableEmail(email)) return false;
  require('./reservationSupport').ensurePublicToken(r);
  const url = `${require('./publicOrigin').configuredOrigin()}/reserva/${r.public_token}`;
  const esc = require('./emailComposer').escapeHtml;
  const plan = policy.planFor(r);
  const deadline = r.balance_deadline || new Date(Math.max(Date.parse(plan.deadline), Date.now() + policy.policyFor(r).graceHours * 3600000)).toISOString();
  const date = new Date(deadline).toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' });
  const money = ((policy.cents(r.total_amount) - policy.cents(r.amount_paid)) / 100).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' });
  const content = kind === 'cancelled'
    ? 'A sua reserva foi cancelada. Consulte o estado e o reembolso aplicável no link abaixo.'
    : `Falta concluir o pagamento de ${money}. Pague até ${date} (hora de Lisboa). Após este prazo, a reserva será cancelada sem devolução dos montantes já pagos. Se tentou pagar por cartão, poderá ser necessária uma nova autorização do banco.`;
  const sent = await require('./emailService').sendMail(r.organization_id, { to: email, subject: `${kind === 'cancelled' ? 'Cancelamento' : 'Pagamento do restante'} — Reserva ${r.id}`,
    html: `<p>${esc(content)}</p><p><a href="${esc(url)}">Consultar reserva e pagamento</a></p>` });
  if (!sent) return false;
  const current = row(r.id);
  if (!current || (kind === 'balance' && (current.policy_accepted_at !== r.policy_accepted_at
    || current.status === 'cancelada' || policy.consentKey(current) !== policy.consentKey(r)))) return false;
  db.prepare(`UPDATE reservations SET ${field}=?, balance_deadline=COALESCE(balance_deadline,?) WHERE id=?`)
    .run(new Date().toISOString(), deadline, r.id);
  return true;
}
async function runPolicyMaintenance() {
  if (!stripeConfig().ready) return;
  return withSchedulerLease(db, 'payment-policy', async assertLease => {
    const rows = db.prepare('SELECT * FROM reservations WHERE organization_id=? AND payment_policy_json IS NOT NULL ORDER BY updated_at')
      .all(stripeConfig().organizationId);
    for (let r of rows) {
      assertLease();
      try {
        if (r.policy_cancellation_json) { await processRefunds(r.id); await sendNotice(row(r.id), 'cancelled'); continue; }
        if (!r.policy_accepted_at || !['confirmada','pre_checkin'].includes(r.status) || r.check_in < policy.localDay()) continue;
        let plan = policy.planFor(r);
        if (!plan.balanceCents || Date.now() < Date.parse(plan.dueAt) || policy.cents(r.total_amount) - policy.cents(r.amount_paid) < 50) continue;
        await reconcileReservation(r.id);
        r = row(r.id);
        if (policy.cents(r.total_amount) - policy.cents(r.amount_paid) < 50) continue;
        // Refunds or a changed payment require staff review, not another
        // collection notice with a link that the guest cannot use.
        if (!payments.paymentSummary(r).available) continue;
        await payments.chargeBalance(r.id);
        r = row(r.id);
        if (policy.cents(r.total_amount) - policy.cents(r.amount_paid) < 50) continue;
        const active = activeCheckout(r.id);
        if (active?.state === 'processing' || active?.state === 'creating') continue;
        if (active?.kind === 'automatic') await payments.closeOpenCheckout(r.id);
        r = row(r.id);
        if (policy.cents(r.total_amount) - policy.cents(r.amount_paid) < 50) continue;
        if (!await sendNotice(r, 'balance')) continue;
        r = row(r.id);
        if (r.balance_deadline && Date.now() >= Date.parse(r.balance_deadline)) await cancelByPolicy(r.id, { reason: 'nonpayment' });
      } catch (error) {
        // Network failures and pending payments never become automatic forfeitures.
        console.warn(JSON.stringify({ event: 'policy_maintenance_pending', bookingId: r.id, code: error.code || error.type || 'review' }));
      }
    }
  });
}
module.exports = { cancellationQuote, cancelByPolicy, processRefunds, runPolicyMaintenance };
