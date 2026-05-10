const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../config/database');
const { recordConsent } = require('../services/rgpdService');

const COMMON_AREAS_KEY = 'areas_comuns';

function parseJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function publicUrl(req) {
  const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
  return `${proto}://${req.get('host')}`;
}

function imageUrl(req, url) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  return `${publicUrl(req)}${url}`;
}

function normalizeImages(req, accommodation) {
  const images = parseJson(accommodation.images, {});
  const entries = [];
  if (accommodation.cover_image) entries.push({ url: imageUrl(req, accommodation.cover_image), label: 'Capa' });
  Object.entries(images || {}).forEach(([key, list]) => {
    if (key === '_sections' || !Array.isArray(list)) return;
    list.forEach(url => entries.push({ url: imageUrl(req, url), label: key }));
  });
  return entries;
}

function serializeAccommodation(req, row, parent = null) {
  const images = normalizeImages(req, row);
  const parentImages = parent ? normalizeImages(req, parent).filter(img => img.label === COMMON_AREAS_KEY || img.label === 'Capa') : [];
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    public_slug: row.public_slug,
    parent_id: row.parent_id || null,
    description: row.description || '',
    address: row.address || parent?.address || '',
    city: row.city || parent?.city || '',
    region: row.region || parent?.region || '',
    country: row.country || parent?.country || 'Portugal',
    area: row.area || null,
    num_rooms: row.num_rooms || 1,
    num_bathrooms: row.num_bathrooms || 1,
    price_per_night: Number(row.price_per_night || 0),
    max_guests: Number(row.max_guests || 1),
    base_guests_included: Number(row.base_guests_included || Math.min(Number(row.max_guests || 2), 2)),
    baby_age_limit: Number(row.baby_age_limit ?? 2),
    baby_price: Number(row.baby_price ?? 0),
    child_age_limit: Number(row.child_age_limit ?? 12),
    child_price: Number(row.child_price ?? 0),
    checkin_time: row.checkin_time || parent?.checkin_time || '15:00',
    checkout_time: row.checkout_time || parent?.checkout_time || '11:00',
    amenities: parseJson(row.amenities, []),
    extra_occupancy_options: normalizeExtraOccupancyOptions(row),
    images: [...images, ...parentImages],
    cover_image: imageUrl(req, row.cover_image) || images[0]?.url || parentImages[0]?.url || ''
  };
}

function normalizeExtraOccupancyOptions(accommodation) {
  let options = parseJson(accommodation.extra_occupancy_options, []);
  if (!Array.isArray(options)) options = [];
  if (!options.length && accommodation.extra_bed_enabled) {
    options = [{
      type: accommodation.extra_bed_type || 'sofa_cama',
      capacity: Number(accommodation.extra_bed_capacity) || 0,
      price: Number(accommodation.extra_bed_price) || 0,
      charge_type: accommodation.extra_bed_charge_type || 'per_guest_night',
      notes: ''
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

function getPropertyBySlug(slug) {
  return db.prepare(`
    SELECT * FROM accommodations
    WHERE public_slug = ? AND type = 'alojamento'
  `).get(slug);
}

function getChildren(parent) {
  return db.prepare(`
    SELECT * FROM accommodations
    WHERE organization_id = ? AND parent_id = ?
    ORDER BY name
  `).all(parent.organization_id, parent.id);
}

function findConflict(organizationId, accommodationId, checkIn, checkOut) {
  const accom = db.prepare('SELECT id, type, parent_id FROM accommodations WHERE id = ? AND organization_id = ?').get(accommodationId, organizationId);
  if (!accom) return null;

  const idsToCheck = new Set([accommodationId]);
  if (accom.parent_id) idsToCheck.add(accom.parent_id);
  else if (accom.type === 'alojamento') {
    db.prepare('SELECT id FROM accommodations WHERE organization_id = ? AND parent_id = ?').all(organizationId, accommodationId)
      .forEach(c => idsToCheck.add(c.id));
  }

  const placeholders = [...idsToCheck].map(() => '?').join(',');
  return db.prepare(`
    SELECT id FROM reservations
    WHERE status != 'cancelada'
      AND organization_id = ?
      AND check_in < ?
      AND check_out > ?
      AND accommodation_id IN (${placeholders})
    LIMIT 1
  `).get(organizationId, checkOut, checkIn, ...idsToCheck);
}

function normalizeDateValue(value) {
  const raw = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const pt = raw.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (pt) return `${pt[3]}-${pt[2]}-${pt[1]}`;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 8) return `${digits.slice(4, 8)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`;
  return '';
}

function ageAt(birthDate, refDate) {
  const birthIso = normalizeDateValue(birthDate);
  const refIso = normalizeDateValue(refDate);
  if (!birthIso || !refIso) return null;
  const birth = new Date(`${birthIso}T12:00:00`);
  const ref = new Date(`${refIso}T12:00:00`);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(ref.getTime()) || birth > ref) return null;
  let age = ref.getFullYear() - birth.getFullYear();
  const monthDiff = ref.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && ref.getDate() < birth.getDate())) age--;
  return age;
}

