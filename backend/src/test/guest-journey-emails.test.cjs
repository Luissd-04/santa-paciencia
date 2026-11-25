// Emails do percurso do hóspede (19/11/2026): reserva aceite com o sinal pela
// Stripe e o prazo, pagamento que confirma, tudo para a chegada num só email,
// obrigado com avaliação e cancelamentos com o texto do motivo.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-journey-emails-'));
const originalCwd = process.cwd();
process.chdir(temp);
Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test', PUBLIC_APP_URL: 'https://exemplo.invalid', TZ: 'Europe/Lisbon' });
const { db, initDatabase } = require('../config/database');
initDatabase();
let stripe = true;
require('../services/stripeClient').stripeEnabled = () => stripe;
const emailService = require('../services/emailService');
const { TEMPLATES, INACTIVE, defaultsList } = require('../config/emailTemplateDefaults');
after(() => { db.close(); process.chdir(originalCwd); fs.rmSync(temp, { recursive: true, force: true }); });

const SETTINGS = {
  checkin_time: '15:00', checkout_time: '11:00', property_name: 'Casa do Monte', property_address: 'Rua do Monte 1, 7000-123 Évora',
  license_number: '98765/AL', email_contact: 'reservas@casadomonte.pt', phone: '+351 912 000 000', logo_url: '',
  arrival_instructions: 'Estacione no largo.', entry_instructions: 'A chave está na caixa.', checkout_instructions: 'Deixe a chave\nFeche as janelas',
  review_url: 'https://g.page/r/casa/review', booking_url: 'https://exemplo.invalid/reservar/casa', no_wifi: false,
};
// Com política de pagamento ativa há sinal; sem ela, paga-se o total (ver os
// testes «sem política» no fim). Os testes do sinal correm com a política ligada.
const policy = require('../services/paymentPolicy');
const setPolicy = enabled => require('../services/settingsService').set('o', 'payment_policy', { ...policy.DEFAULT_POLICY, enabled });
db.prepare("INSERT OR IGNORE INTO organizations(id,name,slug) VALUES ('o','O','o')").run();
setPolicy(true);
const GUEST = { name: 'Ana Hóspede', first_name: 'Ana', email: 'ana@exemplo.invalid' };
const UNIT = { name: 'Casa do Monte', wifi_name: 'CasaDoMonte', wifi_password: 'oliveira', door_code: '4821' };
const text = html => html.replace(/<span class="sp-g[se]"><span class="sp-gd">([^<]*)<\/span><\/span>/g, '$1').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
function render(slug, reservation = {}, extra = {}, settings = SETTINGS) {
  const r = { id: 'SP-1', organization_id: 'o', status: 'aguardar_pagamento', check_in: '2035-12-09', check_out: '2035-12-12', nights: 3, num_guests: 2,
    total_amount: 288, amount_paid: 0, public_token: 't'.repeat(64), channel: 'website', created_at: '2035-11-19 10:00:00', ...reservation };
  const vars = emailService.sanitizeUrlVars(emailService.buildVars(GUEST, r, UNIT, settings, { link_pre_checkin: 'https://exemplo.invalid/pre-checkin/x', ...extra }));
  const tpl = TEMPLATES[slug];
  const out = emailService.renderEmail({ subject: tpl.subject, body: tpl.body, vars, blocks: emailService.buildBlocks(vars, settings, r), settings });
  return { subject: out.subject, html: out.html, text: text(out.html) };
}

test('reserva aceite: sinal a pagar pela Stripe, prazo de 48 h e pré-check-in', () => {
  const { subject, html, text: t } = render('reserva_aceite', { deposit_deadline: '2035-11-21T10:30:00.000Z' });
  assert.equal(subject, 'Reserva aceite — falta o sinal — Casa do Monte');
  assert.match(t, /falta pagar o sinal de [\d,]+ € até \S+, 21 nov( \d{4})?, às 10:30 ?\. Depois disso, as datas voltam a ficar livres/);
  assert.match(t, /Pagar o sinal · [\d,]+ €/);
  assert.match(html, /href="https:\/\/exemplo\.invalid\/reserva\/t{64}"/);
  assert.match(t, /Pagamento seguro através da Stripe/);
  assert.match(t, /Fazer o pré-check-in/);
  assert.doesNotMatch(t, /minutos/);
});

test('reserva aceite sem Stripe ligada não mostra o botão de pagamento', () => {
  stripe = false;
  try { assert.doesNotMatch(render('reserva_aceite').html, /Pagar o sinal/); } finally { stripe = true; }
});

test('reserva aceite com o sinal já pago diz que está confirmada', () => {
  const { subject, text: t } = render('reserva_aceite', { status: 'confirmada', amount_paid: 288 });
  assert.equal(subject, 'Reserva confirmada — Casa do Monte');
  assert.match(t, /está confirmada/);
  assert.doesNotMatch(t, /Pagar o sinal/);
});

test('o pagamento que completa o sinal confirma a reserva e lembra o pré-check-in', () => {
  const { text: t } = render('pagamento', { status: 'confirmada', amount_paid: 144 }, { valor_pagamento: '144,00 €', pagamento_confirma: '1' });
  assert.match(t, /RESERVA CONFIRMADA/i);
  assert.match(t, /Recebemos o sinal de 144,00 €/);
  assert.match(t, /Fazer o pré-check-in/);
});

