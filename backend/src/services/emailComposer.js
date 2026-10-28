// Composição visual única dos emails.
//
// Antes desta etapa existiam dois desenhos: baseTemplate() no backend (o que o
// hóspede recebia) e buildEmailPreviewHtml() no frontend (o que o utilizador
// via no editor). Divergiam em largura, cores, rodapé e botões sociais. Este
// módulo é agora a única fonte — o envio e a pré-visualização passam por aqui,
// pelo que não podem voltar a divergir.
//
// Restrições de cliente de email respeitadas em todo o ficheiro:
//  - tabelas de apresentação, nunca flex/grid (Outlook desktop usa o motor do Word);
//  - estilos essenciais inline, com <style> apenas para melhorias progressivas;
//  - sem JavaScript e sem <svg> inline (a app do Gmail remove o <svg> por completo);
//  - imagens sempre acompanhadas de texto legível, porque muitos clientes
//    bloqueiam imagens por omissão.

const sanitizeHtml = require('sanitize-html');

const PALETTE = {
  brand:       '#843424', // terracota da marca
  brandText:   '#fbf3ea', // creme sobre terracota
  brandSoft:   '#865944', // rótulos discretos, com contraste sobre creme
  pageBg:      '#efe7da', // compatibilidade com fundos de modelos antigos
  surface:     '#faf5ec', // creme do contentor
  cardBg:      '#fcf9f3', // linhas ímpares do cartão
  cardAlt:     '#f4ede1', // linhas pares do cartão (alternância suave)
  divider:     '#e0d5c4',
  text:        '#2f2a25',
  textSoft:    '#5d554c',
  muted:       '#71665b',
  accent:      '#c9a84c', // filete dourado sob o título de boas-vindas
  // Estados (etiquetas, caixas de aviso): verde = feito, âmbar = falta algo.
  okBg:        '#e6efe5',
  ok:          '#2e6b3f',
  warnBg:      '#f8ecd6',
  warn:        '#8a5a12',
  chipBg:      '#ece6dc', // etiqueta neutra
};

// A fonte pretendida é uma serifada de texto; nenhum cliente de email garante
// webfonts (o Gmail e o Outlook ignoram @font-face), por isso a pilha começa e
// acaba em fontes instaladas. Georgia é a substituição pedida.
const SERIF = "Georgia, 'Times New Roman', Times, serif";

const MAX_WIDTH = 600;

// Cores simples nos blocos; a proteção contra o modo escuro do Gmail é
// acrescentada ao email já composto, num só passo (lockColorsForGmail).
// Os outros clientes respeitam color-scheme: light.
function backgroundStyle(color) {
  return `background-color:${color};`;
}

function backgroundRule(color) {
  return `background-color:${color} !important;`;
}

function textStyle(color) {
  return `color:${color};`;
}

const TEXT_THEME_CLASSES = new Map([
  [PALETTE.text,      'sp-text'],
  [PALETTE.textSoft,  'sp-text-soft'],
  [PALETTE.muted,     'sp-muted-text'],
  [PALETTE.brand,     'sp-brand-text'],
  [PALETTE.brandText, 'sp-brand-on-text'],
  [PALETTE.brandSoft, 'sp-brand-soft-text'],
  [PALETTE.ok,        'sp-ok-text'],
  [PALETTE.warn,      'sp-warn-text'],
  ['#9a8f84',         'sp-muted-text'], // modelos guardados antes do ajuste de contraste
  ['#9c6b53',         'sp-brand-soft-text'],
]);

const BACKGROUND_THEME_CLASSES = new Map([
  [PALETTE.pageBg, 'sp-page-bg'],
  [PALETTE.surface, 'sp-surface-bg'],
  [PALETTE.cardBg, 'sp-card-bg'],
  [PALETTE.cardAlt, 'sp-card-alt-bg'],
  [PALETTE.brand, 'sp-brand-bg'],
  [PALETTE.divider, 'sp-divider-bg'],
  [PALETTE.accent, 'sp-accent-bg'],
  [PALETTE.okBg, 'sp-ok-bg'],
  [PALETTE.warnBg, 'sp-warn-bg'],
  [PALETTE.chipBg, 'sp-chip-bg'],
]);

function addClass(attribs, className) {
  const classes = new Set(String(attribs.class || '').split(/\s+/).filter(Boolean));
  classes.add(className);
  attribs.class = [...classes].join(' ');
}

