// Menu do telemóvel guardado por pessoa: forma validada, ida e volta pela
// rota /auth/menu-prefs e "Repor original". SQLite em memória, dados inventados.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-menu-prefs-'));
process.chdir(temp);
Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test', EMAIL_ENABLED: 'false' });
const app = require('../app');
const { db } = require('../config/database');
const auth = require('../services/authService');
const orgs = require('../services/orgService');
const menuPrefs = require('../services/menuPrefs');

let server, base, org, owner, staff;
const sessions = {};
async function req(method, url, body, who = 'owner') {
  const response = await fetch(base + url, {
    method, headers: { 'Content-Type': 'application/json', Cookie: `${auth.SESSION_COOKIE}=${sessions[who]}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() };
}

before(async () => {
  org = orgs.createOrganization('Menu');
  owner = auth.createUser({ name: 'Dona', email: 'owner-menu@example.invalid', password: 'Synthetic123!' });
  staff = auth.createUser({ name: 'Equipa', email: 'staff-menu@example.invalid', password: 'Synthetic123!' });
  orgs.createMembership({ organizationId: org.id, userId: owner.id, role: 'owner' });
  orgs.createMembership({ organizationId: org.id, userId: staff.id, role: 'staff' });
  sessions.owner = auth.createSession(owner.id, org.id).sessionId;
  sessions.staff = auth.createSession(staff.id, org.id).sessionId;
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  db.close();
  fs.rmSync(temp, { recursive: true, force: true });
});

test('normalize aceita listas de ids e recusa formas estranhas', () => {
  assert.deepEqual(menuPrefs.normalize({ order: ['reservas', 'dashboard'] }), { order: ['reservas', 'dashboard'], hidden: [], bar: [] });
  for (const bad of [null, [], 'x', { order: 'reservas' }, { order: ['reservas', 'reservas'] }, { hidden: ['<script>'] },
    { order: [42] }, { bar: ['a', 'b', 'c', 'd', 'e', 'f'] }, { order: Array.from({ length: 41 }, (_, i) => `i${i}`) }]) {
    assert.throws(() => menuPrefs.normalize(bad), error => error.status === 400, JSON.stringify(bad));
  }
});

test('cada pessoa guarda o seu menu e "Repor original" volta a null', async () => {
  assert.equal((await req('GET', '/auth/me')).body.data.user.menu_prefs, null);
  const prefs = { order: ['despesas', 'dashboard'], hidden: ['vouchers'], bar: ['dashboard', 'reservas', 'calendario', 'despesas', 'hospedes'] };
  const saved = await req('PUT', '/auth/menu-prefs', { menu_prefs: prefs });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body.data.menu_prefs, prefs);
  assert.deepEqual((await req('GET', '/auth/me')).body.data.user.menu_prefs, prefs);
  assert.equal((await req('GET', '/auth/me', undefined, 'staff')).body.data.user.menu_prefs, null, 'o menu da outra pessoa não muda');

  assert.equal((await req('PUT', '/auth/menu-prefs', { menu_prefs: { bar: Array(6).fill('x') } })).status, 400);
  assert.deepEqual(menuPrefs.get(owner.id, org.id), prefs, 'um pedido inválido não estraga o que estava guardado');

  const reset = await req('PUT', '/auth/menu-prefs', { menu_prefs: null });
  assert.equal(reset.status, 200);
  assert.equal(reset.body.data.menu_prefs, null);
  assert.equal((await req('GET', '/auth/me')).body.data.user.menu_prefs, null);
});

test('sem acesso ativo à organização não guarda', () => {
  const other = orgs.createOrganization('Outra');
  assert.throws(() => menuPrefs.save(owner.id, other.id, { order: [] }), error => error.status === 403);
});
