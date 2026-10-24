// Atualização e reversão da base, numa pasta temporária com dados inventados:
//   1. a versão anterior cria e usa uma base;
//   2. esta versão abre-a (migrações), lê, escreve — duas vezes (idempotência);
//   3. a versão anterior volta a abrir a base já migrada e continua a ler e a
//      escrever (reversão do código sem restaurar a base).
// Uso: node scripts/check-upgrade-rollback.cjs --previous <backend/src da versão anterior>
// A pasta anterior precisa de node_modules (pode ser uma ligação para estes).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const previousIndex = process.argv.indexOf('--previous');
const previous = previousIndex > 0 ? path.resolve(process.argv[previousIndex + 1]) : null;
if (!previous || !fs.existsSync(path.join(previous, 'app.js'))) {
  console.error('Indique --previous <backend/src da versão anterior> (ex.: extraída com git archive).');
  process.exit(1);
}
const current = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-upgrade-rollback-'));
const dbPath = path.join(temp, 'data', 'santapaciencia.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

// Corre num processo próprio com o código de `root`. Sem rede externa nem envio de emails.
const STEP = `
const root = process.argv[1], mode = process.argv[2];
Object.assign(process.env, { NODE_ENV: 'test', EMAIL_ENABLED: 'false' });
const realFetch = global.fetch;
global.fetch = (url, options) => { if (!String(url).startsWith('http://127.0.0.1:')) throw new Error('externo bloqueado'); return realFetch(url, options); };
const app = require(root + '/app');
const { db } = require(root + '/config/database');
const auth = require(root + '/services/authService');
const orgs = require(root + '/services/orgService');
(async () => {
  let org = db.prepare("SELECT * FROM organizations WHERE name = 'Versões'").get();
  if (!org) {
    org = orgs.createOrganization('Versões');
    const user = auth.createUser({ name: 'Gestão', email: 'versoes@example.invalid', password: 'SyntheticUpgrade123!' });
    orgs.createMembership({ organizationId: org.id, userId: user.id, role: 'owner' });
    db.prepare("INSERT INTO accommodations(id, organization_id, name, type, price_per_night, max_guests) VALUES ('unit', ?, 'Suite', 'alojamento', 100, 4)").run(org.id);
  }
  const user = db.prepare("SELECT * FROM users WHERE email = 'versoes@example.invalid'").get();
  const session = auth.createSession(user.id, org.id).sessionId;
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const call = async (method, url, body) => { const r = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', Cookie: auth.SESSION_COOKIE + '=' + session }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json() }; };
  const seq = db.prepare('SELECT COUNT(*) AS n FROM reservations').get().n;
  const checkIn = new Date(Date.UTC(2037, 0, 1 + seq * 4)).toISOString().slice(0, 10);
  const checkOut = new Date(Date.UTC(2037, 0, 3 + seq * 4)).toISOString().slice(0, 10);
  const created = await call('POST', '/api/reservations', { accommodation_id: 'unit', check_in: checkIn, check_out: checkOut, num_adults: 1, guest: { name: 'Hóspede ' + mode, email: mode + '@example.invalid' } });
  const paid = created.status === 201 ? await call('POST', '/api/reservations/' + created.body.data.id + '/payments', { amount: 50, method: 'transferencia', payment_date: '2036-12-01' }) : null;
  const edited = created.status === 201 ? await call('PUT', '/api/reservations/' + created.body.data.id, { notes: 'editada (' + mode + ')' }) : null;
  const list = await call('GET', '/api/reservations?limit=100');
  const calendarStatus = await call('GET', '/api/calendar/status');
  server.closeAllConnections(); server.close();
  const out = {
    mode, created: created.status, paid: paid && paid.status, edited: edited && edited.status, listed: Array.isArray(list.body.data) ? list.body.data.length : list.status,
    calendar_status: calendarStatus.status,
    integrity: db.pragma('integrity_check', { simple: true }), foreign_keys: db.pragma('foreign_key_check').length,
    migrations: db.prepare('SELECT id FROM schema_migrations ORDER BY id').all().map(r => r.id),
    totals: db.prepare('SELECT COUNT(*) AS n, ROUND(SUM(total_amount), 2) AS total, ROUND(SUM(amount_paid), 2) AS paid FROM reservations').get(),
  };
  db.close();
  process.stdout.write('RESULT ' + JSON.stringify(out) + '\\n');
})().catch(e => { console.error(e); process.exit(1); });
`;
function step(root, mode) {
  const result = spawnSync(process.execPath, ['-e', STEP, root, mode], { cwd: temp, encoding: 'utf8', env: { ...process.env, DB_PATH: dbPath, FRONTEND_PATH: '' } });
  const line = result.stdout.split('\n').find(l => l.startsWith('RESULT '));
  assert.equal(result.status, 0, `${mode}: ${result.stderr.slice(-2000)}`);
  return JSON.parse(line.slice(7));
}

try {
  const before = step(previous, 'anterior');
  const upgraded = step(current, 'atual');
  const again = step(current, 'atual-2');
  const rolledBack = step(previous, 'reversao');
  for (const r of [before, upgraded, again, rolledBack]) {
    assert.deepEqual([r.created, r.paid, r.edited, r.calendar_status], [201, 200, 200, 200], JSON.stringify(r));
    assert.equal(r.integrity, 'ok');
    assert.equal(r.foreign_keys, 0);
  }
  assert.deepEqual(again.migrations, upgraded.migrations, 'segunda abertura não aplica migrações novas');
  const added = upgraded.migrations.filter(id => !before.migrations.includes(id));
  assert.equal(rolledBack.listed, 4);
  // Cada passo cria uma reserva igual (com o mesmo total) e regista 50 € pagos.
  assert.deepEqual(rolledBack.totals, { n: 4, total: before.totals.total * 4, paid: 200 });
  console.log(JSON.stringify({ added_migrations: added, listed_after_rollback: rolledBack.listed, totals: rolledBack.totals }, null, 2));
  console.log('Atualização (2×) e reversão do código sem restaurar a base: OK.');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
