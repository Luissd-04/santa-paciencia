// Contas só de plataforma e suspensão real. Quem é dono da instância e não tem
// organização ativa entra numa sessão sem organização (organization_id NULL),
// que só abre a consola: o resto de /api (e as rotas de /auth que leem dados
// da organização) responde 403 platform_only, num só sítio (requireAuth).
// Uma organização suspensa deixa de contar no login e as sessões abertas nela
// passam a responder 403 suspended. App real com SQLite em memória.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-platform-accounts-'));
const previous = process.cwd();
process.chdir(temp);
Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test', EMAIL_ENABLED: 'false', TRUST_PROXY: 'loopback',
  PLATFORM_ADMIN_EMAILS: 'consola@example.invalid,dono-suspenso@example.invalid,dono-com-org@example.invalid' });
const app = require('../app');
const { db } = require('../config/database');
const auth = require('../services/authService');
const orgs = require('../services/orgService');
const PASSWORD = 'SyntheticUser123!';
const PLATFORM_ONLY = { success: false, error: 'Esta sessão é só da consola da plataforma.', platform_only: true };
const SUSPENDED = { success: false, error: 'A conta desta organização está suspensa. Contacte o suporte.', suspended: true };
let server, base;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.on('listening', resolve); server.on('error', reject); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server?.close(); db.close(); process.chdir(previous); fs.rmSync(temp, { recursive: true, force: true }); });

const alfa = orgs.createOrganization('Alfa');
const beta = orgs.createOrganization('Beta');
function person(email, { admin = false, memberships = [] } = {}) {
  const user = auth.createUser({ name: email.split('@')[0], email, password: PASSWORD });
  for (const [org, role] of memberships) orgs.createMembership({ organizationId: org.id, userId: user.id, role });
  if (admin) db.prepare('UPDATE users SET platform_admin = 1 WHERE id = ?').run(user.id);
  return user;
}
const consola = person('consola@example.invalid', { admin: true });
const semNada = person('sem-nada@example.invalid');
const duasOrgs = person('duas@example.invalid', { memberships: [[alfa, 'owner'], [beta, 'staff']] });
const soBeta = person('so-beta@example.invalid', { memberships: [[beta, 'owner']] });
const donoSuspenso = person('dono-suspenso@example.invalid', { admin: true, memberships: [[beta, 'manager']] });
const donoComOrg = person('dono-com-org@example.invalid', { admin: true, memberships: [[alfa, 'manager']] });

let ipCounter = 10;
const nextIp = () => `203.0.113.${ipCounter++}`;
const cookieOf = res => res.headers.get('set-cookie').split(';')[0];
const sessionOf = cookie => cookie.split('=')[1];
async function login(email, extra = {}) {
  const res = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': nextIp() },
    body: JSON.stringify({ email, password: PASSWORD, ...extra }) });
  return { res, body: await res.json() };
}
function call(cookie, method, url, body) {
  return fetch(base + url, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-Forwarded-For': nextIp() },
    body: body ? JSON.stringify(body) : undefined });
}
const sessionRow = cookie => db.prepare('SELECT * FROM auth_sessions WHERE id = ?').get(auth.digestToken(sessionOf(cookie)));
const suspend = (org, status = 'suspended') => db.prepare('UPDATE organizations SET status = ? WHERE id = ?').run(status, org.id);

test('login do dono da instância sem organização: sessão só de plataforma e destinations', async () => {
  const { res, body } = await login('consola@example.invalid');
  assert.equal(res.status, 200);
  assert.equal(body.data.user.id, consola.id);
  assert.equal(body.data.user.organization_id, null);
  assert.equal(body.data.user.organization_name, null);
  assert.equal(body.data.user.role, null);
  assert.equal(body.data.user.menu_prefs, null);
  assert.equal(body.data.user.is_platform_admin, true);
  assert.deepEqual(body.data.destinations, { platform: true, organizations: [] });
  const cookie = cookieOf(res);
  assert.equal(sessionRow(cookie).organization_id, null);

  const me = await (await call(cookie, 'GET', '/auth/me')).json();
  assert.equal(me.success, true);
  assert.equal(me.data.user.organization_id, null);
  assert.deepEqual(me.data.destinations, { platform: true, organizations: [] });
  assert.equal(me.data.organization_plan, null);
  // Uma sessão sem organização não conta como atividade de nenhuma organização.
  assert.equal(db.prepare('SELECT COUNT(*) n FROM daily_activity WHERE user_id = ?').get(consola.id).n, 0);
});

