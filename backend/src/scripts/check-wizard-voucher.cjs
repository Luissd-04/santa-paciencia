// Wizard de reservas com voucher: o total apresentado tem de ser o que o
// servidor grava. Base em memória, dados inventados, sem serviços externos.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium, webkit, expect } = require('@playwright/test');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-wizard-voucher-'));
const previous = process.cwd();
process.chdir(temp);
Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test', EMAIL_ENABLED: 'false', FRONTEND_PATH: path.resolve(__dirname, '../../../frontend') });
for (const key of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET']) delete process.env[key];

const app = require('../app');
const { db } = require('../config/database');
const auth = require('../services/authService');
const orgs = require('../services/orgService');
const euro = value => new RegExp(`^${new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(value).replace(/\s/g, '\\s')}$`);

let server, browser;
const row = id => db.prepare('SELECT total_amount, price_edited_at, check_in, check_out FROM reservations WHERE id = ?').get(id);
const redemption = id => db.prepare('SELECT discount_amount, released_at FROM voucher_redemptions WHERE reservation_id = ?').get(id);

async function setStay(page, checkIn, checkOut) {
  await page.evaluate(([ci, co]) => {
    for (const [id, value] of [['f-checkin', ci], ['f-checkout', co]]) {
      const input = document.getElementById(id);
      input.value = value;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, [checkIn, checkOut]);
}
// Total visível = badge do rodapé e campo «Total final».
async function expectShownTotal(page, value) {
  await expect(page.locator('#resf-total-badge')).toHaveText(euro(value));
  await expect(page.locator('#f-total-manual')).toHaveValue(value.toFixed(2));
}

async function main() {
  const org = orgs.createOrganization('Wizard com voucher');
  const user = auth.createUser({ name: 'Gestão', email: 'wizard-voucher@example.invalid', password: 'SyntheticBrowser123!' });
  orgs.createMembership({ organizationId: org.id, userId: user.id, role: 'owner' });
  const session = auth.createSession(user.id, org.id).sessionId;
  db.prepare(`INSERT INTO organization_settings(organization_id, key, value) VALUES (?, 'services', '[{"id":"tourist_tax","active":false}]')
    ON CONFLICT(organization_id, key) DO UPDATE SET value = excluded.value`).run(org.id);
  db.prepare(`INSERT INTO accommodations(id, organization_id, name, type, price_per_night, max_guests)
    VALUES ('unit', ?, 'Suite de teste', 'alojamento', 100, 4)`).run(org.id);
  const addVoucher = (code, maxUses = 1, minNights = 0) => db.prepare(`INSERT INTO vouchers(id, organization_id, code, type, value, status, max_uses, min_nights)
    VALUES (?, ?, ?, 'discount_pct', 10, 'active', ?, ?)`).run(code.toLowerCase(), org.id, code, maxUses, minNights);
  addVoucher('DEZ');
  addVoucher('MINDUAS', 1, 2);
  addVoucher('NOVA10', 5);

  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const api = async (method, url, body) => {
    const response = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', Cookie: `${auth.SESSION_COOKIE}=${session}` }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  const createReservation = async (checkIn, checkOut, voucher) => {
    const result = await api('POST', '/api/reservations', { accommodation_id: 'unit', check_in: checkIn, check_out: checkOut, num_adults: 1, num_children: 0,
      guest: { name: 'Hóspede Sintético', email: `wizard-${checkIn}@example.invalid` }, voucher_code: voucher });
    assert.equal(result.status, 201, JSON.stringify(result.body));
    return result.body.data;
  };

  const engine = process.env.BROWSER_ENGINE === 'webkit' ? webkit : chromium;
  browser = await engine.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await context.addCookies([{ name: auth.SESSION_COOKIE, value: session, url: base }]);
  await context.route('https://**/*', route => route.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.evaluate(() => AppModules.core.ensureFeature('reservas'));
  const openEdit = id => page.evaluate(id => AppModules.reservas.openEditModal(id), id);

  // 1. Editar datas: total com voucher igual no ecrã e na base.
  const moved = await createReservation('2035-03-01', '2035-03-03', 'DEZ');
  assert.equal(moved.total_amount, 180);
  await openEdit(moved.id);
  await expectShownTotal(page, 180);
  await expect(page.locator('#resf-voucher-line')).toContainText('Voucher DEZ');
  // Resposta antiga atrasada: a primeira cotação (4 noites) só chega depois da
  // segunda (3 noites) e não pode substituir o resultado atual.
  let delayed = 0;
  await page.route('**/api/reservations/*/quote', async route => {
    if (delayed++ === 0) await new Promise(resolve => setTimeout(resolve, 1200));
    await route.continue().catch(() => {});
  });
  await setStay(page, '2035-04-01', '2035-04-05');
  await expect(page.locator('#resf-total-badge')).toHaveText('A calcular…');
  await page.waitForTimeout(400); // a primeira cotação já saiu e está retida
  await setStay(page, '2035-04-01', '2035-04-04');
  await expectShownTotal(page, 270);
  await page.waitForTimeout(1200); // a resposta retida chegaria agora
  await expectShownTotal(page, 270);
  await page.unroute('**/api/reservations/*/quote');
  await expect(page.locator('#resf-voucher-line')).toContainText(/−30,00\s€/);
  await page.locator('#btn-guardar').click();
  await expect(page.locator('#modal-bg')).not.toHaveClass(/open/);
  assert.deepEqual(row(moved.id), { total_amount: 270, price_edited_at: null, check_in: '2035-04-01', check_out: '2035-04-04' });
  assert.equal(redemption(moved.id).discount_amount, 30);

  // 2. Voucher que deixa de cumprir o mínimo de noites: explicação e confirmação.
  const short = await createReservation('2035-05-01', '2035-05-03', 'MINDUAS');
  assert.equal(short.total_amount, 180);
  await openEdit(short.id);
  await expectShownTotal(page, 180);
  await setStay(page, '2035-05-01', '2035-05-02');
  await expectShownTotal(page, 100);
  await expect(page.locator('#resf-voucher-line')).toContainText('exige pelo menos 2 noites');
  await expect(page.locator('#resf-voucher-line')).toHaveAttribute('data-tone', 'warn');
  await page.locator('#btn-guardar').click();
  const dialog = page.locator('.modal-bg.open .modal').filter({ hasText: 'Confirmar o novo total?' });
  await expect(dialog).toContainText('exige pelo menos 2 noites');
  await expect(dialog).toContainText(/100,00\s€/);
  await dialog.locator('[data-pc-cancel]').click();
  assert.equal(row(short.id).total_amount, 180, 'cancelar a confirmação não grava');
  await page.locator('#btn-guardar').click();
  await page.locator('.modal-bg.open [data-pc-confirm]').click();
  await expect(page.locator('#modal-bg')).not.toHaveClass(/open/);
  assert.equal(row(short.id).total_amount, 100);
  assert.equal(row(short.id).check_out, '2035-05-02');

  // 3. Voucher alterado por outra pessoa depois da cotação: a gravação é
  // recusada (409) e o wizard mostra o novo total em vez de gravar o antigo.
  const stale = await createReservation('2035-06-01', '2035-06-03', 'NOVA10');
  await openEdit(stale.id);
  await setStay(page, '2035-06-10', '2035-06-12');
  await expectShownTotal(page, 180);
  db.prepare("UPDATE vouchers SET value = 25 WHERE code = 'NOVA10'").run();
  await page.locator('#btn-guardar').click();
  await expect(page.locator('.toast', { hasText: /O total da reserva é agora 150,00\s€/ })).toBeVisible();
  await expectShownTotal(page, 150);
  assert.equal(row(stale.id).check_in, '2035-06-01', 'o total antigo não foi gravado');
  await page.locator('#btn-guardar').click();
  await expect(page.locator('#modal-bg')).not.toHaveClass(/open/);
  assert.equal(row(stale.id).total_amount, 150);
  db.prepare("UPDATE vouchers SET value = 10 WHERE code = 'NOVA10'").run();

  // 4. Nova reserva com código: o desconto aparece antes de gravar.
  await page.evaluate(() => AppModules.reservas.openModal({ checkIn: '2035-07-01', checkOut: '2035-07-03', accommodationId: 'unit' }));
  await page.locator('#f-nome-completo').fill('Hóspede Novo');
  await expectShownTotal(page, 200);
  await page.locator('#f-voucher-code').evaluate(input => input.removeAttribute('readonly'));
  await page.locator('#f-voucher-code').fill('NOVA10');
  await page.locator('#f-voucher-code').dispatchEvent('change');
  await expectShownTotal(page, 180);
  await setStay(page, '2035-07-01', '2035-07-04');
  await expectShownTotal(page, 270);
  await page.locator('#btn-guardar').click();
  await expect(page.locator('#modal-bg')).not.toHaveClass(/open/);
  const created = db.prepare("SELECT r.id, r.total_amount FROM reservations r JOIN guests g ON g.id = r.guest_id WHERE g.name = 'Hóspede Novo'").get();
  assert.equal(created.total_amount, 270);
  assert.equal(redemption(created.id).discount_amount, 30);

  assert.deepEqual(errors, []);
  console.log('Wizard com voucher: total apresentado = total gravado ao mudar datas (270 €), resposta antiga descartada, voucher inválido pede confirmação (100 €), voucher alterado entretanto recusado com 409 (150 €) e reserva nova com código (270 €).');
}

main().catch(async error => {
  console.error(error); process.exitCode = 1;
  const page = browser?.contexts()[0]?.pages()[0];
  const out = process.env.BROWSER_ARTIFACTS_DIR || path.join(os.tmpdir(), 'sp-wizard-voucher-preview');
  fs.mkdirSync(out, { recursive: true });
  if (page) await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true }).catch(() => {});
}).finally(async () => {
  if (browser) await browser.close();
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  db.close(); process.chdir(previous); fs.rmSync(temp, { recursive: true, force: true });
});
