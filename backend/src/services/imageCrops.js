// Recortes não destrutivos das imagens dos alojamentos (PENDENTES, ponto 15).
//
// A fotografia de capa guarda um ponto principal (`cover_focal`, x/y de 0 a 1)
// e, se o cliente os afinar à mão, um retângulo por formato (`cover_crops`).
// Os retângulos são normalizados (0..1) em relação à imagem já orientada, por
// isso continuam válidos se a imagem for servida noutra resolução. O formato
// sem retângulo é calculado aqui a partir do ponto principal (ao centro, sem
// ponto). O original nunca é alterado: cada recorte é gerado no servidor, por
// pedido (`/uploads/<f>?crop=<formato>&w=<largura>`, imageOptimizer.cropped).
const crypto = require('crypto');
const { httpError } = require('./httpError');

// Proporção (largura / altura) de cada formato da capa e onde é usado.
const COVER_FORMATS = {
  square: 1,          // listas, cartões pequenos, miniaturas
  banner: 3,          // topo do portal do hóspede, cabeçalho da ficha
  landscape: 16 / 9,  // página pública de reservas, cartões grandes
  share: 1.91,        // pré-visualização do link (Open Graph)
};
// Logótipo: `logo` sem proporção fixa (tirar margens), `mark` quadrado
// (barra lateral recolhida).
const LOGO_FORMATS = { logo: null, mark: 1 };
const FORMATS = { ...COVER_FORMATS, ...LOGO_FORMATS };
const ASPECT_TOLERANCE = 0.02;
const MIN_SIDE_PX = 8;

const isUnit = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;
const round = n => Math.round(n * 1e5) / 1e5;
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

function parse(value) {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string' || !value) return null;
  try { return JSON.parse(value); } catch { return null; }
}

function validateFocal(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object' || !isUnit(value.x) || !isUnit(value.y)) throw httpError('Ponto principal inválido.', 400);
  return { x: round(value.x), y: round(value.y) };
}

// Retângulo normalizado dentro da imagem e, se o formato tiver proporção, com
// essa proporção medida em píxeis (tolerância de 2 % ou de 2 px, o que for
// maior, por causa dos arredondamentos de imagens pequenas).
function validateRect(rect, format, width, height) {
  const name = format in FORMATS ? format : null;
  if (!name) throw httpError('Formato de recorte desconhecido.', 400);
  if (!rect || typeof rect !== 'object' || Array.isArray(rect)) throw httpError(`Recorte «${format}» inválido.`, 400);
  const { x, y, w, h } = rect;
  if (![x, y, w, h].every(isUnit) || w <= 0 || h <= 0 || x + w > 1 + 1e-6 || y + h > 1 + 1e-6) {
    throw httpError(`Recorte «${format}» fora da imagem.`, 400);
  }
  const pw = w * width, ph = h * height;
  if (pw < MIN_SIDE_PX || ph < MIN_SIDE_PX) throw httpError(`Recorte «${format}» demasiado pequeno.`, 400);
  const target = FORMATS[name];
  if (target) {
    const tolerance = Math.max(ASPECT_TOLERANCE, 2 / Math.min(pw, ph));
    if (Math.abs(pw / ph / target - 1) > tolerance) throw httpError(`Recorte «${format}» não tem a proporção do formato.`, 400);
  }
  return { x: round(x), y: round(y), w: round(Math.min(w, 1 - x)), h: round(Math.min(h, 1 - y)) };
}

// Só os formatos da capa; um formato ausente fica automático.
function validateCoverCrops(value, width, height) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object' || Array.isArray(value)) throw httpError('Recortes inválidos.', 400);
  const out = {};
  for (const [format, rect] of Object.entries(value)) {
    if (!(format in COVER_FORMATS)) throw httpError('Formato de recorte desconhecido.', 400);
    if (rect === null) continue;
    out[format] = validateRect(rect, format, width, height);
  }
  return Object.keys(out).length ? out : null;
}

// O maior retângulo com a proporção do formato, centrado no ponto principal
// tanto quanto a imagem deixa.
function autoCrop(format, width, height, focal) {
  const target = FORMATS[format];
  if (!target) return { x: 0, y: 0, w: 1, h: 1 };
  const fx = isUnit(focal?.x) ? focal.x : 0.5;
  const fy = isUnit(focal?.y) ? focal.y : 0.5;
  let pw = width, ph = width / target;
  if (ph > height) { ph = height; pw = height * target; }
  const w = pw / width, h = ph / height;
  return { x: round(clamp(fx - w / 2, 0, 1 - w)), y: round(clamp(fy - h / 2, 0, 1 - h)), w: round(w), h: round(h) };
}

