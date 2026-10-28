// Aplicar o desenho dos modelos por omissão aos modelos JÁ GUARDADOS de uma
// organização, e repor a versão anterior. Usado pelas migrações de um desenho
// novo e por scripts/apply-email-design.cjs.
//
// Antes de escrever, a versão atual de cada modelo é copiada para
// organization_email_templates_backup: nada se perde e restore() repõe.
// As traduções (subject_en/body_en/…) não são tocadas: não há versões
// traduzidas do desenho novo, e apagá-las perderia trabalho.
const { defaultsList } = require('../config/emailTemplateDefaults');

function ensureBackupTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS organization_email_templates_backup (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id TEXT NOT NULL,
      slug TEXT NOT NULL,
      name TEXT,
      subject TEXT,
      body TEXT,
      taken_at TEXT DEFAULT (datetime('now')),
      reason TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_oetb_org_slug ON organization_email_templates_backup (organization_id, slug, taken_at);
  `);
}

// Modelos guardados que diferem do desenho por omissão: [{ novo, atual }].
function pendingChanges(db, orgId, slugs = null) {
  const defaults = defaultsList().filter(t => !slugs || slugs.includes(t.slug));
  const current = new Map(db.prepare('SELECT * FROM organization_email_templates WHERE organization_id = ?').all(orgId).map(t => [t.slug, t]));
  return defaults
    .filter(d => current.has(d.slug))
    .map(d => ({ novo: d, atual: current.get(d.slug) }))
    .filter(c => c.atual.subject !== c.novo.subject || c.atual.body !== c.novo.body);
}

// Escreve o desenho novo (com cópia da versão anterior). Devolve as alterações.
function apply(db, orgId, { slugs = null, reason = 'apply-email-design' } = {}) {
  ensureBackupTable(db);
  const changes = pendingChanges(db, orgId, slugs);
  if (!changes.length) return changes;
  const backup = db.prepare(`INSERT INTO organization_email_templates_backup
    (organization_id, slug, name, subject, body, reason) VALUES (?,?,?,?,?,?)`);
  const update = db.prepare(`UPDATE organization_email_templates
    SET name = ?, subject = ?, body = ?, updated_at = datetime('now')
    WHERE organization_id = ? AND slug = ?`);
  db.transaction(() => {
    for (const { novo, atual } of changes) {
      backup.run(orgId, atual.slug, atual.name, atual.subject, atual.body, reason);
      update.run(novo.name, novo.subject, novo.body, orgId, novo.slug);
    }
  })();
  return changes;
}

// Repõe a cópia mais recente de cada modelo. Devolve quantos repôs.
function restore(db, orgId, { slugs = null } = {}) {
  ensureBackupTable(db);
  const rows = db.prepare(`
    SELECT b.* FROM organization_email_templates_backup b
    JOIN (
      SELECT slug, MAX(id) AS id FROM organization_email_templates_backup
      WHERE organization_id = ? GROUP BY slug
    ) last ON last.id = b.id
  `).all(orgId).filter(r => !slugs || slugs.includes(r.slug));
  const update = db.prepare(`UPDATE organization_email_templates
    SET name = ?, subject = ?, body = ?, updated_at = datetime('now')
    WHERE organization_id = ? AND slug = ?`);
  db.transaction(() => { for (const r of rows) update.run(r.name, r.subject, r.body, orgId, r.slug); })();
  return rows.length;
}

module.exports = { ensureBackupTable, pendingChanges, apply, restore };
