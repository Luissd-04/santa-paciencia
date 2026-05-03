const { db } = require('../config/database');
const path = require('path');
const fs = require('fs');

const UPLOADS_DIR = path.resolve('./data/uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ─── GET ALL ───────────────────────────────────────────────
function getAll(req, res) {
  const rows = db.prepare('SELECT * FROM accommodations ORDER BY name').all();
  res.json({ success: true, data: rows.map(parseJson) });
}

// ─── GET BY ID ─────────────────────────────────────────────
function getById(req, res) {
  const row = db.prepare('SELECT * FROM accommodations WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Alojamento não encontrado' });
  res.json({ success: true, data: parseJson(row) });
}

// ─── CREATE ────────────────────────────────────────────────
function create(req, res) {
  const { name, type, price_per_night, max_guests, license_number } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome obrigatório' });

  const id = name.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') +
    '-' + Date.now().toString().slice(-4);

  db.prepare(`INSERT INTO accommodations (id, name, type, price_per_night, max_guests, license_number)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .run(id, name, type || 'suite', price_per_night || 100, max_guests || 2,
      license_number || (process.env.LICENSE_NUMBER || '12345/AL'));

  const created = db.prepare('SELECT * FROM accommodations WHERE id = ?').get(id);
  res.status(201).json({ success: true, data: parseJson(created) });
}

// ─── UPDATE ────────────────────────────────────────────────
function update(req, res) {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM accommodations WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Alojamento não encontrado' });

  const {
    name, type, price_per_night, max_guests, license_number,
    description, description_en, description_fr, description_es,
    description_de, description_it, description_nl,
    address, postal_code, city, region, country,
    area, num_rooms, num_bathrooms, amenities, google_calendar_id,
    wifi_name, wifi_password, checkin_time, checkout_time, color,
    social_facebook, social_instagram, social_website
  } = req.body;

  db.prepare(`UPDATE accommodations SET
    name = COALESCE(?, name),
    type = COALESCE(?, type),
    price_per_night = COALESCE(?, price_per_night),
    max_guests = COALESCE(?, max_guests),
    license_number = COALESCE(?, license_number),
    description = COALESCE(?, description),
    description_en = COALESCE(?, description_en),
    description_fr = COALESCE(?, description_fr),
    description_es = COALESCE(?, description_es),
    description_de = COALESCE(?, description_de),
    description_it = COALESCE(?, description_it),
    description_nl = COALESCE(?, description_nl),
    address = COALESCE(?, address),
    postal_code = COALESCE(?, postal_code),
    city = COALESCE(?, city),
    region = COALESCE(?, region),
    country = COALESCE(?, country),
    area = COALESCE(?, area),
    num_rooms = COALESCE(?, num_rooms),
    num_bathrooms = COALESCE(?, num_bathrooms),
    amenities = COALESCE(?, amenities),
    wifi_name = COALESCE(?, wifi_name),
    wifi_password = COALESCE(?, wifi_password),
    checkin_time = COALESCE(?, checkin_time),
    checkout_time = COALESCE(?, checkout_time),
    color = COALESCE(?, color),
    social_facebook = ?,
    social_instagram = ?,
    social_website = ?,
    google_calendar_id = ?
    WHERE id = ?`)
    .run(
      name, type, price_per_night, max_guests, license_number,
      description, description_en || null, description_fr || null,
      description_es || null, description_de || null, description_it || null, description_nl || null,
      address, postal_code, city, region, country,
      area, num_rooms, num_bathrooms,
      amenities ? JSON.stringify(amenities) : null,
      wifi_name !== undefined ? (wifi_name || null) : null,
      wifi_password !== undefined ? (wifi_password || null) : null,
      checkin_time !== undefined ? (checkin_time || null) : null,
      checkout_time !== undefined ? (checkout_time || null) : null,
      color !== undefined ? (color || null) : null,
      social_facebook !== undefined ? (social_facebook || null) : existing.social_facebook,
      social_instagram !== undefined ? (social_instagram || null) : existing.social_instagram,
      social_website !== undefined ? (social_website || null) : existing.social_website,
      google_calendar_id !== undefined ? (google_calendar_id || null) : existing.google_calendar_id,
      id
    );

  res.json({ success: true, data: parseJson(db.prepare('SELECT * FROM accommodations WHERE id = ?').get(id)) });
}

// ─── UPLOAD COVER IMAGE ────────────────────────────────────
function uploadCover(req, res) {
  const { id } = req.params;
  if (!req.body.image) return res.status(400).json({ error: 'Imagem em falta' });

  // Guardar base64 como ficheiro
  const matches = req.body.image.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!matches) return res.status(400).json({ error: 'Formato de imagem inválido' });

  const ext = matches[1];
  const data = Buffer.from(matches[2], 'base64');
  const filename = `cover_${id}.${ext}`;
  const filepath = path.join(UPLOADS_DIR, filename);
  fs.writeFileSync(filepath, data);

  const url = `/uploads/${filename}`;
  db.prepare('UPDATE accommodations SET cover_image = ? WHERE id = ?').run(url, id);
  res.json({ success: true, url });
}

// ─── UPLOAD GALLERY IMAGES ────────────────────────────────
function uploadImages(req, res) {
  const { id } = req.params;
  const { section, image } = req.body;
  if (!image || !section) return res.status(400).json({ error: 'Imagem ou secção em falta' });

  const matches = image.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!matches) return res.status(400).json({ error: 'Formato inválido' });

  const ext = matches[1];
  const data = Buffer.from(matches[2], 'base64');
  const filename = `gallery_${id}_${section}_${Date.now()}.${ext}`;
  const filepath = path.join(UPLOADS_DIR, filename);
  fs.writeFileSync(filepath, data);

  // Atualizar JSON de imagens
  const row = db.prepare('SELECT images FROM accommodations WHERE id = ?').get(id);
  const imgs = row?.images ? JSON.parse(row.images) : {};
  if (!imgs[section]) imgs[section] = [];
  const url = `/uploads/${filename}`;
  imgs[section].push(url);

  db.prepare('UPDATE accommodations SET images = ? WHERE id = ?').run(JSON.stringify(imgs), id);
  res.json({ success: true, url, images: imgs });
}

// ─── DELETE IMAGE ─────────────────────────────────────────
function deleteImage(req, res) {
  const { id } = req.params;
  const { section, url } = req.body;

  const row = db.prepare('SELECT images FROM accommodations WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Não encontrado' });

  const imgs = row.images ? JSON.parse(row.images) : {};
  if (imgs[section]) {
    imgs[section] = imgs[section].filter(u => u !== url);
    // Apagar ficheiro
    const filename = path.basename(url);
    const filepath = path.join(UPLOADS_DIR, filename);
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
  }
  db.prepare('UPDATE accommodations SET images = ? WHERE id = ?').run(JSON.stringify(imgs), id);
  res.json({ success: true, images: imgs });
}

// ─── PATCH IMAGES (move between sections / update sections) ──
function patchImages(req, res) {
  const { id } = req.params;
  const { images } = req.body;
  if (!images || typeof images !== 'object') return res.status(400).json({ error: 'Imagens inválidas' });

  const row = db.prepare('SELECT id FROM accommodations WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Não encontrado' });

  db.prepare('UPDATE accommodations SET images = ? WHERE id = ?').run(JSON.stringify(images), id);
  res.json({ success: true, images });
}

// ─── SETTINGS (serviços e taxas) ──────────────────────────
function getSettings(req, res) {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'services'").get();
  const services = row ? JSON.parse(row.value) : [];
  res.json({ success: true, data: services });
}

function saveSettings(req, res) {
  const { services } = req.body;
  if (!Array.isArray(services)) return res.status(400).json({ error: 'Formato inválido' });

  db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('services', ?, datetime('now'))")
    .run(JSON.stringify(services));
  res.json({ success: true, data: services });
}

// ─── HELPER ───────────────────────────────────────────────
function parseJson(a) {
  return {
    ...a,
    amenities: safeJson(a.amenities, []),
    images: safeJson(a.images, {}),
  };
}
function safeJson(v, def) {
  try { return v ? JSON.parse(v) : def; } catch { return def; }
}

// ─── DELETE ───────────────────────────────────────────────
function remove(req, res) {
  const acc = db.prepare('SELECT * FROM accommodations WHERE id = ?').get(req.params.id);
  if (!acc) return res.status(404).json({ success: false, error: 'Alojamento não encontrado.' });

  const active = db.prepare(
    "SELECT COUNT(*) as c FROM reservations WHERE accommodation_id = ? AND status != 'cancelada'"
  ).get(req.params.id);
  if (active.c > 0) {
    return res.status(409).json({
      success: false,
      error: `Não é possível apagar: o alojamento tem ${active.c} reserva(s) ativa(s).`
    });
  }

  db.prepare('DELETE FROM reservations WHERE accommodation_id = ?').run(req.params.id);
  db.prepare('DELETE FROM accommodations WHERE id = ?').run(req.params.id);
  res.json({ success: true });
}

module.exports = { getAll, getById, create, update, remove, uploadCover, uploadImages, deleteImage, patchImages, getSettings, saveSettings };