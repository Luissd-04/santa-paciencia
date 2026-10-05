const { randomUUID, createHash } = require('crypto');
const { db } = require('../config/database');
const { getStripe, stripeConfig, stripeEnabled } = require('./stripeClient');
const { configuredOrigin } = require('./publicOrigin');
const { activeCheckout } = require('./stripePaymentGuards');
const { ensureLegacyPayment, ledgerTotal } = require('./paymentLedger');
const { getPaymentStatus, localDateIso } = require('./reservationRules');
const { findConflict } = require('./reservationAvailability');
const { recordHistory } = require('./reservationHistoryService');

const cents = value => Math.round(Number(value) * 100);
const objectId = value => typeof value === 'string' ? value : value?.id;
const fail = (message, status = 409) => { throw Object.assign(new Error(message), { status }); };
const SUPPORTED_EVENTS = new Set([
  'checkout.session.completed', 'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed', 'checkout.session.expired',
  'payment_intent.succeeded', 'payment_intent.payment_failed', 'payment_intent.canceled',
  'payment_intent.processing', 'charge.refunded', 'refund.created', 'refund.updated', 'refund.failed',
]);
function snapshot(r) {
  return createHash('sha256').update(JSON.stringify([
    r.organization_id, r.guest_id, r.accommodation_id, r.accommodations_data,
    r.check_in, r.check_out, r.num_guests, cents(r.total_amount),
  ])).digest('hex');
}
function lookup(token) {
  if (!/^[a-f0-9]{64}$/i.test(String(token || ''))) fail('Reserva não encontrada.', 404);
  const r = db.prepare(`SELECT r.*, g.name AS guest_name, g.email AS guest_email,
      a.name AS accommodation_name FROM reservations r
    JOIN guests g ON g.id=r.guest_id AND g.organization_id=r.organization_id
    JOIN accommodations a ON a.id=r.accommodation_id AND a.organization_id=r.organization_id
    WHERE r.public_token=?`).get(token);
  if (!r) fail('Reserva não encontrada.', 404);
  return r;
}
function payable(r) {
  return stripeEnabled(r.organization_id) && ['aguardar_pagamento', 'confirmada', 'pre_checkin'].includes(r.status)
    && r.payment_status !== 'reembolsado' && !['refunded', 'partially_refunded', 'review_required'].includes(r.online_payment_status)
    && r.check_out >= localDateIso()
    && cents(r.total_amount) - cents(r.amount_paid || 0) >= 50;
}
function paymentSummary(r) {
  const attempt = activeCheckout(r.id);
  const active = attempt && Boolean(attempt.livemode) === stripeConfig().livemode ? attempt : null;
  return {
    available: payable(r), test_mode: !stripeConfig().livemode,
    status: r.online_payment_status || null,
    processing: active?.state === 'processing',
    amount_due: Math.max(0, cents(r.total_amount) - cents(r.amount_paid || 0)) / 100,
  };
}

function activeCheckoutForMode(reservationId) {
  const attempt = activeCheckout(reservationId);
  if (!attempt || Boolean(attempt.livemode) === stripeConfig().livemode) return attempt;
  if (attempt.livemode) fail('Existe um pagamento real em curso. Aguarde a confirmação antes de mudar o ambiente Stripe.');
  // Ao promover Test para Live, uma sessão de teste aberta não deve bloquear a
  // cobrança real. Não é possível nem necessário expirá-la com a chave live.
  db.transaction(() => {
    db.prepare("UPDATE stripe_payment_attempts SET state='cancelled', updated_at=datetime('now') WHERE id=? AND livemode=0")
      .run(attempt.id);
    db.prepare(`UPDATE reservations SET online_payment_status=NULL, stripe_checkout_session_id=NULL,
      updated_at=datetime('now') WHERE id=? AND stripe_checkout_session_id=?`)
      .run(attempt.reservation_id, attempt.checkout_session_id);
  }).immediate();
}

