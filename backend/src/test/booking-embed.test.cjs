// Página de reservas dentro do site do cliente: frame-ancestors por
// organização e só em /reservar/<slug>?embed=1, validação das origens, a API
// do proprietário (/api/embed/settings), o pacote (booking_embed) e o
// carregador /embed.js. App real com SQLite em memória.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-embed-'));
const previous = process.cwd();
process.chdir(temp);
Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test', EMAIL_ENABLED: 'false', TRUST_PROXY: 'loopback',
  FRONTEND_PATH: path.resolve(__dirname, '../../../frontend') });
const app = require('../app');
const { db } = require('../config/database');
const auth = require('../services/authService');
const orgs = require('../services/orgService');
const settings = require('../services/settingsService');
const embed = require('../services/bookingEmbed');
const PASSWORD = 'SyntheticUser123!';
let server, base;
let ipCounter = 10;
const nextIp = () => `198.51.100.${ipCounter++}`;

const planId = name => db.prepare('SELECT id FROM plans WHERE name = ?').get(name).id;
const premium = orgs.createOrganization('Premium Lda');
const essencial = orgs.createOrganization('Essencial Lda');
const semPacote = orgs.createOrganization('Sem Pacote Lda');
db.prepare('UPDATE organizations SET plan_id = ? WHERE id = ?').run(planId('Premium'), premium.id);
db.prepare('UPDATE organizations SET plan_id = ? WHERE id = ?').run(planId('Essencial'), essencial.id);
const addPlace = (org, id, slug) => db.prepare(`INSERT INTO accommodations (id, organization_id, name, type, price_per_night, max_guests, public_slug)
  VALUES (?, ?, ?, 'alojamento', 100, 4, ?)`).run(id, org.id, `Casa ${slug}`, slug);
addPlace(premium, 'p1', 'casa-premium');
addPlace(essencial, 'e1', 'casa-essencial');
addPlace(semPacote, 's1', 'casa-sem-pacote');
settings.set(premium.id, 'embed_origins', ['https://www.cliente.pt', 'https://cliente.pt']);
settings.set(essencial.id, 'embed_origins', ['https://essencial.pt']);
settings.set(semPacote.id, 'embed_origins', ['https://sem-pacote.pt']);

function person(email, org, role) {
  const user = auth.createUser({ name: email.split('@')[0], email, password: PASSWORD });
  orgs.createMembership({ organizationId: org.id, userId: user.id, role });
  return `${auth.SESSION_COOKIE}=${auth.createSession(user.id, org.id).sessionId}`;
}
const owner = person('dono@example.invalid', premium, 'owner');
const manager = person('gestor@example.invalid', premium, 'manager');
const staff = person('equipa@example.invalid', premium, 'staff');
const ownerEssencial = person('dono2@example.invalid', essencial, 'owner');

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.on('listening', resolve); server.on('error', reject); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server?.close(); db.close(); process.chdir(previous); fs.rmSync(temp, { recursive: true, force: true }); });

