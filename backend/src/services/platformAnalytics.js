// Tendências, utilização e registo de auditoria da consola da plataforma.
// Apenas metadados agregados: nunca nomes, emails, user agents em bruto nem IPs.
const { db } = require('../config/database');
const { localDay, addDays } = require('./dates');

const clamp = (value, min, max, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

// Segunda-feira (AAAA-MM-DD) da semana do dia dado.
function mondayOf(day) {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay(); // 0 = domingo
  return addDays(day, -((weekday + 6) % 7));
}

// Segundas-feiras das últimas `n` semanas locais, da mais antiga para a atual.
function weekStarts(n) {
  const current = mondayOf(localDay());
  return Array.from({ length: n }, (_, i) => addDays(current, -7 * (n - 1 - i)));
}

// created_at do SQLite é «AAAA-MM-DD HH:MM:SS» em UTC (ou ISO): converte para o dia local.
function localDayOfStamp(stamp) {
  const date = new Date(/^\d{4}-\d{2}-\d{2} /.test(stamp) ? `${stamp.replace(' ', 'T')}Z` : stamp);
  return Number.isNaN(date.getTime()) ? null : localDay(date);
}

// Reservas criadas por semana local. Margem de um dia na consulta (UTC vs local);
// o corte exato faz-se depois, em dias locais.
function reservationsPerWeek(starts, orgId = null) {
  const first = starts[0];
  const rows = db.prepare(`SELECT created_at FROM reservations
    WHERE substr(created_at, 1, 10) >= ? ${orgId ? 'AND organization_id = ?' : ''}`)
    .all(addDays(first, -1), ...(orgId ? [orgId] : []));
  const counts = new Map(starts.map(s => [s, 0]));
  for (const { created_at: stamp } of rows) {
    const day = localDayOfStamp(stamp);
    if (day && day >= first) {
      const week = mondayOf(day);
      if (counts.has(week)) counts.set(week, counts.get(week) + 1);
    }
  }
  return starts.map(s => counts.get(s));
}

function getTrends(weeksParam) {
  const weeks = weekStarts(clamp(weeksParam, 4, 52, 12));
  const first = weeks[0];
  const rows = db.prepare('SELECT day, organization_id, active_users, open_problems FROM platform_daily_stats WHERE day >= ?').all(first);
  const perWeek = new Map(weeks.map(w => [w, { orgs: new Set(), days: new Map() }]));
  for (const r of rows) {
    const week = perWeek.get(mondayOf(r.day));
    if (!week) continue;
    if (r.active_users > 0) week.orgs.add(r.organization_id);
    const d = week.days.get(r.day) || { users: 0, problems: null };
    d.users += r.active_users;
    if (r.open_problems !== null) d.problems = (d.problems || 0) + r.open_problems;
    week.days.set(r.day, d);
  }
  const pick = fn => weeks.map(w => {
    const { days, orgs } = perWeek.get(w);
    return days.size ? fn(days, orgs) : null; // sem linhas nessa semana: null, não 0
  });
  const peak = key => days => {
    const values = [...days.values()].map(d => d[key]).filter(v => v !== null);
    return values.length ? Math.max(...values) : null;
  };
  return {
    weeks,
    reservations_created: reservationsPerWeek(weeks),
    active_organizations: pick((_days, orgs) => orgs.size),
    // Pico diário da soma de utilizadores ativos: utilizadores distintos por
    // semana não são recuperáveis a partir dos totais diários.
    active_users: pick(peak('users')),
    incidents_open: pick(peak('problems')),
    collecting_since: db.prepare('SELECT MIN(day) AS day FROM platform_daily_stats').get().day || null,
  };
}

const byCountDesc = (a, b, key) => b[key] - a[key] || String(a.name ?? a.view).localeCompare(String(b.name ?? b.view));
const ranked = (map, key = 'sessions') => [...map].map(([name, n]) => ({ name, [key]: n })).sort((a, b) => byCountDesc(a, b, key));

// Sessões do período por browser/sistema/dispositivo/modo, a partir do
// agregado diário durável (platform_device_daily): não depende de as sessões
// ainda existirem, por isso terminar sessão não apaga o histórico.
function sessionBreakdown(days, orgId = null) {
  const rows = db.prepare(`SELECT browser, os, device, display_mode, SUM(sessions) AS n FROM platform_device_daily
    WHERE day >= ? ${orgId ? 'AND organization_id = ?' : ''} GROUP BY browser, os, device, display_mode`)
    .all(localDay(new Date(), -(days - 1)), ...(orgId ? [orgId] : []));
  const browsers = new Map(); const systems = new Map();
  const devices = { desktop: 0, mobile: 0, tablet: 0 };
  const display = { standalone: 0, browser: 0, unknown: 0 };
  for (const r of rows) {
    browsers.set(r.browser, (browsers.get(r.browser) || 0) + r.n);
    systems.set(r.os, (systems.get(r.os) || 0) + r.n);
    if (r.device in devices) devices[r.device] += r.n;
    display[r.display_mode in display ? r.display_mode : 'unknown'] += r.n;
  }
  return { browsers: ranked(browsers), os: ranked(systems), devices, display };
}

function viewTotals(days, orgId = null) {
  return db.prepare(`SELECT view, SUM(count) AS count FROM usage_daily WHERE day >= ? ${orgId ? 'AND organization_id = ?' : ''}
    GROUP BY view HAVING SUM(count) > 0 ORDER BY count DESC, view`)
    .all(localDay(new Date(), -(days - 1)), ...(orgId ? [orgId] : []));
}

const rolesOf = rows => {
  const roles = { owner: 0, manager: 0, staff: 0 };
  for (const r of rows) if (r.role in roles) roles[r.role] = r.n;
  return roles;
};

function getUsage(daysParam) {
  const days = clamp(daysParam, 1, 365, 30);
  const { browsers, os, devices, display } = sessionBreakdown(days);
  const sizes = { '1': 0, '2-3': 0, '4-6': 0, '7+': 0 };
  for (const { n } of db.prepare('SELECT COUNT(*) AS n FROM memberships WHERE active = 1 GROUP BY organization_id').all()) {
    sizes[n === 1 ? '1' : n <= 3 ? '2-3' : n <= 6 ? '4-6' : '7+'] += 1;
  }
  return {
    browsers, os, devices, display, views: viewTotals(days),
    team: {
      sizes: Object.entries(sizes).map(([bucket, organizations]) => ({ bucket, organizations })),
      roles: rolesOf(db.prepare('SELECT role, COUNT(*) AS n FROM memberships WHERE active = 1 GROUP BY role').all()),
    },
  };
}

// Extras da ficha de uma organização.
function organizationInsights(orgId) {
  const roles = rolesOf(db.prepare('SELECT role, COUNT(*) AS n FROM memberships WHERE organization_id = ? AND active = 1 GROUP BY role').all(orgId));
  // Pessoas distintas com atividade nos últimos 7 dias (daily_activity, que
  // não se apaga ao terminar sessão).
  const active7d = db.prepare(`SELECT COUNT(DISTINCT a.user_id) AS n FROM daily_activity a
    JOIN memberships m ON m.organization_id = a.organization_id AND m.user_id = a.user_id AND m.active = 1
    WHERE a.organization_id = ? AND a.day >= ?`).get(orgId, localDay(new Date(), -6)).n;
  const { browsers, devices, display } = sessionBreakdown(30, orgId);
  const weeks = weekStarts(12);
  return {
    team: { members: roles.owner + roles.manager + roles.staff, roles, active_7d: active7d },
    usage: { browsers, devices, display, views: viewTotals(30, orgId) },
    trend: { weeks, reservations_created: reservationsPerWeek(weeks, orgId) },
  };
}

// Mais recentes primeiro. Os ids são UUIDs: `before` posiciona-se pela data e
// pelo rowid da entrada indicada. Sem ip nem user_id.
function listAudit({ limit, before } = {}) {
  const max = clamp(limit, 1, 200, 50);
  let where = ''; const params = [];
  if (before) {
    const ref = db.prepare('SELECT created_at, rowid AS rid FROM platform_audit_events WHERE id = ?').get(String(before));
    if (!ref) return [];
    where = 'WHERE created_at < ? OR (created_at = ? AND rowid < ?)';
    params.push(ref.created_at, ref.created_at, ref.rid);
  }
  return db.prepare(`SELECT id, created_at, action, target_type, target_id, details_json FROM platform_audit_events
    ${where} ORDER BY created_at DESC, rowid DESC LIMIT ?`).all(...params, max).map(r => {
    let details = null;
    try { details = r.details_json ? JSON.parse(r.details_json) : null; } catch { /* JSON inválido: sem detalhes */ }
    return { id: r.id, created_at: r.created_at, action: r.action, target_type: r.target_type, target_id: r.target_id, details };
  });
}

module.exports = { getTrends, getUsage, organizationInsights, listAudit };
