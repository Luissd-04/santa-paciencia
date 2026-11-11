// Alertas do sistema: o que conta como problema, avisar uma vez (e de novo ao
// fim de 24 h ou depois de resolvido), push só para proprietário e gestores e
// email com o detalhe. Os problemas da instância e os pedidos de suporte sem
// resposta vão só para os admins da plataforma.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-ops-alerts-'));
const originalCwd = process.cwd();
process.chdir(temp);
Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test', PUBLIC_APP_URL: 'https://exemplo.invalid', PLATFORM_ADMIN_EMAILS: 'instancia@example.invalid' });
delete process.env.EMAIL_ENABLED;
const { db, initDatabase } = require('../config/database');
initDatabase();
const emailService = require('../services/emailService');
const mails = [];
emailService.sendMail = async (org, message) => { mails.push({ org, ...message }); return { id: 'm' }; };
const pushService = require('../services/pushService');
const pushes = [];
const realSend = pushService.sendToOrganization;
pushService.sendToOrganization = async (org, payload, options) => { pushes.push({ org, payload, options }); return { sent: 1 }; };
const opsStatus = require('../services/opsStatus');
const alerts = require('../services/opsAlerts');
const orgs = require('../services/orgService');
const auth = require('../services/authService');
const org = orgs.createOrganization('Alertas');
const owner = auth.createUser({ name: 'Dona', email: 'dona@example.invalid', password: 'SyntheticAlert123!' });
orgs.createMembership({ organizationId: org.id, userId: owner.id, role: 'owner' });
after(() => { db.close(); process.chdir(originalCwd); fs.rmSync(temp, { recursive: true, force: true }); });

const hoursAgo = h => new Date(Date.now() - h * 3600e3).toISOString().replace('T', ' ').slice(0, 19);
const quiet = { email: { deliveries_needing_decision: 0, failed: 0 }, google: {}, payments: {}, tasks: [], storage: {} };

test('problemas: só o que precisa de atenção, com o tempo de espera certo', () => {
  assert.deepEqual(alerts.problems(quiet), []);
  const keys = alerts.problems({
    email: { deliveries_needing_decision: 2, failed: 1 },
    google: { calendar_queue: { pending: 3, failing: 1, oldest: hoursAgo(2) }, tasks_cleanup_queue: { n: 1, oldest: hoursAgo(1) } },
    payments: { stripe_stuck_over_1h: 1, cancellations_manual_review: 0 },
    tasks: [{ name: 'email', label: 'Emails', last_error_at: '2026-11-03T10:00:00Z', last_ok_at: '2026-11-03T09:00:00Z', last_error: 'Gmail' },
      { name: 'maintenance', label: 'Manutenção', last_error_at: '2026-11-03T08:00:00Z', last_ok_at: '2026-11-03T09:00:00Z' }],
    storage: { disk: { free_bytes: 5, total_bytes: 100 } },
  }).map(p => p.key);
  // Tasks só ao fim de 6 h; a manutenção já recuperou.
  assert.deepEqual(keys, ['email_decision', 'effects_failed', 'calendar_queue', 'stripe_stuck', 'task_email', 'disk_low']);
});

test('avisa uma vez por push (proprietário e gestores) e email; repete ao fim de 24 h ou se voltar', async () => {
  let status = { ...quiet, email: { deliveries_needing_decision: 1, failed: 0 } };
  opsStatus.opsStatus = () => status;
  mails.length = 0; pushes.length = 0;

  assert.equal((await alerts.checkOrganization(org.id)).length, 1);
  assert.equal(pushes.length, 1);
  assert.deepEqual(pushes[0].options.roles, ['owner', 'manager']);
  assert.equal(pushes[0].options.type, 'ops_alert');
  assert.equal(pushes[0].payload.title, 'Alerta: Emails por decidir');
  assert.equal(mails.length, 1);
  assert.equal(mails[0].to, 'dona@example.invalid');
  assert.match(mails[0].subject, /^Alerta: Emails por decidir/);
  assert.ok(mails[0].html.includes('envio incerto'));

  // Na passagem seguinte, o mesmo problema não volta a avisar.
  assert.equal((await alerts.checkOrganization(org.id)).length, 0);
  assert.equal(pushes.length, 1);

  // 24 h depois, ainda por resolver: avisa outra vez.
  db.prepare("UPDATE ops_alerts SET notified_at = ? WHERE organization_id = ?").run(new Date(Date.now() - 25 * 3600e3).toISOString(), org.id);
  assert.equal((await alerts.checkOrganization(org.id)).length, 1);

  // Resolvido e de volta: avisa logo.
  status = quiet;
  assert.equal((await alerts.checkOrganization(org.id)).length, 0);
  assert.ok(db.prepare('SELECT resolved_at FROM ops_alerts WHERE organization_id = ?').get(org.id).resolved_at);
  status = { ...quiet, email: { deliveries_needing_decision: 3, failed: 0 } };
  assert.equal((await alerts.checkOrganization(org.id)).length, 1);
  assert.equal(pushes.length, 3);
});

