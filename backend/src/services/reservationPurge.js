const { db } = require('../config/database');
const { queueReservationTaskCleanup } = require('./operationalTasksService');

// Eliminação definitiva de reservas, partilhada pela ficha da reserva e pela
// remoção de hóspedes/alojamentos. Pagamentos e histórico não têm chave
// estrangeira, por isso têm de sair aqui; tentativas Stripe ficam sempre
// conservadas para reconciliação e reembolsos. Chamar dentro de uma transação.
function purgeReservations(organizationId, reservationIds) {
  if (!reservationIds.length) return 0;
  const marks = reservationIds.map(() => '?').join(',');
  if (db.prepare(`SELECT 1 FROM stripe_payment_attempts WHERE organization_id = ? AND reservation_id IN (${marks}) LIMIT 1`)
    .get(organizationId, ...reservationIds)) {
    throw Object.assign(new Error('Reservas com tentativas Stripe devem ser conservadas para reconciliação e reembolsos.'), { status: 409 });
  }
  for (const id of reservationIds) {
    // A fila é gravada antes dos eventos locais: os IDs externos sobrevivem
    // mesmo quando o Google está temporariamente em erro.
    queueReservationTaskCleanup(organizationId, id);
    for (const table of ['reservation_payments', 'operational_events', 'reservation_history']) {
      db.prepare(`DELETE FROM ${table} WHERE reservation_id = ? AND organization_id = ?`).run(id, organizationId);
    }
    db.prepare('DELETE FROM reservations WHERE id = ? AND organization_id = ?').run(id, organizationId);
  }
  return reservationIds.length;
}

module.exports = { purgeReservations };
