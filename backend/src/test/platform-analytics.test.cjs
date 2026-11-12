// Consola da plataforma: tendências, utilização, ficha da organização e auditoria.
// Só metadados. Serviço chamado diretamente e rotas pelo HTTP, com SQLite em memória.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-platform-analytics-'));
const previous = process.cwd();
process.chdir(temp);
Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test', EMAIL_ENABLED: 'false', TRUST_PROXY: 'loopback',
  PLATFORM_ADMIN_EMAILS: 'dono@example.invalid' });
const app = require('../app');
const { db } = require('../config/database');
const auth = require('../services/authService');
const orgs = require('../services/orgService');
const analytics = require('../services/platformAnalytics');
const platform = require('../services/platformService');
const { recordPlatformAudit } = require('../services/platformAccess');
const { localDay, addDays } = require('../services/dates');
let server, base;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.on('listening', resolve); server.on('error', reject); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server?.close(); db.close(); process.chdir(previous); fs.rmSync(temp, { recursive: true, force: true }); });

const PASSWORD = 'SyntheticOwner123!';
const UA = {
  chromeWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  safariIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  firefoxLinux: 'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0',
};
const alfa = orgs.createOrganization('Alfa');
const beta = orgs.createOrganization('Beta');
const gama = orgs.createOrganization('Gama');
const people = [];
function person(name, email, org, role) {
  const user = auth.createUser({ name, email, password: PASSWORD });
  orgs.createMembership({ organizationId: org.id, userId: user.id, role });
  const session = auth.createSession(user.id, org.id).sessionId;
  people.push({ name, email });
  return { user, session };
}
const owner = person('Dono Instância', 'dono@example.invalid', alfa, 'owner');
db.prepare('UPDATE users SET platform_admin = 1 WHERE id = ?').run(owner.user.id);
const regular = person('Gestora Normal', 'gestora@example.invalid', alfa, 'manager');
const s3 = person('Staff Alfa', 'staff.alfa@example.invalid', alfa, 'staff');
const b1 = person('Beta Um', 'beta1@example.invalid', beta, 'owner');
const g1 = person('Gama Um', 'gama1@example.invalid', gama, 'owner');
person('Gama Dois', 'gama2@example.invalid', gama, 'staff');
person('Gama Três', 'gama3@example.invalid', gama, 'staff');
person('Gama Quatro', 'gama4@example.invalid', gama, 'staff');
db.prepare('UPDATE memberships SET active = 0 WHERE user_id = (SELECT id FROM users WHERE email = ?)').run('gama3@example.invalid');

// Browser/dispositivo e «ativos» saem de tabelas diárias duráveis, não das sessões:
// as criadas acima (sem user agent) descartam-se e cada sessão regista o seu dia.
db.prepare('DELETE FROM platform_device_daily').run();
function setSession(who, org, ua, mode, ageDays) {
  db.prepare(`UPDATE auth_sessions SET user_agent = ?, display_mode = ?, last_seen_at = datetime('now', ?) WHERE id = ?`)
    .run(ua, mode, `-${ageDays} days`, auth.digestToken(who.session));
  const day = localDay(new Date(), -ageDays);
  require('../services/deviceDaily').recordSession({ organizationId: org.id, userAgent: ua, displayMode: mode, day });
  db.prepare('INSERT OR IGNORE INTO daily_activity (organization_id, day, user_id) VALUES (?, ?, ?)').run(org.id, day, who.user.id);
}
setSession(owner, alfa, UA.chromeWin, 'browser', 0);
setSession(regular, alfa, UA.safariIphone, 'standalone', 3);
setSession(s3, alfa, UA.chromeWin, null, 20);
setSession(b1, beta, UA.firefoxLinux, 'browser', 10);
setSession(g1, gama, UA.chromeWin, 'browser', 60); // fora dos 30 dias
// As restantes pessoas da Gama não contam nos totais do período.
db.prepare("UPDATE auth_sessions SET last_seen_at = datetime('now', '-90 days') WHERE user_agent IS NULL").run();

