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
  brandSoft:   '#9c6b53', // terracota dessaturado (rótulos discretos)
  brandBorder: '#c08a6e', // contorno dos botões sociais
  pageBg:      '#efe7da', // creme por trás do contentor
  surface:     '#faf5ec', // creme do contentor
  cardBg:      '#fcf9f3', // linhas ímpares do cartão
  cardAlt:     '#f4ede1', // linhas pares do cartão (alternância suave)
  cardBorder:  '#e8decf',
  rowBorder:   '#f0e8da',
  divider:     '#e0d5c4',
  text:        '#2f2a25',
  textSoft:    '#5d554c',
  muted:       '#9a8f84',
  accent:      '#c9a84c', // filete dourado sob o título de boas-vindas
};

// A fonte pretendida é uma serifada de texto; nenhum cliente de email garante
// webfonts (o Gmail e o Outlook ignoram @font-face), por isso a pilha começa e
// acaba em fontes instaladas. Georgia é a substituição pedida.
const SERIF = "Georgia, 'Times New Roman', Times, serif";

const MAX_WIDTH = 600;

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
    'border-spacing', 'padding', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
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
  return String(process.env.PUBLIC_APP_URL || process.env.FRONTEND_PUBLIC_URL || '').replace(/\/$/, '');
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

function iconImg(key, color) {
  const url = emailAssetUrl(SOCIAL_ICONS[key]);
  if (!url) return '';
  // alt vazio de propósito: o rótulo de texto ao lado já diz o que é, e um alt
  // repetido faria o botão ler "Instagram Instagram" com imagens bloqueadas.
  return `<img src="${attr(url)}" width="16" height="16" alt="" style="width:16px;height:16px;vertical-align:middle;margin-right:8px;border:0;display:inline-block;" />`;
}

// ── Blocos reutilizáveis ───────────────────────────────────────────────────

function buildHeader(settings) {
  const logo = safeUrl(settings.logo_url);
  const name = settings.property_name || 'Alojamento';
  const logoHtml = logo
    ? `<img src="${attr(logo)}" alt="${attr(name)}" style="display:block;margin:0 auto;width:auto;max-width:260px;height:auto;border:0;" />`
    : `<div style="font-family:${SERIF};font-size:30px;color:${PALETTE.brandText};">${escapeHtml(name)}</div>`;
  return `<tr>
    <td align="center" bgcolor="${PALETTE.brand}" class="sp-brand-bg" style="background:${PALETTE.brand};padding:34px 24px 26px;text-align:center;">
      ${logoHtml}
      <div style="font-family:${SERIF};font-size:13px;letter-spacing:4px;color:rgba(251,243,234,.82);margin:14px 0 0;">ALOJAMENTO LOCAL</div>
    </td>
  </tr>`;
}

function buildFooter(settings) {
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
    ? `<a href="${attr(mapUrl)}" target="_blank" rel="noopener noreferrer" style="color:${PALETTE.muted};text-decoration:underline;">${address}</a>`
    : address;
  const identity = [name, addressHtml].filter(Boolean).join(' · ');
  if (identity) lines.push(identity);
  if (license)  lines.push(`Licença AL: ${license}`);
  if (contact)  lines.push(`<a href="${attr(contact)}" style="color:${PALETTE.brand};text-decoration:underline;">${escapeHtml(settings.email_contact)}</a>`);
  if (!lines.length) return '';

  return `<tr>
    <td class="sp-pad" style="background:${PALETTE.surface};padding:0 40px 34px;">
      ${divider()}
      <p style="font-family:${SERIF};font-size:13px;line-height:1.75;color:${PALETTE.muted};text-align:center;margin:20px 0 0;">
        ${lines.join('<br />')}
      </p>
    </td>
  </tr>`;
}

