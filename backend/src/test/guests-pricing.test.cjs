// Hóspedes e preços partilhados entre o backoffice e o pedido público.
const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-guests-pricing-'));
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
require('../services/turnstileService').verify = async () => ({ success: true });
const write = require('../controllers/reservationWriteController');
const publicBooking = require('../controllers/publicBookingController');
const guests = require('../services/guestService');

const ORG = 'org-gp';
beforeEach(() => {
  db.exec(`DELETE FROM reservation_events; DELETE FROM voucher_redemptions; DELETE FROM vouchers; DELETE FROM accommodation_blocks;
    DELETE FROM reservation_history; DELETE FROM reservations; DELETE FROM guests; DELETE FROM pricing_periods;
    DELETE FROM accommodations; DELETE FROM organization_settings; DELETE FROM organizations;
    INSERT INTO organizations(id,name,slug) VALUES ('${ORG}','GP','gp');
    INSERT INTO accommodations(id,organization_id,name,type,price_per_night,max_guests,public_slug)
      VALUES ('casa','${ORG}','Casa','alojamento',120,4,'casa');
    INSERT INTO pricing_periods(id,organization_id,accommodation_id,name,start_date,end_date,price_per_night)
      VALUES ('verao','${ORG}','casa','Verão','2035-08-01','2035-08-31',150);
    INSERT INTO vouchers(id,organization_id,code,type,value,status,max_uses,min_nights)
      VALUES ('v10','${ORG}','DESC10','discount_pct',10,'active',5,1);`);
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
const stay = { check_in: '2035-08-10', check_out: '2035-08-13', num_guests: 2 };
const publicRequest = extra => call(publicBooking.createReservation, { accommodation_id: 'casa', ...stay,
  guest: { name: 'Site', email: 'site@example.com' }, guests_data: [{ name: 'Acompanhante' }], rgpd_consent: true, elapsed_ms: 9000, ...extra }, { slug: 'casa' });

test('pedido público e backoffice calculam o mesmo total, com voucher', async () => {
  const quote = await call(write.quote, { accommodation_id: 'casa', ...stay, voucher_code: 'DESC10' });
  assert.equal(quote.statusCode, 200, JSON.stringify(quote.body));
  const created = await publicRequest({ voucher_code: 'desc10' });
  assert.equal(created.statusCode, 201, JSON.stringify(created.body));
  assert.equal(created.body.data.total_amount, quote.body.data.total_amount);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM voucher_redemptions').get().n, 1);
});

test('pedido público ignora preços por noite e recusa vouchers inválidos', async () => {
  const forged = await publicRequest({ nightly_prices: [{ date: '2035-08-10', price: 0 }] });
  assert.equal(forged.statusCode, 201);
  assert.ok(forged.body.data.total_amount >= 450);
  db.exec("DELETE FROM reservations");
  assert.equal((await publicRequest({ voucher_code: 'x!' })).statusCode, 400);
  db.exec("UPDATE vouchers SET status = 'inactive'");
  assert.equal((await publicRequest({ voucher_code: 'DESC10' })).statusCode, 400);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM reservations').get().n, 0);
});

test('datas bloqueadas dão a mensagem de bloqueio, não de reserva ocupada', async () => {
  db.exec(`INSERT INTO accommodation_blocks(id,organization_id,accommodation_id,start_date,end_date,reason)
    VALUES ('b1','${ORG}','casa','2035-08-11','2035-08-12','Obras')`);
  const res = await call(write.create, { accommodation_id: 'casa', ...stay, guest: { name: 'Bloqueio' } });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.error, 'Estas datas estão bloqueadas (Obras).');
});

test('backoffice reencontra o hóspede pelo email e completa a ficha sem apagar dados', async () => {
  const first = await call(write.create, { accommodation_id: 'casa', check_in: '2035-09-01', check_out: '2035-09-03', num_guests: 1,
    guest: { name: 'Rita', email: 'rita@example.com', nif: '123456789' } });
  const second = await call(write.create, { accommodation_id: 'casa', check_in: '2035-10-01', check_out: '2035-10-03', num_guests: 1,
    guest: { email: 'rita@example.com', phone: '+351900000000' } });
  assert.equal(first.statusCode, 201); assert.equal(second.statusCode, 201);
  const rows = db.prepare("SELECT * FROM guests WHERE email = 'rita@example.com'").all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].nif, '123456789');
  assert.equal(rows[0].phone, '+351900000000');
});

test('sem email, o hóspede recebe um marcador único que nunca recebe emails', async () => {
  const res = await call(write.create, { accommodation_id: 'casa', check_in: '2035-11-01', check_out: '2035-11-03', num_guests: 1, guest: { name: 'Sem Email' } });
  const email = db.prepare('SELECT email FROM guests WHERE id = ?').get(db.prepare('SELECT guest_id FROM reservations WHERE id = ?').get(res.body.data.id).guest_id).email;
  assert.match(email, /^guest_[0-9a-f-]{36}@sem-email\.local$/);
  assert.equal(require('../services/emailAddress').isDeliverableEmail(email), false);
});

test('pedido público cria sempre uma ficha nova, mesmo com email já conhecido', async () => {
  guests.insertGuest(ORG, { name: 'Existente', email: 'site@example.com', nif: '999' });
  const res = await publicRequest();
  assert.equal(res.statusCode, 201);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM guests WHERE email = 'site@example.com'").get().n, 2);
  assert.match(res.body.data.public_token, /^[a-f0-9]{64}$/);
});