const GUEST_NAME = 'Hóspede Reservado Silva';
db.prepare("INSERT INTO accommodations (id, organization_id, name, type) VALUES ('a1', ?, 'Casa', 'suite')").run(alfa.id);
db.prepare("INSERT INTO accommodations (id, organization_id, name, type) VALUES ('b1', ?, 'Casa', 'suite')").run(beta.id);
for (const o of [alfa, beta]) db.prepare('INSERT INTO guests (id, organization_id, name, email) VALUES (?,?,?,?)').run(`g-${o.id}`, o.id, GUEST_NAME, 'hospede@example.invalid');
let rid = 0;
function reservation(org, accId, createdAt) {
  db.prepare(`INSERT INTO reservations (id, organization_id, guest_id, accommodation_id, check_in, check_out, nights, num_guests, total_amount, status, created_at)
    VALUES (?,?,?,?,'2026-12-01','2026-12-03',2,2,10,'confirmada',?)`).run(`r${++rid}`, org.id, `g-${org.id}`, accId, createdAt);
}
const thisMonday = analytics.getTrends(4).weeks.at(-1);
// Alfa: 2 esta semana (formato SQLite e ISO), 1 na semana passada, 1 há 3 semanas; Beta: 1 esta semana.
reservation(alfa, 'a1', `${thisMonday} 12:00:00`);
reservation(alfa, 'a1', `${thisMonday}T13:00:00.000Z`);
reservation(alfa, 'a1', `${addDays(thisMonday, -7)} 12:00:00`);
reservation(alfa, 'a1', `${addDays(thisMonday, -21)} 12:00:00`);
reservation(beta, 'b1', `${thisMonday} 12:00:00`);

const call = (who, url) => fetch(base + '/api/platform' + url, { headers: { Cookie: `${auth.SESSION_COOKIE}=${who.session}`, 'X-Forwarded-For': '203.0.113.9' } });
const unlock = () => fetch(base + '/api/platform/unlock', { method: 'POST',
  headers: { Cookie: `${auth.SESSION_COOKIE}=${owner.session}`, 'Content-Type': 'application/json', 'X-Forwarded-For': '203.0.113.9' },
  body: JSON.stringify({ password: PASSWORD }) });

test('trends: semanas são segundas-feiras, por ordem, com o comprimento pedido', () => {
  const t = analytics.getTrends();
  assert.equal(t.weeks.length, 12);
  for (const w of t.weeks) assert.equal(new Date(`${w}T12:00:00Z`).getUTCDay(), 1);
  assert.deepEqual([...t.weeks].sort(), t.weeks);
  assert.equal(t.weeks.at(-1), thisMonday);
  assert.ok(thisMonday <= localDay() && localDay() < addDays(thisMonday, 7));
  assert.equal(t.weeks[1], addDays(t.weeks[0], 7));
  assert.equal(analytics.getTrends(1).weeks.length, 4);
  assert.equal(analytics.getTrends(999).weeks.length, 52);
  assert.equal(analytics.getTrends('x').weeks.length, 12);
});

test('trends: sem estatísticas diárias dá null e collecting_since null', () => {
  const t = analytics.getTrends();
  assert.deepEqual(t.active_organizations, Array(12).fill(null));
  assert.deepEqual(t.active_users, Array(12).fill(null));
  assert.deepEqual(t.incidents_open, Array(12).fill(null));
  assert.equal(t.collecting_since, null);
});

test('trends: reservas criadas por semana', () => {
  const t = analytics.getTrends();
  assert.equal(t.reservations_created.length, 12);
  assert.deepEqual(t.reservations_created.slice(-4), [1, 0, 1, 3]);
  assert.equal(t.reservations_created.slice(0, -4).every(n => n === 0), true);
});

test('trends: reservas à beira da meia-noite contam no dia local', () => {
  const tz = require('../services/dates').businessTimeZone();
  // 23:30 UTC do domingo anterior já é segunda em Lisboa no verão, mas não no inverno: usa o dia local calculado.
  const stamp = `${addDays(thisMonday, -1)} 23:30:00`;
  reservation(beta, 'b1', stamp);
  const expected = localDay(new Date(`${stamp.replace(' ', 'T')}Z`)) >= thisMonday ? 'esta' : 'anterior';
  const t = analytics.getTrends();
  assert.equal(t.reservations_created.at(-1), expected === 'esta' ? 4 : 3, tz);
  db.prepare('DELETE FROM reservations WHERE id = ?').run(`r${rid}`);
});

