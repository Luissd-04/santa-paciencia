// Acontecimentos de reserva e os seus efeitos: que emails e avisos à equipa
// cada caminho pede, a repetição após falha e a ausência de envio quando a
// alteração é desfeita.
const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-events-'));
const originalCwd = process.cwd();
process.chdir(temp);
process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.EMAIL_ENABLED = 'false';
process.env.PUBLIC_APP_URL = 'http://localhost:3001';
process.env.RESERVATION_EVENTS_DISPATCH = 'manual';
const { db, initDatabase } = require('../config/database');
initDatabase();

const log = [];
const emailService = require('../services/emailService');
for (const name of ['sendConfirmationEmail', 'sendCancellationEmail', 'sendPaymentConfirmationEmail', 'sendPreCheckinEmail', 'sendOwnerNewReservationEmail']) {
  emailService[name] = async () => { log.push(`guest:${name}`.replace('guest:sendOwnerNewReservationEmail', 'staff:email_new_request')); return { id: 'mail' }; };
}
const staff = require('../services/staffNotifier');
staff.push = async (org, type, options) => { log.push(`staff:push:${type}${options.excludeUserId ? `!${options.excludeUserId}` : ''}`); };
let staffEmailFailures = 0;
staff.email = async (org, { title }) => {
  if (staffEmailFailures > 0) { staffEmailFailures--; throw new Error('Gmail indisponível'); }
  log.push(`staff:email:${title}`);
};
require('../services/operationalTasksService').syncReservationOperationalTasks = () => {};
require('../services/calendarService').kickCalendarQueue = () => {};
require('../services/turnstileService').verify = async () => ({ success: true });

const events = require('../services/reservationEvents');
const write = require('../controllers/reservationWriteController');
const reservations = require('../controllers/reservationController');
const payments = require('../controllers/reservationPaymentsController');
const publicBooking = require('../controllers/publicBookingController');
const policy = require('../services/paymentPolicy');
const automation = require('../services/paymentPolicyAutomation');
const { expirePendingReservations } = require('../services/reservationScheduler');

const ORG = 'org-events';
beforeEach(() => {
  db.exec(`DELETE FROM reservation_events; DELETE FROM reservation_payments; DELETE FROM reservation_history;
    DELETE FROM reservations; DELETE FROM guests; DELETE FROM accommodations; DELETE FROM organization_settings;
    DELETE FROM organizations;
    INSERT INTO organizations(id,name,slug) VALUES ('${ORG}','Eventos','eventos');
    INSERT OR IGNORE INTO users(id,name,email,password_hash) VALUES ('manager','Gestor','gestor@example.com','x');
    INSERT INTO guests(id,organization_id,name,email) VALUES ('guest','${ORG}','Hóspede','hospede@example.com');
    INSERT INTO accommodations(id,organization_id,name,type,price_per_night,max_guests,public_slug)
      VALUES ('unit','${ORG}','Quarto','alojamento',100,4,'quarto');`);
  log.length = 0;
  staffEmailFailures = 0;
});
after(() => { db.close(); process.chdir(originalCwd); fs.rmSync(temp, { recursive: true, force: true }); });

function request(body = {}, params = {}) {
  return { body, params, query: {}, ip: '127.0.0.1', protocol: 'http', get: () => 'test.invalid',
    user: { id: 'manager', role: 'manager', organization_id: ORG } };
}
async function call(fn, body, params) {
  const res = { statusCode: 200, status(n) { this.statusCode = n; return this; }, json(data) { this.body = data; return this; } };
  await fn(request(body, params), res, error => { res.status(error.status || 500).json({ error: error.message }); });
  return res;
}
function reservation(overrides = {}) {
  const r = { id: 'res', organization_id: ORG, guest_id: 'guest', accommodation_id: 'unit', check_in: '2035-06-01',
    check_out: '2035-06-03', nights: 2, num_guests: 2, total_amount: 200, amount_paid: 0, payment_status: 'pendente',
    status: 'confirmada', channel: 'direto', ...overrides };
  db.prepare(`INSERT INTO reservations(${Object.keys(r).join(',')}) VALUES (${Object.keys(r).map(() => '?').join(',')})`).run(...Object.values(r));
  return r;
}
const types = () => db.prepare('SELECT type FROM reservation_events ORDER BY created_at, rowid').all().map(e => e.type);
async function effects() { await events.dispatchPending(); return [...log].sort(); }

