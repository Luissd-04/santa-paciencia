// Aspeto da página de reservas incorporada no site do cliente
// (/reservar/<slug>?embed=1). Só muda a página incorporada; a página normal
// de reservas fica como está.
//
// Duas fontes, campo a campo:
//  - o que o proprietário escolheu em «No teu site → Aspeto»
//    (organization_settings `embed_style`);
//  - o que o carregador (/embed.js, na página do cliente) detetou no site:
//    fundo, letra, cor e cantos dos botões. Vem nos parâmetros `sp_*` do
//    endereço do iframe. Usa-se nos campos que estão em «Automático».
//
// Tudo passa por listas fechadas (temas, cantos, letras) ou por formatos
// estritos (#rrggbb, inteiros). O HTML só recebe atributos e variáveis CSS
// montados a partir desses valores, nunca texto vindo de fora.
const settings = require('./settingsService');
const { httpError } = require('./httpError');

const SETTING_KEY = 'embed_style';
const DETECTED_KEY = 'embed_detected';
const THEMES = ['auto', 'light', 'dark'];
const CORNERS = ['auto', 'rounded', 'square'];
// Letras do Google Fonts aceites, com os pesos que existem em cada uma (o
// Google recusa o pedido inteiro se um peso não existir). As primeiras seis
// aparecem na escolha do proprietário; as outras só são usadas quando o
// carregador as encontra no site do cliente.
const FONTS = {
  Jost: '400;500;600',
  Montserrat: '400;500;600',
  Lato: '400;700',
  'Playfair Display': '400;500;600',
  'Cormorant Garamond': '400;500;600',
  Raleway: '400;500;600',
  'Open Sans': '400;600',
  Roboto: '400;500',
  Poppins: '400;500;600',
  Nunito: '400;600',
  'Nunito Sans': '400;600',
  Inter: '400;500;600',
  'Work Sans': '400;500;600',
  'DM Sans': '400;500;600',
  'Source Sans 3': '400;600',
  Merriweather: '400;700',
  Lora: '400;500;600',
  'EB Garamond': '400;500;600',
  'Libre Baskerville': '400;700',
  Cormorant: '400;500;600',
  'Josefin Sans': '400;600',
  Mulish: '400;600',
  Karla: '400;600',
  Rubik: '400;500',
  Oswald: '400;500',
  Cinzel: '400;600',
  Manrope: '400;600',
  Outfit: '400;500',
  'PT Serif': '400;700',
  'PT Sans': '400;700',
  'Roboto Slab': '400;500',
  Marcellus: '400',
  Prata: '400',
};
const CHOICE_FONTS = ['Jost', 'Montserrat', 'Lato', 'Playfair Display', 'Cormorant Garamond', 'Raleway'];
const SERIF_FONTS = new Set(['Playfair Display', 'Cormorant Garamond', 'Merriweather', 'Lora', 'EB Garamond', 'Libre Baskerville',
  'Cormorant', 'Cinzel', 'PT Serif', 'Roboto Slab', 'Marcellus', 'Prata']);
const FONT_BY_LOWER = new Map(Object.keys(FONTS).map(name => [name.toLowerCase(), name]));
const GENERIC_STACK = {
  serif: 'Georgia, \'Times New Roman\', serif',
  'sans-serif': 'system-ui, -apple-system, \'Segoe UI\', Roboto, Arial, sans-serif',
};
const DEFAULT_STYLE = Object.freeze({ theme: 'auto', font: 'auto', corners: 'auto', accent: 'auto', uppercaseLabels: 'auto', startAtDates: false });
const FIELDS = Object.keys(DEFAULT_STYLE);
const PLATFORM_ACCENT = '#843424';
const SURFACE = { dark: '#151719', light: '#fffdf9' };
// Versão de frontend/css/public-embed.css (só a página incorporada a carrega).
const CSS_VERSION = 'aspeto-20261123-1';

