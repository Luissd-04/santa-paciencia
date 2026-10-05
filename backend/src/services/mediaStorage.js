const fs = require('fs');
const path = require('path');
const { db } = require('../config/database');
const UPLOADS_DIR = path.resolve('./data/uploads');

function uploadPath(url) {
  if (typeof url !== 'string' || !/^\/uploads\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+$/.test(url)) return null;
  const relative = url.slice('/uploads/'.length);
  if (relative.split('/').some(part => part === '.' || part === '..')) return null;
  const resolved = path.resolve(UPLOADS_DIR, relative);
  return resolved.startsWith(UPLOADS_DIR + path.sep) ? resolved : null;
}

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

function accommodationUrls(rows) {
  const urls = new Set();
  for (const row of rows) {
    for (const value of [row.cover_image, row.logo_url]) if (uploadPath(value)) urls.add(value);
    let images;
    try { images = typeof row.images === 'string' ? JSON.parse(row.images) : row.images; } catch { images = {}; }
    for (const [key, list] of Object.entries(images || {})) {
      if (key !== '_sections' && Array.isArray(list)) list.forEach(url => { if (uploadPath(url)) urls.add(url); });
    }
  }
  return urls;
}

function isAllowedImageUrl(url, organizationId) {
  if (typeof url !== 'string' || url.length > 2048) return false;
  if (uploadPath(url)) {
    return accommodationUrls(db.prepare('SELECT cover_image, logo_url, images FROM accommodations WHERE organization_id = ?').all(organizationId)).has(url);
  }
  try { return new URL(url).protocol === 'https:'; } catch { return false; }
}

// Nunca apagar um ficheiro ainda referenciado, mesmo por outro cliente.
function removeUnreferencedImage(url) {
  const file = uploadPath(url);
  if (!file) return;
  if (accommodationUrls(db.prepare('SELECT cover_image, logo_url, images FROM accommodations').all()).has(url)) return;
  if (db.prepare('SELECT 1 FROM expenses WHERE receipt_image = ?').get(url)) return;
  if (fs.existsSync(file)) fs.unlinkSync(file);
  // Carregado aqui para evitar a dependência circular com imageOptimizer.
  require('./imageOptimizer').removeThumbnails(path.basename(file));
}

module.exports = { UPLOADS_DIR, uploadPath, accommodationUrls, isAllowedImageUrl, removeUnreferencedImage, detectImageMagicType };
