// Avisos à equipa: pagamento recebido/falhado/reembolso no sino por papel, email
// sem Gmail ligado como falha visível (sem repetir) e texto humano nas falhas.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-notices-'));
const originalCwd = process.cwd();
process.chdir(temp);
process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.PUBLIC_APP_URL = 'http://localhost:3001';
process.env.RESERVATION_EVENTS_DISPATCH = 'manual';
const { db, initDatabase } = require('../config/database');
initDatabase();
const emailService = require('../services/emailService');
let mailResult = null;
emailService.sendMail = async () => mailResult;
for (const name of ['sendPaymentConfirmationEmail', 'sendCancellationEmail']) emailService[name] = async () => ({ id: 'm' });
const staff = require('../services/staffNotifier');
const pushes = [];
staff.push = async (org, type, options) => { pushes.push({ type, ...options }); };
const events = require('../services/reservationEvents');
const { getNotifications } = require('../controllers/reservationOperationsController');
after(() => { db.close(); process.chdir(originalCwd); fs.rmSync(temp, { recursive: true, force: true }); });

const ORG = 'org-notices';
db.exec(`INSERT INTO organizations(id,name,slug) VALUES ('${ORG}','Avisos','avisos');
  INSERT INTO users(id,name,email,password_hash) VALUES ('u-owner','Dona','dona@example.com','x'),('u-mgr','Gestor','gestor@example.com','x'),('u-staff','Func','func@example.com','x');
  INSERT INTO memberships(id,organization_id,user_id,role) VALUES ('m1','${ORG}','u-owner','owner'),('m2','${ORG}','u-mgr','manager'),('m3','${ORG}','u-staff','staff');
  INSERT INTO guests(id,organization_id,name,email) VALUES ('g','${ORG}','Ana Pedido','ana@example.com');
  INSERT INTO accommodations(id,organization_id,name,type,price_per_night) VALUES ('a','${ORG}','Casa da Oliveira','alojamento',100);
  INSERT INTO reservations(id,organization_id,guest_id,accommodation_id,check_in,check_out,nights,num_guests,total_amount,amount_paid,status)
    VALUES ('res-1','${ORG}','g','a','2035-06-01','2035-06-03',2,2,200,40,'confirmada');`);

function sino(role, id) {
  let out;
  getNotifications({ user: { id, role, organization_id: ORG } }, { json: body => { out = body.data.notifications; } }, error => { throw error; });
  return out;
}
const emit = (type, payload, actorUserId = null) => db.transaction(() => events.emit(type, { organizationId: ORG, reservationId: 'res-1', actorUserId, payload }))();

test('pagamento recebido: entrada no sino para proprietário e gestor, nunca para o funcionário', () => {
  emit('payment.received', { amount: 40, source: 'stripe' });
  for (const [role, id] of [['owner', 'u-owner'], ['manager', 'u-mgr']]) {
    const found = sino(role, id).find(n => n.type === 'payment_received');
    assert.ok(found, role);
    assert.match(found.title.replace(/\s/g, ' '), /^Pagamento recebido · 40,00 €$/);
    assert.equal(found.reservation_id, 'res-1');
    assert.equal(found.subtitle, 'Ana Pedido · Casa da Oliveira');
  }
  assert.equal(sino('staff', 'u-staff').filter(n => /payment_/.test(n.type)).length, 0);
});

test('pagamento registado à mão: quem o registou não vê o aviso, os outros sim', () => {
  db.exec('DELETE FROM reservation_events');
  emit('payment.received', { amount: 10, source: 'manual' }, 'u-mgr');
  assert.equal(sino('manager', 'u-mgr').filter(n => n.type === 'payment_received').length, 0);
  assert.equal(sino('owner', 'u-owner').filter(n => n.type === 'payment_received').length, 1);
});

test('falha e reembolso: entradas com texto claro, lidas por utilizador', () => {
  db.exec('DELETE FROM reservation_events');
  emit('payment.failed', { reason: 'failed' });
  emit('payment.refunded', { amount: 20, partial: true });
  const list = sino('owner', 'u-owner');
  const failed = list.find(n => n.type === 'payment_issue');
  assert.equal(failed.title, 'Pagamento online falhou');
  assert.ok(list.find(n => n.type === 'payment_refunded').title.replace(/\s/g, ' ').startsWith('Reembolso parcial'));
  require('../services/notificationState').markRead('u-owner', ORG, [failed.key]);
  assert.equal(sino('owner', 'u-owner').find(n => n.type === 'payment_issue').read, true);
  assert.equal(sino('manager', 'u-mgr').find(n => n.type === 'payment_issue').read, false);
});

