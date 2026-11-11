// Comunicados da plataforma aos clientes. Estado calculado:
//   ended      — ended_at preenchido ou ends_at já passou;
//   scheduled  — starts_at ainda no futuro;
//   active     — o resto.
// Público: all, organizations (ids de organizações) ou plans (ids de pacotes,
// via organizations.plan_id).
const { randomUUID } = require('crypto');
const { db } = require('../config/database');
const { httpError } = require('./httpError');

const KINDS = ['maintenance', 'incident', 'news', 'notice'];
const AUDIENCES = ['all', 'organizations', 'plans'];
const TITLE_MAX = 120;
const BODY_MAX = 1000;
const IDS_MAX = 200;

const toIso = value => {
  if (value === null || value === undefined || value === '') return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? undefined : new Date(time).toISOString();
};

function parseIds(json) {
  try { const ids = JSON.parse(json || '[]'); return Array.isArray(ids) ? ids.map(String) : []; } catch { return []; }
}

function statusOf(row, now = Date.now()) {
  if (row.ended_at) return 'ended';
  if (row.ends_at && new Date(row.ends_at).getTime() <= now) return 'ended';
  if (new Date(row.starts_at).getTime() > now) return 'scheduled';
  return 'active';
}

const present = (row, now) => ({
  id: row.id, kind: row.kind, title: row.title, body: row.body,
  starts_at: row.starts_at, ends_at: row.ends_at, ended_at: row.ended_at,
  audience: row.audience, audience_ids: parseIds(row.audience_ids_json),
  show_topbar: !!row.show_topbar, show_help: !!row.show_help, send_email: !!row.send_email,
  status: statusOf(row, now),
  author: row.created_by_user_id ? { id: row.created_by_user_id, name: row.author_name || null } : null,
  created_at: row.created_at, updated_at: row.updated_at,
});

const SELECT = `SELECT a.*, u.name AS author_name FROM announcements a LEFT JOIN users u ON u.id = a.created_by_user_id`;

// Valida e normaliza o corpo de POST/PUT. `partial` não é usado: o editor envia sempre tudo.
function validate(body = {}) {
  const input = body || {};
  const kind = String(input.kind || '');
  if (!KINDS.includes(kind)) throw httpError('Escolha o tipo de comunicado.', 400);
  const title = String(input.title ?? '').trim();
  if (!title) throw httpError('Escreva o título.', 400);
  if (title.length > TITLE_MAX) throw httpError(`O título pode ter no máximo ${TITLE_MAX} caracteres.`, 400);
  const text = String(input.body ?? '').trim();
  if (!text) throw httpError('Escreva a mensagem.', 400);
  if (text.length > BODY_MAX) throw httpError(`A mensagem pode ter no máximo ${BODY_MAX} caracteres.`, 400);
  const startsAt = input.starts_at === undefined || input.starts_at === null || input.starts_at === '' ? new Date().toISOString() : toIso(input.starts_at);
  if (!startsAt) throw httpError('A data de início não é válida.', 400);
  const endsAt = toIso(input.ends_at);
  if (endsAt === undefined) throw httpError('A data de fim não é válida.', 400);
  if (endsAt && new Date(endsAt) <= new Date(startsAt)) throw httpError('O fim tem de ser depois do início.', 400);
  const audience = input.audience === undefined ? 'all' : String(input.audience);
  if (!AUDIENCES.includes(audience)) throw httpError('O público escolhido não é válido.', 400);
  let ids = [];
  if (audience !== 'all') {
    const wanted = Array.isArray(input.audience_ids) ? input.audience_ids : [];
    ids = [...new Set(wanted.map(v => String(v ?? '').trim()).filter(Boolean))];
    if (!ids.length) throw httpError(audience === 'plans' ? 'Escolha pelo menos um pacote.' : 'Escolha pelo menos um cliente.', 400);
    if (ids.length > IDS_MAX) throw httpError(`Pode escolher no máximo ${IDS_MAX} destinatários.`, 400);
  }
  const flag = (value, fallback) => (value === undefined ? fallback : value === true || value === 1 ? 1 : 0);
  const showTopbar = flag(input.show_topbar, 1);
  const showHelp = flag(input.show_help, 1);
  const sendEmail = flag(input.send_email, 0);
  if (!showTopbar && !showHelp && !sendEmail) throw httpError('Escolha onde o comunicado aparece.', 400);
  return { kind, title, body: text, startsAt, endsAt, audience, ids, showTopbar, showHelp, sendEmail };
}

