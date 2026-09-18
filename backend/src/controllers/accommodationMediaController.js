const { db } = require('../config/database');
const path = require('path');
const fs = require('fs');
const { isAllowedImageUrl, removeUnreferencedImage } = require('../services/mediaStorage');
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

// Magic-byte signatures por tipo declarado.
// Defesa em profundidade contra polyglots (ex: SVG com extensão .png).
function detectImageMagicType(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'png';
  // JPEG: FF D8 FF
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'jpeg';
  // GIF: GIF87a / GIF89a
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'gif';
  // WEBP: RIFF....WEBP
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'webp';
  // AVIF: bytes 4-7 = "ftyp" + brand at 8-11 indica avif/avis
  if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) {
    const brand = buf.slice(8, 12).toString('ascii');
    if (brand === 'avif' || brand === 'avis' || brand === 'mif1') return 'avif';
  }
  return null;
}

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

function uploadCover(req, res) {
  const { id } = req.params;
  if (!req.body.image && !req.body.url) return res.status(400).json({ error: 'Imagem em falta' });
  const accommodation = db.prepare('SELECT id FROM accommodations WHERE id = ? AND organization_id = ?').get(id, req.user.organization_id);
  if (!accommodation) return res.status(404).json({ error: 'Alojamento não encontrado' });

  if (req.body.url) {
    const url = String(req.body.url || '').trim();
    if (!isAllowedImageUrl(url, req.user.organization_id)) return res.status(400).json({ error: 'Imagem não pertence à organização ou URL inválido.' });
    db.prepare('UPDATE accommodations SET cover_image = ? WHERE id = ? AND organization_id = ?').run(url || null, id, req.user.organization_id);
    return res.json({ success: true, url });
  }

  // Guardar base64 como ficheiro
  const parsed = parseImageDataUri(req.body.image);
  if (!parsed) return res.status(400).json({ error: 'Formato de imagem inválido. Tipos aceites: JPEG, PNG, GIF, WebP, AVIF.' });

  const filename = `cover_${require('crypto').randomUUID()}.${parsed.ext}`;
  const filepath = path.join(UPLOADS_DIR, filename);
  fs.writeFileSync(filepath, parsed.data);

  const url = `/uploads/${filename}`;
  db.prepare('UPDATE accommodations SET cover_image = ? WHERE id = ? AND organization_id = ?').run(url, id, req.user.organization_id);
  res.json({ success: true, url });
}

function removeCover(req, res) {
  const { id } = req.params;
  const row = db.prepare('SELECT cover_image, images FROM accommodations WHERE id = ? AND organization_id = ?').get(id, req.user.organization_id);
  if (!row) return res.status(404).json({ error: 'Alojamento não encontrado' });

  const coverUrl = row.cover_image;
  db.prepare('UPDATE accommodations SET cover_image = NULL WHERE id = ? AND organization_id = ?').run(id, req.user.organization_id);

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
function uploadLogo(req, res) {
  const { id } = req.params;
  if (!req.body.image) return res.status(400).json({ error: 'Imagem em falta' });
  const accommodation = db.prepare('SELECT id, parent_id, logo_url FROM accommodations WHERE id = ? AND organization_id = ?').get(id, req.user.organization_id);
  if (!accommodation) return res.status(404).json({ error: 'Alojamento não encontrado' });
  if (accommodation.parent_id) {
    return res.status(400).json({ error: 'O logótipo só pode ser definido no alojamento principal — as suites herdam-no automaticamente.' });
  }

  const parsed = parseImageDataUri(req.body.image);
  if (!parsed) return res.status(400).json({ error: 'Formato de imagem inválido. Tipos aceites: JPEG, PNG, GIF, WebP, AVIF.' });

  const filename = `logo_${require('crypto').randomUUID()}.${parsed.ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), parsed.data);
  const url = `/uploads/${filename}`;
  db.prepare('UPDATE accommodations SET logo_url = ? WHERE id = ? AND organization_id = ?').run(url, id, req.user.organization_id);

  const old = accommodation.logo_url;
  if (old && old.startsWith('/uploads/')) {
    removeUnreferencedImage(old);
  }

  res.json({ success: true, url });
}

function removeLogo(req, res) {
  const { id } = req.params;
  const accommodation = db.prepare('SELECT id, parent_id, logo_url FROM accommodations WHERE id = ? AND organization_id = ?').get(id, req.user.organization_id);
  if (!accommodation) return res.status(404).json({ error: 'Alojamento não encontrado' });
  if (accommodation.parent_id) {
    return res.status(400).json({ error: 'O logótipo só pode ser removido a partir do alojamento principal.' });
  }
  db.prepare('UPDATE accommodations SET logo_url = NULL WHERE id = ? AND organization_id = ?').run(id, req.user.organization_id);
  if (accommodation.logo_url && accommodation.logo_url.startsWith('/uploads/')) {
    removeUnreferencedImage(accommodation.logo_url);
  }
  res.json({ success: true });
}

// ─── UPLOAD GALLERY IMAGES ────────────────────────────────
function uploadImages(req, res) {
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

  const filename = `gallery_${require('crypto').randomUUID()}.${parsed.ext}`;
  const filepath = path.join(UPLOADS_DIR, filename);
  fs.writeFileSync(filepath, parsed.data);

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


module.exports = { uploadCover, removeCover, uploadLogo, removeLogo, uploadImages, deleteImage, patchImages, parseImageDataUri, UPLOADS_DIR };
