#!/usr/bin/env node
// Aplica o desenho novo aos modelos de email JÁ GUARDADOS de uma organização.
//
// O arranque da aplicação nunca faz isto: as migrações usam INSERT OR IGNORE e
// por isso não tocam em textos personalizados. Substituir o texto de uma
// organização é uma decisão do utilizador, e é este script que a executa.
//
// Antes de escrever, a versão atual de cada modelo é copiada para
// organization_email_templates_backup. Nada é perdido, e --restore repõe.
//
//   node scripts/apply-email-design.cjs --list
//   node scripts/apply-email-design.cjs --org=<id> --dry-run
//   node scripts/apply-email-design.cjs --org=<id>
//   node scripts/apply-email-design.cjs --org=<id> --slugs=confirmacao,apos_checkin
//   node scripts/apply-email-design.cjs --org=<id> --restore
//
// --all aplica a todas as organizações e exige --confirm, para não acontecer
// por engano. As traduções (subject_en/body_en/…) NÃO são tocadas: não há
// versões traduzidas do desenho novo, e apagá-las perderia trabalho.

const path = require('path');

const args = process.argv.slice(2);
const flag = name => args.some(a => a === `--${name}`);
const value = name => {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

process.env.DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '../data/santapaciencia.db');

const { db } = require('../config/database');
const { defaultsList } = require('../config/emailTemplateDefaults');

function ensureBackupTable() {
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

function listOrganizations() {
  const rows = db.prepare(`
    SELECT o.id, o.name, COUNT(t.slug) AS modelos
    FROM organizations o
    LEFT JOIN organization_email_templates t ON t.organization_id = o.id
    GROUP BY o.id ORDER BY o.name
  `).all();
  for (const r of rows) console.log(`${r.id}  ${r.modelos} modelos  ${r.name}`);
}

function restore(orgId, slugs) {
  ensureBackupTable();
  // A cópia mais recente de cada slug.
  const rows = db.prepare(`
    SELECT b.* FROM organization_email_templates_backup b
    JOIN (
      SELECT slug, MAX(id) AS id FROM organization_email_templates_backup
      WHERE organization_id = ? GROUP BY slug
    ) last ON last.id = b.id
  `).all(orgId).filter(r => !slugs || slugs.includes(r.slug));

  if (!rows.length) { console.log('Sem cópias guardadas para esta organização.'); return; }

  const upd = db.prepare(`UPDATE organization_email_templates
    SET name = ?, subject = ?, body = ?, updated_at = datetime('now')
    WHERE organization_id = ? AND slug = ?`);
  db.transaction(() => {
    for (const r of rows) upd.run(r.name, r.subject, r.body, orgId, r.slug);
  })();
  console.log(`Reposto o texto anterior de ${rows.length} modelo(s) em ${orgId}.`);
}

function apply(orgId, slugs, dryRun) {
  ensureBackupTable();
  const defaults = defaultsList().filter(t => !slugs || slugs.includes(t.slug));
  if (!defaults.length) { console.log('Nenhum modelo corresponde a --slugs.'); return; }

  const current = db.prepare('SELECT * FROM organization_email_templates WHERE organization_id = ?').all(orgId);
  const bySlug = new Map(current.map(t => [t.slug, t]));
  if (!current.length) { console.log(`A organização ${orgId} não tem modelos guardados.`); return; }

  const changes = defaults
    .filter(d => bySlug.has(d.slug))
    .map(d => ({ novo: d, atual: bySlug.get(d.slug) }))
    .filter(c => c.atual.subject !== c.novo.subject || c.atual.body !== c.novo.body);

  if (!changes.length) { console.log('Nada a alterar: já está no desenho novo.'); return; }

  for (const c of changes) {
    console.log(`\n── ${c.novo.slug}`);
    console.log(`   assunto antes : ${c.atual.subject}`);
    console.log(`   assunto depois: ${c.novo.subject}`);
    console.log(`   corpo: ${c.atual.body.length} → ${c.novo.body.length} caracteres`);
    const traduzidos = ['en', 'fr', 'es', 'de', 'it', 'nl'].filter(l => (c.atual[`body_${l}`] || '').trim());
    if (traduzidos.length) console.log(`   traduções preservadas: ${traduzidos.join(', ')}`);
  }

  if (dryRun) { console.log(`\n--dry-run: ${changes.length} modelo(s) seriam alterados. Nada foi escrito.`); return; }

  const ins = db.prepare(`INSERT INTO organization_email_templates_backup
    (organization_id, slug, name, subject, body, reason) VALUES (?,?,?,?,?,?)`);
  const upd = db.prepare(`UPDATE organization_email_templates
    SET name = ?, subject = ?, body = ?, updated_at = datetime('now')
    WHERE organization_id = ? AND slug = ?`);

  db.transaction(() => {
    for (const c of changes) {
      ins.run(orgId, c.atual.slug, c.atual.name, c.atual.subject, c.atual.body, 'apply-email-design');
      upd.run(c.novo.name, c.novo.subject, c.novo.body, orgId, c.novo.slug);
    }
  })();

  console.log(`\n${changes.length} modelo(s) atualizados em ${orgId}. Versão anterior guardada.`);
  console.log(`Para reverter: node scripts/apply-email-design.cjs --org=${orgId} --restore`);
}

function main() {
  if (flag('list')) return listOrganizations();

  const slugsArg = value('slugs');
  const slugs = slugsArg ? slugsArg.split(',').map(s => s.trim()).filter(Boolean) : null;
  const orgId = value('org');

  let targets;
  if (flag('all')) {
    if (!flag('confirm') && !flag('dry-run')) {
      console.error('--all altera todas as organizações: junta --confirm (ou usa --dry-run primeiro).');
      process.exit(1);
    }
    targets = db.prepare('SELECT id FROM organizations').all().map(r => r.id);
  } else if (orgId) {
    targets = [orgId];
  } else {
    console.error('Indica --org=<id>, ou --all, ou --list. Ver o cabeçalho do ficheiro.');
    process.exit(1);
  }

  for (const id of targets) {
    const org = db.prepare('SELECT id, name FROM organizations WHERE id = ?').get(id);
    if (!org) { console.error(`Organização desconhecida: ${id}`); process.exit(1); }
    console.log(`\n=== ${org.name} (${org.id}) ===`);
    if (flag('restore')) restore(org.id, slugs);
    else apply(org.id, slugs, flag('dry-run'));
  }
}

main();
