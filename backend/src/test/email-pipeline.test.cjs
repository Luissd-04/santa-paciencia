// Caminho único dos emails: modelos novos de pagamento e da política, avisos
// da política pelos modelos, links públicos e deteção de ligação Gmail expirada.
const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-email-pipeline-'));
const originalCwd = process.cwd();
process.chdir(temp);
process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.EMAIL_ENABLED = 'true';
process.env.PUBLIC_APP_URL = 'https://reservas.example.com';
process.env.RESERVATION_EVENTS_DISPATCH = 'manual';
const { db, initDatabase } = require('../config/database');
initDatabase();
db.exec("INSERT INTO organizations(id,name,slug) VALUES ('org-mail','Casa','casa')");
initDatabase(); // novo arranque: acrescenta os modelos por omissão à organização existente

const sent = [];
const gmail = require('../config/googleEmail');
Object.assign(gmail, {
  isEmailAuthenticated: () => true,
  getEmailConnectionInfo: () => ({ email: 'casa@example.com', connected: true }),
  sendViaGmail: async (org, message) => { sent.push(message); return { id: `gmail-${sent.length}` }; },
});
const emailService = require('../services/emailService');
const policy = require('../services/paymentPolicy');
const automation = require('../services/paymentPolicyAutomation');

beforeEach(() => {
  db.exec(`DELETE FROM email_deliveries; DELETE FROM organization_email_queue; DELETE FROM reservations; DELETE FROM guests;
    DELETE FROM accommodations; DELETE FROM organization_settings WHERE key = 'payment_policy';
    UPDATE organization_email_templates SET active = 1, window_start = NULL, window_end = NULL;
    INSERT INTO guests(id,organization_id,name,email) VALUES ('guest','org-mail','Ana Silva','ana@example.com');
    INSERT INTO accommodations(id,organization_id,name,type,price_per_night,max_guests) VALUES ('unit','org-mail','Quarto','alojamento',100,2);`);
  sent.length = 0;
});
after(() => { db.close(); process.chdir(originalCwd); fs.rmSync(temp, { recursive: true, force: true }); });

function reservation(overrides = {}) {
  const r = { id: 'res', organization_id: 'org-mail', guest_id: 'guest', accommodation_id: 'unit', check_in: '2035-06-10',
    check_out: '2035-06-12', nights: 2, num_guests: 2, total_amount: 200, amount_paid: 50, payment_status: 'parcial',
    status: 'confirmada', channel: 'direto', public_token: 'a'.repeat(64), ...overrides };
  db.prepare(`INSERT INTO reservations(${Object.keys(r).join(',')}) VALUES (${Object.keys(r).map(() => '?').join(',')})`).run(...Object.values(r));
  return db.prepare('SELECT * FROM reservations WHERE id = ?').get(r.id);
}
const guest = () => db.prepare("SELECT * FROM guests WHERE id='guest'").get();
const unit = () => db.prepare("SELECT * FROM accommodations WHERE id='unit'").get();

test('as organizações existentes recebem os modelos novos', () => {
  const slugs = db.prepare("SELECT slug FROM organization_email_templates WHERE organization_id='org-mail'").all().map(t => t.slug);
  for (const slug of ['pagamento', 'aviso_restante', 'cancelamento_politica']) assert.ok(slugs.includes(slug), slug);
});

