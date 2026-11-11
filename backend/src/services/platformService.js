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

const countBy = sql => new Map(db.prepare(sql).all().map(r => [r.organization_id, r.n]));
const idSet = sql => new Set(db.prepare(sql).all().map(r => r.organization_id));

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
  const where = onlyId ? 'WHERE id = ?' : '';
  const orgs = db.prepare(`SELECT id, name, slug, status, platform_notes, created_at FROM organizations ${where} ORDER BY name COLLATE NOCASE, id`)
    .all(...(onlyId ? [onlyId] : []));
  const members = countBy('SELECT organization_id, COUNT(*) AS n FROM memberships WHERE active = 1 GROUP BY organization_id');
  const accommodations = countBy('SELECT organization_id, COUNT(*) AS n FROM accommodations GROUP BY organization_id');
  const reservations30 = countBy("SELECT organization_id, COUNT(*) AS n FROM reservations WHERE created_at >= datetime('now', '-30 days') GROUP BY organization_id");
  const reservationsAll = countBy('SELECT organization_id, COUNT(*) AS n FROM reservations GROUP BY organization_id');
  const lastSeen = new Map(db.prepare(`SELECT s.organization_id, MAX(s.last_seen_at) AS last_seen FROM auth_sessions s
    JOIN memberships m ON m.organization_id = s.organization_id AND m.user_id = s.user_id AND m.active = 1
    GROUP BY s.organization_id`).all().map(r => [r.organization_id, toIso(r.last_seen)]));
  // Só a existência das ligações: os tokens nunca são lidos.
  const calendar = idSet('SELECT DISTINCT organization_id FROM google_calendar_connections');
  const tasks = idSet('SELECT DISTINCT organization_id FROM google_tasks_connections');
  const gmail = idSet('SELECT DISTINCT organization_id FROM google_email_connections');
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
      id: org.id, name: org.name, slug: org.slug, status: org.status, plan: null, created_at: org.created_at,
      last_activity_at: lastSeen.get(org.id) || null,
      members: members.get(org.id) || 0,
      accommodations: accommodations.get(org.id) || 0,
      reservations_30d: reservations30.get(org.id) || 0,
      integrations: { google, gmail: mail, stripe },
      open_problems: own.length,
    };
    return { row, problems: own, notes: org.platform_notes ?? null, hasReservation: (reservationsAll.get(org.id) || 0) > 0 };
  });
  return { orgs: result, instanceStatus };
}

// Problemas da instância (tarefas automáticas e disco), só uma vez.
function instanceProblems(instanceStatus) {
  const status = instanceStatus || statusOf('');
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
  const { orgs, instanceStatus } = collect();
  const { status, problems } = instanceProblems(instanceStatus);
  const limit = Date.now() - INACTIVE_DAYS * 86400000;
  const inactive = orgs.filter(({ row }) => !row.last_activity_at || Date.parse(row.last_activity_at) <= limit).length;
  return {
    organizations: orgs.length,
    active_incidents: incidentsFrom(orgs).length + problems.length,
    open_requests: 0,
    inactive_14d: inactive,
    instance: {
      app_build: status.process.app_build, uptime_seconds: status.process.uptime_seconds,
      database_bytes: status.storage.database_bytes, disk: status.storage.disk || null,
    },
  };
}

function listOrganizations() {
  return collect().orgs.map(o => o.row);
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

// status: active | trial | suspended; notes: texto livre só da plataforma.
// A suspensão ainda não é aplicada ao acesso.
function updateOrganization(id, { status, notes } = {}) {
  if (!db.prepare('SELECT 1 FROM organizations WHERE id = ?').get(String(id ?? ''))) throw httpError('Organização não encontrada.', 404);
  if (status !== undefined && !STATUSES.includes(status)) throw httpError('Estado inválido.', 400);
  if (notes !== undefined && notes !== null && (typeof notes !== 'string' || notes.length > NOTES_MAX)) {
    throw httpError(`As notas têm de ser texto até ${NOTES_MAX} caracteres.`, 400);
  }
  const sets = [];
  const params = [];
  if (status !== undefined) { sets.push('status = ?'); params.push(status); }
  if (notes !== undefined) { sets.push('platform_notes = ?'); params.push(notes === null || notes.trim() === '' ? null : notes); }
  if (sets.length) db.prepare(`UPDATE organizations SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...params, id);
  return getOrganization(id);
}

function listIncidents() {
  const { orgs, instanceStatus } = collect();
  return { incidents: incidentsFrom(orgs), instance: instanceProblems(instanceStatus).problems };
}

module.exports = { getOverview, listOrganizations, getOrganization, updateOrganization, listIncidents, isInstanceKey };
