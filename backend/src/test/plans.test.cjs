// Pacotes: tabela e seed, API da consola (/api/platform/plans), plan_id nas
// organizações, limites ao criar alojamento e ao convidar ou aceitar membro
// (403 com `limit`), organization_plan no /auth/me e auditoria. Sem pacote,
// sem limites. App real com SQLite em memória.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-plans-'));
const previous = process.cwd();
process.chdir(temp);
Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test', EMAIL_ENABLED: 'false', TRUST_PROXY: 'loopback',
  PLATFORM_ADMIN_EMAILS: 'dono@example.invalid' });
const app = require('../app');
const { db } = require('../config/database');
const auth = require('../services/authService');
const orgs = require('../services/orgService');
const plans = require('../services/plansService');
const PASSWORD = 'SyntheticUser123!';
let server, base;
let ipCounter = 10;
const nextIp = () => `198.51.100.${ipCounter++}`;

const alfa = orgs.createOrganization('Alfa');
const beta = orgs.createOrganization('Beta');
const gama = orgs.createOrganization('Gama');
function person(email, org, role = 'owner') {
  const user = auth.createUser({ name: email.split('@')[0], email, password: PASSWORD });
  if (org) orgs.createMembership({ organizationId: org.id, userId: user.id, role });
  return { user, cookie: org ? `${auth.SESSION_COOKIE}=${auth.createSession(user.id, org.id).sessionId}` : null };
}
const dono = person('dono@example.invalid', gama);
db.prepare('UPDATE users SET platform_admin = 1 WHERE id = ?').run(dono.user.id);
const alfaOwner = person('alfa@example.invalid', alfa);
const betaOwner = person('beta@example.invalid', beta);

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.on('listening', resolve); server.on('error', reject); });
  base = `http://127.0.0.1:${server.address().port}`;
  const r = await call(dono.cookie, 'POST', '/api/platform/unlock', { password: PASSWORD });
  assert.equal(r.status, 200);
});
after(() => { server?.close(); db.close(); process.chdir(previous); fs.rmSync(temp, { recursive: true, force: true }); });

function call(cookie, method, url, body) {
  return fetch(base + url, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-Forwarded-For': nextIp() },
    body: body ? JSON.stringify(body) : undefined });
}
const platform = (method, url, body) => call(dono.cookie, method, '/api/platform' + url, body);
const audits = action => db.prepare('SELECT * FROM platform_audit_events WHERE action = ? ORDER BY created_at, rowid').all(action);
const planByName = name => plans.listPlans().find(p => p.name === name);
const setPlan = (org, planId) => db.prepare('UPDATE organizations SET plan_id = ? WHERE id = ?').run(planId, org.id);
const addAccommodations = (org, n) => {
  for (let i = 0; i < n; i++) {
    db.prepare("INSERT INTO accommodations (id, organization_id, name, type, price_per_night, max_guests) VALUES (?, ?, ?, 'suite', 100, 2)")
      .run(`${org.id}-a${i}-${Date.now()}`, org.id, `Quarto ${i}`);
  }
};

test('seed: Essencial, Profissional e Premium; as organizações existentes ficam sem pacote', () => {
  const list = plans.listPlans();
  assert.deepEqual(list.map(p => [p.name, p.max_accommodations, p.max_members, p.features, p.sort, p.organizations]), [
    ['Essencial', 3, 2, { payments: false, reports: 'basic', marketing: false }, 1, 0],
    ['Profissional', 10, 5, { payments: true, reports: 'full', marketing: 'optional' }, 2, 0],
    ['Premium', null, null, { payments: true, reports: 'full_pdf', marketing: 'included' }, 3, 0],
  ]);
  for (const org of [alfa, beta, gama]) assert.equal(db.prepare('SELECT plan_id FROM organizations WHERE id = ?').get(org.id).plan_id, null);
  // Idempotente: correr de novo não duplica nem altera.
  require('../config/migrations').runMigrations(db);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM plans').get().n, 3);
  // A FK é SET NULL: apagar o pacote tira-o das organizações.
  const fk = db.pragma('foreign_key_list(organizations)').find(f => f.table === 'plans');
  assert.equal(fk.from, 'plan_id');
  assert.equal(fk.on_delete, 'SET NULL');
});

