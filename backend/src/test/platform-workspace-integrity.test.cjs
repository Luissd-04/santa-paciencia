const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const previous = process.cwd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-workspace-integrity-'));
process.chdir(temp);
Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test', EMAIL_ENABLED: 'false', PLATFORM_ADMIN_EMAILS: 'admin@example.invalid' });
require('../app');
const { db } = require('../config/database');
const auth = require('../services/authService');
const orgs = require('../services/orgService');
const ws = require('../services/platformWorkspace');
const trials = require('../services/platformTrials');
const platformTasks = require('../services/platformTasks');

const admin = auth.createUser({ name: 'admin', email: 'admin@example.invalid', password: 'SyntheticPlatform123!' });
db.prepare("UPDATE users SET platform_admin=1,platform_role='admin' WHERE id=?").run(admin.id);
const orgA = orgs.createOrganization('Cliente A');
const orgB = orgs.createOrganization('Cliente B');

after(() => {
  db.close();
  process.chdir(previous);
  fs.rmSync(temp, { recursive: true, force: true });
});

const statusOf = fn => {
  try { fn(); } catch (error) { return error.status ?? error.statusCode; }
  return null;
};
const count = sql => db.prepare(sql).get().n;

test('mover um contacto de A para B com uma tarefa em A é recusado (409)', () => {
  const lead = ws.save(admin, 'lead', null, { title: 'Contacto A', organization_id: orgA.id, data: {} });
  platformTasks.create(admin, { title: 'Tarefa em A', department: 'sales', record_id: lead.id });
  assert.equal(db.prepare('SELECT organization_id FROM platform_tasks WHERE record_id=?').get(lead.id).organization_id, orgA.id);
  const status = statusOf(() => ws.save(admin, 'lead', lead.id, { title: 'Contacto A', organization_id: orgB.id, revision: lead.revision, data: lead.data }));
  assert.equal(status, 409);
  assert.equal(db.prepare('SELECT organization_id FROM platform_records WHERE id=?').get(lead.id).organization_id, orgA.id);
});

test('criar teste C a partir de um contacto com proposta no cliente B é recusado sem escritas parciais', () => {
  const lead = ws.save(admin, 'lead', null, { title: 'Contacto livre', data: {} });
  ws.save(admin, 'proposal', null, { title: 'Proposta em B', related_id: lead.id, organization_id: orgB.id, data: { amount_cents: 1000 } });
  const orgsBefore = count('SELECT COUNT(*) n FROM organizations');
  const accessBefore = count('SELECT COUNT(*) n FROM platform_trial_access');
  const status = statusOf(() => trials.create(admin, { name: 'Cliente C', owner_email: 'c@example.invalid', mode: 'private', days: 14, lead_id: lead.id }));
  assert.equal(status, 409);
  assert.equal(count('SELECT COUNT(*) n FROM organizations'), orgsBefore);
  assert.equal(count('SELECT COUNT(*) n FROM platform_trial_access'), accessBefore);
  assert.equal(db.prepare('SELECT organization_id FROM platform_records WHERE id=?').get(lead.id).organization_id, null);
});

test('criar teste privado move o contacto e os dependentes sem cliente', () => {
  const lead = ws.save(admin, 'lead', null, { title: 'Contacto migrável', data: {} });
  const proposal = ws.save(admin, 'proposal', null, { title: 'Proposta livre', related_id: lead.id, data: { amount_cents: 500 } });
  const task = platformTasks.create(admin, { title: 'Tarefa livre', department: 'sales', record_id: lead.id });
  const created = trials.create(admin, { name: 'Cliente D', owner_email: 'd@example.invalid', mode: 'private', days: 14, lead_id: lead.id });
  for (const [table, id] of [['platform_records', lead.id], ['platform_records', proposal.id], ['platform_tasks', task.id]]) {
    assert.equal(db.prepare(`SELECT organization_id FROM ${table} WHERE id=?`).get(id).organization_id, created.id, table);
  }
});

test('movimento liquidado é imutável; a anulação exige motivo e deixa revisão', () => {
  const entry = ws.save(admin, 'entry', null, { title: 'Pagamento', status: 'paid', data: { direction: 'income', date: '2026-11-11', paid_date: '2026-11-11', amount_cents: 12000 } });
  const edit = { title: 'Pagamento', revision: entry.revision, data: { ...entry.data, amount_cents: 1 } };
  assert.ok([400, 409].includes(statusOf(() => ws.save(admin, 'entry', entry.id, { ...edit, status: 'paid' }))));
  assert.equal(statusOf(() => ws.save(admin, 'entry', entry.id, { ...edit, status: 'cancelled' })), 409);
  assert.equal(statusOf(() => ws.save(admin, 'entry', entry.id, { title: 'Pagamento', revision: entry.revision, status: 'cancelled', data: entry.data })), 400);
  const cancelled = ws.save(admin, 'entry', entry.id, { title: 'Pagamento', revision: entry.revision, status: 'cancelled', reason: 'Valor lançado por engano', data: entry.data });
  assert.equal(cancelled.status, 'cancelled');
  const revisions = db.prepare('SELECT * FROM platform_record_revisions WHERE record_id=?').all(entry.id);
  assert.equal(revisions.length, 1);
  assert.equal(revisions[0].reason, 'Valor lançado por engano');
  assert.equal(JSON.parse(revisions[0].before_json).data.amount_cents, 12000);
  assert.equal(JSON.parse(revisions[0].before_json).status, 'paid');
  assert.equal(JSON.parse(revisions[0].after_json).status, 'cancelled');
});

test('catálogo não escala com o número de tarefas', () => {
  const measure = () => {
    const original = db.prepare;
    let statements = 0;
    db.prepare = function counted(...args) { statements++; return original.apply(this, args); };
    try { ws.catalog(admin); } finally { db.prepare = original; }
    return statements;
  };
  const few = measure();
  const insert = db.prepare("INSERT INTO platform_tasks(id,title,type,status,priority,department) VALUES(?,?,'idea','todo','normal','product')");
  db.transaction(() => { for (let i = 0; i < 1000; i++) insert.run(`synthetic-${i}`, `Tarefa ${i}`); })();
  const many = measure();
  assert.ok(Math.abs(many - few) <= 5, `catalog: ${few} vs ${many} instruções`);
});
