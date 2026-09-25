const { db } = require('../config/database');
const { publicOrigin } = require('./publicOrigin');
const { v4: uuidv4 } = require('uuid');
const { calculateReservationTotals, buildNightlyPrices } = require('./reservationRules');
const { syncOperationalEventsToGoogle } = require('./calendarService');

function safeJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

// Total padrão do calendário dinâmico. Reservas multi-suite: base = soma, por
// suite, dos preços/noite dessa suite (períodos dinâmicos próprios); extras
// (taxa turística, pequeno-almoço, ocupação extra) contam uma única vez.
function computeStandardTotals(organizationId, resLike, primaryAccommodation, primaryPeriods, services, birthDates) {
  const single = calculateReservationTotals(primaryAccommodation, services, {
    check_in: resLike.check_in,
    check_out: resLike.check_out,
    num_guests: resLike.num_guests,
    breakfast_included: resLike.breakfast_included,
    birth_dates: birthDates,
    pricing_periods: primaryPeriods,
  });
  const accsData = safeJson(resLike.accommodations_data, []);
  if (!Array.isArray(accsData) || accsData.length <= 1) return single;

  let base = 0;
  for (const item of accsData) {
    const acc = db.prepare('SELECT * FROM accommodations WHERE id = ? AND organization_id = ?')
      .get(item.accommodation_id, organizationId);
    if (!acc) { base += Number(item.subtotal || 0); continue; }
    const periods = db.prepare('SELECT * FROM pricing_periods WHERE accommodation_id = ? AND organization_id = ? ORDER BY start_date ASC')
      .all(item.accommodation_id, organizationId);
    base += buildNightlyPrices(Number(acc.price_per_night || 0), single.checkIn, single.checkOut, periods)
      .reduce((sum, n) => sum + (Number(n.price) || 0), 0);
  }
  const extras = single.touristTax + single.breakfastCost + single.extraOccupancyCost;
  return { ...single, baseAmount: base, totalAmount: base + extras };
}

function upsertAdditionalGuests(guestsData, organizationId) {
  if (!Array.isArray(guestsData) || !guestsData.length) return guestsData || [];
  return guestsData.map((g, i) => {
    if (!g?.name) return g;
    const email = g.email?.trim() || `guest_${Date.now()}_${i}@sem-email.local`;
    let existing = email
      ? db.prepare('SELECT id FROM guests WHERE email = ? AND organization_id = ?').get(email, organizationId)
      : null;
    if (!existing && g.id) {
      existing = db.prepare('SELECT id FROM guests WHERE id = ? AND organization_id = ?').get(g.id, organizationId);
    }
    if (existing) {
      db.prepare(`UPDATE guests SET
        name = COALESCE(?, name), phone = COALESCE(?, phone),
        nationality = COALESCE(?, nationality), country = COALESCE(?, country),
        birth_date = COALESCE(?, birth_date), birth_city = COALESCE(?, birth_city),
        document_type = COALESCE(?, document_type), document_number = COALESCE(?, document_number),
        document_issuer_country = COALESCE(?, document_issuer_country),
        nif = COALESCE(?, nif), updated_at = datetime('now')
        WHERE id = ? AND organization_id = ?
      `).run(g.name || null, g.phone || null, g.nationality || null, g.country || null,
             g.birth_date || null, g.birth_city || null, g.document_type || null,
             g.document_number || null, g.document_issuer_country || null, g.nif || null,
             existing.id, organizationId);
      return { ...g, id: existing.id };
    }
    const newId = uuidv4();
    const nameParts = (g.name || '').split(/\s+/);
    db.prepare(`INSERT INTO guests
      (id, organization_id, name, first_name, last_name, email, phone,
       nationality, country, birth_date, birth_city,
       document_type, document_number, document_issuer_country, nif)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(newId, organizationId, g.name,
           g.first_name || nameParts[0] || '', g.last_name || nameParts.slice(1).join(' ') || '',
           email, g.phone || null,
           g.nationality || null, g.country || null, g.birth_date || null, g.birth_city || null,
           g.document_type || null, g.document_number || null, g.document_issuer_country || null,
           g.nif || null);
    return { ...g, id: newId };
  });
}

function getOrganizationServices(organizationId) {
  const row = db.prepare("SELECT value FROM organization_settings WHERE organization_id = ? AND key = 'services'").get(organizationId);
  return row ? safeJson(row.value, []) : [];
}

function publicUrl(req) {
  return publicOrigin(req);
}

function ensurePublicToken(reservation) {
  if (reservation.public_token) return reservation.public_token;
  const token = uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '');
  db.prepare("UPDATE reservations SET public_token = ?, updated_at = datetime('now') WHERE id = ? AND organization_id = ?")
    .run(token, reservation.id, reservation.organization_id);
  reservation.public_token = token;
  return token;
}

function ensurePrecheckinToken(reservation) {
  if (reservation.precheckin_token) return reservation.precheckin_token;
  const token = uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '');
  const expiresAt = reservation.check_out || null;
  db.prepare("UPDATE reservations SET precheckin_token = ?, precheckin_token_expires_at = ?, updated_at = datetime('now') WHERE id = ? AND organization_id = ?")
    .run(token, expiresAt, reservation.id, reservation.organization_id);
  reservation.precheckin_token = token;
  reservation.precheckin_token_expires_at = expiresAt;
  return token;
}

// Sincroniza as tarefas auto-geradas de uma reserva (check-in/check-out/limpeza) com
// o Google Calendar e/ou o Google Tasks — ver syncOperationalEventsToGoogle em
// services/calendarService.js. A reserva em si (createCalendarEvent/updateCalendarEvent,
// chamados à parte) não passa por aqui — continua sempre automática.
function syncReservationTasksToGoogle(reservationId, organizationId, userId) {
  const tasks = db.prepare(
    "SELECT * FROM operational_events WHERE reservation_id = ? AND organization_id = ? AND auto_generated = 1 AND status != 'concluido'"
  ).all(reservationId, organizationId);
  if (!tasks.length) return;
  syncOperationalEventsToGoogle(tasks, { userId, organizationId })
    .catch(err => console.error('Erro ao sincronizar tarefas da reserva:', err.message));
}

module.exports = { safeJson, computeStandardTotals, upsertAdditionalGuests, getOrganizationServices, publicUrl, ensurePublicToken, ensurePrecheckinToken, syncReservationTasksToGoogle };
