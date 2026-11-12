// Tarefas internas da equipa da plataforma (consola). Valida tudo aqui; as
// rotas só traduzem HTTP e registam a auditoria.
const crypto = require('crypto');
const { db } = require('../config/database');
const { httpError } = require('./httpError');
const { admins } = require('./platformNotifier');

const { DEPARTMENTS } = require('./platformCatalog');
const TYPES = ['idea', 'bug', 'improvement', 'marketing', 'client'];
const STATUSES = ['ideas', 'todo', 'doing', 'done'];
const PRIORITIES = ['normal', 'urgent'];
const TITLE_MAX = 140;
const DESC_MAX = 4000;
const COMMENT_MAX = 2000;

const nowIso = () => new Date().toISOString();
const ymd = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

function people() {
  const ids = admins().map(a => a.id);
  if (!ids.length) return [];
  return db.prepare(`SELECT id, name FROM users WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY name COLLATE NOCASE`).all(...ids);
}

function cleanTitle(value) {
  const title = typeof value === 'string' ? value.trim() : '';
  if (!title) throw httpError('Escreva o título da tarefa.', 400);
  if (title.length > TITLE_MAX) throw httpError(`O título pode ter no máximo ${TITLE_MAX} caracteres.`, 400);
  return title;
}
function cleanDescription(value) {
  if (value == null) return '';
  if (typeof value !== 'string') throw httpError('A descrição é inválida.', 400);
  if (value.length > DESC_MAX) throw httpError(`A descrição pode ter no máximo ${DESC_MAX} caracteres.`, 400);
  return value.trim();
}
function cleanEnum(value, list, label) {
  if (!list.includes(value)) throw httpError(`${label} inválido.`, 400);
  return value;
}
function cleanDue(value) {
  if (value == null || value === '') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  const d = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
  if (!d || d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) throw httpError('O prazo tem de ser uma data válida (AAAA-MM-DD).', 400);
  return String(value);
}
function cleanAssignee(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !people().some(p => p.id === value)) throw httpError('O responsável tem de ser alguém da equipa da plataforma.', 400);
  return value;
}
function cleanOrg(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !db.prepare('SELECT 1 FROM organizations WHERE id = ?').get(value)) throw httpError('Cliente não encontrado.', 400);
  return value;
}
function cleanTicket(value) {
  if (value == null || value === '') return null;
  const row = typeof value === 'string' ? db.prepare('SELECT id, organization_id FROM support_tickets WHERE id = ?').get(value) : null;
  if (!row) throw httpError('Pedido de suporte não encontrado.', 400);
  return row;
}
function cleanPosition(value) {
  const n = Number(value);
  if (value === '' || value === null || !Number.isFinite(n)) throw httpError('Posição inválida.', 400);
  return n;
}

const SELECT = `SELECT t.*, a.name AS assignee_name, c.name AS creator_name, o.name AS organization_name, s.number AS ticket_number, w.title AS record_title, w.kind AS record_kind,
  (SELECT COUNT(*) FROM platform_task_comments k WHERE k.task_id = t.id) AS comments
  FROM platform_tasks t
  LEFT JOIN users a ON a.id = t.assignee_user_id
  LEFT JOIN users c ON c.id = t.created_by_user_id
  LEFT JOIN organizations o ON o.id = t.organization_id
  LEFT JOIN support_tickets s ON s.id = t.ticket_id
  LEFT JOIN platform_records w ON w.id = t.record_id`;

function shape(r) {
  return {
    department: r.department, record: r.record_id ? { id:r.record_id, kind:r.record_kind, title:r.record_title } : null,
    id: r.id, title: r.title, description: r.description, type: r.type, status: r.status, priority: r.priority,
    due_date: r.due_date, position: r.position, created_at: r.created_at, updated_at: r.updated_at, done_at: r.done_at,
    assignee: r.assignee_user_id ? { id: r.assignee_user_id, name: r.assignee_name || '—' } : null,
    created_by: r.created_by_user_id ? { id: r.created_by_user_id, name: r.creator_name || '—' } : null,
    organization: r.organization_id ? { id: r.organization_id, name: r.organization_name || '—' } : null,
    ticket: r.ticket_id ? { id: r.ticket_id, number: r.ticket_number != null ? 'SP-' + String(r.ticket_number).padStart(4, '0') : null } : null,
    comments: r.comments || 0,
  };
}

