const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
const { db, initDatabase } = require('../config/database');
initDatabase();
const auth = require('../services/authService');
const orgs = require('../services/orgService');
const { withSchedulerLease } = require('../services/schedulerLease');
const org = orgs.createOrganization('Synthetic security tests');
function account() {
  const user = auth.createUser({ name: 'Synthetic', email: `${crypto.randomUUID()}@example.invalid`, password: 'Original123!' });
  orgs.createMembership({ userId: user.id, organizationId: org.id, role: 'owner' });
  return user;
}
after(() => db.close());

test('hash assíncrono preserva compatibilidade com passwords existentes', async () => {
  const original = auth.hashPassword('Original123!');
  assert.equal(await auth.verifyPasswordAsync('Original123!', original), true);
  assert.equal(await auth.verifyPasswordAsync('Wrong123!', original), false);
  const updated = await auth.hashPasswordAsync('Changed123!');
  assert.equal(auth.verifyPassword('Changed123!', updated), true);
});

test('cookies de sessão não ficam guardados na base nem aceitam o hash como cookie', () => {
  const user = account();
  const { sessionId } = auth.createSession(user.id, org.id);
  const stored = db.prepare('SELECT id FROM auth_sessions WHERE user_id=?').get(user.id).id;
  assert.equal(stored, auth.digestToken(sessionId));
  assert.equal(auth.getSessionUser(sessionId).id, user.id);
  assert.equal(auth.getSessionUser(stored), null);
  const rotated = auth.createSession(user.id, org.id, sessionId);
  assert.equal(auth.getSessionUser(sessionId), null);
  assert.equal(auth.getSessionUser(rotated.sessionId).id, user.id);
  auth.deleteSession(rotated.sessionId);
  assert.equal(auth.getSessionUser(rotated.sessionId), null);
});

test('recuperação usa hash, invalida o link anterior e só permite uma utilização', () => {
  const user = account();
  const { sessionId } = auth.createSession(user.id, org.id);
  const previous = auth.createPasswordResetToken(user.id);
  const token = auth.createPasswordResetToken(user.id);
  assert.equal(auth.getResetToken(previous), undefined);
  const stored = auth.getResetToken(token).token;
  assert.notEqual(stored, token);
  assert.equal(auth.getResetToken(stored), null);
  auth.consumeResetToken(token, 'Changed123!');
  assert.equal(auth.getSessionUser(sessionId), null);
  assert.throws(() => auth.consumeResetToken(token, 'Changed456!'), /inválido/);
  assert(auth.verifyPassword('Changed123!', auth.getUserByEmail(user.email).password_hash));
});

test('falha ao consumir o link reverte password e preserva a sessão', () => {
  const user = account();
  const { sessionId } = auth.createSession(user.id, org.id);
  const token = auth.createPasswordResetToken(user.id);
  db.exec("CREATE TEMP TRIGGER fail_reset BEFORE UPDATE OF used_at ON password_reset_tokens BEGIN SELECT RAISE(ABORT, 'simulated failure'); END");
  try { assert.throws(() => auth.consumeResetToken(token, 'Changed123!'), /simulated/); }
  finally { db.exec('DROP TRIGGER fail_reset'); }
  assert(auth.verifyPassword('Original123!', auth.getUserByEmail(user.email).password_hash));
  assert(auth.getResetToken(token));
  assert(auth.getSessionUser(sessionId));
});

test('migração preserva cookies e links antigos e pode repetir-se sem alterar os hashes', () => {
  const user = account();
  const sessionId = crypto.randomBytes(32).toString('hex');
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare("INSERT INTO auth_sessions(id,user_id,organization_id,expires_at) VALUES(?,?,?,datetime('now','+1 day'))")
    .run(sessionId, user.id, org.id);
  db.prepare("INSERT INTO password_reset_tokens(id,user_id,token,expires_at) VALUES(?,?,?,datetime('now','+1 hour'))")
    .run(crypto.randomUUID(), user.id, token);
  db.prepare('DELETE FROM schema_migrations WHERE id=?').run('20260919_auth_scheduler');
  initDatabase();
  initDatabase();
  assert.equal(auth.getSessionUser(sessionId).id, user.id);
  assert.equal(auth.getResetToken(token).token, auth.digestToken(token));
  assert.equal(db.pragma('foreign_key_check').length, 0);
});

test('duas execuções automáticas na mesma base não se sobrepõem', async () => {
  let finish;
  const gate = new Promise(resolve => { finish = resolve; });
  const first = withSchedulerLease(db, 'synthetic', async () => gate);
  assert.equal(await withSchedulerLease(db, 'synthetic', () => assert.fail('executou em simultâneo')), false);
  finish();
  assert.equal(await first, true);
  assert.equal(await withSchedulerLease(db, 'synthetic', async () => {}), true);
});

