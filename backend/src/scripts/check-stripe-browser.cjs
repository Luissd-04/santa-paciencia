// Real app + Chromium; disposable data and a synthetic Stripe API. Never loads .env.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium, expect } = require('@playwright/test');
const originalCwd = process.cwd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-stripe-browser-'));
const artifacts = path.resolve(__dirname, '../../../browser-artifacts/stripe');
fs.mkdirSync(artifacts, { recursive: true });
process.chdir(temp);
Object.assign(process.env, {
  DB_PATH: ':memory:', NODE_ENV: 'test', EMAIL_ENABLED: 'false',
  FRONTEND_PATH: path.resolve(__dirname, '../../../frontend'), PUBLIC_APP_URL: 'http://localhost:3001',
  STRIPE_MODE: 'test',
  STRIPE_SECRET_KEY: 'sk_test_browser_synthetic', STRIPE_WEBHOOK_SECRET: 'whsec_browser_synthetic',
  STRIPE_ORGANIZATION_ID: 'browser-org',
});
const app = require('../app');
const { db } = require('../config/database');
const { getStripe } = require('../services/stripeClient');
const payments = require('../services/stripePayments');
require('../services/operationalTasksService').syncReservationOperationalTasks = () => {};
let session;
const stripe = getStripe();
stripe.checkout.sessions.create = async params => {
  session = { id: 'cs_test_browser', object: 'checkout.session', livemode: false,
    status: 'open', payment_status: 'unpaid', payment_intent: null, metadata: params.metadata,
    client_reference_id: params.client_reference_id, amount_total: params.line_items[0].price_data.unit_amount,
    currency: 'eur', url: 'https://checkout.stripe.com/c/pay/synthetic' };
  return structuredClone(session);
};
stripe.checkout.sessions.retrieve = async () => structuredClone(session);
stripe.refunds.list = () => (async function* () {})();
let server, browser;
async function main() {
  db.exec(`INSERT INTO organizations(id,name,slug) VALUES('browser-org','Teste Stripe','stripe');
    INSERT INTO guests(id,organization_id,name,email) VALUES('guest','browser-org','Synthetic Guest','synthetic@example.invalid');
    INSERT INTO accommodations(id,organization_id,name,type,price_per_night,max_guests)
      VALUES('unit','browser-org','Casa do Jardim','alojamento',100,2);`);
  const token = 'a'.repeat(64);
  db.prepare(`INSERT INTO reservations(id,organization_id,guest_id,accommodation_id,check_in,check_out,nights,num_guests,total_amount,status,public_token)
    VALUES('SP-TESTE','browser-org','guest','unit','2035-06-10','2035-06-12',2,2,200,'aguardar_pagamento',?)`).run(token);
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  process.env.PUBLIC_APP_URL = origin;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  const errors = [];
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'checkout.stripe.com') return route.fulfill({ contentType: 'text/html', body: '<h1>Stripe simulada para teste</h1>' });
    if (url.origin !== origin) return route.abort();
    return route.continue();
  });
  const url = `${origin}/reserva/${token}`;
  await page.goto(url);
  await expect(page.getByRole('button', { name: /Pagar.*200/ })).toBeVisible();
  await expect(page.locator('#rs-checkout')).toContainText('2035');
  await expect(page.locator('#rs-test-note')).toBeVisible();
  await page.screenshot({ path: path.join(artifacts, 'desktop.png'), fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: /Pagar.*200/ })).toBeVisible();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: path.join(artifacts, 'mobile.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: /Pagar.*200/ }).click();
  await expect(page).toHaveURL(/checkout\.stripe\.com/);
  await page.goto(url + '?payment=return');
  await expect(page.locator('#rs-payment-message')).toContainText('aguardar a confirmação');
  await expect(page.locator('#rs-pay')).toBeHidden();
  assert.equal(db.prepare("SELECT amount_paid FROM reservations WHERE id='SP-TESTE'").get().amount_paid, 0);
  await page.goto(url + '?payment=cancelled');
  await expect(page.getByRole('button', { name: /Pagar.*200/ })).toBeVisible();
  await expect(page.locator('#rs-payment-message')).toContainText('Saiu do pagamento');
  session.status = 'complete'; session.payment_status = 'paid';
  session.payment_intent = { id: 'pi_test_browser', object: 'payment_intent', livemode: false, status: 'succeeded',
    amount: 20000, amount_received: 20000, currency: 'eur', metadata: session.metadata };
  await payments.processWebhook({ id: 'evt_browser_paid', type: 'checkout.session.completed', livemode: false,
    created: Math.floor(Date.now() / 1000), data: { object: session } });
  await page.goto(url + '?payment=return');
  await expect(page.locator('#rs-title')).toHaveText('Reserva confirmada');
  await expect(page.locator('#rs-payment')).toHaveText('Pago');
  await expect(page.locator('#rs-pay')).toBeHidden();
  await page.screenshot({ path: path.join(artifacts, 'paid-mobile.png'), fullPage: true, animations: 'disabled' });
  assert.deepEqual(errors, []);
  console.log('Stripe UI: desktop, mobile, checkout, cancelamento, regresso sem confirmação e pagamento confirmado verificados.');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  db.close(); process.chdir(originalCwd); fs.rmSync(temp, { recursive: true, force: true });
});
