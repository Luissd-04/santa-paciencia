// Som do sino com dados sintéticos: não toca ao abrir nem ao recarregar,
// toca com um aviso novo e respeita o botão de som deste aparelho.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium, expect } = require('@playwright/test');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-notif-sound-'));
process.chdir(temp);
Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test', EMAIL_ENABLED: 'false', FRONTEND_PATH: path.resolve(__dirname, '../../../frontend') });
const app = require('../app');
const { db } = require('../config/database');
const auth = require('../services/authService');
const orgs = require('../services/orgService');
let server, browser;

async function main() {
  const org = orgs.createOrganization('Som do sino');
  const user = auth.createUser({ name: 'Teste', email: 'sound@example.invalid', password: 'SyntheticSound123!' });
  orgs.createMembership({ organizationId: org.id, userId: user.id, role: 'owner' });
  const session = auth.createSession(user.id, org.id).sessionId;
  db.prepare('INSERT INTO accommodations(id,organization_id,name,type,price_per_night,max_guests) VALUES(?,?,?,?,?,?)').run('unit', org.id, 'Suite Oliveira', 'alojamento', 100, 4);
  const addPending = id => {
    db.prepare('INSERT INTO guests(id,organization_id,name,email) VALUES(?,?,?,?)').run(id, org.id, `Hóspede ${id}`, `${id}@example.invalid`);
    db.prepare(`INSERT INTO reservations(id,organization_id,guest_id,accommodation_id,check_in,check_out,nights,num_guests,total_amount,status)
      VALUES(?,?,?,'unit','2035-07-06','2035-07-08',2,2,200,'pendente')`).run(id, org.id, id);
  };
  addPending('first');
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, serviceWorkers: 'block' });
  await context.route('https://**/*', route => route.abort());
  // Conta as notas tocadas sem depender de colunas de som no servidor de CI.
  await context.addInitScript(() => {
    window.__notes = 0;
    window.AudioContext = class {
      constructor() { this.state = 'suspended'; this.currentTime = 0; this.destination = {}; }
      resume() { this.state = 'running'; return Promise.resolve(); }
      createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: target => target }; }
      createOscillator() { return { frequency: {}, connect: target => target, start: () => { window.__notes++; }, stop() {} }; }
    };
  });
  await context.addCookies([{ name: auth.SESSION_COOKIE, value: session, url: base }]);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const notes = () => page.evaluate(() => window.__notes);
  await page.goto(base);
  await expect(page.locator('body')).toHaveClass(/auth-ready/);
  await expect(page.locator('#notif-badge')).toHaveText('1');
  await page.locator('body').click({ position: { x: 5, y: 400 } }); // desbloqueia o áudio
  assert.equal(await notes(), 0, 'abrir a app não toca');

  addPending('second');
  await page.evaluate(() => AppModules.core.loadNotifications());
  await expect(page.locator('#notif-badge')).toHaveText('2');
  await expect.poll(notes).toBe(2); // duas notas
  await page.evaluate(() => AppModules.core.loadNotifications());
  assert.equal(await notes(), 2, 'o mesmo aviso não volta a tocar');

  // Recarregar a página não toca pelos avisos que já lá estavam.
  await page.reload();
  await expect(page.locator('#notif-badge')).toHaveText('2');
  await page.locator('body').click({ position: { x: 5, y: 400 } });
  await page.evaluate(() => AppModules.core.loadNotifications());
  assert.equal(await notes(), 0);

  // Desligar o som neste aparelho.
  await page.locator('.notif-bell').click();
  const toggle = page.getByRole('button', { name: 'Som dos avisos' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await toggle.click();
  await expect(page.getByRole('button', { name: 'Som dos avisos' })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#notif-dropdown')).toHaveClass(/open/);
  addPending('third');
  await page.evaluate(() => AppModules.core.loadNotifications());
  await expect(page.locator('#notif-badge')).toHaveText('3');
  assert.equal(await notes(), 0, 'com o som desligado não toca');
  // Voltar a ligar toca uma vez, para confirmar o som.
  await page.getByRole('button', { name: 'Som dos avisos' }).click();
  await expect.poll(notes).toBe(2);
  assert.deepEqual(errors, []);
  console.log('OK: som do sino — não toca ao abrir nem ao recarregar, toca com aviso novo, botão por aparelho.');
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  db.close();
});
