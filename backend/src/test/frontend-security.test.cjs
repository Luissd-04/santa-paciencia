const { runFrontend } = require('../test-support/frontend.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const frontend = path.resolve(__dirname, '../../../frontend');
const decodeAttribute = value => value.replace(/&(amp|lt|gt|quot|#039|#39);/g, (_, name) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#039': "'", '#39': "'" })[name]);

test('nome público com aspas permanece texto no botão de eliminar hóspede', () => {
  const elements = new Map();
  const document = { getElementById(id) {
    if (!elements.has(id)) elements.set(id, { style: {}, innerHTML: '' });
    return elements.get(id);
  } };
  const context = vm.createContext({ document, window: {}, SS: { get: (_, fallback) => fallback }, console });
  for (const file of ['js/helpers.js', 'js/domain/pagination.js', 'js/hospedes.js', 'js/features/hospedes/paises.js', 'js/features/hospedes/lista.js']) runFrontend(fs.readFileSync(path.join(frontend, file), 'utf8'), context);
  const names = ["O'Connor", "');globalThis.injected=true;//", '\" onmouseover=\"globalThis.injected=true', 'Linha\nseguinte & <texto> \\'];
  for (const name of names) {
    context.guest = { id: 'synthetic-id', name };
    vm.runInContext("filteredHospedes = () => [guest]; flagImg = () => ''; lcIcon = () => ''; renderHospedesList();", context);
    const html = elements.get('hospedes-lista-body').innerHTML;
    const encoded = html.match(/data-on-click="lista-delete-guest-[^"]+" data-args-click="([^"]*)"/)[1];
    const received = JSON.parse(decodeAttribute(encoded));
    assert.deepEqual(received, ['synthetic-id', name]);
    assert.equal(context.injected, undefined);
    assert.equal(html.includes('onmouseover="globalThis.injected'), false);
  }
});

test('alojamentos da página pública não conseguem injetar HTML ou URLs executáveis', () => {
  const elements = new Map();
  const document = {
    body: { innerHTML: '' },
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, { style: {}, innerHTML: '', textContent: '', classList: { add() {}, remove() {} } });
      return elements.get(id);
    },
  };
  const context = vm.createContext({
    document, window: {}, location: { origin: 'https://example.invalid', pathname: '/reservar/teste', search: '' },
    URL, URLSearchParams, setTimeout, clearTimeout, console,
  });
  for (const file of ['js/public-reservation.js', 'js/features/public-reservation/landing.js']) {
    runFrontend(fs.readFileSync(path.join(frontend, file), 'utf8'), context);
  }
  context.AppModules.booking.state.property = {
    id: 'property', name: '<img src=x onerror="globalThis.injected=true">', images: [{ url: 'javascript:alert(1)' }],
  };
  context.AppModules.booking.state.units = [{
    id: '" onmouseover="globalThis.injected=true', name: '<svg onload="globalThis.injected=true">', cover_image: 'javascript:alert(1)', max_guests: 2,
  }];
  context.AppModules.booking.state.availability = [];
  context.AppModules.booking.state.selectedUnitId = 'property';
  context.AppModules.booking.nights = () => 0;
  context.AppModules.booking.iso = value => value;
  context.AppModules.booking.totalGuests = () => 1;
  context.renderUnits();
  const html = elements.get('unit-list').innerHTML;
  assert.equal(context.injected, undefined);
  assert.equal(html.includes('javascript:'), false);
  assert.equal(html.includes('<svg'), false);
  assert.match(html, /&lt;svg onload=/);
  assert.equal(html.includes(' onmouseover="globalThis.injected'), false);
});

test('logout cancela respostas privadas que ainda estão a ser lidas', async () => {
  let finish;
  const body = new Promise(resolve => { finish = resolve; });
  const context = vm.createContext({ API_BASE: '', AbortController, setTimeout, clearTimeout,
    fetch: async () => ({ ok: true, status: 200, json: () => body }) });
  runFrontend(fs.readFileSync(path.join(frontend, 'js/helpers.js'), 'utf8'), context);
  const request = vm.runInContext("apiGet('/api/guests')", context);
  await Promise.resolve();
  vm.runInContext('cancelApiRequests()', context);
  finish({ data: ['SYNTHETIC-PRIVATE'] });
  await assert.rejects(request, error => error.name === 'AbortError');
});
