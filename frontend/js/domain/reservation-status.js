// Estados da reserva e do pagamento: rótulos, classes dos distintivos e cores,
// iguais em todos os ecrãs (lista, ficha, calendário, histórico e página do
// hóspede). Os valores antigos ainda guardados em reservas antigas são lidos
// como os atuais.
(() => {
const RESERVATION = {
  pre_reserva:        { label: 'Pré-reserva',          guestLabel: 'Pré-reserva',            badge: 'badge-prereserva', color: 'var(--roxo)' },
  pendente:           { label: 'Pendente',             guestLabel: 'Pedido pendente',        badge: 'badge-pendente',   color: 'var(--laranja)' },
  pre_checkin:        { label: 'Pré-check-in',         guestLabel: 'Pré-check-in pendente',  badge: 'badge-pendente',   color: 'var(--dourado)' },
  aguardar_pagamento: { label: 'A aguardar pagamento', guestLabel: 'A aguardar pagamento',   badge: 'badge-parcial',    color: 'var(--azul-claro)' },
  confirmada:         { label: 'Confirmada',           guestLabel: 'Reserva confirmada',     badge: 'badge-confirmada', color: 'var(--marca)' },
  check_in:           { label: 'Check-in',             guestLabel: 'Estadia em curso',       badge: 'badge-confirmada', color: 'var(--marca)' },
  check_out:          { label: 'Check-out',            guestLabel: 'Estadia concluída',      badge: 'badge-confirmada', color: 'var(--cinza)' },
  cancelada:          { label: 'Cancelada',            guestLabel: 'Reserva cancelada',      badge: 'badge-cancelada',  color: 'var(--vermelho)' },
};
const PAYMENT = {
  pendente:    { label: 'Não pago',    guestLabel: 'Pagamento pendente', badge: 'badge-pendpag' },
  parcial:     { label: 'Parcial',     guestLabel: 'Pagamento parcial',  badge: 'badge-parcial' },
  confirmado:  { label: 'Pago',        guestLabel: 'Pago',               badge: 'badge-pago' },
  reembolsado: { label: 'Reembolsado', guestLabel: 'Reembolsado',        badge: '' },
};
const LEGACY = { pago: 'confirmado', checkin: 'check_in', checked_in: 'check_in' };
// Estados que a equipa pode escolher, pela ordem do ciclo de vida.
const SELECTABLE = ['pre_reserva', 'pendente', 'aguardar_pagamento', 'pre_checkin', 'confirmada', 'check_in', 'check_out', 'cancelada'];

const normalize = value => LEGACY[value] || value;
const capitalize = value => value ? String(value).charAt(0).toUpperCase() + String(value).slice(1) : '—';
const reservation = value => RESERVATION[normalize(value)] || null;
const payment = value => PAYMENT[normalize(value)] || null;

window.ReservationStatus = Object.freeze({
  RESERVATION, PAYMENT, SELECTABLE, normalize,
  label: value => reservation(value)?.label || capitalize(value),
  guestLabel: value => reservation(value)?.guestLabel || capitalize(value),
  badge: value => reservation(value)?.badge || '',
  color: value => reservation(value)?.color || 'var(--cinza)',
  paymentLabel: value => payment(value)?.label || capitalize(value),
  paymentGuestLabel: value => payment(value)?.guestLabel || capitalize(value),
  paymentBadge: value => payment(value)?.badge || '',
  options: () => SELECTABLE.map(value => ({ v: value, l: RESERVATION[value].label })),
});
})();