const get = (url, cookie) => fetch(base + url, { headers: { 'X-Forwarded-For': nextIp(), ...(cookie ? { Cookie: cookie } : {}) } });
const call = (cookie, method, url, body) => fetch(base + url, { method,
  headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-Forwarded-For': nextIp() }, body: body ? JSON.stringify(body) : undefined });
const ancestors = res => /frame-ancestors ([^;]*)/.exec(res.headers.get('content-security-policy') || '')?.[1].trim();

test('origens: https normalizadas; http só em localhost; sem curingas, caminhos, credenciais nem injeção no CSP', () => {
  assert.equal(embed.normalizeOrigin('www.exemplo.pt'), 'https://www.exemplo.pt');
  assert.equal(embed.normalizeOrigin(' https://Exemplo.PT/ '), 'https://exemplo.pt');
  assert.equal(embed.normalizeOrigin('https://exemplo.pt:8443'), 'https://exemplo.pt:8443');
  assert.equal(embed.normalizeOrigin('http://localhost:8080'), 'http://localhost:8080');
  assert.equal(embed.normalizeOrigin('http://127.0.0.1:5000'), 'http://127.0.0.1:5000');
  assert.equal(embed.normalizeOrigin('https://açores.pt'), 'https://xn--aores-yra.pt');
  for (const bad of ['', 'http://exemplo.pt', '*.exemplo.pt', 'https://*.exemplo.pt', 'https://exemplo.pt/reservas', 'https://exemplo.pt?x=1',
    'https://exemplo.pt#a', 'https://u:p@exemplo.pt', 'javascript:alert(1)', 'data:text/html,x', 'ftp://exemplo.pt', 'https://exemplo',
    "https://a.pt; script-src 'unsafe-inline'", 'https://a.pt https://b.pt', "'self'", 'https://' + 'a'.repeat(250) + '.pt']) {
    assert.throws(() => embed.normalizeOrigin(bad), err => err.status === 400, bad);
  }
  assert.deepEqual(embed.normalizeOrigins(['https://a.pt', 'a.pt', '', 'https://b.pt/']), ['https://a.pt', 'https://b.pt']);
  assert.throws(() => embed.normalizeOrigins('https://a.pt'), err => err.status === 400);
  assert.throws(() => embed.normalizeOrigins([1]), err => err.status === 400);
  assert.throws(() => embed.normalizeOrigins(Array.from({ length: 11 }, (_, i) => `https://s${i}.pt`)), err => err.status === 400);
});

test('frame-ancestors: os sites autorizados só em /reservar/<slug>?embed=1, sem X-Frame-Options', async () => {
  const res = await get('/reservar/casa-premium?embed=1');
  assert.equal(res.status, 200);
  assert.equal(ancestors(res), "'self' https://www.cliente.pt https://cliente.pt");
  assert.equal(res.headers.get('x-frame-options'), null);
  const html = await res.text();
  assert.match(html, /<html lang="pt" data-layout="novo" data-embed="1">/);
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.match(html, /\/js\/features\/public-reservation\/embed\.js/);
  // Com barra no fim também.
  assert.equal(ancestors(await get('/reservar/casa-premium/?embed=1')), "'self' https://www.cliente.pt https://cliente.pt");
});

test("frame-ancestors: 'self' na página normal, nas outras rotas e noutros valores de embed", async () => {
  for (const url of ['/reservar/casa-premium', '/reservar/casa-premium?embed=0', '/reservar/casa-premium?embed=true',
    '/reserva/' + 'a'.repeat(64) + '?embed=1', '/pre-checkin/x?embed=1', '/?embed=1', '/public-reservation.html?embed=1',
    '/api/public/booking/casa-premium?embed=1', '/reservar/casa-premium/extra?embed=1', '/reservar/nao-existe?embed=1']) {
    const res = await get(url);
    assert.equal(ancestors(res), "'self'", url);
    assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN', url);
  }
  const html = await (await get('/reservar/casa-premium')).text();
  assert.doesNotMatch(html, /data-embed/);
});

test("pacote sem booking_embed: 'self' e «Disponível no plano Premium»; sem pacote = sem limites", async () => {
  const res = await get('/reservar/casa-essencial?embed=1');
  assert.equal(res.status, 200);
  assert.equal(ancestors(res), "'self'");
  assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN');
  const html = await res.text();
  assert.match(html, /Disponível no plano Premium/);
  assert.doesNotMatch(html, /data-embed/);
  // A página normal da mesma organização continua igual.
  assert.match(await (await get('/reservar/casa-essencial')).text(), /public-booking-form/);
  assert.equal(ancestors(await get('/reservar/casa-sem-pacote?embed=1')), "'self' https://sem-pacote.pt");
});

test('valores gravados à mão que não são origens seguras nunca chegam ao cabeçalho', async () => {
  settings.set(semPacote.id, 'embed_origins', ["https://ok.pt; script-src *", '*', 'https://bom.pt', 'http://mau.pt']);
  assert.equal(ancestors(await get('/reservar/casa-sem-pacote?embed=1')), "'self' https://bom.pt");
  settings.set(semPacote.id, 'embed_origins', 'não é JSON');
  assert.equal(ancestors(await get('/reservar/casa-sem-pacote?embed=1')), "'self'");
  settings.set(semPacote.id, 'embed_origins', ['https://sem-pacote.pt']);
});

test('demonstrações não têm página pública: nem incorporada', async () => {
  const demo = orgs.createOrganization('Demo Lda');
  addPlace(demo, 'd1', 'casa-demo');
  settings.set(demo.id, 'embed_origins', ['https://demo.pt']);
  db.prepare(`INSERT INTO platform_trial_access (organization_id, mode, days, owner_email, started_at) VALUES (?, 'demo', 14, 'demo@example.invalid', datetime('now'))`).run(demo.id);
  assert.equal(ancestors(await get('/reservar/casa-demo?embed=1')), "'self'");
});

test('GET/PUT /api/embed/settings: só o proprietário; guarda normalizado, devolve o código a colar e regista', async () => {
  for (const cookie of [manager, staff]) {
    assert.equal((await get('/api/embed/settings', cookie)).status, 403);
    assert.equal((await call(cookie, 'PUT', '/api/embed/settings', { origins: ['https://x.pt'] })).status, 403);
  }
  assert.equal((await get('/api/embed/settings')).status, 401);

  const r = await get('/api/embed/settings', owner);
  assert.equal(r.status, 200);
  const { data } = await r.json();
  assert.equal(data.available, true);
  assert.equal(data.plan, 'Premium');
  assert.deepEqual(data.origins, ['https://www.cliente.pt', 'https://cliente.pt']);
  assert.deepEqual(data.accommodations.map(a => a.slug), ['casa-premium']);
  assert.equal(data.snippet.script, `<div data-sp-reservas="casa-premium"></div>\n<script src="${base}/embed.js" async></script>`);
  assert.match(data.snippet.iframe, new RegExp(`src="${base}/reservar/casa-premium\\?embed=1"`));

  const bad = await call(owner, 'PUT', '/api/embed/settings', { origins: ['https://*.cliente.pt'] });
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /curingas/);
  assert.deepEqual(embed.storedOrigins(premium.id), ['https://www.cliente.pt', 'https://cliente.pt']);

  const saved = await call(owner, 'PUT', '/api/embed/settings', { origins: ['loja.cliente.pt', 'http://localhost:8080/', 'https://loja.cliente.pt'] });
  assert.equal(saved.status, 200);
  assert.deepEqual((await saved.json()).data.origins, ['https://loja.cliente.pt', 'http://localhost:8080']);
  assert.equal(ancestors(await get('/reservar/casa-premium?embed=1')), "'self' https://loja.cliente.pt http://localhost:8080");
  const audit = db.prepare("SELECT meta FROM audit_events WHERE organization_id = ? AND action = 'settings.embed_origins_changed'").get(premium.id);
  assert.deepEqual(JSON.parse(audit.meta).after, ['https://loja.cliente.pt', 'http://localhost:8080']);

  // Lista vazia: deixa de poder ser incorporada noutro site.
  assert.equal((await call(owner, 'PUT', '/api/embed/settings', { origins: [] })).status, 200);
  assert.equal(ancestors(await get('/reservar/casa-premium?embed=1')), "'self'");
  assert.equal((await get('/reservar/casa-premium?embed=1')).headers.get('x-frame-options'), 'SAMEORIGIN');

  // Pacote sem a funcionalidade: lê (para mostrar o aviso), não grava.
  const ess = await (await get('/api/embed/settings', ownerEssencial)).json();
  assert.equal(ess.data.available, false);
  const denied = await call(ownerEssencial, 'PUT', '/api/embed/settings', { origins: ['https://essencial.pt'] });
  assert.equal(denied.status, 403);
  assert.match((await denied.json()).error, /Premium/);
});

test('/embed.js: JavaScript, cache de uma hora e carregável de outra origem', async () => {
  const res = await fetch(base + '/embed.js', { headers: { Origin: 'https://www.cliente.pt' } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /^text\/javascript; charset=utf-8/);
  assert.equal(res.headers.get('cache-control'), 'public, max-age=3600');
  assert.equal(res.headers.get('cross-origin-resource-policy'), 'cross-origin');
  const body = await res.text();
  assert.match(body, /sp-embed-height/);
  assert.match(body, /event\.origin !== ORIGIN/);
});

test('migração: o Premium que já existia ganha booking_embed; um valor escolhido na consola fica', () => {
  const premiumFeatures = () => JSON.parse(db.prepare("SELECT features_json FROM plans WHERE name = 'Premium'").get().features_json);
  assert.equal(premiumFeatures().booking_embed, true);
  const rerun = () => {
    db.prepare("DELETE FROM schema_migrations WHERE id = '20261123_plan_booking_embed'").run();
    require('../config/migrations-platform/plans')(db);
  };
  db.prepare(`UPDATE plans SET features_json = '{"payments":true,"reports":"full_pdf","marketing":"included"}' WHERE name = 'Premium'`).run();
  rerun();
  assert.deepEqual(premiumFeatures(), { payments: true, reports: 'full_pdf', marketing: 'included', booking_embed: true });
  db.prepare(`UPDATE plans SET features_json = '{"payments":true,"booking_embed":false}' WHERE name = 'Premium'`).run();
  rerun();
  assert.equal(premiumFeatures().booking_embed, false);
  const others = db.prepare("SELECT features_json FROM plans WHERE name != 'Premium'").all();
  assert.ok(others.every(row => JSON.parse(row.features_json).booking_embed === undefined));
  db.prepare(`UPDATE plans SET features_json = '{"payments":true,"reports":"full_pdf","marketing":"included","booking_embed":true}' WHERE name = 'Premium'`).run();
});
