// Tarefas internas da consola: CRUD, comentários, validação, auditoria, 404 e 423.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-ptasks-'));
const previous = process.cwd();
process.chdir(temp);
Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test', EMAIL_ENABLED: 'false', TRUST_PROXY: 'loopback',
  PLATFORM_ADMIN_EMAILS: 'dono@example.invalid,dona2@example.invalid' });
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

const org = orgs.createOrganization('Cliente Tarefas');
function person(email, { flag = false, role = 'owner' } = {}) {
  const user = auth.createUser({ name: email.split('@')[0], email, password: PASSWORD });
  orgs.createMembership({ organizationId: org.id, userId: user.id, role });
  if (flag) db.prepare('UPDATE users SET platform_admin = 1 WHERE id = ?').run(user.id);
  return { user, session: auth.createSession(user.id, org.id).sessionId };
}
const owner = person('dono@example.invalid', { flag: true });
const second = person('dona2@example.invalid', { flag: true });
const regular = person('equipa@example.invalid', { role: 'staff' });
const call = (who, method, url, body) => fetch(base + '/api/platform/tasks' + url, {
  method, headers: { Cookie: `${auth.SESSION_COOKIE}=${who.session}`, 'Content-Type': 'application/json' },
  body: body && !['GET', 'HEAD'].includes(method) ? JSON.stringify(body) : undefined,
});
const audits = action => db.prepare('SELECT * FROM platform_audit_events WHERE action = ?').all(action);
const ticketId = 'ticket-1';
db.prepare("INSERT INTO support_tickets (id, number, organization_id, type, subject) VALUES (?, 7, ?, 'problem', 'Assunto')").run(ticketId, org.id);

test('423 sem desbloquear e 404 para quem não é dono', async () => {
  assert.equal((await call(regular, 'GET', '/')).status, 404);
  assert.equal((await call(regular, 'POST', '/', { title: 'x' })).status, 404);
  const locked = await call(owner, 'GET', '/');
  assert.equal(locked.status, 423);
  assert.equal((await locked.json()).locked, true);
  for (const [m, u] of [['GET', '/summary'], ['POST', '/'], ['PUT', '/x'], ['DELETE', '/x'], ['POST', '/x/comments']]) assert.equal((await call(owner, m, u, {})).status, 423, `${m} ${u}`);
  await access.unlock(owner.session, owner.user.id, PASSWORD);
  await access.unlock(second.session, second.user.id, PASSWORD);
});

test('criar, listar, filtrar e resumo', async () => {
  const r = await call(owner, 'POST', '/', { title: '  Campanha  ', type: 'marketing', priority: 'urgent', assignee_user_id: owner.user.id,
    due_date: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10), ticket_id: ticketId });
  assert.equal(r.status, 201);
  const task = (await r.json()).data;
  assert.equal(task.title, 'Campanha');
  assert.equal(task.status, 'todo');
  assert.deepEqual(task.ticket, { id: ticketId, number: 'SP-0007' });
  assert.deepEqual(task.organization, { id: org.id, name: 'Cliente Tarefas' });
  assert.equal(task.assignee.id, owner.user.id);
  await call(owner, 'POST', '/', { title: 'Ideia', type: 'idea', status: 'ideas', assignee_user_id: second.user.id });
  const all = (await (await call(owner, 'GET', '/')).json()).data;
  assert.equal(all.tasks.length, 2);
  assert.deepEqual(all.people.map(p => p.id).sort(), [owner.user.id, second.user.id].sort());
  const mine = (await (await call(owner, 'GET', '/?assignee=me')).json()).data.tasks;
  assert.deepEqual(mine.map(t => t.title), ['Campanha']);
  assert.equal((await (await call(owner, 'GET', '/?type=idea')).json()).data.tasks.length, 1);
  assert.equal((await call(owner, 'GET', '/?type=nada')).status, 400);
  assert.deepEqual((await (await call(owner, 'GET', '/summary')).json()).data, { mine_open: 1, mine_due_week: 1 });
  assert.equal(audits('task.create').length, 2);
});