// Admin da plataforma, membro da sua própria organização (é por ela que recebe push e email).
const adminOrg = orgs.createOrganization('Instância');
const admin = auth.createUser({ name: 'Dono', email: 'instancia@example.invalid', password: 'SyntheticAlert123!' });
orgs.createMembership({ organizationId: adminOrg.id, userId: admin.id, role: 'owner' });
db.prepare('UPDATE users SET platform_admin = 1 WHERE id = ?').run(admin.id);
const failing = [{ name: 'email', label: 'Emails pela estadia', last_error_at: '2026-11-03T10:00:00Z', last_ok_at: null, last_error: 'Gmail em baixo' }];
const toAdmin = list => list.filter(p => p.options?.userIds?.includes(admin.id));

test('problemas da instância: não vão às organizações; vão uma vez aos admins da plataforma', async () => {
  let status = { ...quiet, email: { deliveries_needing_decision: 1, failed: 0 }, tasks: failing, storage: { disk: { free_bytes: 5, total_bytes: 100 } } };
  opsStatus.opsStatus = () => status;
  db.prepare('DELETE FROM ops_alerts').run();
  mails.length = 0; pushes.length = 0;

  // Cada organização só recebe o seu problema.
  assert.deepEqual((await alerts.checkOrganization(org.id)).map(a => a.key), ['email_decision']);
  assert.ok(pushes.every(p => !/Tarefa|disco/.test(p.payload.title + p.payload.body)));
  assert.ok(mails.every(m => !/Tarefa automática|Pouco espaço/.test(m.html)));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM ops_alerts WHERE key LIKE 'task_%' OR key = 'disk_low'").get().n, 0);

  // checkAll: as duas organizações e a instância; os admins recebem um aviso só.
  mails.length = 0; pushes.length = 0;
  await alerts.checkAll();
  const adminPushes = toAdmin(pushes);
  assert.equal(adminPushes.length, 1);
  assert.equal(adminPushes[0].org, adminOrg.id);
  assert.deepEqual(adminPushes[0].options, { userIds: [admin.id] });
  assert.equal(adminPushes[0].payload.title, '2 problemas na instância');
  assert.equal(adminPushes[0].payload.url, '/plataforma/incidentes');
  // (Como proprietário da sua organização, recebe também o alerta dela.)
  const adminMails = mails.filter(m => m.to === 'instancia@example.invalid' && /instância/.test(m.subject));
  assert.equal(adminMails.length, 1);
  assert.equal(adminMails[0].org, adminOrg.id);
  assert.ok(adminMails[0].html.includes('Gmail em baixo'));
  assert.ok(adminMails[0].html.includes('https://exemplo.invalid/plataforma/incidentes'));
  // A organização do admin não recebe a instância como alerta seu.
  assert.ok(pushes.filter(p => p.options?.roles).every(p => !/instância|Tarefa/.test(p.payload.title)));
  assert.deepEqual(db.prepare('SELECT key FROM platform_alerts ORDER BY key').all().map(r => r.key), ['disk_low', 'task_email']);

  // Passagem seguinte: nada de novo.
  pushes.length = 0; mails.length = 0;
  assert.deepEqual(await alerts.checkPlatform(), []);
  assert.equal(pushes.length, 0);

  // 24 h depois, ainda por resolver: avisa outra vez.
  db.prepare('UPDATE platform_alerts SET notified_at = ?').run(new Date(Date.now() - 25 * 3600e3).toISOString());
  assert.equal((await alerts.checkPlatform()).length, 2);

  // Resolvido e de volta: avisa logo, uma vez.
  status = quiet;
  assert.deepEqual(await alerts.checkPlatform(), []);
  assert.ok(db.prepare("SELECT resolved_at FROM platform_alerts WHERE key = 'disk_low'").get().resolved_at);
  status = { ...quiet, tasks: failing };
  pushes.length = 0;
  assert.deepEqual((await alerts.checkPlatform()).map(a => a.key), ['task_email']);
  assert.equal(toAdmin(pushes)[0].payload.title, 'Instância: Tarefa automática a falhar: Emails pela estadia');
  opsStatus.opsStatus = () => quiet;
  await alerts.checkPlatform();
});

test('sem admins da plataforma, nada é registado', async () => {
  opsStatus.opsStatus = () => ({ ...quiet, tasks: failing });
  db.prepare('DELETE FROM platform_alerts').run();
  const previous = process.env.PLATFORM_ADMIN_EMAILS;
  process.env.PLATFORM_ADMIN_EMAILS = '';
  try { assert.deepEqual(await alerts.checkPlatform(), []); } finally { process.env.PLATFORM_ADMIN_EMAILS = previous; }
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM platform_alerts').get().n, 0);
  opsStatus.opsStatus = () => quiet;
});

