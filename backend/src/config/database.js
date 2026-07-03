const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'santapaciencia.db');

const db = new Database(DB_PATH);

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
  migrateAccommodationBlocks();
  migrateLegacyDataToOrganizations();

  console.log('✅ Base de dados inicializada');
}

function migrateOrganizations() {
  const existing = db.pragma('table_info(organizations)').map(c => c.name);
  const cols = [
    ['updated_at', "TEXT DEFAULT (datetime('now'))"],
  ];
  for (const [col, type] of cols) {
    if (!existing.includes(col)) db.exec(`ALTER TABLE organizations ADD COLUMN ${col} ${type}`);
  }
}

function migrateUsers() {
  const existing = db.pragma('table_info(users)').map(c => c.name);
  const cols = [
    ['role', "TEXT NOT NULL DEFAULT 'admin'"],
    ['active', 'INTEGER NOT NULL DEFAULT 1'],
    ['updated_at', "TEXT DEFAULT (datetime('now'))"],
  ];
  for (const [col, type] of cols) {
    if (!existing.includes(col)) {
      db.exec(`ALTER TABLE users ADD COLUMN ${col} ${type}`);
    }
  }
}

function migrateAuthSessions() {
  const existing = db.pragma('table_info(auth_sessions)').map(c => c.name);
  const cols = [
    ['organization_id', 'TEXT'],
    ['last_seen_at', "TEXT DEFAULT (datetime('now'))"],
  ];
  for (const [col, type] of cols) {
    if (!existing.includes(col)) {
      db.exec(`ALTER TABLE auth_sessions ADD COLUMN ${col} ${type}`);
    }
  }
}

function migrateMemberships() {
  const existing = db.pragma('table_info(memberships)').map(c => c.name);
  const cols = [
    ['active', 'INTEGER NOT NULL DEFAULT 1'],
    ['invited_by_user_id', 'TEXT'],
    ['updated_at', "TEXT DEFAULT (datetime('now'))"],
  ];
  for (const [col, type] of cols) {
    if (!existing.includes(col)) db.exec(`ALTER TABLE memberships ADD COLUMN ${col} ${type}`);
  }
}

function migrateInvitations() {
  const existing = db.pragma('table_info(invitations)').map(c => c.name);
  const cols = [
    ['accepted_at', 'TEXT'],
  ];
  for (const [col, type] of cols) {
    if (!existing.includes(col)) db.exec(`ALTER TABLE invitations ADD COLUMN ${col} ${type}`);
  }
}

