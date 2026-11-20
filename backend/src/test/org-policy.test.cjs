// Regras por organização num só sítio (services/orgPolicy.js) e diagnóstico
// dos pedidos somado em memória (services/platformDiagnostics.js).
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test', EMAIL_ENABLED: 'false' });
const { db, initDatabase } = require('../config/database');
initDatabase();
const policy = require('../services/orgPolicy');
after(() => db.close());

test('estado do teste: bloqueado, demonstração e serviços externos', () => {
  assert.deepEqual(policy.fromAccess(null), { blocked: false, demo: false, externalAllowed: true });
  assert.deepEqual(policy.fromAccess({ status: 'expired', mode: 'private' }), { blocked: true, demo: false, externalAllowed: false });
  assert.deepEqual(policy.fromAccess({ status: 'active', mode: 'demo' }), { blocked: false, demo: true, externalAllowed: false });
  assert.equal(policy.fromAccess({ status: 'converted', mode: 'demo', converted_at: '2026-01-01' }).demo, false);
  process.env.APP_ENV = 'staging';
  try { assert.equal(policy.fromAccess(null).externalAllowed, false); } finally { delete process.env.APP_ENV; }
});

test('operações externas reconhecidas', () => {
  for (const [method, path] of [['GET', '/auth/google'], ['GET', '/auth/google-email'], ['POST', '/api/backup/import'],
    ['POST', '/api/expenses/scan-receipt'], ['POST', '/api/push/subscribe'], ['PUT', '/api/tasks/x']]) {
    assert.equal(policy.isExternalOperation(method, path), true, `${method} ${path}`);
  }
  for (const [method, path] of [['GET', '/api/push/public-key'], ['GET', '/api/tasks'], ['GET', '/api/reservations']]) {
    assert.equal(policy.isExternalOperation(method, path), false, `${method} ${path}`);
  }
});

test('diagnóstico: medições somadas em memória e gravadas antes do resumo', async () => {
  const diagnostics = require('../services/platformDiagnostics');
  const org = require('../services/orgService').createOrganization('Diagnóstico');
  const { EventEmitter } = require('node:events');
  for (let i = 0; i < 5; i++) {
    const res = Object.assign(new EventEmitter(), { locals: {}, statusCode: i === 4 ? 500 : 200 });
    diagnostics.observe({ user: { organization_id: org.id }, originalUrl: '/api/reservations?x=1' }, res);
    res.emit('finish');
  }
  assert.equal(db.prepare('SELECT COUNT(*) n FROM platform_diagnostics_daily').get().n, 0, 'nada gravado por pedido');
  const rows = diagnostics.summary().diagnostics;
  assert.equal(rows.find(r => r.kind === 'api' && r.name === 'reservations').count, 5);
  assert.equal(rows.find(r => r.kind === 'api_error').count, 1);
});
