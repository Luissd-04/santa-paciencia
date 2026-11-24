// Registo de atividade na Área do proprietário: a tabela audit_events da
// organização da sessão, com uma frase em português para cada tipo de evento,
// filtros por pessoa e por tipo, páginas por cursor e exportação CSV.
// O `meta` de cada evento só tem identificadores, papéis e contagens (ver
// auditLog.js); os nomes vêm dos utilizadores e dos registos atuais.
const { db } = require('../config/database');
const { httpError } = require('./httpError');

const ROLE = { owner: 'Proprietário', manager: 'Gestor', staff: 'Funcionário' };
const role = value => ROLE[value] || value || '—';
const plural = (n, one, many) => `${n} ${Number(n) === 1 ? one : many}`;

// Tipos (o prefixo da ação) usados no filtro.
const TYPES = {
  team: 'Equipa',
  ownership: 'Propriedade',
  organization: 'Empresa e conta',
  backup: 'Cópias de segurança',
  reservation: 'Reservas',
  guest: 'Hóspedes',
  accommodation: 'Alojamentos',
  integration: 'Ligações Google',
  settings: 'Definições',
};

// Frase sem o sujeito (a página e o CSV juntam o nome de quem fez).
const LABELS = {
  'team.invited': (e) => `convidou ${e.target || 'uma pessoa'} como ${role(e.meta.role)}`,
  'team.invitation_revoked': (e) => `cancelou o convite de ${e.target || 'uma pessoa'} (${role(e.meta.role)})`,
  'team.role_changed': (e) => e.meta.reason === 'ownership_transfer'
    ? `passou ${e.target || 'uma pessoa'} de ${role(e.meta.from)} a ${role(e.meta.to)} (transferência de propriedade)`
    : `mudou o papel de ${e.target || 'uma pessoa'} de ${role(e.meta.from)} para ${role(e.meta.to)}`,
  'team.member_removed': (e) => `removeu ${e.target || 'uma pessoa'} da equipa (${role(e.meta.role)})`,
  'team.member_left': () => 'saiu da equipa',
  'ownership.transfer_started': (e) => `pediu para passar a propriedade a ${e.target || 'um gestor'}`,
  'ownership.transfer_cancelled': (e) => `cancelou a transferência de propriedade para ${e.target || 'um gestor'}`,
  'ownership.transfer_accepted': (e) => `aceitou passar a ser o proprietário (antes: ${e.target || 'outra pessoa'})`,
  'ownership.transfer_declined': (e) => `recusou passar a ser o proprietário (pedido de ${e.target || 'outra pessoa'})`,
  'ownership.transfer_expired': (e) => `O pedido de propriedade para ${e.target || 'um gestor'} expirou`,
  'organization.company_updated': (e) => `atualizou os dados da empresa${e.meta.fields?.length ? ` (${e.meta.fields.map(f => COMPANY_FIELD[f] || f).join(', ')})` : ''}`,
  'organization.logo_updated': () => 'atualizou o logótipo da organização',
  'organization.logo_removed': () => 'removeu o logótipo da organização',
  'organization.brand_color_updated': (e) => e.meta.color ? `mudou a cor principal para ${e.meta.color}` : 'removeu a cor principal',
  'organization.plan_change_requested': (e) => `pediu a mudança de plano${e.meta.to ? ` para ${e.meta.to}` : ''}`,
  'organization.closure_requested': () => 'pediu o encerramento da conta',
  'backup.exported': (e) => `descarregou a cópia de segurança${Number.isFinite(e.meta.reservations) ? ` (${plural(e.meta.reservations, 'reserva', 'reservas')}, ${plural(e.meta.guests || 0, 'hóspede', 'hóspedes')})` : ''}`,
  'backup.restored': (e) => `restaurou uma cópia de segurança${Number.isFinite(e.meta.reservations) ? ` (${plural(e.meta.reservations, 'reserva', 'reservas')})` : ''}`,
  'backup.restore_rejected': () => 'tentou restaurar uma cópia de segurança (recusada)',
  'reservation.deleted': (e) => `apagou definitivamente a reserva ${e.target_id || ''}${e.meta.check_in ? ` (${e.meta.check_in} a ${e.meta.check_out})` : ''}`.trim(),
  'guest.deleted': () => 'apagou um hóspede',
  'guest.anonymized': () => 'anonimizou os dados de um hóspede',
  'accommodation.deleted': (e) => `apagou um alojamento${e.meta.reservations_deleted ? ` e ${plural(e.meta.reservations_deleted, 'reserva', 'reservas')}` : ''}`,
  'integration.calendar_disconnected': () => 'desligou o Google Calendar',
  'integration.gmail_disconnected': () => 'desligou o Gmail',
  'integration.tasks_disconnected': () => 'desligou o Google Tasks',
  'settings.payment_policy_changed': () => 'mudou a política de pagamentos e cancelamentos',
  'settings.payment_instructions_changed': () => 'mudou as instruções de pagamento sem Stripe',
  'settings.embed_origins_changed': () => 'mudou os sites autorizados a mostrar as reservas',
  'settings.embed_style_changed': () => 'mudou o aspeto das reservas no site',
};
const COMPANY_FIELD = { name: 'nome comercial', legal_name: 'denominação legal', tax_country: 'país', tax_id: 'NIF', fiscal_address: 'morada fiscal',
  billing_email: 'email de faturação', phone: 'telefone', guest_email: 'email para hóspedes' };
