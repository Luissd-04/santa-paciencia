// Functional review: disposable SQLite, local HTTP, no .env or real integrations.
// Records passing controls and confirmed defects separately; not an acceptance suite.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.resolve(__dirname, '../../backend/src');
const previous = process.cwd(), temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-functional-'));
process.chdir(temp);
Object.assign(process.env, {DB_PATH:':memory:',NODE_ENV:'test',EMAIL_ENABLED:'false',PUBLIC_APP_URL:'http://localhost:3001'});
for(const k of ['STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','TOKEN_ENCRYPTION_KEY'])delete process.env[k];
const originalFetch=global.fetch;
global.fetch=(url,options)=>{if(!String(url).startsWith('http://127.0.0.1:'))throw new Error('External request blocked');return originalFetch(url,options);};
const app = require(path.join(root,'app'));
const {db} = require(path.join(root,'config/database'));
const auth = require(path.join(root,'services/authService'));
const orgs = require(path.join(root,'services/orgService'));
let server;const results=[];
async function check(name,fn){try{const evidence=await fn();results.push({name,result:'confirmed',evidence});console.log(JSON.stringify(results.at(-1)));}catch(e){results.push({name,result:'unexpected',error:e.message});console.error(name,e);process.exitCode=1;}}
async function main(){
 const org=orgs.createOrganization('Functional review'),other=orgs.createOrganization('Other synthetic org');
 const sessions={};for(const role of ['owner','manager','staff']){const u=auth.createUser({name:role,email:role+'@example.invalid',password:'Synthetic123!'});orgs.createMembership({organizationId:org.id,userId:u.id,role});sessions[role]=auth.createSession(u.id,org.id).sessionId;}
 const outsider=auth.createUser({name:'other',email:'other@example.invalid',password:'Synthetic123!'});orgs.createMembership({organizationId:other.id,userId:outsider.id,role:'owner'});sessions.other=auth.createSession(outsider.id,other.id).sessionId;
 db.prepare("INSERT INTO organization_settings(organization_id,key,value) VALUES(?,'services',?) ON CONFLICT(organization_id,key) DO UPDATE SET value=excluded.value").run(org.id,JSON.stringify([{id:'tourist_tax',active:false}]));
 for(const [id,price,cap,parent]of [['a',100,4,null],['b',200,2,null],['house',300,4,null],['room1',100,2,'house'],['room2',100,2,'house']])db.prepare('INSERT INTO accommodations(id,organization_id,name,type,price_per_night,max_guests,parent_id) VALUES(?,?,?,?,?,?,?)').run(id,org.id,id,parent?'suite':'alojamento',price,cap,parent);
 server=app.listen(0,'127.0.0.1');await new Promise((r,j)=>{server.once('listening',r);server.once('error',j);});const base='http://127.0.0.1:'+server.address().port;
 async function req(method,url,body,role='owner'){const response=await fetch(base+url,{method,headers:{'Content-Type':'application/json',...(role?{Cookie:auth.SESSION_COOKIE+'='+sessions[role]}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,body:await response.json()};}
 const payload=(month=1,unit='a',extra={})=>({accommodation_id:unit,check_in:`2035-${String(month).padStart(2,'0')}-01`,check_out:`2035-${String(month).padStart(2,'0')}-03`,num_adults:1,num_children:0,guest:{name:'Synthetic guest',email:`guest-${month}-${unit}@example.invalid`},...extra});
 const create=async body=>{const r=await req('POST','/api/reservations',body);assert.equal(r.status,201,JSON.stringify(r));return r.body.data;};
 let primary;
 await check('PASS: create + basic role and organization boundaries',async()=>{primary=await create(payload());assert.equal(primary.total_amount,200);for(const [method,url,body]of [['POST','/api/reservations',payload(2)],['PUT','/api/reservations/'+primary.id,{notes:'denied'}],['POST','/api/reservations/'+primary.id+'/payments',{amount:10}],['DELETE','/api/reservations/'+primary.id,{}]])assert.equal((await req(method,url,body,'staff')).status,403);assert.equal((await req('GET','/api/reservations/'+primary.id,undefined,'other')).status,404);assert.equal((await req('PUT','/api/reservations/'+primary.id,{notes:'denied'},'other')).status,404);assert.equal((await req('GET','/api/reservations',undefined,null)).status,401);return {total:primary.total_amount};});
 await check('PASS: concurrency rejects duplicate occupancy; adjacency allowed',async()=>{const pair=await Promise.all([req('POST','/api/reservations',payload(2)),req('POST','/api/reservations',payload(2))]);assert.deepEqual(pair.map(r=>r.status).sort(),[201,409]);await create(payload(2,'a',{check_in:'2035-02-03',check_out:'2035-02-05'}));return {statuses:pair.map(r=>r.status)};});
 await check('PASS: extra rooms and parent/child prevent double bookings',async()=>{await create(payload(3,'a',{accommodations_data:[{accommodation_id:'b',name:'b'}]}));assert.equal((await req('POST','/api/reservations',payload(3,'b'))).status,409);await create(payload(4,'room1'));assert.equal((await req('POST','/api/reservations',payload(4,'house'))).status,409);await create(payload(4,'room2'));return 'secondary room blocked; whole house blocked; sibling room available';});
 await check('PASS: invalid dates/capacity rejected; failed writes roll back guest creation',async()=>{const before=db.prepare('SELECT COUNT(*) n FROM guests').get().n;assert.equal((await req('POST','/api/reservations',payload(5,'a',{check_in:'2035-02-30',guest:{name:'Bad',email:'bad@example.invalid'}}))).status,400);assert.equal((await req('POST','/api/reservations',payload(5,'b',{num_adults:3,guest:{name:'Bad',email:'bad2@example.invalid'}}))).status,400);assert.equal(db.prepare('SELECT COUNT(*) n FROM guests').get().n,before);return '400 and no orphan guest';});
 await check('F01: changing arrival time silently removes manual discount',async()=>{const r=await create(payload(6,'a',{total_amount:150}));const edit=await req('PUT','/api/reservations/'+r.id,{arrival_time:'18:00'});assert.equal(edit.status,200);const saved=db.prepare('SELECT total_amount,arrival_time FROM reservations WHERE id=?').get(r.id);assert.equal(saved.total_amount,200);return {before:r.total_amount,after:saved.total_amount,arrival:saved.arrival_time};});
 await check('F01: notes-only edit removes voucher discount while keeping redemption consumed',async()=>{db.prepare("INSERT INTO vouchers(id,organization_id,code,type,value,status,max_uses) VALUES('v',?,'AUDIT10','discount_pct',10,'active',1)").run(org.id);const r=await create(payload(7,'a',{voucher_code:'AUDIT10'}));assert.equal(r.total_amount,180);const edit=await req('PUT','/api/reservations/'+r.id,{notes:'Only notes'});assert.equal(edit.status,200);const saved=db.prepare('SELECT total_amount FROM reservations WHERE id=?').get(r.id);assert.equal(saved.total_amount,200);assert.equal(db.prepare("SELECT status FROM vouchers WHERE id='v'").get().status,'used');return {before:180,after:200,voucher:'used'};});
 await check('F02: clearing paid amount preserves confirmed payment status',async()=>{const r=await create(payload(8,'a',{amount_paid:200}));const edit=await req('PUT','/api/reservations/'+r.id,{amount_paid:0});assert.equal(edit.status,200);const saved=db.prepare('SELECT amount_paid,payment_status FROM reservations WHERE id=?').get(r.id);assert.equal(saved.amount_paid,0);assert.equal(saved.payment_status,'confirmado');return saved;});
 await check('F03: reservation guest editor cannot clear an existing phone',async()=>{const r=await create(payload(9,'a',{guest:{name:'Test',email:'clear@example.invalid',phone:'000000000'}}));assert.equal((await req('PUT','/api/reservations/'+r.id,{guest:{phone:''}})).status,200);const phone=db.prepare('SELECT phone FROM guests WHERE id=?').get(r.guest_id).phone;assert.equal(phone,'000000000');return {submitted:'',saved:phone};});
 await check('PASS: manual payment add/remove, task status, cancel and reactivation',async()=>{const r=await create(payload(10));let p=await req('POST','/api/reservations/'+r.id+'/payments',{amount:50,method:'transferencia'});assert.equal(p.status,200);assert.equal(p.body.data.newTotalPaid,50);assert.equal((await req('DELETE',`/api/reservations/${r.id}/payments/${p.body.data.id}`)).status,200);let row=db.prepare('SELECT amount_paid,payment_status FROM reservations WHERE id=?').get(r.id);assert.equal(row.amount_paid,0);assert.equal(row.payment_status,'pendente');for(const kind of ['checkin','checkout'])assert.equal((await req('POST','/api/reservations/'+r.id+'/task-status',{kind,done:true},'staff')).status,200);assert.equal((await req('DELETE','/api/reservations/'+r.id)).status,200);assert.equal((await req('PUT','/api/reservations/'+r.id,{status:'confirmada'})).status,200);assert.equal(db.prepare('SELECT status FROM reservations WHERE id=?').get(r.id).status,'confirmada');return 'ledger and task updates persist; cancellation/reactivation allowed without payment policy';});
 await check('F04: lost payment response followed by retry duplicates the ledger',async()=>{
  const r=await create(payload(11)),body={amount:50,method:'transferencia'};
  let upstreamStatus;
  const relay=require('node:http').createServer(async (_incoming,outgoing)=>{
    const saved=await req('POST','/api/reservations/'+r.id+'/payments',body);
    upstreamStatus=saved.status;outgoing.destroy(); // Server committed; client never receives success.
  });
  relay.listen(0,'127.0.0.1');await new Promise(resolve=>relay.once('listening',resolve));
  let lost=false;
  try{await fetch('http://127.0.0.1:'+relay.address().port,{method:'POST'});}catch{lost=true;}
  finally{relay.closeAllConnections();await new Promise(resolve=>relay.close(resolve));}
  assert.equal(lost,true);assert.equal(upstreamStatus,200);
  assert.equal(db.prepare('SELECT amount_paid FROM reservations WHERE id=?').get(r.id).amount_paid,50);
  assert.equal((await req('POST','/api/reservations/'+r.id+'/payments',body)).status,200);
  const saved=db.prepare('SELECT amount_paid FROM reservations WHERE id=?').get(r.id);assert.equal(saved.amount_paid,100);
  return {responseLost:true,firstPayment:50,totalAfterRetry:100,entries:db.prepare('SELECT COUNT(*) n FROM reservation_payments WHERE reservation_id=?').get(r.id).n};
 });
 await check('F05: backoffice cancellation ignores the refund previously approved by the operator',async()=>{
  const policy=require(path.join(root,'services/paymentPolicy'));
  policy.savePolicy(org.id,{...structuredClone(policy.DEFAULT_POLICY),enabled:true});
  const r=await create(payload(12,'a',{amount_paid:200}));
  const before=policy.describe(db.prepare('SELECT * FROM reservations WHERE id=?').get(r.id));
  assert.equal(before.refundCents,20000);
  assert.equal((await req('POST','/api/reservations/'+r.id+'/payments',{amount:50})).status,200);
  const cancelled=await req('DELETE','/api/reservations/'+r.id,{key:before.consentKey,refundCents:before.refundCents});
  assert.equal(cancelled.status,200);
  const financial=JSON.parse(db.prepare('SELECT policy_cancellation_json FROM reservations WHERE id=?').get(r.id).policy_cancellation_json);
  assert.equal(financial.refundCents,25000);assert.equal(financial.state,'manual_review');
  return {approvedRefund:200,recordedRefund:250,state:financial.state,realRefunds:0};
 });
 await check('PASS: organization backup data roundtrip preserves reservations/payments/vouchers',async()=>{const backup=require(path.join(root,'services/backupData'));const exported=backup.exportData(org.id);const count=db.prepare('SELECT COUNT(*) n FROM reservations WHERE organization_id=?').get(org.id).n;const prepared=backup.prepareImport(exported,org.id);backup.restoreData(prepared,org.id);assert.deepEqual(backup.exportData(org.id).tables,exported.tables);assert.equal(db.prepare('SELECT COUNT(*) n FROM reservations WHERE organization_id=?').get(org.id).n,count);return {reservations:count,uploads:'not covered by this data-only roundtrip'};});
 console.log(JSON.stringify({checks:results.length,unexpected:results.filter(r=>r.result==='unexpected').length}));
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}db.close();process.chdir(previous);fs.rmSync(temp,{recursive:true,force:true});global.fetch=originalFetch;});
