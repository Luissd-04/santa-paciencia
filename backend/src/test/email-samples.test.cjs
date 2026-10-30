// Exemplos de todos os emails (Definições → Emails → Receber todos os emails):
// um por modelo do hóspede (a confirmação nos 4 estados), os avisos à equipa e
// os emails de conta, com dados e códigos fictícios.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-email-samples-'));
const originalCwd = process.cwd();
process.chdir(temp);
Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test', PUBLIC_APP_URL: 'https://exemplo.invalid' });
delete process.env.EMAIL_ENABLED;
const { db, initDatabase } = require('../config/database');
initDatabase();
const emailService = require('../services/emailService');
const sent = [];
emailService.sendMail = async (org, message) => { sent.push({ org, ...message }); return { id: 'm' }; };
const googleEmail = require('../config/googleEmail');
let gmailConnected = true;
googleEmail.isEmailAuthenticated = () => gmailConnected;
const samples = require('../services/emailSamples');
const ctrl = require('../controllers/emailTemplateController');
const org = require('../services/orgService').createOrganization('Exemplos Sintéticos');
after(() => { db.close(); process.chdir(originalCwd); fs.rmSync(temp, { recursive: true, force: true }); });

// Alojamento real com códigos: nenhum exemplo os pode mostrar.
db.prepare(`INSERT INTO accommodations (id, organization_id, name, type, price_per_night, door_code, wifi_password)
  VALUES ('a-real', ?, 'Suite Real', 'alojamento', 100, 'PORTA-REAL-77', 'wifi-real-77')`).run(org.id);

const slugs = () => db.prepare('SELECT slug FROM organization_email_templates WHERE organization_id = ?').all(org.id).map(r => r.slug);

test('um exemplo de cada email, sem marcadores por preencher nem códigos reais', () => {
  const all = samples.allSamples(org.id, { baseUrl: 'https://app.exemplo.invalid' });
  const guest = all.filter(s => s.group === 'Hóspede');
  assert.equal(guest.length, slugs().length + 3, 'cada modelo uma vez e a confirmação em 4 estados');
  assert.deepEqual(all.filter(s => s.group === 'Equipa').map(s => s.name), ['Nova reserva', 'Reserva cancelada']);
  assert.equal(all.filter(s => s.group === 'Conta').length, 5);
  assert.deepEqual([...new Set(all.map(s => s.group))], ['Teste', 'Hóspede', 'Equipa', 'Conta'], 'o teste do modo escuro e depois pela ordem da jornada');
  // O teste do modo escuro mostra as 3 versões.
  assert.equal((all[0].html.match(/VERSÃO [A-C]/g) || []).length, 3);
  for (const s of all) {
    assert.ok(s.subject && s.html.includes('</html>'), s.name);
    assert.ok(!/\{\{\s*\w+\s*\}\}/.test(s.subject + s.html), `${s.name}: marcadores por preencher`);
    assert.ok(!/PORTA-REAL|wifi-real/.test(s.html), `${s.name}: códigos reais`);
  }
  // A confirmação mostra os 4 estados e as coordenadas os códigos de exemplo.
  const confirmations = guest.filter(s => s.name.includes('('));
  assert.equal(confirmations.length, 4);
  assert.ok(confirmations.some(s => s.html.includes('Falta o sinal para confirmar')));
  assert.ok(confirmations.some(s => s.html.includes('Recebemos o seu pedido')));
  const arrival = guest.find(s => s.subject.includes('chegada') || s.html.includes('Código da porta'));
  assert.ok(arrival && arrival.html.includes('1234#'), 'coordenadas com o código de exemplo');
});

function call(body) {
  return new Promise(resolve => {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(payload) { resolve({ status: this.statusCode, body: payload }); } };
    ctrl.sendSamples({ body, user: { organization_id: org.id }, protocol: 'https', get: () => 'app.exemplo.invalid' }, res);
  });
}

test('enviar todos: valida o endereço, exige o Gmail, numera os assuntos e não repete logo a seguir', async () => {
  assert.equal((await call({ to: 'não é email' })).status, 400);
  gmailConnected = false;
  assert.match((await call({ to: 'luis@example.org' })).body.error, /Gmail não ligado/);
  gmailConnected = true;

  sent.length = 0;
  const ok = await call({ to: ' luis@example.org ' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.sent, ok.body.total);
  assert.deepEqual(ok.body.failed, []);
  assert.equal(sent.length, ok.body.total);
  assert.ok(sent.every(m => m.to === 'luis@example.org' && m.org === org.id));
  assert.match(sent[0].subject, new RegExp(`^\\[Exemplo 01/${ok.body.total}\\] Teste do modo escuro`));
  assert.match(sent.at(-1).subject, new RegExp(`^\\[Exemplo ${ok.body.total}/${ok.body.total}\\] Teste de email`));

  const again = await call({ to: 'luis@example.org' });
  assert.equal(again.status, 429);
  assert.equal(sent.length, ok.body.total, 'o segundo pedido não envia nada');
  ctrl._samplesSentAt.clear();
});

test('uma falha não pára os outros exemplos', async () => {
  const original = emailService.sendMail;
  let n = 0;
  emailService.sendMail = async () => { if (++n === 2) throw new Error('Gmail ocupado'); return { id: 'm' }; };
  try {
    const result = await samples.sendAll(org.id, 'luis@example.org');
    assert.equal(result.sent, result.total - 1);
    assert.equal(result.failed.length, 1);
  } finally {
    emailService.sendMail = original;
  }
});

test('teste do modo escuro: a cor misturada devolve a cor da marca sobre o fundo', () => {
  const { ink } = require('../services/emailDarkModeTest');
  const { PALETTE: P } = require('../services/emailComposer');
  const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  const close = (a, b) => rgb(a).every((v, i) => Math.abs(v - rgb(b)[i]) <= 1.5 / 255);
  const exclusion = (s, b) => '#' + rgb(s).map((v, i) => Math.round((rgb(b)[i] + v - 2 * rgb(b)[i] * v) * 255).toString(16).padStart(2, '0')).join('');
  const screen = (s, b) => '#' + rgb(s).map((v, i) => Math.round((1 - (1 - rgb(b)[i]) * (1 - v)) * 255).toString(16).padStart(2, '0')).join('');
  for (const [color, backdrop] of [[P.brand, P.cardBg], [P.ok, P.okBg], [P.text, P.cardBg]]) {
    assert.ok(close(exclusion(ink(color, backdrop, false), backdrop), color), `${color} sobre ${backdrop}`);
  }
  assert.ok(close(screen(ink(P.brandText, P.brand, true), P.brand), P.brandText), 'letra clara sobre terracota');
});
