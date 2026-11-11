// Consola da plataforma: só abre ao dono da instância (marca na base E email
// em PLATFORM_ADMIN_EMAILS), esconde-se dos outros com 404 e exige confirmar a
// palavra-passe por sessão, durante 30 minutos. App real com SQLite em memória.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-platform-'));
const previous = process.cwd();
process.chdir(temp);
Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test', EMAIL_ENABLED: 'false', TRUST_PROXY: 'loopback',
  PLATFORM_ADMIN_EMAILS: ' Dono@Example.invalid , sem-marca@example.invalid' });
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

const org = orgs.createOrganization('Plataforma');
function person(email, { flag = false, role = 'owner' } = {}) {
  const user = auth.createUser({ name: email.split('@')[0], email, password: PASSWORD });
  orgs.createMembership({ organizationId: org.id, userId: user.id, role });
  if (flag) db.prepare('UPDATE users SET platform_admin = 1 WHERE id = ?').run(user.id);
  return { user, session: auth.createSession(user.id, org.id).sessionId };
}
const owner = person('dono@example.invalid', { flag: true });
const regular = person('equipa@example.invalid', { role: 'staff' });
const flagOnly = person('so-marca@example.invalid', { flag: true });
const envOnly = person('sem-marca@example.invalid');

const call = (who, method, url, body, ip = '203.0.113.9') => fetch(base + '/api/platform' + url, {
  method, headers: { Cookie: `${auth.SESSION_COOKIE}=${who.session}`, 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
  body: body ? JSON.stringify(body) : undefined,
});
const audits = action => db.prepare('SELECT * FROM platform_audit_events WHERE action = ? ORDER BY created_at').all(action);

test('quem não é dono da instância recebe 404, mesmo a desbloquear com a palavra-passe certa', async () => {
  for (const who of [regular, flagOnly, envOnly]) {
    for (const [method, url, body] of [['GET', '/overview'], ['GET', '/organizations'], ['POST', '/unlock', { password: PASSWORD }]]) {
      const r = await call(who, method, url, body);
      assert.equal(r.status, 404, `${who.user.email} ${method} ${url}`);
      assert.deepEqual(await r.json(), { success: false, error: 'Endpoint não encontrado.' });
    }
  }
  assert.equal(db.prepare('SELECT COUNT(*) n FROM platform_audit_events').get().n, 0);
  assert.equal((await fetch(base + '/api/platform/overview')).status, 401);
});

test('dono da instância: bloqueado (423) até confirmar a palavra-passe', async () => {
  const r = await call(owner, 'GET', '/overview');
  assert.equal(r.status, 423);
  const body = await r.json();
  assert.equal(body.success, false);
  assert.equal(body.locked, true);
  assert.ok(body.error);
});

test('palavra-passe errada: 400, continua bloqueado e fica no registo com o IP real', async () => {
  const r = await call(owner, 'POST', '/unlock', { password: 'Errada123!' }, '198.51.100.23');
  assert.equal(r.status, 400);
  assert.equal((await r.json()).success, false);
  assert.equal((await call(owner, 'GET', '/overview')).status, 423);
  const [failed] = audits('platform.unlock_failed');
  assert.equal(failed.user_id, owner.user.id);
  assert.equal(failed.ip, '198.51.100.23');
  assert.doesNotMatch(JSON.stringify(failed), /Errada123/);
});

test('desbloqueio: 200, as rotas respondem 200 e ao fim de 30 minutos volta a 423', async () => {
  const r = await call(owner, 'POST', '/unlock', { password: PASSWORD });
  assert.equal(r.status, 200);
  const until = Date.parse((await r.json()).data.unlocked_until);
  assert.ok(Math.abs(until - (Date.now() + 30 * 60000)) < 60000);
  assert.equal(audits('platform.unlock').length, 1);
  assert.equal(access.isUnlocked(owner.session), true);
  // Outra sessão da mesma pessoa continua bloqueada.
  const other = { session: auth.createSession(owner.user.id, org.id).sessionId };
  assert.equal((await call(other, 'GET', '/overview')).status, 423);

  for (const [method, url, body] of [['GET', '/overview'], ['GET', '/organizations'], ['GET', `/organizations/${org.id}`],
    ['PUT', `/organizations/${org.id}`, { status: 'active', notes: 'x' }], ['GET', '/incidents']]) {
    const res = await call(owner, method, url, body);
    assert.equal(res.status, 200, `${method} ${url}`);
    assert.equal((await res.json()).success, true);
  }
  // O PUT com sucesso fica registado.
  assert.equal(audits('organization.update').length, 1);

  db.prepare('UPDATE auth_sessions SET platform_unlocked_until = ? WHERE id = ?')
    .run(new Date(Date.now() - 1000).toISOString(), auth.digestToken(owner.session));
  assert.equal((await call(owner, 'GET', '/overview')).status, 423);
});

test('/auth/me indica se a pessoa é dona da instância', async () => {
  const me = async who => (await (await fetch(base + '/auth/me', { headers: { Cookie: `${auth.SESSION_COOKIE}=${who.session}` } })).json()).data.user;
  assert.equal((await me(owner)).is_platform_admin, true);
  for (const who of [regular, flagOnly, envOnly]) assert.equal((await me(who)).is_platform_admin, false);
  const saved = process.env.PLATFORM_ADMIN_EMAILS;
  process.env.PLATFORM_ADMIN_EMAILS = '';
  try { assert.equal((await me(owner)).is_platform_admin, false); } finally { process.env.PLATFORM_ADMIN_EMAILS = saved; }
});

test('a migração é idempotente e o estado da organização só aceita os valores previstos', () => {
  require('../config/migrations').runMigrations(db);
  assert.equal(db.prepare('SELECT status FROM organizations WHERE id = ?').get(org.id).status, 'active');
  assert.throws(() => db.prepare("UPDATE organizations SET status = 'apagada' WHERE id = ?").run(org.id), /CHECK/);
});
