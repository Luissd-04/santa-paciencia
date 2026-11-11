// Totais de utilização (POST /api/telemetry), resumo diário da plataforma
// (tarefa platform_stats), leitura do User-Agent e a página /plataforma.
// App real com SQLite em memória.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-usage-'));
const frontend = path.join(temp, 'frontend');
fs.mkdirSync(frontend);
fs.writeFileSync(path.join(frontend, 'index.html'), '<!doctype html><title>app</title>');
fs.writeFileSync(path.join(frontend, 'plataforma.html'), '<!doctype html><title>consola</title>');
const previous = process.cwd();
process.chdir(temp);
Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test', EMAIL_ENABLED: 'false', TRUST_PROXY: 'loopback', FRONTEND_PATH: frontend });
const app = require('../app');
const { db } = require('../config/database');
const auth = require('../services/authService');
const orgs = require('../services/orgService');
const { localDay, addDays, zonedDateTime } = require('../services/dates');
const { parseUserAgent } = require('../services/userAgent');
const { deviceLabelFromUA } = require('../services/pushService');
let server, base;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.on('listening', resolve); server.on('error', reject); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server?.close(); db.close(); process.chdir(previous); fs.rmSync(temp, { recursive: true, force: true }); });

const orgA = orgs.createOrganization('Uso A');
const orgB = orgs.createOrganization('Uso B');
let seq = 0;
function person(org, role = 'staff') {
  const user = auth.createUser({ name: `p${++seq}`, email: `p${seq}@example.invalid`, password: 'SyntheticUser123!' });
  orgs.createMembership({ organizationId: org.id, userId: user.id, role });
  return { user, session: auth.createSession(user.id, org.id).sessionId };
}
const a1 = person(orgA);
const b1 = person(orgB);

const send = (who, body, ip = '203.0.113.7') => fetch(base + '/api/telemetry', {
  method: 'POST', body: JSON.stringify(body),
  headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip, ...(who ? { Cookie: `${auth.SESSION_COOKIE}=${who.session}` } : {}) },
});
const counts = org => Object.fromEntries(db.prepare('SELECT view, count FROM usage_daily WHERE organization_id = ? AND day = ?')
  .all(org.id, localDay()).map(r => [r.view, r.count]));
const reset = () => db.prepare('DELETE FROM usage_daily').run();

test('a soma acumula no dia local da organização da sessão (204, sem utilizador nem IP)', async () => {
  reset();
  assert.equal((await send(a1, { views: { reservas: 3, dashboard: 1 } })).status, 204);
  assert.equal((await send(a1, { views: { reservas: 2 } })).status, 204);
  assert.deepEqual(counts(orgA), { reservas: 5, dashboard: 1 });
  const columns = db.pragma('table_info(usage_daily)').map(c => c.name);
  assert.deepEqual(columns, ['organization_id', 'day', 'view', 'count']);
});

test('vistas desconhecidas (e a da consola) são ignoradas', async () => {
  reset();
  assert.equal((await send(a1, { views: { inventada: 4, plataforma: 2, '__proto__': 1, eventos: 1 } })).status, 204);
  assert.deepEqual(counts(orgA), { eventos: 1 });
});

test('limites: n entre 1 e 50, no máximo 30 vistas, corpo tem de ser um objeto', async () => {
  reset();
  assert.equal((await send(a1, { views: { reservas: 500, calendario: 0, hospedes: -3, despesas: 1.5, vouchers: '7', precos: 50 } })).status, 204);
  assert.deepEqual(counts(orgA), { reservas: 50, precos: 50 });
  const many = Object.fromEntries(Array.from({ length: 31 }, (_, i) => [`v${i}`, 1]));
  assert.equal((await send(a1, { views: many })).status, 400);
  assert.equal((await send(a1, { views: [1, 2] })).status, 400);
  assert.equal((await send(a1, {})).status, 400);
});

test('a sessão grava o display_mode e ignora valores fora da lista', async () => {
  const mode = () => db.prepare('SELECT display_mode FROM auth_sessions WHERE id = ?').get(auth.digestToken(a1.session)).display_mode;
  assert.equal(mode(), null);
  assert.equal((await send(a1, { views: {}, display_mode: 'standalone' })).status, 204);
  assert.equal(mode(), 'standalone');
  assert.equal((await send(a1, { views: {}, display_mode: 'fullscreen' })).status, 204);
  assert.equal(mode(), 'standalone');
  assert.equal((await send(a1, { views: {}, display_mode: 'browser' })).status, 204);
  assert.equal(mode(), 'browser');
});

