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
  // A nova reserva da V1 continua numa página só, sem os passos do computador.
  await expect(page.locator('#resf-dstepper')).toBeHidden();
  await expect(page.locator('#resf-dsummary')).toBeHidden();
  await expect(page.locator('#btn-guardar')).toBeVisible();
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

  // A ficha da reserva também está na V2 (maqueta inter-01): a vista fica com o [data-v2].
  await rows.first().click();
  await expect(page.locator('.rf-guest-name')).toBeVisible();
  await expect(page.locator('#view-reservas')).toHaveAttribute('data-v2', '');
  // «Próximo passo» legível no vidro escuro (na V1 tinha fundo claro fixo).
  if (await page.locator('.rf-next').count()) {
    const [fundo, letra] = await page.locator('.rf-next').evaluate(el => [getComputedStyle(el).backgroundColor, getComputedStyle(el.querySelector('.rf-next-text strong')).color]);
    assert.notEqual(fundo, 'rgb(255, 247, 233)', `próximo passo com o fundo claro da V1 (${letra})`);
  }
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
  // Com uma capa que existe, a foto aparece: a miniatura pedida é uma das
  // larguras que o servidor gera (antes pedia 640 e levava 400).
  fs.mkdirSync('data/uploads', { recursive: true });
  await require('sharp')({ create: { width: 1200, height: 800, channels: 3, background: '#5f7d6a' } }).jpeg().toFile('data/uploads/capa-v2.jpg');
  db.prepare("UPDATE accommodations SET cover_image='/uploads/capa-v2.jpg' WHERE id='u'").run();
  await page.reload();
  const capa = roomCard.locator('.av2-photo img');
  await expect(capa).toHaveAttribute('src', '/uploads/capa-v2.jpg?w=1024');
  await expect.poll(() => capa.evaluate(img => img.complete && img.naturalWidth)).toBe(1024);
  // «Calendário» abre o calendário da plataforma só com esta unidade (mesmo
  // com um Google Calendar ligado, que na V1 continua a abrir).
  db.prepare("UPDATE accommodations SET google_calendar_id='suite@group.calendar.google.com' WHERE id='u'").run();
  await page.reload();
  await roomCard.getByRole('button', { name: 'Calendário' }).click();
  await expect(page.locator('#view-calendario')).toBeVisible();
  await expect(page.locator('#cal-suite-filter')).toHaveValue('u');
  await expect(page).toHaveURL(/\/calendario/);
  await page.goto(`${base}/alojamentos`);
  await roomCard.locator('h3').click();
  await expect(page.locator('#view-alojamento-detalhe')).toBeVisible();
  // Configurações (maquetas ap e as1–as3): cabeçalho com a capa, menu de
  // secções em vez dos separadores; um alojamento sem pai abre na visão geral.
  const det = page.locator('#view-alojamento-detalhe');
  await expect(det).toHaveClass(/acfg-on/);
  await expect(det.locator('.aloj-tabs')).toBeHidden();
  await expect(det.locator('.acfg-head h2')).toHaveText('Suite Oliveira');
  await expect(det.locator('.acfg-i[aria-current="true"]')).toContainText('Visão geral');
  await expect(det.locator('.acfg-visao')).toContainText('Ainda sem unidades');
  await expect(det.locator('#aloj-nome')).toBeHidden();
  // Com uma unidade: aparece na visão geral e abre com o que herda ao lado.
  db.prepare(`INSERT INTO accommodations(id,organization_id,name,type,parent_id,price_per_night,max_guests)
    VALUES('u9',?,'Quarto Figueira','quarto','u',80,2)`).run(org.id);
  db.prepare("UPDATE accommodations SET wifi_name='Oliveira-WiFi', checkin_time='16:00' WHERE id='u'").run();
  await page.goto(`${base}/alojamentos`);
  // Com unidades, o alojamento passa a ser o cabeçalho do grupo.
  await page.locator('#aloj-v2 .av2-group-h', { hasText: 'Suite Oliveira' }).getByRole('button', { name: 'Editar alojamento' }).click();
  const unidade = det.locator('.acfg-unit', { hasText: 'Quarto Figueira' });
  await expect(unidade).toContainText('2 hóspedes');
  await unidade.getByRole('button', { name: 'Editar' }).click();
  await expect(det.locator('.acfg-head h2')).toHaveText('Quarto Figueira');
  await expect(det.locator('.acfg-crumb')).toContainText('Suite Oliveira');
  const herdado = det.locator('.acfg-side');
  await expect(herdado).toContainText('Vem de Suite Oliveira');
  await expect(herdado).toContainText('Oliveira-WiFi');
  await expect(det.locator('.acfg-i[aria-current="true"]')).toContainText('Geral');
  await expect(det.locator('#aloj-nome')).toBeVisible();
  await expect(det.locator('#aloj-preco')).toBeHidden();
  await det.locator('.acfg-i', { hasText: 'Capacidade e preço' }).click();
  await expect(det.locator('#aloj-preco')).toBeVisible();
  await expect(det.locator('#aloj-nome')).toBeHidden();
  await det.locator('.acfg-i', { hasText: 'Fotos' }).click();
  await expect(det.locator('#aloj-tab-imagens')).toBeVisible();
  await expect(det.locator('#aloj-preco')).toBeHidden();
  // Alterar mostra «Alterações por guardar»; guardar grava e fica na mesma secção.
  await det.locator('.acfg-i', { hasText: 'Capacidade e preço' }).click();
  await expect(det.locator('.acfg-save')).toBeHidden();
  await det.locator('#aloj-preco').fill('85');
  await expect(det.locator('.acfg-save')).toBeVisible();
  await det.locator('.acfg-save').getByRole('button', { name: 'Guardar' }).click();
  await expect.poll(() => db.prepare("SELECT price_per_night FROM accommodations WHERE id='u9'").get().price_per_night).toBe(85);
  await expect(det.locator('.acfg-save')).toBeHidden();
  await expect(det.locator('.acfg-i[aria-current="true"]')).toContainText('Capacidade e preço');
  db.prepare("DELETE FROM accommodations WHERE id='u9'").run();

  // Hóspedes: números, filtros rápidos (o segmento vai ao servidor) e a lista
  // com país, estadias e total gasto.
  db.prepare("UPDATE guests SET country='Espanha' WHERE id='g-depois'").run();
  // Uma segunda ficha da Beatriz (outro pedido, mesmo email): fica na mesma linha.
  db.prepare(`INSERT INTO guests(id,organization_id,name,email) VALUES('g-chega-2',?,'Beatriz Pinheiro Pinto','CHEGA@example.invalid')`).run(org.id);
  await page.goto(`${base}/hospedes`);
  const guestRows = page.locator('#hv2-list .hv2-row');
  await expect(guestRows).toHaveCount(2);
  await expect(page.locator('#hv2-kpis .hv2-kpi').nth(2)).toContainText('Espanha 50%');
  await expect(guestRows.filter({ hasText: 'Beatriz Pinto' }).locator('.hv2-total')).toHaveText('200,00 €');
  const fichasBtn = guestRows.filter({ hasText: 'Beatriz Pinto' }).locator('.hv2-fichas');
  await expect(fichasBtn).toContainText('2 fichas');
  await fichasBtn.click();
  await expect(page.locator('#hv2-list .hv2-fichas-list .hv2-ficha')).toHaveCount(2);
  await expect(page.locator('#hv2-list .hv2-fichas-list')).toContainText('Beatriz Pinheiro Pinto');
  await expect(page.locator('#view-hospedes')).toBeVisible();
  await fichasBtn.click();
  await expect(page.locator('#hv2-list .hv2-fichas-list')).toHaveCount(0);
  await page.locator('#hv2-chips .rv2-chip', { hasText: 'Estrangeiros' }).click();
  await expect(guestRows).toHaveCount(1);
  await expect(guestRows.first()).toContainText('Rui Marques');
  await page.locator('#hv2-chips .rv2-chip', { hasText: 'Todos' }).click();
  await expect(guestRows).toHaveCount(2);
  // Ficha do hóspede (maqueta inter-02): o resumo por cima e o formulário só ao «Editar».
  // Últimas mensagens enviadas a este email, com quem as enviou.
  db.prepare(`INSERT INTO invoice_messages(id,organization_id,to_email,subject,body_html,reservation_id,sent_by_user_id)
    VALUES('m1',?,'chega@example.invalid','Confirmação da reserva','<p>Olá</p>','chega',?)`).run(org.id, user.id);
  await guestRows.filter({ hasText: 'Beatriz Pinto' }).click();
  const fichaH = page.locator('#hf2-ficha');
  await expect(fichaH.locator('.hf2-kpi')).toHaveCount(4);
  await expect(fichaH.locator('.hf2-grid > .hf2-card .hf2-res')).toHaveCount(1);
  await expect(page.locator('#view-hospede-detalhe > section.card')).toBeHidden();
  await expect(fichaH.locator('.hf2-outras')).toContainText('Beatriz Pinheiro Pinto');
  await expect(fichaH.locator('.hf2-outras')).toContainText('0 estadias');
  const msgs = page.locator('#hf2-msgs');
  await expect(msgs.locator('.hf2-res')).toHaveCount(1);
  await expect(msgs).toContainText('Confirmação da reserva');
  await expect(msgs).toContainText('Célia Pinto');
  // Notas: «Adicionar» abre o formulário no campo das notas; guardadas, ficam
  // na ficha do hóspede e na ficha de cada reserva dele.
  await expect(fichaH.locator('.hf2-notes .hf2-empty')).toBeVisible();
  await fichaH.locator('.hf2-notes').getByRole('button', { name: 'Adicionar' }).click();
  await expect(page.locator('#gedit-notes')).toBeFocused();
  await expect(page.locator('#gedit-first-name')).toHaveValue('Beatriz');
  await page.locator('#gedit-notes').fill('Alérgica a frutos secos.');
  await page.locator('#btn-guardar-hospede').click();
  await expect.poll(() => db.prepare("SELECT notes FROM guests WHERE id='g-chega'").get().notes).toBe('Alérgica a frutos secos.');
  await page.evaluate(() => AppModules.hospedes.openGuestEdit('g-chega'));
  await expect(page.locator('#hf2-ficha .hf2-note')).toHaveText('Alérgica a frutos secos.');
  await page.evaluate(() => AppModules.core.abrirReserva('chega'));
  await expect(page.locator('.rf-card', { hasText: 'Notas do hóspede' })).toContainText('Alérgica a frutos secos.');

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

  // Nova reserva no computador (maquetas nr1–nr4): quatro passos, o nrResumo ao
  // lado com as linhas do servidor, e cada passo só avança com a sua parte.
  await page.goto(`${base}/`);
  await page.waitForFunction(() => typeof AppModules.core.novaReserva === 'function');
  await page.evaluate(() => AppModules.core.novaReserva());
  const nr = page.locator('#modal-bg');
  const passoAtual = nr.locator('#resf-dstepper [aria-current="step"]');
  const nrResumo = nr.locator('#resf-dsummary');
  await expect(nr).toHaveClass(/resf-dsteps/);
  await expect(nr.locator('#resf-dstepper .resf-dstep-tab')).toHaveCount(4);
  await expect(passoAtual).toContainText('Datas e hóspedes');
  await expect(nr.locator('#f-checkin')).toBeVisible();
  await expect(nr.locator('#suite-cards-grid')).toBeHidden();
  await expect(nr.locator('#btn-guardar')).toBeHidden();
  await expect(nrResumo).toContainText('O preço aparece quando escolheres o alojamento.');
  await nrResumo.locator('.resf-ds-next').click();
  await expect(passoAtual).toContainText('Datas e hóspedes');
  const nrIn = dates.addDays(today, 30);
  const nrOut = dates.addDays(today, 32);
  await page.evaluate(([a, b]) => {
    for (const [id, v] of [['f-checkin', a], ['f-checkout', b]]) {
      const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, [nrIn, nrOut]);
  await expect(nrResumo).toContainText('Noites');
  await nrResumo.locator('.resf-ds-next').click();
  await expect(passoAtual).toContainText('Alojamento');
  await expect(nr.locator('#f-checkin')).toBeHidden();
  await nr.locator('#suite-cards-grid .suite-card-opt', { hasText: 'Suite Oliveira' }).click();
  await expect(nrResumo.locator('.resf-ds-room')).toContainText('Suite Oliveira');
  await expect(nrResumo.locator('.resf-ds-chip')).toHaveText('Livre');
  await expect.poll(() => page.evaluate(() => {
    const q = AppModules.reservas.wizQuote;
    return q ? document.querySelector('#resf-dsummary .resf-ds-total b')?.textContent === ReservationMoney.format(q.total_amount) : false;
  })).toBe(true);
  await expect(nrResumo.locator('.resf-ds-line').first()).toContainText('2 noites');
  await nrResumo.locator('.resf-ds-next').click();
  await expect(passoAtual).toContainText('Hóspede');
  await nrResumo.locator('.resf-ds-next').click();
  await expect(passoAtual).toContainText('Hóspede');
  await nr.locator('#f-nome-completo').fill('Inês Duarte');
  await nrResumo.locator('.resf-ds-next').click();
  await expect(passoAtual).toContainText('Pagamento');
  await expect(nr.locator('#f-notas')).toBeVisible();
  await expect(nrResumo).toContainText('Inês Duarte');
  // Voltar e avançar mantêm o que foi preenchido.
  await nrResumo.getByRole('button', { name: 'Voltar' }).click();
  await expect(nr.locator('#f-nome-completo')).toHaveValue('Inês Duarte');
  await nrResumo.locator('.resf-ds-next').click();
  await nrResumo.getByRole('button', { name: 'Criar reserva' }).click();
  await expect.poll(() => db.prepare("SELECT r.check_in, r.accommodation_id FROM reservations r JOIN guests g ON g.id = r.guest_id WHERE g.name = 'Inês Duarte'").get())
    .toEqual({ check_in: nrIn, accommodation_id: 'u' });
  await expect(nr).not.toHaveClass(/open/);

  // Computador (maquetas 09 a 11): o sino, a conta e a «Ação Rápida» abrem por baixo do botão.
  await page.goto(`${base}/`);
  await page.waitForFunction(() => typeof AppModules.v2.abrirFolha === 'function');
  await page.locator('.topbar .notif-bell').click();
  await expect(page.locator('.v2f-pop #v2-sino .nv2-item').first()).toBeVisible();
  await expect(page.locator('#notif-dropdown')).toBeHidden();
  await page.keyboard.press('Escape');
  await page.locator('#auth-user-chip').click();
  const conta = page.locator('.v2f-pop #v2-conta');
  await expect(conta).toContainText('Célia Pinto');
  await expect(page.locator('#user-menu')).toBeHidden();
  await conta.getByRole('button', { name: 'Sessões ativas' }).click();
  await expect(page.locator('#sessions-modal')).toHaveClass(/open/);
  await page.keyboard.press('Escape');
  await page.locator('.quick-action-wrap > .btn').click();
  const criarPc = page.locator('.v2f-pop #v2-criar');
  await expect(criarPc.locator('.v2c-tile')).toHaveCount(6);
  await expect(page.locator('#quick-action-menu')).toBeHidden();
  await criarPc.locator('.v2c-tile', { hasText: 'Lembrete' }).click();
  await expect(page.locator('#manual-notification-modal-bg')).toHaveClass(/open/);
  await page.keyboard.press('Escape');

  // Janelas (maquetas 12 a 16). Confirmar dentro da app: Cancelar não apaga, Remover apaga.
  await page.goto(`${base}/despesas`);
  const apagar = page.locator('[data-on-click="delete-despesa"][data-id="ex1"]:visible');
  await apagar.click();
  const pergunta = page.locator('.modal-bg.v2-janela .v2-confirmar');
  await expect(pergunta).toContainText('Remover despesa');
  await pergunta.getByRole('button', { name: 'Cancelar' }).click();
  await expect(pergunta).toHaveCount(0);
  assert.ok(db.prepare("SELECT 1 FROM expenses WHERE id='ex1'").get(), 'Cancelar apagou a despesa');
  await apagar.click();
  await pergunta.getByRole('button', { name: 'Remover' }).click();
  await expect.poll(() => db.prepare("SELECT COUNT(*) AS n FROM expenses WHERE id='ex1'").get().n).toBe(0);
  // Bloquear datas: alojamentos em pílulas e as noites bloqueadas.
  await page.evaluate(() => AppModules.core.ensureFeature('bloqueios').then(() => AppModules.bloqueios.openBlockModal()));
  const bloqueio = page.locator('.modal-bg.v2-janela:has(#blk-acc)');
  await expect(bloqueio.locator('.v2-pills button', { hasText: 'Suite Oliveira' })).toHaveAttribute('aria-checked', 'true');
  await bloqueio.locator('#blk-start').fill(dates.addDays(today, 20));
  await bloqueio.locator('#blk-end').fill(dates.addDays(today, 22));
  await bloqueio.locator('#blk-end').dispatchEvent('change');
  await expect(bloqueio.locator('.v2-noites')).toContainText('3 noites bloqueadas');
  await page.keyboard.press('Escape');
  // A minha conta: perfil, palavra-passe e sessões com separadores.
  await page.evaluate(() => AppModules.core.openProfileModal());
  await expect(page.locator('#profile-modal .v2-conta-tabs [aria-current="page"]')).toContainText('Perfil');
  await page.locator('#profile-modal .v2-conta-tabs button', { hasText: 'Sessões ativas' }).click();
  await expect(page.locator('#sessions-modal')).toHaveClass(/open/);
  await expect(page.locator('#profile-modal')).not.toHaveClass(/open/);
  await page.keyboard.press('Escape');
  // Avisos: cartão com ícone em vez do emoji.
  await page.evaluate(() => AppModules.core.toast('✅ Reserva guardada', 'success'));
  await expect(page.locator('.toast .v2-aviso-ic.is-success')).toBeVisible();
  await expect(page.locator('.toast .v2-aviso-t').last()).toHaveText('Reserva guardada');

  // Telemóvel: nada mais largo do que o ecrã, em cada aspeto.
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [look, mode] of [['classico', 'auto'], ['vidro', 'claro'], ['vidro', 'escuro']]) {
    appearance.save(user.id, { look, mode });
    for (const view of ['reservas', 'calendario', 'eventos', 'notificacoes', 'invoice', 'hospedes', 'alojamentos', 'precos', 'despesas', 'relatorios', 'vouchers', 'definicoes']) {
      await page.goto(`${base}/${view}`);
      await expect(page.locator(`#view-${view}.active`)).toBeVisible();
      await page.waitForTimeout(200);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${view} mais largo do que o ecrã (${look} ${mode})`);
      // App instalada no iPhone: com a barra de estado (aqui simulada), a
      // barra de cima não pode tapar o início da página.
      const overlap = await page.evaluate(() => {
        document.documentElement.style.setProperty('--safe-top', '47px');
        scrollTo(0, 0);
        const bar = document.querySelector('.topbar').getBoundingClientRect();
        return bar.bottom - document.querySelector('.view.active').getBoundingClientRect().top;
      });
      assert(overlap <= 0, `${view}: a barra de cima tapa ${overlap}px da página (${look} ${mode})`);
    }
  }
  // No telemóvel o Calendário mostra a agenda com o mês, como sempre.
  await page.goto(`${base}/calendario`);
  await expect(page.locator('#calendar-agenda-mobile .agenda-month')).toBeVisible();

  // Telemóvel V2 (maquetas tel-01 a tel-03), no vidro escuro.
  await page.goto(`${base}/`);
  await expect(page.locator('#view-dashboard.active')).toBeVisible();
  await page.waitForFunction(() => typeof AppModules.v2.abrirFolha === 'function');
  // Menu: a conta em cima, pesquisa, claro/escuro (guardado na conta) e Definições/Sair.
  await page.locator('#mobile-menu-trigger').click();
  const drawer = page.locator('#side-drawer');
  await expect(drawer.locator('.v2d-search')).toBeVisible();
  const [accountTop, listTop] = await drawer.evaluate(el => ['.side-drawer-account', '.side-drawer-scroll'].map(s => el.querySelector(s).getBoundingClientRect().top));
  assert.ok(accountTop < listTop, 'a conta não ficou em cima no menu');
  await expect(drawer.locator('#side-drawer-avatar')).toHaveText('CP');
  await expect(drawer.locator('[data-v2-mode="escuro"]')).toHaveAttribute('aria-checked', 'true');
  await drawer.locator('[data-v2-mode="claro"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'claro');
  await expect.poll(() => appearance.get(user.id).mode).toBe('claro');
  await drawer.locator('.v2d-search').click();
  await expect(page.locator('#view-reservas.active')).toBeVisible();
  await expect(page.locator('#mobile-search-input')).toBeFocused();
  // Sino: folha com filtros e avisos por dia; «Ler todas» lê no servidor.
  db.prepare('DELETE FROM notification_state WHERE user_id = ?').run(user.id);
  await page.locator('.topbar .notif-bell').click();
  await expect(page.locator('#v2-sino-sub')).toContainText('por ler');
  const sino = page.locator('#v2-sino');
  await expect(sino.locator('.nv2-item').first()).toBeVisible();
  await expect(page.locator('#notif-dropdown')).toBeHidden();
  await sino.locator('.rv2-chip', { hasText: 'Reservas' }).click();
  await expect(sino.locator('.rv2-chip.is-on')).toContainText('Reservas');
  await sino.locator('.rv2-chip', { hasText: 'Todas' }).click();
  await sino.getByRole('button', { name: 'Ler todas' }).click();
  await expect(sino.locator('.nv2-item.is-unread')).toHaveCount(0);
  await expect(page.locator('#v2-sino-sub')).toHaveText('Tudo lido');
  await sino.getByRole('button', { name: 'Fechar' }).click();
  await expect(sino).toHaveCount(0);
  // «+»: Criar, e cada opção abre o seu formulário.
  await page.locator('#mobile-fab').click();
  const criar = page.locator('#v2-criar');
  await expect(criar.locator('.v2c-tile')).toHaveCount(6);
  await criar.locator('.v2c-tile', { hasText: 'Tarefa' }).click();
  await expect(criar).toHaveCount(0);
  await expect(page.locator('#evento-modal-bg')).toHaveClass(/open/);

  // Formulários como folhas (maquetas tel-04 a tel-08): as pílulas mudam a
  // lista escondida e o guardar é o de sempre.
  const tarefa = page.locator('#evento-modal-bg');
  await tarefa.locator('.v2-pills button', { hasText: 'Manutenção' }).click();
  assert.equal(await page.locator('#evento-type').inputValue(), 'manutencao');
  await expect(tarefa.locator('.v2-linha').first()).toBeVisible();
  await expect(tarefa.locator('.modal-footer .btn-ghost')).toBeHidden();
  await tarefa.locator('.modal-close').click();
  await expect(tarefa).not.toHaveClass(/open/);
  // O «+» geral fica no painel (Eventos e Despesas têm o seu, que cria logo).
  const abrirCriar = async () => {
    await page.goto(`${base}/`);
    await page.waitForFunction(() => typeof AppModules.v2.abrirFolha === 'function');
    await page.locator('#mobile-fab').click();
  };
  // Despesa: talão pela câmara, valor em grande, categoria e pagamento em pílulas, guardar.
  await abrirCriar();
  await criar.locator('.v2c-tile', { hasText: 'Despesa' }).click();
  const despesa = page.locator('#despesa-modal-bg');
  await expect(despesa.locator('.v2-cam')).toBeVisible();
  await despesa.locator('#despesa-amount').fill('42.5');
  await despesa.locator('.v2-pills button', { hasText: 'Manutenção' }).click();
  await despesa.locator('.v2-pills.is-seg button', { hasText: 'Cartão' }).click();
  await despesa.locator('#despesa-description').fill('Torneira da cozinha');
  await despesa.locator('.modal-footer .btn-primary').click();
  await expect(despesa).not.toHaveClass(/open/);
  await expect.poll(() => db.prepare("SELECT category, payment_method, amount FROM expenses WHERE description = 'Torneira da cozinha'").get())
    .toEqual({ category: 'manutencao', payment_method: 'cartao', amount: 42.5 });
  // O aviso tem «Abrir», que abre a despesa acabada de criar.
  const abrirAviso = page.locator('.toast', { hasText: 'Despesa adicionada' }).getByRole('button', { name: 'Abrir' });
  await abrirAviso.click();
  await expect(despesa).toHaveClass(/open/);
  await expect(despesa.locator('#despesa-description')).toHaveValue('Torneira da cozinha');
  await despesa.locator('.modal-close').click();
  // Voucher: «Gerar» e o bilhete ao vivo.
  await abrirCriar();
  await criar.locator('.v2c-tile', { hasText: 'Voucher' }).click();
  const voucher = page.locator('#voucher-modal-bg');
  await voucher.getByRole('button', { name: 'Gerar' }).click();
  const code = await page.locator('#v-code').inputValue();
  assert.match(code, /^SP[A-Z0-9]{6}$/);
  await expect(voucher.locator('.v2-ticket-code')).toHaveText(code);
  await voucher.locator('.v2-pills.is-seg button', { hasText: 'Valor fixo' }).click();
  await page.locator('#v-value').fill('150');
  await expect(voucher.locator('.v2-ticket-val')).toContainText('150');
  await voucher.locator('.modal-close').click();
  // Lembrete: horas rápidas.
  await abrirCriar();
  await criar.locator('.v2c-tile', { hasText: 'Lembrete' }).click();
  await page.locator('.v2-quando button', { hasText: 'Amanhã às 9:00' }).click();
  assert.equal(await page.locator('#manual-notification-date').inputValue(), dates.addDays(dates.localDay(), 1));
  assert.equal(await page.locator('#manual-notification-time').inputValue(), '09:00');

  // Entrar: ao sair, a página de entrar tem o desenho próprio do login, sempre
  // no Clássico (<meta name="appearance-login">), qualquer que seja o aspeto da conta.
  await page.goto(`${base}/`);
  await page.locator('#mobile-menu-trigger').click();
  await page.locator('.v2d-row .btn', { hasText: 'Sair' }).click();
  await expect(page.locator('#auth-shell')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-look', 'classico');
  assert.notEqual(await page.locator('.auth-card-premium').evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(255, 255, 255, 0.15)', 'página de entrar ainda na V1');

  assert.deepEqual(errors, []);
  console.log('OK: V2 — Reservas (lista da maqueta, filtros rápidos por estado, menu do filtro por cima da lista, teclado, ficha na V2), Calendário (painel do dia ao lado do mês, escolher dia, nova reserva, recolher guardado, timeline), Notificações (filtros, por ler, ler ao tocar e todas, resumo recolhível, preferências de push), Mensagens (iniciais legíveis no escuro, painel da reserva), Eventos (vista Semana, marcar feito, resumo, alturas iguais), Alojamentos (cartões com ocupação, foto de capa, foto partida, «Calendário» da plataforma; configurações com menu de secções, visão geral das unidades, o que herdam e «Alterações por guardar»), Vouchers (bilhetes e filtros), Hóspedes (números, segmentos, total gasto, fichas da mesma pessoa numa linha, e ficha com resumo, outras fichas, notas e últimas mensagens), Preços (alojamentos em pílula), Despesas (os quatro números, sem o gráfico), Despesas e Definições no escuro, largura e barra de cima (com a barra de estado do iPhone) no telemóvel de todas as páginas principais redesenhadas; no telemóvel, menu, sino, «Criar» e os formulários de criar como folhas; no computador, sino, conta e «Criar» por baixo do botão; janelas de confirmar, bloquear datas, a minha conta e avisos (com «Abrir» no que se criou); formulários grandes e página de entrar na V2; nova reserva no computador em quatro passos com o resumo ao lado.');
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  db.close();
});
