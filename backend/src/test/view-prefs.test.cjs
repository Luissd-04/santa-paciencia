// Vistas predefinidas guardadas por pessoa: forma validada, ida e volta pela
// rota /auth/view-prefs, isolamento entre pessoas e "Repor predefinições". SQLite em memória, dados inventados.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-view-prefs-'));
process.chdir(temp);
Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test', EMAIL_ENABLED: 'false' });
const app = require('../app');
const { db } = require('../config/database');
const auth = require('../services/authService');
const orgs = require('../services/orgService');
const viewPrefs = require('../services/viewPrefs');

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
  org = orgs.createOrganization('Vistas');
  owner = auth.createUser({ name: 'Dona', email: 'owner-views@example.invalid', password: 'Synthetic123!' });
  staff = auth.createUser({ name: 'Equipa', email: 'staff-views@example.invalid', password: 'Synthetic123!' });
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

test('normalize aceita só ecrãs, dispositivos e valores conhecidos', () => {
  assert.deepEqual(viewPrefs.normalize({}), {});
  assert.deepEqual(viewPrefs.normalize({ eventos: { desktop: 'calendar', mobile: null }, inicio: { mobile: 'eventos' } }),
    { eventos: { desktop: 'calendar' }, inicio: { mobile: 'eventos' } });
  for (const bad of [null, [], 'x', { eventos: 'semana' }, { eventos: { desktop: 'grelha' } }, { eventos: { tablet: 'list' } },
    { outro: { desktop: 'x' } }, { calendario: { desktop: 'timeline:9' } }, { hospedes: { desktop: 3 } }, JSON.parse('{"__proto__":{"desktop":"x"}}')]) {
    assert.throws(() => viewPrefs.normalize(bad), error => error.status === 400, JSON.stringify(bad));
  }
});

test('cada pessoa guarda as suas vistas e "Repor predefinições" volta a vazio', async () => {
  assert.deepEqual((await req('GET', '/auth/me')).body.data.user.view_prefs, {}, 'sem nada guardado, vale o comportamento de origem');
  const prefs = { eventos: { desktop: 'calendar', mobile: 'semana' }, calendario: { desktop: 'timeline:30' }, reservas: { desktop: 'past' },
    hospedes: { mobile: 'list' }, relatorios: { desktop: 'lucro' }, inicio: { desktop: 'calendario', mobile: 'reservas' } };
  const saved = await req('PUT', '/auth/view-prefs', { view_prefs: prefs });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body.data.view_prefs, prefs);
  assert.deepEqual((await req('GET', '/auth/me')).body.data.user.view_prefs, prefs);
  assert.deepEqual((await req('GET', '/auth/me', undefined, 'staff')).body.data.user.view_prefs, {}, 'as vistas da outra pessoa não mudam');

  assert.equal((await req('PUT', '/auth/view-prefs', { view_prefs: { eventos: { desktop: 'x' } } })).status, 400);
  assert.equal((await req('PUT', '/auth/view-prefs', {})).status, 400);
  assert.deepEqual(viewPrefs.get(owner.id), prefs, 'um pedido inválido não estraga o que estava guardado');

  const reset = await req('PUT', '/auth/view-prefs', { view_prefs: {} });
  assert.equal(reset.status, 200);
  assert.deepEqual((await req('GET', '/auth/me')).body.data.user.view_prefs, {});
});

test('sem sessão não guarda', async () => {
  const response = await fetch(base + '/auth/view-prefs', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"view_prefs":{}}' });
  assert.ok([401, 403].includes(response.status));
});
