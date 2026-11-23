// Sair de uma organização (DELETE /auth/memberships/:orgId): só quem não é
// proprietário, nunca a única organização que resta; a sessão passa para outra.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-leave-org-'));
const previous = process.cwd();
process.chdir(temp);
Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test', EMAIL_ENABLED: 'false', TRUST_PROXY: 'loopback' });
const app = require('../app');
const { db } = require('../config/database');
const auth = require('../services/authService');
const orgs = require('../services/orgService');
const PASSWORD = 'SyntheticUser123!';
let server, base, ip = 40;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.on('listening', resolve); server.on('error', reject); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server?.close(); db.close(); process.chdir(previous); fs.rmSync(temp, { recursive: true, force: true }); });

const alfa = orgs.createOrganization('Alfa');
const beta = orgs.createOrganization('Beta');
function person(email, memberships) {
  const user = auth.createUser({ name: email.split('@')[0], email, password: PASSWORD });
  for (const [org, role] of memberships) orgs.createMembership({ organizationId: org.id, userId: user.id, role });
  return user;
}
const gestor = person('gestor@example.invalid', [[alfa, 'owner'], [beta, 'staff']]);
const soStaff = person('so-staff@example.invalid', [[beta, 'staff']]);
const dono = person('dono@example.invalid', [[beta, 'owner']]);
async function login(email, organization_id) {
  const res = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `203.0.113.${ip++}` },
    body: JSON.stringify({ email, password: PASSWORD }) });
  const cookie = res.headers.get('set-cookie').split(';')[0];
  if (!organization_id) return cookie;
  const switched = await call(cookie, 'POST', '/auth/switch-org', { organization_id });
  return switched.headers.get('set-cookie').split(';')[0];
}
const call = (cookie, method, url, body) => fetch(base + url, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-Forwarded-For': `203.0.113.${ip++}` }, body: body ? JSON.stringify(body) : undefined });
const active = (user, org) => db.prepare('SELECT 1 FROM memberships WHERE user_id = ? AND organization_id = ? AND active = 1').get(user.id, org.id);

test('o proprietário não pode sair e a única organização não se larga', async () => {
  const owner = await login('dono@example.invalid');
  const asOwner = await call(owner, 'DELETE', `/auth/memberships/${beta.id}`);
  assert.equal(asOwner.status, 400);
  assert.ok(active(dono, beta));
  const only = await login('so-staff@example.invalid');
  const res = await call(only, 'DELETE', `/auth/memberships/${beta.id}`);
  assert.equal(res.status, 400);
  assert.ok(active(soStaff, beta));
  assert.equal((await call(only, 'DELETE', `/auth/memberships/${alfa.id}`)).status, 404);
});

test('sair de uma organização que não é a atual', async () => {
  const cookie = await login('gestor@example.invalid');          // entra em Alfa (proprietário)
  const res = await call(cookie, 'DELETE', `/auth/memberships/${beta.id}`);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).data.switched, false);
  assert.equal(active(gestor, beta), undefined);
  assert.ok(active(gestor, alfa));
});

test('sair da organização atual passa a sessão para outra', async () => {
  orgs.createMembership({ organizationId: beta.id, userId: gestor.id, role: 'manager' });
  const cookie = await login('gestor@example.invalid', beta.id);
  const res = await call(cookie, 'DELETE', `/auth/memberships/${beta.id}`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.data.switched, true);
  assert.equal(body.data.user.organization_id, alfa.id);
  const next = res.headers.get('set-cookie').split(';')[0];
  assert.equal((await call(next, 'GET', '/auth/me')).status, 200);
  assert.equal(active(gestor, beta), undefined);
});
