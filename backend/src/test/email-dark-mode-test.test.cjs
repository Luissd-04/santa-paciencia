// Experiência do modo escuro do Gmail: as três versões partem do mesmo email
// e não estragam o conteúdo (services/emailDarkModeTest.js).
const { test } = require('node:test');
const assert = require('node:assert/strict');
process.env.PUBLIC_APP_URL = 'https://exemplo.test';
const es = require('../services/emailService');
const { TEMPLATES } = require('../config/emailTemplateDefaults');
const { VARIANTS, lockedColors, invertFriendly } = require('../services/emailDarkModeTest');

function paymentEmail() {
  const settings = { property_name: 'Santa Paciência', logo_url: 'https://exemplo.test/logo.png', checkin_time: '15:00', checkout_time: '11:00' };
  const r = { id: 'SP-1', status: 'confirmada', check_in: '2026-11-14', check_out: '2026-11-16', nights: 2, num_guests: 2, total_amount: 250, amount_paid: 80 };
  const vars = es.sanitizeUrlVars(es.buildVars({ name: 'Luis', first_name: 'Luis' }, r, { name: 'Suite King' }, settings, { valor_pagamento: '80,00 €' }));
  return es.renderEmail({ subject: TEMPLATES.pagamento.subject, body: TEMPLATES.pagamento.body, vars, blocks: es.buildBlocks(vars, settings, r), settings }).html;
}
const text = html => html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

test('A, B e C mostram o mesmo texto (C sem a linha «ALOJAMENTO LOCAL»)', () => {
  const html = paymentEmail();
  assert.deepEqual(VARIANTS.map(v => v.key), ['A', 'B', 'C']);
  assert.equal(text(lockedColors(html)), text(html));
  assert.equal(text(invertFriendly(html)), text(html).replace('ALOJAMENTO LOCAL ', ''));
});

test('B prende os fundos e põe as regras do Gmail em blocos próprios', () => {
  const html = lockedColors(paymentEmail());
  assert.match(html, /background-color:#843424;[^"]*background-image:linear-gradient\(#843424,#843424\)/);
  assert.match(html, /<style>\nu \+ \.body \.sp-gs \{ background:#000; mix-blend-mode:screen; \}/);
  assert.match(html, /class="sp-ge"><span class="sp-gd">Pagamento recebido<\/span><\/span>/);
  assert.match(html, /class="sp-gs"><span class="sp-gd">Total<\/span><\/span>/);
});

test('C só prende o cabeçalho; botões e total passam a contorno', () => {
  const html = invertFriendly(paymentEmail());
  assert.equal((html.match(/linear-gradient/g) || []).length, 1);
  assert.doesNotMatch(html.slice(html.indexOf('padding:24px 24px 20px') + 40), /bgcolor="#843424"/);
  assert.match(html, /class="sp-outline" style="[^"]*border:1\.5px solid #843424;/);
});
