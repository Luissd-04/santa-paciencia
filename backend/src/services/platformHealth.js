// Saúde dos clientes e «Precisa de atenção» da consola da plataforma.
// Só lê dados que já existem (platformService, daily_activity,
// platform_daily_stats, reservas, pedidos de suporte, platform_alerts e,
// se existir, platform_tasks). Nunca escreve e nunca devolve texto de
// hóspedes ou de mensagens: só contagens, estados, números e assuntos.
//
// ── Pontuação de saúde (0 a 100), por organização ──────────────────────────
//   + 40  Atividade: dias com utilizadores ativos nos últimos 14 dias
//         (daily_activity ∪ platform_daily_stats com active_users > 0).
//         7 ou mais dias valem os 40 pontos; menos é proporcional (dias/7).
//   + 25  Reservas: criadas nas últimas 4 semanas (28 dias) contra as 4
//         anteriores. Igual ou melhor = 25; queda de 60% ou mais = 0; entre
//         os dois, linear. Sem reservas em nenhum dos períodos = 10 (sem
//         dados para julgar). Só no período recente = 25.
//   + 15  Integrações: ligadas e sem erro (Google, Gmail, Stripe).
//         2 ou mais valem 15; 1 vale 8; nenhuma vale 0.
//   + 20  Base: todas as organizações começam com 20 pontos, para uma conta
//         nova e sossegada não cair logo em «risco alto».
//   − 10  por cada problema aberto (máx. −30).
//   −  5  por cada pedido de suporte por resolver (máx. −15).
// O resultado é arredondado e limitado a 0–100.
// Risco: alto abaixo de 45, médio abaixo de 70, baixo a partir de 70.
const { db } = require('../config/database');
const { localDay, addDays } = require('./dates');
const platform = require('./platformService');

const ACTIVE_WINDOW_DAYS = 14;
const ACTIVE_FULL_DAYS = 7;
const TREND_DAYS = 28;
const BASE = 20;
const W_ACTIVITY = 40;
const W_TREND = 25;
const W_INTEGRATIONS = 15;
const PROBLEM_PENALTY = 10; const PROBLEM_CAP = 30;
const TICKET_PENALTY = 5; const TICKET_CAP = 15;
const HIGH_BELOW = 45;
const MEDIUM_BELOW = 70;
const MAX_ITEMS = 8;
const DAY_MS = 86400000;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const riskOf = score => (score < HIGH_BELOW ? 'high' : score < MEDIUM_BELOW ? 'medium' : 'low');

