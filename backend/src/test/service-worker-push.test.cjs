// O service worker mostra cada aviso com o ícone, o ícone da barra e o botão
// que o servidor escolheu (staffNotifier.pushPayload); sem eles, o logótipo.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadWorker() {
  const handlers = {};
  const shown = [];
  const self = {
    addEventListener: (type, handler) => { handlers[type] = handler; },
    registration: { showNotification: (title, options) => { shown.push({ title, options }); return Promise.resolve(); } },
    location: { origin: 'https://sp.example' },
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve() },
  };
  const source = fs.readFileSync(path.resolve(__dirname, '../../../frontend/service-worker.js'), 'utf8');
  vm.runInNewContext(source, { self, caches: {}, clients: self.clients, URL, Promise, console, Response: class {}, fetch: () => Promise.reject(new Error('offline')) });
  const push = async data => {
    let pending;
    handlers.push({ data: { json: () => data, text: () => '' }, waitUntil: promise => { pending = promise; } });
    await pending;
    return shown.at(-1);
  };
  return { push };
}

test('aviso com tipo: ícone, ícone da barra e botão do servidor', async () => {
  const payload = require('../services/staffNotifier').pushPayload({ kind: 'payment', title: 'Pagamento recebido · 120,00 €', body: 'Ana', url: '/reservas?reserva=r1', tag: 'sp-payment' });
  const { title, options } = await loadWorker().push(payload);
  assert.equal(title, 'Pagamento recebido · 120,00 €');
  assert.equal(options.icon, '/img/push/payment.png');
  assert.equal(options.badge, '/img/push/payment-badge.png');
  assert.deepEqual(JSON.parse(JSON.stringify(options.actions)), [{ action: 'open', title: 'Ver reserva' }]);
  assert.equal(options.data.url, '/reservas?reserva=r1');
});

test('aviso sem ícone (versão antiga do servidor): o logótipo, sem botões', async () => {
  const { options } = await loadWorker().push({ title: 'Santa Paciência', body: 'Teste' });
  assert.equal(options.icon, '/img/push/app.png');
  assert.equal(options.badge, '/img/push/app-badge.png');
  assert.equal(options.actions.length, 0);
});
