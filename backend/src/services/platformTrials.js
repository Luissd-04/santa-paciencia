const { randomUUID }=require('crypto');
const {db}=require('../config/database');
const {httpError}=require('./httpError');
const {recordPlatformAudit,can}=require('./platformAccess');
const orgs=require('./orgService');
const DAY=86400000;
function access(orgId){if(!orgId)return null;const r=db.prepare('SELECT * FROM platform_trial_access WHERE organization_id=?').get(orgId);if(!r)return null;return {...r,status:r.converted_at?'converted':r.closed_at?'closed':r.expires_at&&Date.parse(r.expires_at)<=Date.now()?'expired':r.started_at?'active':'pending'};}
function isDemo(orgId){const r=access(orgId);return r?.mode==='demo'&&!r.converted_at;}
function blocked(orgId){const r=access(orgId);return r&&['expired','closed'].includes(r.status);}
function begin(orgId){db.prepare(`UPDATE platform_trial_access SET started_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),expires_at=strftime('%Y-%m-%dT%H:%M:%fZ','now','+'||days||' days') WHERE organization_id=? AND started_at IS NULL AND closed_at IS NULL AND converted_at IS NULL`).run(orgId);return access(orgId);}
function assertAllowed(orgId){if(blocked(orgId))throw httpError('O período de teste terminou ou foi encerrado. Contacte a equipa Santa Paciência.',403);}
function list(){return db.prepare(`SELECT t.*,o.name,p.title AS lead_title FROM platform_trial_access t JOIN organizations o ON o.id=t.organization_id LEFT JOIN platform_records p ON p.id=t.lead_id ORDER BY t.created_at DESC`).all().map(r=>({...r,status:access(r.organization_id).status}));}
function authorize(user){if(!can(user,'sales'))throw httpError('Sem acesso ao Comercial.',403);}
function seedDemo(orgId){
 const unit=randomUUID();db.prepare("INSERT INTO accommodations(id,organization_id,name,type,price_per_night,max_guests) VALUES(?,?,?,'alojamento',120,4)").run(unit,orgId,'Casa Exemplo — demonstração');
 const guests=[['Ana Exemplo','ana@example.invalid'],['João Exemplo','joao@example.invalid'],['Maria Exemplo','maria@example.invalid']];
 const today=require('./dates').localDay();
 guests.forEach(([name,email],i)=>{const guest=randomUUID();db.prepare('INSERT INTO guests(id,organization_id,name,email) VALUES(?,?,?,?)').run(guest,orgId,name,email);const checkIn=require('./dates').addDays(today,i*5+2),checkOut=require('./dates').addDays(checkIn,2);db.prepare("INSERT INTO reservations(id,organization_id,guest_id,accommodation_id,check_in,check_out,nights,num_guests,total_amount,status) VALUES(?,?,?,?,?,?,2,2,240,'confirmada')").run(randomUUID(),orgId,guest,unit,checkIn,checkOut);});
 db.prepare("INSERT INTO expenses(id,organization_id,description,amount,date,category) VALUES(?,?,?,?,?,'outros')").run(randomUUID(),orgId,'Limpeza fictícia de demonstração',35,today);
}
function create(user,input){authorize(user);if(!['demo','private'].includes(input?.mode))throw httpError('Escolha demonstração ou teste privado.',400);if(!Number.isInteger(input.days)||input.days<1||input.days>90)throw httpError('Escolha um prazo entre 1 e 90 dias.',400);
 return db.transaction(()=>{
  let lead=null;if(input.lead_id){const r=db.prepare("SELECT id,organization_id FROM platform_records WHERE id=? AND kind='lead'").get(String(input.lead_id));if(!r)throw httpError('Contacto comercial não encontrado.',400);if(input.mode==='private'&&r.organization_id)throw httpError('Este contacto já está associado a um cliente. Use a ficha existente ou crie outro contacto.',409);lead=r.id;}
  const created=require('./platformOnboarding').create({...input,status:'trial'},user.id);
  db.prepare('INSERT INTO platform_trial_access(organization_id,mode,days,lead_id,owner_email) VALUES(?,?,?,?,?)').run(created.id,input.mode,input.days,lead,require('./authService').normalizeEmail(input.owner_email));
  if(input.mode==='demo')seedDemo(created.id);
  if(lead&&input.mode==='private'){db.prepare('UPDATE platform_records SET organization_id=?,revision=revision+1 WHERE related_id=? AND organization_id IS NULL').run(created.id,lead);}
  if(lead&&input.mode==='private')db.prepare("UPDATE platform_records SET organization_id=?,revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND organization_id IS NULL").run(created.id,lead);
  recordPlatformAudit({userId:user.id,action:'trial.create',targetType:'organization',targetId:created.id,details:{mode:input.mode,days:input.days}});
  return {...created,access:access(created.id)};
 }).immediate();
}
function change(user,orgId,input){authorize(user);return db.transaction(()=>{
 const r=access(orgId);if(!r)throw httpError('Acesso de teste não encontrado.',404);
 const action=input?.action;
 if(action==='extend'){
  if(r.converted_at)throw httpError('O teste já foi convertido.',400);
  if(!Number.isInteger(input.days)||input.days<1||input.days>90)throw httpError('Prolongue entre 1 e 90 dias.',400);
  if(r.started_at){const from=Math.max(Date.now(),Date.parse(r.expires_at)||0);db.prepare('UPDATE platform_trial_access SET expires_at=?,closed_at=NULL WHERE organization_id=?').run(new Date(from+input.days*DAY).toISOString(),orgId);}
  else {if(r.days+input.days>90)throw httpError('O prazo antes da primeira entrada não pode ultrapassar 90 dias.',400);db.prepare('UPDATE platform_trial_access SET days=?,closed_at=NULL WHERE organization_id=?').run(r.days+input.days,orgId);}
  if(r.followup_task_id){const updated=access(orgId);db.prepare("UPDATE platform_tasks SET due_date=?,status='todo',done_at=NULL WHERE id=?").run(updated.expires_at?.slice(0,10)||null,r.followup_task_id);}
 }else if(action==='close'){
  if(r.converted_at)throw httpError('O teste já foi convertido.',400);db.prepare("UPDATE platform_trial_access SET closed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE organization_id=?").run(orgId);
 }else if(action==='convert'){
  if(!can(user,'admin'))throw httpError('A conversão em cliente requer Administração.',403);
  if(r.mode==='demo')throw httpError('Crie um teste privado para começar sem os dados fictícios da demonstração.',400);
  db.prepare("UPDATE platform_trial_access SET converted_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),closed_at=NULL WHERE organization_id=?").run(orgId);db.prepare("UPDATE organizations SET status='active',updated_at=datetime('now') WHERE id=?").run(orgId);
  if(r.lead_id)db.prepare("UPDATE platform_records SET status='won',organization_id=?,revision=revision+1 WHERE id=?").run(orgId,r.lead_id);
 }else throw httpError('Ação inválida.',400);
 if(r.followup_task_id && ['close','convert'].includes(action))db.prepare("UPDATE platform_tasks SET status='done',done_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(r.followup_task_id);
 recordPlatformAudit({userId:user.id,action:'trial.'+action,targetType:'organization',targetId:orgId,details:input.days?{days:input.days}:null});return access(orgId);
 }).immediate();}
function invitation(user,orgId){authorize(user);return db.transaction(()=>{const r=access(orgId);if(!r||r.converted_at||r.closed_at)throw httpError('Este acesso já não permite novos convites.',400);if(db.prepare('SELECT 1 FROM memberships WHERE organization_id=? AND active=1').get(orgId))throw httpError('O convite já foi aceite. O proprietário pode recuperar a palavra-passe no login.',400);db.prepare('DELETE FROM invitations WHERE organization_id=? AND accepted_at IS NULL').run(orgId);const invite=orgs.createInvitation({organizationId:orgId,email:r.owner_email,role:'owner',invitedByUserId:user.id});recordPlatformAudit({userId:user.id,action:'trial.invite',targetType:'organization',targetId:orgId});return {invitation_url:orgs.buildInvitationUrl(invite.token),expires_at:invite.expires_at};}).immediate();}
// Uma tarefa comum por acesso quando faltam três dias; execução idempotente.
function followups(now=new Date()) {
 let created=0;
 db.transaction(()=>{
  const rows=db.prepare(`SELECT t.*,o.name,p.assignee_user_id FROM platform_trial_access t JOIN organizations o ON o.id=t.organization_id LEFT JOIN platform_records p ON p.id=t.lead_id
   WHERE t.converted_at IS NULL AND t.closed_at IS NULL AND t.expires_at IS NOT NULL AND julianday(t.expires_at)<=julianday(?) AND t.followup_task_id IS NULL`).all(new Date(now.getTime()+3*DAY).toISOString());
  for(const r of rows){
   const id=randomUUID(),assignee=r.assignee_user_id&&require('./platformAccess').isPlatformAdmin({id:r.assignee_user_id})?r.assignee_user_id:null;
   db.prepare(`INSERT INTO platform_tasks(id,title,description,type,status,priority,assignee_user_id,due_date,organization_id,department) VALUES(?,?,?,'client','todo','normal',?,?,?,'sales')`).run(id,('Acompanhar teste: '+r.name).slice(0,140),'Confirmar se o cliente precisa de ajuda e decidir sobre prolongamento ou adesão.',assignee,r.expires_at.slice(0,10),r.organization_id);
   db.prepare('UPDATE platform_trial_access SET followup_task_id=? WHERE organization_id=?').run(id,r.organization_id);created++;
  }
 })();return {created};
}
module.exports={access,isDemo,blocked,begin,assertAllowed,list,create,change,invitation,followups};
