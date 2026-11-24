// Cancelamento pelo hóspede (auditoria de 25/11): o email diz para onde vai o
// reembolso e quando chega, e leva as datas; a migração só atualiza modelos
// não editados; o portal recebe os valores online para mostrar «Pago» e
// «Reembolso» numa reserva reembolsada.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-cancel-portal-'));
const originalCwd = process.cwd();
process.chdir(temp);
Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test', PUBLIC_APP_URL: 'https://exemplo.invalid' });
const { db, initDatabase } = require('../config/database');
initDatabase();
const emailService = require('../services/emailService');
const { TEMPLATES } = require('../config/emailTemplateDefaults');
after(() => { db.close(); process.chdir(originalCwd); fs.rmSync(temp, { recursive: true, force: true }); });

const SETTINGS = { checkin_time: '15:00', checkout_time: '11:00', property_name: 'Quinta', email_contact: 'q@exemplo.invalid' };
const GUEST = { name: 'Maria Ferreira', first_name: 'Maria', email: 'm@exemplo.invalid' };
const strip = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('email de cancelamento com política: datas, cartão e prazo do reembolso', () => {
  const r = { id: 'SP-1', status: 'cancelada', check_in: '2035-11-14', check_out: '2035-11-16', nights: 2, num_guests: 2, total_amount: 250, amount_paid: 80,
    policy_cancellation_json: JSON.stringify({ refundCents: 6060, refundPercent: 50, state: 'complete', items: [] }) };
  const vars = emailService.sanitizeUrlVars(emailService.buildVars(GUEST, r, { name: 'Quarto Sobreiro' }, SETTINGS, {}));
  const tpl = TEMPLATES.cancelamento_politica;
  const text = strip(emailService.renderEmail({ subject: tpl.subject, body: tpl.body, vars, blocks: emailService.buildBlocks(vars, SETTINGS, r), settings: SETTINGS }).html);
  assert.match(text, /Quarto Sobreiro \(14 a 16 nov|Quarto Sobreiro \([^)]*nov/);
  assert.match(text, /vai para o cartão que usou no pagamento/);
  assert.match(text, /5 a 10 dias úteis, conforme o banco/);
});

test('migração do texto: só atualiza o modelo que ainda é o anterior', () => {
  const novo = TEMPLATES.cancelamento_politica;
  const antigo = novo.body.replace(/<p [^>]*>Se houver valor a devolver[^<]*<\/p>/, '').replace(' ({{datas_curtas}}) foi cancelada', ' foi cancelada');
  assert.notEqual(antigo, novo.body);
  db.exec("INSERT INTO organizations(id,name,slug) VALUES ('o1','A','a'),('o2','B','b')");
  const put = db.prepare(`INSERT INTO organization_email_templates(organization_id,slug,name,subject,body,active) VALUES (?,?,?,?,?,1)
    ON CONFLICT(organization_id, slug) DO UPDATE SET body = excluded.body`);
  put.run('o1', 'cancelamento_politica', novo.name, novo.subject, antigo);
  put.run('o2', 'cancelamento_politica', novo.name, novo.subject, '<p>Texto editado pela organização</p>');
  db.prepare("DELETE FROM schema_migrations WHERE id = '20261125_cancel_refund_text'").run();
  require('../config/migrations').runMigrations(db);
  const body = org => db.prepare("SELECT body FROM organization_email_templates WHERE organization_id=? AND slug='cancelamento_politica'").get(org).body;
  assert.equal(body('o1'), novo.body);
  assert.equal(body('o2'), '<p>Texto editado pela organização</p>');
  const backups = db.prepare("SELECT organization_id, body FROM organization_email_templates_backup WHERE slug='cancelamento_politica' AND reason='20261125_cancel_refund_text'").all();
  assert.deepEqual(backups, [{ organization_id: 'o1', body: antigo }]);
});

test('online_payment traz o último pagamento, o cobrado e o devolvido', () => {
  const { paymentSummary } = require('../services/stripePayments');
  db.exec(`INSERT INTO accommodations(id,organization_id,name,type,price_per_night,max_guests) VALUES ('a','o1','Q','suite',50,2);
    INSERT INTO guests(id,organization_id,name,email) VALUES ('g','o1','M','m@exemplo.invalid');
    INSERT INTO reservations(id,organization_id,guest_id,accommodation_id,check_in,check_out,nights,num_guests,total_amount,status,channel)
      VALUES ('R1','o1','g','a','2035-01-10','2035-01-12',2,2,245.7,'cancelada','site')`);
  const cols = db.pragma('table_info(stripe_payment_attempts)').map(c => c.name);
  assert.ok(cols.includes('captured_cents') && cols.includes('refunded_cents'));
  const summary = paymentSummary(db.prepare("SELECT * FROM reservations WHERE id='R1'").get());
  assert.deepEqual([summary.last_paid, summary.captured, summary.refunded], [0, 0, 0]);
});
