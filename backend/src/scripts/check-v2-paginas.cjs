// V2: páginas principais redesenhadas (Reservas, Calendário, Eventos,
// Notificações, Mensagens, Hóspedes, Alojamentos, Preços, Despesas,
// Relatórios, Vouchers e Definições). Na V1 nada
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

  const task = db.prepare(`INSERT INTO operational_events(id,organization_id,title,type,date,start_time,status,accommodation_id,responsible) VALUES(?,?,?,?,?,?,?,'u',?)`);
  task.run('t-limpeza', org.id, 'Limpeza completa', 'limpeza', today, '12:00', 'planeado', 'Maria Lopes');
  task.run('t-checkout', org.id, 'Check-out cedo', 'checkout', today, '09:00', 'concluido', 'Maria Lopes');

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
  await page.goto(`${base}/notificacoes`);
  await expect(page.locator('#notifications-page-list .notifications-page-item').first()).toBeVisible();
  await expect(page.locator('#notifications-side')).toBeHidden();
  await expect(page.locator('#notif-side-toggle')).toBeHidden();

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

  // Reservas: lista da maqueta (iniciais, alojamento com a cor, estado e
  // pagamento) e filtros rápidos com as contagens por estado do servidor.
  await page.goto(`${base}/reservas`);
  const rows = page.locator('#reservas-v2-list .rv2-row');
  await expect(rows).toHaveCount(2);
  await expect(page.locator('#reservas-table')).toBeHidden();
  await expect(rows.first().locator('.v2-av')).toHaveText('BP');
  await expect(rows.first().locator('.rv2-room .acc-chip')).toHaveText('Suite Oliveira');
  const chips = page.locator('#reservas-v2-chips .rv2-chip');
  await expect(chips).toHaveText(['Todas', 'Por aprovar 1', 'Confirmadas 1']);
  await chips.filter({ hasText: 'Por aprovar' }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Rui Marques');
  await expect(chips.filter({ hasText: 'Por aprovar' })).toHaveAttribute('aria-pressed', 'true');
  await chips.filter({ hasText: 'Todas' }).click();
  await expect(rows).toHaveCount(2);

  // A ficha ainda não está redesenhada: com ela aberta a vista perde o [data-v2].
  await rows.first().click();
  await expect(page.locator('.rf-guest-name')).toBeVisible();
  assert.equal(await page.locator('#view-reservas').getAttribute('data-v2'), null);
  await page.locator('.rf-back').click();
  await expect(rows.first()).toBeVisible();
  await expect(page.locator('#view-reservas')).toHaveAttribute('data-v2', '');
  // Teclado: Enter numa linha abre a ficha.
  await rows.first().focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.rf-guest-name')).toBeVisible();
  await page.locator('.rf-back').click();

  // Eventos: vista Semana da maqueta (faixa da semana, lista por hora com
  // responsável e marcar feito, mês pequeno e resumo da semana).
  await page.goto(`${base}/eventos`);
  const semana = page.locator('#eventos-panel-semana');
  await expect(semana).toBeVisible();
  await expect(page.locator('#ev2-week .ev2-wd')).toHaveCount(7);
  await expect(page.locator('#ev2-week .ev2-wd.is-on')).toHaveClass(/is-today/);
  const taskRows = page.locator('#ev2-days .ev2-day').first().locator('.ev2-row');
  await expect(taskRows).toHaveCount(2);
  await expect(taskRows.first()).toContainText('09:00');
  await expect(taskRows.nth(1).locator('.ev2-who')).toHaveText('ML');
  await expect(page.locator('#ev2-summary')).toContainText('1/2 feitas');
  await taskRows.nth(1).locator('.ev2-check').click();
  await expect(taskRows.nth(1)).toHaveClass(/is-done/);
  assert.equal(db.prepare("SELECT status FROM operational_events WHERE id='t-limpeza'").get().status, 'concluido');
  await expect(page.locator('#ev2-summary')).toContainText('2/2 feitas');
  await page.locator('[data-eventos-view="calendar"]').click();
  await expect(page.locator('#eventos-cal-grid')).toBeVisible();
  await page.locator('[data-eventos-view="semana"]').click();
  await expect(semana).toBeVisible();

  // Notificações: lista a toda a largura com o resumo ao lado; tocar num grupo
  // filtra a lista; o resumo recolhe e a escolha fica guardada.
  await page.goto(`${base}/notificacoes`);
  const items = page.locator('#notifications-page-list .notifications-page-item');
  const resumo = page.locator('#notifications-side');
  await expect(items.first()).toBeVisible();
  await expect(resumo).toBeVisible();
  const all = await items.count();
  const pedidos = resumo.locator('.notif-side-row', { hasText: 'Pedidos' });
  await expect(pedidos.locator('strong')).toHaveText('1');
  await pedidos.click();
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText('Rui Marques');
  await pedidos.click();
  await expect(items).toHaveCount(all);
  const sideToggle = page.locator('#notif-side-toggle');
  await sideToggle.click();
  await expect(resumo).toBeHidden();
  await page.goto(`${base}/notificacoes`);
  await expect(items.first()).toBeVisible();
  await expect(resumo).toBeHidden();
  await sideToggle.click();
  await resumo.getByRole('button', { name: 'Preferências de push' }).click();
  await expect(page.locator('#settings-push')).toBeVisible();

  // Mensagens no vidro escuro: as iniciais e a resposta não ficam brancas
  // sobre branco (na V1 eram tijolo com letra branca).
  await page.goto(`${base}/invoice`);
  const avatar = page.locator('.itt-avatar').first();
  await expect(avatar).toBeVisible();
  const [avatarBg, avatarInk] = await avatar.evaluate(el => [getComputedStyle(el).backgroundColor, getComputedStyle(el).color]);
  assert.notEqual(avatarBg, avatarInk, 'iniciais da conversa sem contraste');

  // Despesas no vidro escuro: os cartões de totais perdem o degradé claro da V1.
  await page.goto(`${base}/despesas`);
  const kpi = page.locator('#despesas-kpi-grid .kpi-card').first();
  await expect(kpi).toBeVisible();
  assert.equal(await kpi.evaluate(el => getComputedStyle(el).backgroundImage), 'none', 'cartão de totais das Despesas ainda claro');
  // Definições: o ícone de cada ligação tem contraste.
  await page.goto(`${base}/definicoes`);
  await page.locator('[data-settings-tab="gcal"]').click();
  const icon = page.locator('.settings-integration-icon').first();
  await expect(icon).toBeVisible();
  const [iconBg, iconInk] = await icon.evaluate(el => [getComputedStyle(el).backgroundColor, getComputedStyle(el.querySelector('svg') || el).color]);
  assert.notEqual(iconBg, iconInk, 'ícone da ligação sem contraste');

  // Telemóvel: nada mais largo do que o ecrã, em cada aspeto.
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [look, mode] of [['classico', 'auto'], ['vidro', 'claro'], ['vidro', 'escuro']]) {
    appearance.save(user.id, { look, mode });
    for (const view of ['reservas', 'calendario', 'eventos', 'notificacoes', 'invoice', 'hospedes', 'alojamentos', 'precos', 'despesas', 'relatorios', 'vouchers', 'definicoes']) {
      await page.goto(`${base}/${view}`);
      await expect(page.locator(`#view-${view}.active`)).toBeVisible();
      await page.waitForTimeout(200);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${view} mais largo do que o ecrã (${look} ${mode})`);
    }
  }
  // No telemóvel o Calendário mostra a agenda com o mês, como sempre.
  await page.goto(`${base}/calendario`);
  await expect(page.locator('#calendar-agenda-mobile .agenda-month')).toBeVisible();

  assert.deepEqual(errors, []);
  console.log('OK: V2 — Reservas (lista da maqueta, filtros rápidos por estado, teclado, ficha no aspeto antigo), Calendário (painel do dia ao lado do mês, escolher dia, nova reserva, recolher guardado, timeline), Notificações (resumo ao lado, filtro por grupo, recolher guardado, preferências de push), Mensagens (iniciais legíveis no escuro), Eventos (vista Semana, marcar feito, resumo), Despesas e Definições no escuro e largura no telemóvel de todas as páginas principais redesenhadas.');
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  db.close();
});
