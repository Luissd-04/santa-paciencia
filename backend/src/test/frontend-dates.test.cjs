// Datas do frontend num só módulo (js/domain/dates.js): somar dias e mostrar
// instantes na hora do alojamento, iguais em todos os ecrãs.
const { runFrontend } = require('../test-support/frontend.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ctx = vm.createContext({ window: {} });
runFrontend(fs.readFileSync(path.resolve(__dirname, '../../../frontend/js/domain/dates.js'), 'utf8'), ctx);
const D = ctx.window.ReservationDates;

test('addDays atravessa fins de mês, de ano e a mudança de hora', () => {
  assert.equal(D.addDays('2026-01-31', 1), '2026-02-01');
  assert.equal(D.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(D.addDays('2026-03-28', 2), '2026-03-30'); // hora de verão a 29/03
  assert.equal(D.addDays('2026-10-24', 2), '2026-10-26'); // hora de inverno a 25/10
  assert.equal(D.addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(D.addDays('não é data', 1), '');
});

test('formatDateTime mostra o instante na hora de Lisboa e lê o formato do SQLite', () => {
  assert.equal(D.formatDateTime('2026-07-01 10:00:00'), '01/07/2026, 11:00'); // UTC+1 no verão
  assert.equal(D.formatDateTime('2026-12-01T10:00:00Z'), '01/12/2026, 10:00');
  assert.match(D.formatDateTime('2026-07-01 10:00:00', 'compact'), /^01\D+.*11:00$/); // sem ano
  assert.equal(D.formatDateTime(''), '—');
  assert.equal(D.formatDateTime('lixo'), 'lixo');
});
