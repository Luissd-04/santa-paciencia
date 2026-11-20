// Dados do alojamento de que cada email ao hóspede precisa. Sem um dado
// obrigatório o email não sai: fica retido (email_holds) e o sino diz o que
// falta; quando o alojamento fica completo, o sino oferece Enviar ou Ignorar.
// Os dados opcionais (telefone, logótipo, redes, Wi-Fi) só fazem desaparecer
// a sua parte do email.
const { db } = require('../config/database');

const LABELS = {
  email_contact: 'Email de contacto',
  property_address: 'Morada',
  license_number: 'N.º de licença AL',
  checkin_time: 'Hora de check-in',
  checkout_time: 'Hora de check-out',
  stripe: 'Pagamentos online (Stripe) ligados',
  arrival_instructions: 'Como chegar',
  entry: 'Como entrar ou código da porta',
  checkout_instructions: 'No dia da saída',
  review_url: 'Link de avaliação',
};
const COMMON = ['email_contact', 'property_address', 'license_number', 'checkin_time', 'checkout_time'];
const BY_TEMPLATE = {
  reserva_aceite: ['stripe'],
  coordenadas: ['arrival_instructions', 'entry', 'checkout_instructions'],
  obrigado: ['review_url'],
};
// Modelos do hóspede verificados (os restantes saem sempre: avisos da política,
// pré-check-in enviado à mão pela equipa).
const GUEST_TEMPLATES = ['confirmacao', 'reserva_aceite', 'pagamento', 'coordenadas', 'obrigado', 'cancelamento'];
const TEMPLATE_NAMES = {
  confirmacao: 'Pedido recebido', reserva_aceite: 'Reserva aceite', pagamento: 'Pagamento recebido',
  coordenadas: 'Tudo para a sua chegada', obrigado: 'Obrigado', cancelamento: 'Cancelamento',
};

function present(field, settings, accommodation, organizationId) {
  switch (field) {
    case 'stripe': return require('./stripeClient').stripeEnabled(organizationId);
    case 'entry': return Boolean(settings.entry_instructions || accommodation?.door_code);
    default: return Boolean(String(settings[field] || '').trim());
  }
}

// O que falta a um modelo (`reservation`, opcional: o sinal já pago dispensa a Stripe).
function missingFor(slug, { settings, accommodation, organizationId, reservation = null }) {
  if (!GUEST_TEMPLATES.includes(slug)) return [];
  let fields = [...COMMON, ...(BY_TEMPLATE[slug] || [])];
  if (slug === 'reserva_aceite' && reservation && reservation.status !== 'aguardar_pagamento') fields = fields.filter(f => f !== 'stripe');
  return fields.filter(field => !present(field, settings, accommodation, organizationId)).map(field => ({ field, label: LABELS[field] }));
}

// Os modelos ativos da organização e o que falta a cada um, para um alojamento.
function forAccommodation(organizationId, accommodation) {
  const emailService = require('./emailService');
  const resolved = emailService.resolveAccommodationInheritance(accommodation, organizationId);
  const settings = emailService.getEmailSettings(resolved, organizationId);
  const active = new Set(db.prepare('SELECT slug FROM organization_email_templates WHERE organization_id = ? AND active = 1').all(organizationId).map(t => t.slug));
  const emails = GUEST_TEMPLATES.filter(slug => active.has(slug))
    .map(slug => ({ slug, name: TEMPLATE_NAMES[slug], missing: missingFor(slug, { settings, accommodation: resolved, organizationId }) }));
  return { emails, ready: emails.filter(e => !e.missing.length).length, total: emails.length };
}

// Retém um email (ou atualiza o que falta, se já estava retido).
function hold({ organizationId, reservationId, slug, missing, extra = {} }) {
  db.prepare(`INSERT INTO email_holds (organization_id, reservation_id, template_slug, missing, extra)
      VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(organization_id, reservation_id, template_slug) DO UPDATE SET
      missing = excluded.missing, extra = excluded.extra, updated_at = datetime('now'), resolved_at = NULL, resolution = NULL`)
    .run(organizationId, reservationId, slug, JSON.stringify(missing), JSON.stringify(extra || {}));
  try { require('./liveUpdates').publish(organizationId); } catch { /* sem páginas abertas */ }
}

