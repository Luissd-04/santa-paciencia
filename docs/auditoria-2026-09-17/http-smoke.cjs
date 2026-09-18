// Verificações HTTP locais: app real, DB em memória, porta aleatória em loopback.
// Nenhum scheduler é iniciado; não carrega .env nem contacta serviços externos.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../..');
const localRequire = createRequire(path.join(root, 'backend/src/package.json'));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-http-auditoria-'));
const oldCwd = process.cwd();
process.chdir(temp);
process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.EMAIL_ENABLED = 'false';
process.env.FRONTEND_PATH = path.join(root, 'frontend');
const app = localRequire('./app');
const { db } = localRequire('./config/database');
const auth = localRequire('./services/authService');
const orgs = localRequire('./services/orgService');
let server;
async function main() {
  const org = orgs.createOrganization('Audit HTTP');
  const user = auth.createUser({ name: 'Audit HTTP', email: 'audit@example.invalid', password: 'SyntheticAudit123!' });
  orgs.createMembership({ organizationId: org.id, userId: user.id, role: 'staff' });
  const first = auth.createSession(user.id, org.id).sessionId;
  const second = auth.createSession(user.id, org.id).sessionId;
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.on('listening', resolve); server.on('error', reject); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { Cookie: `${auth.SESSION_COOKIE}=${first}`, 'Content-Type': 'application/json' };
  let result = await fetch(base + '/api/reservations');
  assert.equal(result.status, 401);
  console.log('OK: API de reservas exige autenticação (401).');
  result = await fetch(base + '/api/backup/export', { headers });
  assert.equal(result.status, 403);
  console.log('OK: staff não consegue exportar backups (403).');
  result = await fetch(base + '/reservations?limit=200', { headers });
  assert.equal(result.status, 200); assert.match(result.headers.get('content-type'), /text\/html/);
  console.log('CONFIRMADO F09: endereço usado por Mensagens devolve HTML, não dados de reservas (200).');
  const receipt = path.join(temp, 'data/uploads/receipts/private-synthetic.png');
  fs.writeFileSync(receipt, 'SYNTHETIC-PRIVATE-RECEIPT');
  result = await fetch(base + '/uploads/receipts/private-synthetic.png');
  assert.equal(result.status, 200); assert.equal(await result.text(), 'SYNTHETIC-PRIVATE-RECEIPT');
  console.log('CONFIRMADO S09: talão acessível sem sessão por URL (200).');
  db.prepare('INSERT INTO google_email_connections (organization_id,email,tokens) VALUES (?,?,?)')
    .run(org.id, 'synthetic@example.invalid', '{}');
  result = await fetch(base + '/auth/google-email', { method: 'DELETE', headers });
  assert.equal(result.status, 200);
  assert.equal(db.prepare('SELECT count(*) AS n FROM google_email_connections').get().n, 0);
  console.log('CONFIRMADO S10: staff desliga Gmail da organização (200).');
  result = await fetch(base + '/auth/change-password', { method: 'POST', headers, body: JSON.stringify({
    current_password: 'SyntheticAudit123!', password: 'SyntheticChanged123!', confirm_password: 'SyntheticChanged123!',
  }) });
  assert.equal(result.status, 200);
  result = await fetch(base + '/auth/me', { headers: { Cookie: `${auth.SESSION_COOKIE}=${second}` } });
  assert.equal(result.status, 401);
  console.log('OK S11 resolvido: alteração de password termina a segunda sessão (401).');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  db.close(); process.chdir(oldCwd); fs.rmSync(temp, { recursive: true, force: true });
});
