const { db } = require('../config/database');
const path = require('path');
const fs = require('fs');
const { isAllowedImageUrl, removeUnreferencedImage, detectImageMagicType } = require('../services/mediaStorage');
const { optimizeUpload, optimizeLogoUpload, orientedSize, rotateImage, extractToBuffer, trimSuggestion } = require('../services/imageOptimizer');
const crops = require('../services/imageCrops');
const { uploadPath } = require('../services/mediaStorage');
const COMMON_AREAS_KEY = 'areas_comuns';
const UPLOADS_DIR = path.resolve('./data/uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Tipos de imagem permitidos: MIME type → extensão segura
const ALLOWED_IMAGE_TYPES = {
  'jpeg': 'jpg',
  'jpg':  'jpg',
  'png':  'png',
  'gif':  'gif',
  'webp': 'webp',
  'avif': 'avif',
};

function parseImageDataUri(dataUri) {
  const match = String(dataUri || '').match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
  if (!match) return null;
  const declaredType = match[1].toLowerCase();
  const ext = ALLOWED_IMAGE_TYPES[declaredType];
  if (!ext) return null;
  const data = Buffer.from(match[2], 'base64');
  const actualType = detectImageMagicType(data);
  if (!actualType) return null;
  // Tolerar declarado=jpg/jpeg vs actual=jpeg (são o mesmo formato).
  const normalizedDeclared = declaredType === 'jpg' ? 'jpeg' : declaredType;
  if (actualType !== normalizedDeclared) return null;
  return { ext, data };
}

async function uploadCover(req, res) {
  const { id } = req.params;
  if (!req.body.image && !req.body.url) return res.status(400).json({ error: 'Imagem em falta' });
  const accommodation = db.prepare('SELECT id FROM accommodations WHERE id = ? AND organization_id = ?').get(id, req.user.organization_id);
  if (!accommodation) return res.status(404).json({ error: 'Alojamento não encontrado' });

  if (req.body.url) {
    const url = String(req.body.url || '').trim();
    if (!isAllowedImageUrl(url, req.user.organization_id)) return res.status(400).json({ error: 'Imagem não pertence à organização ou URL inválido.' });
    const size = await coverSize(url);
    db.prepare('UPDATE accommodations SET cover_image = ?, cover_focal = NULL, cover_crops = NULL, cover_size = ? WHERE id = ? AND organization_id = ?')
      .run(url || null, size, id, req.user.organization_id);
    return res.json({ success: true, url, cover_size: crops.parse(size) });
  }

  // Guardar base64 como ficheiro
  const parsed = parseImageDataUri(req.body.image);
  if (!parsed) return res.status(400).json({ error: 'Formato de imagem inválido. Tipos aceites: JPEG, PNG, GIF, WebP, AVIF.' });

  const optimized = await optimizeUpload(parsed.data, parsed.ext);
  const filename = `cover_${require('crypto').randomUUID()}.${optimized.ext}`;
  const filepath = path.join(UPLOADS_DIR, filename);
  fs.writeFileSync(filepath, optimized.data);

  const url = `/uploads/${filename}`;
  const size = await coverSize(url);
  // Capa nova: o ponto principal e os recortes da anterior não lhe servem.
  db.prepare('UPDATE accommodations SET cover_image = ?, cover_focal = NULL, cover_crops = NULL, cover_size = ? WHERE id = ? AND organization_id = ?')
    .run(url, size, id, req.user.organization_id);
  res.json({ success: true, url, cover_size: crops.parse(size) });
}

// Tamanho já orientado ({w,h} em JSON), para o portal e a página pública
// posicionarem o ponto principal sem abrir o ficheiro. Só uploads locais.
async function coverSize(url) {
  const file = uploadPath(url);
  if (!file || !fs.existsSync(file)) return null;
  try {
    const { width, height } = await orientedSize(file);
    return width && height ? JSON.stringify({ w: width, h: height }) : null;
  } catch { return null; }
}

function writeUpload(prefix, data, ext) {
  const filename = `${prefix}_${require('crypto').randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), data);
  return `/uploads/${filename}`;
}

const coverFields = row => ({
  cover_image: row.cover_image || null,
  cover_focal: crops.parse(row.cover_focal),
  cover_crops: crops.parse(row.cover_crops),
  cover_size: crops.parse(row.cover_size),
});

// «Ajustar recortes» → «Guardar recortes». `rotate` (90/180/270) roda a capa
// para um ficheiro novo antes de gravar; o ponto e os retângulos vêm já nas
// coordenadas da imagem rodada.
async function saveCoverCrops(req, res) {
  const { id } = req.params;
  const orgId = req.user.organization_id;
  const row = db.prepare('SELECT id, cover_image, images FROM accommodations WHERE id = ? AND organization_id = ?').get(id, orgId);
  if (!row) return res.status(404).json({ error: 'Alojamento não encontrado' });
  const file = uploadPath(row.cover_image);
  if (!file || !fs.existsSync(file)) return res.status(400).json({ error: 'Só as fotografias carregadas na aplicação podem ser recortadas.' });
  const rotate = Number(req.body?.rotate || 0);
  if (![0, 90, 180, 270].includes(rotate)) return res.status(400).json({ error: 'Rotação inválida.' });

  const size = await orientedSize(file);
  const [width, height] = rotate % 180 ? [size.height, size.width] : [size.width, size.height];
  const focal = crops.validateFocal(req.body?.focal);
  const rects = crops.validateCoverCrops(req.body?.crops, width, height);

  let url = row.cover_image;
  if (rotate) {
    const rotated = await rotateImage(file, rotate);
    url = writeUpload('cover', rotated.data, rotated.ext);
  }
  db.prepare('UPDATE accommodations SET cover_image = ?, cover_focal = ?, cover_crops = ?, cover_size = ? WHERE id = ? AND organization_id = ?')
    .run(url, focal ? JSON.stringify(focal) : null, rects ? JSON.stringify(rects) : null, JSON.stringify({ w: width, h: height }), id, orgId);
  if (url !== row.cover_image) removeUnreferencedImage(row.cover_image);
  res.json({ success: true, ...coverFields(db.prepare('SELECT * FROM accommodations WHERE id = ?').get(id)) });
}

// Galeria: «Rodar 90°». O ficheiro rodado é novo (nomes imutáveis, cache de 30
// dias) e substitui o antigo em todas as divisões deste alojamento e na capa;
// as miniaturas do antigo saem com ele.
async function rotateGalleryImage(req, res) {
  const { id } = req.params;
  const orgId = req.user.organization_id;
  const url = String(req.body?.url || '');
  const degrees = Number(req.body?.degrees || 90);
  if (![90, 180, 270].includes(degrees)) return res.status(400).json({ error: 'Rotação inválida.' });
  const row = db.prepare('SELECT id, parent_id, cover_image, cover_focal, images FROM accommodations WHERE id = ? AND organization_id = ?').get(id, orgId);
  if (!row) return res.status(404).json({ error: 'Alojamento não encontrado' });
  const imgs = row.images ? JSON.parse(row.images) : {};
  const sections = Object.entries(imgs).filter(([key, list]) => key !== '_sections' && Array.isArray(list) && list.includes(url));
  if (!sections.length && row.cover_image !== url) return res.status(404).json({ error: 'Imagem não encontrada neste alojamento.' });
  if (row.parent_id && sections.some(([key]) => key === COMMON_AREAS_KEY)) {
    return res.status(400).json({ error: 'Áreas comuns herdadas não podem ser editadas aqui.' });
  }
  const file = uploadPath(url);
  if (!file || !fs.existsSync(file)) return res.status(400).json({ error: 'Só as fotografias carregadas na aplicação podem ser rodadas.' });

  const rotated = await rotateImage(file, degrees);
  const prefix = path.basename(file).startsWith('cover_') ? 'cover' : 'gallery';
  const next = writeUpload(prefix, rotated.data, rotated.ext);
  for (const [key, list] of sections) imgs[key] = list.map(u => (u === url ? next : u));
  const isCover = row.cover_image === url;
  const size = isCover ? await coverSize(next) : null;
  db.prepare(`UPDATE accommodations SET images = ?,
      cover_image = CASE WHEN cover_image = ? THEN ? ELSE cover_image END,
      cover_focal = CASE WHEN cover_image = ? THEN ? ELSE cover_focal END,
      cover_crops = CASE WHEN cover_image = ? THEN NULL ELSE cover_crops END,
      cover_size = CASE WHEN cover_image = ? THEN ? ELSE cover_size END
    WHERE id = ? AND organization_id = ?`)
    .run(JSON.stringify(imgs), url, next, url, isCover ? JSON.stringify(crops.rotateFocal(row.cover_focal, degrees)) : null,
      url, url, size, id, orgId);
  removeUnreferencedImage(url);
  const fresh = db.prepare('SELECT * FROM accommodations WHERE id = ?').get(id);
  res.json({ success: true, url: next, images: JSON.parse(fresh.images || '{}'), ...coverFields(fresh) });
}

function removeCover(req, res) {
  const { id } = req.params;
  const row = db.prepare('SELECT cover_image, images FROM accommodations WHERE id = ? AND organization_id = ?').get(id, req.user.organization_id);
  if (!row) return res.status(404).json({ error: 'Alojamento não encontrado' });

  const coverUrl = row.cover_image;
  db.prepare('UPDATE accommodations SET cover_image = NULL, cover_focal = NULL, cover_crops = NULL, cover_size = NULL WHERE id = ? AND organization_id = ?').run(id, req.user.organization_id);

  if (coverUrl) {
    const images = row.images ? JSON.parse(row.images) : {};
    const stillReferenced = Object.values(images).some(list => Array.isArray(list) && list.includes(coverUrl));
    if (!stillReferenced) {
      removeUnreferencedImage(coverUrl);
    }
  }

  res.json({ success: true });
}

// ─── LOGÓTIPO (herdado pelas suites — só editável no alojamento principal) ──
async function uploadLogo(req, res) {
  const { id } = req.params;
  if (!req.body.image) return res.status(400).json({ error: 'Imagem em falta' });
  const accommodation = db.prepare('SELECT id, parent_id, logo_url, logo_original_url FROM accommodations WHERE id = ? AND organization_id = ?').get(id, req.user.organization_id);
  if (!accommodation) return res.status(404).json({ error: 'Alojamento não encontrado' });
  if (accommodation.parent_id) {
    return res.status(400).json({ error: 'O logótipo só pode ser definido no alojamento principal — as suites herdam-no automaticamente.' });
  }

  const parsed = parseImageDataUri(req.body.image);
  if (!parsed) return res.status(400).json({ error: 'Formato de imagem inválido. Tipos aceites: JPEG, PNG, GIF, WebP, AVIF.' });

  const optimized = await optimizeLogoUpload(parsed.data, parsed.ext);
  const filename = `logo_${require('crypto').randomUUID()}.${optimized.ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), optimized.data);
  const url = `/uploads/${filename}`;
  db.prepare('UPDATE accommodations SET logo_url = ?, logo_original_url = NULL, logo_crop = NULL, logo_square_crop = NULL WHERE id = ? AND organization_id = ?').run(url, id, req.user.organization_id);

  for (const old of [accommodation.logo_url, accommodation.logo_original_url]) {
    if (old && old.startsWith('/uploads/')) removeUnreferencedImage(old);
  }

  res.json({ success: true, url });
}

