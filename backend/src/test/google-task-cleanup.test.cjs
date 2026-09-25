const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.EMAIL_ENABLED = 'false';

const { db, initDatabase } = require('../config/database');
const reservationController = require('../controllers/reservationController');

function response() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

async function call(handler, req) {
  const res = response();
  await handler(req, res, error => {
    res.status(error.status || 500).json({ error: error.message });
  });
  return res;
}

before(() => {
  initDatabase();
  db.exec(`
    INSERT INTO organizations (id, name, slug) VALUES ('cleanup-org', 'Cleanup', 'cleanup');
    INSERT INTO users (id, name, email, password_hash)
      VALUES ('cleanup-user', 'Cleanup User', 'cleanup@example.invalid', 'placeholder');
    INSERT INTO guests (id, organization_id, name, email)
      VALUES ('cleanup-guest', 'cleanup-org', 'Synthetic Guest', 'guest@example.invalid');
    INSERT INTO accommodations (id, organization_id, name, type, price_per_night, max_guests)
      VALUES ('cleanup-unit', 'cleanup-org', 'Synthetic Unit', 'alojamento', 100, 2);
  `);
});

test('migração cria fila durável para eliminações do Google Tasks', () => {
  const table = db.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'google_task_cleanup_queue'
  `).get();
  assert.equal(table.name, 'google_task_cleanup_queue');
});

test('apagar reserva conserva IDs externos e inclui tarefas concluídas', async () => {
  db.prepare(`
    INSERT INTO reservations (
      id, organization_id, guest_id, accommodation_id, check_in, check_out,
      nights, num_guests, total_amount, status
    ) VALUES ('cleanup-reservation', 'cleanup-org', 'cleanup-guest', 'cleanup-unit',
      '2030-01-01', '2030-01-03', 2, 1, 200, 'cancelada')
  `).run();
  const insertEvent = db.prepare(`
    INSERT INTO operational_events (
      id, organization_id, title, type, date, reservation_id, status,
      auto_generated, google_task_id
    ) VALUES (?, 'cleanup-org', ?, 'limpeza', '2030-01-03',
      'cleanup-reservation', ?, ?, ?)
  `);
  insertEvent.run('cleanup-planned', 'Planeada', 'planeado', 1, 'google-planned');
  insertEvent.run('cleanup-completed', 'Concluída', 'concluido', 0, 'google-completed');

  const originalError = console.error;
  console.error = () => {};
  let res;
  try {
    res = await call(reservationController.hardDelete, {
      params: { id: 'cleanup-reservation' },
      user: { id: 'cleanup-user', organization_id: 'cleanup-org' },
    });
  } finally {
    console.error = originalError;
  }

  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM reservations WHERE id='cleanup-reservation'").get().n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM operational_events WHERE reservation_id='cleanup-reservation'").get().n, 0);
  assert.deepEqual(
    db.prepare(`
      SELECT google_task_id FROM google_task_cleanup_queue
      WHERE organization_id = 'cleanup-org' ORDER BY google_task_id
    `).all().map(row => row.google_task_id),
    ['google-completed', 'google-planned']
  );
  assert.equal(res.body.data.google_tasks_cleanup.pending, 2);
  assert.match(res.body.message, /aguardam nova tentativa/);
});

test('uma repetição bem-sucedida apaga a tarefa remota e retira-a da fila', async () => {
  db.exec(`
    INSERT INTO organizations (id, name, slug)
      VALUES ('cleanup-connected', 'Cleanup Connected', 'cleanup-connected');
    INSERT INTO google_tasks_connections (
      organization_id, email, tokens, tasks_list_id
    ) VALUES ('cleanup-connected', 'tasks@example.invalid', 'synthetic-token', 'app-list');
    INSERT INTO google_task_cleanup_queue (organization_id, google_task_id)
      VALUES ('cleanup-connected', 'remote-task');
  `);

  const requests = [];
  class FakeOAuth2Client {
    setCredentials() {}
    on() {}
    async request(options) {
      requests.push(options);
      return { data: {} };
    }
  }
  const filename = path.resolve(__dirname, '../config/googleTasks.js');
  const localRequire = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    require: id => {
      if (id === './database') return { db };
      if (id === './tokenStorage') return { decodeTokens: () => ({ access_token: 'synthetic' }), encodeTokens: value => value };
      if (id === 'google-auth-library') return { OAuth2Client: FakeOAuth2Client };
      if (id === '../services/httpClient') return { fetchWithTimeout: async () => ({}) };
      return localRequire(id);
    },
    module, exports: module.exports, process, console, Buffer, URL, URLSearchParams,
    setTimeout, clearTimeout, __filename: filename, __dirname: path.dirname(filename),
  }, { filename });

  const result = await module.exports.processQueuedTaskDeletions('cleanup-connected');
  assert.equal(result.deleted, 1);
  assert.equal(result.errors, 0);
  assert.equal(result.pending, 0);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, 'DELETE');
  assert.match(requests[0].url, /\/lists\/app-list\/tasks\/remote-task$/);
  assert.equal(db.prepare(`
    SELECT COUNT(*) AS n FROM google_task_cleanup_queue WHERE organization_id = 'cleanup-connected'
  `).get().n, 0);
});