function listAll() {
  const now = Date.now();
  return db.prepare(`${SELECT} ORDER BY a.starts_at DESC, a.created_at DESC`).all().map(row => present(row, now));
}

function getOne(id) {
  const row = db.prepare(`${SELECT} WHERE a.id = ?`).get(String(id));
  if (!row) throw httpError('Comunicado não encontrado.', 404);
  return row;
}

function create(userId, body) {
  const v = validate(body);
  const id = randomUUID();
  db.prepare(`INSERT INTO announcements (id, kind, title, body, starts_at, ends_at, audience, audience_ids_json,
    show_topbar, show_help, send_email, created_by_user_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, v.kind, v.title, v.body, v.startsAt, v.endsAt, v.audience, JSON.stringify(v.ids), v.showTopbar, v.showHelp, v.sendEmail, userId || null);
  return present(getOne(id));
}

function update(id, body) {
  const current = getOne(id);
  if (statusOf(current) === 'ended') throw httpError('Este comunicado já terminou. Crie um novo.', 409);
  const v = validate(body);
  db.prepare(`UPDATE announcements SET kind=?, title=?, body=?, starts_at=?, ends_at=?, audience=?, audience_ids_json=?,
    show_topbar=?, show_help=?, send_email=?, updated_at=datetime('now') WHERE id=?`)
    .run(v.kind, v.title, v.body, v.startsAt, v.endsAt, v.audience, JSON.stringify(v.ids), v.showTopbar, v.showHelp, v.sendEmail, current.id);
  return present(getOne(id));
}

function end(id) {
  const current = getOne(id);
  if (statusOf(current) === 'ended') throw httpError('Este comunicado já terminou.', 409);
  db.prepare("UPDATE announcements SET ended_at=?, updated_at=datetime('now') WHERE id=?").run(new Date().toISOString(), current.id);
  return present(getOne(id));
}

function remove(id) {
  const current = getOne(id);
  db.prepare('DELETE FROM announcement_dismissals WHERE announcement_id = ?').run(current.id);
  db.prepare('DELETE FROM announcements WHERE id = ?').run(current.id);
  return { id: current.id, title: current.title };
}

// O pacote da organização (organizations.plan_id é criado noutra migração).
function planOf(organizationId) {
  if (!organizationId) return null;
  if (!db.pragma('table_info(organizations)').some(c => c.name === 'plan_id')) return null;
  const row = db.prepare('SELECT plan_id FROM organizations WHERE id = ?').get(organizationId);
  return row?.plan_id === null || row?.plan_id === undefined ? null : String(row.plan_id);
}

function reaches(row, organizationId, planId) {
  if (row.audience === 'all') return true;
  const ids = parseIds(row.audience_ids_json);
  if (row.audience === 'organizations') return ids.includes(String(organizationId));
  if (row.audience === 'plans') return planId !== null && ids.includes(planId);
  return false;
}

// Comunicados ativos que chegam a esta organização, com `dismissed` por pessoa.
function listForSession({ organizationId, userId }) {
  const now = Date.now();
  const planId = planOf(organizationId);
  const closed = new Set(db.prepare('SELECT announcement_id FROM announcement_dismissals WHERE user_id = ?').all(userId).map(r => r.announcement_id));
  return db.prepare('SELECT * FROM announcements ORDER BY starts_at DESC, created_at DESC').all()
    .filter(row => statusOf(row, now) === 'active' && reaches(row, organizationId, planId))
    .map(row => ({
      id: row.id, kind: row.kind, title: row.title, body: row.body, starts_at: row.starts_at, ends_at: row.ends_at,
      show_topbar: !!row.show_topbar, show_help: !!row.show_help, dismissed: closed.has(row.id),
    }));
}

// Fechar só vale para comunicados que esta organização vê; outro id responde 404.
function dismiss({ organizationId, userId, id }) {
  const row = db.prepare('SELECT * FROM announcements WHERE id = ?').get(String(id));
  if (!row || statusOf(row) !== 'active' || !reaches(row, organizationId, planOf(organizationId))) throw httpError('Comunicado não encontrado.', 404);
  db.prepare('INSERT OR IGNORE INTO announcement_dismissals (announcement_id, user_id) VALUES (?, ?)').run(row.id, userId);
  return { id: row.id, dismissed: true };
}

module.exports = { KINDS, AUDIENCES, statusOf, listAll, create, update, end, remove, listForSession, dismiss };
