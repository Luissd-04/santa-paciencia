// Prazo do sinal: o pedido do site espera pela equipa; ao aceitar, o sinal
// tem 48 h; sem pagamento, a reserva é cancelada e as datas ficam livres.
const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-deposit-'));
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
const lifecycle = require('../services/reservationLifecycle');
const scheduler = require('../services/reservationScheduler');

const ORG = 'org-dep';
beforeEach(() => {
  db.exec(`DELETE FROM reservation_event_effects; DELETE FROM reservation_events; DELETE FROM reservation_payments;
    DELETE FROM reservation_history; DELETE FROM stripe_payment_attempts; DELETE FROM reservations; DELETE FROM guests;
    DELETE FROM accommodations; DELETE FROM organizations;
    INSERT INTO organizations(id,name,slug) VALUES ('${ORG}','Dep','dep');
    INSERT INTO accommodations(id,organization_id,name,type,price_per_night,max_guests) VALUES ('casa','${ORG}','Casa','alojamento',100,4);
    INSERT INTO guests(id,organization_id,name,email) VALUES ('g','${ORG}','Ana','ana@example.com');
    INSERT INTO reservations(id,organization_id,guest_id,accommodation_id,check_in,check_out,nights,num_guests,total_amount,status,channel,public_token)
      VALUES ('r1','${ORG}','g','casa','2035-08-10','2035-08-12',2,1,200,'pendente','website','${'a'.repeat(64)}');`);
});
after(() => { db.close(); process.chdir(originalCwd); fs.rmSync(temp, { recursive: true, force: true }); });

const row = () => db.prepare("SELECT * FROM reservations WHERE id = 'r1'").get();
const expireNow = () => db.prepare("UPDATE reservations SET deposit_deadline = ? WHERE id = 'r1'").run(new Date(Date.now() - 1000).toISOString());

test('aceitar define o prazo do sinal a 48 h', () => {
  const before = Date.now();
  lifecycle.approve(ORG, 'r1', { origin: 'http://localhost:3001' });
  const r = row();
  assert.equal(r.status, 'aguardar_pagamento');
  const deadline = Date.parse(r.deposit_deadline);
  assert.ok(deadline >= before + 48 * 3600000 - 1000 && deadline <= Date.now() + 48 * 3600000 + 1000);
});

test('sem sinal no prazo: cancelada por «deposit», com email ao hóspede e aviso à equipa', () => {
  lifecycle.approve(ORG, 'r1', { origin: 'http://localhost:3001' });
  expireNow();
  assert.equal(scheduler.expireUnpaidDeposits(), 1);
  assert.equal(row().status, 'cancelada');
  const event = db.prepare("SELECT id, payload FROM reservation_events WHERE reservation_id='r1' AND type='reservation.cancelled'").get();
  assert.equal(JSON.parse(event.payload).reason, 'deposit');
  const effects = db.prepare('SELECT effect FROM reservation_event_effects WHERE event_id = ?').all(event.id).map(e => e.effect);
  assert.deepEqual(effects.sort(), ['guest_cancellation_email', 'staff_email_cancelled', 'staff_push_cancelled']);
});

test('dentro do prazo, com sinal pago ou com pagamento online em curso: não cancela', () => {
  lifecycle.approve(ORG, 'r1', { origin: 'http://localhost:3001' });
  assert.equal(scheduler.expireUnpaidDeposits(), 0);
  expireNow();
  db.prepare("INSERT INTO stripe_payment_attempts (id,reservation_id,organization_id,amount_cents,livemode,state,snapshot,request_json) VALUES ('sp','r1',?,10000,0,'processing','x','{}')").run(ORG);
  assert.equal(scheduler.expireUnpaidDeposits(), 0);
  db.exec("DELETE FROM stripe_payment_attempts; UPDATE reservations SET amount_paid = 50 WHERE id = 'r1'");
  assert.equal(scheduler.expireUnpaidDeposits(), 0);
  assert.equal(row().status, 'aguardar_pagamento');
});

test('um pedido ainda por aceitar não tem prazo do sinal', () => {
  assert.equal(row().deposit_deadline, null);
  assert.equal(scheduler.expireUnpaidDeposits(), 0);
});
