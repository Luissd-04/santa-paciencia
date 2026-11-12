// Revisões dos registos financeiros (subscrições e movimentos): cada alteração
// guarda o estado anterior e o novo, quem alterou e o motivo.
module.exports = db => {
  const id = '20261113_platform_record_revisions';
  if (db.prepare('SELECT 1 FROM schema_migrations WHERE id = ?').get(id)) return;
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS platform_record_revisions (
        id TEXT PRIMARY KEY,
        record_id TEXT NOT NULL REFERENCES platform_records(id),
        revision INTEGER NOT NULL,
        user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        before_json TEXT NOT NULL,
        after_json TEXT NOT NULL,
        reason TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE INDEX IF NOT EXISTS idx_platform_record_revisions ON platform_record_revisions(record_id, revision);
    `);
    db.prepare('INSERT INTO schema_migrations(id) VALUES (?)').run(id);
  })();
};
