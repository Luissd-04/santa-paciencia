const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getAccommodationScope,
  getUnavailableAccommodationIds,
  hasDateOverlap,
} = require('./availabilityRules');

const accommodations = [
  { id: 'casa', type: 'alojamento', parent_id: null },
  { id: 'suite-1', type: 'suite', parent_id: 'casa' },
  { id: 'suite-2', type: 'suite', parent_id: 'casa' },
  { id: 'studio', type: 'apartamento', parent_id: null },
];

test('booking a child checks the child and parent', () => {
  assert.deepEqual(new Set(getAccommodationScope(accommodations, 'suite-1')), new Set(['suite-1', 'casa']));
});

test('booking a parent checks parent and children', () => {
  assert.deepEqual(new Set(getAccommodationScope(accommodations, 'casa')), new Set(['casa', 'suite-1', 'suite-2']));
});

test('child conflict makes parent unavailable but not siblings', () => {
  assert.deepEqual(new Set(getUnavailableAccommodationIds(accommodations, ['suite-1'])), new Set(['suite-1', 'casa']));
});

test('parent conflict makes all children unavailable', () => {
  assert.deepEqual(new Set(getUnavailableAccommodationIds(accommodations, ['casa'])), new Set(['casa', 'suite-1', 'suite-2']));
});

test('date overlap blocks real overlaps and allows back-to-back', () => {
  assert.equal(hasDateOverlap('2026-06-01', '2026-06-05', '2026-06-04', '2026-06-08'), true);
  assert.equal(hasDateOverlap('2026-06-01', '2026-06-05', '2026-06-05', '2026-06-08'), false);
});
