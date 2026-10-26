// Criação de reservas: o backoffice e o pedido do site gravam pelos mesmos
// passos (estado inicial, pagamento, política, histórico, acontecimento).
const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-creation-'));
const originalCwd = process.cwd();
process.chdir(temp);
process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.EMAIL_ENABLED = 'false';
process.env.PUBLIC_APP_URL = 'http://localhost:3001';
process.env.RESERVATION_EVENTS_DISPATCH = 'manual';
const { db, initDatabase } = require('../config/database');
initDatabase();
let onlinePayment = false;
require('../services/stripeClient').stripeEnabled = () => onlinePayment;
const synced = [];
require('../services/operationalTasksService').syncReservationOperationalTasks = r => synced.push(r.id);
require('../services/calendarService').kickCalendarQueue = () => {};
require('../services/turnstileService').verify = async () => ({ success: true });
const write = require('../controllers/reservationWriteController');
const publicBooking = require('../controllers/publicBookingController');
const policy = require('../services/paymentPolicy');

const ORG = 'org-cr';
beforeEach(() => {
  onlinePayment = false; synced.length = 0;
  db.exec(`DELETE FROM reservation_event_effects; DELETE FROM reservation_events; DELETE FROM reservation_payments;
    DELETE FROM voucher_redemptions; DELETE FROM vouchers; DELETE FROM reservation_history; DELETE FROM reservations;
    DELETE FROM guests; DELETE FROM accommodations; DELETE FROM organization_settings; DELETE FROM organizations;
    INSERT INTO organizations(id,name,slug) VALUES ('${ORG}','CR','cr');
    INSERT OR IGNORE INTO users(id,name,email,password_hash) VALUES ('manager','M','m@example.invalid','x');
    INSERT INTO accommodations(id,organization_id,name,type,price_per_night,max_guests,public_slug)
      VALUES ('casa','${ORG}','Casa','alojamento',100,4,'casa');`);
});
after(() => { db.close(); process.chdir(originalCwd); fs.rmSync(temp, { recursive: true, force: true }); });

async function call(fn, body, params = {}) {
  const req = { body, params, query: {}, ip: '127.0.0.1', protocol: 'http', get: () => 'test.invalid',
    user: { id: 'manager', role: 'manager', organization_id: ORG } };
  const res = { statusCode: 200, status(n) { this.statusCode = n; return this; }, json(data) { this.body = data; return this; } };
  await fn(req, res, error => { res.status(error.status || 500).json({ error: error.message }); });
  return res;
}
const backoffice = (extra = {}) => call(write.create, { accommodation_id: 'casa', check_in: '2035-08-10', check_out: '2035-08-12',
  num_guests: 1, guest: { name: 'Equipa', email: 'equipa@example.com' }, ...extra });
const site = (extra = {}) => call(publicBooking.createReservation, { accommodation_id: 'casa', check_in: '2035-08-10', check_out: '2035-08-12',
  num_guests: 1, guest: { name: 'Site', email: 'site@example.com' }, rgpd_consent: true, elapsed_ms: 9000, ...extra }, { slug: 'casa' });
const row = id => db.prepare('SELECT * FROM reservations WHERE id = ?').get(id);
const history = id => db.prepare('SELECT action, meta FROM reservation_history WHERE reservation_id = ?').all(id)
  .map(h => ({ action: h.action, meta: JSON.parse(h.meta || '{}') }));
const eventTypes = id => db.prepare('SELECT type FROM reservation_events WHERE reservation_id = ?').all(id).map(e => e.type);

test('backoffice: confirmada, um registo de criação, um acontecimento e tarefas sincronizadas', async () => {
  const res = await backoffice();
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  const r = row(res.body.data.id);
  assert.equal(r.status, 'confirmada');
  assert.equal(r.payment_status, 'pendente');
  assert.equal(r.channel, 'direto');
  assert.deepEqual(history(r.id).map(h => h.action), ['created']);
  assert.deepEqual(eventTypes(r.id), ['reservation.created']);
  assert.deepEqual(synced, [r.id]);
  assert.match(r.id, /^SP-[0-9A-F]+$/);
});

test('backoffice com política: aguarda o sinal', async () => {
  policy.savePolicy(ORG, { ...policy.DEFAULT_POLICY, enabled: true });
  const r = row((await backoffice()).body.data.id);
  assert.equal(r.status, 'aguardar_pagamento');
  assert.ok(r.payment_policy_json);
});

test('backoffice com valor pago na criação: fica no registo de pagamentos', async () => {
  const r = row((await backoffice({ amount_paid: 200, payment_method: 'MB Way' })).body.data.id);
  assert.equal(r.amount_paid, 200);
  assert.equal(r.payment_status, 'parcial', 'o total inclui a taxa turística');
  assert.equal(db.prepare('SELECT SUM(amount) AS s FROM reservation_payments WHERE reservation_id = ?').get(r.id).s, 200);
});

test('site: pedido pendente com origem pública no histórico e aviso à equipa', async () => {
  const res = await site();
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  const r = row(res.body.data.id);
  assert.equal(r.status, 'pendente');
  assert.equal(r.payment_status, 'pendente');
  assert.equal(r.channel, 'website');
  assert.deepEqual(history(r.id).map(h => [h.action, h.meta.source]), [['created', 'public']]);
  assert.deepEqual(eventTypes(r.id), ['reservation.requested']);
  assert.deepEqual(synced, [r.id]);
});

test('site com pagamento online: aguarda o pagamento, mesmo com política e sem sinal pago', async () => {
  onlinePayment = true;
  policy.savePolicy(ORG, { ...policy.DEFAULT_POLICY, enabled: true });
  const res = await site();
  const r = row(res.body.data.id);
  assert.equal(r.status, 'aguardar_pagamento');
  assert.equal(res.body.data.status, 'aguardar_pagamento');
  assert.ok(r.payment_policy_json);
  assert.deepEqual(history(r.id).map(h => h.action), ['created']);
});

test('uma falha a meio da criação não deixa reserva, histórico nem acontecimento', async () => {
  const original = policy.attachPolicy;
  policy.attachPolicy = () => { throw new Error('falha simulada'); };
  try {
    assert.equal((await backoffice()).statusCode, 500);
    assert.equal((await site()).statusCode, 500);
  } finally { policy.attachPolicy = original; }
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM reservations').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM reservation_history').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM reservation_events').get().n, 0);
});