test('reserva criada no backoffice: email ao hóspede e push à restante equipa', async () => {
  const res = await call(write.create, { accommodation_id: 'unit', check_in: '2035-07-01', check_out: '2035-07-03', num_guests: 2,
    guest: { name: 'Novo', email: 'novo@example.com' } });
  assert.equal(res.statusCode, 201);
  assert.deepEqual(types(), ['reservation.created']);
  assert.deepEqual(await effects(), ['guest:sendConfirmationEmail', 'staff:push:new_reservation!manager']);
});

test('pedido do site público: só a equipa é avisada (decisão 2)', async () => {
  const res = await call(publicBooking.createReservation, { accommodation_id: 'unit', check_in: '2035-08-01', check_out: '2035-08-03',
    num_guests: 1, guest: { name: 'Site', email: 'site@example.com' }, rgpd_consent: true, elapsed_ms: 9000 }, { slug: 'quarto' });
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  assert.deepEqual(types(), ['reservation.requested']);
  assert.deepEqual(await effects(), ['staff:email_new_request', 'staff:push:new_reservation']);
});

test('pagamento manual: email ao hóspede, sem push a quem o registou', async () => {
  reservation();
  await call(payments.addPayment, { amount: 50 }, { id: 'res' });
  assert.deepEqual(await effects(), ['guest:sendPaymentConfirmationEmail']);
});

test('pagamento Stripe: email ao hóspede e push à equipa (decisão 1)', async () => {
  reservation();
  db.transaction(() => events.emit('payment.received', { organizationId: ORG, reservationId: 'res', payload: { amount: 50, source: 'stripe' } }))();
  assert.deepEqual(await effects(), ['guest:sendPaymentConfirmationEmail', 'staff:push:payment']);
});

test('cancelamento pela equipa: email ao hóspede e push aos colegas, sem email à equipa', async () => {
  reservation();
  await call(reservations.cancel, {}, { id: 'res' });
  assert.deepEqual(types(), ['reservation.cancelled']);
  assert.deepEqual(await effects(), ['guest:sendCancellationEmail', 'staff:push:cancellation!manager']);
});

test('cancelamento pela edição do estado tem os mesmos efeitos que o botão cancelar', async () => {
  reservation();
  await call(write.update, { status: 'cancelada' }, { id: 'res' });
  assert.deepEqual(await effects(), ['guest:sendCancellationEmail', 'staff:push:cancellation!manager']);
});

test('pedido expirado (TTL): hóspede avisado e equipa por push e email (decisão 4)', async () => {
  reservation({ status: 'pendente', channel: 'website' });
  db.prepare("UPDATE reservations SET created_at = datetime('now', '-3 days') WHERE id='res'").run();
  assert.equal(expirePendingReservations(), 1);
  assert.deepEqual(await effects(), ['guest:sendCancellationEmail', 'staff:email:Pedido expirado sem pagamento nem aprovação', 'staff:push:cancellation']);
});

test('cancelamento pelo hóspede com política: equipa avisada por push e email (decisão 4)', async () => {
  policy.savePolicy(ORG, { ...policy.DEFAULT_POLICY, enabled: true });
  reservation({ status: 'aguardar_pagamento' });
  policy.attachPolicy({ id: 'res', organization_id: ORG });
  const quote = automation.cancellationQuote(db.prepare("SELECT * FROM reservations WHERE id='res'").get());
  await automation.cancelByPolicy('res', { reason: 'guest', key: quote.key, expectedRefundCents: quote.refundCents });
  assert.equal(db.prepare("SELECT status FROM reservations WHERE id='res'").get().status, 'cancelada');
  assert.deepEqual(await effects(), ['staff:email:Cancelada pelo hóspede', 'staff:push:cancellation']);
});

test('alteração desfeita não emite acontecimentos', async () => {
  reservation();
  const res = await call(write.create, { accommodation_id: 'unit', check_in: '2035-06-01', check_out: '2035-06-03', num_guests: 2,
    guest: { name: 'Conflito', email: 'c@example.com' } });
  assert.equal(res.statusCode, 409);
  assert.deepEqual(types(), []);
});

