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
  assert.match(html, /<html lang="pt" data-layout="novo" data-embed="1" data-sp-theme="light"[^>]*>/);
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

// ── Aspeto (embed_style) ─────────────────────────────────────────────────
const htmlTag = html => /<html [^>]*>/.exec(html)?.[0] || '';
const embedStyle = require('../services/embedStyle');

test('aspeto: lista fechada de opções, cores #RRGGBB, campos desconhecidos recusados', () => {
  const ok = embedStyle.normalizeStyle({ theme: 'dark', font: 'jost', corners: 'square', accent: '#85391F', uppercaseLabels: true, startAtDates: true });
  assert.deepEqual(ok, { theme: 'dark', font: 'Jost', corners: 'square', accent: '#85391f', uppercaseLabels: true, startAtDates: true });
  // Parcial: o resto fica como estava.
  assert.deepEqual(embedStyle.normalizeStyle({ theme: 'light' }, ok), { ...ok, theme: 'light' });
  assert.equal(embedStyle.normalizeStyle({ accent: '#abc' }).accent, '#aabbcc');
  assert.deepEqual(embedStyle.normalizeStyle({}), embedStyle.DEFAULT_STYLE);
  for (const bad of [
    { theme: 'neon' }, { theme: ['dark'] }, { font: 'Comic Sans MS' }, { font: "Jost'; } body { color: red" }, { font: 'Arial' },
    { corners: 'round' }, { accent: 'red' }, { accent: '#85391F; background:url(x)' }, { accent: 'rgb(1,2,3)' }, { accent: '#12345' },
    { uppercaseLabels: 'sim' }, { startAtDates: 'true' }, { startAtDates: 1 }, { css: 'body{}' }, { __proto__x: 1 },
  ]) assert.throws(() => embedStyle.normalizeStyle(bad), err => err.status === 400, JSON.stringify(bad));
  for (const bad of [null, 'dark', ['dark'], 3]) assert.throws(() => embedStyle.normalizeStyle(bad), err => err.status === 400);
});

test('aspeto: o que o carregador deteta só passa se for válido; automático usa-o, escolhido ganha', () => {
  const detected = embedStyle.detectedFromQuery({ sp_theme: 'dark', sp_bg: '151719', sp_font: 'Jost,sans-serif', sp_hfont: 'Fonte Esquisita,serif',
    sp_accent: '85391F', sp_radius: '0', sp_upper: '1' });
  assert.deepEqual(detected, { theme: 'dark', bg: '#151719', font: { family: 'Jost', generic: 'sans-serif' }, headingFont: { family: null, generic: 'serif' },
    accent: '#85391f', radius: 0, uppercase: true });
  assert.deepEqual(embedStyle.detectedFromQuery({ sp_theme: 'x', sp_bg: 'zzz', sp_font: '"><script>', sp_accent: 'url(x)', sp_radius: '-1', sp_upper: 'yes', sp_hfont: ['a'] }), {});
  const auto = embedStyle.resolveStyle(embedStyle.DEFAULT_STYLE, detected, '#2266aa');
  assert.equal(auto.theme, 'dark');
  assert.equal(auto.corners, 'square');
  assert.equal(auto.accent, '#85391f');
  assert.equal(auto.uppercase, true);
  assert.equal(auto.surface, '#151719');
  assert.ok(embedStyle.contrast(auto.accentInk, '#151719') >= 4.5, auto.accentInk);
  assert.ok(embedStyle.contrast(auto.onAccent, auto.accent) >= 4.5);
  const chosen = embedStyle.resolveStyle({ ...embedStyle.DEFAULT_STYLE, theme: 'light', corners: 'rounded', accent: '#f5d000', font: 'platform', uppercaseLabels: false }, detected, '#2266aa');
  assert.equal(chosen.theme, 'light');
  assert.equal(chosen.corners, 'rounded');
  assert.equal(chosen.accent, '#f5d000');
  assert.equal(chosen.font, null);
  assert.equal(chosen.uppercase, false);
  assert.ok(embedStyle.contrast(chosen.accentInk, '#fffdf9') >= 4.5, chosen.accentInk);
  assert.equal(chosen.onAccent, '#111111');
  // Sem nada detetado (iframe simples): claro, arredondado, cor da conta.
  const plain = embedStyle.resolveStyle(embedStyle.DEFAULT_STYLE, {}, '#2266aa');
  assert.deepEqual([plain.theme, plain.corners, plain.accent, plain.uppercase, plain.font], ['light', 'rounded', '#2266aa', false, null]);
});

