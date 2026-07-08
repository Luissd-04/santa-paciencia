const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../config/database');
const { recordConsent } = require('../services/rgpdService');
const { syncReservationOperationalTasks } = require('../services/operationalTasksService');
const { sendOwnerNewReservationEmail } = require('../services/emailService');
const { notifyOrganization } = require('../services/pushService');
const {
  calculateReservationTotals,
  normalizeDateValue,
} = require('../services/reservationRules');
const { getAccommodationScope } = require('../services/availabilityRules');
const { findBlockConflict } = require('../services/accommodationBlockService');
const turnstile = require('../services/turnstileService');
const { recordHistory } = require('../services/reservationHistoryService');

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
    min_nights: Number(row.min_nights || parent?.min_nights || 1),
    amenities: parseJson(row.amenities, []),
    extra_occupancy_options: normalizeExtraOccupancyOptions(row),
    images: [...images, ...parentImages],
    cover_image: imageUrl(req, row.cover_image) || images[0]?.url || parentImages[0]?.url || '',
    rgpd_text: row.rgpd_text || null
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

function findConflict(organizationId, accommodationId, checkIn, checkOut, excludeId = null) {
  const accommodations = db.prepare('SELECT id, type, parent_id FROM accommodations WHERE organization_id = ?').all(organizationId);
  const idsToCheck = getAccommodationScope(accommodations, accommodationId);
  if (!idsToCheck.length) return null;

  const placeholders = idsToCheck.map(() => '?').join(',');
  const excludeClause = excludeId ? ' AND id != ?' : '';
  const params = [organizationId, checkOut, checkIn, ...idsToCheck];
  if (excludeId) params.push(excludeId);
  const reservationConflict = db.prepare(`
    SELECT id FROM reservations
    WHERE status != 'cancelada'
      AND organization_id = ?
      AND check_in < ?
      AND check_out > ?
      AND accommodation_id IN (${placeholders})${excludeClause}
    LIMIT 1
  `).get(...params);
  if (reservationConflict) return reservationConflict;

  // Datas bloqueadas manualmente também tornam o alojamento indisponível.
  return findBlockConflict(organizationId, accommodationId, checkIn, checkOut);
}

function getServices(organizationId) {
  const row = db.prepare("SELECT value FROM organization_settings WHERE organization_id = ? AND key = 'services'").get(organizationId);
  return row ? parseJson(row.value, []) : [];
}

function getPricingPeriods(organizationId, accommodationId) {
  return db.prepare(`
    SELECT * FROM pricing_periods
    WHERE organization_id = ? AND accommodation_id = ?
    ORDER BY start_date
  `).all(organizationId, accommodationId);
}

function calculateTotal(accommodation, organizationId, payload) {
  const pricing_periods = getPricingPeriods(organizationId, accommodation.id);
  return calculateReservationTotals(accommodation, getServices(organizationId), { ...payload, pricing_periods });
}

function getLanding(req, res) {
  const parent = getPropertyBySlug(req.params.slug);
  if (!parent) return res.status(404).json({ success: false, error: 'Alojamento não encontrado.' });
  const children = getChildren(parent);
  const reservable = children.length ? children : [parent];
  res.json({
    success: true,
    data: {
      property: {
        ...serializeAccommodation(req, parent),
        pricing_periods: getPricingPeriods(parent.organization_id, parent.id)
      },
      units: reservable.map(unit => ({
        ...serializeAccommodation(req, unit, parent),
        pricing_periods: getPricingPeriods(parent.organization_id, unit.id)
      })),
      services: getServices(parent.organization_id)
        .filter(s => ['breakfast', 'tourist_tax'].includes(s.id))
        .map(s => ({ id: s.id, name: s.name, value: Number(s.value || 0), unit: s.unit, active: s.active !== false })),
      captcha: {
        provider: 'turnstile',
        site_key: turnstile.getSiteKey(),
      }
    }
  });
}

