// Gmail com a autorização revogada ou expirada: o cliente Google real tenta
// renovar o token e recebe invalid_grant. Rede intercetada localmente: nada sai
// para a Google e nenhum email é enviado. Não valida a conta Gmail real.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test', EMAIL_ENABLED: 'true',
  GOOGLE_CLIENT_ID: 'synthetic-client', GOOGLE_CLIENT_SECRET: 'synthetic-secret', GOOGLE_EMAIL_REDIRECT_URI: 'http://localhost/cb' });
// Intercetar a rede ANTES de carregar o cliente Google (guarda o fetch ao carregar).
const originalFetch = global.fetch;
let tokenResponse, gmailCalls = [], tokenCalls = 0;
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
global.fetch = async (url, options) => {
  const target = String(url);
  if (target.startsWith('https://oauth2.googleapis.com/token')) { tokenCalls++; return tokenResponse(); }
  if (target.startsWith('https://gmail.googleapis.com/')) {
    gmailCalls.push(target);
    return target.endsWith('/messages/send') ? json(200, { id: 'gmail-msg-1', threadId: 't1' }) : json(200, { id: 'gmail-msg-1', payload: { headers: [] } });
  }
  throw new Error(`Pedido externo bloqueado: ${target}`);
};
// O gaxios (cliente HTTP da Google) usa node-fetch em Node, não o fetch global;
// só usa window.fetch se existir. Segunda barreira: proxy numa porta local
// fechada, para que nada chegue à rede mesmo que escape ao intercetor.
global.window = { fetch: (...args) => global.fetch(...args) };
process.env.HTTPS_PROXY = process.env.https_proxy = 'http://127.0.0.1:9';
const root = path.resolve(__dirname, '..');
const { db, initDatabase } = require(path.join(root, 'config/database'));
initDatabase();
const orgs = require(path.join(root, 'services/orgService'));
const { encodeTokens } = require(path.join(root, 'config/tokenStorage'));
const { sendViaGmail } = require(path.join(root, 'config/googleEmail'));
const delivery = require(path.join(root, 'services/emailDelivery'));

let org, reservation;

before(() => {
  org = orgs.createOrganization('Gmail revogado');
  db.prepare("INSERT INTO accommodations(id, organization_id, name, type, price_per_night, max_guests) VALUES ('a', ?, 'A', 'alojamento', 100, 2)").run(org.id);
  db.prepare("INSERT INTO guests(id, organization_id, name, email) VALUES ('g', ?, 'Hóspede', 'h@example.invalid')").run(org.id);
  db.prepare(`INSERT INTO reservations(id, organization_id, guest_id, accommodation_id, check_in, check_out, nights, num_guests, total_amount, status)
    VALUES ('r', ?, 'g', 'a', '2036-01-01', '2036-01-03', 2, 1, 200, 'confirmada')`).run(org.id);
  reservation = db.prepare("SELECT * FROM reservations WHERE id = 'r'").get();
  // Token de acesso expirado: o cliente tem de o renovar antes de enviar.
  db.prepare('INSERT INTO google_email_connections(organization_id, email, tokens) VALUES (?, ?, ?)')
    .run(org.id, 'alojamento@example.invalid', encodeTokens({ access_token: 'expired', refresh_token: 'revoked', expiry_date: Date.now() - 60000 }, `email:${org.id}`));
});
after(() => { global.fetch = originalFetch; delete global.window; db.close(); });

const send = () => delivery.deliverTemplate(
  { orgId: org.id, slug: 'pagamento', reservation, to: 'h@example.invalid', rendered: { subject: 'Pagamento', html: '<p>ok</p>' } },
  () => sendViaGmail(org.id, { to: 'h@example.invalid', subject: 'Pagamento', html: '<p>ok</p>' }));
const state = () => db.prepare("SELECT state, last_error FROM email_deliveries WHERE reservation_id = 'r'").get();

test('autorização revogada: envio recusado (não incerto), sem chamar o Gmail; repete depois de religar', async () => {
  gmailCalls = [];
  tokenResponse = () => json(400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' });
  await assert.rejects(send());
  assert.ok(tokenCalls >= 1, 'a renovação foi respondida pelo intercetor local');
  assert.deepEqual(gmailCalls, [], 'nenhum pedido de envio');
  assert.equal(state().state, 'blocked', 'falha conhecida antes do envio: não fica como incerta');
  assert.match(state().last_error, /verificar configuração/);
  // Repetir de imediato não envia (espera ou decisão da equipa).
  assert.deepEqual(await send(), { queued: true, delivery_status: 'blocked' });
  // A equipa volta a ligar o Gmail e autoriza nova tentativa.
  tokenResponse = () => json(200, { access_token: 'fresh', expires_in: 3600, token_type: 'Bearer' });
  delivery.resolveDelivery(org.id, 'r', 'pagamento', 'retry');
  const sent = await send();
  assert.equal(sent.id, 'gmail-msg-1');
  assert.equal(state().state, 'sent');
  assert.equal(gmailCalls.filter(url => url.endsWith('/messages/send')).length, 1);
});
