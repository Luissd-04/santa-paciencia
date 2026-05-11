const test = require('node:test');
const assert = require('node:assert/strict');
const {
  countNights,
  getAgeAtDate,
  calculateReservationTotals,
  getPaymentStatus,
} = require('./reservationRules');

test('countNights allows back-to-back reservations', () => {
  assert.equal(countNights('2026-06-01', '2026-06-02'), 1);
  assert.equal(countNights('01-06-2026', '02-06-2026'), 1);
});

test('getAgeAtDate calculates age at check-in date', () => {
  assert.equal(getAgeAtDate('2020-06-12', '2026-06-11'), 5);
  assert.equal(getAgeAtDate('2020-06-12', '2026-06-12'), 6);
});

test('calculateReservationTotals includes tourist tax, breakfast and extra occupancy', () => {
  const accommodation = {
    price_per_night: 100,
    max_guests: 4,
    base_guests_included: 2,
    extra_occupancy_options: [
      { capacity: 2, price: 15, charge_type: 'per_guest_night' },
    ],
  };
  const services = [
    { id: 'tourist_tax', value: 3, active: true },
    { id: 'breakfast', value: 10, active: true },
  ];

  const totals = calculateReservationTotals(accommodation, services, {
    check_in: '2026-06-01',
    check_out: '2026-06-03',
    num_guests: 3,
    breakfast_included: true,
  });

  assert.equal(totals.nights, 2);
  assert.equal(totals.baseAmount, 200);
  assert.equal(totals.extraOccupancyCost, 30);
  assert.equal(totals.touristTax, 18);
  assert.equal(totals.breakfastCost, 60);
  assert.equal(totals.totalAmount, 308);
});

test('getPaymentStatus derives payment state from paid amount', () => {
  assert.equal(getPaymentStatus(0, 100), 'pendente');
  assert.equal(getPaymentStatus(40, 100), 'parcial');
  assert.equal(getPaymentStatus(100, 100), 'confirmado');
});
