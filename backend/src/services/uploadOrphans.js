// Uploads sem referência na base (todas as organizações): capas, galerias,
// logótipos e talões, e miniaturas cujo original já não existe. Por omissão
// só lista. Apagar exige o número visto na pré-visualização e uma idade mínima
// (um ficheiro acabado de carregar ainda pode estar a ser associado).
const fs = require('fs');
const { httpError } = require('./httpError');
const path = require('path');
const { db } = require('../config/database');
const { UPLOADS_DIR, accommodationUrls, uploadPath } = require('./mediaStorage');

const THUMBS = '.thumbs';

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && entry.name !== '.DS_Store') out.push(full);
  }
  return out;
}

function referencedFiles() {
  const urls = accommodationUrls(db.prepare('SELECT cover_image, logo_url, images FROM accommodations').all());
  for (const row of db.prepare('SELECT receipt_image FROM expenses WHERE receipt_image IS NOT NULL').all()) urls.add(row.receipt_image);
  return new Set([...urls].map(uploadPath).filter(Boolean));
}

function findOrphans({ minAgeHours = 24 } = {}) {
  const referenced = referencedFiles();
  const cutoff = Date.now() - Math.max(0, Number(minAgeHours) || 0) * 3600000;
  const thumbsRoot = path.join(UPLOADS_DIR, THUMBS);
  const all = walk(UPLOADS_DIR);
  const originals = new Set(all.filter(file => !file.startsWith(thumbsRoot + path.sep)).map(file => path.basename(file)));
  const files = [];
  for (const file of all) {
    const stat = fs.statSync(file);
    if (stat.mtimeMs > cutoff) continue;
    const relative = path.relative(UPLOADS_DIR, file).split(path.sep).join('/');
    if (file.startsWith(thumbsRoot + path.sep)) {
      // Miniatura: .thumbs/<largura>/<original>.webp — órfã se o original saiu.
      const original = path.basename(file).replace(/\.webp$/, '');
      if (!originals.has(original)) files.push({ path: relative, bytes: stat.size, kind: 'thumbnail', modified: stat.mtime.toISOString() });
    } else if (!referenced.has(file)) {
      files.push({ path: relative, bytes: stat.size, kind: 'upload', modified: stat.mtime.toISOString() });
    }
  }
  return { count: files.length, bytes: files.reduce((sum, f) => sum + f.bytes, 0), min_age_hours: Number(minAgeHours) || 0, files };
}

function removeOrphans({ expected, minAgeHours = 24 } = {}) {
  const found = findOrphans({ minAgeHours });
  if (Number(expected) !== found.count) {
    throw httpError(`Encontrados ${found.count} ficheiros órfãos, não ${expected}. Reveja a lista antes de apagar.`, 409);
  }
  const referenced = referencedFiles();
  let removed = 0, bytes = 0;
  for (const file of found.files) {
    const full = path.join(UPLOADS_DIR, file.path);
    // Verificação final: nunca apagar algo que entretanto passou a ser usado.
    if (file.kind === 'upload' && referenced.has(full)) continue;
    fs.unlinkSync(full);
    removed++; bytes += file.bytes;
  }
  return { removed, bytes };
}

module.exports = { findOrphans, removeOrphans };
