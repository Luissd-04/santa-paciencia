// Dimensões das fotografias já carregadas (orientação EXIF aplicada), para os
// avisos de «fotografia pequena» e para a página pública pedir só larguras
// que o ficheiro tem.
//
// Capas antigas (480×320) foram guardadas sem `cover_size`: o arranque do
// servidor preenche-o uma vez (`backfillCoverSizes`), lendo só o cabeçalho do
// ficheiro. Só se escreve onde está vazio e só para ficheiros locais legíveis;
// capas externas ou em falta ficam sem tamanho (nunca se inventa um valor, e
// sem tamanho não há aviso nem limite de larguras).
const fs = require('fs');
const { db } = require('../config/database');
const { uploadPath } = require('./mediaStorage');
const { orientedSize } = require('./imageOptimizer');
const crops = require('./imageCrops');

const cache = new Map();   // caminho → { key, size }

// { w, h } ou null; guarda o resultado enquanto o ficheiro não mudar.
async function measure(url) {
  const file = uploadPath(url);
  if (!file) return null;
  let stat;
  try { stat = fs.statSync(file); } catch { return null; }
  const key = `${stat.size}:${stat.mtimeMs}`;
  const hit = cache.get(file);
  if (hit?.key === key) return hit.size;
  let size = null;
  try {
    const { width, height } = await orientedSize(file);
    if (width && height) size = { w: width, h: height };
  } catch { /* ilegível: sem tamanho */ }
  cache.set(file, { key, size });
  return size;
}

async function backfillCoverSizes() {
  const rows = db.prepare(`SELECT id, cover_image FROM accommodations
    WHERE cover_image IS NOT NULL AND cover_image != '' AND (cover_size IS NULL OR cover_size = '')`).all();
  let updated = 0;
  for (const row of rows) {
    const size = await measure(row.cover_image);
    if (!size) continue;
    updated += db.prepare("UPDATE accommodations SET cover_size = ? WHERE id = ? AND cover_image = ? AND (cover_size IS NULL OR cover_size = '')")
      .run(JSON.stringify(size), row.id, row.cover_image).changes;
  }
  return { checked: rows.length, updated };
}

// Larguras das fotografias de uma galeria ({ url: { w, h } }); só as que se conseguem medir.
async function gallerySizes(images, limit = 400) {
  const urls = new Set();
  for (const [key, list] of Object.entries(images || {})) {
    if (key === '_sections' || !Array.isArray(list)) continue;
    for (const url of list) if (typeof url === 'string') urls.add(url);
  }
  const out = {};
  for (const url of [...urls].slice(0, limit)) {
    const size = await measure(url);
    if (size) out[url] = size;
  }
  return out;
}

// Capas pequenas de uma organização, para «Por completar» (Área do proprietário).
function smallCovers(organizationId) {
  return db.prepare(`SELECT id, name, cover_size FROM accommodations
    WHERE organization_id = ? AND cover_image IS NOT NULL AND cover_image != '' AND cover_size IS NOT NULL ORDER BY name`)
    .all(organizationId)
    .filter(row => crops.isSmallCover(row.cover_size))
    .map(row => ({ id: row.id, name: row.name, width: crops.parse(row.cover_size).w }));
}

module.exports = { measure, backfillCoverSizes, gallerySizes, smallCovers };
