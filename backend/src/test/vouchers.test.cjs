const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.EMAIL_ENABLED = 'false';
const { db, initDatabase } = require('../config/database');
initDatabase();
const service = require('../services/voucherService');
const controller = require('../controllers/voucherController');
const noop = async () => null;
const calendar = new Proxy({}, { get: () => noop });
function load(relative) {
  const filename = path.resolve(__dirname, relative);
  const localRequire = createRequire(filename);
  const module = { exports: {} };
  const stubs = {
    '../services/emailService': new Proxy({}, { get: () => noop }),
    '../services/calendarService': calendar,
    '../services/operationalTasksService': { syncReservationOperationalTasks() {} },
    '../services/pushService': { notifyOrganization() {} },
    '../services/turnstileService': { verify: async () => ({ success: true }), getSiteKey: () => '' },
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    require: id => stubs[id] || localRequire(id), module, exports: module.exports,
    process, console, Buffer, URL, URLSearchParams, setTimeout, clearTimeout,
    __filename: filename, __dirname: path.dirname(filename),
  }, { filename });
  return module.exports;
}
const internal = load('../controllers/reservationWriteController.js');
const publicBooking = load('../controllers/publicBookingController.js');
function request(body = {}, params = {}, organizationId = 'org') {
  return { body, params, query: {}, user: { id: 'user', organization_id: organizationId },
    ip: '127.0.0.1', protocol: 'http', get: () => 'example.invalid' };
}
async function call(handler, req) {
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await handler(req, res, error => res.status(error.status || 500).json({ error: error.message }));
  return res;
}
beforeEach(() => {
  db.exec(`DELETE FROM operational_events; DELETE FROM reservations; DELETE FROM vouchers;
    DELETE FROM guests; DELETE FROM accommodations; DELETE FROM organizations; DELETE FROM users;
    INSERT INTO organizations(id,name,slug) VALUES ('org','Test','test'), ('other','Other','other');
    INSERT INTO users(id,name,email,password_hash) VALUES ('user','Test','test@example.invalid','placeholder');
    INSERT INTO guests(id,organization_id,name,email) VALUES ('guest','org','Guest','guest@example.invalid'), ('other-guest','other','Other','other@example.invalid');
    INSERT INTO accommodations(id,organization_id,name,type,price_per_night,max_guests,public_slug,min_nights)
      VALUES ('unit','org','Suite','alojamento',100,2,'test',1), ('other-unit','other','Other','alojamento',100,2,'other',1);
    INSERT INTO organization_settings(organization_id,key,value) VALUES ('org','services','[{"id":"tourist_tax","active":false}]');`);
});
function reservation(id, organizationId = 'org') {
  const other = organizationId === 'other';
  db.prepare(`INSERT INTO reservations(id,organization_id,guest_id,accommodation_id,check_in,check_out,nights,num_guests,total_amount,status)
    VALUES (?,?,?,?, '2035-01-01','2035-01-03',2,1,200,'confirmada')`).run(id, organizationId, other ? 'other-guest' : 'guest', other ? 'other-unit' : 'unit');
}
async function voucher(max_uses = 10, extra = {}) {
  const res = await call(controller.create, request({ code: 'TEN', type: 'discount_pct', value: 10, max_uses, ...extra }));
  assert.equal(res.statusCode, 201, JSON.stringify(res.body)); return res.body.data;
}
function booking(day, extra = {}) {
  return { accommodation_id: 'unit', check_in: `2035-02-${String(day).padStart(2, '0')}`,
    check_out: `2035-02-${String(day + 2).padStart(2, '0')}`, num_guests: 1,
    guest: { name: 'Synthetic Guest', email: 'booking@example.invalid' },
    voucher_code: 'TEN', elapsed_ms: 9000, rgpd_consent: true, ...extra };
}

test('limite de 10 mantém ativo até à décima reserva e bloqueia a décima primeira', async () => {
  const v = await voucher();
  for (let i = 1; i <= 11; i++) reservation(`r${i}`);
  for (let i = 1; i <= 10; i++) {
    const result = service.redeemVoucher('org', v.id, `r${i}`);
    assert.equal(result.used_count, i); assert.equal(result.status, i === 10 ? 'used' : 'active');
  }
  assert.throws(() => service.redeemVoucher('org', v.id, 'r11'), /limite/);
  const invalid = await call(controller.validate, { ...request(), query: { code: 'TEN' } });
  assert.equal(invalid.statusCode, 409);
  assert.equal(service.redeemVoucher('org', v.id, 'r10').used_count, 10);
});

