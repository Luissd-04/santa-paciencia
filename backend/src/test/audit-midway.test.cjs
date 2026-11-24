// Auditoria de 25/11/2026, o que acontece a meio da reserva: pagar sem Stripe
// (instruções do alojamento), editar uma reserva já paga, dinheiro numa
// reserva cancelada, pré-check-in que acompanha as datas, reativar sem o
// scheduler a desfazer e cancelar pelo formulário com política.
const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-midway-'));
const originalCwd = process.cwd();
process.chdir(temp);
Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test', EMAIL_ENABLED: 'true', PUBLIC_APP_URL: 'https://reservas.example.com',
  RESERVATION_EVENTS_DISPATCH: 'manual', TZ: 'Europe/Lisbon' });
const { db, initDatabase } = require('../config/database');
initDatabase();
db.exec("INSERT INTO organizations(id,name,slug) VALUES ('o','Casa','casa')");
initDatabase();
const sent = [];
Object.assign(require('../config/googleEmail'), {
  isEmailAuthenticated: () => true,
  getEmailConnectionInfo: () => ({ email: 'casa@example.com', connected: true }),
  sendViaGmail: async (org, message) => { sent.push(message); return { id: `g-${sent.length}` }; },
});
let stripe = false;
require('../services/stripeClient').stripeEnabled = () => stripe;
require('../services/operationalTasksService').syncReservationOperationalTasks = () => {};
require('../services/calendarService').kickCalendarQueue = () => {};
const emailService = require('../services/emailService');
const readiness = require('../services/emailReadiness');
const events = require('../services/reservationEvents');
const settings = require('../services/settingsService');
const policy = require('../services/paymentPolicy');
const lifecycle = require('../services/reservationLifecycle');
const cancelledMoney = require('../services/cancelledMoney');
const scheduler = require('../services/reservationScheduler');
const { dashboardToday } = require('../services/dashboardToday');
const dates = require('../services/dates');
const write = require('../controllers/reservationWriteController');
const reservations = require('../controllers/reservationController');
const payments = require('../controllers/reservationPaymentsController');
after(() => { db.close(); process.chdir(originalCwd); fs.rmSync(temp, { recursive: true, force: true }); });

const ORG = 'o';
const today = () => dates.localDay(new Date());
const inDays = n => dates.addDays(today(), n);
beforeEach(() => {
  sent.length = 0; stripe = false;
  db.exec(`DELETE FROM reservation_event_effects; DELETE FROM reservation_events; DELETE FROM email_holds; DELETE FROM email_deliveries;
    DELETE FROM reservation_payments; DELETE FROM reservation_history; DELETE FROM stripe_payment_attempts; DELETE FROM reservations;
    DELETE FROM guests; DELETE FROM accommodations; DELETE FROM organization_settings; DELETE FROM users;
    INSERT INTO users(id,name,email,password_hash) VALUES ('manager','Gestora','gestora@example.invalid','x');
    INSERT INTO guests(id,organization_id,name,email) VALUES ('g','${ORG}','Ana Silva','ana@example.com');
    INSERT INTO accommodations(id,organization_id,name,type,price_per_night,max_guests,address,license_number,checkin_time,checkout_time,contact_email)
      VALUES ('casa','${ORG}','Casa','alojamento',100,4,'Rua A 1','1/AL','15:00','11:00','casa@example.com');`);
});

function reservation(over = {}) {
  const r = { id: 'r', organization_id: ORG, guest_id: 'g', accommodation_id: 'casa', check_in: inDays(60), check_out: inDays(62), nights: 2,
    num_guests: 2, total_amount: 200, amount_paid: 0, payment_status: 'pendente', status: 'aguardar_pagamento', channel: 'website',
    public_token: 'a'.repeat(64), ...over };
  db.prepare(`INSERT INTO reservations(${Object.keys(r).join(',')}) VALUES (${Object.keys(r).map(() => '?').join(',')})`).run(...Object.values(r));
  if (r.amount_paid > 0) db.prepare("INSERT INTO reservation_payments(id,reservation_id,organization_id,amount,method) VALUES ('rp-1','r',?,?,'transferencia')").run(ORG, r.amount_paid);
  return r;
}
const row = (id = 'r') => db.prepare('SELECT * FROM reservations WHERE id=?').get(id);
const ledger = () => db.prepare('SELECT id, amount, method FROM reservation_payments WHERE reservation_id=? ORDER BY rowid').all('r');
const guest = () => db.prepare('SELECT * FROM guests WHERE id=?').get('g');
const unit = () => db.prepare('SELECT * FROM accommodations WHERE id=?').get('casa');
const req = (body = {}, params = { id: 'r' }) => ({ body, params, query: {}, ip: '127.0.0.1', protocol: 'http', get: () => 'test.invalid',
  user: { id: 'manager', role: 'manager', organization_id: ORG } });
