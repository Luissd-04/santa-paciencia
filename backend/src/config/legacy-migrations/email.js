// Migrações de compatibilidade; a ordem de execução está em database.js.
const { defaultsList } = require('../emailTemplateDefaults');

module.exports = function createMigrations(db) {
  function migrateOrganizationEmailTemplates() {
    const cols = db.pragma('table_info(organization_email_templates)').map(c => c.name);
    if (!cols.includes('bcc'))          db.exec(`ALTER TABLE organization_email_templates ADD COLUMN bcc TEXT DEFAULT ''`);
    if (!cols.includes('window_start')) db.exec(`ALTER TABLE organization_email_templates ADD COLUMN window_start TEXT`);
    if (!cols.includes('window_end'))   db.exec(`ALTER TABLE organization_email_templates ADD COLUMN window_end TEXT`);

    db.exec(`
      CREATE TABLE IF NOT EXISTS organization_email_queue (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        template_slug TEXT NOT NULL,
        reservation_id TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE (organization_id, template_slug, reservation_id),
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
      );
    `);
  }

  // Acrescenta às tabelas os modelos que ainda não existam — na tabela legacy
  // (fonte usada ao criar organizações) e nas organizações já criadas.
  // INSERT OR IGNORE: um modelo já guardado NUNCA é reescrito aqui, para não
  // apagar textos personalizados no arranque. Aplicar o desenho novo a modelos
  // existentes é feito à parte, por scripts/apply-email-design.cjs.
  function ensureNewEmailTemplateDefaults() {
    const DEFAULTS = defaultsList();

    const insLegacy = db.prepare(`
      INSERT OR IGNORE INTO email_templates (slug,name,subject,body,timing_offset,timing_unit,timing_direction,timing_event,active)
      VALUES (?,?,?,?,?,?,?,?,1)
    `);
    DEFAULTS.forEach(t => insLegacy.run(t.slug, t.name, t.subject, t.body, t.timing_offset, t.timing_unit, t.timing_direction, t.timing_event));

    const orgs = db.prepare('SELECT id FROM organizations').all();
    const insOrg = db.prepare(`
      INSERT OR IGNORE INTO organization_email_templates (
        organization_id, slug, name, subject, body, timing_offset, timing_unit, timing_direction, timing_event, active, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,1,datetime('now'))
    `);
    for (const org of orgs) {
      DEFAULTS.forEach(t => insOrg.run(org.id, t.slug, t.name, t.subject, t.body, t.timing_offset, t.timing_unit, t.timing_direction, t.timing_event));
    }
  }

  function migrateEmailTemplates() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS email_templates (
        slug TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        timing_offset INTEGER DEFAULT 0,
        timing_unit TEXT DEFAULT 'hours',
        timing_direction TEXT DEFAULT 'after',
        timing_event TEXT DEFAULT 'booking',
        active INTEGER DEFAULT 1,
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);

    // Add language columns if they don't exist
    const etCols = db.pragma('table_info(email_templates)').map(c => c.name);
    const langCols = ['en','fr','es','de','it','nl'].flatMap(l => [`subject_${l}`,`body_${l}`]);
    for (const col of langCols) {
      if (!etCols.includes(col)) db.exec(`ALTER TABLE email_templates ADD COLUMN ${col} TEXT DEFAULT ''`);
    }
    db.exec(`
      CREATE TABLE IF NOT EXISTS email_log (
        id TEXT PRIMARY KEY,
        template_slug TEXT NOT NULL,
        reservation_id TEXT NOT NULL,
        sent_at TEXT DEFAULT (datetime('now')),
        UNIQUE(template_slug, reservation_id)
      )
    `);
    [
      ['checkin_time', '15:00'],
      ['checkout_time', '11:00'],
      ['social_facebook', ''],
      ['social_instagram', ''],
      ['social_website', ''],
    ].forEach(([k, v]) => db.prepare('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)').run(k, v));

    if (db.prepare('SELECT COUNT(*) as c FROM email_templates').get().c === 0) {
      seedEmailTemplates();
    }
  }

  function seedEmailTemplates() {
    const ins = db.prepare(`
      INSERT INTO email_templates (slug,name,subject,body,timing_offset,timing_unit,timing_direction,timing_event,active)
      VALUES (?,?,?,?,?,?,?,?,1)
    `);
    defaultsList().forEach(t =>
      ins.run(t.slug, t.name, t.subject, t.body, t.timing_offset, t.timing_unit, t.timing_direction, t.timing_event));
  }

  return { migrateOrganizationEmailTemplates, ensureNewEmailTemplateDefaults, migrateEmailTemplates, seedEmailTemplates };
};
