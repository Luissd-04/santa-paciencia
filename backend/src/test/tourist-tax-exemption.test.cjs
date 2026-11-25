// Taxa turística: isenção por idade configurável por alojamento.
const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-tax-exempt-'));
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
const rules = require('../services/reservationRules');
const write = require('../controllers/reservationWriteController');
const publicBooking = require('../controllers/publicBookingController');
const settings = require('../services/settingsService');

const ORG = 'org-tax';
const root = path.join(__dirname, '../../..');
const ctx = vm.createContext({ window: {} });
for (const f of ['dates.js', 'pricing.js']) vm.runInContext(fs.readFileSync(path.join(root, 'frontend/js/domain', f), 'utf8'), ctx);
const client = ctx.window.ReservationPricing;

const acc = { price_per_night: 100, max_guests: 6, base_guests_included: 6, extra_occupancy_options: [] };
const stay = { check_in: '2035-08-10', check_out: '2035-08-12', num_guests: 4 }; // 2 noites
const tax = (extra = {}) => [{ id: 'tourist_tax', value: 3, active: true, ...extra }];
const both = (accommodation, services, payload) => {
  const s = rules.calculateReservationTotals(accommodation, services, { ...stay, ...payload });
  const c = client.calculateReservationTotal(accommodation, services, { ...stay, ...payload });
  assert.equal(c.touristTax, s.touristTax, 'cliente e servidor iguais');
  assert.equal(c.exemptGuests, s.exemptGuests);
  assert.equal(c.totalAmount, s.totalAmount);
  return s;
};

beforeEach(() => {
  db.exec(`DELETE FROM reservation_events; DELETE FROM reservation_history; DELETE FROM reservations; DELETE FROM guests;
    DELETE FROM pricing_periods; DELETE FROM accommodations; DELETE FROM organization_settings; DELETE FROM organizations;
    INSERT INTO organizations(id,name,slug) VALUES ('${ORG}','TX','tx');
    INSERT INTO accommodations(id,organization_id,name,type,price_per_night,max_guests,public_slug)
      VALUES ('casa','${ORG}','Casa','alojamento',100,6,'casa');`);
  settings.set(ORG, 'services', [{ id: 'tourist_tax', name: 'Taxa turística', type: 'tax', value: 3, unit: '€/hóspede/noite', active: true, exempt_until_age: 12 }]);
});
after(() => { db.close(); process.chdir(originalCwd); fs.rmSync(temp, { recursive: true, force: true }); });

test('sem limite configurado, todos pagam (comportamento anterior)', () => {
  const r = both(acc, tax(), { children_ages: [3, 5] });
  assert.equal(r.touristTax, 3 * 4 * 2);
  assert.equal(r.exemptGuests, 0);
});

test('limite inclusivo: idade igual ao limite é isenta, acima paga', () => {
  const r = both(acc, tax({ exempt_until_age: 12 }), { children_ages: [12, 13] });
  assert.equal(r.exemptGuests, 1);
  assert.equal(r.touristTax, 3 * 3 * 2);
  assert.equal(both(acc, tax({ exempt_until_age: 0 }), { children_ages: [0, 1] }).exemptGuests, 1, 'limite 0: só menores de 1 ano');
  assert.equal(both(acc, tax({ exempt_until_age: 17 }), { children_ages: [17, 17], num_guests: 2 }).touristTax, 0);
});

test('datas de nascimento: idade à data de entrada e prevalecem sobre as idades declaradas', () => {
  const r = both(acc, tax({ exempt_until_age: 12 }), { birth_dates: ['1990-01-01', '2023-08-10', '2022-08-11', null] });
  assert.equal(r.exemptGuests, 2, '12 anos exatos e 12 anos por 1 dia: isentos');
  // Criança com data de nascimento e idade declarada: conta uma vez.
  const dedup = both(acc, tax({ exempt_until_age: 12 }), { birth_dates: [null, null, '2030-01-01', null], children_ages: [5] });
  assert.equal(dedup.exemptGuests, 1);
});

test('N crianças sem idade nem data de nascimento pagam', () => {
  const r = both(acc, tax({ exempt_until_age: 12 }), { birth_dates: [null, null, null, null], children_ages: [null, null] });
  assert.equal(r.exemptGuests, 0);
});

test('isentos nunca excedem os hóspedes', () => {
  const r = both(acc, tax({ exempt_until_age: 17 }), { num_guests: 2, children_ages: [1, 2, 3, 4, 5] });
  assert.equal(r.exemptGuests, 2);
  assert.equal(r.touristTax, 0);
});

