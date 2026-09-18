const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

// Base temporária: o módulo lê DB_PATH no require.
process.env.DB_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'occupancy-test-')),
  'test.db'
);

const { db, initDatabase } = require('../config/database');
const { getOccupancyStats } = require('./occupancyStats');

const ORG = 'org-test';

function seed() {
  initDatabase();
  db.prepare("INSERT INTO organizations (id, name, slug) VALUES (?,?,?)").run(ORG, 'Teste', 'teste');
  const acc = db.prepare(
    "INSERT INTO accommodations (id, organization_id, name, type, parent_id, price_per_night, max_guests) VALUES (?,?,?,?,?,100,2)"
  );
  acc.run('casa', ORG, 'Casa inteira', 'alojamento', null);
  acc.run('s1', ORG, 'Suite 1', 'suite', 'casa');
  acc.run('s2', ORG, 'Suite 2', 'suite', 'casa');
  db.prepare("INSERT INTO guests (id, organization_id, name, email) VALUES ('g1',?,'Hóspede','h@x.pt')").run(ORG);
}

function addReservation(id, accommodationId, checkIn, checkOut, accommodationsData = '[]') {
  const nights = (new Date(checkOut) - new Date(checkIn)) / 86400000;
  db.prepare(`
    INSERT INTO reservations (id, organization_id, guest_id, accommodation_id, check_in, check_out,
                              nights, num_guests, total_amount, status, accommodations_data)
    VALUES (?,?,'g1',?,?,?,?,2,100,'confirmada',?)
  `).run(id, ORG, accommodationId, checkIn, checkOut, nights, accommodationsData);
}

seed();

test('a última noite do mês conta (check-out no dia 1 seguinte)', () => {
  addReservation('r1', 's1', '2026-09-30', '2026-10-01');
  const stats = getOccupancyStats(ORG, '2026-09-01', '2026-10-01');
  assert.equal(stats.unitCount, 2);          // a casa-mãe não é inventário extra
  assert.equal(stats.availableNights, 60);   // 30 dias x 2 suites
  assert.equal(stats.occupiedNights, 1);
});

test('reserva a cavalo entre meses divide as noites pelos meses certos', () => {
  addReservation('r2', 's2', '2026-01-30', '2026-02-03');
  const stats = getOccupancyStats(ORG, '2026-01-01', '2027-01-01');
  assert.equal(stats.byMonth['2026-01'], 2); // 30 e 31 de Janeiro
  assert.equal(stats.byMonth['2026-02'], 2); // 1 e 2 de Fevereiro
});

test('reservar o alojamento inteiro ocupa todas as suites filhas', () => {
  addReservation('r3', 'casa', '2026-05-01', '2026-05-04');
  const stats = getOccupancyStats(ORG, '2026-05-01', '2026-05-04');
  assert.equal(stats.occupiedNights, 6);     // 3 noites x 2 suites
  assert.equal(stats.availableNights, 6);
  assert.equal(stats.rate, 100);
});

test('reserva multi-suite conta cada quarto extra sem duplicar o principal', () => {
  addReservation('r4', 's1', '2026-07-01', '2026-07-03', JSON.stringify([
    { accommodation_id: 's1', name: 'Suite 1' },
    { accommodation_id: 's2', name: 'Suite 2' },
  ]));
  const stats = getOccupancyStats(ORG, '2026-07-01', '2026-07-03');
  assert.equal(stats.occupiedNights, 4);     // 2 noites x 2 suites
  assert.equal(stats.rate, 100);
});

test('filtrar por alojamento-pai usa as filhas como inventário', () => {
  const stats = getOccupancyStats(ORG, '2026-05-01', '2026-05-04', { accommodationId: 'casa' });
  assert.equal(stats.unitCount, 2);
  assert.equal(stats.rate, 100);
});

test('reservas canceladas não contam', () => {
  addReservation('r5', 's1', '2026-03-01', '2026-03-05');
  db.prepare("UPDATE reservations SET status='cancelada' WHERE id='r5'").run();
  const stats = getOccupancyStats(ORG, '2026-03-01', '2026-03-05');
  assert.equal(stats.occupiedNights, 0);
});

test('byUnit reparte as noites por unidade (casa inteira conta em cada filha)', () => {
  const stats = getOccupancyStats(ORG, '2026-05-01', '2026-06-01');
  assert.equal(stats.byUnit.s1, 3);
  assert.equal(stats.byUnit.s2, 3);
  assert.equal(stats.byUnit.casa, undefined); // o pai nunca é unidade própria
  assert.deepEqual(stats.unitIds.sort(), ['s1', 's2']);
});
