// Recortes não destrutivos das imagens (o mesmo cálculo de
// backend/src/services/imageCrops.js): ponto principal e um retângulo por
// formato, normalizados de 0 a 1 em relação à imagem já orientada. O formato
// sem retângulo guardado é calculado a partir do ponto principal.
(() => {
const COVER_FORMATS = Object.freeze({
  square: { ratio: 1, label: 'Quadrado 1:1', usage: 'Miniaturas, lista de alojamentos, cartões' },
  banner: { ratio: 3, label: 'Faixa 3:1', usage: 'Topo do portal do hóspede, cabeçalho da ficha' },
  landscape: { ratio: 16 / 9, label: 'Paisagem 16:9', usage: 'Página pública de reservas, cartões grandes' },
  share: { ratio: 1.91, label: 'Partilha 1.91:1', usage: 'Pré-visualização do link no WhatsApp/Facebook' },
});

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const round = n => Math.round(n * 1e5) / 1e5;
const isUnit = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;

function parse(value) {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string' || !value) return null;
  try { return JSON.parse(value); } catch { return null; }
}

// O maior retângulo com a proporção `ratio` (largura/altura em píxeis),
// centrado no ponto tanto quanto a imagem deixa. Sem proporção: a imagem toda.
function autoCrop(ratio, width, height, focal) {
  if (!ratio || !width || !height) return { x: 0, y: 0, w: 1, h: 1 };
  const fx = isUnit(focal?.x) ? focal.x : 0.5;
  const fy = isUnit(focal?.y) ? focal.y : 0.5;
  let pw = width, ph = width / ratio;
  if (ph > height) { ph = height; pw = height * ratio; }
  const w = pw / width, h = ph / height;
  return { x: round(clamp(fx - w / 2, 0, 1 - w)), y: round(clamp(fy - h / 2, 0, 1 - h)), w: round(w), h: round(h) };
}

function validRect(rect) {
  return rect && [rect.x, rect.y, rect.w, rect.h].every(isUnit) && rect.w > 0 && rect.h > 0
    && rect.x + rect.w <= 1 + 1e-6 && rect.y + rect.h <= 1 + 1e-6;
}

function effectiveCrop(format, width, height, focal, crops) {
  const manual = parse(crops)?.[format];
  if (validRect(manual)) return manual;
  return autoCrop(COVER_FORMATS[format]?.ratio, width, height, parse(focal));
}

// Rodar 90° no sentido dos ponteiros: (x, y) → (1 − y, x).
function rotateFocal(focal) {
  return focal && isUnit(focal.x) && isUnit(focal.y) ? { x: round(1 - focal.y), y: focal.x } : null;
}

// Versão curta do recorte para o endereço (`v`): muda quando o recorte muda,
// para a cache do browser não mostrar o enquadramento antigo.
function version(...parts) {
  const text = JSON.stringify(parts);
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0;
  return hash.toString(36);
}

// Posição do ponto principal (CSS) dentro do recorte de um formato, ou na
// imagem toda sem formato.
function focalPosition(focal, rect) {
  const f = parse(focal);
  const fx = isUnit(f?.x) ? f.x : 0.5, fy = isUnit(f?.y) ? f.y : 0.5;
  const px = rect?.w ? clamp((fx - rect.x) / rect.w, 0, 1) : fx;
  const py = rect?.h ? clamp((fy - rect.y) / rect.h, 0, 1) : fy;
  return `${Math.round(px * 100)}% ${Math.round(py * 100)}%`;
}

window.ImageCrops = Object.freeze({ COVER_FORMATS, parse, autoCrop, validRect, effectiveCrop, rotateFocal, version, focalPosition, clamp, round });
})();