test('trends: estatísticas diárias (organizações ativas, pico de utilizadores e incidentes)', () => {
  const insert = db.prepare('INSERT INTO platform_daily_stats (day, organization_id, active_users, open_problems) VALUES (?,?,?,?)');
  const w1 = addDays(thisMonday, -14); // duas organizações, dois dias
  insert.run(w1, alfa.id, 2, 1); insert.run(w1, beta.id, 3, null);
  insert.run(addDays(w1, 2), alfa.id, 1, 0); insert.run(addDays(w1, 2), beta.id, 0, 2);
  insert.run(thisMonday, alfa.id, 0, null); // só zeros e NULL
  const t = analytics.getTrends();
  const at = w => t.weeks.indexOf(w);
  assert.equal(t.active_organizations[at(w1)], 2);
  assert.equal(t.active_users[at(w1)], 5);    // pico diário: 2+3 contra 1+0
  assert.equal(t.incidents_open[at(w1)], 2);  // max(1+null, 0+2)
  assert.equal(t.active_organizations[at(thisMonday)], 0);
  assert.equal(t.incidents_open[at(thisMonday)], null);
  assert.equal(t.active_users[at(addDays(thisMonday, -7))], null); // semana sem linhas
  assert.equal(t.collecting_since, w1);
});

test('usage: browsers, sistemas, dispositivos e modos só no período e de membros ativos', () => {
  const u = analytics.getUsage(30);
  assert.deepEqual(u.browsers, [{ name: 'Chrome', sessions: 2 }, { name: 'Firefox', sessions: 1 }, { name: 'Safari', sessions: 1 }]);
  assert.deepEqual(u.os.map(o => o.name).sort(), ['Linux', 'Windows', 'iOS']);
  assert.equal(u.os[0].name, 'Windows');
  assert.deepEqual(u.devices, { desktop: 3, mobile: 1, tablet: 0 });
  assert.deepEqual(u.display, { standalone: 1, browser: 2, unknown: 1 });
  assert.equal(analytics.getUsage(365).browsers.find(b => b.name === 'Chrome').sessions, 3);
});

test('usage: views somadas e só dentro do período', () => {
  const put = db.prepare('INSERT INTO usage_daily (organization_id, day, view, count) VALUES (?,?,?,?)');
  const today = localDay();
  put.run(alfa.id, today, 'calendar', 5); put.run(beta.id, today, 'calendar', 2);
  put.run(alfa.id, addDays(today, -1), 'guests', 4);
  put.run(alfa.id, addDays(today, -40), 'calendar', 100);
  assert.deepEqual(analytics.getUsage(30).views, [{ view: 'calendar', count: 7 }, { view: 'guests', count: 4 }]);
  assert.deepEqual(analytics.getUsage(1).views, [{ view: 'calendar', count: 7 }]);
  assert.deepEqual(analytics.getUsage(365).views[0], { view: 'calendar', count: 107 });
});

test('usage: buckets de equipa e totais por papel (só memberships ativas)', () => {
  const { team } = analytics.getUsage(30);
  // Alfa 3, Beta 1, Gama 3 ativos (um desativado).
  assert.deepEqual(team.sizes, [{ bucket: '1', organizations: 1 }, { bucket: '2-3', organizations: 2 }, { bucket: '4-6', organizations: 0 }, { bucket: '7+', organizations: 0 }]);
  assert.deepEqual(team.roles, { owner: 3, manager: 1, staff: 3 });
});

test('ficha da organização: team, usage e trend só dessa organização', () => {
  const a = platform.getOrganization(alfa.id);
  assert.deepEqual(a.team, { members: 3, roles: { owner: 1, manager: 1, staff: 1 }, active_7d: 2 });
  assert.deepEqual(a.usage.browsers, [{ name: 'Chrome', sessions: 2 }, { name: 'Safari', sessions: 1 }]);
  assert.deepEqual(a.usage.devices, { desktop: 2, mobile: 1, tablet: 0 });
  assert.deepEqual(a.usage.display, { standalone: 1, browser: 1, unknown: 1 });
  assert.deepEqual(a.usage.views, [{ view: 'calendar', count: 5 }, { view: 'guests', count: 4 }]);
  assert.equal(a.trend.weeks.length, 12);
  assert.deepEqual(a.trend.reservations_created.slice(-4), [1, 0, 1, 2]);
  const b = platform.getOrganization(beta.id);
  assert.deepEqual(b.team, { members: 1, roles: { owner: 1, manager: 0, staff: 0 }, active_7d: 0 });
  assert.deepEqual(b.usage.browsers, [{ name: 'Firefox', sessions: 1 }]);
  assert.deepEqual(b.usage.views, [{ view: 'calendar', count: 2 }]);
  assert.equal(b.trend.reservations_created.at(-1), 1);
  // A lista não muda de forma.
  assert.equal('team' in platform.listOrganizations()[0], false);
});