function removeLogo(req, res) {
  const { id } = req.params;
  const accommodation = db.prepare('SELECT id, parent_id, logo_url, logo_original_url FROM accommodations WHERE id = ? AND organization_id = ?').get(id, req.user.organization_id);
  if (!accommodation) return res.status(404).json({ error: 'Alojamento não encontrado' });
  if (accommodation.parent_id) {
    return res.status(400).json({ error: 'O logótipo só pode ser removido a partir do alojamento principal.' });
  }
  db.prepare('UPDATE accommodations SET logo_url = NULL, logo_original_url = NULL, logo_crop = NULL, logo_square_crop = NULL WHERE id = ? AND organization_id = ?').run(id, req.user.organization_id);
  for (const old of [accommodation.logo_url, accommodation.logo_original_url]) {
    if (old && old.startsWith('/uploads/')) removeUnreferencedImage(old);
  }
  res.json({ success: true });
}

// O logótipo recortado é um ficheiro próprio (`logo_url`), feito a partir do
// original (`logo_original_url`), que fica guardado para se poder refazer. Os
// emails, o portal, os PDFs e a barra lateral continuam a ler `logo_url` e
// recebem a versão sem margens; os emails incorporam-na como anexo (CID),
// o que só funciona com um ficheiro, não com uma variante `?crop=`.
function logoForEdit(req, res) {
  const accommodation = db.prepare('SELECT id, parent_id, logo_url, logo_original_url, logo_crop, logo_square_crop FROM accommodations WHERE id = ? AND organization_id = ?').get(req.params.id, req.user.organization_id);
  if (!accommodation) { res.status(404).json({ error: 'Alojamento não encontrado' }); return null; }
  if (accommodation.parent_id) { res.status(400).json({ error: 'O logótipo só pode ser alterado no alojamento principal.' }); return null; }
  const original = accommodation.logo_original_url || accommodation.logo_url;
  const file = uploadPath(original);
  if (!file || !fs.existsSync(file)) { res.status(400).json({ error: 'Carregue primeiro um logótipo.' }); return null; }
  return { accommodation, original, file };
}