test('validação rejeita dados maus', async () => {
  const bad = [{}, { title: '  ' }, { title: 'x'.repeat(141) }, { title: 'a', type: 'zz' }, { title: 'a', status: 'zz' }, { title: 'a', priority: 'zz' },
    { title: 'a', due_date: '2026-02-31' }, { title: 'a', due_date: 'amanhã' }, { title: 'a', assignee_user_id: regular.user.id },
    { title: 'a', organization_id: 'nao-existe' }, { title: 'a', ticket_id: 'nao-existe' }, { title: 'a', description: 'x'.repeat(4001) }, { title: 'a', position: 'abc' }];
  for (const body of bad) {
    const r = await call(owner, 'POST', '/', body);
    assert.equal(r.status, 400, JSON.stringify(body).slice(0, 60));
    assert.equal((await r.json()).success, false);
  }
});

test('mover de estado, editar, 404 e apagar com auditoria', async () => {
  const list = (await (await call(owner, 'GET', '/')).json()).data.tasks;
  const t = list.find(x => x.title === 'Campanha');
  let r = await call(owner, 'PUT', `/${t.id}`, { status: 'done' });
  let data = (await r.json()).data;
  assert.equal(data.status, 'done');
  assert.ok(data.done_at);
  assert.equal((await (await call(owner, 'GET', '/summary')).json()).data.mine_open, 0);
  data = (await (await call(owner, 'PUT', `/${t.id}`, { status: 'doing', title: 'Campanha 2', due_date: null })).json()).data;
  assert.equal(data.done_at, null);
  assert.equal(data.due_date, null);
  const [upd] = audits('task.update');
  assert.equal(upd.target_type, 'platform_task');
  assert.deepEqual(JSON.parse(upd.details_json), { fields: ['status'], from: 'todo', status: 'done' });
  assert.equal((await call(owner, 'PUT', '/inexistente', { title: 'x' })).status, 404);
  assert.equal((await call(owner, 'GET', '/inexistente')).status, 404);
  assert.equal((await call(owner, 'DELETE', '/inexistente')).status, 404);
  assert.equal((await call(owner, 'POST', '/inexistente/comments', { body: 'x' })).status, 404);
  assert.equal((await call(owner, 'PUT', `/${t.id}`, { status: 'zz' })).status, 400);
  assert.equal((await call(owner, 'DELETE', `/${t.id}`)).status, 200);
  assert.equal((await call(owner, 'GET', `/${t.id}`)).status, 404);
  assert.equal(audits('task.delete').length, 1);
});

test('comentários: validação, contagem e autor', async () => {
  const t = (await (await call(owner, 'POST', '/', { title: 'Com comentários' })).json()).data;
  assert.equal((await call(second, 'POST', `/${t.id}/comments`, { body: '   ' })).status, 400);
  assert.equal((await call(second, 'POST', `/${t.id}/comments`, { body: 'x'.repeat(2001) })).status, 400);
  const r = await call(second, 'POST', `/${t.id}/comments`, { body: ' Olá <b>mundo</b> ' });
  assert.equal(r.status, 201);
  assert.equal((await r.json()).data.body, 'Olá <b>mundo</b>');
  const detail = (await (await call(owner, 'GET', `/${t.id}`)).json()).data;
  assert.equal(detail.comments.length, 1);
  assert.equal(detail.comments[0].author.id, second.user.id);
  assert.equal((await (await call(owner, 'GET', '/')).json()).data.tasks.find(x => x.id === t.id).comments, 1);
  assert.equal(audits('task.comment').length, 1);
  assert.doesNotMatch(JSON.stringify(audits('task.comment')), /mundo/);
});

test('a migração é idempotente', () => {
  require('../config/migrations').runMigrations(db);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM schema_migrations WHERE id = '20261120_platform_tasks'").get().n, 1);
});
