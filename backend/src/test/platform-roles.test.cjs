// Cargos da equipa da plataforma: vários por pessoa, permissões somadas.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const previous = process.cwd(), temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-roles-'));
process.chdir(temp);
Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test', EMAIL_ENABLED: 'false',
  PLATFORM_ADMIN_EMAILS: 'chefe@example.invalid,mkt@example.invalid,sup@example.invalid,ambos@example.invalid' });
const app = require('../app');
const { db } = require('../config/database');
const auth = require('../services/authService');
const access = require('../services/platformAccess');
const { needed } = require('../middleware/requirePlatformAdmin');

const PASSWORD = 'SyntheticCargos123!';
function person(email, roles) {
  const user = auth.createUser({ name: email, email, password: PASSWORD });
  db.prepare('UPDATE users SET platform_admin = 1 WHERE id = ?').run(user.id);
  access.setPlatformRoles(user.id, roles);
  return { user, session: auth.createPlatformSession(user.id).sessionId };
}
const chefe = person('chefe@example.invalid', ['admin']);
const mkt = person('mkt@example.invalid', ['marketing']);
const sup = person('sup@example.invalid', ['support']);
const ambos = person('ambos@example.invalid', ['marketing', 'support']);

let server, base;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.on('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  for (const who of [chefe, mkt, sup, ambos]) await access.unlock(who.session, who.user.id, PASSWORD);
});
after(() => { server?.close(); db.close(); process.chdir(previous); fs.rmSync(temp, { recursive: true, force: true }); });
const pl = (who, method, url, body) => fetch(`${base}/api/platform${url}`, {
  method, headers: { Cookie: `${auth.SESSION_COOKIE}=${who.session}`, 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});

test('cargos: limpeza, ordem e nenhum cargo inventado', () => {
  assert.deepEqual(access.cleanRoles('support, admin,admin,xpto'), ['admin', 'support']);
  assert.deepEqual(access.cleanRoles([]), []);
  assert.equal(access.setPlatformRoles(mkt.user.id, ['xpto']), null);
  assert.deepEqual(access.platformRoles({ id: ambos.user.id }), ['marketing', 'support']);
});

test('capacidades somam os cargos e Administração inclui todas', () => {
  const ids = who => ({ id: who.user.id });
  assert.ok(access.can(ids(chefe), 'admin') && access.can(ids(chefe), 'support') && access.can(ids(chefe), 'sales'));
  assert.ok(access.can(ids(mkt), 'sales') && !access.can(ids(mkt), 'support') && !access.can(ids(mkt), 'admin'));
  assert.ok(access.can(ids(sup), 'support') && !access.can(ids(sup), 'sales'));
  assert.ok(access.can(ids(ambos), 'support') && access.can(ids(ambos), 'sales') && !access.can(ids(ambos), 'admin'));
  assert.equal(access.can({ id: 'ninguem' }, 'read'), false);
});

test('regras da API por caminho', () => {
  assert.equal(needed('GET', '/audit'), 'admin');
  assert.equal(needed('GET', '/support/tickets'), 'support');
  assert.equal(needed('POST', '/support/tickets/x/messages'), 'support');
  assert.equal(needed('DELETE', '/support/tickets/x'), 'admin');
  assert.equal(needed('PUT', '/support/retention'), 'admin');
  assert.equal(needed('POST', '/announcements'), 'sales');
  assert.equal(needed('PUT', '/organizations/x'), 'admin');
  assert.equal(needed('GET', '/organizations'), 'read');
});

test('HTTP: Suporte vê a caixa, Marketing não; quem tem os dois cargos vê ambos', async () => {
  assert.equal((await pl(sup, 'GET', '/support/tickets')).status, 200);
  assert.equal((await pl(mkt, 'GET', '/support/tickets')).status, 403);
  assert.equal((await pl(ambos, 'GET', '/support/tickets')).status, 200);
  assert.equal((await pl(ambos, 'GET', '/workspace/trials')).status, 200);
  assert.equal((await pl(sup, 'GET', '/workspace/trials')).status, 403);
  assert.equal((await pl(ambos, 'GET', '/audit')).status, 403);
  assert.equal((await pl(chefe, 'GET', '/audit')).status, 200);
});

test('Equipa: atribuir vários cargos; não retirar a própria Administração', async () => {
  let r = await pl(chefe, 'PUT', `/workspace/team/${mkt.user.id}`, { roles: ['marketing', 'admin'] });
  assert.equal(r.status, 200);
  const team = (await r.json()).data;
  assert.deepEqual(team.find(u => u.id === mkt.user.id).platform_roles, ['admin', 'marketing']);
  // Atribuir cargos fecha a consola dessa pessoa.
  assert.equal((await pl(mkt, 'GET', '/overview')).status, 423);
  r = await pl(chefe, 'PUT', `/workspace/team/${chefe.user.id}`, { roles: ['marketing'] });
  assert.equal(r.status, 400);
  r = await pl(chefe, 'PUT', `/workspace/team/${sup.user.id}`, { roles: [] });
  assert.equal(r.status, 400);
  r = await pl(ambos, 'PUT', `/workspace/team/${sup.user.id}`, { roles: ['admin'] });
  assert.equal(r.status, 403);
});
