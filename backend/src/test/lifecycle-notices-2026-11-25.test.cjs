// Auditoria 25/11 (pontos 14 e 16): «falta pagar agora» num só cálculo, sino
// com prazos e sem dinheiro para o funcionário, resumo diário com a vista
// certa, pedido recusado e prazos de pagamento configurados.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-lifecycle-notices-'));
const originalCwd = process.cwd();
process.chdir(temp);
process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.EMAIL_ENABLED = 'false';
process.env.PUBLIC_APP_URL = 'http://localhost:3001';
process.env.RESERVATION_EVENTS_DISPATCH = 'manual';
const { db, initDatabase } = require('../config/database');
initDatabase();
require('../services/operationalTasksService').syncReservationOperationalTasks = () => {};
require('../services/calendarService').kickCalendarQueue = () => {};
const pushes = [];
require('../services/staffNotifier').push = async (org, type, options) => { pushes.push({ type, ...options }); };
const paymentPolicy = require('../services/paymentPolicy');
const events = require('../services/reservationEvents');
const effects = require('../services/reservationEffects');
const { getNotifications } = require('../controllers/reservationOperationsController');
const { dashboardToday } = require('../services/dashboardToday');
after(() => { db.close(); process.chdir(originalCwd); fs.rmSync(temp, { recursive: true, force: true }); });

const ORG = 'org-ln';
const iso = hours => new Date(Date.now() + hours * 3600000).toISOString();
const sqlite = hours => iso(hours).replace('T', ' ').slice(0, 19);
db.exec(`INSERT INTO organizations(id,name,slug) VALUES ('${ORG}','Ciclo','ciclo');
  INSERT INTO users(id,name,email,password_hash) VALUES ('u-owner','Dona','dona@ln.example','x'),('u-staff','Func','func@ln.example','x');
  INSERT INTO memberships(id,organization_id,user_id,role) VALUES ('m1','${ORG}','u-owner','owner'),('m3','${ORG}','u-staff','staff');
  INSERT INTO guests(id,organization_id,name,email) VALUES ('g','${ORG}','Ana Pedido','ana@example.com');
  INSERT INTO accommodations(id,organization_id,name,type,price_per_night) VALUES ('a','${ORG}','Casa da Oliveira','alojamento',100);
  INSERT INTO push_subscriptions(id,organization_id,user_id,endpoint,keys_json) VALUES ('s1','${ORG}','u-owner','https://push.example.invalid/1','{}');`);
const insert = (id, status, { total = 300, paid = 0, deadline = null, created = sqlite(-1), channel = 'website', checkIn = '2035-06-01', checkOut = '2035-06-04' } = {}) =>
  db.prepare(`INSERT INTO reservations(id,organization_id,guest_id,accommodation_id,check_in,check_out,nights,num_guests,total_amount,amount_paid,status,channel,deposit_deadline,created_at)
    VALUES (?,?,?,?,?,?,3,2,?,?,?,?,?,?)`).run(id, ORG, 'g', 'a', checkIn, checkOut, total, paid, status, channel, deadline, created);
const row = id => db.prepare('SELECT * FROM reservations WHERE id=?').get(id);
function sino(role, id) {
  let out;
  getNotifications({ user: { id, role, organization_id: ORG } }, { json: body => { out = body.data.notifications; } }, error => { throw error; });
  return out;
}

test('falta pagar agora: sem política é o total em falta; pedido por aprovar e cancelada não devem nada', () => {
  insert('r-wait', 'aguardar_pagamento', { total: 300, paid: 100 });
  assert.deepEqual({ ...paymentPolicy.dueNow(row('r-wait')) }, { cents: 20000, remainingCents: 20000, kind: 'payment' });
  insert('r-pend', 'pendente');
  assert.equal(paymentPolicy.dueNow(row('r-pend')).cents, 0, 'pedido por aprovar');
  insert('r-canc', 'cancelada');
  assert.equal(paymentPolicy.dueNow(row('r-canc')).cents, 0);
  insert('r-plat', 'confirmada', { channel: 'booking' });
  assert.equal(paymentPolicy.dueNow(row('r-plat')).cents, 0, 'plataformas cobram por conta própria');
});

