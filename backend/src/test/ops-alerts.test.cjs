// Alertas do sistema: o que conta como problema, avisar uma vez (e de novo ao
// fim de 24 h ou depois de resolvido), push só para proprietário e gestores e
// email com o detalhe.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-ops-alerts-'));
const originalCwd = process.cwd();
process.chdir(temp);
Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test', PUBLIC_APP_URL: 'https://exemplo.invalid' });
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
