const { randomUUID } = require('crypto');
const { db } = require('../config/database');
const { accommodationUrls, uploadPath } = require('./mediaStorage');

// Ordem das dependências; deletes usam a ordem inversa, numa única transação.
const TABLES = ['organization_settings', 'organization_email_templates', 'accommodations',
  'pricing_periods', 'accommodation_blocks', 'suppliers', 'vouchers', 'guests', 'expenses',
  'reservations', 'stripe_payment_attempts', 'voucher_redemptions', 'reservation_payments', 'reservation_history', 'operational_events',
  'invoice_messages', 'conversation_archives', 'organization_email_log', 'organization_email_queue'];
const REFERENCES = { parent_id: 'accommodations', accommodation_id: 'accommodations',
  guest_id: 'guests', reservation_id: 'reservations', used_in_reservation_id: 'reservations',
  supplier_id: 'suppliers', voucher_id: 'vouchers' };

function uploadUrls(tables) {
  const urls = accommodationUrls(tables.accommodations || []);
  for (const row of tables.expenses || []) if (uploadPath(row.receipt_image)) urls.add(row.receipt_image);
  return urls;
}

function exportData(organizationId) {
  return db.transaction(() => ({ version: 6, scope: 'client-data', exported_at: new Date().toISOString(),
    tables: Object.fromEntries(TABLES.map(table => [table,
      db.prepare(`SELECT * FROM ${table} WHERE organization_id = ?`).all(organizationId)])) }))();
}

function prepareImport(payload, organizationId) {
  if (![3, 4, 5, 6].includes(payload.version) || !payload.tables || Array.isArray(payload.tables)) throw new Error('Versão ou estrutura de backup inválida.');
  if (Object.keys(payload.tables).some(table => !TABLES.includes(table))) throw new Error('Backup contém tabelas não permitidas.');
  if (payload.version < 6 && !Object.hasOwn(payload.tables, 'stripe_payment_attempts')) {
    if (db.prepare('SELECT 1 FROM stripe_payment_attempts WHERE organization_id=?').get(organizationId)) {
      throw new Error('O backup não contém o histórico Stripe; restauro recusado.');
    }
    payload = { ...payload, tables: { ...payload.tables, stripe_payment_attempts: [] } };
  }
  // Backups anteriores só tinham uma referência por voucher. Reconstruir esse
  // registo sem perder utilizações cujo original já tenha sido eliminado.
  if (payload.version < 5 && !Object.hasOwn(payload.tables, 'voucher_redemptions')) {
    const reservations = new Set((payload.tables.reservations || []).map(row => row.id));
    const vouchers = (payload.tables.vouchers || []).map(row => ({ ...row,
      used_in_reservation_id: reservations.has(row.used_in_reservation_id) ? row.used_in_reservation_id : null,
    }));
    const redemptions = (payload.tables.vouchers || []).filter(row => row.status === 'used' || row.used_at || row.used_in_reservation_id)
      .map(row => ({ id: randomUUID(), organization_id: organizationId, voucher_id: row.id,
        reservation_id: reservations.has(row.used_in_reservation_id) ? row.used_in_reservation_id : null,
        reservation_reference: row.used_in_reservation_id || null,
        used_at: row.used_at || row.updated_at || row.created_at || new Date().toISOString(), discount_amount: null }));
    payload = { ...payload, tables: { ...payload.tables, vouchers, voucher_redemptions: redemptions } };
  }
  const tables = {};
  const maps = Object.fromEntries(TABLES.map(table => [table, new Map()]));
  for (const table of TABLES) {
    if (!Object.hasOwn(payload.tables, table)) {
      if (payload.version >= 4 || db.prepare(`SELECT 1 FROM ${table} WHERE organization_id = ? LIMIT 1`).get(organizationId)) {
        throw new Error(`O backup não contém ${table}; restauro recusado para evitar perda de dados.`);
      }
    }
    const rows = payload.tables[table] ?? [];
    if (!Array.isArray(rows) || rows.length > 100000) throw new Error(`Dados inválidos: ${table}.`);
    const columns = new Set(db.pragma(`table_info(${table})`).map(column => column.name));
    const seen = new Set();
    tables[table] = rows.map(input => {
      if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !columns.has(key))) throw new Error(`Colunas inválidas: ${table}.`);
      const row = { ...input, organization_id: organizationId };
      if (table === 'stripe_payment_attempts') {
        if (input.organization_id !== organizationId) throw new Error('Pagamentos Stripe não podem ser transferidos entre organizações.');
        if (['creating', 'open', 'processing'].includes(row.state)) throw new Error('O backup contém pagamentos Stripe em curso. Reconcilie-os antes do restauro.');
      }
      if (columns.has('id')) {
        if (typeof row.id !== 'string' || !row.id || seen.has(row.id)) throw new Error(`Identificador inválido ou repetido: ${table}.`);
        seen.add(row.id);
        const other = db.prepare(`SELECT organization_id FROM ${table} WHERE id = ?`).get(row.id);
        if (other && other.organization_id !== organizationId) {
          const id = randomUUID(); maps[table].set(row.id, id); row.id = id;
        }
      }
      return row;
    });
  }
  const ids = Object.fromEntries(TABLES.map(table => [table, new Set(tables[table].map(row => row.id))]));
  function remapReference(key, value) {
    const target = REFERENCES[key];
    if (!target || !value) return value;
    const mapped = maps[target].get(value) || value;
    if (!ids[target].has(mapped)) throw new Error(`Referência inválida: ${key}.`);
    return mapped;
  }
  for (const table of TABLES) for (const row of tables[table]) {
    if (table === 'stripe_payment_attempts' && (maps[table].size || maps.reservations.has(row.reservation_id))) {
      throw new Error('Os identificadores associados à Stripe não podem ser remapeados.');
    }
    for (const key of Object.keys(row)) {
      if (REFERENCES[key]) row[key] = remapReference(key, row[key]);
      if ((key.endsWith('_user_id') || key === 'user_id') && row[key]) {
        const member = db.prepare('SELECT 1 FROM memberships WHERE organization_id = ? AND user_id = ? AND active = 1').get(organizationId, row[key]);
        if (!member) row[key] = null;
      }
    }
    if (table === 'voucher_redemptions' && row.reservation_reference) {
      row.reservation_reference = maps.reservations.get(row.reservation_reference) || row.reservation_reference;
    }
    if (table === 'reservations') {
      const units = JSON.parse(row.accommodations_data || '[]');
      if (!Array.isArray(units)) throw new Error('Unidades da reserva inválidas.');
      row.accommodations_data = JSON.stringify(units.map(unit => ({ ...unit, accommodation_id: remapReference('accommodation_id', unit.accommodation_id) })));
      row.google_event_id = null; row.google_calendar_user_id = null;
      // Tokens de outra organização nunca são reutilizados.
      if ([...maps.reservations.values()].includes(row.id)) {
        row.public_token = require('crypto').randomBytes(32).toString('hex');
        row.precheckin_token = require('crypto').randomBytes(32).toString('hex');
      }
    }
    if (table === 'operational_events') {
      row.google_task_id = null;
      if (row.auto_key && row.reservation_id) {
        const parts = row.auto_key.split(':'); parts[0] = row.reservation_id; parts[3] = row.accommodation_id || 'geral'; row.auto_key = parts.join(':');
      }
    }
    if (table === 'conversation_archives' && row.key_type === 'reservation') row.thread_key = maps.reservations.get(row.thread_key) || row.thread_key;
  }
  return tables;
}

