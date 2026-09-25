const { runFrontend } = require('../test-support/frontend.cjs');
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const previous = process.cwd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-pagination-'));
process.chdir(temp);
process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.EMAIL_ENABLED = 'false';
const { db, initDatabase } = require('../config/database');
initDatabase();
const { listReservations, listGuests } = require('../services/listQueries');
after(() => { db.close(); process.chdir(previous); fs.rmSync(temp, { recursive: true, force: true }); });
db.exec(`INSERT INTO organizations(id,name,slug) VALUES('a','A','a'),('b','B','b');
  INSERT INTO accommodations(id,organization_id,name,type) VALUES('a1','a','Unit A','alojamento'),('a2','a','Unit A2','alojamento'),('b1','b','Unit B','alojamento');`);
const guest = db.prepare('INSERT INTO guests(id,organization_id,name,email,is_vip) VALUES(?,?,?,?,?)');
const reservation = db.prepare(`INSERT INTO reservations(id,organization_id,guest_id,accommodation_id,check_in,check_out,nights,num_guests,total_amount,status)
  VALUES(?,?,?,?,'2030-01-30','2030-02-02',3,1,100,'confirmada')`);
db.transaction(() => {
  for (let n = 0; n < 123; n++) {
    const id = String(n).padStart(3, '0');
    guest.run(id, 'a', n === 120 ? 'Érica 100%_real' : `Guest ${id}`, `${id}@example.invalid`, n === 120 ? 1 : 0);
    reservation.run(`r${id}`, 'a', id, 'a1');
  }
  guest.run('private', 'b', 'Private', 'private@example.invalid', 1);
  reservation.run('private-r', 'b', 'private', 'b1');
  reservation.run('repeat', 'a', '120', 'a1');
  db.prepare('UPDATE reservations SET accommodations_data=? WHERE id=?').run('[{"accommodation_id":"a2"}]', 'r120');
})();

test('reservas paginadas mantêm ordem estável e isolamento entre organizações', () => {
  const first = listReservations('a');
  assert.equal(first.data.length, 50); assert.equal(first.pagination.total, 124);
  assert.equal(first.pagination.pages, 3); assert.equal(first.pagination.has_more, true);
  const all = [1, 2, 3].flatMap(page => listReservations('a', { page: String(page) }).data);
  assert.equal(new Set(all.map(r => r.id)).size, 124);
  assert(all.every(r => r.organization_id === 'a'));
  assert.equal(listReservations('b').pagination.total, 1);
});
test('filtros pesquisam todas as páginas, respeitam datas e suítes adicionais', () => {
  assert.equal(listReservations('a', { search: 'ÉRICA' }).pagination.total, 2);
  assert.equal(listReservations('a', { search: '100%_real' }).pagination.total, 2);
  assert.equal(listReservations('a', { search: '%' }).pagination.total, 2);
  assert.equal(listReservations('a', { accommodation_id: 'a2' }).data[0].id, 'r120');
  assert.equal(listReservations('a', { check_in: '2030-01-30' }).pagination.total, 124);
  assert.equal(listReservations('a', { check_out: '2030-01-30' }).pagination.total, 0);
  assert.equal(listReservations('a', { overlap_from: '2030-02-01', overlap_to: '2030-02-28' }).pagination.total, 124);
  assert.equal(listReservations('a', { overlap_from: '2030-03-01' }).pagination.total, 0);
  assert.equal(listReservations('a', { status: 'cancelada' }).pagination.total, 0);
});
test('paginação conserva o estado das tarefas, preferindo a data atual da reserva', () => {
  const insert = db.prepare(`INSERT INTO operational_events(id,organization_id,title,date,reservation_id,auto_kind,status,created_at)
    VALUES(?,'a','Synthetic',?,'r120',?,?,?)`);
  insert.run('old-checkout', '2030-01-20', 'checkout', 'concluido', '2030-02-10');
  insert.run('current-checkout', '2030-02-02', 'checkout', 'planeado', '2030-02-01');
  insert.run('current-checkin', '2030-01-30', 'checkin', 'concluido', '2030-01-30');
  const row = listReservations('a', { search: 'r120' }).data[0];
  assert.deepEqual(row.task_status, { checkin_done: true, checkout_done: false });
  assert.equal('checkout_task_status' in row, false);
});
test('resumo e ordenação de hóspedes abrangem todas as páginas', () => {
  const first = listGuests('a');
  assert.equal(first.data.length, 50);
  assert.deepEqual(first.summary, { total: 123, vip: 1, repeat: 1 });
  const sorted = listGuests('a', { sort: 'reservation_count', direction: 'desc', limit: '1' });
  assert.equal(sorted.data[0].id, '120');
  assert.equal(listGuests('a', { search: 'érIcA' }).pagination.total, 1);
  assert.equal(listGuests('a', { search: '%' }).pagination.total, 1);
  assert.equal(listGuests('a', { search: 'Guest' }).data.length, 20);
});
test('paginação rejeita parâmetros inválidos e tentativas de injeção SQL', () => {
  for (const list of [listGuests, listReservations]) {
    for (const query of [{ page: '0' }, { page: '-1' }, { limit: '501' }, { limit: '1.5' }, { sort: 'id; DROP TABLE guests' }, { direction: 'DESC;SELECT 1' }, { search: ['a', 'b'] }]) {
      assert.throws(() => list('a', query), error => error.status === 400);
    }
  }
  assert.throws(() => listReservations('a', { from: '2030-02-31' }), error => error.status === 400);
  assert.throws(() => listReservations('a', { from: '2030-03-01', to: '2030-01-01' }), error => error.status === 400);
});

