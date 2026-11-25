// Textos e pequenos acertos das páginas públicas e dos emails (auditoria de
// 25/11): países em português e inglês, datas legíveis, migração dos textos
// dos emails só para modelos não editados.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-public-copy-'));
const originalCwd = process.cwd();
process.chdir(temp);
Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test', PUBLIC_APP_URL: 'https://exemplo.invalid' });
const { db, initDatabase } = require('../config/database');
initDatabase();
after(() => { db.close(); process.chdir(originalCwd); fs.rmSync(temp, { recursive: true, force: true }); });

const frontend = path.join(__dirname, '..', '..', '..', 'frontend', 'js');
function load(...files) {
  const { runFrontend } = require('../test-support/frontend.cjs');
  const context = vm.createContext({ window: {}, Intl, console });
  context.window = context;
  for (const file of files) runFrontend(fs.readFileSync(path.join(frontend, file), 'utf8'), context);
  return context;
}

test('países: «United Kingdom» e «Reino Unido» dão o mesmo, com código ISO', () => {
  const countries = load('domain/countries.js').AppModules.countries;
  for (const text of ['United Kingdom', 'Reino Unido', 'reino unido', 'UK', 'gb']) assert.equal(countries.find(text)?.code, 'GB', text);
  assert.equal(countries.normalize('United Kingdom'), 'Reino Unido');
  assert.equal(countries.normalize('Germany'), 'Alemanha');
  assert.equal(countries.normalize('Holanda'), 'Países Baixos');
  assert.equal(countries.normalize('Lugar nenhum'), 'Lugar nenhum');
  assert.equal(countries.search('united kin')[0].code, 'GB');
  assert.equal(countries.search('reino')[0].code, 'GB');
  assert.equal(countries.search('germ')[0].code, 'DE');
  assert.ok(countries.all().length > 240);
  assert.equal(countries.matches('portugal', 'PT'), true);
  assert.equal(countries.matches('spain', 'ES'), true);
});

test('datas: «sex, 15 jan 2027» e prazos com «(hora de Portugal)»', () => {
  const dates = load('domain/dates.js').ReservationDates;
  assert.equal(dates.formatDayLabel('2027-01-15', { year: true }), 'sex, 15 jan 2027');
  assert.equal(dates.formatDayLabel('2027-01-15'), 'sex, 15 jan');
  assert.equal(dates.formatDeadline('2027-01-15T14:00:00Z'), 'sex, 15 jan 2027, às 14:00 (hora de Portugal)');
  assert.equal(dates.formatDeadline('2027-07-15T14:00:00Z', { zone: false }), 'qui, 15 jul 2027, às 15:00');
});

test('textos dos emails: só os modelos não editados mudam, com cópia', () => {
  const { TEMPLATES } = require('../config/emailTemplateDefaults');
  assert.equal(TEMPLATES.pagamento.subject, '{{assunto_pagamento}} — {{alojamento}}');
  assert.equal(TEMPLATES.cancelamento_politica.subject, 'Reserva cancelada — {{alojamento}}');
  for (const slug of ['portal_hospede', 'aviso_restante', 'cancelamento_politica', 'obrigado']) assert.doesNotMatch(TEMPLATES[slug].body, /reserva em <strong>|visita em <strong>/, slug);
  const orgService = require('../services/orgService');
  const a = orgService.createOrganization('Textos A').id, b = orgService.createOrganization('Textos B').id;
  const old = { pagamento: 'Pagamento recebido — {{alojamento}}', cancelamento_politica: 'Cancelamento — Reserva {{referencia}}' };
  const oldPortal = TEMPLATES.portal_hospede.body.replace('da sua reserva (<strong>{{alojamento}}</strong>) encontra', 'da sua reserva em <strong>{{alojamento}}</strong> encontra');
  const set = (org, slug, field, value) => db.prepare(`UPDATE organization_email_templates SET ${field} = ? WHERE organization_id = ? AND slug = ?`).run(value, org, slug);
  for (const org of [a, b]) { set(org, 'pagamento', 'subject', old.pagamento); set(org, 'cancelamento_politica', 'subject', old.cancelamento_politica); set(org, 'portal_hospede', 'body', oldPortal); }
  set(b, 'pagamento', 'subject', 'O meu assunto');
  set(b, 'portal_hospede', 'body', '<p>Texto editado</p>');
  db.prepare("DELETE FROM schema_migrations WHERE id = '20261125_email_wording'").run();
  require('../config/migrations-guest-journey')(db);
  const row = (org, slug) => db.prepare('SELECT subject, body FROM organization_email_templates WHERE organization_id = ? AND slug = ?').get(org, slug);
  assert.equal(row(a, 'pagamento').subject, '{{assunto_pagamento}} — {{alojamento}}');
  assert.equal(row(a, 'cancelamento_politica').subject, 'Reserva cancelada — {{alojamento}}');
  assert.equal(row(a, 'portal_hospede').body, TEMPLATES.portal_hospede.body);
  assert.equal(row(b, 'pagamento').subject, 'O meu assunto');
  assert.equal(row(b, 'portal_hospede').body, '<p>Texto editado</p>');
  assert.equal(row(b, 'cancelamento_politica').subject, 'Reserva cancelada — {{alojamento}}');
  const backups = db.prepare("SELECT organization_id, slug FROM organization_email_templates_backup WHERE reason = '20261125_email_wording'").all();
  assert.ok(backups.some(x => x.organization_id === a && x.slug === 'pagamento'), 'cópia do assunto antigo');
  assert.ok(!backups.some(x => x.organization_id === b && x.slug === 'pagamento'), 'assunto editado não é copiado');
});
