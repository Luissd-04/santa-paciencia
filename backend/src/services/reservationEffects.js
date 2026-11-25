// Lista única de «acontecimento → efeitos». Cada caminho que cria, paga ou
// cancela uma reserva emite um acontecimento (reservationEvents.emit); os
// emails ao hóspede e os avisos à equipa decidem-se só aqui.
//
// Acontecimentos e payload:
//   reservation.created    criada no backoffice
//   reservation.requested  pedido do site público { appUrl }
//   payment.received       { amount, source: 'manual' | 'stripe' | 'automatic' }
//   payment.failed         { reason: 'failed' | 'expired' }   pagamento online que não se concluiu
//   payment.refunded       { amount, partial }                 reembolso confirmado pela Stripe
//   payment.review         pagamento online a rever à mão
//   payment.after_cancellation  { amount }   pagamento online que entrou numa reserva já cancelada
//   reservation.changed    { before: { check_in, check_out, total }, deadline }  datas ou total alterados com pagamento feito
//   reservation.cancelled  { reason: 'staff' | 'guest' | 'ttl' | 'nonpayment' | 'deposit', policy, refusedRequest? }
//   reservation.approved   { precheckinUrl }
//   precheckin.submitted   { resubmission }
//   reservation.expiring   { kind: 'request' | 'payment', deadline }  pedido ou pagamento a expirar dentro de 12 h (pré-aviso)
//   email.due              modelo agendado pela estadia já na hora { slug, key }
//   policy.notice_due      aviso da política { kind: 'balance' | 'cancelled', key }
const { db } = require('../config/database');
const staff = require('./staffNotifier');

// Título do aviso de cancelamento à equipa (push e email), pelo motivo.
const CANCEL_REASONS = {
  staff: 'Reserva cancelada pela equipa',
  guest: 'Reserva cancelada pelo hóspede',
  ttl: 'Pedido expirado sem pagamento nem aprovação',
  nonpayment: 'Reserva cancelada por falta de pagamento',
  deposit: 'Sinal não pago no prazo',
};

