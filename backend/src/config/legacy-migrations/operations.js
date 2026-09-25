// Migrações de compatibilidade; a ordem de execução está em database.js.
module.exports = function createMigrations(db) {
  function migrateExpenses() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        description TEXT NOT NULL,
        category TEXT DEFAULT 'outro',
        amount REAL NOT NULL,
        payment_method TEXT DEFAULT 'numerário',
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);
    const cols = db.pragma('table_info(expenses)').map(c => c.name);
    if (!cols.includes('invoice_ref')) db.exec('ALTER TABLE expenses ADD COLUMN invoice_ref TEXT');
    if (!cols.includes('supplier')) db.exec('ALTER TABLE expenses ADD COLUMN supplier TEXT');
    if (!cols.includes('receipt_image')) db.exec('ALTER TABLE expenses ADD COLUMN receipt_image TEXT');
    if (!cols.includes('has_nif')) db.exec('ALTER TABLE expenses ADD COLUMN has_nif INTEGER DEFAULT 0');
  }

  function migrateSuppliers() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_suppliers_org ON suppliers(organization_id);
    `);
  }

  function migrateOperationalEvents() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS operational_events (
        id TEXT PRIMARY KEY,
        organization_id TEXT,
        title TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'outro',
        date TEXT NOT NULL,
        start_time TEXT,
        end_time TEXT,
        accommodation_id TEXT,
        status TEXT NOT NULL DEFAULT 'planeado',
        responsible TEXT,
        notes TEXT,
        reservation_id TEXT,
        created_by_user_id TEXT,
        completed_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
        FOREIGN KEY (accommodation_id) REFERENCES accommodations(id) ON DELETE SET NULL,
        FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    const existing = db.pragma('table_info(operational_events)').map(c => c.name);
    const cols = [
      ['organization_id', 'TEXT'],
      ['start_time', 'TEXT'],
      ['end_time', 'TEXT'],
      ['accommodation_id', 'TEXT'],
      ['responsible', 'TEXT'],
      ['notes', 'TEXT'],
      ['reservation_id', 'TEXT'],
      ['created_by_user_id', 'TEXT'],
      ['completed_at', 'TEXT'],
      ['auto_generated', 'INTEGER NOT NULL DEFAULT 0'],
      ['auto_kind', 'TEXT'],
      ['auto_key', 'TEXT'],
      ['important', 'INTEGER NOT NULL DEFAULT 0'],
      ['updated_at', "TEXT DEFAULT (datetime('now'))"],
      ['google_event_id', 'TEXT'],
      ['google_calendar_user_id', 'TEXT'],
    ];
    for (const [col, type] of cols) {
      if (!existing.includes(col)) db.exec(`ALTER TABLE operational_events ADD COLUMN ${col} ${type}`);
    }
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_operational_events_auto_key
      ON operational_events (organization_id, auto_key)
      WHERE auto_key IS NOT NULL
    `);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_operational_events_reservation_kind
      ON operational_events (reservation_id, auto_kind)
    `);
  }


  function migrateVouchers() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS vouchers (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        code TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'discount_pct',
        value REAL NOT NULL,
        description TEXT,
        valid_from TEXT,
        valid_until TEXT,
        min_nights INTEGER DEFAULT 1,
        accommodation_id TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        used_at TEXT,
        used_in_reservation_id TEXT,
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
      )
    `);
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_vouchers_org_code ON vouchers (organization_id, code)`);
  }

  function migratePricingPeriods() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS pricing_periods (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        accommodation_id TEXT NOT NULL,
        name TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        price_per_night REAL NOT NULL,
        min_nights INTEGER DEFAULT 1,
        days_of_week TEXT DEFAULT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
        FOREIGN KEY (accommodation_id) REFERENCES accommodations(id) ON DELETE CASCADE
      )
    `);
    const ppCols = db.pragma('table_info(pricing_periods)').map(c => c.name);
    if (!ppCols.includes('days_of_week')) {
      db.exec(`ALTER TABLE pricing_periods ADD COLUMN days_of_week TEXT DEFAULT NULL`);
    }
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_pricing_periods_acc
      ON pricing_periods (accommodation_id, organization_id)
    `);
  }

  function migrateReservationPayments() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS reservation_payments (
        id TEXT PRIMARY KEY,
        reservation_id TEXT NOT NULL,
        organization_id TEXT NOT NULL,
        amount REAL NOT NULL,
        method TEXT,
        payment_date TEXT,
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_rp_reservation ON reservation_payments(reservation_id);
    `);
    // Migrate existing amount_paid from reservations into payment rows (run once)
    const toMigrate = db.prepare(`
      SELECT r.id, r.organization_id, r.amount_paid, r.payment_date, r.payment_method
      FROM reservations r
      LEFT JOIN reservation_payments rp ON rp.reservation_id = r.id
      WHERE r.amount_paid > 0 AND rp.id IS NULL
    `).all();
    const ins = db.prepare(`
      INSERT OR IGNORE INTO reservation_payments (id, reservation_id, organization_id, amount, method, payment_date)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const r of toMigrate) {
      ins.run(`rp-${r.id}-legacy`, r.id, r.organization_id, r.amount_paid, r.payment_method, r.payment_date);
    }
  }

  // Timeline da reserva: registo de tudo o que foi feito/alterado e por quem.
  // Sem FK em reservation_id — apagar definitivamente uma reserva limpa as
  // entradas via hardDelete (mesmo padrão de reservation_payments).
  function migrateReservationHistory() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS reservation_history (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        reservation_id TEXT NOT NULL,
        user_id TEXT,
        action TEXT NOT NULL,
        changes TEXT,
        meta TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_res_history_res
      ON reservation_history (reservation_id, organization_id, created_at);
    `);
  }

  function migrateAccommodationBlocks() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS accommodation_blocks (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        accommodation_id TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        reason TEXT,
        created_by_user_id TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
        FOREIGN KEY (accommodation_id) REFERENCES accommodations(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_ab_org_accom ON accommodation_blocks(organization_id, accommodation_id);
      CREATE INDEX IF NOT EXISTS idx_ab_dates ON accommodation_blocks(start_date, end_date);
    `);
  }

  function migratePushSubscriptions() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id              TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        user_id         TEXT NOT NULL,
        endpoint        TEXT NOT NULL UNIQUE,
        keys_json       TEXT NOT NULL,
        device_name     TEXT,
        active          INTEGER NOT NULL DEFAULT 1,
        created_at      TEXT DEFAULT (datetime('now')),
        updated_at      TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_push_subs_org ON push_subscriptions(organization_id);
      CREATE INDEX IF NOT EXISTS idx_push_subs_org_user ON push_subscriptions(organization_id, user_id);
    `);
    const existing = db.pragma('table_info(push_subscriptions)').map(c => c.name);
    const cols = [
      ['device_name', 'TEXT'],
      ['active', 'INTEGER NOT NULL DEFAULT 1'],
    ];
    for (const [col, type] of cols) {
      if (!existing.includes(col)) db.exec(`ALTER TABLE push_subscriptions ADD COLUMN ${col} ${type}`);
    }
  }

  function migrateConversationArchives() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS conversation_archives (
        id              TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        thread_key      TEXT NOT NULL,
        key_type        TEXT NOT NULL DEFAULT 'reservation',
        archived_at     TEXT DEFAULT (datetime('now')),
        UNIQUE (organization_id, thread_key)
      )
    `);
  }

  return { migrateExpenses, migrateSuppliers, migrateOperationalEvents, migrateVouchers, migratePricingPeriods, migrateReservationPayments, migrateReservationHistory, migrateAccommodationBlocks, migratePushSubscriptions, migrateConversationArchives };
};
