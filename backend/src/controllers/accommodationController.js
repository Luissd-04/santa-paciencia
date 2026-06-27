const { db } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

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

const INHERITED_FIELDS = ['address','postal_code','city','region','country',
  'wifi_name','wifi_password','checkin_time','checkout_time',
  'social_facebook','social_instagram','social_website'];
const COMMON_AREAS_KEY = 'areas_comuns';
const COMMON_AREAS_LABEL = 'Áreas Comuns';

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || `alojamento-${Date.now()}`;
}

function generatePublicSlug(name, idToExclude = '') {
  const base = slugify(name);
  let slug = base;
  let idx = 1;
  while (db.prepare('SELECT 1 FROM accommodations WHERE public_slug = ? AND id != ?').get(slug, idToExclude)) {
    idx += 1;
    slug = `${base}-${idx}`;
  }
  return slug;
}

function ensurePublicSlug(accommodation) {
  if (!accommodation || accommodation.type !== 'alojamento') return accommodation?.public_slug || null;
  if (accommodation.public_slug) return accommodation.public_slug;
  const slug = generatePublicSlug(accommodation.name || accommodation.id, accommodation.id);
  db.prepare('UPDATE accommodations SET public_slug = ? WHERE id = ? AND organization_id = ?')
    .run(slug, accommodation.id, accommodation.organization_id);
  accommodation.public_slug = slug;
  return slug;
}

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

  return base.map(row => {
    if (row.type === 'alojamento') ensurePublicSlug(row);
    return resolveById(row.id);
  });
}

function getResolvedAccommodationById(orgId, id) {
  const rows = db.prepare(`
    SELECT a.*, p.id as _pid FROM accommodations a
    LEFT JOIN accommodations p ON p.id = a.parent_id AND p.organization_id = a.organization_id
    WHERE a.organization_id = ? AND (a.id = ? OR a.id = (
      SELECT parent_id FROM accommodations WHERE id = ? AND organization_id = ?
    ))
  `).all(orgId, id, id, orgId);
  if (!rows.length) return null;
  const base = rows.map(parseJson);
  const byId = new Map(base.map(r => [r.id, r]));
  const target = byId.get(id);
  if (!target) return null;
  if (target.type === 'alojamento') ensurePublicSlug(target);
  const parent = target.parent_id ? byId.get(target.parent_id) : null;
  return resolveAccommodation(target, parent || null);
}

// ─── GET ALL ───────────────────────────────────────────────
function getAll(req, res) {
  const resolved = getResolvedAccommodationsForOrg(req.user.organization_id);
  res.json({ success: true, data: resolved });
}