const logoFields = row => ({
  logo_url: row.logo_url || null,
  logo_original_url: row.logo_original_url || null,
  logo_crop: crops.parse(row.logo_crop),
  logo_square_crop: crops.parse(row.logo_square_crop),
});

async function trimLogo(req, res) {
  const found = logoForEdit(req, res);
  if (!found) return;
  const size = await orientedSize(found.file);
  res.json({ success: true, crop: await trimSuggestion(found.file), width: size.width, height: size.height });
}

async function saveLogoCrops(req, res) {
  const found = logoForEdit(req, res);
  if (!found) return;
  const { accommodation, original, file } = found;
  const size = await orientedSize(file);
  const body = req.body || {};
  const crop = body.crop ? crops.validateRect(body.crop, 'logo', size.width, size.height) : null;
  const square = body.square ? crops.validateRect(body.square, 'mark', size.width, size.height) : null;
  // Um recorte que é a imagem toda não precisa de ficheiro próprio.
  const whole = crop && crop.x <= 0.001 && crop.y <= 0.001 && crop.w >= 0.999 && crop.h >= 0.999;
  let logoUrl = original;
  if (crop && !whole) logoUrl = writeUpload('logo', await extractToBuffer(file, crop), 'png');
  db.prepare('UPDATE accommodations SET logo_url = ?, logo_original_url = ?, logo_crop = ?, logo_square_crop = ? WHERE id = ? AND organization_id = ?')
    .run(logoUrl, logoUrl === original ? null : original, crop && !whole ? JSON.stringify(crop) : null,
      square ? JSON.stringify(square) : null, accommodation.id, req.user.organization_id);
  const previous = accommodation.logo_url;
  if (previous && previous !== original && previous !== logoUrl) removeUnreferencedImage(previous);
  res.json({ success: true, ...logoFields(db.prepare('SELECT * FROM accommodations WHERE id = ?').get(accommodation.id)) });
}

