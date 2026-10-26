const { db } = require('../config/database');
const { buildInvitationUrl, createInvitation, ensureRole, listInvitations, listMembers } = require('../services/orgService');
const { getUserByEmail, isValidEmail } = require('../services/authService');
const { recordAudit } = require('../services/auditLog');

function getOverview(req, res) {
  const organizationId = req.user.organization_id;
  res.json({
    success: true,
    data: {
      members: listMembers(organizationId),
      invitations: listInvitations(organizationId),
    }
  });
}

function getMembers(req, res) {
  const organizationId = req.user.organization_id;
  res.json({
    success: true,
    data: {
      members: listMembers(organizationId).filter(member => member.active),
    }
  });
}

async function invite(req, res) {
  const organizationId = req.user.organization_id;
  const email = String(req.body.email || '').trim().toLowerCase();
  const role = String(req.body.role || 'staff');

  if (!isValidEmail(email)) {
    return res.status(400).json({ success: false, error: 'Indica um email válido.' });
  }

  try {
    ensureRole(role);
    if (role === 'owner') throw new Error('Convide como gestor. A transferência de propriedade requer um procedimento próprio.');
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }

  const user = getUserByEmail(email);
  if (user && require('../services/orgService').getMembershipByUserAndOrganization(user.id, organizationId)) {
    return res.status(409).json({
      success: false,
      error: 'Esta conta já pertence à equipa.',
    });
  }

  try {
    const invitation = createInvitation({
      organizationId,
      email,
      role,
      invitedByUserId: req.user.id,
    });
    const inviteUrl = buildInvitationUrl(invitation.token);
    recordAudit({ organizationId, userId: req.user.id, action: 'team.invited', targetType: 'invitation', targetId: invitation.id, meta: { role } });

    const emailResult = await require('../services/accountEmails').sendTeamInvitation(organizationId, {
      to: email, organizationName: req.user.organization_name, role, url: inviteUrl,
    });
    const emailSent = !!emailResult;

    res.status(201).json({
      success: true,
      data: {
        invitation: {
          ...invitation,
          invite_url: inviteUrl,
          email_sent: emailSent,
        }
      }
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
}

function updateMemberRole(req, res) {
  const organizationId = req.user.organization_id;
  const membership = db.prepare(`
    SELECT * FROM memberships WHERE id = ? AND organization_id = ?
  `).get(req.params.id, organizationId);

  if (!membership) return res.status(404).json({ success: false, error: 'Membro não encontrado.' });
  if (membership.role === 'owner') {
    return res.status(400).json({ success: false, error: 'O papel de proprietário não pode ser alterado aqui.' });
  }

  try {
    ensureRole(req.body.role);
    if (req.body.role === 'owner') throw new Error('A transferência de propriedade requer um procedimento próprio.');
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }

  db.prepare(`
    UPDATE memberships SET role = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(req.body.role, membership.id);
  recordAudit({ organizationId, userId: req.user.id, action: 'team.role_changed', targetType: 'user', targetId: membership.user_id,
    meta: { from: membership.role, to: req.body.role } });

  res.json({ success: true });
}

function removeMember(req, res) {
  const organizationId = req.user.organization_id;
  const membership = db.prepare(`
    SELECT * FROM memberships WHERE id = ? AND organization_id = ?
  `).get(req.params.id, organizationId);

  if (!membership) return res.status(404).json({ success: false, error: 'Membro não encontrado.' });
  if (membership.role === 'owner') {
    return res.status(400).json({ success: false, error: 'O proprietário não pode ser removido.' });
  }

  db.transaction(() => {
    db.prepare('DELETE FROM push_subscriptions WHERE organization_id = ? AND user_id = ?').run(organizationId, membership.user_id);
    db.prepare('DELETE FROM auth_sessions WHERE organization_id = ? AND user_id = ?').run(organizationId, membership.user_id);
    db.prepare('DELETE FROM google_calendar_connections WHERE organization_id = ? AND user_id = ?').run(organizationId, membership.user_id);
    db.prepare('DELETE FROM memberships WHERE id = ?').run(membership.id);
    recordAudit({ organizationId, userId: req.user.id, action: 'team.member_removed', targetType: 'user', targetId: membership.user_id, meta: { role: membership.role } });
  })();
  res.json({ success: true });
}

function removeInvitation(req, res) {
  const organizationId = req.user.organization_id;
  const invitation = db.prepare(`
    SELECT * FROM invitations WHERE id = ? AND organization_id = ?
  `).get(req.params.id, organizationId);

  if (!invitation) return res.status(404).json({ success: false, error: 'Convite não encontrado.' });
  db.prepare('DELETE FROM invitations WHERE id = ?').run(invitation.id);
  recordAudit({ organizationId, userId: req.user.id, action: 'team.invitation_revoked', targetType: 'invitation', targetId: invitation.id, meta: { role: invitation.role } });
  res.json({ success: true });
}

module.exports = {
  getOverview,
  getMembers,
  invite,
  removeInvitation,
  removeMember,
  updateMemberRole,
};