// ─── GET BY ID ─────────────────────────────────────────────
function getById(req, res) {
  const resolved = getResolvedAccommodationById(req.user.organization_id, req.params.id);
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

  const guestsMax = Number(max_guests) || 2;
  const baseGuestsIncluded = Math.min(guestsMax, 2);

  const publicSlug = (type || 'suite') === 'alojamento' ? generatePublicSlug(name) : null;

  db.prepare(`INSERT INTO accommodations (
      id, organization_id, name, type, price_per_night, max_guests, license_number, parent_id,
      base_guests_included, extra_bed_enabled, extra_bed_type, extra_bed_capacity, extra_bed_price, extra_bed_charge_type,
      extra_occupancy_options, baby_age_limit, baby_price, child_age_limit, child_price, public_slug
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'sofa_cama', 0, 0, 'per_guest_night', '[]', 2, 0, 12, 0, ?)`)
    .run(id, req.user.organization_id, name, type || 'suite', price_per_night || 100, guestsMax,
      license_number || (process.env.LICENSE_NUMBER || '12345/AL'),
      parent_id || null, baseGuestsIncluded, publicSlug);

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
    social_facebook, social_instagram, social_website, parent_id,
    base_guests_included, extra_bed_enabled, extra_bed_type,
    extra_bed_capacity, extra_bed_price, extra_bed_charge_type,
    extra_occupancy_options, baby_age_limit, baby_price, child_age_limit, child_price,
    min_nights, rgpd_text
  } = req.body;
  const airbnbIcalUrl = normalizeIcalUrl(req.body.airbnb_ical_url);
  const bookingIcalUrl = normalizeIcalUrl(req.body.booking_ical_url);

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

  const nextMaxGuests = max_guests !== undefined ? (Number(max_guests) || existing.max_guests) : existing.max_guests;
  const nextBaseGuests = Math.max(1, Math.min(
    Number(base_guests_included) || existing.base_guests_included || Math.min(nextMaxGuests, 2),
    nextMaxGuests
  ));
  const nextExtraBedEnabled = extra_bed_enabled !== undefined ? (extra_bed_enabled ? 1 : 0) : (existing.extra_bed_enabled || 0);
  const nextExtraBedCapacity = Math.max(0, Math.min(
    extra_bed_capacity !== undefined ? (Number(extra_bed_capacity) || 0) : (existing.extra_bed_capacity || 0),
    Math.max(0, nextMaxGuests - nextBaseGuests)
  ));
  const nextExtraOccupancyOptions = extra_occupancy_options !== undefined
    ? normalizeExtraOccupancyOptions(extra_occupancy_options, {
        extra_bed_enabled: nextExtraBedEnabled,
        extra_bed_type,
        extra_bed_capacity: nextExtraBedCapacity,
        extra_bed_price,
        extra_bed_charge_type
      })
    : normalizeExtraOccupancyOptions(existing.extra_occupancy_options, existing);
  const nextBabyAgeLimit = Math.max(0, Number(baby_age_limit ?? existing.baby_age_limit ?? 2) || 0);
  const nextChildAgeLimit = Math.max(nextBabyAgeLimit, Number(child_age_limit ?? existing.child_age_limit ?? 12) || nextBabyAgeLimit);

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
    parent_id = ?,
    base_guests_included = ?,
    extra_bed_enabled = ?,
    extra_bed_type = ?,
    extra_bed_capacity = ?,
    extra_bed_price = ?,
    extra_bed_charge_type = ?,
    extra_occupancy_options = ?,
    baby_age_limit = ?,
    baby_price = ?,
    child_age_limit = ?,
    child_price = ?,
    min_nights = COALESCE(?, min_nights),
    rgpd_text = COALESCE(?, rgpd_text),
    airbnb_ical_url = ?,
    booking_ical_url = ?
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
      nextBaseGuests,
      nextExtraBedEnabled,
      extra_bed_type || existing.extra_bed_type || 'sofa_cama',
      nextExtraBedCapacity,
      extra_bed_price !== undefined ? (Number(extra_bed_price) || 0) : (existing.extra_bed_price || 0),
      extra_bed_charge_type || existing.extra_bed_charge_type || 'per_guest_night',
      JSON.stringify(nextExtraOccupancyOptions),
      nextBabyAgeLimit,
      Number(baby_price ?? existing.baby_price ?? 0) || 0,
      nextChildAgeLimit,
      Number(child_price ?? existing.child_price ?? 0) || 0,
      min_nights !== undefined ? (Number(min_nights) || 1) : null,
      rgpd_text !== undefined ? (rgpd_text || null) : null,
      req.body.airbnb_ical_url !== undefined ? airbnbIcalUrl : existing.airbnb_ical_url,
      req.body.booking_ical_url !== undefined ? bookingIcalUrl : existing.booking_ical_url,
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
  const parsed = parseImageDataUri(req.body.image);
  if (!parsed) return res.status(400).json({ error: 'Formato de imagem inválido. Tipos aceites: JPEG, PNG, GIF, WebP, AVIF.' });

  const filename = `cover_${id}.${parsed.ext}`;
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

  const parsed = parseImageDataUri(image);
  if (!parsed) return res.status(400).json({ error: 'Formato inválido. Tipos aceites: JPEG, PNG, GIF, WebP, AVIF.' });

  const filename = `gallery_${id}_${section}_${Date.now()}.${parsed.ext}`;
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
    extra_occupancy_options: normalizeExtraOccupancyOptions(a.extra_occupancy_options, a),
  };
}
function safeJson(v, def) {
  if (!v) return def;
  if (typeof v === 'object') return v; // already parsed — don't double-parse
  try { return JSON.parse(v); } catch { return def; }
}

function normalizeIcalUrl(value) {
  const url = String(value || '').trim();
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) return null;
  return url;
}

