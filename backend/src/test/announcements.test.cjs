// Comunicados: estados, público (todos, clientes, pacotes), fechar por pessoa,
// isolamento entre organizações, validações e registo da consola. App real, SQLite em memória.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-announcements-'));
const previous = process.cwd();
process.chdir(temp);
Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test', EMAIL_ENABLED: 'false', TRUST_PROXY: 'loopback',
  PLATFORM_ADMIN_EMAILS: 'dono@example.invalid' });
const app = require('../app');
const { db } = require('../config/database');
const auth = require('../services/authService');
const orgs = require('../services/orgService');
const access = require('../services/platformAccess');
const PASSWORD = 'SyntheticOwner123!';
let server, base;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.on('listening', resolve); server.on('error', reject); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server?.close(); db.close(); process.chdir(previous); fs.rmSync(temp, { recursive: true, force: true }); });

// O A1 cria organizations.plan_id; sem ele, o teste põe a coluna.
if (!db.pragma('table_info(organizations)').some(c => c.name === 'plan_id')) db.exec('ALTER TABLE organizations ADD COLUMN plan_id TEXT');

// Com a tabela de pacotes (FK), os ids 7 e 8 têm de existir.
if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='plans'").get()) {
  for (const id of ['7', '8']) db.prepare('INSERT OR IGNORE INTO plans (id, name) VALUES (?, ?)').run(id, `Pacote teste ${id}`);
}
const alfa = orgs.createOrganization('Alfa');
const beta = orgs.createOrganization('Beta');
db.prepare('UPDATE organizations SET plan_id = ? WHERE id = ?').run('7', alfa.id);
db.prepare('UPDATE organizations SET plan_id = ? WHERE id = ?').run('8', beta.id);
function person(email, org, { flag = false } = {}) {
  const user = auth.createUser({ name: email.split('@')[0], email, password: PASSWORD });
  orgs.createMembership({ organizationId: org.id, userId: user.id, role: 'owner' });
  if (flag) db.prepare('UPDATE users SET platform_admin = 1 WHERE id = ?').run(user.id);
  return { user, session: auth.createSession(user.id, org.id).sessionId };
}
const owner = person('dono@example.invalid', alfa, { flag: true });
const alfa2 = person('alfa2@example.invalid', alfa);
const betaUser = person('beta@example.invalid', beta);
before(async () => { await access.unlock(owner.session, owner.user.id, PASSWORD); });

const cookie = who => ({ Cookie: `${auth.SESSION_COOKIE}=${who.session}`, 'Content-Type': 'application/json' });
const consola = (method, url, body) => fetch(`${base}/api/platform/announcements${url}`, { method, headers: cookie(owner), body: body ? JSON.stringify(body) : undefined });
const cliente = (who, method, url = '', body) => fetch(`${base}/api/announcements${url}`, { method, headers: cookie(who), body: body ? JSON.stringify(body) : undefined });
const hours = h => new Date(Date.now() + h * 3600000).toISOString();
const audits = action => db.prepare('SELECT * FROM platform_audit_events WHERE action = ?').all(action);
async function make(extra = {}) {
  const r = await consola('POST', '', { kind: 'notice', title: 'Aviso', body: 'Texto.', starts_at: hours(-1), ...extra });
  assert.equal(r.status, 201, JSON.stringify(await r.clone().json()));
  return (await r.json()).data;
}
const mine = async who => (await (await cliente(who, 'GET')).json()).data;

test('estados: ativo, agendado e terminado (por fim ou por «terminar agora»)', async () => {
  const active = await make({ title: 'Ativo' });
  const scheduled = await make({ title: 'Agendado', starts_at: hours(5), ends_at: hours(6) });
  const byDate = await make({ title: 'Passou', starts_at: hours(-3), ends_at: hours(-2) });
  const manual = await make({ title: 'Manual' });
  assert.deepEqual([active.status, scheduled.status, byDate.status, manual.status], ['active', 'scheduled', 'ended', 'active']);
  const ended = await (await consola('POST', `/${manual.id}/end`)).json();
  assert.equal(ended.data.status, 'ended');
  assert.ok(ended.data.ended_at);
  assert.equal((await consola('POST', `/${manual.id}/end`)).status, 409);
  const list = (await (await consola('GET', '')).json()).data;
  assert.equal(list.find(a => a.id === scheduled.id).status, 'scheduled');
  // O cliente só vê os ativos.
  const titles = (await mine(alfa2)).map(a => a.title);
  assert.ok(titles.includes('Ativo'));
  for (const hidden of ['Agendado', 'Passou', 'Manual']) assert.ok(!titles.includes(hidden), hidden);
  assert.equal(audits('announcement.create').length >= 4, true);
  assert.equal(audits('announcement.end').length, 1);
});

