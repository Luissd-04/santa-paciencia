// GET /auth/public-stats: números da semana para a página de entrada, sem
// sessão. Só três totais da instância, arredondados para baixo (de 10 em 10 até
// 100, de 50 em 50 até 1000, depois de 100 em 100), nada de nomes, emails nem
// dados por organização, com cache de 10 minutos e limite de pedidos por IP.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-public-stats-'));
const previous = process.cwd();
process.chdir(temp);
Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test', EMAIL_ENABLED: 'false', TRUST_PROXY: 'loopback' });
const app = require('../app');
const { db } = require('../config/database');
const orgs = require('../services/orgService');
const platform = require('../services/platformService');
let server, base;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.on('listening', resolve); server.on('error', reject); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server?.close(); db.close(); process.chdir(previous); fs.rmSync(temp, { recursive: true, force: true }); });

const alfa = orgs.createOrganization('Alfa Segredo');
const beta = orgs.createOrganization('Beta Segredo');
let n = 0;
function accommodation(org) {
  const id = `${org.id}-a${n++}`;
  db.prepare("INSERT INTO accommodations (id, organization_id, name, type, price_per_night, max_guests) VALUES (?, ?, 'Casa Privada', 'suite', 100, 2)").run(id, org.id);
  return id;
}
function reservation(org, accId, createdAt) {
  const guest = `g${n++}`;
  db.prepare("INSERT INTO guests (id, organization_id, name, email) VALUES (?, ?, 'Hóspede Real', 'hospede@example.invalid')").run(guest, org.id);
  const id = `r${n++}`;
  db.prepare(`INSERT INTO reservations (id, organization_id, guest_id, accommodation_id, check_in, check_out, nights, num_guests, status, total_amount, created_at)
    VALUES (?, ?, ?, ?, '2026-12-01', '2026-12-03', 2, 2, 'confirmada', 200, ?)`).run(id, org.id, guest, accId, createdAt);
  return id;
}
function email(org, reservationId, state, updatedAt) {
  db.prepare(`INSERT INTO email_deliveries (id, organization_id, reservation_id, template_slug, state, updated_at)
    VALUES (?, ?, ?, 'confirmacao', ?, ?)`).run(`e${n++}`, org.id, reservationId, state, updatedAt);
}
const sqlDate = ms => new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
const DAY = 86400000;

const a1 = accommodation(alfa);
accommodation(alfa);
const b1 = accommodation(beta);
const recent1 = reservation(alfa, a1, sqlDate(Date.now() - DAY));
reservation(beta, b1, sqlDate(Date.now() - 6 * DAY));
const old = reservation(alfa, a1, sqlDate(Date.now() - 8 * DAY));
email(alfa, recent1, 'sent', Date.now() - 2 * DAY);
email(beta, recent1, 'sent', Date.now() - 3 * DAY);
email(alfa, old, 'sent', Date.now() - 9 * DAY); // fora da semana
email(alfa, recent1, 'blocked', Date.now()); // não entregue
email(alfa, recent1, 'uncertain', Date.now()); // por confirmar

test('sem sessão: três totais grosseiros (arredondados para baixo), nunca os exatos', async () => {
  const r = await fetch(base + '/auth/public-stats');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  const body = await r.json();
  assert.deepEqual(body, { success: true, data: { week: { reservations_created: 0, emails_sent: 0, accommodations: 0 } } });
  // Nada de nomes, emails ou identificadores.
  const text = JSON.stringify(body);
  for (const secret of ['Segredo', 'Casa Privada', 'Hóspede', 'example.invalid', alfa.id, beta.id]) assert.doesNotMatch(text, new RegExp(secret));
});

test('cache de 10 minutos: valores novos só aparecem depois de expirar', async () => {
  const first = (await (await fetch(base + '/auth/public-stats')).json()).data;
  accommodation(beta);
  reservation(beta, b1, sqlDate(Date.now()));
  assert.deepEqual((await (await fetch(base + '/auth/public-stats')).json()).data, first);
  const now = Date.now();
  assert.deepEqual(platform.publicWeekStats({ now: now + 9 * 60000 }), first);
  // Depois de expirar o cache, os totais continuam grosseiros: com poucos dados, 0.
  const fresh = platform.publicWeekStats({ now: now + platform.PUBLIC_STATS_TTL_MS + 1000 });
  assert.deepEqual(fresh.week, { reservations_created: 0, emails_sent: 0, accommodations: 0 });
});

test('arredondamento: 10 em 10 abaixo de 100, 50 em 50 abaixo de 1000, depois 100 em 100', () => {
  const c = platform.coarse;
  assert.deepEqual([0, 9, 10, 37, 99].map(c), [0, 0, 10, 30, 90]);
  assert.deepEqual([100, 149, 150, 999].map(c), [100, 100, 150, 950]);
  assert.deepEqual([1000, 1099, 1234, 25999].map(c), [1000, 1000, 1200, 25900]);
});

test('totais maiores aparecem arredondados para baixo e nunca exatos', () => {
  const org = orgs.createOrganization('Gama Segredo');
  for (let i = 0; i < 57; i++) accommodation(org);
  const fresh = platform.publicWeekStats({ now: Date.now() + 2 * platform.PUBLIC_STATS_TTL_MS, fresh: true });
  assert.equal(fresh.week.accommodations, 60); // 3 + 1 + 57 = 61 reais
});

test('limite de pedidos por IP', async () => {
  const get = ip => fetch(base + '/auth/public-stats', { headers: { 'X-Forwarded-For': ip } });
  let last;
  for (let i = 0; i < 61; i++) last = await get('192.0.2.77');
  assert.equal(last.status, 429);
  assert.equal((await last.json()).success, false);
  assert.equal((await get('192.0.2.78')).status, 200);
});
