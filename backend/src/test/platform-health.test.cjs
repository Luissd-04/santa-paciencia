// Saúde dos clientes e «Precisa de atenção»: fórmula, risco, itens e rotas.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-platform-health-'));
const previous = process.cwd();
process.chdir(temp);
Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test', EMAIL_ENABLED: 'false', TRUST_PROXY: 'loopback',
  PLATFORM_ADMIN_EMAILS: 'dono@example.invalid' });
const app = require('../app');
const { db } = require('../config/database');
const auth = require('../services/authService');
const orgs = require('../services/orgService');
const health = require('../services/platformHealth');
const { localDay } = require('../services/dates');
let server, base;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.on('listening', resolve); server.on('error', reject); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server?.close(); db.close(); process.chdir(previous); fs.rmSync(temp, { recursive: true, force: true }); });

const PASSWORD = 'SyntheticOwner123!';
const alfa = orgs.createOrganization('Alfa');
const beta = orgs.createOrganization('Beta');
const gama = orgs.createOrganization('Gama');
function person(name, email, org, role) {
  const user = auth.createUser({ name, email, password: PASSWORD });
  orgs.createMembership({ organizationId: org.id, userId: user.id, role });
  return { user, session: auth.createSession(user.id, org.id).sessionId };
}
const owner = person('Dono Instância', 'dono@example.invalid', alfa, 'owner');
db.prepare('UPDATE users SET platform_admin = 1 WHERE id = ?').run(owner.user.id);
const regular = person('Gestora Normal', 'gestora@example.invalid', alfa, 'manager');

const iso = daysAgo => new Date(Date.now() - daysAgo * 86400000).toISOString();
db.prepare("INSERT INTO accommodations (id, organization_id, name, type) VALUES ('a1', ?, 'Casa', 'suite')").run(alfa.id);
db.prepare("INSERT INTO accommodations (id, organization_id, name, type) VALUES ('b1', ?, 'Casa', 'suite')").run(beta.id);
for (const o of [alfa, beta]) db.prepare('INSERT INTO guests (id, organization_id, name, email) VALUES (?,?,?,?)').run(`g-${o.id}`, o.id, 'Hóspede', 'h@example.invalid');
let rid = 0;
function reservation(org, acc, daysAgo) {
  db.prepare(`INSERT INTO reservations (id, organization_id, guest_id, accommodation_id, check_in, check_out, nights, num_guests, total_amount, status, created_at)
    VALUES (?,?,?,?,'2026-12-01','2026-12-03',2,2,10,'confirmada',?)`).run(`r${++rid}`, org.id, `g-${org.id}`, acc, iso(daysAgo));
}
// Alfa: ativa em 9 dos últimos 14 dias, reservas a subir, Gmail ligado.
for (let i = 0; i < 9; i++) db.prepare('INSERT INTO daily_activity (organization_id, day, user_id) VALUES (?,?,?)').run(alfa.id, localDay(new Date(), -i), owner.user.id);
for (const d of [1, 2, 3, 40]) reservation(alfa, 'a1', d);
db.prepare("INSERT INTO google_email_connections (organization_id, email, tokens) VALUES (?, 'x@example.invalid', 'opaco')").run(alfa.id);
db.prepare("INSERT INTO google_calendar_connections (organization_id, user_id, tokens) VALUES (?, ?, 'opaco')").run(alfa.id, owner.user.id);
// Beta: sem atividade, reservas a cair (3 antes, 0 agora), problema aberto e 2 pedidos.
for (const d of [30, 35, 45]) reservation(beta, 'b1', d);
db.prepare("INSERT INTO reservation_events (id, organization_id, reservation_id, type) VALUES ('ev1', ?, 'r5', 'created')").run(beta.id);
db.prepare("INSERT INTO reservation_event_effects (event_id, effect, state) VALUES ('ev1', 'guest_confirmation', 'failed')").run();
db.prepare("INSERT INTO ops_alerts (organization_id, key, notified_at) VALUES (?, 'effects_failed', '2026-11-01T10:00:00.000Z')").run(beta.id);
const ticket = (id, number, org, subject, hoursAgo, side = 'customer') => {
  db.prepare("INSERT INTO support_tickets (id, number, organization_id, type, subject, created_at, last_message_at) VALUES (?,?,?,'problem',?,?,?)")
    .run(id, number, org.id, subject, new Date(Date.now() - hoursAgo * 3600000).toISOString(), new Date(Date.now() - hoursAgo * 3600000).toISOString());
  db.prepare('INSERT INTO support_messages (id, ticket_id, side, body, created_at) VALUES (?,?,?,?,?)')
    .run(`m-${id}`, id, side, 'Texto privado do cliente', new Date(Date.now() - hoursAgo * 3600000).toISOString());
};
ticket('t1', 1, beta, 'Não envia emails', 50);
ticket('t2', 2, beta, 'Erro no calendário', 30);
ticket('t3', 3, gama, 'Recente', 2);
// Primeira resposta da plataforma ao t3, 1 h depois.
db.prepare("INSERT INTO support_messages (id, ticket_id, side, body, created_at) VALUES ('m-t3b', 't3', 'platform', 'ok', ?)").run(new Date(Date.now() - 1 * 3600000).toISOString());

const byOrg = () => new Map(health.getHealth().map(h => [h.organization_id, h]));

