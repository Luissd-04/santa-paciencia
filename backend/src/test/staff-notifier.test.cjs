// Os avisos push à equipa saem todos por staffNotifier, incluindo o resumo diário.
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
  assert.equal(sent[0].body, 'Hoje: 1 check-in');
  assert.equal(sent[0].tag, 'sp-daily-summary');
});
