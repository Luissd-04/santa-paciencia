// Sem política de pagamento cobra-se o total ao aceitar (decisão do produto de
// 25/11/2026), o voucher não desconta a taxa turística e o prazo do pagamento
// nunca passa da entrada. Um sinal parcial fora do prazo avisa a gestão.
const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-fulldeposit-'));
const originalCwd = process.cwd();
process.chdir(temp);
Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test', EMAIL_ENABLED: 'false', PUBLIC_APP_URL: 'https://exemplo.invalid',
  RESERVATION_EVENTS_DISPATCH: 'manual', TZ: 'Europe/Lisbon' });
const { db, initDatabase } = require('../config/database');
initDatabase();
require('../services/operationalTasksService').syncReservationOperationalTasks = () => {};
require('../services/calendarService').kickCalendarQueue = () => {};
const policy = require('../services/paymentPolicy');
const lifecycle = require('../services/reservationLifecycle');
const emailService = require('../services/emailService');
const { voucherDiscount } = require('../services/voucherService');
const { dashboardToday } = require('../services/dashboardToday');
const dates = require('../services/dates');

const ORG = 'org-full';
const addDays = (n) => dates.addDays(dates.localDay(new Date()), n);
beforeEach(() => {
  db.exec(`DELETE FROM reservation_event_effects; DELETE FROM reservation_events; DELETE FROM reservation_payments;
    DELETE FROM reservation_history; DELETE FROM reservations; DELETE FROM guests; DELETE FROM accommodations;
    DELETE FROM organization_settings; DELETE FROM organizations;
    INSERT INTO organizations(id,name,slug) VALUES ('${ORG}','Full','full');
    INSERT INTO accommodations(id,organization_id,name,type,price_per_night,max_guests) VALUES ('casa','${ORG}','Casa','alojamento',100,4);
    INSERT INTO guests(id,organization_id,name,email) VALUES ('g','${ORG}','Ana','ana@example.com');`);
});
after(() => { db.close(); process.chdir(originalCwd); fs.rmSync(temp, { recursive: true, force: true }); });

function reservation(over = {}) {
  const r = { id: 'r1', organization_id: ORG, guest_id: 'g', accommodation_id: 'casa', check_in: addDays(40), check_out: addDays(43), nights: 3,
    num_guests: 1, total_amount: 309, amount_paid: 0, status: 'pendente', channel: 'website', public_token: 'a'.repeat(64),
    created_at: dates.localDay(new Date()) + ' 10:00:00', ...over };
  db.prepare(`INSERT INTO reservations(${Object.keys(r).join(',')}) VALUES (${Object.keys(r).map(() => '?').join(',')})`).run(...Object.values(r));
  return db.prepare('SELECT * FROM reservations WHERE id = ?').get(r.id);
}
const row = () => db.prepare("SELECT * FROM reservations WHERE id = 'r1'").get();
const enablePolicy = () => policy.savePolicy(ORG, { ...policy.DEFAULT_POLICY, enabled: true });
const emailVars = r => emailService.buildVars({ name: 'Ana', first_name: 'Ana', email: 'a@x.pt' }, r,
  { name: 'Casa' }, { property_name: 'Casa' }, {});
const eur = cents => (cents / 100).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' });
const norm = value => String(value).replace(/\s/g, ' ');

test('sem política: email, ficha e Stripe pedem o mesmo valor, o total', () => {
  const r = reservation({ status: 'aguardar_pagamento' });
  assert.equal(policy.paysInFull(r), true);
  assert.equal(policy.requiredDepositCents(r), 30900, 'ficha da equipa');
  assert.equal(policy.amountDue(r), 30900, 'sessão Stripe e portal');
  const vars = emailVars(r);
  assert.equal(norm(vars.valor_sinal), norm(eur(30900)), 'email «reserva aceite»');
  assert.equal(vars.pagamento_total, '1');
  assert.equal(vars.valor_sinal_exigido, '');
});

test('com política ativa: continua o sinal (50 %) e os três valores coincidem', () => {
  enablePolicy();
  const r = reservation({ status: 'aguardar_pagamento' });
  assert.equal(policy.paysInFull(r), false);
  const deposit = policy.requiredDepositCents(r);
  assert.equal(deposit, 15450);
  assert.equal(norm(emailVars(r).valor_sinal), norm(eur(deposit)));
  assert.equal(emailVars(r).pagamento_total, '');
  // Reserva com a política já contratada: o sinal da reserva.
  policy.attachPolicy(r);
  const contracted = db.prepare('SELECT * FROM reservations WHERE id = ?').get('r1');
  assert.equal(policy.paysInFull(contracted), false);
  assert.equal(policy.amountDue(contracted), policy.requiredDepositCents(contracted));
});

test('sem política ativa mas com uma política guardada desligada: continua a ser o total', () => {
  policy.savePolicy(ORG, { ...policy.DEFAULT_POLICY, enabled: false });
  assert.equal(policy.requiredDepositCents(reservation()), 30900);
});

