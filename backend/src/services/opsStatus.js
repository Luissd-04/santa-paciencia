// Estado operacional para o proprietário: filas, falhas pendentes e últimos
// ciclos dos schedulers. Só contagens e datas — sem dados pessoais nem segredos.
const fs = require('fs');
const path = require('path');
const { db } = require('../config/database');

// Último ciclo de cada scheduler neste processo (reinicia com o servidor).
const beats = {};
function beat(name, error = null) {
  const now = new Date().toISOString();
  beats[name] = { ...beats[name], last_run: now, ...(error ? { last_error_at: now, last_error: String(error.message || error).slice(0, 200) } : { last_ok: now }) };
}

function one(sql, ...params) {
  try { return db.prepare(sql).get(...params); } catch { return null; }
}

function opsStatus(organizationId, { includeUploads = false } = {}) {
  const dbPath = process.env.DB_PATH && process.env.DB_PATH !== ':memory:' ? path.resolve(process.env.DB_PATH) : null;
  const size = file => { try { return fs.statSync(file).size; } catch { return 0; } };
  let disk = null;
  if (dbPath && typeof fs.statfsSync === 'function') {
    try { const s = fs.statfsSync(path.dirname(dbPath)); disk = { free_bytes: s.bavail * s.bsize, total_bytes: s.blocks * s.bsize }; } catch { /* sem informação */ }
  }
  const status = {
    generated_at: new Date().toISOString(),
    process: { uptime_seconds: Math.round(process.uptime()), node: process.version, app_build: require('./appBuild').value },
    storage: { database_bytes: dbPath ? size(dbPath) + size(`${dbPath}-wal`) : null, disk },
    schedulers: beats,
    email: {
      // «uncertain»/«blocked»: a equipa decide em Notificações (já entregue / enviar de novo).
      deliveries_needing_decision: one("SELECT COUNT(*) AS n FROM email_deliveries WHERE organization_id = ? AND state IN ('uncertain', 'blocked')", organizationId)?.n ?? null,
      deliveries_failed_retrying: one("SELECT COUNT(*) AS n FROM email_deliveries WHERE organization_id = ? AND state NOT IN ('sent', 'superseded', 'uncertain', 'blocked') AND attempts > 0", organizationId)?.n ?? null,
      queue: one('SELECT COUNT(*) AS n, MIN(created_at) AS oldest FROM organization_email_queue WHERE organization_id = ?', organizationId),
    },
    google: {
      calendar_queue: one(`SELECT COUNT(*) AS pending, SUM(CASE WHEN attempts > 0 THEN 1 ELSE 0 END) AS failing, MIN(created_at) AS oldest
        FROM google_calendar_queue WHERE organization_id = ?`, organizationId),
      tasks_cleanup_queue: one('SELECT COUNT(*) AS n, MIN(created_at) AS oldest FROM google_task_cleanup_queue WHERE organization_id = ?', organizationId),
    },
    payments: {
      stripe_stuck_over_1h: one(`SELECT COUNT(*) AS n FROM stripe_payment_attempts WHERE organization_id = ?
        AND state IN ('creating', 'processing') AND updated_at < datetime('now', '-1 hour')`, organizationId)?.n ?? null,
      cancellations_manual_review: one(`SELECT COUNT(*) AS n FROM reservations WHERE organization_id = ?
        AND json_valid(policy_cancellation_json) AND json_extract(policy_cancellation_json, '$.state') = 'manual_review'`, organizationId)?.n ?? null,
    },
  };
  if (includeUploads) {
    const { count, bytes } = require('./uploadOrphans').findOrphans();
    status.uploads = { orphans: count, orphan_bytes: bytes, note: 'Ficheiros de todas as organizações da instância.' };
  }
  return status;
}

module.exports = { beat, opsStatus };
