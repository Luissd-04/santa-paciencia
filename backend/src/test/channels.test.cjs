// Os canais do backend (descrições do Google Calendar) e do frontend são os mesmos.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { CHANNEL_LABELS } = require('../config/channels');

test('lista de canais igual no backend e no frontend', () => {
  const exported = {};
  const context = {
    AppModules: { define: (_, api) => Object.assign(exported, api), core: { escapeHtml: String } },
    AppActions: { attrs: () => '' },
    document: { querySelectorAll: () => [] },
  };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../../../frontend/js/domain/channels.js'), 'utf8'), context);
  const frontend = Object.fromEntries(exported.CHANNELS.get().map(c => [c.id, c.label]));
  assert.deepEqual(frontend, CHANNEL_LABELS);
});
