const { db } = require('../config/database');
const { queueReservationTaskCleanup } = require('./operationalTasksService');
const { detachReservationEvent, detachOperationalEvent } = require('./calendarService');

// Eliminação definitiva de reservas, partilhada pela ficha da reserva e pela
// remoção de hóspedes/alojamentos. Reservas com tentativas Stripe ou com
// movimentos de pagamento nunca são apagadas; o histórico das restantes sai
// aqui. Chamar dentro de uma transação.
function purgeReservations(organizationId, reservationIds) {
  if (!reservationIds.length) return 0;
  const marks = reservationIds.map(() => '?').join(',');
  if (db.prepare(`SELECT 1 FROM stripe_payment_attempts WHERE organization_id = ? AND reservation_id IN (${marks}) LIMIT 1`)
    .get(organizationId, ...reservationIds)) {
    throw Object.assign(new Error('Reservas com tentativas Stripe devem ser conservadas para reconciliação e reembolsos.'), { status: 409 });
  }
  // Movimentos de pagamento são registo financeiro: uma reserva com qualquer
  // movimento (mesmo com saldo zero) é conservada.
  if (db.prepare(`SELECT 1 FROM reservation_payments WHERE organization_id = ? AND reservation_id IN (${marks}) LIMIT 1`)
    .get(organizationId, ...reservationIds)) {
    throw Object.assign(new Error(reservationIds.length === 1
      ? 'Esta reserva tem movimentos de pagamento registados e é conservada como registo financeiro.'
      : 'Há reservas canceladas com movimentos de pagamento registados; são conservadas como registo financeiro.'), { status: 409 });
  }
  for (const id of reservationIds) {
    // A fila é gravada antes dos eventos locais: os IDs externos sobrevivem
    // mesmo quando o Google está temporariamente em erro.
    queueReservationTaskCleanup(organizationId, id);
    detachReservationEvent(organizationId, id);
    for (const row of db.prepare('SELECT * FROM operational_events WHERE reservation_id = ? AND organization_id = ? AND google_event_id IS NOT NULL').all(id, organizationId)) {
      detachOperationalEvent(row);
    }
    for (const table of ['reservation_payments', 'operational_events', 'reservation_history']) {
      db.prepare(`DELETE FROM ${table} WHERE reservation_id = ? AND organization_id = ?`).run(id, organizationId);
    }
    db.prepare('DELETE FROM reservations WHERE id = ? AND organization_id = ?').run(id, organizationId);
  }
  return reservationIds.length;
}

module.exports = { purgeReservations };