test('email à equipa sem Gmail ligado: falha definitiva (sem repetir) e aviso humano só para gestor+', async () => {
  db.exec('DELETE FROM reservation_events');
  mailResult = null;
  await assert.rejects(staff.email(ORG, { subject: 's', eyebrow: 'x' }), { message: staff.NO_GMAIL_MESSAGE, permanent: true });
  emit('reservation.cancelled', { reason: 'guest' });
  await events.dispatchPending();
  const row = db.prepare("SELECT state, attempts, last_error FROM reservation_event_effects WHERE effect='staff_email_cancelled'").get();
  assert.deepEqual({ ...row }, { state: 'failed', attempts: 1, last_error: staff.NO_GMAIL_MESSAGE });
  assert.equal(db.prepare("SELECT COUNT(*) n FROM reservation_event_effects WHERE state='pending'").get().n, 0);
  const failedNotices = sino('owner', 'u-owner').filter(n => n.type === 'notice_failed');
  assert.equal(failedNotices.length, 1);
  assert.equal(failedNotices[0].title, 'Aviso não entregue');
  assert.equal(failedNotices[0].subtitle, `${staff.NO_GMAIL_MESSAGE}.`);
  assert.equal(sino('staff', 'u-staff').filter(n => n.type === 'notice_failed').length, 0);
});

test('aviso push falhado: texto humano, sem nome de efeito nem erro técnico', () => {
  db.exec('DELETE FROM reservation_events');
  emit('payment.received', { amount: 40, source: 'stripe' });
  db.prepare("UPDATE reservation_event_effects SET state='failed', last_error='socket hang up', updated_at=datetime('now') WHERE effect='staff_push_payment'").run();
  const notice = sino('owner', 'u-owner').find(n => n.type === 'notice_failed');
  assert.equal(notice.subtitle, 'O aviso do pagamento da reserva de Ana Pedido não chegou ao telemóvel da equipa.');
  assert.doesNotMatch(notice.subtitle, /socket|staff_|staff push/);
});

test('email sem Gmail em ambiente com envios desligados não é falha', async () => {
  process.env.EMAIL_ENABLED = 'false';
  try { assert.deepEqual(await staff.email(ORG, { subject: 's', eyebrow: 'x' }), { sent: 0, skipped: true }); }
  finally { delete process.env.EMAIL_ENABLED; }
});

test('push: a etiqueta tem o ID da reserva e o service worker volta a tocar (renotify)', async () => {
  pushes.length = 0;
  const effects = require('../services/reservationEffects');
  const base = { organizationId: ORG, reservationId: 'res-1', actorUserId: null };
  await effects.runEffect('staff_push_payment', { ...base, type: 'payment.received', payload: { amount: 5, source: 'stripe' } });
  await effects.runEffect('staff_push_cancelled', { ...base, type: 'reservation.cancelled', payload: { reason: 'guest' } });
  await effects.runEffect('staff_push_precheckin', { ...base, type: 'precheckin.submitted', payload: {} });
  assert.deepEqual(pushes.map(p => p.tag), ['sp-payment-res-1', 'sp-cancellation-res-1', 'sp-precheckin-res-1']);
  assert.deepEqual(pushes[0].roles, ['owner', 'manager']);

  const shown = [];
  const handlers = {};
  const self = { addEventListener: (t, h) => { handlers[t] = h; }, registration: { showNotification: (title, options) => { shown.push(options); return Promise.resolve(); } },
    location: { origin: 'https://sp.example' }, skipWaiting: () => Promise.resolve(), clients: { claim: () => Promise.resolve() } };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../../../frontend/service-worker.js'), 'utf8'),
    { self, caches: {}, clients: self.clients, URL, Promise, console, Response: class {}, fetch: () => Promise.reject(new Error('offline')) });
  let pending;
  handlers.push({ data: { json: () => staff.pushPayload({ kind: 'payment', title: 't', body: 'b', tag: 'sp-payment-res-1', renotify: true }), text: () => '' }, waitUntil: p => { pending = p; } });
  await pending;
  assert.equal(shown[0].renotify, true);
  assert.equal(shown[0].tag, 'sp-payment-res-1');
});
