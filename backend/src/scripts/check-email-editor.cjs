// Editor de emails: lista pelo percurso com o estado de cada email, conteúdo
// em blocos com nomes legíveis (sem marcadores à vista), editar, mover, tirar e
// acrescentar blocos, pré-visualização com uma reserva real, guardar no formato
// de sempre e repor o texto original. Dados inventados; pedidos externos
// bloqueados.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium, expect } = require('@playwright/test');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-email-editor-'));
const previous = process.cwd();
process.chdir(temp);
Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test', EMAIL_ENABLED: 'false', FRONTEND_PATH: path.resolve(__dirname, '../../../frontend') });
const app = require('../app');
const { db } = require('../config/database');
const auth = require('../services/authService');
const orgs = require('../services/orgService');
const { TEMPLATES } = require('../config/emailTemplateDefaults');
let server, browser;

async function main() {
  const org = orgs.createOrganization('Casa do Monte');
  const user = auth.createUser({ name: 'Dona', email: 'dona@example.invalid', password: 'Synthetic123!' });
  orgs.createMembership({ organizationId: org.id, userId: user.id, role: 'owner' });
  const session = auth.createSession(user.id, org.id).sessionId;
  // Tudo preenchido menos o link de avaliação: o «Obrigado» fica em falta.
  db.prepare(`INSERT INTO accommodations (id, organization_id, name, type, price_per_night, max_guests, address, city, license_number,
      checkin_time, checkout_time, contact_email, arrival_instructions, entry_instructions, checkout_instructions, door_code)
    VALUES ('casa', ?, 'Casa do Monte', 'alojamento', 100, 4, 'Rua do Monte 1', 'Évora', '98765/AL', '15:00', '11:00',
      'reservas@example.invalid', 'Porta verde.', 'Chave na caixa.', 'Deixe a chave', '4821')`).run(org.id);
  db.prepare("INSERT INTO guests (id, organization_id, name, email) VALUES ('g', ?, 'Ana Hóspede', 'ana@example.invalid')").run(org.id);
  db.prepare(`INSERT INTO reservations (id, organization_id, guest_id, accommodation_id, check_in, check_out, nights, num_guests, total_amount, amount_paid, status, channel)
    VALUES ('SP-EDITOR', ?, 'g', 'casa', '2035-06-10', '2035-06-12', 2, 2, 200, 200, 'confirmada', 'website')`).run(org.id);

  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  await context.addCookies([{ name: auth.SESSION_COOKIE, value: session, url: base }]);
  await context.route('https://**/*', route => route.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto(`${base}/definicoes`);
  await page.locator('.settings-tab[data-settings-tab="emails"]').click();
  const list = page.locator('#email-template-list');
  await expect(list).toContainText('Antes da estadia');
  await expect(list).toContainText('Reserva aceite');
  // O estado de cada email para o alojamento da pré-visualização.
  await expect(list.locator('.template-item', { hasText: 'Obrigado' })).toContainText('Falta 1 dado');
  await expect(list.locator('.template-item', { hasText: 'Após check-in' })).toContainText('Desligado');
  await expect(list.locator('.template-item', { hasText: 'Pagamento do restante' })).toContainText('Sem uso');

  // «Tudo para a sua chegada»: blocos com nomes, nada de {{…}} à vista.
  await list.locator('.template-item', { hasText: 'Tudo para a sua chegada' }).click();
  const blocks = page.locator('#et-blocks');
  for (const name of ['Título — chegada', 'Datas da estadia', 'Como chegar', 'Como entrar', 'Dia da saída', 'Contacto']) {
    await expect(blocks).toContainText(name);
  }
  assert(!(await blocks.innerText()).includes('{{'), 'marcadores à vista no editor');
  await expect(blocks.locator('.emb-var', { hasText: 'Primeiro nome' })).toHaveCount(1);
  await expect(page.locator('.emed2-when-text')).toContainText('antes');

  // Pré-visualização com a reserva real. Num painel estreito, Texto e
  // Pré-visualização são separadores.
  const pane = async name => {
    const tab = page.locator('.emed2-panes button', { hasText: name });
    if (await tab.isVisible()) await tab.click();
  };
  await pane('Pré-visualização');
  const frame = page.frameLocator('#et-preview-frame');
  await expect(page.locator('#et-preview-reservation')).toContainText('Ana Hóspede');
  await page.locator('#et-preview-reservation').selectOption({ index: 0 });
  await expect(frame.locator('body')).toContainText('Olá Ana');
  await expect(frame.locator('body')).toContainText('4821');
  await expect(page.locator('#et-preview-subject')).toHaveText('Tudo para a sua chegada — Casa do Monte');
  assert.equal(await page.locator('#et-preview-frame').getAttribute('sandbox'), 'allow-same-origin');
  await pane('Texto');

  // Editar um parágrafo atualiza a pré-visualização e marca por guardar.
  const paragraph = blocks.locator('.emb-text-body').nth(1);
  await paragraph.click();
  await paragraph.evaluate(el => { el.innerHTML = '<p>Texto novo do alojamento.</p>'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await expect(page.locator('#et-dirty')).toBeVisible();
  await pane('Pré-visualização');
  await expect(frame.locator('body')).toContainText('Texto novo do alojamento.');
  await pane('Texto');

  // Mover, tirar e acrescentar blocos.
  const firstBlockName = async () => blocks.locator('.emb').first().innerText();
  await blocks.locator('.emb').nth(1).locator('button[title="Subir"]').click();
  assert.match(await firstBlockName(), /Olá|Primeiro nome/, 'subir pôs o parágrafo em primeiro');
  await blocks.locator('.emb-block', { hasText: 'Contacto' }).locator('button[title="Tirar do email"]').click();
  await expect(blocks).not.toContainText('Contacto');
  await page.getByRole('button', { name: 'Acrescentar texto ou bloco' }).click();
  await page.locator('#et-add-menu .emb-add-item', { hasText: 'Contacto' }).first().click();
  await expect(blocks.locator('.emb').last()).toContainText('Contacto');

  // Inserir um dado no texto aparece pelo nome.
  await paragraph.click();
  await blocks.locator('.emb-text').nth(1).locator('.codes-btn').click();
  await page.locator('#codes-dropdown-global .codes-item', { hasText: 'Referência' }).click();
  await expect(blocks.locator('.emb-var', { hasText: 'Referência' })).toHaveCount(1);

  // Guardar: o corpo fica no formato de sempre, com a nova ordem.
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.locator('#toast-container')).toContainText('Email guardado');
  const saved = db.prepare("SELECT body FROM organization_email_templates WHERE organization_id = ? AND slug = 'coordenadas'").get(org.id).body;
  assert(saved.includes('Texto novo do alojamento.') && saved.indexOf('{{referencia}}') > saved.indexOf('Texto novo do alojamento.'), 'texto e dado gravados');
  assert.doesNotMatch(saved, /<p[^>]*>\s*<p/, 'parágrafo dentro de parágrafo');
  assert(saved.indexOf('{{primeiro_nome}}') < saved.indexOf('{{titulo_chegada}}'), 'ordem gravada');
  assert(saved.trim().endsWith('{{contacto}}'), 'bloco acrescentado no fim');
  assert(!saved.includes('emb-var'), 'etiquetas do editor gravadas no corpo');
  await expect(page.locator('#et-dirty')).toBeHidden();

  // «Obrigado»: o bloco de avaliação diz o que falta.
  await list.locator('.template-item', { hasText: 'Obrigado' }).click();
  await expect(blocks.locator('.emb-block.is-missing')).toContainText('Link de avaliação');

  // Repor o texto original da chegada.
  await list.locator('.template-item', { hasText: 'Tudo para a sua chegada' }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Repor o texto original' }).click();
  const confirm = page.locator('.modal-confirm button, .confirm-dialog button, [data-confirm-ok]').filter({ hasText: /Confirmar|Sim|Repor|OK/ }).first();
  if (await confirm.count()) await confirm.click();
  await expect.poll(() => db.prepare("SELECT body FROM organization_email_templates WHERE organization_id = ? AND slug = 'coordenadas'").get(org.id).body).toBe(TEMPLATES.coordenadas.body);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM organization_email_templates_backup WHERE reason = 'editor-reset'").get().n, 1);

  const shots = process.env.SCREENSHOT_DIR;
  if (shots) {
    fs.mkdirSync(shots, { recursive: true });
    await page.screenshot({ path: path.join(shots, 'email-editor-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(shots, 'email-editor-mobile.png'), fullPage: true });
  }
  // Num ecrã largo, lado a lado; no telemóvel, em separadores.
  await page.setViewportSize({ width: 1920, height: 1000 });
  await expect(page.locator('.emed2-panes')).toBeHidden();
  await expect(page.locator('#et-preview-frame')).toBeVisible();
  await expect(page.locator('#et-blocks')).toBeVisible();
  if (shots) await page.screenshot({ path: path.join(shots, 'email-editor-wide.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.emed2-panes')).toBeVisible();
  await page.locator('.emed2-panes button', { hasText: 'Pré-visualização' }).click();
  await expect(page.locator('#et-preview-frame')).toBeVisible();
  await expect(page.locator('#et-blocks')).toBeHidden();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'largura no telemóvel');

  assert.deepEqual(errors, []);
  console.log('OK: editor de emails — lista pelo percurso com estado, blocos com nomes, editar/mover/tirar/acrescentar, dados por nome, pré-visualização com reserva real, guardar no formato de sempre, repor o original e telemóvel.');
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await browser?.close();
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  db.close();
  process.chdir(previous);
  fs.rmSync(temp, { recursive: true, force: true });
});
