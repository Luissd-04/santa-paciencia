const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'santapaciencia.db');

const db = new Database(DB_PATH);

const { migrateOrganizations, migrateUsers, migrateAuthSessions, migrateMemberships, migrateInvitations, migrateOrgScopedTables, hasLegacyOperationalData, migrateLegacyDataToOrganizations, migrateLegacySettings, migrateLegacyEmailTemplates } = require('./legacy-migrations/accounts')(db);
const { migrateReservations, migrateGuests, migrateAccommodations } = require('./legacy-migrations/catalog')(db);
const { migrateOrganizationEmailTemplates, ensureNewEmailTemplateDefaults, migrateEmailTemplates, seedEmailTemplates } = require('./legacy-migrations/email')(db);
const { migrateGoogleCalendarConnections, migrateGoogleEmailConnections, migrateInvoiceMessages, migrateGoogleTasksConnections } = require('./legacy-migrations/integrations')(db);
const { migrateExpenses, migrateSuppliers, migrateOperationalEvents, migrateVouchers, migratePricingPeriods, migrateReservationPayments, migrateReservationHistory, migrateAccommodationBlocks, migratePushSubscriptions, migrateConversationArchives } = require('./legacy-migrations/operations')(db);

function initDatabase() {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      organization_id TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      last_seen_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS memberships (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'staff',
      active INTEGER NOT NULL DEFAULT 1,
      invited_by_user_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (invited_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
      UNIQUE (organization_id, user_id)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS invitations (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      email TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'staff',
      token TEXT NOT NULL UNIQUE,
      invited_by_user_id TEXT,
      expires_at TEXT NOT NULL,
      accepted_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
      FOREIGN KEY (invited_by_user_id) REFERENCES users(id) ON DELETE SET NULL
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS organization_settings (
      organization_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (organization_id, key),
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS organization_email_templates (
      organization_id TEXT NOT NULL,
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      timing_offset INTEGER DEFAULT 0,
      timing_unit TEXT DEFAULT 'hours',
      timing_direction TEXT DEFAULT 'after',
      timing_event TEXT DEFAULT 'booking',
      active INTEGER DEFAULT 1,
      updated_at TEXT DEFAULT (datetime('now')),
      subject_en TEXT DEFAULT '',
      body_en TEXT DEFAULT '',
      subject_fr TEXT DEFAULT '',
      body_fr TEXT DEFAULT '',
      subject_es TEXT DEFAULT '',
      body_es TEXT DEFAULT '',
      subject_de TEXT DEFAULT '',
      body_de TEXT DEFAULT '',
      subject_it TEXT DEFAULT '',
      body_it TEXT DEFAULT '',
      subject_nl TEXT DEFAULT '',
      body_nl TEXT DEFAULT '',
      PRIMARY KEY (organization_id, slug),
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS organization_email_log (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      template_slug TEXT NOT NULL,
      reservation_id TEXT NOT NULL,
      sent_at TEXT DEFAULT (datetime('now')),
      UNIQUE (organization_id, template_slug, reservation_id),
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
    );
  `);

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

  // Alojamentos
  db.exec(`
    CREATE TABLE IF NOT EXISTS accommodations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'suite',
      price_per_night REAL NOT NULL DEFAULT 100,
      max_guests INTEGER NOT NULL DEFAULT 2,
      license_number TEXT NOT NULL DEFAULT '12345/AL',
      google_calendar_id TEXT,
      description TEXT,
      address TEXT,
      postal_code TEXT,
      city TEXT,
      region TEXT DEFAULT 'Continente',
      country TEXT DEFAULT 'Portugal',
      area INTEGER,
      num_rooms INTEGER DEFAULT 1,
      num_bathrooms INTEGER DEFAULT 1,
      amenities TEXT DEFAULT '[]',
      cover_image TEXT,
      images TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Hóspedes
  db.exec(`
    CREATE TABLE IF NOT EXISTS guests (
      id TEXT PRIMARY KEY,
      organization_id TEXT,
      name TEXT NOT NULL,
      first_name TEXT,
      last_name TEXT,
      email TEXT NOT NULL,
      phone TEXT,
      birth_date TEXT,
      nif TEXT,
      document_type TEXT,
      document_number TEXT,
      id_type TEXT,
      country TEXT,
      nationality TEXT,
      address TEXT,
      postal_code TEXT,
      city TEXT,
      rgpd_consent INTEGER DEFAULT 0,
      rgpd_consent_date TEXT,
      rgpd_consent_ip TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
    );
  `);

  // Reservas
  db.exec(`
    CREATE TABLE IF NOT EXISTS reservations (
      id TEXT PRIMARY KEY,
      guest_id TEXT NOT NULL,
      accommodation_id TEXT NOT NULL,
      check_in TEXT NOT NULL,
      check_out TEXT NOT NULL,
      nights INTEGER NOT NULL,
      num_guests INTEGER NOT NULL,
      total_amount REAL NOT NULL,
      breakfast_included INTEGER DEFAULT 0,
      tourist_tax REAL DEFAULT 0,
      channel TEXT DEFAULT 'direto',
      status TEXT DEFAULT 'confirmada',
      payment_status TEXT DEFAULT 'pendente',
      payment_method TEXT,
      notes TEXT,
      google_event_id TEXT,
      public_token TEXT,
      arrival_time TEXT,
      precheckin_submitted_at TEXT,
      license_number TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (guest_id) REFERENCES guests(id),
      FOREIGN KEY (accommodation_id) REFERENCES accommodations(id)
    );
  `);

  // Configurações (serviços, taxas, etc.)
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Seed configurações padrão
  const hasSettings = db.prepare("SELECT COUNT(*) as c FROM settings").get();
  if (hasSettings.c === 0) {
    const defaultSettings = [
      { key: 'services', value: JSON.stringify([
        { id: 'breakfast', name: 'Pequeno-almoço', type: 'service', value: 19, unit: '€/pessoa/noite', active: true },
        { id: 'tourist_tax', name: 'Taxa turística', type: 'tax', value: 3, unit: '€/hóspede/noite', active: true }
      ])}
    ];
    const ins = db.prepare("INSERT INTO settings (key, value) VALUES (@key, @value)");
    defaultSettings.forEach(s => ins.run(s));
  }

  // Migração: adicionar colunas novas se não existirem
  migrateOrganizationEmailTemplates();
  migrateAccommodations();
  migrateGuests();
  migrateReservations();
  migrateEmailTemplates();
  migrateExpenses();
  migrateOrganizations();
  migrateUsers();
  migrateAuthSessions();
  migrateMemberships();
  migrateInvitations();
  migrateOrgScopedTables();
  migrateOperationalEvents();
  migrateGoogleCalendarConnections();
  migrateGoogleEmailConnections();
  migrateInvoiceMessages();
  migrateGoogleTasksConnections();
  migrateVouchers();
  migratePricingPeriods();
  migrateConversationArchives();
  migrateReservationPayments();
  migrateReservationHistory();
  migrateAccommodationBlocks();
  migrateSuppliers();
  migratePushSubscriptions();
  migrateLegacyDataToOrganizations();
  const reservationColumns = db.pragma('table_info(reservations)').map(c => c.name);
  if (!reservationColumns.includes('guest_snapshot')) db.exec('ALTER TABLE reservations ADD COLUMN guest_snapshot TEXT');
  require('./migrations').runMigrations(db);
  require('./tokenStorage').protectStoredTokens(db);
  ensureNewEmailTemplateDefaults();

  console.log('✅ Base de dados inicializada');
}

module.exports = { db, initDatabase };