test('público: todos, clientes escolhidos e pacotes', async () => {
  const everyone = await make({ title: 'Para todos', audience: 'all' });
  const onlyBeta = await make({ title: 'So Beta', audience: 'organizations', audience_ids: [beta.id] });
  const planAlfa = await make({ title: 'Pacote 7', audience: 'plans', audience_ids: [7] });
  const both = await make({ title: 'Pacotes 7 e 8', audience: 'plans', audience_ids: ['7', '8'] });
  const forAlfa = (await mine(alfa2)).map(a => a.title);
  const forBeta = (await mine(betaUser)).map(a => a.title);
  assert.ok(forAlfa.includes('Para todos') && forBeta.includes('Para todos'));
  assert.ok(!forAlfa.includes('So Beta') && forBeta.includes('So Beta'));
  assert.ok(forAlfa.includes('Pacote 7') && !forBeta.includes('Pacote 7'));
  assert.ok(forAlfa.includes('Pacotes 7 e 8') && forBeta.includes('Pacotes 7 e 8'));
  assert.deepEqual(both.audience_ids, ['7', '8']);
  // Organização sem pacote só recebe os de «todos» e os escolhidos por id.
  db.prepare('UPDATE organizations SET plan_id = NULL WHERE id = ?').run(beta.id);
  assert.ok(!(await mine(betaUser)).map(a => a.title).includes('Pacotes 7 e 8'));
  db.prepare('UPDATE organizations SET plan_id = ? WHERE id = ?').run('8', beta.id);
  const shape = (await mine(alfa2)).find(a => a.id === everyone.id);
  assert.deepEqual(Object.keys(shape).sort(), ['body', 'dismissed', 'ends_at', 'id', 'kind', 'show_help', 'show_topbar', 'starts_at', 'title']);
  assert.ok(onlyBeta.id && planAlfa.id);
});

test('fechar: por pessoa, repetir não falha e não vale para quem não o vê', async () => {
  const item = await make({ title: 'Fechável', audience: 'organizations', audience_ids: [alfa.id] });
  assert.equal((await cliente(alfa2, 'POST', `/${item.id}/dismiss`)).status, 200);
  assert.equal((await cliente(alfa2, 'POST', `/${item.id}/dismiss`)).status, 200);
  assert.equal((await mine(alfa2)).find(a => a.id === item.id).dismissed, true);
  // O dono da mesma organização continua a vê-lo por fechar.
  assert.equal((await mine(owner)).find(a => a.id === item.id).dismissed, false);
  // Outra organização não o vê nem o consegue fechar.
  assert.equal((await mine(betaUser)).find(a => a.id === item.id), undefined);
  assert.equal((await cliente(betaUser, 'POST', `/${item.id}/dismiss`)).status, 404);
  assert.equal((await cliente(alfa2, 'POST', '/nao-existe/dismiss')).status, 404);
  assert.equal((await fetch(`${base}/api/announcements`)).status, 401);
});

test('editar, apagar e a consola só para o dono da instância', async () => {
  const item = await make({ title: 'Original' });
  const edited = await (await consola('PUT', `/${item.id}`, { kind: 'news', title: 'Editado', body: 'Novo texto.', starts_at: item.starts_at, show_topbar: false, show_help: true })).json();
  assert.equal(edited.data.title, 'Editado');
  assert.equal(edited.data.kind, 'news');
  assert.equal(edited.data.show_topbar, false);
  assert.equal(audits('announcement.update').length, 1);
  assert.equal((await consola('PUT', '/nao-existe', { kind: 'news', title: 'x', body: 'y' })).status, 404);
  await consola('POST', `/${item.id}/end`);
  assert.equal((await consola('PUT', `/${item.id}`, { kind: 'news', title: 'x', body: 'y' })).status, 409);
  assert.equal((await consola('DELETE', `/${item.id}`)).status, 200);
  assert.equal(audits('announcement.delete').length, 1);
  assert.equal((await consola('DELETE', `/${item.id}`)).status, 404);
  // Um membro normal nem sabe que a consola existe.
  const r = await fetch(`${base}/api/platform/announcements`, { headers: cookie(alfa2) });
  assert.equal(r.status, 404);
});

test('validações', async () => {
  const base0 = { kind: 'notice', title: 'T', body: 'B' };
  const bad = [
    [{ ...base0, kind: 'outro' }, /tipo/i],
    [{ ...base0, title: '  ' }, /título/i],
    [{ ...base0, title: 'x'.repeat(121) }, /título/i],
    [{ ...base0, body: '' }, /mensagem/i],
    [{ ...base0, body: 'x'.repeat(1001) }, /mensagem/i],
    [{ ...base0, starts_at: 'ontem' }, /início/i],
    [{ ...base0, ends_at: 'amanhã' }, /fim/i],
    [{ ...base0, starts_at: hours(2), ends_at: hours(1) }, /depois do início/i],
    [{ ...base0, audience: 'todos' }, /público/i],
    [{ ...base0, audience: 'organizations', audience_ids: [] }, /cliente/i],
    [{ ...base0, audience: 'plans' }, /pacote/i],
    [{ ...base0, show_topbar: false, show_help: false, send_email: false }, /onde/i],
  ];
  for (const [body, pattern] of bad) {
    const r = await consola('POST', '', body);
    assert.equal(r.status, 400, JSON.stringify(body).slice(0, 80));
    const json = await r.json();
    assert.equal(json.success, false);
    assert.match(json.error, pattern);
  }
  const before = db.prepare('SELECT COUNT(*) n FROM announcements').get().n;
  const ok = await consola('POST', '', { ...base0, send_email: true, show_topbar: false, show_help: false });
  assert.equal(ok.status, 201);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM announcements').get().n, before + 1);
  // O texto vai como está (o cliente escapa); nada de HTML interpretado no servidor.
  const html = await make({ title: '<b>x</b>', body: '<img src=x onerror=1>' });
  assert.equal(html.title, '<b>x</b>');
});