async function call(fn, body, params) {
  const res = { statusCode: 200, status(n) { this.statusCode = n; return this; }, json(data) { this.body = data; return this; } };
  await fn(req(body, params), res, error => { res.status(error.status || 500).json({ error: error.message, code: error.code }); });
  return res;
}
const text = html => String(html).replace(/<[^>]+>/g, ' ').replace(/&nbsp;|\s+/g, ' ');

// ── 1. Sem Stripe: instruções de pagamento ──────────────────────────────────

test('sem Stripe e com instruções, «Reserva aceite» sai com as instruções e o prazo, sem botão de pagar', async () => {
  settings.set(ORG, 'payment_instructions', 'Transferência para PT50 0035 0000 1234 5678 9012 3.\nMB Way para 912 345 678.');
  reservation({ deposit_deadline: new Date(Date.now() + 40 * 3600000).toISOString() });
  const result = await emailService.sendReservationAcceptedEmail(guest(), row(), unit(), 'https://reservas.example.com/pre-checkin/x');
  assert.ok(result.id, 'não ficou retido');
  assert.equal(readiness.openHolds(ORG).length, 0);
  const body = text(sent[0].html);
  assert.match(body, /Como pagar/i);
  assert.match(body, /PT50 0035 0000 1234 5678 9012 3/);
  assert.match(body, /MB Way para 912 345 678/);
  assert.match(body, /Indique a referência/);
  assert.match(body, /até .*, às \d\d:\d\d/, 'o prazo mantém-se');
  assert.doesNotMatch(body, /Pagar a reserva ·|Pagamento seguro através da Stripe/);
});

test('com Stripe ligada o email leva o botão de pagar e não as instruções', async () => {
  stripe = true;
  settings.set(ORG, 'payment_instructions', 'Transferência para PT50 0035');
  reservation({ deposit_deadline: new Date(Date.now() + 40 * 3600000).toISOString() });
  await emailService.sendReservationAcceptedEmail(guest(), row(), unit());
  const body = text(sent[0].html);
  assert.match(body, /Pagar a reserva · /);
  assert.doesNotMatch(body, /PT50 0035/);
});

test('sem Stripe e sem instruções o email fica retido e a equipa vê porquê', async () => {
  reservation({ deposit_deadline: new Date(Date.now() + 40 * 3600000).toISOString() });
  const result = await emailService.sendReservationAcceptedEmail(guest(), row(), unit());
  assert.equal(result.held, true);
  assert.deepEqual(result.missing.map(m => m.label), ['Instruções de pagamento ou Stripe']);
  assert.equal(sent.length, 0);
  const [held] = readiness.openHolds(ORG);
  assert.deepEqual(held.missing.map(m => m.field), ['payment']);
  // O sino leva às Definições → Pagamentos (falta só isto).
  const res = { json(data) { this.body = data; } };
  require('../services/notificationState').annotate = (user, org, list) => list;
  require('../controllers/reservationOperationsController').getNotifications(req(), res, error => { throw error; });
  const notice = res.body.data.notifications.find(n => n.type === 'email_held');
  assert.match(notice.subtitle, /Falta: Instruções de pagamento ou Stripe\./);
  assert.equal(notice.settings_tab, 'payments');
  // Com as instruções guardadas, «Enviar» envia.
  settings.set(ORG, 'payment_instructions', 'MB Way 912 345 678');
  await emailService.sendHeldEmail(ORG, 'r', 'reserva_aceite');
  assert.match(text(sent[0].html), /MB Way 912 345 678/);
});

test('a API das instruções valida o tamanho e guarda por organização', async () => {
  const router = require('../routes/paymentPolicy');
  const handler = method => router.stack.find(l => l.route?.path === '/instructions' && l.route.methods[method]).route.stack.at(-1).handle;
  const run = (method, body) => { const res = { statusCode: 200, status(n) { this.statusCode = n; return this; }, json(d) { this.body = d; return this; } }; handler(method)(req(body), res, e => { throw e; }); return res; };
  assert.equal(run('put', { instructions: 'x'.repeat(1001) }).statusCode, 400);
  assert.equal(run('put', { instructions: '  PT50 1234  ' }).body.data.instructions, 'PT50 1234');
  assert.equal(run('get').body.data.instructions, 'PT50 1234');
});