// Persist the exact request before contacting Stripe. Retries (including after
// a timeout or restart) use the same parameters and the same idempotency key.
async function createCheckout(token) {
  const stripe = getStripe();
  let r = lookup(token);
  if (!payable(r)) fail('Esta reserva não está disponível para pagamento online.');
  let attempt = activeCheckoutForMode(r.id);
  if (attempt?.checkout_session_id) {
    await reconcileAttempt(attempt, stripe);
    r = lookup(token);
    if (!payable(r)) fail('O pagamento já foi registado ou a reserva deixou de estar disponível.');
  }
  attempt = db.transaction(() => {
    r = lookup(token);
    if (!payable(r)) fail('Esta reserva não está disponível para pagamento online.');
    const active = activeCheckoutForMode(r.id);
    if (active) {
      if (active.state === 'processing') fail('O pagamento está a ser processado. Aguarde a confirmação.');
      if (active.snapshot !== snapshot(r)) fail('A reserva foi alterada. Contacte o alojamento.');
      return active;
    }
    if (findConflict(r.organization_id, r.accommodation_id, r.check_in, r.check_out, r.id)) fail('O alojamento já não está disponível. Contacte o alojamento.');
    ensureLegacyPayment(r);
    const amount = cents(r.total_amount) - cents(ledgerTotal(r.id, r.organization_id));
    if (!Number.isSafeInteger(amount) || amount < 50 || amount > 99999999) fail('Montante inválido para pagamento online.');
    let guest = {};
    try { guest = JSON.parse(r.guest_snapshot || '{}'); } catch { /* legacy reservation */ }
    const email = guest.email || r.guest_email;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '')) fail('A reserva não tem um email válido. Contacte o alojamento.');
    const id = randomUUID();
    const metadata = { integration: 'santa_paciencia', attempt_id: id, booking_id: r.id,
      organization_id: r.organization_id, guest_id: r.guest_id, check_in: r.check_in, check_out: r.check_out };
    const returnUrl = `${configuredOrigin()}/reserva/${r.public_token}`;
    const request = {
      mode: 'payment', locale: 'pt', client_reference_id: r.id, customer_email: email,
      metadata, payment_intent_data: { metadata, description: `Reserva ${r.id}` },
      success_url: `${returnUrl}?payment=return`, cancel_url: `${returnUrl}?payment=cancelled`,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      line_items: [{ quantity: 1, price_data: { currency: 'eur', unit_amount: amount,
        product_data: { name: `Reserva ${r.id} — ${r.accommodation_name}`,
          description: `${r.check_in} a ${r.check_out}` } } }],
      // Omitting payment_method_types enables methods configured in Dashboard,
      // including eligible wallets and MB WAY. No card data touches our server.
    };
    db.prepare(`INSERT INTO stripe_payment_attempts
      (id,reservation_id,organization_id,amount_cents,livemode,state,snapshot,request_json)
      VALUES (?,?,?,?,?,'creating',?,?)`).run(id, r.id, r.organization_id, amount,
        Number(stripeConfig().livemode), snapshot(r), JSON.stringify(request));
    db.prepare("UPDATE reservations SET online_payment_status='pending', payment_amount=?, payment_currency='EUR' WHERE id=?")
      .run(amount / 100, r.id);
    return activeCheckout(r.id);
  }).immediate();

  let session;
  if (attempt.checkout_session_id) {
    session = await stripe.checkout.sessions.retrieve(attempt.checkout_session_id);
  } else {
    // Never reuse an uncertain create beyond Stripe's idempotency retention.
    if (Date.now() - Date.parse(attempt.created_at + 'Z') > 23 * 3600000) fail('É necessário reconciliar esta sessão com a Stripe. Contacte o alojamento.');
    session = await createStripeSession(attempt, stripe);
    bindSession(attempt, session);
  }
  if (session.status !== 'open' || !session.url) fail('A sessão terminou. Atualize a página para consultar o pagamento.');
  const url = new URL(session.url);
  if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com') fail('URL de pagamento inválido.', 502);
  return { url: session.url };
}

async function createStripeSession(attempt, stripe) {
  try {
    return await stripe.checkout.sessions.create(JSON.parse(attempt.request_json), { idempotencyKey: `sp-checkout-${attempt.id}` });
  } catch (error) {
    // A definitive validation rejection created no session. Network/server
    // errors remain pending so an uncertain charge is never retried as new.
    if (error.type === 'StripeInvalidRequestError' && !['idempotency_key_in_use', 'lock_timeout'].includes(error.code)) {
      db.prepare("UPDATE stripe_payment_attempts SET state='cancelled', updated_at=datetime('now') WHERE id=? AND state='creating' AND checkout_session_id IS NULL").run(attempt.id);
      db.prepare("UPDATE reservations SET online_payment_status='failed' WHERE id=? AND NOT EXISTS (SELECT 1 FROM stripe_payment_attempts WHERE reservation_id=? AND state IN ('creating','open','processing'))")
        .run(attempt.reservation_id, attempt.reservation_id);
    }
    throw error;
  }
}

