// Backup por organização: dados da empresa e marca (colunas de `organizations`)
// e ficheiros dos logótipos. Exportação com os campos e os ficheiros no ZIP,
// restauro só desses campos (nunca nome, slug, estado ou pacote), validação
// com as regras da Área do proprietário e compatibilidade com backups antigos
// (sem a secção, a empresa e a marca ficam como estão). SQLite em memória.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-org-backup-'));
const previous = process.cwd();
process.chdir(temp);
Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test', EMAIL_ENABLED: 'false', TRUST_PROXY: 'loopback' });
const app = require('../app');
const { db } = require('../config/database');
const auth = require('../services/authService');
const orgs = require('../services/orgService');
const unzipper = require('unzipper');
const archiver = require('archiver');
const UPLOADS = path.join(temp, 'data/uploads');
const PASSWORD = 'SyntheticOrgBackup123!';
let server, base, ip = 60;

const org = orgs.createOrganization('Casa da Marca');
const owner = auth.createUser({ name: 'Dona', email: 'dona-marca@example.invalid', password: PASSWORD });
orgs.createMembership({ organizationId: org.id, userId: owner.id, role: 'owner' });
const cookie = `${auth.SESSION_COOKIE}=${auth.createSession(owner.id, org.id).sessionId}`;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==', 'base64');
const COMPANY = {
  legal_name: 'Marca Turismo, Lda.', tax_id: '501964843', tax_country: 'PT', fiscal_address: 'Rua das Oliveiras 1, Évora',
  billing_email: 'faturas@example.invalid', phone: '+351 912 345 678', brand_color: '#8a3a1f',
  logo_crop: '{"x":0.1,"y":0.1,"w":0.5,"h":0.5}', logo_square_crop: '{"x":0,"y":0,"w":0.5,"h":0.5}',
};

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.on('listening', resolve); server.on('error', reject); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server?.close(); db.close(); process.chdir(previous); fs.rmSync(temp, { recursive: true, force: true }); });

