// Numeração dos pedidos de suporte por organização: cada cliente vê SP-0001,
// SP-0002… sem saber o volume total da plataforma. A coluna `number` global
// mantém-se (a consola usa-a para identificar o pedido sem ambiguidade).
module.exports = db => {
  const id = '20261114_support_org_number';
  if (db.prepare('SELECT 1 FROM schema_migrations WHERE id = ?').get(id)) return;
  db.transaction(() => {
    if (!db.pragma('table_info(support_tickets)').some(c => c.name === 'org_number')) {
      db.exec('ALTER TABLE support_tickets ADD COLUMN org_number INTEGER');
    }
    // Mudança de estado notificada ao cliente (conta como «não lido» sem mensagem nova).
    if (!db.pragma('table_info(support_tickets)').some(c => c.name === 'status_notified_at')) {
      db.exec('ALTER TABLE support_tickets ADD COLUMN status_notified_at TEXT');
    }
    db.exec(`UPDATE support_tickets SET org_number = (
      SELECT rn FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY organization_id ORDER BY number, created_at, id) AS rn FROM support_tickets) x
      WHERE x.id = support_tickets.id) WHERE org_number IS NULL`);
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_support_tickets_org_number ON support_tickets(organization_id, org_number)');
    db.prepare('INSERT INTO schema_migrations(id) VALUES (?)').run(id);
  })();
};