test('aspeto: GET/PUT só o proprietário, Premium, compatível com pedidos antigos e registado', async () => {
  for (const cookie of [manager, staff]) assert.equal((await call(cookie, 'PUT', '/api/embed/settings', { style: { theme: 'dark' } })).status, 403);
  const first = await (await get('/api/embed/settings', owner)).json();
  assert.deepEqual(first.data.style, embedStyle.DEFAULT_STYLE);
  assert.deepEqual(first.data.style_options.fonts, embedStyle.CHOICE_FONTS);
  assert.equal(first.data.default_accent, '#843424');

  const style = { theme: 'dark', font: 'Jost', corners: 'square', accent: '#85391f', uppercaseLabels: true, startAtDates: true };
  const saved = await call(owner, 'PUT', '/api/embed/settings', { style });
  assert.equal(saved.status, 200);
  const body = await saved.json();
  assert.deepEqual(body.data.style, style);
  assert.deepEqual(settings.getJson(premium.id, 'embed_style'), style);
  const audit = db.prepare("SELECT meta FROM audit_events WHERE organization_id = ? AND action = 'settings.embed_style_changed' ORDER BY rowid DESC").get(premium.id);
  assert.deepEqual(JSON.parse(audit.meta).after, style);

  // Inválido: 400 e nada muda (nem as origens que vierem no mesmo pedido).
  const origins = embed.storedOrigins(premium.id);
  const bad = await call(owner, 'PUT', '/api/embed/settings', { origins: ['https://outro.pt'], style: { accent: 'javascript:alert(1)' } });
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /#RRGGBB/);
  assert.deepEqual(embed.storedOrigins(premium.id), origins);
  assert.deepEqual(embedStyle.storedStyle(premium.id), style);

  // Pedido antigo (só origens) não mexe no aspeto.
  assert.equal((await call(owner, 'PUT', '/api/embed/settings', { origins: ['https://www.cliente.pt'] })).status, 200);
  assert.deepEqual(embedStyle.storedStyle(premium.id), style);
  assert.equal((await call(owner, 'PUT', '/api/embed/settings', {})).status, 400);

  // Sem a funcionalidade no pacote: não grava.
  const denied = await call(ownerEssencial, 'PUT', '/api/embed/settings', { style: { theme: 'dark' } });
  assert.equal(denied.status, 403);
  assert.equal(settings.get(essencial.id, 'embed_style'), null);

  // Valor estragado na base de dados: volta a «Automático» campo a campo.
  settings.set(semPacote.id, 'embed_style', { theme: 'dark', accent: 'url(javascript:x)', font: '</style><script>', corners: 7 });
  assert.deepEqual(embedStyle.storedStyle(semPacote.id), { ...embedStyle.DEFAULT_STYLE, theme: 'dark' });
  settings.set(semPacote.id, 'embed_style', 'não é JSON');
  assert.deepEqual(embedStyle.storedStyle(semPacote.id), embedStyle.DEFAULT_STYLE);
});

