// Avisos à equipa: push para os dispositivos (respeita as preferências de
// cada utilizador) e email para o proprietário e os gestores ativos. Usado
// pelos efeitos dos acontecimentos de reserva (reservationEffects).
const { db } = require('../config/database');

// Aspeto de cada aviso: ícone grande e ícone da barra do Android
// (frontend/img/push, gerados por scripts/build-icons.cjs) e o botão que abre
// a página. `type` é a preferência de cada pessoa; `kind`, o aspeto.
const KINDS = {
  reservation: { action: 'Ver reserva' },
  request: { action: 'Ver pedido' },
  payment: { action: 'Ver reserva' },
  cancellation: { action: 'Ver reserva' },
  precheckin: { action: 'Ver reserva' },
  summary: { action: 'Ver reservas' },
};

// Sem `kind` (ex.: envio de teste), o logótipo e nenhum botão.
function pushPayload({ kind = null, title, body, url = '/', tag, requireInteraction = false }) {
  const look = KINDS[kind];
  const icon = look ? kind : 'app';
  return { title, body, url, tag, requireInteraction, icon: `/img/push/${icon}.png`, badge: `/img/push/${icon}-badge.png`,
    actions: look ? [{ action: 'open', title: look.action }] : [] };
}

async function push(organizationId, type, { kind = null, title, body, url = '/', excludeUserId = null, requireInteraction = false, tag = null }) {
  return require('./pushService').sendToOrganization(organizationId,
    pushPayload({ kind, title, body, url, tag: tag || `sp-${type}`, requireInteraction }), { type, excludeUserId });
}

function staffEmails(organizationId) {
  return db.prepare(`SELECT u.email FROM users u
    JOIN memberships m ON m.user_id = u.id
    WHERE m.organization_id = ? AND m.role IN ('owner', 'manager') AND m.active = 1 AND u.active = 1
    ORDER BY CASE m.role WHEN 'owner' THEN 1 ELSE 2 END`).all(organizationId).map(row => row.email);
}

// Aviso por email à equipa: etiqueta e título (quem e quando), as linhas da
// reserva ({ label, value }), uma caixa opcional e o botão `url` para o
// backoffice. Cabeçalho "Aviso à equipa" e sem redes sociais, por ser um
// email interno. Uma falha parcial não repete o envio a quem já o recebeu.
async function email(organizationId, { subject, eyebrow = '', tone = 'brand', headline = '', rows = [], note = null, url = '', footnote = '', accommodation = null }) {
  const recipients = staffEmails(organizationId);
  if (!recipients.length) return { sent: 0 };
  const emailService = require('./emailService');
  const composer = require('./emailComposer');
  const resolved = accommodation ? emailService.resolveAccommodationInheritance(accommodation, organizationId) : null;
  const settings = emailService.getEmailSettings(resolved, organizationId);
  const html = emailService.baseTemplate(`
    ${composer.buildTitle({ eyebrow, tone, headline })}
    ${composer.buildRows(rows)}
    ${note ? composer.buildNote(note) : ''}
    ${composer.buildButton(url, 'Abrir no backoffice')}
    ${footnote ? `<p style="font-family:${composer.SERIF};font-size:13px;line-height:1.5;color:${composer.PALETTE.muted};text-align:center;margin:12px 0 0;">${composer.escapeHtml(footnote)}</p>` : ''}
  `, settings, { headerLabel: 'Aviso à equipa', social: false });
  let sent = 0, failed = 0;
  for (const to of recipients) {
    try {
      if (await emailService.sendMail(organizationId, { to, subject, html })) sent++;
    } catch (err) {
      failed++;
      console.error(`Aviso à equipa por email (${to}):`, err.message);
    }
  }
  if (failed && !sent) throw new Error('Não foi possível enviar o aviso por email à equipa.');
  return { sent };
}

module.exports = { KINDS, pushPayload, push, email, staffEmails };
