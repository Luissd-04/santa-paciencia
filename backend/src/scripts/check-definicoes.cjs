// Definições da pessoa: a versão instalada nas Definições da app e a página
// Definições da consola (conta, aspeto, versão, sessão). Base descartável.
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { chromium, webkit, expect } = require('@playwright/test');
const previous = process.cwd(), temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-definicoes-'));
process.chdir(temp);
Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test', EMAIL_ENABLED: 'false', APP_BUILD: 'abc9178d0e1f22',
  PLATFORM_ADMIN_EMAILS: 'def@example.invalid', FRONTEND_PATH: path.resolve(__dirname, '../../../frontend') });
const app = require('../app'), { db } = require('../config/database'), auth = require('../services/authService'), orgs = require('../services/orgService');
const PASSWORD = 'SyntheticDefinicoes123!';
const user = auth.createUser({ name: 'Ana Definições', email: 'def@example.invalid', password: PASSWORD });
db.prepare('UPDATE users SET platform_admin = 1 WHERE id = ?').run(user.id);
require('../services/platformAccess').setPlatformRoles(user.id, ['marketing', 'admin']);
const org = orgs.createOrganization('Casa sintética');
orgs.createMembership({ organizationId: org.id, userId: user.id, role: 'owner' });
const shots = process.env.DEFINICOES_SHOTS_DIR;
let server, browser;
async function main() {
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.on('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  browser = await (process.env.BROWSER_ENGINE === 'webkit' ? webkit : chromium).launch({ headless: true });
  const errors = [];
  for (const [label, width] of [['computador', 1280], ['telemovel', 390]]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    // Sem rede externa (CDNs), como as outras verificações: um CDN lento não pode prender o teste.
    await context.route('**/*', route => (new URL(route.request().url()).origin === base ? route.continue() : route.abort()));
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(String(e)));
    const session = auth.createSession(user.id, org.id).sessionId;
    await context.addCookies([{ name: auth.SESSION_COOKIE, value: session, url: base }]);

    // App → Definições → Versão da aplicação.
    await page.goto(`${base}/definicoes`);
    await page.locator('[data-settings-tab="sobre"]').click();
    await expect(page.locator('#about-commit')).toHaveText('abc9178d0e1f');
    await expect(page.locator('#about-started')).not.toHaveText('—');
    if (shots) await page.screenshot({ path: path.join(shots, `app-definicoes-${label}.png`) });

    // Consola → Definições (desbloqueada, como depois da palavra-passe).
    const consoleSession = auth.createPlatformSession(user.id).sessionId;
    await require('../services/platformAccess').unlock(consoleSession, user.id, PASSWORD);
    await context.addCookies([{ name: auth.SESSION_COOKIE, value: consoleSession, url: base }]);
    await page.goto(`${base}/plataforma/definicoes`);
    await expect(page.locator('#pl-title')).toHaveText('Definições');
    await expect(page.locator('#pl-content')).toContainText('abc9178d0e1f');
    await expect(page.locator('#pl-content')).toContainText('Administração · Marketing e comercial');
    await expect(page.locator('#pl-aspeto [aria-pressed="true"]')).toHaveCount(1);
    // A barra lateral já não tem o aspeto nem «Terminar sessão».
    await expect(page.locator('#pl-side #pl-aspeto')).toHaveCount(0);
    await expect(page.locator('#pl-side')).not.toContainText('Terminar sessão');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `overflow ${label}`);
    if (shots) await page.screenshot({ path: path.join(shots, `consola-definicoes-${label}.png`), fullPage: true });
    // Mudar o aspeto aqui fica marcado.
    await page.locator('#pl-aspeto [data-look="escuro"]').click();
    await expect(page.locator('#pl-aspeto [data-look="escuro"]')).toHaveAttribute('aria-pressed', 'true');
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log('OK: versão nas Definições da app e Definições da consola (conta, cargos, aspeto, versão, sessão), computador e telemóvel.');
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => {
  await browser?.close();
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  db.close(); process.chdir(previous); fs.rmSync(temp, { recursive: true, force: true });
});
