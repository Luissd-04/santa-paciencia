// Lista única de «acontecimento → efeitos». Cada caminho que cria, paga ou
// cancela uma reserva emite um acontecimento (reservationEvents.emit); os
// emails ao hóspede e os avisos à equipa decidem-se só aqui.
//
// Acontecimentos e payload:
//   reservation.created    criada no backoffice
//   reservation.requested  pedido do site público { appUrl }
//   payment.received       { amount, source: 'manual' | 'stripe' | 'automatic' }
//   reservation.cancelled  { reason: 'staff' | 'guest' | 'ttl' | 'nonpayment', policy }
//   reservation.approved   { precheckinUrl }
//   precheckin.submitted   { resubmission }
const { db } = require('../config/database');
const staff = require('./staffNotifier');

// Título do aviso de cancelamento à equipa (push e email), pelo motivo.
const CANCEL_REASONS = {
  staff: 'Reserva cancelada pela equipa',
  guest: 'Reserva cancelada pelo hóspede',
  ttl: 'Pedido expirado sem pagamento nem aprovação',
  nonpayment: 'Reserva cancelada por falta de pagamento',
};

function effectsFor(type, payload = {}) {
  switch (type) {
    case 'reservation.created': return ['guest_confirmation_email', 'staff_push_new'];
    case 'reservation.requested': return ['staff_email_new_request', 'staff_push_new_request'];
    // Decisões 1 e 3: o hóspede recebe o email em cada pagamento; a equipa é
    // avisada dos pagamentos que não registou ela própria.
    case 'payment.received': return ['guest_payment_email', ...(payload.source === 'manual' ? [] : ['staff_push_payment'])];
    // Decisão 4: cancelamentos que a equipa não fez chegam-lhe por push e email.
    // Com política, o aviso ao hóspede sai da automatização da política.
    case 'reservation.cancelled': return [
      ...(payload.reason === 'ttl' || !payload.policy ? ['guest_cancellation_email'] : []),
      'staff_push_cancelled',
      ...(payload.reason === 'staff' ? [] : ['staff_email_cancelled']),
    ];
    case 'reservation.approved': return ['guest_precheckin_email'];
    case 'precheckin.submitted': return ['staff_push_precheckin'];
    default: throw new Error(`Acontecimento de reserva desconhecido: ${type}`);
  }
}

function load(event) {
  const reservation = db.prepare('SELECT * FROM reservations WHERE id = ? AND organization_id = ?').get(event.reservationId, event.organizationId);
  if (!reservation) return null;
  const guest = db.prepare('SELECT * FROM guests WHERE id = ? AND organization_id = ?').get(reservation.guest_id, event.organizationId) || {};
  const accommodation = db.prepare('SELECT * FROM accommodations WHERE id = ? AND organization_id = ?').get(reservation.accommodation_id, event.organizationId) || {};
  return { reservation, guest, accommodation };
}

const money = value => require('./emailComposer').formatCurrency(Number(value) || 0);
// Texto dos avisos push: quem, onde e quando, com datas curtas («3 → 6 jul»).
const dates = require('./dates');
const guestName = ({ guest }) => guest.name || 'Hóspede';
const stay = ({ reservation }) => dates.shortRange(reservation.check_in, reservation.check_out);
const summary = ctx => [guestName(ctx), ctx.accommodation.name, stay(ctx)].filter(Boolean).join(' · ');
const nights = ({ reservation }) => {
  const n = Number(reservation.nights) || dates.daysBetween(reservation.check_in, reservation.check_out);
  return `${n} noite${n !== 1 ? 's' : ''}`;
};
const backofficeUrl = (event, reservation) => {
  const origin = require('./publicOrigin').configuredOrigin() || event.payload.appUrl || '';
  return origin ? `${origin}/reservas?reserva=${encodeURIComponent(reservation.id)}` : '';
};

