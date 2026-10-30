// Regressões da composição dos emails: interpolação, escape, sanitização,
// formato dos montantes, estado real da reserva, e isolamento entre
// organizações na pré-visualização.
//
// Todos os dados são fictícios e nada é enviado (EMAIL_ENABLED=false).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');

const root = path.resolve(__dirname, '../../..');
const backend = path.join(root, 'backend/src');
const backendRequire = createRequire(path.join(backend, 'package.json'));

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-emails-'));
process.chdir(temp);
process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.EMAIL_ENABLED = 'false';
process.env.PUBLIC_APP_URL = 'https://exemplo.invalid';
global.fetch = async () => { throw new Error('Rede desativada nos testes'); };

const { db, initDatabase } = backendRequire('./config/database');
initDatabase();

const composer = backendRequire('./services/emailComposer');
const emailService = backendRequire('./services/emailService');
const { TEMPLATES } = backendRequire('./config/emailTemplateDefaults');

const SETTINGS = {
  checkin_time: '15:00', checkout_time: '11:00',
  facebook: 'https://facebook.example/al', instagram: 'https://instagram.example/al',
  website: 'https://exemplo.invalid/suites/',
  property_name: 'Santa Paciência', property_address: 'Rua de Évora, 14',
  license_number: 'RNET 000000/AL', email_contact: 'reservas@exemplo.invalid',
  logo_url: 'https://exemplo.invalid/logo.png',
};

const GUEST = { name: 'Rui Marques', first_name: 'Rui', email: 'rui@exemplo.invalid' };
const ACCOMMODATION = { name: 'Suite Mezzanine Deluxe', city: 'Reguengos de Monsaraz' };

// Tira as camadas de mistura do Gmail para comparar a marcação que o modelo escreveu.
function unblend(html) {
  return html.replace(/<span class="sp-g[se]"><span class="sp-gd">([^<]*)<\/span><\/span>/g, '$1');
}

function reservation(status = 'confirmada', extra = {}) {
  return {
    id: 'SP-1', status, check_in: '2026-05-29', check_out: '2026-05-31',
    nights: 2, num_guests: 1, total_amount: 240, ...extra,
  };
}

function render(slug, { status = 'confirmada', guest = GUEST, accommodation = ACCOMMODATION, res, settings = SETTINGS } = {}) {
  const r = res || reservation(status);
  const vars = emailService.sanitizeUrlVars(emailService.buildVars(guest, r, accommodation, settings, {
    link_pre_checkin: 'https://exemplo.invalid/pre-checkin/abc',
  }));
  const blocks = emailService.buildBlocks(vars, settings, r);
  const tpl = TEMPLATES[slug];
  return emailService.renderEmail({ subject: tpl.subject, body: tpl.body, vars, blocks, settings });
}

// ── Interpolação e escape ──────────────────────────────────────────────────

test('dados do hóspede são escapados e não conseguem injetar HTML', () => {
  const guest = { name: '<script>alert(1)</script>', first_name: '<img src=x onerror=alert(1)>', email: 'x@y.invalid' };
  const { html } = render('confirmacao', { guest });
  assert.ok(!html.includes('<script>alert(1)</script>'), 'script do nome não pode sobreviver');
  // O texto continua a conter "onerror=", mas como texto escapado e inerte —
  // o que não pode existir é uma etiqueta <img> real com o atributo.
  assert.ok(!/<img[^>]*onerror/i.test(html), 'nenhuma etiqueta com atributo de evento');
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'), 'o texto aparece escapado');
});

test('acentos e aspas aparecem corretos e não partem atributos', () => {
  const guest = { name: 'María "Nita" Gonçalves-Schäfer', first_name: 'María "Nita"', email: 'm@x.invalid' };
  const { html } = render('confirmacao', { guest });
  assert.ok(html.includes('Mar&iacute;a') || html.includes('María'), 'acentos preservados');
  assert.ok(html.includes('&quot;Nita&quot;') || html.includes('"Nita"'), 'aspas preservadas no texto');
});

test('uma única passagem de substituição impede injeção de blocos por dados', () => {
  // Um hóspede chamado "{{contacto}}" não pode fazer aparecer o bloco.
  const guest = { name: '{{contacto}}', first_name: '{{contacto}}', email: 'x@y.invalid' };
  const { html } = render('confirmacao', { guest });
  assert.ok(html.includes('{{contacto}}'), 'o texto fica literal');
  assert.equal((unblend(html).match(/Dúvidas\? Responda a este email/g) || []).length, 1, 'o nome não pode injetar um segundo bloco');
});

test('marcador desconhecido fica literal em vez de desaparecer', () => {
  const out = emailService.interpolate('Olá {{nao_existe}}', { primeiro_nome: 'Rui' });
  assert.equal(out, 'Olá {{nao_existe}}');
});

// ── Sanitização do corpo editável ──────────────────────────────────────────

