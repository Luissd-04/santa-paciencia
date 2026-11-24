// Portal do hóspede (23/11/2026): «aberto pelo hóspede» só conta o hóspede
// (a equipa com sessão não), com escrita limitada a cada 10 minutos; o email
// «A sua reserva» (portal_hospede) leva o link do portal e o próximo passo,
// fica retido sem os dados do alojamento e regista o «Último envio».
const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-guest-portal-'));
const originalCwd = process.cwd();
process.chdir(temp);
Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test', EMAIL_ENABLED: 'true', PUBLIC_APP_URL: 'https://reservas.example.com', RESERVATION_EVENTS_DISPATCH: 'manual' });
const { db, initDatabase } = require('../config/database');
initDatabase();
const sent = [];
Object.assign(require('../config/googleEmail'), {
  isEmailAuthenticated: () => true,
  getEmailConnectionInfo: () => ({ email: 'casa@example.com', connected: true }),
  sendViaGmail: async (org, message) => { sent.push(message); return { id: `g-${sent.length}` }; },
});
require('../services/stripeClient').stripeEnabled = () => true;
const auth = require('../services/authService');
const orgs = require('../services/orgService');
const reservations = require('../controllers/reservationController');
const publicBooking = require('../controllers/publicBookingController');
const readiness = require('../services/emailReadiness');
const { defaultsList } = require('../config/emailTemplateDefaults');
after(() => { db.close(); process.chdir(originalCwd); fs.rmSync(temp, { recursive: true, force: true }); });

const org = orgs.createOrganization('Casa do Portal');
const other = orgs.createOrganization('Outra casa');
const user = auth.createUser({ name: 'Gestora', email: 'gestora@example.com', password: 'SyntheticPortal123!' });
orgs.createMembership({ organizationId: org.id, userId: user.id, role: 'manager' });
const outsider = auth.createUser({ name: 'De fora', email: 'fora@example.com', password: 'SyntheticPortal123!' });
orgs.createMembership({ organizationId: other.id, userId: outsider.id, role: 'manager' });
const staffSession = auth.createSession(user.id, org.id).sessionId;
const outsiderSession = auth.createSession(outsider.id, other.id).sessionId;
const TOKEN = 'b'.repeat(64);
const COMPLETE = `address='Rua A 1', license_number='1/AL', checkin_time='15:00', checkout_time='11:00', contact_email='casa@example.com'`;

beforeEach(() => {
  sent.length = 0;
  db.prepare('DELETE FROM email_holds').run();
  db.prepare('DELETE FROM email_deliveries').run();
  db.prepare('DELETE FROM reservation_history').run();
  db.prepare('DELETE FROM reservations').run();
  db.prepare('DELETE FROM guests').run();
  db.prepare('DELETE FROM accommodations').run();
  db.prepare("INSERT INTO guests(id,organization_id,name,email,phone) VALUES ('g',?,'Ana Hóspede','ana@example.com','912 345 678')").run(org.id);
  db.prepare(`INSERT INTO accommodations(id,organization_id,name,type,price_per_night,max_guests) VALUES ('casa',?,'Casa do Monte','alojamento',100,2)`).run(org.id);
  db.prepare(`UPDATE accommodations SET ${COMPLETE}`).run();
  db.prepare(`INSERT INTO reservations(id,organization_id,guest_id,accommodation_id,check_in,check_out,nights,num_guests,total_amount,amount_paid,status,channel,public_token)
    VALUES ('r',?,'g','casa','2035-06-10','2035-06-12',2,2,200,0,'aguardar_pagamento','website',?)`).run(org.id, TOKEN);
});

