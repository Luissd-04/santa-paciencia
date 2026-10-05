const { db } = require('../config/database');
const { syncReservationOperationalTasks } = require('./operationalTasksService');
const { deleteCalendarEvent } = require('./calendarService');
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
function expirePendingReservations() {
  try {
    const rows = db.prepare(`
      SELECT * FROM reservations
      WHERE status IN ('pendente', 'aguardar_pagamento', 'pre_reserva')
        AND channel = 'website'
        AND (amount_paid IS NULL OR amount_paid = 0)
        AND NOT EXISTS (SELECT 1 FROM stripe_payment_attempts sp
          WHERE sp.reservation_id=reservations.id AND sp.state IN ('creating','open','processing'))
        AND datetime(created_at) < datetime('now', '-' || ? || ' hours')
    `).all(PENDING_TTL_HOURS);

    if (!rows.length) return 0;

    const updateStmt = db.prepare(`
      UPDATE reservations
      SET status = 'cancelada',
          notes = COALESCE(notes || char(10), '') || '[Auto-cancelada por TTL — pendente >' || ? || 'h]',
          updated_at = datetime('now')
      WHERE id = ? AND organization_id = ?
        AND status IN ('pendente', 'aguardar_pagamento', 'pre_reserva')
        AND COALESCE(amount_paid, 0) = 0
        AND NOT EXISTS (SELECT 1 FROM stripe_payment_attempts sp
          WHERE sp.reservation_id=reservations.id AND sp.state IN ('creating','open','processing'))
    `);

    // Passar pelo mesmo caminho do cancelamento manual: apagar as tarefas
    // auto-geradas (check-in/checkout/limpeza) e o evento no Google Calendar —
    // este UPDATE em massa era o único ponto de cancelamento que não o fazia,
    // deixando tarefas "ativas" ligadas a reservas já canceladas.
    let expired = 0;
    for (const reservation of rows) {
      if (!updateStmt.run(PENDING_TTL_HOURS, reservation.id, reservation.organization_id).changes) continue;
      expired++;
      const cancelled = { ...reservation, status: 'cancelada' };
      syncReservationOperationalTasks(cancelled);
      deleteCalendarEvent(cancelled, {
        userId: cancelled.google_calendar_user_id,
        organizationId: cancelled.organization_id,
      }).catch(err => console.error('Erro ao remover evento de reserva expirada do Google Calendar:', err.message));
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
  try { await syncEnabledOrganizationsToGoogleTasks(); }
  catch (err) { console.error('Erro na reconciliação do Google Tasks:', err.message); }
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
    expirePendingReservations();
    retryPendingGoogleTaskDeletions();
  } catch { console.warn('Falha na manutenção das reservas; será repetida.'); }
  finally { maintenanceRunning = false; }
}

function startScheduler() {
  if (timer) return;
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
