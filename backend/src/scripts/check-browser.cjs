// Chromium real, aplicação real e base descartável. Nunca lê .env nem dados locais.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium, expect } = require('@playwright/test');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-browser-'));
const previous = process.cwd();
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
  const org = orgs.createOrganization('Interface Sintética');
  const user = auth.createUser({ name: 'Teste', email: 'browser@example.invalid', password: 'SyntheticBrowser123!' });
  orgs.createMembership({ organizationId: org.id, userId: user.id, role: 'owner' });
  const otherOrg = orgs.createOrganization('Outro espaço sintético');
  orgs.createMembership({ organizationId: otherOrg.id, userId: user.id, role: 'owner' });
  const session = auth.createSession(user.id, org.id).sessionId;
  db.prepare('INSERT INTO accommodations(id,organization_id,name,type,price_per_night,max_guests) VALUES(?,?,?,?,?,?)').run('unit', org.id, 'Unidade de teste', 'alojamento', 100, 4);
  const today = new Date().toISOString().slice(0, 10);
  const departure = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const insertGuest = db.prepare('INSERT INTO guests(id,organization_id,name,email) VALUES(?,?,?,?)');
  const insertRes = db.prepare(`INSERT INTO reservations(id,organization_id,guest_id,accommodation_id,check_in,check_out,nights,num_guests,total_amount,status)
    VALUES(?,?,?,'unit',?,?,2,1,200,'confirmada')`);
  db.transaction(() => {
    for (let n = 0; n < 123; n++) {
      const id = String(n).padStart(3, '0');
      insertGuest.run(id, org.id, `Hóspede ${id}`, `guest${id}@example.invalid`);
      insertRes.run(`r${id}`, org.id, id, today, departure);
    }
  })();
  const insertEvent = db.prepare(`INSERT INTO operational_events
    (id,organization_id,title,type,date,start_time,status,accommodation_id,responsible,important)
    VALUES (?,?,?,?,?,?,?,'unit',?,?)`);
  const eventTypes = ['limpeza', 'reuniao', 'manutencao', 'checkin'];
  db.transaction(() => {
    for (let n = 0; n < 137; n++) {
      const id = String(n).padStart(3, '0');
      const day = new Date(Date.now() + (n % 40) * 86400000).toISOString().slice(0, 10);
      insertEvent.run(`ev${id}`, org.id, `Evento ${id}`, eventTypes[n % 4], day,
        n % 3 ? '09:30' : null, n % 5 ? 'planeado' : 'concluido', `Resp ${n % 3}`, n % 7 ? 0 : 1);
    }
  })();

  const insertExpense = db.prepare(`INSERT INTO expenses
    (id,organization_id,date,description,category,amount,payment_method,supplier,invoice_ref,has_nif)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);
  const expenseCats = ['limpeza', 'manutencao', 'marketing', 'servicos'];
  const currentYear = new Date().getFullYear();
  let expenseTotal = 0;
  db.transaction(() => {
    for (let n = 0; n < 137; n++) {
      const id = String(n).padStart(3, '0');
      const amount = 10 + n;
      expenseTotal += amount;
      insertExpense.run(`dp${id}`, org.id, `${currentYear}-0${(n % 9) + 1}-15`, `Despesa ${id}`,
        expenseCats[n % 4], amount, 'numerário', `Fornecedor ${n % 3}`, `FT-${id}`, n % 2);
    }
  })();
  global.__expenseTotal = expenseTotal;

  const insertMsg = db.prepare(`INSERT INTO invoice_messages
    (id,organization_id,to_email,to_name,subject,body_html,reservation_id,sent_at)
    VALUES (?,?,?,?,?,?,?,?)`);
  db.transaction(() => {
    for (let n = 0; n < 12; n++) {
      const id = String(n).padStart(3, '0');
      insertMsg.run(`msg${id}`, org.id, `guest${id}@example.invalid`, `Hospede ${id}`,
        `Assunto ${id}`,
        `<html><body><table><tr><td class="sp-pad sp-surface-bg email-body-bg"><!--sp:body--><p>Corpo sintetico ${id}</p><!--/sp:body--></td></tr></table></body></html>`,
        `r${id}`, `2026-05-${String(10 + n).padStart(2, '0')}T10:00:00Z`);
    }
    for (let n = 0; n < 4; n++) {
      insertMsg.run(`avulso${n}`, org.id, `avulso${n}@example.invalid`, `Avulso ${n}`,
        'Sem reserva', '<p>mensagem avulsa</p>', null, `2026-05-2${n}T10:00:00Z`);
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
  await expect(page.locator('#kpi-ativas')).toHaveText('123');
  assert(!requests.some(url => /xlsx-|jspdf|chart\.umd|leaflet\.(js|css)/.test(url)), 'bibliotecas pesadas carregadas antes de serem usadas');
  assert(!requests.some(url => /\/api\/reservations\?/.test(url)), 'painel carregou lista completa de reservas');

  // ── Módulos por vista ────────────────────────────────────────────────────
  // O arranque traz só o núcleo; o código de cada vista chega quando a vista
  // é aberta, uma única vez, e um download falhado pode ser repetido.
  const featureScripts = await page.evaluate(() => Object.fromEntries(
    Object.entries(AppModules.core.FEATURE_MODULES).map(([name, feature]) => [name, feature.scripts])));
  const timesRequested = src => requests.filter(url => new URL(url).pathname === '/' + src).length;
  for (const [name, scripts] of Object.entries(featureScripts)) {
    for (const src of scripts) assert.equal(timesRequested(src), 0, `${src} (${name}) carregou no arranque`);
  }

  await page.evaluate(() => AppModules.core.showView('reservas'));
  for (const src of featureScripts.reservas) assert.equal(timesRequested(src), 1, `${src} não carregou ao abrir Reservas`);
  assert.equal(await page.evaluate(() => typeof AppModules.reservas.showDetail), 'function');
  // O calendário declara Reservas e Bloqueios como dependências: abre-as antes
  // de si próprio e não volta a pedir o que já correu.
  await page.evaluate(() => AppModules.core.showView('calendario'));
  for (const src of [...featureScripts.reservas, ...featureScripts.bloqueios, ...featureScripts.calendario]) {
    assert.equal(timesRequested(src), 1, `${src} pedido mais do que uma vez`);
  }
  await page.evaluate(() => AppModules.core.showView('dashboard'));
  await page.evaluate(() => AppModules.core.showView('calendario'));
  for (const src of featureScripts.calendario) assert.equal(timesRequested(src), 1, `${src} recarregou ao reabrir a vista`);
  console.log('OK: cada vista traz o seu código uma só vez, com as dependências primeiro.');

  // Download falhado: a vista mostra o aviso com repetição, e repetir resolve.
  await page.route('**/js/vouchers.js', route => route.abort());
  await page.evaluate(() => AppModules.core.showView('vouchers'));
  await expect(page.locator('#view-vouchers .feature-load-error')).toBeVisible();
  assert.equal(await page.evaluate(() => typeof AppModules.vouchers.loadVouchers), 'undefined');
  // O conteúdo da vista fica escondido, não destruído: ouvintes já ligados a
  // campos lá dentro têm de sobreviver ao aviso.
  await expect(page.locator('#view-vouchers #vouchers-list-wrap')).toHaveCount(1);
  await expect(page.locator('#view-vouchers #vouchers-list-wrap')).toBeHidden();
  await page.unroute('**/js/vouchers.js');
  await page.locator('#view-vouchers [data-feature-retry]').click();
  await expect(page.locator('#view-vouchers .feature-load-error')).toHaveCount(0);
  await expect(page.locator('#view-vouchers #vouchers-list-wrap')).toBeVisible();
  assert.equal(await page.evaluate(() => typeof AppModules.vouchers.loadVouchers), 'function');
  console.log('OK: um módulo que falha a carregar avisa na vista e pode ser repetido.');

  // Serviços e taxas entram no cálculo de qualquer reserva: são lidos no
  // arranque, não com a vista Alojamentos.
  assert(await page.evaluate(() => Array.isArray(AppModules.core.servicosData) && AppModules.core.servicosData.length > 0),
    'os serviços não foram carregados no arranque');

  // Atalhos que saltam para uma vista ainda não carregada.
  await page.evaluate(() => AppModules.core.showView('alojamentos'));
  await page.evaluate(async () => {
    document.getElementById('aloj-editing-id').value = 'unit';
    await AppModules.alojamentos.showAlojTab('precos');
  });
  assert.equal(await page.evaluate(() => typeof AppModules.precos.mountPrecosWidgetInAloj), 'function',
    'o separador de preços não trouxe o módulo de Preços Dinâmicos');
  await page.evaluate(() => AppModules.core.abrirHospede('001'));
  await expect(page.locator('#view-hospede-detalhe')).toHaveClass(/active/);
  await page.evaluate(() => AppModules.core.showView('dashboard'));
  console.log('OK: atalhos entre vistas carregam o módulo de destino antes de saltar.');

  // Sessão acabada de abrir, sem nunca ter passado por Reservas: os atalhos do
  // painel, o "+" do telemóvel e os botões de exportação em Definições chamavam
  // código que ainda não existia.
  const virgem = await context.newPage();
  const virgemErros = [];
  virgem.on('pageerror', error => virgemErros.push(error.message));
  virgem.setDefaultTimeout(10000);
  await virgem.goto(base, { waitUntil: 'networkidle' });
  await expect(virgem.locator('#kpi-ativas')).toHaveText('123');
  assert.equal(await virgem.evaluate(() => typeof AppModules.reservas.showDetail), 'undefined',
    'Reservas já estava carregada: o teste deixou de valer');

  await virgem.locator('#dash-proximas tbody tr').first().click();
  await expect(virgem.locator('#reserva-detail-page')).toBeVisible();
  assert.deepEqual(virgemErros, [], 'clicar numa próxima chegada deu erro');

  await virgem.setViewportSize({ width: 390, height: 844 });
  await virgem.goto(base, { waitUntil: 'networkidle' });
  await virgem.locator('#mobile-menu-trigger').click();
  await expect(virgem.locator('#side-drawer')).toHaveAttribute('aria-hidden', 'false');
  await expect.poll(() => virgem.evaluate(() => document.activeElement?.closest('#side-drawer') !== null)).toBe(true);
  await virgem.keyboard.press('Escape');
  await expect(virgem.locator('#side-drawer')).toHaveAttribute('aria-hidden', 'true');
  assert.equal(await virgem.evaluate(() => typeof AppModules.reservas.openModal), 'undefined');
  await virgem.locator('#mobile-fab').click();
  await expect(virgem.locator('#modal-bg')).toBeVisible();
  await expect(virgem.locator('#modal-bg')).toHaveAttribute('aria-modal', 'true');
  await expect.poll(() => virgem.evaluate(() => document.activeElement?.closest('#modal-bg') !== null)).toBe(true);
  assert.deepEqual(virgemErros, [], 'o botão + do telemóvel deu erro');
  await virgem.evaluate(() => AppModules.reservas.requestCloseReservaModal());
  await virgem.setViewportSize({ width: 1440, height: 1000 });
  await virgem.close();

  // Definições → Base de dados exporta coleções de três módulos diferentes.
  const definicoes = await context.newPage();
  const definicoesErros = [];
  definicoes.on('pageerror', error => definicoesErros.push(error.message));
  definicoes.setDefaultTimeout(10000);
  await definicoes.goto(base, { waitUntil: 'networkidle' });
  await definicoes.evaluate(() => AppModules.core.showView('definicoes'));
  await definicoes.locator('.settings-tab[data-settings-tab="database"]').click();
  const exportado = definicoes.waitForEvent('download');
  await definicoes.locator('#settings-database .settings-db-actions button', { hasText: 'XLS' }).first().click();
  await expect(definicoes.locator('#export-cols-modal-bg')).toBeVisible();
  await definicoes.locator('#export-cols-modal-bg .btn-primary').click();
  assert((await (await exportado).path()).length > 0, 'a exportação não produziu ficheiro');
  assert.deepEqual(definicoesErros, [], 'exportar a partir de Definições deu erro');
  await definicoes.close();
  console.log('OK: painel, botão + e exportações de Definições funcionam sem ter passado pela vista.');

  // Ligação direta a uma reserva numa aba nova: o módulo chega antes da ficha.
  const deepPage = await context.newPage();
  const deepErrors = [];
  deepPage.on('pageerror', error => deepErrors.push(error.message));
  await deepPage.goto(base + '/reservas?reserva=r001', { waitUntil: 'networkidle' });
  await expect(deepPage.locator('#view-reservas')).toHaveClass(/active/);
  await expect(deepPage.locator('#reserva-detail-page')).toBeVisible();
  await expect(deepPage.locator('#reserva-detail-page')).toContainText('Hóspede 001');
  assert.deepEqual(deepErrors, []);
  await deepPage.close();
  console.log('OK: ligação direta a uma reserva abre a ficha com o módulo carregado.');
  // Falhas e contratos antigos não podem aparecer como ausência de reservas.
  const statsUrl = '**/api/reservations/stats/dashboard';
  await page.route(statsUrl, route => route.fulfill({ status: 503, json: { error: 'Synthetic unavailable' } }));
  await page.evaluate(() => AppModules.core.renderDashboard());
  await expect(page.locator('#dash-proximas')).toContainText('Não foi possível carregar');
  await expect(page.locator('#mac-count')).toHaveText('—');
  await page.unroute(statsUrl);
  await page.route(statsUrl, route => route.fulfill({ json: { success: true, data: { totalBilled: 24600, confirmedReservations: 123 } } }));
  await page.evaluate(() => AppModules.core.renderDashboard());
  await expect(page.locator('#dash-proximas')).toContainText('versões diferentes');
  await expect(page.locator('#kpi-faturado')).toHaveText('—');
  await page.unroute(statsUrl);
  await page.evaluate(() => AppModules.core.renderDashboard());
  await expect(page.locator('#kpi-ativas')).toHaveText('123');
  console.log('OK: erro HTTP e backend antigo não são apresentados como zero reservas.');
  await page.locator('.sidebar .nav-item').filter({ hasText: 'Reservas' }).click();
  await expect(page.locator('#reservas-pagination')).toContainText('1–50 de 123');
  await page.locator('#reservas-pagination').getByRole('button', { name: 'Seguinte' }).click();
  await expect(page.locator('#reservas-pagination')).toContainText('51–100 de 123');
  await page.locator('#search-input').fill('Hóspede 120');
  await expect(page.locator('#reservas-pagination')).toContainText('1–1 de 1');
  await page.locator('.sidebar .nav-item').filter({ hasText: 'Calendário' }).click();
  await expect(page.locator('#cal-results-total')).toHaveText('123');
  await expect(page.locator('#cal-grid .cal-event-span').first()).toBeVisible();
  const reservationsUrl = '**/api/reservations?*';
  await page.route(reservationsUrl, route => route.fulfill({ json: { success: true, data: [{ id: 'synthetic-old-api' }] } }));
  await page.evaluate(async () => { AppModules.calendario.invalidateCalendarReservations(); await AppModules.calendario.renderCal(); });
  await expect(page.locator('#cal-grid')).toContainText('versões diferentes');
  await expect(page.locator('#cal-results-total')).toHaveText('—');
  await page.unroute(reservationsUrl);
  await page.locator('#cal-grid').getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.locator('#cal-results-total')).toHaveText('123');
  console.log('OK: calendário recupera com o botão de repetir após atualização do backend.');

  await page.locator('.sidebar .nav-item').filter({ hasText: 'Hóspedes' }).click();
  await expect(page.locator('#hospedes-pagination')).toContainText('1–50 de 123');
  await page.locator('#hospedes-pagination').getByRole('button', { name: 'Seguinte' }).click();
  await expect(page.locator('#hospedes-pagination')).toContainText('51–100 de 123');
  await page.locator('#hospedes-search').fill('Hóspede 120');
  await expect(page.locator('#hospedes-pagination')).toContainText('1–1 de 1');
  await expect(page.locator('#hospedes-cards-grid')).toContainText('Hóspede 120');
  console.log('OK: painel resumido, páginas, pesquisa global e calendário independente.');

  // Exportar através da função pública da interface, com o leitor XLSX real.
  await page.locator('.sidebar .nav-item').filter({ hasText: 'Reservas' }).click();
  await page.locator('#search-input').fill('');
  await expect(page.locator('#reservas-pagination')).toContainText('de 123');
  const downloadPromise = page.waitForEvent('download');
  await page.evaluate(() => AppModules.reservas.exportReservasXLS());
  const download = await downloadPromise;
  const file = await download.path();
  const workbook = require(path.join(process.env.FRONTEND_PATH, 'js/vendor/xlsx-0.20.3.min.js')).read(fs.readFileSync(file), { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  assert.equal(require(path.join(process.env.FRONTEND_PATH, 'js/vendor/xlsx-0.20.3.min.js')).utils.sheet_to_json(sheet).length, 123);
  console.log('OK: Excel carrega por pedido e exporta 123 reservas, não apenas a página.');
  const guestDownloadPromise = page.waitForEvent('download');
  await page.evaluate(() => AppModules.hospedes.exportHospedesXLS());
  await page.locator('#export-cols-modal-bg .btn-primary').click();
  const guestFile = await (await guestDownloadPromise).path();
  const xlsx = require(path.join(process.env.FRONTEND_PATH, 'js/vendor/xlsx-0.20.3.min.js'));
  const guestWorkbook = xlsx.read(fs.readFileSync(guestFile), { type: 'buffer' });
  const exportedGuests = xlsx.utils.sheet_to_json(guestWorkbook.Sheets[guestWorkbook.SheetNames[0]]);
  assert.equal(exportedGuests.length, 1);
  assert.equal(exportedGuests[0].Nome, 'Hóspede 120');
  console.log('OK: exportação de hóspedes respeita a pesquisa ativa.');
  const pdfPromise = page.waitForEvent('download');
  await page.evaluate(() => AppModules.reservas.exportReservasPDF());
  const pdf = await pdfPromise;
  assert.equal(fs.readFileSync(await pdf.path()).subarray(0, 5).toString(), '%PDF-');
  await page.locator('.sidebar .nav-item').filter({ hasText: 'Relatórios' }).click();
  await expect(page.locator('#report-kpis')).not.toContainText('A carregar');
  assert.equal(await page.evaluate(() => typeof Chart), 'function');
  await page.evaluate(() => AppModules.core.loadLibrary('map'));
  assert.equal(await page.evaluate(() => L.version), '1.9.4');
  assert(requests.some(url => url.includes('leaflet.css')));
  await page.locator('.sidebar .nav-item').filter({ hasText: 'Reservas' }).click();
  await expect(page.locator('#reservas-pagination')).toContainText('de 123');
  console.log('OK: PDF, gráficos e recursos do mapa carregam apenas quando pedidos.');

  await page.locator('[data-res-view="list"]').click();
  await expect(page.locator('#tabela-body tr')).toHaveCount(50);
  if (process.env.BROWSER_ARTIFACTS_DIR) {
    fs.mkdirSync(process.env.BROWSER_ARTIFACTS_DIR, { recursive: true });
    await page.screenshot({ path: path.join(process.env.BROWSER_ARTIFACTS_DIR, 'reservas-desktop.png') });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  // A vista de cartões é o modo de reservas usado no telemóvel.
  await page.locator('#mobile-search-input').fill('Hóspede 121');
  await expect(page.locator('#reservas-pagination')).toContainText('1–1 de 1');
  await expect(page.locator('#mobile-res-cards')).toContainText('Hóspede 121');
  await page.locator('#mobile-search-input').fill('');
  await expect(page.locator('#reservas-pagination')).toContainText('1–50 de 123');
  await page.locator('#reservas-pagination').getByRole('button', { name: 'Seguinte' }).click();
  await expect(page.locator('#reservas-pagination')).toContainText('51–100 de 123');
  const mobileBounds = await page.locator('#mobile-res-cards').boundingBox();
  assert(mobileBounds.x >= 0 && mobileBounds.x + mobileBounds.width <= 391, 'cartões fora da largura do ecrã');
  const pagerBounds = await page.locator('#reservas-pagination').boundingBox();
  assert(pagerBounds.x >= 0 && pagerBounds.x + pagerBounds.width <= 391, 'paginação fora da largura do ecrã');
  const bottomNavBounds = await page.locator('#bottom-nav-bar').boundingBox();
  assert(pagerBounds.y + pagerBounds.height <= bottomNavBounds.y, 'paginação escondida pela navegação inferior');
  const screenshotDir = process.env.BROWSER_ARTIFACTS_DIR;
  if (screenshotDir) {
    fs.mkdirSync(screenshotDir, { recursive: true });
    await page.screenshot({ path: path.join(screenshotDir, 'reservas-mobile.png') });
  }
  console.log('OK: pesquisa e navegação entre páginas no telemóvel.');

  // ── Editor de emails: pré-visualização servida pelo backend ──────────────
  // A pré-visualização deixou de ser recriada no cliente; vem da mesma função
  // que compõe o email enviado. Aqui verifica-se que o editor a pede ao
  // servidor, que reflete o rascunho por gravar e que o iframe não executa
  // scripts.
  await page.setViewportSize({ width: 1440, height: 1000 });
  // O editor vive no separador "Emails" das Definições.
  await page.locator('.sidebar .nav-item').filter({ hasText: 'Definições' }).click();
  await page.locator('.settings-tab[data-settings-tab="emails"]').click();
  await expect(page.locator('#et-preview-frame')).toBeVisible();

  const previewFrame = page.frameLocator('#et-preview-frame');
  await expect(previewFrame.locator('body')).toContainText('ALOJAMENTO LOCAL');
  await expect(previewFrame.locator('body')).toContainText('Reserva confirmada');

  // Um rascunho por gravar tem de aparecer na pré-visualização.
  await page.evaluate(() => {
    document.getElementById('et-body').innerHTML = '<p>Marcador por gravar {{primeiro_nome}}</p>';
    document.getElementById('et-body').dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(previewFrame.locator('body')).toContainText('Marcador por gravar Rui');

  // Mudar o estado da reserva muda o que a pré-visualização diz: uma reserva
  // pendente não pode aparecer como confirmada.
  await page.evaluate(() => {
    document.getElementById('et-body').innerHTML = '{{titulo_reserva}}{{cartao_reserva}}';
    document.getElementById('et-preview-status').value = 'pendente';
    document.getElementById('et-body').dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(previewFrame.locator('body')).toContainText('Pedido de reserva recebido');
  assert(!(await previewFrame.locator('body').textContent()).includes('Reserva confirmada'),
    'reserva pendente apresentada como confirmada');

  // O iframe é isolado: sem allow-scripts, nada do corpo do email corre.
  assert.equal(await page.locator('#et-preview-frame').getAttribute('sandbox'), 'allow-same-origin');

  // A barra de formatação tinha as aspas do onclick escapadas com \" , que em
  // HTML termina o atributo: os botões apareciam com o resto do código como
  // texto ("',\")\" title=..."). Os rótulos têm de ser exatamente estes.
  // Os 4 botões de alinhamento são só ícone (sem texto) — '' é o valor
  // correto para eles, não um sinal de marcação partida; confirma-se que têm
  // mesmo um ícone lá dentro (não estão simplesmente vazios/partidos).
  assert.deepEqual(
    (await page.locator('.email-fmt-toolbar .fmt-btn').allTextContents()).map(t => t.trim()),
    ['B', 'I', 'U', 'H2', 'H3', 'P', '', '', '', '', '• Lista', '1. Lista', '—'],
    'barra de formatação com marcação partida'
  );
  assert.equal(await page.locator('.email-fmt-toolbar .fmt-btn svg').count(), 4, 'ícones de alinhamento em falta');
  await page.evaluate(() => {
    document.getElementById('et-body').innerHTML = '';
    document.getElementById('et-body').focus();

  });
  await page.locator('.email-fmt-toolbar button[title="Lista"]').click();
  await expect(previewFrame.locator('body')).toContainText('Item 1');

  // Respostas atrasadas de um rascunho anterior não podem sobrepor-se à mais
  // recente.
  let held, markPreviewHeld;
  const previewHeld = new Promise(resolve => { markPreviewHeld = resolve; });
  await page.route('**/api/email-templates/*/preview-html', async route => {
    if (!held) { held = route; markPreviewHeld(); return; } // a primeira fica retida
    await route.continue();
  });
  await page.evaluate(() => {
    document.getElementById('et-body').innerHTML = '<p>Rascunho ANTIGO</p>';
    document.getElementById('et-body').dispatchEvent(new Event('input', { bubbles: true }));
  });
  await previewHeld;
  await page.evaluate(() => {
    document.getElementById('et-body').innerHTML = '<p>Rascunho RECENTE</p>';
    document.getElementById('et-body').dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(previewFrame.locator('body')).toContainText('Rascunho RECENTE');
  if (held) await held.continue();                      // chega agora, fora de ordem
  await page.waitForTimeout(300);
  await expect(previewFrame.locator('body')).toContainText('Rascunho RECENTE');
  assert(!(await previewFrame.locator('body').textContent()).includes('Rascunho ANTIGO'),
    'resposta atrasada sobrepôs-se a um rascunho mais recente');
  await page.unroute('**/api/email-templates/*/preview-html');

  if (screenshotDir) {
    await page.screenshot({ path: path.join(screenshotDir, 'emails-editor-desktop.png'), fullPage: true });
  }
  console.log('OK: pré-visualização de emails vem do servidor, segue o rascunho e ignora respostas atrasadas.');

  // ── Eventos: lista paginada no servidor, calendário por intervalo ────────
  const eventRequests = [];
  page.on('request', r => { if (/\/api\/events\?/.test(r.url())) eventRequests.push(r.url()); });
  await page.locator('.sidebar .nav-item').filter({ hasText: 'Eventos' }).click();
  await page.locator('#view-eventos [data-on-click^="index-set-eventos-view-"]').first().waitFor({ state: 'attached' });
  await page.evaluate(() => AppModules.eventos.setEventosView('list'));

  await expect(page.locator('#eventos-list-pagination')).toContainText('1–50 de 137');
  assert.equal(await page.locator('#eventos-list-body tr').count(), 50, 'a lista não pagina');
  await expect(page.locator('#eventos-list-total')).toHaveText('137');

  // Fora da primeira página: a página 3 vem do servidor, não de um corte local.
  await page.locator('#eventos-list-pagination').getByRole('button', { name: 'Seguinte' }).click();
  await expect(page.locator('#eventos-list-pagination')).toContainText('51–100 de 137');
  await page.locator('#eventos-list-pagination').getByRole('button', { name: 'Seguinte' }).click();
  await expect(page.locator('#eventos-list-pagination')).toContainText('101–137 de 137');
  assert.equal(await page.locator('#eventos-list-body tr').count(), 37);

  // Pesquisa: um evento que só existe fora da primeira página tem de aparecer.
  await page.locator('#eventos-search').fill('Evento 129');
  await expect(page.locator('#eventos-list-pagination')).toContainText('1–1 de 1');
  await expect(page.locator('#eventos-list-body')).toContainText('Evento 129');

  // Estados distintos: erro não pode aparecer como lista vazia.
  await page.route('**/api/events?*', route => route.fulfill({ status: 503, json: { error: 'Indisponível' } }));
  await page.evaluate(() => (AppModules.eventos.eventosListPaged.reset(), AppModules.eventos.loadEventos()));
  await expect(page.locator('#eventos-list-error')).toBeVisible();
  await expect(page.locator('#eventos-list-empty')).toBeHidden();
  await expect(page.locator('#eventos-list-total')).toHaveText('—');
  await page.unroute('**/api/events?*');

  await page.locator('#eventos-search').fill('');
  await expect(page.locator('#eventos-list-pagination')).toContainText('1–50 de 137');
  await expect(page.locator('#eventos-list-error')).toBeHidden();

  // Lista verdadeiramente vazia é diferente de erro.
  await page.locator('#eventos-search').fill('zzz-nao-existe-zzz');
  await expect(page.locator('#eventos-list-empty')).toBeVisible();
  await expect(page.locator('#eventos-list-error')).toBeHidden();
  await page.locator('#eventos-search').fill('');
  await expect(page.locator('#eventos-list-pagination')).toContainText('1–50 de 137');

  // O calendário pede um intervalo, nunca a coleção inteira.
  await page.evaluate(() => { AppModules.eventos.setEventosMode('calendar'); AppModules.eventos.setEventosView('calendar'); });
  await expect(page.locator('#eventos-cal-grid')).not.toBeEmpty();
  assert(eventRequests.some(url => /[?&]from=/.test(url) && /[?&]to=/.test(url)),
    'o calendário de eventos não pediu um intervalo');
  const ranges = eventRequests.map(url => new URL(url).searchParams).filter(q => q.has('from') && q.has('to'));
  assert(ranges.some(q => q.get('from') === '2020-12-27' && q.get('to') === '2021-02-06'));
  assert(ranges.every(q => (new Date(q.get('to')) - new Date(q.get('from'))) / 86400000 <= 42),
    'o mês histórico foi unido ao intervalo atual da agenda');
  assert(eventRequests.every(url => /[?&](limit|page)=/.test(url) || /[?&]from=/.test(url)),
    'houve um pedido de eventos sem limite nem intervalo');
  console.log('OK: eventos paginam no servidor; calendário carrega por intervalo; erro ≠ lista vazia.');

  // ── Despesas: paginação, pesquisa, ordenação e total de todas as páginas ──
  await page.locator('.sidebar .nav-item').filter({ hasText: 'Despesas' }).click();
  await expect(page.locator('#despesas-pagination')).toContainText('1–50 de 137');
  assert.equal(await page.locator('#despesas-body tr').count(), 51, 'faltam linhas ou a linha de total');

  // O "Total do período" tem de somar TODAS as páginas, não só as 50 visíveis.
  // formatEUR escreve "€10686.00": ponto decimal, sem separador de milhares.
  const shownTotal = await page.locator('.despesas-total-row td[data-col="amount"]').textContent();
  const shownValue = Number(shownTotal.replace(/[^\d.-]/g, ''));
  assert.equal(Math.round(shownValue), Math.round(global.__expenseTotal),
    `total do período mostra ${shownValue}, esperado ${global.__expenseTotal}`);

  // Resultado fora da primeira página.
  await page.locator('#despesas-pagination').getByRole('button', { name: 'Seguinte' }).click();
  await expect(page.locator('#despesas-pagination')).toContainText('51–100 de 137');
  await page.locator('#despesa-search').fill('Despesa 131');
  await expect(page.locator('#despesas-pagination')).toContainText('1–1 de 1');
  await expect(page.locator('#despesas-body')).toContainText('Despesa 131');
  await page.locator('#despesa-search').fill('');
  await expect(page.locator('#despesas-pagination')).toContainText('1–50 de 137');

  // Ordenação no servidor. Ascendente primeiro (comportamento da vista), depois
  // descendente: o maior valor está na última página por data, por isso só
  // pode aparecer no topo se a ordenação abranger o conjunto todo.
  await page.locator('#despesas-table th[data-col="amount"]').click();
  await expect(page.locator('#despesas-body tr').first()).toContainText('Despesa 000');
  await page.locator('#despesas-table th[data-col="amount"]').click();
  await expect(page.locator('#despesas-pagination')).toContainText('1–50 de 137');
  await expect(page.locator('#despesas-body tr').first()).toContainText('Despesa 136');

  // Filtro de categoria no servidor.
  await page.evaluate(() => {
    document.getElementById('despesa-filter-category').value = 'limpeza';
    document.getElementById('despesa-filter-category').dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.locator('#despesas-pagination')).toContainText('de 35');
  await page.evaluate(() => {
    document.getElementById('despesa-filter-category').value = '';
    document.getElementById('despesa-filter-category').dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.locator('#despesas-pagination')).toContainText('1–50 de 137');

  // Erro não pode aparecer como lista vazia.
  await page.route('**/api/expenses?*', route => route.fulfill({ status: 503, json: { error: 'Indisponível' } }));
  await page.evaluate(() => AppModules.despesas.loadDespesas());
  await expect(page.locator('#despesas-error')).toBeVisible();
  await expect(page.locator('#despesas-empty')).toBeHidden();
  await page.unroute('**/api/expenses?*');
  await page.evaluate(() => AppModules.despesas.loadDespesas());
  await expect(page.locator('#despesas-error')).toBeHidden();

  // Exportação percorre todas as páginas do filtro ativo.
  const expenseDownload = page.waitForEvent('download');
  await page.locator('#view-despesas button[data-on-click="export-despesas-xlsx"]:visible').first().click();
  await page.locator('#export-cols-modal-bg .btn-primary').click();
  const expenseBook = xlsx.read(fs.readFileSync(await (await expenseDownload).path()), { type: 'buffer' });
  const exported = xlsx.utils.sheet_to_json(expenseBook.Sheets[expenseBook.SheetNames[0]]).length;
  assert.equal(exported, 137, `exportação trouxe ${exported} de 137`);
  console.log('OK: despesas paginam, pesquisam e ordenam no servidor; total e exportação cobrem todas as páginas.');

  // Editar através das ações delegadas preserva aspas/acentos e não duplica a gravação.
  let expenseWrites = 0;
  page.on('request', request => { if (request.method() === 'PUT' && /\/api\/expenses\//.test(request.url())) expenseWrites++; });
  await page.locator('#despesas-body button[data-on-click="open-despesa-modal"]').first().click();
  await expect(page.locator('#despesa-modal-bg')).toBeVisible();
  await page.locator('#despesa-description').fill('Despesa revista — D\'Ávila "teste"');
  const expenseSaved = page.waitForResponse(response => response.request().method() === 'PUT' && /\/api\/expenses\//.test(response.url()));
  await page.locator('#despesa-modal-bg button[data-on-click="save-despesa"]').click();
  const expenseResponse = await expenseSaved;
  assert.equal(expenseResponse.status(), 200, JSON.stringify(await expenseResponse.json()));
  await expect(page.locator('#despesa-modal-bg')).toBeHidden();
  await expect(page.locator('#despesas-body')).toContainText('Despesa revista — D\'Ávila "teste"');
  assert.equal(expenseWrites, 1);

  // ── Mensagens: conversas vêm prontas do servidor, paginadas ─────────────
  const listRequests = [];
  page.on('request', r => {
    const url = r.url();
    if (/\/api\/(reservations|guests)\?/.test(url)) listRequests.push(url);
  });
  await page.locator('.sidebar .nav-item').filter({ hasText: 'Mensagens' }).click();
  await expect(page.locator('#invoice-thread-pagination')).toContainText('de 127');
  assert.equal(await page.locator('#invoice-thread-list .invoice-thread-item').count(), 50,
    'a lista de conversas não pagina');

  // O ponto desta etapa: a vista deixou de carregar reservas/hóspedes todos.
  assert.deepEqual(listRequests, [],
    `Mensagens ainda carrega coleções completas: ${listRequests.join(', ')}`);

  // Resumo da última mensagem, calculado no servidor e sem a moldura da marca.
  const textos = await page.locator('#invoice-thread-list .invoice-thread-item').allTextContents();
  assert(textos.some(t => t.includes('Corpo sintetico')),
    'nenhuma conversa mostrou o resumo da ultima mensagem');
  assert(textos.every(t => !/ALOJAMENTO LOCAL|Licen\u00e7a AL/.test(t)),
    'um resumo trouxe a moldura da marca em vez do corpo da mensagem');

  // Fora da primeira página.
  await page.locator('#invoice-thread-pagination').getByRole('button', { name: 'Seguinte' }).click();
  await expect(page.locator('#invoice-thread-pagination')).toContainText('51–100 de 127');

  // Pesquisa no servidor: um hóspede que só existe fora da primeira página.
  await page.locator('#invoice-search').fill('Hóspede 121');
  await expect(page.locator('#invoice-thread-pagination')).toContainText('1–1 de 1');
  await page.locator('#invoice-search').fill('');
  await expect(page.locator('#invoice-thread-pagination')).toContainText('de 127');

  // Erro ≠ lista vazia.
  await page.route('**/auth/email/threads?*', route => route.fulfill({ status: 503, json: { error: 'Indisponível' } }));
  await page.evaluate(() => AppModules.invoice.invoiceConversasPaged.load(AppModules.invoice.getInvoiceThreadQuery(false), { force: true }));
  await expect(page.locator('#invoice-thread-error')).toBeVisible();
  await expect(page.locator('#invoice-thread-empty')).toBeHidden();
  await page.unroute('**/auth/email/threads?*');
  await page.evaluate(() => AppModules.invoice.invoiceConversasPaged.load(AppModules.invoice.getInvoiceThreadQuery(false), { force: true }));
  await expect(page.locator('#invoice-thread-error')).toBeHidden();

  // Arquivo: filtrado pelo servidor, não em memória.
  await page.evaluate(() => AppModules.invoice.switchInvoiceTab('arquivo'));
  await expect(page.locator('#invoice-archive-pagination')).toContainText('0 resultados');
  await expect(page.locator('#invoice-archive-empty')).toBeVisible();
  console.log('OK: mensagens paginam no servidor, sem carregar reservas/hóspedes completos.');

  assert.deepEqual(await page.evaluate(() => window.__scriptViolations), [], 'a CSP bloqueou código necessário');
  assert.equal(await page.evaluate(() => typeof currentUser), 'undefined', 'o estado da sessão ficou global');
  assert.equal(await page.evaluate(() => typeof showDetail), 'undefined', 'a função de reservas ficou global');
  // Mudar de organização atravessa a limpeza dos módulos e a autenticação real.
  await page.locator('#auth-user-chip').click();
  await page.locator(`#user-menu-orgs button[data-org="${otherOrg.id}"]`).click();
  await page.waitForFunction(id => AppModules.core.currentUser?.organization_id === id, otherOrg.id);
  await expect(page.locator('#auth-user-name')).toHaveText('Teste');
  assert.equal(await page.evaluate(() => AppModules.core.accommodations.length), 0);
  await page.evaluate(() => AppModules.core.showView('reservas'));
  await expect(page.locator('#reservas-pagination')).toContainText('0 resultados');

  await page.evaluate(() => AppModules.core.logout());
  await expect(page.locator('#login-email')).toBeVisible();
  assert.equal(await page.evaluate(() => AppModules.core.reservas.length + AppModules.core.accommodations.length), 0);
  // A mesma página volta a autenticar sem repetir listeners nem reutilizar dados anteriores.
  await page.locator('#login-email').fill('browser@example.invalid');
  await page.locator('#login-password').fill('SyntheticBrowser123!');
  await page.locator('#login-submit').click();
  await expect(page.locator('#login-email')).toBeHidden();
  await expect(page.locator('#auth-user-name')).toHaveText('Teste');
  assert.deepEqual(errors, []);
  console.log('OK: logout limpa as coleções; sem erros JavaScript não tratados.');
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
