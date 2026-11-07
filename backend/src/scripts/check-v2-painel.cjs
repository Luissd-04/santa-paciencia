// V2: Definições → Aparência (atual, clássico, vidro claro/escuro/automático,
// guardado na conta) e o painel novo com dados reais. A V1 continua igual para
// quem não muda nada. Dados sintéticos e base descartável; não lê .env.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium, expect } = require('@playwright/test');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-v2-painel-'));
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
  const org = orgs.createOrganization('Painel V2');
  const user = auth.createUser({ name: 'Célia Pinto', email: 'celia@example.invalid', password: 'SyntheticPainel123!' });
  orgs.createMembership({ organizationId: org.id, userId: user.id, role: 'owner' });
  const session = auth.createSession(user.id, org.id).sessionId;
  db.prepare(`INSERT INTO accommodations(id,organization_id,name,type,price_per_night,max_guests,checkin_time,checkout_time,color)
    VALUES('u',?,'Suite Oliveira','alojamento',100,4,'15:00','11:00','#5f7d6a')`).run(org.id);
  const today = dates.localDay();
  const guest = db.prepare('INSERT INTO guests(id,organization_id,name,email) VALUES(?,?,?,?)');
  const res = db.prepare(`INSERT INTO reservations(id,organization_id,guest_id,accommodation_id,check_in,check_out,nights,num_guests,total_amount,amount_paid,status)
    VALUES(?,?,?,'u',?,?,?,2,?,?,?)`);
  for (const [id, name, ci, co, total, paid, status] of [
    ['chega', 'Beatriz Pinto', today, dates.addDays(today, 2), 280, 80, 'aguardar_pagamento'],
    ['sai', 'Ana Costa', dates.addDays(today, -2), today, 200, 200, 'check_in'],
    ['pedido', 'Rui Marques', dates.addDays(today, 10), dates.addDays(today, 12), 190, 0, 'pendente'],
  ]) {
    guest.run(`g-${id}`, org.id, name, `${id}@example.invalid`);
    res.run(id, org.id, `g-${id}`, ci, co, dates.daysBetween(ci, co), total, paid, status);
  }

  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', colorScheme: 'dark' });
  await context.route('https://**/*', route => route.abort());
  await context.addCookies([{ name: auth.SESSION_COOKIE, value: session, url: base }]);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const look = () => page.evaluate(() => [document.documentElement.dataset.look || null, document.documentElement.dataset.mode || null]);

  // Sem escolha: a V1, com o painel de sempre.
  await page.goto(base);
  await expect(page.locator('#kpi-ativas')).not.toHaveText('—');
  assert.deepEqual(await look(), [null, null]);
  await expect(page.locator('#v2-painel')).toBeHidden();
  await expect(page.locator('#dash-desktop')).toBeVisible();

  // Escolher o vidro em Definições → Aparência: automático segue o sistema (escuro aqui).
  await page.evaluate(() => AppModules.core.showView('definicoes'));
  await page.locator('[data-settings-tab="aparencia"]').click();
  await expect(page.locator('#appearance-mode')).toBeHidden();
  await page.locator('[data-appearance-look="vidro"]').click();
  await expect(page.locator('[data-appearance-look="vidro"]')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#appearance-mode')).toBeVisible();
  await expect.poll(look).toEqual(['vidro', 'escuro']);
  await expect.poll(() => appearance.get(user.id)).toEqual({ look: 'vidro', mode: 'auto' });
  await page.locator('[data-appearance-mode="claro"]').click();
  await expect.poll(look).toEqual(['vidro', 'claro']);
  await expect.poll(() => appearance.get(user.id).mode).toBe('claro');

  // Recarregar: a escolha vem da conta (e deste aparelho, para não piscar).
  await page.goto(base);
  await expect(page.locator('#v2-painel')).toBeVisible();
  assert.deepEqual(await look(), ['vidro', 'claro']);
  await expect(page.locator('#dash-desktop')).toBeHidden();
  const painel = page.locator('#v2-painel');
  await expect(painel.locator('.v2-head h2')).toHaveText(/(Bom dia|Boa tarde|Boa noite), Célia/);
  await expect(painel.locator('.v2-kpi').nth(0)).toContainText('Chegadas hoje');
  await expect(painel.locator('.v2-kpi').nth(0).locator('strong')).toHaveText('1');
  await expect(painel.locator('.v2-kpi').nth(3).locator('strong')).toHaveText(/390,00/);
  const hoje = painel.locator('.v2-c-hoje');
  await expect(hoje.locator('.v2-row')).toHaveCount(2);
  await expect(hoje.locator('.v2-row').first()).toContainText('Check-out · Ana Costa');
  await expect(hoje.locator('.v2-row').last()).toContainText('faltam 200,00');
  await expect(painel.locator('.v2-c-atencao')).toContainText('Pedido por aprovar');
  await expect(painel.locator('.v2-c-atencao')).toContainText('Falta o sinal');

  // «Marcar feito» marca a tarefa e não abre a reserva.
  await hoje.locator('.v2-row').first().getByRole('button', { name: 'Marcar feito' }).click();
  await expect(hoje.locator('.v2-row').first().locator('.v2-chip')).toHaveText('Feito');
  assert.equal(db.prepare("SELECT status FROM operational_events WHERE reservation_id='sai' AND auto_kind='checkout'").get()?.status, 'concluido');
  await expect(page.locator('#view-dashboard')).toBeVisible();

  // Um item que precisa de atenção abre a reserva.
  await painel.locator('.v2-c-atencao .v2-row', { hasText: 'Pedido por aprovar' }).click();
  await expect(page.locator('.rf-guest-name')).toHaveText('Rui Marques');

  // Telemóvel: nada mais largo do que o ecrã, em cada aspeto.
  for (const [lookName, mode] of [['classico', 'auto'], ['vidro', 'claro'], ['vidro', 'escuro']]) {
    appearance.save(user.id, { look: lookName, mode });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base);
    await expect(page.locator('#v2-painel .v2-kpi').first()).toBeVisible();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `painel mais largo do que o ecrã (${lookName} ${mode})`);
  }

  // Voltar ao atual: a V1 de sempre.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${base}/definicoes`);
  await page.locator('[data-settings-tab="aparencia"]').click();
  await page.locator('[data-appearance-look="atual"]').click();
  await expect.poll(look).toEqual([null, null]);
  await expect.poll(() => appearance.get(user.id).look).toBe('atual');

  // O servidor recusa valores desconhecidos.
  const refused = await page.evaluate(async () => (await fetch('/auth/appearance', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appearance: { look: 'neon' } }) })).status);
  assert.equal(refused, 400);

  assert.deepEqual(errors, []);
  console.log('OK: V2 — aparência por pessoa (atual, clássico, vidro claro/escuro/automático), painel novo com dados reais, marcar feito, atenção e largura no telemóvel.');
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  db.close();
});
