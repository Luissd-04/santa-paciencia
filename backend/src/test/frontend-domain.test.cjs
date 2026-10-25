// Módulos partilhados do frontend: estados da reserva e formato dos montantes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../../../frontend/js/domain');
function load(...files) {
  const context = vm.createContext({ window: {}, Intl });
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
  return context.window;
}
const nbsp = text => text.replace(/\s/g, ' ');

test('montantes no formato português, iguais aos dos emails', () => {
  const { ReservationMoney } = load('money.js');
  assert.equal(nbsp(ReservationMoney.format(12345.6)), '12 345,60 €');
  assert.equal(nbsp(ReservationMoney.format(null)), '0,00 €');
  assert.equal(nbsp(ReservationMoney.formatShort(100)), '100 €');
  assert.equal(nbsp(ReservationMoney.formatShort(99.5)), '99,5 €');
});

test('estados: os mesmos rótulos em todos os ecrãs, incluindo valores antigos', () => {
  const { ReservationStatus: S } = load('reservation-status.js');
  // O pré-check-in deixou de ser um estado da reserva; só o histórico o mostra.
  assert.equal(S.label('pre_checkin'), 'Pré-check-in (antigo)');
  assert.equal(S.label('aguardar_pagamento'), 'Aguarda sinal');
  assert.equal(S.precheckinLabel('enviado'), 'Enviado');
  assert.equal(S.precheckinLabel('preenchido'), 'Preenchido');
  assert.deepEqual(JSON.parse(JSON.stringify(Object.keys(S.PRECHECKIN))), [...require('../services/reservationState').PRECHECKIN_STATES]);
  assert.equal(S.paymentLabel('pago'), 'Pago');
  assert.equal(S.paymentLabel('confirmado'), 'Pago');
  assert.equal(S.label('checked_in'), 'Check-in');
  assert.equal(S.label('desconhecido'), 'Desconhecido');
  // JSON: os arrays vêm de outro contexto (vm).
  assert.deepEqual(JSON.parse(JSON.stringify(S.options().map(o => o.v))), ['pre_reserva', 'pendente', 'aguardar_pagamento', 'confirmada', 'check_in', 'check_out', 'cancelada']);
  // A lista do frontend tem os mesmos estados que o servidor aceita.
  assert.deepEqual(JSON.parse(JSON.stringify([...S.SELECTABLE].sort())), [...require('../services/reservationValidation').STATUSES].sort());
});
