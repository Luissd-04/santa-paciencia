const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const frontend = path.resolve(__dirname, '../../../frontend');
const read = file => fs.readFileSync(path.join(frontend, file), 'utf8');
function runtime() {
  const listeners = new Map();
  const context = vm.createContext({ console, window: {}, sessionStorage: { getItem: () => null },
    document: { addEventListener(type, fn, capture) { assert(!listeners.has(type)); listeners.set(type, { fn, capture }); } },
  });
  vm.runInContext(read('js/domain/modules.js') + '\n' + read('js/domain/actions.js'), context);
  return { context, listeners };
}
test('módulos reais mantêm o estado privado e limpam-no ao trocar de sessão', () => {
  const { context } = runtime();
  vm.runInContext(read('js/state.js'), context);
  assert.equal(vm.runInContext('typeof currentUser', context), 'undefined');
  assert.equal(vm.runInContext('typeof accommodations', context), 'undefined');
  vm.runInContext("AppModules.core.currentUser = { id: 'SYNTHETIC-USER' }; AppModules.core.accommodations = [{ name: 'SYNTHETIC-PRIVATE' }];", context);
  assert.equal(vm.runInContext('AppModules.core.accommodations.length', context), 1);
  vm.runInContext('AppModules.resetPrivateState()', context);
  assert.equal(vm.runInContext('AppModules.core.currentUser', context), null);
  assert.equal(vm.runInContext('AppModules.core.accommodations.length', context), 0);
  assert.equal(vm.runInContext('AppModules.sessionVersion', context), 1);
});

test('datas dos formulários usam ISO e não exigem carregar Reservas', () => {
  const { context } = runtime();
  vm.runInContext(read('js/domain/dates.js') + '\n' + read('js/helpers.js'), context);
  assert.equal(vm.runInContext("AppModules.core.formatDateForStandardInput('2026-09-15')", context), '2026-09-15');
  assert.equal(vm.runInContext("AppModules.core.normalizeIsoDateValue('15/09/2026')", context), '2026-09-15');
  assert.equal(vm.runInContext('AppModules.reservas.openModal', context), undefined);
});
test('eventos delegados preservam ordem, argumentos e stopPropagation', () => {
  const { context, listeners } = runtime();
  const calls = [];
  context.capture = value => calls.push(value);
  vm.runInContext("AppActions.register({ child: (el,e,args) => { if (e.currentTarget !== el) throw new Error('currentTarget incorreto'); capture(args[0]); e.stopPropagation(); }, parent: () => capture('parent') });", context);
  const element = (name, args = []) => ({ getAttribute(key) { return key === 'data-on-click' ? name : key === 'data-args-click' ? JSON.stringify(args) : null; }, hasAttribute() { return false; } });
  const guest = `O'Connor \" <img onerror=alert(1)>`;
  const child = element('child', [guest]), parent = element('parent');
  const event = { target: child, composedPath: () => [child, parent], stopPropagation() { this.cancelBubble = true; }, preventDefault() {} };
  listeners.get('click').fn(event);
  assert.deepEqual(calls, [guest]);
  assert.equal(context.injected, undefined);
  assert.throws(() => vm.runInContext("AppActions.register({ child: () => {} });", context), /duplicada/);
});
test('eventos sem bubbling e formulários continuam funcionais sem scripts inline', () => {
  const { context, listeners } = runtime();
  context.didLoad = false;
  vm.runInContext("AppActions.register({ image: () => { didLoad = true; } }, 'load'); AppActions.register({ save: (el,e) => e.preventDefault() }, 'submit');", context);
  const image = { getAttribute: key => key === 'data-on-load' ? 'image' : null, hasAttribute: () => false };
  listeners.get('load').fn({ target: image });
  assert.equal(context.didLoad, true);
  assert.equal(listeners.get('load').capture, true);
  let prevented = false;
  const form = { getAttribute: key => key === 'data-on-submit' ? 'save' : null, hasAttribute: () => false };
  listeners.get('submit').fn({ composedPath: () => [form], preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
});
test('interfaces, ações e ausência de eventos inline são verificadas estaticamente', () => {
  const result = require('../scripts/check-frontend-modules.cjs').checkFrontendModules(frontend);
  assert(result.actions > 0);
});
