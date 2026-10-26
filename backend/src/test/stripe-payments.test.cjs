const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-stripe-'));
const originalCwd = process.cwd();
process.chdir(temp);
process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.EMAIL_ENABLED = 'false';
process.env.PUBLIC_APP_URL = 'http://localhost:3001';
process.env.STRIPE_MODE = 'test';
process.env.STRIPE_SECRET_KEY = 'sk_test_synthetic';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_synthetic';
process.env.STRIPE_ORGANIZATION_ID = 'stripe-org';
const { db, initDatabase } = require('../config/database');
initDatabase();
const service = require('../services/stripePayments');
const { getStripe, stripeConfig, stripeEnabled } = require('../services/stripeClient');
const { activeCheckout } = require('../services/stripePaymentGuards');
const controller = require('../controllers/stripePaymentsController');
const sdk = getStripe();
const sessions = new Map();
const requests = new Map();
const refunds = new Map();
let createCalls;
const autoIntents = new Map();
const refundRequests = new Map();
let autoFailure = false;
sdk.paymentIntents.create = async (params, options) => {
  if (!autoIntents.has(options.idempotencyKey)) autoIntents.set(options.idempotencyKey, {
    id: 'pi_auto_' + params.metadata.attempt_id, object: 'payment_intent', ...params, livemode: false,
    status: autoFailure ? 'requires_payment_method' : 'succeeded', amount_received: autoFailure ? 0 : params.amount,
    last_payment_error: autoFailure ? { code: 'card_declined' } : null,
  });
  const pi = structuredClone(autoIntents.get(options.idempotencyKey));
  if (autoFailure) throw Object.assign(new Error('Declined'), { type: 'StripeCardError', payment_intent: pi });
  return pi;
};
sdk.paymentIntents.cancel = async id => {
  const pi = [...autoIntents.values()].find(p => p.id === id);
  pi.status = 'canceled'; return structuredClone(pi);
};
sdk.refunds.create = async (params, options) => {
  if (!refundRequests.has(options.idempotencyKey)) {
    const refund = { id: 're_' + refundRequests.size, status: 'succeeded', ...params };
    refundRequests.set(options.idempotencyKey, refund);
    refunds.set(params.payment_intent, [...refunds.get(params.payment_intent) || [], refund]);
  }
  return structuredClone(refundRequests.get(options.idempotencyKey));
};
sdk.refunds.retrieve = async id => structuredClone([...refundRequests.values()].find(r => r.id === id));
sdk.checkout.sessions.create = async (params, options) => {
  createCalls++;
  if (requests.has(options.idempotencyKey)) {
    assert.deepEqual(requests.get(options.idempotencyKey).params, params);
    return structuredClone(requests.get(options.idempotencyKey).session);
  }
  const session = { id: 'cs_test_' + params.metadata.attempt_id, object: 'checkout.session',
    livemode: false, status: 'open', payment_status: 'unpaid', payment_intent: null,
    metadata: params.metadata, client_reference_id: params.client_reference_id,
    amount_total: params.line_items[0].price_data.unit_amount, currency: 'eur', url: 'https://checkout.stripe.com/c/pay/synthetic' };
  sessions.set(session.id, session);
  requests.set(options.idempotencyKey, { params, session });
  return structuredClone(session);
};
sdk.checkout.sessions.retrieve = async id => structuredClone(sessions.get(id));
sdk.checkout.sessions.expire = async id => { sessions.get(id).status = 'expired'; return structuredClone(sessions.get(id)); };
sdk.paymentIntents.retrieve = async id => structuredClone([...sessions.values()].find(s => s.payment_intent?.id === id)?.payment_intent || [...autoIntents.values()].find(p => p.id === id));
sdk.refunds.list = ({ payment_intent }) => (async function* () { yield* refunds.get(payment_intent) || []; })();
require('../services/operationalTasksService').syncReservationOperationalTasks = () => {};
require('../services/calendarService').deleteCalendarEvent = async () => {};

