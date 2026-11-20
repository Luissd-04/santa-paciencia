// Chromium/WebKit, base descartável e dados inventados; sem serviços externos.
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { chromium, webkit, expect } = require('@playwright/test');
const previous = process.cwd(), temp = fs.mkdtempSync(path.join(os.tmpdir(),'sp-console-ui-'));
process.chdir(temp);
Object.assign(process.env,{DB_PATH:':memory:',NODE_ENV:'test',EMAIL_ENABLED:'false',PLATFORM_ADMIN_EMAILS:'ui@example.invalid',FRONTEND_PATH:path.resolve(__dirname,'../../../frontend')});
const app=require('../app'),{db}=require('../config/database'),auth=require('../services/authService'),orgs=require('../services/orgService');
const PASSWORD='SyntheticConsola123!',user=auth.createUser({name:'Teste',email:'ui@example.invalid',password:PASSWORD});
db.prepare('UPDATE users SET platform_admin=1 WHERE id=?').run(user.id);
const org=orgs.createOrganization('Cliente sintético');orgs.createMembership({organizationId:org.id,userId:user.id,role:'owner'});
let server,browser;
async function main(){
 server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.on('listening',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 browser=await (process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch({headless:true});
 const context=await browser.newContext();const page=await context.newPage();
 await page.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
 // Uma preferência Vidro guardada nunca muda o primeiro desenho do login.
 await page.addInitScript(()=>localStorage.setItem('sp-appearance',JSON.stringify({look:'vidro',mode:'escuro'})));
 await page.goto(base);await expect(page.locator('#login-email')).toBeVisible();
 assert.equal(await page.locator('html').getAttribute('data-look'),'classico');assert.equal(await page.locator('html').getAttribute('data-mode'),null);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('sp-appearance')).look),'vidro');
 const session=auth.createSession(user.id,org.id).sessionId;await require('../services/platformAccess').unlock(session,user.id,PASSWORD);
 await context.addCookies([{name:auth.SESSION_COOKIE,value:session,url:base}]);
 const issues=[];page.on('pageerror',error=>issues.push(error.message));
 await page.goto(base+'/plataforma/clientes');await page.getByRole('button',{name:'Novo estabelecimento',exact:true}).click();
 await page.locator('#pl-cli-nome').fill('Novo cliente UI');await page.locator('#pl-cli-email').fill('novo-ui@example.invalid');await page.getByRole('button',{name:'Criar e gerar convite'}).click();
 await expect(page.locator('#pl-cli-convite')).toBeVisible();assert.match(await page.locator('#pl-cli-convite').inputValue(),/invite=/);
 await expect(page.locator('#pl-lista')).toContainText('Novo cliente UI');
 const ticket=await require('../services/supportService').create({...user,organization_id:org.id,role:'owner'},{type:'question',subject:'Pedido sintético',body:'Como funciona?'});
 await page.goto(base+'/plataforma/suporte/'+ticket.id);await page.locator('summary').filter({hasText:'Respostas guardadas'}).click();
 await page.locator('#pl-saved-title').fill('Resposta UI');await page.locator('#pl-resp').fill('Obrigado pelo contacto.');await page.getByRole('button',{name:'Guardar resposta',exact:true}).click();await expect(page.locator('#pl-saved-reply option')).toHaveCount(2);
 await page.locator('summary').filter({hasText:'Respostas guardadas'}).click();await page.locator('#pl-resp').fill('');const reply=db.prepare('SELECT id FROM support_saved_replies').get();await page.locator('#pl-saved-reply').selectOption('');await page.locator('#pl-saved-reply').selectOption(reply.id);await expect(page.locator('#pl-resp')).toHaveValue('Obrigado pelo contacto.');
 await page.locator('#pl-resp').fill('Texto revisto.');await page.getByRole('button',{name:'Guardar resposta',exact:true}).click();await expect(page.locator('#toast-container')).toContainText('Resposta guardada.');
 for(const width of [1280,360]) for(const pref of [{look:'classico',mode:'auto'},{look:'vidro',mode:'claro'},{look:'vidro',mode:'escuro'}]){
   await page.setViewportSize({width,height:900});
   for(const route of ['clientes','utilizacao','suporte','suporte/'+ticket.id]){
     await page.goto(base+'/plataforma/'+route);await expect(page.locator('#pl-content')).not.toContainText('A carregar…');
     await page.evaluate(pref=>AppAppearance.apply(pref),pref);
     if (!(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))) { console.log(await page.evaluate(()=>[...document.querySelectorAll('body *')].map(e=>({tag:e.tagName,cls:e.className,w:e.getBoundingClientRect().width,x:e.getBoundingClientRect().x})).filter(e=>e.x+e.w>innerWidth+1).slice(0,18))); await page.screenshot({path:'/tmp/sp-console-overflow.png',fullPage:true}); }
     if (process.env.CONSOLE_ARTIFACTS_DIR && pref.look==='classico') { fs.mkdirSync(process.env.CONSOLE_ARTIFACTS_DIR,{recursive:true}); await page.screenshot({path:path.join(process.env.CONSOLE_ARTIFACTS_DIR,`consola-${width}-${route.replaceAll('/','-')}.png`)}); }
     assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`overflow ${width} ${pref.look} ${route}`);
   }
 }
 await page.goto(base+'/plataforma/suporte');await page.locator('#pl-retencao').fill('180');await page.getByRole('button',{name:'Guardar prazo'}).click();await expect(page.locator('#pl-retencao-estado')).toContainText('Prazo guardado');assert.equal(require('../services/platformSupportTools').retentionDays(),180);
 db.prepare("UPDATE users SET platform_role='marketing' WHERE id=?").run(user.id);
 await page.goto(base+'/plataforma/clientes');await expect(page.locator('#pl-lista')).toBeVisible();await expect(page.getByRole('button',{name:'Novo estabelecimento',exact:true})).toHaveCount(0);
 await page.goto(base+'/plataforma/clientes/'+org.id);await expect(page.locator('#pl-content')).toContainText('Alterações reservadas à Administração.');
 const regular=auth.createUser({name:'Conta normal',email:'normal@example.invalid',password:PASSWORD});orgs.createMembership({organizationId:org.id,userId:regular.id,role:'owner'});require('../services/appearancePrefs').save(regular.id,{look:'vidro',mode:'escuro'});
 await context.addCookies([{name:auth.SESSION_COOKIE,value:auth.createSession(regular.id,org.id).sessionId,url:base}]);
 await page.goto(base+'/dashboard');await expect(page.locator('body')).toHaveClass(/auth-ready/);await expect(page.locator('html')).toHaveAttribute('data-look','vidro');
 await page.evaluate(()=>AppModules.core.logout());await expect(page.locator('#login-email')).toBeVisible();await expect(page.locator('html')).toHaveAttribute('data-look','classico');assert.equal(require('../services/appearancePrefs').get(regular.id).look,'vidro');
 assert.deepEqual(issues,[]);console.log('OK: login clássico e fim de sessão, preferências preservadas, criação e convite, respostas, conservação, Marketing e 24 combinações de páginas/aspetos/larguras.');
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();await new Promise(resolve=>server?server.close(resolve):resolve());db.close();process.chdir(previous);fs.rmSync(temp,{recursive:true,force:true});});
