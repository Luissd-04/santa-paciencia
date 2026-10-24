const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_POLICY, validatePolicy, calculate } = require('../services/paymentPolicy');
const p = () => structuredClone(DEFAULT_POLICY);
const example = { total: 250, paid: 50, bookedOn: '2026-01-01', checkIn: '2026-06-01', cancelOn: '2026-05-20' };
test('tabelas independentes; reembolso pelo cancelamento ou pela criação', () => {
  const policy = p();
  const c = calculate(policy, example);
  assert.equal(c.depositCents, 5000); assert.equal(c.balanceCents, 20000); assert.equal(c.refundCents, 0);
  policy.refundBasis = 'booking';
  assert.equal(calculate(policy, example).refundCents, 5000);
  assert.equal(calculate(policy, { ...example, bookedOn: '2026-05-20' }).depositCents, 25000);
});
test('limites inclusivos e vencimento em Lisboa respeitam horário de verão', () => {
  assert.equal(calculate(p(), { ...example, bookedOn: '2026-03-03', cancelOn: '2026-05-17' }).depositPercent, 50);
  assert.equal(calculate(p(), { ...example, cancelOn: '2026-05-17' }).refundCents, 2500);
  assert.equal(calculate(p(), example).dueAt, '2026-05-17T11:00:00.000Z');
  assert.equal(calculate(p(), { ...example, checkIn: '2026-02-01', cancelOn: '2026-01-02' }).dueAt, '2026-01-17T12:00:00.000Z');
});
test('rejeita lacunas, sobreposições, limites e percentagens inválidos', () => {
  for (const modify of [p => p.depositRules[0].minDays = 1, p => p.refundRules[1].minDays = 14,
    p => p.refundRules[1].minDays = 16, p => p.refundRules[2].maxDays = 365,
    p => p.depositRules[0].percent = 101, p => p.depositRules[0].percent = 0,
    p => p.graceHours = 0, p => p.refundBasis = 'anything', p => p.balanceDays = 1.5]) {
    const policy = p(); modify(policy); assert.throws(() => validatePolicy(policy), { status: 400 });
  }
  assert.throws(() => calculate(p(), { ...example, bookedOn: '2026-02-30' }));
  assert.throws(() => calculate(p(), { ...example, bookedOn: '2027-01-01' }));
});
test('arredonda cêntimos e evita prestações inferiores ao mínimo Stripe', () => {
  assert.equal(calculate(p(), { ...example, total: 1 }).depositCents, 50);
  assert.equal(calculate(p(), { ...example, total: .75 }).depositCents, 75);
  assert.equal(calculate(p(), { ...example, total: 0 }).depositCents, 0);
  assert.equal(calculate(p(), { ...example, paid: 1.01, cancelOn: '2026-05-17' }).refundCents, 51);
});