// ── Cores ────────────────────────────────────────────────────────────────
function hex(value) {
  const text = String(value ?? '').trim().toLowerCase();
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/.exec(text);
  if (!m) return '';
  const digits = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1];
  return `#${digits}`;
}
const rgb = color => [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16));
const toHex = parts => `#${parts.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
function luminance(color) {
  const [r, g, b] = rgb(color).map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
const mix = (a, b, t) => toHex(rgb(a).map((v, i) => v + (rgb(b)[i] - v) * t));
// A cor de destaque usada como texto (ligações, «Escolhido»): aclarada no
// tema escuro, escurecida no claro, até ter 4,5:1 sobre o fundo.
function readableOn(color, surface, dark) {
  const target = dark ? '#ffffff' : '#000000';
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const candidate = mix(color, target, t);
    if (contrast(candidate, surface) >= 4.5) return candidate;
  }
  return target;
}
// Texto sobre a cor de destaque (botões): branco ou quase preto, o que se ler melhor.
const onColor = color => (contrast('#ffffff', color) >= Math.min(4.5, contrast('#111111', color)) ? '#ffffff' : '#111111');

// ── Validação do que o proprietário grava ────────────────────────────────
function fontName(value) {
  return FONT_BY_LOWER.get(String(value ?? '').trim().toLowerCase()) || '';
}

function validField(field, value) {
  switch (field) {
    case 'theme': return THEMES.includes(value) ? value : undefined;
    case 'corners': return CORNERS.includes(value) ? value : undefined;
    case 'font':
      if (value === 'auto' || value === 'platform') return value;
      return typeof value === 'string' && fontName(value) ? fontName(value) : undefined;
    case 'accent':
      if (value === 'auto') return value;
      return typeof value === 'string' && hex(value) ? hex(value) : undefined;
    case 'uppercaseLabels': return value === 'auto' || value === true || value === false ? value : undefined;
    case 'startAtDates': return typeof value === 'boolean' ? value : undefined;
    default: return undefined;
  }
}

const ERRORS = {
  theme: 'Tema inválido: escolha Claro, Escuro ou Automático.',
  font: 'Letra inválida: escolha uma das letras da lista.',
  corners: 'Cantos inválidos: escolha Arredondados, Retos ou Automático.',
  accent: 'A cor de destaque tem de estar no formato #RRGGBB.',
  uppercaseLabels: 'Valor inválido para as etiquetas em maiúsculas.',
  startAtDates: 'Valor inválido para «Começar logo nas datas».',
};

// Grava por cima do que existe: os campos que não vêm ficam como estavam.
function normalizeStyle(input, current = DEFAULT_STYLE) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw httpError('O aspeto tem de ser um objeto.', 400);
  const out = { ...DEFAULT_STYLE, ...current };
  for (const [field, value] of Object.entries(input)) {
    if (!FIELDS.includes(field)) throw httpError(`Opção de aspeto desconhecida: ${String(field).slice(0, 40)}`, 400);
    const valid = validField(field, value);
    if (valid === undefined) throw httpError(ERRORS[field], 400, { field });
    out[field] = valid;
  }
  return out;
}

// O que está gravado volta a ser validado campo a campo; um valor estragado
// passa a «Automático» em vez de chegar à página.
function storedStyle(organizationId) {
  const raw = settings.getJson(organizationId, SETTING_KEY, null);
  const out = { ...DEFAULT_STYLE };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const field of FIELDS) {
    const valid = validField(field, raw[field]);
    if (valid !== undefined) out[field] = valid;
  }
  return out;
}

function saveStyle(organizationId, input) {
  const style = normalizeStyle(input, storedStyle(organizationId));
  settings.set(organizationId, SETTING_KEY, style);
  return style;
}

// ── O que o carregador detetou (parâmetros sp_* do iframe) ───────────────
function parseFont(value) {
  const text = String(value ?? '').slice(0, 120);
  if (!text) return null;
  const [family, generic] = text.split(',').map(part => part.trim());
  const name = fontName(family);
  const kind = generic === 'serif' ? 'serif' : generic === 'sans-serif' ? 'sans-serif' : '';
  if (!name && !kind) return null;
  return { family: name || null, generic: name ? (SERIF_FONTS.has(name) ? 'serif' : 'sans-serif') : kind };
}

function detectedFromQuery(query = {}) {
  const one = key => (typeof query[key] === 'string' ? query[key].slice(0, 120) : '');
  const out = {};
  if (['dark', 'light'].includes(one('sp_theme'))) out.theme = one('sp_theme');
  const bg = hex(one('sp_bg'));
  if (bg) out.bg = bg;
  const font = parseFont(one('sp_font'));
  if (font) out.font = font;
  const heading = parseFont(one('sp_hfont'));
  if (heading) out.headingFont = heading;
  const accent = hex(one('sp_accent'));
  if (accent) out.accent = accent;
  if (/^\d{1,3}$/.test(one('sp_radius'))) out.radius = Math.min(99, Number(one('sp_radius')));
  if (['0', '1'].includes(one('sp_upper'))) out.uppercase = one('sp_upper') === '1';
  return out;
}

// ── Valores finais da página ─────────────────────────────────────────────
const fontStack = font => {
  if (!font) return null;
  if (font.family) return `'${font.family}', ${font.generic === 'serif' ? 'Georgia, serif' : 'system-ui, sans-serif'}`;
  return GENERIC_STACK[font.generic] || null;
};
const explicitFont = name => (name === 'platform' ? null : { family: name, generic: SERIF_FONTS.has(name) ? 'serif' : 'sans-serif' });

function resolveStyle(style = DEFAULT_STYLE, detected = {}, fallbackAccent = PLATFORM_ACCENT) {
  const theme = style.theme !== 'auto' ? style.theme : detected.theme || 'light';
  const dark = theme === 'dark';
  const bgFits = detected.bg && (dark ? luminance(detected.bg) < 0.2 : luminance(detected.bg) > 0.6);
  const surface = bgFits ? detected.bg : SURFACE[theme];
  let accent = style.accent !== 'auto' ? style.accent : '';
  if (!accent && detected.accent && contrast(detected.accent, surface) >= 1.3) accent = detected.accent;
  accent = accent || hex(fallbackAccent) || PLATFORM_ACCENT;
  let body = null;
  let heading = null;
  if (style.font !== 'auto') {
    body = explicitFont(style.font);
    heading = body;
  } else {
    body = detected.font || null;
    heading = detected.headingFont || body;
  }
  const corners = style.corners !== 'auto' ? style.corners
    : Number.isInteger(detected.radius) ? (detected.radius <= 1 ? 'square' : 'rounded') : 'rounded';
  const uppercase = style.uppercaseLabels !== 'auto' ? style.uppercaseLabels : detected.uppercase === true;
  return {
    theme, corners, uppercase, startAtDates: style.startAtDates === true,
    accent, accentInk: readableOn(accent, surface, dark), onAccent: onColor(accent), surface,
    font: body, headingFont: heading,
  };
}

const escapeAttr = value => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Atributos para <html data-embed="1" …>: o CSS (public-novo.css) lê-os.
function htmlAttributes(resolved) {
  const vars = [
    ['--sp-accent', resolved.accent], ['--sp-accent-ink', resolved.accentInk], ['--sp-on-accent', resolved.onAccent], ['--sp-surface', resolved.surface],
  ];
  const body = fontStack(resolved.font);
  const heading = fontStack(resolved.headingFont);
  if (body) vars.push(['--sp-font', body]);
  if (heading) vars.push(['--sp-heading-font', heading]);
  const attrs = [
    ['data-sp-theme', resolved.theme],
    ['data-sp-corners', resolved.corners],
    ['data-sp-upper', resolved.uppercase ? '1' : '0'],
    ['data-sp-start', resolved.startAtDates ? 'datas' : 'capa'],
  ];
  if (body || heading) attrs.push(['data-sp-font', 'site']);
  attrs.push(['style', vars.map(([k, v]) => `${k}:${v}`).join(';')]);
  return attrs.map(([k, v]) => ` ${k}="${escapeAttr(v)}"`).join('');
}

// Folha do Google Fonts para as letras escolhidas (só nomes da lista).
function fontLinks(resolved) {
  const families = [...new Set([resolved.font?.family, resolved.headingFont?.family].filter(name => name && FONTS[name]))];
  if (!families.length) return '';
  const query = families.map(name => `family=${name.replace(/ /g, '+')}:wght@${FONTS[name]}`).join('&');
  return `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${escapeAttr(query)}&amp;display=swap">`;
}

