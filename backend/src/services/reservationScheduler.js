const { db } = require('../config/database');

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
    const result = db.prepare(`
      UPDATE reservations
      SET status = 'cancelada',
          notes = COALESCE(notes || char(10), '') || '[Auto-cancelada por TTL — pendente >' || ? || 'h]',
          updated_at = datetime('now')
      WHERE status = 'pendente'
        AND channel != 'direto'
        AND (amount_paid IS NULL OR amount_paid = 0)
        AND datetime(created_at) < datetime('now', '-' || ? || ' hours')
    `).run(PENDING_TTL_HOURS, PENDING_TTL_HOURS);

    if (result.changes > 0) {
      console.log(`🧹 ${result.changes} reserva(s) pendente(s) expirada(s) por TTL`);
    }
    return result.changes;
  } catch (err) {
    console.error('Erro ao expirar reservas pendentes:', err.message);
    return 0;
  }
}

let timer = null;

function startScheduler() {
  if (timer) return;
  expirePendingReservations();
  timer = setInterval(expirePendingReservations, SCHEDULER_INTERVAL_MS);
  if (typeof timer.unref === 'function') timer.unref();
  console.log(`⏰ Reservation scheduler ativo (TTL ${PENDING_TTL_HOURS}h, cada ${Math.round(SCHEDULER_INTERVAL_MS / 60000)}min)`);
}

function stopScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = { expirePendingReservations, startScheduler, stopScheduler, PENDING_TTL_HOURS };
