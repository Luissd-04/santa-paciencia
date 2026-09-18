// Migrações novas são versionadas e atómicas. As migrações legadas permanecem
// em database.js até a extração completa, para preservar instalações existentes.
function runMigrations(db) {
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
module.exports = { runMigrations };
