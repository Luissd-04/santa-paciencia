// Dados da consola da plataforma (só para o dono da instância). Apenas
// metadados: contagens, datas e estados — nunca nomes, emails nem valores
// em dinheiro de hóspedes ou utilizadores.
const { db } = require('../config/database');
const { httpError } = require('./httpError');

const STATUSES = ['active', 'trial', 'suspended'];
const NOTES_MAX = 5000;
const INACTIVE_DAYS = 14;

const PROVIDERS = {
  email_decision: 'Gmail', effects_failed: 'Gmail', calendar_queue: 'Google Calendar',
  tasks_queue: 'Google Tasks', cancellation_review: 'Pagamentos',
};
const providerOf = key => PROVIDERS[key] || (key.startsWith('stripe_') ? 'Stripe' : 'Sistema');
const isInstanceKey = key => key.startsWith('task_') || key === 'disk_low';

// Datas do SQLite («AAAA-MM-DD HH:MM:SS», UTC) ou ISO → ISO; null se vazia.
function toIso(value) {
  if (!value) return null;
  const date = new Date(/^\d{4}-\d{2}-\d{2} /.test(value) ? `${value.replace(' ', 'T')}Z` : value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// Com `onlyId`, as contagens filtram só essa organização (ficha individual).
const countBy = (sql, onlyId = null, hasWhere = false) => {
  const filtered = onlyId ? sql.replace(/( GROUP BY| $)/, ` ${hasWhere ? 'AND' : 'WHERE'} organization_id = ?$1`) : sql;
  return new Map(db.prepare(filtered).all(...(onlyId ? [onlyId] : [])).map(r => [r.organization_id, r.n]));
};
const idSet = (sql, onlyId = null) => new Set(db.prepare(onlyId ? `${sql} WHERE organization_id = ?` : sql).all(...(onlyId ? [onlyId] : [])).map(r => r.organization_id));

// Estado e problemas de uma organização (lidos a cada chamada, para o teste
// e a instância poderem substituir opsStatus).
function statusOf(orgId) {
  return require('./opsStatus').opsStatus(orgId);
}
function problemsOf(status) {
  return require('./opsAlerts').problems(status);
}

// Base partilhada por visão geral, lista e incidentes: linhas das organizações
// com agregados (um GROUP BY por contagem) e problemas calculados uma só vez.
function collect(onlyId = null) {
  const where = onlyId ? 'WHERE o.id = ?' : '';
  const orgs = db.prepare(`SELECT o.id, o.name, o.slug, o.status, o.platform_notes, o.created_at, p.id AS plan_id, p.name AS plan_name
    FROM organizations o LEFT JOIN plans p ON p.id = o.plan_id ${where} ORDER BY o.name COLLATE NOCASE, o.id`)
    .all(...(onlyId ? [onlyId] : []));
  const members = countBy('SELECT organization_id, COUNT(*) AS n FROM memberships WHERE active = 1 GROUP BY organization_id', onlyId, true);
  const accommodations = countBy('SELECT organization_id, COUNT(*) AS n FROM accommodations GROUP BY organization_id', onlyId);
  const reservations30 = countBy("SELECT organization_id, COUNT(*) AS n FROM reservations WHERE created_at >= datetime('now', '-30 days') GROUP BY organization_id", onlyId, true);
  const openRequests = countBy("SELECT organization_id, COUNT(*) AS n FROM support_tickets WHERE status != 'resolved' GROUP BY organization_id", onlyId, true);
  const reservationsAll = countBy('SELECT organization_id, COUNT(*) AS n FROM reservations GROUP BY organization_id', onlyId);
  const lastSeen = new Map(db.prepare(`SELECT s.organization_id, MAX(s.last_seen_at) AS last_seen FROM auth_sessions s
    JOIN memberships m ON m.organization_id = s.organization_id AND m.user_id = s.user_id AND m.active = 1
    ${onlyId ? 'WHERE s.organization_id = ?' : ''} GROUP BY s.organization_id`).all(...(onlyId ? [onlyId] : [])).map(r => [r.organization_id, toIso(r.last_seen)]));
  // Recurso: as sessões apagam-se ao terminar sessão e aos 14 dias, por isso o
  // último dia com utilizadores ativos (platform_daily_stats) também conta.
  for (const r of db.prepare(`SELECT organization_id, MAX(day) AS day FROM platform_daily_stats WHERE active_users > 0 ${onlyId ? 'AND organization_id = ?' : ''} GROUP BY organization_id`).all(...(onlyId ? [onlyId] : []))) {
    const fallback = toIso(`${r.day}T00:00:00Z`);
    if (fallback && (!lastSeen.get(r.organization_id) || lastSeen.get(r.organization_id) < fallback)) lastSeen.set(r.organization_id, fallback);
  }
  // Só a existência das ligações: os tokens nunca são lidos.
  const calendar = idSet('SELECT DISTINCT organization_id FROM google_calendar_connections', onlyId);
  const tasks = idSet('SELECT DISTINCT organization_id FROM google_tasks_connections', onlyId);
  const gmail = idSet('SELECT DISTINCT organization_id FROM google_email_connections', onlyId);
  const stripeKey = require('./stripeClient').stripeConfig();

  let instanceStatus = null;
  const result = orgs.map(org => {
    const status = statusOf(org.id);
    instanceStatus ||= status;
    const problems = problemsOf(status);
    const own = problems.filter(p => !isInstanceKey(p.key));
    const open = provider => own.some(p => providerOf(p.key) === provider);
    const googleOn = calendar.has(org.id) || tasks.has(org.id);
    const google = !googleOn ? 'off' : (open('Google Calendar') || open('Google Tasks') ? 'error' : 'ok');
    const mail = !gmail.has(org.id) ? 'off' : (open('Gmail') ? 'error' : 'ok');
    const stripe = open('Stripe') ? 'error' : (stripeKey.key && stripeKey.organizationId === org.id ? 'ok' : 'off');
    const row = {
      id: org.id, name: org.name, slug: org.slug, status: org.status, plan: org.plan_id ? { id: org.plan_id, name: org.plan_name } : null, created_at: org.created_at,
      last_activity_at: lastSeen.get(org.id) || null,
      members: members.get(org.id) || 0,
      accommodations: accommodations.get(org.id) || 0,
      reservations_30d: reservations30.get(org.id) || 0,
      integrations: { google, gmail: mail, stripe },
      open_problems: own.length,
      open_requests: openRequests.get(org.id) || 0,
    };
    return { row, problems: own, notes: org.platform_notes ?? null, hasReservation: (reservationsAll.get(org.id) || 0) > 0 };
  });
  return { orgs: result, instanceStatus };
}

// Cópia da recolha completa partilhada por visão geral, lista, incidentes,
// saúde e «Precisa de atenção» (a consola pede tudo isto de uma vez): sem ela,
// cada pedido refaz o opsStatus de todas as organizações. Validade curta e
// invalidação explícita quando uma organização muda. Nos testes não há cache
// (TTL 0) para não esconder alterações diretas à base; setSnapshotTtl liga-o.
let snapshotTtlMs = process.env.NODE_ENV === 'test' ? 0 : 20000;
let snapshot = null;
function setSnapshotTtl(ms) { snapshotTtlMs = ms; snapshot = null; }
function invalidateSnapshot() { snapshot = null; }
function collectAll() {
  if (snapshot && Date.now() - snapshot.at < snapshotTtlMs) return snapshot.value;
  const value = collect();
  snapshot = { at: Date.now(), value };
  return value;
}

// Estado da instância (disco, processo, tarefas automáticas), calculado uma
// só vez por recolha e separado do estado por organização.
function instanceProblems(instanceStatus, holder = null) {
  const status = instanceStatus || holder?.instanceStatus || statusOf('');
  if (holder) holder.instanceStatus = status;
  return { status, problems: problemsOf(status).filter(p => isInstanceKey(p.key)).map(({ key, title, detail }) => ({ key, title, detail })) };
}

function incidentsFrom(orgs) {
  const groups = new Map();
  for (const { row, problems } of orgs) {
    for (const p of problems) {
      if (!groups.has(p.key)) groups.set(p.key, { key: p.key, title: p.title, provider: providerOf(p.key), organizations: [], count: 0, since: null, detail: p.detail });
      const g = groups.get(p.key);
      g.organizations.push({ id: row.id, name: row.name });
      g.count = g.organizations.length;
    }
  }
  const since = db.prepare('SELECT organization_id, key, notified_at FROM ops_alerts WHERE resolved_at IS NULL').all();
  for (const g of groups.values()) {
    const ids = new Set(g.organizations.map(o => o.id));
    const times = since.filter(a => a.key === g.key && ids.has(a.organization_id)).map(a => toIso(a.notified_at)).filter(Boolean).sort();
    g.since = times[0] || null;
  }
  return [...groups.values()];
}

function getOverview() {
  const all = collectAll();
  const { orgs, instanceStatus } = all;
  const { status, problems } = instanceProblems(instanceStatus, all);
  const limit = Date.now() - INACTIVE_DAYS * 86400000;
  const inactive = orgs.filter(({ row }) => !row.last_activity_at || Date.parse(row.last_activity_at) <= limit).length;
  return {
    organizations: orgs.length,
    active_incidents: incidentsFrom(orgs).length + problems.length,
    open_requests: db.prepare("SELECT COUNT(*) AS n FROM support_tickets WHERE status != 'resolved'").get().n,
    inactive_14d: inactive,
    instance: {
      app_build: status.process.app_build, uptime_seconds: status.process.uptime_seconds,
      database_bytes: status.storage.database_bytes, disk: status.storage.disk || null,
    },
  };
}

function listOrganizations() {
  return collectAll().orgs.map(o => o.row);
}

function getOrganization(id) {
  const found = collect(String(id ?? '')).orgs[0];
  if (!found) throw httpError('Organização não encontrada.', 404);
  const { row, problems, notes, hasReservation } = found;
  return {
    ...row,
    problems: problems.map(({ key, title, detail }) => ({ key, title, detail })),
    onboarding: { google: row.integrations.google !== 'off' || row.integrations.gmail !== 'off', accommodation: row.accommodations > 0, reservation: hasReservation },
    notes,
    ...require('./platformAnalytics').organizationInsights(row.id),
  };
}

// status: active | trial | suspended; notes: texto livre só da plataforma;
// planId: id de um pacote, ou null para tirar o pacote (sem limites).
// Com 'suspended', as sessões nessa organização passam a responder 403
// (middleware/requireAuth.js) e o login deixa de a oferecer.
function updateOrganization(id, { status, notes, planId } = {}) {
  if (!db.prepare('SELECT 1 FROM organizations WHERE id = ?').get(String(id ?? ''))) throw httpError('Organização não encontrada.', 404);
  if (status !== undefined && !STATUSES.includes(status)) throw httpError('Estado inválido.', 400);
  if (notes !== undefined && notes !== null && (typeof notes !== 'string' || notes.length > NOTES_MAX)) {
    throw httpError(`As notas têm de ser texto até ${NOTES_MAX} caracteres.`, 400);
  }
  if (planId !== undefined && planId !== null && (typeof planId !== 'string' || !db.prepare('SELECT 1 FROM plans WHERE id = ?').get(planId))) {
    throw httpError('Pacote inválido.', 400);
  }
  const sets = [];
  const params = [];
  if (status !== undefined) { sets.push('status = ?'); params.push(status); }
  if (planId !== undefined) { sets.push('plan_id = ?'); params.push(planId); }
  if (notes !== undefined) { sets.push('platform_notes = ?'); params.push(notes === null || notes.trim() === '' ? null : notes); }
  if (sets.length) db.prepare(`UPDATE organizations SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...params, id);
  invalidateSnapshot();
  return getOrganization(id);
}

function listIncidents() {
  const all = collectAll();
  return { incidents: incidentsFrom(all.orgs), instance: instanceProblems(all.instanceStatus, all).problems };
}

// Valores grosseiros para o endpoint sem sessão: arredondados para baixo (de
// 10 em 10 até 100, de 50 em 50 até 1000, depois de 100 em 100), para não
// expor totais exatos da instância.
function coarse(n) {
  const step = n < 100 ? 10 : n < 1000 ? 50 : 100;
  return Math.floor(n / step) * step;
}

// Números da semana para a página de entrada (GET /auth/public-stats, sem
// sessão): só três totais grosseiros da instância, nunca dados de uma organização ou de
// uma pessoa. Reservas criadas e emails entregues nos últimos 7 dias e o
// total atual de alojamentos. Guardados 10 minutos em memória.
const PUBLIC_STATS_TTL_MS = 10 * 60000;
let publicStatsCache = null;
function publicWeekStats({ now = Date.now(), fresh = false } = {}) {
  if (!fresh && publicStatsCache && now - publicStatsCache.at < PUBLIC_STATS_TTL_MS) return publicStatsCache.value;
  const since = new Date(now - 7 * 86400000).toISOString().replace('T', ' ').slice(0, 19);
  const value = {
    week: {
      reservations_created: coarse(db.prepare('SELECT COUNT(*) AS n FROM reservations WHERE datetime(created_at) >= datetime(?)').get(since).n),
      emails_sent: coarse(db.prepare("SELECT COUNT(*) AS n FROM email_deliveries WHERE state = 'sent' AND updated_at >= ?").get(now - 7 * 86400000).n),
      accommodations: coarse(db.prepare('SELECT COUNT(*) AS n FROM accommodations').get().n),
    },
  };
  publicStatsCache = { at: now, value };
  return value;
}

module.exports = { publicWeekStats, PUBLIC_STATS_TTL_MS, getOverview, listOrganizations, getOrganization, updateOrganization, listIncidents, invalidateSnapshot, setSnapshotTtl, coarse, isInstanceKey, providerOf };
