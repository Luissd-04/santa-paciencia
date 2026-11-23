// Páginas públicas na versão nova, que passou a ser a única: capa, ficha do
// quarto, acompanhantes só com o nome, plano de pagamento do servidor e o
// percurso com aprovação (pedido → aceite → sinal com prazo). Dados inventados.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium, devices, expect } = require('@playwright/test');
const { chooseDate } = require('../test-support/date-picker.cjs');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-layout-novo-'));
process.chdir(temp);
Object.assign(process.env, {
  DB_PATH: ':memory:', NODE_ENV: 'test', EMAIL_ENABLED: 'false', FRONTEND_PATH: path.resolve(__dirname, '../../../frontend'),
  STRIPE_MODE: 'test', STRIPE_SECRET_KEY: 'sk_test_layout_synthetic', STRIPE_WEBHOOK_SECRET: 'whsec_layout_synthetic',
});
const app = require('../app');
const { db } = require('../config/database');
const policy = require('../services/paymentPolicy');
let server, browser;

const CHECK_IN = '2035-04-01';
const CHECK_OUT = '2035-04-04';

async function main() {
  const org = require('../services/orgService').createOrganization('Casa nova');
  process.env.STRIPE_ORGANIZATION_ID = org.id;
  policy.savePolicy(org.id, { ...policy.DEFAULT_POLICY, enabled: true });
  const insert = db.prepare(`INSERT INTO accommodations
    (id, organization_id, name, type, price_per_night, max_guests, base_guests_included, parent_id, public_slug, min_nights, description, amenities)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`);
  insert.run('casa', org.id, 'Casa Nova', 'alojamento', 300, 5, 5, null, 'casa-nova', 'Casa de campo de teste.', '["Piscina"]');
  insert.run('suite', org.id, 'Suite Oliveira', 'suite', 100, 3, 3, 'casa', null, 'Suite com vista.', '["Wi-Fi","Vista vinha"]');
  insert.run('quarto', org.id, 'Quarto Monsaraz', 'suite', 80, 2, 2, 'casa', null, '', '[]');

  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const base = `http://127.0.0.1:${server.address().port}`;
  process.env.PUBLIC_APP_URL = base;

  // Plano de pagamento: o mesmo cálculo do pagamento real; nada sem política.
  const planUrl = `${base}/api/public/booking/casa-nova/payment-plan`;
  const plan = await (await fetch(`${planUrl}?check_in=${CHECK_IN}&total=300`)).json();
  const expected = policy.calculate(policy.getPolicy(org.id), { total: 300, bookedOn: policy.localDay(), checkIn: CHECK_IN });
  assert.equal(plan.data.depositCents, expected.depositCents);
  assert.equal(plan.data.balanceCents, expected.balanceCents);
  assert.equal((await fetch(`${planUrl}?check_in=2000-01-01&total=300`)).status, 400);
  assert.equal((await fetch(`${planUrl}?check_in=${CHECK_IN}&total=abc`)).status, 400);

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
  await context.route('https://**/*', route => route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  // Uma só versão: sem parâmetro e mesmo com ?layout=atual, sem botão de troca.
  await page.goto(`${base}/reservar/casa-nova?layout=atual`);
  assert.equal(await page.locator('html').getAttribute('data-layout'), 'novo');
  await expect(page.locator('.layout-switch')).toHaveCount(0);
  await page.goto(`${base}/reservar/casa-nova`);
  await expect(page.locator('#pn-name')).toHaveText('Casa Nova');
  await expect(page.locator('#pn-brand')).toHaveText('Casa Nova');
  assert.equal(await page.title(), 'Reservar Casa Nova');
  await expect(page.locator('#pn-chips')).toContainText('Piscina');
  await chooseDate(page, page.locator('#pb-checkout'), CHECK_OUT);
  await chooseDate(page, page.locator('#pb-checkin'), CHECK_IN);
  await expect(page.locator('#pn-units-sub')).toContainText('2 de 2 quartos livres');
  await page.locator('[data-pn-unit="suite"]').click();
  const sheet = page.locator('dialog.pn-unit');
  await expect(sheet.locator('h2')).toHaveText('Suite Oliveira');
  await expect(sheet).toContainText('Vista vinha');
  // 3 noites × 100 € + taxa turística (2 hóspedes × 3 noites × 3 €).
  await expect(sheet.locator('.pn-total dd')).toHaveText(/318,00/);
  await sheet.getByRole('button', { name: 'Escolher este quarto' }).click();
  await expect(page.locator('.unit-card[data-unit="suite"]')).toHaveClass(/selected/);
  await expect(page.locator('#pn-bar-total')).toHaveText(await page.locator('#summary-total').textContent());
  // + e − mudam os hóspedes e voltam a pedir a disponibilidade.
  await page.getByRole('button', { name: 'Mais adultos' }).click();
  await expect(page.locator('#pb-adults')).toHaveValue('3');
  await page.getByRole('button', { name: 'Menos adultos' }).click();
  await expect(page.locator('#pb-adults')).toHaveValue('2');

  await page.locator('#next-btn').click();
  await expect(page.locator('#pn-hero')).toBeHidden();
  await page.locator('#pb-name').fill('Marta Silva');
  await page.locator('#pb-email').fill('marta@example.invalid');
  await page.locator('#pb-phone').fill('912345678');
  await page.locator('#pb-country').fill('Portugal');
  await page.keyboard.press('Escape');
  // Acompanhante só com o nome: o resto fica para o pré-check-in.
  const companion = page.locator('.extra-guest-box[data-guest-index="2"]');
  await expect(companion.locator('[data-field="email"]')).toHaveCount(0);
  await page.locator('#next-btn').click();
  await expect(page.locator('#step-error')).toContainText('hóspede 2');
  await companion.locator('[data-field="name"]').fill('João Silva');
  await page.locator('#next-btn').click();

  const deposit = policy.calculate(policy.getPolicy(org.id), { total: 318, bookedOn: policy.localDay(), checkIn: CHECK_IN });
  // Hoje não se paga nada: o sinal só depois de o alojamento aceitar.
  await expect(page.locator('#pn-confirm .pn-plan')).toContainText(`Depois de aceite · sinal de ${deposit.depositPercent}%`);
  await expect(page.locator('#pn-confirm')).toContainText('Hoje não paga nada');
  await expect(page.locator('#pn-bar-sub')).toContainText(`sinal de ${(deposit.depositCents / 100).toFixed(2).replace('.', ',')}`);
  await expect(page.locator('#next-btn')).toHaveText('Enviar pedido');
  await page.locator('#pb-rgpd').check();
  await page.evaluate(() => { AppModules.booking.state.pageLoadedAt = Date.now() - 20000; });
  await page.locator('#next-btn').click();
  await page.waitForURL(/\/reserva\/[a-f0-9]{64}$/);

  // Página do pedido: por aprovar, sem pagamento ainda e com a marca do alojamento.
  assert.equal(await page.locator('html').getAttribute('data-layout'), 'novo');
  await expect(page.locator('#pn-brand')).toHaveText('Casa Nova');
  await expect(page.locator('#pn-rs-steps')).toContainText('Aceitação do alojamento');
  await expect(page.locator('#pn-rs-steps')).toContainText('tem 48 horas para o pagar');
  await expect(page.locator('#pn-rs-due')).toBeEmpty();
  await expect(page.locator('#pn-rs-payments')).toContainText('318,00');
  const reservation = db.prepare("SELECT * FROM reservations WHERE accommodation_id = 'suite'").get();
  assert.equal(reservation.status, 'pendente');
  // Depois de aceite: o sinal com o prazo de 48 h.
  require('../services/reservationLifecycle').approve(org.id, reservation.id, { origin: base });
  await page.reload();
  await expect(page.locator('#rs-status')).toContainText('Falta o sinal');
  await expect(page.locator('#gp-next')).toContainText('as datas voltam a ficar livres');
  await expect(page.locator('#pn-rs-steps')).toContainText('Pré-check-in');
  await expect(page.locator('#pn-rs-steps')).not.toContainText('minutos');
  assert.equal(JSON.parse(reservation.guests_data)[0].name, 'João Silva');
  assert.equal(reservation.total_amount, 318);


  assert.deepEqual(errors, []);
  console.log('OK: páginas públicas (versão única) — capa, ficha do quarto, barra, acompanhantes só com o nome, plano de pagamento, pedido por aprovar e sinal com prazo depois de aceite.');
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  db.close();
});
