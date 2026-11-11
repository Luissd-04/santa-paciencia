// Suporte: lógica de pedidos e mensagens (estados, não lidas, listas, resumo,
// avisos e contagem na consola). Chama o serviço diretamente, com SQLite em
// memória e o push e o email substituídos.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-support-service-'));
const previous = process.cwd();
process.chdir(temp);
Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test', EMAIL_ENABLED: 'false', PUBLIC_APP_URL: 'https://app.example.invalid', PLATFORM_ADMIN_EMAILS: 'dona-instancia@example.invalid' });
const { db, initDatabase } = require('../config/database');
initDatabase();
const support = require('../services/supportService');
const platform = require('../services/platformService');
const auth = require('../services/authService');
const orgs = require('../services/orgService');
const pushService = require('../services/pushService');
const emailService = require('../services/emailService');
const opsStatusModule = require('../services/opsStatus');
const attachments = require('../services/supportAttachments');
after(() => { db.close(); process.chdir(previous); fs.rmSync(temp, { recursive: true, force: true }); });

const PASSWORD = 'SyntheticSupport123!';
const orgA = orgs.createOrganization('Casa A');
const orgB = orgs.createOrganization('Casa B');
let seq = 0;
function person(org, role, email = `p${++seq}@example.invalid`, name = `Pessoa ${seq}`) {
  const user = auth.createUser({ name, email, password: PASSWORD });
  orgs.createMembership({ organizationId: org.id, userId: user.id, role });
  return { ...user, email, role, organization_id: org.id };
}
const ownerA = person(orgA, 'owner', 'dono-a@example.invalid', 'Dono A');
const managerA = person(orgA, 'manager');
const staffA = person(orgA, 'staff', 'staff-a@example.invalid', 'Staff A');
const staffA2 = person(orgA, 'staff');
const ownerB = person(orgB, 'owner');
const ADMIN_NAME = 'Nome Secreto Do Admin';
const admin = person(orgB, 'owner', 'dona-instancia@example.invalid', ADMIN_NAME);
db.prepare('UPDATE users SET platform_admin = 1 WHERE id = ?').run(admin.id);
// Um utilizador com a marca mas fora de PLATFORM_ADMIN_EMAILS não recebe avisos.
const fakeAdmin = person(orgB, 'owner', 'falso@example.invalid');
db.prepare('UPDATE users SET platform_admin = 1 WHERE id = ?').run(fakeAdmin.id);

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const CONTEXT = { page: '/reservas', app_build: 'abc123', display_mode: 'standalone', viewport: '390×844', ip: '203.0.113.9', extra: 'x' };

const pushes = [];
const mails = [];
pushService.sendToOrganization = async (orgId, payload, options) => { pushes.push({ orgId, payload, options }); return { sent: 0 }; };
emailService.sendMail = async (orgId, mail) => { mails.push({ orgId, mail }); return { id: 'm' }; };
const settle = async () => { await support.flushNotifications(); };
const reset = () => { pushes.length = 0; mails.length = 0; };
const status400 = fn => assert.throws(fn, err => err.status === 400 && /[a-zà-ú]/i.test(err.message));
const newTicket = (user = staffA, extra = {}) => support.create(user, { type: 'problem', subject: 'Não envia emails', body: 'Descrição do problema.', ...extra }, { userAgent: UA, ip: '203.0.113.9' });

