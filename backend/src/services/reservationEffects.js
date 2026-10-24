// Lista única de «acontecimento → efeitos». Cada caminho que cria, paga ou
// cancela uma reserva emite um acontecimento (reservationEvents.emit); os
// emails ao hóspede e os avisos à equipa decidem-se só aqui.
//
// Acontecimentos e payload:
//   reservation.created    criada no backoffice
//   reservation.requested  pedido do site público { appUrl }
//   payment.received       { amount, source: 'manual' | 'stripe' | 'automatic' }
//   reservation.cancelled  { reason: 'staff' | 'guest' | 'ttl' | 'nonpayment', policy }
//   precheckin.submitted   { resubmission }
const { db } = require('../config/database');
const staff = require('./staffNotifier');

const CANCEL_REASONS = {
  staff: 'Cancelada pela equipa',
  guest: 'Cancelada pelo hóspede',
  ttl: 'Pedido expirado sem pagamento nem aprovação',
  nonpayment: 'Cancelada por falta de pagamento',
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
const summary = ({ reservation, guest, accommodation }) =>
  `${guest.name || 'Hóspede'} · ${accommodation.name || ''} · ${reservation.check_in} → ${reservation.check_out}`;
const backofficeUrl = (event, reservation) => {
  const origin = require('./publicOrigin').configuredOrigin() || event.payload.appUrl || '';
  return origin ? `${origin}/reservas?reserva=${encodeURIComponent(reservation.id)}` : '';
};

const HANDLERS = {
  guest_confirmation_email: (ctx) => require('./emailService').sendConfirmationEmail(ctx.guest, ctx.reservation, ctx.accommodation),
  guest_cancellation_email: (ctx) => require('./emailService').sendCancellationEmail(ctx.guest, ctx.reservation, ctx.accommodation),
  guest_payment_email: (ctx, event) => require('./emailService').sendPaymentConfirmationEmail(ctx.guest, ctx.reservation, ctx.accommodation, { amount: event.payload.amount }),

  staff_push_new: (ctx, event) => staff.push(event.organizationId, 'new_reservation', {
    title: '🆕 Nova reserva', body: summary(ctx), url: `/reservas?reserva=${ctx.reservation.id}`, excludeUserId: event.actorUserId,
  }),
  staff_push_new_request: (ctx, event) => staff.push(event.organizationId, 'new_reservation', {
    title: '🟠 Nova reserva pendente',
    body: `${summary(ctx)} · ${ctx.reservation.status === 'aguardar_pagamento' ? 'A aguardar pagamento' : 'Requer aprovação'}`,
    url: `/reservas?reserva=${ctx.reservation.id}`, requireInteraction: true, tag: `sp-new_reservation-${ctx.reservation.id}`,
  }),
  staff_email_new_request: (ctx, event) => require('./emailService').sendOwnerNewReservationEmail(
    event.organizationId, ctx.guest, ctx.reservation, ctx.accommodation, require('./publicOrigin').configuredOrigin() || event.payload.appUrl || ''),
  staff_push_payment: (ctx, event) => staff.push(event.organizationId, 'payment', {
    title: '💶 Pagamento recebido', body: `${money(event.payload.amount)} · ${summary(ctx)}`, url: `/reservas?reserva=${ctx.reservation.id}`,
  }),
  staff_push_cancelled: (ctx, event) => staff.push(event.organizationId, 'cancellation', {
    title: '❌ Reserva cancelada', body: `${summary(ctx)} · ${CANCEL_REASONS[event.payload.reason] || ''}`,
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
    title: event.payload.resubmission ? '📝 Pré-check-in alterado pelo hóspede' : '📝 Pré-check-in recebido',
    body: `${ctx.guest.name || 'Hóspede'} · entrada a ${ctx.reservation.check_in}`, url: `/reservas?reserva=${ctx.reservation.id}`,
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
