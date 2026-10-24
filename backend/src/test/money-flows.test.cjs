// Caracterização dos caminhos que escrevem dinheiro numa reserva: criação,
// edição, separador Pagamentos e política de sinal. Fixa estado, ledger e
// emails pedidos, para que a centralização não mude nada sem querer.
const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-money-'));
const originalCwd = process.cwd();
process.chdir(temp);
process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.EMAIL_ENABLED = 'false';
process.env.PUBLIC_APP_URL = 'http://localhost:3001';
process.env.RESERVATION_EVENTS_DISPATCH = 'manual';
const { db, initDatabase } = require('../config/database');
initDatabase();

// Efeitos externos registados em vez de executados. Têm de ser substituídos
// antes de carregar os controllers, que os desestruturam no require.
const sent = [];
const emailService = require('../services/emailService');
for (const name of ['sendConfirmationEmail', 'sendCancellationEmail', 'sendPaymentConfirmationEmail', 'sendPreCheckinEmail', 'sendOwnerNewReservationEmail']) {
  emailService[name] = async (...args) => { sent.push({ name, reservation: args.find(a => a?.check_in)?.id, amount: args.at(-1)?.amount }); return { id: 'mail' }; };
}
const pushes = [];
require('../services/pushService').notifyOrganization = (org, type) => { pushes.push(type); };
require('../services/operationalTasksService').syncReservationOperationalTasks = () => {};
require('../services/calendarService').kickCalendarQueue = () => {};

const write = require('../controllers/reservationWriteController');
const payments = require('../controllers/reservationPaymentsController');
const policy = require('../services/paymentPolicy');

