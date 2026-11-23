// Transferência da propriedade de uma organização (Área do proprietário →
// Propriedade e encerramento). O proprietário escolhe um gestor ativo; fica
// um pedido pendente (um por organização, 7 dias) com um token guardado só em
// resumo. O destinatário recebe um email (se a organização tiver o Gmail
// ligado) e, sempre, um aviso no sino; aceita dentro da aplicação. Ao aceitar,
// os papéis trocam numa só transação: o destinatário passa a proprietário e o
// antigo proprietário a gestor. Nada muda antes disso.
const crypto = require('crypto');
const { db } = require('../config/database');
const { httpError } = require('./httpError');
const { recordAudit } = require('./auditLog');

const VALID_DAYS = 7;

const isoNow = () => new Date().toISOString();

// Pendentes fora de prazo passam a expiradas (e ficam no registo).
function expireStale(organizationId = null) {
  const stale = db.prepare(`SELECT * FROM ownership_transfers WHERE status = 'pending' AND expires_at <= ?
    ${organizationId ? 'AND organization_id = ?' : ''}`).all(...[isoNow(), organizationId].filter(Boolean));
  for (const t of stale) {
    const changed = db.prepare("UPDATE ownership_transfers SET status = 'expired', resolved_at = ? WHERE id = ? AND status = 'pending'").run(isoNow(), t.id).changes;
    if (changed) recordAudit({ organizationId: t.organization_id, userId: null, action: 'ownership.transfer_expired', targetType: 'user', targetId: t.to_user_id });
  }
}

function shape(row) {
  if (!row) return null;
  return {
    id: row.id, status: row.status, created_at: row.created_at, expires_at: row.expires_at,
    from: { id: row.from_user_id, name: row.from_name || '' },
    to: { id: row.to_user_id, name: row.to_name || '', email: row.to_email || '' },
    organization: { id: row.organization_id, name: row.organization_name || '' },
  };
}

const SELECT = `SELECT t.*, f.name AS from_name, u.name AS to_name, u.email AS to_email, o.name AS organization_name
  FROM ownership_transfers t JOIN users f ON f.id = t.from_user_id JOIN users u ON u.id = t.to_user_id JOIN organizations o ON o.id = t.organization_id`;

function pendingForOrganization(organizationId) {
  expireStale(organizationId);
  return shape(db.prepare(`${SELECT} WHERE t.organization_id = ? AND t.status = 'pending'`).get(organizationId));
}

// O pedido que espera por esta pessoa nesta organização (sino e /proprietario).
function pendingForUser(user) {
  if (!user?.id || !user.organization_id) return null;
  expireStale(user.organization_id);
  return shape(db.prepare(`${SELECT} WHERE t.organization_id = ? AND t.to_user_id = ? AND t.status = 'pending'`).get(user.organization_id, user.id));
}

// Gestores ativos que podem receber a propriedade.
function candidates(organizationId) {
  return db.prepare(`SELECT m.id AS membership_id, u.id AS user_id, u.name, u.email FROM memberships m JOIN users u ON u.id = m.user_id
    WHERE m.organization_id = ? AND m.role = 'manager' AND m.active = 1 AND u.active = 1 ORDER BY u.name COLLATE NOCASE`).all(organizationId);
}

async function start(owner, { membershipId } = {}) {
  const organizationId = owner.organization_id;
  if (owner.role !== 'owner') throw httpError('Só o proprietário pode transferir a propriedade.', 403);
  const target = db.prepare(`SELECT m.*, u.name, u.email, u.active AS user_active FROM memberships m JOIN users u ON u.id = m.user_id
    WHERE m.id = ? AND m.organization_id = ?`).get(String(membershipId || ''), organizationId);
  if (!target || !target.active || !target.user_active) throw httpError('Membro não encontrado.', 404);
  if (target.user_id === owner.id) throw httpError('Já é o proprietário.', 400);
  if (target.role !== 'manager') throw httpError('Só um gestor ativo pode receber a propriedade. Mude primeiro o papel desta pessoa para Gestor.', 400);
  expireStale(organizationId);
  if (pendingForOrganization(organizationId)) throw httpError('Já há uma transferência pendente. Cancele-a antes de começar outra.', 409);

  const id = crypto.randomUUID();
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + VALID_DAYS * 86400000).toISOString();
  db.transaction(() => {
    db.prepare(`INSERT INTO ownership_transfers (id, organization_id, from_user_id, to_user_id, token_hash, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)`).run(id, organizationId, owner.id, target.user_id, require('./authService').digestToken(token), expiresAt);
    recordAudit({ organizationId, userId: owner.id, action: 'ownership.transfer_started', targetType: 'user', targetId: target.user_id });
  }).immediate();

  let emailSent = false;
  try {
    const url = require('./publicLinks').absoluteUrl(`/proprietario?transferencia=${token}`);
    emailSent = Boolean(await require('./accountEmails').sendOwnershipTransfer(organizationId, {
      to: target.email, ownerName: owner.name, organizationName: owner.organization_name, url, expiresAt,
    }));
  } catch { emailSent = false; }
  return { transfer: pendingForOrganization(organizationId), email_sent: emailSent };
}

