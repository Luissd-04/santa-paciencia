// Capas nítidas: larguras permitidas (2048), tamanho máximo das capas vs.
// galeria, srcset que nunca passa da largura do ficheiro e deteção/preenchimento
// das capas pequenas.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), 'sp-resp-')));
Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test', EMAIL_ENABLED: 'false' });
const sharp = require('sharp');
const { UPLOADS_DIR } = require('../services/mediaStorage');
const images = require('../services/imageOptimizer');
const crops = require('../services/imageCrops');
const sizes = require('../services/imageSizes');
const media = require('../controllers/accommodationMediaController');
const cropRoute = require('../services/imageCropRoute');
require('../app');
const { db } = require('../config/database');
const orgs = require('../services/orgService');
const ownerArea = require('../services/ownerArea');

globalThis.window = globalThis;
require('../../../frontend/js/domain/image-crops.js');
const RI = require('../../../frontend/js/domain/responsive-image.js');

const photo = (width, height, ext = 'jpeg') => sharp({ create: { width, height, channels: 3, background: '#3366aa' } })[ext]({ quality: 80 }).toBuffer();
const dataUri = buffer => `data:image/jpeg;base64,${buffer.toString('base64')}`;
function call(handler, req) {
  return new Promise((resolve, reject) => {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { resolve({ status: this.statusCode, body }); return this; } };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

let org;
before(async () => {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  org = orgs.createOrganization('Imagens');
  fs.writeFileSync(path.join(UPLOADS_DIR, 'cover_pequena.webp'), await photo(480, 320, 'webp'));
  fs.writeFileSync(path.join(UPLOADS_DIR, 'cover_grande.jpg'), await photo(3000, 2000));
  fs.writeFileSync(path.join(UPLOADS_DIR, 'gallery_1920.jpg'), await photo(1920, 1280));
  const ins = db.prepare(`INSERT INTO accommodations(id, organization_id, name, type, price_per_night, max_guests, cover_image, cover_size, images)
    VALUES(?, ?, ?, 'alojamento', 100, 2, ?, ?, ?)`);
  ins.run('pequena', org.id, 'Casa Pequena', '/uploads/cover_pequena.webp', null, JSON.stringify({ sala: ['/uploads/gallery_1920.jpg'] }));
  ins.run('grande', org.id, 'Casa Grande', '/uploads/cover_grande.jpg', JSON.stringify({ w: 3000, h: 2000 }), '{}');
  ins.run('externa', org.id, 'Casa Externa', 'https://exemplo.pt/capa.jpg', null, '{}');
  ins.run('ausente', org.id, 'Casa Ausente', '/uploads/cover_nao_existe.jpg', null, '{}');
  ins.run('medida', org.id, 'Casa Medida', '/uploads/cover_pequena.webp', JSON.stringify({ w: 999, h: 999 }), '{}');
});

test('larguras permitidas incluem 2048 e o recorte aceita-as (e só elas)', async () => {
  assert.deepEqual([...images.THUMB_WIDTHS].sort((a, b) => a - b), [160, 480, 1024, 1600, 2048]);
  assert.deepEqual(RI.WIDTHS, [480, 1024, 1600, 2048]);
  const ok = await cropRoute.serve('/uploads/cover_grande.jpg', { crop: 'landscape', w: '2048', a: 'grande' });
  assert.ok(ok.file, 'w=2048 serve o recorte');
  assert.equal((await sharp(ok.file).metadata()).width, 2048);
  assert.equal((await cropRoute.serve('/uploads/cover_grande.jpg', { crop: 'landscape', w: '2049' })).status, 400);
  assert.equal(await images.thumbnail('/uploads/cover_grande.jpg', 3000), null);
});

test('tamanho máximo: capas 2560 px, galeria 2000 px; qualidade e rotação iguais', async () => {
  assert.equal(images.MAX_SIDE, 2000);
  assert.equal(images.COVER_MAX_SIDE, 2560);
  const big = await photo(4000, 2667);
  const gallery = await images.optimizeUpload(big, 'jpg');
  const cover = await images.optimizeUpload(big, 'jpg', { maxSide: images.COVER_MAX_SIDE });
  assert.equal((await sharp(gallery.data).metadata()).width, 2000);
  assert.equal((await sharp(cover.data).metadata()).width, 2560);
  // Uma imagem de 2300 px: a galeria reduz, a capa não.
  const mid = await photo(2300, 1533);
  assert.equal((await sharp((await images.optimizeUpload(mid, 'jpg')).data).metadata()).width, 2000);
  const kept = await images.optimizeUpload(mid, 'jpg', { maxSide: images.COVER_MAX_SIDE });
  assert.equal((await sharp(kept.data).metadata()).width, 2300);
  // A rotação EXIF continua a ser aplicada aos píxeis (tirada na vertical).
  const portrait = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#aa3333' } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const rotated = await images.optimizeUpload(portrait, 'jpg', { maxSide: images.COVER_MAX_SIDE });
  const meta = await sharp(rotated.data).metadata();
  assert.ok(meta.height > meta.width);
});

test('carregar a capa guarda até 2560 px e o tamanho; a galeria fica nos 2000', async () => {
  const req = { params: { id: 'grande' }, user: { organization_id: org.id }, body: { image: dataUri(await photo(3600, 2400)) } };
  const { status, body } = await call(media.uploadCover, req);
  assert.equal(status, 200);
  assert.deepEqual(body.cover_size, { w: 2560, h: 1707 });
  const file = path.join(UPLOADS_DIR, path.basename(body.url));
  assert.equal((await sharp(file).metadata()).width, 2560);
  const gallery = await call(media.uploadImages, { params: { id: 'grande' }, user: { organization_id: org.id }, body: { section: 'sala', image: dataUri(await photo(3600, 2400)) } });
  const url = gallery.body.images.sala.at(-1);
  assert.equal((await sharp(path.join(UPLOADS_DIR, path.basename(url))).metadata()).width, 2000);
  // A capa escolhida na galeria herda o tamanho real da foto.
  const pick = await call(media.uploadCover, { params: { id: 'pequena' }, user: { organization_id: org.id }, body: { url: '/uploads/gallery_1920.jpg' } });
  assert.deepEqual(pick.body.cover_size, { w: 1920, h: 1280 });
});

test('srcset: só larguras ≤ ao ficheiro, nunca maior; sem largura conhecida, todas', () => {
  for (const max of [100, 479, 480, 500, 1023, 1024, 1599, 1600, 2047, 2048, 2560, 5000]) {
    const r = RI.build('/uploads/cover_x.webp?crop=landscape&a=x&v=1', { maxWidth: max, sizes: '100vw' });
    const widths = [...r.srcset.matchAll(/ (\d+)w/g)].map(m => Number(m[1]));
    assert.ok(widths.every(w => w <= max), `max ${max}: ${widths}`);
    assert.ok(widths.every(w => RI.WIDTHS.includes(w)));
    assert.deepEqual(widths, RI.WIDTHS.filter(w => w <= max));
    // Cada descritor corresponde ao ?w= do próprio endereço.
    for (const m of r.srcset.matchAll(/w=(\d+)[^ ]* (\d+)w/g)) assert.equal(m[1], m[2]);
    if (max >= 480) assert.ok(r.srcset); else assert.equal(r.srcset, '');
  }
  assert.deepEqual([...RI.build('/uploads/a.jpg', {}).srcset.matchAll(/ (\d+)w/g)].map(m => Number(m[1])), RI.WIDTHS);
  assert.equal(RI.build('https://outro.pt/a.jpg', { maxWidth: 480 }).srcset, '');
  assert.equal(RI.build('/uploads/a.jpg', { maxWidth: 480 }).src, '/uploads/a.jpg?w=480');
  assert.match(RI.attrs('/uploads/a.jpg?x=1&y=2', { maxWidth: 1024, sizes: '(max-width: 600px) 100vw, 300px' }), /^src="\/uploads\/a\.jpg\?x=1&amp;y=2&amp;w=1024" srcset=".*480w, .*1024w" sizes="\(max-width: 600px\) 100vw, 300px"$/);
});

test('a API pública diz a largura do recorte de cada formato', () => {
  const row = { id: 'x', cover_image: '/uploads/cover_x.webp', cover_size: JSON.stringify({ w: 480, h: 320 }) };
  const cover = crops.publicCover(row);
  assert.deepEqual(cover.size, { w: 480, h: 320 });
  assert.equal(cover.max_width.landscape, 480);
  assert.equal(cover.max_width.banner, 480);
  assert.equal(cover.max_width.square, 320);
  assert.equal(RI.publicCoverWidth(cover, 'landscape'), 480);
  // O mesmo cálculo no frontend (sem a API), a partir de cover_size.
  for (const format of ['landscape', 'banner', 'square']) assert.equal(RI.coverWidth(format, row.cover_size, null, null), cover.max_width[format]);
  // Sem tamanho conhecido não há limite (e a API não o inventa).
  const unknown = crops.publicCover({ ...row, cover_size: null });
  assert.equal(unknown.size, null);
  assert.deepEqual(unknown.max_width, {});
  assert.equal(RI.publicCoverWidth(unknown, 'landscape'), null);
  assert.equal(crops.publicCover({ ...row, cover_size: JSON.stringify({ w: 3000, h: 2000 }) }).max_width.landscape, 3000);
});

test('capa pequena: menos de 1600 px de largura; sem tamanho não há aviso', () => {
  assert.equal(crops.SMALL_COVER_WIDTH, 1600);
  assert.equal(crops.SMALL_GALLERY_WIDTH, 1200);
  assert.equal(crops.isSmallCover({ w: 480, h: 320 }), true);
  assert.equal(crops.isSmallCover('{"w":1599,"h":900}'), true);
  assert.equal(crops.isSmallCover({ w: 1600, h: 900 }), false);
  assert.equal(crops.isSmallCover(null), false);
  assert.equal(crops.isSmallCover('lixo'), false);
  assert.equal(crops.isSmallCover({ w: 0, h: 0 }), false);
});

test('preencher capas sem tamanho: só ficheiros locais legíveis, sem apagar o que já existe', async () => {
  db.prepare("INSERT INTO accommodations(id, organization_id, name, type, price_per_night, max_guests, cover_image) VALUES('semtamanho', ?, 'Sem tamanho', 'alojamento', 100, 2, '/uploads/cover_pequena.webp')").run(org.id);
  const result = await sizes.backfillCoverSizes();
  assert.equal(result.updated, 1, 'só a capa local legível sem tamanho');
  assert.deepEqual(crops.parse(db.prepare("SELECT cover_size FROM accommodations WHERE id = 'semtamanho'").get().cover_size), { w: 480, h: 320 });
  const sizeOf = id => crops.parse(db.prepare('SELECT cover_size FROM accommodations WHERE id = ?').get(id).cover_size);
  assert.equal(sizeOf('externa'), null);
  assert.equal(sizeOf('ausente'), null);
  assert.deepEqual(sizeOf('medida'), { w: 999, h: 999 }, 'não sobrescreve um tamanho já guardado');
  // Repetir não muda nada.
  assert.deepEqual(await sizes.backfillCoverSizes(), { checked: 2, updated: 0 });
});

test('capa antiga de 480 px: preenchida, aparece em «Por completar» e as fotos da galeria são medidas', async () => {
  db.prepare("INSERT INTO accommodations(id, organization_id, name, type, price_per_night, max_guests, cover_image, images) VALUES('velha', ?, 'Quinta Velha', 'alojamento', 100, 2, '/uploads/cover_pequena.webp', ?)")
    .run(org.id, JSON.stringify({ sala: ['/uploads/gallery_1920.jpg', '/uploads/cover_pequena.webp'] }));
  await sizes.backfillCoverSizes();
  assert.deepEqual(crops.parse(db.prepare("SELECT cover_size FROM accommodations WHERE id = 'velha'").get().cover_size), { w: 480, h: 320 });
  const todo = ownerArea.summary(org.id).todo.filter(t => t.key.startsWith('cover:'));
  assert.ok(todo.some(t => t.accommodation_id === 'velha' && t.text === 'A capa de Quinta Velha tem só 480 px e aparece desfocada.'), JSON.stringify(todo));
  assert.ok(!todo.some(t => t.accommodation_id === 'grande'));
  const measured = await sizes.gallerySizes({ sala: ['/uploads/gallery_1920.jpg', '/uploads/cover_pequena.webp', '/uploads/nao_existe.jpg'], _sections: [] });
  assert.deepEqual(measured, { '/uploads/gallery_1920.jpg': { w: 1920, h: 1280 }, '/uploads/cover_pequena.webp': { w: 480, h: 320 } });
});
