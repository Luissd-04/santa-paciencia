// Migrações: Tarefas internas da equipa da plataforma.
// Cada migração é versionada em schema_migrations, como em ../migrations.js.
module.exports = function migrate(db) {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))");
  const id = '20261120_platform_tasks';
  if (db.prepare('SELECT 1 FROM schema_migrations WHERE id = ?').get(id)) return;
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS platform_tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        type TEXT NOT NULL DEFAULT 'improvement' CHECK (type IN ('idea','bug','improvement','marketing','client')),
        status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('ideas','todo','doing','done')),
        priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','urgent')),
        assignee_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        due_date TEXT,
        organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
        ticket_id TEXT REFERENCES support_tickets(id) ON DELETE SET NULL,
        position REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        done_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_platform_tasks_status ON platform_tasks(status, position);
      CREATE INDEX IF NOT EXISTS idx_platform_tasks_assignee ON platform_tasks(assignee_user_id, status);
      CREATE TABLE IF NOT EXISTS platform_task_comments (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES platform_tasks(id) ON DELETE CASCADE,
        user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE INDEX IF NOT EXISTS idx_platform_task_comments_task ON platform_task_comments(task_id, created_at);`);
    db.prepare('INSERT INTO schema_migrations (id) VALUES (?)').run(id);
  })();
};
