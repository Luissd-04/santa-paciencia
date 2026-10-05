const { db } = require('../config/database');
const ACTIVE_SQL = "state IN ('creating', 'open', 'processing')";
function activeCheckout(reservationId) {
  return db.prepare(`SELECT * FROM stripe_payment_attempts WHERE reservation_id = ? AND ${ACTIVE_SQL}`).get(reservationId);
}
function assertNoActiveCheckout(reservationId) {
  if (activeCheckout(reservationId)) throw Object.assign(new Error('Existe um pagamento online em curso. Aguarde a conclusão ou o fim da sessão antes de alterar a reserva.'), { status: 409 });
}
module.exports = { activeCheckout, assertNoActiveCheckout, ACTIVE_SQL };
