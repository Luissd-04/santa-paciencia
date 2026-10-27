// Fila durável do Google Calendar com uma API Google simulada em memória:
// falhas, respostas perdidas, reinício, remoções e limpeza com pré-visualização.
// Não contacta o Google nem altera eventos reais.
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
    module, exports: module.exports, process, console: { ...console, error() {}, log() {}, warn() {} },
    Buffer, URL, URLSearchParams, setTimeout, clearTimeout, Promise, __filename: filename, __dirname: path.dirname(filename),
  }, { filename });
  return module.exports;
}

let calendars, requests, hooks, connected, service;
const googleError = status => Object.assign(new Error(`Google ${status}`), { response: { status } });
// Calendar API mínima: eventos apagados ficam «cancelled» e o ID continua reservado.
const fakeAuth = {
  async request(options) {
    const method = options.method || 'GET';
    const url = new URL(options.url);
    requests.push({ method, path: url.pathname });
    const hook = hooks.find(h => h.method === method && (!h.match || url.pathname.includes(h.match)) && h.times > 0);
    let lost = false;
    if (hook) {
      hook.times--;
      if (hook.status) throw googleError(hook.status);
      if (hook.network) throw Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
      lost = hook.lost;
    }
    const parts = url.pathname.split('/').map(decodeURIComponent);
    if (url.pathname.includes('/calendarList/')) return { data: {} };
    if (url.pathname === '/calendar/v3/calendars' && method === 'POST') {
      const id = `cal-${calendars.size + 1}`; calendars.set(id, new Map()); return { data: { id } };
    }
    const calendarId = parts[4];
    const events = calendars.get(calendarId);
    if (!events) throw googleError(404);
    if (parts[5] !== 'events') return { data: { id: calendarId } };
    const eventId = parts[6];
    let response;
    if (method === 'POST') {
      if (events.has(options.data.id)) throw googleError(409);
      events.set(options.data.id, { ...options.data, status: 'confirmed' });
      response = { data: { id: options.data.id } };
    } else if (method === 'PUT') {
      if (!events.has(eventId)) throw googleError(404);
      events.set(eventId, { ...events.get(eventId), ...options.data, id: eventId, status: options.data.status || events.get(eventId).status });
      response = { data: { id: eventId } };
    } else if (method === 'DELETE') {
      if (!events.has(eventId)) throw googleError(404);
      if (events.get(eventId).status === 'cancelled') throw googleError(410);
      events.get(eventId).status = 'cancelled';
      response = { data: {} };
    } else if (method === 'GET') {
      response = { data: { items: [...events.values()].filter(e => e.status !== 'cancelled') } };
    }
    // Resposta perdida: o Google executou o pedido, a aplicação não sabe.
    if (lost) throw Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
    return response;
  },
};
const live = calendarId => [...(calendars.get(calendarId)?.values() || [])].filter(e => e.status !== 'cancelled');
// Reinício: módulo novo (sem estado em memória), mesma base de dados.
function boot() {
  service = load('../services/calendarService.js', {
    '../config/google': { isAuthenticated: (userId, orgId) => connected.has(`${orgId}:${userId}`), getAuthenticatedClient: () => fakeAuth },
    '../config/googleTasks': { isTasksAuthenticated: () => false, async syncOrganizationTasksToGoogleTasks() { return {}; } },
  });
}
const reservation = () => db.prepare("SELECT * FROM reservations WHERE id = 'r1'").get();
const queue = () => db.prepare('SELECT * FROM google_calendar_queue ORDER BY id').all();
const makeDue = () => db.prepare("UPDATE google_calendar_queue SET next_attempt_at = datetime('now', '-1 second')").run();
const tx = fn => db.transaction(fn)();

