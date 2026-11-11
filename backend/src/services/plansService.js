// Pacotes (consola da plataforma) e limites por organização.
// Um limite NULL quer dizer «sem limite»; uma organização sem pacote
// (plan_id NULL) não tem limites. Só metadados: contagens e nomes de pacotes.
const { randomUUID } = require('crypto');
const { db } = require('../config/database');
const { httpError } = require('./httpError');

const NAME_MAX = 60;
const LIMIT_MAX = 100000;
const FEATURES_MAX = 4000;
const NEAR_LIMIT = 0.8;

function parseFeatures(json) {
  try {
    const value = JSON.parse(json || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

function serialize(row, organizations = 0) {
  return {
    id: row.id, name: row.name,
    max_accommodations: row.max_accommodations, max_members: row.max_members,
    features: parseFeatures(row.features_json), sort: row.sort,
    organizations,
  };
}

function orgCounts() {
  return new Map(db.prepare('SELECT plan_id, COUNT(*) AS n FROM organizations WHERE plan_id IS NOT NULL GROUP BY plan_id').all().map(r => [r.plan_id, r.n]));
}

function listPlans() {
  const counts = orgCounts();
  return db.prepare('SELECT * FROM plans ORDER BY sort, name COLLATE NOCASE').all().map(row => serialize(row, counts.get(row.id) || 0));
}

function getPlan(id) {
  const row = db.prepare('SELECT * FROM plans WHERE id = ?').get(String(id ?? ''));
  if (!row) throw httpError('Pacote não encontrado.', 404);
  return serialize(row, orgCounts().get(row.id) || 0);
}

// Limite: inteiro ≥ 0 ou null (sem limite). `undefined` = campo ausente.
function parseLimit(value, label) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const n = typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : value;
  if (!Number.isInteger(n) || n < 0 || n > LIMIT_MAX) throw httpError(`O limite de ${label} tem de ser um número inteiro entre 0 e ${LIMIT_MAX}, ou vazio para sem limite.`, 400);
  return n;
}

function validate(input, { partial }) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw httpError('Pedido inválido.', 400);
  const out = {};
  if (input.name !== undefined || !partial) {
    if (typeof input.name !== 'string' || !input.name.trim()) throw httpError('O nome do pacote é obrigatório.', 400);
    const name = input.name.trim();
    // eslint-disable-next-line no-control-regex
    if (name.length > NAME_MAX || /[\x00-\x1F\x7F]/.test(name)) throw httpError(`O nome do pacote tem de ter até ${NAME_MAX} caracteres, sem caracteres de controlo.`, 400);
    out.name = name;
  }
  const acc = parseLimit(input.max_accommodations, 'alojamentos');
  if (acc !== undefined) out.max_accommodations = acc;
  else if (!partial) out.max_accommodations = null;
  const members = parseLimit(input.max_members, 'membros');
  if (members !== undefined) out.max_members = members;
  else if (!partial) out.max_members = null;
  if (input.features !== undefined || !partial) {
    const features = input.features ?? {};
    if (!features || typeof features !== 'object' || Array.isArray(features)) throw httpError('As funcionalidades têm de ser um objeto.', 400);
    for (const [key, value] of Object.entries(features)) {
      if (!/^[a-z][a-z0-9_]{0,39}$/.test(key)) throw httpError('Nome de funcionalidade inválido.', 400);
      if (!['boolean', 'string', 'number'].includes(typeof value) || (typeof value === 'string' && value.length > 60)) {
        throw httpError('Cada funcionalidade tem de ser verdadeiro/falso, um número ou um texto curto.', 400);
      }
    }
    const json = JSON.stringify(features);
    if (json.length > FEATURES_MAX) throw httpError('Demasiadas funcionalidades.', 400);
    out.features_json = json;
  }
  if (input.sort !== undefined || !partial) {
    const sort = input.sort ?? 0;
    if (!Number.isInteger(sort) || Math.abs(sort) > 10000) throw httpError('A ordem tem de ser um número inteiro.', 400);
    out.sort = sort;
  }
  return out;
}

function nameTaken(name, exceptId = '') {
  return !!db.prepare('SELECT 1 FROM plans WHERE name = ? COLLATE NOCASE AND id != ?').get(name, exceptId);
}

function createPlan(input) {
  const data = validate(input, { partial: false });
  if (nameTaken(data.name)) throw httpError('Já existe um pacote com esse nome.', 409);
  const id = randomUUID();
  db.prepare(`INSERT INTO plans (id, name, max_accommodations, max_members, features_json, sort)
    VALUES (?, ?, ?, ?, ?, ?)`).run(id, data.name, data.max_accommodations, data.max_members, data.features_json, data.sort);
  return getPlan(id);
}

function updatePlan(id, input) {
  const current = getPlan(id);
  const data = validate(input, { partial: true });
  if (data.name !== undefined && nameTaken(data.name, current.id)) throw httpError('Já existe um pacote com esse nome.', 409);
  const fields = Object.keys(data);
  if (fields.length) {
    db.prepare(`UPDATE plans SET ${fields.map(f => `${f} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`)
      .run(...fields.map(f => data[f]), current.id);
  }
  return getPlan(current.id);
}

function deletePlan(id) {
  const plan = getPlan(id);
  if (plan.organizations > 0) throw httpError(`Este pacote está atribuído a ${plan.organizations} organização(ões). Mude-as de pacote antes de o apagar.`, 409);
  db.prepare('DELETE FROM plans WHERE id = ?').run(plan.id);
  return plan;
}

// ── Limites por organização ──

function usage(organizationId) {
  return {
    accommodations: db.prepare('SELECT COUNT(*) AS n FROM accommodations WHERE organization_id = ?').get(organizationId).n,
    members: db.prepare('SELECT COUNT(*) AS n FROM memberships WHERE organization_id = ? AND active = 1').get(organizationId).n,
  };
}

function planOf(organizationId) {
  return db.prepare(`SELECT p.* FROM organizations o JOIN plans p ON p.id = o.plan_id WHERE o.id = ?`).get(organizationId) || null;
}

// Para o /auth/me: o pacote da organização aberta e o uso atual, ou null.
function organizationPlan(organizationId) {
  if (!organizationId) return null;
  const plan = planOf(organizationId);
  if (!plan) return null;
  return { name: plan.name, max_accommodations: plan.max_accommodations, max_members: plan.max_members, usage: usage(organizationId) };
}

const LIMIT_LABEL = { accommodations: 'alojamentos', members: 'membros' };

// Lança 403 { limit } se acrescentar `extra` ultrapassa o limite do pacote.
// `pending` soma o que já está prometido (ex.: convites por aceitar).
function assertWithinLimit(organizationId, kind, { pending = 0 } = {}) {
  const plan = planOf(organizationId);
  const max = plan?.[`max_${kind}`];
  if (max === null || max === undefined) return;
  const used = usage(organizationId)[kind] + pending;
  if (used + 1 > max) {
    throw httpError(`Atingiu o limite de ${max} ${LIMIT_LABEL[kind]} do pacote «${plan.name}». Fale connosco para mudar de pacote.`, 403, { limit: kind });
  }
}

function pendingInvitations(organizationId) {
  return db.prepare(`SELECT COUNT(*) AS n FROM invitations WHERE organization_id = ? AND accepted_at IS NULL
    AND datetime(expires_at) > datetime('now')`).get(organizationId).n;
}

// Organizações com uso ≥ 80% de algum limite do seu pacote.
function nearLimit() {
  const rows = db.prepare(`SELECT o.id AS org_id, o.name AS org_name, p.id AS plan_id, p.name AS plan_name,
      p.max_accommodations, p.max_members
    FROM organizations o JOIN plans p ON p.id = o.plan_id
    WHERE p.max_accommodations IS NOT NULL OR p.max_members IS NOT NULL
    ORDER BY o.name COLLATE NOCASE, o.id`).all();
  const near = (used, max) => max !== null && (max === 0 ? true : used / max >= NEAR_LIMIT);
  const out = [];
  for (const r of rows) {
    const u = usage(r.org_id);
    if (!near(u.accommodations, r.max_accommodations) && !near(u.members, r.max_members)) continue;
    out.push({
      organization: { id: r.org_id, name: r.org_name },
      plan: { id: r.plan_id, name: r.plan_name },
      accommodations: { used: u.accommodations, max: r.max_accommodations },
      members: { used: u.members, max: r.max_members },
    });
  }
  return out;
}

module.exports = {
  listPlans, getPlan, createPlan, updatePlan, deletePlan,
  usage, organizationPlan, assertWithinLimit, pendingInvitations, nearLimit,
};
