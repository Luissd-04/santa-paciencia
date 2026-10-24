// Desempenho da API com volume sintético representativo (~6 anos de operação
// de 12 unidades). Base SQLite em ficheiro (WAL) numa pasta temporária; dados
// inventados; sem serviços externos. Mede p50/p95 dos pedidos usados no dia a dia.
// Limite configurável: PERF_P95_MS (por omissão 800 ms por pedido, máquina local).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-performance-'));
const previous = process.cwd();
process.chdir(temp);
fs.mkdirSync('data', { recursive: true });
Object.assign(process.env, { DB_PATH: path.join(temp, 'data/santapaciencia.db'), NODE_ENV: 'test', EMAIL_ENABLED: 'false' });
for (const key of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET']) delete process.env[key];
const realFetch = global.fetch;
global.fetch = (url, options) => { if (!String(url).startsWith('http://127.0.0.1:')) throw new Error('externo bloqueado'); return realFetch(url, options); };

const app = require('../app');
const { db } = require('../config/database');
const auth = require('../services/authService');
const orgs = require('../services/orgService');

const VOLUME = { units: 12, years: 6, guests: 7000 };
const LIMIT = Number(process.env.PERF_P95_MS) || 800;
const iso = ms => new Date(ms).toISOString().slice(0, 10);
const DAY = 86400000;

function seed(orgId) {
  const counts = { reservations: 0, payments: 0, events: 0, history: 0, expenses: 0, guests: VOLUME.guests };
  db.transaction(() => {
    const unit = db.prepare(`INSERT INTO accommodations(id, organization_id, name, type, price_per_night, max_guests) VALUES (?, ?, ?, 'alojamento', ?, 4)`);
    for (let u = 0; u < VOLUME.units; u++) unit.run(`u${u}`, orgId, `Unidade ${u}`, 80 + u * 5);
    const guest = db.prepare('INSERT INTO guests(id, organization_id, name, email, phone, country) VALUES (?, ?, ?, ?, ?, ?)');
    for (let g = 0; g < VOLUME.guests; g++) guest.run(`g${g}`, orgId, `Hóspede ${g}`, `h${g}@example.invalid`, `+3519${String(g).padStart(8, '0')}`, ['PT', 'ES', 'FR', 'DE', 'GB'][g % 5]);
    const reservation = db.prepare(`INSERT INTO reservations(id, organization_id, guest_id, accommodation_id, check_in, check_out, nights, num_guests, num_adults,
      total_amount, amount_paid, status, payment_status, channel, nightly_prices, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 2, 2, ?, ?, ?, ?, ?, '[]', ?)`);
    const payment = db.prepare('INSERT INTO reservation_payments(id, organization_id, reservation_id, amount, method, payment_date) VALUES (?, ?, ?, ?, ?, ?)');
    const event = db.prepare(`INSERT INTO operational_events(id, organization_id, title, type, date, status, accommodation_id, reservation_id, auto_generated, auto_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`);
    const history = db.prepare(`INSERT INTO reservation_history(id, organization_id, reservation_id, action, changes) VALUES (?, ?, ?, 'updated', '[{"field":"notes","from":null,"to":"x"}]')`);
    const start = Date.UTC(new Date().getUTCFullYear() - VOLUME.years + 1, 0, 1);
    const end = start + VOLUME.years * 365 * DAY;
    const today = Date.now();
    let n = 0;
    for (let u = 0; u < VOLUME.units; u++) {
      for (let at = start + (u % 3) * DAY; at < end; n++) {
        const nights = 2 + (n % 3);
        const checkIn = iso(at), checkOut = iso(at + nights * DAY);
        const total = nights * (80 + u * 5);
        const past = at + nights * DAY < today;
        const status = n % 17 === 0 ? 'cancelada' : past ? 'check_out' : 'confirmada';
        const paid = status === 'cancelada' ? 0 : past ? total : Math.round(total / 2);
        const id = `SP-${String(n).padStart(8, '0')}`;
        reservation.run(id, orgId, `g${n % VOLUME.guests}`, `u${u}`, checkIn, checkOut, nights, total, paid, status,
          paid >= total ? 'confirmado' : paid ? 'parcial' : 'pendente', ['direto', 'booking', 'airbnb', 'website'][n % 4], iso(at - 30 * DAY));
        counts.reservations++;
        if (paid) { payment.run(`p${n}a`, orgId, id, paid / 2, 'transferencia', iso(at - 20 * DAY)); payment.run(`p${n}b`, orgId, id, paid / 2, 'cartao', iso(at)); counts.payments += 2; }
        for (const [type, date] of [['check_in', checkIn], ['check_out', checkOut], ['limpeza', checkOut]]) {
          event.run(`e${n}${type}`, orgId, `${type} ${id}`, type, date, past ? 'concluido' : 'planeado', `u${u}`, id, `${id}:${type}:${date}`);
          counts.events++;
        }
        history.run(`h${n}`, orgId, id); counts.history++;
        at += (nights + (n % 2)) * DAY;
      }
    }
    const expense = db.prepare('INSERT INTO expenses(id, organization_id, date, description, amount, category) VALUES (?, ?, ?, ?, ?, ?)');
    for (let e = 0; e < 3000; e++) { expense.run(`x${e}`, orgId, iso(start + (e % (VOLUME.years * 365)) * DAY), `Despesa ${e}`, 10 + (e % 90), ['limpeza', 'manutencao', 'outro'][e % 3]); counts.expenses++; }
  })();
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.exec('ANALYZE');
  return counts;
}

let server;
async function main() {
  const org = orgs.createOrganization('Desempenho');
  const user = auth.createUser({ name: 'Gestão', email: 'perf@example.invalid', password: 'SyntheticPerf123!' });
  orgs.createMembership({ organizationId: org.id, userId: user.id, role: 'owner' });
  const session = auth.createSession(user.id, org.id).sessionId;
  const seedStart = performance.now();
  const counts = seed(org.id);
  const seedMs = Math.round(performance.now() - seedStart);
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, url, body) => {
    const t = performance.now();
    const response = await realFetch(base + url, { method, headers: { 'Content-Type': 'application/json', Cookie: `${auth.SESSION_COOKIE}=${session}` }, body: body ? JSON.stringify(body) : undefined });
    const payload = await response.json();
    assert.ok(response.status < 400, `${method} ${url}: ${response.status} ${JSON.stringify(payload).slice(0, 200)}`);
    return performance.now() - t;
  };
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, '0');
  const sampleId = db.prepare("SELECT id FROM reservations WHERE status = 'check_out' ORDER BY check_in DESC LIMIT 1").get().id;
  let created = 0;
  const requests = [
    ['Reservas: 1.ª página', 'GET', '/api/reservations?limit=50'],
    ['Reservas: operacionais', 'GET', `/api/reservations?scope=operational&today=${iso(Date.now())}&limit=50`],
    ['Reservas: pesquisa', 'GET', '/api/reservations?search=H%C3%B3spede%2042&limit=50'],
    ['Reservas: ano', 'GET', `/api/reservations?from=${year}-01-01&to=${year}-12-31&limit=200`],
    ['Ficha da reserva', 'GET', `/api/reservations/${sampleId}`],
    ['Dashboard', 'GET', '/api/reservations/stats/dashboard'],
    ['Notificações', 'GET', '/api/reservations/notifications'],
    ['Disponibilidade', 'GET', `/api/reservations/availability?check_in=${year + 1}-06-01&check_out=${year + 1}-06-05`],
    ['Hóspedes: 1.ª página', 'GET', '/api/guests?limit=50'],
    ['Hóspedes: pesquisa', 'GET', '/api/guests?search=4242&limit=50'],
    ['Eventos do mês', 'GET', `/api/events?from=${year}-${month}-01&to=${year}-${month}-28`],
    ['Relatório financeiro (ano)', 'GET', `/api/reports/financial?year=${year - 1}`],
    ['Despesas: 1.ª página', 'GET', '/api/expenses?limit=50'],
    ['Cotação do wizard', 'POST', '/api/reservations/quote', () => ({ accommodation_id: 'u0', check_in: `${year + 7}-01-10`, check_out: `${year + 7}-01-13`, num_adults: 2 })],
    ['Criar reserva', 'POST', '/api/reservations', () => {
      const ci = iso(Date.UTC(year + 8, 0, 1) + created * 4 * DAY); created++;
      return { accommodation_id: 'u1', check_in: ci, check_out: iso(Date.parse(ci) + 2 * DAY), num_adults: 2, guest: { name: `Novo ${created}`, email: `novo-${created}@example.invalid` } };
    }],
  ];
  const results = [];
  if (process.env.PERF_VERBOSE) console.error(`semente: ${seedMs} ms`);
  for (const [label, method, url, body] of requests) {
    if (process.env.PERF_VERBOSE) console.error(`a medir: ${label}`);
    await call(method, url, body?.());   // aquecer
    const times = [];
    for (let i = 0; i < 15; i++) times.push(await call(method, url, body?.()));
    times.sort((a, b) => a - b);
    const p50 = times[Math.floor(times.length * 0.5)], p95 = times[Math.min(times.length - 1, Math.ceil(times.length * 0.95) - 1)];
    results.push({ label, p50: Math.round(p50), p95: Math.round(p95) });
  }
  const dbBytes = fs.statSync(process.env.DB_PATH).size;
  console.log(JSON.stringify({ volume: counts, seed_ms: seedMs, database_mb: Math.round(dbBytes / 1048576 * 10) / 10 }));
  for (const r of results) console.log(`${r.label.padEnd(30)} p50 ${String(r.p50).padStart(5)} ms   p95 ${String(r.p95).padStart(5)} ms`);
  const slow = results.filter(r => r.p95 > LIMIT);
  assert.deepEqual(slow, [], `Acima de ${LIMIT} ms (p95)`);
  console.log(`Desempenho: todos os pedidos medidos com p95 ≤ ${LIMIT} ms neste volume.`);
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  // Também em caso de erro: sem isto o servidor mantinha o processo vivo.
  if (server) { server.closeAllConnections(); server.close(); }
  try { db.close(); } catch { /* já fechada */ }
  process.chdir(previous);
  fs.rmSync(temp, { recursive: true, force: true });
});