function normalizeExtraOccupancyOptions(value, legacy = {}) {
  let options = [];
  if (Array.isArray(value)) {
    options = value;
  } else if (typeof value === 'string' && value.trim()) {
    try { options = JSON.parse(value); } catch { options = []; }
  }

  if (!options.length && legacy.extra_bed_enabled) {
    options = [{
      type: legacy.extra_bed_type || 'sofa_cama',
      custom_name: '',
      capacity: Number(legacy.extra_bed_capacity) || 0,
      price: Number(legacy.extra_bed_price) || 0,
      charge_type: legacy.extra_bed_charge_type || 'per_guest_night',
      notes: legacy.extra_bed_notes || ''
    }];
  }

  return options.map(option => ({
    type: option?.type || 'sofa_cama',
    custom_name: String(option?.custom_name || ''),
    capacity: Math.max(0, Number(option?.capacity) || 0),
    price: Math.max(0, Number(option?.price) || 0),
    charge_type: option?.charge_type === 'per_bed_night' ? 'per_bed_night' : 'per_guest_night',
    notes: String(option?.notes || '')
  }));
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

// ─── PRICING PERIODS ───────────────────────────────────────
function getPricingPeriods(req, res) {
  const { id } = req.params;
  const acc = db.prepare('SELECT id FROM accommodations WHERE id = ? AND organization_id = ?').get(id, req.user.organization_id);
  if (!acc) return res.status(404).json({ error: 'Alojamento não encontrado' });
  const periods = db.prepare(`
    SELECT * FROM pricing_periods WHERE accommodation_id = ? AND organization_id = ? ORDER BY start_date ASC
  `).all(id, req.user.organization_id);
  res.json({ success: true, data: periods });
}

function createPricingPeriod(req, res) {
  const { id } = req.params;
  const acc = db.prepare('SELECT id FROM accommodations WHERE id = ? AND organization_id = ?').get(id, req.user.organization_id);
  if (!acc) return res.status(404).json({ error: 'Alojamento não encontrado' });

  const { name, start_date, end_date, price_per_night, min_nights } = req.body;
  if (!name || !start_date || !end_date || price_per_night == null) {
    return res.status(400).json({ error: 'Nome, datas e preço são obrigatórios' });
  }
  if (start_date >= end_date) return res.status(400).json({ error: 'A data de fim deve ser posterior à data de início' });
  if (Number(price_per_night) < 0) return res.status(400).json({ error: 'O preço não pode ser negativo' });

  const periodId = uuidv4().slice(0, 8);
  db.prepare(`
    INSERT INTO pricing_periods (id, organization_id, accommodation_id, name, start_date, end_date, price_per_night, min_nights)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(periodId, req.user.organization_id, id, name, start_date, end_date, Number(price_per_night), Number(min_nights) || 1);
  res.status(201).json({ success: true, data: db.prepare('SELECT * FROM pricing_periods WHERE id = ? AND organization_id = ?').get(periodId, req.user.organization_id) });
}

function updatePricingPeriod(req, res) {
  const { id, periodId } = req.params;
  const existing = db.prepare('SELECT * FROM pricing_periods WHERE id = ? AND accommodation_id = ? AND organization_id = ?').get(periodId, id, req.user.organization_id);
  if (!existing) return res.status(404).json({ error: 'Período não encontrado' });

  const { name, start_date, end_date, price_per_night, min_nights } = req.body;
  const newStart = start_date || existing.start_date;
  const newEnd = end_date || existing.end_date;
  if (newStart >= newEnd) return res.status(400).json({ error: 'A data de fim deve ser posterior à data de início' });

  db.prepare(`
    UPDATE pricing_periods SET
      name = COALESCE(?, name), start_date = ?, end_date = ?,
      price_per_night = COALESCE(?, price_per_night),
      min_nights = COALESCE(?, min_nights),
      updated_at = datetime('now')
    WHERE id = ? AND organization_id = ?
  `).run(name ?? null, newStart, newEnd, price_per_night != null ? Number(price_per_night) : null, min_nights != null ? Number(min_nights) : null, periodId, req.user.organization_id);
  res.json({ success: true, data: db.prepare('SELECT * FROM pricing_periods WHERE id = ? AND organization_id = ?').get(periodId, req.user.organization_id) });
}

function deletePricingPeriod(req, res) {
  const { id, periodId } = req.params;
  const existing = db.prepare('SELECT id FROM pricing_periods WHERE id = ? AND accommodation_id = ? AND organization_id = ?').get(periodId, id, req.user.organization_id);
  if (!existing) return res.status(404).json({ error: 'Período não encontrado' });
  db.prepare('DELETE FROM pricing_periods WHERE id = ? AND organization_id = ?').run(periodId, req.user.organization_id);
  res.json({ success: true });
}

function bulkCreatePricingPeriods(req, res) {
  const { id } = req.params;
  const acc = db.prepare('SELECT id FROM accommodations WHERE id = ? AND organization_id = ?').get(id, req.user.organization_id);
  if (!acc) return res.status(404).json({ error: 'Alojamento não encontrado' });

  const { name, start_date, end_date, price_per_night, min_nights, days_of_week } = req.body;
  if (!name || !start_date || !end_date || price_per_night == null) {
    return res.status(400).json({ error: 'Nome, datas e preço são obrigatórios' });
  }
  if (start_date >= end_date) return res.status(400).json({ error: 'A data de fim deve ser posterior à data de início' });

  // days_of_week: array of integers 0-6 (0=Sun). Empty/missing = all days.
  const hasDowFilter = Array.isArray(days_of_week) && days_of_week.length > 0 && days_of_week.length < 7;
  const dowJson = hasDowFilter ? JSON.stringify(days_of_week.map(Number).sort()) : null;

  const periodId = uuidv4().slice(0, 8);
  db.prepare(`
    INSERT INTO pricing_periods (id, organization_id, accommodation_id, name, start_date, end_date, price_per_night, min_nights, days_of_week)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(periodId, req.user.organization_id, id, name, start_date, end_date, Number(price_per_night), Number(min_nights) || 1, dowJson);

  const created = db.prepare('SELECT * FROM pricing_periods WHERE id = ? AND organization_id = ?').get(periodId, req.user.organization_id);
  res.status(201).json({ success: true, data: [created], count: 1 });
}

module.exports = { getAll, getById, create, update, remove, uploadCover, removeCover, uploadImages, deleteImage, patchImages, getSettings, saveSettings, getPricingPeriods, createPricingPeriod, updatePricingPeriod, deletePricingPeriod, bulkCreatePricingPeriods };
