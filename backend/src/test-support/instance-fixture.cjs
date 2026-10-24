// Processo filho do ensaio de restauro (scripts/check-instance-restore.cjs).
// Corre com cwd = raiz da instância (./data/...) e DB_PATH próprio, numa pasta
// temporária. Dados inventados; pedidos externos bloqueados.
//   node instance-fixture.cjs seed <saida.json>
//   node instance-fixture.cjs check <esperado.json> <saida.json>
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const [mode, inputFile, outputFile] = process.argv.slice(2);
Object.assign(process.env, { NODE_ENV: 'test', EMAIL_ENABLED: 'false', PUBLIC_APP_URL: 'http://localhost:3001' });
for (const key of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'TOKEN_ENCRYPTION_KEY', 'TOKEN_ENCRYPTION_KEY_FILE', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY']) delete process.env[key];
const originalFetch = global.fetch;
global.fetch = (url, options) => {
  if (!String(url).startsWith('http://127.0.0.1:')) throw new Error('Pedido externo bloqueado no ensaio');
  return originalFetch(url, options);
};

const root = path.resolve(__dirname, '..');
const app = require(path.join(root, 'app'));
const { db } = require(path.join(root, 'config/database'));
const auth = require(path.join(root, 'services/authService'));
const orgs = require(path.join(root, 'services/orgService'));
const { encodeTokens, decodeTokens } = require(path.join(root, 'config/tokenStorage'));
const push = require(path.join(root, 'services/pushService'));
// Ficheiro legado de tokens Calendar (montado em /tokens no Docker). Aqui fica
// dentro da pasta temporária: nunca o caminho do repositório.
const LEGACY_TOKEN = path.resolve('tokens/google_token.json');

const PASSWORD = 'SyntheticRestore123!';
const sha = buffer => crypto.createHash('sha256').update(buffer).digest('hex');

async function withServer(run) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try { return await run(`http://127.0.0.1:${server.address().port}`); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
async function call(base, cookie, method, url, body) {
  const response = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const type = response.headers.get('content-type') || '';
  return { status: response.status, headers: response.headers, body: type.includes('json') ? await response.json() : Buffer.from(await response.arrayBuffer()) };
}
function summary(orgId) {
  const one = sql => db.prepare(sql).get(orgId);
  return {
    reservations: one('SELECT COUNT(*) AS n, ROUND(SUM(total_amount), 2) AS total, ROUND(SUM(amount_paid), 2) AS paid FROM reservations WHERE organization_id = ?'),
    payments: one('SELECT COUNT(*) AS n, ROUND(SUM(amount), 2) AS total FROM reservation_payments WHERE organization_id = ?'),
    vouchers: one('SELECT COUNT(*) AS n FROM voucher_redemptions WHERE organization_id = ? AND released_at IS NULL'),
    expenses: one('SELECT COUNT(*) AS n, ROUND(SUM(amount), 2) AS total FROM expenses WHERE organization_id = ?'),
  };
}
function tokenContexts(orgId, userId) {
  return [
    ['google_calendar_connections', `calendar:${orgId}:${userId}`, 'SELECT tokens FROM google_calendar_connections WHERE organization_id = ? AND user_id = ?', [orgId, userId]],
    ['google_email_connections', `email:${orgId}`, 'SELECT tokens FROM google_email_connections WHERE organization_id = ?', [orgId]],
    ['google_tasks_connections', `tasks:${orgId}`, 'SELECT tokens FROM google_tasks_connections WHERE organization_id = ?', [orgId]],
  ];
}

async function seed() {
  const sharp = require('sharp');
  const org = orgs.createOrganization('Ensaio de restauro');
  const owner = auth.createUser({ name: 'Proprietário Sintético', email: 'restore-owner@example.invalid', password: PASSWORD });
  orgs.createMembership({ organizationId: org.id, userId: owner.id, role: 'owner' });
  const staff = auth.createUser({ name: 'Equipa Sintética', email: 'restore-staff@example.invalid', password: PASSWORD });
  orgs.createMembership({ organizationId: org.id, userId: staff.id, role: 'staff' });
  const session = auth.createSession(owner.id, org.id).sessionId;
  const cookie = `${auth.SESSION_COOKIE}=${session}`;
  db.prepare(`INSERT INTO organization_settings(organization_id, key, value) VALUES (?, 'services', '[{"id":"tourist_tax","active":false}]')
    ON CONFLICT(organization_id, key) DO UPDATE SET value = excluded.value`).run(org.id);

  // Uploads reais (imagens válidas): capa pública e talão privado.
  const image = color => sharp({ create: { width: 8, height: 8, channels: 3, background: color } }).png().toBuffer();
  const cover = await image('#8b3a24');
  const receipt = await image('#2d6a4f');
  fs.mkdirSync('data/uploads/receipts', { recursive: true });
  fs.writeFileSync('data/uploads/restore-cover.png', cover);
  fs.writeFileSync('data/uploads/receipts/restore-receipt.png', receipt);
  db.prepare(`INSERT INTO accommodations(id, organization_id, name, type, price_per_night, max_guests, cover_image)
    VALUES ('restore-unit', ?, 'Casa do ensaio', 'alojamento', 100, 4, '/uploads/restore-cover.png')`).run(org.id);
  db.prepare(`INSERT INTO vouchers(id, organization_id, code, type, value, status, max_uses) VALUES ('restore-v', ?, 'RESTORE10', 'discount_pct', 10, 'active', 5)`).run(org.id);

  await withServer(async base => {
    for (let i = 0; i < 6; i++) {
      const checkIn = `2036-0${1 + (i % 6)}-0${1 + i}`;
      const created = await call(base, cookie, 'POST', '/api/reservations', {
        accommodation_id: 'restore-unit', check_in: checkIn, check_out: checkIn.replace(/-0(\d)$/, (_, d) => `-0${Number(d) + 2}`),
        num_adults: 1, guest: { name: `Hóspede Sintético ${i}`, email: `restore-guest-${i}@example.invalid` },
        ...(i < 2 ? { voucher_code: 'RESTORE10' } : {}),
      });
      if (created.status !== 201) throw new Error(`Reserva sintética recusada: ${JSON.stringify(created.body)}`);
      if (i % 2 === 0) {
        const paid = await call(base, cookie, 'POST', `/api/reservations/${created.body.data.id}/payments`, {
          amount: 50, method: 'transferencia', payment_date: '2035-12-01', idempotency_key: `restore-intent-${i}-${'x'.repeat(12)}`,
        });
        if (paid.status !== 200) throw new Error(`Pagamento sintético recusado: ${JSON.stringify(paid.body)}`);
      }
    }
  });
  db.prepare(`INSERT INTO expenses(id, organization_id, description, amount, date, category, receipt_image)
    VALUES ('restore-expense', ?, 'Despesa sintética', 42.5, '2035-12-02', 'outros', '/uploads/receipts/restore-receipt.png')`).run(org.id);

  // Ligações Google com tokens falsos, encriptados com a chave da instância.
  const fake = kind => ({ access_token: `fake-${kind}-${crypto.randomUUID()}`, refresh_token: `fake-refresh-${crypto.randomUUID()}` });
  const tokens = {};
  for (const [table, context] of tokenContexts(org.id, owner.id)) {
    tokens[table] = fake(table);
    const encoded = encodeTokens(tokens[table], context);
    if (table === 'google_calendar_connections') db.prepare('INSERT INTO google_calendar_connections(organization_id, user_id, tokens) VALUES (?, ?, ?)').run(org.id, owner.id, encoded);
    else db.prepare(`INSERT INTO ${table}(organization_id, email, tokens) VALUES (?, 'restore-google@example.invalid', ?)`).run(org.id, encoded);
  }
  tokens.legacy = fake('legacy');
  fs.mkdirSync(path.dirname(LEGACY_TOKEN), { recursive: true });
  fs.writeFileSync(LEGACY_TOKEN, encodeTokens(tokens.legacy, 'calendar:legacy'), { flag: 'wx', mode: 0o600 });

  const vapid = push.getPublicKey();
  const expected = {
    org: org.id, owner: owner.id, session, password: PASSWORD, emails: ['restore-owner@example.invalid', 'restore-staff@example.invalid'],
    summary: summary(org.id), vapid, uploads: { '/uploads/restore-cover.png': sha(cover), '/uploads/receipts/restore-receipt.png': sha(receipt) },
    token_hashes: Object.fromEntries(Object.entries(tokens).map(([key, value]) => [key, sha(JSON.stringify(value))])),
    // Só para o verificador procurar fugas nos registos: nunca impresso.
    secrets: [...Object.values(tokens).flatMap(value => Object.values(value)), 'Hóspede Sintético', 'restore-guest-'],
  };
  db.pragma('wal_checkpoint(PASSIVE)');
  fs.writeFileSync(inputFile, JSON.stringify(expected));   // seed: o primeiro argumento é a saída
}

async function check() {
  const expected = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  const result = { summary: summary(expected.org), integrity: db.pragma('integrity_check', { simple: true }) };
  result.vapid = push.getPublicKey() === expected.vapid;
  result.tokens = {};
  for (const [table, context, sql, params] of tokenContexts(expected.org, expected.owner)) {
    try { result.tokens[table] = sha(JSON.stringify(decodeTokens(db.prepare(sql).get(...params).tokens, context))) === expected.token_hashes[table]; }
    catch { result.tokens[table] = false; }
  }
  try { result.tokens.legacy = sha(JSON.stringify(decodeTokens(fs.readFileSync(LEGACY_TOKEN, 'utf8'), 'calendar:legacy'))) === expected.token_hashes.legacy; }
  catch { result.tokens.legacy = false; }
  await withServer(async base => {
    const login = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: expected.emails[0], password: expected.password }) });
    result.login = login.status;
    const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
    result.organization = (await call(base, cookie, 'GET', '/auth/me')).body?.data?.user?.organization_id === expected.org;
    const list = await call(base, cookie, 'GET', '/api/reservations?limit=100');
    result.listed = Array.isArray(list.body?.data) ? list.body.data.length : null;
    result.uploads = {};
    for (const [url, hash] of Object.entries(expected.uploads)) {
      const response = await call(base, cookie, 'GET', url);
      result.uploads[url] = response.status === 200 && sha(response.body) === hash;
    }
    result.anonymous_receipt = (await call(base, '', 'GET', '/uploads/receipts/restore-receipt.png')).status;
    // Sessões também são restauradas: o procedimento manda revogá-las.
    result.previous_session = (await call(base, `${auth.SESSION_COOKIE}=${expected.session}`, 'GET', '/auth/me')).status;
  });
  fs.writeFileSync(outputFile, JSON.stringify(result));
}

(mode === 'seed' ? seed() : check()).then(() => { db.close(); }, error => { console.error(error); process.exitCode = 1; });
