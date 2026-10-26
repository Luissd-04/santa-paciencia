// Migrações novas são versionadas e atómicas. A compatibilidade anterior está
// organizada em legacy-migrations/ e é executada antes destas versões.
function migrateIntegrity(db) {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))");
  const id = '20260917_integrity';
  if (db.prepare('SELECT 1 FROM schema_migrations WHERE id = ?').get(id)) return;
  db.transaction(() => {
    if (!db.pragma('table_info(guests)').some(c => c.name === 'updated_at')) db.exec('ALTER TABLE guests ADD COLUMN updated_at TEXT');
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_res_org_dates ON reservations(organization_id, check_in, check_out, status);
      CREATE INDEX IF NOT EXISTS idx_guest_org_email ON guests(organization_id, email);
      CREATE INDEX IF NOT EXISTS idx_events_org_date ON operational_events(organization_id, date);
      CREATE INDEX IF NOT EXISTS idx_res_precheckin ON reservations(precheckin_token);
      CREATE INDEX IF NOT EXISTS idx_res_public_token ON reservations(public_token);
      CREATE TABLE IF NOT EXISTS reservation_units (
        reservation_id TEXT NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        accommodation_id TEXT NOT NULL REFERENCES accommodations(id),
        PRIMARY KEY(reservation_id, accommodation_id)
      );
      CREATE INDEX IF NOT EXISTS idx_units_org_accommodation ON reservation_units(organization_id, accommodation_id, reservation_id);
      INSERT OR IGNORE INTO reservation_units SELECT id, organization_id, accommodation_id FROM reservations;
      INSERT OR IGNORE INTO reservation_units
        SELECT r.id, r.organization_id, a.id FROM reservations r,
        json_each(CASE WHEN json_valid(r.accommodations_data) THEN r.accommodations_data ELSE '[]' END) j
        JOIN accommodations a ON a.id = json_extract(j.value, '$.accommodation_id') AND a.organization_id = r.organization_id;
    `);
    for (const event of ['INSERT', 'UPDATE OF accommodation_id, accommodations_data, organization_id']) {
      const name = event === 'INSERT' ? 'insert' : 'update';
      db.exec(`CREATE TRIGGER IF NOT EXISTS reservation_units_${name} AFTER ${event} ON reservations BEGIN
        DELETE FROM reservation_units WHERE reservation_id = NEW.id;
        INSERT INTO reservation_units VALUES (NEW.id, NEW.organization_id, NEW.accommodation_id);
        INSERT OR IGNORE INTO reservation_units
          SELECT NEW.id, NEW.organization_id, a.id FROM json_each(CASE WHEN json_valid(NEW.accommodations_data) THEN NEW.accommodations_data ELSE '[]' END) j
          JOIN accommodations a ON a.id = json_extract(j.value, '$.accommodation_id') AND a.organization_id = NEW.organization_id;
      END`);
    }
    db.prepare('INSERT INTO schema_migrations (id) VALUES (?)').run(id);
  })();
}
function runMigrations(db) {
  migrateIntegrity(db);
  migrateListIndexes(db);
  migrateAuthScheduler(db);
  migrateGoogleTaskCleanupQueue(db);
  migrateGoogleTaskBidirectional(db);
  migrateVoucherRedemptions(db);
  migrateDocumentTypes(db);
  migrateStripePayments(db);
  migrateStripeLiveMode(db);
  migratePaymentPolicy(db);
  migrateManualPaymentIntents(db);
  migrateEmailDeliveries(db);
  migrateAccountSecurity(db);
  migrateVoucherRelease(db);
  migratePolicyChannels(db);
  migrateGoogleCalendarQueue(db);
  migrateReservationEvents(db);
  migrateReservationStates(db);
  migrateEmailQueueToEvents(db);
  migrateScheduledTaskRuns(db);
  db.exec(`CREATE TABLE IF NOT EXISTS audit_events (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id TEXT, action TEXT NOT NULL, target_type TEXT, target_id TEXT, meta TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  CREATE INDEX IF NOT EXISTS idx_audit_org_created ON audit_events(organization_id, created_at);`);
  if (!db.pragma('table_info(guests)').some(c => c.name === 'anonymized_at')) db.exec('ALTER TABLE guests ADD COLUMN anonymized_at TEXT');
  db.exec(`CREATE TABLE IF NOT EXISTS reservation_create_intents (
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    intent_key TEXT NOT NULL, fingerprint TEXT NOT NULL,
    reservation_id TEXT NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY(organization_id, intent_key)
  )`);
  if (!db.pragma('table_info(stripe_payment_attempts)').some(c => c.name === 'last_reconciled_at')) db.exec('ALTER TABLE stripe_payment_attempts ADD COLUMN last_reconciled_at TEXT');
}
function migratePaymentPolicy(db) {
  const id = '20261006_payment_policy';
  if (db.prepare('SELECT 1 FROM schema_migrations WHERE id=?').get(id)) return;
  db.transaction(() => {
    for (const name of ['payment_policy_json', 'policy_accepted_at', 'policy_auto_consent', 'stripe_customer_id',
      'stripe_payment_method_id', 'stripe_saved_livemode', 'balance_attempted_at', 'balance_deadline', 'balance_notice_sent_at',
      'policy_cancellation_json', 'policy_cancel_notice_at']) db.exec(`ALTER TABLE reservations ADD COLUMN ${name} TEXT`);
    db.exec("ALTER TABLE stripe_payment_attempts ADD COLUMN kind TEXT NOT NULL DEFAULT 'checkout' CHECK(kind IN ('checkout','automatic'))");
    db.prepare('INSERT INTO schema_migrations(id) VALUES(?)').run(id);
  }).immediate();
}
function migrateStripePayments(db) {
  const id = '20261005_stripe_payments';
  if (db.prepare('SELECT 1 FROM schema_migrations WHERE id=?').get(id)) return;
  db.transaction(() => {
    db.exec(`ALTER TABLE reservations ADD COLUMN stripe_checkout_session_id TEXT;
      ALTER TABLE reservations ADD COLUMN stripe_payment_intent_id TEXT;
      ALTER TABLE reservations ADD COLUMN paid_at TEXT;
      ALTER TABLE reservations ADD COLUMN payment_amount REAL;
      ALTER TABLE reservations ADD COLUMN payment_currency TEXT;
      ALTER TABLE reservations ADD COLUMN online_payment_status TEXT;
      CREATE TABLE stripe_payment_attempts (
        id TEXT PRIMARY KEY,
        reservation_id TEXT NOT NULL REFERENCES reservations(id),
        organization_id TEXT NOT NULL REFERENCES organizations(id),
        amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
        currency TEXT NOT NULL DEFAULT 'eur' CHECK(currency = 'eur'),
        state TEXT NOT NULL CHECK(state IN ('creating','open','processing','paid','expired','cancelled')),
        snapshot TEXT NOT NULL,
        request_json TEXT NOT NULL,
        checkout_session_id TEXT UNIQUE,
        payment_intent_id TEXT UNIQUE,
        captured_cents INTEGER NOT NULL DEFAULT 0,
        refunded_cents INTEGER NOT NULL DEFAULT 0,
        last_event_created INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE UNIQUE INDEX idx_stripe_active_reservation ON stripe_payment_attempts(reservation_id)
        WHERE state IN ('creating','open','processing');
      CREATE INDEX idx_stripe_org ON stripe_payment_attempts(organization_id, reservation_id);
      CREATE TABLE stripe_webhook_events (
        id TEXT PRIMARY KEY, type TEXT NOT NULL,
        processed_at TEXT NOT NULL DEFAULT (datetime('now'))
      );`);
    db.prepare('INSERT INTO schema_migrations(id) VALUES(?)').run(id);
  }).immediate();
}
function migrateStripeLiveMode(db) {
  const id = '20261005_stripe_live_mode';
  if (db.prepare('SELECT 1 FROM schema_migrations WHERE id=?').get(id)) return;
  db.transaction(() => {
    db.exec('ALTER TABLE stripe_payment_attempts ADD COLUMN livemode INTEGER NOT NULL DEFAULT 0 CHECK(livemode IN (0,1))');
    db.prepare('INSERT INTO schema_migrations(id) VALUES(?)').run(id);
  }).immediate();
}
function migrateAuthScheduler(db) {
  const id = '20260919_auth_scheduler';
  if (db.prepare('SELECT 1 FROM schema_migrations WHERE id = ?').get(id)) return;
  db.transaction(() => {
    const crypto = require('crypto');
    const digest = token => 'sha256:' + crypto.createHash('sha256').update(token).digest('hex');
    for (const row of db.prepare('SELECT id FROM auth_sessions').all()) {
      if (/^[a-f0-9]{64}$/.test(row.id)) db.prepare('UPDATE auth_sessions SET id = ? WHERE id = ?').run(digest(row.id), row.id);
    }
    for (const row of db.prepare('SELECT id, token FROM password_reset_tokens').all()) {
      if (/^[a-f0-9]{64}$/.test(row.token)) db.prepare('UPDATE password_reset_tokens SET token = ? WHERE id = ?').run(digest(row.token), row.id);
    }
    db.exec(`CREATE TABLE IF NOT EXISTS scheduler_leases (
      name TEXT PRIMARY KEY, owner TEXT NOT NULL, expires_at INTEGER NOT NULL
    )`);
    db.prepare('INSERT INTO schema_migrations (id) VALUES (?)').run(id);
  }).immediate();
}
function migrateGoogleTaskCleanupQueue(db) {
  const id = '20260920_google_task_cleanup_queue';
  if (db.prepare('SELECT 1 FROM schema_migrations WHERE id=?').get(id)) return;
  db.transaction(() => {
    db.exec(`CREATE TABLE google_task_cleanup_queue (
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      google_task_id TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      last_attempt_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (organization_id, google_task_id)
    );
    CREATE INDEX idx_google_task_cleanup_created
      ON google_task_cleanup_queue(organization_id, created_at);`);
    db.prepare('INSERT INTO schema_migrations(id) VALUES(?)').run(id);
  }).immediate();
}
function migrateGoogleTaskBidirectional(db) {
  const id = '20261001_google_task_bidirectional';
  if (db.prepare('SELECT 1 FROM schema_migrations WHERE id=?').get(id)) return;
  db.transaction(() => {
    db.exec(`ALTER TABLE operational_events ADD COLUMN auto_source_snapshot TEXT;
      UPDATE operational_events SET auto_source_snapshot = json_object(
        'title', title, 'type', type, 'date', date, 'start_time', start_time,
        'end_time', end_time, 'accommodation_id', accommodation_id, 'notes', notes, 'important', important)
        WHERE auto_generated = 1;
      CREATE TABLE google_task_sync_state (
        event_id TEXT PRIMARY KEY REFERENCES operational_events(id) ON DELETE CASCADE,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        google_task_id TEXT NOT NULL,
        tasks_list_id TEXT NOT NULL,
        local_payload TEXT NOT NULL,
        remote_payload TEXT NOT NULL
      );
      CREATE TABLE auto_task_suppressions (
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        reservation_id TEXT NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
        auto_key TEXT NOT NULL,
        PRIMARY KEY (organization_id, auto_key)
      );
      CREATE TRIGGER operational_event_google_task_cleanup BEFORE DELETE ON operational_events
      WHEN OLD.google_task_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM organizations WHERE id = OLD.organization_id)
      BEGIN
        INSERT OR IGNORE INTO google_task_cleanup_queue (organization_id, google_task_id)
          VALUES (OLD.organization_id, OLD.google_task_id);
      END;
      CREATE TRIGGER reservation_operational_event_cleanup BEFORE DELETE ON reservations
      BEGIN
        DELETE FROM operational_events WHERE reservation_id = OLD.id AND organization_id = OLD.organization_id;
      END;`);
    // Guardar a base antes da primeira edição após o upgrade. Permite distinguir
    // uma edição local pendente de uma mudança feita no Google na primeira leitura.
    const { taskPayload, remotePayload } = require('./googleTaskMapping');
    const rows = db.prepare(`SELECT e.*, a.name AS accommodation_name, c.tasks_list_id
      FROM operational_events e JOIN google_tasks_connections c ON c.organization_id = e.organization_id
      LEFT JOIN accommodations a ON a.id = e.accommodation_id AND a.organization_id = e.organization_id
      WHERE e.google_task_id IS NOT NULL AND c.tasks_list_id IS NOT NULL`).all();
    const insert = db.prepare(`INSERT INTO google_task_sync_state
      (event_id, organization_id, google_task_id, tasks_list_id, local_payload, remote_payload)
      VALUES (?, ?, ?, ?, ?, ?)`);
    for (const row of rows) {
      const local = remotePayload(taskPayload(row));
      const oldNotes = [row.notes || '', row.responsible ? `Responsável: ${row.responsible}` : '',
        row.start_time ? `Hora: ${row.start_time}${row.end_time ? '–' + row.end_time : ''}` : '',
        row.status !== 'planeado' ? `Estado: ${row.status}` : ''].filter(Boolean).join('\n');
      insert.run(row.id, row.organization_id, row.google_task_id, row.tasks_list_id,
        JSON.stringify(local), JSON.stringify({ ...local, notes: oldNotes }));
    }
    db.prepare('INSERT INTO schema_migrations(id) VALUES(?)').run(id);
  }).immediate();
}
function migrateVoucherRedemptions(db) {
  const id = '20261001_voucher_redemptions';
  if (db.prepare('SELECT 1 FROM schema_migrations WHERE id=?').get(id)) return;
  db.transaction(() => {
    db.exec(`ALTER TABLE vouchers ADD COLUMN max_uses INTEGER NOT NULL DEFAULT 1 CHECK (max_uses >= 1);
      CREATE TABLE voucher_redemptions (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        voucher_id TEXT NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
        reservation_id TEXT REFERENCES reservations(id) ON DELETE SET NULL,
        reservation_reference TEXT,
        discount_amount REAL,
        used_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (voucher_id, reservation_reference)
      );
      CREATE INDEX idx_voucher_redemptions_org_voucher ON voucher_redemptions(organization_id, voucher_id, used_at);
      INSERT INTO voucher_redemptions (id, organization_id, voucher_id, reservation_id, reservation_reference, used_at)
        SELECT 'legacy-' || v.id, v.organization_id, v.id, r.id, v.used_in_reservation_id,
          COALESCE(v.used_at, v.updated_at, v.created_at, datetime('now'))
        FROM vouchers v LEFT JOIN reservations r ON r.id = v.used_in_reservation_id AND r.organization_id = v.organization_id
        WHERE v.status = 'used' OR v.used_at IS NOT NULL OR v.used_in_reservation_id IS NOT NULL;
      UPDATE vouchers SET status = 'used' WHERE status = 'active' AND id IN (SELECT voucher_id FROM voucher_redemptions);
      UPDATE vouchers SET used_in_reservation_id = NULL WHERE used_in_reservation_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM reservations r WHERE r.id = vouchers.used_in_reservation_id AND r.organization_id = vouchers.organization_id);
      CREATE TRIGGER reservation_clear_legacy_voucher AFTER DELETE ON reservations
      BEGIN
        UPDATE vouchers SET used_in_reservation_id = NULL
          WHERE used_in_reservation_id = OLD.id AND organization_id = OLD.organization_id;
      END;`);
    db.prepare('INSERT INTO schema_migrations(id) VALUES(?)').run(id);
  }).immediate();
}
function migrateListIndexes(db) {
  const id = '20260919_list_indexes';
  if (db.prepare('SELECT 1 FROM schema_migrations WHERE id=?').get(id)) return;
  db.transaction(() => {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_res_org_guest ON reservations(organization_id,guest_id,status,check_in);
      CREATE INDEX IF NOT EXISTS idx_guest_org_name ON guests(organization_id,name COLLATE NOCASE,id);
      CREATE INDEX IF NOT EXISTS idx_events_res_kind ON operational_events(organization_id,reservation_id,auto_kind,created_at);`);
    db.prepare('INSERT INTO schema_migrations(id) VALUES(?)').run(id);
  }).immediate();
}
function migrateDocumentTypes(db) {
  const id = '20261004_document_types';
  if (db.prepare('SELECT 1 FROM schema_migrations WHERE id=?').get(id)) return;
  const { normalizeDocumentType } = require('../services/documentType');
  db.transaction(() => {
    const updateGuest = db.prepare('UPDATE guests SET document_type=? WHERE id=?');
    for (const guest of db.prepare("SELECT id, document_type FROM guests WHERE document_type IN ('passport', 'id_card', 'other')").all()) {
      updateGuest.run(normalizeDocumentType(guest.document_type), guest.id);
    }
    const updateExtras = db.prepare('UPDATE reservations SET guests_data=? WHERE id=?');
    for (const row of db.prepare("SELECT id, guests_data FROM reservations WHERE guests_data IS NOT NULL AND guests_data != '[]'").all()) {
      let guests;
      try { guests = JSON.parse(row.guests_data); } catch { continue; }
      if (!Array.isArray(guests)) continue;
      let changed = false;
      for (const guest of guests) {
        if (!guest || typeof guest !== 'object' || !guest.document_type) continue;
        const type = normalizeDocumentType(guest.document_type);
        if (type !== guest.document_type) { guest.document_type = type; changed = true; }
      }
      if (changed) updateExtras.run(JSON.stringify(guests), row.id);
    }
    db.prepare('INSERT INTO schema_migrations(id) VALUES(?)').run(id);
  }).immediate();
}
module.exports = { runMigrations };

