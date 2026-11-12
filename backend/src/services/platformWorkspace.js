const { randomUUID } = require('crypto');
const { db } = require('../config/database');
const { httpError } = require('./httpError');
const { definitions, DEPARTMENTS } = require('./platformCatalog');
const { can, isPlatformAdmin, recordPlatformAudit, platformRoles, setPlatformRoles, cleanRoles } = require('./platformAccess');
const { isValidEmail } = require('./authService');
const FINANCIAL = new Set(['subscription','entry']);
// Capacidade (services/platformAccess.js) para escrever em cada tipo de registo.
// Ler: toda a equipa, exceto Finanças (só Administração).
const WRITE_CAPABILITY = { lead:'sales', proposal:'sales', profile:'sales', campaign:'sales', content:'sales', material:'sales', issue:'product' };
function permitted(user,kind,write=false) {
  if (can(user,'admin')) return true;
  if (FINANCIAL.has(kind) || !can(user,'read')) return false;
  return !write || (Object.hasOwn(WRITE_CAPABILITY,kind) && can(user,WRITE_CAPABILITY[kind]));
}
function schema(user,kind,write=false) {
  if (!Object.hasOwn(definitions,kind)) throw httpError('Área não encontrada.',404);
  if (!permitted(user,kind,write)) throw httpError('Esta área requer Administração.',403);
  return definitions[kind];
}
function text(value,max=200,required=false) {
  if (value==null) value='';
  if (typeof value!=='string' || value.length>max || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)) throw httpError(`Texto inválido ou com mais de ${max} caracteres.`,400);
  value=value.trim(); if(required&&!value) throw httpError('Preencha os campos obrigatórios.',400);return value;
}
function validDate(value) {
  if(!value) return '';
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value) throw httpError('Data inválida.',400);
  return value;
}
function dataOf(def,input) {
  if(!input||typeof input!=='object'||Array.isArray(input)) throw httpError('Campos inválidos.',400);
  for(const key of Object.keys(input)) if(!def.fields.some(f=>f.key===key)) throw httpError('Campo desconhecido.',400);
  const out={};
  for(const f of def.fields) {
    const raw=input[f.key];
    if(f.type==='money') {
      if(raw==null||raw==='') {if(f.required) throw httpError(`Indique ${f.label}.`,400);out[f.key]=null;continue;}
      if(!Number.isSafeInteger(raw)||raw<0||raw>100000000000) throw httpError('O valor tem de ser um número inteiro de cêntimos, positivo ou zero.',400);
      out[f.key]=raw;
    } else if(f.type==='select') {
      const value=raw??Object.keys(f.options)[0];
      if(!Object.hasOwn(f.options,value)) throw httpError(`${f.label}: opção inválida.`,400);out[f.key]=value;
    } else {
      const value=text(raw,f.max||(f.type==='textarea'?5000:300),f.required);
      if(f.type==='date') validDate(value);
      if(f.type==='email'&&value&&!isValidEmail(value)) throw httpError('Email inválido.',400);
      if(f.type==='url'&&value) {let url;try{url=new URL(value);}catch{throw httpError('Ligação inválida.',400);}if(!['http:','https:'].includes(url.protocol)||url.username||url.password) throw httpError('Use uma ligação HTTP ou HTTPS sem credenciais.',400);}
      out[f.key]=value;
    }
  }
  if(out.start_date&&out.end_date&&out.end_date<out.start_date) throw httpError('O fim não pode ser anterior ao início.',400);
  return out;
}
const SELECT=`SELECT r.*,o.name AS organization_name,u.name AS assignee_name,p.title AS related_title,p.kind AS related_kind,s.number AS ticket_number
 FROM platform_records r LEFT JOIN organizations o ON o.id=r.organization_id LEFT JOIN users u ON u.id=r.assignee_user_id
 LEFT JOIN platform_records p ON p.id=r.related_id LEFT JOIN support_tickets s ON s.id=r.ticket_id`;