const HANDLERS = {
  guest_confirmation_email: (ctx) => require('./emailService').sendConfirmationEmail(ctx.guest, ctx.reservation, ctx.accommodation),
  guest_cancellation_email: (ctx) => require('./emailService').sendCancellationEmail(ctx.guest, ctx.reservation, ctx.accommodation),
  guest_precheckin_email: (ctx, event) => require('./emailService').sendPreCheckinEmail(ctx.guest, ctx.reservation, ctx.accommodation, event.payload.precheckinUrl),
  guest_payment_email: (ctx, event) => require('./emailService').sendPaymentConfirmationEmail(ctx.guest, ctx.reservation, ctx.accommodation, { amount: event.payload.amount }),

  staff_push_new: (ctx, event) => staff.push(event.organizationId, 'new_reservation', {
    kind: 'reservation', title: ['Nova reserva', ctx.accommodation.name].filter(Boolean).join(' · '),
    body: `${guestName(ctx)} · ${stay(ctx)} · ${nights(ctx)}`, url: `/reservas?reserva=${ctx.reservation.id}`, excludeUserId: event.actorUserId,
  }),
  staff_push_new_request: (ctx, event) => staff.push(event.organizationId, 'new_reservation', {
    kind: 'request', title: ctx.reservation.status === 'aguardar_pagamento' ? 'Novo pedido · aguarda pagamento' : 'Novo pedido · aguarda aprovação',
    body: summary(ctx), url: `/reservas?reserva=${ctx.reservation.id}`, requireInteraction: true, tag: `sp-new_reservation-${ctx.reservation.id}`,
  }),
  staff_email_new_request: (ctx, event) => require('./emailService').sendOwnerNewReservationEmail(
    event.organizationId, ctx.guest, ctx.reservation, ctx.accommodation, require('./publicOrigin').configuredOrigin() || event.payload.appUrl || ''),
  staff_push_payment: (ctx, event) => staff.push(event.organizationId, 'payment', {
    kind: 'payment', title: `Pagamento recebido · ${money(event.payload.amount)}`, body: summary(ctx), url: `/reservas?reserva=${ctx.reservation.id}`,
  }),
  staff_push_cancelled: (ctx, event) => staff.push(event.organizationId, 'cancellation', {
    kind: 'cancellation', title: CANCEL_REASONS[event.payload.reason] || 'Reserva cancelada', body: summary(ctx),
    url: `/reservas?reserva=${ctx.reservation.id}`, excludeUserId: event.actorUserId,
  }),
  staff_email_cancelled: (ctx, event) => staff.email(event.organizationId, {
    subject: `Reserva cancelada — ${ctx.guest.name || 'Hóspede'} · ${ctx.reservation.id}`,
    title: CANCEL_REASONS[event.payload.reason] || 'Reserva cancelada',
    accommodation: ctx.accommodation,
    rows: [
      { label: 'Referência', value: ctx.reservation.id },
      { label: 'Hóspede', value: ctx.guest.name || '' },
      { label: 'Alojamento', value: ctx.accommodation.name || '' },
      { label: 'Check-in', value: ctx.reservation.check_in },
      { label: 'Check-out', value: ctx.reservation.check_out },
      { label: 'Pago', value: money(ctx.reservation.amount_paid) },
    ],
    url: backofficeUrl(event, ctx.reservation),
  }),
  staff_push_precheckin: (ctx, event) => staff.push(event.organizationId, 'precheckin', {
    kind: 'precheckin', title: event.payload.resubmission ? 'Pré-check-in alterado pelo hóspede' : 'Pré-check-in recebido',
    body: [guestName(ctx), ctx.accommodation.name, `entrada a ${dates.shortDate(ctx.reservation.check_in)}`].filter(Boolean).join(' · '),
    url: `/reservas?reserva=${ctx.reservation.id}`,
  }),
};

async function runEffect(effect, event) {
  const handler = HANDLERS[effect];
  if (!handler) throw new Error(`Efeito desconhecido: ${effect}`);
  const ctx = load(event);
  if (!ctx) return; // reserva apagada entretanto
  await handler(ctx, event);
}

module.exports = { effectsFor, runEffect, CANCEL_REASONS };
