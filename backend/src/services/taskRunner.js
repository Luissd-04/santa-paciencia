// Executor único das tarefas automáticas (lista em scheduledTasks.js). Cada
// tarefa corre de x em x tempo com reserva de execução (scheduler_leases): com
// mais do que uma instância do servidor sobre a mesma base, só uma a corre de
// cada vez e as outras saltam essa passagem. O resultado de cada execução fica
// em scheduled_task_runs, para o «Estado do sistema» (GET /api/ops/status).
const { db } = require('../config/database');
const { withSchedulerLease } = require('./schedulerLease');

const tasks = new Map();

// `run(assertLease)`: a tarefa chama assertLease() entre passos longos para
// parar se a reserva de execução se perdeu. Um erro fica registado; a tarefa
// volta a correr na passagem seguinte.
function register(name, { label, intervalMs, run, leaseMs = 300000 }) {
  if (tasks.has(name)) throw new Error(`Tarefa automática repetida: ${name}`);
  tasks.set(name, { name, label, intervalMs, run, leaseMs, timer: null, running: null, nextRunAt: null });
}

const RECORD_FIELDS = ['last_started_at', 'last_finished_at', 'last_ok_at', 'last_error_at', 'last_error', 'last_skipped_at', 'last_duration_ms'];
function record(name, fields) {
  if (!db.open) return;
  const keys = Object.keys(fields).filter(key => RECORD_FIELDS.includes(key));
  db.prepare(`INSERT INTO scheduled_task_runs (name, ${keys.join(', ')}) VALUES (?, ${keys.map(() => '?').join(', ')})
    ON CONFLICT(name) DO UPDATE SET ${keys.map(key => `${key} = excluded.${key}`).join(', ')}`)
    .run(name, ...keys.map(key => fields[key]));
}

// Corre já uma tarefa (sem esperar pelo intervalo). Devolve 'ok', 'error' ou
// 'skipped' (outra instância está a corrê-la); uma chamada durante uma
// execução espera por essa.
function runTask(name) {
  const task = tasks.get(name);
  if (!task) throw new Error(`Tarefa automática desconhecida: ${name}`);
  if (task.running) return task.running;
  task.running = (async () => {
    const started = Date.now();
    record(name, { last_started_at: new Date(started).toISOString() });
    try {
      const ran = await withSchedulerLease(db, `task:${name}`, assertLease => task.run(assertLease), task.leaseMs);
      const finished = new Date().toISOString();
      if (!ran) { record(name, { last_skipped_at: finished, last_finished_at: finished }); return 'skipped'; }
      record(name, { last_ok_at: finished, last_finished_at: finished, last_duration_ms: Date.now() - started });
      return 'ok';
    } catch (error) {
      const finished = new Date().toISOString();
      record(name, { last_error_at: finished, last_error: String(error.message || error).slice(0, 300), last_finished_at: finished,
        last_duration_ms: Date.now() - started });
      console.warn(`Tarefa automática «${task.label}» falhou; será repetida:`, error.message);
      return 'error';
    } finally {
      task.running = null;
      task.nextRunAt = task.timer ? Date.now() + task.intervalMs : null;
    }
  })();
  return task.running;
}

function start() {
  for (const task of tasks.values()) {
    if (task.timer) continue;
    task.timer = setInterval(() => runTask(task.name), task.intervalMs);
    task.timer.unref?.();
    runTask(task.name);
  }
}

// Para os temporizadores e espera pelas execuções em curso (até `timeoutMs`),
// para um encerramento não cortar uma tarefa a meio.
async function stop(timeoutMs = 10000) {
  for (const task of tasks.values()) { clearInterval(task.timer); task.timer = null; task.nextRunAt = null; }
  const running = [...tasks.values()].map(task => task.running).filter(Boolean);
  if (!running.length) return;
  let timer;
  await Promise.race([Promise.allSettled(running), new Promise(resolve => { timer = setTimeout(resolve, timeoutMs); timer.unref?.(); })]);
  clearTimeout(timer);
}

// Estado de cada tarefa: o intervalo, se está a correr neste processo, a
// próxima passagem e o último resultado (de qualquer instância).
function status() {
  const rows = new Map((db.open ? db.prepare('SELECT * FROM scheduled_task_runs').all() : []).map(row => [row.name, row]));
  return [...tasks.values()].map(task => {
    const { name: _name, ...last } = rows.get(task.name) || {};
    return { name: task.name, label: task.label, interval_ms: task.intervalMs, running: Boolean(task.running),
      next_run_at: task.nextRunAt ? new Date(task.nextRunAt).toISOString() : null, ...last };
  });
}

module.exports = { register, runTask, start, stop, status };
