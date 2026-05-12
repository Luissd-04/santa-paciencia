const { db } = require('../config/database');
const transporter = (() => {
  try { return require('../config/email'); } catch { return null; }
})();
const { buildInvitationUrl, createInvitation, ensureRole, listInvitations, listMembers } = require('../services/orgService');
const { getUserByEmail, isValidEmail } = require('../services/authService');

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
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }

  const user = getUserByEmail(email);
  if (user) {
    return res.status(409).json({
      success: false,
      error: 'Este email já pertence a uma conta existente. Para já, usa um email novo para convite.',
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

    let emailSent = false;
    if (transporter && process.env.EMAIL_ENABLED !== 'false' && process.env.EMAIL_FROM) {
      await transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to: email,
        subject: `Convite para a equipa ${req.user.organization_name} — Santa Paciência`,
        html: `
          <div style="font-family:Arial,sans-serif;padding:24px;color:#2a2520;">
            <h2>Foste convidado para ${req.user.organization_name}</h2>
            <p>O teu papel será <strong>${role}</strong>.</p>
            <p><a href="${inviteUrl}">Aceitar convite</a></p>
            <p>Este link expira em 7 dias.</p>
          </div>
        `
      });
      emailSent = true;
    }

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
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }

  db.prepare(`
    UPDATE memberships SET role = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(req.body.role, membership.id);

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

  db.prepare('DELETE FROM memberships WHERE id = ?').run(membership.id);
  res.json({ success: true });
}

function removeInvitation(req, res) {
  const organizationId = req.user.organization_id;
  const invitation = db.prepare(`
    SELECT * FROM invitations WHERE id = ? AND organization_id = ?
  `).get(req.params.id, organizationId);

  if (!invitation) return res.status(404).json({ success: false, error: 'Convite não encontrado.' });
  db.prepare('DELETE FROM invitations WHERE id = ?').run(invitation.id);
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
