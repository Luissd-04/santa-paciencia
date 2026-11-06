// Ficha da reserva: cabeçalho com os estados, «Próximo passo» conforme a
// reserva, cartões (estadia, hóspedes, valores e pagamentos), menu «Mais» e
// largura no telemóvel. Dados sintéticos e base descartável; não lê .env.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium, expect } = require('@playwright/test');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-ficha-'));
process.chdir(temp);
Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test', EMAIL_ENABLED: 'false', FRONTEND_PATH: path.resolve(__dirname, '../../../frontend') });
const app = require('../app');
const { db } = require('../config/database');
const auth = require('../services/authService');
const orgs = require('../services/orgService');
const dates = require('../services/dates');
let server, browser;

async function main() {
  const org = orgs.createOrganization('Ficha de teste');
  const user = auth.createUser({ name: 'Teste', email: 'ficha@example.invalid', password: 'SyntheticFicha123!' });
  orgs.createMembership({ organizationId: org.id, userId: user.id, role: 'owner' });
  const session = auth.createSession(user.id, org.id).sessionId;
  db.prepare("INSERT INTO accommodations(id,organization_id,name,type,price_per_night,max_guests) VALUES('unit',?,'Suite Familiar','alojamento',140,4)").run(org.id);
  const today = dates.localDay();
  const soon = dates.addDays(today, 10);
  const guest = db.prepare('INSERT INTO guests(id,organization_id,name,email,phone) VALUES(?,?,?,?,?)');
  const reservation = db.prepare(`INSERT INTO reservations(id,organization_id,guest_id,accommodation_id,check_in,check_out,nights,num_guests,num_adults,total_amount,amount_paid,payment_status,status,precheckin_submitted_at,guests_data,public_token,precheckin_token)
    VALUES(?,?,?,'unit',?,?,2,2,2,280,?,?,?,?,?,?,?)`);
  const fixtures = [
    ['sinal', 'Beatriz Pinto', soon, 80, 'parcial', 'aguardar_pagamento', 'nao_enviado'],
    ['pedido', 'Pedido Novo', dates.addDays(soon, 5), 0, 'pendente', 'pendente', 'nao_enviado'],
    ['precheckin', 'Carlos Mendes', dates.addDays(soon, 10), 280, 'confirmado', 'confirmada', 'nao_enviado'],
    ['chegada', 'Chegada Hoje', today, 280, 'confirmado', 'confirmada', 'preenchido'],
  ];
  for (const [id, name, checkIn, paid, payment, status, precheckin] of fixtures) {
    guest.run(`g-${id}`, org.id, name, `${id}@example.invalid`, '+351 912 345 678');
    reservation.run(id, org.id, `g-${id}`, checkIn, dates.addDays(checkIn, 2), paid, payment, status, precheckin === 'preenchido' ? `${today} 09:00:00` : null,
      JSON.stringify([{ name: 'Acompanhante Teste' }]), id.padEnd(64, 'a').replace(/[^a-f0-9]/g, 'a'), `pc-${id}`);
  }
  db.prepare("INSERT INTO reservation_payments(id,reservation_id,organization_id,amount,method,payment_date,notes) VALUES('p1','sinal',?,80,'transferencia',?,'')").run(org.id, today);

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
  const open = async id => {
    await page.goto(`${base}/reservas?reserva=${id}`);
    await expect(page.locator('.rf-guest-name')).toBeVisible();
  };

  // Falta o sinal: estados no topo, próximo passo e os valores.
  await open('sinal');
  await expect(page.locator('.rf-guest-name')).toHaveText('Beatriz Pinto');
  await expect(page.locator('.rf-chips')).toContainText('Aguarda sinal');
  await expect(page.locator('.rf-chips')).toContainText('Parcial');
  await expect(page.locator('.rf-next')).toContainText('Próximo passo: receber o restante do sinal');
  await expect(page.locator('.rf-next')).toContainText('faltam 200,00 €');
  await expect(page.locator('.rf-next .btn', { hasText: 'Registar pagamento' })).toBeVisible();
  await expect(page.locator('#rdv2-total-paid')).toHaveText('80,00 €');
  await expect(page.locator('#rdv2-remaining')).toHaveText('200,00 €');
  await expect(page.locator('.rf-guest')).toHaveCount(2);
  await expect(page.locator('.rf-guest').nth(1)).toContainText('Acompanhante Teste');
  await expect(page.locator('.rf-dates')).toContainText('2noites');
  // Menu «Mais»: as ações todas, cancelar e apagar no fim, separadas.
  await page.locator('#rdv2-actions-trigger').click();
  const menu = page.locator('#rdv2-actions-menu');
  await expect(menu).toBeVisible();
  await expect(menu.locator('.rdv2-action-link').last()).toHaveText(/Apagar reserva/);
  await expect(menu.locator('.rf-menu-sep')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  // O total edita-se no próprio sítio.
  await page.getByRole('button', { name: 'Editar preço total' }).click();
  await page.locator('.rf-total input').fill('300');
  await page.locator('.rf-total input').press('Enter');
  // Diferente do preço padrão: a confirmação de sempre aparece antes de guardar.
  await page.getByRole('button', { name: 'Confirmar alteração' }).click();
  await expect(page.locator('.toast', { hasText: 'Preço atualizado' })).toBeVisible();
  assert.equal(db.prepare("SELECT total_amount FROM reservations WHERE id='sinal'").get().total_amount, 300);

  // Pedido por aprovar e pré-check-in por pedir.
  await open('pedido');
  await expect(page.locator('.rf-next')).toContainText('Próximo passo: pedido por aprovar');
  await expect(page.locator('.rf-side')).not.toContainText('Enviar link ao hóspede');
  await open('precheckin');
  await expect(page.locator('.rf-next')).toContainText('Próximo passo: pedir o pré-check-in');
  await expect(page.locator('.rf-side')).toContainText('Enviar link ao hóspede');

  // Dia de chegada: marcar o check-in feito tira o passo da ficha.
  await open('chegada');
  await expect(page.locator('.rf-next')).toContainText('Próximo passo: chegada hoje');
  await page.locator('.rf-next .btn', { hasText: 'Marcar check-in feito' }).click();
  await expect(page.locator('.rf-op.done')).toHaveCount(1);
  await expect(page.locator('.rf-next')).toHaveCount(0);

  // Telemóvel: nada mais largo do que o ecrã.
  for (const width of [320, 390, 820]) {
    await page.setViewportSize({ width, height: 844 });
    await open('sinal');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `ficha mais larga do que ${width}px`);
  }

  assert.deepEqual(errors, []);
  console.log('OK: ficha da reserva — estados no topo, próximo passo por estado, valores, hóspedes, menu «Mais», total editável e largura no telemóvel.');
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  db.close();
});