test('sem sessão dá 401', async () => {
  assert.equal((await send(null, { views: { reservas: 1 } })).status, 401);
});

test('outra organização não se mistura', async () => {
  reset();
  await send(a1, { views: { reservas: 2 } });
  await send(b1, { views: { reservas: 7, despesas: 1 } });
  assert.deepEqual(counts(orgA), { reservas: 2 });
  assert.deepEqual(counts(orgB), { reservas: 7, despesas: 1 });
});

test('não dispara avisos em direto às páginas abertas', async () => {
  const listener = person(orgA);
  const controller = new AbortController();
  const live = await fetch(base + '/api/live', { headers: { Cookie: `${auth.SESSION_COOKIE}=${listener.session}` }, signal: controller.signal });
  const reader = live.body.getReader();
  let text = '';
  const reading = (async () => { try { for (;;) { const { value, done } = await reader.read(); if (done) break; text += Buffer.from(value).toString(); } } catch { /* abortado */ } })();
  assert.equal((await send(a1, { views: { reservas: 1 } })).status, 204);
  await new Promise(resolve => setTimeout(resolve, 600));
  controller.abort();
  await reading;
  assert.match(text, /event: ready/);
  assert.doesNotMatch(text, /event: change/);
});

test('rate limit: 60 por minuto por sessão', async () => {
  const who = person(orgA);
  let status;
  for (let i = 0; i < 61; i++) status = (await send(who, { views: {} })).status;
  assert.equal(status, 429);
  // Outra sessão não é afetada.
  assert.equal((await send(person(orgA), { views: {} })).status, 204);
});

test('tarefa platform_stats: active_users, sessões, reservas de hoje e de ontem, e limpeza a 400 dias', async () => {
  const today = localDay();
  const yesterday = addDays(today, -1);
  const at = (day, time) => zonedDateTime(day, time).toISOString().slice(0, 19).replace('T', ' ');
  const touch = (who, when) => db.prepare('UPDATE auth_sessions SET last_seen_at = ? WHERE id = ?').run(when, auth.digestToken(who.session));
  const active = (who, day) => db.prepare('INSERT OR IGNORE INTO daily_activity (organization_id, day, user_id) VALUES (?, ?, ?)').run(org.id, day, who.user.id);
  // Organização à parte para contas limpas.
  const org = orgs.createOrganization('Estatísticas');
  const p1 = person(org), p2 = person(org), p3 = person(org), gone = person(org);
  const p1b = { session: auth.createSession(p1.user.id, org.id).sessionId };
  touch(p1, at(today, '09:00'));
  touch(p1b, at(today, '10:30')); // mesma pessoa, duas sessões: 1 utilizador, 2 sessões
  touch(p2, at(today, '00:10'));
  touch(p3, at(yesterday, '23:50'));
  touch(gone, at(today, '11:00'));
  for (const who of [p1, p2, gone]) active(who, today);
  active(p3, yesterday);
  db.prepare('UPDATE memberships SET active = 0 WHERE organization_id = ? AND user_id = ?').run(org.id, gone.user.id);
  db.prepare("INSERT INTO guests (id, organization_id, name, email) VALUES ('g-stats', ?, 'Sintético', 'g@example.invalid')").run(org.id);
  db.prepare(`INSERT INTO accommodations (id, organization_id, name, type, price_per_night, max_guests, public_slug, min_nights)
    VALUES ('u-stats', ?, 'Unidade', 'alojamento', 100, 4, 'u-stats', 1)`).run(org.id);
  const reservation = (id, when) => db.prepare(`INSERT INTO reservations
    (id, organization_id, guest_id, accommodation_id, check_in, check_out, nights, num_guests, total_amount, status, created_at)
    VALUES (?, ?, 'g-stats', 'u-stats', '2034-01-01', '2034-01-02', 1, 1, 100, 'cancelada', ?)`).run(id, org.id, when);
  reservation('r-hoje', at(today, '08:00'));
  reservation('r-hoje-iso', zonedDateTime(today, '23:30').toISOString()); // ISO também conta
  reservation('r-ontem', at(yesterday, '20:00'));
  db.prepare("INSERT INTO usage_daily VALUES (?, ?, 'reservas', 3)").run(org.id, addDays(today, -401));
  db.prepare("INSERT INTO usage_daily VALUES (?, ?, 'reservas', 3)").run(org.id, addDays(today, -400));
  db.prepare('INSERT INTO platform_daily_stats (day, organization_id) VALUES (?, ?)').run(addDays(today, -401), org.id);

  assert.equal(await require('../services/scheduledTasks').runTask('platform_stats'), 'ok');
  const row = day => db.prepare('SELECT * FROM platform_daily_stats WHERE organization_id = ? AND day = ?').get(org.id, day);
  assert.equal(row(today).active_users, 2);
  assert.equal(row(today).sessions_active, 4); // inclui a sessão de quem saiu da equipa, não a pessoa
  assert.equal(row(today).reservations_created, 2);
  assert.equal(row(yesterday).reservations_created, 1);
  assert.equal(row(today).open_problems, 0);
  assert.equal(row(yesterday).active_users, 1);
  assert.equal(row(yesterday).sessions_active, 1);
  assert.equal(row(yesterday).open_problems, null);

  // Ontem nunca desce: a pessoa de ontem voltou hoje, mas o dia de ontem já a contou.
  touch(p3, at(today, '12:00'));
  active(p3, today);
  await require('../services/scheduledTasks').runTask('platform_stats');
  assert.equal(row(yesterday).active_users, 1);
  assert.equal(row(today).active_users, 3);

  assert.deepEqual(db.prepare('SELECT day FROM usage_daily WHERE organization_id = ?').all(org.id).map(r => r.day), [addDays(today, -400)]);
  assert.equal(row(addDays(today, -401)), undefined);
  // As outras organizações também têm linha de hoje.
  assert.ok(db.prepare('SELECT 1 FROM platform_daily_stats WHERE organization_id = ? AND day = ?').get(orgB.id, today));
});