test('efeito que falha é repetido mais tarde sem repetir os outros', async () => {
  reservation({ status: 'pendente', channel: 'website' });
  db.prepare("UPDATE reservations SET created_at = datetime('now', '-3 days') WHERE id='res'").run();
  staffEmailFailures = 1;
  expirePendingReservations();
  await events.dispatchPending();
  const failed = db.prepare("SELECT state, attempts, next_attempt_at > datetime('now') AS later FROM reservation_event_effects WHERE effect='staff_email_cancelled'").get();
  assert.deepEqual({ ...failed }, { state: 'pending', attempts: 1, later: 1 });
  assert.deepEqual([...log].sort(), ['guest:sendCancellationEmail', 'staff:push:cancellation']);
  db.exec("UPDATE reservation_event_effects SET next_attempt_at = datetime('now')");
  assert.deepEqual(await effects(), ['guest:sendCancellationEmail', 'staff:email:Pedido expirado sem pagamento nem aprovação', 'staff:push:cancellation']);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM reservation_event_effects WHERE state='done'").get().n, 3);
});

test('após o máximo de tentativas o efeito fica como falhado', async () => {
  reservation();
  db.transaction(() => events.emit('reservation.cancelled', { organizationId: ORG, reservationId: 'res', payload: { reason: 'guest', policy: true } }))();
  staffEmailFailures = 99;
  for (let i = 0; i < events.MAX_ATTEMPTS; i++) {
    db.exec("UPDATE reservation_event_effects SET next_attempt_at = datetime('now')");
    await events.dispatchPending();
  }
  assert.equal(db.prepare("SELECT state FROM reservation_event_effects WHERE effect='staff_email_cancelled'").get().state, 'failed');
});

// Ciclo de vida (reservationLifecycle): os quatro caminhos de cancelamento
// deixam o mesmo registo no histórico, com o motivo.
const cancelHistory = () => db.prepare("SELECT action, meta FROM reservation_history WHERE reservation_id='res' AND action IN ('cancelled','policy_cancelled')")
  .all().map(h => [h.action, JSON.parse(h.meta).reason]);

test('todos os cancelamentos ficam no histórico como «cancelled» com o motivo', async () => {
  reservation();
  await call(reservations.cancel, {}, { id: 'res' });
  assert.deepEqual(cancelHistory(), [['cancelled', 'staff']]);
  // Repetir o pedido não regista nem avisa outra vez.
  await call(reservations.cancel, {}, { id: 'res' });
  assert.deepEqual(cancelHistory(), [['cancelled', 'staff']]);
  assert.deepEqual(types(), ['reservation.cancelled']);

  db.exec("DELETE FROM reservation_history; DELETE FROM reservations");
  reservation();
  await call(write.update, { status: 'cancelada' }, { id: 'res' });
  assert.deepEqual(cancelHistory(), [['cancelled', 'staff']]);

  db.exec("DELETE FROM reservation_history; DELETE FROM reservations");
  reservation({ status: 'pendente', channel: 'website' });
  db.prepare("UPDATE reservations SET created_at = datetime('now', '-3 days') WHERE id='res'").run();
  expirePendingReservations();
  assert.deepEqual(cancelHistory(), [['cancelled', 'ttl']]);
  assert.match(db.prepare("SELECT notes FROM reservations WHERE id='res'").get().notes, /Auto-cancelada por TTL/);
});

test('cancelamento por política regista o reembolso no mesmo histórico', async () => {
  policy.savePolicy(ORG, { ...policy.DEFAULT_POLICY, enabled: true });
  reservation({ status: 'aguardar_pagamento' });
  policy.attachPolicy({ id: 'res', organization_id: ORG });
  const quote = automation.cancellationQuote(db.prepare("SELECT * FROM reservations WHERE id='res'").get());
  await automation.cancelByPolicy('res', { reason: 'guest', key: quote.key, expectedRefundCents: quote.refundCents });
  const meta = JSON.parse(db.prepare("SELECT meta FROM reservation_history WHERE reservation_id='res' AND action='cancelled'").get().meta);
  assert.deepEqual(meta, { reason: 'guest', policy: true, refund: 0, refund_percent: quote.refundPercent });
});

test('aprovar envia o pré-check-in por acontecimento e nunca recua uma estadia', async () => {
  reservation({ status: 'pendente' });
  const res = await call(reservations.approve, {}, { id: 'res' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.status, 'pre_checkin');
  assert.match(res.body.data.pre_checkin_url, /\/pre-checkin\/[a-f0-9]{64}$/);
  assert.deepEqual(await effects(), ['guest:sendPreCheckinEmail']);
  db.exec("UPDATE reservations SET status='check_in'");
  assert.equal((await call(reservations.approve, {}, { id: 'res' })).statusCode, 409);
  db.exec("UPDATE reservations SET status='cancelada'");
  assert.equal((await call(reservations.approve, {}, { id: 'res' })).statusCode, 400);
});