test('GET /plans: lista com organizações por pacote; só para o dono da instância', async () => {
  const r = await platform('GET', '/plans');
  assert.equal(r.status, 200);
  const { data } = await r.json();
  assert.equal(data.length, 3);
  assert.deepEqual(Object.keys(data[0]).sort(), ['features', 'id', 'max_accommodations', 'max_members', 'name', 'organizations', 'sort']);
  assert.equal((await call(alfaOwner.cookie, 'GET', '/api/platform/plans')).status, 404);
});

test('POST, PUT e DELETE /plans: validação, nome único, 409 com organizações e auditoria', async () => {
  for (const body of [{}, { name: '  ' }, { name: 'x'.repeat(61) }, { name: 'Mau', max_accommodations: -1 }, { name: 'Mau', max_members: 1.5 },
    { name: 'Mau', max_members: 'muitos' }, { name: 'Mau', features: [] }, { name: 'Mau', features: { 'Não Vale': true } },
    { name: 'Mau', features: { a: { b: 1 } } }, { name: 'Mau', sort: 'x' }]) {
    const r = await platform('POST', '/plans', body);
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.equal((await r.json()).success, false);
  }
  assert.equal((await platform('POST', '/plans', { name: 'essencial' })).status, 409);

  const created = await platform('POST', '/plans', { name: ' Piloto ', max_accommodations: 1, max_members: '', features: { payments: true }, sort: 9 });
  assert.equal(created.status, 201);
  const plan = (await created.json()).data;
  assert.deepEqual({ ...plan, id: undefined }, { id: undefined, name: 'Piloto', max_accommodations: 1, max_members: null, features: { payments: true }, sort: 9, organizations: 0 });

  const updated = await platform('PUT', `/plans/${plan.id}`, { max_members: 4, name: 'Piloto 2' });
  assert.equal(updated.status, 200);
  const after = (await updated.json()).data;
  assert.equal(after.name, 'Piloto 2');
  assert.equal(after.max_members, 4);
  assert.equal(after.max_accommodations, 1, 'campos ausentes ficam como estavam');
  assert.deepEqual(after.features, { payments: true });
  assert.equal((await platform('PUT', `/plans/${plan.id}`, { name: 'Premium' })).status, 409);
  assert.equal((await platform('PUT', `/plans/${plan.id}`, { max_accommodations: 'x' })).status, 400);
  assert.equal((await platform('PUT', '/plans/nao-existe', { name: 'X' })).status, 404);

  // Com uma organização atribuída não se apaga.
  setPlan(beta, plan.id);
  const conflict = await platform('DELETE', `/plans/${plan.id}`);
  assert.equal(conflict.status, 409);
  assert.match((await conflict.json()).error, /1 organização/);
  assert.equal(planByName('Piloto 2').organizations, 1);
  setPlan(beta, null);
  const removed = await platform('DELETE', `/plans/${plan.id}`);
  assert.equal(removed.status, 200);
  assert.deepEqual((await removed.json()).data, { id: plan.id });
  assert.equal(planByName('Piloto 2'), undefined);
  assert.equal((await platform('DELETE', `/plans/${plan.id}`)).status, 404);

  const [c] = audits('plan.create');
  assert.equal(c.user_id, dono.user.id);
  assert.equal(c.target_type, 'plan');
  assert.equal(c.target_id, plan.id);
  assert.deepEqual(JSON.parse(c.details_json), { name: 'Piloto', max_accommodations: 1, max_members: null });
  const u = audits('plan.update');
  assert.equal(u.length, 1, 'só as alterações bem-sucedidas ficam registadas');
  assert.deepEqual(JSON.parse(u[0].details_json).fields, ['name', 'max_members']);
  assert.equal(audits('plan.delete').length, 1);
  assert.ok(c.ip);
});

test('PUT /organizations/:id com plan_id: plan como {id,name} na lista e na ficha; null limpa; auditado', async () => {
  const essencial = planByName('Essencial');
  assert.equal((await platform('PUT', `/organizations/${alfa.id}`, { plan_id: 'nao-existe' })).status, 400);
  assert.equal((await platform('PUT', `/organizations/${alfa.id}`, { plan_id: 7 })).status, 400);
  const r = await platform('PUT', `/organizations/${alfa.id}`, { plan_id: essencial.id });
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).data.plan, { id: essencial.id, name: 'Essencial' });
  const list = (await (await platform('GET', '/organizations')).json()).data;
  assert.deepEqual(list.find(o => o.id === alfa.id).plan, { id: essencial.id, name: 'Essencial' });
  assert.equal(list.find(o => o.id === beta.id).plan, null);
  assert.deepEqual((await (await platform('GET', `/organizations/${alfa.id}`)).json()).data.plan, { id: essencial.id, name: 'Essencial' });
  // Sem plan_id no corpo, o pacote fica.
  await platform('PUT', `/organizations/${alfa.id}`, { notes: 'x' });
  assert.deepEqual((await (await platform('GET', `/organizations/${alfa.id}`)).json()).data.plan, { id: essencial.id, name: 'Essencial' });
  const cleared = await platform('PUT', `/organizations/${alfa.id}`, { plan_id: null });
  assert.equal((await cleared.json()).data.plan, null);
  const details = audits('organization.update').map(a => JSON.parse(a.details_json));
  assert.deepEqual(details.filter(d => 'plan_id' in d).map(d => d.plan_id), [essencial.id, null]);
});

