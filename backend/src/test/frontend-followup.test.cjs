const { runFrontend } = require('../test-support/frontend.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../../../frontend');
function context(stored = {}) {
  const ctx = vm.createContext({ console, window: {}, URLSearchParams, AbortController, setTimeout, clearTimeout,
    isoDate: (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    SS: { get: (key, fallback) => stored[key] ?? fallback, set: (key, value) => { stored[key] = value; } },
    document: { getElementById: () => null }, createColLayout: () => ({}), registerActions() {},
  });
  for (const file of ['domain/dates.js', 'domain/pagination.js', 'despesas.js', 'eventos.js']) {
    runFrontend(fs.readFileSync(path.join(root, 'js', file), 'utf8'), ctx);
  }
  return ctx;
}
test('Despesas recupera de uma ordenação antiga e preserva uma ordenação válida', () => {
  for (const storedSort of ['has_nif', 'not-a-column', 'amount']) {
    const stored = { 'desp:sort': storedSort, 'desp:asc': true };
    const ctx = context(stored);
    assert.equal(vm.runInContext('getDespesasQuery().sort', ctx), storedSort === 'amount' ? 'amount' : 'date');
    assert.equal(stored['desp:asc'], storedSort === 'amount');
  }
});
test('Eventos mantém o mês histórico separado do intervalo atual da agenda', () => {
  const ctx = context();
  const month = vm.runInContext("eventosYear=2021; eventosMonth=0; eventosMode='calendar'; eventosPeriod()", ctx);
  assert.deepEqual(JSON.parse(JSON.stringify(month)), { from: '2020-12-27', to: '2021-02-06' });
  const agenda = vm.runInContext('eventosAgendaPeriod()', ctx);
  assert.equal((new Date(agenda.to) - new Date(agenda.from)) / 86400000, 20);
});
test('intervalos independentes descartam respostas antigas e limpam dados ao terminar sessão', async () => {
  const ctx = context();
  const requests = [];
  ctx.apiRequest = (url, options) => new Promise(resolve => requests.push({ url, options, resolve }));
  const calendar = vm.runInContext("createRangeCollection('/api/events')", ctx);
  const agenda = vm.runInContext("createRangeCollection('/api/events')", ctx);
  const old = calendar.load({ from: '2021-01-01' });
  const current = calendar.load({ from: '2021-02-01' });
  const mobile = agenda.load({ from: '2030-01-01' });
  const reply = (request, id) => request.resolve({ success: true, data: [{ id }], pagination: { page: 1, total: 1, pages: 1, has_more: false } });
  reply(requests[1], 'current'); reply(requests[2], 'agenda');
  await Promise.all([current, mobile]);
  reply(requests[0], 'old'); await old;
  assert.equal(calendar.state.rows[0].id, 'current');
  assert.equal(agenda.state.rows[0].id, 'agenda');
  calendar.reset(); agenda.reset();
  assert.equal(calendar.state.rows.length + agenda.state.rows.length, 0);
});

test('seletor de templates liberta o estado global do modal antes de sair do DOM', () => {
  const calls = [];
  const modal = {
    remove() {
      calls.push('remove');
    },
  };
  const ctx = vm.createContext({
    console,
    window: {},
    document: {
      getElementById(id) {
        return id === 'modal-tpl-picker' ? modal : null;
      },
    },
    AppUI: {
      closeModal(element) {
        assert.equal(element, modal);
        calls.push('close');
      },
    },
  });
  runFrontend(fs.readFileSync(path.join(root, 'js/features/invoice/composicao.js'), 'utf8'), ctx);

  vm.runInContext("_closeInvoiceModal('modal-tpl-picker')", ctx);

  assert.deepEqual(calls, ['close', 'remove']);
});