test('o corpo editável não pode trazer scripts nem atributos de evento', () => {
  const dirty = '<p onclick="steal()">Olá</p><script>fetch("//mau")</script><a href="javascript:alert(1)">ligação</a>';
  const clean = composer.sanitizeBodyHtml(dirty);
  assert.ok(!clean.includes('<script'), 'script removido');
  assert.ok(!clean.includes('onclick'), 'evento removido');
  assert.ok(!clean.includes('javascript:'), 'protocolo recusado');
  assert.ok(clean.includes('>ligação</a>'), 'o texto da ligação mantém-se legível');
});

test('protocolos disfarçados também são recusados', () => {
  assert.equal(composer.safeUrl('java\u0000script:alert(1)'), '');
  assert.equal(composer.safeUrl(' javascript:alert(1)'), '');
  assert.equal(composer.safeUrl('data:text/html,<script>'), '');
  assert.equal(composer.safeUrl('https://exemplo.invalid/a'), 'https://exemplo.invalid/a');
  assert.equal(composer.safeUrl('mailto:a@b.invalid'), 'mailto:a@b.invalid');
});

test('sanitização interpreta HTML malformado e entidades antes de validar URLs e eventos', () => {
  for (const dirty of [
    '<a href=javascript:alert(1)>Teste</a>',
    '<img src="https://example.invalid/x"/onerror=alert(1)>',
    '<a href="jav&#x61;script:alert(1)">Teste</a>',
    '<a href="java&#9;script:alert(1)">Teste</a>',
    '<svg><a xlink:href="javascript:alert(1)">Teste</a></svg>',
    '<math><mtext><img src=x onerror=alert(1)></mtext></math>',
    '<form><button formaction="javascript:alert(1)">Teste</button></form>',
    '<p style="background-image:url(javascript:alert(1));color:expression(alert(1))">Teste</p>',
  ]) {
    const clean = composer.sanitizeBodyHtml(dirty);
    assert.doesNotMatch(clean, /javascript:|\son\w+\s*=|<svg|<math|formaction|expression\(|url\(/i, dirty);
  }
  const clean = composer.sanitizeBodyHtml('<table cellpadding="0"><tr><td style="color:#843424;padding:12px;text-align:center">Olá &amp; adeus</td></tr></table>');
  assert.match(clean, /cellpadding="0"/);
  assert.match(clean, /padding:12px/);
  assert.match(clean, /Olá &amp; adeus/);
});

test('dados interpolados não podem transformar um marcador de URL numa ligação executável', () => {
  const { html } = emailService.renderEmail({ subject: 'Teste',
    body: '<a href="{{primeiro_nome}}">Ligação</a>',
    vars: { primeiro_nome: 'javascript:alert(1)' }, settings: SETTINGS });
  assert.doesNotMatch(html, /href="javascript:/i);
  assert.doesNotMatch(emailService.baseTemplate('<img src=x/onerror=alert(1)>', SETTINGS), /\sonerror=/i);
});

test('marcador {{var}} num href sobrevive à sanitização e é validado no valor', () => {
  const clean = composer.sanitizeBodyHtml('<a href="{{link_pre_checkin}}">ir</a>');
  assert.ok(clean.includes('href="{{link_pre_checkin}}"'), 'o marcador não é apagado');
  // O valor é que tem de passar pelo filtro de protocolos.
  const vars = emailService.sanitizeUrlVars({ link_pre_checkin: 'javascript:alert(1)' });
  assert.equal(vars.link_pre_checkin, '');
});

// ── Montantes ──────────────────────────────────────────────────────────────

test('montantes usam o formato português e não duplicam o símbolo', () => {
  assert.equal(composer.formatCurrency(240).replace(/ /g, ' '), '240,00 €');
  assert.equal(composer.formatCurrency(0).replace(/ /g, ' '), '0,00 €');
  assert.equal(composer.formatCurrency(12345.6).replace(/[  ]/g, ' '), '12 345,60 €');
  const { html } = render('confirmacao');
  assert.ok(!/€\s*€/.test(html), 'sem símbolo duplicado');
  assert.ok(!html.includes('€240.00'), 'sem o formato antigo');
});

// ── Estado real da reserva ─────────────────────────────────────────────────

test('uma reserva pendente nunca é apresentada como confirmada', () => {
  const { html, subject } = render('confirmacao', { status: 'pendente' });
  assert.ok(!/Reserva confirmada/i.test(html), 'o corpo não pode dizer confirmada');
  assert.ok(!/Reserva confirmada/i.test(subject), 'o assunto não pode dizer confirmada');
  assert.ok(html.includes('Pedido de reserva recebido'));
  assert.ok(subject.includes('Pedido de reserva recebido'));
});

test('aguardar_pagamento e cancelada têm a sua própria apresentação', () => {
  const aguardar = render('confirmacao', { status: 'aguardar_pagamento' });
  assert.ok(aguardar.html.includes('Reserva por confirmar'));
  assert.ok(!/foi confirmada/i.test(aguardar.html));

  const cancelada = render('cancelamento', { status: 'cancelada' });
  assert.ok(cancelada.html.includes('Reserva cancelada'));
  // Cartão sem faixa de total: mostrar um valor a pagar seria enganador.
  assert.ok(!/>Total</.test(cancelada.html), 'sem faixa de total no cancelamento');
});

test('um estado desconhecido não inventa uma confirmação', () => {
  const pres = emailService.statusPresentation({ status: 'estado_novo_qualquer' });
  assert.equal(pres.title, 'A sua reserva');
  assert.ok(!/confirmada/i.test(pres.message));
});

test('uma reserva confirmada continua a dizer que está confirmada', () => {
  const { html, subject } = render('confirmacao', { status: 'confirmada' });
  assert.ok(html.includes('Reserva confirmada'));
  assert.ok(subject.includes('Reserva confirmada'));
});

// ── Campos opcionais e definições ──────────────────────────────────────────

test('campos opcionais vazios não deixam separadores nem rótulos soltos', () => {
  const settings = { ...SETTINGS, property_address: '', license_number: '', email_contact: '' };
  const { html } = render('confirmacao', { settings });
  assert.ok(!html.includes('Licença AL:'), 'sem rótulo de licença vazio');
  assert.ok(!html.includes('mailto:'), 'sem ligação de email vazia');
  assert.ok(!/Santa Paciência\s*·\s*<br/.test(html), 'sem separador pendurado');
  assert.ok(html.includes('Santa Paciência'), 'o nome continua no rodapé');
});

test('só aparecem as redes sociais configuradas e com protocolo válido', () => {
  const social = composer.buildSocialBlock({
    instagram: 'https://instagram.example/al',
    facebook: '',
    website: 'javascript:alert(1)',
  });
  assert.ok(social.includes('Instagram'));
  assert.ok(!social.includes('Facebook'), 'rede não configurada não aparece');
  assert.ok(!social.includes('Website'), 'ligação com protocolo inválido não aparece');
  assert.equal(composer.buildSocialBlock({}), '', 'sem redes, o bloco não existe');
});

test('todos os emails recebem apenas as redes escolhidas no alojamento', () => {
  const settings = {
    ...SETTINGS,
    social_links_enabled: ['instagram', 'website'],
  };
  for (const slug of ['confirmacao', 'apos_checkin', 'cancelamento']) {
    const html = unblend(render(slug, { settings }).html);
    assert.equal((html.match(/sp-social-block/g) || []).length, 1, `${slug}: redes uma só vez, no rodapé`);
    assert.ok(html.includes('Instagram'), `${slug} sem Instagram`);
    assert.ok(html.includes('Website'), `${slug} sem Website`);
    assert.ok(!html.includes('Facebook'), `${slug} ignorou a seleção do alojamento`);
  }
  // Emails internos e de conta não levam redes sociais.
  assert.doesNotMatch(emailService.baseTemplate('<p>x</p>', SETTINGS, { social: false }), /sp-social-block/);
});

test('a morada do rodapé abre uma pesquisa no mapa', () => {
  const { html } = render('confirmacao');
  assert.ok(html.includes('https://www.google.com/maps/search/?api=1&amp;query=Rua%20de%20%C3%89vora%2C%2014'));
  assert.ok(html.includes('target="_blank"'));
  assert.ok(html.includes('Rua de Évora, 14') || html.includes('Rua de &Eacute;vora, 14'));
});

test('sem endereço configurado não se desenha um botão que não leva a lado nenhum', () => {
  assert.equal(composer.buildButton('', 'Conhecer o alojamento'), '');
  assert.equal(composer.buildButton('javascript:alert(1)', 'Conhecer o alojamento'), '');
  const button = composer.buildButton('https://exemplo.invalid', 'Conhecer o alojamento');
  // Frase normal: as maiúsculas partiam o botão em duas linhas no telemóvel.
  assert.ok(button.includes('>Conhecer o alojamento</a>'));
  assert.doesNotMatch(button, /CONHECER|letter-spacing/);
  assert.match(composer.buildButton('https://exemplo.invalid', 'Como chegar', { secondary: true }), /sp-surface-bg[\s\S]*sp-brand-text/, 'secundário em contorno');
});

test('linhas vazias do cartão são omitidas em vez de ficarem sem valor', () => {
  const card = composer.buildReservationCard([
    { label: 'Alojamento', value: 'Suite' },
    { label: 'Noites', value: '' },
  ], '');
  assert.ok(card.includes('Alojamento'));
  assert.ok(!card.includes('Noites'));
});

// ── Estrutura compatível com clientes de email ─────────────────────────────

test('a composição usa tabelas e estilos inline, sem script, flex ou svg', () => {
  const { html } = render('apos_checkin');
  assert.ok(html.includes('<table'), 'estrutura em tabelas');
  assert.ok(html.includes('role="presentation"'), 'tabelas marcadas como apresentação');
  assert.ok(!html.includes('<script'), 'sem JavaScript');
  assert.ok(!html.includes('<svg'), 'sem SVG inline (a app do Gmail remove-o)');
  assert.ok(!/display:\s*(flex|grid)/.test(html), 'sem flex/grid');
  assert.ok(html.includes('Georgia'), 'fonte de substituição serifada presente');
  assert.ok(html.includes('max-width:600px'), 'contentor limitado a 600px');
});

test('a composição inclui os recursos de cor; o resultado no Gmail exige teste real', () => {
  const { html } = render('confirmacao');
  assert.ok(html.includes('<meta name="color-scheme" content="light"'), 'declara apenas o esquema claro');
  assert.ok(html.includes('color-scheme:light only'), 'bloqueio do esquema também fica inline');
  assert.ok(html.includes('@media (prefers-color-scheme: dark)'), 'clientes com media query recebem a paleta clara');
  assert.ok(html.includes('[data-ogsc] .sp-brand-bg'), 'Outlook recebe a correção de modo escuro');
  assert.ok(html.includes('background-color:#843424'), 'cabeçalho e total com o terracota da marca');

  // Modelos antigos já guardados também são decorados durante a composição.
  const legacy = composer.sanitizeBodyHtml(
    '<p style="color:#5d554c">Texto</p><table><tr><td bgcolor="#fcf9f3" style="background:#fcf9f3">Linha</td></tr></table>',
    { placeholders: false },
  );
  assert.match(legacy, /class="sp-text-soft"/);
  assert.match(legacy, /class="sp-card-bg"/);
  assert.match(legacy, /background-color:#fcf9f3/);
});

// Gmail do iPhone em modo escuro: o email fica igual ao modo claro (versão B
// do teste de cores, confirmada no iPhone a 26/10/2026). Fundos presos por
// gradiente e texto em camadas de mistura, os dois só ativos pelas regras do
// Gmail, em blocos <style> próprios. Um fundo nunca fica preso sozinho: com a
// app nova do Gmail (29/10/2026) o fundo claro ficava com letra clara.
test('todos os emails prendem as cores contra o modo escuro do Gmail', () => {
  const examples = [emailService.baseTemplate('<p>teste</p>', SETTINGS),
    ...Object.keys(TEMPLATES).map(slug => render(slug).html)];
  for (const html of examples) {
    assert.match(html, /<style>\n\.body \.sp-page-bg \{ background-image:linear-gradient\(#[0-9a-f]{6},#[0-9a-f]{6}\) !important; \}[^<]*\.sp-surface-bg \{ background-image:linear-gradient\(#faf5ec,#faf5ec\) !important; \}/, 'fundo creme preso pelas regras do Gmail');
    // Só o cabeçalho (logótipo branco) fica preso sempre.
    assert.deepEqual(html.slice(html.indexOf('<body')).match(/class="[^"]*"[^>]*linear-gradient/g)?.map(m => m.match(/class="([^"]*)"/)[1]), ['sp-brand-bg sp-header'],
      'nenhum outro fundo preso fora das regras do Gmail');
    assert.match(html, /<!--\[if !mso\]><!-->\n<style>\n\.body \.sp-gs \{ background:#000; mix-blend-mode:screen; \}/, 'regras do Gmail no seu bloco, fora do Outlook do Windows');
    assert.match(html, /<\/style>\n<!--<!\[endif\]-->/);
    assert.ok(html.indexOf('.body .sp-gd') < html.indexOf(':root { color-scheme'), 'antes do bloco principal');
    assert.match(html, /class="sp-ge"><span class="sp-gd">/, 'texto escuro sobre creme');
    assert.doesNotMatch(html, /<span class="sp-g[se]"><span class="sp-gd"><span class="sp-g/, 'sem camadas duplicadas');
    assert.doesNotMatch(html, /-webkit-text-fill-color|\sbackground="/, 'sem as proteções antigas');
  }
  const header = emailService.baseTemplate('<p>x</p>', SETTINGS, { headerLabel: 'Aviso à equipa' });
  assert.match(header, /class="sp-gs"><span class="sp-gd">AVISO À EQUIPA<\/span><\/span>/, 'texto claro sobre terracota');
  // Um corpo que já traz camadas (ex.: email anterior) não leva outra.
  const twice = emailService.baseTemplate(composer.extractBody(header), SETTINGS);
  assert.doesNotMatch(twice, /sp-gd">[^<]*<span class="sp-g/);
  // Modelos guardados por versões anteriores perdem as proteções antigas no
  // corpo; a proteção atual é acrescentada ao email composto.
  const legacy = composer.sanitizeBodyHtml('<table background="https://exemplo.invalid/img/email/bg-surface.png"><tr>'
    + '<td bgcolor="#faf5ec" class="sp-surface-bg sp-ink" style="background-color:#faf5ec;background-image:linear-gradient(#faf5ec,#faf5ec);'
    + 'color:#5d554c;-webkit-text-fill-color:#5d554c">Texto</td></tr></table>', { placeholders: false });
  assert.doesNotMatch(legacy, /background=|linear-gradient|text-fill|sp-ink/);
  assert.match(legacy, /background-color:#faf5ec/);
  assert.match(legacy, /color:#5d554c/);
});

test('fundos da moldura e dos modelos não dependem de url() no CSS', () => {
  const examples = [emailService.baseTemplate('<p>teste</p>', SETTINGS),
    ...Object.keys(TEMPLATES).map(slug => render(slug).html)];
  for (const html of examples) {
    for (const css of html.matchAll(/<style>([\s\S]*?)<\/style>|\bstyle="([^"]*)"/g)) {
      assert.doesNotMatch(css[1] || css[2], /url\s*\(/i,
        'uma imagem não deve fazer o Gmail descartar os estilos essenciais');
    }
    const shell = html.match(/<body\b[^>]*>/)[0];
    assert.doesNotMatch(shell, /bgcolor=|background=|sp-page-bg/);
    assert.match(shell, /background-color:transparent/);
    const styledTags = [...html.matchAll(/<(?:body|table|td|th|a|p|div|span)\b[^>]*>/g)].map(m => m[0]);
    for (const tag of styledTags.filter(t => /class="[^"]*sp-(?:page|surface|card|card-alt|brand)-bg/.test(t))) {
      assert.match(tag, /background-color:#[0-9a-f]{6}/, 'cor de recurso mesmo sem o CSS do head');
    }
  }
});

test('a composição conserva texto selecionável, entidades, resumo e modelos antigos', () => {
  const body = 'Texto solto &amp; acentos: Olá <strong>Luis</strong>.'
    + '<p style="color:#5d554c">Detalhes <a href="https://exemplo.invalid">aqui</a>.</p>'
    + '<a style="background:#843424;color:#fbf3ea" href="https://exemplo.invalid">Continuar</a>';
  const html = emailService.baseTemplate(body, SETTINGS);
  const extracted = composer.extractBody(html);
  const plain = backendRequire('sanitize-html')(extracted, { allowedTags: [], allowedAttributes: {} });
  assert.equal(plain, 'Texto solto &amp; acentos: Olá Luis.Detalhes aqui.Continuar');
  assert.doesNotMatch(extracted, /ALOJAMENTO LOCAL|ACOMPANHE-NOS/);
  assert.match(unblend(extracted), /<a[^>]*>Continuar<\/a>/);
  assert.doesNotMatch(html, /<sp-body-(?:start|end)/);
});

test('modelos guardados conservam fundo creme e cor de recurso após sanitização repetida', () => {
  let html = '<table><tr><td bgcolor="#faf5ec" class="sp-text-soft sp-ink" style="background:#faf5ec;color:#5d554c">'
    + '<p>Teste</p></td></tr></table>';
  for (let i = 0; i < 2; i++) {
    html = composer.sanitizeBodyHtml(html, { placeholders: false });
    const cell = html.match(/<td\b[^>]*>/)[0];
    assert.match(cell, /background-color:#faf5ec/);
    assert.doesNotMatch(cell, /\bsp-ink\b/);
  }
  const classOnly = composer.sanitizeBodyHtml('<p class="sp-surface-bg sp-text-soft sp-ink">Teste</p>');
  assert.match(classOnly, /background-color:#faf5ec/);
  assert.doesNotMatch(classOnly, /\bsp-ink\b/);
});

test('os ícones vêm de imagens HTTPS e o rótulo continua legível sem elas', () => {
  const social = composer.buildSocialBlock(SETTINGS);
  assert.ok(social.includes('https://exemplo.invalid/img/email/instagram.png'));
  assert.ok(social.includes('alt=""'), 'alt vazio: o rótulo ao lado é que nomeia a ligação');
  assert.ok(social.includes('/>Instagram</a>'), 'o texto sobrevive sem imagens');
});

test('sem base pública HTTPS não se emitem imagens inacessíveis ao destinatário', () => {
  const saved = process.env.PUBLIC_APP_URL;
  process.env.PUBLIC_APP_URL = 'http://localhost:3001';
  try {
    const social = composer.buildSocialBlock(SETTINGS);
    assert.ok(!social.includes('<img'), 'sem <img> apontado a localhost');
    assert.ok(social.includes('Instagram'), 'os botões continuam a existir, só com texto');
  } finally {
    process.env.PUBLIC_APP_URL = saved;
  }
});

// ── Uma só composição para envio e pré-visualização ────────────────────────

test('pré-visualização e envio produzem exatamente o mesmo HTML para o mesmo rascunho', () => {
  const r = reservation('confirmada');
  const vars = emailService.buildVars(GUEST, r, ACCOMMODATION, SETTINGS);
  const blocks = emailService.buildBlocks(vars, SETTINGS, r);
  const draft = { subject: 'Assunto {{primeiro_nome}}', body: '<p>Olá {{primeiro_nome}}</p>{{cartao_reserva}}' };

  const a = emailService.renderEmail({ ...draft, vars, blocks, settings: SETTINGS });
  const b = emailService.renderEmail({ ...draft, vars, blocks, settings: SETTINGS });
  assert.equal(a.html, b.html);
  assert.equal(a.subject, 'Assunto Rui');
  assert.ok(a.html.includes('240,00') || a.html.includes('240,00'.replace(',', ',')));
});

test('baseTemplate das mensagens avulsas usa a mesma moldura dos templates', () => {
  const avulso = emailService.baseTemplate('<p>Mensagem manual</p>', SETTINGS);
  const template = render('confirmacao').html;
  for (const marca of ['#843424', 'max-width:600px', 'sp-social-block', 'Licença AL:']) {
    assert.ok(avulso.includes(marca), `mensagem avulsa sem ${marca}`);
    assert.ok(template.includes(marca), `template sem ${marca}`);
  }
});

test('texto simples de Mensagens recebe um parágrafo com a cor dos modelos', () => {
  for (const body of ['teste', 'Olá <strong>Rui</strong>,<br />até breve &amp; obrigado']) {
    const { html } = emailService.renderManualEmail({ organizationId: null, subject: 'teste', body, context: null });
    const content = composer.extractBody(html);
    assert.match(content, /^<p class="sp-text-soft" style="[^"]*color:#5d554c/);
    assert.match(content, /<\/p>$/);
    const textOnly = value => backendRequire('sanitize-html')(value, { allowedTags: [], allowedAttributes: {} });
    assert.equal(textOnly(content), textOnly(body));
  }
});

test('normalização de texto solto conserva parágrafos, listas e cartões existentes', () => {
  const body = '<p>Parágrafo</p><ul><li>Linha</li></ul><table><tr><td>Cartão</td></tr></table>';
  const { html } = emailService.renderManualEmail({ organizationId: null, subject: 'teste', body, context: null });
  const content = composer.extractBody(html);
  assert.equal((content.match(/<p\b/g) || []).length, 1);
  assert.match(content, /<ul><li/);
  assert.match(content, /<table><tr><td>/);
  assert.doesNotMatch(content, /<p[^>]*>\s*<p/);
});

test('envio manual de um template transforma os blocos estruturais no servidor', () => {
  const r = reservation('confirmada', { precheckin_token: 'token manual' });
  const rendered = emailService.renderManualEmail({
    organizationId: null,
    subject: TEMPLATES.confirmacao.subject,
    body: TEMPLATES.confirmacao.body,
    context: { guest: GUEST, reservation: r, accommodation: ACCOMMODATION, vars: {} },
  });
  assert.equal(rendered.subject, 'Reserva confirmada — Suite Mezzanine Deluxe');
  assert.ok(rendered.html.includes('Rui'));
  assert.ok(rendered.html.includes('Suite Mezzanine Deluxe'));
  assert.ok(rendered.html.includes('240,00'));
  assert.ok(!/\{\{\s*\w+\s*\}\}/.test(rendered.html), 'nenhum bloco segue por preencher');

  const unknown = emailService.renderManualEmail({
    organizationId: null,
    subject: 'Assunto',
    body: '<p>{{campo_desconhecido}}</p>',
    context: { guest: GUEST, reservation: r, accommodation: ACCOMMODATION, vars: {} },
  });
  assert.match(unknown.html, /\{\{campo_desconhecido\}\}/, 'campos desconhecidos continuam detetáveis e serão recusados pela rota');
});

// ── Isolamento entre organizações ──────────────────────────────────────────

test('preview e email de teste usam o upload atual do único alojamento principal', async () => {
  db.exec(`INSERT INTO organizations (id,name,slug) VALUES ('logo-org','Logo','logo-org');
    INSERT INTO accommodations (id,organization_id,name,type,price_per_night,max_guests,logo_url)
      VALUES ('logo-root','logo-org','Casa','alojamento',100,2,'/uploads/logo_original.png');
    INSERT INTO accommodations (id,organization_id,name,type,price_per_night,max_guests,parent_id)
      VALUES ('logo-suite','logo-org','Suite','suite',100,2,'logo-root');
    INSERT INTO organization_email_templates (organization_id,slug,name,subject,body)
      VALUES ('logo-org','confirmacao','Confirmação','Teste','<p>Olá</p>');`);
  const ctrl = backendRequire('./controllers/emailTemplateController');
  const gmail = backendRequire('./config/googleEmail');
  const original = { isEmailAuthenticated: gmail.isEmailAuthenticated, getEmailConnectionInfo: gmail.getEmailConnectionInfo, sendViaGmail: gmail.sendViaGmail };
  const enabled = process.env.EMAIL_ENABLED;
  let sent;
  Object.assign(gmail, { isEmailAuthenticated: () => true, getEmailConnectionInfo: () => ({ email: 'teste@example.invalid' }),
    sendViaGmail: async (orgId, message) => { assert.equal(orgId, 'logo-org'); sent = message; } });
  process.env.EMAIL_ENABLED = 'true';
  const response = () => ({ statusCode: 200, status(n) { this.statusCode = n; return this; }, json(d) { this.body = d; return this; } });
  try {
    for (const filename of ['logo_original.png', 'logo_novo.png']) {
      db.prepare('UPDATE accommodations SET logo_url = ? WHERE id = ?').run(`/uploads/${filename}`, 'logo-root');
      for (const body of [{}, { accommodation_id: 'logo-suite' }]) {
        const req = { params: { slug: 'confirmacao' }, body, user: { organization_id: 'logo-org' }, protocol: 'https', get: () => 'exemplo.invalid' };
        const preview = response();
        ctrl.previewHtml(req, preview);
        assert.equal(preview.statusCode, 200);
        assert.ok(preview.body.html.includes(`src="https://exemplo.invalid/uploads/${filename}"`));
        assert.doesNotMatch(preview.body.html, /cropped-Logo-Transparente/);
        const email = response();
        await ctrl.preview(req, email);
        assert.equal(email.statusCode, 200);
        assert.equal(sent.html, preview.body.html);
      }
    }
    assert.doesNotMatch(emailService.getEmailSettings(null, 'outra-org').logo_url, /logo_novo/);
    db.exec(`INSERT INTO accommodations (id,organization_id,name,type,price_per_night,max_guests,logo_url)
      VALUES ('logo-root-2','logo-org','Outra casa','alojamento',100,2,'/uploads/outra-marca.png')`);
    assert.doesNotMatch(emailService.getEmailSettings(null, 'logo-org').logo_url, /logo_novo|outra-marca/,
      'com dois alojamentos principais não se escolhe uma marca arbitrária');
  } finally {
    Object.assign(gmail, original);
    process.env.EMAIL_ENABLED = enabled;
  }
});

test('a pré-visualização não usa alojamentos de outra organização', () => {
  db.exec(`
    INSERT INTO organizations (id,name,slug) VALUES ('org-1','Org Um','org-um'),('org-2','Org Dois','org-dois');
    INSERT INTO accommodations (id,organization_id,name,type,price_per_night,max_guests)
      VALUES ('alo-2','org-2','Alojamento da Org Dois','apartamento',100,2);
    INSERT INTO organization_settings (organization_id,key,value) VALUES ('org-2','social_website','https://org-dois.invalid');
  `);
  const { TEMPLATES: T } = backendRequire('./config/emailTemplateDefaults');
  const ins = db.prepare(`INSERT INTO organization_email_templates
    (organization_id,slug,name,subject,body,timing_offset,timing_unit,timing_direction,timing_event,active)
    VALUES (?,?,?,?,?,0,'hours','after','booking',1)`);
  ins.run('org-1', 'confirmacao', 'Confirmação', T.confirmacao.subject, T.confirmacao.body);

  const ctrl = backendRequire('./controllers/emailTemplateController');
  const res = { statusCode: 200, status(n) { this.statusCode = n; return this; }, json(d) { this.body = d; return this; } };
  ctrl.previewHtml({
    params: { slug: 'confirmacao' },
    body: { accommodation_id: 'alo-2' },           // alojamento de OUTRA organização
    user: { organization_id: 'org-1' },
    protocol: 'http', get: () => 'teste.invalid',
  }, res);

  assert.equal(res.statusCode, 200);
  assert.ok(!res.body.html.includes('Alojamento da Org Dois'), 'não pode usar o alojamento de outra org');
  assert.ok(!res.body.html.includes('org-dois.invalid'), 'não pode usar as definições de outra org');
});

test('a pré-visualização não devolve o template de outra organização', () => {
  const ctrl = backendRequire('./controllers/emailTemplateController');
  const res = { statusCode: 200, status(n) { this.statusCode = n; return this; }, json(d) { this.body = d; return this; } };
  ctrl.previewHtml({
    params: { slug: 'confirmacao' },
    body: {},
    user: { organization_id: 'org-2' },            // org-2 não tem este template
    protocol: 'http', get: () => 'teste.invalid',
  }, res);
  assert.equal(res.statusCode, 404);
});

test('o rascunho do editor tem prioridade sobre o texto guardado', () => {
  const ctrl = backendRequire('./controllers/emailTemplateController');
  const res = { statusCode: 200, status(n) { this.statusCode = n; return this; }, json(d) { this.body = d; return this; } };
  ctrl.previewHtml({
    params: { slug: 'confirmacao' },
    body: { subject: 'Assunto por gravar', body: '<p>Rascunho por gravar de {{primeiro_nome}}</p>' },
    user: { organization_id: 'org-1' },
    protocol: 'http', get: () => 'teste.invalid',
  }, res);
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.html.includes('Rascunho por gravar de Rui'), 'usa o rascunho, não o guardado');
  assert.equal(res.body.subject, 'Assunto por gravar');
});

test('tradução em falta recorre ao português e diz que o fez', () => {
  const ctrl = backendRequire('./controllers/emailTemplateController');
  const res = { statusCode: 200, status(n) { this.statusCode = n; return this; }, json(d) { this.body = d; return this; } };
  ctrl.previewHtml({
    params: { slug: 'confirmacao' },
    body: { lang: 'de', body: '' },                // alemão por preencher
    user: { organization_id: 'org-1' },
    protocol: 'http', get: () => 'teste.invalid',
  }, res);
  assert.equal(res.body.missing_translation, true);
  assert.equal(res.body.fallback_lang, 'pt');
  assert.ok(res.body.html.includes('Reserva confirmada'), 'mostra o texto português em vez de um email vazio');
});

// ── Regras de envio preservadas ────────────────────────────────────────────

// coordenadas e código de porta fundiram-se num só modelo (mesmo gatilho,
// "1 dia antes do check-in"): o código de porta deixou de ser um envio
// separado, mas a restrição sobre ele mantém-se, agora sobre "coordenadas".
test('as restrições sobre códigos de porta continuam a valer', () => {
  const { canSendTemplate } = backendRequire('./services/emailEligibility');
  const tplPorta = { slug: 'coordenadas', subject: '', body: TEMPLATES.coordenadas.body };
  assert.equal(canSendTemplate(tplPorta, reservation('pendente')), false, 'reserva por aprovar não recebe o código');
  assert.equal(canSendTemplate(tplPorta, reservation('confirmada', { amount_paid: 100, total_amount: 240 })), false, 'por pagar não recebe o código');
  assert.equal(canSendTemplate(tplPorta, reservation('confirmada', { amount_paid: 240, total_amount: 240 })), true);
  assert.equal(canSendTemplate(tplPorta, reservation('cancelada')), false);
});

test('o modelo por omissão do código de porta continua a ser detetado como sensível', () => {
  const { canSendTemplate } = backendRequire('./services/emailEligibility');
  // Detetado pelo conteúdo, não só pelo slug: se o texto mudar de modelo, a
  // regra tem de continuar a apanhá-lo.
  const tpl = { slug: 'outro', subject: '', body: TEMPLATES.coordenadas.body };
  assert.equal(canSendTemplate(tpl, reservation('pendente')), false);
});

// ── Modelos por omissão ────────────────────────────────────────────────────

test('os modelos por omissão cobrem todos os slugs usados pela aplicação', () => {
  const esperados = ['confirmacao', 'pre_checkin', 'coordenadas',
    'apos_checkin', 'antes_checkout', 'obrigado', 'cancelamento'];
  for (const slug of esperados) assert.ok(TEMPLATES[slug], `falta o modelo ${slug}`);
  assert.ok(!TEMPLATES.codigo_porta, 'código de porta devia ter-se fundido em coordenadas');
});

test('o modelo de boas-vindas tem o nome, o Wi-Fi, o check-out e o botão do alojamento', () => {
  const html = unblend(render('apos_checkin', { accommodation: { ...ACCOMMODATION, wifi_name: 'SP_WiFi' } }).html);
  assert.ok(html.includes('Bem-vindo, Rui'), 'título com o primeiro nome');
  assert.ok(html.includes('>Conhecer o alojamento</a>'), 'botão do alojamento');
  assert.ok(html.includes('>Wi-Fi</td>') && html.includes('>Check-out</td>'), 'Wi-Fi e hora do check-out');
  assert.ok(html.includes('sp-social-block'), 'redes no rodapé');
  assert.ok(html.includes('Reguengos de Monsaraz'), 'localidade dinâmica');
});

test('o modelo de confirmação tem a estadia, o pagamento e o próximo passo', () => {
  const html = unblend(render('confirmacao').html);
  for (const text of ['RESERVA CONFIRMADA', 'ENTRADA', 'SAÍDA', 'Suite Mezzanine Deluxe · 2 noites', '>Pago</td>', 'Total 240,00', 'PRÓXIMO PASSO', '>Fazer o pré-check-in</a>']) {
    assert.ok(html.includes(text), `falta ${text}`);
  }
  assert.doesNotMatch(html, /Reserva confirmada<\/td>[\s\S]*Reserva confirmada<\/td>/, 'título uma vez');
});

test('sem primeiro nome, o título de boas-vindas usa o nome configurado da organização', () => {
  const settings = { ...SETTINGS, property_name: 'Monte do Cano' };
  const html = unblend(render('apos_checkin', { settings, guest: { name: '', first_name: '', email: 'x@y.invalid' } }).html);
  assert.ok(html.includes('Bem-vindo à Monte do Cano'));
  assert.ok(!html.includes('Bem-vindo à Santa Paciência'));
});

test('um botão terracota no corpo conserva o fundo e a cor do texto', () => {
  const html = composer.sanitizeBodyHtml(
    '<a href="https://x.pt" style="background:#843424;color:#fbf3ea">Reservar</a>',
    { placeholders: false },
  );
  assert.match(html, /class="sp-brand-bg"/);
  assert.doesNotMatch(html, /sp-brand-on-text/);
  assert.match(html, /color:#fbf3ea/);
  assert.match(html, /background-color:#843424/);
});