test('herança: alojamento > principal > organização; -1 = sem isenção', () => {
  const svc = tax({ exempt_until_age: 12 });
  const ages = { children_ages: [10, 6] };
  assert.equal(both(acc, svc, ages).exemptGuests, 2, 'herda da organização');
  assert.equal(both({ ...acc, tourist_tax_exempt_age: 8 }, svc, ages).exemptGuests, 1, 'o alojamento sobrepõe-se');
  assert.equal(both({ ...acc, tourist_tax_exempt_age: -1 }, svc, ages).exemptGuests, 0, '-1: sem isenção');
  assert.equal(both({ ...acc, parent_id: 'p' }, svc, { ...ages, parent_accommodation: { tourist_tax_exempt_age: 7 } }).exemptGuests, 1, 'herda do principal');
  assert.equal(both({ ...acc, tourist_tax_exempt_age: 5, parent_id: 'p' }, svc, { ...ages, parent_accommodation: { tourist_tax_exempt_age: 17 } }).exemptGuests, 0, 'o próprio prevalece');
});

test('o servidor lê o limite do alojamento principal na base de dados', () => {
  db.exec(`UPDATE accommodations SET tourist_tax_exempt_age = 9 WHERE id = 'casa';
    INSERT INTO accommodations(id,organization_id,name,type,price_per_night,max_guests,parent_id) VALUES ('q1','${ORG}','Q1','suite',80,4,'casa')`);
  const unit = db.prepare("SELECT * FROM accommodations WHERE id = 'q1'").get();
  const r = rules.calculateReservationTotals(unit, tax({ exempt_until_age: 2 }), { ...stay, num_guests: 3, children_ages: [8, 9] });
  assert.equal(r.exemptGuests, 2);
});

test('cotação, pedido público e edição: taxa recalculada com as idades; existentes não mudam', async () => {
  const call = async (fn, body, params = {}) => {
    const res = { statusCode: 200, status(n) { this.statusCode = n; return this; }, json(d) { this.body = d; return this; } };
    await fn({ body, params, query: {}, ip: '127.0.0.1', protocol: 'http', get: () => 'x.invalid',
      user: { id: 'm', role: 'manager', organization_id: ORG } }, res, e => res.status(e.status || 500).json({ error: e.message }));
    return res;
  };
  const base = { accommodation_id: 'casa', check_in: '2035-08-10', check_out: '2035-08-12', num_adults: 2, num_children: 2, num_guests: 4 };
  const noAges = await call(write.quote, base);
  const withAges = await call(write.quote, { ...base, children_ages: [4, 12] });
  assert.equal(noAges.body.data.breakdown.tourist_tax, 3 * 4 * 2);
  assert.equal(withAges.body.data.breakdown.tourist_tax, 3 * 2 * 2);

  const pub = await call(publicBooking.createReservation, { ...base, children_ages: [4, 14], guest: { name: 'Site', email: 's@example.com' },
    guests_data: [{ name: 'A' }, { name: 'B' }, { name: 'C' }], rgpd_consent: true, elapsed_ms: 9000 }, { slug: 'casa' });
  assert.equal(pub.statusCode, 201, JSON.stringify(pub.body));
  const row = db.prepare('SELECT tourist_tax, children_ages, total_amount FROM reservations').get();
  assert.equal(row.tourist_tax, 3 * 3 * 2);
  assert.deepEqual(JSON.parse(row.children_ages), [4, 14]);

  // Reserva antiga (sem idades): editar notas não mexe na taxa nem no total.
  const id = db.prepare('SELECT id FROM reservations').get().id;
  db.prepare('UPDATE reservations SET children_ages = NULL, tourist_tax = 24, total_amount = 424 WHERE id = ?').run(id);
  const edit = await call(write.update, { notes: 'só notas' }, { id });
  assert.equal(edit.statusCode, 200, JSON.stringify(edit.body));
  const after = db.prepare('SELECT tourist_tax, total_amount FROM reservations WHERE id = ?').get(id);
  assert.equal(after.tourist_tax, 24);
  assert.equal(after.total_amount, 424);
});

test('definições: idade de isenção validada (0-17) e guardada na taxa turística', () => {
  const ctl = require('../controllers/accommodationController');
  const send = services => { const res = { statusCode: 200, status(n) { this.statusCode = n; return this; }, json(d) { this.body = d; return this; } };
    ctl.saveSettings({ body: { services }, user: { organization_id: ORG, id: 'm' } }, res); return res; };
  const svc = extra => [{ id: 'tourist_tax', name: 'Taxa turística', type: 'tax', value: 3, ...extra }];
  assert.equal(send(svc({ exempt_until_age: 18 })).statusCode, 400);
  assert.equal(send(svc({ exempt_until_age: 1.5 })).statusCode, 400);
  assert.equal(send(svc({ exempt_until_age: 12 })).statusCode, 200);
  assert.equal(settings.services(ORG)[0].exempt_until_age, 12);
  assert.equal(send(svc({ exempt_until_age: '' })).statusCode, 200);
  assert.equal(settings.services(ORG)[0].exempt_until_age, undefined, 'vazio = sem isenção');
});
