const { runFrontend } = require('../test-support/frontend.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function browser() {
  const nodes = [];
  const context = vm.createContext({ window: {}, setTimeout, clearTimeout,
    document: { createElement: tag => ({ tag, remove() { this.removed = true; } }), head: { appendChild: node => nodes.push(node) } },
  });
  runFrontend(fs.readFileSync(path.resolve(__dirname, '../../../frontend/js/domain/libraries.js'), 'utf8'), context);
  return { context, nodes };
}
test('bibliotecas só carregam por pedido; consumidores concorrentes partilham o recurso', async () => {
  const { context, nodes } = browser();
  assert.equal(nodes.length, 0);
  const a = vm.runInContext('loadLibrary("xlsx")', context);
  const b = vm.runInContext('loadLibrary("xlsx")', context);
  assert.equal(nodes.length, 1); assert.equal(nodes[0].src, '/js/vendor/xlsx-0.20.3.min.js');
  context.window.XLSX = {}; nodes[0].onload();
  await Promise.all([a, b]);
  await vm.runInContext('loadLibrary("xlsx")', context);
  assert.equal(nodes.length, 1);
});
test('falha de rede remove recurso incompleto e permite nova tentativa', async () => {
  const { context, nodes } = browser();
  const first = vm.runInContext('loadLibrary("chart")', context);
  nodes[0].onerror();
  await assert.rejects(first, /Não foi possível/);
  assert.equal(nodes[0].removed, true);
  const retry = vm.runInContext('loadLibrary("chart")', context);
  assert.equal(nodes.length, 2);
  assert.match(nodes[1].integrity, /^sha384-/); assert.equal(nodes[1].crossOrigin, 'anonymous');
  context.window.Chart = function() {}; nodes[1].onload(); await retry;
});
test('plugin de tabelas PDF carrega depois do jsPDF', async () => {
  const { context, nodes } = browser();
  const pending = vm.runInContext('loadLibrary("pdf")', context);
  assert.equal(nodes.length, 1); assert.match(nodes[0].src, /jspdf\/4\.2\.1/);
  context.window.jspdf = { jsPDF: { API: {} } }; nodes[0].onload();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(nodes.length, 2); assert.match(nodes[1].src, /jspdf-autotable/);
  context.window.jspdf.jsPDF.API.autoTable = function() {}; nodes[1].onload(); await pending;
});
