// Preço editado à mão fora do assistente, com dados sintéticos: adicionar
// hóspede e mudar datas (calendário) pedem para confirmar o total em vez de
// falhar; "Editar alojamento" abre o assistente com as noites editadas; e
// mudar só as notas não pede confirmação nem mexe no preço.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium, expect } = require('@playwright/test');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-price-edits-'));
process.chdir(temp);
Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test', EMAIL_ENABLED: 'false', FRONTEND_PATH: path.resolve(__dirname, '../../../frontend') });
const app = require('../app');
const { db } = require('../config/database');
const auth = require('../services/authService');
const orgs = require('../services/orgService');
let server, browser;

async function main() {
  const org = orgs.createOrganization('Preços editados');
  const user = auth.createUser({ name: 'Gestão', email: 'price-edits@example.invalid', password: 'SyntheticPrices123!' });
  orgs.createMembership({ organizationId: org.id, userId: user.id, role: 'owner' });
  const session = auth.createSession(user.id, org.id).sessionId;
  db.prepare(`INSERT INTO organization_settings(organization_id, key, value) VALUES (?, 'services', '[{"id":"tourist_tax","active":false}]')
    ON CONFLICT(organization_id, key) DO UPDATE SET value = excluded.value`).run(org.id);
  db.prepare(`INSERT INTO accommodations(id, organization_id, name, type, price_per_night, max_guests) VALUES ('a', ?, 'Suite A', 'alojamento', 100, 4)`).run(org.id);
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const api = async (method, url, body) => {
    const response = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', Cookie: `${auth.SESSION_COOKIE}=${session}` }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  // 3 noites, a do meio a 150 € (editada): total 350 €.
  const create = async (month) => {
    const nights = ['10', '11', '12'].map(day => ({ date: `2035-${month}-${day}`, price: day === '11' ? 150 : 100 }));
    const result = await api('POST', '/api/reservations', { accommodation_id: 'a', check_in: `2035-${month}-10`, check_out: `2035-${month}-13`,
      num_adults: 2, num_children: 0, guest: { name: `Hóspede ${month}`, email: `h${month}@example.invalid` }, nightly_prices: nights });
    assert.equal(result.status, 201, JSON.stringify(result.body));
    return result.body.data;
  };
  const row = id => db.prepare('SELECT total_amount, nightly_prices, notes, check_in, guests_data FROM reservations WHERE id = ?').get(id);
  const nightly = id => JSON.parse(row(id).nightly_prices).map(n => n.price);

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await context.route('https://**/*', route => route.abort());
  await context.addCookies([{ name: auth.SESSION_COOKIE, value: session, url: base }]);
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.evaluate(() => AppModules.core.ensureFeature('reservas'));
  const confirmDialog = page.locator('.modal-bg.open .modal').filter({ hasText: 'Confirmar o novo total?' });

  // 1. Adicionar hóspede: pede confirmação do total; cancelar não grava; confirmar grava.
  const guest = await create('03');
  assert.equal(guest.total_amount, 350);
  await page.evaluate(id => AppModules.reservas.showDetail(id), guest.id);
  await page.evaluate(id => AppModules.reservas.openAddGuestForm(id), guest.id);
  await page.locator('#ag-name').fill('Acompanhante Sintético');
  await page.locator('#ag-save-btn').click();
  await expect(confirmDialog).toBeVisible();
  await expect(confirmDialog).toContainText(/350,00\s€/);
  await confirmDialog.locator('[data-pc-cancel]').click();
  assert.equal(JSON.parse(row(guest.id).guests_data || '[]').length, 0, 'cancelar não grava');
  await page.locator('#ag-save-btn').click();
  await confirmDialog.locator('[data-pc-confirm]').click();
  await expect(page.locator('.toast').filter({ hasText: 'Hóspede adicionado' })).toBeVisible();
  assert.equal(JSON.parse(row(guest.id).guests_data).length, 1);
  assert.equal(row(guest.id).total_amount, 350, 'o total confirmado mantém-se');

  // 2. Mudar datas (como ao arrastar no calendário): confirmação em vez de erro.
  const moved = await create('04');
  const pending = page.evaluate(([id, total]) => AppModules.core.putReservationConfirmingTotal(id, { check_in: '2035-04-11', check_out: '2035-04-14' }, total), [moved.id, moved.total_amount]);
  await expect(confirmDialog).toBeVisible();
  await expect(confirmDialog).toContainText('Total atual');
  await confirmDialog.locator('[data-pc-confirm]').click();
  assert.equal((await pending).success, true);
  assert.equal(row(moved.id).check_in, '2035-04-11');
  assert.deepEqual(nightly(moved.id), [150, 100, 100], 'a noite editada (dia 11) mantém o preço');

  // 3. "Editar alojamento" abre o assistente com as noites editadas.
  const room = await create('05');
  await page.evaluate(id => AppModules.reservas.showDetail(id), room.id);
  await page.evaluate(() => document.getElementById('rdv2-actions-menu')?.showPopover?.());
  await page.locator('.rdv2-action-link', { hasText: 'Editar alojamento' }).first().evaluate(el => el.click());
  await expect(page.locator('#modal-bg')).toHaveClass(/open/);
  await expect(page.locator('#modal-title')).toContainText('Editar Reserva');
  await expect(page.locator('#resf-nightly-grid .resf-nightly-row[data-date="2035-05-11"] input')).toHaveValue('150.00');
  await expect(page.locator('.rdv2-acc-panel')).toHaveCount(0);

  // 4. Mudar só as notas: grava sem pedir confirmação e sem mexer no preço.
  await page.locator('#f-notas').fill('Só uma nota');
  await page.locator('#btn-guardar').click();
  await expect(page.locator('#modal-bg')).not.toHaveClass(/open/);
  await expect(page.locator('.modal-bg.open .modal').filter({ hasText: 'Alterar valores da estadia?' })).toHaveCount(0);
  assert.equal(row(room.id).notes, 'Só uma nota');
  assert.equal(row(room.id).total_amount, 350);
  assert.deepEqual(nightly(room.id), [100, 150, 100]);

  assert.deepEqual(errors, []);
  console.log('OK: preço editado — adicionar hóspede e mudar datas pedem confirmação, Editar alojamento abre o assistente, notas gravam sem aviso.');
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  db.close();
});