// ── O que foi detetado, para o proprietário ver em «Aspeto» ──────────────
// Só quando o pedido vem de um iframe num dos sites autorizados; grava se
// mudou ou uma vez por dia (não a cada visita).
function recordDetected(organizationId, detected, origin, origins) {
  if (!origin || !origins.includes(origin) || !Object.keys(detected).length) return false;
  const previous = settings.getJson(organizationId, DETECTED_KEY, null);
  const same = previous && previous.origin === origin && JSON.stringify(previous.values) === JSON.stringify(detected);
  if (same && Date.now() - Date.parse(previous.at || 0) < 24 * 3600 * 1000) return false;
  settings.set(organizationId, DETECTED_KEY, { origin, values: detected, at: new Date().toISOString() });
  return true;
}

function storedDetected(organizationId) {
  const raw = settings.getJson(organizationId, DETECTED_KEY, null);
  if (!raw || typeof raw !== 'object' || typeof raw.origin !== 'string') return null;
  const values = raw.values && typeof raw.values === 'object' ? raw.values : {};
  // Volta a passar pelas mesmas regras do endereço do iframe.
  const query = {
    sp_theme: values.theme, sp_bg: values.bg, sp_accent: values.accent,
    sp_radius: Number.isInteger(values.radius) ? String(values.radius) : '', sp_upper: values.uppercase === true ? '1' : values.uppercase === false ? '0' : '',
    sp_font: values.font ? `${values.font.family || ''},${values.font.generic || ''}` : '',
    sp_hfont: values.headingFont ? `${values.headingFont.family || ''},${values.headingFont.generic || ''}` : '',
  };
  for (const key of Object.keys(query)) if (typeof query[key] !== 'string') delete query[key];
  return { origin: raw.origin.slice(0, 200), at: typeof raw.at === 'string' ? raw.at.slice(0, 40) : null, values: detectedFromQuery(query) };
}

module.exports = {
  SETTING_KEY, DETECTED_KEY, CSS_VERSION, DEFAULT_STYLE, THEMES, CORNERS, FONTS, CHOICE_FONTS, PLATFORM_ACCENT,
  hex, contrast, normalizeStyle, storedStyle, saveStyle, detectedFromQuery, resolveStyle, htmlAttributes, fontLinks,
  recordDetected, storedDetected,
};
