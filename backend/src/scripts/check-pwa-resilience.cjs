// Percursos essenciais com rede instável, sessão expirada e publicação de uma
// versão nova durante a sessão. Emulação móvel (375 px) em Chromium ou WebKit
// (BROWSER_ENGINE=webkit); base em memória, dados inventados, sem serviços
// externos. Não substitui o ensaio em iPhone/Android reais (docs/OPERACOES.md).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium, webkit, expect } = require('@playwright/test');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-pwa-resilience-'));
const previous = process.cwd();
process.chdir(temp);
Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test', EMAIL_ENABLED: 'false', FRONTEND_PATH: path.resolve(__dirname, '../../../frontend') });
for (const key of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET']) delete process.env[key];

const app = require('../app');
const { db } = require('../config/database');
const auth = require('../services/authService');
const orgs = require('../services/orgService');
const appBuild = require('../services/appBuild');

let server, browser;
const PASSWORD = 'SyntheticPwa123!';
const reservationsOf = name => db.prepare('SELECT r.id, r.total_amount FROM reservations r JOIN guests g ON g.id = r.guest_id WHERE g.name = ?').all(name);

// No telemóvel a reserva nova tem três passos: o nome está no 2.º e Guardar no 3.º.
async function nextStep(page) {
  const next = page.locator('#resf-mstep-next');
  if (await next.isVisible()) await next.click();
}
async function fillNewReservation(page, name, checkIn, checkOut) {
  await page.evaluate(([ci, co]) => AppModules.reservas.openModal({ checkIn: ci, checkOut: co, accommodationId: 'unit' }), [checkIn, checkOut]);
  await nextStep(page);
  await page.locator('#f-nome-completo').fill(name);
  await nextStep(page);
  await expect(page.locator('#resf-total-badge')).toHaveText(/^200,00\s€$/);
}

async function main() {
  const org = orgs.createOrganization('PWA');
  const user = auth.createUser({ name: 'Gestão', email: 'pwa@example.invalid', password: PASSWORD });
  orgs.createMembership({ organizationId: org.id, userId: user.id, role: 'owner' });
  db.prepare(`INSERT INTO organization_settings(organization_id, key, value) VALUES (?, 'services', '[{"id":"tourist_tax","active":false}]')
    ON CONFLICT(organization_id, key) DO UPDATE SET value = excluded.value`).run(org.id);
  db.prepare(`INSERT INTO accommodations(id, organization_id, name, type, price_per_night, max_guests) VALUES ('unit', ?, 'Suite', 'alojamento', 100, 4)`).run(org.id);

  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const engine = process.env.BROWSER_ENGINE === 'webkit' ? webkit : chromium;
  browser = await engine.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, serviceWorkers: 'block' });
  await context.route('https://**/*', route => route.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const login = async () => {
    await page.locator('#login-email').fill('pwa@example.invalid');
    await page.locator('#login-password').fill(PASSWORD);
    await page.locator('#login-submit').click();
    await expect(page.locator('body')).toHaveClass(/auth-ready/);
  };
  await page.goto(base);
  await login();
  await page.evaluate(() => AppModules.core.ensureFeature('reservas'));

  // 1. Rede instável: o servidor cria a reserva mas a resposta perde-se.
  // O wizard continua aberto com os dados; repetir devolve a mesma reserva.
  await fillNewReservation(page, 'Hóspede Rede', '2035-03-01', '2035-03-03');
  let lost = 0;
  await page.route('**/api/reservations', async route => {
    if (route.request().method() !== 'POST' || lost++ > 0) return route.continue();
    await route.fetch();            // chega ao servidor e é gravada
    await route.abort('failed');    // mas a resposta não chega ao telemóvel
  });
  await page.locator('#btn-guardar').click();
  await expect(page.locator('.toast', { hasText: '❌' }).last()).toBeVisible();
  await expect(page.locator('#modal-bg')).toHaveClass(/open/);
  await expect(page.locator('#f-nome-completo')).toHaveValue('Hóspede Rede');
  await expect(page.locator('#btn-guardar')).toBeEnabled();
  assert.equal(reservationsOf('Hóspede Rede').length, 1, 'a primeira tentativa foi gravada');
  await page.locator('#btn-guardar').click();
  await expect(page.locator('.toast', { hasText: 'não foi duplicada' })).toBeVisible();
  await expect(page.locator('#modal-bg')).not.toHaveClass(/open/);
  assert.equal(reservationsOf('Hóspede Rede').length, 1, 'sem duplicado');
  await page.unroute('**/api/reservations');

  // Sem rede de todo: nada é gravado e o formulário fica utilizável.
  await fillNewReservation(page, 'Hóspede Offline', '2035-04-01', '2035-04-03');
  await page.route('**/api/reservations**', route => route.abort('internetdisconnected'));
  await page.locator('#btn-guardar').click();
  await expect(page.locator('.toast', { hasText: '❌' }).last()).toBeVisible();
  await expect(page.locator('#modal-bg')).toHaveClass(/open/);
  assert.equal(reservationsOf('Hóspede Offline').length, 0);
  await page.unroute('**/api/reservations**');
  await page.locator('#btn-guardar').click();
  await expect(page.locator('#modal-bg')).not.toHaveClass(/open/);
  assert.equal(reservationsOf('Hóspede Offline').length, 1);

  // 2. Sessão expirada a meio de uma reserva nova: aviso claro, login de novo
  // e o rascunho volta ao formulário.
  await fillNewReservation(page, 'Hóspede Sessão', '2035-05-01', '2035-05-03');
  await page.locator('#f-notas').fill('Chegada tardia');
  await page.waitForFunction(() => Object.keys(sessionStorage).some(key => key.startsWith('sp_reserva_draft_v2') && sessionStorage.getItem(key).includes('Hóspede Sessão')));
  db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(user.id);
  await page.locator('#btn-guardar').click();
  await expect(page.locator('#login-message')).toContainText('sessão expirou');
  await expect(page.locator('#login-submit')).toBeVisible();
  assert.equal(reservationsOf('Hóspede Sessão').length, 0);
  await login();
  await page.evaluate(() => AppModules.reservas.openModal());
  await expect(page.locator('#f-nome-completo')).toHaveValue('Hóspede Sessão');
  await expect(page.locator('#f-notas')).toHaveValue('Chegada tardia');
  await nextStep(page);
  await nextStep(page);
  await page.locator('#btn-guardar').click();
  await expect(page.locator('#modal-bg')).not.toHaveClass(/open/);
  assert.equal(reservationsOf('Hóspede Sessão').length, 1);

  // 3. Versão nova publicada com a app aberta: aviso e, ao abrir uma secção
  // ainda não carregada, recarrega no URL dessa secção em vez de misturar versões.
  const original = appBuild.value;
  assert.ok(original, 'o servidor envia a versão do frontend');
  appBuild.value = 'nova-versao-sintetica';
  await page.evaluate(() => { window.__sameDocument = true; return AppModules.core.apiGet('/api/accommodations'); });
  await expect(page.locator('#app-update-banner')).toBeVisible();
  await expect(page.locator('#app-update-banner')).toContainText('versão nova');
  // Com alterações por guardar, o aviso do browser pode cancelar o recarregamento.
  await page.evaluate(id => AppModules.reservas.openEditModal(id), reservationsOf('Hóspede Sessão')[0].id);
  await page.getByRole('button', { name: 'Preço', exact: true }).click();
  await page.locator('#f-notas').fill('');
  await page.locator('#f-notas').click();               // interação real: o browser só avisa com ela
  await page.keyboard.type('Alteração por guardar');
  let prompted = 0;
  page.once('dialog', dialog => { prompted++; assert.equal(dialog.type(), 'beforeunload'); dialog.dismiss(); });
  await page.evaluate(() => AppModules.core.showView('despesas'));
  await expect.poll(() => prompted).toBe(1);
  assert.equal(await page.evaluate(() => window.__sameDocument), true, 'o utilizador ficou na página');
  await expect(page.locator('#view-despesas .feature-load-error')).toContainText('versão nova');
  await expect(page.locator('#f-notas')).toHaveValue('Alteração por guardar');
  // Sem alterações por guardar, recarrega diretamente na secção pedida.
  await page.evaluate(() => AppModules.reservas.closeModal());
  await expect(page.locator('#modal-bg')).not.toHaveClass(/open/);
  const reloaded = page.waitForEvent('load');
  await page.evaluate(() => AppModules.core.showView('relatorios')).catch(() => {});   // o contexto termina com o recarregamento
  await reloaded;
  await expect(page.locator('body')).toHaveClass(/auth-ready/);
  assert.equal(new URL(page.url()).pathname, '/relatorios');
  assert.equal(await page.evaluate(() => window.__sameDocument), undefined, 'página recarregada');
  await expect(page.locator('#view-relatorios')).toHaveClass(/active/);
  await expect(page.locator('#app-update-banner')).toHaveCount(0);
  appBuild.value = original;

  assert.deepEqual(errors, []);
  console.log(`OK (${engine.name()}, 375 px): resposta perdida sem duplicar, sem rede sem gravar, sessão expirada com rascunho reposto, versão nova com aviso e recarregamento seguro.`);
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  db.close(); process.chdir(previous); fs.rmSync(temp, { recursive: true, force: true });
});