const call = (method, url, body) => fetch(base + url, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-Forwarded-For': `198.51.100.${ip++}` }, body: body ? JSON.stringify(body) : undefined });
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
const orgRow = () => db.prepare('SELECT * FROM organizations WHERE id = ?').get(org.id);
const uploads = () => (fs.existsSync(UPLOADS) ? fs.readdirSync(UPLOADS).filter(f => fs.statSync(path.join(UPLOADS, f)).isFile()).sort() : []);

function seedBrand() {
  fs.mkdirSync(UPLOADS, { recursive: true });
  fs.writeFileSync(path.join(UPLOADS, 'orglogo_original.png'), PNG);
  fs.writeFileSync(path.join(UPLOADS, 'orglogo_cut.png'), PNG);
  db.prepare(`UPDATE organizations SET legal_name=?, tax_id=?, tax_country=?, fiscal_address=?, billing_email=?, phone=?, brand_color=?,
    logo_url='/uploads/orglogo_cut.png', logo_original_url='/uploads/orglogo_original.png', logo_crop=?, logo_square_crop=? WHERE id=?`)
    .run(COMPANY.legal_name, COMPANY.tax_id, COMPANY.tax_country, COMPANY.fiscal_address, COMPANY.billing_email, COMPANY.phone, COMPANY.brand_color, COMPANY.logo_crop, COMPANY.logo_square_crop, org.id);
}

test('exportação: campos da empresa e marca na secção organization e logótipos no ZIP', async () => {
  seedBrand();
  const zipped = await exportZip();
  const zip = await unzipper.Open.buffer(zipped);
  const entries = zip.files.map(f => f.path);
  assert.ok(entries.includes('uploads/orglogo_cut.png') && entries.includes('uploads/orglogo_original.png'), entries.join());
  const payload = JSON.parse((await zip.files.find(f => f.path === 'backup.json').buffer()).toString());
  assert.deepEqual(Object.keys(payload.organization).sort(), ['billing_email', 'brand_color', 'fiscal_address', 'legal_name', 'logo_crop', 'logo_original_url', 'logo_square_crop', 'logo_url', 'phone', 'tax_country', 'tax_id'].sort());
  assert.equal(payload.organization.legal_name, COMPANY.legal_name);
  assert.equal(payload.organization.tax_id, COMPANY.tax_id);
  assert.equal(payload.organization.logo_url, '/uploads/orglogo_cut.png');
  assert.equal(payload.organization.brand_color, COMPANY.brand_color);
  // Nada de nome, slug, estado ou pacote.
  for (const key of ['name', 'slug', 'status', 'plan_id']) assert.ok(!(key in payload.organization), key);
});

test('importação: restaura só a empresa e a marca da organização atual e copia os logótipos', async () => {
  const zipped = await exportZip();
  const name = orgRow().name; const slug = orgRow().slug; const status = orgRow().status; const plan = orgRow().plan_id;
  // Estado atual diferente do backup.
  db.prepare("UPDATE organizations SET legal_name='Outra, Lda.', tax_id=NULL, phone=NULL, brand_color='#000000', logo_url=NULL, logo_original_url=NULL, logo_crop=NULL, logo_square_crop=NULL WHERE id=?").run(org.id);
  const res = await importZip(zipped);
  assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
  const row = orgRow();
  for (const key of ['legal_name', 'tax_id', 'tax_country', 'fiscal_address', 'billing_email', 'phone', 'brand_color', 'logo_crop', 'logo_square_crop']) {
    assert.equal(row[key], COMPANY[key], key);
  }
  assert.equal(row.name, name); assert.equal(row.slug, slug); assert.equal(row.status, status); assert.equal(row.plan_id, plan);
  // Logótipos copiados para ficheiros novos e idênticos aos do backup.
  assert.match(row.logo_url, /^\/uploads\/import_[0-9a-f-]+\.png$/);
  assert.match(row.logo_original_url, /^\/uploads\/import_[0-9a-f-]+\.png$/);
  assert.notEqual(row.logo_url, row.logo_original_url);
  for (const url of [row.logo_url, row.logo_original_url]) assert.deepEqual(fs.readFileSync(path.join(temp, 'data', url)), PNG);
});

test('importação não toca noutras organizações', async () => {
  const other = orgs.createOrganization('Outra Casa');
  db.prepare("UPDATE organizations SET legal_name='Intocada, Lda.', brand_color='#112233' WHERE id=?").run(other.id);
  const res = await importZip(await exportZip());
  assert.equal(res.status, 200);
  const row = db.prepare('SELECT legal_name, brand_color, name FROM organizations WHERE id = ?').get(other.id);
  assert.deepEqual({ ...row }, { legal_name: 'Intocada, Lda.', brand_color: '#112233', name: 'Outra Casa' });
});

test('backup antigo (sem a secção): empresa, marca e logótipos ficam como estão', async () => {
  const zipped = await exportZip();
  const old = await rebuild(zipped, payload => { delete payload.organization; payload.version = 9; });
  // Versão 9 não traz pedidos de suporte; o restauro deixa-os em paz.
  const withoutSupport = await rebuild(old, payload => { delete payload.tables.support_tickets; delete payload.tables.support_messages; delete payload.tables.support_attachments; });
  const before = { ...orgRow() }; const filesBefore = uploads();
  const res = await importZip(withoutSupport);
  assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
  assert.deepEqual({ ...orgRow(), updated_at: null }, { ...before, updated_at: null });
  assert.deepEqual(uploads(), filesBefore);
  assert.ok(fs.existsSync(path.join(temp, 'data', before.logo_url)));
});

test('validação: mesmas regras da Área do proprietário; nada é gravado se falhar', async () => {
  const zipped = await exportZip();
  const before = JSON.stringify(orgRow()); const filesBefore = uploads();
  const cases = {
    'NIF inválido': payload => { payload.organization.tax_id = '501964844'; },
    'email inválido': payload => { payload.organization.billing_email = 'sem-arroba'; },
    'telefone inválido': payload => { payload.organization.phone = 'abc'; },
    'cor inválida': payload => { payload.organization.brand_color = 'vermelho'; },
    'país inválido': payload => { payload.organization.tax_country = 'Portugal'; },
    'recorte inválido': payload => { payload.organization.logo_crop = '{"x":0.8,"y":0,"w":0.5,"h":1}'; },
    'logótipo externo': payload => { payload.organization.logo_url = 'https://example.invalid/x.png'; },
    'logótipo com caminho': payload => { payload.organization.logo_url = '/uploads/../x.png'; },
    'campo da plataforma': payload => { payload.organization.plan_id = 'enterprise'; },
    'nome': payload => { payload.organization.name = 'Sequestrada'; },
    'texto com controlo': payload => { payload.organization.legal_name = 'A\u0000B'; },
    'secção que não é objeto': payload => { payload.organization = 'x'; },
  };
  for (const [label, change] of Object.entries(cases)) {
    const bad = await rebuild(zipped, change);
    const res = await importZip(bad);
    assert.equal(res.status, 400, label);
    assert.equal(JSON.stringify(orgRow()), before, label);
    assert.deepEqual(uploads(), filesBefore, label);
  }
});

test('logótipo em falta ou corrompido no ZIP: restauro recusado', async () => {
  const zipped = await exportZip();
  const before = JSON.stringify(orgRow()); const filesBefore = uploads();
  const missing = await rebuild(zipped, (payload, files) => { files.delete(payload.organization.logo_url.slice(1)); });
  const res = await importZip(missing);
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /incompleto/);
  const corrupt = await rebuild(zipped, (payload, files) => { files.set(payload.organization.logo_url.slice(1), Buffer.from('<svg onload=alert(1)></svg>')); });
  assert.equal((await importZip(corrupt)).status, 400);
  assert.equal(JSON.stringify(orgRow()), before);
  assert.deepEqual(uploads(), filesBefore);
});

test('exportação recusa um logótipo em falta (backup incompleto)', async () => {
  const url = orgRow().logo_original_url;
  const file = path.join(temp, 'data', url);
  const kept = fs.readFileSync(file);
  fs.rmSync(file);
  const res = await fetch(base + '/api/backup/export', { headers: { Cookie: cookie, 'X-Forwarded-For': `198.51.100.${ip++}` } });
  assert.notEqual(res.status, 200);
  fs.writeFileSync(file, kept);
});

test('backup sem logótipo restaura a marca sem logótipo; ficheiros antigos deixam de ser órfãos', async () => {
  db.prepare("UPDATE organizations SET logo_url=NULL, logo_original_url=NULL, logo_crop=NULL, logo_square_crop=NULL WHERE id=?").run(org.id);
  const zipped = await exportZip();
  const entries = (await unzipper.Open.buffer(zipped)).files.map(f => f.path);
  assert.ok(!entries.some(e => e.startsWith('uploads/orglogo')));
  // O restauro substitui o estado atual (com logótipo) pelo do backup (sem).
  seedBrand();
  const current = orgRow();
  const res = await importZip(zipped);
  assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
  const row = orgRow();
  assert.equal(row.logo_url, null); assert.equal(row.logo_original_url, null);
  assert.equal(row.legal_name, COMPANY.legal_name);
  // Os ficheiros do logótipo anterior já não estão referenciados: limpos.
  assert.ok(!fs.existsSync(path.join(temp, 'data', current.logo_url)));
  assert.ok(!fs.existsSync(path.join(temp, 'data', current.logo_original_url)));
});
