// Migrações de compatibilidade; a ordem de execução está em database.js.
module.exports = function createMigrations(db) {
  function migrateOrganizations() {
    const existing = db.pragma('table_info(organizations)').map(c => c.name);
    const cols = [
      ['updated_at', "TEXT DEFAULT (datetime('now'))"],
    ];
    for (const [col, type] of cols) {
      if (!existing.includes(col)) db.exec(`ALTER TABLE organizations ADD COLUMN ${col} ${type}`);
    }
  }

  function migrateUsers() {
    const existing = db.pragma('table_info(users)').map(c => c.name);
    const cols = [
      ['role', "TEXT NOT NULL DEFAULT 'admin'"],
      ['active', 'INTEGER NOT NULL DEFAULT 1'],
      ['updated_at', "TEXT DEFAULT (datetime('now'))"],
    ];
    for (const [col, type] of cols) {
      if (!existing.includes(col)) {
        db.exec(`ALTER TABLE users ADD COLUMN ${col} ${type}`);
      }
    }
  }

  function migrateAuthSessions() {
    const existing = db.pragma('table_info(auth_sessions)').map(c => c.name);
    const cols = [
      ['organization_id', 'TEXT'],
      ['last_seen_at', "TEXT DEFAULT (datetime('now'))"],
      ['user_agent', 'TEXT'],   // para a lista "Sessões ativas"
      ['ip', 'TEXT'],
    ];
    for (const [col, type] of cols) {
      if (!existing.includes(col)) {
        db.exec(`ALTER TABLE auth_sessions ADD COLUMN ${col} ${type}`);
      }
    }
  }

  function migrateMemberships() {
    const existing = db.pragma('table_info(memberships)').map(c => c.name);
    const cols = [
      ['active', 'INTEGER NOT NULL DEFAULT 1'],
      ['invited_by_user_id', 'TEXT'],
      ['updated_at', "TEXT DEFAULT (datetime('now'))"],
    ];
    for (const [col, type] of cols) {
      if (!existing.includes(col)) db.exec(`ALTER TABLE memberships ADD COLUMN ${col} ${type}`);
    }
  }

  function migrateInvitations() {
    const existing = db.pragma('table_info(invitations)').map(c => c.name);
    const cols = [
      ['accepted_at', 'TEXT'],
    ];
    for (const [col, type] of cols) {
      if (!existing.includes(col)) db.exec(`ALTER TABLE invitations ADD COLUMN ${col} ${type}`);
    }
  }

  function migrateOrgScopedTables() {
    const tableColumns = [
      ['accommodations', 'organization_id', 'TEXT'],
      ['guests', 'organization_id', 'TEXT'],
      ['reservations', 'organization_id', 'TEXT'],
      ['expenses', 'organization_id', 'TEXT'],
    ];
    for (const [table, col, type] of tableColumns) {
      const existing = db.pragma(`table_info(${table})`).map(c => c.name);
      if (!existing.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
    }
  }

  function hasLegacyOperationalData() {
    const tables = ['accommodations', 'guests', 'reservations', 'expenses'];
    return tables.some(table => {
      try {
        return db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get().c > 0;
      } catch {
        return false;
      }
    });
  }

  function migrateLegacyDataToOrganizations() {
    const orgCount = db.prepare('SELECT COUNT(*) as c FROM organizations').get().c;
    if (orgCount > 0) return;

    if (!hasLegacyOperationalData()) return;

    const crypto = require('crypto');
    const legacyOrgId = crypto.randomUUID();
    const legacyName = process.env.PROPERTY_NAME || 'Santa Paciência';
    const legacySlug = 'workspace-legacy';

    db.prepare(`
      INSERT INTO organizations (id, name, slug, created_at, updated_at)
      VALUES (?, ?, ?, datetime('now'), datetime('now'))
    `).run(legacyOrgId, legacyName, legacySlug);

    ['accommodations', 'guests', 'reservations', 'expenses'].forEach(table => {
      try {
        db.prepare(`UPDATE ${table} SET organization_id = ? WHERE organization_id IS NULL`).run(legacyOrgId);
      } catch {}
    });

    migrateLegacySettings(legacyOrgId);
    migrateLegacyEmailTemplates(legacyOrgId);

    console.warn(`⚠️  Dados legacy migrados para org ${legacyOrgId} (${legacyName}). Sem owner — adiciona uma membership manualmente via SQL para reclamar.`);
  }

  function migrateLegacySettings(organizationId) {
    try {
      const rows = db.prepare('SELECT key, value, updated_at FROM settings').all();
      if (!rows.length) return;
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO organization_settings (organization_id, key, value, updated_at)
        VALUES (?, ?, ?, COALESCE(?, datetime('now')))
      `);
      rows.forEach(row => stmt.run(organizationId, row.key, row.value, row.updated_at || null));
    } catch {}
  }

  function migrateLegacyEmailTemplates(organizationId) {
    try {
      const templates = db.prepare('SELECT * FROM email_templates').all();
      const logs = db.prepare('SELECT * FROM email_log').all();
      const tplStmt = db.prepare(`
        INSERT OR IGNORE INTO organization_email_templates (
          organization_id, slug, name, subject, body,
          timing_offset, timing_unit, timing_direction, timing_event, active, updated_at,
          subject_en, body_en, subject_fr, body_fr, subject_es, body_es,
          subject_de, body_de, subject_it, body_it, subject_nl, body_nl
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      templates.forEach(tpl => tplStmt.run(
        organizationId, tpl.slug, tpl.name, tpl.subject, tpl.body,
        tpl.timing_offset, tpl.timing_unit, tpl.timing_direction, tpl.timing_event, tpl.active, tpl.updated_at || null,
        tpl.subject_en || '', tpl.body_en || '',
        tpl.subject_fr || '', tpl.body_fr || '',
        tpl.subject_es || '', tpl.body_es || '',
        tpl.subject_de || '', tpl.body_de || '',
        tpl.subject_it || '', tpl.body_it || '',
        tpl.subject_nl || '', tpl.body_nl || ''
      ));

      const logStmt = db.prepare(`
        INSERT OR IGNORE INTO organization_email_log (id, organization_id, template_slug, reservation_id, sent_at)
        VALUES (?, ?, ?, ?, COALESCE(?, datetime('now')))
      `);
      logs.forEach(log => logStmt.run(log.id, organizationId, log.template_slug, log.reservation_id, log.sent_at || null));
    } catch {}
  }

  return { migrateOrganizations, migrateUsers, migrateAuthSessions, migrateMemberships, migrateInvitations, migrateOrgScopedTables, hasLegacyOperationalData, migrateLegacyDataToOrganizations, migrateLegacySettings, migrateLegacyEmailTemplates };
};