function effectsFor(type, payload = {}) {
  switch (type) {
    case 'reservation.created': return ['guest_confirmation_email', 'staff_push_new'];
    case 'reservation.requested': return ['guest_confirmation_email', 'staff_email_new_request', 'staff_push_new_request'];
    // O hóspede recebe o email em cada pagamento. Proprietário e gestores
    // recebem push, email e entrada no sino (também nos registados à mão por
    // outra pessoa; quem registou não é avisado). O funcionário não recebe
    // valores de dinheiro: nem push, nem email, nem sino.
    case 'payment.received': return ['guest_payment_email', 'staff_push_payment', 'staff_email_payment'];
    // Problemas de pagamento online: push e sino para proprietário e gestores,
    // email só ao proprietário.
    case 'payment.failed': case 'payment.refunded': case 'payment.review':
      return ['staff_push_payment_issue', 'staff_email_payment_issue'];
    // Decisão 4: cancelamentos que a equipa não fez chegam-lhe por push e email.
    // Com política, o aviso ao hóspede sai da automatização da política.
    case 'reservation.cancelled': return [
      ...(['ttl', 'deposit'].includes(payload.reason) || !payload.policy ? ['guest_cancellation_email'] : []),
      'staff_push_cancelled',
      ...(payload.reason === 'staff' ? [] : ['staff_email_cancelled']),
    ];
    // Pré-aviso do prazo: só push, só proprietário e gestores, uma vez por reserva e prazo.
    case 'reservation.expiring': return ['staff_push_expiring'];
    case 'reservation.approved': return ['guest_accepted_email'];
    // O hóspede fica a saber que o alojamento vai tratar do reembolso.
    case 'payment.after_cancellation': return ['guest_payment_after_cancellation_email'];
    case 'reservation.changed': return ['guest_changed_email'];
    case 'precheckin.submitted': return ['staff_push_precheckin'];
    case 'email.due': return ['guest_template_email'];
    case 'policy.notice_due': return ['guest_policy_notice'];
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
// Reembolso contratado pela política (cancelamento com política de pagamento).
const refundOf = reservation => {
  try {
    const cancellation = reservation.policy_cancellation_json && JSON.parse(reservation.policy_cancellation_json);
    return cancellation ? money(cancellation.refundCents / 100) : '';
  } catch { return ''; }
};
const backofficeUrl = (event, reservation) => {
  const origin = require('./publicOrigin').configuredOrigin() || event.payload.appUrl || '';
  return origin ? `${origin}/reservas?reserva=${encodeURIComponent(reservation.id)}` : '';
};

// Aviso à equipa de uma reserva cancelada (também usado pelos exemplos).
function staffCancelledMessage(ctx, reason, url) {
  return {
    subject: `Reserva cancelada — ${ctx.guest.name || 'Hóspede'} · ${ctx.reservation.id}`,
    eyebrow: CANCEL_REASONS[reason] || 'Reserva cancelada', tone: 'muted',
    headline: `${guestName(ctx)} · ${stay(ctx)}`,
    accommodation: ctx.accommodation,
    rows: [
      { label: 'Alojamento', value: ctx.accommodation.name || '' },
      { label: 'Pago', value: money(ctx.reservation.amount_paid) },
      { label: 'A devolver', value: refundOf(ctx.reservation) },
      { label: 'Referência', value: ctx.reservation.id },
    ],
    note: { tone: 'ok', heading: 'As datas ficaram livres', html: require('./emailComposer').escapeHtml(`O calendário já mostra ${ctx.accommodation.name || 'o alojamento'} disponível nessas datas (${stay(ctx)}).`) },
    url,
  };
}

// Todos os emails ao hóspede passam por aqui. Um envio que tem de esperar
// (janela do modelo, Gmail indisponível, envio anterior por confirmar) volta
// à fila para essa hora; depois de a estadia acabar, desiste-se em silêncio.
async function guestEmail(ctx, send) {
  const result = await send(require('./emailService'));
  // Retido por faltarem dados do alojamento: fica no sino, não se repete sozinho.
  if (result?.held || !result?.queued) return;
  if (ctx.reservation.check_out < dates.localDay(new Date(), -1)) return;
  const { DeferEffect } = require('./reservationEvents');
  const reasons = { window: 'Fora da janela de envio do modelo', blocked: 'Gmail indisponível', uncertain: 'Envio anterior por confirmar no Gmail', sending: 'Envio em curso' };
  throw new DeferEffect(result.until || new Date(Date.now() + 3600000), reasons[result.delivery_status] || 'Envio adiado');
}

// Texto dos problemas de pagamento (push, email e sino), sem jargão.
function paymentIssueText(type, payload = {}) {
  if (type === 'payment.failed') {
    return payload.reason === 'expired'
      ? { title: 'Pagamento online não concluído', body: 'O hóspede não chegou a pagar e a ligação de pagamento expirou.' }
      : { title: 'Pagamento online falhou', body: 'O cartão foi recusado ou o pagamento não passou. Fale com o hóspede ou envie nova ligação.' };
  }
  if (type === 'payment.refunded') {
    return { title: `${payload.partial ? 'Reembolso parcial' : 'Reembolso'} · ${money(payload.amount)}`,
      body: payload.partial ? 'Foi devolvida parte do pagamento ao hóspede.' : 'O pagamento foi devolvido ao hóspede.' };
  }
  return { title: 'Pagamento a rever', body: 'Recebeu um pagamento que precisa de confirmação sua. Abra a reserva e veja os movimentos.' };
}

function paymentMessage(ctx, url) {
  const { reservation } = ctx;
  const due = Math.max(0, (Number(reservation.total_amount) || 0) - (Number(reservation.amount_paid) || 0));
  return (event) => ({
    subject: `Pagamento recebido — ${guestName(ctx)} · ${reservation.id}`,
    eyebrow: 'Pagamento recebido', tone: 'ok',
    headline: `${money(event.payload.amount)} · ${guestName(ctx)}`,
    accommodation: ctx.accommodation,
    rows: [
      { label: 'Alojamento', value: ctx.accommodation.name || '' },
      { label: 'Datas', value: stay(ctx) },
      { label: 'Pago até agora', value: money(reservation.amount_paid) },
      { label: 'Em falta', value: due > 0 ? money(due) : 'Nada — está tudo pago' },
      { label: 'Referência', value: reservation.id },
    ],
    url,
  });
}

const HANDLERS = {
  guest_confirmation_email: (ctx) => guestEmail(ctx, mail => mail.sendConfirmationEmail(ctx.guest, ctx.reservation, ctx.accommodation)),
  guest_cancellation_email: (ctx, event) => guestEmail(ctx, mail => mail.sendCancellationEmail(ctx.guest, ctx.reservation, ctx.accommodation, event.payload.refusedRequest ? 'refused' : event.payload.reason)),
  guest_accepted_email: (ctx, event) => guestEmail(ctx, mail => mail.sendReservationAcceptedEmail(ctx.guest, ctx.reservation, ctx.accommodation, event.payload.precheckinUrl)),
  guest_precheckin_email: (ctx, event) => guestEmail(ctx, mail => mail.sendPreCheckinEmail(ctx.guest, ctx.reservation, ctx.accommodation, event.payload.precheckinUrl)),
  guest_payment_email: (ctx, event) => guestEmail(ctx, mail => mail.sendPaymentConfirmationEmail(ctx.guest, ctx.reservation, ctx.accommodation, { amount: event.payload.amount })),
  guest_payment_after_cancellation_email: (ctx, event) => guestEmail(ctx, mail => mail.sendTemplatedEmail('cancelamento', ctx.guest, ctx.reservation, ctx.accommodation,
    { motivo_cancelamento: 'payment_after', valor_pagamento: money(event.payload.amount) })),
  guest_changed_email: (ctx, event) => guestEmail(ctx, mail => mail.sendReservationChangedEmail(ctx.guest, ctx.reservation, ctx.accommodation, event.payload)),
  guest_template_email: (ctx, event) => guestEmail(ctx, mail => mail.sendTemplatedEmail(event.payload.slug, ctx.guest, ctx.reservation, ctx.accommodation)),
  // O prazo do restante só começa com o aviso entregue: um aviso por enviar é
  // uma falha (repetida e, ao fim das tentativas, no sino), não um êxito.
  guest_policy_notice: async (ctx, event) => {
    const result = await require('./paymentPolicyAutomation').sendNotice(ctx.reservation, event.payload.kind);
    if (result !== 'retry') return;
    // Envios desligados de propósito (EMAIL_ENABLED=false): esperar, não falhar.
    if (require('./emailService').emailDisabled()) {
      throw new (require('./reservationEvents').DeferEffect)(new Date(Date.now() + 3600000), 'Envio de emails desligado');
    }
    throw new Error(event.payload.kind === 'cancelled' ? 'Aviso de cancelamento por enviar' : 'Aviso do restante por enviar');
  },

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
    tag: `sp-payment-${ctx.reservation.id}`, roles: ['owner', 'manager'], excludeUserId: event.actorUserId,
  }),
  staff_email_payment: (ctx, event) => staff.email(event.organizationId, paymentMessage(ctx, backofficeUrl(event, ctx.reservation))(event),
    { excludeUserId: event.actorUserId }),
  staff_push_payment_issue: (ctx, event) => {
    const text = paymentIssueText(event.type, event.payload);
    return staff.push(event.organizationId, 'payment', {
      kind: 'payment', title: text.title, body: `${summary(ctx)} · ${text.body}`, url: `/reservas?reserva=${ctx.reservation.id}`,
      tag: `sp-payment-issue-${ctx.reservation.id}`, requireInteraction: true, roles: ['owner', 'manager'],
    });
  },
  staff_email_payment_issue: (ctx, event) => {
    const text = paymentIssueText(event.type, event.payload);
    return staff.email(event.organizationId, {
      subject: `${text.title} — ${guestName(ctx)} · ${ctx.reservation.id}`, eyebrow: 'Pagamento', tone: 'warn',
      headline: `${guestName(ctx)} · ${stay(ctx)}`, accommodation: ctx.accommodation,
      rows: [{ label: 'Alojamento', value: ctx.accommodation.name || '' }, { label: 'Referência', value: ctx.reservation.id }],
      note: { tone: 'warn', heading: text.title, html: require('./emailComposer').escapeHtml(text.body) },
      url: backofficeUrl(event, ctx.reservation),
    }, { ownerOnly: true });
  },
  staff_push_cancelled: (ctx, event) => staff.push(event.organizationId, 'cancellation', {
    kind: 'cancellation', title: CANCEL_REASONS[event.payload.reason] || 'Reserva cancelada', body: summary(ctx),
    url: `/reservas?reserva=${ctx.reservation.id}`, excludeUserId: event.actorUserId, tag: `sp-cancellation-${ctx.reservation.id}`,
  }),
  staff_email_cancelled: (ctx, event) => staff.email(event.organizationId, staffCancelledMessage(ctx, event.payload.reason, backofficeUrl(event, ctx.reservation))),
  staff_push_expiring: (ctx, event) => {
    const hours = Math.max(1, Math.ceil((Date.parse(event.payload.deadline) - Date.now()) / 3600000));
    const request = event.payload.kind === 'request';
    return staff.push(event.organizationId, request ? 'new_reservation' : 'payment', {
      kind: request ? 'request' : 'payment', title: `${request ? 'Pedido' : 'Pagamento'} expira em ${hours} h`,
      body: `${summary(ctx)}${request ? ' · aceite ou recuse' : ''}`, url: `/reservas?reserva=${ctx.reservation.id}`,
      tag: `sp-expiring-${ctx.reservation.id}`, requireInteraction: true, roles: ['owner', 'manager'],
    });
  },
  staff_push_precheckin: (ctx, event) => staff.push(event.organizationId, 'precheckin', {
    kind: 'precheckin', title: event.payload.resubmission ? 'Pré-check-in alterado pelo hóspede' : 'Pré-check-in recebido',
    body: [guestName(ctx), ctx.accommodation.name, `entrada a ${dates.shortDate(ctx.reservation.check_in)}`].filter(Boolean).join(' · '),
    url: `/reservas?reserva=${ctx.reservation.id}`, tag: `sp-precheckin-${ctx.reservation.id}`,
  }),
};

async function runEffect(effect, event) {
  const handler = HANDLERS[effect];
  if (!handler) throw new Error(`Efeito desconhecido: ${effect}`);
  const ctx = load(event);
  if (!ctx) return; // reserva apagada entretanto
  await handler(ctx, event);
}

module.exports = { effectsFor, runEffect, paymentIssueText, staffCancelledMessage, CANCEL_REASONS };
