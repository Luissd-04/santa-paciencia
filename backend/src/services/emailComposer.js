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

const BACKGROUND_ASSET_NAMES = new Map([
  [PALETTE.pageBg,  'page'],
  [PALETTE.surface, 'surface'],
  [PALETTE.cardBg,  'card'],
  [PALETTE.cardAlt, 'cardAlt'],
  [PALETTE.brand,   'brand'],
  [PALETTE.divider, 'divider'],
  [PALETTE.accent,  'accent'],
]);

function lockedBackgroundImage(color) {
  const name = BACKGROUND_ASSET_NAMES.get(String(color).toLowerCase());
  const assetUrl = name ? emailAssetUrl(`/img/email/bg-${name}.png`) : '';
  const solidGradient = `linear-gradient(${color},${color})`;
  return assetUrl ? `url('${attr(assetUrl)}'),${solidGradient}` : solidGradient;
}

// Alguns clientes móveis (sobretudo o Gmail) ignoram `color-scheme: light` e
// tentam inverter fundos sólidos. Uma imagem CSS com a mesma cor não é
// invertida por esses clientes, por isso cada superfície da moldura leva as
// duas declarações. Os clientes antigos continuam a usar background/bgcolor.
function lockedBackgroundStyle(color) {
  // Conservamos também o gradiente como fallback para previews/offline. Em
  // produção, o primeiro layer é um PNG opaco de 8 px: Gmail e Outlook podem
  // reescrever cores CSS, mas não alteram os píxeis de uma imagem remota.
  return `background:${color};background-color:${color};background-image:linear-gradient(${color},${color});background-image:${lockedBackgroundImage(color)};background-repeat:repeat;`;
}

function lockedBackgroundRule(color) {
  return `background-color:${color} !important;background-image:${lockedBackgroundImage(color)} !important;background-repeat:repeat !important;`;
}

function lockedTextStyle(color) {
  return `color:${color};-webkit-text-fill-color:${color};`;
}

const TEXT_THEME_CLASSES = new Map([
  [PALETTE.text,      'sp-text'],
  [PALETTE.textSoft,  'sp-text-soft'],
  [PALETTE.muted,     'sp-muted-text'],
  [PALETTE.brand,     'sp-brand-text'],
  [PALETTE.brandText, 'sp-brand-on-text'],
  [PALETTE.brandSoft, 'sp-brand-soft-text'],
]);

const BACKGROUND_THEME_CLASSES = new Map([
  [PALETTE.pageBg, 'sp-page-bg'],
  [PALETTE.surface, 'sp-surface-bg'],
  [PALETTE.cardBg, 'sp-card-bg'],
  [PALETTE.cardAlt, 'sp-card-alt-bg'],
  [PALETTE.brand, 'sp-brand-bg'],
  [PALETTE.divider, 'sp-divider-bg'],
  [PALETTE.accent, 'sp-accent-bg'],
]);

function addClass(attribs, className) {
  const classes = new Set(String(attribs.class || '').split(/\s+/).filter(Boolean));
  classes.add(className);
  attribs.class = [...classes].join(' ');
}

