// ── Histórico da reserva (timeline) ──
// Regista quem fez o quê em cada reserva. O registo nunca deve quebrar a
// operação principal: falhas ficam apenas no log do servidor.
const { v4: uuidv4 } = require('uuid');
const { db } = require('../config/database');

// Campos da reserva que aparecem na timeline quando alterados.
const TRACKED_FIELDS = [
  'accommodation_id', 'check_in', 'check_out', 'nights',
  'num_adults', 'num_children', 'num_guests',
  'total_amount', 'amount_paid', 'status', 'payment_status',
  'payment_method', 'channel', 'breakfast_included', 'notes', 'payment_date',
];

const AMOUNT_FIELDS = new Set(['total_amount', 'amount_paid']);

function normalizeValue(field, value) {
  if (value === undefined || value === null || value === '') return null;
  if (AMOUNT_FIELDS.has(field)) return Math.round(Number(value) * 100) / 100;
  if (field === 'breakfast_included') return Number(value) ? 1 : 0;
  if (typeof value === 'number') return value;
  return String(value);
}

function valuesDiffer(field, from, to) {
  if (from === to) return false;
  if (AMOUNT_FIELDS.has(field) && from !== null && to !== null) {
    return Math.abs(Number(from) - Number(to)) > 0.01;
  }
  // Números vs strings numéricas ("2" vs 2) não são alterações reais.
  if (from !== null && to !== null && String(from) === String(to)) return false;
  return true;
}

function diffReservationFields(before, after) {
  const changes = [];
  for (const field of TRACKED_FIELDS) {
    const from = normalizeValue(field, before?.[field]);
    const to = normalizeValue(field, after?.[field]);
    if (valuesDiffer(field, from, to)) changes.push({ field, from, to });
  }
  return changes;
}

function recordHistory({ organizationId, reservationId, userId = null, action, changes = null, meta = null }) {
  try {
    db.prepare(`
      INSERT INTO reservation_history (id, organization_id, reservation_id, user_id, action, changes, meta)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuidv4(), organizationId, reservationId, userId, action,
      changes && changes.length ? JSON.stringify(changes) : null,
      meta ? JSON.stringify(meta) : null
    );
  } catch (err) {
    console.warn('Histórico da reserva não registado:', err.message);
  }
}

module.exports = { recordHistory, diffReservationFields };
