// Auditoria de segurança de novembro de 2026: IP real atrás do Docker e do
// túnel, limite de login por conta, anexos isolados e links iCal escondidos
// de staff. App real com SQLite em memória; sem serviços externos.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-security-'));
const previous = process.cwd();
process.chdir(temp);
process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.EMAIL_ENABLED = 'false';
// Nos testes o pedido vem do loopback, que é confiado: o X-Forwarded-For faz
// de IP do visitante, como o cloudflared em produção.
process.env.TRUST_PROXY = 'loopback';
const app = require('../app');
const { db } = require('../config/database');
const auth = require('../services/authService');
const orgs = require('../services/orgService');
let server, base;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.on('listening', resolve); server.on('error', reject); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server?.close(); db.close(); process.chdir(previous); fs.rmSync(temp, { recursive: true, force: true }); });

test('produção: confia no gateway da rede Docker e encontra o IP real do visitante', () => {
  // Arranca a app como em produção, noutro processo, e pergunta à configuração
  // do Express em quem confia (o pedido do cloudflared chega de 172.18.0.1).
  const script = `
    process.env.NODE_ENV = 'production'; process.env.PUBLIC_APP_URL = 'https://exemplo.invalid';
    process.env.DB_PATH = ':memory:'; delete process.env.TRUST_PROXY;
    const app = require(${JSON.stringify(path.join(__dirname, '../app'))});
    const trust = app.get('trust proxy fn');
    console.log(JSON.stringify(['127.0.0.1', '172.18.0.1', '10.0.0.5', '192.168.1.81', '203.0.113.7', '100.64.1.1'].map(ip => trust(ip, 0))));
    process.exit(0);`;
  const run = spawnSync(process.execPath, ['-e', script], { cwd: temp, encoding: 'utf8', env: { ...process.env, TRUST_PROXY: '' } });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout.trim().split('\n').at(-1)), [true, true, true, true, false, false]);
  // O docker-compose de produção diz o mesmo.
  const compose = fs.readFileSync(path.join(__dirname, '../../../docker-compose.yml'), 'utf8');
  assert.match(compose, /TRUST_PROXY=loopback,uniquelocal/);
});

test('login: um ataque distribuído por muitos IPs para à 50.ª palavra-passe errada da mesma conta', async () => {
  const org = orgs.createOrganization('Segurança login');
  const victim = auth.createUser({ name: 'Vítima', email: 'vitima@example.invalid', password: 'SyntheticVictim123!' });
  orgs.createMembership({ organizationId: org.id, userId: victim.id, role: 'owner' });
  const other = auth.createUser({ name: 'Outra', email: 'outra@example.invalid', password: 'SyntheticOther123!' });
  orgs.createMembership({ organizationId: org.id, userId: other.id, role: 'staff' });
  const login = (email, password, ip) => fetch(base + '/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip }, body: JSON.stringify({ email, password }),
  });
  // 9 tentativas por IP (abaixo do limite por IP), de IPs sempre diferentes.
  const statuses = [];
  for (let n = 0; n < 52; n++) statuses.push((await login('VITIMA@example.invalid', 'Errada123!', `198.51.100.${Math.floor(n / 9) + 1}`)).status);
  assert.deepEqual(statuses.slice(0, 50), Array(50).fill(401));
  assert.deepEqual(statuses.slice(50), [429, 429]);
  // A conta está protegida mesmo com a palavra-passe certa, de um IP novo…
  assert.equal((await login('vitima@example.invalid', 'SyntheticVictim123!', '198.51.100.200')).status, 429);
  // …mas as outras contas não são afetadas.
  assert.equal((await login('outra@example.invalid', 'SyntheticOther123!', '198.51.100.201')).status, 200);
});

test('anexos de emails recebidos saem como dados, numa caixa isolada', async () => {
  const org = orgs.createOrganization('Segurança anexos');
  const user = auth.createUser({ name: 'Gestora', email: 'gestora@example.invalid', password: 'SyntheticManager123!' });
  orgs.createMembership({ organizationId: org.id, userId: user.id, role: 'manager' });
  const session = auth.createSession(user.id, org.id).sessionId;
  const html = Buffer.from('<script>alert(1)</script>').toString('base64url');
  const gmail = require('../config/googleEmail');
  const original = gmail.getAuthenticatedEmailClient;
  gmail.getAuthenticatedEmailClient = () => ({ request: async () => ({ data: { data: html } }) });
  try {
    const r = await fetch(`${base}/auth/email/attachment?message_id=m1&attachment_id=a1&filename=${encodeURIComponent('fatura "x".html')}`, {
      headers: { Cookie: `${auth.SESSION_COOKIE}=${session}` },
    });
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /^application\/octet-stream/);
    assert.match(r.headers.get('content-security-policy'), /^sandbox;/);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.match(r.headers.get('content-disposition'), /filename="fatura x\.html"/);
  } finally { gmail.getAuthenticatedEmailClient = original; }
});

test('staff não recebe os links iCal das plataformas (nem tokens das reservas)', async () => {
  const org = orgs.createOrganization('Segurança staff');
  const user = auth.createUser({ name: 'Equipa', email: 'equipa@example.invalid', password: 'SyntheticStaff123!' });
  orgs.createMembership({ organizationId: org.id, userId: user.id, role: 'staff' });
  const session = auth.createSession(user.id, org.id).sessionId;
  db.prepare(`INSERT INTO accommodations(id,organization_id,name,type,airbnb_ical_url,booking_ical_url)
    VALUES('ical-unit',?,'Unidade','alojamento','https://www.airbnb.com/calendar/ical/1.ics?s=SEGREDO','https://admin.booking.com/ical/SEGREDO.ics')`).run(org.id);
  const r = await fetch(base + '/api/accommodations', { headers: { Cookie: `${auth.SESSION_COOKIE}=${session}` } });
  const body = await r.text();
  assert.equal(r.status, 200);
  assert.doesNotMatch(body, /SEGREDO/);
  assert.match(body, /Unidade/);
});

test('recuperação de palavra-passe responde igual e já, com ou sem conta', async () => {
  const ask = email => fetch(base + '/auth/forgot-password', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '192.0.2.10' }, body: JSON.stringify({ email }),
  });
  const a = await ask('vitima@example.invalid');
  const b = await ask('ninguem@example.invalid');
  assert.deepEqual([a.status, await a.json()], [b.status, await b.json()]);
});