test('limite de alojamentos: 403 com limit ao passar o máximo; sem pacote, sem limite', async () => {
  const essencial = planByName('Essencial');
  // Sem pacote: cria à vontade.
  addAccommodations(alfa, 3);
  const free = await call(alfaOwner.cookie, 'POST', '/api/accommodations', { name: 'Sem limite' });
  assert.equal(free.status, 201);
  db.prepare('DELETE FROM accommodations WHERE organization_id = ?').run(alfa.id);

  setPlan(alfa, essencial.id);
  try {
    addAccommodations(alfa, 2);
    const third = await call(alfaOwner.cookie, 'POST', '/api/accommodations', { name: 'Terceiro' });
    assert.equal(third.status, 201);
    const fourth = await call(alfaOwner.cookie, 'POST', '/api/accommodations', { name: 'Quarto a mais' });
    assert.equal(fourth.status, 403);
    assert.deepEqual(await fourth.json(), { success: false,
      error: 'Atingiu o limite de 3 alojamentos do pacote «Essencial». Fale connosco para mudar de pacote.', limit: 'accommodations' });
    assert.equal(db.prepare('SELECT COUNT(*) n FROM accommodations WHERE organization_id = ?').get(alfa.id).n, 3);
    // Outras organizações não são afetadas.
    addAccommodations(beta, 5);
    assert.equal((await call(betaOwner.cookie, 'POST', '/api/accommodations', { name: 'Beta extra' })).status, 201);
  } finally {
    setPlan(alfa, null);
    db.prepare('DELETE FROM accommodations WHERE organization_id IN (?, ?)').run(alfa.id, beta.id);
  }
});

test('limite de membros: convites contam; 403 com limit no convite e na aceitação', async () => {
  const essencial = planByName('Essencial'); // 2 membros
  setPlan(alfa, essencial.id);
  try {
    // 1 membro (o dono) + 1 convite pendente = 2: o próximo convite já passa.
    const first = await call(alfaOwner.cookie, 'POST', '/api/team/invitations', { email: 'um@example.invalid', role: 'staff' });
    assert.equal(first.status, 201);
    const second = await call(alfaOwner.cookie, 'POST', '/api/team/invitations', { email: 'dois@example.invalid', role: 'staff' });
    assert.equal(second.status, 403);
    assert.deepEqual(await second.json(), { success: false,
      error: 'Atingiu o limite de 2 membros do pacote «Essencial». Fale connosco para mudar de pacote.', limit: 'members' });
    assert.equal(db.prepare("SELECT COUNT(*) n FROM invitations WHERE organization_id = ? AND email = 'dois@example.invalid'").get(alfa.id).n, 0);

    // Um convite antigo (de antes do pacote) não deixa passar o limite ao aceitar.
    const extra = orgs.createInvitation({ organizationId: alfa.id, email: 'antigo@example.invalid', role: 'staff', invitedByUserId: alfaOwner.user.id });
    person('outro-membro@example.invalid', alfa, 'staff'); // agora há 2 membros ativos
    const accept = await fetch(base + '/auth/invitations/accept', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': nextIp() },
      body: JSON.stringify({ token: extra.token, name: 'Antigo', password: PASSWORD, confirm_password: PASSWORD }) });
    assert.equal(accept.status, 403);
    assert.deepEqual(await accept.json(), { success: false,
      error: 'Atingiu o limite de 2 membros do pacote «Essencial». Fale connosco para mudar de pacote.', limit: 'members' });
    assert.equal(auth.getUserByEmail('antigo@example.invalid'), undefined, 'a conta nova não fica criada');
    assert.equal(db.prepare('SELECT accepted_at FROM invitations WHERE id = ?').get(extra.id).accepted_at, null);

    // Conta que já existe: o mesmo 403 e sem membership.
    const existing = person('existente@example.invalid', null);
    const invite = orgs.createInvitation({ organizationId: alfa.id, email: 'existente@example.invalid', role: 'staff', invitedByUserId: alfaOwner.user.id });
    const acceptExisting = await fetch(base + '/auth/invitations/accept', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': nextIp() },
      body: JSON.stringify({ token: invite.token, password: PASSWORD }) });
    assert.equal(acceptExisting.status, 403);
    assert.equal((await acceptExisting.json()).limit, 'members');
    assert.equal(orgs.getMembershipByUserAndOrganization(existing.user.id, alfa.id), undefined);

    // Com o Premium (sem limites) o mesmo convite passa.
    setPlan(alfa, planByName('Premium').id);
    const ok = await fetch(base + '/auth/invitations/accept', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': nextIp() },
      body: JSON.stringify({ token: invite.token, password: PASSWORD }) });
    assert.equal(ok.status, 200);
  } finally { setPlan(alfa, null); }
});