function migrateOrgScopedTables() {
  const tableColumns = [
    ['accommodations', 'organization_id', 'TEXT'],
    ['guests', 'organization_id', 'TEXT'],
    ['reservations', 'organization_id', 'TEXT'],
    ['expenses', 'organization_id', 'TEXT'],
  ];
  for (const [table, col, type] of tableColumns) {
    const existing = db.pragma(`table_info(${table})`).map(c => c.name);
    if (!existing.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
  }
}

function hasLegacyOperationalData() {
  const tables = ['accommodations', 'guests', 'reservations', 'expenses'];
  return tables.some(table => {
    try {
      return db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get().c > 0;
    } catch {
      return false;
    }
  });
}

function migrateLegacyDataToOrganizations() {
  const orgCount = db.prepare('SELECT COUNT(*) as c FROM organizations').get().c;
  if (orgCount > 0) return;

  if (!hasLegacyOperationalData()) return;

  const crypto = require('crypto');
  const legacyOrgId = crypto.randomUUID();
  const legacyName = process.env.PROPERTY_NAME || 'Santa Paciência';
  const legacySlug = 'workspace-legacy';

  db.prepare(`
    INSERT INTO organizations (id, name, slug, created_at, updated_at)
    VALUES (?, ?, ?, datetime('now'), datetime('now'))
  `).run(legacyOrgId, legacyName, legacySlug);

  ['accommodations', 'guests', 'reservations', 'expenses'].forEach(table => {
    try {
      db.prepare(`UPDATE ${table} SET organization_id = ? WHERE organization_id IS NULL`).run(legacyOrgId);
    } catch {}
  });

  migrateLegacySettings(legacyOrgId);
  migrateLegacyEmailTemplates(legacyOrgId);

  console.warn(`⚠️  Dados legacy migrados para org ${legacyOrgId} (${legacyName}). Sem owner — adiciona uma membership manualmente via SQL para reclamar.`);
}

function migrateLegacySettings(organizationId) {
  try {
    const rows = db.prepare('SELECT key, value, updated_at FROM settings').all();
    if (!rows.length) return;
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO organization_settings (organization_id, key, value, updated_at)
      VALUES (?, ?, ?, COALESCE(?, datetime('now')))
    `);
    rows.forEach(row => stmt.run(organizationId, row.key, row.value, row.updated_at || null));
  } catch {}
}

function migrateLegacyEmailTemplates(organizationId) {
  try {
    const templates = db.prepare('SELECT * FROM email_templates').all();
    const logs = db.prepare('SELECT * FROM email_log').all();
    const tplStmt = db.prepare(`
      INSERT OR IGNORE INTO organization_email_templates (
        organization_id, slug, name, subject, body,
        timing_offset, timing_unit, timing_direction, timing_event, active, updated_at,
        subject_en, body_en, subject_fr, body_fr, subject_es, body_es,
        subject_de, body_de, subject_it, body_it, subject_nl, body_nl
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    templates.forEach(tpl => tplStmt.run(
      organizationId, tpl.slug, tpl.name, tpl.subject, tpl.body,
      tpl.timing_offset, tpl.timing_unit, tpl.timing_direction, tpl.timing_event, tpl.active, tpl.updated_at || null,
      tpl.subject_en || '', tpl.body_en || '',
      tpl.subject_fr || '', tpl.body_fr || '',
      tpl.subject_es || '', tpl.body_es || '',
      tpl.subject_de || '', tpl.body_de || '',
      tpl.subject_it || '', tpl.body_it || '',
      tpl.subject_nl || '', tpl.body_nl || ''
    ));

    const logStmt = db.prepare(`
      INSERT OR IGNORE INTO organization_email_log (id, organization_id, template_slug, reservation_id, sent_at)
      VALUES (?, ?, ?, ?, COALESCE(?, datetime('now')))
    `);
    logs.forEach(log => logStmt.run(log.id, organizationId, log.template_slug, log.reservation_id, log.sent_at || null));
  } catch {}
}

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

function migrateReservations() {
  const existing = db.pragma('table_info(reservations)').map(c => c.name);
  const cols = [
    ['guests_data',   "TEXT DEFAULT '[]'"],
    ['amount_paid',   'REAL DEFAULT 0'],
    ['payment_date',  'TEXT'],
    ['google_calendar_user_id', 'TEXT'],
    ['public_token', 'TEXT'],
    ['precheckin_token', 'TEXT'],
    ['precheckin_token_expires_at', 'TEXT'],
    ['arrival_time', 'TEXT'],
    ['precheckin_submitted_at', 'TEXT'],
    ['cancelled_previous_status', 'TEXT'],
    ['cancelled_previous_payment_status', 'TEXT'],
    ['num_adults',   'INTEGER'],
    ['num_children', 'INTEGER DEFAULT 0'],
    ['accommodations_data', "TEXT DEFAULT '[]'"],
  ];
  for (const [col, type] of cols) {
    if (!existing.includes(col)) {
      db.exec(`ALTER TABLE reservations ADD COLUMN ${col} ${type}`);
    }
  }
}

function migrateGuests() {
  const existing = db.pragma('table_info(guests)').map(c => c.name);
  const cols = [
    ['first_name',    'TEXT'],
    ['last_name',     'TEXT'],
    ['email_personal','TEXT'],
    ['email_canal',   'TEXT'],
    ['birth_date',    'TEXT'],
    ['nif',           'TEXT'],
    ['country',       'TEXT'],
    ['address',       'TEXT'],
    ['postal_code',   'TEXT'],
    ['city',          'TEXT'],
    ['is_favorite',              'INTEGER DEFAULT 0'],
    ['is_vip',                   'INTEGER DEFAULT 0'],
    ['is_unwanted',              'INTEGER DEFAULT 0'],
    ['birth_city',               'TEXT'],
    ['document_issuer_country',  'TEXT'],
    ['nationality',              'TEXT'],
    ['id_type',                  'TEXT'],
    ['document_type',            'TEXT'],
    ['document_number',          'TEXT'],
  ];
  for (const [col, type] of cols) {
    if (!existing.includes(col)) {
      db.exec(`ALTER TABLE guests ADD COLUMN ${col} ${type}`);
    }
  }
}

function migrateAccommodations() {
  const existing = db.pragma('table_info(accommodations)').map(c => c.name);
  const cols = [
    ['parent_id', 'TEXT'],
    ['description',   'TEXT'],
    ['address',       'TEXT'],
    ['postal_code',   'TEXT'],
    ['city',          'TEXT'],
    ['region',        "TEXT DEFAULT 'Continente'"],
    ['country',       "TEXT DEFAULT 'Portugal'"],
    ['area',          'INTEGER'],
    ['num_rooms',     'INTEGER DEFAULT 1'],
    ['num_bathrooms', 'INTEGER DEFAULT 1'],
    ['amenities',       "TEXT DEFAULT '[]'"],
    ['cover_image',     'TEXT'],
    ['images',          "TEXT DEFAULT '{}'"],
    ['wifi_name',       'TEXT'],
    ['wifi_password',   'TEXT'],
    ['description_en',  'TEXT'],
    ['description_fr',  'TEXT'],
    ['description_es',  'TEXT'],
    ['description_de',  'TEXT'],
    ['description_it',  'TEXT'],
    ['description_nl',  'TEXT'],
    ['checkin_time',    'TEXT'],
    ['checkout_time',   'TEXT'],
    ['color',           "TEXT DEFAULT '#843424'"],
    ['social_facebook',  'TEXT'],
    ['social_instagram', 'TEXT'],
    ['social_website',   'TEXT'],
    ['base_guests_included', "INTEGER DEFAULT 2"],
    ['extra_bed_enabled',    "INTEGER DEFAULT 0"],
    ['extra_bed_type',       "TEXT DEFAULT 'sofa_cama'"],
    ['extra_bed_capacity',   "INTEGER DEFAULT 0"],
    ['extra_bed_price',      "REAL DEFAULT 0"],
    ['extra_bed_charge_type',"TEXT DEFAULT 'per_guest_night'"],
    ['extra_occupancy_options', "TEXT DEFAULT '[]'"],
    ['baby_age_limit',       "INTEGER DEFAULT 2"],
    ['baby_price',           "REAL DEFAULT 0"],
    ['child_age_limit',      "INTEGER DEFAULT 12"],
    ['child_price',          "REAL DEFAULT 0"],
    ['public_slug',          'TEXT'],
    ['min_nights',           'INTEGER DEFAULT 1'],
    ['rgpd_text',            'TEXT'],
    ['airbnb_ical_url',      'TEXT'],
    ['booking_ical_url',     'TEXT'],
  ];
  for (const [col, type] of cols) {
    if (!existing.includes(col)) {
      db.exec(`ALTER TABLE accommodations ADD COLUMN ${col} ${type}`);
    }
  }
  // Set existing accommodations (added before min_nights existed) to 2 nights minimum
  if (!existing.includes('min_nights')) {
    db.exec(`UPDATE accommodations SET min_nights = 2`);
  }
  // Settings table migration
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    )`);
  } catch(e) {}
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
  ins.run('confirmacao','Agradecimento pela reserva',
    '✅ Reserva Confirmada — {{alojamento}} | Santa Paciência',
    `<h2 style="color:#843424;margin-top:0;">✅ Reserva Confirmada</h2><p style="color:#555;">Olá <strong>{{primeiro_nome}}</strong>,</p><p style="color:#555;">A sua reserva foi confirmada com sucesso. Aguardamos a sua visita!</p><table width="100%" cellpadding="8" cellspacing="0" style="background:#f9f9f9;border-radius:6px;margin:20px 0;border:1px solid #eee;"><tr><td style="color:#888;font-size:13px;width:40%;">Alojamento</td><td style="color:#843424;font-weight:bold;">{{alojamento}}</td></tr><tr style="background:#fff;"><td style="color:#888;font-size:13px;">Check-in</td><td style="color:#843424;">{{data_checkin}} às {{hora_checkin}}</td></tr><tr><td style="color:#888;font-size:13px;">Check-out</td><td style="color:#843424;">{{data_checkout}} até às {{hora_checkout}}</td></tr><tr style="background:#fff;"><td style="color:#888;font-size:13px;">Noites</td><td style="color:#843424;">{{noites}}</td></tr><tr><td style="color:#888;font-size:13px;">Hóspedes</td><td style="color:#843424;">{{num_hospedes}}</td></tr><tr style="background:#fff;"><td style="color:#888;font-size:13px;">Referência</td><td style="color:#843424;font-family:monospace;">{{referencia}}</td></tr><tr style="background:#843424;"><td style="color:#fff;font-weight:bold;padding:10px 8px;">Total</td><td style="color:#c9a84c;font-weight:bold;font-size:18px;">{{total}}</td></tr></table><p style="color:#555;font-size:14px;">Se tiver alguma questão, não hesite em contactar-nos.</p>`,
    0,'hours','after','booking');
  ins.run('cancelamento','Cancelamento da reserva',
    '❌ Reserva Cancelada — {{alojamento}} | Santa Paciência',
    `<h2 style="color:#c0392b;margin-top:0;">❌ Reserva Cancelada</h2><p style="color:#555;">Olá <strong>{{primeiro_nome}}</strong>,</p><p style="color:#555;">Informamos que a sua reserva na <strong>{{alojamento}}</strong> foi cancelada.</p><table width="100%" cellpadding="8" cellspacing="0" style="background:#fff5f5;border-radius:6px;margin:20px 0;border:1px solid #fdd;"><tr><td style="color:#888;font-size:13px;width:40%;">Referência</td><td style="color:#c0392b;font-family:monospace;">{{referencia}}</td></tr><tr><td style="color:#888;font-size:13px;">Check-in</td><td style="color:#666;">{{data_checkin}}</td></tr><tr><td style="color:#888;font-size:13px;">Check-out</td><td style="color:#666;">{{data_checkout}}</td></tr></table><p style="color:#555;font-size:14px;">Esperamos poder recebê-lo numa próxima oportunidade.</p>`,
    0,'hours','after','cancellation');
  ins.run('apos_checkin','Após check-in',
    '🏡 Bem-vindo à Santa Paciência, {{primeiro_nome}}!',
    `<h2 style="color:#843424;margin-top:0;">🏡 Bem-vindo à Santa Paciência!</h2><p style="color:#555;">Olá <strong>{{primeiro_nome}}</strong>,</p><p style="color:#555;">Estamos muito contentes por tê-lo connosco! Esperamos que se sinta em casa durante a sua estadia em <strong>{{alojamento}}</strong>.</p><p style="color:#555;">Se precisar de qualquer coisa, não hesite em contactar-nos.</p><p style="color:#555;font-size:14px;border-top:1px solid #eee;margin-top:20px;padding-top:15px;">O seu check-out está previsto para <strong>{{data_checkout}}</strong> até às <strong>{{hora_checkout}}</strong>.</p>`,
    2,'hours','after','checkin');
  ins.run('antes_checkout','Antes do check-out',
    '🌅 Lembrete de Check-out — Santa Paciência',
    `<h2 style="color:#843424;margin-top:0;">🌅 Lembrete de Check-out</h2><p style="color:#555;">Olá <strong>{{primeiro_nome}}</strong>,</p><p style="color:#555;">Informamos que o seu check-out está previsto para amanhã, <strong>{{data_checkout}}</strong>, até às <strong>{{hora_checkout}}</strong>.</p><p style="color:#555;">Por favor deixe o alojamento arrumado e entregue as chaves conforme o combinado.</p><p style="color:#555;font-size:14px;margin-top:20px;">Foi um prazer tê-lo connosco, <strong>{{primeiro_nome}}</strong>!</p>`,
    1,'days','before','checkout');
  ins.run('obrigado','Obrigado pela estadia',
    '⭐ Obrigado pela sua visita — Santa Paciência',
    `<h2 style="color:#843424;margin-top:0;">⭐ Obrigado pela sua visita!</h2><p style="color:#555;">Olá <strong>{{primeiro_nome}}</strong>,</p><p style="color:#555;">Esperamos que a sua estadia em <strong>{{alojamento}}</strong> tenha sido do seu agrado!</p><p style="color:#555;">A sua opinião é muito importante para nós. Se tiver um momento, adorávamos receber a sua avaliação.</p><p style="color:#555;font-size:14px;margin-top:20px;">Até à próxima! 🌟</p>`,
    2,'hours','after','checkout');
  ins.run('coordenadas','Envio das coordenadas',
    '🗺️ Informações para a sua chegada — {{alojamento}}',
    `<h2 style="color:#843424;margin-top:0;">🗺️ Informações para a sua chegada</h2><p style="color:#555;">Olá <strong>{{primeiro_nome}}</strong>,</p><p style="color:#555;">Está quase na hora! Aqui ficam todas as informações para a sua chegada amanhã:</p><table width="100%" cellpadding="8" cellspacing="0" style="background:#f9f9f9;border-radius:6px;margin:20px 0;border:1px solid #eee;"><tr><td style="color:#888;font-size:13px;width:40%;">Check-in</td><td style="color:#843424;font-weight:bold;">{{data_checkin}} a partir das {{hora_checkin}}</td></tr><tr style="background:#fff;"><td style="color:#888;font-size:13px;">Alojamento</td><td style="color:#843424;">{{alojamento}}</td></tr><tr><td style="color:#888;font-size:13px;">Wi-Fi</td><td style="color:#843424;">{{wifi_nome}}</td></tr><tr style="background:#fff;"><td style="color:#888;font-size:13px;">Senha Wi-Fi</td><td style="color:#843424;font-family:monospace;">{{wifi_password}}</td></tr></table><p style="color:#555;font-size:14px;">Se tiver alguma dúvida, não hesite em contactar-nos. Aguardamos a sua chegada!</p>`,
    1,'days','before','checkin');
}

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
      id              TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      to_email        TEXT NOT NULL,
      to_name         TEXT,
      subject         TEXT NOT NULL,
      body_html       TEXT NOT NULL,
      reservation_id  TEXT,
      sent_by_user_id TEXT,
      sent_at         TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
      FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE SET NULL
    )
  `);
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

module.exports = { db, initDatabase };
