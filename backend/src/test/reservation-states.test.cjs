// Os três estados de uma reserva (reserva, pagamento, pré-check-in) e os
// passos que a equipa pode dar: regras puras (reservationState) e os mesmos
// passos pela API (criação, edição, cancelamento, ficha e cotação).
const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-states-'));
const originalCwd = process.cwd();
process.chdir(temp);
process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.EMAIL_ENABLED = 'false';
process.env.PUBLIC_APP_URL = 'http://localhost:3001';
process.env.RESERVATION_EVENTS_DISPATCH = 'manual';
const { db, initDatabase } = require('../config/database');
initDatabase();
require('../services/operationalTasksService').syncReservationOperationalTasks = () => {};
require('../services/calendarService').kickCalendarQueue = () => {};

const state = require('../services/reservationState');
const policy = require('../services/paymentPolicy');
const write = require('../controllers/reservationWriteController');
const reservations = require('../controllers/reservationController');
const payments = require('../controllers/reservationPaymentsController');

const ORG = 'org-states';
beforeEach(() => {
  db.exec(`DELETE FROM reservation_events; DELETE FROM reservation_payments; DELETE FROM reservation_history;
    DELETE FROM reservations; DELETE FROM guests; DELETE FROM accommodations; DELETE FROM organization_settings; DELETE FROM organizations;
    INSERT INTO organizations(id,name,slug) VALUES ('${ORG}','Estados','estados');
    INSERT INTO guests(id,organization_id,name,email) VALUES ('guest','${ORG}','Hóspede','hospede@example.com');
    INSERT INTO accommodations(id,organization_id,name,type,price_per_night,max_guests) VALUES ('unit','${ORG}','Quarto','alojamento',100,4);`);
});
after(() => { db.close(); process.chdir(originalCwd); fs.rmSync(temp, { recursive: true, force: true }); });

async function call(fn, body = {}, params = {}) {
  const req = { body, params, query: {}, ip: '127.0.0.1', protocol: 'http', get: () => 'test.invalid',
    user: { id: 'manager', role: 'manager', organization_id: ORG } };
  const res = { statusCode: 200, status(n) { this.statusCode = n; return this; }, json(data) { this.body = data; return this; } };
  await fn(req, res, error => { res.status(error.status || 500).json({ error: error.message, code: error.code }); });
  return res;
}
function reservation(overrides = {}) {
  const r = { id: 'res', organization_id: ORG, guest_id: 'guest', accommodation_id: 'unit', check_in: '2035-06-01',
    check_out: '2035-06-03', nights: 2, num_guests: 2, total_amount: 200, amount_paid: 0, payment_status: 'pendente',
    status: 'aguardar_pagamento', channel: 'direto', ...overrides };
  db.prepare(`INSERT INTO reservations(${Object.keys(r).join(',')}) VALUES (${Object.keys(r).map(() => '?').join(',')})`).run(...Object.values(r));
}
const row = () => db.prepare("SELECT * FROM reservations WHERE id='res'").get();

test('regras: o ciclo só avança e a confirmação vem do sinal', () => {
  const ok = { depositPaid: true, precheckin: 'preenchido' };
  assert.deepEqual(state.transition(null, 'confirmada', { depositPaid: false }), { status: 'aguardar_pagamento' });
  assert.deepEqual(state.transition('pendente', 'confirmada', { depositPaid: true }), { status: 'confirmada' });
  // Entre «aguarda sinal» e «confirmada» decide o dinheiro, nunca a escolha.
  assert.deepEqual(state.transition('aguardar_pagamento', 'confirmada', ok), { status: 'aguardar_pagamento' });
  assert.deepEqual(state.transition('confirmada', 'check_in', ok), { status: 'check_in' });
  assert.match(state.transition('aguardar_pagamento', 'check_in', ok).error, /falta o sinal/);
  assert.match(state.transition('confirmada', 'check_in', { precheckin: 'enviado' }).error, /pré-check-in ainda não foi preenchido/);
  assert.match(state.transition('confirmada', 'check_out', ok).error, /depois do check-in/);
  assert.match(state.transition('check_out', 'cancelada', ok).error, /não pode passar/);
  assert.match(state.transition(null, 'check_in', ok).error, /reserva nova/);
  assert.deepEqual(state.statusOptions(null, { depositPaid: false }), ['aguardar_pagamento', 'pre_reserva', 'pendente']);
  assert.deepEqual(state.statusOptions('confirmada', ok), ['confirmada', 'check_in', 'cancelada']);
  assert.deepEqual(state.statusOptions('check_out', ok), ['check_out']);
  assert.equal(state.precheckinState({}), 'nao_enviado');
  assert.equal(state.precheckinState({ precheckin_sent_at: 'x' }), 'enviado');
  assert.equal(state.precheckinState({ precheckin_sent_at: 'x', precheckin_submitted_at: 'y' }), 'preenchido');
});

