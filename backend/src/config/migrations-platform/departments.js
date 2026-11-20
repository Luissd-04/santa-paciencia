// Gestão interna da plataforma, independente dos dados operacionais dos clientes.
module.exports = db => {
  const id = '20261111_platform_departments';
  if (db.prepare('SELECT 1 FROM schema_migrations WHERE id=?').get(id)) return;
  db.transaction(() => {
    db.exec(`CREATE TABLE platform_records (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL,
      organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
      assignee_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      related_id TEXT REFERENCES platform_records(id) ON DELETE RESTRICT,
      ticket_id TEXT REFERENCES support_tickets(id) ON DELETE SET NULL,
      data_json TEXT NOT NULL DEFAULT '{}', revision INTEGER NOT NULL DEFAULT 1,
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
      CREATE INDEX idx_platform_records_kind ON platform_records(kind,status,updated_at);
      CREATE INDEX idx_platform_records_org ON platform_records(organization_id,kind);
      CREATE INDEX idx_platform_records_related ON platform_records(related_id);
      CREATE UNIQUE INDEX idx_platform_profile_unique ON platform_records(organization_id) WHERE kind='profile';
      CREATE UNIQUE INDEX idx_platform_subscription_active ON platform_records(organization_id) WHERE kind='subscription' AND status='active';
      CREATE TABLE platform_record_comments (
        id TEXT PRIMARY KEY, record_id TEXT NOT NULL REFERENCES platform_records(id) ON DELETE CASCADE,
        user_id TEXT REFERENCES users(id) ON DELETE SET NULL, body TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
      CREATE INDEX idx_platform_record_comments ON platform_record_comments(record_id,created_at);
      ALTER TABLE platform_tasks ADD COLUMN department TEXT NOT NULL DEFAULT 'product';
      ALTER TABLE platform_tasks ADD COLUMN record_id TEXT REFERENCES platform_records(id) ON DELETE SET NULL;
      UPDATE platform_tasks SET department=CASE WHEN type='marketing' THEN 'marketing' WHEN type='client' THEN 'clients' ELSE 'product' END;
      CREATE TABLE platform_trial_access (
        organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
        mode TEXT NOT NULL CHECK(mode IN ('demo','private')), days INTEGER NOT NULL CHECK(days BETWEEN 1 AND 90),
        lead_id TEXT REFERENCES platform_records(id) ON DELETE SET NULL,
        owner_email TEXT NOT NULL, followup_task_id TEXT REFERENCES platform_tasks(id) ON DELETE SET NULL, started_at TEXT, expires_at TEXT, closed_at TEXT, converted_at TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
      CREATE TABLE platform_business_settings (id INTEGER PRIMARY KEY CHECK(id=1), company_name TEXT NOT NULL DEFAULT 'Santa Paciência', contact_email TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '');`);
    db.prepare('INSERT INTO schema_migrations(id) VALUES(?)').run(id);
  })();
};
