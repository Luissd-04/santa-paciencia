const { db } = require('../config/database');
const path = require('path');
const fs = require('fs');

const UPLOADS_DIR = path.resolve('./data/uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const INHERITED_FIELDS = ['address','postal_code','city','region','country',
  'wifi_name','wifi_password','checkin_time','checkout_time',
  'social_facebook','social_instagram','social_website'];
const COMMON_AREAS_KEY = 'areas_comuns';
const COMMON_AREAS_LABEL = 'Áreas Comuns';

function normalizeSections(images) {
  const safe = images && typeof images === 'object' ? { ...images } : {};
  const sections = Array.isArray(safe._sections) ? [...safe._sections] : [];
  delete safe._sections;
  return { safeImages: safe, sections };
}

function ensureCommonAreasSection(sections) {
  const base = Array.isArray(sections) ? [...sections] : [];
  const exists = base.some(sec => sec?.key === COMMON_AREAS_KEY);
  if (!exists) base.unshift({ key: COMMON_AREAS_KEY, label: COMMON_AREAS_LABEL });
  return base;
}

function resolveAccommodation(raw, parent = null) {
  const data = parseJson(raw);
  const resolved = {
    ...data,
    _parent: parent || null,
    _parent_name: parent?.name || null,
    own_amenities: Array.isArray(data.amenities) ? [...data.amenities] : [],
    inherited_amenities: [],
    effective_amenities: Array.isArray(data.amenities) ? [...data.amenities] : [],
    common_area_images: [],
    own_images: {},
    images: {},
  };

  const { safeImages, sections } = normalizeSections(data.images);
  resolved.own_images = { ...safeImages };
  resolved.images = { ...safeImages };
  resolved.image_sections = data.parent_id
    ? sections.filter(sec => sec?.key !== COMMON_AREAS_KEY)
    : ensureCommonAreasSection(sections);

  if (!parent) return resolved;

  INHERITED_FIELDS.forEach(field => {
    resolved[field] = parent[field] ?? '';
  });

  resolved.inherited_amenities = Array.isArray(parent.effective_amenities)
    ? [...parent.effective_amenities]
    : Array.isArray(parent.amenities)
      ? [...parent.amenities]
      : [];
  resolved.effective_amenities = Array.from(new Set([
    ...resolved.inherited_amenities,
    ...resolved.own_amenities
  ]));

  const parentImages = parent.own_images && typeof parent.own_images === 'object'
    ? parent.own_images
    : parent.images && typeof parent.images === 'object'
      ? parent.images
      : {};
  resolved.common_area_images = Array.isArray(parentImages[COMMON_AREAS_KEY]) ? [...parentImages[COMMON_AREAS_KEY]] : [];
  return resolved;
}

function getResolvedAccommodationsForOrg(orgId) {
  const rows = db.prepare(`
    SELECT * FROM accommodations
    WHERE organization_id = ?
    ORDER BY name
  `).all(orgId);

  const base = rows.map(parseJson);
  const byId = new Map(base.map(row => [row.id, row]));
  const cache = new Map();

  function resolveById(id) {
    if (!id || !byId.has(id)) return null;
    if (cache.has(id)) return cache.get(id);
    const current = byId.get(id);
    const parent = current.parent_id ? resolveById(current.parent_id) : null;
    const resolved = resolveAccommodation(current, parent);
    cache.set(id, resolved);
    return resolved;
  }

  return base.map(row => resolveById(row.id));
}

// ─── GET ALL ───────────────────────────────────────────────
function getAll(req, res) {
  const resolved = getResolvedAccommodationsForOrg(req.user.organization_id);
  res.json({ success: true, data: resolved });
}

// ─── GET BY ID ─────────────────────────────────────────────
function getById(req, res) {
  const resolved = getResolvedAccommodationsForOrg(req.user.organization_id).find(a => a.id === req.params.id);
  if (!resolved) return res.status(404).json({ error: 'Alojamento não encontrado' });
  res.json({ success: true, data: resolved });
}