test('sem pacote não há limite de membros', async () => {
  for (let i = 0; i < 4; i++) {
    const r = await call(betaOwner.cookie, 'POST', '/api/team/invitations', { email: `livre${i}@example.invalid`, role: 'staff' });
    assert.equal(r.status, 201);
  }
});

test('/auth/me: organization_plan com o uso; null sem pacote', async () => {
  const me = async cookie => (await (await call(cookie, 'GET', '/auth/me')).json()).data;
  assert.equal((await me(alfaOwner.cookie)).organization_plan, null);
  const profissional = planByName('Profissional');
  setPlan(alfa, profissional.id);
  addAccommodations(alfa, 2);
  try {
    const members = db.prepare('SELECT COUNT(*) n FROM memberships WHERE organization_id = ? AND active = 1').get(alfa.id).n;
    assert.deepEqual((await me(alfaOwner.cookie)).organization_plan, {
      name: 'Profissional', max_accommodations: 10, max_members: 5, usage: { accommodations: 2, members },
    });
  } finally {
    setPlan(alfa, null);
    db.prepare('DELETE FROM accommodations WHERE organization_id = ?').run(alfa.id);
  }
});

test('GET /plans/near-limit: organizações com uso ≥ 80% de algum limite', async () => {
  const essencial = planByName('Essencial'); // 3 alojamentos, 2 membros
  const profissional = planByName('Profissional'); // 10, 5
  const premium = planByName('Premium');
  const delta = orgs.createOrganization('Delta');
  const eps = orgs.createOrganization('Épsilon');
  const zeta = orgs.createOrganization('Zeta');
  person('delta@example.invalid', delta);
  person('eps@example.invalid', eps);
  person('zeta@example.invalid', zeta);
  setPlan(delta, profissional.id); addAccommodations(delta, 8); // 80% dos alojamentos
  setPlan(eps, profissional.id); addAccommodations(eps, 7); // 70% e 1/5 membros: fora
  setPlan(zeta, premium.id); addAccommodations(zeta, 50); // sem limites: fora
  setPlan(gama, essencial.id); // 1/2 membros (50%), 0/3 alojamentos: fora
  try {
    const r = await platform('GET', '/plans/near-limit');
    assert.equal(r.status, 200);
    const { data } = await r.json();
    assert.deepEqual(data, [{
      organization: { id: delta.id, name: 'Delta' }, plan: { id: profissional.id, name: 'Profissional' },
      accommodations: { used: 8, max: 10 }, members: { used: 1, max: 5 },
    }]);
    person('gama2@example.invalid', gama, 'staff'); // 2/2 membros
    const names = (await (await platform('GET', '/plans/near-limit')).json()).data.map(x => x.organization.name);
    assert.deepEqual(names, ['Delta', 'Gama']);
  } finally { setPlan(gama, null); }
});

test('apagar um pacote limpa o plan_id (FK SET NULL) e as organizações ficam sem limites', () => {
  const id = plans.createPlan({ name: 'Temporário', max_accommodations: 0 }).id;
  setPlan(beta, id);
  db.prepare('DELETE FROM plans WHERE id = ?').run(id);
  assert.equal(db.prepare('SELECT plan_id FROM organizations WHERE id = ?').get(beta.id).plan_id, null);
  assert.doesNotThrow(() => plans.assertWithinLimit(beta.id, 'accommodations'));
});
