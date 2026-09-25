const { randomUUID } = require('node:crypto');

// Coordena processos que partilham a mesma base SQLite. A validade permite
// recuperar automaticamente se um processo terminar sem libertar a execução.
async function withSchedulerLease(db, name, work, leaseMs = 300000) {
  const owner = randomUUID();
  const now = Date.now();
  const result = db.prepare(`INSERT INTO scheduler_leases (name, owner, expires_at) VALUES (?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET owner=excluded.owner, expires_at=excluded.expires_at
    WHERE scheduler_leases.expires_at <= ?`).run(name, owner, now + leaseMs, now);
  if (!result.changes) return false;
  let lost = false;
  const renew = () => {
    try {
      const result = db.prepare('UPDATE scheduler_leases SET expires_at=? WHERE name=? AND owner=?')
        .run(Date.now() + leaseMs, name, owner);
      if (!result.changes) lost = true;
    } catch { lost = true; }
  };
  const heartbeat = setInterval(renew, Math.max(10, Math.floor(leaseMs / 3)));
  heartbeat.unref?.();
  try {
    await work(() => {
      if (lost) throw new Error('Execução automática interrompida: bloqueio perdido.');
    });
    return true;
  } finally {
    clearInterval(heartbeat);
    if (db.open) db.prepare('DELETE FROM scheduler_leases WHERE name=? AND owner=?').run(name, owner);
  }
}

module.exports = { withSchedulerLease };