function cancel(owner) {
  const pending = pendingForOrganization(owner.organization_id);
  if (!pending) throw httpError('Não há nenhuma transferência pendente.', 404);
  db.prepare("UPDATE ownership_transfers SET status = 'cancelled', resolved_at = ? WHERE id = ? AND status = 'pending'").run(isoNow(), pending.id);
  recordAudit({ organizationId: owner.organization_id, userId: owner.id, action: 'ownership.transfer_cancelled', targetType: 'user', targetId: pending.to.id });
  return { cancelled: true };
}

// O pedido do destinatário: pelo id (sino) ou pelo token (link do email);
// em ambos os casos tem de ser a pessoa com a sessão iniciada.
function findForTarget(user, { id, token } = {}) {
  expireStale(user.organization_id);
  let row = null;
  if (token) row = db.prepare('SELECT * FROM ownership_transfers WHERE token_hash = ?').get(require('./authService').digestToken(String(token)));
  else if (id) row = db.prepare('SELECT * FROM ownership_transfers WHERE id = ?').get(String(id));
  if (!row || row.to_user_id !== user.id || row.organization_id !== user.organization_id) throw httpError('Pedido de transferência não encontrado.', 404);
  if (row.status === 'expired') throw httpError('Este pedido de transferência expirou.', 410);
  if (row.status !== 'pending') throw httpError('Este pedido de transferência já não está pendente.', 409);
  return row;
}

function accept(user, ref) {
  const row = findForTarget(user, ref);
  db.transaction(() => {
    const fresh = db.prepare("SELECT * FROM ownership_transfers WHERE id = ? AND status = 'pending'").get(row.id);
    if (!fresh || fresh.expires_at <= isoNow()) throw httpError('Este pedido de transferência já não está pendente.', 409);
    const target = db.prepare('SELECT * FROM memberships WHERE organization_id = ? AND user_id = ? AND active = 1').get(row.organization_id, row.to_user_id);
    const owner = db.prepare('SELECT * FROM memberships WHERE organization_id = ? AND user_id = ? AND active = 1').get(row.organization_id, row.from_user_id);
    if (!target || target.role !== 'manager') throw httpError('Só um gestor ativo pode receber a propriedade.', 409);
    if (!owner || owner.role !== 'owner') throw httpError('Quem pediu a transferência já não é o proprietário.', 409);
    db.prepare("UPDATE memberships SET role = 'owner', updated_at = datetime('now') WHERE id = ? AND role = 'manager'").run(target.id);
    db.prepare("UPDATE memberships SET role = 'manager', updated_at = datetime('now') WHERE id = ? AND role = 'owner'").run(owner.id);
    db.prepare("UPDATE ownership_transfers SET status = 'accepted', resolved_at = ? WHERE id = ?").run(isoNow(), row.id);
    recordAudit({ organizationId: row.organization_id, userId: row.to_user_id, action: 'ownership.transfer_accepted', targetType: 'user', targetId: row.from_user_id });
    recordAudit({ organizationId: row.organization_id, userId: row.to_user_id, action: 'team.role_changed', targetType: 'user', targetId: row.to_user_id, meta: { from: 'manager', to: 'owner', reason: 'ownership_transfer' } });
    recordAudit({ organizationId: row.organization_id, userId: row.to_user_id, action: 'team.role_changed', targetType: 'user', targetId: row.from_user_id, meta: { from: 'owner', to: 'manager', reason: 'ownership_transfer' } });
  }).immediate();
  return { accepted: true };
}

function decline(user, ref) {
  const row = findForTarget(user, ref);
  db.prepare("UPDATE ownership_transfers SET status = 'declined', resolved_at = ? WHERE id = ? AND status = 'pending'").run(isoNow(), row.id);
  recordAudit({ organizationId: row.organization_id, userId: user.id, action: 'ownership.transfer_declined', targetType: 'user', targetId: row.from_user_id });
  return { declined: true };
}

module.exports = { VALID_DAYS, expireStale, pendingForOrganization, pendingForUser, candidates, start, cancel, accept, decline };
