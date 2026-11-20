// Lote C: só agregados de diagnóstico; sem mensagens, URLs ou stacks.
module.exports = db => {
  const id = '20261111_console_c';
  if (db.prepare('SELECT 1 FROM schema_migrations WHERE id = ?').get(id)) return;
  db.transaction(() => {
    db.exec(`ALTER TABLE users ADD COLUMN platform_role TEXT NOT NULL DEFAULT 'admin' CHECK(platform_role IN ('admin','marketing'));
      CREATE TABLE platform_diagnostics_daily (
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        day TEXT NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0, total_ms REAL NOT NULL DEFAULT 0, max_ms REAL NOT NULL DEFAULT 0,
        PRIMARY KEY(organization_id, day, kind, name));
      CREATE TABLE support_saved_replies (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
      CREATE TABLE platform_support_settings (id INTEGER PRIMARY KEY CHECK(id=1), retention_days INTEGER NOT NULL DEFAULT 0 CHECK(retention_days=0 OR retention_days BETWEEN 30 AND 3650));
      CREATE TABLE support_file_deletions (stored_name TEXT PRIMARY KEY);
      CREATE INDEX idx_support_retention ON support_tickets(status, updated_at);`);
    db.prepare('INSERT INTO schema_migrations(id) VALUES (?)').run(id);
  })();
};
