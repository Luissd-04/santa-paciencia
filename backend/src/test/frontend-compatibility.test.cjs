const { runFrontend } = require('../test-support/frontend.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const frontend = path.resolve(__dirname, '../../../frontend');
function browser(apiRequest) {
  const elements = new Map();
  const ctx = vm.createContext({ apiRequest, apiGet: apiRequest, AbortController, URLSearchParams, setTimeout, clearTimeout,
    document: { getElementById(id) {
      if (!elements.has(id)) elements.set(id, { textContent: '', innerHTML: '', style: {} });
      return elements.get(id);
    } },
  });
  for (const file of ['js/domain/pagination.js', 'js/dashboard.js']) runFrontend(fs.readFileSync(path.join(frontend, file), 'utf8'), ctx);
  return { ctx, elements };
}
const oldResponse = { success: true, data: [{ id: 'synthetic-reservation' }] };
test('API antiga é identificada explicitamente; exportação não descarrega dados incompletos', async () => {
  const { ctx } = browser(async () => oldResponse);
  await assert.rejects(vm.runInContext('apiGetAllPages("/api/reservations")', ctx), error => error.code === 'API_UPDATE_REQUIRED' && /Reinicia o servidor/.test(error.message));
});
test('lista apresenta incompatibilidade de versões como erro, sem afirmar que não existem reservas', async () => {
  const { ctx } = browser(async () => oldResponse);
  vm.runInContext('const list = createPagedCollection("/api/reservations", () => {});', ctx);
  assert.equal(await vm.runInContext('list.load()', ctx), false);
  assert.match(vm.runInContext('list.state.error', ctx), /versões diferentes/);
});
test('resposta malformada continua a ser recusada', async () => {
  const { ctx } = browser(async () => ({ ...oldResponse, pagination: null }));
  await assert.rejects(vm.runInContext('apiGetAllPages("/api/reservations")', ctx), /paginação inválida/);
});
test('painel antigo não mostra zero chegadas nem valores NaN', async () => {
  const { ctx, elements } = browser(async () => ({ success: true, data: { totalBilled: 1000, confirmedReservations: 10 } }));
  await vm.runInContext('renderDashboard()', ctx);
  assert.match(elements.get('dash-proximas').textContent, /versões diferentes/);
  assert.match(elements.get('m-proximas-list').textContent, /versões diferentes/);
  assert.equal(elements.get('mac-count').textContent, '—');
  assert.equal(elements.get('kpi-faturado').textContent, '—');
});
test('falha no painel mostra indisponibilidade em vez de ausência de reservas', async () => {
  const { ctx, elements } = browser(async () => { throw new Error('HTTP 503'); });
  await vm.runInContext('renderDashboard()', ctx);
  assert.match(elements.get('dash-proximas').textContent, /Não foi possível carregar/);
  assert.equal(elements.get('qk-checkin').textContent, '—');
  assert.equal(elements.get('qk-payments').textContent, '—');
});
test('timeout da lista apresenta erro e deixa de parecer uma lista vazia', async () => {
  const { ctx } = browser(async () => { throw Object.assign(new Error('aborted'), { name: 'AbortError' }); });
  vm.runInContext('const list = createPagedCollection("/api/reservations", () => {});', ctx);
  await vm.runInContext('list.load()', ctx);
  assert.match(vm.runInContext('list.state.error', ctx), /demorou demasiado/);
  assert.equal(vm.runInContext('list.state.loading', ctx), false);
});
test('calendário permite repetir após incompatibilidade ou timeout e recupera sem trocar de vista', async () => {
  for (const timeout of [false, true]) {
    let failed = true;
    const { ctx } = browser(async () => {
      if (failed && timeout) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
      return failed ? oldResponse : { success: true, data: [], pagination: { page: 1, total: 0, has_more: false } };
    });
    Object.assign(ctx, { calYear: 2030, calMonth: 0, calMode: 'calendar', drawCal() {}, drawTimeline() {} });
    const messages = [];
    ctx.captureMessage = (text, retry) => messages.push({ text, retry });
    runFrontend(fs.readFileSync(path.join(frontend, 'js/features/calendario/dados.js'), 'utf8'), ctx);
    vm.runInContext('calendarLoadMessage = captureMessage; function renderCalView() { return renderCal(); }', ctx);
    await vm.runInContext('renderCal()', ctx);
    assert.match(messages.at(-1).text, timeout ? /demorou demasiado/ : /versões diferentes/);
    assert.equal(typeof messages.at(-1).retry, 'function');
    failed = false; await messages.at(-1).retry();
    assert.equal(vm.runInContext('calendarDataKey === JSON.stringify(calendarPeriod("calendar"))', ctx), true);
  }
});
