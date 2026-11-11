// Dados da consola da plataforma: contagens, incidentes agrupados, ausência de
// dados pessoais, validação do update e inatividade. Chama o serviço diretamente.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-platform-service-'));
const originalCwd = process.cwd();
process.chdir(temp);
Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test' });
const { db, initDatabase } = require('../config/database');
initDatabase();
const platform = require('../services/platformService');
const orgs = require('../services/orgService');
const auth = require('../services/authService');
after(() => { db.close(); process.chdir(originalCwd); fs.rmSync(temp, { recursive: true, force: true }); });

const alfa = orgs.createOrganization('Alfa');
const beta = orgs.createOrganization('Beta');
const PEOPLE = [
  { name: 'Ana Sinistra', email: 'ana.sinistra@example.invalid', org: alfa },
  { name: 'Rui Segredo', email: 'rui.segredo@example.invalid', org: alfa },
  { name: 'Bea Oculta', email: 'bea.oculta@example.invalid', org: beta },
];
const users = PEOPLE.map(p => {
  const user = auth.createUser({ name: p.name, email: p.email, password: 'SyntheticPlatform123!' });
  orgs.createMembership({ organizationId: p.org.id, userId: user.id, role: 'owner' });
  return user;
});
// Uma pessoa desativada na Alfa não conta como membro.
db.prepare('UPDATE memberships SET active = 0 WHERE user_id = ?').run(users[1].id);

const GUEST_NAME = 'Hóspede Reservado Silva';
const GUEST_EMAIL = 'hospede.silva@example.invalid';
function accommodation(org, id) {
  db.prepare("INSERT INTO accommodations (id, organization_id, name, type) VALUES (?,?,?,'suite')").run(id, org.id, `Casa ${id}`);
}
function reservation(org, id, accommodationId, createdAt) {
  db.prepare("INSERT OR IGNORE INTO guests (id, organization_id, name, email) VALUES (?,?,?,?)").run(`g-${org.id}`, org.id, GUEST_NAME, GUEST_EMAIL);
  db.prepare(`INSERT INTO reservations (id, organization_id, guest_id, accommodation_id, check_in, check_out, nights, num_guests, total_amount, status, created_at)
    VALUES (?,?,?,?,'2026-12-01','2026-12-03',2,2,123.45,'confirmada',?)`).run(id, org.id, `g-${org.id}`, accommodationId, createdAt);
}
accommodation(alfa, 'a1'); accommodation(alfa, 'a2'); accommodation(beta, 'b1');
reservation(alfa, 'r1', 'a1', new Date().toISOString());
reservation(alfa, 'r2', 'a1', new Date(Date.now() - 5 * 86400000).toISOString());
reservation(alfa, 'r3', 'a2', new Date(Date.now() - 60 * 86400000).toISOString());

// Problema simulado na Alfa: um efeito de reserva falhado.
db.prepare("INSERT INTO reservation_events (id, organization_id, reservation_id, type) VALUES ('ev1', ?, 'r1', 'created')").run(alfa.id);
db.prepare("INSERT INTO reservation_event_effects (event_id, effect, state) VALUES ('ev1', 'guest_confirmation', 'failed')").run();
db.prepare("INSERT INTO ops_alerts (organization_id, key, notified_at) VALUES (?, 'effects_failed', '2026-11-01T10:00:00.000Z')").run(alfa.id);
// Ligação ao Gmail (valor opaco: nunca é lido).
db.prepare("INSERT INTO google_email_connections (organization_id, email, tokens) VALUES (?, 'x@example.invalid', 'opaco')").run(alfa.id);

const byName = name => platform.listOrganizations().find(o => o.name === name);

test('lista: ordenada por nome, com contagens certas', () => {
  const list = platform.listOrganizations();
  assert.deepEqual(list.map(o => o.name), ['Alfa', 'Beta']);
  const a = byName('Alfa'), b = byName('Beta');
  assert.equal(a.members, 1);
  assert.equal(a.accommodations, 2);
  assert.equal(a.reservations_30d, 2);
  assert.equal(b.members, 1);
  assert.equal(b.accommodations, 1);
  assert.equal(b.reservations_30d, 0);
  assert.equal(a.plan, null);
  assert.equal(a.status, 'active');
  assert.equal(a.open_problems, 1);
  assert.equal(b.open_problems, 0);
  assert.deepEqual(a.integrations, { google: 'off', gmail: 'error', stripe: 'off' });
  assert.deepEqual(b.integrations, { google: 'off', gmail: 'off', stripe: 'off' });
});

test('incidentes: agrupados por chave, com a organização certa', () => {
  const { incidents, instance } = platform.listIncidents();
  assert.equal(incidents.length, 1);
  const [i] = incidents;
  assert.equal(i.key, 'effects_failed');
  assert.equal(i.provider, 'Gmail');
  assert.equal(i.count, 1);
  assert.deepEqual(i.organizations, [{ id: alfa.id, name: 'Alfa' }]);
  assert.equal(i.since, '2026-11-01T10:00:00.000Z');
  assert.ok(i.detail);
  assert.ok(Array.isArray(instance));
});