const frontend = path.resolve(__dirname, '../../../frontend');
function browser(apiRequest) {
  const context = vm.createContext({ apiRequest, AbortController, URLSearchParams, setTimeout, clearTimeout });
  runFrontend(fs.readFileSync(path.join(frontend, 'js/domain/pagination.js'), 'utf8'), context);
  return context;
}
const pageResult = (id, page = 1, total = 1) => ({ data: [{ id }], pagination: { page, limit: 50, total, pages: Math.ceil(total / 50), has_more: page * 50 < total } });
test('pesquisa nova ignora resposta antiga e reset elimina dados da sessão', async () => {
  const requests = [];
  const context = browser((url, options) => new Promise(resolve => requests.push({ url, options, resolve })));
  vm.runInContext('const list = createPagedCollection("/api/guests", () => {});', context);
  const old = vm.runInContext('list.load({ search: "old" })', context);
  const next = vm.runInContext('list.load({ search: "new" })', context);
  assert.equal(requests[0].options.signal.aborted, true);
  requests[1].resolve(pageResult('new')); await next;
  requests[0].resolve(pageResult('old')); await old;
  assert.equal(vm.runInContext('list.state.rows[0].id', context), 'new');
  const pending = vm.runInContext('list.load({ search: "pending" })', context);
  vm.runInContext('list.reset()', context);
  requests[2].resolve(pageResult('private')); await pending;
  assert.equal(vm.runInContext('list.state.rows.length', context), 0);
});
test('voltar à página em cache cancela pedido concorrente; mudança de filtro regressa à primeira página', async () => {
  const requests = [];
  const context = browser((url, options) => new Promise(resolve => requests.push({ url, options, resolve })));
  vm.runInContext('const list = createPagedCollection("/api/guests", () => {});', context);
  let pending = vm.runInContext('list.load({}, {page: 2})', context);
  requests[0].resolve(pageResult('cached', 2, 150)); await pending;
  pending = vm.runInContext('list.load({}, {page: 3})', context);
  await vm.runInContext('list.load({}, {page: 2})', context);
  assert.equal(requests[1].options.signal.aborted, true);
  requests[1].resolve(pageResult('stale', 3, 150)); await pending;
  assert.equal(vm.runInContext('list.state.rows[0].id', context), 'cached');
  assert.equal(vm.runInContext('list.state.page', context), 2);
  pending = vm.runInContext('list.load({search: "changed"})', context);
  assert.equal(new URL(requests[2].url, 'http://test').searchParams.get('page'), '1');
  requests[2].resolve(pageResult('changed')); await pending;
});
test('exportação percorre todas as páginas mantendo filtros e deteta falhas', async () => {
  const seen = [];
  const context = browser(async url => {
    const params = new URL(url, 'http://test').searchParams; seen.push(params);
    return { data: [{ id: params.get('page') }], pagination: { total: 2, page: Number(params.get('page')), has_more: params.get('page') === '1' } };
  });
  const result = await vm.runInContext('apiGetAllPages("/api/reservations", { check_in: "2030-01-30" })', context);
  assert.deepEqual(Array.from(result.data, row => row.id), ['1', '2']);
  assert(seen.every(params => params.get('check_in') === '2030-01-30'));
  const broken = browser(async () => ({ data: [], pagination: { total: 1, page: 1, has_more: true } }));
  await assert.rejects(vm.runInContext('apiGetAllPages("/api/guests")', broken), /não recebeu todos/);
});

