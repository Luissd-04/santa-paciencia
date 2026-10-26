const { db } = require('../config/database');
const { publicOrigin } = require('./publicOrigin');
const { v4: uuidv4 } = require('uuid');
const { calculateReservationTotals, buildNightlyPrices } = require('./reservationRules');
const { syncOperationalEventsToGoogle } = require('./calendarService');

const { safeJson } = require('./json');

// Lotação de uma estadia: a soma da lotação de cada quarto (o principal e os
// extra de accommodations_data). Ids desconhecidos ou repetidos não contam;
// a gravação recusa-os em validateExtraUnits.
function stayCapacity(organizationId, primaryAccommodation, units) {
  const ids = new Set([primaryAccommodation.id]);
  let capacity = Number(primaryAccommodation.max_guests) || 0;
  for (const unit of (Array.isArray(units) ? units : safeJson(units, []))) {
    const id = unit?.accommodation_id;
    if (!id || ids.has(id)) continue;
    const acc = db.prepare('SELECT max_guests FROM accommodations WHERE id = ? AND organization_id = ?').get(id, organizationId);
    if (!acc) continue;
    ids.add(id);
    capacity += Number(acc.max_guests) || 0;
  }
  return { capacity, room_count: ids.size };
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
    ...stayCapacity(organizationId, primaryAccommodation, resLike.accommodations_data),
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

const getOrganizationServices = organizationId => require('./settingsService').services(organizationId);

function publicUrl(req) {
  return publicOrigin(req);
}

function ensurePublicToken(reservation) {
  if (reservation.public_token) return reservation.public_token;
  const token = require('./publicLinks').newToken();
  db.prepare("UPDATE reservations SET public_token = ?, updated_at = datetime('now') WHERE id = ? AND organization_id = ?")
    .run(token, reservation.id, reservation.organization_id);
  reservation.public_token = token;
  return token;
}

function ensurePrecheckinToken(reservation) {
  if (reservation.precheckin_token) return reservation.precheckin_token;
  const token = require('./publicLinks').newToken();
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
    "SELECT * FROM operational_events WHERE reservation_id = ? AND organization_id = ? AND auto_generated = 1"
  ).all(reservationId, organizationId);
  if (!tasks.length) return;
  syncOperationalEventsToGoogle(tasks, { userId, organizationId })
    .catch(err => console.error('Erro ao sincronizar tarefas da reserva:', err.message));
}

module.exports = { safeJson, stayCapacity, computeStandardTotals, getOrganizationServices, publicUrl, ensurePublicToken, ensurePrecheckinToken, syncReservationTasksToGoogle };
