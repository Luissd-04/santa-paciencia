const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const previous=process.cwd(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'sp-staging-'));
process.chdir(temp);
Object.assign(process.env,{NODE_ENV:'test',APP_ENV:'staging',DB_PATH:':memory:',EMAIL_ENABLED:'false',PUBLIC_APP_URL:'https://testes.example.invalid',PLATFORM_ADMIN_EMAILS:'admin@testes.invalid'});
for(const key of ['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','STRIPE_ORGANIZATION_ID','ANTHROPIC_API_KEY','TOKEN_ENCRYPTION_KEY','TOKEN_ENCRYPTION_KEY_FILE','VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY'])delete process.env[key];
const policy=require('../services/stagingPolicy');
const app=require('../app'),{db}=require('../config/database'),auth=require('../services/authService'),orgs=require('../services/orgService');
const user=auth.createUser({name:'Testes',email:'admin@testes.invalid',password:'SyntheticStaging123!'}),org=orgs.createOrganization('Só testes');
orgs.createMembership({organizationId:org.id,userId:user.id,role:'owner'});
const session=auth.createSession(user.id,org.id).sessionId;
let server,base;
before(async()=>{server=app.listen(0,'127.0.0.1');await new Promise((resolve,reject)=>{server.on('listening',resolve);server.on('error',reject);});base=`http://127.0.0.1:${server.address().port}`;});
after(()=>{server.closeAllConnections();server.close();db.close();process.chdir(previous);fs.rmSync(temp,{recursive:true,force:true});});
test('staging recusa email ativo, credenciais externas e base de produção',()=>{
 assert.doesNotThrow(()=>policy.assertStagingEnvironment());
 process.env.EMAIL_ENABLED='true';assert.throws(()=>policy.assertStagingEnvironment(),/EMAIL_ENABLED/);process.env.EMAIL_ENABLED='false';
 for(const key of ['GOOGLE_CLIENT_SECRET','STRIPE_SECRET_KEY','ANTHROPIC_API_KEY','TOKEN_ENCRYPTION_KEY']){process.env[key]='synthetic-not-a-real-secret';assert.throws(()=>policy.assertStagingEnvironment(),/credenciais/);delete process.env[key];}
 process.env.NODE_ENV='production';assert.throws(()=>policy.assertStagingEnvironment(),/base dedicada/);process.env.NODE_ENV='test';
});
test('testes bloqueia integrações e importação antes de processar os dados',async()=>{
 for(const url of ['/auth/google-email','/auth/google','/auth/google-tasks']){const r=await fetch(base+url,{headers:{Cookie:`${auth.SESSION_COOKIE}=${session}`}});assert.equal(r.status,403,url);}
 for(const url of ['/api/backup/import','/api/expenses/scan-receipt','/api/push/subscribe']){const r=await fetch(base+url,{method:'POST',headers:{Cookie:`${auth.SESSION_COOKIE}=${session}`,'Content-Type':'application/json'},body:'{}'});assert.equal(r.status,403,url);}
 const health=await fetch(base+'/health');assert.equal(health.status,200);assert.equal(health.headers.get('x-app-environment'),'staging');assert.match(health.headers.get('x-robots-tag'),/noindex/);
});
test('transportes permanecem desligados mesmo com linhas de ligação na base',async()=>{
 db.prepare('INSERT INTO google_email_connections(organization_id,email,tokens) VALUES(?,?,?)').run(org.id,'synthetic@example.invalid','opaque-not-decrypted');
 assert.equal(require('../config/googleEmail').isEmailAuthenticated(org.id),false);
 assert.equal(require('../config/googleTasks').isTasksAuthenticated(org.id),false);
 assert.equal(require('../config/google').isAuthenticated(user.id,org.id),false);
 assert.equal(await require('../services/emailService').sendMail(org.id,{to:'synthetic@example.invalid',subject:'Teste',html:'Teste'}),null);
 await assert.rejects(()=>require('../config/googleEmail').sendViaGmail(org.id,{to:'synthetic@example.invalid',subject:'Teste',html:'Teste'}),/desligados/);
 assert.equal(require('../services/stripeClient').stripeEnabled(org.id),false);
 assert.equal(await require('../services/pushService').sendToOrganization(org.id,{title:'Teste'}),undefined);
});
test('bootstrap de administração recusa execução fora do contentor dedicado',()=>{
 const result=require('node:child_process').spawnSync(process.execPath,[path.resolve(__dirname,'../scripts/staging-admin.cjs')],{env:{...process.env,APP_ENV:'production'},encoding:'utf8'});assert.equal(result.status,1);assert.match(result.stderr,/só funciona/);
});