function validateSession(attempt, session) {
  const m = session.metadata || {};
  const expectedLivemode = stripeConfig().livemode;
  if (Boolean(attempt.livemode) !== expectedLivemode || session.livemode !== expectedLivemode
    || m.integration !== 'santa_paciencia' || m.attempt_id !== attempt.id
    || m.booking_id !== attempt.reservation_id || m.organization_id !== attempt.organization_id
    || session.client_reference_id !== attempt.reservation_id
    || session.amount_total !== attempt.amount_cents || session.currency !== attempt.currency
    || (attempt.checkout_session_id && session.id !== attempt.checkout_session_id)) {
    fail('Inconsistência na associação do pagamento.', 409);
  }
}
function bindSession(attempt, session) {
  validateSession(attempt, session);
  db.transaction(() => {
    db.prepare(`UPDATE stripe_payment_attempts SET checkout_session_id=?,
      state=CASE WHEN state='creating' THEN 'open' ELSE state END, updated_at=datetime('now') WHERE id=?`)
      .run(session.id, attempt.id);
    db.prepare(`UPDATE reservations SET stripe_checkout_session_id=? WHERE id=? AND organization_id=?
      AND NOT EXISTS (SELECT 1 FROM stripe_payment_attempts WHERE reservation_id=? AND id!=? AND state IN ('creating','open','processing'))`)
      .run(session.id, attempt.reservation_id, attempt.organization_id, attempt.reservation_id, attempt.id);
  }).immediate();
}

async function canonicalPayment(attempt, stripe) {
  const session = await stripe.checkout.sessions.retrieve(attempt.checkout_session_id, { expand: ['payment_intent.latest_charge'] });
  validateSession(attempt, session);
  let pi = session.payment_intent;
  if (typeof pi === 'string') pi = await stripe.paymentIntents.retrieve(pi, { expand: ['latest_charge'] });
  if (pi) {
    const m = pi.metadata || {};
    if (pi.livemode !== stripeConfig().livemode || pi.amount !== attempt.amount_cents || pi.currency !== attempt.currency
      || m.attempt_id !== attempt.id || m.booking_id !== attempt.reservation_id || m.organization_id !== attempt.organization_id
      || (attempt.payment_intent_id && attempt.payment_intent_id !== pi.id)) fail('PaymentIntent não corresponde à reserva.');
  }
  let refunded = 0;
  if (pi?.status === 'succeeded') {
    if (pi.amount_received !== attempt.amount_cents) fail('O montante recebido não corresponde à reserva.');
    // Only completed refunds change the ledger; pending/failed refunds do not.
    for await (const refund of stripe.refunds.list({ payment_intent: pi.id, limit: 100 })) {
      if (refund.status === 'succeeded') refunded += refund.amount;
    }
    if (refunded > attempt.amount_cents) fail('Reembolso superior ao pagamento.');
  }
  return { session, pi, refunded };
}

