// Percurso do hóspede (19/11/2026): pedido sempre por aprovar, sinal com prazo
// depois de aceite, emails revistos e dados do alojamento usados nos emails.
// Cada parte tem a sua marca em schema_migrations.
const has = (db, table, column) => db.pragma(`table_info(${table})`).some(c => c.name === column);
const done = (db, id) => Boolean(db.prepare('SELECT 1 FROM schema_migrations WHERE id = ?').get(id));
const mark = (db, id) => db.prepare('INSERT INTO schema_migrations(id) VALUES (?)').run(id);

// Prazo do sinal: definido ao aceitar o pedido (reservationLifecycle.approve).
function depositDeadline(db) {
  const id = '20261119_deposit_deadline';
  if (done(db, id)) return;
  db.transaction(() => {
    if (!has(db, 'reservations', 'deposit_deadline')) db.exec('ALTER TABLE reservations ADD COLUMN deposit_deadline TEXT');
    mark(db, id);
  }).immediate();
}

// Dados do alojamento usados nos emails ao hóspede, e o fim da licença
// fictícia «12345/AL» que o esquema punha por omissão (chegava às reservas e
// ao rodapé dos emails como se fosse real).
function accommodationGuestInfo(db) {
  const id = '20261119_accommodation_guest_info';
  if (done(db, id)) return;
  db.transaction(() => {
    for (const column of ['contact_email', 'contact_phone', 'arrival_instructions', 'entry_instructions', 'checkout_instructions', 'review_url']) {
      if (!has(db, 'accommodations', column)) db.exec(`ALTER TABLE accommodations ADD COLUMN ${column} TEXT`);
    }
    if (!has(db, 'accommodations', 'no_wifi')) db.exec('ALTER TABLE accommodations ADD COLUMN no_wifi INTEGER NOT NULL DEFAULT 0');
    db.exec("UPDATE accommodations SET license_number = '' WHERE license_number = '12345/AL'");
    db.exec("UPDATE reservations SET license_number = NULL WHERE license_number = '12345/AL'");
    mark(db, id);
  }).immediate();
}

