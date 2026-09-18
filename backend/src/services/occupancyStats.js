const { db } = require('../config/database');

const DAY_MS = 86400000;

function isoDay(value) {
  return String(value || '').slice(0, 10);
}

function toDate(value) {
  return new Date(`${isoDay(value)}T00:00:00Z`);
}

// Datas em UTC: usar `new Date(ano, mes, dia).toISOString()` devolve o dia
// anterior em Portugal no horário de verão (meia-noite local = 23h UTC).
function addDays(value, days) {
  return new Date(toDate(value).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

function daysBetween(start, end) {
  return Math.round((toDate(end) - toDate(start)) / DAY_MS);
}

function firstOfMonth(year, month /* 1-12 */) {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

function loadAccommodations(organizationId) {
  return db.prepare(
    'SELECT id, type, parent_id FROM accommodations WHERE organization_id = ?'
  ).all(organizationId);
}

// Um alojamento-pai não é inventário próprio — representa as suites filhas.
// Reservá-lo ocupa todas elas (é assim que findConflict() já bloqueia datas),
// por isso conta como N noites-quarto e nunca como uma unidade à parte.
function expandToUnits(accommodations, accommodationId) {
  const children = accommodations.filter(a => a.parent_id === accommodationId);
  if (children.length) return children.map(a => a.id);
  return accommodations.some(a => a.id === accommodationId) ? [accommodationId] : [];
}

// Inventário = unidades-folha (as que não são pai de nenhuma outra).
function getInventoryUnits(accommodations) {
  const parents = new Set(accommodations.map(a => a.parent_id).filter(Boolean));
  return accommodations.filter(a => !parents.has(a.id)).map(a => a.id);
}

// Unidades realmente ocupadas por uma reserva: a principal (expandida) mais os
// quartos extra guardados em accommodations_data (reservas multi-suite).
function getReservationUnits(accommodations, reservation) {
  const units = new Set(expandToUnits(accommodations, reservation.accommodation_id));
  let extras = [];
  try { extras = JSON.parse(reservation.accommodations_data || '[]'); } catch { extras = []; }
  if (Array.isArray(extras)) {
    for (const item of extras) {
      const id = item && (item.accommodation_id || item.id);
      if (id) expandToUnits(accommodations, id).forEach(unit => units.add(unit));
    }
  }
  return units;
}

/**
 * Noites-quarto ocupadas no intervalo [start, end) — `end` exclusivo.
 * Devolve também a repartição por mês ('YYYY-MM') e por dia ('YYYY-MM-DD'),
 * sempre atribuída à noite real e não ao mês/dia do check-in.
 */
function getOccupancyStats(organizationId, start, end, { accommodationId = null } = {}) {
  const accommodations = loadAccommodations(organizationId);
  const scope = accommodationId
    ? expandToUnits(accommodations, accommodationId)
    : getInventoryUnits(accommodations);
  const inScope = new Set(scope);
  const unitCount = scope.length;
  const totalDays = Math.max(0, daysBetween(start, end));

  const reservations = inScope.size ? db.prepare(`
    SELECT accommodation_id, check_in, check_out, accommodations_data
    FROM reservations
    WHERE organization_id = ?
      AND status != 'cancelada'
      AND check_in < ? AND check_out > ?
  `).all(organizationId, end, start) : [];

  // Set de "unidade@noite": deduplica a mesma noite contada duas vezes (a
  // suite principal repetida em accommodations_data, ou um duplo-booking).
  const nights = new Set();
  for (const reservation of reservations) {
    const units = [...getReservationUnits(accommodations, reservation)].filter(id => inScope.has(id));
    if (!units.length) continue;
    const from = isoDay(reservation.check_in) > start ? isoDay(reservation.check_in) : start;
    const to = isoDay(reservation.check_out) < end ? isoDay(reservation.check_out) : end;
    for (let day = from; day < to; day = addDays(day, 1)) {
      for (const unit of units) nights.add(`${unit}@${day}`);
    }
  }

  const byMonth = {};
  const byDay = {};
  const byUnit = {};
  for (const key of nights) {
    const day = key.slice(-10);
    byDay[day] = (byDay[day] || 0) + 1;
    const month = day.slice(0, 7);
    byMonth[month] = (byMonth[month] || 0) + 1;
    const unit = key.slice(0, -11);
    byUnit[unit] = (byUnit[unit] || 0) + 1;
  }

  const occupiedNights = nights.size;
  const availableNights = totalDays * unitCount;
  return {
    unitCount,
    totalDays,
    occupiedNights,
    availableNights,
    rate: availableNights > 0 ? Math.round((occupiedNights / availableNights) * 100) : 0,
    unitIds: scope,
    byMonth,
    byDay,
    byUnit,
  };
}

function occupancyRate(occupiedNights, availableNights) {
  return availableNights > 0 ? Math.round((occupiedNights / availableNights) * 100) : 0;
}

module.exports = {
  getOccupancyStats,
  occupancyRate,
  getInventoryUnits,
  expandToUnits,
  getReservationUnits,
  loadAccommodations,
  addDays,
  daysBetween,
  firstOfMonth,
};
