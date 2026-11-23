const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// UPLOADS_DIR é relativo à pasta de trabalho: isolar numa pasta temporária.
process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), 'sp-crops-')));
Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test', EMAIL_ENABLED: 'false' });
const sharp = require('sharp');
const { UPLOADS_DIR } = require('../services/mediaStorage');
const images = require('../services/imageOptimizer');
const crops = require('../services/imageCrops');
const media = require('../controllers/accommodationMediaController');
const app = require('../app');
const { db } = require('../config/database');
const orgs = require('../services/orgService');

const near = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

// 3000×2000, fundo azul e um quadrado vermelho fora do centro (à direita, em cima).
async function subjectPhoto() {
  const red = await sharp({ create: { width: 400, height: 400, channels: 3, background: '#ff0000' } }).png().toBuffer();
  return sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#0000ff' } })
    .composite([{ input: red, left: 2200, top: 300 }]).jpeg({ quality: 90 }).toBuffer();
}

function call(handler, req) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { resolve({ status: this.statusCode, body }); return this; },
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

let org, server, base;
before(async () => {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  org = orgs.createOrganization('Recortes');
  fs.writeFileSync(path.join(UPLOADS_DIR, 'cover_teste.jpg'), await subjectPhoto());
  db.prepare(`INSERT INTO accommodations(id, organization_id, name, type, price_per_night, max_guests, cover_image, images)
    VALUES('casa', ?, 'Casa', 'alojamento', 100, 2, '/uploads/cover_teste.jpg', ?)`).run(org.id, JSON.stringify({ quarto: ['/uploads/cover_teste.jpg'] }));
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server?.close());

test('validação dos recortes: dentro da imagem, proporção do formato, formatos conhecidos', () => {
  const ok = crops.validateRect({ x: 0.5, y: 0.1, w: 2 / 9, h: 1 / 3 }, 'square', 3000, 2000);
  near(ok.w, 0.22222);
  assert.throws(() => crops.validateRect({ x: 0.9, y: 0, w: 0.2, h: 0.3 }, 'square', 3000, 2000), /fora da imagem/);
  assert.throws(() => crops.validateRect({ x: 0, y: 0, w: 0.5, h: 0.5 }, 'square', 3000, 2000), /proporção/);
  assert.throws(() => crops.validateRect({ x: -0.1, y: 0, w: 0.2, h: 0.3 }, 'square', 3000, 2000), /fora da imagem/);
  assert.throws(() => crops.validateRect({ x: 0, y: 0, w: 0, h: 0 }, 'square', 3000, 2000), /fora da imagem/);
  assert.throws(() => crops.validateRect({ x: '0', y: 0, w: 0.2, h: 0.3 }, 'square', 3000, 2000), /fora da imagem/);
  assert.throws(() => crops.validateCoverCrops({ circulo: { x: 0, y: 0, w: 1, h: 1 } }, 3000, 2000), /desconhecido/);
  // Faixa 3:1 e partilha 1.91:1 com 1 % de erro de arredondamento passam.
  crops.validateRect({ x: 0, y: 0, w: 1, h: 1 / 2 * 1.01 }, 'banner', 3000, 2000);
  crops.validateRect({ x: 0, y: 0, w: 1, h: 3000 / 1.91 / 2000 }, 'share', 3000, 2000);
  // O logótipo não tem proporção fixa; o quadrado do logótipo tem.
  crops.validateRect({ x: 0.1, y: 0.1, w: 0.8, h: 0.2 }, 'logo', 1000, 1000);
  assert.throws(() => crops.validateRect({ x: 0.1, y: 0.1, w: 0.8, h: 0.2 }, 'mark', 1000, 1000), /proporção/);
  assert.throws(() => crops.validateFocal({ x: 1.2, y: 0.5 }), /Ponto principal/);
  assert.deepEqual(crops.validateFocal({ x: 0.25, y: 0.75 }), { x: 0.25, y: 0.75 });
});

test('recorte automático a partir do ponto principal (ao centro sem ponto)', () => {
  const centre = crops.autoCrop('square', 3000, 2000, null);
  assert.deepEqual(centre, { x: crops.autoCrop('square', 3000, 2000, { x: 0.5, y: 0.5 }).x, y: 0, w: 0.66667, h: 1 });
  near(centre.x, 1 / 6);
  // Ponto à direita: o quadrado encosta à margem direita sem sair da imagem.
  const right = crops.autoCrop('square', 3000, 2000, { x: 0.9, y: 0.2 });
  near(right.x + right.w, 1);
  // Faixa 3:1 numa imagem 3:2: largura toda, altura 1/2, centrada no ponto.
  const banner = crops.autoCrop('banner', 3000, 2000, { x: 0.8, y: 0.2 });
  assert.deepEqual([banner.x, banner.w], [0, 1]);
  near(banner.h, 0.5); near(banner.y, 0);
  const landscape = crops.autoCrop('landscape', 3000, 2000, { x: 0.5, y: 0.9 });
  near(landscape.y + landscape.h, 1);
  // Recorte manual inválido (proporção errada) cai no automático.
  assert.deepEqual(crops.effectiveCrop('square', 3000, 2000, { crops: { square: { x: 0, y: 0, w: 1, h: 1 } } }), centre);
  // Rodar o ponto 90° no sentido dos ponteiros.
  assert.deepEqual(crops.rotateFocal({ x: 0.8, y: 0.2 }, 90), { x: 0.8, y: 0.8 });
  assert.deepEqual(crops.rotateFocal({ x: 0.8, y: 0.2 }, 360), { x: 0.8, y: 0.2 });
});

test('servir ?crop=: cache em disco por retângulo e largura; mudar o recorte muda o ficheiro', async () => {
  const url = `${base}/uploads/cover_teste.jpg?crop=square&w=480`;
  const first = await fetch(url);
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('content-type'), 'image/webp');
  assert.match(first.headers.get('cache-control'), /max-age=300/);
  const meta = await sharp(Buffer.from(await first.arrayBuffer())).metadata();
  assert.deepEqual([meta.width, meta.height], [480, 480]);
  const dir = path.join(UPLOADS_DIR, '.thumbs/crop/cover_teste.jpg');
  const before = fs.readdirSync(dir).filter(name => name.startsWith('square-'));
  assert.equal(before.length, 1);

  // Quadrado à mão em cima do motivo vermelho (2200..2600 × 300..700).
  db.prepare('UPDATE accommodations SET cover_crops = ? WHERE id = ?')
    .run(JSON.stringify({ square: { x: 2200 / 3000, y: 300 / 2000, w: 400 / 3000, h: 400 / 2000 } }), 'casa');
  const v = crops.coverVariant(db.prepare('SELECT * FROM accommodations WHERE id = ?').get('casa'), 'square');
  assert.match(v, /^\/uploads\/cover_teste\.jpg\?crop=square&a=casa&v=[a-f0-9]{8}$/);
  const second = await fetch(`${base}${v}&w=160`);
  assert.equal(second.status, 200);
  assert.match(second.headers.get('cache-control'), /max-age=2592000/);
  const { data } = await sharp(Buffer.from(await second.arrayBuffer())).raw().toBuffer({ resolveWithObject: true });
  assert.ok(data[0] > 200 && data[2] < 60, 'o recorte à mão devia mostrar o motivo vermelho');
  const after = fs.readdirSync(dir).filter(name => name.startsWith('square-'));
  assert.equal(after.length, 1);
  assert.notDeepEqual(after, before, 'o recorte novo devia ter outro ficheiro em cache');
  // A versão do endereço muda com o recorte.
  db.prepare('UPDATE accommodations SET cover_crops = NULL WHERE id = ?').run('casa');
  assert.notEqual(crops.coverVariant(db.prepare('SELECT * FROM accommodations WHERE id = ?').get('casa'), 'square'), v);

  // Partilha em JPEG (Open Graph) e original intacto.
  const share = await fetch(`${base}/uploads/cover_teste.jpg?crop=share&w=1024`);
  assert.equal(share.headers.get('content-type'), 'image/jpeg');
  const shareMeta = await sharp(Buffer.from(await share.arrayBuffer())).metadata();
  near(shareMeta.width / shareMeta.height, 1.91, 0.01);
  assert.equal((await sharp(path.join(UPLOADS_DIR, 'cover_teste.jpg')).metadata()).width, 3000);
});