test('calendário carrega o intervalo visível e ignora a resposta de um mês anterior', async () => {
  const requests = [], elements = new Map();
  const context = vm.createContext({ AbortController, calYear: 2030, calMonth: 0, calMode: 'calendar',
    document: { getElementById: id => { if (!elements.has(id)) elements.set(id, { textContent: '' }); return elements.get(id); } },
    setCalCount() {}, drawCal() {}, drawTimeline() {},
    apiGetAllPages: (url, query, options) => new Promise(resolve => requests.push({ url, query, options, resolve })),
  });
  runFrontend(fs.readFileSync(path.join(frontend, 'js/features/calendario/dados.js'), 'utf8'), context);
  const january = vm.runInContext('renderCal()', context);
  assert.equal(requests[0].query.overlap_from, '2029-12-30');
  assert.equal(requests[0].query.overlap_to, '2030-02-02');
  context.calMonth = 1;
  const february = vm.runInContext('renderCal()', context);
  assert.equal(requests[0].options.signal.aborted, true);
  requests[1].resolve({ data: [{ id: 'february' }] }); await february;
  requests[0].resolve({ data: [{ id: 'january' }] }); await january;
  assert.equal(vm.runInContext('calendarReservas[0].id', context), 'february');
  await vm.runInContext('renderCal()', context);
  assert.equal(requests.length, 2, 'o mesmo período deve reutilizar os dados');
  vm.runInContext('invalidateCalendarReservations()', context);
  assert.equal(vm.runInContext('calendarReservas.length', context), 0);
});

test('uma falha de pesquisa não transforma resultados vazios numa página antiga em cache', async () => {
  let fail = false, calls = 0;
  const context = browser(async () => { calls++; if (fail) throw new Error('offline'); return pageResult('old'); });
  vm.runInContext('const list = createPagedCollection("/api/guests", () => {});', context);
  await vm.runInContext('list.load({search: "old"})', context);
  fail = true; await vm.runInContext('list.load({search: "new"})', context);
  fail = false; await vm.runInContext('list.load({search: "old"})', context);
  assert.equal(calls, 3);
  assert.equal(vm.runInContext('list.state.rows[0].id', context), 'old');
});

test('exportação recusa páginas inconsistentes após alteração dos dados', async () => {
  let page = 0;
  const context = browser(async () => ({ data: [{ id: 'duplicate' }], pagination: { total: 2, page: ++page, has_more: page === 1 } }));
  await assert.rejects(vm.runInContext('apiGetAllPages("/api/guests")', context), /dados mudaram/);
  const truncated = browser(async () => ({ data: [{ id: 'only-one' }], pagination: { total: 2, page: 1, has_more: false } }));
  await assert.rejects(vm.runInContext('apiGetAllPages("/api/guests")', truncated), /não recebeu todos/);
});
