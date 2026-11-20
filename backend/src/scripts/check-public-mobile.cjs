// Regressão da reserva pública: vários hóspedes, ida/volta e Safari mobile.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium, webkit, devices, expect } = require('@playwright/test');
const { chooseDate: pickDate } = require('../test-support/date-picker.cjs');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-public-mobile-'));
const previous = process.cwd();
process.chdir(temp);
process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.EMAIL_ENABLED = 'false';
process.env.FRONTEND_PATH = path.resolve(__dirname, '../../../frontend');
const app = require('../app');
const { db } = require('../config/database');
let server, browser;

async function main() {
  const org = require('../services/orgService').createOrganization('Teste mobile');
  db.prepare(`INSERT INTO accommodations
    (id, organization_id, name, type, price_per_night, max_guests, public_slug, min_nights)
    VALUES ('mobile-unit', ?, 'Casa de teste', 'alojamento', 100, 4, 'teste-mobile', 1)`).run(org.id);
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const engine = process.env.BROWSER_ENGINE === 'webkit' ? webkit : chromium;
  browser = await engine.launch({ headless: true });
  const context = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
  await context.route('https://**/*', route => route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const url = `http://127.0.0.1:${server.address().port}/reservar/teste-mobile`;
  await page.goto(url);
  await expect(page.locator('#pn-name')).toHaveText('Casa de teste');
  await expect(page.locator('[data-flow-mobile] #next-btn')).toBeVisible();
  const chooseDate = (input, iso) => pickDate(page, input, iso);
  // O calendário move o foco; selecionar datas testa a interação real em Safari.
  await chooseDate(page.locator('#pb-checkout'), '2035-02-03');
  await chooseDate(page.locator('#pb-checkin'), '2035-02-01');
  await page.locator('#next-btn').click();
  await expect(page.locator('[data-step="2"]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await page.locator('#pb-name').fill('Marta Teste');
  await page.locator('#pb-email').fill('marta@example.invalid');
  await page.locator('#pb-phone').fill('912345678');
  await page.locator('#pb-country').fill('Portugal');
  // Acompanhantes só com o nome; o resto fica para o pré-check-in.
  const guest = page.locator('#extra-guests > [data-guest-index="2"]');
  await guest.locator('[data-field="name"]').fill('João Teste');
  await expect(guest.locator('[data-field="email"]')).toHaveCount(0);
  // Os pedidos especiais ficam no passo dos dados.
  await page.locator('#pb-notes').fill('Notas de teste');
  await page.keyboard.press('Escape');
  await page.locator('#next-btn').click();
  await expect(page.locator('[data-step="3"]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await page.locator('#prev-btn').click();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await expect(page.locator('#pb-name')).toHaveValue('Marta Teste');
  await expect(guest.locator('[data-field="name"]')).toHaveValue('João Teste');
  await expect(page.locator('#pb-notes')).toHaveValue('Notas de teste');
  await page.locator('#prev-btn').click();
  await page.locator('#pb-adults').fill('1');
  await page.locator('#pb-adults').press('Tab');
  await page.locator('#pb-adults').fill('2');
  await page.locator('#next-btn').click();
  await expect(guest.locator('[data-field="name"]')).toHaveValue('João Teste');
  // Enter num campo avança um passo; não envia o pedido.
  await page.locator('#pb-country').press('Enter');
  await expect(page).toHaveURL(url);
  await expect(page.locator('[data-step="3"]')).toBeVisible();
  await page.locator('#prev-btn').click();
  await page.screenshot({ path: path.join(temp, 'mobile.png'), fullPage: true, animations: 'disabled' });
  // Em desktop, o foco muda sem uma deslocação forçada para o topo.
  await page.setViewportSize({ width: 1280, height: 650 });
  await expect(page.locator('#next-btn')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const before = await page.evaluate(() => scrollY);
  assert(before > 0);
  await page.locator('#next-btn').click();
  await expect(page.locator('[data-step="3"]')).toBeVisible();
  // Envio real, exclusivamente na base de dados descartável.
  await page.locator('#pb-rgpd').check();
  await page.evaluate(() => { AppModules.booking.state.pageLoadedAt = Date.now() - 10000; });
  await page.locator('#next-btn').click();
  // O hóspede segue para a página do pedido.
  await expect(page).toHaveURL(/\/reserva\/[a-f0-9]{64}$/);
  const reservation = db.prepare('SELECT guests_data, num_guests, notes FROM reservations').get();
  assert.equal(reservation.num_guests, 2);
  assert.equal(reservation.notes, 'Notas de teste');
  const guests = JSON.parse(reservation.guests_data);
  assert.equal(guests.length, 1);
  assert.equal(guests[0].name, 'João Teste');
  assert.equal(guests[0].phone || '', '', 'sem telefone do acompanhante');
  assert.deepEqual(errors, []);
  console.log(`OK (${engine.name()}): navegação mobile, desktop sem salto, dados preservados e envio com 2 hóspedes. Capturas: ${temp}`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await browser?.close();
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  db.close();
  process.chdir(previous);
});
