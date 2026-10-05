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
process.env.STRIPE_SECRET_KEY = 'sk_test_synthetic';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_synthetic';
process.env.STRIPE_ORGANIZATION_ID = 'stripe-org';
const { db, initDatabase } = require('../config/database');
initDatabase();
const service = require('../services/stripePayments');
const { getStripe, stripeEnabled } = require('../services/stripeClient');
const { activeCheckout } = require('../services/stripePaymentGuards');
const controller = require('../controllers/stripePaymentsController');
const sdk = getStripe();
const sessions = new Map();
const requests = new Map();
const refunds = new Map();
let createCalls;
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
sdk.paymentIntents.retrieve = async id => structuredClone([...sessions.values()].find(s => s.payment_intent?.id === id)?.payment_intent);
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
  sessions.clear(); requests.clear(); refunds.clear(); createCalls = 0;
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

test('falha fechada sem configuração, com chave live ou organização diferente', () => {
  assert.equal(stripeEnabled('other-org'), false);
  const key = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = 'sk_live_synthetic';
  assert.equal(stripeEnabled('stripe-org'), false);
  process.env.STRIPE_SECRET_KEY = key;
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  assert.equal(stripeEnabled('stripe-org'), false);
  process.env.STRIPE_WEBHOOK_SECRET = secret;
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
  db.prepare("UPDATE reservations SET status='pre_checkin'").run();
  require('../services/publicGuestService').savePrecheckin(row(), { name: 'Synthetic Guest', email: 'guest@example.invalid' }, [], null);
  assert.equal(row().status, 'confirmada');
  assert.equal(row().payment_status, 'confirmado');
});

test('HTTP: reserva pública, checkout, assinatura raw e consulta segura do estado', async () => {
  require('../services/emailService').sendOwnerNewReservationEmail = async () => {};
  require('../services/pushService').notifyOrganization = () => {};
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