function effectiveCrop(format, width, height, { focal, crops } = {}) {
  const manual = parse(crops)?.[format];
  if (manual) {
    try { return validateRect(manual, format, width, height); } catch { /* inválido: automático */ }
  }
  return autoCrop(format, width, height, parse(focal));
}

// Retângulo em píxeis para o sharp.extract, sempre dentro da imagem.
function toPixels(rect, width, height) {
  const left = clamp(Math.round(rect.x * width), 0, width - 1);
  const top = clamp(Math.round(rect.y * height), 0, height - 1);
  return {
    left, top,
    width: clamp(Math.round(rect.w * width), 1, width - left),
    height: clamp(Math.round(rect.h * height), 1, height - top),
  };
}

// Rodar 90° no sentido dos ponteiros: (x, y) → (1 − y, x).
function rotateFocal(focal, degrees) {
  let p = parse(focal);
  if (!p || !isUnit(p.x) || !isUnit(p.y)) return null;
  for (let turns = ((degrees / 90) % 4 + 4) % 4; turns > 0; turns--) p = { x: round(1 - p.y), y: p.x };
  return p;
}

// Endereço de um recorte da capa: o `v` muda quando o recorte muda, para a
// cache do browser (30 dias) não mostrar o enquadramento antigo; o servidor
// ignora-o e usa sempre o recorte guardado.
function version(...parts) {
  return crypto.createHash('sha1').update(JSON.stringify(parts)).digest('hex').slice(0, 8);
}

function isLocalUpload(url) {
  return typeof url === 'string' && /^\/uploads\/[A-Za-z0-9_.-]+$/.test(url);
}

function coverVariant(row, format) {
  const url = row?.cover_image;
  if (!url) return '';
  if (!isLocalUpload(url)) return url;
  const v = version(parse(row.cover_focal), parse(row.cover_crops)?.[format] || null);
  return `${url}?crop=${format}&a=${encodeURIComponent(row.id)}&v=${v}`;
}

function coverVariants(row) {
  if (!row?.cover_image) return null;
  return Object.fromEntries(Object.keys(COVER_FORMATS).map(format => [format, coverVariant(row, format)]));
}

// Para `object-position` dentro de um recorte (quando o sítio ainda corta mais
// do que o formato, ex.: o topo do portal num ecrã muito largo).
function focalInCrop(row, format, width, height) {
  const focal = parse(row?.cover_focal);
  const fx = isUnit(focal?.x) ? focal.x : 0.5, fy = isUnit(focal?.y) ? focal.y : 0.5;
  if (!width || !height) return `${Math.round(fx * 100)}% ${Math.round(fy * 100)}%`;
  const rect = effectiveCrop(format, width, height, { focal, crops: row.cover_crops });
  const px = rect.w ? clamp((fx - rect.x) / rect.w, 0, 1) : 0.5;
  const py = rect.h ? clamp((fy - rect.y) / rect.h, 0, 1) : 0.5;
  return `${Math.round(px * 100)}% ${Math.round(py * 100)}%`;
}

module.exports = {
  COVER_FORMATS, LOGO_FORMATS, FORMATS,
  parse, validateFocal, validateRect, validateCoverCrops, autoCrop, effectiveCrop, toPixels,
  rotateFocal, version, coverVariant, coverVariants, focalInCrop, isLocalUpload,
};

// Para as páginas públicas e o portal: endereços absolutos de cada formato
// (sem `w`: a página escolhe a largura) e a posição do ponto principal dentro
// de cada recorte, para `object-position`/`background-position`.
function publicCover(row, toUrl = value => value) {
  if (!row?.cover_image || !isLocalUpload(row.cover_image)) return null;
  const size = parse(row.cover_size);
  const out = { variants: {}, position: {} };
  for (const format of Object.keys(COVER_FORMATS)) {
    out.variants[format] = toUrl(coverVariant(row, format));
    out.position[format] = focalInCrop(row, format, size?.w, size?.h);
  }
  return out;
}

module.exports.publicCover = publicCover;