function validatePublicVoucher(req, res) {
  const parent = getPropertyBySlug(req.params.slug);
  if (!parent) return res.status(404).json({ success: false, error: 'Alojamento não encontrado.' });
  const rawCode = String(req.query.code || '').toUpperCase().trim();
  if (!rawCode) return res.status(400).json({ success: false, error: 'Código obrigatório.' });
  if (!/^[A-Z0-9]{3,20}$/.test(rawCode)) return res.status(400).json({ success: false, error: 'Formato de código inválido.' });

  const voucher = db.prepare(`
    SELECT * FROM vouchers
    WHERE code = ? AND organization_id = ? AND status = 'active'
  `).get(rawCode, parent.organization_id);
  if (!voucher) return res.status(404).json({ success: false, error: 'Voucher inválido ou já utilizado.' });

  const today = new Date().toISOString().slice(0, 10);
  if (voucher.valid_until && voucher.valid_until < today)
    return res.status(400).json({ success: false, error: 'Voucher expirado.' });
  if (voucher.valid_from && voucher.valid_from > today)
    return res.status(400).json({ success: false, error: 'Voucher ainda não está ativo.' });

  res.json({ success: true, data: {
    id: voucher.id, code: voucher.code, type: voucher.type, value: voucher.value,
    description: voucher.description, min_nights: voucher.min_nights, accommodation_id: voucher.accommodation_id
  }});
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

// Mensagem genérica para qualquer rejeição anti-bot — não dar pistas a quem
// está a tentar contornar (honeypot, timing, captcha) sobre QUAL camada falhou.
const ANTIBOT_GENERIC_ERROR = 'Não foi possível processar o pedido. Por favor recarrega a página e tenta de novo.';
const MIN_FORM_FILL_MS = 8000; // 8 segundos — humano dificilmente preenche tudo mais rápido

async function createReservation(req, res, next) {
  try {
    const parent = getPropertyBySlug(req.params.slug);
    if (!parent) return res.status(404).json({ success: false, error: 'Alojamento não encontrado.' });
    const payload = req.body || {};

    // Anti-bot camada 1 — Honeypot. Bots de auto-fill preenchem o campo
    // escondido; humanos nunca o vêem.
    if (payload.hp_website && String(payload.hp_website).trim().length > 0) {
      return res.status(400).json({ success: false, error: ANTIBOT_GENERIC_ERROR });
    }

    // Anti-bot camada 2 — Timing. Scripts que fazem POST directo enviam
    // imediatamente; humanos demoram a preencher 3 passos.
    const elapsed = Number(payload.elapsed_ms);
    if (!Number.isFinite(elapsed) || elapsed < MIN_FORM_FILL_MS) {
      return res.status(400).json({ success: false, error: ANTIBOT_GENERIC_ERROR });
    }

    // Anti-bot camada 3 — CAPTCHA Turnstile.
    const captchaResult = await turnstile.verify(payload.captcha_token, req.ip);
    if (!captchaResult.success) {
      return res.status(400).json({ success: false, error: captchaResult.error || 'CAPTCHA inválido.' });
    }

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
    if (!payload.guest?.name || !payload.guest?.email) {
      return res.status(400).json({ success: false, error: 'Dados do hóspede principal em falta.' });
    }
    const guestsData = Array.isArray(payload.guests_data) ? payload.guests_data : [];
    const guestCount = Math.max(1, Number(payload.num_guests) || 1);
    for (let i = 0; i < guestCount - 1; i++) {
      if (!guestsData[i]?.name) {
        return res.status(400).json({ success: false, error: `Dados do hóspede ${i + 2} em falta.` });
      }
    }
    const totals = calculateTotal(unit, parent.organization_id, payload);
    const minNights = Number(unit.min_nights || parent.min_nights || 1);
    if (totals.nights < minNights) {
      return res.status(400).json({ success: false, error: `A estadia mínima é de ${minNights} noite${minNights !== 1 ? 's' : ''}.` });
    }
    if (!isCompleteProperty && findConflict(parent.organization_id, unit.id, totals.checkIn, totals.checkOut)) {
      return res.status(409).json({ success: false, error: 'Este alojamento já está ocupado nessas datas.' });
    }
    if (!payload.rgpd_consent) return res.status(400).json({ success: false, error: 'É necessário aceitar o RGPD.' });

    // Calcular desconto de voucher (validação preliminar fora da transação)
    let pendingVoucherCode = null;
    let voucherDiscount = 0;
    if (payload.voucher_code) {
      const vCode = String(payload.voucher_code).toUpperCase().trim();
      if (!/^[A-Z0-9]{3,20}$/.test(vCode)) {
        return res.status(400).json({ success: false, error: 'Formato de código de voucher inválido.' });
      }
      const voucher = db.prepare(
        "SELECT * FROM vouchers WHERE code = ? AND organization_id = ? AND status = 'active'"
      ).get(vCode, parent.organization_id);
      if (voucher) {
        const today = new Date().toISOString().slice(0, 10);
        const dateOk = (!voucher.valid_from || voucher.valid_from <= today) && (!voucher.valid_until || voucher.valid_until >= today);
        const nightsOk = !voucher.min_nights || totals.nights >= voucher.min_nights;
        const accomOk = !voucher.accommodation_id || voucher.accommodation_id === unit.id || voucher.accommodation_id === parent.id;
        if (dateOk && nightsOk && accomOk) {
          pendingVoucherCode = vCode;
          voucherDiscount = voucher.type === 'discount_pct'
            ? totals.totalAmount * (voucher.value / 100)
            : Math.min(voucher.value, totals.totalAmount);
        }
      }
    }
    const finalTotal = Math.max(0, totals.totalAmount - voucherDiscount);

    // ID único sem colisão por concorrência
    const reservationId = `SP-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
    const token = crypto.randomBytes(32).toString('hex');
    // Token distinto para pre-checkin (S2): TTL = check_out (deixa de funcionar
    // depois da estadia). Evita que quem tenha só o link de pre-checkin aceda
    // à página de gestão e vice-versa.
    const precheckinToken = crypto.randomBytes(32).toString('hex');
    const precheckinExpiresAt = totals.checkOut;
    const normalizedGuestsData = guestsData.map(g => ({ ...g, birth_date: normalizeDateValue(g.birth_date) }));
    const accommodationId = isCompleteProperty ? parent.id : unit.id;
    const licenseNumber = isCompleteProperty ? parent.license_number : unit.license_number;
    const accommodationName = isCompleteProperty ? parent.name : unit.name;

    // Transação atómica: guest + reserva + marcar voucher como usado em simultâneo
    const txResult = db.transaction(() => {
      // Criar ou obter hóspede
      let g = db.prepare('SELECT * FROM guests WHERE email = ? AND organization_id = ?').get(payload.guest.email, parent.organization_id);
      if (!g) {
        const guestId = uuidv4();
        db.prepare(`
          INSERT INTO guests (id, organization_id, name, email, phone, first_name, last_name, birth_date, country)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          guestId, parent.organization_id, payload.guest.name, payload.guest.email, payload.guest.phone || null,
          payload.guest.first_name || null, payload.guest.last_name || null, normalizeDateValue(payload.guest.birth_date) || null,
          payload.guest.nationality || payload.guest.country || null
        );
        g = db.prepare('SELECT * FROM guests WHERE id = ? AND organization_id = ?').get(guestId, parent.organization_id);
      }

      // Validar e marcar voucher atomicamente — re-verifica status dentro da transação
      let confirmedVoucherId = null;
      if (pendingVoucherCode) {
        const locked = db.prepare(
          "SELECT id FROM vouchers WHERE code = ? AND organization_id = ? AND status = 'active'"
        ).get(pendingVoucherCode, parent.organization_id);
        if (!locked) {
          // Outro pedido já usou o voucher entretanto
          throw Object.assign(new Error('Voucher já foi utilizado por outra reserva.'), { status: 409 });
        }
        confirmedVoucherId = locked.id;
        db.prepare(
          "UPDATE vouchers SET status = 'used', used_at = datetime('now'), used_in_reservation_id = ?, updated_at = datetime('now') WHERE id = ? AND organization_id = ?"
        ).run(reservationId, confirmedVoucherId, parent.organization_id);
      }

      // Inserir reserva
      db.prepare(`
        INSERT INTO reservations (
          id, organization_id, guest_id, accommodation_id, check_in, check_out, nights, num_guests,
          total_amount, breakfast_included, tourist_tax, channel, payment_method, notes, license_number, status,
          guests_data, amount_paid, payment_status, public_token, precheckin_token, precheckin_token_expires_at, arrival_time
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente', ?, 0, 'pendente', ?, ?, ?, ?)
      `).run(
        reservationId, parent.organization_id, g.id, accommodationId,
        totals.checkIn, totals.checkOut, totals.nights, totals.guests,
        finalTotal, payload.breakfast_included ? 1 : 0, totals.touristTax,
        'website', null, payload.notes || null, licenseNumber,
        JSON.stringify(normalizedGuestsData), token, precheckinToken, precheckinExpiresAt, payload.arrival_time || null
      );

      return g;
    })();

    recordConsent(txResult.id, req.ip, parent.organization_id);

    const reservation = db.prepare('SELECT * FROM reservations WHERE id = ? AND organization_id = ?')
      .get(reservationId, parent.organization_id);
    recordHistory({
      organizationId: parent.organization_id, reservationId, userId: null, action: 'created',
      meta: { check_in: reservation.check_in, check_out: reservation.check_out, accommodation_id: reservation.accommodation_id, total_amount: reservation.total_amount, source: 'public' },
    });
    syncReservationOperationalTasks({
      ...reservation,
      guest_name: txResult.name,
      accommodation_name: accommodationName,
    }, null);

    // Fire-and-forget — não bloqueia a resposta
    sendOwnerNewReservationEmail(
      parent.organization_id,
      txResult,
      reservation,
      unit,
      publicUrl(req)
    ).catch(() => {});

    notifyOrganization(parent.organization_id, 'new_reservation', {
      title: '🆕 Nova reserva',
      body: `${txResult.name} · ${accommodationName} · ${reservation.check_in} → ${reservation.check_out}`,
      url: '/reservas',
    });

    res.status(201).json({
      success: true,
      data: {
        id: reservationId,
        status: 'pendente',
        total_amount: finalTotal,
        public_token: token,
        public_url: `${publicUrl(req)}/reserva/${token}`,
        precheckin_url: `${publicUrl(req)}/pre-checkin/${precheckinToken}`,
      }
    });
  } catch (err) {
    next(err);
  }
}

