// Acceptance regressions for V1: every assertion expects the corrected behavior.
// Executar: node docs/audit/reproduce-2026-10-08.cjs
// SQLite em memória, diretório temporário e Gmail simulado; não lê .env.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const previous = process.cwd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-review-20261008-'));
process.chdir(temp);
process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.EMAIL_ENABLED = 'true';
process.env.PUBLIC_APP_URL = 'http://localhost:3001';
delete process.env.FRONTEND_PATH;
delete process.env.STRIPE_SECRET_KEY;
delete process.env.STRIPE_WEBHOOK_SECRET;
delete process.env.TOKEN_ENCRYPTION_KEY;
const app = require(path.join(root, 'app'));
const { db } = require(path.join(root, 'config/database'));
const orgs = require(path.join(root, 'services/orgService'));
const auth = require(path.join(root, 'services/authService'));
const mail = require(path.join(root, 'services/emailService'));
const google = require(path.join(root, 'config/googleEmail'));
const scheduler = require(path.join(root, 'services/emailScheduler'));
const policy = require(path.join(root, 'services/paymentPolicy'));
const { OAuth2Client } = require(path.join(root, 'node_modules/google-auth-library'));
const originalRequest = OAuth2Client.prototype.request;
const sent = [];
OAuth2Client.prototype.request = async function (request) {
  if (request.method === 'POST' && request.url.endsWith('/messages/send')) {
    sent.push(Buffer.from(request.data.raw, 'base64url').toString());
    await new Promise(resolve => setTimeout(resolve, 10));
    return { data: { id: 'synthetic-' + sent.length, threadId: 'synthetic' } };
  }
  if (request.url.includes('/messages/')) return { data: { payload: { headers: [] } } };
  throw new Error('Pedido externo não previsto pelo diagnóstico');
};
let server;
const passed = [];
const report = name => { passed.push(name); console.log('CORREÇÃO VALIDADA: ' + name); };
async function main() {
  const org = orgs.createOrganization('Revisão sintética');
  const user = auth.createUser({ name: 'Auditor', email: 'audit@example.invalid', password: 'Synthetic123!' });
  orgs.createMembership({ organizationId: org.id, userId: user.id, role: 'owner' });
  const session = auth.createSession(user.id, org.id).sessionId;
  db.prepare(`INSERT INTO accommodations(id,organization_id,name,type,price_per_night,max_guests,checkin_time,city,email_social_links,social_tripadvisor)
    VALUES('unit',?,'Casa sintética','alojamento',100,2,'18:30','Localidade sintética','[]','https://example.invalid/tripadvisor')`).run(org.id);
  db.prepare("INSERT INTO guests(id,organization_id,name,email) VALUES('guest',?,'Hóspede sintético','guest@example.invalid')").run(org.id);
  db.prepare(`INSERT INTO reservations(id,organization_id,guest_id,accommodation_id,check_in,check_out,nights,num_guests,total_amount,status)
    VALUES('booking',?,'guest','unit','2035-06-01','2035-06-03',2,1,200,'confirmada')`).run(org.id);
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const headers = { Cookie: auth.SESSION_COOKIE + '=' + session, 'Content-Type': 'application/json' };
  const post = (url, body, signed = true) => fetch(base + url, { method: 'POST', headers: signed ? headers : { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  let response = await post('/auth/email/send', { to: 'guest@example.invalid', subject: 'Sintético', html: '<p>Teste</p>' });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).success, false);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM invoice_messages').get().n, 0);
  assert.equal(sent.length, 0);
  report('V1-07: sem Gmail ligado a mensagem não aparece como enviada');

  policy.savePolicy(org.id, { ...structuredClone(policy.DEFAULT_POLICY), enabled: true });
  policy.attachPolicy(db.prepare("SELECT * FROM reservations WHERE id='booking'").get());
  // Como na criação: o estado acerta-se com o sinal pelo ledger.
  require('../services/financialLedger').recompute('booking', org.id);
  db.prepare("UPDATE memberships SET role='staff' WHERE user_id=?").run(user.id);
  response = await fetch(base + '/api/reservations/booking', { method: 'DELETE', headers });
  assert.equal(response.status, 403);
  response = await fetch(base + '/api/reservations/booking', { headers });
  const exposed = (await response.json()).data;
  assert.equal(exposed.public_token, undefined);
  assert.equal(exposed.precheckin_token, undefined);
  for (const url of ['/api/reservations', '/api/guests/guest']) {
    const body = await (await fetch(base + url, { headers })).json();
    assert.doesNotMatch(JSON.stringify(body), /"(?:public_token|precheckin_token)"/);
  }
  assert.equal(db.prepare("SELECT status FROM reservations WHERE id='booking'").get().status, 'aguardar_pagamento');
  report('V1-01: detalhe, listas e reservas do hóspede ocultam os tokens a staff');

  db.prepare("UPDATE memberships SET role='owner' WHERE user_id=?").run(user.id);
  google.saveEmailTokens(org.id, { access_token: 'synthetic-only' }, 'sender@example.invalid');
  response = await post('/auth/email/send', { to: 'guest@example.invalid\r\nBcc: injected@example.invalid', subject: 'Sintético', html: '<p>Teste</p>' });
  assert.equal(response.status, 400);
  assert.equal(sent.length, 0);
  report('V1-06 (S02): CRLF no destinatário é recusado antes do transporte');

  db.prepare("UPDATE reservations SET status='confirmada',payment_policy_json=NULL,policy_cancellation_json=NULL WHERE id='booking'").run();
  db.prepare('UPDATE organization_email_templates SET active=0 WHERE organization_id=?').run(org.id);
  db.prepare(`UPDATE organization_email_templates SET active=1,timing_event='manual',window_start=NULL,window_end=NULL,
    subject='Sintético',body='<p>Mensagem sintética</p>' WHERE organization_id=? AND slug='confirmacao'`).run(org.id);
  const guest = db.prepare("SELECT * FROM guests WHERE id='guest'").get();
  const accom = db.prepare("SELECT * FROM accommodations WHERE id='unit'").get();
  let reservation = db.prepare("SELECT * FROM reservations WHERE id='booking'").get();
  const before = sent.length;
  await Promise.all([mail.sendTemplatedEmail('confirmacao', guest, reservation, accom), mail.sendTemplatedEmail('confirmacao', guest, reservation, accom)]);
  assert.equal(sent.length - before, 1);
  report('V1-08 (M02): pedidos simultâneos ao mesmo modelo/reserva enviam uma só mensagem');

  const yesterday = policy.localDay(new Date(Date.now() - 86400000));
  db.prepare("UPDATE reservations SET check_in=? WHERE id='booking'").run(yesterday);
  db.prepare(`UPDATE organization_email_templates SET timing_event='checkin',timing_offset=0,timing_direction='before',
    body='<p>Hora: {{hora_checkin}}; cidade: {{localidade}}</p>{{acompanhe_nos}}' WHERE organization_id=? AND slug='confirmacao'`).run(org.id);
  reservation = db.prepare("SELECT * FROM reservations WHERE id='booking'").get();
  await mail.sendTemplatedEmail('confirmacao', guest, reservation, accom);
  const html = raw => Buffer.from(raw.split('\r\n\r\n')[1], 'base64').toString();
  const manualHtml = html(sent.at(-1));
  assert.match(manualHtml, /18:30/);
  assert.match(manualHtml, /Localidade sintética/);
  assert.doesNotMatch(manualHtml, /facebook\.com/);
  db.prepare('DELETE FROM organization_email_log WHERE organization_id=?').run(org.id);
  db.prepare('DELETE FROM email_deliveries WHERE organization_id=?').run(org.id);
  const schedulerBefore=sent.length;
  await scheduler.runScheduler();
  assert.equal(sent.length, schedulerBefore+1);
  const scheduledHtml = html(sent.at(-1));
  assert.match(scheduledHtml, /18:30/);
  assert.match(scheduledHtml, /Localidade sintética/);
  assert.doesNotMatch(scheduledHtml, /facebook\.com/);
  report('V1-09 (M03): envio agendado usa hora, localidade e redes do alojamento como o envio direto');

  db.prepare('UPDATE organization_email_templates SET active=0 WHERE organization_id=?').run(org.id);
  db.prepare(`UPDATE organization_email_templates SET active=1,timing_event='manual',window_start=NULL,window_end=NULL,
    body='<p>Cancelada</p>' WHERE organization_id=? AND slug='cancelamento'`).run(org.id);
  // Um envio de cancelamento que ficou à espera na fila (ex.: fora da janela)
  // e a reserva foi reativada entretanto: ao sair da fila já não se aplica.
  const events = require(path.join(root, 'services/reservationEvents'));
  events.emit('email.due', { organizationId: org.id, reservationId: 'booking', payload: { slug: 'cancelamento' } });
  const beforeStale = sent.length;
  await events.dispatchPending();
  assert.equal(sent.length - beforeStale, 0);
  assert.equal(db.prepare("SELECT status FROM reservations WHERE id='booking'").get().status, 'confirmada');
  report('V1-10 (M04): a fila não envia cancelamento de uma reserva reativada');

  const eligibility = require(path.join(root, 'services/emailEligibility'));
  const unpaid = { ...reservation, amount_paid: 0, total_amount: 200 };
  assert.equal(eligibility.canSendTemplate({ slug: 'codigo_porta', body: '{{codigo_porta}}' }, unpaid), false);
  assert.throws(() => mail.renderManualEmail({ organizationId: org.id, subject: 'Porta', body: '{{codigo_porta}}',
    context: { guest, reservation: unpaid, accommodation: { ...accom, door_code: 'SYNTHETIC-DOOR' } } }), /integralmente paga/);

  report('V1-11 (M05): composição manual aplica a mesma regra do código de porta');

  db.prepare("UPDATE guests SET is_vip=1,is_favorite=1,is_unwanted=1 WHERE id='guest'").run();
  response = await fetch(base + '/api/guests/guest', { method: 'PUT', headers, body: JSON.stringify({ phone: '000000000' }) });
  assert.equal(response.status, 200);
  const updated = (await response.json()).data;
  assert.equal(updated.is_vip + updated.is_favorite + updated.is_unwanted, 3);
  report('V1-12 (D01): editar só o telefone conserva VIP/favorito/indesejado');

  response = await post('/api/expenses', { date: 'data-invalida', description: 'Sintético', amount: '12euros' });
  assert.equal(response.status, 400);

  report('V1-13 (D02): despesas recusam datas inválidas e valores como 12euros');

  db.prepare("UPDATE accommodations SET public_slug='synthetic-house',max_guests=4 WHERE id='unit'").run();
  db.prepare(`INSERT INTO accommodations(id,organization_id,name,type,parent_id,price_per_night,max_guests)
    VALUES('child1',?,'Quarto 1','suite','unit',50,2),('child2',?,'Quarto 2','suite','unit',50,2)`).run(org.id, org.id);
  response = await fetch(base + '/api/public/booking/synthetic-house/availability?check_in=2036-01-01&check_out=2036-01-03&num_guests=4');
  assert.equal(response.status, 200);
  const availability = (await response.json()).data[0];
  assert.equal(availability.available, true);
  assert.equal(availability.max_guests, 4);
  report('V1-14 (D03): casa de 4 pessoas aceita 4 hóspedes na disponibilidade pública');

  assert.equal(require(path.join(root, 'services/reservationRules')).getPaymentStatus(0.3, 0.1 + 0.2), 'confirmado');
  report('V1-15 (D04): 0,30 pago de 0,1 + 0,2 conta como pagamento completo');
  console.log(JSON.stringify({ validated: passed.length, externalRequests: 0 }));
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  OAuth2Client.prototype.request = originalRequest;
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  db.close(); process.chdir(previous); fs.rmSync(temp, { recursive: true, force: true });
});
