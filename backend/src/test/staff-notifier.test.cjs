// Os avisos push à equipa saem todos por staffNotifier, incluindo o resumo diário,
// cada tipo com o seu ícone e texto curto.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-notifier-'));
const originalCwd = process.cwd();
process.chdir(temp);
process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.PUSH_SUMMARY_HOUR = '0';
const { db, initDatabase } = require('../config/database');
initDatabase();
const sent = [];
require('../services/staffNotifier').push = async (org, type, message) => { sent.push({ org, type, ...message }); return { total: 1, sent: 1 }; };
const { sendDailySummaries } = require('../services/pushScheduler');
const { localDateIso } = require('../services/reservationRules');
after(() => { db.close(); process.chdir(originalCwd); fs.rmSync(temp, { recursive: true, force: true }); });

test('resumo diário: um aviso por dia, do tipo daily_summary, com os check-ins por fazer', async () => {
  const today = localDateIso();
  db.exec(`INSERT INTO organizations(id,name,slug) VALUES ('org-n','N','n');
    INSERT INTO users(id,name,email,password_hash) VALUES ('u-n','N','n@example.invalid','x');
    INSERT INTO push_subscriptions(id,organization_id,user_id,endpoint,keys_json) VALUES ('s1','org-n','u-n','https://push.example.invalid/1','{}');
    INSERT INTO guests(id,organization_id,name,email) VALUES ('g-n','org-n','G','g@example.invalid');
    INSERT INTO accommodations(id,organization_id,name,type,price_per_night) VALUES ('a-n','org-n','A','alojamento',100);
    INSERT INTO reservations(id,organization_id,guest_id,accommodation_id,check_in,check_out,nights,num_guests,total_amount,status)
      VALUES ('r-n','org-n','g-n','a-n','${today}','2099-01-02',1,1,100,'confirmada');`);
  await sendDailySummaries();
  await sendDailySummaries();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, 'daily_summary');
  assert.equal(sent[0].kind, 'summary');
  assert.equal(sent[0].title, 'Hoje: 1 check-in');
  assert.equal(sent[0].body, 'Chega G');
  assert.equal(sent[0].tag, 'sp-daily-summary');
});

test('resumo diário: contagens no título, quem chega e quem sai no corpo', () => {
  const { summaryMessage } = require('../services/pushScheduler');
  assert.deepEqual(summaryMessage({ checkins: ['Ana Ferreira', 'Rui Costa'], checkouts: ['Marta Silva'] }),
    { title: 'Hoje: 2 check-ins e 1 check-out', body: 'Chegam Ana Ferreira e Rui Costa · Sai Marta Silva' });
  assert.deepEqual(summaryMessage({ checkins: [], checkouts: ['A', 'B', 'C', 'D', 'E'] }),
    { title: 'Hoje: 5 check-outs', body: 'Saem A, B, C e mais 2' });
});

test('aspeto dos avisos: ícone, ícone da barra e botão por tipo; o teste usa o logótipo', () => {
  const { KINDS, pushPayload } = require('../services/staffNotifier');
  const frontend = path.resolve(__dirname, '../../../frontend');
  for (const kind of [...Object.keys(KINDS), null]) {
    const payload = pushPayload({ kind, title: 't', body: 'b', url: '/reservas', tag: 'sp-x' });
    for (const file of [payload.icon, payload.badge]) assert.ok(fs.existsSync(path.join(frontend, file)), `falta ${file}`);
    assert.equal(payload.actions.length, kind ? 1 : 0);
  }
  assert.deepEqual(pushPayload({ kind: 'payment', title: 'Pagamento recebido · 120,00 €', body: 'b', tag: 'sp-payment' }), {
    title: 'Pagamento recebido · 120,00 €', body: 'b', url: '/', tag: 'sp-payment', requireInteraction: false,
    icon: '/img/push/payment.png', badge: '/img/push/payment-badge.png', actions: [{ action: 'open', title: 'Ver reserva' }],
  });
});

test('datas curtas dos avisos: dias juntos no mesmo mês, ano só quando não é o atual', () => {
  const dates = require('../services/dates');
  const today = '2026-10-25';
  assert.equal(dates.shortRange('2026-07-03', '2026-07-06', { today }), '3 → 6 jul');
  assert.equal(dates.shortRange('2026-07-30', '2026-08-02', { today }), '30 jul → 2 ago');
  assert.equal(dates.shortRange('2026-12-30', '2027-01-02', { today }), '30 dez 2026 → 2 jan 2027');
  assert.equal(dates.shortRange('2027-03-01', '2027-03-04', { today }), '1 → 4 mar 2027');
  assert.equal(dates.shortDate('2026-07-03', { today }), '3 jul');
});
