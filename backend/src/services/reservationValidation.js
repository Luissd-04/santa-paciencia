const { normalizeDateValue } = require('./reservationRules');
const STATUSES = ['pre_reserva', 'pendente', 'pre_checkin', 'aguardar_pagamento', 'confirmada', 'check_in', 'check_out', 'cancelada'];
function validateReservationInput(body) {
  const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
  for (const key of ['total_amount', 'amount_paid']) if (body[key] !== undefined &&
    (body[key] === null || body[key] === '' || !Number.isFinite(Number(body[key])) || Number(body[key]) < 0 || Number(body[key]) > 10000000)) fail('Valor monetário inválido.');
  for (const key of ['num_guests', 'num_adults', 'num_children']) if (body[key] !== undefined &&
    (!Number.isInteger(Number(body[key])) || Number(body[key]) < (key === 'num_children' ? 0 : 1) || Number(body[key]) > 1000)) fail('Número de hóspedes inválido.');
  if (body.status !== undefined && !STATUSES.includes(body.status)) fail('Estado de reserva inválido.');
  if (body.payment_status !== undefined && !['pendente', 'parcial', 'confirmado', 'reembolsado'].includes(body.payment_status)) fail('Estado de pagamento inválido.');
  for (const key of ['check_in', 'check_out']) if (body[key] !== undefined && !normalizeDateValue(body[key])) fail('Data inválida.');
  if (body.guests_data !== undefined && (!Array.isArray(body.guests_data) || body.guests_data.length > 1000)) fail('Hóspedes inválidos.');
  if (body.nightly_prices !== undefined && (!Array.isArray(body.nightly_prices) || body.nightly_prices.length > 366 || body.nightly_prices.some(n => !normalizeDateValue(n?.date) || !Number.isFinite(Number(n.price)) || Number(n.price) < 0 || Number(n.price) > 10000000))) fail('Preços por noite inválidos.');
  for (const guest of [body.guest, ...(body.guests_data || [])]) if (guest) {
    if (typeof guest !== 'object' || Array.isArray(guest)) fail('Hóspede inválido.');
    for (const value of Object.values(guest)) if (typeof value === 'string' && value.length > 2000) fail('Dados de hóspede demasiado longos.');
    if (guest.birth_date && !normalizeDateValue(guest.birth_date)) fail('Data de nascimento inválida.');
  }
  if (typeof body.notes === 'string' && body.notes.length > 10000) fail('Notas demasiado longas.');
}
module.exports = { validateReservationInput, STATUSES };
