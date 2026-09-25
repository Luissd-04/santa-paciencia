// Redimensionamento das fotos dos alojamentos.
//
// As fotos chegavam tal como saíam do telemóvel (1–2 MB, 4000 px) e eram
// servidas assim mesmo em miniaturas de 40 px. Agora:
//  - ao carregar, cada imagem é limitada a MAX_SIDE px e recomprimida;
//  - as listas pedem `/uploads/<ficheiro>?w=<largura>` e recebem uma
//    miniatura WebP gerada uma vez e guardada em disco.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { UPLOADS_DIR, uploadPath } = require('./mediaStorage');

const MAX_SIDE = 2000;
const THUMB_WIDTHS = new Set([160, 480, 1024, 1600]);
const THUMBS_DIR = path.join(UPLOADS_DIR, '.thumbs');

// Fotografias → JPEG. PNG com transparência (logótipos, usados também nos
// emails, onde o Outlook não aceita WebP) mantém-se PNG. GIF fica intacto
// para não perder animação.
async function optimizeUpload(buffer, ext) {
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
    return larger || out.data.length < buffer.length ? out : { data: buffer, ext };
  } catch {
    // Imagem que o sharp não consegue ler: guarda-se o original, já validado
    // pelos magic bytes no controlador.
    return { data: buffer, ext };
  }
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
    await sharp(source, { failOn: 'error' })
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
}

module.exports = { MAX_SIDE, THUMB_WIDTHS, optimizeUpload, thumbnail, removeThumbnails };