test('atividade no acesso: quem entra e sai conta no dia, uma vez por pessoa, sem misturar organizações', async () => {
  const today = localDay();
  const org = orgs.createOrganization('Atividade');
  const other = orgs.createOrganization('Atividade B');
  const rows = id => db.prepare('SELECT user_id FROM daily_activity WHERE organization_id = ? AND day = ?').all(id, today);
  const stats = id => db.prepare('SELECT active_users FROM platform_daily_stats WHERE organization_id = ? AND day = ?').get(id, today)?.active_users;
  // Entra (login pela API) e sai logo, entre duas passagens da tarefa.
  const p = person(org);
  const login = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: p.user.email, password: 'SyntheticUser123!' }) });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(base + '/auth/logout', { method: 'POST', headers: { Cookie: cookie } })).status, 200);
  assert.equal(db.prepare('SELECT 1 FROM auth_sessions WHERE id = ?').get(auth.digestToken(cookie.split('=')[1])), undefined);
  assert.deepEqual(rows(org.id).map(r => r.user_id), [p.user.id]);
  // A mesma pessoa noutra sessão e muitos pedidos: uma linha só.
  for (let i = 0; i < 3; i++) auth.getSessionUser(p.session);
  // Uma escrita por sessão e por dia: a cache em memória não volta a escrever.
  db.prepare('DELETE FROM daily_activity WHERE organization_id = ?').run(org.id);
  auth.getSessionUser(p.session);
  assert.deepEqual(rows(org.id), []);
  db.prepare('INSERT INTO daily_activity VALUES (?, ?, ?)').run(org.id, today, p.user.id);
  // A mesma pessoa na outra organização conta lá, não aqui.
  orgs.createMembership({ organizationId: other.id, userId: p.user.id, role: 'staff' });
  auth.getSessionUser(auth.createSession(p.user.id, other.id).sessionId);
  auth.getSessionUser(person(other).session);
  assert.equal(rows(org.id).length, 1);
  assert.equal(rows(other.id).length, 2);
  require('../services/usageTelemetry').refreshDailyStats();
  assert.equal(stats(org.id), 1);
  assert.equal(stats(other.id), 2);
  // Nunca desce: sem linhas, fica o valor já visto.
  db.prepare('DELETE FROM daily_activity WHERE organization_id = ?').run(other.id);
  require('../services/usageTelemetry').refreshDailyStats();
  assert.equal(stats(other.id), 2);
  // Retenção de 400 dias, como usage_daily.
  db.prepare('INSERT INTO daily_activity VALUES (?, ?, ?)').run(org.id, addDays(today, -401), p.user.id);
  db.prepare('INSERT INTO daily_activity VALUES (?, ?, ?)').run(org.id, addDays(today, -400), p.user.id);
  require('../services/usageTelemetry').refreshDailyStats();
  assert.deepEqual(db.prepare('SELECT day FROM daily_activity WHERE organization_id = ? ORDER BY day').all(org.id).map(r => r.day), [addDays(today, -400), today]);
  // Apagar a organização apaga a atividade.
  db.prepare('DELETE FROM organizations WHERE id = ?').run(other.id);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM daily_activity WHERE organization_id = ?').get(other.id).n, 0);
});

