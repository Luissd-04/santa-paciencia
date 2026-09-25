const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// UPLOADS_DIR é relativo à pasta de trabalho: isolar numa pasta temporária.
process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), 'sp-images-')));
process.env.DB_PATH = ':memory:';
const sharp = require('sharp');
const { UPLOADS_DIR } = require('../services/mediaStorage');
const images = require('../services/imageOptimizer');

const photo = (width, height) => sharp({ create: { width, height, channels: 3, background: '#a0522d' } })
  .jpeg({ quality: 100 }).toBuffer();

test('fotografias grandes ficam limitadas a 2000 px', async () => {
  const out = await images.optimizeUpload(await photo(4000, 3000), 'jpg');
  const meta = await sharp(out.data).metadata();
  assert.equal(out.ext, 'jpg');
  assert.equal(meta.width, 2000);
  assert.equal(meta.height, 1500);
});

test('PNG com transparência mantém-se PNG (logótipos dos emails)', async () => {
  const logo = await sharp({ create: { width: 300, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
  const out = await images.optimizeUpload(logo, 'png');
  assert.equal(out.ext, 'png');
  assert.equal((await sharp(out.data).metadata()).hasAlpha, true);
});

test('miniaturas só nas larguras permitidas, geradas uma vez', async () => {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOADS_DIR, 'gallery_teste.jpg'), await photo(1800, 1200));
  assert.equal(await images.thumbnail('/uploads/gallery_teste.jpg', 333), null);
  assert.equal(await images.thumbnail('/uploads/../segredo.jpg', 160), null);
  const [a, b] = await Promise.all([
    images.thumbnail('/uploads/gallery_teste.jpg', 160),
    images.thumbnail('/uploads/gallery_teste.jpg', 160),
  ]);
  assert.equal(a, b);
  const meta = await sharp(a).metadata();
  assert.equal(meta.format, 'webp');
  assert.equal(meta.width, 160);
  images.removeThumbnails('gallery_teste.jpg');
  assert.equal(fs.existsSync(a), false);
});

test('o servidor entrega a miniatura com cache longa e recusa larguras livres', async () => {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOADS_DIR, 'cover_http.jpg'), await photo(1800, 1200));
  const app = require('../app');
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/uploads/cover_http.jpg`;
  try {
    const thumb = await fetch(`${base}?w=160`);
    assert.equal(thumb.status, 200);
    assert.equal(thumb.headers.get('content-type'), 'image/webp');
    assert.match(thumb.headers.get('cache-control'), /max-age=2592000/);
    assert.ok((await thumb.arrayBuffer()).byteLength < 20 * 1024);
    assert.equal((await fetch(`${base}?w=999`)).status, 400);
    assert.equal((await fetch(`${base}`)).headers.get('cache-control'), 'public, max-age=2592000');
  } finally {
    server.close();
  }
});