beforeEach(() => {
  db.exec(`DELETE FROM google_calendar_queue; DELETE FROM operational_events; DELETE FROM reservations; DELETE FROM guests;
    DELETE FROM accommodations; DELETE FROM organization_settings; DELETE FROM memberships; DELETE FROM users; DELETE FROM organizations;
    INSERT INTO organizations(id, name, slug) VALUES ('org', 'Teste', 'teste');
    INSERT INTO users(id, name, email, password_hash) VALUES ('u1', 'Gestão', 'u1@example.invalid', 'x');
    INSERT INTO guests(id, organization_id, name, email) VALUES ('g1', 'org', 'Hóspede Sintético', 'g1@example.invalid');
    INSERT INTO accommodations(id, organization_id, name, type, price_per_night, max_guests, google_calendar_id)
      VALUES ('a1', 'org', 'Suite A', 'suite', 100, 2, 'cal-a'), ('a2', 'org', 'Suite B', 'suite', 100, 2, 'cal-b');
    INSERT INTO reservations(id, organization_id, guest_id, accommodation_id, check_in, check_out, nights, num_guests, total_amount, status)
      VALUES ('r1', 'org', 'g1', 'a1', '2035-03-01', '2035-03-03', 2, 1, 200, 'confirmada');`);
  calendars = new Map([['primary', new Map()], ['cal-a', new Map()], ['cal-b', new Map()]]);
  requests = []; hooks = []; connected = new Set(['org:u1']);
  boot();
});

test('criação falhada fica na fila, sobrevive a um reinício e não duplica', async () => {
  service.queueCalendarUpsert('org', 'reservation', 'r1', 'u1');
  hooks.push({ method: 'POST', match: '/events', status: 503, times: 1 });
  const [first] = await service.processCalendarQueue('org');
  assert.equal(first.outcome, 'error');
  const [job] = queue();
  assert.equal(job.attempts, 1);
  assert.equal(job.last_error, 'HTTP 503');
  assert.ok(job.next_attempt_at > db.prepare("SELECT datetime('now') AS now").get().now, 'espera antes de repetir');
  assert.equal(reservation().google_event_id, null);
  assert.equal((await service.processCalendarQueue('org')).length, 0, 'não repete antes da hora');

  boot(); makeDue();
  const [retry] = await service.processCalendarQueue('org');
  assert.equal(retry.outcome, 'created');
  assert.equal(reservation().google_event_id, service.appEventId('reservation', 'org', 'r1'));
  assert.equal(reservation().google_event_calendar_id, 'cal-a');
  assert.equal(live('cal-a').length, 1);
  assert.deepEqual(queue(), []);
});

test('resposta perdida na criação: a repetição adota o evento em vez de criar outro', async () => {
  service.queueCalendarUpsert('org', 'reservation', 'r1', 'u1');
  hooks.push({ method: 'POST', match: '/events', lost: true, times: 1 });
  assert.equal((await service.processCalendarQueue('org'))[0].outcome, 'error');
  assert.equal(live('cal-a').length, 1, 'o Google criou-o');
  makeDue();
  assert.equal((await service.processCalendarQueue('org'))[0].outcome, 'recreated');
  assert.equal(live('cal-a').length, 1, 'continua a existir um só evento');
  assert.equal(reservation().google_event_id, live('cal-a')[0].id);
});

test('alteração falhada é repetida com o estado atual da reserva', async () => {
  service.queueCalendarUpsert('org', 'reservation', 'r1', 'u1');
  await service.processCalendarQueue('org');
  db.prepare("UPDATE reservations SET notes = 'Chegada tardia', total_amount = 250 WHERE id = 'r1'").run();
  service.queueCalendarUpsert('org', 'reservation', 'r1', 'u1');
  hooks.push({ method: 'PUT', status: 500, times: 1 });
  assert.equal((await service.processCalendarQueue('org'))[0].outcome, 'error');
  db.prepare("UPDATE reservations SET total_amount = 260 WHERE id = 'r1'").run();
  boot(); makeDue();
  assert.equal((await service.processCalendarQueue('org'))[0].outcome, 'updated');
  assert.match(live('cal-a')[0].description, /Total 260,00\s€ · falta 260,00\s€/);
  assert.match(live('cal-a')[0].description, /Chegada tardia/);
});

