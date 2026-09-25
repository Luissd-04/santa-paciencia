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

module.exports = { UPLOADS_DIR, uploadPath, accommodationUrls, isAllowedImageUrl, removeUnreferencedImage };
