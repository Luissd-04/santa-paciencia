#!/usr/bin/env node
// Recomprime as fotos já carregadas antes de existir o imageOptimizer.
//
// Os uploads novos já são limitados a 2000 px no momento do envio; este script
// trata os antigos. Mantém nome e formato de cada ficheiro (a base de dados
// aponta para esses URLs) e só substitui quando o resultado é mais pequeno.
//
//   node scripts/optimize-uploads.cjs            # só mostra o que faria
//   node scripts/optimize-uploads.cjs --apply    # grava; originais em data/uploads/.originals/
//
// Correr a partir de backend/src (ou /app no container), como o servidor.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const UPLOADS_DIR = path.resolve('./data/uploads');
const BACKUP_DIR = path.join(UPLOADS_DIR, '.originals');
const MAX_SIDE = 2000;
const MIN_BYTES = 500 * 1024;
const apply = process.argv.includes('--apply');

function encode(image, ext) {
  if (ext === '.png') return image.png({ compressionLevel: 9 });
  if (ext === '.webp') return image.webp({ quality: 82 });
  return image.jpeg({ quality: 82, mozjpeg: true });
}

async function main() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    console.error(`Pasta não encontrada: ${UPLOADS_DIR}`);
    process.exit(1);
  }
  const files = fs.readdirSync(UPLOADS_DIR)
    .filter(name => /\.(jpe?g|png|webp)$/i.test(name))
    .map(name => path.join(UPLOADS_DIR, name));

  let before = 0, after = 0, changed = 0;
  for (const file of files) {
    const size = fs.statSync(file).size;
    const meta = await sharp(file).metadata().catch(() => null);
    if (!meta) { console.log(`ignorado (ilegível)  ${path.basename(file)}`); continue; }
    const tooBig = (meta.width || 0) > MAX_SIDE || (meta.height || 0) > MAX_SIDE;
    if (!tooBig && size < MIN_BYTES) continue;

    const ext = path.extname(file).toLowerCase();
    const data = await encode(
      sharp(file).rotate().resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true }),
      ext,
    ).toBuffer();
    if (data.length >= size) continue;

    before += size; after += data.length; changed++;
    console.log(`${(size / 1024).toFixed(0).padStart(6)} KB → ${(data.length / 1024).toFixed(0).padStart(5)} KB  ${path.basename(file)}`);
    if (apply) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
      const backup = path.join(BACKUP_DIR, path.basename(file));
      if (!fs.existsSync(backup)) fs.copyFileSync(file, backup);
      fs.writeFileSync(file, data);
    }
  }

  const mb = n => (n / 1024 / 1024).toFixed(1);
  console.log(`\n${changed} ficheiro(s): ${mb(before)} MB → ${mb(after)} MB`
    + (apply ? '  (gravado; originais em data/uploads/.originals/)' : '  (simulação — usar --apply para gravar)'));
}

main().catch(error => { console.error(error); process.exit(1); });
