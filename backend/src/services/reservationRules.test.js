const test = require('node:test');
const assert = require('node:assert/strict');
const {
  countNights,
  getAgeAtDate,
  calculateReservationTotals,
  buildNightlyPrices,
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

test('calculateReservationTotals returns one nightly price entry per night', () => {
  const accommodation = { price_per_night: 100, max_guests: 4 };
  const totals = calculateReservationTotals(accommodation, [], {
    check_in: '2026-06-01',
    check_out: '2026-06-04',
    num_guests: 2,
  });
  assert.equal(totals.nightlyPrices.length, 3);
  assert.deepEqual(totals.nightlyPrices.map(n => n.date), ['2026-06-01', '2026-06-02', '2026-06-03']);
  assert.equal(totals.baseAmount, 300);
});

test('nightly_prices override changes base per night (by date)', () => {
  const accommodation = { price_per_night: 100, max_guests: 4 };
  const totals = calculateReservationTotals(accommodation, [], {
    check_in: '2026-06-01',
    check_out: '2026-06-04',
    num_guests: 2,
    nightly_prices: [
      { date: '2026-06-01', price: 120 },
      { date: '2026-06-03', price: 80 },
      // 2026-06-02 sem override → cai no preço-base (100)
    ],
  });
  assert.equal(totals.baseAmount, 300); // 120 + 100 + 80
  assert.equal(totals.nightlyPrices[0].price, 120);
  assert.equal(totals.nightlyPrices[1].price, 100);
  assert.equal(totals.nightlyPrices[2].price, 80);
});

test('buildNightlyPrices ignores override dates outside the stay', () => {
  const nights = buildNightlyPrices(100, '2026-06-01', '2026-06-03', [], [
    { date: '2026-06-01', price: 150 },
    { date: '2025-01-01', price: 999 }, // fora do intervalo → ignorado
  ]);
  assert.deepEqual(nights, [
    { date: '2026-06-01', price: 150 },
    { date: '2026-06-02', price: 100 },
  ]);
});

test('getPaymentStatus derives payment state from paid amount', () => {
  assert.equal(getPaymentStatus(0, 100), 'pendente');
  assert.equal(getPaymentStatus(40, 100), 'parcial');
  assert.equal(getPaymentStatus(100, 100), 'confirmado');
});