test('criar com contexto: chaves certas, user agent no servidor e nunca o IP', async () => {
  reset();
  const t = await newTicket(staffA, { context: CONTEXT });
  assert.match(t.number, /^SP-\d{4}$/);
  assert.equal(t.status, 'open');
  assert.equal(t.unread, false);
  assert.deepEqual(t.author, { name: 'Staff A' });
  assert.equal(t.customer_confirmed_at, null);
  const row = db.prepare('SELECT context_json FROM support_tickets WHERE id = ?').get(t.id);
  const context = JSON.parse(row.context_json);
  assert.deepEqual(Object.keys(context), ['page', 'app_build', 'browser', 'os', 'device', 'display_mode', 'viewport']);
  assert.deepEqual(context, { page: '/reservas', app_build: 'abc123', browser: 'Safari', os: 'iOS', device: 'mobile', display_mode: 'standalone', viewport: '390×844' });
  assert.ok(!row.context_json.includes('203.0.113'));
  assert.deepEqual(support.getForUser(staffA, t.id).context, context);
  // viewport numérico e strings longas cortadas a 100.
  const t2 = await newTicket(staffA, { context: { viewport: 1440, page: 'x'.repeat(300) } });
  const c2 = support.getForUser(staffA, t2.id).context;
  assert.equal(c2.viewport, '1440');
  assert.equal(c2.page.length, 100);
  await settle();
});

test('criar sem contexto grava null e não acrescenta o user agent', () => {
  const t = newTicket(staffA);
  assert.equal(db.prepare('SELECT context_json FROM support_tickets WHERE id = ?').get(t.id).context_json, null);
  assert.equal(support.getForUser(staffA, t.id).context, null);
  assert.throws(() => newTicket(staffA, { context: 'texto' }), { status: 400 });
});

test('criar com anexo: url do cliente e da plataforma, mensagem inicial', () => {
  const t = newTicket(staffA, { attachments: [{ name: 'captura.png', data_base64: PNG.toString('base64') }] });
  const customer = support.getForUser(staffA, t.id);
  assert.equal(customer.messages.length, 1);
  const [file] = customer.messages[0].attachments;
  assert.deepEqual({ ...file, id: 'x', url: 'x' }, { id: 'x', name: 'captura.png', size: PNG.length, mime: 'image/png', url: 'x' });
  assert.equal(file.url, `/api/support/attachments/${file.id}`);
  assert.equal(customer.messages[0].side, 'customer');
  assert.equal(customer.messages[0].author_name, 'Staff A');
  assert.equal(support.getForPlatform(t.id).messages[0].attachments[0].url, `/api/platform/support/attachments/${file.id}`);
  assert.ok(attachments.findAttachment(file.id));
});

test('numeração seguida e única; anexo inválido não deixa nada', () => {
  const a = newTicket(staffA);
  const b = newTicket(ownerB);
  const nums = db.prepare('SELECT number FROM support_tickets ORDER BY number').all().map(r => r.number);
  assert.equal(new Set(nums).size, nums.length);
  assert.deepEqual(nums, nums.map((_, i) => i + 1));
  assert.equal(Number(b.number.slice(3)), Number(a.number.slice(3)) + 1);
  const count = db.prepare('SELECT COUNT(*) AS n FROM support_tickets').get().n;
  const files = () => (fs.existsSync(attachments.SUPPORT_DIR) ? fs.readdirSync(attachments.SUPPORT_DIR).length : 0);
  const before = files();
  status400(() => newTicket(staffA, { attachments: [{ name: 'a.png', data_base64: PNG.toString('base64') }, { name: 'f.png', data_base64: Buffer.from('texto').toString('base64') }] }));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM support_tickets').get().n, count);
  assert.equal(files(), before);
});