function migrateManualPaymentIntents(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS manual_payment_intents (
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    reservation_id TEXT NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
    intent_key TEXT NOT NULL, fingerprint TEXT NOT NULL, response_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY(organization_id, reservation_id, intent_key)
  )`);
}

function migrateEmailDeliveries(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS email_deliveries (
    id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    reservation_id TEXT NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
    template_slug TEXT NOT NULL, state TEXT NOT NULL, provider_id TEXT,
    attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, retry_at INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  )`);
}

function migrateAccountSecurity(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS oauth_states(token_hash TEXT PRIMARY KEY, session_hash TEXT NOT NULL, purpose TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS email_changes(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, old_email TEXT NOT NULL, new_email TEXT NOT NULL, expires_at INTEGER NOT NULL)`);
  const id = '20261024_invitation_hashes';
  if (db.prepare('SELECT 1 FROM schema_migrations WHERE id=?').get(id)) return;
  db.transaction(() => {
    const digest = token => 'sha256:' + require('crypto').createHash('sha256').update(token).digest('hex');
    for (const row of db.prepare('SELECT id,token FROM invitations').all()) if (!row.token.startsWith('sha256:')) db.prepare('UPDATE invitations SET token=? WHERE id=?').run(digest(row.token), row.id);
    db.prepare('INSERT INTO schema_migrations(id) VALUES(?)').run(id);
  }).immediate();
}

// Verificada pela estrutura e não só pelo registo: a tabela de utilizações
// pode ser recriada pela migração anterior (restauros de bases antigas).
function migrateVoucherRelease(db) {
  const id = '20261024_voucher_release';
  if (db.pragma('table_info(voucher_redemptions)').some(c => c.name === 'released_at')) return;
  db.transaction(() => {
    db.exec('ALTER TABLE voucher_redemptions ADD COLUMN released_at TEXT');
    db.prepare('INSERT OR IGNORE INTO schema_migrations(id) VALUES(?)').run(id);
  }).immediate();
}

// A política de pagamentos só se aplica ao site e ao canal direto. Reservas de
// outros canais que a receberam e nunca a aceitaram/pagaram online voltam ao
// estado anterior; as que têm movimentos Stripe ou cancelamento ficam intactas.
function migratePolicyChannels(db) {
  const id = '20261024_policy_channels';
  if (db.prepare('SELECT 1 FROM schema_migrations WHERE id=?').get(id)) return;
  db.transaction(() => {
    db.exec(`UPDATE reservations SET status = CASE WHEN status = 'aguardar_pagamento' THEN 'confirmada' ELSE status END,
        payment_policy_json = NULL, policy_auto_consent = NULL, balance_deadline = NULL, balance_notice_sent_at = NULL
      WHERE payment_policy_json IS NOT NULL AND COALESCE(channel, 'direto') NOT IN ('website', 'direto')
        AND policy_accepted_at IS NULL AND policy_cancellation_json IS NULL
        AND NOT EXISTS (SELECT 1 FROM stripe_payment_attempts sp WHERE sp.reservation_id = reservations.id)`);
    db.prepare('INSERT INTO schema_migrations(id) VALUES(?)').run(id);
  }).immediate();
}

// Fila durável do Google Calendar (criações, alterações e remoções repetidas
// após falha ou reinício) e o calendário onde cada evento foi criado, para o
// remover do sítio certo depois de a reserva mudar de alojamento.
function migrateGoogleCalendarQueue(db) {
  const id = '20261024_google_calendar_queue';
  if (db.prepare('SELECT 1 FROM schema_migrations WHERE id=?').get(id)) return;
  db.transaction(() => {
    db.exec(`CREATE TABLE IF NOT EXISTS google_calendar_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      action TEXT NOT NULL CHECK(action IN ('upsert', 'delete')),
      entity_type TEXT NOT NULL CHECK(entity_type IN ('reservation', 'event')),
      entity_id TEXT NOT NULL,
      user_id TEXT,
      calendar_id TEXT,
      google_event_id TEXT,
      revision INTEGER NOT NULL DEFAULT 0,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      next_attempt_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_gcal_queue_upsert ON google_calendar_queue(organization_id, entity_type, entity_id) WHERE action = 'upsert';
    CREATE UNIQUE INDEX IF NOT EXISTS idx_gcal_queue_delete ON google_calendar_queue(organization_id, calendar_id, google_event_id) WHERE action = 'delete';
    CREATE INDEX IF NOT EXISTS idx_gcal_queue_due ON google_calendar_queue(next_attempt_at);`);
    for (const table of ['reservations', 'operational_events']) {
      if (!db.pragma(`table_info(${table})`).some(c => c.name === 'google_event_calendar_id')) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN google_event_calendar_id TEXT`);
      }
    }
    db.prepare('INSERT INTO schema_migrations(id) VALUES(?)').run(id);
  }).immediate();
}

