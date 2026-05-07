const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const { db } = require('./database');

const TOKEN_PATH = path.join(__dirname, '../../tokens/google_token.json');

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

function getAuthenticatedClient(userId, organizationId) {
  const oAuth2Client = getOAuth2Client();

  const token = getStoredTokens(userId, organizationId);
  if (!token) throw new Error('Google Calendar não autenticado. Acede a /auth/google para ligar.');

  oAuth2Client.setCredentials(token);

  // Auto-renovar token se expirado
  oAuth2Client.on('tokens', (newTokens) => {
    if (newTokens.refresh_token) token.refresh_token = newTokens.refresh_token;
    token.access_token = newTokens.access_token;
    token.expiry_date = newTokens.expiry_date;
    if (userId && organizationId) saveTokens(userId, organizationId, token);
    else fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));
  });

  return oAuth2Client;
}

function getStoredTokens(userId, organizationId) {
  if (userId && organizationId) {
    const row = db.prepare(`
      SELECT tokens FROM google_calendar_connections
      WHERE user_id = ? AND organization_id = ?
    `).get(userId, organizationId);
    if (row?.tokens) {
      try { return JSON.parse(row.tokens); } catch { return null; }
    }
    return null;
  }

  if (!fs.existsSync(TOKEN_PATH)) return null;
  return JSON.parse(fs.readFileSync(TOKEN_PATH));
}

function saveTokens(userId, organizationId, tokens) {
  db.prepare(`
    INSERT INTO google_calendar_connections (organization_id, user_id, tokens, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(organization_id, user_id)
    DO UPDATE SET tokens = excluded.tokens, updated_at = datetime('now')
  `).run(organizationId, userId, JSON.stringify(tokens));
}

function deleteTokens(userId, organizationId) {
  if (userId && organizationId) {
    db.prepare(`
      DELETE FROM google_calendar_connections
      WHERE user_id = ? AND organization_id = ?
    `).run(userId, organizationId);
    return;
  }
  if (fs.existsSync(TOKEN_PATH)) fs.unlinkSync(TOKEN_PATH);
}

function isAuthenticated(userId, organizationId) {
  return !!getStoredTokens(userId, organizationId);
}

module.exports = {
  getOAuth2Client,
  getAuthenticatedClient,
  isAuthenticated,
  saveTokens,
  deleteTokens,
  TOKEN_PATH
};