test('ficha: problemas, onboarding, notas e 404', () => {
  const a = platform.getOrganization(alfa.id);
  assert.deepEqual(a.problems.map(p => p.key), ['effects_failed']);
  assert.deepEqual(a.onboarding, { google: true, accommodation: true, reservation: true });
  assert.equal(a.notes, null);
  const b = platform.getOrganization(beta.id);
  assert.deepEqual(b.onboarding, { google: false, accommodation: true, reservation: false });
  assert.throws(() => platform.getOrganization('nao-existe'), e => e.status === 404);
});

test('nenhum dado pessoal nem valores em dinheiro', () => {
  const dump = JSON.stringify([platform.listOrganizations(), platform.getOrganization(alfa.id), platform.getOrganization(beta.id),
    platform.listIncidents(), platform.getOverview()]);
  for (const secret of [...PEOPLE.flatMap(p => [p.name, p.email]), GUEST_NAME, GUEST_EMAIL, '123.45', 'opaco', 'x@example.invalid']) {
    assert.ok(!dump.includes(secret), `não devia conter ${secret}`);
  }
});

test('update: validação e persistência', () => {
  for (const bad of ['apagada', 5, null]) assert.throws(() => platform.updateOrganization(beta.id, { status: bad }), e => e.status === 400);
  assert.throws(() => platform.updateOrganization(beta.id, { notes: 'x'.repeat(5001) }), e => e.status === 400);
  assert.throws(() => platform.updateOrganization(beta.id, { notes: 42 }), e => e.status === 400);
  assert.throws(() => platform.updateOrganization('nao-existe', { status: 'trial' }), e => e.status === 404);
  assert.equal(platform.getOrganization(beta.id).status, 'active');

  const updated = platform.updateOrganization(beta.id, { status: 'trial', notes: 'Piloto até Dezembro' });
  assert.equal(updated.status, 'trial');
  assert.equal(updated.notes, 'Piloto até Dezembro');
  assert.equal(byName('Beta').status, 'trial');
  // Só o que vem no pedido muda; null limpa as notas.
  assert.equal(platform.updateOrganization(beta.id, { status: 'suspended' }).notes, 'Piloto até Dezembro');
  const cleared = platform.updateOrganization(beta.id, { notes: null });
  assert.equal(cleared.notes, null);
  assert.equal(cleared.status, 'suspended');
  assert.equal(platform.updateOrganization(beta.id, { notes: 'x'.repeat(5000) }).notes.length, 5000);
  platform.updateOrganization(beta.id, { status: 'active', notes: null });
});

test('visão geral e inatividade a 14 dias', () => {
  const session = (user, org, lastSeen) => {
    const id = `sess-${Math.random().toString(16).slice(2)}`;
    db.prepare("INSERT INTO auth_sessions (id, user_id, organization_id, expires_at, last_seen_at) VALUES (?,?,?,'2999-01-01T00:00:00Z',?)").run(id, user.id, org.id, lastSeen);
  };
  // Nunca ativas: as duas contam. Uma sessão da pessoa desativada não conta como atividade.
  assert.equal(platform.getOverview().inactive_14d, 2);
  session(users[1], alfa, new Date().toISOString());
  assert.equal(byName('Alfa').last_activity_at, null);
  assert.equal(platform.getOverview().inactive_14d, 2);

  session(users[0], alfa, new Date(Date.now() - 20 * 86400000).toISOString());
  session(users[2], beta, new Date(Date.now() - 2 * 86400000).toISOString());
  assert.equal(platform.getOverview().inactive_14d, 1);
  assert.ok(byName('Beta').last_activity_at);
  session(users[0], alfa, new Date().toISOString());
  assert.equal(platform.getOverview().inactive_14d, 0);

  // Sem sessões (terminou sessão), mas com atividade registada ontem: não é inativa.
  db.prepare('DELETE FROM auth_sessions').run();
  assert.equal(platform.getOverview().inactive_14d, 2);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  db.prepare('INSERT INTO platform_daily_stats (day, organization_id, active_users) VALUES (?,?,1)').run(yesterday, alfa.id);
  assert.equal(platform.getOverview().inactive_14d, 1);
  assert.ok(byName('Alfa').last_activity_at);
  db.prepare('DELETE FROM platform_daily_stats').run();
  session(users[0], alfa, new Date().toISOString());
  session(users[2], beta, new Date().toISOString());

  const o = platform.getOverview();
  assert.equal(o.organizations, 2);
  assert.equal(o.open_requests, 0);
  assert.equal(o.active_incidents, 1 + platform.listIncidents().instance.length);
  assert.deepEqual(Object.keys(o.instance), ['app_build', 'uptime_seconds', 'database_bytes', 'disk']);
});
