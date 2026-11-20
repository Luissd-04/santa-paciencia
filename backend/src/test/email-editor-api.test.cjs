// API do editor de emails: repor o texto original (com cópia), pré-visualizar
// com uma reserva real (a mesma composição do envio) e listar só reservas da
// própria organização.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-editor-api-'));
const originalCwd = process.cwd();
process.chdir(temp);
Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test', EMAIL_ENABLED: 'false', PUBLIC_APP_URL: 'https://reservas.example.com' });
const { db, initDatabase } = require('../config/database');
initDatabase();
const orgs = require('../services/orgService');
const ctrl = require('../controllers/emailTemplateController');
const { TEMPLATES } = require('../config/emailTemplateDefaults');
after(() => { db.close(); process.chdir(originalCwd); fs.rmSync(temp, { recursive: true, force: true }); });

const org = orgs.createOrganization('Casa do Monte');
const other = orgs.createOrganization('Outra');
db.exec(`INSERT INTO accommodations(id,organization_id,name,type,price_per_night,max_guests,address,license_number,checkin_time,checkout_time,contact_email,door_code,arrival_instructions,checkout_instructions)
  VALUES ('casa','${org.id}','Casa do Monte','alojamento',100,2,'Rua 1','1/AL','15:00','11:00','c@example.com','4821','Porta verde','Deixe a chave');
  INSERT INTO accommodations(id,organization_id,name,type,price_per_night,max_guests) VALUES ('fora','${other.id}','Fora','alojamento',100,2);
  INSERT INTO guests(id,organization_id,name,email) VALUES ('g','${org.id}','Ana Hóspede','ana@example.com'), ('h','${other.id}','Outro','o@example.com');
  INSERT INTO reservations(id,organization_id,guest_id,accommodation_id,check_in,check_out,nights,num_guests,total_amount,amount_paid,status,channel)
    VALUES ('R1','${org.id}','g','casa','2035-06-10','2035-06-12',2,2,200,200,'confirmada','website'),
           ('R2','${other.id}','h','fora','2035-06-10','2035-06-12',2,2,200,0,'confirmada','website');`);

function call(fn, { params = {}, body = {}, query = {} } = {}) {
  const req = { params, body, query, user: { id: 'u', organization_id: org.id, role: 'owner' }, protocol: 'https', get: () => 'reservas.example.com' };
  const res = { statusCode: 200, status(n) { this.statusCode = n; return this; }, json(data) { this.body = data; return this; } };
  fn(req, res);
  return res;
}

test('repor o texto original guarda uma cópia e devolve o modelo por omissão', () => {
  db.prepare("UPDATE organization_email_templates SET body = '<p>Texto meu</p>' WHERE organization_id = ? AND slug = 'coordenadas'").run(org.id);
  assert.equal(call(ctrl.getAll).body.data.find(t => t.slug === 'coordenadas').customized, true);
  const res = call(ctrl.reset, { params: { slug: 'coordenadas' } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.body, TEMPLATES.coordenadas.body);
  assert.equal(db.prepare("SELECT body FROM organization_email_templates_backup WHERE organization_id = ? AND reason = 'editor-reset'").get(org.id).body, '<p>Texto meu</p>');
  assert.equal(call(ctrl.getAll).body.data.find(t => t.slug === 'coordenadas').customized, false);
});

test('pré-visualização com uma reserva real usa os dados dela e diz o que falta', () => {
  const res = call(ctrl.previewHtml, { params: { slug: 'coordenadas' }, body: { reservation_id: 'R1' } });
  assert.equal(res.statusCode, 200);
  assert.match(res.body.html, /Ana/);
  assert.match(res.body.html, /4821/);
  assert.deepEqual(res.body.missing, []);
  const thanks = call(ctrl.previewHtml, { params: { slug: 'obrigado' }, body: { reservation_id: 'R1' } });
  assert.deepEqual(thanks.body.missing.map(m => m.field), ['review_url']);
  // Uma reserva de outra organização é ignorada (cai nos dados de exemplo).
  const foreign = call(ctrl.previewHtml, { params: { slug: 'coordenadas' }, body: { reservation_id: 'R2' } });
  assert.doesNotMatch(foreign.body.html, /Outro/);
});

test('lista de reservas para a pré-visualização: só as da organização', () => {
  const all = call(ctrl.previewReservations).body.data.map(r => r.id);
  assert.deepEqual(all, ['R1']);
  assert.deepEqual(call(ctrl.previewReservations, { query: { accommodation_id: 'fora' } }).body.data, []);
});

test('o editor recebe o remetente e se a política de pagamento está ligada', () => {
  const body = call(ctrl.getAll).body;
  assert.equal(body.sender.name, 'Casa do Monte');
  assert.equal(body.payment_policy_enabled, false);
});