test('servir ?crop=: recusa parâmetros e caminhos inválidos', async () => {
  const get = query => fetch(`${base}/uploads/cover_teste.jpg?${query}`).then(r => r.status);
  assert.equal(await get('crop=circulo&w=480'), 400);
  assert.equal(await get('crop=square&w=333'), 400);
  assert.equal(await get('crop=square&w=480&w=160'), 400);
  assert.equal(await get('crop=square&crop=banner'), 400);
  assert.equal(await get('crop=square&a=../x'), 400);
  assert.equal(await get('crop=square&v=<x>'), 400);
  assert.equal(await get('crop=__proto__'), 400);
  assert.equal((await fetch(`${base}/uploads/nao-existe.jpg?crop=square&w=480`)).status, 404);
  assert.equal((await fetch(`${base}/uploads/%2e%2e%2fsegredo.jpg?crop=square&w=480`)).status, 404);
  assert.equal((await fetch(`${base}/uploads/receipts%2Fx.jpg?crop=square&w=480`)).status, 404);
});

test('guardar recortes da capa valida no servidor e roda para um ficheiro novo', async () => {
  const req = body => ({ params: { id: 'casa' }, user: { organization_id: org.id }, body });
  await assert.rejects(call(media.saveCoverCrops, req({ crops: { square: { x: 0, y: 0, w: 1, h: 1 } } })), /proporção/);
  const saved = await call(media.saveCoverCrops, req({ focal: { x: 0.8, y: 0.25 }, crops: { banner: { x: 0, y: 0, w: 1, h: 0.5 } } }));
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body.cover_focal, { x: 0.8, y: 0.25 });
  assert.deepEqual(saved.body.cover_size, { w: 3000, h: 2000 });
  // Rodada 90°: 2000×3000; a faixa vem nas coordenadas novas.
  const rotated = await call(media.saveCoverCrops, req({ rotate: 90, focal: { x: 0.75, y: 0.8 }, crops: { square: { x: 0, y: 0.3, w: 1, h: 2 / 3 } } }));
  assert.equal(rotated.status, 200);
  assert.notEqual(rotated.body.cover_image, '/uploads/cover_teste.jpg');
  assert.deepEqual(rotated.body.cover_size, { w: 2000, h: 3000 });
  const file = path.join(UPLOADS_DIR, path.basename(rotated.body.cover_image));
  assert.deepEqual(Object.values(await images.orientedSize(file)), [2000, 3000]);
  // O original continua na galeria, por isso não foi apagado.
  assert.ok(fs.existsSync(path.join(UPLOADS_DIR, 'cover_teste.jpg')));
});

