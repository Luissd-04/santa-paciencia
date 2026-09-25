const { runFrontend } = require('../test-support/frontend.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../../..');
const backend = path.join(root, 'backend/src');
const backendRequire = createRequire(path.join(backend, 'package.json'));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-auditoria-'));
const originalCwd = process.cwd();
process.chdir(temp);
process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.EMAIL_ENABLED = 'false';
global.fetch = async () => { throw new Error('Rede desativada durante a auditoria'); };
const { db, initDatabase } = backendRequire('./config/database');
initDatabase();
const rules = backendRequire('./services/reservationRules');
const noopAsync = async () => null;
const emailStub = new Proxy({}, { get: () => noopAsync });
const calendarStub = new Proxy({}, { get: () => noopAsync });
const taskStub = {
  syncReservationOperationalTasks() {},
  syncOrganizationOperationalTasks() {},
  queueReservationTaskCleanup() { return 0; },
  async flushReservationTaskCleanup() { return { deleted: 0, errors: 0, pending: 0 }; },
};
const defaultStubs = {
  '../services/emailService': emailStub,
  '../services/calendarService': calendarStub,
  '../services/operationalTasksService': taskStub,
  '../services/pushService': { notifyOrganization() {} },
  '../services/turnstileService': { verify: async () => ({ success: true }), getSiteKey: () => '' },
};
function load(relative, extra = {}) {
  const filename = path.join(backend, relative);
  const localRequire = createRequire(filename);
  const stubs = { ...defaultStubs, ...extra };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    require: id => {
      if (Object.hasOwn(stubs, id)) return stubs[id];
      if (['./reservationWriteController', '../services/reservationSupport'].includes(id)) {
        return load(path.relative(backend, localRequire.resolve(id)), extra);
      }
      return localRequire(id);
    },
    module, exports: module.exports, process, console, Buffer, URL, URLSearchParams,
    setTimeout, clearTimeout, setInterval, clearInterval, fetch: global.fetch,
    __filename: filename, __dirname: path.dirname(filename),
  }, { filename });
  return module.exports;
}
function response() {
  return { statusCode: 200, status(n) { this.statusCode = n; return this; },
    json(data) { this.body = data; return this; }, send(data) { this.body = data; return this; } };
}
function request(body = {}, params = {}) {
  return { body, params, query: {}, user: { id: 'audit-user', role: 'owner', organization_id: 'org-a' },
    ip: '127.0.0.1', protocol: 'http', get: key => key === 'host' ? 'audit.invalid' : undefined };
}
async function call(fn, req) {
  const res = response();
  await fn(req, res, error => { res.status(error.status || 500).json({ error: error.message }); });
  return res;
}
function routerDouble() {
  const routes = [];
  const router = { use() {} };
  for (const method of ['get', 'post', 'put', 'delete', 'patch']) {
    router[method] = (route, ...handlers) => routes.push({ method, route, handlers });
  }
  return { routes, express: { Router: () => router, json: () => (_req, _res, next) => next() } };
}
function reservation(id, acc = 'unit-a', extras = '[]', paid = 0) {
  db.prepare(`INSERT INTO reservations
    (id, organization_id, guest_id, accommodation_id, check_in, check_out, nights, num_guests, total_amount, accommodations_data, amount_paid)
    VALUES (?, 'org-a', 'guest-a', ?, '2030-01-01', '2030-01-03', 2, 1, 200, ?, ?)`)
    .run(id, acc, extras, paid);
}
async function check(name, fn) { await test(name, fn); }
async function main() {
  db.exec(`INSERT INTO organizations (id,name,slug) VALUES ('org-a','Audit A','audit-a'),('org-b','Audit B','audit-b');
    INSERT INTO users (id,name,email,password_hash) VALUES ('audit-user','Audit User','user@example.invalid','placeholder');
    INSERT INTO memberships (id,organization_id,user_id,role) VALUES ('member-a','org-a','audit-user','staff');
    INSERT INTO guests (id,organization_id,name,email,phone) VALUES ('guest-a','org-a','Existing Guest','existing@example.invalid','PRIVATE-PHONE');
    INSERT INTO accommodations (id,organization_id,name,type,price_per_night,max_guests,public_slug,min_nights)
      VALUES ('unit-a','org-a','Property A','alojamento',100,4,'audit-a',1),
             ('unit-b','org-a','Property B','alojamento',100,4,'audit-b',1);
    INSERT INTO organization_settings (organization_id,key,value) VALUES ('org-a','services','[{"id":"tourist_tax","active":false}]');`);
  const publicCtrl = load('controllers/publicBookingController.js');
  const reservationCtrl = load('controllers/reservationController.js');
  let publicToken;
  let reservationStatusToken;
  await check('F10: rejeita negativos e grava estado e pagamento inicial', async () => {
    const body = { accommodation_id: 'unit-b', check_in: '2032-01-01', check_out: '2032-01-03', num_guests: 1,
      guest: { name: 'Synthetic Internal', email: 'internal@example.invalid' }, total_amount: -5, amount_paid: -10, status: 'pre_reserva' };
    const rejected = await call(reservationCtrl.create, request(body)); assert.equal(rejected.statusCode, 400);
    assert.equal(db.prepare("SELECT count(*) AS n FROM guests WHERE email='internal@example.invalid'").get().n, 0);
    const accepted = await call(reservationCtrl.create, request({ ...body, total_amount: 200, amount_paid: 100 }));
    assert.equal(accepted.statusCode, 201, JSON.stringify(accepted.body)); assert.equal(accepted.body.data.status, 'pre_reserva');
    assert.equal(db.prepare('SELECT sum(amount) AS n FROM reservation_payments WHERE reservation_id=?').get(accepted.body.data.id).n, 100);
  });
  await check('S01: preço público ignora overrides', async () => {
    const res = await call(publicCtrl.createReservation, request({ accommodation_id: 'unit-a',
      check_in: '2030-01-01', check_out: '2030-01-03', num_guests: 1,
      guest: { name: 'Claimed Name', email: 'existing@example.invalid' }, rgpd_consent: true, elapsed_ms: 9000,
      nightly_prices: [{ date: '2030-01-01', price: 0 }, { date: '2030-01-02', price: 0 }],
    }, { slug: 'audit-a' }));
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.data.total_amount, 200);
    publicToken = res.body.data.precheckin_url.split('/').pop();
    reservationStatusToken = res.body.data.public_url.split('/').pop();
    const status = await call(publicCtrl.getReservationStatus, request({}, { token: reservationStatusToken }));
    assert.equal(status.statusCode, 200);
    assert.equal(status.body.data.accommodation_name, 'Property A');
    assert.equal(Object.hasOwn(status.body.data, 'guest_email'), false);
    const missing = await call(publicCtrl.getReservationStatus, request({}, { token: 'invalid' }));
    assert.equal(missing.statusCode, 404);
  });
  await check('S02: email público não permite alterar outra ficha', async () => {
    const guestsBefore = db.prepare("SELECT count(*) AS n FROM guests WHERE organization_id='org-a'").get().n;
    const read = await call(publicCtrl.getPreCheckin, request({}, { token: publicToken }));
    assert.notEqual(read.body.data.guest.phone, 'PRIVATE-PHONE');
    const write = await call(publicCtrl.submitPreCheckin, request({ rgpd_consent: true, guest: {
      name: 'Changed By Public Link', email: 'changed@example.invalid', nationality: 'Portugal',
    } }, { token: publicToken }));
    assert.equal(write.statusCode, 200);
    assert.equal(db.prepare('SELECT name FROM guests WHERE id=?').get('guest-a').name, 'Existing Guest');
    assert.equal(db.prepare("SELECT count(*) AS n FROM guests WHERE organization_id='org-a'").get().n, guestsBefore);
    const first = db.prepare('SELECT precheckin_submitted_at FROM reservations WHERE precheckin_token=?').get(publicToken);
    // O hóspede pode corrigir os dados até ao dia de chegada: o reenvio grava,
    // e a data do primeiro envio mantém-se.
    const replay = await call(publicCtrl.submitPreCheckin, request({ rgpd_consent: true, guest: {
      name: 'Replay', email: 'replay@example.invalid', nationality: 'Portugal',
    } }, { token: publicToken }));
    assert.equal(replay.statusCode, 200, JSON.stringify(replay.body));
    assert.equal(replay.body.data.resubmission, true);
    const after = db.prepare('SELECT precheckin_submitted_at, precheckin_updated_at FROM reservations WHERE precheckin_token=?').get(publicToken);
    assert.equal(after.precheckin_submitted_at, first.precheckin_submitted_at);
    assert.ok(after.precheckin_updated_at);
    const replayRead = await call(publicCtrl.getPreCheckin, request({}, { token: publicToken }));
    assert.equal(replayRead.statusCode, 200);
    assert.equal(replayRead.body.data.guest.name, 'Replay');
    assert.ok(replayRead.body.data.reservation.precheckin_submitted_at);
  });
  await check('S03: pré-check-in fecha depois do dia de chegada', async () => {
    const row = db.prepare('SELECT id, check_in FROM reservations WHERE precheckin_token=?').get(publicToken);
    db.prepare("UPDATE reservations SET check_in=date('now','-1 day') WHERE id=?").run(row.id);
    try {
      const read = await call(publicCtrl.getPreCheckin, request({}, { token: publicToken }));
      assert.equal(read.statusCode, 410);
      const write = await call(publicCtrl.submitPreCheckin, request({ rgpd_consent: true, guest: {
        name: 'Late', email: 'late@example.invalid', nationality: 'Portugal',
      } }, { token: publicToken }));
      assert.equal(write.statusCode, 410);
    } finally {
      db.prepare('UPDATE reservations SET check_in=? WHERE id=?').run(row.check_in, row.id);
    }
  });
  await check('S04: SIBA — documento para crianças estrangeiras, morada opcional', async () => {
    const row = db.prepare('SELECT id, num_guests, num_adults FROM reservations WHERE precheckin_token=?').get(publicToken);
    db.prepare('UPDATE reservations SET num_guests=2, num_adults=1 WHERE id=?').run(row.id);
    const foreign = extra => ({ nationality: 'Espanha', birth_date: '1990-02-03', birth_city: 'Madrid',
      birth_country: 'Espanha', city: 'Madrid', residence_country: 'Espanha',
      document_type: 'passport', document_number: 'X1', document_issuer_country: 'Espanha', ...extra });
    try {
      const guest = foreign({ name: 'Adulto Estrangeiro', email: 'adulto@example.invalid' });
      const child = foreign({ name: 'Criança Estrangeira', birth_date: '2020-02-03' });
      const noChildDoc = await call(publicCtrl.submitPreCheckin, request({ rgpd_consent: true, guest,
        guests_data: [{ ...child, document_type: '', document_number: '' }] }, { token: publicToken }));
      assert.equal(noChildDoc.statusCode, 400);
      const noAddress = await call(publicCtrl.submitPreCheckin, request({ rgpd_consent: true,
        guest: { ...guest, address: '' }, guests_data: [child] }, { token: publicToken }));
      assert.equal(noAddress.statusCode, 200, JSON.stringify(noAddress.body));
    } finally {
      db.prepare('UPDATE reservations SET num_guests=?, num_adults=? WHERE id=?').run(row.num_guests, row.num_adults, row.id);
    }
  });
  await check('S08: pré-check-in conserva aprovação e expiração', async () => {
    const row = db.prepare('SELECT * FROM reservations WHERE precheckin_token=?').get(publicToken);
    assert.equal(row.status, 'pendente');
    db.prepare("UPDATE reservations SET created_at=datetime('now','-72 hours') WHERE id=?").run(row.id);
    const scheduler = load('services/reservationScheduler.js', {
      './operationalTasksService': taskStub, './calendarService': calendarStub,
    });
    scheduler.expirePendingReservations();
    assert.equal(db.prepare('SELECT status FROM reservations WHERE id=?').get(row.id).status, 'cancelada');
    db.prepare("UPDATE reservations SET status='pendente', created_at=datetime('now') WHERE id=?").run(row.id);
  });
  await check('F01: propriedade sem suites rejeita sobreposição', async () => {
    const res = await call(publicCtrl.createReservation, request({ accommodation_id: 'property',
      check_in: '2030-01-01', check_out: '2030-01-03', num_guests: 1,
      guest: { name: 'New Guest', email: 'other@example.invalid' }, rgpd_consent: true, elapsed_ms: 9000,
    }, { slug: 'audit-a' }));
    assert.equal(res.statusCode, 409);
    assert.equal(db.prepare('SELECT count(*) AS n FROM reservations WHERE accommodation_id=?').get('unit-a').n, 1);
  });
  await check('F02: quartos adicionais bloqueiam disponibilidade', async () => {
    reservation('multi', 'unit-a', JSON.stringify([{ accommodation_id: 'unit-b' }]));
    const req = request(); req.query = { check_in: '2030-01-01', check_out: '2030-01-03' };
    const res = await call(reservationCtrl.getAvailability, req);
    assert.equal(res.body.data.unavailable.includes('unit-b'), true);
  });
  await check('F03: pagamentos conservam saldo inicial', async () => {
    reservation('payments', 'unit-b', '[]', 100);
    const res = await call(reservationCtrl.addPayment, request({ amount: 50 }, { id: 'payments' }));
    assert.equal(res.body.data.newTotalPaid, 150);
  });
  await check('F04: acompanhante existente usa esquema SQL válido', async () => {
    const result = await call(reservationCtrl.update, request({ status: 'cancelada', guests_data: [{ name: 'Guest Again', email: 'existing@example.invalid' }] }, { id: 'payments' }));
    assert.equal(result.statusCode, 200, JSON.stringify(result.body));
  });
  await check('Reserva recusada não altera a ficha do hóspede', async () => {
    const before = db.prepare("SELECT name FROM guests WHERE id='guest-a'").get().name;
    const result = await call(reservationCtrl.create, request({ accommodation_id: 'unit-a', check_in: '2030-01-01', check_out: '2030-01-03', num_guests: 1,
      guest: { name: 'Must Not Persist', email: 'existing@example.invalid' } }));
    assert.equal(result.statusCode, 409);
    assert.equal(db.prepare("SELECT name FROM guests WHERE id='guest-a'").get().name, before);
  });
  await check('S03: imagens verificam propriedade e caminhos', async () => {
    const ctrl = load('controllers/accommodationController.js');
    db.prepare('UPDATE accommodations SET images=? WHERE id=?').run('{"room":[]}', 'unit-a');
    const victim = path.join(ctrl.UPLOADS_DIR, 'other-org-photo.png');
    fs.writeFileSync(victim, 'synthetic image owned by org B');
    const res = await call(ctrl.deleteImage, request({ section: 'room', url: '/uploads/other-org-photo.png' }, { id: 'unit-a' }));
    assert.equal(res.statusCode, 404); assert.equal(fs.existsSync(victim), true);
    const traversal = await call(ctrl.uploadImages, request({ section: 'x/../../../audit-outside',
      image: 'data:image/png;base64,' + Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]).toString('base64'),
    }, { id: 'unit-a' }));
    assert.equal(traversal.statusCode, 400);
    assert.equal(fs.readdirSync(temp).some(name => name.startsWith('audit-outside_')), false);
  });
  await check('S03b: alojamentos e serviços recusam payloads excessivos', async () => {
    const ctrl = load('controllers/accommodationController.js');
    const longName = 'x'.repeat(161);
    const created = await call(ctrl.create, request({ name: longName, type: 'suite' }));
    assert.equal(created.statusCode, 400);
    const updated = await call(ctrl.update, request({ name: longName }, { id: 'unit-a' }));
    assert.equal(updated.statusCode, 400);
    const services = await call(ctrl.saveSettings, request({ services: [{
      id: 'bad', name: 'x'.repeat(161), type: 'service', value: 1,
    }] }));
    assert.equal(services.statusCode, 400);
  });
  await check('F08: backup restaura bloqueios, logótipos e talões', async () => {
    const { routes, express } = routerDouble(); load('routes/backup.js', { express });
    const out = routes.find(r => r.method === 'get' && r.route === '/export').handlers.at(-1);
    const into = routes.find(r => r.method === 'post' && r.route === '/import').handlers.at(-1);
    db.exec("INSERT INTO accommodation_blocks (id,organization_id,accommodation_id,start_date,end_date) VALUES ('audit-block','org-a','unit-a','2031-01-01','2031-01-03')");
    db.exec("UPDATE accommodations SET logo_url='/uploads/audit-logo.png' WHERE id='unit-a'");
    db.exec("INSERT INTO expenses (id,organization_id,date,description,amount,receipt_image) VALUES ('audit-expense','org-a','2030-01-01','Synthetic',1,'/uploads/receipts/audit-receipt.png')");
    fs.mkdirSync(path.join(temp, 'data/uploads/receipts'), { recursive: true });
    fs.writeFileSync(path.join(temp, 'data/uploads/audit-logo.png'), 'synthetic logo');
    fs.writeFileSync(path.join(temp, 'data/uploads/receipts/audit-receipt.png'), 'synthetic receipt');
    let zipped; const res = response();
    res.download = (file, name, callback) => { zipped = fs.readFileSync(file); callback(); };
    await out(request(), res);
    const zip = await backendRequire('unzipper').Open.buffer(zipped);
    assert.equal(zip.files.some(f => f.path.endsWith('audit-logo.png')), true);
    assert.equal(zip.files.some(f => f.path.endsWith('audit-receipt.png')), true);
    const restored = await call(into, request({ archiveBase64: zipped.toString('base64') }));
    assert.equal(restored.statusCode, 200, JSON.stringify(restored.body));
    assert.equal(db.prepare("SELECT count(*) AS n FROM accommodation_blocks WHERE id='audit-block'").get().n, 1);
  });
  await check('S04: backup incompleto preserva outras organizações', async () => {
    db.exec("INSERT INTO vouchers (id,organization_id,code,value) VALUES ('other-voucher','org-b','ORIGINAL',25)");
    const { routes, express } = routerDouble(); load('routes/backup.js', { express });
    const handler = routes.find(r => r.method === 'post' && r.route === '/import').handlers.at(-1);
    const archive = backendRequire('archiver')('zip'); const chunks = [];
    archive.on('data', chunk => chunks.push(chunk));
    const end = new Promise((resolve, reject) => { archive.on('end', resolve); archive.on('error', reject); });
    archive.append(JSON.stringify({ version: 3, tables: { vouchers: [{
      id: 'other-voucher', organization_id: 'org-a', code: 'REPLACED', value: 1,
    }] } }), { name: 'backup.json' });
    await archive.finalize(); await end;
    const res = await call(handler, request({ archiveBase64: Buffer.concat(chunks).toString('base64') }));
    assert.equal(res.statusCode, 400);
    assert.equal(db.prepare('SELECT organization_id FROM vouchers WHERE id=?').get('other-voucher').organization_id, 'org-b');
  });
  await check('Backup completo remapeia vouchers e reverte falhas de integridade', () => {
    const { exportData, prepareImport, restoreData } = backendRequire('./services/backupData');
    const source = exportData('org-a');
    source.tables.vouchers.push({ ...db.prepare("SELECT * FROM vouchers WHERE id='other-voucher'").get(), code: 'COPIED', value: 1 });
    const prepared = prepareImport(source, 'org-a');
    const copied = prepared.vouchers.find(v => v.code === 'COPIED');
    assert.notEqual(copied.id, 'other-voucher');
    restoreData(prepared, 'org-a');
    assert.equal(db.prepare("SELECT value FROM vouchers WHERE id='other-voucher'").get().value, 25);
    assert.equal(db.prepare('SELECT organization_id FROM vouchers WHERE id=?').get(copied.id).organization_id, 'org-a');
    assert.equal(db.pragma('foreign_key_check').length, 0);
    const before = JSON.stringify(exportData('org-a').tables);
    prepared.vouchers.push({ ...copied, id: 'duplicate-code' });
    assert.throws(() => restoreData(prepared, 'org-a'), /UNIQUE/);
    assert.equal(JSON.stringify(exportData('org-a').tables), before);
  });
  await check('S05: remoção revoga push', async () => {
    const team = load('controllers/teamController.js'); const sent = [];
    const push = load('services/pushService.js', { 'web-push': {
      generateVAPIDKeys: () => ({ publicKey: 'fake', privateKey: 'fake' }), setVapidDetails() {},
      sendNotification: async (subscription, payload) => sent.push({ subscription, payload }),
    } });
    push.saveSubscription('org-a', 'audit-user', { endpoint: 'https://example.invalid/push', keys: {} });
    push.saveSubscription('org-b', 'audit-user', { endpoint: 'https://example.invalid/foreign-push', keys: {} });
    assert.equal(push.deleteSubscription('org-a', 'audit-user', 'https://example.invalid/foreign-push'), false);
    assert.equal(db.prepare("SELECT count(*) AS n FROM push_subscriptions WHERE endpoint='https://example.invalid/foreign-push'").get().n, 1);
    await call(team.removeMember, request({}, { id: 'member-a' }));
    await push.sendToOrganization('org-a', { body: 'Synthetic guest information' });
    assert.equal(sent.length, 0);
  });
  await check('F05: recuperação usa remetente de organização válida', async () => {
    db.exec("INSERT INTO memberships (id,organization_id,user_id,role) VALUES ('new-member','org-a','audit-user','owner'); INSERT INTO google_email_connections (organization_id,email,tokens) VALUES ('org-a','mail@example.invalid','{}');");
    const { routes, express } = routerDouble(); const calls = [];
    load('routes/auth.js', { express, '../services/emailService': { sendMail: async (org, message) => calls.push(org) } });
    const handler = routes.find(r => r.method === 'post' && r.route === '/forgot-password').handlers.at(-1);
    await call(handler, request({ email: 'user@example.invalid' }));
    assert.equal(calls.length, 1); assert.equal(calls[0], 'org-a');
  });
  await check('F06: idade-limite coincide entre frontend e backend', () => {
    const context = vm.createContext({ window: {} });
    runFrontend(fs.readFileSync(path.join(root, 'frontend/js/domain/dates.js'), 'utf8'), context);
    runFrontend(fs.readFileSync(path.join(root, 'frontend/js/domain/pricing.js'), 'utf8'), context);
    const acc = { baby_age_limit: 2, baby_price: 0, child_age_limit: 12, child_price: 25 };
    const front = context.window.ReservationPricing.getAgeSpecialRates(acc, ['2024-01-01'], '2026-01-01');
    const back = rules.getAgeSpecialRates(acc, ['2024-01-01'], '2026-01-01');
    assert.equal(front[0], 0); assert.equal(back[0], 0);
  });
  await check('F11: rejeita datas inexistentes', () => {
    assert.throws(() => rules.calculateReservationTotals({ max_guests: 4, price_per_night: 100 }, [], {
      check_in: '2030-02-31', check_out: '2030-03-04', num_guests: 1,
    }), /Datas inválidas/);
    assert.equal(rules.normalizeDateValue('2028-02-29'), '2028-02-29');
  });
  await check('S12: rascunhos são isolados por conta', () => {
    const storage = new Map();
    const values = { 'f-doc-num': { value: 'SYNTHETIC-DOCUMENT' }, 'f-nif': { value: 'SYNTHETIC-NIF' } };
    const context = vm.createContext({ window: {}, console, setTimeout, clearTimeout,
      document: { readyState: 'loading', addEventListener() {}, getElementById: id => values[id] || null,
        querySelector: () => null, querySelectorAll: () => [] },
      localStorage: { setItem: (key, value) => storage.set(key, value), getItem: key => storage.get(key), removeItem: key => storage.delete(key) },
      sessionStorage: { setItem: (key, value) => storage.set(key, value), getItem: key => storage.get(key), removeItem: key => storage.delete(key) },
      currentUser: { id: 'user-a', organization_id: 'org-a' }, editingId: null,
    });
    for (const file of JSON.parse(fs.readFileSync(path.join(root, 'frontend/js/features/manifest.json'), 'utf8'))['js/reserva-wizard.js'].scripts) runFrontend(fs.readFileSync(path.join(root, 'frontend', file), 'utf8'), context);
    vm.runInContext('saveReservaDraft()', context);
    context.currentUser = { id: 'user-b', organization_id: 'org-b' };
    const draft = vm.runInContext('loadReservaDraft()', context);
    assert.equal(draft, null);
  });
  await check('S07: códigos de acesso exigem aprovação e pagamento', async () => {
    const today = new Date().toISOString().slice(0, 10);
    db.prepare("INSERT INTO guests (id,organization_id,name,email) VALUES ('scheduler-guest','org-a','Synthetic Guest','scheduler@example.invalid')").run();
    db.prepare("INSERT INTO accommodations (id,organization_id,name,type,door_code) VALUES ('scheduler-unit','org-a','Synthetic Unit','alojamento','FAKE-CODE')").run();
    db.prepare(`INSERT INTO reservations
      (id,organization_id,guest_id,accommodation_id,check_in,check_out,nights,num_guests,total_amount,status,amount_paid)
      VALUES ('scheduler-res','org-a','scheduler-guest','scheduler-unit',?,?,1,1,100,'pendente',0)`).run(today,today);
    db.prepare(`INSERT INTO organization_email_templates
      (organization_id,slug,name,subject,body,timing_event,timing_direction,timing_unit,timing_offset)
      VALUES ('org-a','codigo_porta','Door','Door','{{codigo_porta}}','checkin','before','days',1)`).run();
    const calls = [];
    const scheduler = load('services/emailScheduler.js', { './emailService': {
      getEmailSettings: () => ({}),
      sendTemplatedEmail: async (...args) => { calls.push(args); return null; },
    } });
    process.env.EMAIL_ENABLED = 'true';
    try { await scheduler.runScheduler(); } finally { process.env.EMAIL_ENABLED = 'false'; }
    assert.equal(calls.some(([slug, guest, res, acc]) => slug === 'codigo_porta' && res.status === 'pendente' && acc.door_code === 'FAKE-CODE'), false);
  });
  await check('F07 falha de envio é repetida; envio confirmado é registado uma vez', async () => {
    const calls = [];
    let delivered = false;
    db.exec("UPDATE reservations SET status='confirmada', amount_paid=100 WHERE id='scheduler-res'");
    const scheduler = load('services/emailScheduler.js', { './emailService': {
      getEmailSettings: () => ({}),
      sendTemplatedEmail: async (...args) => { calls.push(args); return delivered ? { id: 'synthetic-delivery' } : null; },
    } });
    const logCount = () => db.prepare("SELECT count(*) AS n FROM organization_email_log WHERE reservation_id='scheduler-res' AND template_slug='codigo_porta'").get().n;
    process.env.EMAIL_ENABLED = 'true';
    try {
      await scheduler.runScheduler(); assert.equal(calls.length, 1); assert.equal(logCount(), 0);
      delivered = true;
      await scheduler.runScheduler(); assert.equal(calls.length, 2); assert.equal(logCount(), 1);
      await scheduler.runScheduler(); assert.equal(calls.length, 2); assert.equal(logCount(), 1);
    } finally { process.env.EMAIL_ENABLED = 'false'; }
  });
  await check('Email agendado enviado pela fila fica registado e não se repete', async () => {
    reservation('queued-scheduled', 'scheduler-unit', '[]', 200);
    db.prepare('INSERT INTO organization_email_queue(id,organization_id,template_slug,reservation_id) VALUES(?,?,?,?)')
      .run('queued-id', 'org-a', 'codigo_porta', 'queued-scheduled');
    let sends = 0;
    const scheduler = load('services/emailScheduler.js', { './emailService': {
      getEmailSettings: () => ({}),
      sendTemplatedEmail: async () => { sends++; return { id: 'synthetic-queued' }; },
    } });
    process.env.EMAIL_ENABLED = 'true';
    try {
      await scheduler.runScheduler();
      assert.equal(sends, 1);
      assert(db.prepare('SELECT 1 FROM organization_email_log WHERE reservation_id=?').get('queued-scheduled'));
      assert.equal(db.prepare('SELECT 1 FROM organization_email_queue WHERE id=?').get('queued-id'), undefined);
      const today = new Date().toISOString().slice(0, 10);
      db.prepare('UPDATE reservations SET check_in=?,check_out=? WHERE id=?').run(today, today, 'queued-scheduled');
      await scheduler.runScheduler();
      assert.equal(sends, 1);
    } finally { process.env.EMAIL_ENABLED = 'false'; }
  });
  await check('S06: cache não guarda respostas privadas', async () => {
    const entries = new Map(); let online = true; const listeners = {};
    const cache = { put: async (req, res) => entries.set(req.url, res), match: async req => entries.get(req.url)?.clone() };
    const context = vm.createContext({ URL, Response, console,
      self: { addEventListener: (name, fn) => { listeners[name] = fn; }, location: { origin: 'https://audit.invalid' } },
      caches: { open: async () => cache, match: cache.match },
      fetch: async () => { if (!online) throw new Error('offline'); return new Response(JSON.stringify({ organization: 'org-a', private: 'synthetic' })); },
    });
    runFrontend(fs.readFileSync(path.join(root, 'frontend/service-worker.js'), 'utf8'), context);
    const req = { url: 'https://audit.invalid/api/guests', method: 'GET' };
    let pending; const event = { request: req, respondWith: p => { pending = p; } };
    listeners.fetch(event); await pending;
    assert.equal(entries.size, 0);
    online = false; listeners.fetch(event); await assert.rejects(pending, /offline/);
  });
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  db.close(); process.chdir(originalCwd); fs.rmSync(temp, { recursive: true, force: true });
});