// ─── UPLOAD GALLERY IMAGES ────────────────────────────────
async function uploadImages(req, res) {
  const { id } = req.params;
  const { section, image } = req.body;
  if (typeof section !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(section) || ['__proto__', 'constructor', 'prototype', '_sections'].includes(section)) return res.status(400).json({ error: 'Secção inválida.' });
  if (!image || !section) return res.status(400).json({ error: 'Imagem ou secção em falta' });
  const accommodation = db.prepare('SELECT id, parent_id FROM accommodations WHERE id = ? AND organization_id = ?').get(id, req.user.organization_id);
  if (!accommodation) return res.status(404).json({ error: 'Alojamento não encontrado' });
  if (accommodation.parent_id && section === COMMON_AREAS_KEY) {
    return res.status(400).json({ error: 'Áreas comuns só podem ser geridas no alojamento principal.' });
  }

  const parsed = parseImageDataUri(image);
  if (!parsed) return res.status(400).json({ error: 'Formato inválido. Tipos aceites: JPEG, PNG, GIF, WebP, AVIF.' });

  const optimized = await optimizeUpload(parsed.data, parsed.ext);
  const filename = `gallery_${require('crypto').randomUUID()}.${optimized.ext}`;
  const filepath = path.join(UPLOADS_DIR, filename);
  fs.writeFileSync(filepath, optimized.data);

  // Atualizar JSON de imagens
  const row = db.prepare('SELECT images FROM accommodations WHERE id = ? AND organization_id = ?').get(id, req.user.organization_id);
  const imgs = row?.images ? JSON.parse(row.images) : {};
  if (!imgs[section]) imgs[section] = [];
  const url = `/uploads/${filename}`;
  imgs[section].push(url);

  db.prepare('UPDATE accommodations SET images = ? WHERE id = ? AND organization_id = ?').run(JSON.stringify(imgs), id, req.user.organization_id);
  res.json({ success: true, url, images: imgs });
}