const reservation = () => db.prepare("SELECT * FROM reservations WHERE id='r'").get();
function response() {
  return { statusCode: 200, status(n) { this.statusCode = n; return this; }, json(data) { this.body = data; return this; } };
}
function openPortal(cookie) {
  const res = response();
  publicBooking.getReservationStatus({ params: { token: TOKEN }, headers: cookie ? { cookie } : {}, protocol: 'https', get: () => 'reservas.example.com' }, res);
  return res;
}
async function sendLink(id = 'r') {
  const res = response();
  await reservations.sendPortalLink({ params: { id }, body: {}, query: {}, protocol: 'https', get: () => 'reservas.example.com',
    user: { id: user.id, role: 'manager', organization_id: org.id } }, res, error => { res.status(error.status || 500).json({ error: error.message }); });
  return res;
}
async function detail() {
  const res = response();
  await reservations.getById({ params: { id: 'r' }, query: {}, protocol: 'https', get: () => 'reservas.example.com',
    user: { id: user.id, role: 'manager', organization_id: org.id } }, res, error => { throw error; });
  return res.body.data;
}

test('o hóspede a abrir o portal fica registado (primeira e última vez)', async () => {
  assert.equal(openPortal().statusCode, 200);
  const first = reservation();
  assert.ok(first.portal_first_opened_at, 'primeira abertura');
  assert.equal(first.portal_last_opened_at, first.portal_first_opened_at);
  // Uma sessão de outra organização não é a equipa desta reserva.
  db.prepare("UPDATE reservations SET portal_last_opened_at = datetime('now', '-11 minutes'), portal_first_opened_at = datetime('now', '-2 days')").run();
  openPortal(`${auth.SESSION_COOKIE}=${outsiderSession}`);
  const again = reservation();
  assert.notEqual(again.portal_last_opened_at, again.portal_first_opened_at, 'a última abertura avança');
  const data = await detail();
  assert.equal(data.portal_first_opened_at, again.portal_first_opened_at, 'a ficha recebe as duas horas');
  assert.equal(data.portal_last_opened_at, again.portal_last_opened_at);
});

test('a equipa com sessão na organização não conta como o hóspede', () => {
  assert.equal(openPortal(`other=1; ${auth.SESSION_COOKIE}=${staffSession}`).statusCode, 200, 'a página abre na mesma');
  const r = reservation();
  assert.equal(r.portal_first_opened_at, null);
  assert.equal(r.portal_last_opened_at, null);
  // Uma sessão inválida ou expirada já não é a equipa.
  db.prepare("UPDATE auth_sessions SET expires_at = '2000-01-01T00:00:00.000Z' WHERE id = ?").run(auth.digestToken(staffSession));
  try {
    openPortal(`${auth.SESSION_COOKIE}=${staffSession}`);
    assert.ok(reservation().portal_first_opened_at);
  } finally {
    db.prepare("UPDATE auth_sessions SET expires_at = '2099-01-01T00:00:00.000Z' WHERE id = ?").run(auth.digestToken(staffSession));
  }
});

test('a última abertura grava-se no máximo uma vez a cada 10 minutos', () => {
  const portal = require('../services/portalTracking');
  assert.equal(portal.OPEN_THROTTLE_MINUTES, 10);
  db.prepare("UPDATE reservations SET portal_first_opened_at = datetime('now', '-1 day'), portal_last_opened_at = datetime('now', '-5 minutes')").run();
  const before = reservation();
  openPortal();
  assert.equal(reservation().portal_last_opened_at, before.portal_last_opened_at, 'há 5 minutos: não escreve');
  db.prepare("UPDATE reservations SET portal_last_opened_at = datetime('now', '-10 minutes')").run();
  const stale = reservation().portal_last_opened_at;
  openPortal();
  const after = reservation();
  assert.ok(after.portal_last_opened_at > stale, 'há 10 minutos: escreve');
  assert.equal(after.portal_first_opened_at, before.portal_first_opened_at, 'a primeira abertura não muda');
});