test('sessão só de plataforma: 403 platform_only em tudo o que é da organização', async () => {
  const { res } = await login('consola@example.invalid');
  const cookie = cookieOf(res);
  const blocked = [
    ['GET', '/api/reservations'], ['GET', '/api/accommodations'], ['POST', '/api/accommodations', { name: 'X' }],
    ['GET', '/api/guests'], ['GET', '/api/team'], ['GET', '/api/team/members'], ['GET', '/api/reports/summary'],
    ['GET', '/api/events'], ['GET', '/api/support/tickets'], ['POST', '/api/support/tickets', { subject: 'x' }],
    ['GET', '/api/announcements'], ['GET', '/api/live'], ['GET', '/api/ops/status'], ['GET', '/api/inexistente'],
    ['GET', '/API/RESERVATIONS'], ['GET', '/api/platformx'], ['POST', '/api/backup/import', {}],
    ['PUT', '/auth/menu-prefs', { menu_prefs: null }], ['PUT', '/auth/profile', { name: 'Outro', email: 'consola@example.invalid' }],
    ['GET', '/auth/google/status'], ['GET', '/auth/google-email/status'], ['GET', '/auth/email/threads'],
    ['GET', '/uploads/receipts/x.png'],
  ];
  for (const [method, url, body] of blocked) {
    const r = await call(cookie, method, url, body);
    assert.equal(r.status, 403, `${method} ${url}`);
    assert.deepEqual(await r.json(), PLATFORM_ONLY, `${method} ${url}`);
  }
  // O que a conta precisa continua a funcionar.
  assert.equal((await call(cookie, 'GET', '/auth/memberships')).status, 200);
  assert.equal((await call(cookie, 'GET', '/auth/sessions')).status, 200);
  assert.equal((await call(cookie, 'PUT', '/auth/appearance', { appearance: { look: 'atual', mode: 'auto' } })).status, 200);
  // A sessão continua válida depois dos 403.
  assert.equal((await call(cookie, 'GET', '/auth/me')).status, 200);
});

test('sessão só de plataforma: a telemetria responde 204 e não grava nada', async () => {
  const { res } = await login('consola@example.invalid');
  const cookie = cookieOf(res);
  const before = db.prepare('SELECT COUNT(*) n FROM usage_daily').get().n;
  const r = await call(cookie, 'POST', '/api/telemetry', { views: { dashboard: 3 }, display_mode: 'standalone' });
  assert.equal(r.status, 204);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM usage_daily').get().n, before);
  assert.equal(sessionRow(cookie).display_mode, null);
});

test('sessão só de plataforma: a consola abre (desbloqueio e rotas)', async () => {
  const { res } = await login('consola@example.invalid');
  const cookie = cookieOf(res);
  assert.equal((await call(cookie, 'GET', '/api/platform/overview')).status, 423);
  assert.equal((await call(cookie, 'POST', '/api/platform/unlock', { password: PASSWORD })).status, 200);
  for (const url of ['/api/platform/overview', '/api/platform/organizations', `/api/platform/organizations/${alfa.id}`, '/api/platform/plans']) {
    const r = await call(cookie, 'GET', url);
    assert.equal(r.status, 200, url);
    assert.equal((await r.json()).success, true, url);
  }
});

test('switch-org a partir de uma sessão só de plataforma', async () => {
  const { res } = await login('consola@example.invalid');
  const cookie = cookieOf(res);
  // Sem membership: 403 e a sessão fica como estava.
  const denied = await call(cookie, 'POST', '/auth/switch-org', { organization_id: alfa.id });
  assert.equal(denied.status, 403);
  assert.equal(sessionRow(cookie).organization_id, null);

  const membership = orgs.createMembership({ organizationId: alfa.id, userId: consola.id, role: 'manager' });
  try {
    const switched = await call(cookie, 'POST', '/auth/switch-org', { organization_id: alfa.id });
    assert.equal(switched.status, 200);
    const body = await switched.json();
    assert.equal(body.data.user.organization_id, alfa.id);
    assert.equal(body.data.user.role, 'manager');
    assert.deepEqual(body.data.destinations, { platform: true, organizations: [{ id: alfa.id, name: 'Alfa', role: 'manager' }] });
    const next = cookieOf(switched);
    assert.notEqual(next, cookie);
    // A sessão antiga deixou de existir (rotação do id).
    assert.equal(sessionRow(cookie), undefined);
    assert.equal((await call(cookie, 'GET', '/auth/me')).status, 401);
    assert.equal((await call(next, 'GET', '/api/reservations')).status, 200);

    // E o inverso: da aplicação para a consola.
    const back = await call(next, 'POST', '/auth/platform-session');
    assert.equal(back.status, 200);
    const backBody = await back.json();
    assert.equal(backBody.data.user.organization_id, null);
    const platformCookie = cookieOf(back);
    assert.equal(sessionRow(platformCookie).organization_id, null);
    assert.equal(sessionRow(next), undefined);
    assert.deepEqual(await (await call(platformCookie, 'GET', '/api/reservations')).json(), PLATFORM_ONLY);
    // A sessão nova começa bloqueada na consola.
    assert.equal((await call(platformCookie, 'GET', '/api/platform/overview')).status, 423);
  } finally {
    db.prepare('DELETE FROM memberships WHERE id = ?').run(membership.id);
  }
});

