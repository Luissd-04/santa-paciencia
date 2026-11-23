// Redimensionamento das fotos dos alojamentos.
//
// As fotos chegavam tal como saíam do telemóvel (1–2 MB, 4000 px) e eram
// servidas assim mesmo em miniaturas de 40 px. Agora:
//  - ao carregar, cada imagem é limitada a MAX_SIDE px e recomprimida;
//  - as listas pedem `/uploads/<ficheiro>?w=<largura>` e recebem uma
//    miniatura WebP gerada uma vez e guardada em disco.
const fs = require('fs');
const { httpError } = require('./httpError');
const path = require('path');
const sharp = require('sharp');
const { UPLOADS_DIR, uploadPath } = require('./mediaStorage');

const MAX_SIDE = 2000;
const MAX_INPUT_PIXELS = 40000000;
const THUMB_WIDTHS = new Set([160, 480, 1024, 1600]);
const THUMBS_DIR = path.join(UPLOADS_DIR, '.thumbs');

// Marcas não são fotografias: conservar os bytes e a resolução de PNG/JPEG/
// GIF, sem nova compressão com perdas. Converter WebP/AVIF para PNG porque
// o mesmo ficheiro é usado pelos clientes de email.
async function validateImage(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length > 10 * 1024 * 1024) throw httpError('Imagem demasiado grande (máximo 10 MB).', 400);
  try {
    await sharp(buffer, { failOn: 'warning', limitInputPixels: MAX_INPUT_PIXELS }).resize({ width: 1, height: 1, fit: 'inside' }).png().toBuffer();
  } catch { throw httpError('Imagem inválida, incompleta ou com dimensões excessivas.', 400); }
}
async function optimizeLogoUpload(buffer, ext) {
  await validateImage(buffer);
  if (ext !== 'webp' && ext !== 'avif') return { data: buffer, ext };
  return { data: await sharp(buffer, { failOn: 'error' }).rotate().png().toBuffer(), ext: 'png' };
}

// Fotografias → JPEG. PNG com transparência (logótipos, usados também nos
// emails, onde o Outlook não aceita WebP) mantém-se PNG. GIF fica intacto
// para não perder animação.
async function optimizeUpload(buffer, ext) {
  await validateImage(buffer);
  if (ext === 'gif') return { data: buffer, ext };
  try {
    const image = sharp(buffer, { failOn: 'error' }).rotate();
    const meta = await image.metadata();
    const resized = image.resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true });
    let out;
    if (ext === 'png' && meta.hasAlpha) {
      out = { data: await resized.png({ compressionLevel: 9 }).toBuffer(), ext: 'png' };
    } else if (ext === 'webp' || ext === 'avif') {
      out = { data: await resized.webp({ quality: 82 }).toBuffer(), ext: 'webp' };
    } else {
      out = { data: await resized.jpeg({ quality: 82, mozjpeg: true }).toBuffer(), ext: 'jpg' };
    }
    const larger = (meta.width || 0) > MAX_SIDE || (meta.height || 0) > MAX_SIDE;
    // Fotografia tirada na vertical pelo telemóvel: a orientação EXIF já foi
    // aplicada aos píxeis; o original, com a etiqueta, ficaria deitado em
    // quem a ignore (e os recortes não bateriam certo).
    const rotated = (meta.orientation || 1) !== 1;
    return larger || rotated || out.data.length < buffer.length ? out : { data: buffer, ext };
  } catch { throw httpError('Não foi possível processar a imagem.', 400); }
}

function thumbPath(filename, width) {
  return path.join(THUMBS_DIR, String(width), `${filename}.webp`);
}

const pending = new Map();

