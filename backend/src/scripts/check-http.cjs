// App real com SQLite em memória e ficheiros temporários; sem .env ou schedulers.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-http-regression-'));
const previous = process.cwd();
process.chdir(temp);
process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.EMAIL_ENABLED = 'false';
process.env.FRONTEND_PATH = path.resolve(__dirname, '../../../frontend');
const app = require('../app');
const { db } = require('../config/database');
const auth = require('../services/authService');
const orgs = require('../services/orgService');
let server;
async function main() {
  const org = orgs.createOrganization('HTTP A');
  const other = orgs.createOrganization('HTTP B');
  const user = auth.createUser({ name: 'HTTP User', email: 'audit@example.invalid', password: 'SyntheticAudit123!' });
  const member = orgs.createMembership({ organizationId: org.id, userId: user.id, role: 'staff' });
  const first = auth.createSession(user.id, org.id).sessionId;
  const second = auth.createSession(user.id, org.id).sessionId;
  db.prepare('INSERT INTO accommodations (id,organization_id,name,type,door_code,wifi_password) VALUES (?,?,?,?,?,?)')
    .run('catalog-unit', org.id, 'Synthetic unit', 'alojamento', 'PRIVATE-DOOR', 'PRIVATE-WIFI');
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.on('listening', resolve); server.on('error', reject); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const policy = (await fetch(base + '/')).headers.get('content-security-policy');
  assert(!/(?:^|;)script-src [^;]*'unsafe-inline'/.test(policy));
  assert.match(policy, /script-src-attr 'none'/);
  const headers = { Cookie: `${auth.SESSION_COOKIE}=${first}`, 'Content-Type': 'application/json' };
  let r = await fetch(base + '/api/reservations'); assert.equal(r.status, 401);
  r = await fetch(base + '/auth/me', { headers: { Cookie: `${auth.SESSION_COOKIE}=%ZZ` } }); assert.equal(r.status, 401);
  r = await fetch(base + '/api/backup/export', { headers }); assert.equal(r.status, 403);
  r = await fetch(base + '/auth/google-email', { method: 'DELETE', headers }); assert.equal(r.status, 403);
  r = await fetch(base + '/auth/email/inbox', { headers }); assert.equal(r.status, 403);
  r = await fetch(base + '/api/accommodations', { headers }); assert.equal(r.status, 200);
  const catalog = await r.json(); assert.equal(catalog.data.length, 1);
  assert.equal(catalog.data[0].id, 'catalog-unit');
  assert.equal('door_code' in catalog.data[0], false); assert.equal('wifi_password' in catalog.data[0], false);
  assert.equal('_parent' in catalog.data[0], false);
  r = await fetch(base + '/api/accommodations', { method: 'POST', headers, body: '{}' }); assert.equal(r.status, 403);
  console.log('OK: autenticação, consulta de alojamentos e permissões de staff.');
  const receipt = path.join(temp, 'data/uploads/receipts/synthetic.png');
  fs.mkdirSync(path.dirname(receipt), { recursive: true }); fs.writeFileSync(receipt, 'SYNTHETIC');
  db.prepare('INSERT INTO expenses (id,organization_id,date,description,amount,receipt_image) VALUES (?,?,?,?,?,?)')
    .run('expense', org.id, '2030-01-01', 'Synthetic', 10, '/uploads/receipts/synthetic.png');
  for (const url of ['/uploads/receipts/synthetic.png', '/uploads/%72eceipts/synthetic.png', '/uploads/receipts%2Fsynthetic.png']) {
    r = await fetch(base + url); assert.notEqual(r.status, 200, url);
  }
  r = await fetch(base + '/uploads/receipts/synthetic.png', { headers }); assert.equal(r.status, 403);
  db.prepare("UPDATE memberships SET role='owner' WHERE user_id=?").run(user.id);
  r = await fetch(base + '/uploads/receipts/synthetic.png', { headers }); assert.equal(r.status, 200); assert.equal(await r.text(), 'SYNTHETIC');
  db.prepare('UPDATE expenses SET organization_id=? WHERE id=?').run(other.id, 'expense');
  r = await fetch(base + '/uploads/receipts/synthetic.png', { headers }); assert.equal(r.status, 404);
  console.log('OK: documentos privados, isolamento entre organizações e caminhos codificados.');
  r = await fetch(base + '/api/reservations?limit=200', { headers });
  assert.equal(r.status, 200); assert.equal((await r.json()).success, true); assert.match(r.headers.get('cache-control'), /no-store/);
  r = await fetch(base + '/auth/change-password', {
    method: 'POST', headers: { ...headers, Origin: 'https://attacker.invalid', 'Sec-Fetch-Site': 'cross-site' },
    body: JSON.stringify({ current_password: 'SyntheticAudit123!', password: 'ShouldNotApply123!', confirm_password: 'ShouldNotApply123!' }),
  });
  assert.equal(r.status, 403);
  assert(!/apiGet\('\/(?:reservations|guests)\?/.test(fs.readFileSync(path.join(process.env.FRONTEND_PATH, 'js/invoice.js'), 'utf8')));
  r = await fetch(base + '/auth/change-password', { method: 'POST', headers, body: JSON.stringify({ current_password: 'SyntheticAudit123!', password: 'SyntheticChanged123!', confirm_password: 'SyntheticChanged123!' }) });
  assert.equal(r.status, 200);
  r = await fetch(base + '/auth/me', { headers: { Cookie: `${auth.SESSION_COOKIE}=${second}` } }); assert.equal(r.status, 401);
  r = await fetch(base + '/auth/me', { headers }); assert.equal(r.status, 200);
  r = await fetch(base + '/auth/sessions', { headers }); assert.equal(r.status, 200);
  const sessions = (await r.json()).data;
  assert.equal(sessions.length, 1); assert.equal(sessions[0].current, true);
  r = await fetch(base + '/auth/sessions/' + sessions[0].id, { method: 'DELETE', headers }); assert.equal(r.status, 200);
  assert.equal((await r.json()).data.current, true);
  r = await fetch(base + '/auth/me', { headers }); assert.equal(r.status, 401);
  console.log('OK: API de Mensagens, no-store e revogação de sessões.');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  db.close(); process.chdir(previous); fs.rmSync(temp, { recursive: true, force: true });
});