function applyPayment(attempt, canonical, event) {
  return db.transaction(() => {
    if (event && db.prepare('SELECT 1 FROM stripe_webhook_events WHERE id=?').get(event.id)) return { duplicate: true };
    attempt = db.prepare('SELECT * FROM stripe_payment_attempts WHERE id=?').get(attempt.id);
    const r = db.prepare('SELECT * FROM reservations WHERE id=? AND organization_id=?').get(attempt.reservation_id, attempt.organization_id);
    const { session, pi, refunded } = canonical;
    let state = attempt.state;
    let online = r.online_payment_status;
    let captured = attempt.captured_cents;
    let returned = attempt.refunded_cents;
    if (pi?.status === 'succeeded') {
      state = 'paid';
      ensureLegacyPayment(r);
      const insert = db.prepare(`INSERT INTO reservation_payments
        (id,reservation_id,organization_id,amount,method,payment_date,notes) VALUES (?,?,?,?,?,date('now'),?)`);
      if (!captured) {
        insert.run(`stripe-payment-${attempt.id}`, r.id, r.organization_id, attempt.amount_cents / 100, 'Stripe', 'Pagamento online confirmado pela Stripe');
        captured = attempt.amount_cents;
      }
      if (refunded > returned) {
        insert.run(`stripe-refund-${attempt.id}-${refunded}`, r.id, r.organization_id, -(refunded - returned) / 100, 'Stripe', 'Reembolso confirmado pela Stripe');
        returned = refunded;
      }
      const paid = ledgerTotal(r.id, r.organization_id);
      const review = r.status === 'cancelada' || snapshot(r) !== attempt.snapshot;
      online = review ? 'review_required' : returned === captured ? 'refunded' : returned > 0 ? 'partially_refunded' : 'paid';
      const paymentStatus = returned > 0 && cents(paid) === 0 ? 'reembolsado' : getPaymentStatus(paid, r.total_amount, 'pendente');
      const status = !review && paymentStatus === 'confirmado' && ['pendente','pre_reserva','aguardar_pagamento'].includes(r.status) ? 'confirmada' : r.status;
      db.prepare(`UPDATE reservations SET amount_paid=?, payment_status=?, status=?,
        paid_at=COALESCE(paid_at,datetime('now')), payment_date=COALESCE(payment_date,date('now')),
        payment_method='Stripe', updated_at=datetime('now') WHERE id=? AND organization_id=?`)
        .run(paid, paymentStatus, status, r.id, r.organization_id);
    } else if (!captured && (!event || event.created >= attempt.last_event_created)) {
      if (session.status === 'expired') { state = 'expired'; online = 'expired'; }
      else if (pi?.status === 'canceled') { state = 'cancelled'; online = 'cancelled'; }
      else if (pi?.status === 'requires_payment_method' && pi.last_payment_error) {
        state = session.status === 'complete' ? 'cancelled' : 'open'; online = 'failed';
      }
      else if (pi?.status === 'processing' || session.status === 'complete') { state = 'processing'; online = 'processing'; }
      else { state = 'open'; online = pi?.last_payment_error ? 'failed' : 'pending'; }
      if (event?.type === 'checkout.session.async_payment_failed' && session.payment_status !== 'paid') {
        state = 'cancelled'; online = 'failed';
      }
    }
    if (['expired', 'cancelled'].includes(attempt.state) && ['open', 'processing'].includes(state)) {
      state = attempt.state;
      online = r.online_payment_status;
    }
    db.prepare(`UPDATE stripe_payment_attempts SET state=?, payment_intent_id=COALESCE(?,payment_intent_id),
      captured_cents=?, refunded_cents=?, last_event_created=MAX(last_event_created,?), updated_at=datetime('now') WHERE id=?`)
      .run(state, pi?.id || null, captured, returned, event?.created || 0, attempt.id);
    // Late events from a previous attempt must not overwrite the active one.
    if (r.stripe_checkout_session_id === session.id || captured > attempt.captured_cents || returned > attempt.refunded_cents) {
      db.prepare(`UPDATE reservations SET online_payment_status=?, stripe_payment_intent_id=COALESCE(?,stripe_payment_intent_id),
        updated_at=datetime('now') WHERE id=? AND organization_id=?`).run(online, pi?.id || null, r.id, r.organization_id);
    }
    if (event) db.prepare('INSERT INTO stripe_webhook_events(id,type) VALUES(?,?)').run(event.id, event.type);
    if (captured !== attempt.captured_cents || returned !== attempt.refunded_cents || state !== attempt.state || online !== r.online_payment_status) {
      recordHistory({ organizationId: r.organization_id, reservationId: r.id, action: 'stripe_payment',
        meta: { status: online, amount: captured / 100, refunded: returned / 100, event_id: event?.id || null } });
      console.info(JSON.stringify({ event: 'stripe_payment_updated', bookingId: r.id, status: online }));
    }
    return { reservationId: r.id, organizationId: r.organization_id };
  }).immediate();
}
async function reconcileAttempt(attempt, stripe = getStripe(), event) {
  if (!attempt.checkout_session_id) return;
  const result = applyPayment(attempt, await canonicalPayment(attempt, stripe), event);
  if (result?.reservationId) {
    // Financial state and deduplication are already committed. Operational work
    // must not roll back a captured payment; the normal scheduler also syncs it.
    try {
      const r = db.prepare('SELECT * FROM reservations WHERE id=?').get(result.reservationId);
      require('./operationalTasksService').syncReservationOperationalTasks(r);
    } catch { console.warn(JSON.stringify({ event: 'stripe_operational_sync_failed', bookingId: result.reservationId })); }
  }
  return result;
}

