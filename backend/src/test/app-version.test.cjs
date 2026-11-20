// Versão instalada: o commit de APP_BUILD aparece no /auth/me (só com sessão).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test', EMAIL_ENABLED: 'false', APP_BUILD: 'ABC1234DEF5678' });
const app = require('../app');
const { db } = require('../config/database');
const auth = require('../services/authService');
const orgs = require('../services/orgService');
let server, base;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.on('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server?.close(); db.close(); });

test('commit em minúsculas, 12 caracteres, com a hora do arranque; nada sem sessão', async () => {
  const org = orgs.createOrganization('Versão');
  const user = auth.createUser({ name: 'V', email: 'versao@example.invalid', password: 'SyntheticVersao123!' });
  orgs.createMembership({ organizationId: org.id, userId: user.id, role: 'owner' });
  const session = auth.createSession(user.id, org.id).sessionId;
  const me = await (await fetch(`${base}/auth/me`, { headers: { Cookie: `${auth.SESSION_COOKIE}=${session}` } })).json();
  assert.equal(me.data.user.app_version.commit, 'abc1234def56');
  assert.ok(Number.isFinite(Date.parse(me.data.user.app_version.started_at)));
  assert.equal((await fetch(`${base}/auth/me`)).status, 401);
  assert.equal(JSON.stringify(await (await fetch(`${base}/health`)).json()).includes('abc1234'), false);
});

test('valores que não são um hash ficam vazios', () => {
  for (const value of ['staging-local', '', 'abc', '<script>']) {
    delete require.cache[require.resolve('../services/appBuild')];
    process.env.APP_BUILD = value;
    assert.equal(require('../services/appBuild').commit, null, value);
  }
});