test('login e troca de espaço gravam o display_mode; valores fora da lista ficam vazios', async () => {
  const org = orgs.createOrganization('Modo');
  const second = orgs.createOrganization('Modo B');
  const p = person(org);
  orgs.createMembership({ organizationId: second.id, userId: p.user.id, role: 'staff' });
  const mode = cookie => db.prepare('SELECT display_mode FROM auth_sessions WHERE id = ?').get(auth.digestToken(cookie.split('=')[1])).display_mode;
  const login = async display_mode => {
    const r = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: p.user.email, password: 'SyntheticUser123!', display_mode }) });
    assert.equal(r.status, 200);
    return r.headers.get('set-cookie').split(';')[0];
  };
  assert.equal(mode(await login('standalone')), 'standalone');
  assert.equal(mode(await login('browser')), 'browser');
  assert.equal(mode(await login('fullscreen')), null);
  assert.equal(mode(await login(undefined)), null);
  const switched = await fetch(base + '/auth/switch-org', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: await login('browser') },
    body: JSON.stringify({ organization_id: second.id, display_mode: 'standalone' }) });
  assert.equal(switched.status, 200);
  assert.equal(mode(switched.headers.get('set-cookie').split(';')[0]), 'standalone');
});

test('a consola envia só o modo: views vazio e display_mode dão 204 sem contar vistas', async () => {
  const who = person(orgA);
  reset();
  assert.equal((await send(who, { views: {}, display_mode: 'standalone' })).status, 204);
  assert.equal(db.prepare('SELECT display_mode FROM auth_sessions WHERE id = ?').get(auth.digestToken(who.session)).display_mode, 'standalone');
  assert.deepEqual(counts(orgA), {});
});

test('parseUserAgent acerta user agents reais', () => {
  const cases = [
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      { browser: 'Chrome', os: 'Windows', device: 'desktop' }],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
      { browser: 'Edge', os: 'Windows', device: 'desktop' }],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
      { browser: 'Safari', os: 'macOS', device: 'desktop' }],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
      { browser: 'Safari', os: 'iOS', device: 'mobile' }],
    ['Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
      { browser: 'Chrome', os: 'Android', device: 'mobile' }],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1',
      { browser: 'Chrome', os: 'iOS', device: 'mobile' }],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
      { browser: 'Firefox', os: 'Windows', device: 'desktop' }],
    ['Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
      { browser: 'Samsung Internet', os: 'Android', device: 'mobile' }],
    ['Mozilla/5.0 (iPad; CPU OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
      { browser: 'Safari', os: 'iPadOS', device: 'tablet' }],
    ['Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      { browser: 'Chrome', os: 'Android', device: 'tablet' }],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0', { browser: 'Firefox', os: 'Linux', device: 'desktop' }],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
      { browser: 'Outro', os: 'iOS', device: 'mobile' }],
    ['', { browser: 'Outro', os: 'Outro', device: 'desktop' }],
  ];
  for (const [ua, expected] of cases) assert.deepEqual(parseUserAgent(ua), expected, ua);
  assert.deepEqual(parseUserAgent(undefined), { browser: 'Outro', os: 'Outro', device: 'desktop' });
});

test('o nome dos dispositivos push continua igual e usa a mesma leitura', () => {
  assert.equal(deviceLabelFromUA('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'), 'iPhone');
  assert.equal(deviceLabelFromUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15'), 'Mac · Safari');
  assert.equal(deviceLabelFromUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0'), 'Windows · Edge');
  assert.equal(deviceLabelFromUA('Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'), 'Android · Chrome');
  // O Chrome no iPhone era lido como Safari.
  assert.equal(deviceLabelFromUA('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1'), 'iPhone · Chrome');
  assert.equal(deviceLabelFromUA(''), 'Dispositivo');
});

test('/plataforma e /plataforma/* servem plataforma.html; sem o ficheiro, 404', async () => {
  for (const url of ['/plataforma', '/plataforma/organizacoes/x']) {
    const r = await fetch(base + url);
    assert.equal(r.status, 200, url);
    assert.match(await r.text(), /consola/);
  }
  assert.match(await (await fetch(base + '/reservas')).text(), /app/);
  fs.rmSync(path.join(frontend, 'plataforma.html'));
  assert.equal((await fetch(base + '/plataforma')).status, 404);
});

test('a migração é idempotente', () => {
  require('../config/migrations').runMigrations(db);
  assert.ok(db.pragma('table_info(auth_sessions)').some(c => c.name === 'display_mode'));
  assert.throws(() => db.prepare("UPDATE auth_sessions SET display_mode = 'outro'").run(), /CHECK/);
});
