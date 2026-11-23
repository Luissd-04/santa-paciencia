// Etiquetas Open Graph da página pública de reservas (/reservar/:slug): o que
// o WhatsApp, o Facebook e afins mostram ao colar o link. A imagem é o recorte
// «Partilha» (1.91:1) da capa, em JPEG (services/imageCrops.js).
const { db } = require('../config/database');
const { publicOrigin } = require('./publicOrigin');
const { coverVariant, isLocalUpload } = require('./imageCrops');

const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function bookingTags(req, slug) {
  if (typeof slug !== 'string' || slug.length > 200) return '';
  let row;
  try {
    row = db.prepare(`SELECT id, name, description, city, cover_image, cover_focal, cover_crops FROM accommodations
      WHERE public_slug = ? AND type = 'alojamento'`).get(slug);
  } catch { return ''; }
  if (!row) return '';
  let origin;
  try { origin = publicOrigin(req); } catch { return ''; }
  const description = String(row.description || row.city || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  const tags = [
    ['og:type', 'website'],
    ['og:title', row.name],
    description ? ['og:description', description] : null,
    ['og:url', `${origin}/reservar/${encodeURIComponent(slug)}`],
  ].filter(Boolean);
  if (row.cover_image) {
    const variant = coverVariant(row, 'share');
    const image = isLocalUpload(row.cover_image) ? `${origin}${variant}&w=1024` : variant;
    if (/^https:\/\//.test(image) || image.startsWith(origin)) tags.push(['og:image', image]);
  }
  return tags.map(([property, content]) => `  <meta property="${property}" content="${esc(content)}">`).join('\n');
}

module.exports = { bookingTags };
