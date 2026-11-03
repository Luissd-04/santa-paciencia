// Reserva pública com casa inteira e quartos: o resumo sem escolha disponível,
// a lotação máxima dos quartos e o link para o pré-check-in na página da
// reserva. Dados inventados; pedidos externos bloqueados.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium, devices, expect } = require('@playwright/test');
const { chooseDate } = require('../test-support/date-picker.cjs');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-public-units-'));
process.chdir(temp);
Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test', EMAIL_ENABLED: 'false', FRONTEND_PATH: path.resolve(__dirname, '../../../frontend') });
const app = require('../app');
const { db } = require('../config/database');
let server, browser;

const TOKEN = 'a'.repeat(64);
const PENDING_TOKEN = 'b'.repeat(64);

async function main() {
  const org = require('../services/orgService').createOrganization('Casa com quartos');
  const accommodation = db.prepare(`INSERT INTO accommodations
    (id, organization_id, name, type, price_per_night, max_guests, base_guests_included, parent_id, public_slug, min_nights)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`);
  accommodation.run('casa', org.id, 'Casa da Oliveira', 'alojamento', 300, 5, 5, null, 'casa-quartos');
  accommodation.run('suite', org.id, 'Suite Oliveira', 'suite', 100, 3, 2, 'casa', null);
  accommodation.run('quarto', org.id, 'Quarto Monsaraz', 'suite', 80, 2, 2, 'casa', null);
  db.prepare("INSERT INTO guests (id, organization_id, name, email) VALUES ('g', ?, 'Marta Silva', 'marta@example.invalid')").run(org.id);
  const reservation = db.prepare(`INSERT INTO reservations
    (id, organization_id, guest_id, accommodation_id, check_in, check_out, nights, num_guests, total_amount, status, public_token, precheckin_token)
    VALUES (?, ?, 'g', ?, ?, ?, 2, 2, 200, ?, ?, ?)`);
  // As duas unidades ocupadas em março: nada fica disponível.
  reservation.run('r-suite', org.id, 'suite', '2035-03-01', '2035-03-03', 'confirmada', TOKEN, 'pc-ok');
  reservation.run('r-quarto', org.id, 'quarto', '2035-03-01', '2035-03-03', 'pendente', PENDING_TOKEN, 'pc-pendente');

  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
  await context.route('https://**/*', route => route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto(`${base}/reservar/casa-quartos`);
  await expect(page.locator('#property-name')).toHaveText('Casa da Oliveira');
  await chooseDate(page, page.locator('#pb-checkout'), '2035-03-03');
  await chooseDate(page, page.locator('#pb-checkin'), '2035-03-01');
  // Tudo ocupado: sem total (antes ficava a taxa turística com o nome da casa).
  await expect(page.locator('.unit-card.blocked')).toHaveCount(3);
  await expect(page.locator('#summary-unit')).toHaveText('Escolha um quarto');
  await expect(page.locator('.summary-total')).toBeHidden();

  // Outras datas: a suite mostra a lotação máxima, mesmo sem extra pago.
  await chooseDate(page, page.locator('#pb-checkout'), '2035-04-03');
  await chooseDate(page, page.locator('#pb-checkin'), '2035-04-01');
  const suite = page.locator('.unit-card[data-unit="suite"]');
  await expect(suite).toContainText('Até 3 hóspedes');
  await suite.click();
  await expect(page.locator('#summary-unit')).toHaveText('Suite Oliveira');
  await expect(page.locator('.summary-total')).toBeVisible();

  // Página da reserva: link para o pré-check-in só depois de aceite.
  await page.goto(`${base}/reserva/${TOKEN}`);
  const link = page.locator('#rs-precheckin-link');
  await expect(link).toHaveText('Fazer o pré-check-in');
  assert.equal(await link.getAttribute('href'), '/pre-checkin/pc-ok');
  db.prepare("UPDATE reservations SET precheckin_submitted_at = datetime('now') WHERE id = 'r-suite'").run();
  await page.reload();
  await expect(link).toHaveText('Rever o pré-check-in');
  await page.goto(`${base}/reserva/${PENDING_TOKEN}`);
  await expect(page.locator('#rs-accommodation')).toHaveText('Quarto Monsaraz');
  await expect(page.locator('#rs-precheckin')).toBeHidden();

  assert.deepEqual(errors, []);
  console.log('OK: reserva pública com quartos — resumo sem escolha disponível, lotação máxima e link para o pré-check-in.');
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  db.close();
});
