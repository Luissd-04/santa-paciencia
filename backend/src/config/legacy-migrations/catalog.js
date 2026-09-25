// Migrações de compatibilidade; a ordem de execução está em database.js.
module.exports = function createMigrations(db) {
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
      ['precheckin_reopened_at', 'TEXT'],
      ['precheckin_updated_at', 'TEXT'],
      ['cancelled_previous_status', 'TEXT'],
      ['cancelled_previous_payment_status', 'TEXT'],
      ['num_adults',   'INTEGER'],
      ['num_children', 'INTEGER DEFAULT 0'],
      ['accommodations_data', "TEXT DEFAULT '[]'"],
      ['nightly_prices', "TEXT DEFAULT '[]'"],
      ['invoice_number', 'TEXT'],
      ['invoice_date', 'TEXT'],
      ['invoice_sent_date', 'TEXT'],
      ['invoice_sent_method', 'TEXT'],
      ['price_edited_at', 'TEXT'],
      ['price_edited_by_user_id', 'TEXT'],
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
      ['company',                  'TEXT'],
      ['birth_country',            'TEXT'],
      ['residence_country',        'TEXT'],
      ['company_nif',              'TEXT'],
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
      ['door_code',       'TEXT'],
      ['description_en',  'TEXT'],
      ['description_fr',  'TEXT'],
      ['description_es',  'TEXT'],
      ['description_de',  'TEXT'],
      ['description_it',  'TEXT'],
      ['description_nl',  'TEXT'],
      ['checkin_time',    'TEXT'],
      ['checkout_time',   'TEXT'],
      ['color',           "TEXT DEFAULT '#843424'"],
      ['social_facebook',   'TEXT'],
      ['social_instagram',  'TEXT'],
      ['social_website',    'TEXT'],
      ['social_tripadvisor', 'TEXT'],
      // Lista JSON das chaves ('instagram','facebook','website',...) a incluir
      // no bloco "Acompanhe-nos" dos emails. NULL = mostrar todos os
      // configurados (comportamento anterior a este campo).
      ['email_social_links', 'TEXT'],
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
      ['logo_url',             'TEXT'],
      ['google_calendar_manual', 'INTEGER DEFAULT 0'],
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

  return { migrateReservations, migrateGuests, migrateAccommodations };
};