// Acontecimentos de uma reserva gravados na mesma transação da alteração, e
// os efeitos (emails, avisos à equipa) que cada um pede. Os efeitos correm
// depois do commit e são repetidos após falha ou reinício.
function migrateReservationEvents(db) {
  const id = '20261025_reservation_events';
  if (db.prepare('SELECT 1 FROM schema_migrations WHERE id=?').get(id)) return;
  db.transaction(() => {
    db.exec(`CREATE TABLE IF NOT EXISTS reservation_events (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      reservation_id TEXT NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      actor_user_id TEXT,
      payload TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_res_events_reservation ON reservation_events(organization_id, reservation_id, created_at);
    CREATE TABLE IF NOT EXISTS reservation_event_effects (
      event_id TEXT NOT NULL REFERENCES reservation_events(id) ON DELETE CASCADE,
      effect TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending', 'running', 'done', 'failed')),
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      next_attempt_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY(event_id, effect)
    );
    CREATE INDEX IF NOT EXISTS idx_res_effects_due ON reservation_event_effects(state, next_attempt_at);`);
    db.prepare('INSERT INTO schema_migrations(id) VALUES(?)').run(id);
  }).immediate();
}

// Pré-check-in deixa de ser um estado da reserva: passa a «enviado» à parte
// (precheckin_sent_at) e a reserva volta a ativa. Plataformas, reservas sem
// nada a pagar e as já pagas ficam confirmadas; as restantes aguardam o sinal
// até reservationLifecycle.reconcileLegacyStatuses as acertar pelo ledger.
function migrateReservationStates(db) {
  const id = '20261025_reservation_states';
  if (db.prepare('SELECT 1 FROM schema_migrations WHERE id=?').get(id)) return;
  db.transaction(() => {
    if (!db.pragma('table_info(reservations)').some(c => c.name === 'precheckin_sent_at')) db.exec('ALTER TABLE reservations ADD COLUMN precheckin_sent_at TEXT');
    db.exec(`UPDATE reservations SET precheckin_sent_at = COALESCE(precheckin_sent_at, precheckin_submitted_at, updated_at, datetime('now'))
      WHERE status = 'pre_checkin' OR cancelled_previous_status = 'pre_checkin' OR precheckin_submitted_at IS NOT NULL
        OR EXISTS (SELECT 1 FROM email_deliveries d WHERE d.reservation_id = reservations.id AND d.template_slug = 'pre_checkin' AND d.state = 'sent')`);
    const platforms = require('../services/paymentPolicy').PLATFORM_CHANNELS.map(channel => `'${channel}'`).join(', ');
    db.exec(`UPDATE reservations SET status = CASE
        WHEN channel IN (${platforms}) OR total_amount <= 0
          OR ROUND(COALESCE(amount_paid, 0) * 100) >= ROUND(total_amount * 100) THEN 'confirmada'
        ELSE 'aguardar_pagamento' END
      WHERE status = 'pre_checkin'`);
    db.exec(`UPDATE reservations SET cancelled_previous_status = 'aguardar_pagamento' WHERE cancelled_previous_status = 'pre_checkin'`);
    db.prepare('INSERT INTO schema_migrations(id) VALUES(?)').run(id);
  }).immediate();
}


