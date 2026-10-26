// Executor único das tarefas automáticas: reserva de execução, registo do
// resultado e espera pelas execuções em curso ao parar.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
const { db, initDatabase } = require('../config/database');
initDatabase();
const runner = require('../services/taskRunner');
after(() => db.close());

const statusOf = name => runner.status().find(task => task.name === name);

test('regista o resultado de cada execução, com erro e duração', async () => {
  let fail = false;
  runner.register('t_result', { label: 'Teste', intervalMs: 60000, run: async () => { if (fail) throw new Error('rede em baixo'); } });
  assert.equal(await runner.runTask('t_result'), 'ok');
  let status = statusOf('t_result');
  assert.ok(status.last_ok_at); assert.equal(status.last_error, null); assert.equal(status.interval_ms, 60000);
  fail = true;
  assert.equal(await runner.runTask('t_result'), 'error');
  status = statusOf('t_result');
  assert.match(status.last_error, /rede em baixo/); assert.ok(status.last_error_at >= status.last_ok_at);
  assert.equal(typeof status.last_duration_ms, 'number');
});

test('com outra instância a correr a mesma tarefa, esta passagem é saltada', async () => {
  let runs = 0;
  runner.register('t_lease', { label: 'Teste', intervalMs: 60000, run: async () => { runs++; } });
  db.prepare('INSERT INTO scheduler_leases (name, owner, expires_at) VALUES (?, ?, ?)').run('task:t_lease', 'outra-instancia', Date.now() + 60000);
  assert.equal(await runner.runTask('t_lease'), 'skipped');
  assert.equal(runs, 0); assert.ok(statusOf('t_lease').last_skipped_at);
  db.prepare('DELETE FROM scheduler_leases WHERE name = ?').run('task:t_lease');
  assert.equal(await runner.runTask('t_lease'), 'ok');
  assert.equal(runs, 1);
});

test('uma chamada durante uma execução espera por ela; parar espera pelas que estão a meio', async () => {
  let release, runs = 0;
  runner.register('t_slow', { label: 'Teste', intervalMs: 3600000, run: () => { runs++; return new Promise(resolve => { release = resolve; }); } });
  const first = runner.runTask('t_slow');
  const second = runner.runTask('t_slow');
  assert.equal(first, second);
  assert.equal(statusOf('t_slow').running, true);
  let stopped = false;
  const stopping = runner.stop(5000).then(() => { stopped = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(stopped, false, 'não para a meio da tarefa');
  release();
  await stopping;
  assert.equal(await first, 'ok'); assert.equal(runs, 1);
});

test('as tarefas do servidor estão todas no executor, com nome para o Estado do sistema', () => {
  require('../services/scheduledTasks');
  const names = runner.status().map(task => task.name);
  for (const name of ['maintenance', 'google_tasks', 'google_calendar', 'email', 'daily_summary']) assert.ok(names.includes(name), name);
  assert.ok(runner.status().every(task => task.label));
  assert.throws(() => runner.register('email', { label: 'x', intervalMs: 1, run() {} }), /repetida/);
});