function lookupReservationByPrecheckinToken(token) {
  // Lookup primário: token dedicado ao pre-checkin (S2). Fallback para o
  // `public_token` mantém compatibilidade com links já emitidos antes da
  // separação de tokens. Se ambos baterem, prefere o precheckin_token.
  return db.prepare(`
    SELECT r.*, g.name as guest_name, g.email as guest_email, g.phone as guest_phone,
           g.first_name, g.last_name, g.birth_date, g.nationality, g.country,
           g.document_type, g.document_number, g.document_issuer_country,
           a.name as accommodation_name, a.checkin_time, a.checkout_time, a.cover_image, a.images
    FROM reservations r
    JOIN guests g ON g.id = r.guest_id AND g.organization_id = r.organization_id
    JOIN accommodations a ON a.id = r.accommodation_id AND a.organization_id = r.organization_id
    WHERE r.precheckin_token = ? OR (r.precheckin_token IS NULL AND r.public_token = ?)
  `).get(token, token);
}

function getPreCheckin(req, res) {
  const token = String(req.params.token || '').trim();
  const reservation = lookupReservationByPrecheckinToken(token);
  if (!reservation) return res.status(404).json({ success: false, error: 'Link inválido ou expirado.' });
  if (reservation.status === 'cancelada') return res.status(400).json({ success: false, error: 'Esta reserva está cancelada.' });
  if (reservation.precheckin_token_expires_at &&
      new Date(reservation.precheckin_token_expires_at + 'T23:59:59') < new Date()) {
    return res.status(410).json({ success: false, error: 'Este link de pré check-in expirou.' });
  }
  if (reservation.check_out && new Date(reservation.check_out + 'T23:59:59') < new Date()) {
    return res.status(410).json({ success: false, error: 'O pré check-in não está disponível após a data de saída.' });
  }
  // PII sensível (documento, nacionalidade, nascimento, dados de hóspedes
  // adicionais) NÃO é devolvida pelo GET — apenas escrita pelo POST. Quem
  // tiver o link consegue ver o nome/email/telefone que já enviou na reserva
  // (e que o backoffice já tem), mas não os documentos pessoais.
  res.json({
    success: true,
    data: {
      reservation: {
        id: reservation.id,
        accommodation_name: reservation.accommodation_name,
        check_in: reservation.check_in,
        check_out: reservation.check_out,
        num_guests: reservation.num_guests,
        cover_image: imageUrl(req, reservation.cover_image),
        images: normalizeImages(req, reservation).map(img => img.url).filter(Boolean),
        arrival_time: reservation.arrival_time || '',
        checkin_time: reservation.checkin_time || '',
        status: reservation.status,
        precheckin_submitted_at: reservation.precheckin_submitted_at || null,
      },
      guest: {
        name: reservation.guest_name,
        email: reservation.guest_email,
        phone: reservation.guest_phone,
        first_name: '',
        last_name: '',
        birth_date: null,
        nationality: '',
        country: '',
        document_type: '',
        document_number: '',
        document_issuer_country: '',
      },
      guests_data: [],
    }
  });
}

