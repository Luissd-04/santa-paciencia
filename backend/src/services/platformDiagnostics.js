// Diagnóstico agregado: nenhuma mensagem de erro, URL, parâmetro ou stack.
const { db } = require('../config/database');
const { localDay } = require('./dates');
const { KNOWN_VIEWS } = require('./usageTelemetry');
const KINDS = ['script', 'resource', 'promise'];
const API_AREAS = new Set(['reservations','accommodations','calendar','guests','expenses','suppliers','reports','events','vouchers','support','team','backup','settings','email-templates','push','tasks','ops','announcements','payment-policy']);
function record(organizationId, kind, name, count = 1, ms = 0) {
  if (!organizationId) return;
  db.prepare(`INSERT INTO platform_diagnostics_daily(organization_id,day,kind,name,count,total_ms,max_ms) VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(organization_id,day,kind,name) DO UPDATE SET count=count+excluded.count,total_ms=total_ms+excluded.total_ms,max_ms=MAX(max_ms,excluded.max_ms)`)
    .run(organizationId, localDay(), kind, name, count, ms, ms);
}
function recordErrors(orgId, errors) {
  if (!errors || typeof errors !== 'object' || Array.isArray(errors)) return;
  db.transaction(() => {
    for (const kind of KINDS) if (Number.isInteger(errors[kind]) && errors[kind] > 0) record(orgId, 'frontend', kind, Math.min(errors[kind], 50));
  })();
}
function observe(req, res) {
  if (res.locals.diagnosticsObserved || !req.user?.organization_id || !req.originalUrl.startsWith('/api/') || /^\/api\/(?:telemetry|platform|live)(?:\/|\?|$)/i.test(req.originalUrl)) return;
  res.locals.diagnosticsObserved = true;
  const start = performance.now();
  // Primeiro segmento fixo; nunca IDs nem query strings.
  const group = /^\/api\/([a-z-]+)(?:\/|\?|$)/i.exec(req.originalUrl)?.[1]?.toLowerCase();
  const name = API_AREAS.has(group) ? group : 'other';
  res.once('finish', () => {
    try {
      record(req.user.organization_id, 'api', name, 1, Math.min(300000, Math.max(0, performance.now() - start)));
      if (res.statusCode >= 500) record(req.user.organization_id, 'api_error', name);
    } catch { /* O diagnóstico não pode falhar um pedido. */ }
  });
}
function summary() {
  const diagnostics = db.prepare(`SELECT kind,name,SUM(count) AS count,ROUND(SUM(total_ms)/SUM(count),1) AS avg_ms,ROUND(MAX(max_ms),1) AS max_ms
    FROM platform_diagnostics_daily WHERE day >= date('now','-29 days') GROUP BY kind,name ORDER BY count DESC`).all();
  const total = db.prepare('SELECT COUNT(*) AS n FROM organizations').get().n;
  const counts = new Map(db.prepare(`SELECT view,COUNT(DISTINCT organization_id) AS organizations,SUM(count) AS visits FROM usage_daily
    WHERE day >= date('now','-29 days') GROUP BY view`).all().map(r => [r.view, r]));
  const adoption = [...KNOWN_VIEWS].map(view => ({ view, organizations: counts.get(view)?.organizations || 0, visits: counts.get(view)?.visits || 0, total }));
  const onboarding = db.prepare(`SELECT o.id,o.name,
    EXISTS(SELECT 1 FROM accommodations a WHERE a.organization_id=o.id) AS accommodation,
    EXISTS(SELECT 1 FROM reservations r WHERE r.organization_id=o.id) AS reservation,
    EXISTS(SELECT 1 FROM memberships m WHERE m.organization_id=o.id AND m.active=1) AS owner,
    (SELECT COUNT(*) FROM memberships m WHERE m.organization_id=o.id AND m.active=1)>1 AS team,
    EXISTS(SELECT 1 FROM google_email_connections g WHERE g.organization_id=o.id) AS email,
    EXISTS(SELECT 1 FROM google_calendar_connections g WHERE g.organization_id=o.id) AS calendar
    FROM organizations o ORDER BY o.created_at DESC`).all();
  return { diagnostics, adoption, onboarding };
}
module.exports = { recordErrors, observe, summary };
