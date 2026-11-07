// V2: páginas principais redesenhadas (Reservas e Calendário). Na V1 nada
// muda; nos aspetos novos: lista com colunas coladas opacas, ficha ainda no
// aspeto antigo, painel do dia ao lado do mês que se recolhe e fica guardado,
// e nada mais largo do que o ecrã no telemóvel. Dados sintéticos e base
// descartável; não lê .env.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium, expect } = require('@playwright/test');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-v2-paginas-'));
process.chdir(temp);
Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test', EMAIL_ENABLED: 'false', FRONTEND_PATH: path.resolve(__dirname, '../../../frontend') });
const app = require('../app');
const { db } = require('../config/database');
const auth = require('../services/authService');
const orgs = require('../services/orgService');
const appearance = require('../services/appearancePrefs');
const dates = require('../services/dates');
let server, browser;

async function main() {
  const org = orgs.createOrganization('Páginas V2');
  const user = auth.createUser({ name: 'Célia Pinto', email: 'celia@example.invalid', password: 'SyntheticPaginas123!' });
  orgs.createMembership({ organizationId: org.id, userId: user.id, role: 'owner' });
  const session = auth.createSession(user.id, org.id).sessionId;
  db.prepare(`INSERT INTO accommodations(id,organization_id,name,type,price_per_night,max_guests,checkin_time,checkout_time,color)
    VALUES('u',?,'Suite Oliveira','alojamento',100,4,'15:00','11:00','#5f7d6a')`).run(org.id);
  const today = dates.localDay();
  // Segunda reserva no mesmo mês que hoje, para se poder escolher o dia dela.
  let other = dates.addDays(today, 4);
  if (dates.addDays(other, 1).slice(0, 7) !== today.slice(0, 7)) other = dates.addDays(today, -6);
  const guest = db.prepare('INSERT INTO guests(id,organization_id,name,email) VALUES(?,?,?,?)');
  const res = db.prepare(`INSERT INTO reservations(id,organization_id,guest_id,accommodation_id,check_in,check_out,nights,num_guests,total_amount,amount_paid,status)
    VALUES(?,?,?,'u',?,?,?,2,?,?,?)`);
  for (const [id, name, ci, co, status] of [
    ['chega', 'Beatriz Pinto', today, dates.addDays(today, 2), 'confirmada'],
    ['depois', 'Rui Marques', other, dates.addDays(other, 2), 'pendente'],
  ]) {
    guest.run(`g-${id}`, org.id, name, `${id}@example.invalid`);
    res.run(id, org.id, `g-${id}`, ci, co, dates.daysBetween(ci, co), 200, 0, status);
  }

  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  await context.route('https://**/*', route => route.abort());
  await context.addCookies([{ name: auth.SESSION_COOKIE, value: session, url: base }]);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const panel = page.locator('#calendar-agenda-mobile');
  const modalOpen = () => page.locator('#modal-bg').evaluate(el => el.classList.contains('open'));

  // V1: sem painel do dia nem botão; tocar num dia abre a nova reserva.
  await page.goto(`${base}/calendario`);
  await expect(page.locator('#cal-grid .cal-day.today')).toBeVisible();
  await expect(panel).toBeHidden();
  await expect(page.locator('#cal-day-panel-toggle')).toBeHidden();
  await page.locator('#cal-grid .cal-day-click-area').nth(3).click();
  await expect.poll(modalOpen).toBe(true);

  // Vidro escuro: o painel do dia está ao lado do mês, com o dia de hoje.
  appearance.save(user.id, { look: 'vidro', mode: 'escuro' });
  await page.goto(`${base}/calendario`);
  await expect(panel).toBeVisible();
  await expect(panel.locator('.agenda-month')).toBeHidden();
  await expect(panel.locator('.agenda-reservation')).toHaveCount(1);
  await expect(panel.locator('.agenda-reservation-name')).toHaveText('Beatriz Pinto');
  const [grid, side] = await Promise.all([page.locator('.cal-wrap').boundingBox(), panel.boundingBox()]);
  assert(side.x > grid.x + grid.width, 'o painel do dia devia estar à direita do mês');

  // Tocar num dia mostra-o no painel (sem abrir a nova reserva)…
  const target = dates.addDays(other, 1);
  await page.locator('#cal-grid .cal-day:not(.other-month) .day-num', { hasText: new RegExp(`^${Number(target.slice(-2))}$`) }).click();
  await expect(panel.locator('.agenda-reservation-name')).toHaveText('Rui Marques');
  assert.equal(await modalOpen(), false);
  await expect(page.locator('#cal-grid .cal-day.is-selected .day-num')).toHaveText(String(Number(target.slice(-2))));
  // …e a nova reserva desse dia abre pelo botão do painel.
  await panel.getByRole('button', { name: 'Nova reserva' }).click();
  await expect.poll(modalOpen).toBe(true);
  await page.goto(`${base}/calendario`);

  // Recolher o painel: o mês ocupa a largura toda e a escolha fica guardada.
  const toggle = page.locator('#cal-day-panel-toggle');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  const before = (await page.locator('.cal-wrap').boundingBox()).width;
  await toggle.click();
  await expect(panel).toBeHidden();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  assert((await page.locator('.cal-wrap').boundingBox()).width > before + 250, 'o mês devia ocupar o espaço do painel');
  await page.goto(`${base}/calendario`);
  await expect(page.locator('#cal-grid .cal-day.today')).toBeVisible();
  await expect(panel).toBeHidden();
  await toggle.click();
  await expect(panel).toBeVisible();

  // Na timeline o painel e o botão não aparecem.
  await page.locator('#cal-main-toggle [data-mode="timeline"]').click();
  await expect(page.locator('#timeline-wrap')).toBeVisible();
  await expect(toggle).toBeHidden();
  await expect(panel).toBeHidden();
  await page.locator('#cal-main-toggle [data-mode="calendar"]').click();

  // Reservas em lista: as colunas coladas à direita têm fundo opaco.
  await page.goto(`${base}/reservas`);
  await expect(page.locator('#reservas-results-total')).toHaveText('2');
  await page.locator('[data-res-view="list"]').click();
  await expect(page.locator('#reservas-table tbody tr')).toHaveCount(2);
  const stuck = await page.locator('#reservas-table tbody tr').first().locator('td').last()
    .evaluate(td => getComputedStyle(td).backgroundColor);
  assert.match(stuck, /^rgb\(/, `coluna colada sem fundo opaco (${stuck})`);
  await expect(page.locator('#reservas-table .acc-chip').first()).toHaveText('Suite Oliveira');

  // A ficha ainda não está redesenhada: com ela aberta a vista perde o [data-v2].
  await page.locator('#reservas-table tbody tr').first().locator('td[data-col="guest_name"]').click();
  await expect(page.locator('.rf-guest-name')).toBeVisible();
  assert.equal(await page.locator('#view-reservas').getAttribute('data-v2'), null);
  await page.locator('.rf-back').click();
  await expect(page.locator('#reservas-table tbody tr').first()).toBeVisible();
  await expect(page.locator('#view-reservas')).toHaveAttribute('data-v2', '');

  // Telemóvel: nada mais largo do que o ecrã, em cada aspeto.
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [look, mode] of [['classico', 'auto'], ['vidro', 'claro'], ['vidro', 'escuro']]) {
    appearance.save(user.id, { look, mode });
    for (const view of ['reservas', 'calendario']) {
      await page.goto(`${base}/${view}`);
      await expect(page.locator(`#view-${view}.active`)).toBeVisible();
      await page.waitForTimeout(200);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${view} mais largo do que o ecrã (${look} ${mode})`);
    }
  }
  await expect(page.locator('#calendar-agenda-mobile .agenda-month')).toBeVisible();

  assert.deepEqual(errors, []);
  console.log('OK: V2 — Reservas (lista com colunas coladas opacas, ficha no aspeto antigo) e Calendário (painel do dia ao lado do mês, escolher dia, nova reserva, recolher guardado, timeline) e largura no telemóvel.');
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  db.close();
});