// ─── CREATE ────────────────────────────────────────────────
function create(req, res) {
  const { name, type, price_per_night, max_guests, license_number, parent_id } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome obrigatório' });

  if (parent_id) {
    const parent = db.prepare(`
      SELECT id FROM accommodations
      WHERE id = ? AND organization_id = ? AND type = 'alojamento'
    `).get(parent_id, req.user.organization_id);
    if (!parent) return res.status(400).json({ error: 'Alojamento principal inválido' });
  }

  const id = name.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') +
    '-' + Date.now().toString().slice(-4);

  db.prepare(`INSERT INTO accommodations (id, organization_id, name, type, price_per_night, max_guests, license_number, parent_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, req.user.organization_id, name, type || 'suite', price_per_night || 100, max_guests || 2,
      license_number || (process.env.LICENSE_NUMBER || '12345/AL'),
      parent_id || null);

  const created = getResolvedAccommodationsForOrg(req.user.organization_id).find(a => a.id === id);
  res.status(201).json({ success: true, data: created });
}

// ─── UPDATE ────────────────────────────────────────────────
function update(req, res) {
  const { id } = req.params;
  const existing = db.prepare(`
    SELECT * FROM accommodations WHERE id = ? AND organization_id = ?
  `).get(id, req.user.organization_id);
  if (!existing) return res.status(404).json({ error: 'Alojamento não encontrado' });

  const {
    name, type, price_per_night, max_guests, license_number,
    description, description_en, description_fr, description_es,
    description_de, description_it, description_nl,
    address, postal_code, city, region, country,
    area, num_rooms, num_bathrooms, amenities, own_amenities, google_calendar_id,
    wifi_name, wifi_password, checkin_time, checkout_time, color,
    social_facebook, social_instagram, social_website, parent_id
  } = req.body;

  // Resolve effective parent_id (explicit set, keep existing, or null to unlink)
  const effectiveParentId = parent_id !== undefined ? (parent_id || null) : existing.parent_id;
  if (effectiveParentId) {
    const parent = db.prepare(`
      SELECT id FROM accommodations
      WHERE id = ? AND organization_id = ? AND type = 'alojamento'
    `).get(effectiveParentId, req.user.organization_id);
    if (!parent) return res.status(400).json({ error: 'Alojamento principal inválido' });
  }

  // If this accommodation has a parent, inherited fields come from the parent — don't overwrite them
  const hasParent = !!effectiveParentId;
  const inh = (val, existing_val) => hasParent ? existing_val : (val !== undefined ? val : existing_val);

  const incomingOwnAmenities = Array.isArray(own_amenities)
    ? own_amenities
    : Array.isArray(amenities)
      ? amenities
      : null;

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
    address = ?, postal_code = ?, city = ?, region = ?, country = ?,
    area = COALESCE(?, area),
    num_rooms = COALESCE(?, num_rooms),
    num_bathrooms = COALESCE(?, num_bathrooms),
    amenities = COALESCE(?, amenities),
    wifi_name = ?, wifi_password = ?,
    checkin_time = ?, checkout_time = ?,
    color = COALESCE(?, color),
    social_facebook = ?, social_instagram = ?, social_website = ?,
    google_calendar_id = ?,
    parent_id = ?
    WHERE id = ? AND organization_id = ?`)
    .run(
      name, type, price_per_night, max_guests, license_number,
      description, description_en || null, description_fr || null,
      description_es || null, description_de || null, description_it || null, description_nl || null,
      inh(address, existing.address),
      inh(postal_code, existing.postal_code),
      inh(city, existing.city),
      inh(region, existing.region),
      inh(country, existing.country),
      area, num_rooms, num_bathrooms,
      incomingOwnAmenities ? JSON.stringify(incomingOwnAmenities) : null,
      inh(wifi_name !== undefined ? (wifi_name || null) : null, existing.wifi_name),
      inh(wifi_password !== undefined ? (wifi_password || null) : null, existing.wifi_password),
      inh(checkin_time !== undefined ? (checkin_time || null) : null, existing.checkin_time),
      inh(checkout_time !== undefined ? (checkout_time || null) : null, existing.checkout_time),
      color !== undefined ? (color || null) : null,
      inh(social_facebook !== undefined ? (social_facebook || null) : null, existing.social_facebook),
      inh(social_instagram !== undefined ? (social_instagram || null) : null, existing.social_instagram),
      inh(social_website !== undefined ? (social_website || null) : null, existing.social_website),
      google_calendar_id !== undefined ? (google_calendar_id || null) : existing.google_calendar_id,
      effectiveParentId,
      id,
      req.user.organization_id
    );

  const resolved = getResolvedAccommodationsForOrg(req.user.organization_id).find(a => a.id === id);
  res.json({ success: true, data: resolved });
}

