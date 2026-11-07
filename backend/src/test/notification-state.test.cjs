// Notificações por pessoa: quando cada aviso apareceu e quando foi lido.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-notif-state-'));
const originalCwd = process.cwd();
process.chdir(temp);
Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test' });
const { db, initDatabase } = require('../config/database');
initDatabase();
const orgs = require('../services/orgService');
const auth = require('../services/authService');
const state = require('../services/notificationState');

const org = orgs.createOrganization('Avisos');
const ana = auth.createUser({ name: 'Ana', email: 'ana@example.invalid', password: 'SyntheticNotif123!' });
const rui = auth.createUser({ name: 'Rui', email: 'rui@example.invalid', password: 'SyntheticNotif123!' });
const checkin = { type: 'checkin_today', reservation_id: 'r1' };
const unpaid = { type: 'unpaid', reservation_id: 'r2' };

after(() => { db.close(); process.chdir(originalCwd); });

test('cada aviso fica com a hora em que apareceu e começa por ler', () => {
  const [first] = state.annotate(ana.id, org.id, [checkin], '2030-01-01T09:00:00.000Z');
  assert.deepEqual(first, { ...checkin, key: 'checkin_today|r1||', first_seen_at: '2030-01-01T09:00:00.000Z', read: false });
  // Mais tarde continua com a primeira hora.
  const again = state.annotate(ana.id, org.id, [checkin, unpaid], '2030-01-01T11:00:00.000Z');
  assert.deepEqual(again.map(n => n.first_seen_at), ['2030-01-01T09:00:00.000Z', '2030-01-01T11:00:00.000Z']);
});

test('lido é por pessoa; «todas» marca só as dessa pessoa', () => {
  state.annotate(rui.id, org.id, [checkin, unpaid]);
  assert.equal(state.markRead(ana.id, org.id, ['checkin_today|r1||']), 1);
  assert.deepEqual(state.annotate(ana.id, org.id, [checkin, unpaid]).map(n => n.read), [true, false]);
  assert.deepEqual(state.annotate(rui.id, org.id, [checkin, unpaid]).map(n => n.read), [false, false]);
  assert.equal(state.markRead(rui.id, org.id, 'all'), 2);
  assert.deepEqual(state.annotate(rui.id, org.id, [checkin, unpaid]).map(n => n.read), [true, true]);
});

test('um aviso que desaparece e volta é novo outra vez', () => {
  state.annotate(ana.id, org.id, [unpaid]);
  const back = state.annotate(ana.id, org.id, [checkin, unpaid], '2030-02-01T08:00:00.000Z');
  assert.deepEqual(back.map(n => [n.read, n.first_seen_at === '2030-02-01T08:00:00.000Z']), [[false, true], [false, false]]);
});
