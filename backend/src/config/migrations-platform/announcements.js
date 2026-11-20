// Migrações: Comunicados da plataforma aos clientes.
// Cada migração é versionada em schema_migrations, como em ../migrations.js.
module.exports = function migrate(db) {
  migrateAnnouncements(db);
};

// Comunicados (manutenção, incidente, novidade, aviso) e o registo de quem já
// os fechou. `audience_ids_json` guarda os ids das organizações ou dos pacotes.
function migrateAnnouncements(db) {
  const id = '20261111_announcements';
  if (db.prepare('SELECT 1 FROM schema_migrations WHERE id=?').get(id)) return;
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS announcements (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL CHECK (kind IN ('maintenance','incident','news','notice')),
        title TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        starts_at TEXT NOT NULL,
        ends_at TEXT,
        audience TEXT NOT NULL DEFAULT 'all' CHECK (audience IN ('all','organizations','plans')),
        audience_ids_json TEXT NOT NULL DEFAULT '[]',
        show_topbar INTEGER NOT NULL DEFAULT 1,
        show_help INTEGER NOT NULL DEFAULT 1,
        send_email INTEGER NOT NULL DEFAULT 0,
        created_by_user_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        ended_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_announcements_starts ON announcements(starts_at);
      CREATE TABLE IF NOT EXISTS announcement_dismissals (
        announcement_id TEXT NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL,
        dismissed_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (announcement_id, user_id)
      );
    `);
    db.prepare('INSERT INTO schema_migrations(id) VALUES(?)').run(id);
  }).immediate();
}