// ── 2. Editar uma reserva paga ──────────────────────────────────────────────

test('subir o total de uma reserva com sinal pago: continua confirmada e o hóspede recebe «reserva alterada»', async () => {
  reservation({ status: 'confirmada', amount_paid: 100, payment_status: 'parcial', total_amount: 200 });
  const res = await call(write.update, { total_amount: 300 }, { id: 'r' });
  assert.equal(res.statusCode, 200, res.body?.error);
  assert.equal(row().status, 'confirmada', 'não recua para «Aguarda sinal»');
  assert.equal(row().payment_status, 'parcial');
  const changed = db.prepare("SELECT * FROM reservation_events WHERE type='reservation.changed'").all();
  assert.equal(changed.length, 1);
  await events.dispatchPending();
  assert.equal(sent.length, 1);
  assert.match(sent[0].subject, /A sua reserva foi alterada/);
  const body = text(sent[0].html);
  assert.match(body, /Alterámos a sua reserva/);
  assert.match(body, /300,00\s?€ \(antes: 200,00\s?€\)/, 'novo e antigo total');
  assert.match(body, /Já pago[^€]*100,00/);
  assert.match(body, /Falta pagar[^€]*200,00/);
  assert.match(body, /Faltam 200,00\s?€\s*,\s*até /, 'quanto falta e até quando');
  assert.match(sent[0].html, /reservas\.example\.com\/reserva\/a{64}/, 'link do portal');
});