test('audit: mais recentes primeiro, paginação por before, sem ip nem user_id', () => {
  const ids = [];
  for (let i = 1; i <= 5; i++) {
    recordPlatformAudit({ userId: owner.user.id, action: `teste.${i}`, targetType: 'organization', targetId: alfa.id, details: i === 2 ? { n: i } : null, ip: '198.51.100.7' });
    ids.push(db.prepare('SELECT id FROM platform_audit_events WHERE action = ?').get(`teste.${i}`).id);
  }
  // Mesma data para todas: o desempate é a ordem de inserção.
  db.prepare("UPDATE platform_audit_events SET created_at = '2026-11-01T10:00:00.000Z'").run();
  const page1 = analytics.listAudit({ limit: 2 });
  assert.deepEqual(page1.map(e => e.action), ['teste.5', 'teste.4']);
  const page2 = analytics.listAudit({ limit: 2, before: page1.at(-1).id });
  assert.deepEqual(page2.map(e => e.action), ['teste.3', 'teste.2']);
  assert.deepEqual(page2[1].details, { n: 2 });
  assert.equal(page2[0].details, null);
  const page3 = analytics.listAudit({ limit: 2, before: page2.at(-1).id });
  assert.deepEqual(page3.map(e => e.action), ['teste.1']);
  assert.deepEqual(analytics.listAudit({ before: 'inexistente' }), []);
  assert.deepEqual(Object.keys(page1[0]).sort(), ['action', 'created_at', 'details', 'id', 'target_id', 'target_type']);
  assert.doesNotMatch(JSON.stringify(page1), /198\.51\.100\.7|user_id|"ip"/);
  assert.equal(analytics.listAudit({ limit: 0 }).length, 1);
});

test('nenhuma resposta contém user agents, emails nem nomes', () => {
  const blob = JSON.stringify([analytics.getTrends(), analytics.getUsage(365), platform.getOrganization(alfa.id), platform.getOrganization(beta.id), analytics.listAudit({ limit: 200 })]);
  for (const ua of Object.values(UA)) assert.equal(blob.includes(ua), false);
  assert.equal(blob.includes('Mozilla'), false);
  for (const p of people) { assert.equal(blob.includes(p.email), false, p.email); assert.equal(blob.includes(p.name), false, p.name); }
  assert.equal(blob.includes(GUEST_NAME), false);
  assert.equal(blob.includes('hospede@example.invalid'), false);
});

test('rotas: 404 a não-admin, 423 sem desbloqueio, 200 depois e o contrato da forma', async () => {
  const urls = ['/trends', '/usage', '/audit'];
  for (const url of urls) {
    const r = await call(regular, url);
    assert.equal(r.status, 404, url);
  }
  for (const url of urls) assert.equal((await call(owner, url)).status, 423, url);
  assert.equal((await unlock()).status, 200);
  for (const url of urls) {
    const r = await call(owner, url);
    assert.equal(r.status, 200, url);
    assert.equal((await r.json()).success, true);
  }
  const trends = (await (await call(owner, '/trends?weeks=6')).json()).data;
  assert.equal(trends.weeks.length, 6);
  const usage = (await (await call(owner, '/usage?days=30')).json()).data;
  assert.deepEqual(Object.keys(usage).sort(), ['browsers', 'devices', 'display', 'os', 'team', 'views']);
  const audit = (await (await call(owner, '/audit?limit=2')).json()).data;
  assert.equal(audit.length, 2);
  assert.ok(audit[0].created_at >= audit[1].created_at);
  const page = (await (await call(owner, `/audit?limit=2&before=${audit[1].id}`)).json()).data;
  assert.equal(page.some(e => audit.some(a => a.id === e.id)), false);
  const org = (await (await call(owner, `/organizations/${alfa.id}`)).json()).data;
  assert.ok(org.team && org.usage && org.trend);
});

test('terminar sessão não altera ativos nem browsers: vêm de tabelas diárias duráveis', () => {
  const before = { usage: analytics.getUsage(30), org: platform.getOrganization(alfa.id) };
  for (const who of [owner, regular, s3, b1]) auth.deleteSession(who.session);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM auth_sessions WHERE user_id = ?').get(owner.user.id).n, 0);
  const after = { usage: analytics.getUsage(30), org: platform.getOrganization(alfa.id) };
  assert.deepEqual(after.usage.browsers, before.usage.browsers);
  assert.deepEqual(after.usage.devices, before.usage.devices);
  assert.equal(after.org.team.active_7d, 2);
  assert.deepEqual(after.org.usage.browsers, before.org.usage.browsers);
  // Nada em bruto na tabela: só grupos.
  const cols = db.pragma('table_info(platform_device_daily)').map(c => c.name);
  assert.deepEqual(cols, ['organization_id', 'day', 'browser', 'os', 'device', 'display_mode', 'sessions']);
});