test('títulos sem ícones: quem vem, quantos e por onde; tarefas com o hóspede', async () => {
  db.exec(`UPDATE reservations SET num_guests = 3, num_adults = 2, num_children = 1, channel = 'booking', arrival_time = '16:00', amount_paid = 50 WHERE id = 'r1';
    UPDATE guests SET email = 'guest_x@sem-email.local', phone = '+351910000000' WHERE id = 'g1';
    INSERT INTO organization_settings(organization_id, key, value) VALUES ('org', 'gcal_sync_calendar', '1');
    INSERT INTO operational_events(id, organization_id, title, type, date, start_time, end_time, status, accommodation_id, reservation_id, auto_generated, auto_kind)
      VALUES ('t-in', 'org', 'Check-in · Suite A', 'checkin', '2035-03-01', '09:00', '12:00', 'planeado', 'a1', 'r1', 1, 'checkin'),
             ('t-pa', 'org', 'Pequeno-almoço · Suite A', 'pequeno_almoco', '2035-03-02', '08:00', '10:30', 'planeado', 'a1', 'r1', 1, 'breakfast'),
             ('t-out', 'org', 'Check-out · Suite A', 'checkout', '2035-03-03', '09:00', '11:00', 'planeado', 'a1', 'r1', 1, 'checkout'),
             ('t-limp', 'org', 'Limpeza · Suite A', 'limpeza', '2035-03-03', '14:00', '18:00', 'planeado', 'a1', 'r1', 1, 'cleaning'),
             ('t-man', 'org', 'Reparar torneira', 'manutencao', '2035-03-04', NULL, NULL, 'planeado', 'a1', NULL, 0, NULL);`);
  service.queueCalendarUpsert('org', 'reservation', 'r1', 'u1');
  for (const id of ['t-in', 't-pa', 't-out', 't-limp', 't-man']) service.queueCalendarUpsert('org', 'event', id, 'u1');
  await service.processCalendarQueue('org');
  const byId = Object.fromEntries(live('cal-a').map(e => [e.id, e]));
  const summary = (kind, id) => byId[service.appEventId(kind, 'org', id)].summary;
  assert.equal(summary('reservation', 'r1'), 'Hóspede Sintético · 3 pax · Booking.com');
  assert.equal(summary('event', 't-in'), 'Check-in · Hóspede Sintético (3)');
  assert.equal(summary('event', 't-pa'), 'Pequeno-almoço · 3 pessoas · Hóspede Sintético');
  assert.equal(summary('event', 't-out'), 'Check-out · Hóspede Sintético');
  assert.equal(summary('event', 't-limp'), 'Limpeza · Suite A');
  assert.equal(summary('event', 't-man'), 'Reparar torneira');
  for (const event of live('cal-a')) {
    assert.doesNotMatch(event.summary, /\p{Extended_Pictographic}/u, `sem ícones: ${event.summary}`);
    assert.equal(event.extendedProperties.private.santaPaciencia, '1');
  }
  const description = byId[service.appEventId('reservation', 'org', 'r1')].description;
  assert.match(description, /2 adultos \+ 1 criança/);
  assert.match(description, /2 noites · chegada 16:00/);
  assert.match(description, /Canal: Booking\.com/);
  assert.match(description, /pago 50,00\s€ · falta 150,00\s€/);
  assert.doesNotMatch(description, /sem-email/);
  assert.match(description, /reservas\?reserva=r1/);
  assert.match(byId[service.appEventId('event', 'org', 't-in')].description, /Chegada prevista: 16:00/);
});