// Lista tarefas. A permissão é aplicada em SQL (sem consultas por linha);
// `limit` limita o resultado e `withPeople` evita carregar a equipa quando não é precisa.
function list(user, { assignee = 'all', type = '', department = '', organization_id = '', record_id = '', limit = 0, withPeople = true } = {}) {
  const where = [];
  const args = [];
  if (assignee === 'me') { where.push('t.assignee_user_id = ?'); args.push(user.id); }
  else if (assignee && assignee !== 'all') { where.push('t.assignee_user_id = ?'); args.push(String(assignee)); }
  if (type) { where.push('t.type = ?'); args.push(cleanEnum(String(type), TYPES, 'Tipo')); }
  if (department) {
    if (!Object.hasOwn(DEPARTMENTS, department)) throw httpError('Área inválida.', 400);
    where.push('t.department=?');
    args.push(department);
  }
  if (organization_id) { where.push('t.organization_id=?'); args.push(String(organization_id)); }
  if (record_id) { where.push('t.record_id=?'); args.push(String(record_id)); }
  // Quem não é Administração não vê Finanças nem registos financeiros.
  const { can } = require('./platformAccess');
  if (!can(user, 'admin')) {
    where.push("t.department NOT IN ('finance','administration')");
    where.push(can(user, 'read') ? "(w.kind IS NULL OR w.kind NOT IN ('subscription','entry'))" : 'w.kind IS NULL');
  }
  const take = Number(limit) > 0 ? Number(limit) : 0;
  if (take) args.push(take);
  const rows = db.prepare(`${SELECT}${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY t.position, t.created_at${take ? ' LIMIT ?' : ''}`).all(...args);
  return { tasks: rows.map(shape), people: withPeople ? people() : [] };
}

function load(id) {
  const row = typeof id === 'string' ? db.prepare(`${SELECT} WHERE t.id = ?`).get(id) : null;
  if (!row) throw httpError('Tarefa não encontrada.', 404);
  return row;
}

function get(id, user = null) {
  const raw=load(id); if(user) taskAccess(user,raw);
  const task = shape(raw);
  const comments = db.prepare(`SELECT k.id, k.user_id, k.body, k.created_at, u.name FROM platform_task_comments k
    LEFT JOIN users u ON u.id = k.user_id WHERE k.task_id = ? ORDER BY k.created_at, k.rowid`).all(id)
    .map(k => ({ id: k.id, author: { id: k.user_id, name: k.name || '—' }, body: k.body, created_at: k.created_at }));
  return { ...task, comments };
}

const nextPosition = status => (db.prepare('SELECT MAX(position) AS m FROM platform_tasks WHERE status = ?').get(status).m ?? 0) + 1;

function taskAccess(user, task) {
  if (!require('./platformAccess').can(user,'admin') && (['finance','administration'].includes(task.department) || (task.record_kind && !require('./platformWorkspace').permitted(user,task.record_kind)))) throw httpError('Tarefa reservada à Administração.',403);
}
function cleanDepartment(value) { if(!Object.hasOwn(DEPARTMENTS,value)) throw httpError('Área inválida.',400);return value; }
function taskRecord(user, value, organizationId) {
  if(!value) return {id:null,organizationId};
  const row=db.prepare('SELECT id,kind,organization_id FROM platform_records WHERE id=?').get(String(value));
  if(!row||!require('./platformWorkspace').permitted(user,row.kind)) throw httpError('Registo relacionado indisponível.',400);
  if(organizationId&&row.organization_id&&organizationId!==row.organization_id) throw httpError('O registo pertence a outro cliente.',400);
  return {id:row.id,organizationId:organizationId||row.organization_id};
}

