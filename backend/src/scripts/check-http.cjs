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
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.on('listening', resolve); server.on('error', reject); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { Cookie: `${auth.SESSION_COOKIE}=${first}`, 'Content-Type': 'application/json' };
  let r = await fetch(base + '/api/reservations'); assert.equal(r.status, 401);
  r = await fetch(base + '/api/backup/export', { headers }); assert.equal(r.status, 403);
  r = await fetch(base + '/auth/google-email', { method: 'DELETE', headers }); assert.equal(r.status, 403);
  r = await fetch(base + '/auth/email/inbox', { headers }); assert.equal(r.status, 403);
  console.log('OK: autenticação e permissões de staff.');
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
  assert(!/apiGet\('\/(?:reservations|guests)\?/.test(fs.readFileSync(path.join(process.env.FRONTEND_PATH, 'js/invoice.js'), 'utf8')));
  r = await fetch(base + '/auth/change-password', { method: 'POST', headers, body: JSON.stringify({ current_password: 'SyntheticAudit123!', password: 'SyntheticChanged123!', confirm_password: 'SyntheticChanged123!' }) });
  assert.equal(r.status, 200);
  r = await fetch(base + '/auth/me', { headers: { Cookie: `${auth.SESSION_COOKIE}=${second}` } }); assert.equal(r.status, 401);
  console.log('OK: API de Mensagens, no-store e revogação de sessões.');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  db.close(); process.chdir(previous); fs.rmSync(temp, { recursive: true, force: true });
});
