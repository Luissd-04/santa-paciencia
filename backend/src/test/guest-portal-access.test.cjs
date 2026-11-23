// Portal do hóspede (/reserva/:token): o código da porta, o Wi-Fi e as
// instruções de entrada só saem do servidor da véspera da entrada ao dia da
// saída e com a reserva paga (a regra do email «Tudo para a sua chegada»); os
// dados vêm do alojamento principal quando a unidade não os tem.
const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-portal-access-'));
const originalCwd = process.cwd();
process.chdir(temp);
process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.EMAIL_ENABLED = 'false';
process.env.PUBLIC_APP_URL = 'https://reservas.example.com';
const { db, initDatabase } = require('../config/database');
initDatabase();
const portal = require('../services/guestPortal');
const { localDay, addDays } = require('../services/dates');
const controller = require('../controllers/publicBookingController');
after(() => { db.close(); process.chdir(originalCwd); fs.rmSync(temp, { recursive: true, force: true }); });

const ORG = 'org-portal';
const TOKEN = 'c'.repeat(64);
const SECRET = { door: '4821#', wifi: 'oliveira-secreta' };
beforeEach(() => {
  db.exec(`DELETE FROM reservations; DELETE FROM guests; DELETE FROM accommodations; DELETE FROM organizations;
    INSERT INTO organizations(id,name,slug) VALUES ('${ORG}','Org','org');
    INSERT INTO accommodations(id,organization_id,name,type,price_per_night,max_guests,address,postal_code,city,public_slug,
        color,logo_url,wifi_name,wifi_password,door_code,checkin_time,checkout_time,contact_phone,
        arrival_instructions,entry_instructions,checkout_instructions,review_url)
      VALUES ('casa','${ORG}','Casa do Monte','alojamento',100,4,'Rua do Monte 1','7000-123','Évora','casa-do-monte',
        '#2f5f86','/uploads/logo.png','Monte','${SECRET.wifi}','${SECRET.door}','16:00','10:30','+351 912 000 000',
        'Portão verde.','Chave no cofre.','Lavar a loiça\nDeixar a chave','https://g.page/r/casa/review');
    INSERT INTO accommodations(id,organization_id,name,type,price_per_night,max_guests,parent_id)
      VALUES ('suite','${ORG}','Suite Oliveira','suite',80,2,'casa');
    INSERT INTO guests(id,organization_id,name,first_name,email,notes) VALUES ('g','${ORG}','Célia Marques','Célia','c@example.com','nota interna');`);
});

function reservation({ checkIn, checkOut, status = 'confirmada', paid = 200, total = 200 }) {
  db.prepare(`INSERT INTO reservations(id,organization_id,guest_id,accommodation_id,check_in,check_out,nights,num_guests,
      total_amount,amount_paid,status,payment_status,channel,public_token,notes)
    VALUES ('r1',?, 'g','suite',?,?,2,2,?,?,?,?,'website',?,'nota da equipa')`)
    .run(ORG, checkIn, checkOut, total, paid, status, paid >= total ? 'confirmado' : (paid > 0 ? 'parcial' : 'pendente'), TOKEN);
  return db.prepare("SELECT * FROM reservations WHERE id = 'r1'").get();
}
const today = localDay();
const leaks = value => JSON.stringify(value).includes(SECRET.door) || JSON.stringify(value).includes(SECRET.wifi) || JSON.stringify(value).includes('Chave no cofre');

test('antes da véspera: sem código, Wi-Fi nem instruções de entrada (só a data em que aparecem)', () => {
  const r = reservation({ checkIn: addDays(today, 5), checkOut: addDays(today, 7) });
  const p = portal.build(r);
  assert.equal(p.access, null);
  assert.equal(p.access_opens_on, addDays(today, 4));
  assert.equal(leaks(p), false);
});

test('na véspera, com a reserva paga: código, Wi-Fi e como entrar', () => {
  const r = reservation({ checkIn: addDays(today, 1), checkOut: addDays(today, 3) });
  const p = portal.build(r);
  assert.deepEqual(p.access, { door_code: SECRET.door, entry_instructions: 'Chave no cofre.', wifi_name: 'Monte', wifi_password: SECRET.wifi });
  assert.equal(p.access_opens_on, '');
});