function toDate(value) {
  if (!value) return null;
  const date = new Date(/^\d{4}-\d{2}-\d{2} /.test(value) ? `${value.replace(' ', 'T')}Z` : value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function activeDaysByOrg(now) {
  const from = localDay(now, -(ACTIVE_WINDOW_DAYS - 1));
  const days = new Map();
  const add = (orgId, day) => {
    if (!days.has(orgId)) days.set(orgId, new Set());
    days.get(orgId).add(day);
  };
  for (const r of db.prepare('SELECT DISTINCT organization_id, day FROM daily_activity WHERE day >= ?').all(from)) add(r.organization_id, r.day);
  for (const r of db.prepare('SELECT organization_id, day FROM platform_daily_stats WHERE day >= ? AND active_users > 0').all(from)) add(r.organization_id, r.day);
  return new Map([...days].map(([id, set]) => [id, set.size]));
}

// Reservas criadas por organização: [últimos 28 dias, 28 dias anteriores].
function reservationWindows(now) {
  const cut1 = new Date(now.getTime() - TREND_DAYS * DAY_MS);
  const cut2 = new Date(now.getTime() - 2 * TREND_DAYS * DAY_MS);
  const result = new Map();
  const rows = db.prepare('SELECT organization_id, created_at FROM reservations WHERE substr(created_at, 1, 10) >= ?')
    .all(addDays(localDay(cut2), -1));
  for (const r of rows) {
    const at = toDate(r.created_at);
    if (!at || at < cut2) continue;
    const entry = result.get(r.organization_id) || [0, 0];
    entry[at >= cut1 ? 0 : 1] += 1;
    result.set(r.organization_id, entry);
  }
  return result;
}

function trendScore(recent, previous) {
  if (!recent && !previous) return 10;
  if (!previous) return W_TREND;
  const ratio = recent / previous;
  if (ratio >= 1) return W_TREND;
  if (ratio <= 0.4) return 0;
  return W_TREND * ((ratio - 0.4) / 0.6);
}

function integrationScore(ok) {
  return ok >= 2 ? W_INTEGRATIONS : ok === 1 ? W_INTEGRATIONS / 2 : 0;
}

function scoreOf(f, recent, previous) {
  const activity = W_ACTIVITY * clamp(f.active_days_14 / ACTIVE_FULL_DAYS, 0, 1);
  const total = BASE + activity + trendScore(recent, previous) + integrationScore(f.integrations_ok)
    - Math.min(PROBLEM_CAP, PROBLEM_PENALTY * f.open_problems) - Math.min(TICKET_CAP, TICKET_PENALTY * f.open_tickets);
  return Math.round(clamp(total, 0, 100));
}

// [{organization_id, score, risk, factors}] ordenado por risco (pior primeiro).
function getHealth(now = new Date()) {
  const rows = platform.listOrganizations();
  const active = activeDaysByOrg(now);
  const windows = reservationWindows(now);
  const list = rows.map(org => {
    const [recent, previous] = windows.get(org.id) || [0, 0];
    const factors = {
      active_days_14: active.get(org.id) || 0,
      reservations_trend: previous ? Math.round(((recent - previous) / previous) * 100) : null,
      reservations_4w: recent,
      reservations_prev_4w: previous,
      integrations_ok: Object.values(org.integrations || {}).filter(v => v === 'ok').length,
      open_problems: Number(org.open_problems) || 0,
      open_tickets: Number(org.open_requests) || 0,
    };
    const score = scoreOf(factors, recent, previous);
    return { organization_id: org.id, score, risk: riskOf(score), factors };
  });
  const order = { high: 0, medium: 1, low: 2 };
  return list.sort((a, b) => order[a.risk] - order[b.risk] || a.score - b.score || String(a.organization_id).localeCompare(String(b.organization_id)));
}

const ticketLabel = number => `SP-${String(number).padStart(4, '0')}`;
const hasTable = name => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);

function unansweredTickets(now) {
  const limit = new Date(now.getTime() - DAY_MS).toISOString();
  return db.prepare(`SELECT t.id, t.number, t.subject, o.name AS organization_name FROM support_tickets t
    JOIN organizations o ON o.id = t.organization_id
    JOIN support_messages m ON m.id = (SELECT id FROM support_messages WHERE ticket_id = t.id ORDER BY created_at DESC, rowid DESC LIMIT 1)
    WHERE t.status != 'resolved' AND m.side = 'customer' AND m.created_at <= ?
    ORDER BY m.created_at, t.number`).all(limit);
}

function dueTasks(userId, now) {
  if (!userId || !hasTable('platform_tasks')) return [];
  try {
    const cols = db.pragma('table_info(platform_tasks)').map(c => c.name);
    if (!['title', 'status', 'due_date', 'assignee_user_id'].every(c => cols.includes(c))) return [];
    return db.prepare(`SELECT title, due_date FROM platform_tasks
      WHERE assignee_user_id = ? AND status != 'done' AND due_date IS NOT NULL AND substr(due_date, 1, 10) <= ?
      ORDER BY due_date`).all(userId, localDay(now, 7));
  } catch { return []; }
}

const plural = (n, one, many) => (n === 1 ? one : many);
const joinNames = (names, max = 3) => names.slice(0, max).join(', ') + (names.length > max ? ` e mais ${names.length - max}` : '');

// Itens por gravidade: incidentes, suporte, risco alto, instância, tarefas.
// `includeSupport`: só quem tem o cargo Suporte (ou Administração) vê os pedidos.
function getAttention({ userId = null, now = new Date(), includeSupport = true } = {}) {
  const items = [];
  const { incidents, instance } = platform.listIncidents();

  for (const g of incidents) {
    items.push({ kind: 'incident', tone: 'bad', title: `${g.provider} com falhas em ${g.count} ${plural(g.count, 'cliente', 'clientes')}`,
      detail: g.since ? `${g.title} · desde ${g.since.slice(0, 16).replace('T', ' ')}` : g.title, href: '/plataforma/incidentes' });
  }

  const tickets = includeSupport ? unansweredTickets(now) : [];
  if (tickets.length) {
    const labels = tickets.map(t => `${ticketLabel(t.number)} ${t.organization_name}`);
    items.push({ kind: 'support', tone: 'violet',
      title: `${tickets.length} ${plural(tickets.length, 'pedido sem resposta', 'pedidos sem resposta')} há mais de 24 h`,
      detail: joinNames(labels),
      href: tickets.length === 1 ? `/plataforma/suporte/${encodeURIComponent(tickets[0].id)}` : '/plataforma/suporte' });
  }

  const names = new Map(platform.listOrganizations().map(o => [o.id, o]));
  for (const h of getHealth(now).filter(x => x.risk === 'high')) {
    const org = names.get(h.organization_id);
    if (!org || org.status === 'suspended') continue;
    const f = h.factors;
    const parts = [`${f.active_days_14} ${plural(f.active_days_14, 'dia', 'dias')} com atividade em 14`];
    if (f.reservations_trend !== null) parts.push(`reservas ${f.reservations_trend > 0 ? '+' : f.reservations_trend < 0 ? '−' : ''}${Math.abs(f.reservations_trend)}% em 4 semanas`);
    items.push({ kind: 'risk', tone: 'warn', title: `${org.name} em risco alto (saúde ${h.score})`, detail: parts.join(' · '), href: `/plataforma/clientes/${encodeURIComponent(org.id)}` });
  }

  if (instance.length) {
    const since = new Map(db.prepare('SELECT key, notified_at FROM platform_alerts WHERE resolved_at IS NULL').all().map(r => [r.key, r.notified_at]));
    for (const p of instance) {
      const at = since.get(p.key);
      items.push({ kind: 'instance', tone: 'info', title: p.title, detail: at ? `${p.detail || 'Por resolver'} · desde ${String(at).slice(0, 16).replace('T', ' ')}` : (p.detail || 'Por resolver'), href: '/plataforma/incidentes' });
    }
  }

  const tasks = dueTasks(userId, now);
  if (tasks.length) {
    items.push({ kind: 'tasks', tone: 'neutral', title: `${tasks.length} ${plural(tasks.length, 'tarefa tua com prazo', 'tarefas tuas com prazo')} nos próximos 7 dias`,
      detail: joinNames(tasks.map(t => t.title)), href: '/plataforma/tarefas' });
  }
  return items.slice(0, MAX_ITEMS);
}

// Tempo médio até à primeira resposta da plataforma, em horas, nos pedidos
// criados nos últimos 30 dias que já tiveram resposta. null sem dados.
function getSupportStats(now = new Date()) {
  const since = new Date(now.getTime() - 30 * DAY_MS).toISOString();
  const rows = db.prepare(`SELECT t.created_at AS opened,
      (SELECT MIN(m.created_at) FROM support_messages m WHERE m.ticket_id = t.id AND m.side = 'platform') AS answered
    FROM support_tickets t WHERE t.created_at >= ?`).all(since);
  const hours = rows.map(r => [toDate(r.opened), toDate(r.answered)]).filter(([a, b]) => a && b && b >= a).map(([a, b]) => (b - a) / 3600000);
  return {
    avg_first_response_hours: hours.length ? Math.round((hours.reduce((s, h) => s + h, 0) / hours.length) * 10) / 10 : null,
    answered_30d: hours.length,
  };
}

module.exports = { getHealth, getAttention, getSupportStats, riskOf, scoreOf };
