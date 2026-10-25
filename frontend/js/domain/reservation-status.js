// Os três estados de uma reserva (reserva, pagamento e pré-check-in): rótulos,
// classes dos distintivos e cores, iguais em todos os ecrãs (lista, ficha,
// calendário, histórico e página do hóspede). As regras (que passos se podem
// dar) são do servidor, que envia as opções em `status_options`. Os valores
// antigos ainda guardados (ex.: no histórico) são lidos como os atuais.
(() => {
const RESERVATION = {
  pre_reserva:        { label: 'Pré-reserva',          guestLabel: 'Pré-reserva',            badge: 'badge-prereserva', color: 'var(--roxo)' },
  pendente:           { label: 'Pendente',             guestLabel: 'Pedido pendente',        badge: 'badge-pendente',   color: 'var(--laranja)' },
  aguardar_pagamento: { label: 'Aguarda sinal',        guestLabel: 'A aguardar o sinal',     badge: 'badge-parcial',    color: 'var(--azul-claro)' },
  confirmada:         { label: 'Confirmada',           guestLabel: 'Reserva confirmada',     badge: 'badge-confirmada', color: 'var(--marca)' },
  check_in:           { label: 'Check-in',             guestLabel: 'Estadia em curso',       badge: 'badge-confirmada', color: 'var(--marca)' },
  check_out:          { label: 'Check-out',            guestLabel: 'Estadia concluída',      badge: 'badge-confirmada', color: 'var(--cinza)' },
  // Até 25/10/2026 o pré-check-in era um estado da reserva; só aparece no histórico.
  pre_checkin:        { label: 'Pré-check-in (antigo)', guestLabel: 'A sua reserva',          badge: 'badge-pendente',   color: 'var(--dourado)' },
  cancelada:          { label: 'Cancelada',            guestLabel: 'Reserva cancelada',      badge: 'badge-cancelada',  color: 'var(--vermelho)' },
};
const PAYMENT = {
  pendente:    { label: 'Não pago',    guestLabel: 'Pagamento pendente', badge: 'badge-pendpag' },
  parcial:     { label: 'Parcial',     guestLabel: 'Pagamento parcial',  badge: 'badge-parcial' },
  confirmado:  { label: 'Pago',        guestLabel: 'Pago',               badge: 'badge-pago' },
  reembolsado: { label: 'Reembolsado', guestLabel: 'Reembolsado',        badge: '' },
};
const PRECHECKIN = {
  nao_enviado: { label: 'Não enviado', badge: 'badge-pendpag' },
  enviado:     { label: 'Enviado',     badge: 'badge-pendente' },
  preenchido:  { label: 'Preenchido',  badge: 'badge-confirmada' },
};
const LEGACY = { pago: 'confirmado', checkin: 'check_in', checked_in: 'check_in' };
// Estados da reserva, pela ordem do ciclo de vida (filtros e legendas).
const SELECTABLE = ['pre_reserva', 'pendente', 'aguardar_pagamento', 'confirmada', 'check_in', 'check_out', 'cancelada'];

const normalize = value => LEGACY[value] || value;
const capitalize = value => value ? String(value).charAt(0).toUpperCase() + String(value).slice(1) : '—';
const reservation = value => RESERVATION[normalize(value)] || null;
const payment = value => PAYMENT[normalize(value)] || null;
const label = value => reservation(value)?.label || capitalize(value);

// Preenche um seletor de estado com as opções que o servidor devolveu.
function fillSelect(select, values, current) {
  if (!select) return;
  const list = Array.isArray(values) && values.length ? values : [current].filter(Boolean);
  select.innerHTML = list.map(value => `<option value="${value}">${label(value)}</option>`).join('');
  select.value = list.includes(current) ? current : list[0] || '';
}

window.ReservationStatus = Object.freeze({
  RESERVATION, PAYMENT, PRECHECKIN, SELECTABLE, normalize, label, fillSelect,
  guestLabel: value => reservation(value)?.guestLabel || capitalize(value),
  badge: value => reservation(value)?.badge || '',
  color: value => reservation(value)?.color || 'var(--cinza)',
  paymentLabel: value => payment(value)?.label || capitalize(value),
  paymentGuestLabel: value => payment(value)?.guestLabel || capitalize(value),
  paymentBadge: value => payment(value)?.badge || '',
  precheckinLabel: value => PRECHECKIN[value]?.label || '—',
  precheckinBadge: value => PRECHECKIN[value]?.badge || '',
  options: () => SELECTABLE.map(value => ({ v: value, l: RESERVATION[value].label })),
});
})();