const ORG = 'org-money';
beforeEach(() => {
  db.exec(`DELETE FROM reservation_events; DELETE FROM reservation_payments; DELETE FROM manual_payment_intents; DELETE FROM reservation_history;
    DELETE FROM reservations; DELETE FROM guests; DELETE FROM accommodations; DELETE FROM organization_settings;
    DELETE FROM organizations;
    INSERT INTO organizations(id,name,slug) VALUES ('${ORG}','Money','money');
    INSERT INTO guests(id,organization_id,name,email) VALUES ('guest','${ORG}','Hóspede','hospede@example.com');
    INSERT INTO accommodations(id,organization_id,name,type,price_per_night,max_guests)
      VALUES ('unit','${ORG}','Quarto','alojamento',100,4);`);
  sent.length = 0;
  pushes.length = 0;
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
const row = (id = 'res') => db.prepare('SELECT * FROM reservations WHERE id=?').get(id);
const ledger = (id = 'res') => db.prepare('SELECT amount, method, notes FROM reservation_payments WHERE reservation_id=? ORDER BY created_at, rowid').all(id);
function enablePolicy() {
  policy.savePolicy(ORG, { ...policy.DEFAULT_POLICY, enabled: true });
}

test('separador Pagamentos: pagamento parcial atualiza a cache e o estado do pagamento', async () => {
  reservation();
  const res = await call(payments.addPayment, { amount: 50, method: 'transferencia', payment_date: '2035-01-10' }, { id: 'res' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(ledger(), [{ amount: 50, method: 'transferencia', notes: null }]);
  assert.equal(row().amount_paid, 50);
  assert.equal(row().payment_status, 'parcial');
  assert.equal(row().status, 'confirmada');
});

test('separador Pagamentos: liquidar a reserva marca confirmado', async () => {
  reservation();
  await call(payments.addPayment, { amount: 200, method: 'numerario' }, { id: 'res' });
  assert.equal(row().payment_status, 'confirmado');
  assert.equal(row().amount_paid, 200);
});

test('separador Pagamentos: apagar volta a pendente e recusa movimentos Stripe', async () => {
  reservation();
  const added = await call(payments.addPayment, { amount: 80 }, { id: 'res' });
  const removed = await call(payments.deletePayment, {}, { id: 'res', paymentId: added.body.data.id });
  assert.equal(removed.statusCode, 200);
  assert.equal(row().amount_paid, 0);
  assert.equal(row().payment_status, 'pendente');
  db.prepare("INSERT INTO reservation_payments(id,reservation_id,organization_id,amount,method) VALUES ('stripe-payment-x','res',?,10,'Stripe')").run(ORG);
  const refused = await call(payments.deletePayment, {}, { id: 'res', paymentId: 'stripe-payment-x' });
  assert.equal(refused.statusCode, 409);
});

test('separador Pagamentos: montante inválido ou excessivo é recusado', async () => {
  reservation();
  assert.equal((await call(payments.addPayment, { amount: 0 }, { id: 'res' })).statusCode, 400);
  assert.equal((await call(payments.addPayment, { amount: 1000000 }, { id: 'res' })).statusCode, 400);
  assert.deepEqual(ledger(), []);
});

test('política: atingir o sinal confirma e apagar o pagamento volta a aguardar pagamento', async () => {
  enablePolicy();
  reservation({ status: 'aguardar_pagamento' });
  policy.attachPolicy(row());
  const deposit = policy.planFor(row()).depositCents / 100;
  const added = await call(payments.addPayment, { amount: deposit }, { id: 'res' });
  assert.equal(row().status, 'confirmada');
  await call(payments.deletePayment, {}, { id: 'res', paymentId: added.body.data.id });
  assert.equal(row().status, 'aguardar_pagamento');
});

test('criação com valor pago regista o movimento no ledger', async () => {
  const res = await call(write.create, {
    accommodation_id: 'unit', check_in: '2035-07-01', check_out: '2035-07-03', num_guests: 2,
    guest: { name: 'Novo', email: 'novo@example.com' }, total_amount: 300, amount_paid: 100,
    payment_method: 'mbway', payment_date: '2035-01-02',
  });
  assert.equal(res.statusCode, 201);
  const id = res.body.data.id;
  assert.equal(row(id).amount_paid, 100);
  assert.equal(row(id).payment_status, 'parcial');
  assert.deepEqual(ledger(id).map(e => [e.amount, e.method]), [[100, 'mbway']]);
});

test('o estado do pagamento enviado pelo cliente não substitui o valor pago', async () => {
  reservation();
  await call(write.update, { payment_status: 'confirmado' }, { id: 'res' });
  assert.equal(row().payment_status, 'pendente');
});

test('apagar um movimento que deixaria saldo negativo é recusado', async () => {
  reservation();
  db.prepare("INSERT INTO reservation_payments(id,reservation_id,organization_id,amount) VALUES ('p1','res',?,100), ('p2','res',?,-60)").run(ORG, ORG);
  db.prepare("UPDATE reservations SET amount_paid=40 WHERE id='res'").run();
  const res = await call(payments.deletePayment, {}, { id: 'res', paymentId: 'p1' });
  assert.equal(res.statusCode, 409);
  assert.equal(ledger().length, 2);
});

// Decisão 5: os pagamentos registam-se só no separador Pagamentos.
test('a edição não altera o valor pago nem cria ajustes no ledger', async () => {
  reservation();
  const res = await call(write.update, { amount_paid: 200 }, { id: 'res' });
  assert.equal(res.statusCode, 409);
  assert.deepEqual(ledger(), []);
  assert.equal(row().amount_paid, 0);
  // Enviar o mesmo valor (formulário antigo) não é uma alteração.
  assert.equal((await call(write.update, { amount_paid: 0, notes: 'nota' }, { id: 'res' })).statusCode, 200);
});

test('alterar o total recalcula o estado do pagamento a partir do ledger', async () => {
  reservation();
  await call(payments.addPayment, { amount: 150 }, { id: 'res' });
  assert.equal(row().payment_status, 'parcial');
  await call(write.update, { total_amount: 150 }, { id: 'res' });
  assert.equal(row().payment_status, 'confirmado');
});

// Decisão 3: cada pagamento registado pede o email de pagamento ao hóspede.
test('cada pagamento no separador Pagamentos pede o email de pagamento, sem repetir em pedidos repetidos', async () => {
  reservation();
  const key = 'intent-payment-0001';
  await call(payments.addPayment, { amount: 50, idempotency_key: key }, { id: 'res' });
  await call(payments.addPayment, { amount: 50, idempotency_key: key }, { id: 'res' });
  await call(payments.addPayment, { amount: 150 }, { id: 'res' });
  await require('../services/reservationEvents').dispatchPending();
  assert.deepEqual(sent.map(s => [s.name, s.amount]), [['sendPaymentConfirmationEmail', 50], ['sendPaymentConfirmationEmail', 150]]);
});

// Regra única (reservationState): sem política, o pagamento integral confirma,
// seja manual ou pela Stripe. Antes, só a Stripe e a edição confirmavam.
test('pagamento manual sem política: o pagamento integral confirma, o parcial não', async () => {
  reservation({ status: 'aguardar_pagamento' });
  await call(payments.addPayment, { amount: 50 }, { id: 'res' });
  assert.equal(row().status, 'aguardar_pagamento');
  await call(payments.addPayment, { amount: 150 }, { id: 'res' });
  assert.equal(row().payment_status, 'confirmado');
  assert.equal(row().status, 'confirmada');
});

test('pré-check-in concluído confirma, salvo sinal da política por pagar', () => {
  const { savePrecheckin } = require('../services/publicGuestService');
  reservation({ status: 'pre_checkin' });
  savePrecheckin(row(), { name: 'Hóspede', email: 'hospede@example.com' }, [], null);
  assert.equal(row().status, 'confirmada');
  db.exec("DELETE FROM reservations");
  enablePolicy();
  reservation({ status: 'pre_checkin' });
  policy.attachPolicy({ id: 'res', organization_id: ORG });
  savePrecheckin(row(), { name: 'Hóspede', email: 'hospede@example.com' }, [], null);
  assert.equal(row().status, 'aguardar_pagamento');
});
