// Gráficos redondos (js/domain/anel.js) nos Relatórios (Receita por Canal e
// Despesas por Categoria) e na consola (Utilização): total no centro, uma linha
// de legenda por segmento, percentagens a somar 100 e cores do anel com
// contraste ≥ 3:1 no painel escuro. Base descartável, dados inventados.
//
// O Chart.js vem da rede (CDN); aqui lê-se de um ficheiro local:
//   CHART_JS_PATH=/caminho/chart.umd.js node scripts/check-graficos-anel.cjs
// (ou do pacote `chart.js`, se estiver instalado). Sem ele, o script termina sem testar.
// ANEL_ARTIFACTS_DIR=pasta guarda capturas de ecrã.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium, webkit, expect } = require('@playwright/test');

function chartSource() {
  for (const candidate of [process.env.CHART_JS_PATH, (() => { try { return require.resolve('chart.js/dist/chart.umd.js'); } catch { return null; } })()]) {
    if (candidate && fs.existsSync(candidate)) return fs.readFileSync(candidate, 'utf8');
  }
  return null;
}
const chartJs = chartSource();
if (!chartJs) { console.log('check-graficos-anel: Chart.js local não encontrado (CHART_JS_PATH); ignorado.'); process.exit(0); }

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-anel-'));
process.chdir(temp);
Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test', EMAIL_ENABLED: 'false', PLATFORM_ADMIN_EMAILS: 'anel@example.invalid', FRONTEND_PATH: path.resolve(__dirname, '../../../frontend') });
const app = require('../app');
const { db } = require('../config/database');
const auth = require('../services/authService');
const orgs = require('../services/orgService');
const appearance = require('../services/appearancePrefs');
const dates = require('../services/dates');
const PASSWORD = 'SyntheticAnel123!';
let server, browser;