test('email de pagamento parcial mostra o valor recebido e o que falta', async () => {
  const r = reservation();
  const result = await emailService.sendPaymentConfirmationEmail(guest(), r, unit(), { amount: 50 });
  assert.ok(result.id);
  assert.equal(sent.length, 1);
  assert.match(sent[0].subject, /Pagamento recebido/);
  assert.match(sent[0].html, /Recebemos 50,00/);
  assert.match(sent[0].html, />Falta </);
  assert.match(sent[0].html, /150,00/);
  assert.doesNotMatch(sent[0].html, /\{\{/);
});

test('email de pagamento que liquida a reserva diz confirmado e não mostra falta', async () => {
  const r = reservation({ amount_paid: 200, payment_status: 'confirmado' });
  await emailService.sendPaymentConfirmationEmail(guest(), r, unit(), { amount: 150 });
  assert.match(sent[0].html, /Pago na totalidade/);
  assert.doesNotMatch(sent[0].html, />Falta </);
});

test('modelo de pagamento desativado: nada é enviado', async () => {
  db.exec("UPDATE organization_email_templates SET active = 0 WHERE slug = 'pagamento'");
  const r = reservation();
  assert.equal(await emailService.sendPaymentConfirmationEmail(guest(), r, unit(), { amount: 50 }), null);
  assert.equal(sent.length, 0);
});

test('aviso do restante sai pelo modelo, com prazo e link da reserva, mesmo fora da janela horária', async () => {
  db.exec("UPDATE organization_email_templates SET window_start = '03:00', window_end = '03:01' WHERE slug = 'aviso_restante'");
  policy.savePolicy('org-mail', { ...policy.DEFAULT_POLICY, enabled: true });
  reservation({ check_in: '2035-06-10', status: 'confirmada', policy_accepted_at: new Date().toISOString() });
  policy.attachPolicy({ id: 'res', organization_id: 'org-mail' });
  db.exec("UPDATE reservations SET status = 'confirmada' WHERE id = 'res'");
  const ok = await automation.sendNotice(db.prepare("SELECT * FROM reservations WHERE id='res'").get(), 'balance');
  assert.equal(ok, 'sent');
  assert.equal(sent.length, 1);
  assert.match(sent[0].subject, /Pagamento do restante — Reserva res/);
  assert.match(sent[0].html, /https:\/\/reservas\.example\.com\/reserva\/a{64}/);
  assert.match(sent[0].html, /hora de Lisboa/);
  assert.doesNotMatch(sent[0].html, /\{\{/);
  const row = db.prepare("SELECT balance_notice_sent_at, balance_deadline FROM reservations WHERE id='res'").get();
  assert.ok(row.balance_notice_sent_at && row.balance_deadline);
});

test('aviso do restante com o modelo desativado não conta como enviado (o prazo não começa)', async () => {
  db.exec("UPDATE organization_email_templates SET active = 0 WHERE slug = 'aviso_restante'");
  policy.savePolicy('org-mail', { ...policy.DEFAULT_POLICY, enabled: true });
  reservation({ policy_accepted_at: new Date().toISOString() });
  policy.attachPolicy({ id: 'res', organization_id: 'org-mail' });
  const ok = await automation.sendNotice(db.prepare("SELECT * FROM reservations WHERE id='res'").get(), 'balance');
  assert.equal(ok, 'retry', 'fica por enviar: a fila repete e, ao fim das tentativas, avisa no sino');
  assert.equal(db.prepare("SELECT balance_notice_sent_at FROM reservations WHERE id='res'").get().balance_notice_sent_at, null);
});

test('cancelamento com reembolso só segue para reservas canceladas', async () => {
  const cancellation = JSON.stringify({ refundCents: 2500, refundPercent: 50, state: 'complete', items: [] });
  const r = reservation({ status: 'cancelada', policy_cancellation_json: cancellation });
  await emailService.sendTemplatedEmail('cancelamento_politica', guest(), r, unit());
  assert.match(sent[0].html, /25,00/);
  db.exec("UPDATE reservations SET status = 'confirmada'");
  sent.length = 0;
  assert.equal(await emailService.sendTemplatedEmail('cancelamento_politica', guest(), { ...r, status: 'confirmada' }, unit()), null);
  assert.equal(sent.length, 0);
});

test('links públicos: uma só origem, obrigatória em produção', () => {
  const links = require('../services/publicLinks');
  assert.equal(links.reservationPageUrl({ public_token: 'b'.repeat(64) }), `https://reservas.example.com/reserva/${'b'.repeat(64)}`);
  assert.equal(links.reservationPageUrl({}), '');
  assert.match(links.newToken(), /^[a-f0-9]{64}$/);
  const previous = { url: process.env.PUBLIC_APP_URL, env: process.env.NODE_ENV };
  try {
    delete process.env.PUBLIC_APP_URL;
    process.env.NODE_ENV = 'production';
    assert.throws(() => links.origin(), /PUBLIC_APP_URL/);
  } finally {
    process.env.PUBLIC_APP_URL = previous.url;
    process.env.NODE_ENV = previous.env;
  }
});

test('ligação Gmail expirada é reconhecida da mesma forma em todas as rotas', () => {
  const { isAuthExpiredError } = require('../services/googleConnection');
  assert.equal(isAuthExpiredError(new Error('invalid_grant')), true);
  assert.equal(isAuthExpiredError({ response: { data: { error: 'invalid_grant' } } }), true);
  assert.equal(isAuthExpiredError({ code: 401 }), true);
  assert.equal(isAuthExpiredError(new Error('Quota exceeded')), false);
});
