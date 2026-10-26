// Emails de conta (recuperar palavra-passe, alterar o email de acesso,
// convite para a equipa, teste do Gmail): mesmo desenho dos emails aos
// hóspedes e o mesmo envio (remetente, EMAIL_ENABLED, validações).
const { db } = require('../config/database');

function send(organizationId, { to, subject, title, body, cta = null, footer = '' }) {
  const emailService = require('./emailService');
  const composer = require('./emailComposer');
  const html = emailService.baseTemplate(`
    ${composer.buildReservationTitle(title, '•')}
    ${body}
    ${cta ? composer.buildCtaBlock(cta.url, cta.label) : ''}
    ${footer}
  `, emailService.getEmailSettings(null, organizationId));
  return emailService.sendMail(organizationId, { to, subject, html });
}
const esc = value => require('./emailComposer').escapeHtml(value);

// Sai pela primeira organização do utilizador com o Gmail ligado.
async function sendPasswordReset(user, { to, url: resetUrl }) {
  const sender = db.prepare(`SELECT m.organization_id FROM memberships m
    JOIN google_email_connections c ON c.organization_id = m.organization_id
    WHERE m.user_id = ? AND m.active = 1 ORDER BY m.created_at LIMIT 1`).get(user.id);
  if (!sender) throw new Error('Sem remetente de email configurado para recuperação de conta.');
  return send(sender.organization_id, {
    to, subject: 'Recuperar palavra-passe — Santa Paciência', title: 'Recuperar palavra-passe',
    body: `<p>Olá, ${esc(String(user.name || '').split(' ')[0])}.</p>
      <p>Recebemos um pedido para recuperar a tua palavra-passe.</p>`,
    cta: { url: resetUrl, label: 'Definir nova palavra-passe' },
    footer: '<p style="color:#888;font-size:13px;">Este link expira em 1 hora. Se não pediste a recuperação, ignora este email — a tua conta está segura.</p>',
  });
}

function sendEmailChangeConfirmation(organizationId, { to, url }) {
  return send(organizationId, {
    to, subject: 'Confirmar alteração de email', title: 'Confirmar novo endereço',
    body: '<p>Confirme a alteração do email da sua conta. O link expira em 30 minutos e exige sessão iniciada na mesma conta.</p>',
    cta: { url, label: 'Confirmar endereço' },
  });
}

function sendEmailChangedNotice(organizationId, { to }) {
  return send(organizationId, {
    to, subject: 'Email de acesso alterado', title: 'Email de acesso alterado',
    body: '<p>O email de acesso da sua conta foi alterado após confirmação do novo endereço. Se não reconhece esta alteração, contacte o responsável pela sua organização.</p>',
  });
}

function sendTeamInvitation(organizationId, { to, organizationName, role, url }) {
  return send(organizationId, {
    to, subject: `Convite para a equipa ${organizationName} — Santa Paciência`, title: `Foste convidado para ${organizationName}`,
    body: `<p>O teu papel será <strong>${esc(role)}</strong>.</p>`,
    cta: { url, label: 'Aceitar convite' }, footer: '<p>Este link expira em 7 dias.</p>',
  });
}

function sendGmailTest(organizationId, { to }) {
  return send(organizationId, {
    to, subject: 'Teste de email - Santa Paciência', title: 'Teste de email',
    body: '<p>O email está a funcionar corretamente a partir do Gmail ligado.</p>',
  });
}

module.exports = { sendPasswordReset, sendEmailChangeConfirmation, sendEmailChangedNotice, sendTeamInvitation, sendGmailTest };
