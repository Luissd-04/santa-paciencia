// Área do proprietário (/proprietario): dados da empresa e marca da
// organização, transferências de propriedade e pedidos à plataforma (mudança
// de plano, encerramento). Versionada em schema_migrations, como as outras.
//
// Os dados da empresa e da marca são colunas de `organizations` (e não chaves
// de organization_settings): identificam o cliente perante a plataforma e na
// faturação, por isso não mudam quando se restaura uma cópia de segurança
// antiga (o restauro substitui organization_settings). O email de contacto
// para hóspedes continua a ser a chave `email_contact`, que os emails já leem.
const COLUMNS = [
  ['legal_name', 'TEXT'],
  ['tax_id', 'TEXT'],
  ['tax_country', "TEXT NOT NULL DEFAULT 'PT'"],
  ['fiscal_address', 'TEXT'],
  ['billing_email', 'TEXT'],
  ['phone', 'TEXT'],
  ['logo_url', 'TEXT'],
  ['logo_original_url', 'TEXT'],
  ['logo_crop', 'TEXT'],
  ['logo_square_crop', 'TEXT'],
  ['brand_color', 'TEXT'],
];

module.exports = db => {
  const id = '20261123_owner_area';
  if (db.prepare('SELECT 1 FROM schema_migrations WHERE id = ?').get(id)) return;
  db.transaction(() => {
    const existing = new Set(db.pragma('table_info(organizations)').map(c => c.name));
    for (const [name, type] of COLUMNS) {
      if (!existing.has(name)) db.exec(`ALTER TABLE organizations ADD COLUMN ${name} ${type}`);
    }
    // Uma transferência pendente por organização; o token só existe em resumo.
    db.exec(`CREATE TABLE IF NOT EXISTS ownership_transfers (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      from_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      to_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      expires_at TEXT NOT NULL,
      resolved_at TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ownership_transfer_pending ON ownership_transfers(organization_id) WHERE status = 'pending';
    CREATE INDEX IF NOT EXISTS idx_ownership_transfer_target ON ownership_transfers(to_user_id, status);
    -- Pedidos à plataforma feitos na Área do proprietário. O pedido em si é um
    -- pedido de suporte; aqui fica só o tipo, para haver um aberto de cada vez.
    CREATE TABLE IF NOT EXISTS owner_requests (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('plan_change', 'closure')),
      ticket_id TEXT REFERENCES support_tickets(id) ON DELETE SET NULL,
      plan_id TEXT REFERENCES plans(id) ON DELETE SET NULL,
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    CREATE INDEX IF NOT EXISTS idx_owner_requests_org ON owner_requests(organization_id, kind, created_at);`);
    db.prepare('INSERT INTO schema_migrations(id) VALUES (?)').run(id);
  })();
};