test('cancelar e apagar: a remoção guarda o ID e repete até o Google confirmar', async () => {
  service.queueCalendarUpsert('org', 'reservation', 'r1', 'u1');
  await service.processCalendarQueue('org');
  const eventId = reservation().google_event_id;
  tx(() => {
    db.prepare("UPDATE reservations SET status = 'cancelada' WHERE id = 'r1'").run();
    service.detachReservationEvent('org', 'r1');
  });
  assert.equal(reservation().google_event_id, null);
  assert.equal(queue()[0].google_event_id, eventId);
  hooks.push({ method: 'DELETE', network: true, times: 1 });
  assert.equal((await service.processCalendarQueue('org'))[0].outcome, 'error');
  db.prepare("DELETE FROM reservations WHERE id = 'r1'").run();   // eliminação definitiva entretanto
  boot(); makeDue();
  assert.equal((await service.processCalendarQueue('org'))[0].outcome, 'deleted');
  assert.equal(live('cal-a').length, 0);
  assert.deepEqual(queue(), []);
  // Repetir uma remoção já feita (410/404) conta como concluída.
  service.queueCalendarDelete('org', { entityType: 'reservation', entityId: 'r1', userId: 'u1', calendarId: 'cal-a', eventId });
  assert.equal((await service.processCalendarQueue('org'))[0].outcome, 'deleted');
});

test('reativar uma reserva cancelada repõe o mesmo evento, sem duplicar', async () => {
  service.queueCalendarUpsert('org', 'reservation', 'r1', 'u1');
  await service.processCalendarQueue('org');
  tx(() => { db.prepare("UPDATE reservations SET status = 'cancelada' WHERE id = 'r1'").run(); service.detachReservationEvent('org', 'r1'); });
  await service.processCalendarQueue('org');
  assert.equal(live('cal-a').length, 0);
  db.prepare("UPDATE reservations SET status = 'confirmada' WHERE id = 'r1'").run();
  service.queueCalendarUpsert('org', 'reservation', 'r1', reservation().google_calendar_user_id);
  assert.equal((await service.processCalendarQueue('org'))[0].outcome, 'recreated');
  assert.equal(live('cal-a').length, 1);
  assert.equal(calendars.get('cal-a').size, 1, 'o mesmo ID foi reativado');
});

test('mudar de alojamento remove o evento do calendário anterior', async () => {
  service.queueCalendarUpsert('org', 'reservation', 'r1', 'u1');
  await service.processCalendarQueue('org');
  db.prepare("UPDATE reservations SET accommodation_id = 'a2' WHERE id = 'r1'").run();
  service.queueCalendarUpsert('org', 'reservation', 'r1', 'u1');
  await service.processCalendarQueue('org');
  assert.equal(live('cal-a').length, 0);
  assert.equal(live('cal-b').length, 1);
  assert.equal(reservation().google_event_calendar_id, 'cal-b');
  assert.deepEqual(queue(), []);
});

test('reserva cancelada durante a criação: o evento criado é removido', async () => {
  service.queueCalendarUpsert('org', 'reservation', 'r1', 'u1');
  hooks.push({ method: 'POST', match: '/events', times: 1 });
  const original = fakeAuth.request;
  fakeAuth.request = async options => {
    const result = await original(options);
    if ((options.method || 'GET') === 'POST' && options.data?.id) db.prepare("UPDATE reservations SET status = 'cancelada' WHERE id = 'r1'").run();
    return result;
  };
  try { await service.processCalendarQueue('org'); } finally { fakeAuth.request = original; }
  assert.equal(reservation().google_event_id, null);
  assert.equal(live('cal-a').length, 0, 'a remoção encadeada já correu');
});

test('alteração local durante o pedido não se perde (revisão)', async () => {
  service.queueCalendarUpsert('org', 'reservation', 'r1', 'u1');
  const original = fakeAuth.request;
  fakeAuth.request = async options => {
    const result = await original(options);
    if ((options.method || 'GET') === 'POST' && options.data?.id) {
      db.prepare("UPDATE reservations SET notes = 'Nota nova' WHERE id = 'r1'").run();
      service.queueCalendarUpsert('org', 'reservation', 'r1', 'u1');
    }
    return result;
  };
  try { await service.processCalendarQueue('org'); } finally { fakeAuth.request = original; }
  assert.equal(queue().length, 1, 'a nova alteração continua pendente');
  await service.processCalendarQueue('org');
  assert.match(live('cal-a')[0].description, /Nota nova/);
  assert.deepEqual(queue(), []);
});

