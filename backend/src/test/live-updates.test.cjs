const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const live = require('../services/liveUpdates');

function connect(organizationId) {
  const req = new EventEmitter(); req.user = { organization_id: organizationId };
  const res = { chunks: [], statusCode: 200, status(code) { this.statusCode = code; return this; }, set() { return this; },
    json(body) { this.body = body; return this; }, write(chunk) { this.chunks.push(chunk); } };
  live.subscribe(req, res);
  return { req, res, changes: () => res.chunks.filter(c => c.startsWith('event: change')).map(c => JSON.parse(c.split('data: ')[1])) };
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let open = [];
afterEach(() => { for (const page of open) page.req.emit('close'); open = []; live.stopClock(); });

test('junta avisos seguidos num só, por organização, com os separadores de origem', async () => {
  const a = connect('org-a'), b = connect('org-b'); open.push(a, b);
  assert.match(a.res.chunks.join(''), /event: ready/);
  live.publish('org-a');
  live.publish('org-a', ['events'], { origin: 'tab-aaaaaaaa' });
  await wait(400);
  assert.deepEqual(a.changes(), [{ topics: ['notifications', 'events'], origins: ['server', 'tab-aaaaaaaa'] }]);
  assert.deepEqual(b.changes(), []);
  a.req.emit('close'); assert.equal(live.connections('org-a'), 0);
});

test('alterações com sucesso avisam; erros, leituras e pedidos silenciosos não', async () => {
  const page = connect('org'); open.push(page);
  const run = ({ method = 'POST', status = 200, quiet = false, client } = {}) => {
    const res = new EventEmitter(); res.statusCode = status; res.locals = quiet ? { liveQuiet: true } : {};
    const req = { method, user: { organization_id: 'org' }, get: () => client };
    live.afterWrite(req, res, () => {}); res.emit('finish');
  };
  run({ method: 'GET' }); run({ status: 400 }); run({ quiet: true });
  await wait(400); assert.deepEqual(page.changes(), []);
  run({ client: 'bad id!' });
  await wait(400); assert.deepEqual(page.changes(), [{ topics: live.TOPICS, origins: ['unknown'] }]);
});

test('limite de ligações por organização', () => {
  for (let i = 0; i < 50; i++) open.push(connect('busy'));
  const extra = connect('busy');
  assert.equal(extra.res.statusCode, 429); assert.equal(live.connections('busy'), 50);
});
