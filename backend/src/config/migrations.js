// Migrações novas são versionadas e atómicas. A compatibilidade anterior está
// organizada em legacy-migrations/ e é executada antes destas versões.
function migrateIntegrity(db) {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))");
  const id = '20260917_integrity';
  if (db.prepare('SELECT 1 FROM schema_migrations WHERE id = ?').get(id)) return;
  db.transaction(() => {
    if (!db.pragma('table_info(guests)').some(c => c.name === 'updated_at')) db.exec('ALTER TABLE guests ADD COLUMN updated_at TEXT');
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_res_org_dates ON reservations(organization_id, check_in, check_out, status);
      CREATE INDEX IF NOT EXISTS idx_guest_org_email ON guests(organization_id, email);
      CREATE INDEX IF NOT EXISTS idx_events_org_date ON operational_events(organization_id, date);
      CREATE INDEX IF NOT EXISTS idx_res_precheckin ON reservations(precheckin_token);
      CREATE INDEX IF NOT EXISTS idx_res_public_token ON reservations(public_token);
      CREATE TABLE IF NOT EXISTS reservation_units (
        reservation_id TEXT NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        accommodation_id TEXT NOT NULL REFERENCES accommodations(id),
        PRIMARY KEY(reservation_id, accommodation_id)
      );
      CREATE INDEX IF NOT EXISTS idx_units_org_accommodation ON reservation_units(organization_id, accommodation_id, reservation_id);
      INSERT OR IGNORE INTO reservation_units SELECT id, organization_id, accommodation_id FROM reservations;
      INSERT OR IGNORE INTO reservation_units
        SELECT r.id, r.organization_id, a.id FROM reservations r,
        json_each(CASE WHEN json_valid(r.accommodations_data) THEN r.accommodations_data ELSE '[]' END) j
        JOIN accommodations a ON a.id = json_extract(j.value, '$.accommodation_id') AND a.organization_id = r.organization_id;
    `);
    for (const event of ['INSERT', 'UPDATE OF accommodation_id, accommodations_data, organization_id']) {
      const name = event === 'INSERT' ? 'insert' : 'update';
      db.exec(`CREATE TRIGGER IF NOT EXISTS reservation_units_${name} AFTER ${event} ON reservations BEGIN
        DELETE FROM reservation_units WHERE reservation_id = NEW.id;
        INSERT INTO reservation_units VALUES (NEW.id, NEW.organization_id, NEW.accommodation_id);
        INSERT OR IGNORE INTO reservation_units
          SELECT NEW.id, NEW.organization_id, a.id FROM json_each(CASE WHEN json_valid(NEW.accommodations_data) THEN NEW.accommodations_data ELSE '[]' END) j
          JOIN accommodations a ON a.id = json_extract(j.value, '$.accommodation_id') AND a.organization_id = NEW.organization_id;
      END`);
    }
    db.prepare('INSERT INTO schema_migrations (id) VALUES (?)').run(id);
  })();
}
function runMigrations(db) {
  migrateIntegrity(db);
  migrateListIndexes(db);
  migrateAuthScheduler(db);
  migrateGoogleTaskCleanupQueue(db);
}
function migrateAuthScheduler(db) {
  const id = '20260919_auth_scheduler';
  if (db.prepare('SELECT 1 FROM schema_migrations WHERE id = ?').get(id)) return;
  db.transaction(() => {
    const crypto = require('crypto');
    const digest = token => 'sha256:' + crypto.createHash('sha256').update(token).digest('hex');
    for (const row of db.prepare('SELECT id FROM auth_sessions').all()) {
      if (/^[a-f0-9]{64}$/.test(row.id)) db.prepare('UPDATE auth_sessions SET id = ? WHERE id = ?').run(digest(row.id), row.id);
    }
    for (const row of db.prepare('SELECT id, token FROM password_reset_tokens').all()) {
      if (/^[a-f0-9]{64}$/.test(row.token)) db.prepare('UPDATE password_reset_tokens SET token = ? WHERE id = ?').run(digest(row.token), row.id);
    }
    db.exec(`CREATE TABLE IF NOT EXISTS scheduler_leases (
      name TEXT PRIMARY KEY, owner TEXT NOT NULL, expires_at INTEGER NOT NULL
    )`);
    db.prepare('INSERT INTO schema_migrations (id) VALUES (?)').run(id);
  }).immediate();
}
function migrateGoogleTaskCleanupQueue(db) {
  const id = '20260920_google_task_cleanup_queue';
  if (db.prepare('SELECT 1 FROM schema_migrations WHERE id=?').get(id)) return;
  db.transaction(() => {
    db.exec(`CREATE TABLE google_task_cleanup_queue (
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      google_task_id TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      last_attempt_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (organization_id, google_task_id)
    );
    CREATE INDEX idx_google_task_cleanup_created
      ON google_task_cleanup_queue(organization_id, created_at);`);
    db.prepare('INSERT INTO schema_migrations(id) VALUES(?)').run(id);
  }).immediate();
}
function migrateListIndexes(db) {
  const id = '20260919_list_indexes';
  if (db.prepare('SELECT 1 FROM schema_migrations WHERE id=?').get(id)) return;
  db.transaction(() => {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_res_org_guest ON reservations(organization_id,guest_id,status,check_in);
      CREATE INDEX IF NOT EXISTS idx_guest_org_name ON guests(organization_id,name COLLATE NOCASE,id);
      CREATE INDEX IF NOT EXISTS idx_events_res_kind ON operational_events(organization_id,reservation_id,auto_kind,created_at);`);
    db.prepare('INSERT INTO schema_migrations(id) VALUES(?)').run(id);
  }).immediate();
}
module.exports = { runMigrations };
