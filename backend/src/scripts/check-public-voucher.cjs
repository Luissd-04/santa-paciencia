// Percurso público real com dados e base de dados descartáveis.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium, expect } = require('@playwright/test');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-public-voucher-browser-'));
const previous = process.cwd();
process.chdir(temp);
process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.EMAIL_ENABLED = 'false';
process.env.FRONTEND_PATH = path.resolve(__dirname, '../../../frontend');

const app = require('../app');
const { db } = require('../config/database');
const orgs = require('../services/orgService');

let server;
let browser;

async function main() {
  const org = orgs.createOrganization('Reserva pública com voucher');
  db.prepare(`INSERT INTO organization_settings (organization_id, key, value)
    VALUES (?, 'services', '[{"id":"tourist_tax","active":false}]')
    ON CONFLICT (organization_id, key) DO UPDATE SET value = excluded.value`)
    .run(org.id);
  db.prepare(`INSERT INTO accommodations
    (id, organization_id, name, type, price_per_night, max_guests, public_slug, min_nights)
    VALUES ('public-unit', ?, 'Casa de teste', 'alojamento', 100, 4, 'casa-teste', 1)`)
    .run(org.id);
  db.prepare(`INSERT INTO vouchers
    (id, organization_id, code, type, value, description, min_nights, max_uses)
    VALUES ('public-voucher', ?, 'PUBLICO10', 'discount_pct', 10, 'Desconto público', 1, 10)`)
    .run(org.id);

  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    serviceWorkers: 'block',
  });
  await context.route('https://**/*', route => route.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  const actionRequests = [];
  page.on('response', response => {
    if (response.url().includes('/js/public-reservation-actions.js')) {
      actionRequests.push({ status: response.status(), url: response.url() });
    }
  });

  await page.goto(`${base}/reservar/casa-teste`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#property-name')).toHaveText('Casa de teste');
  assert.deepEqual(actionRequests, [{ status: 200, url: `${base}/js/public-reservation-actions.js` }]);

  await page.locator('#pb-checkin').fill('01-02-2035');
  await page.locator('#pb-checkout').fill('03-02-2035');
  await page.locator('#pb-adults').fill('1');
  await expect(page.locator('#pb-voucher')).toBeHidden();
  await page.locator('#next-btn').click();
  await expect(page.locator('[data-step="2"]')).toBeVisible();
  assert.equal(await page.evaluate(() => scrollY), 0);
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.locator('[data-flow-mobile] #next-btn')).toBeVisible();
  await expect(page.locator('.summary-panel #next-btn')).toHaveCount(0);
  await page.locator('#next-btn').click();
  await expect(page.locator('[data-flow-mobile] #step-error')).toBeVisible();
  await expect(page.locator('[data-step="2"]')).toBeVisible();
  await page.locator('#pb-name').fill('Hóspede Público');
  await page.locator('#pb-email').fill('publico@example.invalid');
  await page.locator('#pb-phone').fill('912345678');
  await page.locator('#pb-country').fill('Portugal');
  await page.locator('#next-btn').click();
  assert.equal(await page.evaluate(() => scrollY), 0);
  await expect(page.locator('[data-step="3"] #pb-voucher')).toBeVisible();
  await page.locator('#pb-voucher').fill('publico10');
  await page.locator('#pb-voucher-btn').click();
  await expect(page.locator('#pb-voucher-status')).toContainText('10% de desconto');
  await expect(page.locator('#summary-discount')).toContainText('20,00');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

  // Voltar e avançar preserva o voucher e o total.
  await page.locator('#prev-btn').click();
  assert.equal(await page.evaluate(() => scrollY), 0);
  await page.locator('#next-btn').click();
  await expect(page.locator('#pb-voucher')).toHaveValue('publico10');
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator('.summary-panel #next-btn')).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });

  // Alterar o texto invalida imediatamente a validação visual anterior.
  await page.locator('#pb-voucher').fill('OUTRO');
  await expect(page.locator('#pb-voucher-status')).toBeHidden();
  await expect(page.locator('#summary-discount-row')).toBeHidden();

  // O código válido também é enviado sem depender de um segundo clique em Aplicar.
  await page.locator('#pb-voucher').fill('publico10');
  await page.locator('#pb-rgpd').check();
  await page.evaluate(() => { AppModules.booking.state.pageLoadedAt = Date.now() - 10000; });
  // Uma falha de gravação mantém os dados e permite repetir o envio.
  const submitRoute = '**/api/public/booking/casa-teste/reservations';
  await page.route(submitRoute, route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'Falha temporária de teste' }) }));
  await page.locator('#next-btn').click();
  await expect(page.locator('#step-error')).toContainText('Falha temporária de teste');
  await expect(page).toHaveURL(`${base}/reservar/casa-teste`);
  await expect(page.locator('#next-btn')).toBeEnabled();
  await expect(page.locator('#prev-btn')).toBeEnabled();
  await expect(page.locator('#pb-voucher')).toHaveValue('publico10');
  await page.unroute(submitRoute);
  await page.locator('#next-btn').click();
  await expect(page).toHaveURL(`${base}/public-success.html?tipo=reserva`);
  await expect(page.locator('#confirmation-title')).toContainText('Pedido enviado com sucesso');
  await expect(page.locator('#confirmation-total')).toContainText('€180,00');
  await expect(page.locator('#public-booking-form')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#confirmation-title')).toContainText('Pedido enviado com sucesso');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

  const reservation = db.prepare('SELECT total_amount FROM reservations').get();
  const usage = db.prepare('SELECT COUNT(*) AS total FROM voucher_redemptions WHERE voucher_id = ?').get('public-voucher');
  assert.equal(reservation.total_amount, 180);
  assert.equal(usage.total, 1);
  assert.deepEqual(pageErrors, []);
  console.log('Voucher público: botão Aplicar, desconto, invalidação ao editar e criação da reserva verificados.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close();
  if (server) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
  db.close();
  process.chdir(previous);
  fs.rmSync(temp, { recursive: true, force: true });
});