test('voucher percentual e fixo não descontam a taxa turística', () => {
  const pct = { type: 'discount_pct', value: 10 };
  // 309 € = 300 de estadia + 9 de taxa turística.
  assert.equal(voucherDiscount(pct, 309, [], 9), 30, '10 % de 300 €, não de 309 €');
  assert.equal(voucherDiscount(pct, 309), 30.9, 'sem taxa indicada, como antes');
  assert.equal(voucherDiscount({ type: 'discount_fixed', value: 50 }, 309, [], 9), 50);
  assert.equal(voucherDiscount({ type: 'discount_fixed', value: 500 }, 309, [], 9), 300, 'o valor fixo pára na estadia');
  assert.equal(voucherDiscount({ type: 'discount_pct', value: 100 }, 309, [], 9), 300, 'a taxa continua a pagar-se');
  // Mesma regra no cliente.
  const sandbox = { window: {} };
  new Function('window', fs.readFileSync(path.join(__dirname, '../../../frontend/js/domain/pricing.js'), 'utf8'))(sandbox.window);
  const client = sandbox.window.ReservationPricing.voucherDiscount;
  for (const [voucher, total, tax] of [[pct, 309, 9], [{ type: 'discount_fixed', value: 500 }, 309, 9], [{ type: 'discount_pct', value: 33.3 }, 212, 12]]) {
    assert.equal(client(voucher, total, [], tax), voucherDiscount(voucher, total, [], tax), 'cliente e servidor iguais');
  }
});

test('o prazo do pagamento é limitado ao início do dia da entrada menos 1 h', () => {
  const now = new Date('2035-03-01T10:00:00Z');
  const far = lifecycle.depositDeadline({ check_in: '2035-04-01' }, now);
  assert.equal(far, new Date(now.getTime() + lifecycle.DEPOSIT_TTL_HOURS * 3600000).toISOString(), 'entrada longe: o TTL');
  // Entrada a 3 de março: o dia começa às 00:00 de Lisboa (UTC no inverno), menos 1 h.
  assert.equal(lifecycle.depositDeadline({ check_in: '2035-03-03' }, now), '2035-03-02T23:00:00.000Z');
  // Entrada hoje: o limite já passou, dá-se pelo menos 1 h.
  assert.equal(lifecycle.depositDeadline({ check_in: '2035-03-01' }, now), '2035-03-01T11:00:00.000Z');
});

test('aprovar grava o prazo limitado à entrada', () => {
  reservation({ check_in: addDays(1), check_out: addDays(3) });
  lifecycle.approve(ORG, 'r1', { origin: 'https://exemplo.invalid' });
  const deadline = Date.parse(row().deposit_deadline);
  assert.ok(deadline < Date.now() + 48 * 3600000 - 3600000, 'antes das 48 h');
  assert.ok(deadline <= dates.zonedDateTime(addDays(1), '00:00').getTime() - 3600000 + 1000, 'até ao início do dia da entrada, menos 1 h');
});

test('aprovar um pedido com a entrada já passada: 409 com mensagem clara', () => {
  reservation({ check_in: addDays(-2), check_out: addDays(1) });
  assert.throws(() => lifecycle.approve(ORG, 'r1', { origin: 'https://exemplo.invalid' }),
    err => err.status === 409 && /entrada deste pedido já passou/.test(err.message));
  assert.equal(row().status, 'pendente');
});

test('sinal parcial fora do prazo: não cancela, mas avisa gestão e proprietário (não a equipa)', () => {
  enablePolicy();
  reservation({ status: 'aguardar_pagamento', amount_paid: 50, payment_status: 'parcial',
    deposit_deadline: new Date(Date.now() - 3600000).toISOString() });
  assert.equal(require('../services/reservationScheduler').expireUnpaidDeposits(), 0);
  assert.equal(row().status, 'aguardar_pagamento');
  const today = dates.localDay(new Date());
  assert.deepEqual(dashboardToday(ORG, today, new Date(), { role: 'manager' }).attention.depositOverdue.map(r => r.id), ['r1']);
  assert.deepEqual(dashboardToday(ORG, today, new Date(), { role: 'owner' }).attention.depositOverdue.map(r => r.id), ['r1']);
  assert.deepEqual(dashboardToday(ORG, today, new Date(), { role: 'staff' }).attention.depositOverdue, []);
  // Dentro do prazo não há aviso.
  db.prepare("UPDATE reservations SET deposit_deadline = ? WHERE id = 'r1'").run(new Date(Date.now() + 3600000).toISOString());
  assert.deepEqual(dashboardToday(ORG, today, new Date(), { role: 'manager' }).attention.depositOverdue, []);
});

// Dados reais em produção: uma reserva já confirmada nunca recua para «aguarda
// pagamento» por causa da regra do total nem por um aumento de preço.
test('confirmada antiga sem política, com pagamento parcial: o recálculo mantém-na confirmada', () => {
  const ledger = require('../services/financialLedger');
  reservation({ status: 'confirmada', amount_paid: 80, payment_status: 'parcial' });
  db.prepare("INSERT INTO reservation_payments(id,reservation_id,organization_id,amount,method,payment_date) VALUES('p1','r1',?,80,'transferencia','2035-01-01')").run(ORG);
  const result = ledger.recompute('r1', ORG);
  assert.equal(result.status, 'confirmada');
  assert.equal(row().status, 'confirmada');
  assert.equal(row().payment_status, 'parcial');
});

test('confirmada com o sinal pago e aumento do total: continua confirmada', () => {
  const ledger = require('../services/financialLedger');
  enablePolicy();
  reservation({ status: 'confirmada', amount_paid: 154.5, payment_status: 'parcial' });
  db.prepare("INSERT INTO reservation_payments(id,reservation_id,organization_id,amount,method,payment_date) VALUES('p1','r1',?,154.5,'transferencia','2035-01-01')").run(ORG);
  db.prepare("UPDATE reservations SET total_amount = 600 WHERE id = 'r1'").run();
  assert.equal(ledger.recompute('r1', ORG).status, 'confirmada');
  assert.equal(row().status, 'confirmada');
  // Só um pedido explícito (apagar o pagamento) pode recuar.
  db.exec("DELETE FROM reservation_payments");
  assert.equal(ledger.recompute('r1', ORG, { allowDowngrade: true }).status, 'aguardar_pagamento');
});