function getSpecialRates(accommodation, birthDates, checkIn) {
  const babyLimit = Number(accommodation.baby_age_limit ?? 2);
  const childLimit = Number(accommodation.child_age_limit ?? 12);
  return birthDates
    .map(date => {
      const age = ageAt(date, checkIn);
      if (age === null) return null;
      if (age < babyLimit) return Number(accommodation.baby_price ?? 0);
      if (age >= babyLimit && age < childLimit) return Number(accommodation.child_price ?? 0);
      return null;
    })
    .filter(rate => rate !== null);
}

function getExtraOccupancyCharge(accommodation, guests, nights, birthDates, checkIn) {
  const options = normalizeExtraOccupancyOptions(accommodation);
  const maxGuests = Number(accommodation.max_guests) || guests;
  const included = Math.max(1, Math.min(Number(accommodation.base_guests_included) || Math.min(maxGuests, 2), maxGuests));
  let remaining = Math.max(0, guests - included);
  if (!remaining) return 0;
  const specialRates = getSpecialRates(accommodation, birthDates.slice(included), checkIn).slice(0, remaining);
  let total = specialRates.reduce((sum, rate) => sum + rate * nights, 0);
  remaining -= specialRates.length;
  return options.reduce((sum, option) => {
    if (remaining <= 0) return sum;
    const capacity = Math.max(0, Number(option.capacity) || 0);
    if (!capacity) return sum;
    const covered = Math.min(remaining, capacity);
    remaining -= covered;
    const price = Number(option.price) || 0;
    if (option.charge_type === 'per_bed_night') return sum + price * nights;
    return sum + price * covered * nights;
  }, total);
}

function getServices(organizationId) {
  const row = db.prepare("SELECT value FROM organization_settings WHERE organization_id = ? AND key = 'services'").get(organizationId);
  return row ? parseJson(row.value, []) : [];
}

function calculateTotal(accommodation, organizationId, payload) {
  const checkIn = normalizeDateValue(payload.check_in);
  const checkOut = normalizeDateValue(payload.check_out);
  const guests = Math.max(1, Number(payload.num_guests) || 1);
  const nights = Math.round((new Date(`${checkOut}T12:00:00`) - new Date(`${checkIn}T12:00:00`)) / 86400000);
  if (!checkIn || !checkOut || nights <= 0) throw new Error('Datas inválidas.');
  if (guests > Number(accommodation.max_guests || 0)) throw new Error(`Capacidade máxima: ${accommodation.max_guests} hóspedes.`);

  const services = getServices(organizationId);
  const taxSvc = services.find(s => s.id === 'tourist_tax');
  const bkfSvc = services.find(s => s.id === 'breakfast');
  const breakfast = payload.breakfast_included === true || payload.breakfast_included === 'true';
  const birthDates = [payload.guest?.birth_date, ...(payload.guests_data || []).map(g => g.birth_date)].filter(Boolean);
  const touristTax = (taxSvc?.active !== false) ? (Number(taxSvc?.value ?? 3) * guests * nights) : 0;
  const breakfastCost = breakfast ? (Number(bkfSvc?.value ?? 19) * guests * nights) : 0;
  const extraOccupancyCost = getExtraOccupancyCharge(accommodation, guests, nights, birthDates, checkIn);
  return {
    checkIn,
    checkOut,
    guests,
    nights,
    touristTax,
    breakfastCost,
    extraOccupancyCost,
    totalAmount: (Number(accommodation.price_per_night || 0) * nights) + touristTax + breakfastCost + extraOccupancyCost
  };
}

