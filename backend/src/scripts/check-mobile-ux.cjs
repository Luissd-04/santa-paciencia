// Mobile regressions with a disposable database. Never reads .env or customer data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium, webkit, expect } = require('@playwright/test');
const previous = process.cwd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-mobile-ux-'));
process.chdir(temp);
Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test', EMAIL_ENABLED: 'false', FRONTEND_PATH: path.resolve(__dirname, '../../../frontend') });
const app = require('../app');
const { db } = require('../config/database');
const auth = require('../services/authService');
const orgs = require('../services/orgService');
let server, browser;
async function main() {
  const org = orgs.createOrganization('Mobile UX');
  const user = auth.createUser({ name: 'Teste', email: 'ux@example.invalid', password: 'SyntheticUX123!' });
  orgs.createMembership({ organizationId: org.id, userId: user.id, role: 'owner' });
  const session = auth.createSession(user.id, org.id).sessionId;
  db.prepare('INSERT INTO accommodations(id,organization_id,name,type,price_per_night,max_guests) VALUES(?,?,?,?,?,?)').run('unit', org.id, 'Unidade UX', 'alojamento', 100, 4);
  db.prepare('INSERT INTO guests(id,organization_id,name,email) VALUES(?,?,?,?)').run('guest',org.id,'Hóspede UX','guest@example.invalid');
  db.prepare(`INSERT INTO reservations(id,organization_id,guest_id,accommodation_id,check_in,check_out,nights,num_guests,num_adults,total_amount,status)
    VALUES('res',?,'guest','unit','2030-07-06','2030-07-08',2,1,1,200,'confirmada')`).run(org.id);
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  const base = `http://127.0.0.1:${server.address().port}`;
  browser = await (process.env.BROWSER_ENGINE === 'webkit' ? webkit : chromium).launch({headless:true});
  const context = await browser.newContext({viewport:{width:375,height:812},serviceWorkers:'block'});
  await context.route('https://**/*', route => route.abort());
  const page = await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);
  await expect(page.locator('#login-submit')).toBeVisible();
  await expect(page.locator('#bottom-nav-bar')).toBeHidden();
  await expect(page.locator('#mobile-fab')).toBeHidden();
  await context.addCookies([{name:auth.SESSION_COOKIE,value:session,url:base}]);
  await page.reload();
  await expect(page.locator('body')).toHaveClass(/auth-ready/);
  // First use: markup and script must both load without visiting the prices page.
  await page.evaluate(async()=>{await AppModules.core.showView('alojamentos');await AppModules.alojamentos.openAlojamento('unit');});
  // A 375 px «Preços» fica parcialmente fora da faixa de separadores: como um
  // utilizador, desliza-se a faixa e toca-se depois de parar. Sem isto, o
  // Playwright desloca a faixa ~12 ms antes de premir e, sob carga, o WebKit
  // chegou a atribuir o pointerup ao contentor (4 em ~96 execuções; 0 em 120
  // com a faixa já parada). Espera por condição (posição estável), não por tempo.
  await page.locator('#tab-precos').evaluate(el=>el.scrollIntoView({block:'nearest',inline:'nearest'}));
  await page.waitForFunction(()=>new Promise(resolve=>{const strip=document.querySelector('.aloj-tabs');const before=strip.scrollLeft;
    requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(strip.scrollLeft===before)));}));
  await expect(page.locator('#tab-precos')).toBeInViewport({ratio:0.9}); // 2 px do sublinhado ficam cortados pela própria faixa
  await page.locator('#tab-precos').click();
  await expect(page.locator('#aloj-tab-precos .precos-day-cell').first()).toBeVisible();
  assert(await page.locator('.main').evaluate(el=>el.scrollWidth<=el.clientWidth && el.scrollLeft===0));
  await expect(page.locator('#precos-side-panel')).toBeHidden();
  await page.locator('.precos-day-cell[data-date]').first().click();
  await page.locator('.precos-day-cell[data-date]').first().click();
  await expect(page.locator('#precos-side-panel')).toHaveClass(/precos-sheet-open/);
  await page.getByRole('button',{name:'Fechar editor de preços'}).click();
  await expect(page.locator('#precos-side-panel')).toBeHidden();
  // Frame atrasado (telemóvel lento): a pré-visualização do intervalo só é
  // desenhada já com o dedo em baixo. Redesenhar a grelha nesse momento
  // substituía a célula premida e o toque perdia-se (sem clique).
  const cell = page.locator('.precos-day-cell[data-date]').nth(3);
  await cell.click();
  // O clique redesenha a grelha: medir sobre a célula atual, não sobre uma já substituída.
  // Esperar até a célula estar ligada ao documento, visível e realmente por baixo do
  // ponto de toque (centrada, para não ficar sob a barra superior fixa). Rolagem
  // instantânea: o html tem scroll-behavior:smooth e a página ainda deslizava
  // durante o toque, que acabava noutra semana.
  let box;
  await expect.poll(async()=>{box=await cell.evaluate(el=>{el.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});const r=el.getBoundingClientRect();
    const x=r.left+r.width/2+1,y=r.top+r.height/2;return {x:r.left,y:r.top,width:r.width,height:r.height,
      ready:el.isConnected&&r.width>0&&document.elementFromPoint(x,y)?.closest('[data-date]')===el};});return box.ready;}).toBe(true);
  await page.evaluate(()=>{const raf=window.requestAnimationFrame.bind(window);const held=[];window.__heldRaf=true;
    window.requestAnimationFrame=cb=>{if(window.__heldRaf){held.push(cb);return -1;}return raf(cb);};
    document.addEventListener('pointerdown',()=>{window.__heldRaf=false;raf(t=>held.splice(0).forEach(cb=>cb(t)));},{capture:true,once:true});});
  await page.mouse.move(box.x+box.width/2+1,box.y+box.height/2);
  await page.mouse.down();
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  await page.mouse.up();
  await expect(page.locator('#precos-side-panel')).toHaveClass(/precos-sheet-open/);
  await page.getByRole('button',{name:'Fechar editor de preços'}).click();
  await expect(page.locator('#precos-side-panel')).toBeHidden();
  // Shell is shown while lazy HTML is still in flight; no blank initial view.
  let releaseMarkup;
  const gate = new Promise(resolve=>{releaseMarkup=resolve;});
  await page.route('**/views/despesas.html',async route=>{await gate;await route.continue();});
  await page.locator('#bn-despesas').click();
  await expect(page.locator('#view-despesas .view-loading')).toBeVisible();
  await expect(page.locator('#view-despesas')).toHaveAttribute('aria-busy','true');
  releaseMarkup();
  await expect(page.locator('#view-despesas .view-loading')).toHaveCount(0);
  await page.unroute('**/views/despesas.html');
  for (const width of [320,375,600]) {
    await page.setViewportSize({width,height:812});
    const trigger=page.getByRole('button',{name:'Filtros',exact:true});
    await trigger.click();
    const panel=page.locator('#despesas-filter-panel');
    await expect(panel).toHaveAttribute('aria-modal','true');
    await expect(page.locator('#bottom-nav-bar')).toHaveAttribute('inert','');
    await expect.poll(()=>panel.evaluate(el=>Math.abs(el.getBoundingClientRect().top-12))).toBeLessThan(1);
    assert(await panel.locator('.despesas-search-box').evaluate(el=>el.getBoundingClientRect().height<60));
    assert(await panel.getByRole('button',{name:'Aplicar',exact:true}).evaluate(el=>{
      const r=el.getBoundingClientRect();return r.bottom<=innerHeight&&el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));
    }));
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(trigger).toBeFocused();
    assert.equal(await page.locator('#bottom-nav-bar').evaluate(el=>el.inert),false);
  }
  // Rotation closes the sheet and releases inert/background scrolling.
  await page.getByRole('button',{name:'Filtros',exact:true}).click();
  await page.setViewportSize({width:1000,height:800});
  await expect(page.locator('body')).not.toHaveClass(/modal-open/);
  await page.setViewportSize({width:375,height:812});
  // All mobile destinations are reachable.
  await page.locator('#mobile-menu-trigger').click();
  await page.locator('#side-drawer').getByRole('button',{name:'Mensagens',exact:true}).click();
  await expect(page.locator('#view-invoice')).toHaveClass(/active/);
  await page.locator('#mobile-menu-trigger').click();
  await page.locator('#side-drawer').getByRole('button',{name:'Vouchers',exact:true}).click();
  await expect(page.locator('#view-vouchers')).toHaveClass(/active/);
  // Landscape retains a usable menu; returning to portrait preserves navigation.
  // Rodar o ecrã com o Calendário ainda a carregar (2.º script retido) não pode
  // chamar funções que só existem depois de todos os scripts correrem.
  let releaseCalendar;
  const calendarGate = new Promise(resolve=>{releaseCalendar=resolve;});
  await page.route('**/js/features/calendario/dados.js*',async route=>{await calendarGate;await route.continue();});
  await page.locator('#bn-calendario').click();
  await page.waitForFunction(()=>typeof AppModules.calendario.renderCalView==='function');
  await page.setViewportSize({width:812,height:375});
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  releaseCalendar();
  await page.waitForFunction(()=>AppModules.core.isFeatureLoaded('calendario'));
  await page.unroute('**/js/features/calendario/dados.js*');
  await page.locator('#mobile-menu-trigger').click();
  await page.locator('#side-drawer').getByRole('button',{name:'Eventos',exact:true}).click();
  await expect(page.locator('#view-eventos')).toHaveClass(/active/);
  await expect(page.locator('#mobile-menu-trigger')).toBeVisible();
  await page.setViewportSize({width:375,height:812});
  await page.evaluate(async()=>{await AppModules.core.showView('eventos');AppModules.eventos.openEventoModal(null, '2030-07-06');});
  await expect(page.locator('#evento-date')).toHaveValue('2030-07-06');
  // Date defaults/edits retain ISO; invalid title gets focus and inline feedback.
  await page.locator('#evento-save-btn').click();
  await expect(page.locator('#evento-title')).toBeFocused();
  await expect(page.locator('#evento-title')).toHaveAttribute('aria-invalid','true');
  await expect(page.locator('#evento-title-error')).toBeVisible();
  await page.locator('#evento-title').fill('Verificação');
  await expect(page.locator('#evento-title')).not.toHaveAttribute('aria-invalid');
  await page.keyboard.press('Escape');
  // Pristine edit closes silently; dirty edit can be cancelled without losing text.
  await page.evaluate(async()=>{await AppModules.core.showView('reservas');await AppModules.reservas.openEditModal('res');});
  let confirmations=0;
  const dismiss=async dialog=>{confirmations++;await dialog.dismiss();};
  page.on('dialog',dismiss);
  await page.keyboard.press('Escape');
  await expect(page.locator('#modal-bg')).not.toHaveClass(/open/);
  assert.equal(confirmations,0);
  await page.evaluate(()=>AppModules.reservas.openEditModal('res'));
  await page.locator('#f-notas').fill('Alteração por guardar');
  await page.keyboard.press('Escape');
  await expect.poll(()=>confirmations).toBe(1);
  await expect(page.locator('#modal-bg')).toHaveClass(/open/);
  await expect(page.locator('#f-notas')).toHaveValue('Alteração por guardar');
  page.off('dialog',dismiss);
  // Fine pointer date picker stays in the viewport; Escape closes only the picker.
  await page.locator('#f-checkin').click();
  await expect(page.locator('.date-pop')).toBeVisible();
  assert(await page.locator('.date-pop').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth;}));
  await page.keyboard.press('Escape');
  await expect(page.locator('.date-pop')).toHaveCount(0);
  await expect(page.locator('#modal-bg')).toHaveClass(/open/);
  page.once('dialog',dialog=>dialog.accept());
  await page.keyboard.press('Escape');
  await expect(page.locator('#modal-bg')).not.toHaveClass(/open/);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.locator('#bn-despesas').click();
  await page.getByRole('button',{name:'Filtros',exact:true}).click();
  assert(await page.locator('#despesas-filter-panel').evaluate(el=>parseFloat(getComputedStyle(el).transitionDuration)<.001));
  await page.keyboard.press('Escape');
  assert.deepEqual(errors,[]);
  console.log('OK: mobile UX — login, first prices load, overflow, lazy loading, sheets 320/375/600, rotation, menu, event validation, dirty edit, date picker, reduced motion, tap during late repaint and rotation while the calendar loads.');
  await context.close();
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  if(browser)await browser.close();
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  db.close();process.chdir(previous);fs.rmSync(temp,{recursive:true,force:true});
});
