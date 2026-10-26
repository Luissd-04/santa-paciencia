// Manutenção das reservas (de 30 em 30 minutos, pelo executor de tarefas
// automáticas: scheduledTasks.js).
const { db } = require('../config/database');
const { processAllQueuedTaskDeletions } = require('../config/googleTasks');

// TTL em horas para reservas vindas do motor público (canal != 'direto') que
// nunca pagaram. Configurável via env.
const PENDING_TTL_HOURS = Number(process.env.PUBLIC_PENDING_TTL_HOURS) || 48;

/**
 * Marca como `cancelada` qualquer reserva vinda do motor público que continue
 * `pendente` há mais de PENDING_TTL_HOURS e nunca tenha recebido qualquer
 * pagamento. Liberta as datas para outros hóspedes — sem isto, um atacante
 * pode bloquear fins-de-semana inteiros sem custo (S3 da auditoria).
 */
// Só pedidos que a equipa nunca aceitou: uma reserva aprovada (ou a quem foi
// enviado o pré-check-in) deixou de ser um bloqueio especulativo de datas.
// O hóspede preencher o pré-check-in de um pedido por aprovar não conta.
// (Antes de precheckin_sent_at, o envio ficava só no histórico.)
const NEVER_PROGRESSED_SQL = `reservations.precheckin_sent_at IS NULL AND NOT EXISTS (SELECT 1 FROM reservation_history h
          WHERE h.reservation_id = reservations.id AND h.organization_id = reservations.organization_id
            AND (h.action = 'approved' OR CASE WHEN json_valid(h.meta) THEN json_extract(h.meta, '$.source') END = 'send_precheckin'))`;

function expirePendingReservations() {
  try {
    const rows = db.prepare(`
      SELECT * FROM reservations
      WHERE status IN ('pendente', 'aguardar_pagamento', 'pre_reserva')
        AND channel = 'website'
        AND (amount_paid IS NULL OR amount_paid = 0)
        AND NOT EXISTS (SELECT 1 FROM stripe_payment_attempts sp
          WHERE sp.reservation_id=reservations.id AND sp.state IN ('creating','open','processing'))
        AND ${NEVER_PROGRESSED_SQL}
        AND datetime(created_at) < datetime('now', '-' || ? || ' hours')
    `).all(PENDING_TTL_HOURS);

    if (!rows.length) return 0;

    // Revalidar dentro da transação: entretanto pode ter chegado um pagamento,
    // uma aprovação ou uma tentativa Stripe.
    const stillExpired = db.prepare(`
      SELECT * FROM reservations WHERE id = ? AND organization_id = ?
        AND status IN ('pendente', 'aguardar_pagamento', 'pre_reserva')
        AND COALESCE(amount_paid, 0) = 0
        AND NOT EXISTS (SELECT 1 FROM stripe_payment_attempts sp
          WHERE sp.reservation_id=reservations.id AND sp.state IN ('creating','open','processing'))
        AND ${NEVER_PROGRESSED_SQL}
    `);
    const { markCancelled, afterCancel } = require('./reservationLifecycle');

    // Passar pelo mesmo caminho do cancelamento manual: apagar as tarefas
    // auto-geradas (check-in/checkout/limpeza) e o evento no Google Calendar —
    // este UPDATE em massa era o único ponto de cancelamento que não o fazia,
    // deixando tarefas "ativas" ligadas a reservas já canceladas.
    let expired = 0;
    for (const reservation of rows) {
      const changed = db.transaction(() => {
        const current = stillExpired.get(reservation.id, reservation.organization_id);
        return Boolean(current) && markCancelled(current, { reason: 'ttl', meta: { hours: PENDING_TTL_HOURS },
          note: `[Auto-cancelada por TTL — pendente >${PENDING_TTL_HOURS}h]` });
      }).immediate();
      if (!changed) continue;
      expired++;
      afterCancel(reservation.organization_id, reservation.id);
    }

    console.log(`🧹 ${expired} reserva(s) pendente(s) expirada(s) por TTL`);
    return expired;
  } catch (err) {
    console.error('Erro ao expirar reservas pendentes:', err.message);
    return 0;
  }
}

function retryPendingGoogleTaskDeletions() {
  return processAllQueuedTaskDeletions()
    .then(result => {
      if (result.deleted) console.log(`🗑️  ${result.deleted} tarefa(s) pendente(s) removida(s) do Google Tasks`);
    })
    .catch(err => console.error('Erro ao repetir eliminações do Google Tasks:', err.message));
}

// Uma passagem: pagamentos Stripe em aberto, política de pagamento, pedidos
// expirados, efeitos de acontecimentos (emails, avisos) que falharam ou ficaram
// a meio e eliminações pendentes no Google Tasks. Um erro fica no estado da
// tarefa e a passagem seguinte repete.
async function runMaintenance() {
  await require('./stripePayments').reconcileActiveCheckouts();
  await require('./paymentPolicyAutomation').runPolicyMaintenance();
  expirePendingReservations();
  require('./reservationEvents').recoverInterrupted();
  await require('./reservationEvents').dispatchPending();
  await retryPendingGoogleTaskDeletions();
}

module.exports = {
  expirePendingReservations,
  retryPendingGoogleTaskDeletions,
  runMaintenance,
  PENDING_TTL_HOURS,
};