function create(user, body = {}) {
  const status = hasOwn(body, 'status') ? cleanEnum(body.status, STATUSES, 'Estado') : 'todo';
  const ticket = cleanTicket(body.ticket_id);
  let organization = cleanOrg(body.organization_id);
  if (ticket && !organization) organization = ticket.organization_id;
  const department=cleanDepartment(body.department || (body.type==='marketing'?'marketing':body.type==='client'?'clients':'product'));
  taskAccess(user,{department});
  const linked=taskRecord(user,body.record_id,organization);organization=linked.organizationId;
  if(ticket && organization!==ticket.organization_id) throw httpError('O pedido pertence a outro cliente.',400);
  const row = {
    id: crypto.randomUUID(), title: cleanTitle(body.title), description: cleanDescription(body.description),
    type: hasOwn(body, 'type') ? cleanEnum(body.type, TYPES, 'Tipo') : 'improvement', status,
    priority: hasOwn(body, 'priority') ? cleanEnum(body.priority, PRIORITIES, 'Prioridade') : 'normal',
    assignee: hasOwn(body, 'assignee_user_id') ? cleanAssignee(body.assignee_user_id) : null,
    due: cleanDue(body.due_date), organization, ticket: ticket?.id || null,
    position: hasOwn(body, 'position') ? cleanPosition(body.position) : nextPosition(status),
    at: nowIso(),
  };
  db.prepare(`INSERT INTO platform_tasks (id, title, description, type, status, priority, assignee_user_id, created_by_user_id,
    due_date, organization_id, ticket_id, position, created_at, updated_at, done_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(row.id, row.title, row.description, row.type, row.status, row.priority, row.assignee, user.id, row.due, row.organization,
      row.ticket, row.position, row.at, row.at, status === 'done' ? row.at : null);
  db.prepare('UPDATE platform_tasks SET department=?,record_id=? WHERE id=?').run(department,linked.id,row.id);
  return get(row.id);
}

// Devolve { task, changes } com os nomes dos campos alterados (para a auditoria).
function update(user, id, body = {}) {
  const cur = load(id);
  taskAccess(user,cur);
  const next = {};
  if (hasOwn(body,'department')) { next.department=cleanDepartment(body.department);taskAccess(user,{...cur,...next}); }
  if (hasOwn(body,'record_id') || hasOwn(body,'organization_id')) { const link=taskRecord(user,hasOwn(body,'record_id')?body.record_id:cur.record_id,hasOwn(body,'organization_id')?cleanOrg(body.organization_id):cur.organization_id); next.record_id=link.id; next.organization_id=link.organizationId; }
  if (hasOwn(body, 'title')) next.title = cleanTitle(body.title);
  if (hasOwn(body, 'description')) next.description = cleanDescription(body.description);
  if (hasOwn(body, 'type')) next.type = cleanEnum(body.type, TYPES, 'Tipo');
  if (hasOwn(body, 'priority')) next.priority = cleanEnum(body.priority, PRIORITIES, 'Prioridade');
  if (hasOwn(body, 'status')) next.status = cleanEnum(body.status, STATUSES, 'Estado');
  if (hasOwn(body, 'assignee_user_id')) next.assignee_user_id = cleanAssignee(body.assignee_user_id);
  if (hasOwn(body, 'due_date')) next.due_date = cleanDue(body.due_date);

  if (hasOwn(body, 'ticket_id')) {
    const ticket = cleanTicket(body.ticket_id);
    next.ticket_id = ticket?.id || null;
    if (ticket && !next.organization_id && !cur.organization_id) next.organization_id = ticket.organization_id;
  }
  const linkedTicket = hasOwn(next,'ticket_id') ? next.ticket_id : cur.ticket_id;
  const linkedOrg = hasOwn(next,'organization_id') ? next.organization_id : cur.organization_id;
  if(linkedTicket && cleanTicket(linkedTicket).organization_id !== linkedOrg) throw httpError('O pedido pertence a outro cliente.',400);
  if (hasOwn(body, 'position')) next.position = cleanPosition(body.position);
  else if (next.status && next.status !== cur.status) next.position = nextPosition(next.status);
  const changes = Object.keys(next).filter(k => next[k] !== cur[k]);
  if (!changes.length) return { task: get(id), changes };
  const at = nowIso();
  if (next.status && next.status !== cur.status) next.done_at = next.status === 'done' ? at : null;
  next.updated_at = at;
  const cols = Object.keys(next);
  db.prepare(`UPDATE platform_tasks SET ${cols.map(c => `${c} = ?`).join(', ')} WHERE id = ?`).run(...cols.map(c => next[c]), id);
  return { task: get(id), changes, from: cur.status };
}

function remove(id, user = null) {
  const cur = load(id); if(user) taskAccess(user,cur);
  db.prepare('DELETE FROM platform_tasks WHERE id = ?').run(id);
  return { id, title: cur.title };
}

function addComment(user, id, body = {}) {
  taskAccess(user,load(id));
  const text = typeof body.body === 'string' ? body.body.trim() : '';
  if (!text) throw httpError('Escreva o comentário.', 400);
  if (text.length > COMMENT_MAX) throw httpError(`O comentário pode ter no máximo ${COMMENT_MAX} caracteres.`, 400);
  const commentId = crypto.randomUUID();
  const at = nowIso();
  db.prepare('INSERT INTO platform_task_comments (id, task_id, user_id, body, created_at) VALUES (?,?,?,?,?)').run(commentId, id, user.id, text, at);
  db.prepare('UPDATE platform_tasks SET updated_at = ? WHERE id = ?').run(at, id);
  return { id: commentId, author: { id: user.id, name: user.name || '—' }, body: text, created_at: at };
}

function summary(user) {
  const today = new Date();
  const week = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7);
  const tasks=list(user,{assignee:'me',withPeople:false}).tasks.filter(t=>t.status!=='done');
  const open=tasks.length;
  const due=tasks.filter(t=>t.due_date&&t.due_date<=ymd(week)).length;
  return { mine_open: open, mine_due_week: due };
}

module.exports = { TYPES, STATUSES, PRIORITIES, people, list, get, create, update, remove, addComment, summary };