test('bloqueio automático recupera após expiração e liberta-se após falha', async () => {
  db.prepare('INSERT INTO scheduler_leases VALUES(?,?,?)').run('expired', 'old', Date.now() - 1);
  await assert.rejects(withSchedulerLease(db, 'expired', async () => { throw new Error('synthetic failure'); }), /synthetic/);
  assert.equal(await withSchedulerLease(db, 'expired', async () => {}), true);
});

test('credenciais Google cifradas recusam adulteração e troca de organização', () => {
  const { encodeTokens, decodeTokens } = require('../config/tokenStorage');
  const tokens = { refresh_token: 'SYNTHETIC-REFRESH', access_token: 'SYNTHETIC-ACCESS' };
  const encoded = encodeTokens(tokens, 'email:org-a');
  assert.equal(encoded.includes('SYNTHETIC'), false);
  assert.deepEqual(decodeTokens(encoded, 'email:org-a'), tokens);
  assert.throws(() => decodeTokens(encoded, 'email:org-b'), /credenciais/);
  const tampered = JSON.parse(encoded);
  const bytes = Buffer.from(tampered.data, 'base64'); bytes[0] ^= 1;
  tampered.data = bytes.toString('base64');
  assert.throws(() => decodeTokens(JSON.stringify(tampered), 'email:org-a'), /credenciais/);
});

test('migração cifra ligações Google existentes e preserva o conteúdo em reinícios', () => {
  const { decodeTokens } = require('../config/tokenStorage');
  const tokens = { refresh_token: 'SYNTHETIC-MIGRATION', access_token: 'SYNTHETIC-ACCESS' };
  db.prepare('INSERT INTO google_email_connections(organization_id,email,tokens) VALUES(?,?,?)')
    .run(org.id, 'synthetic@example.invalid', JSON.stringify(tokens));
  initDatabase();
  const stored = db.prepare('SELECT tokens FROM google_email_connections WHERE organization_id=?').get(org.id).tokens;
  assert.equal(stored.includes('SYNTHETIC'), false);
  initDatabase();
  assert.deepEqual(decodeTokens(stored, `email:${org.id}`), tokens);
  assert.equal(require('../config/googleEmail').isEmailAuthenticated(org.id), true);
});

test('chave de integração persiste entre processos com acesso restrito ao ficheiro', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { spawnSync } = require('node:child_process');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-token-key-'));
  const modulePath = require.resolve('../config/tokenStorage');
  const env = { ...process.env, DB_PATH: path.join(directory, 'synthetic.db'), TOKEN_ENCRYPTION_KEY: '', TOKEN_ENCRYPTION_KEY_FILE: '' };
  try {
    const first = spawnSync(process.execPath, ['-e', `const s=require(process.argv[1]);process.stdout.write(s.encodeTokens({refresh_token:'SYNTHETIC'},'email:a'));`, modulePath], { env, encoding: 'utf8' });
    assert.equal(first.status, 0, first.stderr);
    assert.equal(fs.statSync(path.join(directory, 'token-encryption.key')).mode & 0o777, 0o600);
    const second = spawnSync(process.execPath, ['-e', `const s=require(process.argv[1]);require('node:assert/strict').equal(s.decodeTokens(process.argv[2],'email:a').refresh_token,'SYNTHETIC');`, modulePath, first.stdout], { env, encoding: 'utf8' });
    assert.equal(second.status, 0, second.stderr);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('painel distingue reservas, reservas com fatura e pagamentos recebidos', async () => {
  const { getDashboardStats } = require('../controllers/reservationOperationsController');
  const metricsOrg = orgs.createOrganization('Synthetic financial metrics');
  db.prepare('INSERT INTO accommodations(id,organization_id,name,type) VALUES(?,?,?,?)').run('metrics-unit', metricsOrg.id, 'Unit', 'suite');
  db.prepare('INSERT INTO guests(id,organization_id,name,email) VALUES(?,?,?,?)').run('metrics-guest', metricsOrg.id, 'Guest', 'metrics@example.invalid');
  const insert = db.prepare(`INSERT INTO reservations (id,organization_id,guest_id,accommodation_id,check_in,check_out,nights,num_guests,total_amount,amount_paid,status,invoice_number)
    VALUES(?,?,'metrics-guest','metrics-unit','2030-01-01','2030-01-02',1,1,?,?,?,?)`);
  insert.run('metric-a', metricsOrg.id, 100, 50, 'pendente', null);
  insert.run('metric-b', metricsOrg.id, 200, 200, 'confirmada', 'FT-1');
  insert.run('metric-c', metricsOrg.id, 300, 30, 'cancelada', null);
  let result;
  await getDashboardStats({ user: { organization_id: metricsOrg.id } }, { json: body => { result = body; } }, error => { throw error; });
  assert.equal(result.data.totalReserved, 300);
  assert.equal(result.data.totalInvoiced, 200);
  assert.equal(result.data.totalReceived, 280);
});
