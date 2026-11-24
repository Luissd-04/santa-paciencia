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
  // Alerta do «Estado do sistema»: sem ícone próprio, usa o da aplicação.
  alert: { action: 'Ver estado', icon: 'app' },
};

// Sem `kind` (ex.: envio de teste), o logótipo e nenhum botão.
function pushPayload({ kind = null, title, body, url = '/', tag, requireInteraction = false, renotify = false }) {
  const look = KINDS[kind];
  const icon = look ? (look.icon || kind) : 'app';
  return { title, body, url, tag, requireInteraction, renotify, icon: `/img/push/${icon}.png`, badge: `/img/push/${icon}-badge.png`,
    actions: look ? [{ action: 'open', title: look.action }] : [] };
}

// `roles` limita a quem recebe (ex.: alertas só para proprietário e gestores).
async function push(organizationId, type, { kind = null, title, body, url = '/', excludeUserId = null, requireInteraction = false, tag = null, roles = null }) {
  return require('./pushService').sendToOrganization(organizationId,
    // renotify: um aviso novo com a mesma etiqueta (mesma reserva) volta a tocar.
    pushPayload({ kind, title, body, url, tag: tag || `sp-${type}`, requireInteraction, renotify: true }), { type, excludeUserId, roles });
}

// Proprietário e gestores ativos (`ownerOnly`: só o proprietário; `excludeUserId`:
// não avisar quem fez a ação).
function staffEmails(organizationId, { ownerOnly = false, excludeUserId = null } = {}) {
  return db.prepare(`SELECT u.email FROM users u
    JOIN memberships m ON m.user_id = u.id
    WHERE m.organization_id = ? AND m.role IN (${ownerOnly ? "'owner'" : "'owner', 'manager'"}) AND m.active = 1 AND u.active = 1
      AND (? IS NULL OR u.id != ?)
    ORDER BY CASE m.role WHEN 'owner' THEN 1 ELSE 2 END`).all(organizationId, excludeUserId, excludeUserId).map(row => row.email);
}

// Sem Gmail ligado os avisos por email não saem: falha visível («Aviso não
// entregue» no sino), definitiva — repetir não resolve até alguém ligar o Gmail.
const NO_GMAIL_MESSAGE = 'Liga o Gmail em Definições para receber avisos por email';
function noGmailError() {
  const err = new Error(NO_GMAIL_MESSAGE);
  err.permanent = true;
  return err;
}

// Aviso por email à equipa: etiqueta e título (quem e quando), as linhas da
// reserva ({ label, value }), uma caixa opcional e o botão `url` para o
// backoffice. Cabeçalho "Aviso à equipa" e sem redes sociais, por ser um
// email interno. compose() devolve { subject, html } sem enviar.
function compose(organizationId, { subject, eyebrow = '', tone = 'brand', headline = '', rows = [], note = null, url = '', footnote = '', accommodation = null }) {
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
  return { subject, html };
}

// Envia para o proprietário e os gestores ativos. Uma falha parcial não
// repete o envio a quem já o recebeu.
async function email(organizationId, message, { ownerOnly = false, excludeUserId = null } = {}) {
  const recipients = staffEmails(organizationId, { ownerOnly, excludeUserId });
  if (!recipients.length) return { sent: 0 };
  const emailService = require('./emailService');
  const { subject, html } = compose(organizationId, message);
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
  if (!sent) {
    // `null` = não enviado. Envios desligados de propósito (demo, staging,
    // EMAIL_ENABLED=false) não são falha; sem Gmail ligado, é.
    if (emailService.emailDisabled() || !require('./orgPolicy').externalAllowed(organizationId)) return { sent: 0, skipped: true };
    throw noGmailError();
  }
  return { sent };
}

module.exports = { NO_GMAIL_MESSAGE, KINDS, pushPayload, push, compose, email, staffEmails };
