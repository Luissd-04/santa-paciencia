// Backup por organização com pedidos de suporte: ida e volta com anexos,
// anexo corrompido recusado sem gravar nada, backups antigos (sem suporte) e
// limites do pacote no restauro. App real com SQLite em memória.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-support-backup-'));
const previous = process.cwd();
process.chdir(temp);
Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test', EMAIL_ENABLED: 'false', TRUST_PROXY: 'loopback' });
const app = require('../app');
const { db } = require('../config/database');
const auth = require('../services/authService');
const orgs = require('../services/orgService');
const unzipper = require('unzipper');
const archiver = require('archiver');
const SUPPORT_DIR = path.join(temp, 'data/uploads/support');
const PASSWORD = 'SyntheticBackup123!';
let server, base, ip = 20;

const org = orgs.createOrganization('Casa Backup');
const owner = auth.createUser({ name: 'Dono', email: 'dono-backup@example.invalid', password: PASSWORD });
orgs.createMembership({ organizationId: org.id, userId: owner.id, role: 'owner' });
const staff = auth.createUser({ name: 'Equipa', email: 'equipa-backup@example.invalid', password: PASSWORD });
orgs.createMembership({ organizationId: org.id, userId: staff.id, role: 'staff' });
const cookie = `${auth.SESSION_COOKIE}=${auth.createSession(owner.id, org.id).sessionId}`;
// PNG 1x1 válido e um PDF mínimo (só a assinatura conta para o tipo).
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==', 'base64');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.on('listening', resolve); server.on('error', reject); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server?.close(); db.close(); process.chdir(previous); fs.rmSync(temp, { recursive: true, force: true }); });

function call(method, url, body) {
  return fetch(base + url, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-Forwarded-For': `198.51.100.${ip++}` },
    body: body ? JSON.stringify(body) : undefined });
}
const importZip = buffer => call('POST', '/api/backup/import', { archiveBase64: buffer.toString('base64') });
async function exportZip() {
  const res = await fetch(base + '/api/backup/export', { headers: { Cookie: cookie, 'X-Forwarded-For': `198.51.100.${ip++}` } });
  assert.equal(res.status, 200);
  return Buffer.from(await res.arrayBuffer());
}
async function rebuild(zipped, change) {
  const zip = await unzipper.Open.buffer(zipped);
  const files = new Map();
  for (const entry of zip.files) if (entry.type === 'File') files.set(entry.path, await entry.buffer());
  const payload = JSON.parse(files.get('backup.json').toString());
  change(payload, files);
  files.set('backup.json', Buffer.from(JSON.stringify(payload)));
  const out = archiver('zip'); const chunks = [];
  out.on('data', chunk => chunks.push(chunk));
  const done = new Promise((resolve, reject) => { out.on('end', resolve); out.on('error', reject); });
  for (const [name, content] of files) out.append(content, { name });
  await out.finalize(); await done;
  return Buffer.concat(chunks);
}
const sha = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const supportFiles = () => fs.existsSync(SUPPORT_DIR) ? fs.readdirSync(SUPPORT_DIR).sort() : [];