test('platform-session: 404 para quem não é dono da instância', async () => {
  const { res } = await login('duas@example.invalid');
  const cookie = cookieOf(res);
  const r = await call(cookie, 'POST', '/auth/platform-session');
  assert.equal(r.status, 404);
  assert.equal(sessionRow(cookie).organization_id, alfa.id);
});

test('quem não é dono da instância e não tem organização continua sem entrar', async () => {
  const { res, body } = await login('sem-nada@example.invalid');
  assert.equal(res.status, 403);
  assert.equal(body.error, 'O utilizador não pertence a nenhuma organização ativa.');
  assert.equal(res.headers.get('set-cookie'), null);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM auth_sessions WHERE user_id = ?').get(semNada.id).n, 0);
  // E não consegue uma sessão sem organização por outro caminho.
  assert.throws(() => auth.createPlatformSession(semNada.id), /consola/);
});

test('uma sessão sem organização deixa de valer quando se perde o acesso de dono', async () => {
  const { res } = await login('consola@example.invalid');
  const cookie = cookieOf(res);
  const saved = process.env.PLATFORM_ADMIN_EMAILS;
  process.env.PLATFORM_ADMIN_EMAILS = 'outro@example.invalid';
  try {
    assert.equal((await call(cookie, 'GET', '/auth/me')).status, 401);
    assert.equal(sessionRow(cookie), undefined);
  } finally { process.env.PLATFORM_ADMIN_EMAILS = saved; }
  // A marca na base também conta.
  const again = cookieOf((await login('consola@example.invalid')).res);
  db.prepare('UPDATE users SET platform_admin = 0 WHERE id = ?').run(consola.id);
  try {
    assert.equal((await call(again, 'GET', '/auth/me')).status, 401);
  } finally { db.prepare('UPDATE users SET platform_admin = 1 WHERE id = ?').run(consola.id); }
});

test('dono da instância com organização ativa: entra na organização e vê a consola nas destinations', async () => {
  const { res, body } = await login('dono-com-org@example.invalid');
  assert.equal(res.status, 200);
  assert.equal(body.data.user.organization_id, alfa.id);
  assert.deepEqual(body.data.destinations, { platform: true, organizations: [{ id: alfa.id, name: 'Alfa', role: 'manager' }] });
  assert.equal(donoComOrg.id, body.data.user.id);
});

test('login e /me de um utilizador normal: destinations com as organizações ativas', async () => {
  const { res, body } = await login('duas@example.invalid');
  assert.equal(res.status, 200);
  assert.equal(body.data.user.organization_id, alfa.id);
  assert.equal(body.data.user.role, 'owner');
  const expected = { platform: false, organizations: [{ id: alfa.id, name: 'Alfa', role: 'owner' }, { id: beta.id, name: 'Beta', role: 'staff' }] };
  assert.deepEqual(body.data.destinations, expected);
  const me = await (await call(cookieOf(res), 'GET', '/auth/me')).json();
  assert.deepEqual(me.data.destinations, expected);
  assert.equal(me.data.user.organization_id, alfa.id);
  assert.equal(me.data.organization_plan, null);
});

test('suspensão no login: quem só tem organizações suspensas recebe 403 suspended', async () => {
  suspend(beta);
  try {
    const { res, body } = await login('so-beta@example.invalid');
    assert.equal(res.status, 403);
    assert.deepEqual(body, SUSPENDED);
    assert.equal(res.headers.get('set-cookie'), null);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM auth_sessions WHERE user_id = ?').get(soBeta.id).n, 0);

    // Com outra organização ativa: entra nessa e a suspensa não aparece.
    const two = await login('duas@example.invalid');
    assert.equal(two.res.status, 200);
    assert.equal(two.body.data.user.organization_id, alfa.id);
    assert.deepEqual(two.body.data.destinations.organizations, [{ id: alfa.id, name: 'Alfa', role: 'owner' }]);
    const memberships = await (await call(cookieOf(two.res), 'GET', '/auth/memberships')).json();
    assert.deepEqual(memberships.data.memberships.map(m => m.organization_id), [alfa.id]);

    // Dono da instância cuja única organização está suspensa: sessão só de plataforma.
    const owner = await login('dono-suspenso@example.invalid');
    assert.equal(owner.res.status, 200);
    assert.equal(owner.body.data.user.organization_id, null);
    assert.deepEqual(owner.body.data.destinations, { platform: true, organizations: [] });
    assert.equal(donoSuspenso.id, owner.body.data.user.id);
  } finally { suspend(beta, 'active'); }
});

