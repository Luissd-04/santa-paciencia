// Emails ao hóspede só com dados do alojamento: nada fixo de outra marca
// (logótipo, Facebook, nome, licença ou horas) e os dados novos do alojamento.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-guest-data-'));
const originalCwd = process.cwd();
process.chdir(temp);
process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.EMAIL_ENABLED = 'false';
process.env.PUBLIC_APP_URL = 'https://reservas.example.com';
const { db, initDatabase } = require('../config/database');
initDatabase();
const emailService = require('../services/emailService');
const guestInfo = require('../services/accommodationGuestInfo');
after(() => { db.close(); process.chdir(originalCwd); fs.rmSync(temp, { recursive: true, force: true }); });

db.exec(`INSERT INTO organizations(id,name,slug) VALUES ('o1','Casa do Monte','casa-do-monte');
  INSERT INTO accommodations(id,organization_id,name,type,price_per_night,max_guests,address,postal_code,city,public_slug)
    VALUES ('casa','o1','Casa do Monte','alojamento',100,4,'Rua do Monte 1','7000-123','Évora','casa-do-monte');
  INSERT INTO accommodations(id,organization_id,name,type,price_per_night,max_guests,parent_id)
    VALUES ('suite','o1','Suite Oliveira','suite',80,2,'casa');`);

test('sem dados configurados, nada vem de outra marca', () => {
  const s = emailService.getEmailSettings(db.prepare("SELECT * FROM accommodations WHERE id='casa'").get(), 'o1');
  assert.equal(s.logo_url, '');
  assert.equal(s.facebook, '');
  assert.equal(s.property_name, 'Casa do Monte');
  assert.equal(s.license_number, '');
  assert.equal(s.checkin_time, '');
  assert.doesNotMatch(JSON.stringify(s), /santa ?paci[eê]ncia/i);
  const html = emailService.baseTemplate('<p>Olá</p>', s);
  assert.doesNotMatch(html, /santapaciencia|Santa Paciência/i);
});

test('um quarto usa a marca, a morada e os contactos do alojamento principal', () => {
  guestInfo.save('o1', 'casa', { contact_email: 'reservas@casadomonte.pt', contact_phone: '+351 912 000 000',
    review_url: 'https://g.page/r/casa/review', arrival_instructions: 'Porta verde.', no_wifi: true });
  db.prepare("UPDATE accommodations SET license_number='98765/AL', checkin_time='16:00' WHERE id='casa'").run();
  const s = emailService.getEmailSettings(db.prepare("SELECT * FROM accommodations WHERE id='suite'").get(), 'o1');
  assert.equal(s.property_name, 'Casa do Monte');
  assert.equal(s.property_address, 'Rua do Monte 1, 7000-123 Évora');
  assert.equal(s.email_contact, 'reservas@casadomonte.pt');
  assert.equal(s.phone, '+351 912 000 000');
  assert.equal(s.review_url, 'https://g.page/r/casa/review');
  assert.equal(s.arrival_instructions, 'Porta verde.');
  assert.equal(s.no_wifi, true);
  assert.equal(s.license_number, '98765/AL');
  assert.equal(s.checkin_time, '16:00');
  assert.equal(s.booking_url, 'https://reservas.example.com/reservar/casa-do-monte');
});

test('os dados novos são validados', () => {
  assert.throws(() => guestInfo.normalize({ contact_email: 'nao-e-email' }), /email de contacto/);
  assert.throws(() => guestInfo.normalize({ review_url: 'http://inseguro.pt' }), /https/);
  assert.throws(() => guestInfo.normalize({ arrival_instructions: 'x'.repeat(2001) }), /limite/);
  assert.deepEqual(guestInfo.normalize({ contact_phone: '  ' }), { contact_phone: null });
});
