// Revisão de segurança (A02): mudar a palavra-passe com sessão ativa invalida os
// links de recuperação que já tinham sido emitidos.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-reset-tokens-'));
const previous = process.cwd();
process.chdir(temp);
process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.EMAIL_ENABLED = 'false';
process.env.TRUST_PROXY = 'loopback';
const app = require('../app');
const { db } = require('../config/database');
const auth = require('../services/authService');
const orgs = require('../services/orgService');
let server, base;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.on('listening', resolve); server.on('error', reject); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server?.close(); db.close(); process.chdir(previous); fs.rmSync(temp, { recursive: true, force: true }); });

const post = (url, body, headers = {}) => fetch(base + url, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
});

test('mudar a palavra-passe invalida os links de recuperação já emitidos', async () => {
  const org = orgs.createOrganization('Mudança de palavra-passe');
  const user = auth.createUser({ name: 'Ana', email: 'ana-reset@example.invalid', password: 'Original123!' });
  orgs.createMembership({ organizationId: org.id, userId: user.id, role: 'owner' });
  const { sessionId } = auth.createSession(user.id, org.id);
  const resetToken = auth.createPasswordResetToken(user.id);
  assert.ok(auth.getResetToken(resetToken));

  const res = await post('/auth/change-password', {
    current_password: 'Original123!', password: 'Nova12345678!', confirm_password: 'Nova12345678!',
  }, { Cookie: `${auth.SESSION_COOKIE}=${sessionId}`, 'X-Forwarded-For': '198.51.100.50' });
  assert.equal(res.status, 200);

  assert.equal(auth.getResetToken(resetToken) ?? null, null);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM password_reset_tokens WHERE user_id=?').get(user.id).n, 0);
  const reuse = await post('/auth/reset-password', { token: resetToken, password: 'Atacante12345!', confirm_password: 'Atacante12345!' }, { 'X-Forwarded-For': '198.51.100.51' });
  assert.equal(reuse.status, 400);
  const hash = db.prepare('SELECT password_hash FROM users WHERE id=?').get(user.id).password_hash;
  assert.equal(auth.verifyPassword('Nova12345678!', hash), true);
});
