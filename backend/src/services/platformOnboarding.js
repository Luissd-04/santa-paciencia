const { db } = require('../config/database');
const { httpError } = require('./httpError');
const orgs = require('./orgService');
const { isValidEmail, normalizeEmail } = require('./authService');

function create(input = {}, userId) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw httpError('Pedido inválido.', 400);
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > 120 || /[\x00-\x1f\x7f]/.test(name)) throw httpError('Indique um nome com até 120 caracteres.', 400);
  if (typeof input.owner_email !== 'string' || input.owner_email.length > 254 || !isValidEmail(input.owner_email)) throw httpError('Indique um email válido para o proprietário.', 400);
  const status = input.status ?? 'trial';
  if (!['active', 'trial'].includes(status)) throw httpError('Estado inicial inválido.', 400);
  const planId = input.plan_id || null;
  return db.transaction(() => {
    if (planId) {
      const plan = require('./plansService').getPlan(planId);
      if (plan.max_members === 0) throw httpError('O pacote tem de permitir pelo menos o proprietário.', 400);
    }
    const org = orgs.createOrganization(name);
    db.prepare('UPDATE organizations SET status = ?, plan_id = ? WHERE id = ?').run(status, planId, org.id);
    const invitation = orgs.createInvitation({ organizationId: org.id, email: normalizeEmail(input.owner_email), role: 'owner', invitedByUserId: userId });
    require('./platformService').invalidateSnapshot();
    return { id: org.id, name, status, invitation_url: orgs.buildInvitationUrl(invitation.token), expires_at: invitation.expires_at };
  }).immediate();
}
module.exports = { create };