beforeEach(() => {
  db.exec(`DELETE FROM stripe_webhook_events; DELETE FROM stripe_payment_attempts;
    DELETE FROM reservation_payments; DELETE FROM reservation_history; DELETE FROM reservations;
    DELETE FROM guests; DELETE FROM accommodations; DELETE FROM organizations;
    INSERT INTO organizations(id,name,slug) VALUES ('stripe-org','Stripe Test','stripe-test'), ('other-org','Other','other');
    INSERT INTO guests(id,organization_id,name,email) VALUES ('guest','stripe-org','Synthetic Guest','guest@example.invalid');
    INSERT INTO accommodations(id,organization_id,name,type,price_per_night,max_guests)
      VALUES ('unit','stripe-org','Synthetic room','alojamento',100,2);`);
  sessions.clear(); requests.clear(); refunds.clear(); autoIntents.clear(); refundRequests.clear(); autoFailure = false; createCalls = 0;
  require('../services/emailService').sendMail = async () => ({ id: 'mail_synthetic' });
  // Os avisos da política usam os modelos; aqui o envio resume-se a sendMail.
  require('../services/emailService').sendTemplatedEmail = async (slug, guest, r) =>
    require('../services/emailService').sendMail(r.organization_id, { to: guest.email, subject: slug, html: '' });
});
after(() => { db.close(); process.chdir(originalCwd); fs.rmSync(temp, { recursive: true, force: true }); });
function booking(overrides = {}) {
  const r = { id: 'booking', organization_id: 'stripe-org', guest_id: 'guest', accommodation_id: 'unit',
    check_in: '2035-01-01', check_out: '2035-01-03', nights: 2, num_guests: 1, total_amount: 200,
    amount_paid: 0, status: 'aguardar_pagamento', channel: 'website', public_token: randomBytes(32).toString('hex'), ...overrides };
  db.prepare(`INSERT INTO reservations(${Object.keys(r).join(',')}) VALUES (${Object.keys(r).map(() => '?').join(',')})`).run(...Object.values(r));
  return r;
}
const row = () => db.prepare("SELECT * FROM reservations WHERE id='booking'").get();
function event(object, type = 'checkout.session.completed', id = randomBytes(12).toString('hex'), created = 100) {
  return { id: 'evt_' + id, type, livemode: false, created, data: { object: structuredClone(object) } };
}
function succeed(session) {
  session.status = 'complete'; session.payment_status = 'paid';
  session.payment_intent = { id: session.payment_intent?.id || 'pi_' + session.metadata.attempt_id, object: 'payment_intent',
    livemode: false, status: 'succeeded', amount: session.amount_total, amount_received: session.amount_total,
    currency: 'eur', metadata: session.metadata };
}
async function start(r = booking()) { await service.createCheckout(r.public_token); return [...sessions.values()][0]; }
const resMock = () => ({ statusCode: 200, set() {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });

test('checkout ignora montantes do cliente, usa EUR e metadata da reserva', async () => {
  const r = booking({ amount_paid: 25 });
  const res = resMock();
  await controller.checkout({ params: { token: r.public_token }, body: { amount: 1, currency: 'usd', guest_id: 'attacker' } }, res, error => { throw error; });
  assert.equal(res.statusCode, 200);
  const { params } = [...requests.values()][0];
  assert.equal(params.line_items[0].price_data.unit_amount, 17500);
  assert.equal(params.line_items[0].price_data.currency, 'eur');
  assert.equal(params.metadata.booking_id, r.id);
  assert.equal(params.payment_intent_data.metadata.guest_id, 'guest');
  assert.equal(params.customer_email, 'guest@example.invalid');
  assert.equal(params.payment_method_types, undefined);
  assert.ok(params.success_url.startsWith(process.env.PUBLIC_APP_URL));
  assert.equal(db.prepare('SELECT livemode FROM stripe_payment_attempts').get().livemode, 0);
});

test('pedidos simultâneos e retries usam uma só sessão e chave de idempotência', async () => {
  const r = booking();
  await Promise.all([service.createCheckout(r.public_token), service.createCheckout(r.public_token)]);
  await service.createCheckout(r.public_token);
  assert.equal(requests.size, 1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM stripe_payment_attempts').get().n, 1);
  assert.ok(createCalls >= 1);
});

test('rejeita token inválido, reservas canceladas, pendentes de aprovação e liquidadas', async () => {
  await assert.rejects(service.createCheckout('booking'), { status: 404 });
  const r = booking({ status: 'pendente' });
  await assert.rejects(service.createCheckout(r.public_token), { status: 409 });
  db.prepare("UPDATE reservations SET status='cancelada'").run();
  await assert.rejects(service.createCheckout(r.public_token), { status: 409 });
  db.prepare("UPDATE reservations SET status='confirmada', amount_paid=200").run();
  await assert.rejects(service.createCheckout(r.public_token), { status: 409 });
  assert.equal(requests.size, 0);
});

test('modo Stripe exige ambiente, chave e organização correspondentes', async () => {
  const original = { key: process.env.STRIPE_SECRET_KEY, secret: process.env.STRIPE_WEBHOOK_SECRET,
    mode: process.env.STRIPE_MODE, nodeEnv: process.env.NODE_ENV, publicUrl: process.env.PUBLIC_APP_URL };
  try {
    assert.equal(stripeEnabled('other-org'), false);
    process.env.STRIPE_SECRET_KEY = 'sk_live_synthetic';
    assert.equal(stripeEnabled('stripe-org'), false);
    process.env.STRIPE_SECRET_KEY = original.key;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    assert.equal(stripeEnabled('stripe-org'), false);
    process.env.STRIPE_WEBHOOK_SECRET = original.secret;
    process.env.STRIPE_MODE = 'live';
    process.env.STRIPE_SECRET_KEY = 'sk_live_synthetic';
    assert.equal(stripeEnabled('stripe-org'), false);
    process.env.NODE_ENV = 'production';
    process.env.PUBLIC_APP_URL = 'https://example.invalid';
    assert.equal(stripeEnabled('stripe-org'), true);
    assert.equal(stripeConfig().livemode, true);
    assert.equal(service.paymentSummary({ id: 'none', organization_id: 'stripe-org', status: 'aguardar_pagamento',
      payment_status: 'pendente', check_out: '2035-01-03', total_amount: 1, amount_paid: 0 }).test_mode, false);
    await assert.rejects(service.processWebhook({ livemode: false }), { status: 400 });
    process.env.STRIPE_MODE = 'invalid';
    assert.equal(stripeEnabled('stripe-org'), false);
  } finally {
    process.env.STRIPE_MODE = original.mode;
    process.env.STRIPE_SECRET_KEY = original.key;
    process.env.STRIPE_WEBHOOK_SECRET = original.secret;
    process.env.NODE_ENV = original.nodeEnv;
    process.env.PUBLIC_APP_URL = original.publicUrl;
  }
});

test('pagamento confirmado atualiza reserva e ledger exatamente uma vez', async () => {
  const session = await start(); succeed(session);
  const e = event(session);
  await service.processWebhook(e);
  await service.processWebhook(e);
  await service.processWebhook(event(session.payment_intent, 'payment_intent.succeeded'));
  assert.equal(row().amount_paid, 200);
  assert.equal(row().payment_status, 'confirmado');
  assert.equal(row().status, 'confirmada');
  assert.equal(row().online_payment_status, 'paid');
  assert.ok(row().paid_at);
  assert.equal(row().stripe_payment_intent_id, session.payment_intent.id);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM reservation_payments').get().n, 1);
  // Um único acontecimento de pagamento, mesmo com eventos repetidos.
  assert.deepEqual(db.prepare('SELECT type, payload FROM reservation_events').all().map(e => [e.type, JSON.parse(e.payload)]),
    [['payment.received', { amount: 200, source: 'stripe' }]]);
});

test('webhook anterior à resposta de criação associa a sessão por metadata', async () => {
  const session = await start();
  db.prepare("UPDATE stripe_payment_attempts SET checkout_session_id=NULL, state='creating'").run();
  succeed(session);
  await service.processWebhook(event(session));
  assert.equal(row().amount_paid, 200);
  assert.equal(row().stripe_checkout_session_id, session.id);
});

test('completed sem pagamento mantém reserva por confirmar e impede segundo checkout', async () => {
  const r = booking(); const session = await start(r);
  session.status = 'complete';
  session.payment_intent = { id: 'pi_processing', object: 'payment_intent', status: 'processing', livemode: false,
    amount: 20000, currency: 'eur', metadata: session.metadata };
  await service.processWebhook(event(session));
  assert.equal(row().status, 'aguardar_pagamento');
  assert.equal(row().amount_paid, 0);
  assert.equal(row().online_payment_status, 'processing');
  await assert.rejects(service.createCheckout(r.public_token), { status: 409 });
  await assert.rejects(service.closeOpenCheckout(r.id), { status: 409 });
  succeed(session);
  await service.processWebhook(event(session, 'checkout.session.async_payment_succeeded'));
  assert.equal(row().status, 'confirmada');
});

test('falha de cartão permite retomar a sessão, evento antigo não reverte pagamento', async () => {
  const r = booking(); const session = await start(r);
  session.payment_intent = { id: 'pi_failed', object: 'payment_intent', status: 'requires_payment_method', livemode: false,
    amount: 20000, currency: 'eur', metadata: session.metadata, last_payment_error: { code: 'card_declined' } };
  const failed = event(session.payment_intent, 'payment_intent.payment_failed', 'old', 50);
  await service.processWebhook(failed);
  assert.equal(row().online_payment_status, 'failed');
  await service.createCheckout(r.public_token);
  assert.equal(requests.size, 1);
  const piId = session.payment_intent.id;
  succeed(session); session.payment_intent.id = piId;
  await service.processWebhook(event(session, 'checkout.session.completed', 'paid', 100));
  await service.processWebhook({ ...failed, id: 'evt_late_failure' });
  assert.equal(row().online_payment_status, 'paid');
  assert.equal(row().amount_paid, 200);
});

test('expiração permite nova tentativa; evento antigo não substitui a tentativa nova', async () => {
  const r = booking(); const session = await start(r);
  session.status = 'expired';
  await service.processWebhook(event(session, 'checkout.session.expired'));
  assert.equal(row().online_payment_status, 'expired');
  await service.createCheckout(r.public_token);
  assert.equal(requests.size, 2);
  const newId = row().stripe_checkout_session_id;
  await service.processWebhook(event(session, 'checkout.session.expired'));
  assert.equal(row().stripe_checkout_session_id, newId);
  assert.equal(row().online_payment_status, 'pending');
});

test('reembolsos parciais/completos, repetidos ou fora de ordem não duplicam movimentos', async () => {
  const session = await start(); succeed(session);
  const pi = session.payment_intent;
  refunds.set(pi.id, [{ id: 're_partial', amount: 5000, status: 'succeeded' }, { id: 're_pending', amount: 2000, status: 'pending' }]);
  // Refund can arrive before the success webhook.
  const refundEvent = event({ object: 'charge', id: 'ch_test', payment_intent: pi.id }, 'charge.refunded');
  await service.processWebhook(refundEvent);
  assert.equal(row().amount_paid, 150);
  assert.equal(row().payment_status, 'parcial');
  assert.equal(row().online_payment_status, 'partially_refunded');
  await service.processWebhook(event(session));
  assert.equal(row().amount_paid, 150);
  refunds.set(pi.id, [{ id: 're_full', amount: 20000, status: 'succeeded' }]);
  await service.processWebhook(event({ object: 'refund', payment_intent: pi.id }, 'refund.updated'));
  await service.processWebhook(refundEvent);
  assert.equal(row().amount_paid, 0);
  assert.equal(row().payment_status, 'reembolsado');
  assert.equal(row().online_payment_status, 'refunded');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM reservation_payments').get().n, 3);
});

test('montante/moeda/metadata inconsistentes e live mode não atualizam a reserva', async () => {
  const session = await start(); succeed(session);
  const originalAmount = session.amount_total;
  session.amount_total = 1;
  await assert.rejects(service.processWebhook(event(session)), { status: 409 });
  session.amount_total = originalAmount;
  session.currency = 'usd';
  await assert.rejects(service.processWebhook(event(session)), { status: 409 });
  session.currency = 'eur'; session.metadata.organization_id = 'other-org';
  await assert.rejects(service.processWebhook(event(session)), { status: 409 });
  await assert.rejects(service.processWebhook({ ...event(session), livemode: true }), { status: 400 });
  assert.equal(row().amount_paid, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM stripe_webhook_events').get().n, 0);
});

test('reserva cancelada ou alterada recebe o dinheiro no ledger sem reconfirmar estadia', async () => {
  const session = await start(); succeed(session);
  db.prepare("UPDATE reservations SET status='cancelada'").run();
  await service.processWebhook(event(session));
  assert.equal(row().amount_paid, 200);
  assert.equal(row().status, 'cancelada');
  assert.equal(row().online_payment_status, 'review_required');
});

test('erro transacional permite retry sem perder ou duplicar o pagamento', async () => {
  const session = await start(); succeed(session);
  db.exec("CREATE TRIGGER test_fail_payment BEFORE INSERT ON reservation_payments BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
  const e = event(session);
  await assert.rejects(service.processWebhook(e), /synthetic failure/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM stripe_webhook_events').get().n, 0);
  assert.equal(row().amount_paid, 0);
  db.exec('DROP TRIGGER test_fail_payment');
  await service.processWebhook(e);
  assert.equal(row().amount_paid, 200);
});

test('webhook valida assinatura, bytes originais e tolerância de tempo', async () => {
  const session = await start(); succeed(session);
  const body = JSON.stringify(event(session));
  const signature = sdk.webhooks.generateTestHeaderString({ payload: body, secret: process.env.STRIPE_WEBHOOK_SECRET });
  const req = { body: Buffer.from(body), get: () => signature };
  const valid = resMock();
  await controller.webhook(req, valid, error => { throw error; });
  assert.equal(valid.statusCode, 200);
  const invalid = resMock();
  await controller.webhook({ ...req, body: Buffer.from(body + ' ') }, invalid, error => { throw error; });
  assert.equal(invalid.statusCode, 400);
  const old = sdk.webhooks.generateTestHeaderString({ payload: body, secret: process.env.STRIPE_WEBHOOK_SECRET, timestamp: 1 });
  const expired = resMock();
  await controller.webhook({ ...req, get: () => old }, expired, error => { throw error; });
  assert.equal(expired.statusCode, 400);
});

test('fechar checkout expira na Stripe antes de permitir alterações e TTL conserva pagamentos em curso', async () => {
  const r = booking({ created_at: '2000-01-01 00:00:00' });
  await start(r);
  const scheduler = require('../services/reservationScheduler');
  assert.equal(scheduler.expirePendingReservations(), 0);
  await service.closeOpenCheckout(r.id);
  assert.equal(activeCheckout(r.id), undefined);
  assert.equal([...sessions.values()][0].status, 'expired');
  assert.equal(scheduler.expirePendingReservations(), 1);
  assert.equal(row().status, 'cancelada');
});

test('timeout depois de criar a sessão recupera com a mesma chave, sem segunda cobrança', async () => {
  const r = booking();
  const original = sdk.checkout.sessions.create;
  sdk.checkout.sessions.create = async (...args) => { await original(...args); throw new Error('network timeout'); };
  try { await assert.rejects(service.createCheckout(r.public_token), /network timeout/); }
  finally { sdk.checkout.sessions.create = original; }
  assert.equal(activeCheckout(r.id).state, 'creating');
  await service.createCheckout(r.public_token);
  assert.equal(requests.size, 1);
  assert.equal(activeCheckout(r.id).state, 'open');
});

test('validação Stripe rejeitada permite nova tentativa após corrigir a configuração', async () => {
  const r = booking();
  const original = sdk.checkout.sessions.create;
  sdk.checkout.sessions.create = async () => { throw Object.assign(new Error('invalid parameter'), { type: 'StripeInvalidRequestError' }); };
  try { await assert.rejects(service.createCheckout(r.public_token), /invalid parameter/); }
  finally { sdk.checkout.sessions.create = original; }
  assert.equal(activeCheckout(r.id), undefined);
  await service.createCheckout(r.public_token);
  assert.equal(requests.size, 1);
});

test('PaymentIntent cancelado e pagamento assíncrono falhado libertam a tentativa', async () => {
  const r = booking(); const session = await start(r);
  session.payment_intent = { id: 'pi_cancelled', object: 'payment_intent', status: 'canceled', livemode: false,
    amount: 20000, currency: 'eur', metadata: session.metadata };
  await service.processWebhook(event(session.payment_intent, 'payment_intent.canceled'));
  assert.equal(activeCheckout(r.id), undefined);
  assert.equal(row().online_payment_status, 'cancelled');
  await service.createCheckout(r.public_token);
  const second = [...sessions.values()][1]; second.status = 'complete';
  await service.processWebhook(event(second, 'checkout.session.async_payment_failed'));
  assert.equal(activeCheckout(r.id), undefined);
  assert.equal(row().online_payment_status, 'failed');
  assert.equal(row().amount_paid, 0);
});

test('backup conserva o histórico Stripe e impede restauros desatualizados ou entre organizações', async () => {
  const session = await start(); succeed(session);
  await service.processWebhook(event(session));
  const backup = require('../services/backupData');
  const data = backup.exportData('stripe-org');
  assert.equal(data.tables.stripe_payment_attempts.length, 1);
  const legacy = structuredClone(data);
  legacy.version = 6;
  delete legacy.tables.stripe_payment_attempts[0].livemode;
  assert.equal(backup.prepareImport(legacy, 'stripe-org').stripe_payment_attempts[0].livemode, 0);
  assert.throws(() => backup.prepareImport(data, 'other-org'), /entre organizações/);
  backup.restoreData(backup.prepareImport(data, 'stripe-org'), 'stripe-org');
  await service.processWebhook(event(session, 'checkout.session.completed'));
  assert.equal(row().amount_paid, 200);
  refunds.set(session.payment_intent.id, [{ amount: 5000, status: 'succeeded' }]);
  await service.processWebhook(event({ object: 'charge', payment_intent: session.payment_intent.id }, 'charge.refunded'));
  assert.throws(() => backup.restoreData(backup.prepareImport(data, 'stripe-org'), 'stripe-org'), /histórico Stripe/);
  assert.equal(row().amount_paid, 150);
});

test('pré-check-in posterior ao pagamento não repõe a reserva em aguardar pagamento', async () => {
  const session = await start(); succeed(session);
  await service.processWebhook(event(session));
  require('../services/publicGuestService').savePrecheckin(row(), { name: 'Synthetic Guest', email: 'guest@example.invalid' }, [], null);
  assert.equal(row().status, 'confirmada');
  assert.equal(row().payment_status, 'confirmado');
});

test('HTTP: reserva pública, checkout, assinatura raw e consulta segura do estado', async () => {
  require('../services/emailService').sendOwnerNewReservationEmail = async () => {};
  const app = require('../app');
  db.prepare(`INSERT INTO organization_settings(organization_id,key,value) VALUES('stripe-org','services','[{"id":"tourist_tax","active":false}]')
    ON CONFLICT(organization_id,key) DO UPDATE SET value=excluded.value`).run();
  db.prepare("UPDATE accommodations SET public_slug='stripe-test'").run();
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (url, body, headers = {}) => fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  try {
    const result = await post('/api/public/booking/stripe-test/reservations', {
      accommodation_id: 'unit', check_in: '2035-01-01', check_out: '2035-01-03', num_guests: 1,
      guest: { name: 'HTTP Test', email: 'http@example.invalid' }, rgpd_consent: true, elapsed_ms: 9000,
      total_amount: 0.01, amount_paid: 99999, status: 'confirmada', payment_status: 'confirmado',
    });
    const payload = await result.json();
    assert.equal(result.status, 201, JSON.stringify(payload));
    assert.equal(payload.data.status, 'aguardar_pagamento');
    assert.equal(payload.data.total_amount, 200);
    const token = payload.data.public_token;
    const checkout = await post(`/api/public/reservation/${token}/checkout`, { amount: 1 });
    assert.equal(checkout.status, 200);
    const session = [...sessions.values()][0]; succeed(session);
    const body = JSON.stringify(event(session));
    const bad = await post('/api/stripe/webhook', body);
    assert.equal(bad.status, 400);
    const signature = sdk.webhooks.generateTestHeaderString({ payload: body, secret: process.env.STRIPE_WEBHOOK_SECRET });
    const signed = await post('/api/stripe/webhook', body, { 'stripe-signature': signature });
    assert.equal(signed.status, 200, await signed.text());
    const statusResponse = await fetch(`${base}/api/public/reservation/${token}`);
    const status = await statusResponse.json();
    assert.equal(status.data.payment_status, 'confirmado');
    assert.equal(status.data.amount_paid, 200);
    assert.equal(status.data.online_payment.available, false);
    assert.equal(status.data.organization_id, undefined);
    assert.equal(status.data.guest_email, undefined);
    assert.equal(status.data.stripe_payment_intent_id, undefined);
    assert.match(statusResponse.headers.get('cache-control'), /no-store/);
    const crossOrigin = await post(`/api/public/reservation/${token}/checkout`, {}, { 'sec-fetch-site': 'cross-site' });
    assert.equal(crossOrigin.status, 403);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

const policy = require('../services/paymentPolicy');
const automation = require('../services/paymentPolicyAutomation');
function policyBooking(overrides = {}) {
  const p = { ...structuredClone(policy.DEFAULT_POLICY), enabled: true };
  policy.savePolicy('stripe-org', p);
  const r = booking({ total_amount: 250, ...overrides });
  policy.attachPolicy(r);
  return row();
}
async function deposit(r = policyBooking(), automatic = true) {
  await service.createCheckout(r.public_token, { accepted: true, automatic, key: policy.consentKey(r) });
  const s = [...sessions.values()][0]; succeed(s);
  s.payment_intent.customer = 'cus_synthetic'; s.payment_intent.payment_method = 'pm_synthetic';
  s.payment_intent.latest_charge = { payment_method_details: { type: automatic ? 'card' : 'mb_way' } };
  await service.processWebhook(event(s));
  return row();
}
async function atDue(r, work, offset = 1) {
  const old = Date.now; Date.now = () => Date.parse(policy.planFor(r).dueAt) + offset;
  try { return await work(); } finally { Date.now = old; }
}
test('política exige aceitação, cobra apenas sinal e confirma com pagamento parcial', async () => {
  let r = policyBooking();
  await assert.rejects(service.createCheckout(r.public_token), { status: 409 });
  await assert.rejects(service.createCheckout(r.public_token, { accepted: true, key: 'stale' }), { status: 409 });
  r = await deposit(r);
  assert.equal(r.amount_paid, 50); assert.equal(r.status, 'confirmada'); assert.equal(r.payment_status, 'parcial');
  assert.equal(r.stripe_customer_id, 'cus_synthetic'); assert.equal(r.stripe_payment_method_id, 'pm_synthetic');
  assert.equal([...requests.values()][0].params.payment_method_options.card.setup_future_usage, 'off_session');
  assert.equal(service.paymentSummary(r).amount_due, 200);
  const changed = policy.getPolicy('stripe-org'); changed.depositRules[2].percent = 75;
  policy.savePolicy('stripe-org', changed);
  assert.equal(policy.planFor(row()).depositCents, 5000);
});
test('cobrança automática é única e o webhook repetido não duplica recebimentos', async () => {
  let r = await deposit();
  await atDue(r, () => Promise.all([service.chargeBalance(r.id), service.chargeBalance(r.id)]));
  assert.equal(autoIntents.size, 1); assert.equal(row().amount_paid, 250);
  const pi = [...autoIntents.values()][0];
  await service.processWebhook(event(pi, 'payment_intent.succeeded'));
  assert.equal(row().amount_paid, 250); assert.equal(row().payment_status, 'confirmado');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM reservation_payments').get().n, 2);
});
test('MB WAY/sem consentimento não guarda cartão nem efetua cobrança automática', async () => {
  const r = await deposit(policyBooking(), false);
  assert.equal(r.stripe_payment_method_id, null);
  assert.equal([...requests.values()][0].params.payment_method_options, undefined);
  await atDue(r, () => automation.runPolicyMaintenance());
  assert.equal(autoIntents.size, 0); assert.ok(row().balance_notice_sent_at); assert.ok(row().balance_deadline);
  assert.equal(row().status, 'confirmada');
});
test('falha do cartão dá 24h e só depois cancela sem devolver o sinal', async () => {
  const r = await deposit(); autoFailure = true;
  await atDue(r, () => automation.runPolicyMaintenance());
  assert.equal(row().status, 'confirmada'); assert.equal(row().amount_paid, 50);
  assert.ok(row().balance_deadline); assert.ok(row().balance_notice_sent_at);
  assert.equal(activeCheckout(r.id), undefined);
  await atDue(r, () => automation.runPolicyMaintenance(), 24 * 3600000 + 2);
  assert.equal(row().status, 'cancelada'); assert.equal(row().amount_paid, 50);
  assert.equal(JSON.parse(row().policy_cancellation_json).refundCents, 0); assert.equal(refundRequests.size, 0);
});
test('aviso não enviado e indisponibilidade Stripe impedem cancelamento automático', async () => {
  const r = await deposit(policyBooking(), false);
  require('../services/emailService').sendMail = async () => null;
  await atDue(r, () => automation.runPolicyMaintenance(), 3 * 86400000);
  assert.equal(row().balance_notice_sent_at, null); assert.equal(row().status, 'confirmada');
  const retrieve = sdk.checkout.sessions.retrieve;
  sdk.checkout.sessions.retrieve = async () => { throw new Error('network timeout'); };
  try { await atDue(r, () => automation.runPolicyMaintenance(), 4 * 86400000); }
  finally { sdk.checkout.sessions.retrieve = retrieve; }
  assert.equal(row().status, 'confirmada');
});
test('cancelamento reembolsa W do montante pago, preserva a regra e é idempotente', async () => {
  let r = policyBooking();
  const p = JSON.parse(r.payment_policy_json); p.refundBasis = 'booking'; p.refundRules[2].percent = 50;
  db.prepare('UPDATE reservations SET payment_policy_json=?').run(JSON.stringify(p));
  r = await deposit(row());
  const quote = automation.cancellationQuote(r);
  assert.equal(quote.refundCents, 2500);
  await automation.cancelByPolicy(r.id, { expectedRefundCents: quote.refundCents, key: quote.key });
  await automation.cancelByPolicy(r.id, { expectedRefundCents: quote.refundCents, key: quote.key });
  assert.equal(refundRequests.size, 1); assert.equal(row().amount_paid, 25); assert.equal(row().status, 'cancelada');
  assert.equal(JSON.parse(row().policy_cancellation_json).state, 'complete');
  assert.equal(row().online_payment_status, 'partially_refunded');
});
test('cancelamento recusa cotação desatualizada e pagamento ainda em processamento', async () => {
  let r = await deposit();
  await assert.rejects(automation.cancelByPolicy(r.id, { expectedRefundCents: 1, key: policy.consentKey(r) }), { status: 409 });
  await service.createCheckout(r.public_token, { key: policy.consentKey(r) });
  const s = [...sessions.values()][1];
  s.status = 'complete'; s.payment_intent = { id: 'pi_processing', status: 'processing', livemode: false, amount: s.amount_total, currency: 'eur', metadata: s.metadata };
  await assert.rejects(automation.cancelByPolicy(r.id, { expectedRefundCents: 5000, key: policy.consentKey(r) }), { status: 409 });
  assert.equal(row().status, 'confirmada'); assert.equal(refundRequests.size, 0);
});
test('backup preserva a política e impede repor cobranças ou consentimentos antigos', async () => {
  const r = await deposit(); const backup = require('../services/backupData');
  const data = backup.exportData('stripe-org');
  const restored = backup.prepareImport(data, 'stripe-org'); backup.restoreData(restored, 'stripe-org');
  assert.equal(row().payment_policy_json, r.payment_policy_json);
  restored.reservations[0].policy_accepted_at = null;
  assert.throws(() => backup.restoreData(restored, 'stripe-org'), /políticas/);
});

test('um valor já visto não autoriza uma cobrança maior depois do vencimento', async t => {
  const r = policyBooking();
  const key = policy.consentKey(r);
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse(policy.planFor(r).dueAt) + 1000 });
  await assert.rejects(service.createCheckout(r.public_token, { accepted: true, key }), { status: 409 });
  assert.equal(requests.size, 0);
  assert.equal(policy.amountDue(row()), 25000);
  assert.notEqual(policy.consentKey(row()), key);
});

test('reembolso externo suspende cobrança e cancelamento automático', async () => {
  const r = await deposit();
  const s = [...sessions.values()][0];
  refunds.set(s.payment_intent.id, [{ amount: 1000, status: 'succeeded' }]);
  await service.processWebhook(event({ object: 'charge', payment_intent: s.payment_intent.id }, 'charge.refunded'));
  await atDue(r, () => automation.runPolicyMaintenance(), 3 * 86400000);
  assert.equal(autoIntents.size, 0);
  assert.equal(row().status, 'confirmada');
  assert.equal(row().balance_notice_sent_at, null);
});

test('resposta perdida no reembolso reutiliza a operação persistida', async () => {
  const r = await deposit();
  const quote = automation.cancellationQuote(r);
  const create = sdk.refunds.create;
  sdk.refunds.create = async (...args) => { await create(...args); throw new Error('response lost'); };
  try {
    await assert.rejects(automation.cancelByPolicy(r.id, { key: quote.key, expectedRefundCents: quote.refundCents }), /response lost/);
  } finally { sdk.refunds.create = create; }
  assert.equal(row().status, 'cancelada');
  await automation.processRefunds(r.id);
  assert.equal(refundRequests.size, 1);
  assert.equal(row().amount_paid, 0);
  assert.equal(JSON.parse(row().policy_cancellation_json).state, 'complete');
});

test('pagamentos manuais só confirmam quando atingem o sinal contratado', async () => {
  policyBooking();
  const ctrl = require('../controllers/reservationPaymentsController');
  const add = async amount => {
    const res = resMock();
    await ctrl.addPayment({ params: { id: 'booking' }, user: { organization_id: 'stripe-org' }, body: { amount, method: 'Transferência' } }, res, e => { throw e; });
    return res.body.data.id;
  };
  await add(10); assert.equal(row().status, 'aguardar_pagamento');
  const last = await add(40); assert.equal(row().status, 'confirmada');
  await ctrl.deletePayment({ params: { id: 'booking', paymentId: last }, user: { organization_id: 'stripe-org' } }, resMock(), e => { throw e; });
  assert.equal(row().status, 'aguardar_pagamento');
});

test('pré-check-in preserva a confirmação pelo sinal, mesmo com restante por pagar', async () => {
  await deposit();
  require('../services/publicGuestService').savePrecheckin(row(), { name: 'Synthetic Guest', email: 'guest@example.invalid' }, [], null);
  assert.equal(row().status, 'confirmada');
  assert.equal(row().payment_status, 'parcial');
  assert.equal(row().amount_paid, 50);
});

test('HTTP: políticas isoladas, permissões, criação manual e pública, consentimento e cancelamento', async () => {
  const app = require('../app');
  const auth = require('../services/authService');
  const orgs = require('../services/orgService');
  const user = auth.createUser({ name: 'Policy owner', email: 'policy@example.invalid', password: 'SyntheticPolicy123!' });
  orgs.createMembership({ organizationId: 'stripe-org', userId: user.id, role: 'owner' });
  orgs.createMembership({ organizationId: 'other-org', userId: user.id, role: 'owner' });
  const cookie = `${auth.SESSION_COOKIE}=${auth.createSession(user.id, 'stripe-org').sessionId}`;
  const otherCookie = `${auth.SESSION_COOKIE}=${auth.createSession(user.id, 'other-org').sessionId}`;
  db.prepare("UPDATE accommodations SET public_slug='stripe-test'").run();
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (url, method = 'GET', data, session = cookie) => fetch(base + url, {
    method, headers: { 'content-type': 'application/json', cookie: session }, body: data === undefined ? undefined : JSON.stringify(data),
  });
  try {
    assert.equal((await request('/api/payment-policy', 'GET', undefined, '')).status, 401);
    const p = { ...structuredClone(policy.DEFAULT_POLICY), enabled: true };
    assert.equal((await request('/api/payment-policy', 'PUT', p)).status, 200);
    assert.equal((await (await request('/api/payment-policy', 'GET', undefined, otherCookie)).json()).data.enabled, false);
    db.prepare("UPDATE memberships SET role='staff' WHERE organization_id='stripe-org' AND user_id=?").run(user.id);
    assert.equal((await request('/api/payment-policy', 'PUT', p)).status, 403);
    db.prepare("UPDATE memberships SET role='owner' WHERE organization_id='stripe-org' AND user_id=?").run(user.id);
    const manual = await request('/api/reservations', 'POST', {
      guest: { name: 'Manual Policy Guest', email: 'manual@example.invalid' }, accommodation_id: 'unit',
      check_in: '2035-02-01', check_out: '2035-02-03', num_guests: 1, total_amount: 250,
    });
    const manualBody = await manual.json();
    assert.equal(manual.status, 201, JSON.stringify(manualBody));
    const m = db.prepare("SELECT * FROM reservations WHERE check_in='2035-02-01'").get();
    assert.ok(m.payment_policy_json); assert.equal(m.status, 'aguardar_pagamento');
    const detail = await (await request(`/api/reservations/${m.id}`)).json();
    assert.match(detail.data.public_token, /^[a-f0-9]{64}$/);
    const invalidDates = await request(`/api/reservations/${m.id}`, 'PUT', { check_in: '2000-01-01', check_out: '2000-01-03' });
    assert.equal(invalidDates.status, 400);
    const publicBooking = await request('/api/public/booking/stripe-test/reservations', 'POST', {
      accommodation_id: 'unit', check_in: '2035-01-01', check_out: '2035-01-03', num_guests: 1,
      guest: { name: 'Public Policy Guest', email: 'public@example.invalid' }, rgpd_consent: true, elapsed_ms: 9000,
    }, '');
    assert.equal(publicBooking.status, 201);
    const token = (await publicBooking.json()).data.public_token;
    const url = `/api/public/reservation/${token}`;
    let status = (await (await request(url)).json()).data;
    assert.equal(status.online_payment.policy.policy.enabled, true);
    assert.equal(status.policy_auto_consent, undefined); assert.equal(status.stripe_customer_id, undefined);
    assert.equal((await request(url + '/checkout', 'POST', {})).status, 409);
    assert.equal((await request(url + '/checkout', 'POST', { consent: { accepted: true, key: status.online_payment.policy.consentKey } })).status, 200);
    const s = [...sessions.values()][0]; succeed(s); await service.processWebhook(event(s));
    status = (await (await request(url)).json()).data;
    assert.equal(status.status, 'confirmada'); assert.equal(status.payment_status, 'parcial');
    const cancel = await request(url + '/cancel', 'POST', { confirm: true, key: status.online_payment.policy.consentKey, refundCents: status.online_payment.policy.refundCents });
    assert.equal(cancel.status, 200, await cancel.text());
    assert.equal((await (await request(url)).json()).data.status, 'cancelada');
    const backup = require('../services/backupData');
    assert.throws(() => backup.prepareImport(backup.exportData('stripe-org'), 'other-org'), /entre organizações/);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
