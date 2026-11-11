// Suporte (fundação de segurança): quem vê cada pedido e cada anexo, a
// validação e o envio dos anexos, a rota da consola e o push dirigido.
// App real com SQLite em memória; os pedidos são inseridos diretamente.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-support-'));
const previous = process.cwd();
process.chdir(temp);
Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test', EMAIL_ENABLED: 'false', TRUST_PROXY: 'loopback',
  PLATFORM_ADMIN_EMAILS: 'dona-instancia@example.invalid' });
const app = require('../app');
const { db } = require('../config/database');
const auth = require('../services/authService');
const orgs = require('../services/orgService');
const access = require('../services/supportAccess');
const attachments = require('../services/supportAttachments');
const pushService = require('../services/pushService');
const { findOrphans } = require('../services/uploadOrphans');
const PASSWORD = 'SyntheticSupport123!';
let server, base;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.on('listening', resolve); server.on('error', reject); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server?.close(); db.close(); process.chdir(previous); fs.rmSync(temp, { recursive: true, force: true }); });

const orgA = orgs.createOrganization('Suporte A');
const orgB = orgs.createOrganization('Suporte B');
let seq = 0;
function person(org, role, email = `s${++seq}@example.invalid`) {
  const user = auth.createUser({ name: email.split('@')[0], email, password: PASSWORD });
  orgs.createMembership({ organizationId: org.id, userId: user.id, role });
  return { user: { ...user, role, organization_id: org.id }, session: auth.createSession(user.id, org.id).sessionId };
}
const ownerA = person(orgA, 'owner');
const managerA = person(orgA, 'manager');
const staffA = person(orgA, 'staff');
const staffA2 = person(orgA, 'staff');
const ownerB = person(orgB, 'owner');
const admin = person(orgB, 'owner', 'dona-instancia@example.invalid');
db.prepare('UPDATE users SET platform_admin = 1 WHERE id = ?').run(admin.user.id);

