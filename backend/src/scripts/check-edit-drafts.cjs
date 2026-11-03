// Alterações por guardar na edição de uma reserva: ficam num rascunho quando a
// sessão expira ou a app fecha, aparecem numa faixa no topo ao voltar, e a
// edição retoma-as (guardar ou descartar). Dados inventados.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium, expect } = require('@playwright/test');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-edit-drafts-'));
process.chdir(temp);
Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test', EMAIL_ENABLED: 'false', FRONTEND_PATH: path.resolve(__dirname, '../../../frontend') });
const app = require('../app');
const { db } = require('../config/database');
const auth = require('../services/authService');
const orgs = require('../services/orgService');
let server, browser;

const PASSWORD = 'SyntheticDrafts123!';

async function main() {
  const org = orgs.createOrganization('Rascunhos');
  const user = auth.createUser({ name: 'Rita Teste', email: 'rita@example.invalid', password: PASSWORD });
  orgs.createMembership({ organizationId: org.id, userId: user.id, role: 'owner' });
  db.prepare("INSERT INTO accommodations (id, organization_id, name, type, price_per_night, max_guests) VALUES ('unit', ?, 'Suite Oliveira', 'alojamento', 100, 4)").run(org.id);
  db.prepare("INSERT INTO guests (id, organization_id, name, email) VALUES ('g', ?, 'Marta Silva', 'marta@example.invalid')").run(org.id);
  db.prepare(`INSERT INTO reservations (id, organization_id, guest_id, accommodation_id, check_in, check_out, nights, num_guests, num_adults, total_amount, status, notes)
    VALUES ('res', ?, 'g', 'unit', '2035-05-10', '2035-05-12', 2, 2, 2, 200, 'confirmada', 'Notas originais')`).run(org.id);
  const notes = () => db.prepare("SELECT notes FROM reservations WHERE id = 'res'").get().notes;

  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, serviceWorkers: 'block' });
  await context.route('https://**/*', route => route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const login = async () => {
    await page.locator('#login-email').fill('rita@example.invalid');
    await page.locator('#login-password').fill(PASSWORD);
    await page.locator('#login-submit').click();
    await expect(page.locator('body')).toHaveClass(/auth-ready/);
  };
  await page.goto(base);
  await login();
  const banner = page.locator('#edit-drafts-banner');
  await expect(banner).toBeHidden();

  // 1. Sessão expira a meio da edição: as alterações ficam e a faixa aparece.
  await page.evaluate(async () => { await AppModules.core.ensureFeature('reservas'); await AppModules.reservas.openEditModal('res'); });
  await expect(page.locator('#modal-bg')).toHaveClass(/open/);
  await page.locator('#f-notas').fill('Chegam às 22h, deixar a chave');
  await expect(banner).toContainText('Marta Silva', { timeout: 5000 });
  db.prepare('DELETE FROM auth_sessions').run();
  await page.evaluate(() => AppModules.core.apiGet('/api/reservations?limit=1').catch(() => null));
  await expect(page.locator('#login-submit')).toBeVisible();
  await login();
  await expect(banner).toContainText('Há uma reserva com alterações por guardar');
  await expect(banner).toContainText('Marta Silva');

  // Continuar: a edição abre com as alterações e o aviso; guardar limpa tudo.
  await banner.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.locator('#f-notas')).toHaveValue('Chegam às 22h, deixar a chave');
  await expect(page.locator('#resf-draft-notice')).toBeVisible();
  await expect(page.locator('#resf-draft-notice')).toContainText('Alterações por guardar recuperadas');
  await page.locator('#btn-guardar').click();
  await expect.poll(notes).toBe('Chegam às 22h, deixar a chave');
  await expect(banner).toBeHidden();
  // Depois de guardar, a app volta à ficha da reserva (veio de «Continuar»).
  await expect(page.getByRole('button', { name: 'Ficha de reserva' })).toBeVisible();

  // 2. App fechada com alterações: depois de recarregar, «Descartar» volta à
  // reserva como está no servidor.
  await page.evaluate(() => AppModules.reservas.openEditModal('res'));
  await page.locator('#f-notas').fill('Rascunho a descartar');
  await expect(banner).toBeVisible({ timeout: 5000 });
  await page.reload();
  await expect(page.locator('body')).toHaveClass(/auth-ready/);
  await expect(banner).toContainText('Marta Silva');
  await banner.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.locator('#f-notas')).toHaveValue('Rascunho a descartar');
  await page.locator('#resf-draft-notice .resf-draft-discard').click();
  await expect(page.locator('#f-notas')).toHaveValue('Chegam às 22h, deixar a chave');
  await expect(page.locator('#resf-draft-notice')).toBeHidden();
  await expect(banner).toBeHidden();
  assert.equal(notes(), 'Chegam às 22h, deixar a chave');

  // 3. O logout apaga os rascunhos deste aparelho.
  await page.locator('#f-notas').fill('Outra alteração');
  await expect(banner).toBeVisible({ timeout: 5000 });
  page.once('dialog', dialog => dialog.accept());
  await page.keyboard.press('Escape');
  await expect(page.locator('#modal-bg')).not.toHaveClass(/open/);
  await expect(banner).toBeHidden(); // descartar ao fechar também o apaga
  await page.evaluate(() => AppModules.reservas.openEditModal('res'));
  await page.locator('#f-notas').fill('Antes do logout');
  await expect(banner).toBeVisible({ timeout: 5000 });
  await page.evaluate(() => AppModules.core.logout());
  await expect(page.locator('#login-submit')).toBeVisible();
  assert.equal(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('sp_reserva_edit_drafts_v1:')).length), 0);

  assert.deepEqual(errors, []);
  console.log('OK: rascunhos da edição — sessão expirada, faixa no topo, continuar e guardar, app fechada e descartar, fechar a descartar, logout.');
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  db.close();
});
