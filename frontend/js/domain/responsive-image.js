// Imagens responsivas das fotografias carregadas na aplicação (/uploads/…):
// `srcset` com as larguras que o servidor gera (THUMB_WIDTHS em
// backend/src/services/imageOptimizer.js) e `sizes` consoante o sítio.
//
// Regra: nunca se pede uma largura maior do que a do ficheiro (o servidor não
// amplia, e um descritor «2048w» para um ficheiro de 480 px enganava o browser).
// Sem largura conhecida, oferecem-se todas. Está num ficheiro à parte porque as
// páginas públicas (reserva, incorporada, portal) não carregam helpers.js.
(() => {
const WIDTHS = Object.freeze([480, 1024, 1600, 2048]);
// Largura do pedido para quem não suporta srcset (ou a única possível).
const FALLBACK_WIDTH = 1024;

// Larguras do srcset que cabem num ficheiro com `max` px de largura; vazio
// quando o ficheiro é mais estreito do que a menor. Sem `max`, todas.
function widths(max) {
  const n = Number(max);
  return Number.isFinite(n) && n > 0 ? WIDTHS.filter(w => w <= n) : [...WIDTHS];
}

function origin() { return globalThis.location?.origin || 'http://localhost'; }

// Só fotografias da própria aplicação; URLs externos ficam como estão.
function isLocalUpload(url) {
  try {
    const parsed = new URL(String(url || ''), origin());
    return parsed.origin === origin() && /^\/uploads\/[^/]+$/.test(parsed.pathname);
  } catch { return false; }
}

function withWidth(url, width) {
  const parsed = new URL(String(url), origin());
  parsed.searchParams.set('w', String(width));
  return String(url).startsWith('/') ? `${parsed.pathname}${parsed.search}` : parsed.href;
}

// { src, srcset, sizes } de um endereço. `src` serve de recurso a browsers sem
// srcset; `srcset` fica vazio quando não há mais do que escolher (URL externo
// ou ficheiro mais estreito do que 480 px, que se pede em 480 e o servidor
// devolve tal como está).
function build(url, { maxWidth, sizes = '100vw' } = {}) {
  if (!url) return { src: '', srcset: '', sizes: '' };
  if (!isLocalUpload(url)) return { src: url, srcset: '', sizes: '' };
  const list = widths(maxWidth);
  if (!list.length) return { src: withWidth(url, WIDTHS[0]), srcset: '', sizes: '' };
  const fallback = [...list].reverse().find(w => w <= FALLBACK_WIDTH) || list[0];
  return { src: withWidth(url, fallback), srcset: list.map(w => `${withWidth(url, w)} ${w}w`).join(', '), sizes };
}

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));

// Atributos prontos para um <img> (os valores vão escapados).
function attrs(url, options) {
  const r = build(url, options);
  if (!r.src) return '';
  return `src="${esc(r.src)}"${r.srcset ? ` srcset="${esc(r.srcset)}" sizes="${esc(r.sizes)}"` : ''}`;
}

// Largura, em píxeis do original, do recorte de um formato da capa (o que o
// servidor serve); null sem tamanho conhecido.
function coverWidth(format, size, focal, crops) {
  const C = globalThis.ImageCrops;
  const s = C?.parse(size);
  if (!C || !(s?.w > 0) || !(s?.h > 0)) return null;
  const rect = C.effectiveCrop(format, s.w, s.h, focal, crops);
  return Math.max(1, Math.min(s.w, Math.round(rect.w * s.w)));
}

// Para as páginas públicas e o portal, a API já traz `cover.max_width`.
function publicCoverWidth(cover, format) {
  const n = Number(cover?.max_width?.[format]);
  return n > 0 ? n : null;
}

const api = Object.freeze({ WIDTHS, widths, build, attrs, withWidth, isLocalUpload, coverWidth, publicCoverWidth });
if (typeof module !== 'undefined' && module.exports) module.exports = api;
globalThis.ResponsiveImage = api;
})();
