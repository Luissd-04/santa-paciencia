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
  db.prepare('INSERT INTO accommodations(id,organization_id,name,type,price_per_night,max_guests) VALUES(?,?,?,?,?,?)').run('unit2', org.id, 'Quarto Extra UX', 'alojamento', 80, 2);
  db.prepare('INSERT INTO guests(id,organization_id,name,email) VALUES(?,?,?,?)').run('guest',org.id,'Hóspede UX','guest@example.invalid');
  db.prepare(`INSERT INTO reservations(id,organization_id,guest_id,accommodation_id,check_in,check_out,nights,num_guests,num_adults,total_amount,status)
    VALUES('res',?,'guest','unit','2030-07-06','2030-07-08',2,1,1,200,'confirmada')`).run(org.id);
  // Nomes compridos: fazem crescer as listas que não estejam presas à largura do ecrã.
  db.prepare('INSERT INTO accommodations(id,organization_id,name,type,price_per_night,max_guests) VALUES(?,?,?,?,?,?)').run('unit-long', org.id, 'Suite Familiar com Varanda e Vista sobre a Praça Velha', 'alojamento', 160, 4);
  db.prepare('INSERT INTO guests(id,organization_id,name,email) VALUES(?,?,?,?)').run('guest-long',org.id,'María Ángeles de Oliveira Gonçalves-Schäfer Vasconcelos','long@example.invalid');
  db.prepare(`INSERT INTO reservations(id,organization_id,guest_id,accommodation_id,check_in,check_out,nights,num_guests,num_adults,total_amount,status)
    VALUES('res-long',?,'guest-long','unit-long','2031-03-02','2031-03-16',14,2,2,2240,'pendente')`).run(org.id);
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
  // No telemóvel as notas estão no passo «Preço»; na edição salta-se diretamente.
  await page.getByRole('button',{name:'Preço',exact:true}).click();
  await page.locator('#f-notas').fill('Alteração por guardar');
  await page.keyboard.press('Escape');
  await expect.poll(()=>confirmations).toBe(1);
  await expect(page.locator('#modal-bg')).toHaveClass(/open/);
  await expect(page.locator('#f-notas')).toHaveValue('Alteração por guardar');
  page.off('dialog',dismiss);
  // Fine pointer date picker stays in the viewport; Escape closes only the picker.
  await page.getByRole('button',{name:'Estadia',exact:true}).click();
  await page.locator('#f-checkin').click();
  await expect(page.locator('.date-pop')).toBeVisible();
  assert(await page.locator('.date-pop').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth;}));
  await page.keyboard.press('Escape');
  await expect(page.locator('.date-pop')).toHaveCount(0);
  await expect(page.locator('#modal-bg')).toHaveClass(/open/);
  page.once('dialog',dialog=>dialog.accept());
  await page.keyboard.press('Escape');
  await expect(page.locator('#modal-bg')).not.toHaveClass(/open/);
  // Nova reserva em três passos: cada passo só com a sua parte; avança só com
  // o anterior completo; documentos e acompanhantes recolhidos.
  await page.evaluate(()=>AppModules.reservas.openModal());
  const wizard=page.locator('#modal-bg');
  await expect(wizard).toHaveAttribute('data-mstep','1');
  await expect(page.locator('#f-nome-completo')).toBeHidden();
  await expect(page.locator('#btn-guardar')).toBeHidden();
  await page.locator('#resf-mstep-next').click();
  await expect(wizard).toHaveAttribute('data-mstep','1');
  await page.evaluate(()=>{for(const [id,value] of [['f-checkin','2035-07-03'],['f-checkout','2035-07-06']]){const input=document.getElementById(id);input.value=value;input.dispatchEvent(new Event('change',{bubbles:true}));}});
  // Datas num cartão, pequeno-almoço em interruptor, canal em botões e alojamentos em lista.
  await expect(page.locator('#resf-checkin-display')).toHaveText('ter, 3 jul 2035');
  await expect(page.locator('#resf-dates-nights')).toHaveText('3 noites');
  await page.getByRole('switch',{name:'Pequeno-almoço incluído'}).click();
  await expect(page.locator('#f-breakfast')).toHaveValue('true');
  await page.getByRole('button',{name:'Booking.com',exact:true}).click();
  await expect(page.locator('#f-canal')).toHaveValue('booking');
  await expect(page.locator('#f-canal')).toBeHidden();
  await page.getByRole('button',{name:'Mais…',exact:true}).click();
  await expect(page.locator('#f-canal')).toBeVisible();
  await page.locator('#f-canal').selectOption('whatsapp');
  await expect(page.getByRole('button',{name:'Mais…',exact:true})).toHaveAttribute('aria-pressed','true');
  assert.equal(await page.locator('#suite-cards-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),1);
  await page.locator('.suite-card-opt',{hasText:'Unidade UX'}).click();
  // Vários quartos na própria lista: o segundo tocado entra como quarto extra,
  // com o preço por noite no cartão; tocar no preço não o desmarca.
  const extraCard=page.locator('.suite-card-opt',{hasText:'Quarto Extra UX'});
  await extraCard.click();
  await expect(extraCard).toHaveClass(/selected/);
  await expect(page.locator('.suite-card-opt.selected')).toHaveCount(2);
  await expect(page.locator('.suite-card-opt',{hasText:'Unidade UX'}).locator('.suite-card-role')).toHaveText('Principal');
  const extraPrice=extraCard.getByRole('spinbutton',{name:'Preço por noite de Quarto Extra UX'});
  await expect(extraPrice).toHaveValue('80.00');
  await extraPrice.fill('90');
  await expect(extraCard).toHaveClass(/selected/);
  await expect(extraPrice).toBeFocused();
  await extraCard.locator('.suite-card-name').click();
  await expect(page.locator('.suite-card-opt.selected')).toHaveCount(1);
  await extraCard.locator('.suite-card-name').click();
  await extraCard.getByRole('spinbutton').fill('90');
  await expect(page.locator('#wiz-extra-rooms-toggle-wrap')).toHaveCount(0);
  await page.getByRole('button',{name:'Mais uma criança'}).click();
  await expect(page.locator('#f-num-criancas')).toHaveValue('1');
  await page.getByRole('button',{name:'Menos uma criança'}).click();
  await expect(page.getByRole('button',{name:'Menos uma criança'})).toBeDisabled();
  await page.locator('#resf-mstep-next').click();
  await expect(wizard).toHaveAttribute('data-mstep','2');
  await expect(page.locator('#f-doc-num')).toBeHidden();
  await page.locator('#resf-docs-toggle').click();
  await expect(page.locator('#f-doc-num')).toBeVisible();
  await expect(page.locator('#resf-extras-toggle')).toContainText('Acompanhante (1)');
  await page.locator('#resf-mstep-next').click();
  await expect(wizard).toHaveAttribute('data-mstep','2');
  await page.locator('#f-nome-completo').fill('Hóspede Passos');
  await page.locator('#resf-mstep-next').click();
  await expect(wizard).toHaveAttribute('data-mstep','3');
  await expect(page.locator('#resf-msummary')).toContainText('Hóspede Passos');
  await expect(page.locator('#resf-msummary')).toContainText('Unidade UX + Quarto Extra UX');
  await expect(page.locator('#resf-nightly-grid')).toBeHidden();
  // Estado de uma reserva nova: as opções vêm da cotação; o sinal decide.
  await expect.poll(()=>page.locator('#f-estado option').evaluateAll(options=>options.map(option=>option.value))).toEqual(['aguardar_pagamento','pre_reserva','pendente']);
  await page.locator('#btn-guardar').click();
  await expect(wizard).not.toHaveClass(/open/);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM reservations r JOIN guests g ON g.id=r.guest_id WHERE g.name='Hóspede Passos'").get().n,1);
  assert.equal(db.prepare("SELECT r.status FROM reservations r JOIN guests g ON g.id=r.guest_id WHERE g.name='Hóspede Passos'").get().status,'aguardar_pagamento');
  const rooms=JSON.parse(db.prepare("SELECT r.accommodations_data FROM reservations r JOIN guests g ON g.id=r.guest_id WHERE g.name='Hóspede Passos'").get().accommodations_data);
  assert.deepEqual(rooms.map(room=>[room.accommodation_id,room.subtotal]),[['unit',300],['unit2',270]]);
  // Na edição, Guardar está em todos os passos; fechar sem alterações não pergunta nada,
  // mesmo depois de chegar a cotação do servidor.
  await page.evaluate(()=>AppModules.reservas.openEditModal('res'));
  await expect(page.locator('#btn-guardar')).toBeVisible();
  await expect(page.locator('#resf-mstep-next')).toBeHidden();
  await expect(page.locator('#f-total-manual')).not.toHaveValue('');
  await page.keyboard.press('Escape');
  await expect(wizard).not.toHaveClass(/open/);
  // Ficha: o seletor só mostra os passos possíveis (servidor); check-in sem
  // pré-check-in é recusado com a explicação e a reserva fica como estava.
  await page.evaluate(()=>AppModules.reservas.showDetail('res'));
  const statusSelect=page.locator('#rdv2-status-select');
  await expect(statusSelect).toHaveValue('confirmada');
  assert.deepEqual(await statusSelect.locator('option').evaluateAll(options=>options.map(option=>option.value)),['confirmada','check_in','cancelada']);
  await expect(page.locator('.rdv2-status-row',{hasText:'Pré-check-in'})).toContainText('Não enviado');
  await statusSelect.selectOption('check_in');
  await expect(page.locator('.toast',{hasText:'o pré-check-in ainda não foi preenchido'})).toBeVisible();
  await expect(statusSelect).toHaveValue('confirmada');
  assert.equal(db.prepare("SELECT status FROM reservations WHERE id='res'").get().status,'confirmada');
  // Nenhuma vista mais larga do que o ecrã. .main não faz scroll lateral, por
  // isso o que passasse ficava cortado sem se notar (dashboard a 420 px num
  // ecrã de 390; tabela do estado do sistema nas definições).
  // Ecrã tátil, como no iPhone: as regras para dedo (pointer: coarse) também contam.
  const touch=await browser.newContext({viewport:{width:390,height:812},isMobile:true,hasTouch:true,serviceWorkers:'block'});
  await touch.route('https://**/*', route => route.abort());
  await touch.addCookies([{name:auth.SESSION_COOKIE,value:session,url:base}]);
  const tpage=await touch.newPage();tpage.on('pageerror',e=>errors.push(e.message));
  await tpage.goto(base);
  await expect(tpage.locator('body')).toHaveClass(/auth-ready/);
  const views=['dashboard','reservas','calendario','eventos','hospedes','alojamentos','despesas','relatorios','vouchers','precos','invoice','notificacoes','definicoes'];
  for (const width of [320,390]) {
    await tpage.setViewportSize({width,height:812});
    for (const view of views) {
      await tpage.evaluate(v=>AppModules.core.showView(v),view);
      if (view==='definicoes') await tpage.evaluate(()=>AppModules.core.switchSettingsTab('database'));
      await expect(tpage.locator(`#view-${view} .view-loading`)).toHaveCount(0);
      await tpage.waitForTimeout(400); // listas que chegam da API depois da vista
      // Elementos visíveis que passam da margem direita, fora de uma faixa com
      // scroll lateral própria (separadores, tabelas): esses ficam cortados.
      const culprits=await tpage.locator('.main').evaluate(main=>{
        const right=main.getBoundingClientRect().right;
        const scrolls=el=>{for(let p=el.parentElement;p&&p!==main;p=p.parentElement){const o=getComputedStyle(p).overflowX;if(o==='auto'||o==='scroll')return true;}return false;};
        const out=[...main.querySelectorAll('.view.active *')].filter(el=>{
          const r=el.getBoundingClientRect(),cs=getComputedStyle(el);
          return r.width>0&&r.height>0&&r.right>right+1&&cs.visibility!=='hidden'&&cs.position!=='fixed'&&!scrolls(el);
        });
        return out.filter(el=>!out.includes(el.parentElement)).slice(0,3).map(el=>`${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`);
      });
      assert.deepEqual(culprits,[],`${view} a ${width}px: conteúdo fora do ecrã`);
    }
  }
  await touch.close();
  // Backoffice sem zoom.
  assert.match(await page.locator('meta[name="viewport"]').getAttribute('content'),/maximum-scale=1/);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.locator('#bn-despesas').click();
  await page.getByRole('button',{name:'Filtros',exact:true}).click();
  assert(await page.locator('#despesas-filter-panel').evaluate(el=>parseFloat(getComputedStyle(el).transitionDuration)<.001));
  await page.keyboard.press('Escape');
  assert.deepEqual(errors,[]);
  console.log('OK: mobile UX — login, first prices load, overflow, lazy loading, sheets 320/375/600, rotation, menu, event validation, dirty edit, date picker, reduced motion, tap during late repaint, rotation while the calendar loads, new reservation in three steps, status steps from the server, no view wider than the screen and no zoom.');
  await context.close();
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  if(browser)await browser.close();
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  db.close();process.chdir(previous);fs.rmSync(temp,{recursive:true,force:true});
});
