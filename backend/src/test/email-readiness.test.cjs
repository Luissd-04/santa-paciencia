// Dados obrigatórios: sem eles o email ao hóspede fica retido, o sino diz o
// que falta e, com o alojamento completo, oferece Enviar ou Ignorar.
const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-readiness-'));
const originalCwd = process.cwd();
process.chdir(temp);
Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test', EMAIL_ENABLED: 'true', PUBLIC_APP_URL: 'https://reservas.example.com', RESERVATION_EVENTS_DISPATCH: 'manual' });
const { db, initDatabase } = require('../config/database');
initDatabase();
db.exec("INSERT INTO organizations(id,name,slug) VALUES ('o','Casa','casa')");
initDatabase();
const sent = [];
Object.assign(require('../config/googleEmail'), {
  isEmailAuthenticated: () => true,
  getEmailConnectionInfo: () => ({ email: 'casa@example.com', connected: true }),
  sendViaGmail: async (org, message) => { sent.push(message); return { id: `g-${sent.length}` }; },
});
let stripe = true;
require('../services/stripeClient').stripeEnabled = () => stripe;
const emailService = require('../services/emailService');
const readiness = require('../services/emailReadiness');
after(() => { db.close(); process.chdir(originalCwd); fs.rmSync(temp, { recursive: true, force: true }); });

const COMPLETE = `address='Rua A 1', license_number='1/AL', checkin_time='15:00', checkout_time='11:00', contact_email='casa@example.com'`;
beforeEach(() => {
  sent.length = 0; stripe = true;
  db.exec(`DELETE FROM email_holds; DELETE FROM email_deliveries; DELETE FROM reservations; DELETE FROM guests; DELETE FROM accommodations;
    INSERT INTO guests(id,organization_id,name,email) VALUES ('g','o','Ana','ana@example.com');
    INSERT INTO accommodations(id,organization_id,name,type,price_per_night,max_guests) VALUES ('casa','o','Casa','alojamento',100,2);
    INSERT INTO reservations(id,organization_id,guest_id,accommodation_id,check_in,check_out,nights,num_guests,total_amount,amount_paid,status,channel,public_token)
      VALUES ('r','o','g','casa','2035-06-10','2035-06-12',2,2,200,0,'aguardar_pagamento','website','${'a'.repeat(64)}');`);
});
const row = table => db.prepare(`SELECT * FROM ${table} WHERE id=?`);
const res = () => row('reservations').get('r');
const unit = () => row('accommodations').get('casa');
const guest = () => row('guests').get('g');

test('sem os dados obrigatórios, o email fica retido e não sai', async () => {
  const result = await emailService.sendReservationAcceptedEmail(guest(), res(), unit());
  assert.equal(result.held, true);
  assert.deepEqual(result.missing.map(m => m.field), ['email_contact', 'property_address', 'license_number', 'checkin_time', 'checkout_time']);
  assert.equal(sent.length, 0);
  const [held] = readiness.openHolds('o');
  assert.equal(held.template_slug, 'reserva_aceite');
  assert.equal(held.missing.length, 5);
});

test('com o alojamento completo, «Enviar» envia o email retido e tira-o do sino', async () => {
  await emailService.sendReservationAcceptedEmail(guest(), res(), unit(), 'https://reservas.example.com/pre-checkin/x');
  db.exec(`UPDATE accommodations SET ${COMPLETE}`);
  const [ready] = readiness.openHolds('o');
  assert.deepEqual(ready.missing, []);
  await emailService.sendHeldEmail('o', 'r', 'reserva_aceite');
  assert.equal(sent.length, 1);
  assert.match(sent[0].subject, /Reserva aceite/);
  assert.match(sent[0].html, /pre-checkin\/x/, 'usa os dados guardados com o email retido');
  assert.equal(readiness.openHolds('o').length, 0);
  assert.equal(db.prepare('SELECT resolution FROM email_holds').get().resolution, 'sent');
});

test('«Enviar» recusa enquanto faltar algo; «Ignorar» resolve sem enviar', async () => {
  await emailService.sendReservationAcceptedEmail(guest(), res(), unit());
  await assert.rejects(emailService.sendHeldEmail('o', 'r', 'reserva_aceite'), /Ainda falta/);
  assert.equal(readiness.resolve('o', 'r', 'reserva_aceite', 'dismissed'), 1);
  assert.equal(readiness.openHolds('o').length, 0);
  assert.equal(sent.length, 0);
});

test('reserva aceite exige a Stripe ligada; a chegada exige as instruções; o obrigado, o link de avaliação', () => {
  db.exec(`UPDATE accommodations SET ${COMPLETE}`);
  stripe = false;
  const { emails } = readiness.forAccommodation('o', unit());
  const by = Object.fromEntries(emails.map(e => [e.slug, e.missing.map(m => m.field)]));
  assert.deepEqual(by.reserva_aceite, ['stripe']);
  assert.deepEqual(by.coordenadas, ['arrival_instructions', 'entry', 'checkout_instructions']);
  assert.deepEqual(by.obrigado, ['review_url']);
  assert.deepEqual(by.confirmacao, []);
  db.exec("UPDATE accommodations SET door_code='1234', arrival_instructions='Porta verde', checkout_instructions='Deixe a chave', review_url='https://g.page/r/x'");
  assert.deepEqual(readiness.forAccommodation('o', unit()).emails.find(e => e.slug === 'coordenadas').missing, [], 'o código da porta chega para «como entrar»');
});

test('o telefone é opcional', () => {
  db.exec(`UPDATE accommodations SET ${COMPLETE}`);
  const { emails } = readiness.forAccommodation('o', unit());
  assert.ok(emails.every(e => !e.missing.some(m => m.field === 'contact_phone')));
  assert.deepEqual(emails.find(e => e.slug === 'pagamento').missing, []);
});

test('aviso com antecedência para reservas aceites e email retido expira quando deixa de fazer sentido', async () => {
  db.exec("UPDATE reservations SET status='confirmada', check_in='2035-06-10'");
  const [gap] = readiness.upcomingGaps('o');
  assert.equal(gap.accommodation_id, 'casa');
  assert.equal(gap.reservations, 1);
  assert.ok(gap.missing.some(m => m.field === 'review_url'));
  await emailService.sendPaymentConfirmationEmail(guest(), res(), unit(), { amount: 50 });
  assert.equal(readiness.openHolds('o').length, 1);
  db.exec("UPDATE reservations SET status='cancelada'");
  assert.equal(readiness.openHolds('o').length, 0);
  assert.equal(db.prepare('SELECT resolution FROM email_holds').get().resolution, 'expired');
});
