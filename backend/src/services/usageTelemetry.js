// Utilização da aplicação para a consola da plataforma, só em totais: páginas
// abertas por organização e por dia (usage_daily) e um resumo diário por
// organização (platform_daily_stats). Nunca utilizador, IP nem User-Agent.
// Os utilizadores ativos contam-se em daily_activity (gravada no acesso, em
// authService.getSessionUser), cujo user_id só serve para contar pessoas
// distintas: nunca sai daqui.
const { db } = require('../config/database');
const { digestToken } = require('./authService');
const { localDay, addDays, zonedDateTime } = require('./dates');
const { httpError } = require('./httpError');

// Cópia das chaves de VIEW_TITLES em frontend/js/app.js, sem `plataforma`
// (a consola não é uso da organização). Uma vista nova tem de entrar aqui.
const KNOWN_VIEWS = new Set([
  'dashboard', 'reservas', 'calendario', 'eventos', 'hospedes', 'notificacoes', 'alojamentos',
  'invoice', 'despesas', 'relatorios', 'vouchers', 'precos', 'definicoes', 'hospede-detalhe', 'ajuda',
]);
const MAX_VIEWS = 30;
const MAX_COUNT = 50;
const DISPLAY_MODES = new Set(['standalone', 'browser']);
const RETENTION_DAYS = 400;

const upsertView = db.prepare(`INSERT INTO usage_daily (organization_id, day, view, count) VALUES (?, ?, ?, ?)
  ON CONFLICT(organization_id, day, view) DO UPDATE SET count = count + excluded.count`);

// `views`: { vista: n }. Vistas desconhecidas e contagens que não são inteiros
// ≥ 1 são ignoradas; acima de 50 conta 50. Mais de 30 vistas é pedido inválido.
// `views: {}` grava só o display_mode da sessão (é o que a consola envia).
// Devolve o número de vistas somadas.
function recordUsage({ organizationId, sessionId, views, displayMode, now = new Date() }) {
  if (!views || typeof views !== 'object' || Array.isArray(views)) throw httpError('Pedido inválido.');
  const entries = Object.entries(views);
  if (entries.length > MAX_VIEWS) throw httpError('Demasiadas vistas.');
  const day = localDay(now);
  const valid = entries.filter(([view, n]) => KNOWN_VIEWS.has(view) && Number.isInteger(n) && n >= 1);
  db.transaction(() => {
    if (organizationId) for (const [view, n] of valid) upsertView.run(organizationId, day, view, Math.min(n, MAX_COUNT));
    if (sessionId && DISPLAY_MODES.has(displayMode)) {
      const before = db.prepare('SELECT organization_id, user_agent, display_mode FROM auth_sessions WHERE id = ?').get(digestToken(sessionId));
      db.prepare('UPDATE auth_sessions SET display_mode = ? WHERE id = ? AND display_mode IS NOT ?')
        .run(displayMode, digestToken(sessionId), displayMode);
      if (before) require('./deviceDaily').changeMode({ organizationId: before.organization_id, userAgent: before.user_agent, from: before.display_mode, to: displayMode });
    }
  })();
  return organizationId ? valid.length : 0;
}

// Limites UTC («AAAA-MM-DD HH:MM:SS», como datetime() do SQLite) do dia local.
const sqliteUtc = date => date.toISOString().slice(0, 19).replace('T', ' ');
const dayBounds = day => [sqliteUtc(zonedDateTime(day)), sqliteUtc(zonedDateTime(addDays(day, 1)))];

// Por organização: membros ativos com acesso no dia (daily_activity), sessões
// com atividade no dia e reservas criadas nesse dia. last_seen_at só guarda a
// última atividade e as sessões apagam-se ao terminar sessão, por isso nenhum
// dos dois desce: fica o maior valor visto (MAX no UPSERT).
function dayCounts(day) {
  const [from, to] = dayBounds(day);
  const users = db.prepare(`SELECT a.organization_id, COUNT(*) AS n FROM daily_activity a
    JOIN users u ON u.id = a.user_id AND u.active = 1
    JOIN memberships m ON m.organization_id = a.organization_id AND m.user_id = a.user_id AND m.active = 1
    WHERE a.day = ? GROUP BY a.organization_id`).all(day);
  const sessions = db.prepare(`SELECT organization_id, COUNT(*) AS n FROM auth_sessions
    WHERE organization_id IS NOT NULL AND datetime(last_seen_at) >= ? AND datetime(last_seen_at) < ?
    GROUP BY organization_id`).all(from, to);
  const created = db.prepare(`SELECT organization_id, COUNT(*) AS n FROM reservations
    WHERE datetime(created_at) >= ? AND datetime(created_at) < ? GROUP BY organization_id`).all(from, to);
  const byOrg = rows => new Map(rows.map(r => [r.organization_id, r.n]));
  return { users: byOrg(users), sessions: byOrg(sessions), created: byOrg(created) };
}

// Tarefa `platform_stats` (de hora a hora): linhas de hoje e de ontem para
// cada organização e limpeza do que tem mais de 400 dias. Os problemas em
// aberto (sem os da instância) só se sabem agora: só entram na linha de hoje.
function refreshDailyStats(now = new Date()) {
  const today = localDay(now);
  const days = [addDays(today, -1), today];
  const orgIds = db.prepare('SELECT id FROM organizations').all().map(r => r.id);
  const { isInstanceKey } = require('./platformService');
  const problems = new Map(orgIds.map(id => {
    const found = require('./opsAlerts').problems(require('./opsStatus').opsStatus(id));
    return [id, found.filter(p => !isInstanceKey(p.key)).length];
  }));
  const counts = new Map(days.map(day => [day, dayCounts(day)]));
  const upsert = db.prepare(`INSERT INTO platform_daily_stats (day, organization_id, active_users, sessions_active, reservations_created, open_problems)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(day, organization_id) DO UPDATE SET
      active_users = MAX(active_users, excluded.active_users),
      sessions_active = MAX(sessions_active, excluded.sessions_active),
      reservations_created = excluded.reservations_created,
      open_problems = COALESCE(excluded.open_problems, open_problems)`);
  const limit = addDays(today, -RETENTION_DAYS);
  db.transaction(() => {
    for (const day of days) {
      const { users, sessions, created } = counts.get(day);
      for (const id of orgIds) {
        upsert.run(day, id, users.get(id) || 0, sessions.get(id) || 0, created.get(id) || 0, day === today ? problems.get(id) : null);
      }
    }
    db.prepare('DELETE FROM platform_diagnostics_daily WHERE day < ?').run(limit);
    db.prepare('DELETE FROM usage_daily WHERE day < ?').run(limit);
    db.prepare('DELETE FROM daily_activity WHERE day < ?').run(limit);
    db.prepare('DELETE FROM platform_daily_stats WHERE day < ?').run(limit);
  })();
  return { days, organizations: orgIds.length };
}

module.exports = { KNOWN_VIEWS, MAX_VIEWS, MAX_COUNT, RETENTION_DAYS, recordUsage, refreshDailyStats };