// Emails ao hóspede revistos: os modelos guardados passam ao texto novo (com
// cópia da versão anterior em organization_email_templates_backup, como em
// 20261028_email_design); «Boas-vindas» e «Lembrete de check-out» ficam
// desligados, porque o conteúdo passou para «Tudo para a sua chegada»; o
// pré-check-in avulso passa a ser enviado só pela equipa. «Reserva aceite» é
// um modelo novo: entra pelo ensureNewEmailTemplateDefaults do arranque.
const CHANGED = ['pre_checkin', 'coordenadas', 'cancelamento', 'pagamento', 'obrigado', 'apos_checkin'];
function guestEmails(db) {
  const id = '20261119_guest_emails';
  if (done(db, id)) return;
  const tables = ['organization_email_templates', 'email_templates']
    .filter(name => db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
  db.transaction(() => {
    const { defaultsList, INACTIVE } = require('./emailTemplateDefaults');
    const defaults = new Map(defaultsList().map(t => [t.slug, t]));
    if (tables.includes('organization_email_templates')) {
      const design = require('../services/emailDesign');
      for (const { id: orgId } of db.prepare('SELECT id FROM organizations').all()) design.apply(db, orgId, { slugs: CHANGED, reason: id });
    }
    for (const table of tables) {
      if (table === 'email_templates') {
        const update = db.prepare('UPDATE email_templates SET name = ?, subject = ?, body = ? WHERE slug = ?');
        for (const slug of CHANGED) { const t = defaults.get(slug); update.run(t.name, t.subject, t.body, slug); }
      }
      db.prepare(`UPDATE ${table} SET name = ? WHERE slug = 'confirmacao'`).run(defaults.get('confirmacao').name);
      db.prepare(`UPDATE ${table} SET timing_event = 'manual' WHERE slug = 'pre_checkin'`).run();
      for (const slug of INACTIVE) db.prepare(`UPDATE ${table} SET active = 0 WHERE slug = ?`).run(slug);
    }
    mark(db, id);
  }).immediate();
}

// Emails ao hóspede retidos por faltarem dados do alojamento (emailReadiness).
// Ficam à espera de quem os resolva no sino: enviar ou ignorar.
function emailHolds(db) {
  const id = '20261119_email_holds';
  if (done(db, id)) return;
  db.transaction(() => {
    db.exec(`CREATE TABLE IF NOT EXISTS email_holds (
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      reservation_id TEXT NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
      template_slug TEXT NOT NULL,
      missing TEXT NOT NULL DEFAULT '[]',
      extra TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at TEXT,
      resolution TEXT,
      PRIMARY KEY (organization_id, reservation_id, template_slug)
    );
    CREATE INDEX IF NOT EXISTS idx_email_holds_open ON email_holds(organization_id, resolved_at);`);
    mark(db, id);
  }).immediate();
}

// Portal do hóspede (23/11/2026): quando o hóspede abriu a página da reserva
// (/reserva/:token) pela primeira e pela última vez. Só conta o hóspede: a
// equipa com sessão na organização não é registada (services/guestPortal.js).
function guestPortalOpens(db) {
  const id = '20261123_guest_portal_opens';
  if (done(db, id)) return;
  db.transaction(() => {
    for (const column of ['portal_first_opened_at', 'portal_last_opened_at']) {
      if (!has(db, 'reservations', column)) db.exec(`ALTER TABLE reservations ADD COLUMN ${column} TEXT`);
    }
    mark(db, id);
  }).immediate();
}

// Dinheiro numa reserva cancelada sem política de pagamento: a equipa decide
// reembolsar ou reter (services/cancelledMoney). Guarda a decisão e o motivo.
function cancelledMoney(db) {
  const id = '20261125_cancelled_money';
  if (done(db, id)) return;
  db.transaction(() => {
    for (const column of ['money_resolution', 'money_resolution_note', 'money_resolved_at']) {
      if (!has(db, 'reservations', column)) db.exec(`ALTER TABLE reservations ADD COLUMN ${column} TEXT`);
    }
    mark(db, id);
  }).immediate();
}

// Email «Cancelamento com reembolso»: passa a incluir as datas e a dizer para
// onde vai o dinheiro e quando costuma chegar (auditoria de 25/11). Só os
// modelos ainda iguais ao texto anterior são atualizados (com cópia em
// organization_email_templates_backup); um modelo editado pela organização
// não se toca.
function cancellationRefundText(db) {
  const id = '20261125_cancel_refund_text';
  if (done(db, id)) return;
  db.transaction(() => {
    const { defaultsList } = require('./emailTemplateDefaults');
    const novo = defaultsList().find(t => t.slug === 'cancelamento_politica');
    // O texto anterior: o novo sem as datas e sem a frase do prazo.
    const frase = /<p [^>]*>Se houver valor a devolver[^<]*<\/p>/;
    const antigo = novo.body.replace(frase, '').replace(' ({{datas_curtas}}) foi cancelada', ' foi cancelada');
    const has = name => db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
    if (has('organization_email_templates')) {
      require('../services/emailDesign').ensureBackupTable(db);
      const backup = db.prepare(`INSERT INTO organization_email_templates_backup (organization_id, slug, name, subject, body, reason)
        SELECT organization_id, slug, name, subject, body, ? FROM organization_email_templates WHERE slug = ? AND body = ?`);
      backup.run(id, novo.slug, antigo);
      db.prepare("UPDATE organization_email_templates SET body = ?, updated_at = datetime('now') WHERE slug = ? AND body = ?").run(novo.body, novo.slug, antigo);
    }
    if (has('email_templates')) db.prepare('UPDATE email_templates SET body = ? WHERE slug = ? AND body = ?').run(novo.body, novo.slug, antigo);
    mark(db, id);
  }).immediate();
}

// Email «Cancelamento da reserva»: o assunto passa a depender do motivo
// («Pedido não aceite» quando a equipa recusa um pedido por aprovar). Só os
// modelos com o assunto anterior se atualizam (com cópia em
// organization_email_templates_backup); um assunto editado não se toca.
function cancellationSubject(db) {
  const id = '20261125_cancel_subject';
  if (done(db, id)) return;
  db.transaction(() => {
    const { defaultsList } = require('./emailTemplateDefaults');
    const novo = defaultsList().find(t => t.slug === 'cancelamento');
    const antigo = 'Reserva cancelada — {{alojamento}}';
    const has = name => db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
    if (has('organization_email_templates')) {
      require('../services/emailDesign').ensureBackupTable(db);
      db.prepare(`INSERT INTO organization_email_templates_backup (organization_id, slug, name, subject, body, reason)
        SELECT organization_id, slug, name, subject, body, ? FROM organization_email_templates WHERE slug = 'cancelamento' AND subject = ?`).run(id, antigo);
      db.prepare("UPDATE organization_email_templates SET subject = ?, updated_at = datetime('now') WHERE slug = 'cancelamento' AND subject = ?").run(novo.subject, antigo);
    }
    if (has('email_templates')) db.prepare("UPDATE email_templates SET subject = ? WHERE slug = 'cancelamento' AND subject = ?").run(novo.subject, antigo);
    mark(db, id);
  }).immediate();
}

// O link do pré-check-in expira na saída atual da reserva (e não na original).
function precheckinExpiry(db) {
  const id = '20261125_precheckin_expiry';
  if (done(db, id)) return;
  db.transaction(() => {
    db.exec(`UPDATE reservations SET precheckin_token_expires_at = check_out
      WHERE precheckin_token IS NOT NULL AND precheckin_token_expires_at IS NOT NULL AND check_out IS NOT NULL AND precheckin_token_expires_at != check_out`);
    mark(db, id);
  }).immediate();
}

module.exports = db => {
  depositDeadline(db);
  accommodationGuestInfo(db);
  guestEmails(db);
  emailHolds(db);
  guestPortalOpens(db);
  cancelledMoney(db);
  precheckinExpiry(db);
  cancellationRefundText(db);
  cancellationSubject(db);
};
