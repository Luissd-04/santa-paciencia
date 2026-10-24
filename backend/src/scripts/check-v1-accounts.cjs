// Local acceptance: no .env, disposable database, mocked Gmail transport.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const previous = process.cwd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-v1-accounts-'));
process.chdir(temp);
Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test', EMAIL_ENABLED: 'true', GOOGLE_CLIENT_ID: 'synthetic', GOOGLE_CLIENT_SECRET: 'synthetic', GOOGLE_REDIRECT_URI: 'http://localhost/callback' });
delete process.env.FRONTEND_PATH;
delete process.env.STRIPE_SECRET_KEY;
delete process.env.STRIPE_WEBHOOK_SECRET;
const app = require('../app');
const { db } = require('../config/database');
const auth = require('../services/authService');
const orgs = require('../services/orgService');
const google = require('../config/googleEmail');
const { OAuth2Client } = require('google-auth-library');
const originalRequest = OAuth2Client.prototype.request;
const sent = [];
OAuth2Client.prototype.request = async function (request) {
  if (request.method === 'POST' && request.url.endsWith('/messages/send')) {
    sent.push(Buffer.from(request.data.raw, 'base64url').toString());
    return { data: { id: 'synthetic-' + sent.length, threadId: 'synthetic' } };
  }
  if (request.url.includes('/messages/')) return { data: { payload: { headers: [] } } };
  throw new Error('External request blocked');
};
let server;
async function main() {
  const org = orgs.createOrganization('Account acceptance');
  const user = auth.createUser({ name: 'Owner', email: 'old@example.invalid', password: 'Synthetic123!' });
  orgs.createMembership({ organizationId: org.id, userId: user.id, role: 'owner' });
  const cookie = `${auth.SESSION_COOKIE}=${auth.createSession(user.id, org.id).sessionId}`;
  google.saveEmailTokens(org.id, { access_token: 'synthetic' }, 'sender@example.invalid');
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const req = (method, url, body) => fetch(base + url, { method, redirect: 'manual', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  let response = await req('PUT', '/auth/profile', { name: 'Owner', email: 'new@example.invalid', current_password: 'Synthetic123!' });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.email_pending, 'new@example.invalid');
  assert.equal(auth.getUserByEmail('old@example.invalid').id, user.id);
  assert.equal(auth.getUserByEmail('new@example.invalid'), undefined);
  const html = Buffer.from(sent[0].split('\r\n\r\n')[1], 'base64').toString();
  const token = html.match(/confirm-email\?token=([a-f0-9]{64})/)[1];
  assert.notEqual(db.prepare('SELECT token_hash FROM email_changes').get().token_hash, token);
  assert.equal((await req('GET', '/auth/confirm-email?token=' + token)).status, 200);
  assert.equal(auth.getUserByEmail('old@example.invalid').id, user.id, 'GET must not consume verification');
  assert.equal((await req('POST', '/auth/confirm-email', { token })).status, 200);
  assert.equal(auth.getUserByEmail('new@example.invalid').id, user.id);
  assert.equal((await req('POST', '/auth/confirm-email', { token })).status, 400);
  assert.match(sent[1], /To: old@example.invalid/);
  console.log('OK: email verification, unchanged login until confirmation, notification and replay protection.');
  const invite = orgs.createInvitation({ organizationId: org.id, email: 'invited@example.invalid', role: 'staff', invitedByUserId: user.id });
  assert.notEqual(db.prepare('SELECT token FROM invitations WHERE id=?').get(invite.id).token, invite.token);
  assert.equal(orgs.getInvitationByToken(invite.token).id, invite.id);
  const body = { token: invite.token, name: 'Invited', password: 'Synthetic123!', confirm_password: 'Synthetic123!' };
  const pair = await Promise.all([req('POST', '/auth/invitations/accept', body), req('POST', '/auth/invitations/accept', body)]);
  assert.equal(pair.filter(r => r.status === 201).length, 1);
  const invited = auth.getUserByEmail('invited@example.invalid');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM memberships WHERE user_id=?').get(invited.id).n, 1);
  const another = orgs.createOrganization('Another org');
  const existingInvite = orgs.createInvitation({ organizationId: another.id, email: invited.email, role: 'manager', invitedByUserId: user.id });
  assert.equal((await req('POST', '/auth/invitations/accept', { token: existingInvite.token, password: 'Synthetic123!' })).status, 200);
  assert.equal(orgs.getMembershipByUserAndOrganization(invited.id, another.id).role, 'manager');
  console.log('OK: hashed invitations, atomic concurrent acceptance and existing accounts.');
  response = await req('GET', '/auth/google');
  assert.equal(response.status, 302);
  const state = new URL(response.headers.get('location')).searchParams.get('state');
  assert.equal(state.length, 64);
  assert.equal((await req('GET', `/auth/google-email/callback?state=${state}`)).status, 400);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM oauth_states').get().n, 1);
  assert.equal((await req('GET', `/auth/google/callback?state=${state}`)).status, 400); // no code; state consumed before transport
  assert.equal(db.prepare('SELECT COUNT(*) n FROM oauth_states').get().n, 0);
  assert.equal((await req('GET', `/auth/google/callback?state=${state}`)).status, 400);
  console.log('OK: OAuth purpose, session binding and single consumption.');
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => {
  OAuth2Client.prototype.request = originalRequest;
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  db.close(); process.chdir(previous); fs.rmSync(temp, { recursive: true, force: true });
});
