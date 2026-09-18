const { db } = require('../config/database');
const { getAccommodationScope, getUnavailableAccommodationIds } = require('./availabilityRules');
const { findBlockConflict, getBlockedAccommodationIds } = require('./accommodationBlockService');

function findConflict(org, unit, checkIn, checkOut, excludeId = null) {
  const accommodations = db.prepare('SELECT id, type, parent_id FROM accommodations WHERE organization_id = ?').all(org);
  const ids = getAccommodationScope(accommodations, unit);
  if (!ids.length) return null;
  return db.prepare(`SELECT r.id FROM reservation_units u JOIN reservations r ON r.id = u.reservation_id AND r.organization_id = u.organization_id
    WHERE u.organization_id = ? AND u.accommodation_id IN (${ids.map(() => '?').join(',')})
    AND r.status != 'cancelada' AND r.check_in < ? AND r.check_out > ? AND (? IS NULL OR r.id != ?) LIMIT 1`)
    .get(org, ...ids, checkOut, checkIn, excludeId, excludeId) || findBlockConflict(org, unit, checkIn, checkOut);
}

function unavailableUnits(org, checkIn, checkOut, excludeId = null) {
  const occupied = db.prepare(`SELECT DISTINCT u.accommodation_id FROM reservation_units u
    JOIN reservations r ON r.id = u.reservation_id AND r.organization_id = u.organization_id
    WHERE u.organization_id = ? AND r.status != 'cancelada' AND r.check_in < ? AND r.check_out > ?
    AND (? IS NULL OR r.id != ?)`).all(org, checkOut, checkIn, excludeId, excludeId).map(row => row.accommodation_id);
  const accommodations = db.prepare('SELECT id, type, parent_id FROM accommodations WHERE organization_id = ?').all(org);
  return [...new Set([...getUnavailableAccommodationIds(accommodations, occupied), ...getBlockedAccommodationIds(org, checkIn, checkOut)])];
}

function validateExtraUnits(org, units, mainId, checkIn, checkOut, excludeId) {
  if (!Array.isArray(units) || units.length > 100) throw Object.assign(new Error('Unidades adicionais inválidas.'), { status: 400 });
  const all = db.prepare('SELECT id, type, parent_id FROM accommodations WHERE organization_id = ?').all(org);
  const selected = new Set([mainId]);
  for (const unit of units) {
    const id = unit?.accommodation_id;
    if (id === mainId) continue; // payload antigo inclui a unidade principal
    if (!all.some(a => a.id === id) || selected.has(id)) throw Object.assign(new Error('Alojamento adicional inválido ou repetido.'), { status: 400 });
    if (getAccommodationScope(all, id).some(scope => selected.has(scope)) || findConflict(org, id, checkIn, checkOut, excludeId)) {
      throw Object.assign(new Error('Alojamento adicional indisponível.'), { status: 409 });
    }
    selected.add(id);
  }
}
module.exports = { findConflict, unavailableUnits, validateExtraUnits };