test('mudar as datas de uma reserva paga avisa o hóspede com as datas novas', async () => {
  reservation({ status: 'confirmada', amount_paid: 200, payment_status: 'confirmado', total_amount: 200 });
  const res = await call(write.update, { check_in: inDays(70), check_out: inDays(72) }, { id: 'r' });
  assert.equal(res.statusCode, 200, res.body?.error);
  assert.equal(row().status, 'confirmada');
  await events.dispatchPending();
  assert.equal(sent.length, 1);
  assert.match(text(sent[0].html), /Datas[^(]*\(antes: /, 'datas novas e antigas');
  assert.match(text(sent[0].html), /Já pago[^€]*200,00/);
});

test('editar notas, ou uma reserva sem pagamento, não envia «reserva alterada»', async () => {
  reservation({ status: 'confirmada', amount_paid: 200, payment_status: 'confirmado' });
  await call(write.update, { notes: 'chega tarde' }, { id: 'r' });
  db.exec("DELETE FROM reservation_payments; UPDATE reservations SET amount_paid=0, payment_status='pendente', status='aguardar_pagamento'");
  await call(write.update, { total_amount: 250 }, { id: 'r' });
  assert.equal(db.prepare("SELECT COUNT(*) n FROM reservation_events WHERE type='reservation.changed'").get().n, 0);
});

test('com política, editar o total mantém o consentimento e recomeça o aviso do restante', async () => {
  const bookedOn = today();
  const snapshot = JSON.stringify({ ...policy.DEFAULT_POLICY, enabled: true, bookedOn });
  reservation({ status: 'confirmada', amount_paid: 100, payment_status: 'parcial', payment_policy_json: snapshot,
    policy_accepted_at: '2026-11-01T10:00:00Z', policy_auto_consent: '1', stripe_payment_method_id: 'pm_x',
    balance_notice_sent_at: '2026-11-20T10:00:00Z', balance_deadline: '2026-11-21T10:00:00Z', check_in: inDays(60), check_out: inDays(62) });
  // Descer o total: tudo se mantém, o aviso recomeça com o novo valor.
  await call(write.update, { total_amount: 180 }, { id: 'r' });
  let r = row();
  assert.ok(r.policy_accepted_at, 'consentimento mantido');
  assert.equal(r.policy_auto_consent, '1');
  assert.equal(r.stripe_payment_method_id, 'pm_x');
  assert.equal(r.balance_notice_sent_at, null);
  assert.equal(r.balance_deadline, null);
  assert.equal(policy.planFor(r).balanceCents + policy.planFor(r).depositCents, 18000, 'o plano recalcula-se com o novo total');
  // Subir o total: o consentimento às condições mantém-se; o cartão guardado deixa de ser cobrado sozinho.
  await call(write.update, { total_amount: 260 }, { id: 'r' });
  r = row();
  assert.ok(r.policy_accepted_at);
  assert.equal(r.policy_auto_consent, null);
  assert.equal(r.stripe_payment_method_id, null);
  assert.equal(r.status, 'confirmada');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM reservation_events WHERE type='reservation.changed'").get().n, 2);
});

// ── 3. Dinheiro numa reserva cancelada ──────────────────────────────────────

test('cancelar com valores recebidos: fica por tratar, no painel e no sino, até reembolsar ou reter', async () => {
  reservation({ status: 'confirmada', amount_paid: 150, payment_status: 'parcial' });
  await lifecycle.cancel(ORG, 'r', { actorUserId: 'manager' });
  const detail = await call(reservations.getById);
  assert.equal(detail.body.data.cancel_money.pending, true);
  assert.equal(detail.body.data.cancel_money.paid, 150);
  assert.equal(detail.body.data.cancel_money.manual, 150, 'pago fora da app: reembolso manual');
  const painel = dashboardToday(ORG, today(), new Date(), { role: 'manager' });
  assert.deepEqual(painel.attention.cancelledMoney.map(r => [r.id, r.paid]), [['r', 150]]);
  assert.equal(dashboardToday(ORG, today(), new Date(), { role: 'staff' }).attention.cancelledMoney.length, 0, 'o funcionário não vê valores');
  const bell = { json(d) { this.body = d; } };
  require('../controllers/reservationOperationsController').getNotifications(req(), bell, e => { throw e; });
  assert.ok(bell.body.data.notifications.some(n => n.type === 'cancelled_money' && /150,00/.test(n.subtitle)));
});

test('reembolsar (manual) regista o movimento, liquida o valor e fecha o aviso', async () => {
  reservation({ status: 'confirmada', amount_paid: 150, payment_status: 'parcial' });
  await lifecycle.cancel(ORG, 'r', { actorUserId: 'manager' });
  const res = await call(reservations.refundCancelledMoney, { method: 'transferência', note: 'IBAN do hóspede' });
  assert.equal(res.statusCode, 200, res.body?.error);
  assert.deepEqual(ledger().map(e => e.amount), [150, -150]);
  assert.equal(row().amount_paid, 0);
  assert.equal(row().payment_status, 'reembolsado');
  assert.equal(row().money_resolution, 'refunded');
  assert.equal(row().status, 'cancelada');
  assert.equal(dashboardToday(ORG, today(), new Date(), { role: 'owner' }).attention.cancelledMoney.length, 0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM reservation_history WHERE action='cancelled_money_refunded'").get().n, 1);
  // Repetir não devolve duas vezes.
  assert.equal((await call(reservations.refundCancelledMoney, {})).statusCode, 409);
  assert.equal(ledger().length, 2);
});

test('reter exige o motivo, regista-o e tira a reserva do painel', async () => {
  reservation({ status: 'confirmada', amount_paid: 150, payment_status: 'parcial' });
  await lifecycle.cancel(ORG, 'r', { actorUserId: 'manager' });
  assert.equal((await call(reservations.retainCancelledMoney, { reason: ' ' })).statusCode, 400);
  const res = await call(reservations.retainCancelledMoney, { reason: 'Cancelou fora do prazo das condições' });
  assert.equal(res.statusCode, 200, res.body?.error);
  assert.equal(row().money_resolution, 'retained');
  assert.equal(row().money_resolution_note, 'Cancelou fora do prazo das condições');
  assert.equal(row().amount_paid, 150, 'o dinheiro mantém-se registado');
  assert.equal(dashboardToday(ORG, today(), new Date(), { role: 'manager' }).attention.cancelledMoney.length, 0);
  const detail = await call(reservations.getById);
  assert.equal(detail.body.data.cancel_money.resolution, 'retained');
  assert.equal(detail.body.data.cancel_money.pending, false);
});

test('reembolsar ou reter só numa reserva cancelada e só a equipa de gestão', async () => {
  reservation({ status: 'confirmada', amount_paid: 150, payment_status: 'parcial' });
  assert.equal((await call(reservations.refundCancelledMoney, {})).statusCode, 409);
  assert.equal((await call(reservations.retainCancelledMoney, { reason: 'teste' })).statusCode, 409);
  const router = require('../routes/reservations');
  const layer = path => router.stack.find(l => l.route?.path === path && l.route.methods.post);
  for (const p of ['/:id/cancelled-money/refund', '/:id/cancelled-money/retain']) assert.ok(layer(p).route.stack.length >= 2, `${p} com requireRole('manager')`);
});

test('pagamento online que entra numa reserva cancelada avisa o hóspede de que o alojamento trata do reembolso', async () => {
  reservation({ status: 'cancelada', amount_paid: 80, payment_status: 'parcial' });
  assert.deepEqual(require('../services/reservationEffects').effectsFor('payment.after_cancellation'), ['guest_payment_after_cancellation_email']);
  events.emit('payment.after_cancellation', { organizationId: ORG, reservationId: 'r', payload: { amount: 80 } });
  await events.dispatchPending();
  assert.equal(sent.length, 1);
  const body = text(sent[0].html);
  assert.match(body, /Vamos tratar do reembolso/);
  assert.match(body, /80,00\s?€/);
  assert.match(body, /vai tratar do reembolso/);
});

// ── 4 e 5. Pré-check-in e reativar ──────────────────────────────────────────

test('mudar a saída acompanha a validade do link do pré-check-in', async () => {
  const oldOut = inDays(62);
  reservation({ status: 'confirmada', precheckin_token: 'b'.repeat(64), precheckin_token_expires_at: oldOut });
  const res = await call(write.update, { check_in: inDays(120), check_out: inDays(123) }, { id: 'r' });
  assert.equal(res.statusCode, 200, res.body?.error);
  assert.equal(row().precheckin_token_expires_at, inDays(123));
  // O mesmo para reservas que ficaram com a validade antiga (migração).
  db.prepare("UPDATE reservations SET precheckin_token_expires_at = ?").run(oldOut);
  db.prepare("DELETE FROM schema_migrations WHERE id='20261125_precheckin_expiry'").run();
  require('../config/migrations-guest-journey')(db);
  assert.equal(row().precheckin_token_expires_at, row().check_out);
});

test('reativar um pedido expirado renova os prazos e o scheduler não volta a cancelá-lo', async () => {
  reservation({ status: 'cancelada', cancelled_previous_status: 'pendente', created_at: '2020-01-01 10:00:00', amount_paid: 0 });
  const res = await call(write.update, { status: 'pendente' }, { id: 'r' });
  assert.equal(res.statusCode, 200, res.body?.error);
  assert.equal(row().status, 'pendente');
  assert.ok(row().created_at > '2026', 'created_at renovado');
  assert.equal(scheduler.expirePendingReservations(), 0);
  assert.equal(row().status, 'pendente');
});

test('reativar uma reserva cancelada por falta de sinal dá um prazo novo', async () => {
  reservation({ status: 'cancelada', cancelled_previous_status: 'aguardar_pagamento', deposit_deadline: '2020-01-01T10:00:00.000Z' });
  const res = await call(write.update, { status: 'aguardar_pagamento' }, { id: 'r' });
  assert.equal(res.statusCode, 200, res.body?.error);
  assert.equal(row().status, 'aguardar_pagamento');
  assert.ok(Date.parse(row().deposit_deadline) > Date.now());
  assert.equal(scheduler.expireUnpaidDeposits(), 0);
  assert.equal(row().status, 'aguardar_pagamento');
});

test('reativar limpa a decisão sobre o dinheiro', async () => {
  reservation({ status: 'confirmada', amount_paid: 150, payment_status: 'parcial' });
  await lifecycle.cancel(ORG, 'r', { actorUserId: 'manager' });
  await call(reservations.retainCancelledMoney, { reason: 'fora do prazo' });
  await call(write.update, { status: 'confirmada' }, { id: 'r' });
  assert.equal(row().money_resolution, null);
});

// ── 6. Cancelar pelo formulário com política ────────────────────────────────

test('com política, o seletor do formulário não oferece «Cancelada» e o PUT explica o caminho', async () => {
  const snapshot = JSON.stringify({ ...policy.DEFAULT_POLICY, enabled: true, bookedOn: today() });
  reservation({ status: 'confirmada', amount_paid: 100, payment_status: 'parcial', payment_policy_json: snapshot });
  assert.ok(!lifecycle.statusOptions(row(), { role: 'manager' }).includes('cancelada'));
  const res = await call(write.update, { status: 'cancelada' }, { id: 'r' });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, 'refund_confirmation');
  assert.match(res.body.error, /Cancelar reserva/);
  assert.equal(row().status, 'confirmada');
  // Sem política, «Cancelada» continua no seletor.
  db.exec('UPDATE reservations SET payment_policy_json = NULL');
  assert.ok(lifecycle.statusOptions(row(), { role: 'manager' }).includes('cancelada'));
});

test('o pagamento registado à mão numa reserva cancelada não é confundido com reembolso', async () => {
  reservation({ status: 'cancelada', amount_paid: 0 });
  const res = await call(payments.addPayment, { amount: 50, method: 'mbway' }, { id: 'r' });
  assert.equal(res.statusCode, 200, res.body?.error);
  assert.equal(row().payment_status, 'parcial');
  assert.equal(cancelledMoney.isPending(row()), true);
});