test('sinal: plataformas e reservas sem valor não têm sinal; diretas seguem as regras das definições', () => {
  const base = { organization_id: ORG, total_amount: 200, check_in: '2035-06-01', created_at: '2035-01-01 10:00:00' };
  assert.equal(policy.requiredDepositCents({ ...base, channel: 'booking' }), 0);
  assert.equal(policy.requiredDepositCents({ ...base, channel: 'direto', total_amount: 0 }), 0);
  assert.equal(policy.requiredDepositCents({ ...base, channel: 'direto' }), 4000, '20% a mais de 90 dias');
  assert.equal(policy.requiredDepositCents({ ...base, channel: 'website', created_at: '2035-05-25 10:00:00' }), 20000, 'tudo a menos de 15 dias');
});

test('check-in pela edição: recusado sem sinal ou sem pré-check-in, com a explicação; aceite com os dois', async () => {
  reservation();
  let res = await call(write.update, { status: 'check_in' }, { id: 'res' });
  assert.equal(res.statusCode, 409);
  assert.match(res.body.error, /falta o sinal.*e o pré-check-in ainda não foi preenchido/);
  await call(payments.addPayment, { amount: 40 }, { id: 'res' });
  assert.equal(row().status, 'confirmada');
  res = await call(write.update, { status: 'check_in' }, { id: 'res' });
  assert.equal(res.statusCode, 409);
  assert.match(res.body.error, /^Não é possível fazer o check-in: o pré-check-in ainda não foi preenchido/);
  db.exec("UPDATE reservations SET precheckin_submitted_at = datetime('now') WHERE id = 'res'");
  res = await call(write.update, { status: 'check_in' }, { id: 'res' });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(row().status, 'check_in');
  assert.equal((await call(write.update, { status: 'confirmada' }, { id: 'res' })).statusCode, 409);
  assert.equal((await call(write.update, { status: 'check_out' }, { id: 'res' })).statusCode, 200);
  assert.equal((await call(reservations.cancel, {}, { id: 'res' })).statusCode, 409);
  assert.equal(row().status, 'check_out');
});

test('editar sem mudar o estado nem o dinheiro mantém uma reserva já confirmada', async () => {
  reservation({ status: 'confirmada' });
  assert.equal((await call(write.update, { status: 'confirmada', notes: 'Chega tarde' }, { id: 'res' })).statusCode, 200);
  assert.equal(row().status, 'confirmada');
  assert.equal(row().notes, 'Chega tarde');
});

test('ficha e cotação devolvem os três estados e as opções do seletor', async () => {
  reservation({ status: 'pre_reserva', precheckin_sent_at: '2035-01-01 10:00:00' });
  const detail = (await call(reservations.getById, {}, { id: 'res' })).body.data;
  assert.equal(detail.precheckin_state, 'enviado');
  assert.deepEqual(detail.status_options, ['pre_reserva', 'aguardar_pagamento', 'cancelada']);
  assert.equal(detail.can_pay_online, false);
  const quote = (await call(write.quote, { accommodation_id: 'unit', check_in: '2035-08-01', check_out: '2035-08-03',
    num_adults: 2, channel: 'airbnb' })).body.data;
  assert.deepEqual(quote.status_options, ['confirmada', 'pre_reserva', 'pendente']);
});