function restoreData(tables, organizationId) {
  db.transaction(() => {
    // Never rewind the financial ledger independently of Stripe. Missing event
    // IDs are safe after a fresh restore because captured/refunded amounts and
    // deterministic ledger IDs also make reconciliation idempotent.
    const existing = db.prepare('SELECT * FROM stripe_payment_attempts WHERE organization_id=?').all(organizationId);
    for (const attempt of existing) {
      if (['creating', 'open', 'processing'].includes(attempt.state)) throw new Error('Existem pagamentos Stripe em curso. Aguarde a reconciliação antes do restauro.');
      const restored = tables.stripe_payment_attempts.find(row => row.id === attempt.id);
      if (!restored || ['reservation_id', 'organization_id', 'amount_cents', 'currency', 'snapshot', 'request_json',
        'checkout_session_id', 'payment_intent_id', 'captured_cents', 'refunded_cents', 'state'].some(key => restored[key] !== attempt[key])) {
        throw new Error('O backup alteraria o histórico Stripe. Use um backup atualizado.');
      }
      const payments = db.prepare("SELECT * FROM reservation_payments WHERE reservation_id=? AND id LIKE 'stripe-%' ORDER BY id").all(attempt.reservation_id);
      for (const payment of payments) {
        const restored = tables.reservation_payments.find(row => row.id === payment.id);
        if (!restored || restored.reservation_id !== payment.reservation_id || restored.amount !== payment.amount) {
          throw new Error('O backup alteraria movimentos Stripe já registados.');
        }
      }
    }
    db.pragma('defer_foreign_keys = ON');
    for (const table of [...TABLES].reverse()) db.prepare(`DELETE FROM ${table} WHERE organization_id = ?`).run(organizationId);
    for (const table of TABLES) for (const row of tables[table]) {
      const cols = Object.keys(row);
      db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...cols.map(col => row[col] ?? null));
    }
  })();
}

module.exports = { TABLES, exportData, prepareImport, restoreData, uploadUrls };