// Eventos sem sujeito (feitos pelo sistema).
const NO_ACTOR = new Set(['ownership.transfer_expired']);

function describe(event) {
  const label = LABELS[event.action];
  return label ? label(event) : `fez «${event.action}»`;
}

const PAGE = 50;

// Cursor «created_at|id» (ordem decrescente estável).
function parseCursor(value) {
  if (!value) return null;
  const [at, id] = String(value).split('|');
  if (!at || !id || at.length > 40 || id.length > 80) throw httpError('Página inválida.', 400);
  return { at, id };
}

function where(organizationId, { userId, type } = {}) {
  const sql = ['a.organization_id = ?'];
  const params = [organizationId];
  if (userId) { sql.push('a.user_id = ?'); params.push(String(userId)); }
  if (type) {
    if (!Object.hasOwn(TYPES, type)) throw httpError('Tipo inválido.', 400);
    sql.push("a.action LIKE ? ESCAPE '\\'"); params.push(`${type}.%`);
  }
  return { sql: sql.join(' AND '), params };
}

const SELECT = `SELECT a.id, a.action, a.target_type, a.target_id, a.meta, a.created_at, a.user_id,
    u.name AS user_name, tu.name AS target_user_name, ti.email AS target_invite_email
  FROM audit_events a
  LEFT JOIN users u ON u.id = a.user_id
  LEFT JOIN users tu ON a.target_type = 'user' AND tu.id = a.target_id
  LEFT JOIN invitations ti ON a.target_type = 'invitation' AND ti.id = a.target_id`;

function shape(row) {
  let meta = {};
  try { meta = row.meta ? JSON.parse(row.meta) || {} : {}; } catch { meta = {}; }
  const event = { action: row.action, target_id: row.target_id, meta, target: row.target_user_name || row.target_invite_email || '' };
  const type = row.action.split('.')[0];
  return {
    id: row.id, created_at: row.created_at, action: row.action,
    type, type_label: TYPES[type] || 'Outros',
    actor: NO_ACTOR.has(row.action) ? null : { id: row.user_id, name: row.user_name || (row.user_id ? 'Conta removida' : 'Sistema') },
    text: describe(event),
  };
}

function list(organizationId, { userId, type, before, limit } = {}) {
  const max = Math.min(Math.max(Number(limit) || PAGE, 1), 200);
  const cursor = parseCursor(before);
  const filter = where(organizationId, { userId, type });
  const params = [...filter.params];
  let sql = `${SELECT} WHERE ${filter.sql}`;
  if (cursor) { sql += ' AND (a.created_at < ? OR (a.created_at = ? AND a.id < ?))'; params.push(cursor.at, cursor.at, cursor.id); }
  const rows = db.prepare(`${sql} ORDER BY a.created_at DESC, a.id DESC LIMIT ?`).all(...params, max + 1);
  const more = rows.length > max;
  const page = rows.slice(0, max);
  const last = page.at(-1);
  return { events: page.map(shape), next: more && last ? `${last.created_at}|${last.id}` : null };
}

// Pessoas para o filtro: quem aparece no registo desta organização.
function people(organizationId) {
  return db.prepare(`SELECT DISTINCT u.id, u.name FROM audit_events a JOIN users u ON u.id = a.user_id
    WHERE a.organization_id = ? ORDER BY u.name COLLATE NOCASE`).all(organizationId);
}

// CSV (;) com BOM para o Excel abrir com acentos. Células começadas por
// = + - @ (ou tabulação/retorno) levam um apóstrofo, para não serem fórmulas —
// a mesma regra da exportação da consola (frontend/js/plataforma/workspace.js).
function csvCell(value) {
  const s = String(value ?? '');
  return '"' + (/^(?:\s*[=+\-@]|[\t\r])/.test(s) ? "'" : '') + s.replaceAll('"', '""') + '"';
}

function csv(organizationId, filters = {}) {
  const filter = where(organizationId, filters);
  const rows = db.prepare(`${SELECT} WHERE ${filter.sql} ORDER BY a.created_at DESC, a.id DESC LIMIT 10000`).all(...filter.params).map(shape);
  const lines = [['Data (UTC)', 'Pessoa', 'Tipo', 'Atividade', 'Código'],
    ...rows.map(e => [e.created_at, e.actor?.name || 'Sistema', e.type_label, e.text, e.action])];
  return '﻿' + lines.map(line => line.map(csvCell).join(';')).join('\r\n');
}

module.exports = { TYPES, LABELS, describe, list, people, csv, csvCell };
