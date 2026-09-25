// Migrações de compatibilidade; a ordem de execução está em database.js.
module.exports = function createMigrations(db) {
  function migrateGoogleCalendarConnections() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS google_calendar_connections (
        organization_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        tokens TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (organization_id, user_id),
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
  }

  function migrateGoogleEmailConnections() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS google_email_connections (
        organization_id TEXT NOT NULL PRIMARY KEY,
        email           TEXT,
        tokens          TEXT NOT NULL,
        created_at      TEXT DEFAULT (datetime('now')),
        updated_at      TEXT DEFAULT (datetime('now'))
      )
    `);
  }

  function migrateInvoiceMessages() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS invoice_messages (
        id                     TEXT PRIMARY KEY,
        organization_id        TEXT NOT NULL,
        to_email               TEXT NOT NULL,
        to_name                TEXT,
        subject                TEXT NOT NULL,
        body_html              TEXT NOT NULL,
        reservation_id         TEXT,
        sent_by_user_id        TEXT,
        sent_at                TEXT DEFAULT (datetime('now')),
        gmail_message_id       TEXT,
        gmail_thread_id        TEXT,
        message_id_header      TEXT,
        in_reply_to_message_id TEXT,
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
        FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE SET NULL
      )
    `);

    // Threading real com o Gmail (S12): guardar os ids devolvidos pela Gmail API
    // e o Message-ID gerado por nós ao enviar, para conseguirmos responder de
    // forma encadeada mais tarde (In-Reply-To/References + threadId).
    const existing = db.pragma('table_info(invoice_messages)').map(c => c.name);
    const newCols = [
      ['gmail_message_id',       'TEXT'],
      ['gmail_thread_id',        'TEXT'],
      ['message_id_header',      'TEXT'],
      ['in_reply_to_message_id', 'TEXT'],
    ];
    for (const [col, type] of newCols) {
      if (!existing.includes(col)) db.exec(`ALTER TABLE invoice_messages ADD COLUMN ${col} ${type}`);
    }
  }

  function migrateGoogleTasksConnections() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS google_tasks_connections (
        organization_id TEXT NOT NULL PRIMARY KEY,
        email           TEXT,
        tokens          TEXT NOT NULL,
        tasks_list_id   TEXT,
        created_at      TEXT DEFAULT (datetime('now')),
        updated_at      TEXT DEFAULT (datetime('now'))
      )
    `);

    const existing = db.pragma('table_info(operational_events)').map(c => c.name);
    if (!existing.includes('google_task_id')) {
      db.exec('ALTER TABLE operational_events ADD COLUMN google_task_id TEXT');
    }
  }

  return { migrateGoogleCalendarConnections, migrateGoogleEmailConnections, migrateInvoiceMessages, migrateGoogleTasksConnections };
};