function divider(marginTop = 0) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;${marginTop ? `margin-top:${marginTop}px;` : ''}">
    <tr><td height="1" style="height:1px;line-height:1px;font-size:0;background:${PALETTE.divider};">&nbsp;</td></tr>
  </table>`;
}

// Botões sociais em contorno, como no print de boas-vindas. Só aparecem as
// ligações configuradas e com protocolo válido.
function buildSocialBlock(settings) {
  const enabled = settings.social_links_enabled;
  const entries = [
    ['instagram',   'Instagram',   settings.instagram],
    ['facebook',    'Facebook',    settings.facebook],
    ['website',     'Website',     settings.website],
    ['tripadvisor', 'TripAdvisor', settings.tripadvisor],
  ].filter(([key, , url]) => safeUrl(url) && (!enabled || enabled.includes(key)));
  if (!entries.length) return '';

  const buttons = entries.map(([key, label, url]) => `<a href="${attr(safeUrl(url))}" style="display:inline-block;margin:5px 4px;padding:11px 17px;border:1px solid ${PALETTE.brandBorder};border-radius:6px;background:${PALETTE.surface};color:${PALETTE.brand};text-decoration:none;font-family:${SERIF};font-size:14px;line-height:1.2;white-space:nowrap;">${iconImg(key)}${escapeHtml(label)}</a>`).join('');

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="sp-social-block" style="width:100%;margin:30px 0 0;">
    <tr><td>${divider()}</td></tr>
    <tr><td align="center" style="padding:22px 0 10px;font-family:${SERIF};font-size:12px;letter-spacing:3px;color:${PALETTE.brandSoft};">ACOMPANHE-NOS</td></tr>
    <tr><td align="center" style="padding:0 0 4px;">${buttons}</td></tr>
  </table>`;
}

// Moldura social comum a todos os emails. Se o template já colocou o mesmo
// bloco no corpo (templates antigos ou uma posição personalizada), não volta
// a inseri-lo no rodapé.
function buildSocialFooter(settings, bodyHtml) {
  if (/\bsp-social-block\b/.test(String(bodyHtml || ''))) return '';
  const social = buildSocialBlock(settings);
  if (!social) return '';
  return `<tr>
    <td class="sp-pad sp-surface-bg" style="background:${PALETTE.surface};padding:0 40px 0;">
      ${social}
    </td>
  </tr>`;
}

// Botão terracota principal. Sem endereço configurado devolve vazio — mais
// vale não haver botão do que um botão que não leva a lado nenhum.
function buildCtaBlock(url, label) {
  const href = safeUrl(url);
  if (!href) return '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:28px 0 6px;">
    <tr><td align="center">
      <table role="presentation" width="88%" cellpadding="0" cellspacing="0" border="0" style="width:88%;">
        <tr><td align="center" bgcolor="${PALETTE.brand}" class="sp-brand-bg" style="background:${PALETTE.brand};border-radius:4px;">
          <a href="${attr(href)}" style="display:block;padding:17px 20px;font-family:${SERIF};font-size:14px;letter-spacing:2.5px;color:${PALETTE.brandText};text-decoration:none;text-align:center;">${escapeHtml(label).toUpperCase()}</a>
        </td></tr>
      </table>
    </td></tr>
  </table>`;
}

// Título de boas-vindas: centrado, com filete dourado curto por baixo.
function buildWelcomeTitle(title) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
    <tr><td align="center" style="font-family:${SERIF};font-size:34px;line-height:1.25;color:${PALETTE.text};padding:4px 0 0;">${escapeHtml(title)}</td></tr>
    <tr><td align="center" style="padding:20px 0 4px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="64" style="width:64px;">
        <tr><td height="1" style="height:1px;line-height:1px;font-size:0;background:${PALETTE.accent};">&nbsp;</td></tr>
      </table>
    </td></tr>
  </table>`;
}

