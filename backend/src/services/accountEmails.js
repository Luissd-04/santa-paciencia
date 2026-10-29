// Emails de conta (recuperar palavra-passe, alterar o email de acesso,
// convite para a equipa, teste do Gmail): mesmo desenho dos emails aos
// hóspedes e o mesmo envio (remetente, EMAIL_ENABLED, validações).
const { db } = require('../config/database');

// Mesmo desenho dos outros emails, sem redes sociais (email de conta) e
// sempre a tratar por "você". Devolve { subject, html } sem enviar.
function compose(organizationId, { subject, title, eyebrow = '', tone = 'brand', paragraphs = [], note = null, cta = null, small = '' }) {
  const emailService = require('./emailService');
  const composer = require('./emailComposer');
  const paragraph = html => `<p style="font-family:${composer.SERIF};font-size:16px;line-height:1.7;color:${composer.PALETTE.textSoft};margin:0 0 14px;">${html}</p>`;
  const html = emailService.baseTemplate(`
    ${composer.buildTitle({ eyebrow, tone, headline: title })}
    ${paragraphs.map(paragraph).join('')}
    ${note ? composer.buildNote(note) : ''}
    ${cta ? composer.buildButton(cta.url, cta.label) : ''}
    ${small ? `<p style="font-family:${composer.SERIF};font-size:14px;line-height:1.6;color:${composer.PALETTE.muted};margin:16px 0 0;">${small}</p>` : ''}
  `, emailService.getEmailSettings(null, organizationId), { social: false });
  return { subject, html };
}
function send(organizationId, to, message) {
  return require('./emailService').sendMail(organizationId, { to, ...compose(organizationId, message) });
}
const esc = value => require('./emailComposer').escapeHtml(value);

// Papéis da equipa em português e o que cada um permite.
const ROLES = {
  owner:   ['proprietário', 'vai poder gerir tudo, incluindo a equipa e as definições'],
  manager: ['gestor', 'vai poder gerir reservas, hóspedes e pagamentos'],
  staff:   ['membro da equipa', 'vai poder acompanhar as reservas e as tarefas do dia'],
};

// Conteúdo de cada email de conta (também usado pelos exemplos, emailSamples).
const MESSAGES = {
  passwordReset: ({ name, url }) => ({
    subject: 'Recuperar palavra-passe — Santa Paciência', title: 'Recuperar a palavra-passe',
    paragraphs: [
      `Olá, ${esc(String(name || '').split(' ')[0])}.`,
      'Recebemos um pedido para definir uma nova palavra-passe para a sua conta.',
    ],
    cta: { url, label: 'Definir nova palavra-passe' },
    small: 'O link é válido durante 1 hora. Se não fez este pedido, pode ignorar este email: a palavra-passe atual continua a funcionar.',
  }),
  emailChangeConfirmation: ({ to, url }) => ({
    subject: 'Confirmar alteração de email', title: 'Confirme o novo email',
    paragraphs: [`Para começar a usar <strong>${esc(to)}</strong> na sua conta, confirme o endereço.`],
    cta: { url, label: 'Confirmar endereço' },
    small: 'O link é válido durante 30 minutos e abre com a sessão iniciada na mesma conta.',
  }),
  emailChanged: () => ({
    subject: 'Email de acesso alterado', title: 'O email de acesso mudou',
    paragraphs: ['O email de acesso da sua conta foi alterado, depois de confirmado o novo endereço.'],
    note: { tone: 'warn', heading: 'Não foi você?', html: 'Contacte já o responsável pela sua organização para bloquear o acesso.' },
  }),
  teamInvitation: ({ organizationName, role, url }) => {
    const [roleLabel, roleCan] = ROLES[role] || [String(role || ''), ''];
    return {
      subject: `Convite para a equipa ${organizationName} — Santa Paciência`, title: `Convite para a equipa de ${organizationName}`,
      paragraphs: [`Foi convidado para a equipa como <strong>${esc(roleLabel)}</strong>${roleCan ? `: ${esc(roleCan)}` : ''}.`],
      cta: { url, label: 'Aceitar convite' },
      small: 'O convite é válido durante 7 dias.',
    };
  },
  gmailTest: () => ({
    subject: 'Teste de email - Santa Paciência', title: 'O envio de emails está a funcionar',
    eyebrow: 'Ligação ativa', tone: 'ok',
    paragraphs: ['Este é um email de teste enviado pela conta Gmail ligada. Os emails aos hóspedes vão sair deste endereço.'],
  }),
};

// Sai pela primeira organização do utilizador com o Gmail ligado.
async function sendPasswordReset(user, { to, url }) {
  const sender = db.prepare(`SELECT m.organization_id FROM memberships m
    JOIN google_email_connections c ON c.organization_id = m.organization_id
    WHERE m.user_id = ? AND m.active = 1 ORDER BY m.created_at LIMIT 1`).get(user.id);
  if (!sender) throw new Error('Sem remetente de email configurado para recuperação de conta.');
  return send(sender.organization_id, to, MESSAGES.passwordReset({ name: user.name, url }));
}

const sendEmailChangeConfirmation = (organizationId, { to, url }) => send(organizationId, to, MESSAGES.emailChangeConfirmation({ to, url }));
const sendEmailChangedNotice = (organizationId, { to }) => send(organizationId, to, MESSAGES.emailChanged());
const sendTeamInvitation = (organizationId, { to, organizationName, role, url }) => send(organizationId, to, MESSAGES.teamInvitation({ organizationName, role, url }));
const sendGmailTest = (organizationId, { to }) => send(organizationId, to, MESSAGES.gmailTest());

module.exports = { MESSAGES, compose, sendPasswordReset, sendEmailChangeConfirmation, sendEmailChangedNotice, sendTeamInvitation, sendGmailTest };
