// Revisão de segurança (A03): aceitar um convite com conta existente partilha o
// orçamento de falhas por conta do /login (chave: email do convite).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-invite-limit-'));
const previous = process.cwd();
process.chdir(temp);
process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.EMAIL_ENABLED = 'false';
process.env.TRUST_PROXY = 'loopback';
const app = require('../app');
const { db } = require('../config/database');
const auth = require('../services/authService');
const orgs = require('../services/orgService');
const limiter = require('../middleware/rateLimiter');
let server, base;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.on('listening', resolve); server.on('error', reject); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server?.close(); db.close(); process.chdir(previous); fs.rmSync(temp, { recursive: true, force: true }); });

const post = (url, body, headers = {}) => fetch(base + url, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
});

test('orçamento esgotado no /login bloqueia o aceitar convite dessa conta', async () => {
  const org = orgs.createOrganization('Convite partilhado');
  const home = orgs.createOrganization('Casa');
  const owner = auth.createUser({ name: 'Dono', email: 'dono-convite@example.invalid', password: 'SyntheticOwner123!' });
  orgs.createMembership({ organizationId: home.id, userId: owner.id, role: 'owner' });
  const invitation = orgs.createInvitation({ organizationId: org.id, email: 'dono-convite@example.invalid', role: 'staff', invitedByUserId: owner.id });
  // Esgota o orçamento da conta pelo /login, de IPs diferentes.
  for (let n = 0; n < 50; n++) {
    const r = await post('/auth/login', { email: 'DONO-convite@example.invalid', password: 'Errada123!' }, { 'X-Forwarded-For': `203.0.113.${Math.floor(n / 9) + 1}` });
    assert.equal(r.status, 401);
  }
  // Mesmo com a palavra-passe certa o convite é recusado; um email no corpo não muda a conta.
  const res = await post('/auth/invitations/accept', { token: invitation.token, password: 'SyntheticOwner123!', email: 'outra@example.invalid' }, { 'X-Forwarded-For': '192.0.2.99' });
  assert.equal(res.status, 429);
  assert.equal(orgs.getMembershipByUserAndOrganization(owner.id, org.id) ?? null, null);
});

test('aceitar convite: a falha gasta uma tentativa e o sucesso devolve-a', async () => {
  const org = orgs.createOrganization('Convite contagem');
  const home = orgs.createOrganization('Casa 2');
  const user = auth.createUser({ name: 'Rui', email: 'rui-convite@example.invalid', password: 'SyntheticRui123!' });
  orgs.createMembership({ organizationId: home.id, userId: user.id, role: 'owner' });
  const invitation = orgs.createInvitation({ organizationId: org.id, email: 'rui-convite@example.invalid', role: 'staff', invitedByUserId: user.id });
  const wrong = await post('/auth/invitations/accept', { token: invitation.token, password: 'Errada123!' }, { 'X-Forwarded-For': '192.0.2.10' });
  assert.equal(wrong.status, 401);
  // Esgota as 49 tentativas restantes: a 50.ª já não passa, logo a falha anterior contou.
  let allowed = 0;
  while (limiter.consumeAccountAttempt('rui-convite@example.invalid')) allowed++;
  assert.equal(allowed, 49);
  for (let n = 0; n < allowed; n++) limiter.refundAccountAttempt('rui-convite@example.invalid');
  const ok = await post('/auth/invitations/accept', { token: invitation.token, password: 'SyntheticRui123!' }, { 'X-Forwarded-For': '192.0.2.11' });
  assert.equal(ok.status, 200);
});