test('na véspera, sem a reserva paga na totalidade: nada sensível', () => {
  const r = reservation({ checkIn: addDays(today, 1), checkOut: addDays(today, 3), paid: 50 });
  assert.equal(leaks(portal.build(r)), false);
  db.exec('DELETE FROM reservations');
  const waiting = reservation({ checkIn: addDays(today, 1), checkOut: addDays(today, 3), status: 'aguardar_pagamento', paid: 0 });
  const p = portal.build(waiting);
  assert.equal(leaks(p), false);
  assert.equal(p.arrival, null);
});

test('durante a estadia sim; depois da saída não (e aparece o link de avaliação)', () => {
  const during = reservation({ checkIn: addDays(today, -1), checkOut: addDays(today, 1), status: 'check_in' });
  assert.equal(portal.build(during).access.door_code, SECRET.door);
  // No próprio dia da saída ainda aparece.
  db.exec('DELETE FROM reservations');
  const lastDay = reservation({ checkIn: addDays(today, -2), checkOut: today, status: 'check_in' });
  assert.equal(portal.build(lastDay).access.door_code, SECRET.door);
  db.exec('DELETE FROM reservations');
  const past = reservation({ checkIn: addDays(today, -3), checkOut: addDays(today, -1), status: 'check_out' });
  const p = portal.build(past);
  assert.equal(leaks(p), false);
  assert.equal(p.review_url, 'https://g.page/r/casa/review');
  // Confirmada mas com a saída já passada (estado por atualizar): também não.
  db.exec('DELETE FROM reservations');
  assert.equal(leaks(portal.build(reservation({ checkIn: addDays(today, -3), checkOut: addDays(today, -1) }))), false);
});

test('«Sem Wi-Fi» no alojamento principal: o Wi-Fi não sai, o código sim', () => {
  db.exec("UPDATE accommodations SET no_wifi = 1 WHERE id = 'casa'");
  const r = reservation({ checkIn: addDays(today, 1), checkOut: addDays(today, 3) });
  const p = portal.build(r);
  assert.equal(p.access.wifi_password, '');
  assert.equal(p.access.wifi_name, '');
  assert.equal(p.access.door_code, SECRET.door);
  assert.equal(p.no_wifi, true);
});

test('a unidade herda do alojamento principal: logótipo, cor, horas, chegada, saída e contacto', () => {
  const r = reservation({ checkIn: addDays(today, 10), checkOut: addDays(today, 12) });
  const p = portal.build(r, { mediaUrl: url => `https://cdn.example.com${url}` });
  assert.equal(p.guest_first_name, 'Célia');
  assert.equal(p.logo_url, 'https://cdn.example.com/uploads/logo.png');
  assert.equal(p.color, '#2f5f86');
  assert.equal(p.checkin_time, '16:00');
  assert.equal(p.checkout_time, '10:30');
  assert.equal(p.arrival.address, 'Rua do Monte 1, 7000-123 Évora');
  assert.match(p.arrival.maps_url, /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=Rua%20do%20Monte/);
  assert.equal(p.arrival.instructions, 'Portão verde.');
  assert.deepEqual(p.checkout_steps, ['Lavar a loiça', 'Deixar a chave']);
  assert.equal(p.booking_url, 'https://reservas.example.com/reservar/casa-do-monte');
  assert.equal(p.review_url, '');
  // Um valor próprio da unidade prevalece.
  db.exec("UPDATE accommodations SET door_code = '9999' WHERE id = 'suite'");
  db.exec('DELETE FROM reservations');
  const eve = reservation({ checkIn: addDays(today, 1), checkOut: addDays(today, 3) });
  assert.equal(portal.build(eve).access.door_code, '9999');
});

test('a API pública não envia os códigos fora da janela nem notas internas', () => {
  reservation({ checkIn: addDays(today, 5), checkOut: addDays(today, 7) });
  let body;
  const res = { status() { return this; }, json(payload) { body = payload; return this; } };
  controller.getReservationStatus({ params: { token: TOKEN }, get: () => 'reservas.example.com', protocol: 'https', headers: {} }, res);
  assert.equal(body.success, true);
  assert.equal(body.data.portal.guest_first_name, 'Célia');
  assert.equal(body.data.contact.phone, '+351 912 000 000');
  assert.equal(leaks(body), false);
  assert.doesNotMatch(JSON.stringify(body), /nota (interna|da equipa)|c@example\.com|Marques/);
});