function seedSupport() {
  fs.mkdirSync(SUPPORT_DIR, { recursive: true });
  const pngName = `${crypto.randomUUID()}.png`; const pdfName = `${crypto.randomUUID()}.pdf`;
  fs.writeFileSync(path.join(SUPPORT_DIR, pngName), PNG); fs.writeFileSync(path.join(SUPPORT_DIR, pdfName), PDF);
  db.prepare(`INSERT INTO support_tickets (id, number, organization_id, author_user_id, type, subject, status, created_at, updated_at, last_message_at)
    VALUES ('t-old-1', 41, ?, ?, 'problem', 'Erro na reserva', 'open', '2030-01-01T10:00:00.000Z', '2030-01-01T10:00:00.000Z', '2030-01-02T10:00:00.000Z')`).run(org.id, staff.id);
  db.prepare(`INSERT INTO support_tickets (id, number, organization_id, author_user_id, type, subject, status, created_at, updated_at, last_message_at)
    VALUES ('t-old-2', 42, ?, NULL, 'question', 'Dúvida', 'resolved', '2030-02-01T10:00:00.000Z', '2030-02-01T10:00:00.000Z', '2030-02-01T10:00:00.000Z')`).run(org.id);
  db.prepare("INSERT INTO support_messages (id, ticket_id, side, author_user_id, body, created_at) VALUES ('m-old-1','t-old-1','customer',?,'Olá','2030-01-01T10:00:00.000Z')").run(staff.id);
  db.prepare("INSERT INTO support_messages (id, ticket_id, side, author_user_id, body, created_at) VALUES ('m-old-2','t-old-1','platform',NULL,'Resposta','2030-01-02T10:00:00.000Z')").run();
  db.prepare("INSERT INTO support_messages (id, ticket_id, side, author_user_id, body, created_at) VALUES ('m-old-3','t-old-2','customer',?,'Pergunta','2030-02-01T10:00:00.000Z')").run(owner.id);
  db.prepare("INSERT INTO support_attachments (id, message_id, ticket_id, original_name, mime, size, stored_name) VALUES ('a-old-1','m-old-1','t-old-1','print.png','image/png',?,?)").run(PNG.length, pngName);
  db.prepare("INSERT INTO support_attachments (id, message_id, ticket_id, original_name, mime, size, stored_name) VALUES ('a-old-2','m-old-3','t-old-2','nota.pdf','application/pdf',?,?)").run(PDF.length, pdfName);
  return { pngName, pdfName };
}
const rows = () => ({
  tickets: db.prepare('SELECT * FROM support_tickets WHERE organization_id = ? ORDER BY number').all(org.id),
  messages: db.prepare('SELECT * FROM support_messages ORDER BY created_at').all(),
  attachments: db.prepare('SELECT * FROM support_attachments ORDER BY created_at, original_name').all(),
});

test('ida e volta: pedidos, mensagens e anexos voltam com ids novos e ficheiros idênticos', async () => {
  const { pngName, pdfName } = seedSupport();
  // Pedido de outra organização: nunca entra no backup nem é tocado.
  const other = orgs.createOrganization('Outra');
  db.prepare("INSERT INTO support_tickets (id, number, organization_id, type, subject) VALUES ('t-other', 99, ?, 'question', 'Alheio')").run(other.id);
  const zipped = await exportZip();
  const entries = (await unzipper.Open.buffer(zipped)).files.map(f => f.path);
  assert.ok(entries.includes(`uploads/support/${pngName}`) && entries.includes(`uploads/support/${pdfName}`));
  const before = rows();
  const res = await importZip(zipped);
  assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
  const after = rows();
  assert.equal(after.tickets.length, 2);
  assert.equal(after.messages.length, 3);
  assert.equal(after.attachments.length, 2);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM support_tickets WHERE id='t-other'").get().n, 1);
  assert.deepEqual(after.tickets.map(t => t.id).filter(id => before.tickets.some(b => b.id === id)), []);
  assert.deepEqual(after.tickets.map(t => t.subject), ['Erro na reserva', 'Dúvida']);
  assert.deepEqual(after.tickets.map(t => t.number), [100, 101]); // MAX(number)+1 da instância, pela ordem original
  assert.deepEqual(after.tickets.map(t => t.author_user_id), [staff.id, null]);
  assert.deepEqual(after.messages.map(m => m.body), ['Olá', 'Resposta', 'Pergunta']);
  assert.equal(after.messages.filter(m => m.ticket_id === after.tickets[0].id).length, 2);
  for (const attachment of after.attachments) {
    assert.ok(!before.attachments.some(b => b.stored_name === attachment.stored_name));
    const original = attachment.mime === 'image/png' ? PNG : PDF;
    assert.equal(sha(fs.readFileSync(path.join(SUPPORT_DIR, attachment.stored_name))), sha(original));
    assert.equal(attachment.size, original.length);
  }
  // Os ficheiros antigos foram retirados; não ficam órfãos.
  assert.equal(supportFiles().length, 2);
  assert.ok(!supportFiles().includes(pngName));
});

