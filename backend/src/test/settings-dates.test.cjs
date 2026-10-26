// Definições da organização, datas de calendário, campos herdados e JSON.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-settings-'));
const originalCwd = process.cwd();
process.chdir(temp);
process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
const { db, initDatabase } = require('../config/database');
initDatabase();
db.exec("INSERT INTO organizations(id,name,slug) VALUES ('org-s','S','s')");
after(() => { db.close(); process.chdir(originalCwd); fs.rmSync(temp, { recursive: true, force: true }); });

test('definições: texto, JSON, várias chaves e valores por omissão', () => {
  const settings = require('../services/settingsService');
  assert.equal(settings.get('org-s', 'checkin_time', '15:00'), '15:00');
  settings.set('org-s', 'checkin_time', '16:00');
  settings.set('org-s', 'services', [{ id: 'tourist_tax', value: 2 }]);
  assert.equal(settings.get('org-s', 'checkin_time'), '16:00');
  assert.deepEqual(settings.services('org-s'), [{ id: 'tourist_tax', value: 2 }]);
  assert.deepEqual(settings.getMany('org-s', ['checkin_time', 'inexistente']), { checkin_time: '16:00' });
  db.prepare("UPDATE organization_settings SET value = '{' WHERE key = 'services'").run();
  assert.deepEqual(settings.services('org-s'), []);
});

test('datas: «hoje» no fuso do alojamento, não em UTC', () => {
  const { localDay } = require('../services/dates');
  const previous = process.env.TZ;
  try {
    delete process.env.TZ;
    assert.equal(localDay(new Date('2026-07-10T23:30:00Z')), '2026-07-11'); // 00:30 em Lisboa (verão)
    assert.equal(localDay(new Date('2026-01-10T23:30:00Z')), '2026-01-10'); // 23:30 em Lisboa (inverno)
    assert.equal(localDay(new Date('2026-03-28T12:00:00Z'), 2), '2026-03-30'); // atravessa a mudança de hora
    process.env.TZ = 'UTC';
    assert.equal(localDay(new Date('2026-07-10T23:30:00Z')), '2026-07-10');
    process.env.TZ = ':/etc/localtime';
    assert.equal(localDay(new Date('2026-07-10T23:30:00Z')), '2026-07-11');
  } finally {
    if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
  }
  assert.equal(require('../services/reservationRules').localDateIso(new Date('2026-07-10T23:30:00Z')), localDay(new Date('2026-07-10T23:30:00Z')));
});

test('campos herdados: a unidade usa os do alojamento principal só quando vazios', () => {
  const { withInheritedFields, INHERITED_FIELDS } = require('../services/accommodationInheritance');
  db.exec(`INSERT INTO accommodations(id,organization_id,name,type,price_per_night,max_guests,wifi_name,door_code,city)
      VALUES ('casa','org-s','Casa','alojamento',100,4,'Rede Casa','1234','Évora');
    INSERT INTO accommodations(id,organization_id,name,type,price_per_night,max_guests,parent_id,wifi_name)
      VALUES ('suite','org-s','Suite','suite',80,2,'casa','Rede Suite');`);
  const suite = withInheritedFields(db.prepare("SELECT * FROM accommodations WHERE id='suite'").get(), 'org-s');
  assert.equal(suite.wifi_name, 'Rede Suite');
  assert.equal(suite.door_code, '1234');
  assert.equal(suite.city, 'Évora');
  assert.ok(INHERITED_FIELDS.includes('email_social_links'));
});

test('JSON guardado: vazio ou ilegível devolve o valor por omissão', () => {
  const { safeJson } = require('../services/json');
  assert.deepEqual(safeJson('[1]', []), [1]);
  assert.deepEqual(safeJson('', []), []);
  assert.deepEqual(safeJson('{x', {}), {});
  const value = { a: 1 };
  assert.equal(safeJson(value, null), value);
});

test('receita: total das reservas ativas (com taxa turística) e sinal retido das canceladas', async () => {
  db.exec(`INSERT INTO guests(id,organization_id,name,email) VALUES ('g','org-s','G','g@example.com');
    INSERT INTO reservations(id,organization_id,guest_id,accommodation_id,check_in,check_out,nights,num_guests,total_amount,tourist_tax,amount_paid,status,channel) VALUES
      ('ativa','org-s','g','casa','2031-05-10','2031-05-12',2,2,212,12,100,'confirmada','direto'),
      ('retida','org-s','g','casa','2031-05-20','2031-05-22',2,2,300,0,60,'cancelada','direto'),
      ('sem-dinheiro','org-s','g','casa','2031-05-25','2031-05-27',2,2,500,0,0,'cancelada','direto');`);
  let body;
  await require('../controllers/reportController').getFinancialReport(
    { user: { organization_id: 'org-s' }, query: { year: '2031', month: '5' } }, { json: data => { body = data; } }, error => { throw error; });
  assert.equal(body.data.totals.revenue, 272);
  assert.equal(body.data.totals.reservations, 1);
  assert.deepEqual(body.data.channels.map(c => [c.channel, c.reservations, c.revenue]), [['direto', 1, 272]]);
  const { revenueOf } = require('../services/reportingService');
  assert.deepEqual([{ status: 'confirmada', total_amount: 212 }, { status: 'cancelada', total_amount: 300, amount_paid: 60 }].map(revenueOf), [212, 60]);
});
