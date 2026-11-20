// Migrações: Pacotes, limites e contas só de plataforma.
// Cada migração é versionada em schema_migrations, como em ../migrations.js.
//
// plans: limites por pacote (NULL = sem limite) e funcionalidades em JSON.
// organizations.plan_id: NULL = sem pacote, ou seja, sem limites (as
// organizações que já existiam ficam assim).
const SEED = [
  { name: 'Essencial', max_accommodations: 3, max_members: 2, features: { payments: false, reports: 'basic', marketing: false }, sort: 1 },
  { name: 'Profissional', max_accommodations: 10, max_members: 5, features: { payments: true, reports: 'full', marketing: 'optional' }, sort: 2 },
  { name: 'Premium', max_accommodations: null, max_members: null, features: { payments: true, reports: 'full_pdf', marketing: 'included' }, sort: 3 },
];

function migratePlans(db) {
  const id = '20261111_platform_plans';
  if (db.prepare('SELECT 1 FROM schema_migrations WHERE id=?').get(id)) return;
  db.transaction(() => {
    db.exec(`CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      max_accommodations INTEGER CHECK (max_accommodations IS NULL OR max_accommodations >= 0),
      max_members INTEGER CHECK (max_members IS NULL OR max_members >= 0),
      features_json TEXT NOT NULL DEFAULT '{}',
      sort INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    if (!db.pragma('table_info(organizations)').some(c => c.name === 'plan_id')) {
      db.exec('ALTER TABLE organizations ADD COLUMN plan_id TEXT REFERENCES plans(id) ON DELETE SET NULL');
    }
    db.exec('CREATE INDEX IF NOT EXISTS idx_organizations_plan ON organizations(plan_id)');
    const insert = db.prepare('INSERT OR IGNORE INTO plans (id, name, max_accommodations, max_members, features_json, sort) VALUES (?, ?, ?, ?, ?, ?)');
    for (const plan of SEED) {
      insert.run(require('crypto').randomUUID(), plan.name, plan.max_accommodations, plan.max_members, JSON.stringify(plan.features), plan.sort);
    }
    db.prepare('INSERT INTO schema_migrations(id) VALUES(?)').run(id);
  }).immediate();
}

module.exports = function migrate(db) {
  migratePlans(db);
};
module.exports.SEED = SEED;
