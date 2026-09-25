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
  // Um hóspede chamado "{{acompanhe_nos}}" não pode fazer aparecer o bloco.
  const guest = { name: '{{acompanhe_nos}}', first_name: '{{acompanhe_nos}}', email: 'x@y.invalid' };
  const { html } = render('confirmacao', { guest });
  assert.ok(html.includes('{{acompanhe_nos}}'), 'o texto fica literal');
  assert.equal((html.match(/ACOMPANHE-NOS/g) || []).length, 1, 'o nome não pode injetar um segundo bloco social');
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
    const { html } = render(slug, { settings });
    assert.ok(html.includes('ACOMPANHE-NOS'), `${slug} sem bloco social`);
    assert.ok(html.includes('Instagram'), `${slug} sem Instagram`);
    assert.ok(html.includes('Website'), `${slug} sem Website`);
    assert.ok(!html.includes('>Facebook</a>'), `${slug} ignorou a seleção do alojamento`);
    assert.equal((html.match(/ACOMPANHE-NOS/g) || []).length, 1, `${slug} duplicou o bloco social`);
  }
});

test('a morada do rodapé abre uma pesquisa no mapa', () => {
  const { html } = render('confirmacao');
  assert.ok(html.includes('https://www.google.com/maps/search/?api=1&amp;query=Rua%20de%20%C3%89vora%2C%2014'));
  assert.ok(html.includes('target="_blank"'));
  assert.ok(html.includes('Rua de Évora, 14') || html.includes('Rua de &Eacute;vora, 14'));
});

test('sem endereço configurado não se desenha um botão que não leva a lado nenhum', () => {
  assert.equal(composer.buildCtaBlock('', 'Conhecer o alojamento'), '');
  assert.equal(composer.buildCtaBlock('javascript:alert(1)', 'Conhecer o alojamento'), '');
  assert.ok(composer.buildCtaBlock('https://exemplo.invalid', 'Conhecer o alojamento').includes('CONHECER O ALOJAMENTO'));
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

test('os ícones vêm de imagens HTTPS e o rótulo continua legível sem elas', () => {
  const social = composer.buildSocialBlock(SETTINGS);
  assert.ok(social.includes('https://exemplo.invalid/img/email/instagram.png'));
  assert.ok(social.includes('alt=""'), 'alt vazio: o rótulo ao lado é que nomeia o botão');
  assert.ok(social.includes('>Instagram</a>') || social.includes('Instagram</a>'), 'o texto sobrevive sem imagens');
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
  for (const marca of ['#843424', 'max-width:600px', 'ALOJAMENTO LOCAL', 'Licença AL:']) {
    assert.ok(avulso.includes(marca), `mensagem avulsa sem ${marca}`);
    assert.ok(template.includes(marca), `template sem ${marca}`);
  }
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

test('o modelo de boas-vindas tem título, botão e redes, como o print', () => {
  const { html } = render('apos_checkin');
  assert.ok(html.includes('Bem-vindo à Santa Paciência'), 'título com o nome configurado');
  assert.ok(html.includes('CONHECER O ALOJAMENTO'), 'botão do alojamento');
  assert.ok(html.includes('ACOMPANHE-NOS'), 'zona das redes sociais');
  assert.ok(html.includes('Reguengos de Monsaraz'), 'localidade dinâmica');
});

test('o modelo de confirmação tem o cartão com todas as linhas e o total', () => {
  const { html } = render('confirmacao');
  for (const label of ['Alojamento', 'Check-in', 'Check-out', 'Noites', 'Hóspedes', 'Referência', 'Total']) {
    assert.ok(html.includes(`>${label}</div>`) || html.includes(`>${label}</td>`), `falta a linha ${label}`);
  }
  assert.ok(html.includes('SP-1'), 'referência dinâmica');
  assert.ok(html.includes('Suite Mezzanine Deluxe'), 'alojamento dinâmico');
});

test('o nome configurado da organização manda no título de boas-vindas', () => {
  const settings = { ...SETTINGS, property_name: 'Monte do Cano' };
  const { html } = render('apos_checkin', { settings });
  assert.ok(html.includes('Bem-vindo à Monte do Cano'));
  assert.ok(!html.includes('Bem-vindo à Santa Paciência'));
});