test('criação sem limite continua a permitir uma única reserva', async () => {
  const res = await call(controller.create, request({ type: 'discount_fixed', value: 20 }));
  assert.equal(res.body.data.max_uses, 1); assert.equal(res.body.data.used_count, 0);
});

test('rejeita limites inválidos e inferiores à utilização existente; aumentar reativa esgotado', async () => {
  for (const max_uses of [0, -1, 1.5, '', 'abc', true, null, Number.MAX_SAFE_INTEGER + 1]) {
    const res = await call(controller.create, request({ type: 'discount_pct', value: 10, max_uses }));
    assert.equal(res.statusCode, 400, `limit=${max_uses}`);
  }
  const v = await voucher(2); reservation('r1'); reservation('r2');
  service.redeemVoucher('org', v.id, 'r1'); service.redeemVoucher('org', v.id, 'r2');
  const lower = await call(controller.update, request({ max_uses: 1 }, { id: v.id }));
  assert.equal(lower.statusCode, 400);
  const higher = await call(controller.update, request({ max_uses: 10 }, { id: v.id }));
  assert.equal(higher.body.data.max_uses, 10); assert.equal(higher.body.data.status, 'active');
  assert.equal(higher.body.data.used_count, 2);
});

test('backoffice aplica desconto em várias reservas e rejeita voucher esgotado sem criar reserva', async () => {
  const v = await voucher(2);
  const first = await call(internal.create, request(booking(1)));
  const second = await call(internal.create, request(booking(4)));
  assert.equal(first.statusCode, 201, JSON.stringify(first.body)); assert.equal(second.statusCode, 201, JSON.stringify(second.body));
  assert.equal(first.body.data.total_amount, 180); assert.equal(second.body.data.total_amount, 180);
  const last = await call(internal.create, request(booking(7)));
  assert.equal(last.statusCode, 409); assert.equal(service.getVoucher('org', v.id).used_count, 2);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM reservations').get().n, 2);
});

test('motor público partilha o mesmo limite com o backoffice', async () => {
  const v = await voucher(2);
  assert.equal((await call(internal.create, request(booking(1)))).statusCode, 201);
  const second = await call(publicBooking.createReservation, request(booking(4), { slug: 'test' }));
  assert.equal(second.statusCode, 201, JSON.stringify(second.body)); assert.equal(second.body.data.total_amount, 180);
  const last = await call(publicBooking.createReservation, request(booking(7), { slug: 'test' }));
  assert.equal(last.statusCode, 409); assert.equal(service.getVoucher('org', v.id).used_count, 2);
  const validation = await call(publicBooking.validatePublicVoucher, { ...request({}, { slug: 'test' }), query: { code: 'TEN' } });
  assert.equal(validation.statusCode, 409);
});

test('valida validade, mínimo de noites, alojamento e isolamento entre organizações', async () => {
  const v = await voucher(10, { min_nights: 3 }); reservation('r1'); reservation('r-other', 'other');
  assert.throws(() => service.redeemVoucher('org', v.id, 'r1'), /3 noites/);
  assert.throws(() => service.redeemVoucher('org', v.id, 'r-other'), /Reserva não encontrada/);
  assert.throws(() => service.redeemVoucher('other', v.id, 'r-other'), /Voucher não encontrado/);
  db.prepare("UPDATE vouchers SET min_nights=1, valid_until='2000-01-01' WHERE id=?").run(v.id);
  assert.throws(() => service.redeemVoucher('org', v.id, 'r1'), /expirado/);
  assert.equal(service.getVoucher('org', v.id).used_count, 0);
  const list = await call(controller.getReservations, request({}, { id: v.id }, 'other'));
  assert.equal(list.statusCode, 404);
});

test('histórico mantém canceladas e eliminadas sem repor capacidade', async () => {
  const v = await voucher(2); reservation('r1'); reservation('r2');
  service.redeemVoucher('org', v.id, 'r1'); service.redeemVoucher('org', v.id, 'r2');
  db.exec("UPDATE reservations SET status='cancelada' WHERE id='r1'; DELETE FROM reservations WHERE id='r2';");
  const result = await call(controller.getReservations, request({}, { id: v.id }));
  assert.equal(result.body.data.length, 2); assert.equal(result.body.voucher.used_count, 2);
  assert.ok(result.body.data.some(row => row.reservation_id === 'r1' && row.status === 'cancelada'));
  assert.ok(result.body.data.some(row => row.reservation_id === null && row.reservation_reference === 'r2'));
});

