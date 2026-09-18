// Diagnóstico da auditoria. Usa exclusivamente SQLite em memória e ficheiros
// temporários; serviços externos são substituídos. Não é uma suite de regressão:
// cada CONFIRMADO significa que o problema descrito ainda é reproduzível.
// Executar na raiz: node docs/auditoria-2026-09-17/reproduzir.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../..');
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
const taskStub = { syncReservationOperationalTasks() {}, syncOrganizationOperationalTasks() {} };
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
    require: id => Object.hasOwn(stubs, id) ? stubs[id] : localRequire(id),
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
  await fn(req, res, error => { throw error; });
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
let confirmed = 0;
async function check(name, fn) {
  try { const detail = await fn(); confirmed++; console.log(`CONFIRMADO: ${name}${detail ? ' — ' + detail : ''}`); }
  catch (error) { console.error(`NÃO REPRODUZIDO/ERRO: ${name} — ${error.message}`); process.exitCode = 1; }
}
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
  await check('F10 totais negativos e estado inicial ignorado na criação interna', async () => {
    const res = await call(reservationCtrl.create, request({ accommodation_id: 'unit-b',
      check_in: '2032-01-01', check_out: '2032-01-03', num_guests: 1,
      guest: { name: 'Synthetic Internal', email: 'internal@example.invalid' },
      total_amount: -5, amount_paid: -10, status: 'pre_reserva',
    }));
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.data.total_amount, -5);
    assert.equal(res.body.data.amount_paid, -10);
    assert.equal(res.body.data.status, 'confirmada');
    return 'total -5 EUR e pagamento -10 EUR aceites; pre_reserva gravada como confirmada';
  });
  await check('S01 preço público controlado pelo cliente', async () => {
    const res = await call(publicCtrl.createReservation, request({ accommodation_id: 'unit-a',
      check_in: '2030-01-01', check_out: '2030-01-03', num_guests: 1,
      guest: { name: 'Claimed Name', email: 'existing@example.invalid' }, rgpd_consent: true, elapsed_ms: 9000,
      nightly_prices: [{ date: '2030-01-01', price: 0 }, { date: '2030-01-02', price: 0 }],
    }, { slug: 'audit-a' }));
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.data.total_amount, 0);
    publicToken = res.body.data.precheckin_url.split('/').pop();
    return 'tarifa normal 200 EUR; reserva gravada a 0 EUR (taxa turística desativada no cenário)';
  });
  await check('S02 associação pública a hóspede existente e alteração da ficha', async () => {
    const read = await call(publicCtrl.getPreCheckin, request({}, { token: publicToken }));
    assert.equal(read.body.data.guest.phone, 'PRIVATE-PHONE');
    const write = await call(publicCtrl.submitPreCheckin, request({ guest: {
      name: 'Changed By Public Link', email: 'changed@example.invalid', nationality: 'Portugal',
    } }, { token: publicToken }));
    assert.equal(write.statusCode, 200);
    assert.equal(db.prepare('SELECT name FROM guests WHERE id=?').get('guest-a').name, 'Changed By Public Link');
    return 'telefone anterior exposto; ficha global alterada sem confirmar email';
  });
  await check('S08 pré-check-in público contorna aprovação e expiração de pendentes', async () => {
    const row = db.prepare('SELECT * FROM reservations WHERE precheckin_token=?').get(publicToken);
    assert.equal(row.status, 'aguardar_pagamento');
    db.prepare("UPDATE reservations SET created_at=datetime('now','-72 hours') WHERE id=?").run(row.id);
    const scheduler = load('services/reservationScheduler.js', {
      './operationalTasksService': taskStub, './calendarService': calendarStub,
    });
    scheduler.expirePendingReservations();
    assert.equal(db.prepare('SELECT status FROM reservations WHERE id=?').get(row.id).status, 'aguardar_pagamento');
    return 'estado avançado sem aprovação; reserva não paga há 72h continua a bloquear datas';
  });
  await check('F01 reserva pública completa ignora conflitos sem suites filhas', async () => {
    const res = await call(publicCtrl.createReservation, request({ accommodation_id: 'property',
      check_in: '2030-01-01', check_out: '2030-01-03', num_guests: 1,
      guest: { name: 'New Guest', email: 'other@example.invalid' }, rgpd_consent: true, elapsed_ms: 9000,
    }, { slug: 'audit-a' }));
    assert.equal(res.statusCode, 201);
    assert.equal(db.prepare('SELECT count(*) AS n FROM reservations WHERE accommodation_id=?').get('unit-a').n, 2);
    return 'duas reservas sobrepostas na mesma propriedade';
  });
  await check('F02 unidade secundária de multi-suite continua disponível', async () => {
    reservation('multi', 'unit-a', JSON.stringify([{ accommodation_id: 'unit-b' }]));
    const req = request(); req.query = { check_in: '2030-01-01', check_out: '2030-01-03' };
    const res = await call(reservationCtrl.getAvailability, req);
    assert.equal(res.body.data.unavailable.includes('unit-b'), false);
    return 'unit-b ocupada em accommodations_data, mas ausente da lista indisponível';
  });
  await check('F03 pagamento inicial desaparece ao adicionar outro', async () => {
    reservation('payments', 'unit-b', '[]', 100);
    const res = await call(reservationCtrl.addPayment, request({ amount: 50 }, { id: 'payments' }));
    assert.equal(res.body.data.newTotalPaid, 50);
    return '100 EUR existentes + 50 EUR novos = 50 EUR registados';
  });
  await check('F04 atualizar acompanhante existente referencia coluna inexistente', async () => {
    await assert.rejects(() => call(reservationCtrl.update, request({ status: 'cancelada',
      guests_data: [{ name: 'Guest Again', email: 'changed@example.invalid' }],
    }, { id: 'payments' })), /no such column: updated_at/);
  });
  await check('S03 apagar imagem de outra organização por URL', async () => {
    const ctrl = load('controllers/accommodationController.js');
    db.prepare('UPDATE accommodations SET images=? WHERE id=?').run('{"room":[]}', 'unit-a');
    const victim = path.join(ctrl.UPLOADS_DIR, 'other-org-photo.png');
    fs.writeFileSync(victim, 'synthetic image owned by org B');
    const res = await call(ctrl.deleteImage, request({ section: 'room', url: '/uploads/other-org-photo.png' }, { id: 'unit-a' }));
    assert.equal(res.statusCode, 200); assert.equal(fs.existsSync(victim), false);
    const traversal = await call(ctrl.uploadImages, request({ section: 'x/../../../audit-outside',
      image: 'data:image/png;base64,' + Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]).toString('base64'),
    }, { id: 'unit-a' }));
    assert.equal(traversal.statusCode, 200);
    assert.equal(fs.readdirSync(temp).some(name => name.startsWith('audit-outside_')), true);
    return 'remoção sem propriedade do ficheiro; escrita fora de uploads via section, limitada à pasta temporária';
  });
  await check('F08 backup não conserva bloqueios, logótipos e talões', async () => {
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
    assert.equal(zip.files.some(f => f.path.endsWith('audit-logo.png')), false);
    assert.equal(zip.files.some(f => f.path.endsWith('audit-receipt.png')), false);
    const restored = await call(into, request({ archiveBase64: zipped.toString('base64') }));
    assert.equal(restored.statusCode, 200);
    assert.equal(db.prepare("SELECT count(*) AS n FROM accommodation_blocks WHERE id='audit-block'").get().n, 0);
    return 'restauro do próprio ZIP perde bloqueio; ZIP não contém logótipo nem talão';
  });
  await check('S04 importação substitui voucher de outra organização', async () => {
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
    assert.equal(res.statusCode, 200);
    assert.equal(db.prepare('SELECT organization_id FROM vouchers WHERE id=?').get('other-voucher').organization_id, 'org-a');
    return 'voucher org-b substituído por voucher org-a';
  });
  await check('S05 notificações continuam após remover membro', async () => {
    const team = load('controllers/teamController.js'); const sent = [];
    const push = load('services/pushService.js', { 'web-push': {
      generateVAPIDKeys: () => ({ publicKey: 'fake', privateKey: 'fake' }), setVapidDetails() {},
      sendNotification: async (subscription, payload) => sent.push({ subscription, payload }),
    } });
    push.saveSubscription('org-a', 'audit-user', { endpoint: 'https://example.invalid/push', keys: {} });
    await call(team.removeMember, request({}, { id: 'member-a' }));
    await push.sendToOrganization('org-a', { body: 'Synthetic guest information' });
    assert.equal(sent.length, 1);
  });
  await check('F05 recuperação de password sem organização para envio', async () => {
    const { routes, express } = routerDouble(); const calls = [];
    load('routes/auth.js', { express, '../services/emailService': { sendMail: async (org, message) => calls.push(org) } });
    const handler = routes.find(r => r.method === 'post' && r.route === '/forgot-password').handlers.at(-1);
    await call(handler, request({ email: 'user@example.invalid' }));
    assert.equal(calls.length, 1); assert.equal(calls[0], undefined);
  });
  await check('F06 idade-limite com preços diferentes entre frontend e backend', () => {
    const context = vm.createContext({ window: {} });
    vm.runInContext(fs.readFileSync(path.join(root, 'frontend/js/domain/dates.js'), 'utf8'), context);
    vm.runInContext(fs.readFileSync(path.join(root, 'frontend/js/domain/pricing.js'), 'utf8'), context);
    const acc = { baby_age_limit: 2, baby_price: 0, child_age_limit: 12, child_price: 25 };
    const front = context.window.ReservationPricing.getAgeSpecialRates(acc, ['2024-01-01'], '2026-01-01');
    const back = rules.getAgeSpecialRates(acc, ['2024-01-01'], '2026-01-01');
    assert.equal(front[0], 25); assert.equal(back[0], 0);
    return '2 anos: frontend 25 EUR/noite, backend 0 EUR/noite';
  });
  await check('F11 validação de data permite 31 de fevereiro', () => {
    const totals = rules.calculateReservationTotals({ max_guests: 4, price_per_night: 100 }, [], {
      check_in: '2030-02-31', check_out: '2030-03-04', num_guests: 1,
    });
    assert.equal(totals.checkIn, '2030-02-31');
  });
  await check('S12 rascunho guarda documentos numa chave partilhada entre contas', () => {
    const storage = new Map();
    const values = { 'f-doc-num': { value: 'SYNTHETIC-DOCUMENT' }, 'f-nif': { value: 'SYNTHETIC-NIF' } };
    const context = vm.createContext({ window: {}, console, setTimeout, clearTimeout,
      document: { readyState: 'loading', addEventListener() {}, getElementById: id => values[id] || null,
        querySelector: () => null, querySelectorAll: () => [] },
      localStorage: { setItem: (key, value) => storage.set(key, value), getItem: key => storage.get(key), removeItem: key => storage.delete(key) },
      currentUser: { id: 'user-a', organization_id: 'org-a' }, editingId: null,
    });
    vm.runInContext(fs.readFileSync(path.join(root, 'frontend/js/reserva-wizard.js'), 'utf8'), context);
    vm.runInContext('saveReservaDraft()', context);
    context.currentUser = { id: 'user-b', organization_id: 'org-b' };
    const draft = vm.runInContext('loadReservaDraft()', context);
    assert.equal(draft.fields['f-doc-num'], 'SYNTHETIC-DOCUMENT');
    assert.equal(draft.fields['f-nif'], 'SYNTHETIC-NIF');
  });
  await check('S07 scheduler seleciona código de porta para reserva pendente', async () => {
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
    assert.equal(calls.some(([slug, guest, res, acc]) => slug === 'codigo_porta' && res.status === 'pendente' && acc.door_code === 'FAKE-CODE'), true);
    return 'envio simulado, nenhuma mensagem enviada';
  });
  await check('F07 scheduler regista email como enviado quando envio devolve null', () => {
    assert.equal(db.prepare("SELECT count(*) AS n FROM organization_email_log WHERE reservation_id='scheduler-res' AND template_slug='codigo_porta'").get().n, 1);
  });
  await check('S06 cache devolve resposta privada anterior sem rede', async () => {
    const entries = new Map(); let online = true; const listeners = {};
    const cache = { put: async (req, res) => entries.set(req.url, res), match: async req => entries.get(req.url)?.clone() };
    const context = vm.createContext({ URL, Response, console,
      self: { addEventListener: (name, fn) => { listeners[name] = fn; }, location: { origin: 'https://audit.invalid' } },
      caches: { open: async () => cache, match: cache.match },
      fetch: async () => { if (!online) throw new Error('offline'); return new Response(JSON.stringify({ organization: 'org-a', private: 'synthetic' })); },
    });
    vm.runInContext(fs.readFileSync(path.join(root, 'frontend/service-worker.js'), 'utf8'), context);
    const req = { url: 'https://audit.invalid/api/guests', method: 'GET' };
    let pending; const event = { request: req, respondWith: p => { pending = p; } };
    listeners.fetch(event); await pending;
    online = false; listeners.fetch(event); const res = await pending;
    assert.equal((await res.json()).organization, 'org-a');
    return 'simulação da Cache API por URL; não é um teste de browser';
  });
  console.log(`\n${confirmed} problemas reproduzidos. Dados reais e serviços externos não utilizados.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  db.close(); process.chdir(originalCwd); fs.rmSync(temp, { recursive: true, force: true });
});
