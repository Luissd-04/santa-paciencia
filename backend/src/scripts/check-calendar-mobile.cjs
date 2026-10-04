// Calendário real com dados sintéticos e base descartável; não lê .env.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium, expect } = require('@playwright/test');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-calendar-'));
process.chdir(temp);
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
  const org = orgs.createOrganization('Calendário de teste');
  const user = auth.createUser({ name: 'Teste', email: 'calendar@example.invalid', password: 'SyntheticCalendar123!' });
  orgs.createMembership({ organizationId: org.id, userId: user.id, role: 'owner' });
  const session = auth.createSession(user.id, org.id).sessionId;
  db.prepare('INSERT INTO accommodations(id,organization_id,name,type,price_per_night,max_guests) VALUES(?,?,?,?,?,?)').run('unit', org.id, 'Suite Oliveira', 'alojamento', 100, 4);
  const fixtures = [
    ['arrival', 'Marta Silva', '2030-07-06', '2030-07-08', 'confirmada'],
    ['stay', 'João Fernandes', '2030-07-05', '2030-07-09', 'pre_checkin'],
    ['departure', 'Ana Costa', '2030-07-04', '2030-07-06', 'confirmada'],
    ['cancelled', 'Cancelada Teste', '2030-07-06', '2030-07-08', 'cancelada'],
  ];
  for (const [id, name, start, end, status] of fixtures) {
    db.prepare('INSERT INTO guests(id,organization_id,name,email) VALUES(?,?,?,?)').run(id, org.id, name, `${id}@example.invalid`);
    db.prepare(`INSERT INTO reservations(id,organization_id,guest_id,accommodation_id,check_in,check_out,nights,num_guests,num_adults,num_children,total_amount,status)
      VALUES(?,?,?,'unit',?,?,2,3,2,1,200,?)`).run(id, org.id, id, start, end, status);
  }
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, serviceWorkers: 'block' });
  await context.route('https://**/*', route => route.abort());
  const base = `http://127.0.0.1:${server.address().port}`;
  await context.addCookies([{ name: auth.SESSION_COOKIE, value: session, url: base }]);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  await page.evaluate(async () => {
    await AppModules.core.showView('calendario');
    AppModules.core.calYear = 2030; AppModules.core.calMonth = 6;
    await AppModules.calendario.renderCal();
  });
  await expect(page.locator('.agenda-date')).toHaveCount(31);
  const day = page.locator('[data-agenda-date="2030-07-06"]');
  await day.click();
  await expect(day).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.agenda-reservation')).toHaveCount(3);
  assert.deepEqual(await page.locator('.agenda-day-summary strong').allTextContents(), ['1', '1', '1']);
  await expect(page.locator('.agenda-reservation').filter({ hasText: 'Marta Silva' })).toContainText('2 adultos · 1 criança');
  await page.screenshot({ path: path.join(temp, 'calendar-mobile.png') });
  await page.locator('.agenda-reservation').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(temp, 'calendar-reservations.png') });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.locator('.agenda-reservation').filter({ hasText: 'Marta Silva' }).click();
  await expect(page.locator('.rdv2-if-val').filter({ hasText: 'Marta Silva' })).toBeVisible();
  await page.getByRole('button', { name: 'Calendário', exact: true }).click();
  await page.locator('[data-agenda-date="2030-07-20"]').click();
  await expect(page.locator('.agenda-day-empty')).toBeVisible();
  assert.deepEqual(await page.locator('.agenda-day-summary strong').allTextContents(), ['0', '0', '0']);
  await page.locator('#view-calendario [data-on-click="index-cal-next-f650b4e"]').first().click();
  await expect(page.locator('#cal-label')).toHaveText('Agosto 2030');
  await expect(page.locator('[data-agenda-date="2030-08-01"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#view-calendario [data-on-click="index-go-today-7e4aadc"]').first().click();
  await expect(page.locator('.agenda-date[aria-current="date"]')).toHaveAttribute('aria-pressed', 'true');
  for (const width of [320, 600]) {
    await page.setViewportSize({ width, height: 812 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator('#cal-landscape')).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator('.cal-wrap').first()).toBeVisible();
  await page.evaluate(() => AppModules.calendario.setCalMode('timeline'));
  await expect(page.locator('#timeline-wrap')).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.locator('.agenda-month')).toBeVisible();
  await page.reload();
  await page.evaluate(() => AppModules.core.showView('calendario'));
  await expect(page.locator('.agenda-month')).toBeVisible();
  await expect(page.locator('.agenda-date[aria-current="date"]')).toHaveAttribute('aria-pressed', 'true');
  assert.deepEqual(errors, []);
  console.log(`OK: seleção, contagens, detalhes, dias vazios, navegação, layouts e preferência timeline. Capturas: ${temp}`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  db.close();
});