// Os emails à espera na fila antiga (organization_email_queue: fora da janela
// de envio ou por repetir) passam para a fila de acontecimentos, que é agora
// o único caminho dos envios ao hóspede. A tabela fica, vazia, para backups antigos.
function migrateEmailQueueToEvents(db) {
  const id = '20261026_email_queue_to_events';
  if (db.prepare('SELECT 1 FROM schema_migrations WHERE id=?').get(id)) return;
  const { randomUUID } = require('crypto');
  db.transaction(() => {
    const rows = db.prepare(`SELECT q.* FROM organization_email_queue q
      JOIN reservations r ON r.id = q.reservation_id AND r.organization_id = q.organization_id`).all();
    const event = db.prepare("INSERT INTO reservation_events (id, organization_id, reservation_id, type, payload) VALUES (?, ?, ?, 'email.due', ?)");
    const effect = db.prepare("INSERT INTO reservation_event_effects (event_id, effect) VALUES (?, 'guest_template_email')");
    for (const row of rows) {
      const eventId = randomUUID();
      event.run(eventId, row.organization_id, row.reservation_id, JSON.stringify({ slug: row.template_slug, key: `queue:${row.id}` }));
      effect.run(eventId);
    }
    db.prepare('DELETE FROM organization_email_queue').run();
    db.prepare('INSERT INTO schema_migrations(id) VALUES(?)').run(id);
  }).immediate();
}

// Último resultado de cada tarefa automática (taskRunner), partilhado por todas
// as instâncias do servidor que usam a mesma base.
function migrateScheduledTaskRuns(db) {
  const id = '20261026_scheduled_task_runs';
  if (db.prepare('SELECT 1 FROM schema_migrations WHERE id=?').get(id)) return;
  db.transaction(() => {
    db.exec(`CREATE TABLE IF NOT EXISTS scheduled_task_runs (
      name TEXT PRIMARY KEY,
      last_started_at TEXT, last_finished_at TEXT, last_ok_at TEXT,
      last_error_at TEXT, last_error TEXT, last_skipped_at TEXT, last_duration_ms INTEGER
    )`);
    db.prepare('INSERT INTO schema_migrations(id) VALUES(?)').run(id);
  }).immediate();
}