test('validações 400/404/409', () => {
  status400(() => support.create(staffA, { type: 'x', subject: 'Assunto ok', body: 'a' }));
  status400(() => support.create(staffA, { type: 'problem', subject: ' ab ', body: 'a' }));
  status400(() => support.create(staffA, { type: 'problem', subject: 'x'.repeat(121), body: 'a' }));
  status400(() => support.create(staffA, { type: 'problem', subject: 'Assunto ok', body: '   ' }));
  status400(() => support.create(staffA, { type: 'problem', subject: 'Assunto ok', body: 'a'.repeat(5001) }));
  support.create(staffA, { type: 'question', subject: 'x'.repeat(120), body: 'a'.repeat(5000) }, {});
  const t = newTicket(staffA);
  status400(() => support.addCustomerMessage(staffA, t.id, { body: '' }));
  status400(() => support.feedback(staffA, t.id, 'sim'));
  status400(() => support.addPlatformMessage(admin, t.id, { body: 'ok', status: 'fechado' }));
  status400(() => support.setStatus(admin, t.id, 'fechado'));
  status400(() => support.listForUser(staffA, { status: 'lixo' }));
  status400(() => support.listForPlatform({ type: 'lixo' }));
  assert.throws(() => support.getForUser(staffA, 'nao-existe'), { status: 404 });
  assert.throws(() => support.addCustomerMessage(staffA, 'nao-existe', { body: 'a' }), { status: 404 });
  assert.throws(() => support.getForPlatform('nao-existe'), { status: 404 });
  assert.throws(() => support.addPlatformMessage(admin, 'nao-existe', { body: 'a' }), { status: 404 });
  assert.throws(() => support.setStatus(admin, 'nao-existe', 'open'), { status: 404 });
  assert.throws(() => support.feedback(staffA, t.id, true), { status: 409 });
  assert.throws(() => support.getForUser(ownerB, t.id), { status: 404 });
  assert.throws(() => support.getForUser(staffA2, t.id), { status: 404 });
});

test('visibilidade: staff só os seus; owner e manager todos da organização; nunca de outra', () => {
  const mine = newTicket(staffA);
  const other = newTicket(staffA2);
  const foreign = newTicket(ownerB);
  const ids = u => support.listForUser(u, {}).tickets.map(t => t.id);
  assert.ok(ids(staffA).includes(mine.id) && !ids(staffA).includes(other.id));
  for (const u of [ownerA, managerA]) assert.ok(ids(u).includes(mine.id) && ids(u).includes(other.id) && !ids(u).includes(foreign.id));
  assert.ok(!ids(ownerB).includes(mine.id));
  assert.equal(support.getForUser(ownerA, other.id).ticket.id, other.id);
  assert.equal(support.listForUser(ownerA, {}).counts.all, support.listForUser(managerA, {}).counts.all);
});

test('estados: mensagem do cliente reabre; feedback sim e não', async () => {
  const t = newTicket(staffA);
  await settle();
  reset();
  assert.equal(support.setStatus(admin, t.id, 'needs_customer').status, 'needs_customer');
  const reply = support.addCustomerMessage(staffA, t.id, { body: 'Aqui vai a informação.' });
  assert.equal(reply.side, 'customer');
  assert.equal(support.getForUser(staffA, t.id).ticket.status, 'open');
  // Resolvido e confirmado; nova mensagem reabre e apaga a confirmação.
  support.setStatus(admin, t.id, 'resolved');
  assert.equal(support.feedback(staffA, t.id, true).customer_confirmed_at !== null, true);
  support.addCustomerMessage(staffA, t.id, { body: 'Afinal voltou.' });
  const reopened = support.getForUser(staffA, t.id).ticket;
  assert.equal(reopened.status, 'open');
  assert.equal(reopened.customer_confirmed_at, null);
  // «Ainda não»: reabre e regista a mensagem.
  support.setStatus(admin, t.id, 'resolved');
  const after = support.feedback(staffA, t.id, false);
  assert.equal(after.status, 'open');
  const messages = support.getForUser(staffA, t.id).messages;
  assert.equal(messages.at(-1).body, 'O problema continua.');
  assert.equal(messages.at(-1).side, 'customer');
  // in_review não muda com uma mensagem do cliente.
  support.setStatus(admin, t.id, 'in_review');
  support.addCustomerMessage(staffA, t.id, { body: 'Mais um detalhe.' });
  assert.equal(support.getForUser(staffA, t.id).ticket.status, 'in_review');
  // setStatus tira a confirmação se deixar de estar resolvido.
  support.setStatus(admin, t.id, 'resolved');
  support.feedback(staffA, t.id, true);
  support.setStatus(admin, t.id, 'open');
  assert.equal(support.getForUser(staffA, t.id).ticket.customer_confirmed_at, null);
  await settle();
});