let number = 0;
function ticket(org, author) {
  const id = crypto.randomUUID();
  db.prepare("INSERT INTO support_tickets (id, number, organization_id, author_user_id, type, subject) VALUES (?, ?, ?, ?, 'problem', 'Teste')")
    .run(id, ++number, org.id, author.user.id);
  const messageId = crypto.randomUUID();
  db.prepare("INSERT INTO support_messages (id, ticket_id, side, author_user_id, body) VALUES (?, ?, 'customer', ?, 'Olá')")
    .run(messageId, id, author.user.id);
  return { id, messageId };
}
function attach(t, list) {
  return attachments.validateAndStore(list).map(meta => {
    const id = crypto.randomUUID();
    db.prepare('INSERT INTO support_attachments (id, message_id, ticket_id, original_name, mime, size, stored_name) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, t.messageId, t.id, meta.original_name, meta.mime, meta.size, meta.stored_name);
    return { id, ...meta };
  });
}
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
const b64 = buf => buf.toString('base64');
const supportFiles = () => (fs.existsSync(attachments.SUPPORT_DIR) ? fs.readdirSync(attachments.SUPPORT_DIR).sort() : []);
const get = (who, url, init = {}) => fetch(base + url, { ...init, headers: { Cookie: `${auth.SESSION_COOKIE}=${who.session}`, 'Content-Type': 'application/json', ...init.headers } });
const status400 = fn => assert.throws(fn, err => err.status === 400 && /[a-zà-ú]/i.test(err.message));

test('visibilidade: o autor e owner/manager veem; outro staff e outra organização recebem 404', async () => {
  const t = ticket(orgA, staffA);
  for (const who of [staffA, ownerA, managerA]) {
    assert.equal(access.canSeeTicket(who.user, db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(t.id)), true);
    assert.equal(access.findVisibleTicket(who.user, t.id).id, t.id);
  }
  for (const who of [staffA2, ownerB, admin]) {
    assert.throws(() => access.findVisibleTicket(who.user, t.id), err => err.status === 404 && err.message === 'Pedido não encontrado.');
  }
  assert.throws(() => access.findVisibleTicket(ownerA.user, 'inexistente'), { status: 404 });

  const visible = who => {
    const { sql, params } = access.listVisibilityWhere(who.user);
    return db.prepare(`SELECT t.id FROM support_tickets t WHERE ${sql}`).all(...params).map(r => r.id);
  };
  const other = ticket(orgA, staffA2);
  const foreign = ticket(orgB, ownerB);
  assert.deepEqual(visible(staffA), [t.id]);
  assert.deepEqual(new Set(visible(ownerA)), new Set([t.id, other.id]));
  assert.deepEqual(new Set(visible(managerA)), new Set([t.id, other.id]));
  assert.deepEqual(visible(ownerB), [foreign.id]);
  assert.deepEqual(access.listVisibilityWhere({ id: 'x' }), { sql: '0 = 1', params: [] });
});

test('anexo PNG e PDF: gravados com o tipo real e servidos com os cabeçalhos seguros', async () => {
  const t = ticket(orgA, staffA);
  const [png, pdf] = attach(t, [{ name: '../../etc/Captura\u0007 ecrã.png', data_base64: b64(PNG) },
    { name: 'C:\\temp\\fatura.pdf', data_base64: 'data:application/pdf;base64,' + b64(PDF) }]);
  assert.equal(png.original_name, 'Captura ecrã.png');
  assert.equal(png.mime, 'image/png');
  assert.equal(png.size, PNG.length);
  assert.match(png.stored_name, /^[0-9a-f-]{36}\.png$/);
  assert.equal(pdf.original_name, 'fatura.pdf');
  assert.equal(pdf.mime, 'application/pdf');
  assert.ok(fs.existsSync(path.join(temp, 'data/uploads/support', png.stored_name)));

  for (const [meta, bytes] of [[png, PNG], [pdf, PDF]]) {
    for (const who of [staffA, ownerA]) {
      const r = await get(who, `/api/support/attachments/${meta.id}`);
      assert.equal(r.status, 200);
      assert.equal(r.headers.get('content-type'), meta.mime);
      assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(r.headers.get('cache-control'), 'no-store');
      assert.equal(r.headers.get('content-security-policy'), "default-src 'none'; sandbox");
      assert.equal(r.headers.get('content-disposition'),
        `inline; filename="${meta.original_name.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(meta.original_name)}`);
      assert.deepEqual(Buffer.from(await r.arrayBuffer()), bytes);
    }
  }
  // Nem pelo /uploads público, nem por outro staff, nem por outra organização.
  assert.equal((await fetch(`${base}/uploads/support/${png.stored_name}`)).status, 404);
  for (const who of [staffA2, ownerB]) {
    const r = await get(who, `/api/support/attachments/${png.id}`);
    assert.equal(r.status, 404);
    assert.deepEqual(await r.json(), { success: false, error: 'Anexo não encontrado.' });
  }
  assert.equal((await get(ownerA, '/api/support/attachments/nao-existe')).status, 404);
  assert.equal((await fetch(`${base}/api/support/attachments/${png.id}`)).status, 401);
});

test('anexos recusados: conteúdo falso, SVG, HTML, >10 MB, vazio e mais de 3', () => {
  const before = supportFiles();
  status400(() => attachments.validateAndStore([{ name: 'foto.png', data_base64: b64(Buffer.from('isto é só texto, não uma imagem')) }]));
  status400(() => attachments.validateAndStore([{ name: 'a.svg', data_base64: b64(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')) }]));
  status400(() => attachments.validateAndStore([{ name: 'a.html', data_base64: b64(Buffer.from('<!doctype html><script>alert(1)</script>')) }]));
  status400(() => attachments.validateAndStore([{ name: 'grande.png', data_base64: b64(Buffer.concat([PNG, Buffer.alloc(11 * 1024 * 1024)])) }]));
  status400(() => attachments.validateAndStore([{ name: 'vazio.png', data_base64: '' }]));
  status400(() => attachments.validateAndStore([{ name: 'x.png', data_base64: '***' }]));
  status400(() => attachments.validateAndStore([{ name: 'x.png' }]));
  status400(() => attachments.validateAndStore('nao-lista'));
  assert.throws(() => attachments.validateAndStore(Array.from({ length: 4 }, () => ({ name: 'a.png', data_base64: b64(PNG) }))),
    { status: 400, message: 'No máximo 3 anexos por mensagem.' });
  // Exatamente 10 MB passa.
  const [limit] = attachments.validateAndStore([{ name: 'limite.pdf', data_base64: b64(Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024 - PDF.length)])) }]);
  assert.equal(limit.size, 10 * 1024 * 1024);
  attachments.removeStored([limit]);
  assert.deepEqual(supportFiles(), before);
  assert.deepEqual(attachments.validateAndStore(undefined), []);
});

test('falha a meio: os anexos já gravados nessa chamada são apagados', () => {
  const before = supportFiles();
  assert.throws(() => attachments.validateAndStore([
    { name: 'ok.png', data_base64: b64(PNG) }, { name: 'ok.pdf', data_base64: b64(PDF) },
    { name: 'falso.png', data_base64: b64(Buffer.from('<html>texto qualquer</html>')) },
  ]), { status: 400, message: /^Anexo 3: formato não suportado/ });
  assert.deepEqual(supportFiles(), before);
});

test('nome do anexo: sem caminhos nem controlo, ≤120 caracteres e com a extensão do tipo real', () => {
  const png = attachments.detectType(PNG);
  assert.equal(attachments.sanitizeName('/a/b/relatório.PNG', png), 'relatório.PNG');
  assert.equal(attachments.sanitizeName('foto.jpg', png), 'foto.jpg.png');
  assert.equal(attachments.sanitizeName('\u202Egnp.exe', png), 'gnp.exe.png');
  assert.equal(attachments.sanitizeName('', png), 'anexo.png');
  assert.equal(attachments.sanitizeName('.png', png), 'anexo.png');
  const long = attachments.sanitizeName('x'.repeat(300) + '.png', png);
  assert.equal(long.length, 120);
  assert.ok(long.endsWith('.png'));
});

test('consola: anexo de qualquer organização só para o admin com a consola desbloqueada', async () => {
  const t = ticket(orgA, staffA);
  const [png] = attach(t, [{ name: 'a.png', data_base64: b64(PNG) }]);
  const url = `/api/platform/support/attachments/${png.id}`;
  for (const who of [ownerA, ownerB, staffA]) {
    const r = await get(who, url);
    assert.equal(r.status, 404);
    assert.deepEqual(await r.json(), { success: false, error: 'Endpoint não encontrado.' });
  }
  const locked = await get(admin, url);
  assert.equal(locked.status, 423);
  assert.equal((await locked.json()).locked, true);
  assert.equal((await get(admin, '/api/platform/unlock', { method: 'POST', body: JSON.stringify({ password: PASSWORD }) })).status, 200);
  const r = await get(admin, url);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'image/png');
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.headers.get('content-security-policy'), "default-src 'none'; sandbox");
  assert.deepEqual(Buffer.from(await r.arrayBuffer()), PNG);
  // O mesmo admin, do lado do cliente, não vê pedidos de outra organização.
  assert.equal((await get(admin, `/api/support/attachments/${png.id}`)).status, 404);
  assert.equal((await get(admin, '/api/platform/support/attachments/nao-existe')).status, 404);
});

test('esqueleto: rotas do contrato respondem 501 e o parser de 15 MB só abre depois de autenticar', async () => {
  for (const [method, url] of [['GET', '/api/support/tickets'], ['GET', '/api/support/tickets/x'], ['GET', '/api/support/summary'],
    ['POST', '/api/support/tickets'], ['POST', '/api/support/tickets/x/messages'], ['POST', '/api/support/tickets/x/feedback']]) {
    const r = await get(staffA, url, { method, body: method === 'POST' ? '{}' : undefined });
    assert.equal(r.status, 501, `${method} ${url}`);
    assert.equal((await r.json()).success, false);
  }
  for (const [method, url] of [['GET', '/api/platform/support/tickets'], ['GET', '/api/platform/support/tickets/x'],
    ['POST', '/api/platform/support/tickets/x/messages'], ['PUT', '/api/platform/support/tickets/x']]) {
    assert.equal((await get(admin, url, { method, body: method === 'GET' ? undefined : '{}' })).status, 501, `${method} ${url}`);
    assert.equal((await get(ownerA, url, { method, body: method === 'GET' ? undefined : '{}' })).status, 404, `${method} ${url}`);
  }
  const big = JSON.stringify({ body: 'x', attachments: [{ name: 'a.png', data_base64: 'A'.repeat(12 * 1024 * 1024) }] });
  assert.equal((await get(staffA, '/api/support/tickets', { method: 'POST', body: big })).status, 501);
  assert.equal((await get(staffA, '/api/support/tickets/x/messages', { method: 'POST', body: big })).status, 501);
  assert.equal((await get(admin, '/api/platform/support/tickets/x/messages', { method: 'POST', body: big })).status, 501);
  assert.equal((await get(ownerA, '/api/platform/support/tickets/x/messages', { method: 'POST', body: big })).status, 404);
  assert.equal((await get(staffA, '/api/support/tickets/x/feedback', { method: 'POST', body: big })).status, 413);
  assert.equal((await fetch(base + '/api/support/tickets', { method: 'POST', body: big, headers: { 'Content-Type': 'application/json' } })).status, 401);
});

test('ficheiros órfãos: os anexos com linha ficam, os sem linha são detetados', () => {
  const t = ticket(orgA, staffA);
  const [kept] = attach(t, [{ name: 'a.png', data_base64: b64(PNG) }]);
  const [loose] = attachments.validateAndStore([{ name: 'b.png', data_base64: b64(PNG) }]);
  const old = new Date(Date.now() - 3600000);
  for (const meta of [kept, loose]) fs.utimesSync(path.join(attachments.SUPPORT_DIR, meta.stored_name), old, old);
  const found = findOrphans({ minAgeHours: 0 }).files.map(f => f.path);
  assert.ok(found.includes(`support/${loose.stored_name}`));
  assert.ok(!found.includes(`support/${kept.stored_name}`));
  // Apagar a organização apaga as linhas em cascata e o ficheiro passa a órfão.
  db.prepare('DELETE FROM support_tickets WHERE id = ?').run(t.id);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM support_attachments WHERE id = ?').get(kept.id).n, 0);
  assert.ok(findOrphans({ minAgeHours: 0 }).files.some(f => f.path === `support/${kept.stored_name}`));
});

test('push com userIds: só os dispositivos desses utilizadores; sem a opção, todos', async () => {
  const sub = db.prepare('INSERT INTO push_subscriptions (organization_id, user_id, endpoint, keys_json, active) VALUES (?, ?, ?, ?, 1)');
  for (const who of [ownerA, managerA, staffA]) sub.run(orgA.id, who.user.id, `https://fcm.googleapis.com/fcm/send/${who.user.id}`, JSON.stringify({ p256dh: 'x', auth: 'y' }));
  const webpush = require('web-push');
  const original = webpush.sendNotification;
  let endpoints = [];
  webpush.sendNotification = async subscription => { endpoints.push(subscription.endpoint.split('/').pop()); };
  try {
    const send = async options => { endpoints = []; const r = await pushService.sendToOrganization(orgA.id, { title: 't' }, options); return { r, ids: endpoints.sort() }; };
    assert.deepEqual((await send({ userIds: [staffA.user.id, ownerB.user.id] })).ids, [staffA.user.id]);
    assert.deepEqual((await send({ userIds: [staffA.user.id, managerA.user.id], roles: ['owner', 'manager'] })).ids, [managerA.user.id]);
    assert.deepEqual((await send({ userIds: [staffA.user.id], excludeUserId: staffA.user.id })).ids, []);
    const none = await send({ userIds: [] });
    assert.deepEqual(none.ids, []);
    assert.equal(none.r.total, 0);
    assert.deepEqual((await send({})).ids, [ownerA.user.id, managerA.user.id, staffA.user.id].sort());
  } finally { webpush.sendNotification = original; }
});

test('migração idempotente e com as restrições previstas', () => {
  require('../config/migrations').runMigrations(db);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM schema_migrations WHERE id = '20261113_support'").get().n, 1);
  const insert = (fields = {}) => db.prepare('INSERT INTO support_tickets (id, number, organization_id, type, subject, status) VALUES (?, ?, ?, ?, ?, ?)')
    .run(crypto.randomUUID(), fields.number ?? ++number, orgA.id, fields.type ?? 'question', 'x', fields.status ?? 'open');
  assert.throws(() => insert({ type: 'outro' }), /CHECK/);
  assert.throws(() => insert({ status: 'fechado' }), /CHECK/);
  assert.throws(() => insert({ number: 1 }), /UNIQUE/);
  const t = ticket(orgA, staffA);
  assert.throws(() => db.prepare("INSERT INTO support_messages (id, ticket_id, side, body) VALUES (?, ?, 'outro', 'x')").run(crypto.randomUUID(), t.id), /CHECK/);
});