function cleanGuestData(item = {}) {
  const fullName = String(item.name || '').trim();
  const parts = fullName.split(/\s+/).filter(Boolean);
  return {
    name: fullName,
    first_name: String(item.first_name || parts[0] || '').trim(),
    last_name: String(item.last_name || parts.slice(1).join(' ') || '').trim(),
    birth_date: normalizeDateValue(item.birth_date) || null,
    nationality: String(item.nationality || '').trim(),
    country: String(item.country || item.nationality || '').trim(),
    document_type: String(item.document_type || '').trim(),
    document_number: String(item.document_number || '').trim(),
    document_issuer_country: String(item.document_issuer_country || item.nationality || '').trim(),
  };
}

function submitPreCheckin(req, res) {
  const token = String(req.params.token || '').trim();
  const reservation = db.prepare(`
    SELECT * FROM reservations
    WHERE precheckin_token = ? OR (precheckin_token IS NULL AND public_token = ?)
  `).get(token, token);
  if (!reservation) return res.status(404).json({ success: false, error: 'Link inválido ou expirado.' });
  if (reservation.status === 'cancelada') return res.status(400).json({ success: false, error: 'Esta reserva está cancelada.' });
  if (reservation.precheckin_token_expires_at &&
      new Date(reservation.precheckin_token_expires_at + 'T23:59:59') < new Date()) {
    return res.status(410).json({ success: false, error: 'Este link de pré check-in expirou.' });
  }
  if (reservation.check_out && new Date(reservation.check_out + 'T23:59:59') < new Date()) {
    return res.status(410).json({ success: false, error: 'O pré check-in não está disponível após a data de saída.' });
  }

  const mainGuest = cleanGuestData(req.body?.guest || {});
  const expectedGuests = Math.max(1, Number(reservation.num_guests || 1));
  const extraGuests = Array.isArray(req.body?.guests_data) ? req.body.guests_data.map(cleanGuestData) : [];
  const allGuests = [mainGuest, ...extraGuests].slice(0, expectedGuests);
  const isPortuguese = g => (g.nationality || '').toLowerCase().trim() === 'portugal';
  const missingIndex = allGuests.findIndex(g => {
    if (!g.name || !g.nationality) return true;
    if (!isPortuguese(g) && (!g.birth_date || !g.document_type || !g.document_number || !g.document_issuer_country)) return true;
    return false;
  });
  if (missingIndex >= 0 || allGuests.length < expectedGuests) {
    return res.status(400).json({ success: false, error: 'Preencha os dados obrigatórios de todos os hóspedes.' });
  }

  db.prepare(`UPDATE guests SET
    name = COALESCE(?, name),
    first_name = COALESCE(?, first_name),
    last_name = COALESCE(?, last_name),
    birth_date = COALESCE(?, birth_date),
    nationality = COALESCE(?, nationality),
    country = COALESCE(?, country),
    document_type = COALESCE(?, document_type),
    document_number = COALESCE(?, document_number),
    document_issuer_country = COALESCE(?, document_issuer_country)
    WHERE id = ? AND organization_id = ?`)
    .run(
      mainGuest.name, mainGuest.first_name, mainGuest.last_name, mainGuest.birth_date,
      mainGuest.nationality, mainGuest.country, mainGuest.document_type,
      mainGuest.document_number, mainGuest.document_issuer_country,
      reservation.guest_id, reservation.organization_id
    );

  db.prepare(`UPDATE reservations SET
    guests_data = ?,
    arrival_time = ?,
    status = CASE WHEN status != 'confirmada' THEN 'aguardar_pagamento' ELSE status END,
    precheckin_submitted_at = datetime('now'),
    updated_at = datetime('now')
    WHERE id = ? AND organization_id = ?`)
    .run(
      JSON.stringify(allGuests.slice(1)),
      String(req.body?.arrival_time || '').trim() || null,
      reservation.id,
      reservation.organization_id
    );

  notifyOrganization(reservation.organization_id, 'precheckin', {
    title: '📝 Pré-check-in recebido',
    body: `${mainGuest.name} · entrada a ${reservation.check_in}`,
    url: '/reservas',
  });

  res.json({ success: true });
}

module.exports = {
  getLanding,
  getAvailability,
  validatePublicVoucher,
  createReservation,
  getPreCheckin,
  submitPreCheckin,
};