async function processWebhook(event) {
  if (event.livemode !== stripeConfig().livemode || event.account) fail('O evento não pertence ao ambiente Stripe configurado.', 400);
  if (!SUPPORTED_EVENTS.has(event.type)) return { ignored: true };
  if (db.prepare('SELECT 1 FROM stripe_webhook_events WHERE id=?').get(event.id)) return { duplicate: true };
  const stripe = getStripe();
  const object = event.data.object;
  let metadata = object.metadata || {};
  let attempt;
  if (object.object === 'checkout.session') {
    attempt = db.prepare('SELECT * FROM stripe_payment_attempts WHERE checkout_session_id=?').get(object.id);
  } else {
    const piId = object.object === 'payment_intent' ? object.id : objectId(object.payment_intent);
    if (piId) {
      attempt = db.prepare('SELECT * FROM stripe_payment_attempts WHERE payment_intent_id=?').get(piId);
      if (!attempt && metadata.integration !== 'santa_paciencia') metadata = (await stripe.paymentIntents.retrieve(piId)).metadata || {};
    }
  }
  if (!attempt && metadata.integration === 'santa_paciencia') {
    attempt = db.prepare('SELECT * FROM stripe_payment_attempts WHERE id=?').get(metadata.attempt_id);
    if (!attempt) fail('Tentativa de pagamento ainda não encontrada.', 503);
  }
  if (!attempt) return { ignored: true };
  if (attempt.organization_id !== stripeConfig().organizationId) fail('Organização do pagamento inválida.');
  if (Boolean(attempt.livemode) !== stripeConfig().livemode) fail('Ambiente do pagamento inválido.');
  if (!attempt.checkout_session_id) {
    // A webhook can beat the response to checkout.sessions.create.
    if (object.object !== 'checkout.session') fail('Sessão ainda não associada. Repetir o evento.', 503);
    bindSession(attempt, object);
    attempt = db.prepare('SELECT * FROM stripe_payment_attempts WHERE id=?').get(attempt.id);
  }
  return reconcileAttempt(attempt, stripe, event);
}

async function closeOpenCheckout(reservationId) {
  const attempt = activeCheckoutForMode(reservationId);
  if (!attempt) return;
  if (!attempt.checkout_session_id) fail('A criação do pagamento está em curso. Tente novamente dentro de instantes.');
  const stripe = getStripe();
  await reconcileAttempt(attempt, stripe);
  const active = activeCheckoutForMode(reservationId);
  if (!active) return;
  if (active.state === 'processing') fail('O pagamento está a ser processado. Aguarde a confirmação antes de alterar a reserva.');
  await stripe.checkout.sessions.expire(active.checkout_session_id);
  await reconcileAttempt(active, stripe);
}
async function reconcileActiveCheckouts() {
  if (!stripeConfig().ready) return;
  const rows = db.prepare("SELECT * FROM stripe_payment_attempts WHERE state IN ('creating','open','processing') ORDER BY updated_at LIMIT 100").all();
  for (let attempt of rows) {
    if (attempt.organization_id !== stripeConfig().organizationId) continue;
    if (Boolean(attempt.livemode) !== stripeConfig().livemode) continue;
    try {
      if (!attempt.checkout_session_id) {
        if (Date.now() - Date.parse(attempt.created_at + 'Z') > 23 * 3600000) continue;
        const session = await createStripeSession(attempt, getStripe());
        bindSession(attempt, session);
        attempt = db.prepare('SELECT * FROM stripe_payment_attempts WHERE id=?').get(attempt.id);
      }
      await reconcileAttempt(attempt);
    } catch (error) {
      console.warn(JSON.stringify({ event: 'stripe_reconcile_failed', attemptId: attempt.id, code: error.code || error.type || 'reconciliation_error' }));
    }
  }
}
module.exports = { createCheckout, processWebhook, paymentSummary, closeOpenCheckout, reconcileActiveCheckouts, SUPPORTED_EVENTS };