// Cabeçalho do email de reserva: círculo com ícone + título. O título vem do
// estado real da reserva (ver statusPresentation em emailService), para uma
// reserva pendente nunca aparecer como confirmada.
function buildReservationTitle(title, glyph = '✓') {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;">
    <tr>
      <td width="42" valign="middle" style="width:42px;padding-right:14px;">
        <table role="presentation" width="40" cellpadding="0" cellspacing="0" border="0" style="width:40px;">
          <tr><td align="center" height="40" style="width:40px;height:40px;border:2px solid ${PALETTE.brand};border-radius:20px;font-family:${SERIF};font-size:20px;line-height:36px;color:${PALETTE.brand};text-align:center;">${escapeHtml(glyph)}</td></tr>
        </table>
      </td>
      <td valign="middle" style="font-family:${SERIF};font-size:28px;font-weight:bold;line-height:1.2;color:${PALETTE.text};">${escapeHtml(title)}</td>
    </tr>
  </table>`;
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
      return `<tr><td bgcolor="${bg}" style="background:${bg};padding:13px 18px;border-bottom:1px solid ${PALETTE.rowBorder};">
        <div style="font-family:${SERIF};font-size:12.5px;line-height:1.4;color:${PALETTE.muted};margin:0 0 3px;">${escapeHtml(row.label)}</div>
        <div style="font-family:${SERIF};font-size:16px;line-height:1.45;color:${PALETTE.text};">${escapeHtml(row.value)}</div>
      </td></tr>`;
    }).join('');

  const totalRow = total === '' || total === null || total === undefined ? '' : `<tr>
    <td bgcolor="${PALETTE.brand}" class="sp-brand-bg" style="background:${PALETTE.brand};padding:15px 18px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
        <tr>
          <td align="left" style="font-family:${SERIF};font-size:18px;font-weight:bold;color:${PALETTE.brandText};">Total</td>
          <td align="right" style="font-family:${SERIF};font-size:18px;font-weight:bold;color:${PALETTE.brandText};">${escapeHtml(total)}</td>
        </tr>
      </table>
    </td>
  </tr>`;

  if (!cells && !totalRow) return '';

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:24px 0;border:1px solid ${PALETTE.cardBorder};border-radius:8px;border-collapse:separate;overflow:hidden;">
    ${cells}${totalRow}
  </table>`;
}

// ── Documento completo ─────────────────────────────────────────────────────

function composeEmail(bodyHtml, settings, options = {}) {
  const s = settings || {};
  const title = escapeHtml(options.title || s.property_name || 'Santa Paciência');
  return `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1.0" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${title}</title>
<style>
  /* A app do Gmail (Android/iOS) reescreve cores de fundo em modo escuro,
     ignorando os metas color-scheme acima — o terracota da marca sai rosa.
     [data-ogsc]/[data-ogsb] são os hooks que a própria app injeta e são a
     única forma documentada de repor as cores. */
  [data-ogsc] .sp-brand-bg, [data-ogsb] .sp-brand-bg { background-color: ${PALETTE.brand} !important; }
  [data-ogsc] .sp-surface-bg, [data-ogsb] .sp-surface-bg { background-color: ${PALETTE.surface} !important; }
  [data-ogsc] .sp-page-bg, [data-ogsb] .sp-page-bg { background-color: ${PALETTE.pageBg} !important; }
  /* Melhoria progressiva: em 320–430px o contentor já encolhe por max-width,
     aqui só se recupera largura útil reduzindo o avanço lateral. */
  @media only screen and (max-width: 480px) {
    .sp-pad { padding-left: 22px !important; padding-right: 22px !important; }
    .sp-outer { padding-left: 8px !important; padding-right: 8px !important; }
  }
</style>
</head>
<body class="sp-page-bg" bgcolor="${PALETTE.pageBg}" style="margin:0;padding:0;background:${PALETTE.pageBg};font-family:${SERIF};color:${PALETTE.text};-webkit-text-size-adjust:100%;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="sp-page-bg" bgcolor="${PALETTE.pageBg}" style="width:100%;background:${PALETTE.pageBg};">
  <tr><td align="center" class="sp-outer" style="padding:24px 12px;">
    <table role="presentation" width="${MAX_WIDTH}" cellpadding="0" cellspacing="0" border="0" class="sp-surface-bg" bgcolor="${PALETTE.surface}" style="width:100%;max-width:${MAX_WIDTH}px;background:${PALETTE.surface};border-radius:10px;border-collapse:separate;overflow:hidden;">
      ${buildHeader(s)}
      <tr><td class="sp-pad sp-surface-bg email-body-bg" style="background:${PALETTE.surface};padding:34px 40px 10px;font-family:${SERIF};font-size:16px;line-height:1.7;color:${PALETTE.textSoft};">${BODY_START}${bodyHtml}${BODY_END}</td></tr>
      ${buildSocialFooter(s, bodyHtml)}
      ${buildFooter(s)}
    </table>
  </td></tr>
</table>
</body>
</html>`;
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
  buildWelcomeTitle,
  buildReservationTitle,
  buildReservationCard,
  composeEmail,
};