test('pedido de suporte sem resposta há mais de 24 h: um aviso por pedido aos admins, até haver resposta', async () => {
  opsStatus.opsStatus = () => quiet;
  db.prepare('DELETE FROM platform_alerts').run();
  const iso = h => new Date(Date.now() - h * 3600e3).toISOString();
  let n = 100;
  const ticket = (status = 'open') => {
    const id = `t-${++n}`;
    db.prepare(`INSERT INTO support_tickets (id, number, organization_id, type, subject, status) VALUES (?, ?, ?, 'question', ?, ?)`)
      .run(id, n, org.id, `Assunto ${n}`, status);
    return id;
  };
  const message = (ticketId, side, hours, body = 'TEXTO-PRIVADO') => db.prepare(`INSERT INTO support_messages (id, ticket_id, side, body, created_at) VALUES (?, ?, ?, ?, ?)`)
    .run(`${ticketId}-${side}-${hours}`, ticketId, side, body, iso(hours));
  const late = ticket(); message(late, 'customer', 30);
  const recent = ticket(); message(recent, 'customer', 2);
  const answered = ticket(); message(answered, 'customer', 40); message(answered, 'platform', 30);
  const closed = ticket('resolved'); message(closed, 'customer', 40);

  pushes.length = 0; mails.length = 0;
  assert.deepEqual((await alerts.checkPlatform()).map(a => a.ticketId), [late]);
  assert.equal(pushes.length, 1);
  assert.deepEqual(pushes[0].options, { userIds: [admin.id] });
  assert.equal(pushes[0].payload.title, 'SP-0101 sem resposta há mais de 24 horas');
  assert.equal(pushes[0].payload.body, 'Assunto 101');
  assert.equal(pushes[0].payload.url, `/plataforma/suporte/${late}`);
  assert.equal(mails.length, 1);
  assert.equal(mails[0].to, 'instancia@example.invalid');
  assert.ok(mails[0].html.includes(`https://exemplo.invalid/plataforma/suporte/${late}`));
  assert.ok(!JSON.stringify([pushes, mails]).includes('TEXTO-PRIVADO'));

  // Uma vez por pedido: nem na passagem seguinte, nem 24 h depois, nem com outra mensagem do cliente.
  assert.deepEqual(await alerts.checkPlatform(), []);
  db.prepare('UPDATE platform_alerts SET notified_at = ?').run(iso(48));
  message(late, 'customer', 26);
  assert.deepEqual(await alerts.checkPlatform(), []);

  // Dois pedidos atrasados de uma vez: um aviso com os dois.
  const other = ticket(); message(other, 'customer', 25);
  const again = ticket(); message(again, 'customer', 25);
  pushes.length = 0;
  assert.equal((await alerts.checkPlatform()).length, 2);
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].payload.title, '2 pedidos sem resposta há mais de 24 horas');
  assert.equal(pushes[0].payload.url, '/plataforma/suporte');

  // A plataforma responde: fica resolvido; o cliente volta a escrever e espera 24 h: novo aviso.
  message(late, 'platform', 1);
  await alerts.checkPlatform();
  assert.ok(db.prepare('SELECT resolved_at FROM platform_alerts WHERE key = ?').get(`support_unanswered:${late}`).resolved_at);
  db.prepare('UPDATE support_messages SET created_at = ? WHERE ticket_id = ? AND side = ?').run(iso(28), late, 'platform');
  message(late, 'customer', 25);
  pushes.length = 0;
  assert.deepEqual((await alerts.checkPlatform()).map(a => a.ticketId), [late]);
  assert.equal(pushes.length, 1);
});

test('push com papéis: os membros da equipa não recebem os alertas', async () => {
  pushService.sendToOrganization = realSend;
  const staff = auth.createUser({ name: 'Equipa', email: 'equipa@example.invalid', password: 'SyntheticAlert123!' });
  orgs.createMembership({ organizationId: org.id, userId: staff.id, role: 'staff' });
  const sub = db.prepare('INSERT INTO push_subscriptions (organization_id, user_id, endpoint, keys_json, active) VALUES (?, ?, ?, ?, 1)');
  sub.run(org.id, owner.id, 'https://fcm.googleapis.com/fcm/send/dona', JSON.stringify({ p256dh: 'x', auth: 'y' }));
  sub.run(org.id, staff.id, 'https://fcm.googleapis.com/fcm/send/equipa', JSON.stringify({ p256dh: 'x', auth: 'y' }));
  const webpush = require('web-push');
  const original = webpush.sendNotification;
  const endpoints = [];
  webpush.sendNotification = async subscription => { endpoints.push(subscription.endpoint); };
  try {
    await pushService.sendToOrganization(org.id, { title: 't' }, { roles: ['owner', 'manager'] });
    assert.deepEqual(endpoints, ['https://fcm.googleapis.com/fcm/send/dona']);
  } finally { webpush.sendNotification = original; }
});
