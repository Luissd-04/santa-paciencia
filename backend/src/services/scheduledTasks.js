// As tarefas automáticas do servidor, num só sítio: o que corre, de quanto em
// quanto tempo e com que nome aparece no «Estado do sistema». Todas passam pelo
// executor único (taskRunner), com reserva de execução e registo do resultado.
const runner = require('./taskRunner');

const MINUTE = 60000;
const fromEnv = (name, fallback, min = 10000) => Math.max(min, Number(process.env[name]) || fallback);

runner.register('maintenance', {
  label: 'Manutenção das reservas',
  intervalMs: fromEnv('PENDING_EXPIRY_INTERVAL_MS', 30 * MINUTE),
  run: () => require('./reservationScheduler').runMaintenance(),
});
runner.register('google_tasks', {
  label: 'Google Tasks',
  intervalMs: fromEnv('GOOGLE_TASKS_SYNC_INTERVAL_MS', MINUTE),
  run: () => require('../config/googleTasks').syncEnabledOrganizationsToGoogleTasks(),
});
runner.register('google_calendar', {
  label: 'Google Calendar (repetições)',
  intervalMs: fromEnv('GOOGLE_TASKS_SYNC_INTERVAL_MS', MINUTE),
  run: () => require('./calendarService').processAllCalendarQueues(),
});
runner.register('email', {
  label: 'Emails pela estadia',
  intervalMs: fromEnv('EMAIL_SCHEDULER_INTERVAL_MS', 60 * MINUTE),
  run: assertLease => require('./emailScheduler').runScheduler(assertLease),
});
runner.register('daily_summary', {
  label: 'Resumo diário (push)',
  intervalMs: fromEnv('PUSH_SUMMARY_INTERVAL_MS', 15 * MINUTE),
  run: () => require('./pushScheduler').sendDailySummaries(),
});

function start() {
  // Uma vez, no arranque: acerto dos estados migrados (20261025_reservation_states).
  try { require('./reservationLifecycle').reconcileLegacyStatuses(); }
  catch (error) { console.error('Acerto dos estados das reservas falhou:', error.message); }
  runner.start();
  console.log('⏰ Tarefas automáticas ativas (manutenção, Google, emails, resumo diário)');
}

module.exports = { start, stop: runner.stop, status: runner.status, runTask: runner.runTask };
