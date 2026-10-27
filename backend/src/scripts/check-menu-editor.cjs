// Menu do telemóvel com dados sintéticos: conta fixa no fundo, editar a ordem
// (arrastar e teclado), esconder itens, trocar atalhos da barra, guardar por
// pessoa, recarregar e repor o original. O menu do computador não muda.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium, expect } = require('@playwright/test');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-menu-editor-'));
process.chdir(temp);
Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test', EMAIL_ENABLED: 'false', FRONTEND_PATH: path.resolve(__dirname, '../../../frontend') });
const app = require('../app');
const { db } = require('../config/database');
const auth = require('../services/authService');
const orgs = require('../services/orgService');
let server, browser;

async function main() {
  const org = orgs.createOrganization('Menu editável');
  const user = auth.createUser({ name: 'Luísa Teste', email: 'menu-editor@example.invalid', password: 'SyntheticMenu123!' });
  orgs.createMembership({ organizationId: org.id, userId: user.id, role: 'owner' });
  const session = auth.createSession(user.id, org.id).sessionId;
  const saved = () => JSON.parse(db.prepare('SELECT menu_prefs FROM memberships WHERE user_id = ?').get(user.id).menu_prefs || 'null');
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 375, height: 667 }, serviceWorkers: 'block' });
  await context.route('https://**/*', route => route.abort());
  await context.addCookies([{ name: auth.SESSION_COOKIE, value: session, url: base }]);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  await expect(page.locator('body')).toHaveClass(/auth-ready/);

  const drawer = page.locator('#side-drawer');
  const drawerItems = () => drawer.locator('#side-drawer-nav .side-drawer-item').evaluateAll(els => els.map(el => el.dataset.navId));
  const barItems = () => page.locator('#bottom-nav-bar .bn-item').evaluateAll(els => els.map(el => el.id.replace('bn-', '')));
  const openDrawer = async () => { await page.locator('#mobile-menu-trigger').click(); await expect(drawer).toHaveClass(/open/); };
  const closeDrawer = async () => { await page.keyboard.press('Escape'); await expect(drawer).not.toHaveClass(/open/); };

  // Menu original: secções, Definições no fim e a barra de sempre.
  assert.deepEqual(await barItems(), ['dashboard', 'reservas', 'calendario', 'eventos', 'despesas']);
  await openDrawer();
  await expect(drawer.locator('.side-drawer-section')).toHaveText(['Principal', 'Gestão']);
  assert.equal((await drawerItems()).at(-1), 'definicoes');

  // A conta fica no fundo do menu, mesmo depois de deslizar a lista.
  const account = page.locator('#side-drawer-account-toggle');
  await expect(account).toContainText('Luísa Teste');
  await expect(page.locator('#side-drawer-user-sub')).toHaveText('Proprietário · Menu editável');
  const bottomGap = async () => {
    const [box, frame] = [await account.boundingBox(), await drawer.boundingBox()];
    return Math.round(frame.y + frame.height - (box.y + box.height));
  };
  const gapBefore = await bottomGap();
  assert.ok(gapBefore >= 0 && gapBefore < 40, `conta encostada ao fundo (${gapBefore}px)`);
  await drawer.locator('.side-drawer-scroll').evaluate(el => el.scrollTo(0, el.scrollHeight));
  assert.equal(await bottomGap(), gapBefore, 'a conta não desliza com a lista');
  // Tocar na conta mostra as opções; fechar o menu volta a escondê-las.
  const actions = page.locator('#side-drawer-account-actions');
  await expect(actions).toBeHidden();
  await account.click();
  await expect(account).toHaveAttribute('aria-expanded', 'true');
  await expect(actions.getByRole('button', { name: 'Sair' })).toBeVisible();
  assert.ok((await actions.boundingBox()).y < (await account.boundingBox()).y, 'as opções abrem por cima da conta');
  await closeDrawer();
  await openDrawer();
  await expect(actions).toBeHidden();

  // Editar: o menu fecha e abre o ecrã de edição.
  await drawer.getByRole('button', { name: 'Editar' }).click();
  const editor = page.locator('#menu-editor');
  await expect(editor).toBeVisible();
  await expect(drawer).not.toHaveClass(/open/);
  const editorOrder = () => editor.locator('.menu-editor-row').evaluateAll(els => els.map(el => el.dataset.navId));
  // Teclado: Despesas sobe até ao topo.
  const despesas = editor.locator('[data-menu-handle="despesas"]');
  await despesas.focus();
  for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowUp');
  assert.equal((await editorOrder())[0], 'despesas');
  await expect(editor.locator('[data-menu-handle="despesas"]')).toBeFocused();
  // Arrastar: Hóspedes pela pega até ao topo.
  const handle = await editor.locator('[data-menu-handle="hospedes"]').boundingBox();
  const first = await editor.locator('.menu-editor-row').first().boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(first.x + 40, first.y + first.height / 2, { steps: 8 });
  await page.mouse.move(first.x + 40, first.y + 4, { steps: 2 });
  await page.mouse.up();
  assert.deepEqual((await editorOrder()).slice(0, 2), ['hospedes', 'despesas']);
  // Esconder Vouchers.
  await editor.getByRole('button', { name: 'Esconder Vouchers' }).click();
  await expect(editor.getByRole('button', { name: 'Mostrar Vouchers' })).toHaveAttribute('aria-pressed', 'false');
  // O 5.º atalho passa de Despesas para Hóspedes; o seletor só mostra o que não está na barra.
  await editor.getByRole('button', { name: /^Atalho 5: Despesas/ }).click();
  const picker = editor.locator('.menu-editor-picker');
  await expect(picker.getByRole('button', { name: 'Dashboard' })).toHaveCount(0);
  await picker.getByRole('button', { name: 'Hóspedes' }).click();
  await expect(picker).toHaveCount(0);
  // Escape fecha sem guardar.
  await page.keyboard.press('Escape');
  await expect(editor).toBeHidden();
  assert.equal(saved(), null);

  // Repetir e guardar.
  await openDrawer();
  await drawer.getByRole('button', { name: 'Editar' }).click();
  await editor.locator('[data-menu-handle="despesas"]').focus();
  for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowUp');
  await editor.getByRole('button', { name: 'Esconder Vouchers' }).click();
  await editor.getByRole('button', { name: /^Atalho 5: Despesas/ }).click();
  await editor.locator('.menu-editor-picker').getByRole('button', { name: 'Hóspedes' }).click();
  await editor.getByRole('button', { name: 'Guardar' }).click();
  await expect(editor).toBeHidden();
  await expect(page.locator('.toast').filter({ hasText: 'Menu guardado.' })).toBeVisible();
  const prefs = saved();
  assert.equal(prefs.order[0], 'despesas');
  assert.deepEqual(prefs.hidden, ['vouchers']);
  assert.deepEqual(prefs.bar, ['dashboard', 'reservas', 'calendario', 'eventos', 'hospedes']);

  const expectCustom = async () => {
    assert.deepEqual(await barItems(), prefs.bar);
    await openDrawer();
    await expect(drawer.locator('.side-drawer-section')).toHaveText(['O meu menu']);
    const items = await drawerItems();
    assert.equal(items[0], 'despesas');
    assert.ok(!items.includes('vouchers'), 'Vouchers escondido');
    assert.equal(items.at(-1), 'definicoes');
    await closeDrawer();
  };
  await expectCustom();
  await page.reload();
  await expect(page.locator('body')).toHaveClass(/auth-ready/);
  await expectCustom();
  // O novo atalho abre a vista e fica marcado.
  await page.locator('#bn-hospedes').click();
  await expect(page.locator('#view-hospedes')).toHaveClass(/active/);
  await expect(page.locator('#bn-hospedes')).toHaveAttribute('aria-current', 'page');

  // Computador: o menu lateral fica sempre na ordem original.
  await page.setViewportSize({ width: 1280, height: 800 });
  const sidebar = await page.locator('#main-sidebar .nav-item[data-view]').evaluateAll(els => els.map(el => el.dataset.view));
  assert.deepEqual(sidebar.slice(0, 3), ['dashboard', 'reservas', 'calendario']);
  assert.ok(sidebar.includes('vouchers') && !sidebar.includes('modelos-email'));
  await page.setViewportSize({ width: 375, height: 667 });

  // Repor original.
  await openDrawer();
  await drawer.getByRole('button', { name: 'Editar' }).click();
  await editor.getByRole('button', { name: 'Repor original' }).click();
  await expect(editor).toBeHidden();
  await expect(page.locator('.toast').filter({ hasText: 'Menu reposto.' })).toBeVisible();
  assert.equal(saved(), null);
  assert.deepEqual(await barItems(), ['dashboard', 'reservas', 'calendario', 'eventos', 'despesas']);
  await openDrawer();
  await expect(drawer.locator('.side-drawer-section')).toHaveText(['Principal', 'Gestão']);
  assert.ok((await drawerItems()).includes('vouchers'));
  assert.deepEqual(errors, []);
  console.log('OK: menu do telemóvel — conta fixa no fundo, ordem (arrastar e teclado), esconder, atalhos da barra, guardar, recarregar e repor.');
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  db.close();
});
