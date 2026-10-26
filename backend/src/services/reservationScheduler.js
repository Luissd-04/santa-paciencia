const { db } = require('../config/database');
const { processAllCalendarQueues } = require('./calendarService');
const { processAllQueuedTaskDeletions, syncEnabledOrganizationsToGoogleTasks } = require('../config/googleTasks');

// TTL em horas para reservas vindas do motor público (canal != 'direto') que
// nunca pagaram. Configurável via env.
const PENDING_TTL_HOURS = Number(process.env.PUBLIC_PENDING_TTL_HOURS) || 48;

// Intervalo entre passagens (ms). 30 minutos por defeito.
const SCHEDULER_INTERVAL_MS = Number(process.env.PENDING_EXPIRY_INTERVAL_MS) || 30 * 60 * 1000;

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

let timer = null;
let tasksTimer = null;
let tasksSyncRunning = false;
const TASKS_SYNC_INTERVAL_MS = Math.max(10000, Number(process.env.GOOGLE_TASKS_SYNC_INTERVAL_MS) || 60000);
async function reconcileGoogleTasks() {
  if (tasksSyncRunning) return;
  tasksSyncRunning = true;
  const { beat } = require('./opsStatus');
  try { await syncEnabledOrganizationsToGoogleTasks(); beat('google_tasks'); }
  catch (err) { beat('google_tasks', err); console.error('Erro na reconciliação do Google Tasks:', err.message); }
  // Repetições pendentes do Google Calendar (só as que já chegaram à hora).
  try { await processAllCalendarQueues(); beat('google_calendar_queue'); }
  catch (err) { beat('google_calendar_queue', err); console.error('Erro ao repetir a fila do Google Calendar:', err.message); }
  finally { tasksSyncRunning = false; }
}

function retryPendingGoogleTaskDeletions() {
  processAllQueuedTaskDeletions()
    .then(result => {
      if (result.deleted) console.log(`🗑️  ${result.deleted} tarefa(s) pendente(s) removida(s) do Google Tasks`);
    })
    .catch(err => console.error('Erro ao repetir eliminações do Google Tasks:', err.message));
}

let maintenanceRunning = false;
async function runMaintenance() {
  if (maintenanceRunning) return;
  maintenanceRunning = true;
  try {
    await require('./stripePayments').reconcileActiveCheckouts();
    await require('./paymentPolicyAutomation').runPolicyMaintenance();
    expirePendingReservations();
    // Efeitos de acontecimentos (emails, avisos) que falharam ou ficaram a meio.
    require('./reservationEvents').recoverInterrupted();
    await require('./reservationEvents').dispatchPending();
    retryPendingGoogleTaskDeletions();
    require('./opsStatus').beat('maintenance');
  } catch (err) { require('./opsStatus').beat('maintenance', err); console.warn('Falha na manutenção das reservas; será repetida.'); }
  finally { maintenanceRunning = false; }
}

function startScheduler() {
  if (timer) return;
  try { require('./reservationLifecycle').reconcileLegacyStatuses(); }
  catch (error) { console.error('Acerto dos estados das reservas falhou:', error.message); }
  runMaintenance();
  reconcileGoogleTasks();
  tasksTimer = setInterval(reconcileGoogleTasks, TASKS_SYNC_INTERVAL_MS);
  if (typeof tasksTimer.unref === 'function') tasksTimer.unref();
  timer = setInterval(runMaintenance, SCHEDULER_INTERVAL_MS);
  if (typeof timer.unref === 'function') timer.unref();
  console.log(`⏰ Reservation scheduler ativo (TTL ${PENDING_TTL_HOURS}h, cada ${Math.round(SCHEDULER_INTERVAL_MS / 60000)}min)`);
}

function stopScheduler() {
  if (tasksTimer) { clearInterval(tasksTimer); tasksTimer = null; }
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = {
  expirePendingReservations,
  retryPendingGoogleTaskDeletions,
  reconcileGoogleTasks,
  TASKS_SYNC_INTERVAL_MS,
  startScheduler,
  stopScheduler,
  PENDING_TTL_HOURS,
};