test('histórico paginado e cada reserva conta apenas uma vez', async () => {
  const v = await voucher(30);
  for (let i = 0; i < 30; i++) { reservation(`r${i}`); service.redeemVoucher('org', v.id, `r${i}`); }
  const result = await call(controller.getReservations, { ...request({}, { id: v.id }), query: { page: 2 } });
  assert.equal(result.body.pagination.total, 30); assert.equal(result.body.data.length, 5);
  assert.equal(service.redeemVoucher('org', v.id, 'r1').used_count, 30);
});

test('rollback não consome voucher quando a transação da reserva falha', async () => {
  const v = await voucher(1);
  assert.throws(() => db.transaction(() => {
    reservation('rollback'); service.redeemVoucher('org', v.id, 'rollback'); throw new Error('rollback');
  })(), /rollback/);
  assert.equal(service.getVoucher('org', v.id).used_count, 0);
  assert.equal(db.prepare("SELECT id FROM reservations WHERE id='rollback'").get(), undefined);
});

test('backup conserva limites e histórico e importa versões anteriores', async () => {
  const backup = require('../services/backupData');
  const v = await voucher(10); reservation('r1'); service.redeemVoucher('org', v.id, 'r1');
  const data = backup.exportData('org'); assert.equal(data.version, 7);
  assert.equal(data.tables.voucher_redemptions.length, 1);
  const tables = backup.prepareImport(data, 'org'); backup.restoreData(tables, 'org');
  assert.equal(service.getVoucher('org', v.id).used_count, 1); assert.equal(service.getVoucher('org', v.id).max_uses, 10);
  const old = structuredClone(data); old.version = 4; delete old.tables.voucher_redemptions;
  old.tables.vouchers[0].status = 'used'; delete old.tables.vouchers[0].max_uses;
  const converted = backup.prepareImport(old, 'org'); backup.restoreData(converted, 'org');
  assert.equal(service.getVoucher('org', v.id).used_count, 1); assert.equal(service.getVoucher('org', v.id).max_uses, 1);
});

test('migração preserva utilização anterior, mesmo sem reserva existente', () => {
  db.exec(`DROP TRIGGER reservation_clear_legacy_voucher; DROP TABLE voucher_redemptions;
    ALTER TABLE vouchers DROP COLUMN max_uses;
    DELETE FROM schema_migrations WHERE id='20261001_voucher_redemptions';
    INSERT INTO vouchers(id,organization_id,code,value,status,used_in_reservation_id)
      VALUES ('old','org','OLD',10,'used','deleted-reservation');`);
  require('../config/migrations').runMigrations(db);
  const v = service.getVoucher('org', 'old'); assert.equal(v.max_uses, 1); assert.equal(v.used_count, 1);
  const usage = db.prepare("SELECT * FROM voucher_redemptions WHERE voucher_id='old'").get();
  assert.equal(usage.reservation_id, null); assert.equal(usage.reservation_reference, 'deleted-reservation');
});

test('pedidos concorrentes de processos distintos disputam a última utilização sem ultrapassar o limite', async () => {
  const { Worker } = require('node:worker_threads');
  const os = require('node:os');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-voucher-race-'));
  try {
    const v = await voucher(1); reservation('race-1'); reservation('race-2');
    const filename = path.join(temp, 'test.db'); await db.backup(filename);
    const modulePath = path.resolve(__dirname, '../services/voucherService.js');
    const run = reservationId => new Promise((resolve, reject) => {
      const worker = new Worker(`
        const { parentPort, workerData } = require('node:worker_threads');
        process.env.DB_PATH = workerData.filename;
        const service = require(workerData.modulePath);
        try { service.redeemVoucher('org', workerData.voucherId, workerData.reservationId); parentPort.postMessage(200); }
        catch (err) { parentPort.postMessage(err.status || err.message); }
      `, { eval: true, workerData: { filename, modulePath, voucherId: v.id, reservationId } });
      let result;
      worker.once('message', value => { result = value; });
      worker.once('error', reject);
      worker.once('exit', code => code ? reject(new Error(`Worker ${code}`)) : resolve(result));
    });
    assert.deepEqual((await Promise.all([run('race-1'), run('race-2')])).sort(), [200, 409]);
    const Database = require('better-sqlite3'); const check = new Database(filename);
    assert.equal(check.prepare('SELECT COUNT(*) AS n FROM voucher_redemptions').get().n, 1); check.close();
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
