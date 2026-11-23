// GET /api/geocode: pesquisa de moradas feita pelo servidor (o browser não pode
// chamar o Nominatim por causa da CSP). O pedido externo é simulado.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-geocode-'));
const previous = process.cwd();
process.chdir(temp);
Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test', EMAIL_ENABLED: 'false', TRUST_PROXY: 'loopback' });
const app = require('../app');
const { db } = require('../config/database');
const auth = require('../services/authService');
const orgs = require('../services/orgService');
const geocoding = require('../services/geocoding');

const realFetch = global.fetch;
let server, base, outbound, reply;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.on('listening', resolve); server.on('error', reject); });
  base = `http://127.0.0.1:${server.address().port}`;
  global.fetch = (url, init) => {
    if (!String(url).startsWith('https://nominatim.openstreetmap.org/')) return realFetch(url, init);
    outbound.push({ url: new URL(String(url)), headers: init?.headers });
    return reply();
  };
});
after(() => { global.fetch = realFetch; server?.close(); db.close(); process.chdir(previous); fs.rmSync(temp, { recursive: true, force: true }); });
beforeEach(() => { outbound = []; geocoding.resetForTests({ gapMs: 0 }); });

const org = orgs.createOrganization('Mapa');
function person(role, email) {
  const user = auth.createUser({ name: role, email, password: 'SyntheticGeo123!' });
  orgs.createMembership({ organizationId: org.id, userId: user.id, role });
  return auth.createSession(user.id, org.id).sessionId;
}
const manager = person('manager', 'gerente-mapa@example.invalid');
const manager2 = person('manager', 'gerente-mapa-2@example.invalid');
const manager3 = person('manager', 'gerente-mapa-3@example.invalid');
const staff = person('staff', 'staff-mapa@example.invalid');
const get = (q, session = manager) => realFetch(`${base}/api/geocode${q === undefined ? '' : '?q=' + encodeURIComponent(q)}`, { headers: { Cookie: `${auth.SESSION_COOKIE}=${session}` } });
const json = body => () => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }));

test('sucesso: devolve só lat, lon e display_name e pede em pt-PT com User-Agent da app', async () => {
  reply = json([{ lat: '39.5', lon: '-8.1', display_name: 'Rua A, Tomar', place_id: 1, osm_id: 2 }]);
  const r = await get('Rua A, Tomar, Portugal');
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { success: true, data: { lat: 39.5, lon: -8.1, display_name: 'Rua A, Tomar' } });
  assert.equal(outbound.length, 1);
  assert.equal(outbound[0].url.searchParams.get('q'), 'Rua A, Tomar, Portugal');
  assert.equal(outbound[0].url.searchParams.get('accept-language'), 'pt-PT');
  assert.equal(outbound[0].url.searchParams.get('limit'), '1');
  assert.match(outbound[0].headers['User-Agent'], /^SantaPaciencia\//);
  assert.doesNotMatch(outbound[0].headers['User-Agent'], /@/);
});

test('cache: a mesma pesquisa não volta a chamar o serviço externo', async () => {
  reply = json([{ lat: '1', lon: '2', display_name: 'X' }]);
  await get('Praça Central');
  await get('  praça   central ');
  assert.equal(outbound.length, 1);
});

test('sem resultados: 404 com mensagem em português', async () => {
  reply = json([]);
  const r = await get('Morada que não existe');
  assert.equal(r.status, 404);
  assert.match((await r.json()).error, /Morada não encontrada/);
});

test('serviço externo em baixo ou com resposta inválida: 502 com mensagem clara', async () => {
  reply = () => Promise.resolve(new Response('erro', { status: 503 }));
  let r = await get('Rua Falha 1');
  assert.equal(r.status, 502);
  assert.match((await r.json()).error, /serviço de mapas não está disponível/);
  reply = () => Promise.reject(new Error('rede'));
  r = await get('Rua Falha 2');
  assert.equal(r.status, 502);
  reply = json({ nao: 'lista' });
  assert.equal((await get('Rua Falha 3')).status, 502);
});

test('q em falta, vazio ou demasiado longo: 400 sem chamar o serviço externo', async () => {
  reply = json([]);
  for (const q of [undefined, '', '   ', 'x'.repeat(301)]) {
    const r = await get(q, manager2);
    assert.equal(r.status, 400);
    assert.ok((await r.json()).error);
  }
  assert.equal(outbound.length, 0);
});

test('exige sessão e papel de gestor', async () => {
  reply = json([]);
  assert.equal((await realFetch(`${base}/api/geocode?q=Tomar`)).status, 401);
  assert.equal((await get('Tomar', staff)).status, 403);
  assert.equal(outbound.length, 0);
});

test('limite por utilizador: depois de 10 pedidos num minuto responde 429', async () => {
  reply = json([{ lat: '1', lon: '2', display_name: 'X' }]);
  for (let i = 0; i < 10; i++) assert.equal((await get(`Rua ${i}`, manager3)).status, 200);
  const r = await get('Rua 11', manager3);
  assert.equal(r.status, 429);
  assert.match((await r.json()).error, /Demasiadas pesquisas/);
});
