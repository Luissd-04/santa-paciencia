// Orçamento de consultas da consola: a visão geral pede overview, organizações,
// incidentes, saúde e «Precisa de atenção» de uma vez, e isso tem de custar uma
// só recolha por organização (uma cópia partilhada), não uma por endpoint.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-platform-budget-'));
const previous = process.cwd();
process.chdir(temp);
Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test', EMAIL_ENABLED: 'false' });
require('../app');
const { db } = require('../config/database');
const orgs = require('../services/orgService');
const platform = require('../services/platformService');
const health = require('../services/platformHealth');
const opsStatusModule = require('../services/opsStatus');

const ORGS = 20;
const created = Array.from({ length: ORGS }, (_, i) => orgs.createOrganization(`Org ${i}`));

// Conta as chamadas ao opsStatus (a parte cara da recolha por organização).
const real = opsStatusModule.opsStatus;
let opsCalls = 0;
opsStatusModule.opsStatus = (...args) => { opsCalls++; return real(...args); };
after(() => { opsStatusModule.opsStatus = real; platform.setSnapshotTtl(0); db.close(); process.chdir(previous); fs.rmSync(temp, { recursive: true, force: true }); });

// O que a página geral da consola pede de uma vez.
function consolePage() {
  platform.getOverview();
  platform.listOrganizations();
  platform.listIncidents();
  health.getHealth();
  health.getAttention();
}

test('sem cópia partilhada, cada endpoint refaz a recolha (referência)', () => {
  platform.setSnapshotTtl(0);
  opsCalls = 0;
  consolePage();
  assert.ok(opsCalls >= ORGS * 5, `esperava muitas chamadas, houve ${opsCalls}`);
});

test('com cópia partilhada: a visão geral custa uma recolha, não sete', () => {
  platform.setSnapshotTtl(20000);
  opsCalls = 0;
  consolePage();
  assert.equal(opsCalls, ORGS, `opsStatus: ${opsCalls}`);
  // Um segundo carregamento dentro da validade não volta a recolher.
  opsCalls = 0;
  consolePage();
  assert.equal(opsCalls, 0);
});

test('atualizar ou criar uma organização invalida a cópia', () => {
  platform.setSnapshotTtl(20000);
  platform.listOrganizations();
  platform.updateOrganization(created[0].id, { status: 'suspended' });
  opsCalls = 0;
  const row = platform.listOrganizations().find(o => o.id === created[0].id);
  assert.equal(row.status, 'suspended');
  assert.equal(opsCalls, ORGS);
  orgs.createOrganization('Nova');
  opsCalls = 0;
  assert.equal(platform.listOrganizations().length, ORGS + 1);
  assert.equal(opsCalls, ORGS + 1);
});

test('ficha individual: só uma organização, sem recolher as outras', () => {
  platform.setSnapshotTtl(0);
  opsCalls = 0;
  platform.getOrganization(created[1].id);
  assert.equal(opsCalls, 1);
});