// Os corpos dos modelos já guardados na base de dados não recebem alterações
// quando o código dos defaults muda. Ao sanitizar, marcamos as cores conhecidas
// da paleta com papéis semânticos e acrescentamos a proteção de fundo. Assim a
// correção também vale imediatamente para modelos existentes.
function decorateThemeColors(tagName, attribs) {
  const style = String(attribs.style || '');
  const compact = style.replace(/\s+/g, '').toLowerCase();

  const backgroundMatch = compact.match(/(?:^|;)(?:background|background-color):(#[0-9a-f]{6})(?:;|$)/i);
  const bgcolor = String(attribs.bgcolor || '').toLowerCase();
  const backgroundColor = (backgroundMatch?.[1] || bgcolor).toLowerCase();
  const backgroundClass = BACKGROUND_THEME_CLASSES.get(backgroundColor);

  // No Gmail, as classes de texto pintam a cor com um background-image
  // recortado às letras, que substitui o fundo do próprio elemento. Num botão
  // terracota o botão desaparecia; aí fica só a cor inline (o Gmail não
  // escurece texto claro). Num cartão claro perde-se apenas o tom do cartão,
  // e o texto escuro continua protegido.
  const brandBackground = backgroundColor === PALETTE.brand;
  const textMatch = compact.match(/(?:^|;)color:(#[0-9a-f]{6})(?:;|$)/i);
  const textClass = textMatch && TEXT_THEME_CLASSES.get(textMatch[1].toLowerCase());
  if (textClass && !brandBackground) {
    addClass(attribs, textClass);
    if (!/(?:^|;)-webkit-text-fill-color:/i.test(compact)) {
      attribs.style = `${style}${style && !style.trim().endsWith(';') ? ';' : ''}-webkit-text-fill-color:${textMatch[1]};`;
    }
  } else if (!textMatch && !brandBackground && /^(?:p|h[1-6]|li|blockquote)$/.test(tagName)) {
    // Texto sem cor própria herda o tom do corpo. Dar-lhe uma classe permite
    // protegê-lo também no Gmail móvel, que ignora a preferência "light".
    addClass(attribs, 'sp-text-soft');
  } else if (textMatch && !/(?:^|;)-webkit-text-fill-color:/i.test(compact)) {
    attribs.style = `${style}${style && !style.trim().endsWith(';') ? ';' : ''}-webkit-text-fill-color:${textMatch[1]};`;
  }

  if (backgroundClass) {
    addClass(attribs, backgroundClass);
    const currentStyle = String(attribs.style || '');
    if (!/(?:^|;)\s*background-image:/i.test(currentStyle)) {
      attribs.style = `${currentStyle}${currentStyle && !currentStyle.trim().endsWith(';') ? ';' : ''}background-image:linear-gradient(${backgroundColor},${backgroundColor});`;
    }
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
  const styleProperties = ['color', '-webkit-text-fill-color', 'background-color', 'background-image', 'font-family', 'font-size', 'font-weight',
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
    : `<div class="sp-brand-on-text" style="font-family:${SERIF};font-size:30px;${lockedTextStyle(PALETTE.brandText)}">${escapeHtml(name)}</div>`;
  return `<tr>
    <td align="center" bgcolor="${PALETTE.brand}" class="sp-brand-bg" style="${lockedBackgroundStyle(PALETTE.brand)}padding:34px 24px 26px;text-align:center;">
      ${logoHtml}
      <div class="sp-brand-subtext" style="font-family:${SERIF};font-size:13px;letter-spacing:4px;color:rgba(251,243,234,.82);-webkit-text-fill-color:rgba(251,243,234,.82);margin:14px 0 0;">ALOJAMENTO LOCAL</div>
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
    ? `<a href="${attr(mapUrl)}" target="_blank" rel="noopener noreferrer" class="sp-muted-text" style="${lockedTextStyle(PALETTE.muted)}text-decoration:underline;">${address}</a>`
    : address;
  const identity = [name, addressHtml].filter(Boolean).join(' · ');
  if (identity) lines.push(identity);
  if (license)  lines.push(`Licença AL: ${license}`);
  if (contact)  lines.push(`<a href="${attr(contact)}" class="sp-brand-text" style="${lockedTextStyle(PALETTE.brand)}text-decoration:underline;">${escapeHtml(settings.email_contact)}</a>`);
  if (!lines.length) return '';

  return `<tr>
    <td bgcolor="${PALETTE.surface}" class="sp-pad sp-surface-bg" style="${lockedBackgroundStyle(PALETTE.surface)}padding:0 40px 34px;">
      ${divider()}
      <p class="sp-muted-text" style="font-family:${SERIF};font-size:13px;line-height:1.75;${lockedTextStyle(PALETTE.muted)}text-align:center;margin:20px 0 0;">
        ${lines.join('<br />')}
      </p>
    </td>
  </tr>`;
}

function divider(marginTop = 0) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;${marginTop ? `margin-top:${marginTop}px;` : ''}">
    <tr><td height="1" bgcolor="${PALETTE.divider}" class="sp-divider-bg" style="height:1px;line-height:1px;font-size:0;${lockedBackgroundStyle(PALETTE.divider)}">&nbsp;</td></tr>
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

  const buttons = entries.map(([key, label, url]) => `<a href="${attr(safeUrl(url))}" class="sp-social-button sp-surface-bg" style="display:inline-block;margin:5px 4px;padding:11px 17px;border:1px solid ${PALETTE.brandBorder};border-radius:6px;${lockedBackgroundStyle(PALETTE.surface)}${lockedTextStyle(PALETTE.brand)}text-decoration:none;font-family:${SERIF};font-size:14px;line-height:1.2;white-space:nowrap;">${iconImg(key)}<span class="sp-brand-text" style="${lockedTextStyle(PALETTE.brand)}">${escapeHtml(label)}</span></a>`).join('');

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="sp-social-block" style="width:100%;margin:30px 0 0;">
    <tr><td>${divider()}</td></tr>
    <tr><td align="center" class="sp-brand-soft-text" style="padding:22px 0 10px;font-family:${SERIF};font-size:12px;letter-spacing:3px;${lockedTextStyle(PALETTE.brandSoft)}">ACOMPANHE-NOS</td></tr>
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
    <td bgcolor="${PALETTE.surface}" class="sp-pad sp-surface-bg" style="${lockedBackgroundStyle(PALETTE.surface)}padding:0 40px 0;">
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
        <tr><td align="center" bgcolor="${PALETTE.brand}" class="sp-brand-bg" style="${lockedBackgroundStyle(PALETTE.brand)}border-radius:4px;">
          <a href="${attr(href)}" class="sp-brand-on-text" style="display:block;padding:17px 20px;font-family:${SERIF};font-size:14px;letter-spacing:2.5px;${lockedTextStyle(PALETTE.brandText)}text-decoration:none;text-align:center;">${escapeHtml(label).toUpperCase()}</a>
        </td></tr>
      </table>
    </td></tr>
  </table>`;
}

// Título de boas-vindas: centrado, com filete dourado curto por baixo.
function buildWelcomeTitle(title) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
    <tr><td align="center" class="sp-text" style="font-family:${SERIF};font-size:34px;line-height:1.25;${lockedTextStyle(PALETTE.text)}padding:4px 0 0;">${escapeHtml(title)}</td></tr>
    <tr><td align="center" style="padding:20px 0 4px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="64" style="width:64px;">
        <tr><td height="1" bgcolor="${PALETTE.accent}" class="sp-accent-bg" style="height:1px;line-height:1px;font-size:0;${lockedBackgroundStyle(PALETTE.accent)}">&nbsp;</td></tr>
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
          <tr><td align="center" height="40" class="sp-brand-outline sp-brand-text" style="width:40px;height:40px;border:2px solid ${PALETTE.brand};border-radius:20px;font-family:${SERIF};font-size:20px;line-height:36px;${lockedTextStyle(PALETTE.brand)}text-align:center;">${escapeHtml(glyph)}</td></tr>
        </table>
      </td>
      <td valign="middle" class="sp-text" style="font-family:${SERIF};font-size:28px;font-weight:bold;line-height:1.2;${lockedTextStyle(PALETTE.text)}">${escapeHtml(title)}</td>
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
      const backgroundClass = index % 2 === 0 ? 'sp-card-bg' : 'sp-card-alt-bg';
      return `<tr><td bgcolor="${bg}" class="${backgroundClass} sp-row-border" style="${lockedBackgroundStyle(bg)}padding:13px 18px;border-bottom:1px solid ${PALETTE.rowBorder};">
        <div class="sp-muted-text" style="font-family:${SERIF};font-size:12.5px;line-height:1.4;${lockedTextStyle(PALETTE.muted)}margin:0 0 3px;">${escapeHtml(row.label)}</div>
        <div class="sp-text" style="font-family:${SERIF};font-size:16px;line-height:1.45;${lockedTextStyle(PALETTE.text)}">${escapeHtml(row.value)}</div>
      </td></tr>`;
    }).join('');

  const totalRow = total === '' || total === null || total === undefined ? '' : `<tr>
    <td bgcolor="${PALETTE.brand}" class="sp-brand-bg" style="${lockedBackgroundStyle(PALETTE.brand)}padding:15px 18px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
        <tr>
          <td align="left" class="sp-brand-on-text" style="font-family:${SERIF};font-size:18px;font-weight:bold;${lockedTextStyle(PALETTE.brandText)}">Total</td>
          <td align="right" class="sp-brand-on-text" style="font-family:${SERIF};font-size:18px;font-weight:bold;${lockedTextStyle(PALETTE.brandText)}">${escapeHtml(total)}</td>
        </tr>
      </table>
    </td>
  </tr>`;

  if (!cells && !totalRow) return '';

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="sp-card-border" style="width:100%;margin:24px 0;border:1px solid ${PALETTE.cardBorder};border-radius:8px;border-collapse:separate;overflow:hidden;">
    ${cells}${totalRow}
  </table>`;
}

// ── Documento completo ─────────────────────────────────────────────────────

function composeEmail(bodyHtml, settings, options = {}) {
  const s = settings || {};
  const title = escapeHtml(options.title || s.property_name || 'Santa Paciência');
  return `<!DOCTYPE html>
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

  /* Mantém a paleta clara nos clientes que tentam aplicar modo escuro. As
     regras normais cobrem Apple Mail e clientes que respeitam color-scheme;
     data-ogsc/data-ogsb cobrem Outlook móvel/web; os gradientes inline dão
     uma camada adicional contra a reescrita feita pelo Gmail móvel. */
  .sp-page-bg { ${lockedBackgroundRule(PALETTE.pageBg)} }
  .sp-surface-bg { ${lockedBackgroundRule(PALETTE.surface)} }
  .sp-card-bg { ${lockedBackgroundRule(PALETTE.cardBg)} }
  .sp-card-alt-bg { ${lockedBackgroundRule(PALETTE.cardAlt)} }
  .sp-brand-bg { ${lockedBackgroundRule(PALETTE.brand)} }
  .sp-divider-bg { ${lockedBackgroundRule(PALETTE.divider)} }
  .sp-accent-bg { ${lockedBackgroundRule(PALETTE.accent)} }
  .sp-text { color:${PALETTE.text} !important; -webkit-text-fill-color:${PALETTE.text} !important; }
  .sp-text-soft { color:${PALETTE.textSoft} !important; -webkit-text-fill-color:${PALETTE.textSoft} !important; }
  .sp-muted-text { color:${PALETTE.muted} !important; -webkit-text-fill-color:${PALETTE.muted} !important; }
  .sp-brand-text { color:${PALETTE.brand} !important; -webkit-text-fill-color:${PALETTE.brand} !important; }
  .sp-brand-on-text { color:${PALETTE.brandText} !important; -webkit-text-fill-color:${PALETTE.brandText} !important; }
  .sp-brand-soft-text { color:${PALETTE.brandSoft} !important; -webkit-text-fill-color:${PALETTE.brandSoft} !important; }
  .sp-brand-subtext { color:rgba(251,243,234,.82) !important; -webkit-text-fill-color:rgba(251,243,234,.82) !important; }
  .sp-brand-outline { border-color:${PALETTE.brand} !important; }
  .sp-social-button { border-color:${PALETTE.brandBorder} !important; }
  .sp-card-border { border-color:${PALETTE.cardBorder} !important; }
  .sp-row-border { border-bottom-color:${PALETTE.rowBorder} !important; }

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

  /* Gmail móvel faz a inversão depois de processar o CSS e ignora o esquema
     light. O seletor u + .body só é ativado pelo markup que o Gmail injeta.
     Nestes clientes, a cor passa a vir de um gradiente recortado às letras;
     o Gmail suporta background-clip e não inverte imagens/gradientes. */
  u + .body .sp-text { background-image:linear-gradient(${PALETTE.text},${PALETTE.text}) !important;background-clip:text !important;-webkit-background-clip:text !important;color:transparent !important;-webkit-text-fill-color:transparent !important; }
  u + .body .sp-text-soft { background-image:linear-gradient(${PALETTE.textSoft},${PALETTE.textSoft}) !important;background-clip:text !important;-webkit-background-clip:text !important;color:transparent !important;-webkit-text-fill-color:transparent !important; }
  u + .body .sp-muted-text { background-image:linear-gradient(${PALETTE.muted},${PALETTE.muted}) !important;background-clip:text !important;-webkit-background-clip:text !important;color:transparent !important;-webkit-text-fill-color:transparent !important; }
  u + .body .sp-brand-text { background-image:linear-gradient(${PALETTE.brand},${PALETTE.brand}) !important;background-clip:text !important;-webkit-background-clip:text !important;color:transparent !important;-webkit-text-fill-color:transparent !important; }
  u + .body .sp-brand-on-text { background-image:linear-gradient(${PALETTE.brandText},${PALETTE.brandText}) !important;background-clip:text !important;-webkit-background-clip:text !important;color:transparent !important;-webkit-text-fill-color:transparent !important; }
  u + .body .sp-brand-soft-text { background-image:linear-gradient(${PALETTE.brandSoft},${PALETTE.brandSoft}) !important;background-clip:text !important;-webkit-background-clip:text !important;color:transparent !important;-webkit-text-fill-color:transparent !important; }
  u + .body .sp-brand-subtext { background-image:linear-gradient(rgba(251,243,234,.82),rgba(251,243,234,.82)) !important;background-clip:text !important;-webkit-background-clip:text !important;color:transparent !important;-webkit-text-fill-color:transparent !important; }

  @media (prefers-color-scheme: dark) {
    .sp-page-bg { background-color:${PALETTE.pageBg} !important; color:${PALETTE.text} !important; }
    .sp-surface-bg { background-color:${PALETTE.surface} !important; }
    .sp-card-bg { background-color:${PALETTE.cardBg} !important; }
    .sp-card-alt-bg { background-color:${PALETTE.cardAlt} !important; }
    .sp-brand-bg { background-color:${PALETTE.brand} !important; }
    .sp-text { color:${PALETTE.text} !important; -webkit-text-fill-color:${PALETTE.text} !important; }
    .sp-text-soft { color:${PALETTE.textSoft} !important; -webkit-text-fill-color:${PALETTE.textSoft} !important; }
    .sp-muted-text { color:${PALETTE.muted} !important; -webkit-text-fill-color:${PALETTE.muted} !important; }
    .sp-brand-text { color:${PALETTE.brand} !important; -webkit-text-fill-color:${PALETTE.brand} !important; }
    .sp-brand-on-text { color:${PALETTE.brandText} !important; -webkit-text-fill-color:${PALETTE.brandText} !important; }
  }
  /* Melhoria progressiva: em 320–430px o contentor já encolhe por max-width,
     aqui só se recupera largura útil reduzindo o avanço lateral. */
  @media only screen and (max-width: 480px) {
    .sp-pad { padding-left: 22px !important; padding-right: 22px !important; }
    .sp-outer { padding-left: 8px !important; padding-right: 8px !important; }
  }
</style>
</head>
<body class="body sp-email sp-page-bg sp-text" bgcolor="${PALETTE.pageBg}" style="margin:0;padding:0;${lockedBackgroundStyle(PALETTE.pageBg)}font-family:${SERIF};${lockedTextStyle(PALETTE.text)}color-scheme:light only;supported-color-schemes:light;-webkit-text-size-adjust:100%;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="sp-page-bg" bgcolor="${PALETTE.pageBg}" style="width:100%;${lockedBackgroundStyle(PALETTE.pageBg)}">
  <tr><td align="center" class="sp-outer" style="padding:24px 12px;">
    <table role="presentation" width="${MAX_WIDTH}" cellpadding="0" cellspacing="0" border="0" class="sp-surface-bg" bgcolor="${PALETTE.surface}" style="width:100%;max-width:${MAX_WIDTH}px;${lockedBackgroundStyle(PALETTE.surface)}border-radius:10px;border-collapse:separate;overflow:hidden;">
      ${buildHeader(s)}
      <tr><td bgcolor="${PALETTE.surface}" class="sp-pad sp-surface-bg sp-email-body email-body-bg" style="${lockedBackgroundStyle(PALETTE.surface)}padding:34px 40px 10px;font-family:${SERIF};font-size:16px;line-height:1.7;${lockedTextStyle(PALETTE.textSoft)}">${BODY_START}${bodyHtml}${BODY_END}</td></tr>
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