// Devolve o caminho da miniatura, gerando-a na primeira vez. Pedidos em
// simultâneo para a mesma miniatura partilham o mesmo trabalho.
async function thumbnail(url, width) {
  if (!THUMB_WIDTHS.has(width)) return null;
  const source = uploadPath(url);
  if (!source || !fs.existsSync(source)) return null;
  const target = thumbPath(path.basename(source), width);
  if (fs.existsSync(target)) return target;
  if (pending.has(target)) return pending.get(target);
  const job = (async () => {
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    const tmp = `${target}.${process.pid}.tmp`;
    await sharp(source, { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({ width, height: width, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 78 })
      .toFile(tmp);
    await fs.promises.rename(tmp, target);
    return target;
  })().finally(() => pending.delete(target));
  pending.set(target, job);
  return job;
}

function removeThumbnails(filename) {
  for (const width of THUMB_WIDTHS) {
    const file = thumbPath(filename, width);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
  fs.rmSync(path.join(CROPS_DIR, path.basename(filename)), { recursive: true, force: true });
}

// ── RECORTES (services/imageCrops.js) ──
// `/uploads/<f>?crop=<formato>&w=<largura>`: extrai o retângulo do original
// já orientado e reduz para a largura pedida. Cada ficheiro em cache tem no
// nome o retângulo em píxeis e a largura, por isso mudar o recorte gera um
// ficheiro novo (o antigo do mesmo formato é apagado).
const CROPS_DIR = path.join(THUMBS_DIR, 'crop');
// Partilha (Open Graph) em JPEG: nem todas as redes leem WebP. Logótipo em PNG,
// por causa da transparência e dos clientes de email.
const CROP_OUTPUT = {
  share: ['jpg', img => img.flatten({ background: '#ffffff' }).jpeg({ quality: 82, mozjpeg: true }), 'image/jpeg'],
  logo: ['png', img => img.png({ compressionLevel: 9 }), 'image/png'],
  mark: ['png', img => img.png({ compressionLevel: 9 }), 'image/png'],
};
const WEBP_OUTPUT = ['webp', img => img.webp({ quality: 78 }), 'image/webp'];
const cropOutput = format => CROP_OUTPUT[format] || WEBP_OUTPUT;

// Dimensões tal como o browser mostra a imagem (orientação EXIF aplicada).
async function orientedSize(source) {
  const meta = await sharp(source, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  const swap = (meta.orientation || 1) >= 5;
  return { width: swap ? meta.height : meta.width, height: swap ? meta.width : meta.height };
}

// `resolveRect(width, height)` devolve o retângulo normalizado a usar (o
// guardado ou o automático); devolve { file, type } ou null.
async function cropped(url, format, width, resolveRect) {
  if (!THUMB_WIDTHS.has(width)) return null;
  const source = uploadPath(url);
  if (!source || path.dirname(source) !== UPLOADS_DIR || !fs.existsSync(source)) return null;
  const size = await orientedSize(source);
  const px = require('./imageCrops').toPixels(resolveRect(size.width, size.height), size.width, size.height);
  const [ext, encode, type] = cropOutput(format);
  const dir = path.join(CROPS_DIR, path.basename(source));
  const prefix = `${format}-`;
  const target = path.join(dir, `${prefix}${px.left}-${px.top}-${px.width}-${px.height}-${width}.${ext}`);
  if (fs.existsSync(target)) return { file: target, type };
  if (pending.has(target)) return pending.get(target);
  const job = (async () => {
    await fs.promises.mkdir(dir, { recursive: true });
    const tmp = `${target}.${process.pid}.tmp`;
    const image = sharp(source, { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .extract(px)
      .resize({ width, withoutEnlargement: true });
    await encode(image).toFile(tmp);
    await fs.promises.rename(tmp, target);
    // Recortes antigos do mesmo formato já não são pedidos por ninguém.
    for (const name of await fs.promises.readdir(dir)) {
      if (name.startsWith(prefix) && name !== path.basename(target) && !name.endsWith('.tmp')) {
        await fs.promises.rm(path.join(dir, name), { force: true });
      }
    }
    return { file: target, type };
  })().finally(() => pending.delete(target));
  pending.set(target, job);
  return job;
}

// Rodar 90°/180°/270° para um ficheiro NOVO (os nomes são imutáveis e o
// browser guarda-os 30 dias). Devolve { data, ext }.
async function rotateImage(file, degrees) {
  if (![90, 180, 270].includes(degrees)) throw httpError('Rotação inválida.', 400);
  const ext = path.extname(file).slice(1).toLowerCase();
  const animated = ext === 'gif';
  const image = sharp(file, { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS, animated }).rotate().rotate(degrees);
  if (ext === 'png') return { data: await image.png({ compressionLevel: 9 }).toBuffer(), ext };
  if (ext === 'gif') return { data: await image.gif().toBuffer(), ext };
  if (ext === 'webp') return { data: await image.webp({ quality: 90 }).toBuffer(), ext };
  return { data: await image.jpeg({ quality: 90, mozjpeg: true }).toBuffer(), ext: 'jpg' };
}

// Extrai o retângulo (normalizado) para um ficheiro novo — o logótipo recortado
// que os emails incorporam (emailMime só aceita ficheiros, não variantes).
async function extractToBuffer(file, rect) {
  const size = await orientedSize(file);
  const px = require('./imageCrops').toPixels(rect, size.width, size.height);
  return sharp(file, { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS }).rotate().extract(px).png({ compressionLevel: 9 }).toBuffer();
}

// «Cortar margens automaticamente»: o retângulo sem as margens de cor igual à
// do canto superior esquerdo (ou transparentes). Imagem toda da mesma cor →
// a imagem inteira.
async function trimSuggestion(file, threshold = 12) {
  const size = await orientedSize(file);
  const oriented = await sharp(file, { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS }).rotate().png().toBuffer();
  let info;
  try { ({ info } = await sharp(oriented).trim({ threshold }).toBuffer({ resolveWithObject: true })); } catch { info = null; }
  if (!info || !info.width || !info.height) return { x: 0, y: 0, w: 1, h: 1 };
  const left = -(info.trimOffsetLeft || 0), top = -(info.trimOffsetTop || 0);
  const r = n => Math.round(n * 1e5) / 1e5;
  return { x: r(left / size.width), y: r(top / size.height), w: r(info.width / size.width), h: r(info.height / size.height) };
}

module.exports = {
  validateImage, MAX_SIDE, THUMB_WIDTHS, optimizeUpload, optimizeLogoUpload, thumbnail, removeThumbnails,
  cropped, orientedSize, rotateImage, extractToBuffer, trimSuggestion,
};