test('saúde: fórmula, fatores e risco por limites', () => {
  const h = byOrg();
  const a = h.get(alfa.id);
  assert.equal(a.factors.active_days_14, 9);
  assert.equal(a.factors.integrations_ok, 2);
  assert.equal(a.factors.open_problems, 0);
  assert.equal(a.score, 100); // 20 + 40 + 25 (sem período anterior) + 15
  assert.equal(a.risk, 'low');
  const b = h.get(beta.id);
  assert.equal(b.factors.active_days_14, 0);
  assert.equal(b.factors.reservations_trend, -100);
  assert.equal(b.factors.open_problems, 1);
  assert.equal(b.factors.open_tickets, 2);
  assert.equal(b.score, 0); // 20 + 0 + 0 + 0 - 10 - 10 => 0
  assert.equal(b.risk, 'high');
  const g = h.get(gama.id);
  assert.equal(g.score, 20 + 0 + 10 + 0 - 5); // sem reservas = 10; 1 pedido por resolver
  assert.equal(g.risk, 'high');
  assert.equal(health.riskOf(44), 'high');
  assert.equal(health.riskOf(45), 'medium');
  assert.equal(health.riskOf(69), 'medium');
  assert.equal(health.riskOf(70), 'low');
  for (const x of h.values()) assert.ok(x.score >= 0 && x.score <= 100);
});

test('saúde: ordenada por risco, pior primeiro', () => {
  const list = health.getHealth();
  assert.equal(list.at(-1).organization_id, alfa.id);
  const order = { high: 0, medium: 1, low: 2 };
  for (let i = 1; i < list.length; i++) assert.ok(order[list[i - 1].risk] <= order[list[i].risk]);
});

test('atenção: pedidos sem resposta, incidentes agrupados e risco alto', () => {
  const items = health.getAttention({ userId: owner.user.id });
  const kinds = items.map(i => i.kind);
  assert.ok(kinds.includes('incident'));
  assert.ok(items.length <= 8);
  const support = items.find(i => i.kind === 'support');
  assert.match(support.title, /^2 pedidos sem resposta há mais de 24 h$/); // t3 tem resposta e é recente
  assert.match(support.detail, /SP-0001 Beta/);
  assert.equal(support.href, '/plataforma/suporte');
  const incident = items.find(i => i.kind === 'incident');
  assert.equal(incident.tone, 'bad');
  assert.ok(items.some(i => i.kind === 'risk' && i.href === `/plataforma/clientes/${beta.id}`));
  assert.ok(kinds.indexOf('incident') < kinds.indexOf('support'));
  assert.ok(kinds.indexOf('support') < kinds.indexOf('risk'));
  assert.ok(!JSON.stringify(items).includes('Texto privado'));
});

test('atenção: tarefas só com a tabela, e só as do próprio admin', () => {
  assert.ok(!health.getAttention({ userId: owner.user.id }).some(i => i.kind === 'tasks'));
  db.exec(`CREATE TABLE IF NOT EXISTS platform_tasks (id TEXT PRIMARY KEY, title TEXT, status TEXT, assignee_user_id TEXT, due_date TEXT)`);
  const ins = db.prepare('INSERT INTO platform_tasks (id, title, status, assignee_user_id, due_date) VALUES (?,?,?,?,?)');
  ins.run('k1', 'Responder à proposta', 'todo', owner.user.id, localDay(new Date(), 3));
  ins.run('k2', 'Fora do prazo', 'todo', owner.user.id, localDay(new Date(), 20));
  ins.run('k3', 'Feita', 'done', owner.user.id, localDay(new Date(), 1));
  ins.run('k4', 'De outra pessoa', 'todo', regular.user.id, localDay(new Date(), 1));
  const task = health.getAttention({ userId: owner.user.id }).find(i => i.kind === 'tasks');
  assert.match(task.title, /^1 tarefa tua com prazo/);
  assert.equal(task.detail, 'Responder à proposta');
  assert.equal(task.href, '/plataforma/tarefas');
  db.exec('DROP TABLE platform_tasks');
});

test('atenção: alertas da instância por resolver', () => {
  const instance = require('../services/platformService').listIncidents().instance;
  const items = health.getAttention({ userId: owner.user.id }).filter(i => i.kind === 'instance');
  assert.equal(items.length, instance.length);
});

test('tempo até à primeira resposta', () => {
  const stats = health.getSupportStats();
  assert.equal(stats.answered_30d, 1);
  assert.equal(stats.avg_first_response_hours, 1);
});

const call = (who, url) => fetch(base + '/api/platform' + url, { headers: { Cookie: `${auth.SESSION_COOKIE}=${who.session}`, 'X-Forwarded-For': '203.0.113.9' } });

test('rotas: só o dono, com a consola desbloqueada', async () => {
  for (const url of ['/health', '/attention', '/support-stats']) assert.equal((await call(regular, url)).status, 404, url);
  for (const url of ['/health', '/attention', '/support-stats']) assert.equal((await call(owner, url)).status, 423, url);
  const unlock = await fetch(base + '/api/platform/unlock', { method: 'POST',
    headers: { Cookie: `${auth.SESSION_COOKIE}=${owner.session}`, 'Content-Type': 'application/json', 'X-Forwarded-For': '203.0.113.9' },
    body: JSON.stringify({ password: PASSWORD }) });
  assert.equal(unlock.status, 200);
  const h = await (await call(owner, '/health')).json();
  assert.equal(h.success, true);
  assert.equal(h.data.length, 3);
  assert.deepEqual(Object.keys(h.data[0]).sort(), ['factors', 'organization_id', 'risk', 'score']);
  for (const key of ['active_days_14', 'reservations_trend', 'integrations_ok', 'open_problems', 'open_tickets']) assert.ok(key in h.data[0].factors, key);
  const a = await (await call(owner, '/attention')).json();
  assert.equal(a.success, true);
  assert.ok(Array.isArray(a.data));
  for (const item of a.data) assert.deepEqual(Object.keys(item).sort(), ['detail', 'href', 'kind', 'title', 'tone']);
});
