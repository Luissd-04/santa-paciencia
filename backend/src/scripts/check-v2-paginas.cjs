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

  db.prepare(`INSERT INTO vouchers(id, organization_id, code, type, value, description, valid_until, max_uses, status) VALUES ('vx',?,'NATAL2026','discount_fixed',150,'Oferta de Natal',?,1,'active')`).run(org.id, dates.addDays(today, 40));

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
  // O menu de um filtro aberto fica por cima da lista (antes a lista tapava-o).
  await page.locator('#reservas-filters-toggle').click();
  await page.locator('.app-select-button', { hasText: 'Todos os canais' }).click();
  const menu = page.locator('.app-select.is-open .app-select-menu');
  await expect(menu).toBeVisible();
  assert.ok(await menu.evaluate(el => {
    const r = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(r.left + r.width / 2, r.bottom - 8));
  }), 'menu do filtro tapado pela lista');
  await page.keyboard.press('Escape');
  await page.locator('#reservas-filters-toggle').click();

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
  // Botões da barra e filtros por tipo com a mesma altura; os filtros não
  // colam à semana.
  const heights = await page.locator('#eventos-panel-semana').evaluate(el => [...el.querySelectorAll('.ev2-toolbar > .btn, .evt-type-chip')]
    .filter(b => b.offsetHeight).map(b => b.offsetHeight));
  assert.equal(new Set(heights).size, 1, `alturas diferentes na barra dos Eventos: ${heights}`);
  const chipsGap = await page.locator('#eventos-panel-semana').evaluate(el => el.querySelector('.ev2-layout').getBoundingClientRect().top - el.querySelector('.eventos-type-chips-row').getBoundingClientRect().bottom);
  assert.ok(chipsGap >= 12, `filtros colados à semana (${chipsGap}px)`);

  // Notificações como na maqueta: filtros, lista por dia com «por ler»,
  // ler ao tocar, «Marcar todas como lidas» (guardado no servidor por pessoa),
  // resumo recolhível ao lado e preferências de push.
  await page.goto(`${base}/notificacoes`);
  const items = page.locator('#notifications-page-list .nv2-item');
  const resumo = page.locator('#notifications-side');
  const nchips = page.locator('#notif-v2-toolbar .rv2-chip');
  await expect(items.first()).toBeVisible();
  await expect(resumo).toBeVisible();
  await expect(page.locator('.nv2-section h4').first()).toHaveText('Hoje');
  const all = await items.count();
  await expect(page.locator('#notifications-page-list .nv2-item.is-unread')).toHaveCount(all);
  await expect(nchips.filter({ hasText: 'Por ler' })).toHaveText(`Por ler ${all}`);
  await nchips.filter({ hasText: 'Reservas' }).click();
  await expect(items.filter({ hasText: 'Rui Marques' })).toHaveCount(1);
  await nchips.filter({ hasText: 'Todas' }).click();
  await expect(items).toHaveCount(all);
  // Tocar num aviso marca-o como lido (e o sino conta menos um).
  const pendingItem = items.filter({ hasText: 'Reserva pendente' });
  await pendingItem.locator('.nv2-when').click();
  await expect(pendingItem).not.toHaveClass(/is-unread/);
  await expect.poll(() => db.prepare("SELECT COUNT(*) AS n FROM notification_state WHERE user_id=? AND read_at IS NOT NULL").get(user.id).n).toBe(1);
  await expect(page.locator('#notif-badge')).toHaveText(String(all - 1));
  await page.locator('#notif-v2-toolbar .nv2-read-all').click();
  await expect(page.locator('#notifications-page-list .nv2-item.is-unread')).toHaveCount(0);
  await expect.poll(() => db.prepare("SELECT COUNT(*) AS n FROM notification_state WHERE user_id=? AND read_at IS NULL").get(user.id).n).toBe(0);
  await expect(page.locator('#notif-badge')).toBeHidden();
  // O resumo recolhe e a escolha fica guardada.
  const sideToggle = page.locator('#notif-side-toggle');
  await sideToggle.click();
  await expect(resumo).toBeHidden();
  await page.goto(`${base}/notificacoes`);
  await expect(items.first()).toBeVisible();
  await expect(resumo).toBeHidden();
  await expect(page.locator('#notifications-page-list .nv2-item.is-unread')).toHaveCount(0);
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
  // Ao abrir a conversa de uma reserva, o painel da reserva fica ao lado.
  await page.locator('.invoice-thread-item', { hasText: 'Beatriz Pinto' }).click();
  const ctx = page.locator('#invoice-thread-detail .iv2-ctx');
  await expect(ctx).toBeVisible();
  await expect(ctx).toContainText('chega');
  await expect(ctx.locator('.iv2-owed')).toHaveText('200,00 €');
  await ctx.getByRole('button', { name: 'Abrir reserva' }).click();
  await expect(page.locator('.rf-guest-name')).toHaveText('Beatriz Pinto');

  // Alojamentos: cartões da maqueta com a ocupação do mês; a tabela da V1 sai.
  // Uma foto que já não existe sai e fica a cor com a casa (não a imagem partida).
  db.prepare("UPDATE accommodations SET cover_image='/uploads/foto-que-nao-existe.jpg' WHERE id='u'").run();
  await page.goto(`${base}/alojamentos`);
  const roomCard = page.locator('#aloj-v2 .av2-card', { hasText: 'Suite Oliveira' });
  await expect(roomCard).toBeVisible();
  await expect(roomCard.locator('.av2-photo img')).toHaveCount(0);
  await expect(roomCard.locator('.av2-photo :is(svg, [data-lucide])')).toHaveCount(1);
  await expect(roomCard.locator('.av2-price')).toContainText('/ noite');
  await expect(roomCard.locator('.av2-price small')).toContainText('%');
  await expect(page.locator('#aloj-table')).toBeHidden();
  await roomCard.locator('h3').click();
  await expect(page.locator('#view-alojamento-detalhe')).toBeVisible();

  // Hóspedes: números, filtros rápidos (o segmento vai ao servidor) e a lista
  // com país, estadias e total gasto.
  db.prepare("UPDATE guests SET country='Espanha' WHERE id='g-depois'").run();
  await page.goto(`${base}/hospedes`);
  const guestRows = page.locator('#hv2-list .hv2-row');
  await expect(guestRows).toHaveCount(2);
  await expect(page.locator('#hv2-kpis .hv2-kpi').nth(2)).toContainText('Espanha 50%');
  await expect(guestRows.filter({ hasText: 'Beatriz Pinto' }).locator('.hv2-total')).toHaveText('200,00 €');
  await page.locator('#hv2-chips .rv2-chip', { hasText: 'Estrangeiros' }).click();
  await expect(guestRows).toHaveCount(1);
  await expect(guestRows.first()).toContainText('Rui Marques');
  await page.locator('#hv2-chips .rv2-chip', { hasText: 'Todos' }).click();
  await expect(guestRows).toHaveCount(2);

  // Preços: alojamentos em pílula; abre no primeiro e tocar noutro troca.
  db.prepare(`INSERT INTO accommodations(id,organization_id,name,type,price_per_night,max_guests) VALUES('u2',?,'Quarto Monsaraz','quarto',95,2)`).run(org.id);
  await page.goto(`${base}/precos`);
  const unitPills = page.locator('#precos-v2-units .rv2-chip');
  await expect(unitPills).toHaveCount(2);
  await expect(page.locator('#precos-v2-units .rv2-chip.is-on')).toHaveCount(1);
  await unitPills.filter({ hasText: 'Quarto Monsaraz' }).click();
  await expect(unitPills.filter({ hasText: 'Quarto Monsaraz' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#precos-base-price-val')).toHaveText('95,00 €');
  db.prepare("DELETE FROM accommodations WHERE id='u2'").run();

  // Vouchers: números, filtros por estado e um bilhete por voucher.
  await page.goto(`${base}/vouchers`);
  const ticket = page.locator('#vouchers-list-wrap .vv2-ticket', { hasText: 'NATAL2026' });
  await expect(ticket).toBeVisible();
  await expect(ticket.locator('.vv2-val')).toHaveText('150,00 €');
  await expect(page.locator('#vouchers-list-wrap .vv2-kpi').first()).toContainText('1');
  await expect(page.locator('#vouchers-list-wrap .rv2-chip.is-on')).toHaveText('Ativo 1');
  await ticket.locator('.vv2-code').click();
  await expect(page.locator('#voucher-modal-bg')).toHaveClass(/open/);

  // Despesas: quatro números (o do mês compara com o anterior, do servidor).
  db.prepare("INSERT INTO expenses (id,organization_id,date,description,category,amount) VALUES ('ex1',?,?,'Lavandaria','limpeza',84.5)").run(org.id, today);
  const lastMonth = dates.addDays(`${today.slice(0, 7)}-01`, -1);
  db.prepare("INSERT INTO expenses (id,organization_id,date,description,category,amount) VALUES ('ex0',?,?,'Gás','utilidades',40)").run(org.id, lastMonth);
  const summary = await page.evaluate(async () => (await (await fetch('/api/expenses/summary')).json()).data);
  assert.equal(summary.previousMonthTotal, 40);
  assert.equal(summary.byMonth, undefined);
  await page.goto(`${base}/despesas`);
  await expect(page.locator('#despesas-kpi-grid .dv2-kpi')).toHaveCount(4);
  await expect(page.locator('#despesas-kpi-grid .dv2-kpi').first()).toContainText('84,50');
  await expect(page.locator('#despesas-v2-meses')).toHaveCount(0);
  // Despesas no vidro escuro: os cartões de totais perdem o degradé claro da V1.
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
  console.log('OK: V2 — Reservas (lista da maqueta, filtros rápidos por estado, menu do filtro por cima da lista, teclado, ficha no aspeto antigo), Calendário (painel do dia ao lado do mês, escolher dia, nova reserva, recolher guardado, timeline), Notificações (filtros, por ler, ler ao tocar e todas, resumo recolhível, preferências de push), Mensagens (iniciais legíveis no escuro, painel da reserva), Eventos (vista Semana, marcar feito, resumo, alturas iguais), Alojamentos (cartões com ocupação, foto partida), Vouchers (bilhetes e filtros), Hóspedes (números, segmentos e total gasto), Preços (alojamentos em pílula), Despesas (os quatro números, sem o gráfico), Despesas e Definições no escuro e largura no telemóvel de todas as páginas principais redesenhadas.');
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  db.close();
});