test('galeria: rodar 90° cria ficheiro novo, troca as referências e apaga miniaturas do antigo', async () => {
  fs.writeFileSync(path.join(UPLOADS_DIR, 'gallery_rodar.jpg'), await sharp({ create: { width: 600, height: 400, channels: 3, background: '#336699' } }).jpeg().toBuffer());
  db.prepare('UPDATE accommodations SET images = ? WHERE id = ?').run(JSON.stringify({ sala: ['/uploads/gallery_rodar.jpg'] }), 'casa');
  const thumb = await images.thumbnail('/uploads/gallery_rodar.jpg', 160);
  assert.ok(fs.existsSync(thumb));
  const req = { params: { id: 'casa' }, user: { organization_id: org.id }, body: { url: '/uploads/gallery_rodar.jpg', degrees: 90 } };
  const out = await call(media.rotateGalleryImage, req);
  assert.equal(out.status, 200);
  assert.match(out.body.url, /^\/uploads\/gallery_.+\.jpg$/);
  assert.deepEqual(out.body.images.sala, [out.body.url]);
  const meta = await sharp(path.join(UPLOADS_DIR, path.basename(out.body.url))).metadata();
  assert.deepEqual([meta.width, meta.height], [400, 600]);
  assert.equal(fs.existsSync(path.join(UPLOADS_DIR, 'gallery_rodar.jpg')), false);
  assert.equal(fs.existsSync(thumb), false);
  // Só imagens deste alojamento; rotações livres recusadas.
  assert.equal((await call(media.rotateGalleryImage, { ...req, body: { url: '/uploads/outra.jpg', degrees: 90 } })).status, 404);
  assert.equal((await call(media.rotateGalleryImage, { ...req, body: { url: out.body.url, degrees: 45 } })).status, 400);
});