test('resposta da plataforma: nome da equipa, estado opcional, anexo com url da plataforma', async () => {
  const t = newTicket(staffA);
  await settle();
  const m = support.addPlatformMessage(admin, t.id, { body: 'Pode enviar uma captura?', status: 'needs_customer',
    attachments: [{ name: 'guia.pdf', data_base64: Buffer.from('%PDF-1.4\n%%EOF\n').toString('base64') }] });
  assert.equal(m.side, 'platform');
  assert.equal(m.author_name, 'Equipa Santa Paciência');
  assert.match(m.attachments[0].url, /^\/api\/platform\/support\/attachments\//);
  const view = support.getForUser(staffA, t.id);
  assert.equal(view.ticket.status, 'needs_customer');
  assert.equal(view.messages.at(-1).author_name, 'Equipa Santa Paciência');
  assert.match(view.messages.at(-1).attachments[0].url, /^\/api\/support\/attachments\//);
  assert.ok(!JSON.stringify(view).includes(ADMIN_NAME));
  assert.ok(!JSON.stringify(support.getForPlatform(t.id)).includes(ADMIN_NAME));
  await settle();
});

test('não lidas, lado do cliente: por utilizador, marca ao abrir', async () => {
  const t = newTicket(staffA);
  assert.equal(support.listForUser(staffA, {}).tickets.find(x => x.id === t.id).unread, false);
  support.addPlatformMessage(admin, t.id, { body: 'Olá!' });
  const unreadOf = u => support.listForUser(u, {}).tickets.find(x => x.id === t.id).unread;
  assert.equal(unreadOf(staffA), true);
  assert.equal(unreadOf(ownerA), true);
  assert.equal(support.summary(staffA).unread, 1);
  assert.equal(support.getForUser(staffA, t.id).ticket.unread, false);
  assert.equal(unreadOf(staffA), false);
  assert.equal(unreadOf(ownerA), true);
  assert.equal(support.summary(staffA).unread, 0);
  support.addPlatformMessage(admin, t.id, { body: 'Mais uma.' });
  assert.equal(unreadOf(staffA), true);
  await settle();
});

test('não lidas, lado da plataforma: mensagem do cliente acende, abrir apaga, responder também', async () => {
  const t = newTicket(staffA);
  const unreadOf = () => support.listForPlatform({}).tickets.find(x => x.id === t.id).unread;
  assert.equal(unreadOf(), true);
  assert.equal(support.getForPlatform(t.id).ticket.unread, false);
  assert.equal(unreadOf(), false);
  support.addCustomerMessage(staffA, t.id, { body: 'Ainda aí?' });
  assert.equal(unreadOf(), true);
  support.addPlatformMessage(admin, t.id, { body: 'Sim.' });
  assert.equal(unreadOf(), false);
  await settle();
});

test('listas: filtros, ordenação e counts', async () => {
  // Estado conhecido para a organização B (isolada nas contagens).
  db.prepare('DELETE FROM support_tickets').run();
  const a = newTicket(ownerB); const b = newTicket(ownerB, { type: 'question', subject: 'Como configuro o IVA?' });
  const c = newTicket(ownerB, { type: 'improvement', subject: 'Ideia de relatório' });
  const d = newTicket(staffA); const e = newTicket(ownerB);
  support.setStatus(admin, b.id, 'in_review'); support.setStatus(admin, c.id, 'needs_customer'); support.setStatus(admin, d.id, 'resolved');
  const mine = support.listForUser(ownerB, {});
  assert.deepEqual(mine.counts, { all: 4, open: 3, in_review: 1, resolved: 0 });
  assert.deepEqual(support.listForUser(ownerB, { status: 'open' }).tickets.map(t => t.id).sort(), [a.id, c.id, e.id].sort());
  assert.deepEqual(support.listForUser(ownerB, { status: 'in_review' }).tickets.map(t => t.id), [b.id]);
  assert.equal(support.listForUser(ownerB, { status: 'resolved' }).tickets.length, 0);
  const sorted = mine.tickets.map(t => t.last_message_at);
  assert.deepEqual(sorted, [...sorted].sort().reverse());

  const all = support.listForPlatform({});
  assert.deepEqual(all.counts, { all: 5, open: 2, in_review: 1, needs_customer: 1, resolved: 1 });
  assert.deepEqual(all.tickets.find(t => t.id === d.id).organization, { id: orgA.id, name: 'Casa A' });
  assert.deepEqual(support.listForPlatform({ status: 'needs_customer' }).tickets.map(t => t.id), [c.id]);
  assert.deepEqual(support.listForPlatform({ type: 'question' }).tickets.map(t => t.id), [b.id]);
  assert.deepEqual(support.listForPlatform({ q: 'iva' }).tickets.map(t => t.id), [b.id]);
  assert.deepEqual(support.listForPlatform({ q: b.number }).tickets.map(t => t.id), [b.id]);
  assert.deepEqual(support.listForPlatform({ q: String(Number(b.number.slice(3))) }).tickets.map(t => t.id).includes(b.id), true);
  assert.equal(support.listForPlatform({ q: '%' }).tickets.length, 0);
  const byOrg = support.listForPlatform({ organization_id: orgA.id });
  assert.deepEqual(byOrg.tickets.map(t => t.id), [d.id]);
  assert.deepEqual(byOrg.counts, { all: 1, open: 0, in_review: 0, needs_customer: 0, resolved: 1 });
  // A consola conta os não resolvidos.
  assert.equal(platform.getOverview().open_requests, 4);
  assert.equal(platform.getOrganization(orgB.id).open_requests, 4);
  assert.equal(platform.getOrganization(orgA.id).open_requests, 0);
  const row = id => platform.listOrganizations().find(o => o.id === id).open_requests;
  assert.equal(row(orgB.id), 4);
  assert.equal(row(orgA.id), 0);
  await settle();
});

test('summary: não lidas, precisa de si e incidentes só da organização, em linguagem simples', async () => {
  db.prepare('DELETE FROM support_tickets').run();
  const t = newTicket(staffA);
  support.setStatus(admin, t.id, 'needs_customer');
  assert.deepEqual(support.summary(staffA), { unread: 0, needs_customer: 1, incidents: [] });
  assert.equal(support.summary(staffA2).needs_customer, 0);
  assert.equal(support.summary(ownerA).needs_customer, 1);

  const real = opsStatusModule.opsStatus;
  opsStatusModule.opsStatus = () => ({
    email: { failed: 2, deliveries_needing_decision: 1 }, payments: { stripe_stuck_over_1h: 1, cancellations_manual_review: 1 },
    tasks: [{ name: 'backup', label: 'Cópia', last_error_at: '2026-01-02', last_ok_at: null, last_error: 'x' }],
  });
  db.prepare("INSERT INTO ops_alerts (organization_id, key, notified_at) VALUES (?, 'effects_failed', '2026-11-10 09:30:00')").run(orgA.id);
  try {
    const { incidents } = support.summary(ownerA);
    assert.deepEqual(incidents.map(i => i.provider), ['Gmail', 'Stripe']);
    assert.equal(incidents[0].since, '2026-11-10T09:30:00.000Z');
    assert.equal(incidents[1].since, null);
    assert.match(incidents[0].detail, /Gmail/);
    assert.deepEqual(Object.keys(incidents[0]), ['provider', 'title', 'detail', 'since']);
    assert.ok(!JSON.stringify(incidents).includes('backup'));
    // Revisão de cancelamentos e emails por decidir são trabalho do proprietário.
    assert.ok(!incidents.some(i => i.provider === 'Pagamentos' || /decidir|cancelamentos/i.test(i.detail)));
    // Se o cálculo falhar, lista vazia.
    opsStatusModule.opsStatus = () => { throw new Error('boom'); };
    const log = console.error; console.error = () => {};
    try { assert.deepEqual(support.summary(ownerA).incidents, []); } finally { console.error = log; }
  } finally { opsStatusModule.opsStatus = real; }
});

test('avisos: pedido novo e mensagem do cliente vão para a plataforma; resposta vai para o cliente', async () => {
  db.prepare('DELETE FROM support_tickets').run();
  await settle(); reset();
  const t = newTicket(staffA, { subject: 'Assunto sensível', body: 'CORPO-SECRETO-1' });
  await settle();
  // Só o admin verdadeiro, na organização onde é membro, com o URL do pedido.
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].orgId, orgB.id);
  assert.deepEqual(pushes[0].options, { userIds: [admin.id] });
  assert.equal(pushes[0].payload.url, `/plataforma/suporte/${t.id}`);
  assert.match(pushes[0].payload.title, new RegExp(t.number));
  assert.equal(pushes[0].payload.body, 'Assunto sensível');
  assert.equal(mails.length, 1);
  assert.equal(mails[0].mail.to, 'dona-instancia@example.invalid');
  assert.equal(mails[0].orgId, orgB.id);
  assert.match(mails[0].mail.html, /Abrir pedido/);
  assert.ok(mails[0].mail.html.includes(`https://app.example.invalid/plataforma/suporte/${t.id}`));
  assert.match(mails[0].mail.html, /Assunto sensível/);
  assert.ok(!mails[0].mail.html.includes('CORPO-SECRETO-1'));
  assert.ok(!JSON.stringify(pushes).includes('CORPO-SECRETO-1'));

  reset();
  support.addCustomerMessage(staffA, t.id, { body: 'CORPO-SECRETO-2' });
  await settle();
  assert.equal(pushes.length, 1);
  assert.equal(mails.length, 1);
  assert.ok(!JSON.stringify(mails).includes('CORPO-SECRETO-2'));

  reset();
  support.addPlatformMessage(admin, t.id, { body: 'CORPO-SECRETO-3' });
  await settle();
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].orgId, orgA.id);
  assert.deepEqual(new Set(pushes[0].options.userIds), new Set([staffA.id, ownerA.id, managerA.id]));
  assert.equal(pushes[0].payload.url, `/ajuda?pedido=${t.id}`);
  assert.equal(mails.length, 1);
  assert.equal(mails[0].orgId, orgA.id);
  assert.equal(mails[0].mail.to, 'staff-a@example.invalid');
  assert.ok(mails[0].mail.html.includes(`https://app.example.invalid/ajuda?pedido=${t.id}`));
  assert.ok(!JSON.stringify([pushes, mails]).includes(ADMIN_NAME));
  assert.ok(!JSON.stringify([pushes, mails]).includes('CORPO-SECRETO-3'));
});

test('avisos nunca falham o pedido: push e email a lançar erro, log em JSON; sem Gmail, ignora', async () => {
  await settle();
  const realPush = pushService.sendToOrganization;
  const realMail = emailService.sendMail;
  const logs = [];
  const log = console.error; console.error = line => logs.push(line);
  try {
    pushService.sendToOrganization = async () => { throw new Error('push em baixo'); };
    emailService.sendMail = async () => { throw new Error('gmail em baixo'); };
    const t = newTicket(staffA);
    support.addCustomerMessage(staffA, t.id, { body: 'a' });
    support.addPlatformMessage(admin, t.id, { body: 'b' });
    await settle();
    const events = logs.map(l => JSON.parse(l));
    assert.ok(events.length >= 4);
    assert.ok(events.every(e => e.level === 'warn' && e.event === 'support_notify_failed'));
    // Sem Gmail (sendMail devolve null): tenta, não rebenta, não regista erro.
    logs.length = 0;
    emailService.sendMail = async () => null;
    pushService.sendToOrganization = realPush;
    newTicket(staffA);
    await settle();
    assert.deepEqual(logs, []);
  } finally { console.error = log; pushService.sendToOrganization = realPush; emailService.sendMail = realMail; }
});