// ─── UPLOAD COVER IMAGE ────────────────────────────────────
function uploadCover(req, res) {
  const { id } = req.params;
  if (!req.body.image && !req.body.url) return res.status(400).json({ error: 'Imagem em falta' });
  const accommodation = db.prepare('SELECT id FROM accommodations WHERE id = ? AND organization_id = ?').get(id, req.user.organization_id);
  if (!accommodation) return res.status(404).json({ error: 'Alojamento não encontrado' });

  if (req.body.url) {
    const url = String(req.body.url || '').trim();
    db.prepare('UPDATE accommodations SET cover_image = ? WHERE id = ? AND organization_id = ?').run(url || null, id, req.user.organization_id);
    return res.json({ success: true, url });
  }

  // Guardar base64 como ficheiro
  const matches = req.body.image.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!matches) return res.status(400).json({ error: 'Formato de imagem inválido' });

  const ext = matches[1];
  const data = Buffer.from(matches[2], 'base64');
  const filename = `cover_${id}.${ext}`;
  const filepath = path.join(UPLOADS_DIR, filename);
  fs.writeFileSync(filepath, data);

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
      const filename = path.basename(coverUrl);
      const filepath = path.join(UPLOADS_DIR, filename);
      if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
    }
  }

  res.json({ success: true });
}

// ─── UPLOAD GALLERY IMAGES ────────────────────────────────
function uploadImages(req, res) {
  const { id } = req.params;
  const { section, image } = req.body;
  if (!image || !section) return res.status(400).json({ error: 'Imagem ou secção em falta' });
  const accommodation = db.prepare('SELECT id, parent_id FROM accommodations WHERE id = ? AND organization_id = ?').get(id, req.user.organization_id);
  if (!accommodation) return res.status(404).json({ error: 'Alojamento não encontrado' });
  if (accommodation.parent_id && section === COMMON_AREAS_KEY) {
    return res.status(400).json({ error: 'Áreas comuns só podem ser geridas no alojamento principal.' });
  }

  const matches = image.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!matches) return res.status(400).json({ error: 'Formato inválido' });

  const ext = matches[1];
  const data = Buffer.from(matches[2], 'base64');
  const filename = `gallery_${id}_${section}_${Date.now()}.${ext}`;
  const filepath = path.join(UPLOADS_DIR, filename);
  fs.writeFileSync(filepath, data);

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
  if (imgs[section]) {
    imgs[section] = imgs[section].filter(u => u !== url);
    // Apagar ficheiro
    const filename = path.basename(url);
    const filepath = path.join(UPLOADS_DIR, filename);
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
  }
  db.prepare('UPDATE accommodations SET images = ? WHERE id = ? AND organization_id = ?').run(JSON.stringify(imgs), id, req.user.organization_id);
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

  db.prepare('UPDATE accommodations SET images = ? WHERE id = ? AND organization_id = ?').run(JSON.stringify(images), id, req.user.organization_id);
  res.json({ success: true, images });
}

// ─── SETTINGS (serviços e taxas) ──────────────────────────
function getSettings(req, res) {
  const row = db.prepare(`
    SELECT value FROM organization_settings
    WHERE organization_id = ? AND key = 'services'
  `).get(req.user.organization_id);
  const services = row ? JSON.parse(row.value) : [];
  res.json({ success: true, data: services });
}

function saveSettings(req, res) {
  const { services } = req.body;
  if (!Array.isArray(services)) return res.status(400).json({ error: 'Formato inválido' });

  db.prepare(`
    INSERT OR REPLACE INTO organization_settings (organization_id, key, value, updated_at)
    VALUES (?, 'services', ?, datetime('now'))
  `).run(req.user.organization_id, JSON.stringify(services));
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
  if (!v) return def;
  if (typeof v === 'object') return v; // already parsed — don't double-parse
  try { return JSON.parse(v); } catch { return def; }
}

// ─── DELETE ───────────────────────────────────────────────
function remove(req, res) {
  const acc = db.prepare('SELECT * FROM accommodations WHERE id = ? AND organization_id = ?').get(req.params.id, req.user.organization_id);
  if (!acc) return res.status(404).json({ success: false, error: 'Alojamento não encontrado.' });

  const active = db.prepare(
    "SELECT COUNT(*) as c FROM reservations WHERE accommodation_id = ? AND organization_id = ? AND status != 'cancelada'"
  ).get(req.params.id, req.user.organization_id);
  if (active.c > 0) {
    return res.status(409).json({
      success: false,
      error: `Não é possível apagar: o alojamento tem ${active.c} reserva(s) ativa(s).`
    });
  }

  db.prepare('DELETE FROM reservations WHERE accommodation_id = ? AND organization_id = ?').run(req.params.id, req.user.organization_id);
  db.prepare('DELETE FROM accommodations WHERE id = ? AND organization_id = ?').run(req.params.id, req.user.organization_id);
  res.json({ success: true });
}

module.exports = { getAll, getById, create, update, remove, uploadCover, removeCover, uploadImages, deleteImage, patchImages, getSettings, saveSettings };
