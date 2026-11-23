// Página de reservas dentro do site do cliente (iframe, por exemplo num bloco
// «HTML personalizado» do WordPress).
//
//  - Só as organizações cujo pacote tem a funcionalidade `booking_embed` (ou
//    sem pacote, que quer dizer «sem limites», como em plansService).
//  - As origens autorizadas a mostrar a página ficam em organization_settings
//    (`embed_origins`, lista JSON de origens `https://host[:porta]`). Vão para
//    o `frame-ancestors` do CSP apenas de /reservar/<slug>?embed=1; tudo o
//    resto continua `'self'` (app.js).
//  - Sem curingas (`https://*.exemplo.pt`): um curinga autorizava também
//    subdomínios que o cliente não controla (alojamento partilhado, blogs
//    *.wordpress.com). Cada site é acrescentado com o seu endereço exato;
//    normalmente chegam dois (com e sem `www`).
const { db } = require('../config/database');
const settings = require('./settingsService');
const { httpError } = require('./httpError');
const style = require('./embedStyle');

const FEATURE = 'booking_embed';
const SETTING_KEY = 'embed_origins';
const MAX_ORIGINS = 10;
const MAX_LENGTH = 200;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
// Depois de normalizada pelo URL: só letras, dígitos, pontos, hífenes e porta.
// Nada que possa partir o cabeçalho CSP (espaço, `;`, `,`, aspas).
const SAFE_ORIGIN = /^https?:\/\/(?:[a-z0-9-]+(?:\.[a-z0-9-]+)*|\[::1\])(?::\d{1,5})?$/;

// Uma origem escrita pelo dono («www.exemplo.pt», «https://exemplo.pt/»)
// passa a `https://exemplo.pt`; o que não for uma origem segura dá 400.
function normalizeOrigin(raw) {
  let value = String(raw ?? '').trim();
  if (!value) throw httpError('Indique o endereço do site.', 400);
  if (value.length > MAX_LENGTH) throw httpError('Endereço do site demasiado longo.', 400);
  if (value.includes('*')) throw httpError('Não são aceites curingas (*): indique cada site com o endereço completo, por exemplo https://www.exemplo.pt.', 400);
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = `https://${value}`;
  let url;
  try { url = new URL(value); } catch { throw httpError(`Endereço inválido: ${String(raw).trim()}`, 400); }
  const local = LOCAL_HOSTS.has(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw httpError('O site tem de usar https:// (http:// só para testes em localhost).', 400);
  }
  if (url.username || url.password) throw httpError('O endereço do site não pode ter utilizador nem palavra-passe.', 400);
  if ((url.pathname && url.pathname !== '/') || url.search || url.hash) {
    throw httpError('Indique só o endereço do site, sem páginas nem parâmetros (por exemplo https://www.exemplo.pt).', 400);
  }
  if (!local && !url.hostname.includes('.')) throw httpError(`Endereço inválido: ${String(raw).trim()}`, 400);
  const origin = url.origin;
  if (!SAFE_ORIGIN.test(origin)) throw httpError(`Endereço inválido: ${String(raw).trim()}`, 400);
  return origin;
}

function normalizeOrigins(list) {
  if (!Array.isArray(list)) throw httpError('As origens têm de ser uma lista.', 400);
  const out = [];
  for (const raw of list) {
    if (typeof raw !== 'string') throw httpError('Cada origem tem de ser um texto.', 400);
    if (!raw.trim()) continue;
    const origin = normalizeOrigin(raw);
    if (!out.includes(origin)) out.push(origin);
  }
  if (out.length > MAX_ORIGINS) throw httpError(`No máximo ${MAX_ORIGINS} sites autorizados.`, 400);
  return out;
}

// O que está gravado volta a ser validado: um valor antigo ou alterado à mão
// nunca chega ao cabeçalho sem passar pelas mesmas regras.
function storedOrigins(organizationId) {
  const list = settings.getJson(organizationId, SETTING_KEY, []);
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const raw of list) {
    try {
      const origin = normalizeOrigin(raw);
      if (!out.includes(origin)) out.push(origin);
    } catch { /* ignorada */ }
  }
  return out.slice(0, MAX_ORIGINS);
}

function planOf(organizationId) {
  return db.prepare('SELECT p.name, p.features_json FROM organizations o JOIN plans p ON p.id = o.plan_id WHERE o.id = ?').get(organizationId) || null;
}

// Sem pacote = sem limites (como em plansService); com pacote, só se o
// pacote tiver `booking_embed: true`.
function planAllows(organizationId) {
  const plan = planOf(organizationId);
  if (!plan) return true;
  try { return JSON.parse(plan.features_json || '{}')?.[FEATURE] === true; } catch { return false; }
}

function placeForSlug(slug) {
  const value = String(slug ?? '');
  if (!value || value.length > 200) return null;
  return db.prepare("SELECT organization_id, color FROM accommodations WHERE public_slug = ? AND type = 'alojamento'").get(value) || null;
}

