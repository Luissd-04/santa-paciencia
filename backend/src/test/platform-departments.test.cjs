const {test,before,after}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const previous=process.cwd(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'sp-departments-'));process.chdir(temp);
Object.assign(process.env,{DB_PATH:':memory:',NODE_ENV:'test',EMAIL_ENABLED:'false',PLATFORM_ADMIN_EMAILS:'admin@example.invalid,marketing@example.invalid'});
const app=require('../app'),{db}=require('../config/database'),auth=require('../services/authService'),orgs=require('../services/orgService'),ws=require('../services/platformWorkspace'),trials=require('../services/platformTrials');
const PASSWORD='SyntheticPlatform123!';
function person(email,role){const u=auth.createUser({name:role,email,password:PASSWORD});db.prepare('UPDATE users SET platform_admin=1,platform_role=? WHERE id=?').run(role,u.id);return {user:u,session:auth.createPlatformSession(u.id).sessionId};}
const admin=person('admin@example.invalid','admin'),marketing=person('marketing@example.invalid','marketing'),org=orgs.createOrganization('Cliente financeiro'),other=orgs.createOrganization('Outro cliente');
let server,base;
before(async()=>{server=app.listen(0,'127.0.0.1');await new Promise((resolve,reject)=>{server.on('listening',resolve);server.on('error',reject);});base=`http://127.0.0.1:${server.address().port}`;for(const who of [admin,marketing])await require('../services/platformAccess').unlock(who.session,who.user.id,PASSWORD);});
after(()=>{server.closeAllConnections();server.close();db.close();process.chdir(previous);fs.rmSync(temp,{recursive:true,force:true});});
const call=(who,method,url,body)=>fetch(base+url,{method,headers:{Cookie:`${auth.SESSION_COOKIE}=${who?.session||''}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
const api=(who,method,url,body)=>call(who,method,'/api/platform/workspace'+url,body);
let lead,campaign,content,subscription,entry,issue,release;
test('catálogo, acesso e limites de Marketing, incluindo contornos por URL e tarefas',async()=>{
 assert.equal((await api(null,'GET','/catalog')).status,401);
 const cat=(await(await api(marketing,'GET','/catalog')).json()).data;assert.ok(cat.definitions.campaign.writable);assert.equal(cat.definitions.entry,undefined);assert.equal(cat.definitions.maintenance.writable,false);
 for(const url of ['/records/entry','/records/subscription','/team','/settings','/export'])assert.equal((await api(marketing,'GET',url)).status,403,url);
 for(const url of ['/records/maintenance','/records/release'])assert.equal((await api(marketing,'POST',url,{title:'X'})).status,403,url);
 assert.equal((await api(admin,'POST','/records/__proto__',{title:'X'})).status,404);
 assert.equal((await api(admin,'GET','/records/lead?limit=1.5')).status,400);
 assert.equal((await api(admin,'GET','/records/lead?offset=Infinity')).status,400);
});
test('CRUD comercial, pesquisa literal, revisão concorrente e ligações entre clientes',async()=>{
 const r=await api(marketing,'POST','/records/lead',{title:'Contacto 100%',data:{email:'lead@example.invalid',next_date:'2026-11-12',next_action:'Telefonar'}});assert.equal(r.status,201);lead=(await r.json()).data;
 let response=await api(marketing,'PUT','/records/lead/'+lead.id,{title:'Contacto atualizado',revision:lead.revision,data:lead.data});assert.equal(response.status,200);lead=(await response.json()).data;
 assert.equal((await api(admin,'PUT','/records/lead/'+lead.id,{title:'Perder atualização',revision:1,data:lead.data})).status,409);
 assert.equal((await(await api(admin,'GET','/records/lead?q=%25')).json()).data.total,0);
 assert.equal((await api(admin,'POST','/records/lead',{title:'X',data:{email:'invalido'}})).status,400);
 assert.equal((await api(admin,'POST','/records/lead',{title:'X',data:{unexpected:'foo'}})).status,400);
 const proposal=ws.save(admin.user,'proposal',null,{title:'Oferta',related_id:lead.id,data:{amount_cents:5000}});assert.equal(proposal.related.id,lead.id);
 assert.equal((await api(admin,'DELETE','/records/lead/'+lead.id)).status,409);
});
test('marketing: duas marcas, calendário, materiais e clientes coerentes',async()=>{
 campaign=ws.save(marketing.user,'campaign',null,{title:'Campanha do cliente',organization_id:org.id,data:{brand:'client',start_date:'2026-11-11',end_date:'2026-12-11'}});
 content=ws.save(marketing.user,'content',null,{title:'Publicação',related_id:campaign.id,data:{brand:'client',publish_date:'2026-11-12',copy:'Texto <script>sem execução</script>'}});assert.equal(content.organization.id,org.id);
 assert.throws(()=>ws.save(admin.user,'content',null,{title:'Errado',related_id:campaign.id,organization_id:other.id,data:{brand:'client'}}),/outro cliente/);
 assert.throws(()=>ws.save(admin.user,'campaign',null,{title:'Errado',data:{start_date:'2026-02-31'}}),/Data inválida/);
 assert.throws(()=>ws.save(admin.user,'campaign',null,{title:'Errado',data:{brand:'client'}}),/Escolha o cliente/);
 assert.throws(()=>ws.save(admin.user,'material',null,{title:'Errado',data:{url:'javascript:alert(1)'}}),/HTTP|Ligação/);
 assert.equal(ws.list(marketing.user,'content',{brand:'client'}).total,1);
 assert.equal(ws.list(marketing.user,'content',{month:'2026-11'}).total,1);
 assert.equal(ws.list(marketing.user,'content',{month:'2026-12'}).total,0);
});
test('finanças: cêntimos exatos, subscrição única, pagamentos e despesas sem acesso de Marketing',async()=>{
 subscription=ws.save(admin.user,'subscription',null,{title:'Subscrição cliente',status:'active',organization_id:org.id,data:{amount_cents:12000,billing:'yearly'}});
 assert.throws(()=>ws.save(admin.user,'subscription',null,{title:'Duplicada',status:'active',organization_id:org.id,data:{amount_cents:2000}}),/já tem/);
 assert.throws(()=>ws.save(admin.user,'entry',null,{title:'Valor inválido',data:{direction:'income',date:'2026-11-11',amount_cents:1.2}}),/cêntimos/);
 assert.throws(()=>ws.save(admin.user,'entry',null,{title:'Sem liquidação',status:'paid',data:{direction:'income',date:'2026-11-11',amount_cents:1000}}),/liquidação/);
 entry=ws.save(admin.user,'entry',null,{title:'Pagamento recebido',status:'paid',related_id:subscription.id,data:{direction:'income',date:'2026-11-11',paid_date:'2026-11-11',amount_cents:12000}});
 ws.save(admin.user,'entry',null,{title:'Servidor',status:'paid',data:{direction:'expense',date:'2026-11-11',paid_date:'2026-11-11',amount_cents:1500}});
 ws.save(admin.user,'entry',null,{title:'Por receber',status:'pending',organization_id:org.id,data:{direction:'income',date:'2026-11-11',due_date:'2000-01-01',amount_cents:2000}});
 const sums=ws.summary(admin.user).finance;assert.equal(sums.balance_cents,10500);assert.equal(sums.mrr_cents,1000);assert.equal(sums.overdue_cents,2000);
 assert.equal(ws.summary(admin.user,{from:'2026-12-01',to:'2026-12-31'}).finance.income_cents,0);
 assert.equal(ws.list(admin.user,'entry',{from:'2026-12-01'}).total,0);
 assert.equal(ws.summary(marketing.user).finance,null);assert.ok(!JSON.stringify(ws.clientHub(marketing.user,org.id)).includes('Pagamento recebido'));
 assert.equal((await api(admin,'DELETE','/records/entry/'+entry.id)).status,400);
 const financeTask=require('../services/platformTasks').create(admin.user,{title:'Cobrar',department:'finance',record_id:entry.id});
 assert.equal((await call(marketing,'GET','/api/platform/tasks/'+financeTask.id)).status,403);
 assert.ok(!require('../services/platformTasks').list(marketing.user).tasks.some(t=>t.id===financeTask.id));
});
test('produto, suporte e tarefas partilham ligações e comentários',async()=>{
 const ticket='support-related';db.prepare("INSERT INTO support_tickets(id,number,organization_id,type,subject) VALUES(?,111,?,'problem','Problema')").run(ticket,org.id);
 release=ws.save(admin.user,'release',null,{title:'Versão de novembro',data:{version:'1.2.0'}});
 issue=ws.save(marketing.user,'issue',null,{title:'Bug reportado',related_id:release.id,ticket_id:ticket,data:{type:'bug',steps:'Abrir calendário'}});assert.equal(issue.organization.id,org.id);
 const task=require('../services/platformTasks').create(marketing.user,{title:'Investigar bug',department:'product',record_id:issue.id});assert.equal(task.organization.id,org.id);
 assert.equal(ws.get(admin.user,'issue',issue.id).tasks[0].id,task.id);
 assert.equal(ws.comment(marketing.user,'issue',issue.id,{body:'Acontece no telemóvel'}).comments.length,1);
 assert.throws(()=>require('../services/platformTasks').create(admin.user,{title:'Errado',record_id:issue.id,organization_id:other.id}),/outro cliente/);
 assert.throws(()=>ws.save(admin.user,'issue',null,{title:'Errado',organization_id:other.id,ticket_id:ticket}),/outro cliente/);
});
test('papéis, configurações e exportação persistem com auditoria',async()=>{
 assert.equal((await api(admin,'PUT','/team/'+admin.user.id,{role:'marketing'})).status,400);
 assert.equal((await api(marketing,'PUT','/team/'+admin.user.id,{role:'marketing'})).status,403);
 const r=await api(admin,'PUT','/settings',{company_name:'A nossa plataforma',contact_email:'empresa@example.invalid',notes:'Notas internas'});assert.equal(r.status,200);assert.equal(ws.settings(admin.user).company_name,'A nossa plataforma');
 const exp=await api(admin,'GET','/export');assert.equal(exp.status,200);const data=await exp.json();assert.equal(data.format,'santa-paciencia-internal-v1');assert.ok(data.records.some(r=>r.id===lead.id));assert.doesNotMatch(JSON.stringify(data),/password_hash|sessionId|invitation_url/);
 assert.ok(db.prepare("SELECT 1 FROM platform_audit_events WHERE action='workspace.export'").get());
});
let demo,privateTest,demoWho;
test('criar demonstrações isoladas e teste privado vazio; convites guardam hash',async()=>{
 const r=await api(marketing,'POST','/trials',{name:'Demonstração A',owner_email:'a@example.invalid',mode:'demo',days:14,lead_id:lead.id});assert.equal(r.status,201);demo=(await r.json()).data;
 const second=trials.create(admin.user,{name:'Demonstração B',owner_email:'b@example.invalid',mode:'demo',days:7});
 privateTest=trials.create(admin.user,{name:'Teste próprio',owner_email:'private@example.invalid',mode:'private',days:30,lead_id:lead.id});
 assert.equal(db.prepare('SELECT COUNT(*) n FROM reservations WHERE organization_id=?').get(demo.id).n,3);assert.equal(db.prepare('SELECT COUNT(*) n FROM reservations WHERE organization_id=?').get(second.id).n,3);assert.equal(db.prepare('SELECT COUNT(*) n FROM reservations WHERE organization_id=?').get(privateTest.id).n,0);
 assert.equal(trials.access(demo.id).started_at,null);assert.equal(db.prepare('SELECT COUNT(*) n FROM memberships WHERE organization_id=?').get(demo.id).n,0);
 const token=new URL(demo.invitation_url).searchParams.get('invite');assert.notEqual(db.prepare('SELECT token FROM invitations WHERE organization_id=?').get(demo.id).token,token);
 const accepted=await call(null,'POST','/auth/invitations/accept',{token,name:'Interessado A',password:PASSWORD,confirm_password:PASSWORD});assert.equal(accepted.status,201);demoWho={session:decodeURIComponent(accepted.headers.get('set-cookie').split(';')[0].split('=')[1])};
 assert.ok(trials.access(demo.id).started_at);assert.ok(Date.parse(trials.access(demo.id).expires_at)>Date.now()+13*86400000);
});
test('demonstrações bloqueiam integrações, páginas públicas e dados de outros clientes',async()=>{
 assert.equal((await call(demoWho,'GET','/auth/google-email')).status,403);
 assert.equal((await call(demoWho,'POST','/api/expenses/scan-receipt',{})).status,403);
 assert.equal((await call(demoWho,'POST','/api/push/subscribe',{})).status,403);
 assert.equal((await call(demoWho,'GET','/api/platform/workspace/trials')).status,404);
 const accommodations=(await(await call(demoWho,'GET','/api/accommodations')).json()).data;assert.ok(accommodations.length);assert.ok(accommodations.every(a=>a.organization_id===demo.id));
 db.prepare("UPDATE accommodations SET public_slug='demo-public' WHERE organization_id=?").run(demo.id);assert.equal((await call(null,'GET','/api/public/booking/demo-public')).status,404);
 // A05: as rotas públicas aceitam maiúsculas; a regra também (router.param).
 for(const url of ['/api/public/Booking/demo-public','/api/public/BOOKING/demo-public/availability'])assert.equal((await call(null,'GET',url)).status,404,url);
 // Tokens de reserva em qualquer das formas aceites pelos controladores, incluindo o public_token antigo no pré-check-in.
 const reservation=db.prepare('SELECT id FROM reservations WHERE organization_id=? LIMIT 1').get(demo.id).id,legacy='a'.repeat(64);
 db.prepare('UPDATE reservations SET public_token=?,precheckin_token=NULL WHERE id=?').run(legacy,reservation);
 for(const url of ['/api/public/pre-checkin/'+legacy,'/api/public/Pre-Checkin/'+legacy,'/api/public/reservation/'+legacy,'/api/public/Reservation/'+legacy])assert.equal((await call(null,'GET',url)).status,404,url);
 assert.equal((await call(null,'POST','/api/public/PRE-CHECKIN/'+legacy,{})).status,404);
 assert.equal(require('../services/stripeClient').stripeEnabled(demo.id),false);
 assert.equal(await require('../services/emailService').sendMail(demo.id,{to:'x@example.invalid',subject:'Teste',html:'X'}),null);
});
test('expiração bloqueia sessões abertas; prolongar repõe acesso; conversão privada mantém dados',async()=>{
 db.prepare("UPDATE platform_trial_access SET expires_at='2000-01-01T00:00:00Z' WHERE organization_id=?").run(demo.id);assert.equal((await call(demoWho,'GET','/api/accommodations')).status,403);
 assert.equal((await api(marketing,'PUT','/trials/'+demo.id,{action:'extend',days:7})).status,200);assert.equal((await call(demoWho,'GET','/api/accommodations')).status,200);
 assert.equal((await api(admin,'PUT','/trials/'+demo.id,{action:'convert'})).status,400);
 trials.change(admin.user,privateTest.id,{action:'close'});assert.equal(trials.blocked(privateTest.id),true);
 assert.equal((await api(marketing,'PUT','/trials/'+privateTest.id,{action:'convert'})).status,403);
 const before=db.prepare('SELECT name FROM organizations WHERE id=?').get(privateTest.id).name;
 assert.equal((await api(admin,'PUT','/trials/'+privateTest.id,{action:'convert'})).status,200);assert.equal(trials.access(privateTest.id).status,'converted');assert.equal(db.prepare('SELECT name FROM organizations WHERE id=?').get(privateTest.id).name,before);assert.equal(db.prepare('SELECT status FROM organizations WHERE id=?').get(privateTest.id).status,'active');
});
test('seguimento é idempotente e o login ignora um teste expirado quando há outro espaço ativo',async()=>{
 db.prepare('UPDATE platform_trial_access SET expires_at=? WHERE organization_id=?').run(new Date(Date.now()+2*86400000).toISOString(),demo.id);
 assert.equal(trials.followups().created,1);assert.equal(trials.followups().created,0);
 assert.ok(db.prepare('SELECT followup_task_id FROM platform_trial_access WHERE organization_id=?').get(demo.id).followup_task_id);
 db.prepare("UPDATE platform_trial_access SET expires_at='2000-01-01T00:00:00Z' WHERE organization_id=?").run(demo.id);
 const owner=auth.getUserByEmail('a@example.invalid');orgs.createMembership({organizationId:org.id,userId:owner.id,role:'owner'});
 const login=await call(null,'POST','/auth/login',{email:'a@example.invalid',password:PASSWORD});assert.equal(login.status,200);assert.equal((await login.json()).data.user.organization_id,org.id);
});
test('migrações repetidas preservam dados e não voltam a semear demonstrações',()=>{require('../config/database').initDatabase();assert.equal(db.prepare('SELECT COUNT(*) n FROM reservations WHERE organization_id=?').get(demo.id).n,3);assert.equal(ws.get(admin.user,'lead',lead.id).title,'Contacto atualizado');});