test('anexo corrompido: 400 e nada gravado (base e ficheiros intactos)', async () => {
  const zipped = await exportZip();
  const stored = rows().attachments[0].stored_name;
  const badZip = await rebuild(zipped, (payload, files) => files.set(`uploads/support/${stored}`, Buffer.from('<script>x</script>')));
  const filesBefore = supportFiles(); const dbBefore = JSON.stringify(rows());
  const res = await importZip(badZip);
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /anexo de suporte/);
  assert.deepEqual(supportFiles(), filesBefore);
  assert.equal(JSON.stringify(rows()), dbBefore);
  // Anexo em falta no ZIP: também recusado.
  const missing = await rebuild(zipped, (payload, files) => files.delete(`uploads/support/${stored}`));
  assert.equal((await importZip(missing)).status, 400);
  // Nome guardado forjado (caminho) é recusado.
  const forged = await rebuild(zipped, payload => { payload.tables.support_attachments[0].stored_name = '../x.png'; });
  assert.equal((await importZip(forged)).status, 400);
  assert.deepEqual(supportFiles(), filesBefore);
});

test('backup antigo, sem pedidos de suporte, importa e não mexe nos pedidos existentes', async () => {
  const zipped = await exportZip();
  const old = await rebuild(zipped, payload => {
    payload.version = 9;
    for (const table of ['support_tickets', 'support_messages', 'support_attachments']) delete payload.tables[table];
  });
  const before = JSON.stringify(rows()); const files = supportFiles();
  const res = await importZip(old);
  assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
  assert.equal(JSON.stringify(rows()), before);
  assert.deepEqual(supportFiles(), files);
  // Versão 10 sem as tabelas de suporte é incompleta.
  const incomplete = await rebuild(zipped, payload => { delete payload.tables.support_messages; });
  assert.equal((await importZip(incomplete)).status, 400);
});

test('restauro acima do limite do pacote: 403 com limit e nada gravado', async () => {
  const plan = db.prepare("SELECT id FROM plans WHERE name = 'Essencial'").get();
  db.prepare('UPDATE organizations SET plan_id = ? WHERE id = ?').run(plan.id, org.id); // 3 alojamentos, 2 membros
  const zipped = await exportZip();
  const tooMany = await rebuild(zipped, payload => {
    payload.tables.accommodations = [1, 2, 3, 4].map(n => ({ id: `lim-${n}`, name: `Quarto ${n}`, type: 'suite', price_per_night: 100, max_guests: 2 }));
  });
  const dbBefore = JSON.stringify(rows()); const files = supportFiles();
  const count = () => db.prepare('SELECT COUNT(*) n FROM accommodations WHERE organization_id = ?').get(org.id).n;
  const accommodations = count();
  const res = await importZip(tooMany);
  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.limit, 'accommodations');
  assert.match(body.error, /limite/);
  assert.equal(count(), accommodations);
  assert.equal(JSON.stringify(rows()), dbBefore);
  assert.deepEqual(supportFiles(), files);
  // Dentro do limite continua a funcionar.
  assert.equal((await importZip(zipped)).status, 200);
  // Membros acima do pacote (3 ativos para 2): recusado com limit 'members'.
  orgs.createMembership({ organizationId: org.id, userId: auth.createUser({ name: 'Extra', email: 'extra-backup@example.invalid', password: PASSWORD }).id, role: 'staff' });
  const members = await importZip(zipped);
  assert.equal(members.status, 403);
  assert.equal((await members.json()).limit, 'members');
});