test('falta pagar agora: com política é só o sinal em falta e o restante depois do prazo', () => {
  const policy = { ...paymentPolicy.DEFAULT_POLICY, enabled: true, bookedOn: '2035-01-01' };
  insert('r-pol', 'aguardar_pagamento', { total: 400, paid: 50 });
  db.prepare('UPDATE reservations SET payment_policy_json=? WHERE id=?').run(JSON.stringify(policy), 'r-pol');
  const due = paymentPolicy.dueNow(row('r-pol'), new Date('2035-01-02T10:00:00Z'));
  const deposit = paymentPolicy.planFor(row('r-pol'), new Date('2035-01-02T10:00:00Z')).depositCents;
  assert.equal(due.kind, 'deposit');
  assert.equal(due.cents, deposit - 5000, 'sinal menos o que já foi pago');
  assert.ok(due.cents < due.remainingCents, 'não é o total em falta');
  // O mesmo valor no painel (e, por consequência, na ficha e no portal).
  const painel = dashboardToday(ORG, '2035-01-02', new Date('2035-01-02T10:00:00Z'), { role: 'owner' });
  assert.equal(painel.attention.awaitingDeposit.find(r => r.id === 'r-pol').missing, due.cents / 100);
});

test('painel: «por receber» exclui os pedidos por aprovar, que vão à parte', () => {
  const painel = dashboardToday(ORG, '2035-01-02', new Date('2035-01-02T10:00:00Z'), { role: 'owner' });
  assert.equal(painel.receivable.pendingCount, 1);
  assert.equal(painel.receivable.pendingAmount, 300);
  assert.ok(!painel.attention.awaitingDeposit.some(r => r.id === 'r-pend'));
});

test('sino: «Aguarda pagamento» com prazo só para gestor+, e o funcionário não vê dinheiro', () => {
  db.exec("DELETE FROM reservations WHERE id NOT IN ('r-wait')");
  db.prepare('UPDATE reservations SET deposit_deadline=? WHERE id=?').run(iso(30), 'r-wait');
  const owner = sino('owner', 'u-owner').find(n => n.type === 'awaiting_payment');
  assert.equal(owner.title, 'Aguarda pagamento');
  assert.match(owner.subtitle, /^Ana Pedido · Casa da Oliveira · prazo: \w{3}, \d+ \w{3} às \d\d:\d\d$/);
  assert.equal(owner.reservation_id, 'r-wait');
  const staffList = sino('staff', 'u-staff');
  assert.equal(staffList.filter(n => ['awaiting_payment', 'unpaid', 'payment_expiring', 'request_expiring'].includes(n.type)).length, 0);
  assert.ok(!staffList.some(n => /€/.test(`${n.title} ${n.subtitle}`)), 'sem valores em dinheiro');
});

test('sino e push: «Pagamento expira em N h» e «Pedido expira em N h» a menos de 12 h, uma vez por prazo', async () => {
  db.exec("DELETE FROM reservations; DELETE FROM reservation_events; DELETE FROM reservation_event_effects;");
  insert('r-pay', 'aguardar_pagamento', { deadline: iso(5.5), created: sqlite(-40) });
  insert('r-req', 'pendente', { created: sqlite(-(48 - 6.5)) });
  insert('r-far', 'pendente', { created: sqlite(-2) });
  const list = sino('owner', 'u-owner');
  assert.equal(list.find(n => n.type === 'payment_expiring').title, 'Pagamento expira em 6 h');
  assert.equal(list.find(n => n.type === 'request_expiring').title, 'Pedido expira em 7 h');
  assert.ok(!list.some(n => n.type === 'awaiting_payment' && n.reservation_id === 'r-pay'), 'o pré-aviso substitui a entrada simples');
  assert.ok(!list.some(n => n.type === 'request_expiring' && n.reservation_id === 'r-far'));

  const expiry = require('../services/expiryNotices');
  assert.equal(expiry.warnExpiring(), 2);
  assert.equal(expiry.warnExpiring(), 0, 'uma só vez por reserva e prazo');
  await events.dispatchPending();
  const titles = pushes.filter(p => /expira em/.test(p.title)).map(p => p.title).sort();
  assert.deepEqual(titles, ['Pagamento expira em 6 h', 'Pedido expira em 7 h']);
  assert.deepEqual(pushes.find(p => /expira em/.test(p.title)).roles, ['owner', 'manager']);
  assert.ok(pushes.find(p => /^Pedido/.test(p.title)).url.includes('r-req'));
  // Novo prazo (por exemplo, a equipa estendeu-o): novo aviso.
  db.prepare('UPDATE reservations SET deposit_deadline=? WHERE id=?').run(iso(3), 'r-pay');
  assert.equal(expiry.warnExpiring(), 1);
});