test('EXIF: fotografia vertical do telemóvel fica direita ao carregar', async () => {
  const sideways = await sharp({ create: { width: 300, height: 200, channels: 3, background: '#888888' } })
    .jpeg({ quality: 40 }).withMetadata({ orientation: 6 }).toBuffer();
  const out = await images.optimizeUpload(sideways, 'jpg');
  const meta = await sharp(out.data).metadata();
  assert.deepEqual([meta.width, meta.height, meta.orientation || 1], [200, 300, 1]);
});

test('logótipo: sugestão de margens (trim) e recorte guardado como ficheiro próprio', async () => {
  const mark = await sharp({ create: { width: 200, height: 80, channels: 4, background: '#843424' } }).png().toBuffer();
  const logo = await sharp({ create: { width: 1000, height: 600, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: mark, left: 300, top: 260 }]).png().toBuffer();
  fs.writeFileSync(path.join(UPLOADS_DIR, 'logo_margens.png'), logo);
  db.prepare("UPDATE accommodations SET logo_url = '/uploads/logo_margens.png' WHERE id = 'casa'").run();
  const suggestion = await images.trimSuggestion(path.join(UPLOADS_DIR, 'logo_margens.png'));
  near(suggestion.x, 0.3); near(suggestion.y, 260 / 600); near(suggestion.w, 0.2); near(suggestion.h, 80 / 600);

  const req = body => ({ params: { id: 'casa' }, user: { organization_id: org.id }, body });
  const trim = await call(media.trimLogo, req({}));
  assert.deepEqual(trim.body.crop, suggestion);
  const square = { x: 0.3, y: 260 / 600 - 0.1, w: 0.2, h: 1 / 3 };
  const saved = await call(media.saveLogoCrops, req({ crop: suggestion, square }));
  assert.equal(saved.status, 200);
  assert.equal(saved.body.logo_original_url, '/uploads/logo_margens.png');
  assert.notEqual(saved.body.logo_url, '/uploads/logo_margens.png');
  const meta = await sharp(path.join(UPLOADS_DIR, path.basename(saved.body.logo_url))).metadata();
  assert.deepEqual([meta.width, meta.height], [200, 80]);
  // Emails: o logo_url (recortado) é um ficheiro em /uploads, incorporado por CID.
  const { getEmailSettings } = require('../services/emailService');
  assert.match(getEmailSettings(db.prepare("SELECT * FROM accommodations WHERE id = 'casa'").get(), org.id).logo_url, new RegExp(`${saved.body.logo_url.replace(/[.?]/g, '\\$&')}$`));
  // Barra recolhida: o quadrado, a partir do original.
  const markRes = await fetch(`${base}${saved.body.logo_url}?crop=mark&w=160`);
  assert.equal(markRes.status, 200);
  assert.equal(markRes.headers.get('content-type'), 'image/png');
  const markMeta = await sharp(Buffer.from(await markRes.arrayBuffer())).metadata();
  assert.deepEqual([markMeta.width, markMeta.height], [160, 160]);
  // Repor: volta ao original e o recortado sai.
  const reset = await call(media.saveLogoCrops, req({ crop: null, square: null }));
  assert.equal(reset.body.logo_url, '/uploads/logo_margens.png');
  assert.equal(reset.body.logo_original_url, null);
  assert.equal(fs.existsSync(path.join(UPLOADS_DIR, path.basename(saved.body.logo_url))), false);
});

test('Open Graph da página pública usa o recorte de partilha', () => {
  db.prepare("UPDATE accommodations SET public_slug = 'casa-teste', description = 'Casa \"com\" vista' WHERE id = 'casa'").run();
  const tags = require('../services/openGraph').bookingTags({ protocol: 'http', get: () => 'exemplo.test' }, 'casa-teste');
  assert.match(tags, /og:title" content="Casa"/);
  assert.match(tags, /og:description" content="Casa &quot;com&quot; vista"/);
  assert.match(tags, /og:image" content="http:\/\/exemplo\.test\/uploads\/cover_[^"]+\?crop=share&amp;a=casa&amp;v=[a-f0-9]{8}&amp;w=1024"/);
  assert.equal(require('../services/openGraph').bookingTags({ protocol: 'http', get: () => 'x' }, 'nao-existe'), '');
});