test('aspeto: atributos no <html> só da página incorporada; valores de fora nunca chegam ao HTML', async () => {
  settings.set(premium.id, 'embed_origins', ['https://www.cliente.pt']);
  embedStyle.saveStyle(premium.id, { theme: 'dark', font: 'Jost', corners: 'square', accent: '#85391f', uppercaseLabels: true, startAtDates: true });
  const html = await (await get('/reservar/casa-premium?embed=1')).text();
  const tag = htmlTag(html);
  assert.match(tag, /data-embed="1"/);
  assert.match(tag, /data-sp-theme="dark"/);
  assert.match(tag, /data-sp-corners="square"/);
  assert.match(tag, /data-sp-upper="1"/);
  assert.match(tag, /data-sp-start="datas"/);
  assert.match(tag, /--sp-accent:#85391f/);
  assert.match(tag, /--sp-font:'Jost', system-ui, sans-serif/);
  assert.match(html, /<link rel="stylesheet" href="\/css\/public-embed\.css\?v=[^"]+">/);
  assert.match(html, /<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/css2\?family=Jost:wght@400;500;600&amp;display=swap">/);

  // Página normal: igual a antes (sem atributos, sem a folha, sem letras).
  const normal = await (await get('/reservar/casa-premium')).text();
  assert.equal(htmlTag(normal), '<html lang="pt" data-layout="novo">');
  assert.doesNotMatch(normal, /public-embed\.css|data-sp-|fonts\.googleapis\.com\/css2\?family=Jost/);
  // ?embed=1 com parâmetros sp_* na página normal: ignorados.
  assert.equal(htmlTag(await (await get('/reservar/casa-premium?sp_theme=dark&sp_accent=000000')).text()), '<html lang="pt" data-layout="novo">');

  // Automático: segue o que o carregador detetou; lixo nos parâmetros é ignorado.
  embedStyle.saveStyle(premium.id, { ...embedStyle.DEFAULT_STYLE });
  const evil = encodeURIComponent('"><script>alert(1)</script>');
  const detectedHtml = await (await get(`/reservar/casa-premium?embed=1&sp_theme=dark&sp_bg=151719&sp_font=Jost%2Csans-serif&sp_hfont=${evil}&sp_accent=${evil}&sp_radius=0&sp_upper=1`)).text();
  const auto = htmlTag(detectedHtml);
  assert.match(auto, /data-sp-theme="dark"/);
  assert.match(auto, /data-sp-corners="square"/);
  assert.match(auto, /--sp-accent:#843424/);
  assert.match(auto, /--sp-surface:#151719/);
  assert.doesNotMatch(detectedHtml, /<script>alert|alert\(1\)/);
  const xss = await (await get(`/reservar/casa-premium?embed=1&sp_font=${evil}&sp_theme=${evil}&sp_radius=${evil}`)).text();
  assert.doesNotMatch(xss, /<script>alert|alert\(1\)/);
  assert.match(htmlTag(xss), /data-sp-theme="light"/);
});

test('aspeto: o detetado fica guardado para o proprietário só quando vem de um site autorizado', async () => {
  db.prepare("DELETE FROM organization_settings WHERE organization_id = ? AND key = 'embed_detected'").run(premium.id);
  const q = '/reservar/casa-premium?embed=1&sp_theme=dark&sp_bg=151719&sp_font=Jost%2Csans-serif&sp_accent=85391f&sp_radius=0&sp_upper=1';
  await fetch(base + q, { headers: { 'X-Forwarded-For': nextIp(), Referer: 'https://intruso.pt/' } });
  assert.equal(embedStyle.storedDetected(premium.id), null);
  await fetch(base + q, { headers: { 'X-Forwarded-For': nextIp(), Referer: 'https://www.cliente.pt/' } });
  const seen = embedStyle.storedDetected(premium.id);
  assert.equal(seen.origin, 'https://www.cliente.pt');
  assert.deepEqual(seen.values, { theme: 'dark', bg: '#151719', font: { family: 'Jost', generic: 'sans-serif' }, accent: '#85391f', radius: 0, uppercase: true });
  const { data } = await (await get('/api/embed/settings', owner)).json();
  assert.equal(data.detected.origin, 'https://www.cliente.pt');
  assert.equal(data.detected.values.accent, '#85391f');
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