test('assunto do email de pagamento: «Reserva confirmada» quando o pagamento confirma a reserva', () => {
  const subject = extra => emailService.renderEmail({ subject: '{{assunto_pagamento}} — {{alojamento}}', body: '<p>x</p>',
    vars: emailService.buildVars(GUEST, { id: 'SP-1', organization_id: 'o', status: 'confirmada', check_in: '2035-12-09', check_out: '2035-12-12', nights: 3,
      num_guests: 2, total_amount: 288, amount_paid: 144, public_token: 't'.repeat(64), channel: 'website' }, UNIT, SETTINGS, extra),
    blocks: {}, settings: SETTINGS }).subject;
  assert.equal(subject({ valor_pagamento: '144,00 €', pagamento_confirma: '1' }), 'Reserva confirmada — Casa do Monte');
  assert.equal(subject({ valor_pagamento: '50,00 €' }), 'Pagamento recebido — Casa do Monte');
});

test('tudo para a chegada: como chegar, como entrar, Wi-Fi e o dia da saída', () => {
  const { subject, text: t } = render('coordenadas', { status: 'confirmada', amount_paid: 288 });
  assert.equal(subject, 'Tudo para a sua chegada — Casa do Monte');
  for (const part of ['COMO CHEGAR', 'Rua do Monte 1, 7000-123 Évora', 'Estacione no largo.', 'COMO ENTRAR', 'A chave está na caixa.', '4821',
    'CasaDoMonte', 'oliveira', 'NO DIA DA SAÍDA · ATÉ ÀS 11:00', 'Deixe a chave', 'Feche as janelas', '+351 912 000 000']) {
    assert.ok(t.toUpperCase().includes(part.toUpperCase()), `falta ${part}`);
  }
  const noWifi = render('coordenadas', { status: 'confirmada', amount_paid: 288 }, {}, { ...SETTINGS, no_wifi: true }).text;
  assert.ok(!noWifi.includes('oliveira'), 'sem Wi-Fi, sem senha');
});

test('obrigado: avaliação e voltar a reservar, em linguagem neutra', () => {
  const { html, text: t } = render('obrigado', { status: 'check_out', amount_paid: 288 });
  assert.match(html, /href="https:\/\/g\.page\/r\/casa\/review"/);
  assert.match(html, />Deixar uma avaliação</);
  assert.match(html, />Voltar a reservar</);
  assert.doesNotMatch(t, /recebê-lo/);
});

test('cancelamento: um texto por motivo', () => {
  const cancelled = { status: 'cancelada' };
  assert.match(render('cancelamento', cancelled, { motivo_cancelamento: 'ttl' }).text, /não chegou a ser confirmado/);
  const deposit = render('cancelamento', cancelled, { motivo_cancelamento: 'deposit' });
  assert.match(deposit.text, /Não recebemos o sinal/);
  assert.match(deposit.html, />Fazer um novo pedido</);
  assert.match(render('cancelamento', cancelled, { motivo_cancelamento: 'staff' }).text, /foi cancelada\. Se não esperava/);
  assert.match(render('cancelamento', cancelled, { motivo_cancelamento: 'guest' }).text, /Confirmamos o cancelamento/);
  assert.doesNotMatch(render('cancelamento', cancelled, { motivo_cancelamento: 'staff' }).html, /novo pedido/);
});

test('pedido recebido: sem pagar nada e com o link para acompanhar o pedido', () => {
  const { text: t, html } = render('confirmacao', { status: 'pendente' });
  assert.match(t, /Recebemos o seu pedido/);
  assert.match(t, /Ainda não precisa de pagar nada/);
  assert.match(html, />Acompanhar o pedido</);
});

test('«Boas-vindas» e «Lembrete de check-out» ficam desligados por omissão', () => {
  assert.deepEqual([...INACTIVE].sort(), ['antes_checkout', 'apos_checkin']);
  const list = defaultsList();
  assert.equal(list.find(t => t.slug === 'apos_checkin').active, 0);
  assert.equal(list.find(t => t.slug === 'reserva_aceite').timing_event, 'approval');
  assert.equal(list.find(t => t.slug === 'pre_checkin').timing_event, 'manual');
});

test('sem política de pagamento: o email diz «pagamento» e o valor é o total, nunca «sinal»', () => {
  setPolicy(false);
  try {
    const { subject, text: t } = render('reserva_aceite', { deposit_deadline: '2035-11-21T10:30:00.000Z' });
    assert.equal(subject, 'Reserva aceite — falta o pagamento — Casa do Monte');
    assert.match(t, /falta pagar 288,00 € até \S+, 21 nov( \d{4})?, às 10:30/);
    assert.match(t, /Pagar a reserva · 288,00 €/);
    assert.doesNotMatch(t, /sinal/i);
    assert.match(render('cancelamento', { status: 'cancelada' }, { motivo_cancelamento: 'deposit' }).text, /Não recebemos o pagamento/);
  } finally { setPolicy(true); }
});

test('B11: o pagamento que completa o sinal mostra o sinal; o parcial anterior diz quanto falta e até quando', () => {
  const done = render('pagamento', { status: 'confirmada', amount_paid: 144 }, { valor_pagamento: '94,00 €', pagamento_confirma: '1' }).text;
  assert.match(done, /Recebemos o sinal de 144,00 €/);
  assert.match(done, /Recebemos 94,00 € ?, que completam o sinal de 144,00 €/);
  const partial = render('pagamento', { status: 'aguardar_pagamento', amount_paid: 50, deposit_deadline: '2035-11-21T10:30:00.000Z' }, { valor_pagamento: '50,00 €' }).text;
  assert.match(partial, /Registámos o pagamento de 50,00 € da sua reserva \( ?Casa do Monte ?\)\. Para confirmar a reserva ainda falta 94,00 € ?até \S+, 21 nov/);
});