test('suspensão numa sessão já aberta: 403 suspended na API e no /me; logout e switch-org continuam', async () => {
  const staffSession = cookieOf((await login('duas@example.invalid')).res);
  const switched = await call(staffSession, 'POST', '/auth/switch-org', { organization_id: beta.id });
  assert.equal(switched.status, 200);
  const inBeta = cookieOf(switched);
  const ownerBeta = cookieOf((await login('so-beta@example.invalid')).res);
  assert.equal((await call(inBeta, 'GET', '/api/reservations')).status, 200);

  suspend(beta);
  try {
    for (const [method, url, body] of [['GET', '/api/reservations'], ['GET', '/auth/me'], ['GET', '/api/platform/overview'],
      ['POST', '/api/telemetry', { views: {} }], ['PUT', '/auth/menu-prefs', { menu_prefs: null }], ['POST', '/api/accommodations', { name: 'X' }]]) {
      const r = await call(ownerBeta, method, url, body);
      assert.equal(r.status, 403, `${method} ${url}`);
      assert.deepEqual(await r.json(), SUSPENDED, `${method} ${url}`);
    }
    // A sessão não foi apagada: volta a funcionar se a suspensão for levantada.
    assert.ok(sessionRow(ownerBeta));

    // Mudar para uma organização suspensa: 403 suspended.
    const intoSuspended = await call(cookieOf((await login('duas@example.invalid')).res), 'POST', '/auth/switch-org', { organization_id: beta.id });
    assert.equal(intoSuspended.status, 403);
    assert.deepEqual(await intoSuspended.json(), SUSPENDED);

    // Sair da suspensa para a organização ativa funciona.
    const out = await call(inBeta, 'POST', '/auth/switch-org', { organization_id: alfa.id });
    assert.equal(out.status, 200);
    assert.equal((await call(cookieOf(out), 'GET', '/api/reservations')).status, 200);

    assert.equal((await call(ownerBeta, 'POST', '/auth/logout')).status, 200);
    assert.equal(sessionRow(ownerBeta), undefined);
  } finally { suspend(beta, 'active'); }
});

test('a suspensão levantada devolve o acesso à sessão aberta', async () => {
  const cookie = cookieOf((await login('so-beta@example.invalid')).res);
  suspend(beta);
  assert.equal((await call(cookie, 'GET', '/auth/me')).status, 403);
  suspend(beta, 'active');
  assert.equal((await call(cookie, 'GET', '/auth/me')).status, 200);
  // Só 'suspended' bloqueia: 'trial' entra normalmente.
  suspend(beta, 'trial');
  assert.equal((await call(cookie, 'GET', '/api/reservations')).status, 200);
  suspend(beta, 'active');
});

test('convite para uma organização suspensa: 403 suspended e o convite fica por usar', async () => {
  const invitation = orgs.createInvitation({ organizationId: beta.id, email: 'novo@example.invalid', role: 'staff', invitedByUserId: soBeta.id });
  suspend(beta);
  try {
    const r = await fetch(base + '/auth/invitations/accept', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': nextIp() },
      body: JSON.stringify({ token: invitation.token, name: 'Novo', password: PASSWORD, confirm_password: PASSWORD }) });
    assert.equal(r.status, 403);
    assert.deepEqual(await r.json(), SUSPENDED);
    assert.equal(db.prepare('SELECT accepted_at FROM invitations WHERE id = ?').get(invitation.id).accepted_at, null);
    assert.equal(auth.getUserByEmail('novo@example.invalid'), undefined);
  } finally { suspend(beta, 'active'); }
  // Levantada a suspensão, o convite funciona como sempre.
  const ok = await fetch(base + '/auth/invitations/accept', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': nextIp() },
    body: JSON.stringify({ token: invitation.token, name: 'Novo', password: PASSWORD, confirm_password: PASSWORD }) });
  assert.equal(ok.status, 201);
  assert.equal((await ok.json()).data.user.organization_id, beta.id);
});

test('getPrimaryMembership ignora organizações suspensas', () => {
  suspend(alfa);
  try {
    assert.equal(orgs.getPrimaryMembership(duasOrgs.id).organization_id, beta.id);
    assert.throws(() => auth.createSession(duasOrgs.id, alfa.id), err => err.suspended === true && err.status === 403);
  } finally { suspend(alfa, 'active'); }
  assert.equal(orgs.getPrimaryMembership(duasOrgs.id).organization_id, alfa.id);
});