function getLanding(req, res) {
  const parent = getPropertyBySlug(req.params.slug);
  if (!parent) return res.status(404).json({ success: false, error: 'Alojamento não encontrado.' });
  const children = getChildren(parent);
  const reservable = children.length ? children : [parent];
  res.json({
    success: true,
    data: {
      property: serializeAccommodation(req, parent),
      units: reservable.map(unit => serializeAccommodation(req, unit, parent)),
      services: getServices(parent.organization_id)
        .filter(s => ['breakfast', 'tourist_tax'].includes(s.id))
        .map(s => ({ id: s.id, name: s.name, value: Number(s.value || 0), unit: s.unit, active: s.active !== false }))
    }
  });
}

function getAvailability(req, res) {
  const parent = getPropertyBySlug(req.params.slug);
  if (!parent) return res.status(404).json({ success: false, error: 'Alojamento não encontrado.' });
  const checkIn = normalizeDateValue(req.query.check_in);
  const checkOut = normalizeDateValue(req.query.check_out);
  const guests = Math.max(1, Number(req.query.num_guests) || 1);
  const children = getChildren(parent);
  const reservable = children.length ? children : [parent];

  const available = [
    {
      id: parent.id,
      name: 'Alojamento completo',
      type: 'property',
      available: !children.length || children.every(child => {
        const conflict = checkIn && checkOut ? findConflict(parent.organization_id, child.id, checkIn, checkOut) : null;
        return !conflict && guests <= Number(child.max_guests || 0);
      }),
      occupied: children.length && children.some(child => {
        const conflict = checkIn && checkOut ? findConflict(parent.organization_id, child.id, checkIn, checkOut) : null;
        return !!conflict;
      }),
      over_capacity: children.length && children.some(child => guests > Number(child.max_guests || 0)),
      max_guests: Math.max(...reservable.map(u => Number(u.max_guests || 0)))
    }
  ];

  reservable.forEach(unit => {
    const conflict = checkIn && checkOut ? findConflict(parent.organization_id, unit.id, checkIn, checkOut) : null;
    available.push({
      id: unit.id,
      name: unit.name,
      type: 'unit',
      available: !conflict && guests <= Number(unit.max_guests || 0),
      occupied: !!conflict,
      over_capacity: guests > Number(unit.max_guests || 0),
      max_guests: Number(unit.max_guests || 0)
    });
  });

  res.json({ success: true, data: available });
}

