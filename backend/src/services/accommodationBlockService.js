const { db } = require('../config/database');
const { getAccommodationScope, getUnavailableAccommodationIds } = require('./availabilityRules');

// Datas seguem a mesma convenção das reservas: start_date inclusivo, end_date
// exclusivo. Sobreposição => start_date < checkOut AND end_date > checkIn.

// Devolve o primeiro bloqueio que colide com [checkIn, checkOut) para o
// alojamento indicado (considerando propriedade<->unidades), ou null.
function findBlockConflict(organizationId, accommodationId, checkIn, checkOut) {
  const accommodations = db
    .prepare('SELECT id, type, parent_id FROM accommodations WHERE organization_id = ?')
    .all(organizationId);
  const idsToCheck = getAccommodationScope(accommodations, accommodationId);
  if (!idsToCheck.length) return null;

  const placeholders = idsToCheck.map(() => '?').join(',');
  return db.prepare(`
    SELECT id, accommodation_id, start_date, end_date, reason
    FROM accommodation_blocks
    WHERE organization_id = ?
      AND start_date < ?
      AND end_date > ?
      AND accommodation_id IN (${placeholders})
    LIMIT 1
  `).get(organizationId, checkOut, checkIn, ...idsToCheck) || null;
}

// Devolve os ids de alojamentos indisponíveis por bloqueio no intervalo dado
// (expandidos para propriedade/unidades), para o endpoint de disponibilidade.
function getBlockedAccommodationIds(organizationId, checkIn, checkOut) {
  const blocked = db.prepare(`
    SELECT DISTINCT accommodation_id
    FROM accommodation_blocks
    WHERE organization_id = ?
      AND start_date < ?
      AND end_date > ?
  `).all(organizationId, checkOut, checkIn).map(r => r.accommodation_id);
  if (!blocked.length) return [];

  const accommodations = db
    .prepare('SELECT id, type, parent_id FROM accommodations WHERE organization_id = ?')
    .all(organizationId);
  return getUnavailableAccommodationIds(accommodations, blocked);
}

module.exports = { findBlockConflict, getBlockedAccommodationIds };