async function main() {
  const org = orgs.createOrganization('Anéis');
  const user = auth.createUser({ name: 'Teste', email: 'anel@example.invalid', password: PASSWORD });
  orgs.createMembership({ organizationId: org.id, userId: user.id, role: 'owner' });
  db.prepare('UPDATE users SET platform_admin=1 WHERE id=?').run(user.id);
  const session = auth.createSession(user.id, org.id).sessionId;
  await require('../services/platformAccess').unlock(session, user.id, PASSWORD);
  db.prepare("INSERT INTO accommodations(id,organization_id,name,type,price_per_night,max_guests) VALUES('u',?,'Suite','alojamento',100,4)").run(org.id);
  db.prepare('INSERT INTO guests(id,organization_id,name,email) VALUES(?,?,?,?)').run('g', org.id, 'Hóspede', 'g@example.invalid');
  const year = new Date().getFullYear();
  // Receita por canal: 4 820 / 3 960 / 2 710 / 1 240 / 420 (como na maqueta).
  const channels = [['direto', 4820], ['booking', 3960], ['airbnb', 2710], ['website', 1240], ['outro', 420]];
  channels.forEach(([channel, amount], i) => {
    db.prepare(`INSERT INTO reservations(id,organization_id,guest_id,accommodation_id,check_in,check_out,nights,num_guests,total_amount,status,channel)
      VALUES(?,?,'g','u',?,?,2,2,?,'confirmada',?)`).run(`r${i}`, org.id, `${year}-03-0${i + 1}`, `${year}-03-0${i + 3}`, amount, channel);
  });
  const expenses = [['limpeza', 640], ['manutencao', 310], ['consumiveis', 185], ['supermercado', 120], ['outro', 30]];
  expenses.forEach(([category, amount], i) => db.prepare('INSERT INTO expenses(id,organization_id,date,description,category,amount) VALUES(?,?,?,?,?,?)')
    .run(`e${i}`, org.id, `${year}-02-1${i}`, `Despesa ${category}`, category, amount));
  // Consola: sessões por browser (a menor fica abaixo de 3 %) e dispositivo.
  const day = dates.localDay();
  [['Chrome', 'Windows', 'desktop', 120], ['Safari', 'iOS', 'mobile', 80], ['Firefox', 'Linux', 'desktop', 30], ['Edge', 'Windows', 'desktop', 12], ['Opera', 'Windows', 'tablet', 3]]
    .forEach(([browser, system, device, n]) => db.prepare("INSERT INTO platform_device_daily(organization_id,day,browser,os,device,display_mode,sessions) VALUES(?,?,?,?,?,'browser',?)").run(org.id, day, browser, system, device, n));

  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  browser = await (process.env.BROWSER_ENGINE === 'webkit' ? webkit : chromium).launch({ headless: true });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.route('https://**/*', route => route.abort());
  await context.addInitScript(chartJs);
  await context.addInitScript(() => { try { sessionStorage.clear(); } catch {} }); // o separador dos relatórios fica guardado na sessão
  await context.addCookies([{ name: auth.SESSION_COOKIE, value: session, url: base }]);
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', error => problems.push(error.message));
  page.on('console', msg => { if (msg.type() === 'error' && !/Failed to load resource|net::ERR/.test(msg.text())) problems.push(msg.text()); });
  const shots = process.env.ANEL_ARTIFACTS_DIR;
  if (shots) fs.mkdirSync(shots, { recursive: true });

  // Regras comuns a cada anel: total no centro, linhas da legenda, 100 %, sem cortes, contraste.
  async function inspect(root, { total, rows, dark, name }) {
    await expect(root.locator('.anel canvas')).toHaveCount(1);
    const info = await root.evaluate((el, { dark }) => {
      const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
      const rgb = c => c.match(/[\d.]+/g).slice(0, 3).map(Number);
      const items = [...el.querySelectorAll('.anel-legenda li')];
      const box = el.getBoundingClientRect();
      const bg = DonutRing.backdrop(el.querySelector('.anel-painel'));
      return {
        center: el.querySelector('.anel-centro b').textContent.replace(/\s/g, ' '),
        label: el.querySelector('.anel-centro span').textContent,
        rows: items.length,
        pct: items.map(li => parseInt(li.querySelector('em').textContent, 10)),
        clipped: items.some(li => { const r = li.getBoundingClientRect(); return r.left < box.left - 1 || r.right > box.right + 1 || li.scrollWidth > li.clientWidth + 1; }),
        ringInside: (() => { const c = el.querySelector('canvas').getBoundingClientRect(), p = el.querySelector('.anel-painel').getBoundingClientRect(); return c.left >= p.left && c.right <= p.right + 1; })(),
        contrasts: dark ? [...el.querySelectorAll('.anel-ponto')].map(d => { const a = lum(rgb(getComputedStyle(d).backgroundColor)), b = lum(bg); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05); }) : [],
        bgDark: lum(bg) < .2,
      };
    }, { dark });
    assert.equal(info.center, total.replace(/\s/g, ' '), `${name}: total no centro`);
    assert.equal(info.label, 'Total');
    assert.equal(info.rows, rows, `${name}: linhas da legenda`);
    assert.equal(info.pct.reduce((a, b) => a + b, 0), 100, `${name}: percentagens somam 100 (${info.pct})`);
    assert.ok(!info.clipped, `${name}: legenda cortada`);
    assert.ok(info.ringInside, `${name}: anel fora do painel`);
    if (dark) assert.ok(info.bgDark, `${name}: painel devia ser escuro`);
    for (const c of info.contrasts) assert.ok(c >= 3, `${name}: contraste ${c.toFixed(2)} < 3`);
  }

  const looks = [{ look: 'classico', mode: 'auto', dark: false }, { look: 'vidro', mode: 'claro', dark: false }, { look: 'vidro', mode: 'escuro', dark: true }];
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const pref of looks) {
      const tag = `${width}-${pref.look}-${pref.mode}`;
      appearance.save(user.id, { look: pref.look, mode: pref.mode });
      await page.goto(`${base}/relatorios`);
      await expect(page.locator('body')).toHaveClass(/auth-ready/);
      await expect(page.locator('#chart-channel .anel-legenda li')).toHaveCount(channels.length);
      const money = amount => page.evaluate(v => ReservationMoney.format(v), amount);
      await inspect(page.locator('#chart-channel'), { total: await money(channels.reduce((s, c) => s + c[1], 0)), rows: channels.length, dark: pref.dark, name: `canais ${tag}` });
      await page.waitForTimeout(1200); // fim da animação do anel
      if (shots) await page.locator('#rtab-faturamento .report-chart-side').screenshot({ path: path.join(shots, `receita-${tag}.png`) });
      await page.evaluate(() => AppModules.relatorios.switchReportTab('despesas'));
      await expect(page.locator('#chart-desp-category .anel-legenda li')).toHaveCount(expenses.length);
      await inspect(page.locator('#chart-desp-category'), { total: await money(expenses.reduce((s, c) => s + c[1], 0)), rows: expenses.length, dark: pref.dark, name: `despesas ${tag}` });
      await page.waitForTimeout(1200);
      if (shots) await page.locator('#rtab-despesas .report-chart-side').screenshot({ path: path.join(shots, `despesas-${tag}.png`) });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `overflow relatórios ${tag}`);
    }
    // O aspeto muda com a página aberta: o anel redesenha-se com as cores novas.
    await page.evaluate(() => AppAppearance.apply({ look: 'vidro', mode: 'claro' }));
    await page.evaluate(() => AppAppearance.apply({ look: 'vidro', mode: 'escuro' }));
    await expect.poll(() => page.evaluate(() => document.querySelectorAll('#chart-desp-category canvas').length)).toBe(1);
  }

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const pref of looks) {
      const tag = `${width}-${pref.look}-${pref.mode}`;
      await page.goto(`${base}/plataforma/utilizacao`);
      await expect(page.locator('#pl-content')).not.toContainText('A carregar…');
      await page.evaluate(p => AppAppearance.apply({ look: p.look, mode: p.mode }), pref);
      const card = page.locator('.pl-chart-card:has(h3:text-is("Browsers"))');
      // Esperado a partir da API: o próprio navegador de teste também conta uma sessão.
      const usage = await page.evaluate(() => fetch('/api/platform/usage?days=30').then(r => r.json()).then(r => r.data.browsers.map(b => b.sessions)));
      const rows = Math.min(usage.length, 5) + (usage.length > 5 ? 1 : 0);
      assert.ok(usage.length >= 5 && usage.reduce((a, b) => a + b, 0) >= 245);
      await expect(card.locator('.anel-legenda li')).toHaveCount(rows);
      const total = await page.evaluate(sum => AppModules.consola.fmt.num(sum), usage.reduce((a, b) => a + b, 0));
      await inspect(card.locator('.pl-chart'), { total, rows, dark: pref.dark, name: `consola ${tag}` });
      assert.match(await card.locator('.pl-chart').getAttribute('aria-label'), new RegExp(`Browsers.*Chrome 120.*total ${total}`));
      await page.waitForTimeout(200);
      if (shots) await page.locator('.pl-charts-3').screenshot({ path: path.join(shots, `consola-${tag}.png`) });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `overflow consola ${tag}`);
    }
  }

  // Unidades: percentagens (maior resto) e cores.
  const unit = await page.evaluate(() => ({
    p1: DonutRing.percents([1, 1, 1]), p2: DonutRing.percents([4820, 3960, 2710, 1240, 420]), p3: DonutRing.percents([0, 0]),
    dark: DonutRing.lift('#843424', [38, 38, 38]), light: DonutRing.lift('#843424', [243, 241, 238]), blue: DonutRing.lift('#003580', [38, 38, 38]),
  }));
  assert.deepEqual(unit.p1, [34, 33, 33]);
  assert.deepEqual(unit.p2, [37, 30, 21, 9, 3]);
  assert.deepEqual(unit.p3, [0, 0]);
  assert.equal(unit.light, '#843424');
  assert.notEqual(unit.dark, '#843424');
  assert.notEqual(unit.blue, '#003580');
  assert.deepEqual(problems, [], `erros na consola do navegador: ${problems.join(' | ')}`);
  console.log('check-graficos-anel: ok');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); server?.close(); });