function resolve(organizationId, reservationId, slug, resolution) {
  return db.prepare(`UPDATE email_holds SET resolved_at = datetime('now'), resolution = ?, updated_at = datetime('now')
    WHERE organization_id = ? AND reservation_id = ? AND template_slug = ? AND resolved_at IS NULL`)
    .run(resolution, organizationId, reservationId, slug).changes;
}

// Um email retido deixa de fazer sentido: reserva cancelada (exceto o próprio
// cancelamento), estadia terminada, ou o email da chegada depois da chegada.
function stale(hold, reservation, today) {
  if (!reservation) return true;
  if (hold.template_slug === 'cancelamento') return reservation.status !== 'cancelada';
  if (reservation.status === 'cancelada') return true;
  if (hold.template_slug === 'coordenadas') return reservation.check_in < today;
  if (hold.template_slug === 'obrigado') return false;
  return reservation.check_out < today;
}

// Emails retidos por resolver, com o que falta agora (vazio: pronto a enviar).
function openHolds(organizationId) {
  const emailService = require('./emailService');
  const today = require('./dates').localDay();
  const rows = db.prepare(`SELECT h.*, r.status, r.check_in, r.check_out, r.accommodation_id, g.name AS guest_name
    FROM email_holds h
    JOIN reservations r ON r.id = h.reservation_id AND r.organization_id = h.organization_id
    LEFT JOIN guests g ON g.id = r.guest_id AND g.organization_id = r.organization_id
    WHERE h.organization_id = ? AND h.resolved_at IS NULL ORDER BY h.created_at`).all(organizationId);
  const out = [];
  for (const row of rows) {
    if (stale(row, row, today)) { resolve(organizationId, row.reservation_id, row.template_slug, 'expired'); continue; }
    const accommodation = db.prepare('SELECT * FROM accommodations WHERE id = ? AND organization_id = ?').get(row.accommodation_id, organizationId);
    const resolved = accommodation ? emailService.resolveAccommodationInheritance(accommodation, organizationId) : null;
    const settings = emailService.getEmailSettings(resolved, organizationId);
    const reservation = db.prepare('SELECT * FROM reservations WHERE id = ? AND organization_id = ?').get(row.reservation_id, organizationId);
    out.push({ ...row, missing: missingFor(row.template_slug, { settings, accommodation: resolved, organizationId, reservation }),
      // Os dados preenchem-se no alojamento principal (os quartos herdam-nos).
      settings_accommodation_id: accommodation?.parent_id || accommodation?.id || null,
      template_name: TEMPLATE_NAMES[row.template_slug] || row.template_slug, accommodation_name: settings.property_name || accommodation?.name || '' });
  }
  return out;
}

// Aviso com antecedência: alojamentos com reservas aceites para vir e emails
// que vão precisar de dados que ainda faltam.
function upcomingGaps(organizationId) {
  const today = require('./dates').localDay();
  const rows = db.prepare(`SELECT r.accommodation_id, COUNT(*) AS n, MIN(r.check_in) AS first FROM reservations r
    WHERE r.organization_id = ? AND r.status IN ('aguardar_pagamento', 'confirmada', 'check_in') AND r.check_out >= ?
    GROUP BY r.accommodation_id`).all(organizationId, today);
  const gaps = new Map();
  for (const row of rows) {
    const accommodation = db.prepare('SELECT * FROM accommodations WHERE id = ? AND organization_id = ?').get(row.accommodation_id, organizationId);
    if (!accommodation) continue;
    const root = accommodation.parent_id ? db.prepare('SELECT * FROM accommodations WHERE id = ? AND organization_id = ?').get(accommodation.parent_id, organizationId) || accommodation : accommodation;
    const { emails } = forAccommodation(organizationId, accommodation);
    const missing = [...new Map(emails.filter(e => e.slug !== 'reserva_aceite').flatMap(e => e.missing).map(m => [m.field, m])).values()];
    if (!missing.length) continue;
    const gap = gaps.get(root.id) || { accommodation_id: root.id, accommodation_name: root.name, reservations: 0, first: row.first, missing: new Map() };
    gap.reservations += row.n;
    if (row.first < gap.first) gap.first = row.first;
    for (const m of missing) gap.missing.set(m.field, m);
    gaps.set(root.id, gap);
  }
  return [...gaps.values()].map(g => ({ ...g, missing: [...g.missing.values()] }));
}

module.exports = { LABELS, GUEST_TEMPLATES, TEMPLATE_NAMES, missingFor, forAccommodation, hold, resolve, openHolds, upcomingGaps };