// Os corpos dos modelos já guardados na base de dados não recebem alterações
// quando o código dos defaults muda. Ao sanitizar, marcamos as cores conhecidas
// da paleta com papéis semânticos (para os clientes que respeitam as classes)
// e conservamos a cor de fundo. Assim a correção também vale imediatamente
// para modelos existentes. Gradientes, texturas e -webkit-text-fill-color de
// versões anteriores já não passam no sanitizador (ver backgroundStyle).
function decorateThemeColors(tagName, attribs) {
  const style = String(attribs.style || '');
  const compact = style.replace(/\s+/g, '').toLowerCase();

  const backgroundMatch = compact.match(/(?:^|;)(?:background|background-color):(#[0-9a-f]{6})(?:;|$)/i);
  const bgcolor = String(attribs.bgcolor || '').toLowerCase();
  const classes = new Set(String(attribs.class || '').split(/\s+/).filter(c => c && c !== 'sp-ink'));
  attribs.class = [...classes].join(' ');
  if (!attribs.class) delete attribs.class;
  const classColor = [...BACKGROUND_THEME_CLASSES].find(([, name]) => classes.has(name))?.[0];
  const backgroundColor = (backgroundMatch?.[1] || bgcolor || classColor || '').toLowerCase();
  const backgroundClass = BACKGROUND_THEME_CLASSES.get(backgroundColor);
  const hasBackground = Boolean(bgcolor || classColor) || /(?:^|;)(?:background|background-color):/.test(compact);

  const textMatch = compact.match(/(?:^|;)color:(#[0-9a-f]{6})(?:;|$)/i);
  const textClass = textMatch && TEXT_THEME_CLASSES.get(textMatch[1].toLowerCase());
  if (textClass && !hasBackground) {
    addClass(attribs, textClass);
  } else if (!textMatch && !hasBackground && /^(?:p|h[1-6]|li|blockquote)$/.test(tagName)) {
    // Texto sem cor própria herda o tom do corpo.
    addClass(attribs, 'sp-text-soft');
  }

  if (backgroundClass) {
    addClass(attribs, backgroundClass);
    const currentStyle = String(attribs.style || '');
    // O atalho CSS background não passa pelo sanitizador. Conservar a cor
    // de recurso explicitamente, também nos modelos antigos.
    attribs.style = `${currentStyle}${currentStyle && !currentStyle.trim().endsWith(';') ? ';' : ''}background-color:${backgroundColor};`;
  }
}

// Marcadores do conteúdo próprio da mensagem, dentro da moldura da marca.
// A vista de Mensagens mostra o corpo sem cabeçalho/rodapé (e resume-o na
// lista de conversas); com estes comentários, extrair esse corpo é exato em
// vez de depender de encontrar a célula certa no HTML.
// A classe `email-body-bg` mantém-se na mesma célula porque é assim que as
// mensagens enviadas antes destes marcadores continuam a ser reconhecidas.
const BODY_START = '<!--sp:body-->';
const BODY_END = '<!--/sp:body-->';

// Devolve só o conteúdo da mensagem, sem a moldura da marca.
function extractBody(html) {
  const raw = String(html ?? '');
  const start = raw.indexOf(BODY_START);
  const end = raw.lastIndexOf(BODY_END);
  if (start !== -1 && end > start) return raw.slice(start + BODY_START.length, end);
  return raw;
}

// Resumo em texto simples para a lista de conversas.
function snippet(subject, html, maxLength = 80) {
  const text = extractBody(html)
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const value = text || String(subject || '');
  return value.length > maxLength ? value.slice(0, maxLength) + '…' : value;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Só http(s) e mailto chegam a um href. Protocolos como javascript:, data: ou
// vbscript: são descartados — vale tanto para ligações configuradas pelo
// utilizador (redes sociais, website) como para as que ele escreva no editor.
function safeUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  // Entidades e espaços de controlo servem para disfarçar "javascript:".
  const probe = raw.replace(/[\u0000-\u0020]/g, '').toLowerCase();
  if (/^(https?:|mailto:)/.test(probe)) return raw;
  return '';
}

function attr(value) {
  return escapeHtml(value);
}

// Montantes no formato português: 240,00 € (espaço estreito antes do símbolo,
// tal como o Intl produz). Recebe número ou string já formatada.
function formatCurrency(value) {
  const number = typeof value === 'number' ? value : Number(String(value ?? '').replace(/[^\d,.-]/g, '').replace(',', '.'));
  if (!Number.isFinite(number)) return '';
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(number);
}

// ── Sanitização do corpo editável ──────────────────────────────────────────
// O corpo vem de um editor contenteditable e é guardado como HTML. Aceitamos
// HTML real (é o que dá texto selecionável e botões clicáveis no email), mas
// nunca scripts nem atributos de evento. Aplica-se no envio E na
// pré-visualização, para o que se vê ser exatamente o que segue.
function sanitizeBodyHtml(html, { placeholders = true } = {}) {
  // O parser normaliza entidades, aspas omitidas e HTML malformado antes
  // de aplicar a lista de permissões. Nunca interpretar HTML com regex.
  const cssValue = /^(?!.*(?:url\s*\(|expression\s*\(|javascript|@|\\))[\w\s#.,%()'"+\/-]+$/i;
  const styleProperties = ['color', 'background-color', 'font-family', 'font-size', 'font-weight',
    'font-style', 'text-align', 'text-decoration', 'text-transform', 'line-height', 'letter-spacing',
    'word-break', 'overflow-wrap', 'white-space', 'vertical-align', 'display', 'width', 'max-width',
    'min-width', 'height', 'max-height', 'border', 'border-top', 'border-bottom', 'border-left',
    'border-right', 'border-color', 'border-width', 'border-style', 'border-radius', 'border-collapse',
    'border-spacing', 'background-repeat', 'padding', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
    'margin', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right', 'list-style-type'];
  return sanitizeHtml(String(html ?? ''), {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img', 'font', 'center'],
    allowedAttributes: {
      '*': ['class', 'style', 'title', 'lang', 'dir', 'align', 'valign', 'width', 'height', 'bgcolor', 'role'],
      a: ['href', 'target', 'rel'], img: ['src', 'alt'], font: ['color', 'face', 'size'],
      table: ['cellpadding', 'cellspacing', 'border'], td: ['colspan', 'rowspan'], th: ['colspan', 'rowspan', 'scope'],
    },
    allowedStyles: { '*': Object.fromEntries(styleProperties.map(name => [name, [cssValue]])) },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['http', 'https'] },
    allowProtocolRelative: false,
    transformTags: {
      '*': (tagName, attribs) => {
        for (const name of ['href', 'src']) {
          if (!(name in attribs)) continue;
          const value = attribs[name].trim();
          const placeholder = placeholders && /^\{\{\w+\}\}$/.test(value);
          if (!placeholder && (!safeUrl(value) || (name === 'src' && !/^https?:/i.test(value)))) delete attribs[name];
        }
        if (tagName === 'a' && attribs.target === '_blank') attribs.rel = 'noopener noreferrer';
        decorateThemeColors(tagName, attribs);
        return { tagName, attribs };
      },
    },
  });
}

// ── Recursos de imagem ─────────────────────────────────────────────────────
// Um cliente de email vai buscar as imagens à internet, a partir da máquina do
// destinatário: um http://localhost:3001 nunca resolve e um http:// simples é
// bloqueado por vários clientes. Por isso só emitimos <img> quando a base
// pública é HTTPS; caso contrário os botões ficam só com texto, que continua
// a ser compreensível (era esse o requisito).
function publicBaseUrl() {
  try { return require('./publicOrigin').configuredOrigin(); } catch { return ''; }
}

function emailAssetUrl(relativePath) {
  const base = publicBaseUrl();
  if (!/^https:\/\//i.test(base)) return '';
  return `${base}${relativePath.startsWith('/') ? '' : '/'}${relativePath}`;
}

const SOCIAL_ICONS = {
  instagram:   '/img/email/instagram.png',
  facebook:    '/img/email/facebook.png',
  website:     '/img/email/website.png',
  tripadvisor: '/img/email/tripadvisor.png',
};

function iconImg(key) {
  const url = emailAssetUrl(SOCIAL_ICONS[key]);
  if (!url) return '';
  // alt vazio de propósito: o rótulo de texto ao lado já diz o que é, e um alt
  // repetido faria o botão ler "Instagram Instagram" com imagens bloqueadas.
  return `<img src="${attr(url)}" width="14" height="14" alt="" style="width:14px;height:14px;vertical-align:middle;margin-right:5px;border:0;display:inline-block;" />`;
}

// ── Blocos reutilizáveis ───────────────────────────────────────────────────

// Cabeçalho terracota só com o logótipo. Os avisos à equipa levam por baixo
// a etiqueta "Aviso à equipa", para não se confundirem com os do hóspede.
function buildHeader(settings, { label = '' } = {}) {
  const logo = safeUrl(settings.logo_url);
  const name = settings.property_name || 'Alojamento';
  const width = label ? 160 : 200;
  const logoHtml = logo
    ? `<img src="${attr(logo)}" width="${width}" alt="${attr(name)}" style="display:block;margin:0 auto;width:${width}px;max-width:70%;height:auto;border:0;" />`
    : `<div class="sp-brand-on-text" style="font-family:${SERIF};font-size:30px;${textStyle(PALETTE.brandText)}">${escapeHtml(name)}</div>`;
  const labelHtml = label
    ? `<div class="sp-brand-subtext" style="font-family:${SERIF};font-size:11px;letter-spacing:3px;color:rgba(251,243,234,.82);margin:10px 0 0;">${escapeHtml(label).toUpperCase()}</div>`
    : '';
  return `<tr>
    <td align="center" bgcolor="${PALETTE.brand}" class="sp-brand-bg" style="${backgroundStyle(PALETTE.brand)}padding:24px 24px ${label ? '18px' : '24px'};border-radius:10px 10px 0 0;text-align:center;">
      ${logoHtml}${labelHtml}
    </td>
  </tr>`;
}

function buildFooter(settings, { social = true } = {}) {
  const name    = escapeHtml(settings.property_name || '');
  const rawAddress = String(settings.property_address || '').trim();
  const address = escapeHtml(rawAddress);
  const license = escapeHtml(settings.license_number || '');
  const contact = safeUrl(settings.email_contact ? `mailto:${settings.email_contact}` : '');

  // Campos opcionais vazios não deixam separadores nem rótulos soltos.
  const lines = [];
  const mapUrl = rawAddress
    ? safeUrl(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(rawAddress)}`)
    : '';
  const addressHtml = mapUrl
    ? `<a href="${attr(mapUrl)}" target="_blank" rel="noopener noreferrer" class="sp-muted-text" style="${textStyle(PALETTE.muted)}text-decoration:underline;">${address}</a>`
    : address;
  const identity = [name, addressHtml].filter(Boolean).join(' · ');
  if (identity) lines.push(identity);
  if (license)  lines.push(`Licença AL: ${license}`);
  if (contact)  lines.push(`<a href="${attr(contact)}" class="sp-brand-text" style="${textStyle(PALETTE.brand)}text-decoration:underline;">${escapeHtml(settings.email_contact)}</a>`);
  const socialHtml = social ? buildSocialBlock(settings) : '';
  if (!lines.length && !socialHtml) return '';

  return `<tr>
    <td bgcolor="${PALETTE.surface}" class="sp-pad sp-surface-bg" style="${backgroundStyle(PALETTE.surface)}padding:8px 40px 30px;">
      ${divider()}
      ${socialHtml}
      ${lines.length ? `<p class="sp-muted-text" style="font-family:${SERIF};font-size:13px;line-height:1.65;${textStyle(PALETTE.muted)}text-align:center;margin:14px 0 0;">
        ${lines.join('<br />')}
      </p>` : ''}
    </td>
  </tr>`;
}

function divider(marginTop = 0) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;${marginTop ? `margin-top:${marginTop}px;` : ''}">
    <tr><td height="1" bgcolor="${PALETTE.divider}" class="sp-divider-bg" style="height:1px;line-height:1px;font-size:0;${backgroundStyle(PALETTE.divider)}">&nbsp;</td></tr>
  </table>`;
}

// Redes sociais discretas no rodapé dos emails ao hóspede: só texto
// ("Instagram · Website"), com o ícone quando a base pública é HTTPS. Só
// aparecem as ligações configuradas e com protocolo válido.
function buildSocialBlock(settings) {
  const enabled = settings.social_links_enabled;
  const entries = [
    ['instagram',   'Instagram',   settings.instagram],
    ['facebook',    'Facebook',    settings.facebook],
    ['website',     'Website',     settings.website],
    ['tripadvisor', 'TripAdvisor', settings.tripadvisor],
  ].filter(([key, , url]) => safeUrl(url) && (!enabled || enabled.includes(key)));
  if (!entries.length) return '';

  const links = entries.map(([key, label, url]) => `<a href="${attr(safeUrl(url))}" class="sp-brand-text" style="${textStyle(PALETTE.brand)}text-decoration:none;font-family:${SERIF};font-size:13.5px;white-space:nowrap;">${iconImg(key)}${escapeHtml(label)}</a>`)
    .join(`<span class="sp-muted-text" style="${textStyle(PALETTE.muted)}padding:0 8px;">·</span>`);

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="sp-social-block" style="width:100%;margin:16px 0 0;">
    <tr><td align="center" style="padding:0;line-height:2;">${links}</td></tr>
  </table>`;
}

// Mantido para os modelos que ainda têm {{acompanhe_nos}} no corpo: as redes
// passaram para o rodapé, por isso o bloco no corpo já não acrescenta nada.
function buildSocialFooter() {
  return '';
}

// Botão: frase normal (sem maiúsculas, que partiam em duas linhas no
// telemóvel) e da largura do conteúdo. O secundário é só contorno. Sem
// endereço devolve vazio: mais vale não haver botão do que um que não leva a
// lado nenhum.
function buttonCell(href, label, secondary) {
  const bg = secondary ? PALETTE.surface : PALETTE.brand;
  const bgClass = secondary ? 'sp-surface-bg' : 'sp-brand-bg';
  const textClass = secondary ? 'sp-brand-text' : 'sp-brand-on-text';
  const color = secondary ? PALETTE.brand : PALETTE.brandText;
  return `<td align="center" bgcolor="${bg}" class="${bgClass}" style="${backgroundStyle(bg)}border:1.5px solid ${PALETTE.brand};border-radius:10px;">
    <a href="${attr(href)}" class="${textClass}" style="display:block;padding:14px 18px;font-family:${SERIF};font-size:16px;font-weight:bold;line-height:1.3;${textStyle(color)}text-decoration:none;text-align:center;">${escapeHtml(label)}</a>
  </td>`;
}

function buildButton(url, label, { secondary = false } = {}) {
  const href = safeUrl(url);
  if (!href) return '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:${secondary ? '12px' : '24px'} 0 6px;">
    <tr>${buttonCell(href, label, secondary)}</tr>
  </table>`;
}

// Dois botões lado a lado (o primeiro cheio, o segundo em contorno). Se só um
// tiver endereço, fica sozinho e cheio.
function buildButtonPair(first, second) {
  const a = first && safeUrl(first.url) ? first : null;
  const b = second && safeUrl(second.url) ? second : null;
  if (!a || !b) return buildButton((a || b)?.url, (a || b)?.label || '');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:24px 0 6px;">
    <tr>
      ${buttonCell(safeUrl(a.url), a.label, false).replace('<td ', '<td width="49%" ')}
      <td width="2%" style="width:2%;font-size:0;line-height:0;">&nbsp;</td>
      ${buttonCell(safeUrl(b.url), b.label, true).replace('<td ', '<td width="49%" ')}
    </tr>
  </table>`;
}

// Compatibilidade: modelos guardados com {{botao_...}} usam o botão principal.
function buildCtaBlock(url, label) {
  return buildButton(url, label);
}

const TONES = {
  ok:    { bg: PALETTE.okBg,    bgClass: 'sp-ok-bg',       text: PALETTE.ok,      textClass: 'sp-ok-text' },
  warn:  { bg: PALETTE.warnBg,  bgClass: 'sp-warn-bg',     text: PALETTE.warn,    textClass: 'sp-warn-text' },
  muted: { bg: PALETTE.chipBg,  bgClass: 'sp-chip-bg',     text: PALETTE.textSoft, textClass: 'sp-text-soft' },
  brand: { bg: PALETTE.cardAlt, bgClass: 'sp-card-alt-bg', text: PALETTE.brand,   textClass: 'sp-brand-text' },
};
const tone = name => TONES[name] || TONES.brand;

// Título do email: etiqueta do estado (opcional) e a frase principal.
function buildTitle({ eyebrow = '', tone: toneName = 'brand', headline = '' } = {}) {
  const t = tone(toneName);
  const chip = eyebrow
    ? `<tr><td style="padding:0 0 12px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td bgcolor="${t.bg}" class="${t.bgClass}" style="${backgroundStyle(t.bg)}border-radius:999px;padding:6px 12px;">
          <span class="${t.textClass}" style="font-family:${SERIF};font-size:11px;font-weight:bold;letter-spacing:2px;${textStyle(t.text)}">${escapeHtml(eyebrow).toUpperCase()}</span>
        </td></tr></table></td></tr>`
    : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 16px;">
    ${chip}
    <tr><td class="sp-text" style="font-family:${SERIF};font-size:27px;font-weight:bold;line-height:1.25;${textStyle(PALETTE.text)}">${escapeHtml(headline)}</td></tr>
  </table>`;
}

const label = text => `<div class="sp-muted-text" style="font-family:${SERIF};font-size:11px;letter-spacing:1.5px;line-height:1.4;${textStyle(PALETTE.muted)}">${escapeHtml(text).toUpperCase()}</div>`;

// Estadia: entrada e saída lado a lado, e o quarto, as noites e os hóspedes
// numa linha por baixo.
function buildStay({ checkin = '', checkinNote = '', checkout = '', checkoutNote = '', summary = '' } = {}) {
  if (!checkin && !checkout) return '';
  const side = (title, value, note) => `${label(title)}
    <div class="sp-text" style="font-family:${SERIF};font-size:18px;font-weight:bold;line-height:1.35;${textStyle(PALETTE.text)}margin:4px 0 0;">${escapeHtml(value)}</div>
    ${note ? `<div class="sp-text-soft" style="font-family:${SERIF};font-size:14px;line-height:1.4;${textStyle(PALETTE.textSoft)}">${escapeHtml(note)}</div>` : ''}`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:20px 0;border:1px solid ${PALETTE.divider};border-radius:12px;border-collapse:separate;border-spacing:0;">
    <tr>
      <td width="50%" valign="top" bgcolor="${PALETTE.cardBg}" class="sp-card-bg" style="${backgroundStyle(PALETTE.cardBg)}width:50%;padding:14px 16px;border-right:1px solid ${PALETTE.divider};border-radius:12px 0 0 ${summary ? '0' : '12px'};">${side('Entrada', checkin, checkinNote)}</td>
      <td width="50%" valign="top" bgcolor="${PALETTE.cardBg}" class="sp-card-bg" style="${backgroundStyle(PALETTE.cardBg)}width:50%;padding:14px 16px;border-radius:0 12px ${summary ? '0' : '12px'} 0;">${side('Saída', checkout, checkoutNote)}</td>
    </tr>
    ${summary ? `<tr><td colspan="2" bgcolor="${PALETTE.cardAlt}" class="sp-card-alt-bg sp-text-soft" style="${backgroundStyle(PALETTE.cardAlt)}padding:11px 16px;font-family:${SERIF};font-size:14px;line-height:1.45;${textStyle(PALETTE.textSoft)}border-top:1px solid ${PALETTE.divider};border-radius:0 0 12px 12px;">${escapeHtml(summary)}</td></tr>` : ''}
  </table>`;
}

// Pagamento: quanto já foi pago, a barra do progresso e o que falta.
// Recebe os valores já formatados e a percentagem (0–100).
function buildPaymentProgress({ paid = '', total = '', missing = '', deadline = '', percent = 0, settled = false } = {}) {
  if (!total) return '';
  const pct = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  const bar = pct >= 100
    ? `<td height="10" bgcolor="${PALETTE.brand}" class="sp-brand-bg" style="height:10px;font-size:0;line-height:0;${backgroundStyle(PALETTE.brand)}border-radius:999px;">&nbsp;</td>`
    : pct <= 0
      ? `<td height="10" bgcolor="${PALETTE.cardAlt}" class="sp-card-alt-bg" style="height:10px;font-size:0;line-height:0;${backgroundStyle(PALETTE.cardAlt)}border-radius:999px;">&nbsp;</td>`
      : `<td width="${pct}%" height="10" bgcolor="${PALETTE.brand}" class="sp-brand-bg" style="width:${pct}%;height:10px;font-size:0;line-height:0;${backgroundStyle(PALETTE.brand)}border-radius:999px 0 0 999px;">&nbsp;</td>
         <td height="10" bgcolor="${PALETTE.cardAlt}" class="sp-card-alt-bg" style="height:10px;font-size:0;line-height:0;${backgroundStyle(PALETTE.cardAlt)}border-radius:0 999px 999px 0;">&nbsp;</td>`;
  const after = settled
    ? `<div class="sp-ok-text" style="font-family:${SERIF};font-size:14px;font-weight:bold;${textStyle(PALETTE.ok)}margin:10px 0 0;">Pago na totalidade</div>`
    : `<div class="sp-text-soft" style="font-family:${SERIF};font-size:14px;line-height:1.5;${textStyle(PALETTE.textSoft)}margin:10px 0 0;">Falta <strong class="sp-text" style="${textStyle(PALETTE.text)}">${escapeHtml(missing)}</strong>${deadline ? ` até <strong class="sp-text" style="${textStyle(PALETTE.text)}">${escapeHtml(deadline)}</strong>` : ''}</div>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:20px 0;border:1px solid ${PALETTE.divider};border-radius:12px;border-collapse:separate;">
    <tr><td bgcolor="${PALETTE.cardBg}" class="sp-card-bg" style="${backgroundStyle(PALETTE.cardBg)}padding:16px;border-radius:12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
        <tr>
          <td class="sp-text-soft" style="font-family:${SERIF};font-size:14px;${textStyle(PALETTE.textSoft)}">Pago</td>
          <td align="right" class="sp-text-soft" style="font-family:${SERIF};font-size:14px;${textStyle(PALETTE.textSoft)}">Total ${escapeHtml(total)}</td>
        </tr>
      </table>
      <div class="sp-text" style="font-family:${SERIF};font-size:24px;font-weight:bold;line-height:1.3;${textStyle(PALETTE.text)}margin:2px 0 10px;">${escapeHtml(paid)}</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr>${bar}</tr></table>
      ${after}
    </td></tr>
  </table>`;
}

// Caixa de destaque (próximo passo, aviso importante). `html` é construído no
// servidor, com os valores já escapados.
function buildNote({ heading = '', html = '', tone: toneName = 'brand' } = {}) {
  if (!html) return '';
  const t = tone(toneName);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:20px 0;">
    <tr><td bgcolor="${t.bg}" class="${t.bgClass}" style="${backgroundStyle(t.bg)}border-left:4px solid ${t.text};border-radius:10px;padding:14px 16px;">
      ${heading ? `<div class="${t.textClass}" style="font-family:${SERIF};font-size:12px;font-weight:bold;letter-spacing:1.5px;${textStyle(t.text)}margin:0 0 6px;">${escapeHtml(heading).toUpperCase()}</div>` : ''}
      <div class="sp-text" style="font-family:${SERIF};font-size:15px;line-height:1.55;${textStyle(PALETTE.text)}">${html}</div>
    </td></tr>
  </table>`;
}

// Linhas rótulo / valor (resumo de um cancelamento, aviso à equipa).
function buildRows(rows) {
  const list = (rows || []).filter(row => row && row.value !== '' && row.value !== null && row.value !== undefined);
  if (!list.length) return '';
  const last = list.length - 1;
  // Cantos arredondados só nas células dos cantos (o sanitizador só aceita
  // o atalho border-radius).
  const radius = (i, side) => {
    const top = i === 0 ? '12px' : '0';
    const bottom = i === last ? '12px' : '0';
    return side === 'left' ? `border-radius:${top} 0 0 ${bottom};` : `border-radius:0 ${top} ${bottom} 0;`;
  };
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:20px 0;border:1px solid ${PALETTE.divider};border-radius:12px;border-collapse:separate;border-spacing:0;">
    ${list.map((row, i) => `<tr>
      <td bgcolor="${PALETTE.cardBg}" class="sp-card-bg sp-muted-text" style="${backgroundStyle(PALETTE.cardBg)}padding:11px 16px;font-family:${SERIF};font-size:15px;${textStyle(PALETTE.muted)}${i ? `border-top:1px solid ${PALETTE.divider};` : ''}${radius(i, 'left')}">${escapeHtml(row.label)}</td>
      <td align="right" bgcolor="${PALETTE.cardBg}" class="sp-card-bg sp-text" style="${backgroundStyle(PALETTE.cardBg)}padding:11px 16px;font-family:${SERIF};font-size:15px;font-weight:bold;${textStyle(PALETTE.text)}text-align:right;${i ? `border-top:1px solid ${PALETTE.divider};` : ''}${radius(i, 'right')}">${escapeHtml(row.value)}</td>
    </tr>`).join('')}
  </table>`;
}

// Códigos para usar à porta (código da porta, Wi-Fi): letra grande e
// monoespaçada. Valores vazios não aparecem.
function buildCodes(list) {
  const items = (list || []).filter(item => item && item.value);
  if (!items.length) return '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:20px 0;border-collapse:separate;border-spacing:0 10px;">
    ${items.map(item => `<tr><td bgcolor="${PALETTE.cardBg}" class="sp-card-bg" style="${backgroundStyle(PALETTE.cardBg)}border:1px solid ${PALETTE.divider};border-radius:12px;padding:12px 16px;">
      ${label(item.label)}
      <div class="sp-text" style="font-family:'Courier New',Courier,monospace;font-size:22px;font-weight:bold;letter-spacing:1px;line-height:1.35;${textStyle(PALETTE.text)}margin:4px 0 0;">${escapeHtml(item.value)}</div>
    </td></tr>`).join('')}
  </table>`;
}

// Lista com visto (o que é pedido no pré-check-in, o que fazer antes de sair).
function buildChecklist(items) {
  const list = (items || []).filter(Boolean);
  if (!list.length) return '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:16px 0;">
    ${list.map(item => `<tr>
      <td width="30" valign="top" style="width:30px;padding:6px 10px 6px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="20" height="20" align="center" bgcolor="${PALETTE.cardAlt}" class="sp-card-alt-bg sp-brand-text" style="${backgroundStyle(PALETTE.cardAlt)}width:20px;height:20px;border-radius:999px;font-family:${SERIF};font-size:12px;font-weight:bold;${textStyle(PALETTE.brand)}text-align:center;">✓</td></tr></table>
      </td>
      <td valign="top" class="sp-text-soft" style="padding:6px 0;font-family:${SERIF};font-size:15px;line-height:1.5;${textStyle(PALETTE.textSoft)}">${escapeHtml(item)}</td>
    </tr>`).join('')}
  </table>`;
}

// Passos numerados (o que acontece a seguir a um pedido).
function buildSteps(items) {
  const list = (items || []).filter(Boolean);
  if (!list.length) return '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:16px 0;">
    ${list.map((item, i) => {
      const bg = i === 0 ? PALETTE.brand : PALETTE.cardAlt;
      return `<tr>
      <td width="36" valign="top" style="width:36px;padding:6px 10px 6px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="26" height="26" align="center" bgcolor="${bg}" class="${i === 0 ? 'sp-brand-bg sp-brand-on-text' : 'sp-card-alt-bg sp-brand-text'}" style="${backgroundStyle(bg)}width:26px;height:26px;border-radius:999px;font-family:${SERIF};font-size:13px;font-weight:bold;${textStyle(i === 0 ? PALETTE.brandText : PALETTE.brand)}text-align:center;">${i + 1}</td></tr></table>
      </td>
      <td valign="top" class="sp-text-soft" style="padding:9px 0 6px;font-family:${SERIF};font-size:15px;line-height:1.5;${textStyle(PALETTE.textSoft)}">${escapeHtml(item)}</td>
    </tr>`;
    }).join('')}
  </table>`;
}

// Linha de contacto no fim dos emails ao hóspede.
function buildContactLine(settings) {
  const contact = settings?.email_contact;
  const mail = contact && safeUrl(`mailto:${contact}`);
  return `<p class="sp-text-soft" style="font-family:${SERIF};font-size:14.5px;line-height:1.6;${textStyle(PALETTE.textSoft)}text-align:center;margin:18px 0 4px;">Dúvidas? Responda a este email${mail ? ` ou escreva para <a href="${attr(mail)}" class="sp-brand-text" style="${textStyle(PALETTE.brand)}">${escapeHtml(contact)}</a>` : ''}.</p>`;
}

// Título de boas-vindas: centrado, com filete dourado curto por baixo.
function buildWelcomeTitle(title) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
    <tr><td align="center" class="sp-text" style="font-family:${SERIF};font-size:34px;line-height:1.25;${textStyle(PALETTE.text)}padding:4px 0 0;">${escapeHtml(title)}</td></tr>
    <tr><td align="center" style="padding:20px 0 4px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="64" style="width:64px;">
        <tr><td height="1" bgcolor="${PALETTE.accent}" class="sp-accent-bg" style="height:1px;line-height:1px;font-size:0;${backgroundStyle(PALETTE.accent)}">&nbsp;</td></tr>
      </table>
    </td></tr>
  </table>`;
}

// Compatibilidade com modelos guardados que usam o título antigo.
function buildReservationTitle(title) {
  return buildTitle({ headline: title });
}

// Cartão de detalhes da reserva: rótulo pequeno por cima do valor, fundos
// alternados, faixa terracota do total no fundo. Gerado aqui (e não escrito no
// corpo editável) para o desenho não se partir ao editar o texto — os valores
// continuam todos dinâmicos.
function buildReservationCard(rows, total) {
  const cells = rows
    .filter(row => row && row.value !== '' && row.value !== null && row.value !== undefined)
    .map((row, index) => {
      const bg = index % 2 === 0 ? PALETTE.cardBg : PALETTE.cardAlt;
      const backgroundClass = index % 2 === 0 ? 'sp-card-bg' : 'sp-card-alt-bg';
      return `<tr><td bgcolor="${bg}" class="${backgroundClass}" style="${backgroundStyle(bg)}padding:12px 18px;">
        <div class="sp-muted-text" style="font-family:${SERIF};font-size:12.5px;line-height:1.4;${textStyle(PALETTE.muted)}margin:0 0 3px;">${escapeHtml(row.label)}</div>
        <div class="sp-text" style="font-family:${SERIF};font-size:16px;line-height:1.45;${textStyle(PALETTE.text)}">${escapeHtml(row.value)}</div>
      </td></tr>`;
    }).join('');

  const totalRow = total === '' || total === null || total === undefined ? '' : `<tr>
    <td bgcolor="${PALETTE.brand}" class="sp-brand-bg" style="${backgroundStyle(PALETTE.brand)}padding:15px 18px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
        <tr>
          <td align="left" class="sp-brand-on-text" style="font-family:${SERIF};font-size:18px;font-weight:bold;${textStyle(PALETTE.brandText)}">Total</td>
          <td align="right" class="sp-brand-on-text" style="font-family:${SERIF};font-size:18px;font-weight:bold;${textStyle(PALETTE.brandText)}">${escapeHtml(total)}</td>
        </tr>
      </table>
    </td>
  </tr>`;

  if (!cells && !totalRow) return '';

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:24px 0;border:0;border-collapse:separate;border-spacing:0;">
    ${cells}${totalRow}
  </table>`;
}

// ── Modo escuro do Gmail do iPhone ─────────────────────────────────────────
// O Gmail inverte as cores do email por conta própria (ignora color-scheme).
// Para o email ficar igual ao modo claro (confirmado no iPhone a 26/10/2026,
// versão B do teste de cores):
//  1. cada fundo leva um gradiente da mesma cor, em que o Gmail não mexe;
//  2. cada texto vai em duas camadas de mistura que só o Gmail ativa
//     (u + .body): no Gmail invertido, «difference» repõe o branco e
//     «screen»/«exclusion» devolvem letra clara sobre terracota ou escura
//     sobre creme. Nos outros clientes as camadas não têm estilo;
//  3. estas regras vão em blocos <style> próprios, sem nada que o Gmail
//     possa recusar, para não dependerem do bloco principal.
// Fonte: hteumeuleu.com/2021/fixing-gmail-dark-mode-css-blend-modes/
const LIGHT_TEXT = /\bsp-(?:brand-on-text|brand-subtext)\b/;
const DARK_TEXT = /\bsp-(?:text|text-soft|muted-text|brand-text|brand-soft-text|ok-text|warn-text)\b/;
const LIGHT_SURFACE = /\bsp-(?:surface|card|card-alt|page|divider|ok|warn|chip)-bg\b/;

const GMAIL_BLEND_STYLES = ['u + .body', 'u ~ .body', 'u + div.body']
  .map(scope => `<style>
${scope} .sp-gs { background:#000; mix-blend-mode:screen; }
${scope} .sp-ge { background:#000; mix-blend-mode:exclusion; }
${scope} .sp-gd { background:#000; mix-blend-mode:difference; color:#fff; }
</style>`).join('\n');

function lockBackgrounds(html) {
  return html.replace(/style="([^"]*)"/g, (whole, style) => {
    const bg = style.match(/background-color:\s*(#[0-9a-fA-F]{6})/);
    if (!bg || /background-image/i.test(style)) return whole;
    return `style="${style}${style.trim().endsWith(';') || !style.trim() ? '' : ';'}background-image:linear-gradient(${bg[1]},${bg[1]});"`;
  });
}

function blendText(inner) {
  const frames = [];
  return sanitizeHtml(inner.replace(BODY_START, '<sp-body-start></sp-body-start>').replace(BODY_END, '<sp-body-end></sp-body-end>'), {
    allowedTags: false,
    allowedAttributes: false,
    allowVulnerableTags: true,
    onOpenTag(tag, attribs) {
      const parent = frames.at(-1) || { light: false, done: false };
      const classes = String(attribs.class || '');
      let light = parent.light;
      if (/\bsp-brand-bg\b/.test(classes)) light = true;
      if (LIGHT_SURFACE.test(classes) || DARK_TEXT.test(classes)) light = false;
      if (LIGHT_TEXT.test(classes)) light = true;
      // Texto já protegido (ex.: corpo de um email anterior) não leva outra camada.
      frames.push({ light, done: parent.done || /\bsp-gd\b/.test(classes) || tag === 'style' || tag === 'title' });
    },
    onCloseTag() { frames.pop(); },
    textFilter(text) {
      const frame = frames.at(-1);
      if (!frame || frame.done || !text.replace(/&(?:nbsp|#160);/g, '').trim()) return text;
      return `<span class="sp-g${frame.light ? 's' : 'e'}"><span class="sp-gd">${text}</span></span>`;
    },
  })
    // O parser pode separar entidades do resto do mesmo nó de texto.
    .replace(/<\/span><\/span><span class="sp-g[se]"><span class="sp-gd">/g, '')
    .replace('<sp-body-start></sp-body-start>', BODY_START)
    .replace('<sp-body-end></sp-body-end>', BODY_END);
}

function lockColorsForGmail(html) {
  const locked = lockBackgrounds(html);
  const match = locked.match(/(<body\b[^>]*>)([\s\S]*)(<\/body>)/);
  if (!match) return locked;
  const head = locked.slice(0, match.index).replace('<style>', `${GMAIL_BLEND_STYLES}\n<style>`);
  return `${head}${match[1]}${blendText(match[2])}${match[3]}${locked.slice(match.index + match[0].length)}`;
}

// ── Documento completo ─────────────────────────────────────────────────────

function normalizeBodyParagraph(bodyHtml) {
  const html = String(bodyHtml || '');
  let hasBlock = false;
  // Usar o parser também nesta decisão: texto com "<" ou HTML escapado não
  // equivale a uma etiqueta. O corpo já foi sanitizado antes da composição.
  sanitizeHtml(html, {
    onOpenTag(tag) {
      if (/^(?:p|div|h[1-6]|table|ul|ol|li|blockquote|pre|hr|section|article|address|dl|figure)$/.test(tag)) hasBlock = true;
    },
  });
  if (hasBlock || !html.trim()) return html;
  // Uma linha escrita no contenteditable chega como texto/strong/br, sem
  // parágrafo. Dar-lhe a mesma cor e estrutura explícitas dos modelos; não
  // depender só da herança da célula que também possui o fundo bloqueado.
  return `<p class="sp-text-soft" style="font-family:${SERIF};font-size:16px;line-height:1.7;${textStyle(PALETTE.textSoft)}margin:0 0 14px;">${html}</p>`;
}

// Opções: `title` (o <title>), `headerLabel` (etiqueta por baixo do logótipo,
// ex.: "Aviso à equipa") e `social` (redes no rodapé; false nos emails à
// equipa e de conta).
function composeEmail(bodyHtml, settings, options = {}) {
  const s = settings || {};
  const title = escapeHtml(options.title || s.property_name || 'Santa Paciência');
  bodyHtml = normalizeBodyParagraph(bodyHtml);
  return lockColorsForGmail(`<!DOCTYPE html>
<html lang="pt" class="sp-email-root" style="color-scheme:light only;supported-color-schemes:light;">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1.0" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${title}</title>
<style>
  :root { color-scheme: light only; supported-color-schemes: light; }
  .sp-email-root, .sp-email { color-scheme: light only !important; supported-color-schemes: light !important; }

  /* Mantém a paleta clara nos clientes que respeitam color-scheme (Apple
     Mail) e no Outlook (data-ogsc/data-ogsb). O Gmail móvel ignora-o: ver
     lockColorsForGmail. */
  .sp-page-bg { ${backgroundRule(PALETTE.pageBg)} }
  .sp-surface-bg { ${backgroundRule(PALETTE.surface)} }
  .sp-card-bg { ${backgroundRule(PALETTE.cardBg)} }
  .sp-card-alt-bg { ${backgroundRule(PALETTE.cardAlt)} }
  .sp-brand-bg { ${backgroundRule(PALETTE.brand)} }
  .sp-divider-bg { ${backgroundRule(PALETTE.divider)} }
  .sp-accent-bg { ${backgroundRule(PALETTE.accent)} }
  .sp-ok-bg { ${backgroundRule(PALETTE.okBg)} }
  .sp-warn-bg { ${backgroundRule(PALETTE.warnBg)} }
  .sp-chip-bg { ${backgroundRule(PALETTE.chipBg)} }
  .sp-ok-text { color:${PALETTE.ok} !important; }
  .sp-warn-text { color:${PALETTE.warn} !important; }
  .sp-text { color:${PALETTE.text} !important; }
  .sp-text-soft { color:${PALETTE.textSoft} !important; }
  .sp-muted-text { color:${PALETTE.muted} !important; }
  .sp-brand-text { color:${PALETTE.brand} !important; }
  .sp-brand-on-text { color:${PALETTE.brandText} !important; }
  .sp-brand-soft-text { color:${PALETTE.brandSoft} !important; }
  .sp-brand-subtext { color:rgba(251,243,234,.82) !important; }

  [data-ogsc] .sp-page-bg, [data-ogsb] .sp-page-bg { background-color:${PALETTE.pageBg} !important; color-scheme:light only !important; }
  [data-ogsc] .sp-surface-bg, [data-ogsb] .sp-surface-bg { background-color:${PALETTE.surface} !important; }
  [data-ogsc] .sp-card-bg, [data-ogsb] .sp-card-bg { background-color:${PALETTE.cardBg} !important; }
  [data-ogsc] .sp-card-alt-bg, [data-ogsb] .sp-card-alt-bg { background-color:${PALETTE.cardAlt} !important; }
  [data-ogsc] .sp-brand-bg, [data-ogsb] .sp-brand-bg { background-color:${PALETTE.brand} !important; }
  [data-ogsc] .sp-text, [data-ogsb] .sp-text { color:${PALETTE.text} !important; }
  [data-ogsc] .sp-text-soft, [data-ogsb] .sp-text-soft { color:${PALETTE.textSoft} !important; }
  [data-ogsc] .sp-muted-text, [data-ogsb] .sp-muted-text { color:${PALETTE.muted} !important; }
  [data-ogsc] .sp-brand-text, [data-ogsb] .sp-brand-text { color:${PALETTE.brand} !important; }
  [data-ogsc] .sp-brand-on-text, [data-ogsb] .sp-brand-on-text { color:${PALETTE.brandText} !important; }

  @media (prefers-color-scheme: dark) {
    .sp-page-bg { background-color:${PALETTE.pageBg} !important; color:${PALETTE.text} !important; }
    .sp-surface-bg { background-color:${PALETTE.surface} !important; }
    .sp-card-bg { background-color:${PALETTE.cardBg} !important; }
    .sp-card-alt-bg { background-color:${PALETTE.cardAlt} !important; }
    .sp-brand-bg { background-color:${PALETTE.brand} !important; }
    .sp-text { color:${PALETTE.text} !important; }
    .sp-text-soft { color:${PALETTE.textSoft} !important; }
    .sp-muted-text { color:${PALETTE.muted} !important; }
    .sp-brand-text { color:${PALETTE.brand} !important; }
    .sp-brand-on-text { color:${PALETTE.brandText} !important; }
    .sp-ok-bg { background-color:${PALETTE.okBg} !important; }
    .sp-warn-bg { background-color:${PALETTE.warnBg} !important; }
    .sp-chip-bg { background-color:${PALETTE.chipBg} !important; }
    .sp-ok-text { color:${PALETTE.ok} !important; }
    .sp-warn-text { color:${PALETTE.warn} !important; }
  }
  /* Melhoria progressiva: em 320–430px o contentor já encolhe por max-width,
     aqui só se recupera largura útil reduzindo o avanço lateral. */
  @media only screen and (max-width: 480px) {
    .sp-pad { padding-left: 22px !important; padding-right: 22px !important; }
    .sp-outer { padding:8px 0 !important; }
  }
</style>
</head>
<body class="body sp-email sp-text" style="margin:0;padding:0;background-color:transparent;font-family:${SERIF};${textStyle(PALETTE.text)}color-scheme:light only;supported-color-schemes:light;-webkit-text-size-adjust:100%;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="sp-email-shell" style="width:100%;background-color:transparent;">
  <tr><td align="center" class="sp-outer" style="padding:16px 12px;">
    <table role="presentation" width="${MAX_WIDTH}" cellpadding="0" cellspacing="0" border="0" class="sp-surface-bg" bgcolor="${PALETTE.surface}" style="width:100%;max-width:${MAX_WIDTH}px;${backgroundStyle(PALETTE.surface)}border-radius:10px;border-collapse:separate;overflow:hidden;">
      ${buildHeader(s, { label: options.headerLabel || '' })}
      <tr><td bgcolor="${PALETTE.surface}" class="sp-pad sp-surface-bg sp-email-body email-body-bg" style="${backgroundStyle(PALETTE.surface)}padding:28px 40px 10px;font-family:${SERIF};font-size:16px;line-height:1.7;${textStyle(PALETTE.textSoft)}">${BODY_START}${bodyHtml}${BODY_END}</td></tr>
      ${buildFooter(s, { social: options.social !== false })}
    </table>
  </td></tr>
</table>
</body>
</html>`);
}

module.exports = {
  BODY_START,
  BODY_END,
  extractBody,
  snippet,
  PALETTE,
  SERIF,
  MAX_WIDTH,
  escapeHtml,
  safeUrl,
  formatCurrency,
  sanitizeBodyHtml,
  emailAssetUrl,
  publicBaseUrl,
  divider,
  buildHeader,
  buildFooter,
  buildSocialBlock,
  buildSocialFooter,
  buildCtaBlock,
  buildButton,
  buildButtonPair,
  buildTitle,
  buildStay,
  buildPaymentProgress,
  buildNote,
  buildRows,
  buildCodes,
  buildChecklist,
  buildSteps,
  buildContactLine,
  buildWelcomeTitle,
  buildReservationTitle,
  buildReservationCard,
  composeEmail,
};
