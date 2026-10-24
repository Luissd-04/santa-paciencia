// Anonimização de hóspedes, auditoria de ações sensíveis, estado operacional e
// uploads órfãos. SQLite em memória, pasta temporária, dados inventados.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const previousCwd = process.cwd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-privacy-ops-'));
process.chdir(temp);
fs.mkdirSync('data/uploads/receipts', { recursive: true });
Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test', EMAIL_ENABLED: 'false' });
for (const key of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET']) delete process.env[key];
const originalFetch = global.fetch;
global.fetch = (url, options) => {
  if (!String(url).startsWith('http://127.0.0.1:')) throw new Error('External request blocked');
  return originalFetch(url, options);
};

const app = require(path.join(root, 'app'));
const { db } = require(path.join(root, 'config/database'));
const auth = require(path.join(root, 'services/authService'));
const orgs = require(path.join(root, 'services/orgService'));
const orphans = require(path.join(root, 'services/uploadOrphans'));

let server, base, org;
const sessions = {}, users = {};
async function req(method, url, body, role = 'owner') {
  const response = await fetch(base + url, {
    method, headers: { 'Content-Type': 'application/json', Cookie: `${auth.SESSION_COOKIE}=${sessions[role]}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() };
}
const guestRow = id => db.prepare('SELECT * FROM guests WHERE id = ?').get(id);
const reservationRow = id => db.prepare('SELECT * FROM reservations WHERE id = ?').get(id);
const audit = action => db.prepare('SELECT * FROM audit_events WHERE organization_id = ? AND action = ?').all(org.id, action);

before(async () => {
  org = orgs.createOrganization('Privacidade');
  for (const role of ['owner', 'manager', 'staff']) {
    users[role] = auth.createUser({ name: role, email: `${role}-privacy@example.invalid`, password: 'Synthetic123!' });
    orgs.createMembership({ organizationId: org.id, userId: users[role].id, role });
    sessions[role] = auth.createSession(users[role].id, org.id).sessionId;
  }
  db.prepare(`INSERT INTO accommodations(id, organization_id, name, type, price_per_night, max_guests) VALUES ('a', ?, 'A', 'alojamento', 100, 4)`).run(org.id);
  db.prepare(`INSERT INTO guests(id, organization_id, name, first_name, last_name, email, phone, nif, document_number, country, address, is_vip)
    VALUES ('g', ?, 'Maria Sintética', 'Maria', 'Sintética', 'maria@example.invalid', '+351910000000', '123456789', 'DOC123', 'PT', 'Rua Inventada 1', 1)`).run(org.id);
  db.prepare(`INSERT INTO guests(id, organization_id, name, email, phone) VALUES ('c', ?, 'Acompanhante Sintético', 'comp@example.invalid', '+351920000000')`).run(org.id);
  db.prepare(`INSERT INTO guests(id, organization_id, name, email) VALUES ('f', ?, 'Futuro Sintético', 'futuro@example.invalid')`).run(org.id);
  db.prepare(`INSERT INTO reservations(id, organization_id, guest_id, accommodation_id, check_in, check_out, nights, num_guests, total_amount, amount_paid, status,
    notes, guests_data, guest_snapshot, public_token, precheckin_token)
    VALUES ('r-past', ?, 'g', 'a', '2020-03-01', '2020-03-03', 2, 2, 200, 200, 'check_out', 'Alergia a frutos secos', ?, '{"email":"maria@example.invalid"}', ?, 'pt')`)
    .run(org.id, JSON.stringify([{ id: 'c', name: 'Acompanhante Sintético', email: 'comp@example.invalid' }]), 'a'.repeat(64));
  db.prepare(`INSERT INTO reservation_payments(id, organization_id, reservation_id, amount, method, payment_date) VALUES ('p1', ?, 'r-past', 200, 'transferencia', '2020-02-01')`).run(org.id);
  db.prepare(`INSERT INTO reservation_history(id, organization_id, reservation_id, action, changes) VALUES ('h1', ?, 'r-past', 'updated', ?)`)
    .run(org.id, JSON.stringify([{ field: 'notes', from: null, to: 'Alergia a frutos secos' }, { field: 'total_amount', from: 180, to: 200 }]));
  db.prepare(`INSERT INTO invoice_messages(id, organization_id, to_email, to_name, subject, body_html, reservation_id) VALUES ('m1', ?, 'maria@example.invalid', 'Maria', 'Fatura Maria', '<p>Olá Maria</p>', 'r-past')`).run(org.id);
  db.prepare(`INSERT INTO stripe_payment_attempts(id, reservation_id, organization_id, amount_cents, state, snapshot, request_json)
    VALUES ('s1', 'r-past', ?, 5000, 'paid', 'x', '{"customer_email":"maria@example.invalid","client_reference_id":"r-past"}')`).run(org.id);
  db.prepare(`INSERT INTO reservations(id, organization_id, guest_id, accommodation_id, check_in, check_out, nights, num_guests, total_amount, amount_paid, status)
    VALUES ('r-future', ?, 'f', 'a', '2039-01-01', '2039-01-03', 2, 1, 200, 50, 'confirmada')`).run(org.id);
  db.prepare(`INSERT INTO reservation_payments(id, organization_id, reservation_id, amount, method, payment_date) VALUES ('p2', ?, 'r-future', 50, 'transferencia', '2030-01-01')`).run(org.id);
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  db.close();
  process.chdir(previousCwd);
  fs.rmSync(temp, { recursive: true, force: true });
  global.fetch = originalFetch;
});

test('anonimização: pré-visualização obrigatória, só o proprietário e registos financeiros intactos', async () => {
  assert.equal((await req('GET', '/api/guests/g/anonymization', undefined, 'manager')).status, 403);
  assert.equal((await req('POST', '/api/guests/g/anonymize', { expected_reservations: 1 }, 'staff')).status, 403);
  // Apagar continua recusado: há movimentos de pagamento.
  assert.equal((await req('DELETE', '/api/guests/g')).status, 409);
  const preview = await req('GET', '/api/guests/g/anonymization');
  assert.equal(preview.status, 200);
  assert.deepEqual(preview.body.data.blockers, []);
  assert.equal(preview.body.data.reservations, 1);
  assert.equal(preview.body.data.with_payments, 1);
  assert.equal(preview.body.data.companions_anonymized, 1);
  assert.equal(guestRow('g').name, 'Maria Sintética', 'a pré-visualização não altera nada');
  const stale = await req('POST', '/api/guests/g/anonymize', { expected_reservations: 2 });
  assert.equal(stale.status, 409);
  assert.equal(guestRow('g').phone, '+351910000000');

  const done = await req('POST', '/api/guests/g/anonymize', { expected_reservations: 1 });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  const guest = guestRow('g');
  assert.equal(guest.name, 'Hóspede anonimizado');
  assert.match(guest.email, /^anonimizado-g@sem-email\.local$/);
  for (const field of ['first_name', 'last_name', 'phone', 'nif', 'document_number', 'address']) assert.equal(guest[field], null, field);
  assert.equal(guest.is_vip, 0);
  assert.equal(guest.country, 'PT', 'país conservado para estatística');
  assert.ok(guest.anonymized_at);
  assert.equal(guestRow('c').name, 'Acompanhante anonimizado');
  assert.equal(guestRow('c').phone, null);
  const reservation = reservationRow('r-past');
  assert.equal(reservation.total_amount, 200);
  assert.equal(reservation.amount_paid, 200);
  assert.equal(reservation.check_in, '2020-03-01');
  assert.equal(reservation.notes, null);
  assert.equal(reservation.public_token, null);
  assert.equal(reservation.guest_snapshot, null);
  assert.deepEqual(JSON.parse(reservation.guests_data), [{ id: 'c', name: 'Acompanhante anonimizado' }]);
  assert.equal(db.prepare("SELECT amount FROM reservation_payments WHERE id = 'p1'").get().amount, 200);
  const history = JSON.parse(db.prepare("SELECT changes FROM reservation_history WHERE id = 'h1'").get().changes);
  assert.equal(history.find(c => c.field === 'notes').to, '[removido por anonimização]');
  assert.equal(history.find(c => c.field === 'total_amount').to, 200);
  const message = db.prepare("SELECT * FROM invoice_messages WHERE id = 'm1'").get();
  assert.ok(!JSON.stringify(message).includes('Maria'));
  const attempt = db.prepare("SELECT * FROM stripe_payment_attempts WHERE id = 's1'").get();
  assert.equal(attempt.state, 'paid');
  assert.equal(attempt.amount_cents, 5000);
  assert.ok(!attempt.request_json.includes('maria@'));
  const [event] = audit('guest.anonymized');
  assert.equal(event.user_id, users.owner.id);
  assert.ok(!/Maria|maria@|DOC123|123456789/.test(event.meta || ''), 'auditoria sem dados pessoais');
  const again = await req('GET', '/api/guests/g/anonymization');
  assert.match(again.body.data.blockers.join(' '), /já foi anonimizado/);
});

test('anonimização recusada com estadia ativa ou futura', async () => {
  const preview = await req('GET', '/api/guests/f/anonymization');
  assert.match(preview.body.data.blockers.join(' '), /ativa\(s\) ou futura\(s\)/);
  assert.equal((await req('POST', '/api/guests/f/anonymize', { expected_reservations: 1 })).status, 409);
  assert.equal(guestRow('f').name, 'Futuro Sintético');
});

test('auditoria: alterações de papel e exportação ficam registadas; só o proprietário consulta', async () => {
  const membership = db.prepare('SELECT id FROM memberships WHERE user_id = ? AND organization_id = ?').get(users.staff.id, org.id);
  assert.equal((await req('PATCH', `/api/team/members/${membership.id}`, { role: 'manager' })).status, 200);
  const [roleChange] = audit('team.role_changed');
  assert.deepEqual(JSON.parse(roleChange.meta), { from: 'staff', to: 'manager' });
  await req('PATCH', `/api/team/members/${membership.id}`, { role: 'staff' });
  const exported = await fetch(base + '/api/backup/export', { headers: { Cookie: `${auth.SESSION_COOKIE}=${sessions.owner}` } });
  assert.equal(exported.status, 200);
  await exported.arrayBuffer();
  assert.equal(audit('backup.exported').length, 1);
  assert.equal((await req('GET', '/api/ops/audit', undefined, 'manager')).status, 403);
  const list = await req('GET', '/api/ops/audit');
  assert.equal(list.status, 200);
  assert.ok(list.body.data.some(row => row.action === 'guest.anonymized' && row.user_name === 'owner'));
});

test('estado operacional: filas e falhas visíveis ao proprietário, sem dados pessoais', async () => {
  db.prepare("INSERT INTO google_calendar_queue(organization_id, action, entity_type, entity_id, attempts, last_error) VALUES (?, 'delete', 'reservation', 'x', 2, 'HTTP 503')").run(org.id);
  assert.equal((await req('GET', '/api/ops/status', undefined, 'manager')).status, 403);
  const status = await req('GET', '/api/ops/status?uploads=1');
  assert.equal(status.status, 200);
  assert.equal(status.body.data.google.calendar_queue.pending, 1);
  assert.equal(status.body.data.google.calendar_queue.failing, 1);
  assert.ok('stripe_stuck_over_1h' in status.body.data.payments);
  assert.ok('orphans' in status.body.data.uploads);
  assert.ok(!/maria|Sintétic/i.test(JSON.stringify(status.body)));
});

test('uploads órfãos: lista primeiro; apagar exige o número e nunca toca em ficheiros usados', () => {
  const old = new Date(Date.now() - 48 * 3600000);
  const write = (relative, content = 'x') => { const file = path.join('data/uploads', relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); fs.utimesSync(file, old, old); return file; };
  write('used.png'); write('orphan.png'); write('receipts/kept.png'); write('.thumbs/480/gone.png.webp'); write('.thumbs/480/used.png.webp');
  const recent = write('recent.png'); fs.utimesSync(recent, new Date(), new Date());
  db.prepare("UPDATE accommodations SET cover_image = '/uploads/used.png' WHERE id = 'a'").run();
  db.prepare(`INSERT INTO expenses(id, organization_id, date, description, amount, receipt_image) VALUES ('e', ?, '2030-01-01', 'Talão', 10, '/uploads/receipts/kept.png')`).run(org.id);
  const found = orphans.findOrphans();
  assert.deepEqual(found.files.map(f => f.path).sort(), ['.thumbs/480/gone.png.webp', 'orphan.png']);
  assert.throws(() => orphans.removeOrphans({ expected: 1 }), /Encontrados 2/);
  assert.ok(fs.existsSync('data/uploads/orphan.png'));
  assert.deepEqual(orphans.removeOrphans({ expected: 2 }), { removed: 2, bytes: 2 });
  for (const kept of ['used.png', 'receipts/kept.png', '.thumbs/480/used.png.webp', 'recent.png']) assert.ok(fs.existsSync(path.join('data/uploads', kept)), kept);
  assert.ok(!fs.existsSync('data/uploads/orphan.png'));
});
