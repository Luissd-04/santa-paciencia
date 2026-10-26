// Chromium real, aplicação real e base descartável. Nunca lê .env nem dados locais.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium, expect } = require('@playwright/test');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-browser-'));
const previous = process.cwd();
process.chdir(temp);
const artifacts = path.resolve(__dirname, '../../../browser-artifacts/payment-policy');
process.env.BROWSER_ARTIFACTS_DIR = artifacts;
process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.EMAIL_ENABLED = 'false';
process.env.FRONTEND_PATH = path.resolve(__dirname, '../../../frontend');
const app = require('../app');
const { db } = require('../config/database');
const auth = require('../services/authService');
const orgs = require('../services/orgService');
let server, browser;
async function main() {
  const org = orgs.createOrganization('Interface Sintética');
  const user = auth.createUser({ name: 'Teste', email: 'browser@example.invalid', password: 'SyntheticBrowser123!' });
  orgs.createMembership({ organizationId: org.id, userId: user.id, role: 'owner' });
  const session = auth.createSession(user.id, org.id).sessionId;
  db.prepare('INSERT INTO accommodations(id,organization_id,name,type,price_per_night,max_guests) VALUES(?,?,?,?,?,?)').run('unit', org.id, 'Unidade de teste', 'alojamento', 100, 4);
  const today = new Date().toISOString().slice(0, 10);
  const departure = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const insertGuest = db.prepare('INSERT INTO guests(id,organization_id,name,email) VALUES(?,?,?,?)');
  const insertRes = db.prepare(`INSERT INTO reservations(id,organization_id,guest_id,accommodation_id,check_in,check_out,nights,num_guests,total_amount,status)
    VALUES(?,?,?,'unit',?,?,2,1,200,'confirmada')`);
  db.transaction(() => {
    for (let n = 0; n < 1; n++) {
      const id = String(n).padStart(3, '0');
      insertGuest.run(id, org.id, `Hóspede ${id}`, `guest${id}@example.invalid`);
      insertRes.run(`r${id}`, org.id, id, today, departure);
    }
  })();
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', acceptDownloads: true });
  await context.addInitScript(() => {
    sessionStorage.setItem('sp:desp:sort', JSON.stringify('has_nif'));
    sessionStorage.setItem('sp:evt:year', '2021');
    sessionStorage.setItem('sp:evt:month', '0');
    window.__scriptViolations = [];
    document.addEventListener('securitypolicyviolation', event => {
      if (event.violatedDirective.startsWith('script-src')) window.__scriptViolations.push(event.violatedDirective);
    });
  });
  await context.addCookies([{ name: auth.SESSION_COOKIE, value: session, url: base }]);
  const page = await context.newPage();
  const errors = [], requests = [];
  page.on('pageerror', error => { errors.push(error.message); console.error('Browser:', error.message); });
  page.on('request', request => requests.push(request.url()));
  page.setDefaultTimeout(10000);
  await page.goto(base, { waitUntil: 'networkidle' });
  await expect(page.locator('#kpi-ativas')).toHaveText('1');
  assert(!requests.some(url => /xlsx-|jspdf|chart\.umd|leaflet\.(js|css)/.test(url)), 'bibliotecas pesadas carregadas antes de serem usadas');
  assert(!requests.some(url => /\/api\/reservations\?/.test(url)), 'painel carregou lista completa de reservas');

  fs.mkdirSync(artifacts,{recursive:true});
  await page.goto(base+'/definicoes',{waitUntil:'networkidle'});
  await page.getByRole('button',{name:/^Pagamentos e cancelamentos/}).click();
  await expect(page.locator('#pp-form')).toBeVisible();
  await expect(page.locator('#pp-enabled')).not.toBeChecked();
  // O seletor de datas próprio torna estes campos readonly assim que se anexa;
  // fill() só funcionava quando o teste chegava antes dele (falha intermitente).
  // Definir o valor como o seletor faz, com os eventos de alteração.
  for (const [id, value] of [['pp-sim-booked','2034-09-01'],['pp-sim-checkin','2035-01-01'],['pp-sim-cancel','2034-12-30']]) {
    await page.locator('#'+id).evaluate((input, iso) => {
      input.value = iso;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
  }
  await page.locator('#pp-simulate').click();
  await expect(page.locator('#pp-sim-result')).toContainText('0,00');
  await page.locator('#pp-basis').selectOption('booking');
  await page.locator('#pp-simulate').click();
  await expect(page.locator('#pp-sim-result')).toContainText('100%');
  await page.getByRole('button',{name:'Adicionar intervalo',exact:true}).first().click();
  await expect(page.locator('#pp-deposit-rows tr')).toHaveCount(4);
  await page.getByRole('button',{name:'Remover intervalo 4 de pagamento inicial',exact:true}).click();
  await page.locator('#pp-deposit-rows tr').last().locator('[data-field="maxDays"]').fill('');
  await page.locator('#pp-deposit-rows tr').nth(1).locator('[data-field="minDays"]').fill('14');
  await page.locator('#pp-save').click();
  await expect(page.locator('#pp-result')).toContainText('sobreposições');
  await page.locator('#pp-deposit-rows tr').nth(1).locator('[data-field="minDays"]').fill('15');
  await page.locator('#pp-enabled').check();
  await page.locator('#pp-save').click();
  await expect(page.locator('#pp-result')).toContainText('ativa');
  await page.screenshot({path:artifacts+'/settings-desktop.png',fullPage:true});
  for (const viewport of [{width:375,height:812},{width:812,height:375}]) {
    await page.setViewportSize(viewport);
    await expect(page.locator('.main')).toHaveCSS('margin-left','0px');
    await page.evaluate(()=>window.scrollTo(0,0));
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'settings overflow');
    await page.screenshot({path:artifacts+'/settings-'+viewport.width+'.png',fullPage:true,animations:'disabled'});
    await page.screenshot({path:artifacts+'/settings-viewport-'+viewport.width+'.png',animations:'disabled'});
  }
  const policyService = require('../services/paymentPolicy');
  const checkIn = new Date(Date.now()+120*86400000).toISOString().slice(0,10);
  const checkOut = new Date(Date.now()+122*86400000).toISOString().slice(0,10);
  db.prepare("UPDATE reservations SET check_in=?,check_out=?,total_amount=250, status='aguardar_pagamento' WHERE id='r000'").run(checkIn,checkOut);
  let reservation=db.prepare("SELECT * FROM reservations WHERE id='r000'").get();
  policyService.attachPolicy(reservation);
  const token = require('../services/reservationSupport').ensurePublicToken(reservation);
  process.env.STRIPE_MODE='test'; process.env.STRIPE_SECRET_KEY='sk_test_synthetic'; process.env.STRIPE_WEBHOOK_SECRET='whsec_synthetic';
  process.env.STRIPE_ORGANIZATION_ID=org.id; process.env.PUBLIC_APP_URL=base;
  let checkoutParams;
  const stripe = require('../services/stripeClient').getStripe();
  stripe.checkout.sessions.create=async params=>{
    checkoutParams=params;
    return {id:'cs_synthetic',status:'open',livemode:false,metadata:params.metadata,client_reference_id:params.client_reference_id,
      amount_total:params.line_items[0].price_data.unit_amount,currency:'eur',url:'https://checkout.stripe.com/c/pay/synthetic'};
  };
  await page.route('https://checkout.stripe.com/**',route=>route.fulfill({contentType:'text/html',body:'Pagamento de teste'}));
  await page.setViewportSize({width:375,height:812});
  await page.goto(base+'/reserva/'+token,{waitUntil:'networkidle'});
  await expect(page.locator('#rs-pay')).toContainText('50');
  await expect(page.locator('#rs-policy')).toContainText('200');
  await page.locator('#rs-pay').click();
  await expect(page.locator('#rs-error')).toContainText('Aceite');
  await page.locator('#rs-consent').check(); await page.locator('#rs-auto').check();
  await page.screenshot({path:artifacts+'/guest-mobile.png',fullPage:true});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'guest overflow');
  await page.locator('#rs-pay').click();
  await page.waitForURL('https://checkout.stripe.com/**');
  assert.equal(checkoutParams.line_items[0].price_data.unit_amount,5000);
  assert.equal(checkoutParams.payment_method_options.card.setup_future_usage,'off_session');
  assert.equal(db.prepare("SELECT policy_auto_consent FROM reservations WHERE id='r000'").get().policy_auto_consent,'1');
  assert.deepEqual(errors,[]);
  assert.deepEqual(await page.evaluate(() => window.__scriptViolations), []);
  console.log('OK: settings, editable intervals, validation, simulator, saving, mobile/landscape, guest consent and deposit; '+artifacts);
  await context.close();
}
main().catch(async error => {
  console.error(error.message || error); process.exitCode = 1;
  const page = browser?.contexts()[0]?.pages()[0];
  if (page && process.env.BROWSER_ARTIFACTS_DIR) {
    fs.mkdirSync(process.env.BROWSER_ARTIFACTS_DIR, { recursive: true });
    await page.screenshot({ path: path.join(process.env.BROWSER_ARTIFACTS_DIR, 'failure.png') }).catch(() => {});
  }
}).finally(async () => {
  if (browser) await browser.close();
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  db.close(); process.chdir(previous); fs.rmSync(temp, { recursive: true, force: true });
});
