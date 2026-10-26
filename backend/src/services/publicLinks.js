// Links públicos enviados aos hóspedes e à equipa, e os tokens que os
// protegem. Todos os emails, a Stripe e os avisos usam estas funções em vez de
// montar o URL à mão.
const { randomBytes } = require('crypto');
const { configuredOrigin } = require('./publicOrigin');

// Origem configurada (PUBLIC_APP_URL). Em produção é obrigatória: um link para
// localhost num email seria inútil para o hóspede.
function origin() {
  const configured = configuredOrigin();
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') throw new Error('PUBLIC_APP_URL é obrigatório em produção.');
  return 'http://localhost:3001';
}

// Token de 256 bits em hexadecimal (formato validado pelas rotas públicas).
const newToken = () => randomBytes(32).toString('hex');

const absoluteUrl = path => `${origin()}${String(path).startsWith('/') ? '' : '/'}${path}`;
const reservationPageUrl = reservation => reservation?.public_token ? absoluteUrl(`/reserva/${reservation.public_token}`) : '';
const precheckinUrl = reservation => reservation?.precheckin_token ? absoluteUrl(`/pre-checkin/${encodeURIComponent(reservation.precheckin_token)}`) : '';
const backofficeReservationUrl = id => absoluteUrl(`/reservas?reserva=${encodeURIComponent(id)}`);

module.exports = { origin, newToken, absoluteUrl, reservationPageUrl, precheckinUrl, backofficeReservationUrl };
