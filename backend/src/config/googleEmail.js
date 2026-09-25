const { OAuth2Client } = require('google-auth-library');
const { db } = require('./database');
const { encodeTokens, decodeTokens } = require('./tokenStorage');

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
];

function getEmailOAuth2Client() {
  return new OAuth2Client({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_EMAIL_REDIRECT_URI,
    transporterOptions: { timeout: 30000 },
  });
}

function getStoredEmailTokens(organizationId) {
  const row = db.prepare(
    'SELECT tokens FROM google_email_connections WHERE organization_id = ?'
  ).get(organizationId);
  if (!row?.tokens) return null;
  return decodeTokens(row.tokens, `email:${organizationId}`);
}

function saveEmailTokens(organizationId, tokens, email) {
  db.prepare(`
    INSERT INTO google_email_connections (organization_id, email, tokens, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(organization_id)
    DO UPDATE SET tokens = excluded.tokens, email = excluded.email, updated_at = datetime('now')
  `).run(organizationId, email || null, encodeTokens(tokens, `email:${organizationId}`));
}

function deleteEmailTokens(organizationId) {
  db.prepare('DELETE FROM google_email_connections WHERE organization_id = ?').run(organizationId);
}

function isEmailAuthenticated(organizationId) {
  return !!getStoredEmailTokens(organizationId);
}

function getEmailConnectionInfo(organizationId) {
  const row = db.prepare(
    'SELECT email FROM google_email_connections WHERE organization_id = ?'
  ).get(organizationId);
  return row ? { connected: true, email: row.email } : { connected: false, email: null };
}

function getAuthenticatedEmailClient(organizationId) {
  const oAuth2Client = getEmailOAuth2Client();
  const tokens = getStoredEmailTokens(organizationId);
  if (!tokens) throw new Error('Gmail não autenticado');
  oAuth2Client.setCredentials(tokens);

  oAuth2Client.on('tokens', (newTokens) => {
    const merged = { ...tokens, ...newTokens };
    const row = db.prepare('SELECT email FROM google_email_connections WHERE organization_id = ?').get(organizationId);
    saveEmailTokens(organizationId, merged, row?.email || null);
  });

  return oAuth2Client;
}

function encodeSubject(subject) {
  return `=?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`;
}

function encodeFromHeader(from) {
  // RFC 2047: codificar o display name se tiver caracteres não-ASCII
  const match = from.match(/^(.+?)\s*<([^>]+)>$/);
  if (match) {
    const name = match[1].trim();
    const email = match[2].trim();
    if (/[^\x00-\x7F]/.test(name)) {
      return `=?UTF-8?B?${Buffer.from(name).toString('base64')}?= <${email}>`;
    }
    return from;
  }
  return from;
}

async function sendViaGmail(organizationId, { to, subject, html, from, bcc, threadId, inReplyTo, references }) {
  if (!to) throw new Error('Endereço de destino em falta');
  const auth = getAuthenticatedEmailClient(organizationId);

  const info = getEmailConnectionInfo(organizationId);
  const senderEmail = info.email || 'me';
  const propertyName = process.env.PROPERTY_NAME || 'Santa Paciência';
  const fromHeader = encodeFromHeader(from || `${propertyName} <${senderEmail}>`);

  // Message-ID só para cumprir RFC 2822 no raw MIME que enviamos — o Gmail
  // ignora-o e atribui sempre o seu próprio (ver fetch a seguir ao envio).
  const { randomUUID } = require('crypto');
  const senderDomain = senderEmail.includes('@') ? senderEmail.split('@')[1] : 'santapaciencia.pt';
  const messageIdHeader = `<${randomUUID()}@${senderDomain}>`;

  const messageParts = [
    `From: ${fromHeader}`,
    `To: ${to}`,
    ...(bcc ? [`Bcc: ${bcc}`] : []),
    `Subject: ${encodeSubject(subject)}`,
    `Message-ID: ${messageIdHeader}`,
    ...(inReplyTo ? [`In-Reply-To: ${inReplyTo}`] : []),
    ...(inReplyTo ? [`References: ${references || inReplyTo}`] : []),
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    html,
  ];
  const raw = Buffer.from(messageParts.join('\r\n')).toString('base64url');

  const requestBody = { raw };
  // Só passar threadId à Gmail API quando estamos mesmo a responder a uma
  // mensagem concreta — uma mensagem "nova e solta" nunca deve ligar-se a
  // nenhuma conversa anterior (decisão explícita: sem isto, o Gmail pode
  // agrupar por assunto e criar uma ligação indesejada).
  if (threadId && inReplyTo) requestBody.threadId = threadId;

  const result = await auth.request({
    url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    method: 'POST',
    data: requestBody,
  });

  // O Gmail substitui SEMPRE o header Message-ID que enviamos pelo seu
  // próprio (formato <...@mail.gmail.com>), mesmo tendo nós definido um no
  // raw MIME acima — confirmado a testar em produção: guardar o UUID gerado
  // localmente fazia com que respostas futuras referenciassem (via
  // In-Reply-To/References) um Message-ID que nunca existiu de verdade, e o
  // Gmail do destinatário não conseguia agregar a conversa. Por isso vamos
  // sempre buscar o valor real que o Gmail atribuiu.
  let realMessageIdHeader = null;
  try {
    const sent = await auth.request({
      url: `https://gmail.googleapis.com/gmail/v1/users/me/messages/${result.data.id}`,
      params: { format: 'metadata', metadataHeaders: ['Message-Id'] },
    });
    const h = (sent.data.payload?.headers || []).find(x => x.name.toLowerCase() === 'message-id');
    realMessageIdHeader = h?.value || messageIdHeader;
  } catch {
    realMessageIdHeader = messageIdHeader; // fallback improvável, mas nunca devolver menos do que tínhamos
  }

  return { id: result.data.id, threadId: result.data.threadId, messageIdHeader: realMessageIdHeader };
}

module.exports = {
  getEmailOAuth2Client,
  getAuthenticatedEmailClient,
  saveEmailTokens,
  deleteEmailTokens,
  isEmailAuthenticated,
  getEmailConnectionInfo,
  sendViaGmail,
  GMAIL_SCOPES,
};