// Cor de destaque por omissão: a cor principal da organização (Área do
// proprietário → Marca), senão a do alojamento, senão a da plataforma. A cor
// por omissão dos alojamentos (#843424) conta como «sem cor».
function defaultAccent(organizationId, placeColor = null) {
  const chosen = value => { const c = style.hex(value); return c && c !== style.PLATFORM_ACCENT ? c : ''; };
  const org = db.prepare('SELECT brand_color FROM organizations WHERE id = ?').get(organizationId);
  if (chosen(org?.brand_color)) return chosen(org.brand_color);
  if (chosen(placeColor)) return chosen(placeColor);
  const first = db.prepare("SELECT color FROM accommodations WHERE organization_id = ? AND type = 'alojamento' AND color IS NOT NULL ORDER BY name COLLATE NOCASE").all(organizationId)
    .map(row => chosen(row.color)).find(Boolean);
  return first || style.PLATFORM_ACCENT;
}

// Para /reservar/<slug>?embed=1: se a página pode ser incorporada e por quem.
// `null` quando o slug não existe (a página normal mostra o erro).
function embedFor(slug) {
  const place = placeForSlug(slug);
  const organizationId = place?.organization_id;
  if (!organizationId) return null;
  const policy = require('./orgPolicy');
  if (!policy.publicPagesAllowed(organizationId)) return null;
  const available = planAllows(organizationId);
  return { organizationId, placeColor: place.color || null, available, origins: available ? storedOrigins(organizationId) : [] };
}

// Aspeto da página incorporada: atributos de <html> e a folha das letras.
// `query` são os parâmetros do iframe (sp_*, o que o carregador detetou no
// site); `referer` a origem da página que o contém (para mostrar ao
// proprietário o que foi detetado, só se for um site autorizado).
function pageStyle(embed, query = {}, referer = '') {
  const detected = style.detectedFromQuery(query);
  let origin = '';
  try { origin = referer ? new URL(referer).origin : ''; } catch { origin = ''; }
  try { style.recordDetected(embed.organizationId, detected, origin, embed.origins || []); } catch { /* só informativo */ }
  const resolved = style.resolveStyle(style.storedStyle(embed.organizationId), detected, defaultAccent(embed.organizationId, embed.placeColor));
  const head = [`<link rel="stylesheet" href="/css/public-embed.css?v=${style.CSS_VERSION}">`, style.fontLinks(resolved)].filter(Boolean).join('\n');
  return { resolved, attributes: style.htmlAttributes(resolved), head };
}

function slugsOf(organizationId) {
  return db.prepare(`SELECT name, public_slug AS slug FROM accommodations
    WHERE organization_id = ? AND type = 'alojamento' AND public_slug IS NOT NULL AND public_slug != ''
    ORDER BY name COLLATE NOCASE`).all(organizationId);
}

const escapeAttr = value => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function snippets(origin, slug) {
  if (!slug) return null;
  const s = escapeAttr(slug);
  return {
    script: `<div data-sp-reservas="${s}"></div>\n<script src="${origin}/embed.js" async></script>`,
    iframe: `<iframe src="${origin}/reservar/${encodeURIComponent(slug)}?embed=1" title="Reservar estadia" loading="lazy" allow="payment" style="width:100%;min-height:1400px;border:0;"></iframe>`,
  };
}

function getSettings(organizationId, origin) {
  const slugs = slugsOf(organizationId);
  const plan = planOf(organizationId);
  return {
    available: planAllows(organizationId),
    plan: plan?.name || null,
    origins: storedOrigins(organizationId),
    max_origins: MAX_ORIGINS,
    accommodations: slugs.map(row => ({ name: row.name, slug: row.slug, snippet: snippets(origin, row.slug) })),
    snippet: snippets(origin, slugs[0]?.slug),
    // Aspeto (só a página incorporada).
    style: style.storedStyle(organizationId),
    style_options: { themes: style.THEMES, corners: style.CORNERS, fonts: style.CHOICE_FONTS },
    default_accent: defaultAccent(organizationId),
    detected: style.storedDetected(organizationId),
  };
}

function saveOrigins(organizationId, list) {
  if (!planAllows(organizationId)) throw httpError('Disponível no plano Premium.', 403, { feature: FEATURE });
  const origins = normalizeOrigins(list);
  settings.set(organizationId, SETTING_KEY, origins);
  return origins;
}

function saveStyle(organizationId, input) {
  if (!planAllows(organizationId)) throw httpError('Disponível no plano Premium.', 403, { feature: FEATURE });
  return style.saveStyle(organizationId, input);
}

// /reservar/<slug>?embed=1 de uma organização sem a funcionalidade. O CSP
// continua 'self': num site de fora o browser nem a mostra; aberta
// diretamente (ou na pré-visualização da própria app) explica porquê.
function unavailablePage() {
  return `<!DOCTYPE html>
<html lang="pt"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex"><title>Reservas no seu site</title>
<style>body{margin:0;font-family:Inter,system-ui,sans-serif;color:#23313b;background:transparent}
main{max-width:520px;margin:40px auto;padding:24px;border:1px solid #e4d9c9;border-radius:16px;background:#fffdf9;text-align:center}
h1{margin:0 0 8px;font-size:20px}p{margin:0;color:#6f665d;line-height:1.5}</style></head>
<body><main><h1>Disponível no plano Premium</h1><p>Mostrar a página de reservas dentro do seu site está incluído no plano Premium. Fale connosco para mudar de plano.</p></main></body></html>`;
}

module.exports = {
  FEATURE, SETTING_KEY, MAX_ORIGINS,
  normalizeOrigin, normalizeOrigins, storedOrigins, planAllows, embedFor, getSettings, saveOrigins, saveStyle, pageStyle, defaultAccent, unavailablePage,
};