// ─── DELETE IMAGE ─────────────────────────────────────────
function deleteImage(req, res) {
  const { id } = req.params;
  const { section, url } = req.body;

  const row = db.prepare('SELECT parent_id, images FROM accommodations WHERE id = ? AND organization_id = ?').get(id, req.user.organization_id);
  if (!row) return res.status(404).json({ error: 'Não encontrado' });
  if (row.parent_id && section === COMMON_AREAS_KEY) {
    return res.status(400).json({ error: 'Áreas comuns herdadas não podem ser removidas aqui.' });
  }

  const imgs = row.images ? JSON.parse(row.images) : {};
  if (!Object.hasOwn(imgs, section) || !Array.isArray(imgs[section]) || !imgs[section].includes(url)) {
    return res.status(404).json({ error: 'Imagem não encontrada neste alojamento.' });
  }
  imgs[section] = imgs[section].filter(u => u !== url);
  db.prepare('UPDATE accommodations SET images = ? WHERE id = ? AND organization_id = ?').run(JSON.stringify(imgs), id, req.user.organization_id);
  removeUnreferencedImage(url);
  res.json({ success: true, images: imgs });
}

// ─── PATCH IMAGES (move between sections / update sections) ──
function patchImages(req, res) {
  const { id } = req.params;
  const { images } = req.body;
  if (!images || typeof images !== 'object') return res.status(400).json({ error: 'Imagens inválidas' });

  const row = db.prepare('SELECT id, parent_id FROM accommodations WHERE id = ? AND organization_id = ?').get(id, req.user.organization_id);
  if (!row) return res.status(404).json({ error: 'Não encontrado' });
  if (row.parent_id && Object.prototype.hasOwnProperty.call(images, COMMON_AREAS_KEY)) {
    return res.status(400).json({ error: 'Áreas comuns herdadas não podem ser editadas aqui.' });
  }

  for (const [key, list] of Object.entries(images)) {
    if (key === '_sections') continue;
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(key) || ['__proto__', 'constructor', 'prototype'].includes(key) ||
        !Array.isArray(list) || list.some(url => !isAllowedImageUrl(url, req.user.organization_id))) {
      return res.status(400).json({ error: 'Galeria contém imagens ou secções inválidas.' });
    }
  }
  db.prepare('UPDATE accommodations SET images = ? WHERE id = ? AND organization_id = ?').run(JSON.stringify(images), id, req.user.organization_id);
  res.json({ success: true, images });
}


module.exports = {
  uploadCover, removeCover, saveCoverCrops, uploadLogo, removeLogo, trimLogo, saveLogoCrops,
  uploadImages, deleteImage, patchImages, rotateGalleryImage, parseImageDataUri, UPLOADS_DIR,
};