test('eventos operacionais: criação idempotente e remoção durável', async () => {
  db.prepare("INSERT INTO organization_settings(organization_id, key, value) VALUES ('org', 'gcal_sync_calendar', '1')").run();
  db.prepare(`INSERT INTO operational_events(id, organization_id, title, type, date, status, accommodation_id)
    VALUES ('e1', 'org', 'Limpeza', 'limpeza', '2035-03-03', 'planeado', 'a1')`).run();
  hooks.push({ method: 'POST', match: '/events', lost: true, times: 1 });
  const first = await service.syncOperationalEventsToGoogle([db.prepare("SELECT * FROM operational_events WHERE id='e1'").get()], { userId: 'u1', organizationId: 'org' });
  assert.equal(first.calendarErrors, 1);
  makeDue();
  const second = await service.syncOperationalEventsToGoogle([db.prepare("SELECT * FROM operational_events WHERE id='e1'").get()], { userId: 'u1', organizationId: 'org' });
  assert.equal(second.calendarCreated, 1);
  assert.equal(live('cal-a').length, 1);
  const row = db.prepare("SELECT * FROM operational_events WHERE id='e1'").get();
  tx(() => { service.detachOperationalEvent(row); db.prepare("DELETE FROM operational_events WHERE id='e1'").run(); });
  hooks.push({ method: 'DELETE', status: 503, times: 1 });
  await service.processCalendarQueue('org');
  assert.equal(live('cal-a').length, 1);
  boot(); makeDue();
  await service.processCalendarQueue('org');
  assert.equal(live('cal-a').length, 0);
});

test('desligar com remoções falhadas mantém IDs e devolve falhas', async () => {
  service.queueCalendarUpsert('org', 'reservation', 'r1', 'u1');
  await service.processCalendarQueue('org');
  hooks.push({ method: 'DELETE', status: 503, times: 1 });
  const result = await service.deleteAllSyncedEvents('u1', 'org');
  assert.equal(result.failed, 1);
  assert.ok(reservation().google_event_id, 'a referência fica para repetir');
  const ok = await service.deleteAllSyncedEvents('u1', 'org');
  assert.deepEqual({ ...ok }, { deleted: 1, failed: 0 });
  assert.equal(reservation().google_event_id, null);
});

test('utilizador sem Calendar ligado: a remoção fica bloqueada (sem perder o ID)', async () => {
  service.queueCalendarDelete('org', { entityType: 'reservation', entityId: 'x', userId: 'outro', calendarId: 'cal-a', eventId: 'spabc' });
  assert.equal((await service.processCalendarQueue('org'))[0].outcome, 'error');
  assert.match(queue()[0].last_error, /desligado/);
});

test('limpar duplicados: pré-visualização não apaga; apagar exige o número confirmado', async () => {
  const add = (id, summary) => calendars.get('cal-a').set(id, { id, summary, start: { date: '2035-03-01' }, status: 'confirmed' });
  add('linked', '🏨 Suite A — Hóspede Sintético');
  add('dup1', '🏨 Suite A — Hóspede Sintético');
  add('dup2', '🏨 Suite A — Hóspede Sintético');
  add('personal', 'Consulta pessoal');
  db.prepare("UPDATE reservations SET google_event_id = 'linked', google_calendar_user_id = 'u1' WHERE id = 'r1'").run();
  const preview = await service.cleanDuplicateAppEvents('u1', 'org');
  assert.equal(preview.count, 2);
  assert.equal(requests.filter(r => r.method === 'DELETE').length, 0);
  const stale = await service.cleanDuplicateAppEvents('u1', 'org', { preview: false, expected: 1 });
  assert.equal(stale.deleted, 0);
  assert.equal(requests.filter(r => r.method === 'DELETE').length, 0);
  const done = await service.cleanDuplicateAppEvents('u1', 'org', { preview: false, expected: 2 });
  assert.equal(done.deleted, 2);
  assert.deepEqual(live('cal-a').map(e => e.id).sort(), ['linked', 'personal']);
});
