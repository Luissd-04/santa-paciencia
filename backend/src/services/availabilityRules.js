function getAccommodationScope(accommodations = [], accommodationId) {
  const accommodation = accommodations.find(item => item.id === accommodationId);
  if (!accommodation) return [];

  const ids = new Set([accommodationId]);
  if (accommodation.parent_id) {
    ids.add(accommodation.parent_id);
  } else if (accommodation.type === 'alojamento') {
    accommodations
      .filter(item => item.parent_id === accommodationId)
      .forEach(item => ids.add(item.id));
  }
  return [...ids];
}

function getUnavailableAccommodationIds(accommodations = [], conflictingIds = []) {
  const unavailable = new Set(conflictingIds);
  conflictingIds.forEach(conflictId => {
    const accommodation = accommodations.find(item => item.id === conflictId);
    if (!accommodation) return;
    if (accommodation.parent_id) {
      unavailable.add(accommodation.parent_id);
    } else if (accommodation.type === 'alojamento') {
      accommodations
        .filter(item => item.parent_id === conflictId)
        .forEach(item => unavailable.add(item.id));
    }
  });
  return [...unavailable];
}

function hasDateOverlap(aCheckIn, aCheckOut, bCheckIn, bCheckOut) {
  return aCheckIn < bCheckOut && aCheckOut > bCheckIn;
}

module.exports = {
  getAccommodationScope,
  getUnavailableAccommodationIds,
  hasDateOverlap,
};