function shape(r) {
 return {id:r.id,kind:r.kind,title:r.title,status:r.status,data:JSON.parse(r.data_json),revision:r.revision,created_at:r.created_at,updated_at:r.updated_at,
 organization:r.organization_id?{id:r.organization_id,name:r.organization_name}:null,
 assignee:r.assignee_user_id?{id:r.assignee_user_id,name:r.assignee_name}:null,
 related:r.related_id?{id:r.related_id,kind:r.related_kind,title:r.related_title}:null,
 ticket:r.ticket_id?{id:r.ticket_id,number:'SP-'+String(r.ticket_number).padStart(4,'0')}:null};
}
function row(user,kind,id,write=false) {schema(user,kind,write);const found=db.prepare(`${SELECT} WHERE r.id=? AND r.kind=?`).get(id,kind);if(!found) throw httpError('Registo não encontrado.',404);return found;}
function get(user,kind,id) {
 const found=shape(row(user,kind,id));
 found.comments=db.prepare(`SELECT c.id,c.body,c.created_at,u.name AS author FROM platform_record_comments c LEFT JOIN users u ON u.id=c.user_id WHERE c.record_id=? ORDER BY c.created_at,c.rowid`).all(id);
 found.links=db.prepare(`${SELECT} WHERE r.related_id=? ORDER BY r.updated_at DESC`).all(id).filter(r=>permitted(user,r.kind)).map(shape);
 found.tasks=require('./platformTasks').list(user).tasks.filter(t=>t.record?.id===id);
 return found;
}
function list(user,kind,{q='',status='',organization_id:orgId='',assignee='',limit=500,offset=0,brand='',direction='',related_id='',month='',from='',to=''}={}) {
 const def=schema(user,kind);const where=['r.kind=?'],args=[kind];
 if(status) {if(!Object.hasOwn(def.states,status)) throw httpError('Estado inválido.',400);where.push('r.status=?');args.push(status);}
 if(orgId){where.push('r.organization_id=?');args.push(String(orgId));}
 if(related_id){where.push('r.related_id=?');args.push(String(related_id));}
 if(assignee==='me'){where.push('r.assignee_user_id=?');args.push(user.id);}
 for(const [key,value] of [['brand',brand],['direction',direction]]) if(value){const f=def.fields.find(f=>f.key===key);if(!f?.options||!Object.hasOwn(f.options,value))throw httpError('Filtro inválido.',400);where.push(`json_extract(r.data_json,'$.${key}')=?`);args.push(value);}
 if(q){const term=text(q,200);where.push("(r.title LIKE ? ESCAPE '\\' OR r.data_json LIKE ? ESCAPE '\\')");const escaped=term.replace(/[\\%_]/g,'\\$&');args.push('%'+escaped+'%','%'+escaped+'%');}
 if(month){if(kind!=='content'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw httpError('Mês inválido.',400);where.push("json_extract(r.data_json,'$.publish_date') LIKE ?");args.push(month+'-%');}
 if(from){validDate(from);where.push("json_extract(r.data_json,'$.date')>=?");args.push(from);}
 if(to){validDate(to);where.push("json_extract(r.data_json,'$.date')<=?");args.push(to);}
 if(from&&to&&from>to)throw httpError('Intervalo de datas inválido.',400);
 const order=kind==='content'?"CASE WHEN COALESCE(json_extract(r.data_json,'$.publish_date'),'')='' THEN 1 ELSE 0 END,json_extract(r.data_json,'$.publish_date'),r.updated_at DESC,r.id":'r.updated_at DESC,r.id';
 const take=Number(limit),skip=Number(offset);
 if(!Number.isInteger(take)||take<1||take>500||!Number.isSafeInteger(skip)||skip<0)throw httpError('Paginação inválida.',400);
 return {rows:db.prepare(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...args,take,skip).map(shape),total:db.prepare(`SELECT COUNT(*) AS n FROM platform_records r WHERE ${where.join(' AND ')}`).get(...args).n};
}
function validate(user,kind,input,current=null) {
 const def=schema(user,kind,true);
 if(!input||typeof input!=='object'||Array.isArray(input)) throw httpError('Pedido inválido.',400);
 const title=text(input.title,140,true),status=input.status??current?.status??Object.keys(def.states)[0];
 if(!Object.hasOwn(def.states,status)) throw httpError('Estado inválido.',400);
 const data=dataOf(def,input.data??(current?JSON.parse(current.data_json):{}));
 let orgId=input.organization_id===undefined?(current?.organization_id||null):(input.organization_id||null);
 const assignee=input.assignee_user_id===undefined?(current?.assignee_user_id||null):(input.assignee_user_id||null);
 if(assignee&&!isPlatformAdmin({id:assignee})) throw httpError('Responsável inválido.',400);
 const related=input.related_id===undefined?(current?.related_id||null):(input.related_id||null);
 if(related) {
  if(!def.related) throw httpError('Esta área não permite essa ligação.',400);
  const target=row(user,def.related,String(related));
  if(target.organization_id) {if(orgId&&orgId!==target.organization_id) throw httpError('O registo relacionado pertence a outro cliente.',400);orgId ||= target.organization_id;}
 }
 const ticket=input.ticket_id===undefined?(current?.ticket_id||null):(input.ticket_id||null);
 if(ticket) {
  if(kind!=='issue') throw httpError('Só pedidos de produto podem ligar a um pedido de suporte.',400);
  const t=db.prepare('SELECT organization_id FROM support_tickets WHERE id=?').get(String(ticket));
  if(!t) throw httpError('Pedido de suporte não encontrado.',400);
  if(orgId&&orgId!==t.organization_id) throw httpError('O pedido pertence a outro cliente.',400);orgId ||= t.organization_id;
 }
 if(orgId&&(typeof orgId!=='string'||!db.prepare('SELECT 1 FROM organizations WHERE id=?').get(orgId))) throw httpError('Cliente não encontrado.',400);
 if(def.orgRequired&&!orgId) throw httpError('Escolha um cliente.',400);
 if(['campaign','content','material'].includes(kind)) {
  if(data.brand==='client'&&!orgId) throw httpError('Escolha o cliente desta marca.',400);
  if(data.brand==='platform'&&orgId) throw httpError('Para associar um cliente, escolha a marca Cliente.',400);
 }
 if(kind==='entry'&&status==='paid'&&!data.paid_date) throw httpError('Indique a data da liquidação.',400);
 if(kind==='entry'&&related&&data.direction!=='income') throw httpError('Só recebimentos podem ser ligados a uma subscrição.',400);
 return {title,status,data,orgId,assignee,related,ticket};
}
function save(user,kind,id,input) {
 return db.transaction(()=>{
  const current=id?row(user,kind,id,true):null;
  if(current&&(!Number.isInteger(input?.revision)||input.revision!==current.revision)) throw httpError('Este registo foi alterado por outra pessoa. Atualize antes de guardar.',409);
  const v=validate(user,kind,input,current);id ||= randomUUID();
  if(kind==='profile'&&db.prepare("SELECT id FROM platform_records WHERE kind='profile' AND organization_id=? AND id!=?").get(v.orgId,id)) throw httpError('Este cliente já tem uma ficha de acompanhamento.',409);
  if(kind==='subscription'&&v.status==='active'&&db.prepare("SELECT id FROM platform_records WHERE kind='subscription' AND status='active' AND organization_id=? AND id!=?").get(v.orgId,id)) throw httpError('Este cliente já tem uma subscrição ativa.',409);
  // Não deixar filhos com uma associação de cliente que contradiga a origem.
  if(current&&v.orgId!==current.organization_id&&db.prepare('SELECT 1 FROM platform_records WHERE related_id=? AND organization_id IS NOT ?').get(id,v.orgId)) throw httpError('Atualize primeiro as ligações dos registos dependentes.',409);
  if(current) db.prepare(`UPDATE platform_records SET title=?,status=?,organization_id=?,assignee_user_id=?,related_id=?,ticket_id=?,data_json=?,revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`).run(v.title,v.status,v.orgId,v.assignee,v.related,v.ticket,JSON.stringify(v.data),id);
  else db.prepare('INSERT INTO platform_records(id,kind,title,status,organization_id,assignee_user_id,related_id,ticket_id,data_json,created_by_user_id) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,kind,v.title,v.status,v.orgId,v.assignee,v.related,v.ticket,JSON.stringify(v.data),user.id);
  recordPlatformAudit({userId:user.id,action:current?'workspace.update':'workspace.create',targetType:'workspace',targetId:id,details:{kind}});
  return get(user,kind,id);
 }).immediate();
}
function remove(user,kind,id) {
 row(user,kind,id,true);
 if(db.prepare('SELECT 1 FROM platform_records WHERE related_id=?').get(id)) throw httpError('Existem registos ligados. Remova a ligação antes de apagar.',409);
 if(FINANCIAL.has(kind)) throw httpError('Conserve o histórico financeiro: anule o movimento ou cancele a subscrição.',400);
 db.prepare('DELETE FROM platform_records WHERE id=?').run(id);recordPlatformAudit({userId:user.id,action:'workspace.delete',targetType:'workspace',targetId:id,details:{kind}});
}
function comment(user,kind,id,input) {
 row(user,kind,id,true);const body=text(input?.body,3000,true),commentId=randomUUID();
 db.prepare('INSERT INTO platform_record_comments(id,record_id,user_id,body) VALUES(?,?,?,?)').run(commentId,id,user.id,body);
 recordPlatformAudit({userId:user.id,action:'workspace.comment',targetType:'workspace',targetId:id,details:{kind}});return get(user,kind,id);
}
function catalog(user) {
 return {definitions:Object.fromEntries(Object.entries(definitions).filter(([kind])=>permitted(user,kind)).map(([kind,def])=>[kind,{...def,writable:permitted(user,kind,true)}])),departments:DEPARTMENTS,
 people:require('./platformTasks').list(user).people,
 organizations:db.prepare('SELECT id,name FROM organizations ORDER BY name COLLATE NOCASE').all()};
}
function summary(user,{from='',to=''}={}) {
 validDate(from);validDate(to);if(from&&to&&from>to)throw httpError('Intervalo de datas inválido.',400);
 const rows=db.prepare('SELECT kind,status,data_json FROM platform_records').all().filter(r=>permitted(user,r.kind));
 const counts={};for(const r of rows) counts[r.kind]=(counts[r.kind]||0)+1;
 const today=require('./dates').localDay();let income=0,expenses=0,pending=0,overdue=0,monthly=0;
 for(const r of rows) {
  const d=JSON.parse(r.data_json);
  if(r.kind==='entry'&&((from&&d.date<from)||(to&&d.date>to)))continue;
  if(r.kind==='entry'&&r.status==='paid'){if(d.direction==='income') income+=d.amount_cents;else expenses+=d.amount_cents;}
  if(r.kind==='entry'&&r.status==='pending'&&d.direction==='income'){pending+=d.amount_cents;if(d.due_date&&d.due_date<today)overdue+=d.amount_cents;}
  if(r.kind==='subscription'&&r.status==='active')monthly+=d.billing==='yearly'?d.amount_cents/12:d.amount_cents;
 }
 return {counts,finance:can(user,'admin')?{income_cents:income,expense_cents:expenses,balance_cents:income-expenses,pending_cents:pending,overdue_cents:overdue,mrr_cents:Math.round(monthly)}:null,
 next:db.prepare(`${SELECT} WHERE r.status NOT IN ('done','cancelled','lost','won','paid','published','released','dismissed','archived','rejected','expired') ORDER BY r.updated_at DESC`).all().filter(r=>permitted(user,r.kind)).map(shape).filter(r=>{const d=r.data;return (d.next_date||d.due_date||d.publish_date||d.start_date||'')<=today&&(d.next_date||d.due_date||d.publish_date||d.start_date);}).slice(0,10)};
}
function team(user) {
 if(!can(user,'admin')) throw httpError('Apenas Administração.',403);
 return db.prepare('SELECT id,name,email,active FROM users WHERE platform_admin=1 ORDER BY name').all()
  .filter(u=>isPlatformAdmin(u)).map(u=>({...u,platform_roles:platformRoles(u)}));
}
// Cargos de uma pessoa da equipa: um ou mais (ex.: Marketing e Administração).
// `roles` é uma lista; aceita também um texto único, como antes.
function setRole(user,id,roles) {
 if(!can(user,'admin'))throw httpError('Apenas Administração.',403);
 const list=cleanRoles(Array.isArray(roles)?roles:[roles]);
 if(!list.length||!isPlatformAdmin({id}))throw httpError('Conta ou cargo inválido.',400);
 if(id===user.id&&!list.includes('admin'))throw httpError('Não pode retirar o seu próprio cargo de Administração.',400);
 db.transaction(()=>{setPlatformRoles(id,list);recordPlatformAudit({userId:user.id,action:'workspace.role',targetType:'user',targetId:id,details:{roles:list}});})();
 return team(user);
}
function settings(user,input) {
 if(!can(user,'admin'))throw httpError('Apenas Administração.',403);
 if(input!==undefined){const name=text(input.company_name,120,true),email=text(input.contact_email,254),notes=text(input.notes,5000);if(email&&!isValidEmail(email))throw httpError('Email inválido.',400);db.prepare('INSERT INTO platform_business_settings(id,company_name,contact_email,notes) VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET company_name=excluded.company_name,contact_email=excluded.contact_email,notes=excluded.notes').run(name,email,notes);recordPlatformAudit({userId:user.id,action:'workspace.settings'});}
 return db.prepare('SELECT company_name,contact_email,notes FROM platform_business_settings WHERE id=1').get()||{company_name:'Santa Paciência',contact_email:'',notes:''};
}
function clientHub(user,id) {
 if(!db.prepare('SELECT 1 FROM organizations WHERE id=?').get(id))throw httpError('Cliente não encontrado.',404);
 return {records:db.prepare(`${SELECT} WHERE r.organization_id=? ORDER BY r.updated_at DESC`).all(id).filter(r=>permitted(user,r.kind)).map(shape),
 tasks:require('./platformTasks').list(user,{organization_id:id}).tasks,
 tickets:db.prepare('SELECT id,number,subject,status FROM support_tickets WHERE organization_id=? ORDER BY last_message_at DESC LIMIT 100').all(id),
 access:require('./platformTrials').access(id)};
}
function exportData(user) {
 if(!can(user,'admin'))throw httpError('Apenas Administração.',403);
 recordPlatformAudit({userId:user.id,action:'workspace.export'});
 return {format:'santa-paciencia-internal-v1',created_at:new Date().toISOString(),records:db.prepare('SELECT * FROM platform_records ORDER BY created_at').all(),comments:db.prepare('SELECT * FROM platform_record_comments ORDER BY created_at').all(),tasks:db.prepare('SELECT * FROM platform_tasks').all(),task_comments:db.prepare('SELECT * FROM platform_task_comments').all(),settings:settings(user)};
}
module.exports={permitted,schema,text,validDate,list,get,save,remove,comment,catalog,summary,team,setRole,settings,clientHub,exportData};