test('«A sua reserva» é um modelo manual, com o link do portal e o próximo passo', async () => {
  const tpl = defaultsList().find(t => t.slug === 'portal_hospede');
  assert.equal(tpl.name, 'A sua reserva');
  assert.equal(tpl.timing_event, 'manual');
  assert.equal(tpl.active, 1);
  assert.ok(db.prepare("SELECT 1 FROM organization_email_templates WHERE organization_id=? AND slug='portal_hospede'").get(org.id), 'semeado na organização');
  const res = await sendLink();
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.email_sent, true);
  assert.equal(res.body.data.portal_url, `https://reservas.example.com/reserva/${TOKEN}`);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'ana@example.com');
  assert.equal(sent[0].subject, 'A sua reserva — Casa do Monte');
  assert.match(sent[0].html, new RegExp(`href="https://reservas\\.example\\.com/reserva/${TOKEN}"`));
  assert.match(sent[0].html, /falta pagar/);
  assert.doesNotMatch(sent[0].html, /falta pagar o sinal/, 'sem política paga-se o total');
  assert.ok(res.body.data.portal_link_sent_at, 'último envio');
  assert.equal((await detail()).portal_link_sent_at, res.body.data.portal_link_sent_at);
  assert.equal(res.body.data.precheckin_state, 'enviado', 'depois de aceite, o portal leva o pré-check-in');
  assert.ok(reservation().precheckin_token);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM reservation_history WHERE reservation_id='r' AND action='portal_link_sent'").get().n, 1);
});

test('reenviar volta a enviar; um pedido pendente recebe o link sem pré-check-in', async () => {
  await sendLink();
  const realNow = Date.now;
  Date.now = () => realNow() + 2 * 60000;
  try { assert.equal((await sendLink()).body.data.email_sent, true); } finally { Date.now = realNow; }
  assert.equal(sent.length, 2, 'o reenviar pedido pela equipa não é tratado como duplicado');

  db.prepare("UPDATE reservations SET status='pendente', precheckin_sent_at=NULL, precheckin_token=NULL").run();
  db.prepare('DELETE FROM email_deliveries').run();
  const res = await sendLink();
  assert.equal(res.body.data.email_sent, true);
  assert.match(sent.at(-1).html, /Estamos a confirmar a disponibilidade/);
  assert.equal(res.body.data.precheckin_state, 'nao_enviado');
  assert.equal(reservation().precheckin_token, null);

  db.prepare("UPDATE reservations SET status='cancelada'").run();
  assert.equal((await sendLink()).statusCode, 400, 'cancelada não recebe');
});

test('sem os dados comuns do alojamento, «A sua reserva» fica retida e o sino diz o que falta', async () => {
  assert.ok(readiness.GUEST_TEMPLATES.includes('portal_hospede'));
  assert.equal(readiness.TEMPLATE_NAMES.portal_hospede, 'A sua reserva');
  db.prepare("UPDATE accommodations SET license_number='', contact_email=''").run();
  const res = await sendLink();
  assert.equal(res.body.data.email_sent, false);
  assert.equal(res.body.data.held, true);
  assert.deepEqual(res.body.data.missing, ['Email de contacto', 'N.º de licença AL']);
  assert.equal(sent.length, 0);
  assert.equal(res.body.data.portal_link_sent_at, null);
  const [held] = readiness.openHolds(org.id);
  assert.equal(held.template_slug, 'portal_hospede');
  assert.equal(held.template_name, 'A sua reserva');
  const { emails } = readiness.forAccommodation(org.id, db.prepare("SELECT * FROM accommodations WHERE id='casa'").get());
  assert.deepEqual(emails.find(e => e.slug === 'portal_hospede').missing.map(m => m.field), ['email_contact', 'license_number']);
});

test('o pré-check-in avulso continua a funcionar', async () => {
  const res = response();
  await reservations.sendPrecheckinLink({ params: { id: 'r' }, body: {}, query: {}, protocol: 'https', get: () => 'reservas.example.com',
    user: { id: user.id, role: 'manager', organization_id: org.id } }, res, error => { throw error; });
  assert.equal(res.body.data.email_sent, true);
  assert.match(sent[0].subject, /Complete o seu pré-check-in/);
});