function createReservation(req, res, next) {
  try {
    const parent = getPropertyBySlug(req.params.slug);
    if (!parent) return res.status(404).json({ success: false, error: 'Alojamento não encontrado.' });
    const payload = req.body || {};

    let unit, isCompleteProperty = false;
    if (payload.accommodation_id === 'property') {
      unit = parent;
      isCompleteProperty = true;
    } else {
      unit = db.prepare(`
        SELECT * FROM accommodations
        WHERE id = ? AND organization_id = ? AND (parent_id = ? OR id = ?)
      `).get(payload.accommodation_id, parent.organization_id, parent.id, parent.id);
    }
    if (!unit) return res.status(400).json({ success: false, error: 'Alojamento inválido.' });

    if (isCompleteProperty) {
      const children = getChildren(parent);
      for (const child of children) {
        const conflict = findConflict(parent.organization_id, child.id, payload.check_in, payload.check_out);
        if (conflict) {
          return res.status(409).json({ success: false, error: `${child.name} já está ocupado nessas datas.` });
        }
      }
    }
    if (!payload.guest?.name || !payload.guest?.email || !payload.guest?.birth_date) {
      return res.status(400).json({ success: false, error: 'Dados do hóspede principal em falta.' });
    }
    const guestsData = Array.isArray(payload.guests_data) ? payload.guests_data : [];
    const guestCount = Math.max(1, Number(payload.num_guests) || 1);
    for (let i = 0; i < guestCount - 1; i++) {
      if (!guestsData[i]?.name || !guestsData[i]?.birth_date) {
        return res.status(400).json({ success: false, error: `Dados do hóspede ${i + 2} em falta.` });
      }
    }
    const totals = calculateTotal(unit, parent.organization_id, payload);
    if (!isCompleteProperty && findConflict(parent.organization_id, unit.id, totals.checkIn, totals.checkOut)) {
      return res.status(409).json({ success: false, error: 'Este alojamento já está ocupado nessas datas.' });
    }
    if (!payload.rgpd_consent) return res.status(400).json({ success: false, error: 'É necessário aceitar o RGPD.' });

    let guest = db.prepare('SELECT * FROM guests WHERE email = ? AND organization_id = ?').get(payload.guest.email, parent.organization_id);
    if (!guest) {
      const guestId = uuidv4();
      db.prepare(`
        INSERT INTO guests (id, organization_id, name, email, phone, first_name, last_name, birth_date, nif, id_type, country, address, postal_code, city, nationality)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        guestId, parent.organization_id, payload.guest.name, payload.guest.email, payload.guest.phone || null,
        payload.guest.first_name || null, payload.guest.last_name || null, normalizeDateValue(payload.guest.birth_date),
        payload.guest.nif || null, payload.guest.id_type || null, payload.guest.country || payload.guest.nationality || null,
        payload.guest.address || null, payload.guest.postal_code || null, payload.guest.city || null,
        payload.guest.country || payload.guest.nationality || null
      );
      guest = db.prepare('SELECT * FROM guests WHERE id = ? AND organization_id = ?').get(guestId, parent.organization_id);
    }
    recordConsent(guest.id, req.ip);

    const reservationId = `SP-${Date.now()}`;
    const token = crypto.randomBytes(32).toString('hex');
    const normalizedGuestsData = guestsData.map(g => ({ ...g, birth_date: normalizeDateValue(g.birth_date) }));

    if (isCompleteProperty) {
      const children = getChildren(parent);
      const accommodationsToReserve = children.length ? children : [parent];

      for (const accom of accommodationsToReserve) {
        db.prepare(`
          INSERT INTO reservations (
            id, organization_id, guest_id, accommodation_id, check_in, check_out, nights, num_guests,
            total_amount, breakfast_included, tourist_tax, channel, payment_method, notes, license_number, status,
            guests_data, amount_paid, payment_status, public_token, arrival_time
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente', ?, 0, 'pendente', ?, ?)
        `).run(
          `${reservationId}-${accom.id}`, parent.organization_id, guest.id, accom.id, totals.checkIn, totals.checkOut, totals.nights, totals.guests,
          totals.totalAmount, payload.breakfast_included ? 1 : 0, totals.touristTax,
          'website', null, payload.notes || null, accom.license_number,
          JSON.stringify(normalizedGuestsData), token, payload.arrival_time || null
        );
      }
    } else {
      db.prepare(`
        INSERT INTO reservations (
          id, organization_id, guest_id, accommodation_id, check_in, check_out, nights, num_guests,
          total_amount, breakfast_included, tourist_tax, channel, payment_method, notes, license_number, status,
          guests_data, amount_paid, payment_status, public_token, arrival_time
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente', ?, 0, 'pendente', ?, ?)
      `).run(
        reservationId, parent.organization_id, guest.id, unit.id, totals.checkIn, totals.checkOut, totals.nights, totals.guests,
        totals.totalAmount, payload.breakfast_included ? 1 : 0, totals.touristTax,
        'website', null, payload.notes || null, unit.license_number,
        JSON.stringify(normalizedGuestsData), token, payload.arrival_time || null
      );
    }

    res.status(201).json({
      success: true,
      data: {
        id: reservationId,
        status: 'pendente',
        total_amount: totals.totalAmount,
        public_token: token,
        public_url: `${publicUrl(req)}/reserva/${token}`
      }
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getLanding, getAvailability, createReservation };
