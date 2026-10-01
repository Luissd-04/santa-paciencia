const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.EMAIL_ENABLED = 'false';
const { db, initDatabase } = require('../config/database');
initDatabase();

function load(relative, stubs = {}) {
  const filename = path.resolve(__dirname, relative);
  const localRequire = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    require: id => Object.hasOwn(stubs, id) ? stubs[id] : localRequire(id),
    module, exports: module.exports, process, console: { ...console, error() {} },
    Buffer, URL, URLSearchParams, setTimeout, clearTimeout, __filename: filename, __dirname: path.dirname(filename),
  }, { filename });
  return module.exports;
}
let api, tasks, operations, remote, calls, hook, nextId, calendarCalls;
const calendar = {
  async syncOperationalEventsToGoogle(rows, context) { calendarCalls.push({ rows, context }); },
  async deleteTaskCalendarEvent() {}, async updateTaskCalendarEvent() {},
};
function fail(status) { return Object.assign(new Error(`Google ${status}`), { status }); }
beforeEach(() => {
  db.exec(`DELETE FROM operational_events; DELETE FROM reservations; DELETE FROM guests; DELETE FROM accommodations;
    DELETE FROM organizations; DELETE FROM google_tasks_connections;
    INSERT INTO organizations(id,name,slug) VALUES ('org','Test','test'), ('other','Other','other');
    INSERT INTO google_tasks_connections(organization_id,tokens,tasks_list_id) VALUES ('org','fake','list');
    INSERT INTO guests(id,organization_id,name,email) VALUES ('guest','org','Guest','guest@example.invalid');
    INSERT INTO accommodations(id,organization_id,name,type,price_per_night,max_guests)
      VALUES ('unit','org','Suite','suite',100,2);
    INSERT INTO reservations(id,organization_id,guest_id,accommodation_id,check_in,check_out,nights,num_guests,total_amount,status,breakfast_included)
      VALUES ('reservation','org','guest','unit','2035-01-01','2035-01-03',2,1,200,'confirmada',1);`);
  remote = new Map(); calls = []; hook = null; nextId = 0; calendarCalls = [];
  class FakeOAuth {
    setCredentials() {} on() {}
    async request(options) {
      calls.push(options);
      if (hook) { const value = await hook(options); if (value) return value; }
      const url = new URL(options.url);
      const method = options.method || 'GET';
      if (url.pathname.includes('/users/@me/lists/')) return { data: { id: 'list' } };
      if (url.pathname.endsWith('/users/@me/lists')) return { data: { id: 'new-list' } };
      const taskId = url.pathname.match(/\/tasks\/([^/]+)$/)?.[1];
      if (method === 'GET' && !taskId) return { data: { items: [...remote.values()].map(t => ({ ...t })) } };
      if (method === 'GET') {
        if (!remote.has(taskId)) throw fail(404);
        return { data: { ...remote.get(taskId) } };
      }
      if (method === 'POST') {
        const task = { ...options.data, id: `remote-${++nextId}`, etag: String(nextId) };
        remote.set(task.id, task); return { data: { ...task } };
      }
      if (method === 'PATCH') {
        if (!remote.has(taskId)) throw fail(404);
        const task = { ...remote.get(taskId), ...options.data };
        remote.set(taskId, task); return { data: { ...task } };
      }
      if (method === 'DELETE') { remote.delete(taskId); return { data: {} }; }
      throw new Error(`Unexpected request ${method} ${url}`);
    }
  }
  api = load('../config/googleTasks.js', {
    'google-auth-library': { OAuth2Client: FakeOAuth },
    './tokenStorage': { decodeTokens: () => ({ access_token: 'test' }), encodeTokens: x => x },
    '../services/calendarService': calendar,
  });
  tasks = load('../services/operationalTasksService.js', {
    '../config/googleTasks': api, './calendarService': calendar,
  });
  operations = load('../controllers/reservationOperationsController.js', {
    '../services/calendarService': calendar,
    '../services/reservationHistoryService': { recordHistory() {} },
  });
});
function event(id = 'event', overrides = {}) {
  const row = { id, organization_id: 'org', title: 'Limpeza', type: 'limpeza', date: '2035-01-03',
    status: 'planeado', notes: 'Notas', ...overrides };
  const keys = Object.keys(row);
  db.prepare(`INSERT INTO operational_events (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...Object.values(row));
  return read(id);
}
function read(id = 'event') { return db.prepare('SELECT * FROM operational_events WHERE id=?').get(id); }
function reservation() { return db.prepare("SELECT * FROM reservations WHERE id='reservation'").get(); }
function response() { return { status() { return this; }, json(body) { this.body = body; return this; } }; }
async function sync() { return api.syncOrganizationTasksToGoogleTasks('org'); }
function linked(id = 'event') { return remote.get(read(id).google_task_id); }

test('cria, edita, conclui e reabre tarefas passadas e fora dos 90 dias', async () => {
  event(); event('past', { date: '2001-01-01' });
  assert.equal((await sync()).created, 2);
  assert.equal(linked().due, '2035-01-03T00:00:00.000Z');
  db.prepare(`UPDATE operational_events SET title='Nova', notes='Editada', date='2040-05-10',
    status='concluido', completed_at='2026-10-01T12:00:00Z', responsible='Ana', important=1 WHERE id='event'`).run();
  assert.equal((await sync()).updated, 1);
  assert.equal(linked().status, 'completed');
  assert.match(linked().notes, /Responsável: Ana/);
  assert.match(linked().notes, /Importante/);
  assert.equal(linked().due, '2040-05-10T00:00:00.000Z');
  db.prepare("UPDATE operational_events SET status='planeado', completed_at=NULL WHERE id='event'").run();
  await sync();
  assert.equal(linked().status, 'needsAction'); assert.equal(linked().completed, null);
  const count = calls.length;
  await sync();
  assert.equal(calls.slice(count).filter(x => x.method === 'PATCH' || x.method === 'POST').length, 0);
});

test('Google → app: conclusão, reabertura, título, notas e data sem alterar reserva', async () => {
  event('event', { reservation_id: 'reservation', accommodation_id: 'unit', start_time: '08:00' });
  await sync();
  Object.assign(linked(), { title: '[Suite] Nova tarefa', notes: 'Nota do Google', due: '2041-04-05T00:00:00Z',
    status: 'completed', completed: '2026-10-01T13:00:00Z' });
  assert.equal((await sync()).imported, 1);
  assert.equal(read().status, 'concluido'); assert.equal(read().completed_at, '2026-10-01T13:00:00Z');
  assert.equal(read().date, '2041-04-05'); assert.equal(read().title, 'Nova tarefa');
  assert.equal(read().notes, 'Nota do Google'); assert.equal(reservation().check_in, '2035-01-01');
  linked().status = 'needsAction'; delete linked().completed;
  await sync(); assert.equal(read().status, 'planeado'); assert.equal(read().completed_at, null);
});

test('funde campos diferentes e conserva edição local num conflito do mesmo campo', async () => {
  event(); await sync();
  db.prepare("UPDATE operational_events SET title='Título local' WHERE id='event'").run();
  Object.assign(linked(), { title: 'Título Google', status: 'completed' });
  await sync();
  assert.equal(read().title, 'Título local'); assert.equal(read().status, 'concluido');
  assert.equal(linked().title, 'Título local');
});

test('não importa tarefas desconhecidas criadas diretamente no Google', async () => {
  remote.set('personal', { id: 'personal', title: 'Pessoal', due: '2030-01-01T00:00:00Z' });
  const result = await sync(); assert.equal(result.imported, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM operational_events').get().n, 0);
  assert.ok(remote.has('personal'));
});

test('tarefas automáticas: criação, mudança de datas, pequeno-almoço, cancelamento e histórico', async () => {
  tasks.syncReservationOperationalTasks(reservation()); await sync();
  assert.equal(remote.size, 5);
  const previous = new Set(remote.keys());
  db.prepare("UPDATE reservations SET check_in='2035-02-01', check_out='2035-02-03' WHERE id='reservation'").run();
  tasks.syncReservationOperationalTasks(reservation()); await sync();
  assert.equal(remote.size, 5); assert.ok([...remote.keys()].every(id => !previous.has(id)));
  db.prepare("UPDATE reservations SET breakfast_included=0 WHERE id='reservation'").run();
  tasks.syncReservationOperationalTasks(reservation()); await sync(); assert.equal(remote.size, 3);
  const done = db.prepare("SELECT id FROM operational_events WHERE auto_kind='checkin'").get().id;
  db.prepare("UPDATE operational_events SET status='concluido' WHERE id=?").run(done); await sync();
  db.prepare("UPDATE reservations SET status='cancelada' WHERE id='reservation'").run();
  tasks.syncReservationOperationalTasks(reservation()); await sync();
  assert.equal(remote.size, 1); assert.equal(read(done).status, 'concluido');
  db.prepare("DELETE FROM reservations WHERE id='reservation'").run(); await sync(); assert.equal(remote.size, 0);
});

test('edição e eliminação no Google sobrevivem à regeneração das tarefas automáticas', async () => {
  tasks.syncReservationOperationalTasks(reservation()); await sync();
  const row = db.prepare("SELECT * FROM operational_events WHERE auto_kind='cleaning'").get();
  Object.assign(remote.get(row.google_task_id), { title: 'Limpeza especial', notes: 'Nova nota', due: '2035-01-04T00:00:00Z' });
  await sync(); tasks.syncReservationOperationalTasks(reservation()); await sync();
  assert.equal(read(row.id).title, 'Limpeza especial'); assert.equal(read(row.id).date, '2035-01-04');
  remote.get(row.google_task_id).deleted = true;
  assert.equal((await sync()).deleted, 1); assert.equal(read(row.id), undefined);
  tasks.syncReservationOperationalTasks(reservation()); await sync();
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM operational_events WHERE auto_kind='cleaning'").get().n, 0);
});

test('duas sincronizações simultâneas não criam duplicados', async () => {
  event(); await Promise.all([sync(), sync(), sync()]);
  assert.equal(remote.size, 1); assert.equal(calls.filter(x => x.method === 'POST').length, 1);
});

test('eliminação durante POST conserva ID recebido e remove órfão', async () => {
  event(); hook = async options => {
    if (options.method === 'POST') db.prepare("DELETE FROM operational_events WHERE id='event'").run();
  };
  await sync(); assert.equal(remote.size, 0); assert.equal(read(), undefined);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM google_task_cleanup_queue').get().n, 0);
});

test('falha ao eliminar é durável e uma repetição conclui a limpeza', async () => {
  event(); await sync(); const remoteId = read().google_task_id;
  db.prepare("DELETE FROM operational_events WHERE id='event'").run();
  hook = async options => { if (options.method === 'DELETE') throw fail(429); };
  await sync(); assert.ok(remote.has(remoteId));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM google_task_cleanup_queue').get().n, 1);
  hook = null; await sync(); assert.equal(remote.size, 0);
});

test('429 na lista não cria outra lista e preserva eventos locais', async () => {
  event(); hook = async options => { if (options.url.includes('/users/@me/lists/')) throw fail(429); };
  await assert.rejects(sync(), /429/);
  assert.equal(calls.filter(x => x.method === 'POST').length, 0); assert.ok(read());
});

test('lista apagada é recriada sem apagar eventos locais', async () => {
  event(); await sync();
  hook = async options => { if (options.url.endsWith('/users/@me/lists/list')) throw fail(404); };
  remote.clear(); await sync(); assert.ok(read()); assert.equal(remote.size, 1);
});

test('tarefas concluídas e ocultas e todas as páginas são lidas', async () => {
  event(); await sync(); const row = { ...linked(), status: 'completed', hidden: true };
  hook = async options => {
    if (options.url.includes('/tasks?')) {
      const url = new URL(options.url);
      assert.equal(url.searchParams.get('showHidden'), 'true');
      assert.equal(url.searchParams.get('showCompleted'), 'true');
      assert.equal(url.searchParams.get('showDeleted'), 'true');
      return { data: url.searchParams.has('pageToken') ? { items: [row] } : { items: [], nextPageToken: 'next' } };
    }
  };
  await sync(); assert.equal(read().status, 'concluido');
});

test('atalho de check-in/check-out desencadeia sincronização ao concluir e reabrir', () => {
  tasks.syncReservationOperationalTasks(reservation());
  const req = { user: { organization_id: 'org', id: null }, params: { id: 'reservation' }, body: { kind: 'checkin', done: true } };
  operations.setTaskStatus(req, response(), error => { throw error; });
  assert.equal(calendarCalls.at(-1).rows[0].status, 'concluido');
  req.body.done = false; operations.setTaskStatus(req, response(), error => { throw error; });
  assert.equal(calendarCalls.at(-1).rows[0].status, 'planeado');
});

test('eliminação manual de evento usa fila e não volta a gerar tarefa automática', async () => {
  tasks.syncReservationOperationalTasks(reservation()); await sync();
  const row = db.prepare("SELECT * FROM operational_events WHERE auto_kind='cleaning'").get();
  const controller = load('../controllers/eventController.js', {
    '../config/googleTasks': api, '../services/calendarService': calendar,
    '../services/operationalTasksService': tasks,
  });
  controller.remove({ user: { organization_id: 'org' }, params: { id: row.id } }, response());
  await sync(); tasks.syncReservationOperationalTasks(reservation()); await sync();
  assert.equal(read(row.id), undefined); assert.ok(!remote.has(row.google_task_id));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM operational_events WHERE auto_kind='cleaning'").get().n, 0);
});

test('desligar com erro não esquece IDs e permite repetir', async () => {
  event(); await sync(); const id = read().google_task_id;
  hook = async options => { if (options.method === 'DELETE') throw fail(503); };
  await assert.rejects(api.deleteAllSyncedTasks('org'), /aguardam/);
  assert.equal(read().google_task_id, id);
  hook = null; await api.deleteAllSyncedTasks('org'); assert.equal(read().google_task_id, null);
});

test('sem sincronização automática ativa não consulta o Google no agendador', async () => {
  event(); await api.syncEnabledOrganizationsToGoogleTasks(); assert.equal(calls.length, 0);
  db.prepare("INSERT INTO organization_settings VALUES ('org','gcal_sync_tasks','1',datetime('now'))").run();
  await api.syncEnabledOrganizationsToGoogleTasks(); assert.equal(remote.size, 1);
});

test('edição local durante POST não se perde na passagem seguinte', async () => {
  event(); hook = async options => {
    if (options.method === 'POST') db.prepare("UPDATE operational_events SET title='Mudou durante envio' WHERE id='event'").run();
  };
  await sync(); assert.equal(read().title, 'Mudou durante envio');
  hook = null; await sync(); assert.equal(linked().title, 'Mudou durante envio');
});

test('412 conserva edição local e volta a importar uma mudança Google mais recente', async () => {
  event('event', { accommodation_id: 'unit' }); await sync();
  linked().title = 'Primeiro título Google';
  hook = async options => {
    if (options.method === 'PATCH') { linked().title = 'Segundo título Google'; throw fail(412); }
  };
  assert.equal((await sync()).errors, 1);
  hook = null; await sync();
  assert.equal(read().title, 'Segundo título Google');
  assert.equal(linked().title, '[Suite] Segundo título Google');
});

test('uma falha a meio da reconstrução da lista não apaga os eventos restantes', async () => {
  event(); event('second'); await sync(); remote.clear();
  let posts = 0;
  hook = async options => {
    if (options.url.endsWith('/users/@me/lists/list')) throw fail(404);
    if (options.method === 'POST' && options.url.includes('/lists/new-list/tasks') && ++posts === 2) throw fail(503);
  };
  assert.equal((await sync()).errors, 1);
  hook = null; await sync();
  assert.ok(read()); assert.ok(read('second')); assert.equal(remote.size, 2);
});

test('apagar tarefa no Google confirmada por 404 elimina apenas a tarefa ligada', async () => {
  event(); event('second', { organization_id: 'other' }); await sync(); remote.clear();
  assert.equal((await sync()).deleted, 1); assert.equal(read(), undefined); assert.ok(read('second'));
});

test('desligar interrompe sincronização automática e conserva autenticação se limpeza falhar', async () => {
  event(); await sync();
  db.prepare("INSERT INTO organization_settings VALUES ('org','gcal_sync_tasks','1',datetime('now'))").run();
  hook = async options => { if (options.method === 'DELETE') throw fail(503); };
  await assert.rejects(api.disconnectTasks('org'), /aguardam/);
  assert.equal(api.getTasksConnectionInfo('org').connected, true);
  assert.equal(db.prepare("SELECT value FROM organization_settings WHERE organization_id='org' AND key='gcal_sync_tasks'").get().value, '0');
});

test('guarda tarefas públicas/aprovadas e alterações de definições no caminho comum', async () => {
  tasks.syncReservationOperationalTasks(reservation(), null);
  await Promise.resolve();
  assert.equal(calendarCalls.length, 1); assert.equal(calendarCalls[0].rows.length, 5);
  tasks.saveAutoTaskSettings('org', { breakfast: false });
  tasks.syncOrganizationOperationalTasks('org', null); await Promise.resolve();
  assert.equal(calendarCalls.at(-1).rows.length, 3);
});

test('recupera POST cuja resposta se perdeu sem duplicar nem apagar edição local posterior', async () => {
  event(); hook = async options => {
    if (options.method === 'POST') {
      remote.set('accepted', { ...options.data, id: 'accepted' });
      throw fail(504);
    }
  };
  assert.equal((await sync()).errors, 1); assert.equal(read().google_task_id, null);
  db.prepare("UPDATE operational_events SET title='Após timeout' WHERE id='event'").run();
  hook = null; await sync();
  assert.equal(remote.size, 1); assert.equal(read().google_task_id, 'accepted');
  assert.equal(linked().title, 'Após timeout');
});

test('migração estabelece base que protege edições locais antes da primeira sincronização', async () => {
  event('event', { google_task_id: 'legacy', accommodation_id: 'unit', start_time: '08:00' });
  remote.set('legacy', { id: 'legacy', title: '[Suite] Limpeza', notes: 'Notas\nHora: 08:00',
    due: '2035-01-03T00:00:00Z', status: 'completed', completed: '2026-10-01T10:00:00Z' });
  db.exec(`DELETE FROM schema_migrations WHERE id='20261001_google_task_bidirectional';
    DROP TRIGGER operational_event_google_task_cleanup; DROP TRIGGER reservation_operational_event_cleanup;
    DROP TABLE google_task_sync_state; DROP TABLE auto_task_suppressions;
    ALTER TABLE operational_events DROP COLUMN auto_source_snapshot;`);
  require('../config/migrations').runMigrations(db);
  db.prepare("UPDATE operational_events SET title='Edição após upgrade' WHERE id='event'").run();
  await sync();
  assert.equal(read().title, 'Edição após upgrade'); assert.equal(read().status, 'concluido');
  assert.equal(read().notes, 'Notas'); assert.equal(linked().title, '[Suite] Edição após upgrade');
});