test('resumo diário: uma só reserva abre a reserva; várias, o painel', () => {
  const { summaryUrl, pendingToday } = require('../services/pushScheduler');
  const today = require('../services/reservationRules').localDateIso();
  db.exec('DELETE FROM reservations');
  insert('r-d1', 'confirmada', { checkIn: today, checkOut: '2035-06-04' });
  const one = pendingToday(ORG, today);
  assert.equal(summaryUrl(one), '/reservas?reserva=r-d1');
  insert('r-d2', 'confirmada', { checkIn: '2030-01-01', checkOut: today });
  assert.equal(summaryUrl(pendingToday(ORG, today)), '/dashboard');
  assert.equal(summaryUrl({ ids: [] }), '/dashboard');
});

test('recusar um pedido: o email diz que não pôde ser aceite e convida a escolher outras datas', async () => {
  db.exec('DELETE FROM reservations; DELETE FROM reservation_events; DELETE FROM reservation_event_effects;');
  insert('r-no', 'pendente');
  db.transaction(() => require('../services/reservationLifecycle').markCancelled(row('r-no'), { reason: 'staff', actorUserId: 'u-owner' }))();
  const event = db.prepare("SELECT payload FROM reservation_events WHERE type='reservation.cancelled'").get();
  assert.equal(JSON.parse(event.payload).refusedRequest, true);

  const sent = [];
  require('../services/emailService').sendCancellationEmail = async (guest, reservation, accommodation, reason) => { sent.push(reason); return { id: 'm', queued: false }; };
  await effects.runEffect('guest_cancellation_email', { organizationId: ORG, reservationId: 'r-no', type: 'reservation.cancelled', payload: JSON.parse(event.payload) });
  assert.deepEqual(sent, ['refused']);

  const samples = require('../services/emailSamples');
  const ctx = samples.previewContext(ORG, { status: 'cancelada', reservation: { amount_paid: 0, motivo_cancelamento: 'refused' } });
  const text = `${ctx.blocks.titulo_cancelamento} ${ctx.blocks.mensagem_cancelamento}`.replace(/<[^>]+>/g, ' ');
  assert.match(text, /não pôde ser aceite/);
  assert.doesNotMatch(text, /Se não esperava este email/);
  ctx.settings.booking_url = 'https://reservas.example.invalid/casa';
  assert.match(samples.previewContext(ORG, { status: 'cancelada', reservation: { amount_paid: 0, motivo_cancelamento: 'refused' } }).blocks.mensagem_cancelamento, /não pôde ser aceite/);
  assert.match(require('../services/emailService').buildBlocks(ctx.vars, ctx.settings, ctx.reservation).botao_novo_pedido, /Escolher outras datas/);
  assert.equal(ctx.vars.assunto_cancelamento, 'Pedido não aceite');
  // Cancelar uma reserva já aceite continua a dizer «cancelada».
  const staffCtx = samples.previewContext(ORG, { status: 'cancelada', reservation: { amount_paid: 0, motivo_cancelamento: 'staff' } });
  assert.match(staffCtx.blocks.mensagem_cancelamento, /Se não esperava este email/);
  assert.equal(staffCtx.vars.assunto_cancelamento, 'Reserva cancelada');
});

test('migração do assunto do cancelamento: só os modelos não editados, com cópia', () => {
  db.prepare("DELETE FROM schema_migrations WHERE id = '20261125_cancel_subject'").run();
  const tplOrg = require('../services/orgService').createOrganization('Modelos').id;
  const slugRow = org => db.prepare("SELECT subject FROM organization_email_templates WHERE organization_id=? AND slug='cancelamento'").get(org);
  assert.ok(slugRow(tplOrg), 'modelo existente');
  db.prepare("UPDATE organization_email_templates SET subject='Reserva cancelada — {{alojamento}}' WHERE organization_id=? AND slug='cancelamento'").run(tplOrg);
  require('../config/migrations-guest-journey')(db);
  assert.equal(slugRow(tplOrg).subject, '{{assunto_cancelamento}} — {{alojamento}}');
  assert.ok(db.prepare("SELECT 1 FROM organization_email_templates_backup WHERE organization_id=? AND slug='cancelamento' AND subject='Reserva cancelada — {{alojamento}}'").get(tplOrg), 'cópia');
  // Assunto editado: fica como está.
  db.prepare("DELETE FROM schema_migrations WHERE id = '20261125_cancel_subject'").run();
  db.prepare("UPDATE organization_email_templates SET subject='O meu assunto' WHERE organization_id=? AND slug='cancelamento'").run(tplOrg);
  require('../config/migrations-guest-journey')(db);
  assert.equal(slugRow(tplOrg).subject, 'O meu assunto');
});
