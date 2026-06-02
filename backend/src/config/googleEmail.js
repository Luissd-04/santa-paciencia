const { OAuth2Client } = require('google-auth-library');
const { db } = require('./database');

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
];

function getEmailOAuth2Client() {
  return new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_EMAIL_REDIRECT_URI
  );
}

function getStoredEmailTokens(organizationId) {
  const row = db.prepare(
    'SELECT tokens FROM google_email_connections WHERE organization_id = ?'
  ).get(organizationId);
  if (!row?.tokens) return null;
  try { return JSON.parse(row.tokens); } catch { return null; }
}

function saveEmailTokens(organizationId, tokens, email) {
  db.prepare(`
    INSERT INTO google_email_connections (organization_id, email, tokens, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(organization_id)
    DO UPDATE SET tokens = excluded.tokens, email = excluded.email, updated_at = datetime('now')
  `).run(organizationId, email || null, JSON.stringify(tokens));
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

async function sendViaGmail(organizationId, { to, subject, html, from }) {
  if (!to) throw new Error('Endereço de destino em falta');
  const auth = getAuthenticatedEmailClient(organizationId);

  const info = getEmailConnectionInfo(organizationId);
  const senderEmail = info.email || 'me';
  const propertyName = process.env.PROPERTY_NAME || 'Santa Paciência';
  const fromHeader = encodeFromHeader(from || `${propertyName} <${senderEmail}>`);

  const messageParts = [
    `From: ${fromHeader}`,
    `To: ${to}`,
    `Subject: ${encodeSubject(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    html,
  ];
  const raw = Buffer.from(messageParts.join('\r\n')).toString('base64url');

  return auth.request({
    url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    method: 'POST',
    data: { raw },
  });
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
