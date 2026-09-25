// Mede o arranque da aplicação: pedidos, bytes transferidos e tempo até a
// vista inicial ficar pronta. Corre contra a app real, com base descartável.
// Uso: node scripts/measure-frontend.cjs [ficheiro-de-saida.json]
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('@playwright/test');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-measure-'));
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

// Vistas medidas depois do arranque, pela ordem em que são abertas.
const VIEWS = ['reservas', 'calendario', 'eventos', 'hospedes', 'alojamentos',
  'despesas', 'relatorios', 'vouchers', 'precos', 'invoice', 'definicoes'];
const BUDGETS = {
  bootRequests: Number(process.env.FRONTEND_BOOT_REQUEST_BUDGET || 65),
  bootKb: Number(process.env.FRONTEND_BOOT_KB_BUDGET || 1100),
  totalKb: Number(process.env.FRONTEND_TOTAL_KB_BUDGET || 2200),
};

function tracker(page) {
  // O cálculo do tamanho é assíncrono: as promessas ficam guardadas para
  // serem esperadas antes de cada leitura, senão os totais chegam atrasados.
  const state = { scripts: [], bytes: 0, requests: 0, pending: [] };
  page.on('response', response => {
    const url = response.url();
    if (!/\.(?:js|css)(?:\?|$)/.test(url)) return;
    state.requests++;
    if (/\.js(?:\?|$)/.test(url)) state.scripts.push(url.replace(/^https?:\/\/[^/]+/, ''));
    state.pending.push((async () => {
      // Alguns pedidos não trazem content-length (resposta em chunks) e o corpo
      // pode já não estar disponível; nesses casos fica o tamanho em disco.
      let size = 0;
      try { size = Number((await response.allHeaders())['content-length'] || 0); } catch {}
      if (!size) { try { size = (await response.body()).length; } catch {} }
      if (!size) {
        const file = path.join(process.env.FRONTEND_PATH, url.replace(/^https?:\/\/[^/]+\//, '').split('?')[0]);
        try { size = fs.statSync(file).size; } catch {}
      }
      state.bytes += size;
    })());
  });
  state.settle = async () => { while (state.pending.length) await Promise.all(state.pending.splice(0)); };
  return state;
}

async function main() {
  const org = orgs.createOrganization('Medição');
  const user = auth.createUser({ name: 'Medição', email: 'measure@example.invalid', password: 'SyntheticMeasure123!' });
  orgs.createMembership({ organizationId: org.id, userId: user.id, role: 'owner' });
  const session = auth.createSession(user.id, org.id).sessionId;
  db.prepare('INSERT INTO accommodations(id,organization_id,name,type,price_per_night,max_guests) VALUES(?,?,?,?,?,?)')
    .run('unit', org.id, 'Unidade', 'alojamento', 100, 4);

  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  await context.addCookies([{ name: auth.SESSION_COOKIE, value: session, url: base }]);
  const page = await context.newPage();
  const seen = tracker(page);
  page.setDefaultTimeout(15000);

  const started = Date.now();
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.locator('#kpi-ativas').waitFor({ state: 'visible' });
  await seen.settle();
  const boot = {
    ms: Date.now() - started,
    requests: seen.requests,
    kb: +(seen.bytes / 1024).toFixed(1),
    scripts: seen.scripts.length,
  };

  const views = {};
  for (const view of VIEWS) {
    const before = { requests: seen.requests, bytes: seen.bytes };
    const t0 = Date.now();
    await page.evaluate(v => AppModules.core.showView(v), view);
    await page.waitForLoadState('networkidle');
    await seen.settle();
    views[view] = {
      ms: Date.now() - t0,
      requests: seen.requests - before.requests,
      kb: +((seen.bytes - before.bytes) / 1024).toFixed(1),
    };
  }

  const total = { requests: seen.requests, kb: +(seen.bytes / 1024).toFixed(1) };
  const report = { boot, views, total };
  console.log(`Arranque: ${boot.requests} pedidos JS/CSS, ${boot.kb} KB, ${boot.scripts} scripts, ${boot.ms} ms até à vista inicial.`);
  for (const [view, data] of Object.entries(views)) {
    console.log(`  ${view.padEnd(12)} +${String(data.requests).padStart(3)} pedidos  +${String(data.kb).padStart(7)} KB  ${data.ms} ms`);
  }
  console.log(`Total após visitar todas as vistas: ${total.requests} pedidos, ${total.kb} KB.`);
  const failures = [];
  if (boot.requests > BUDGETS.bootRequests) failures.push(`arranque: ${boot.requests} pedidos > ${BUDGETS.bootRequests}`);
  if (boot.kb > BUDGETS.bootKb) failures.push(`arranque: ${boot.kb} KB > ${BUDGETS.bootKb} KB`);
  if (total.kb > BUDGETS.totalKb) failures.push(`total: ${total.kb} KB > ${BUDGETS.totalKb} KB`);
  if (failures.length) throw new Error(`Orçamento de frontend excedido (${failures.join('; ')}).`);
  const out = process.argv[2];
  if (out) fs.writeFileSync(path.resolve(previous, out), JSON.stringify(report, null, 2));
  await context.close();
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  db.close(); process.chdir(previous); fs.rmSync(temp, { recursive: true, force: true });
});
