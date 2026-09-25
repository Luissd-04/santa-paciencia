const { fetchWithTimeout } = require('../services/httpClient');
const { OAuth2Client } = require('google-auth-library');
const path = require('path');
const fs = require('fs');
const { db } = require('./database');
const { encodeTokens, decodeTokens } = require('./tokenStorage');

const TOKEN_PATH = path.join(__dirname, '../../tokens/google_token.json');

function getOAuth2Client() {
  return new OAuth2Client({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI,
    transporterOptions: { timeout: 30000 },
  });
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
    else fs.writeFileSync(TOKEN_PATH, encodeTokens(token, 'calendar:legacy'), { mode: 0o600 });
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
      return decodeTokens(row.tokens, `calendar:${organizationId}:${userId}`);
    }
    return null;
  }

  if (!fs.existsSync(TOKEN_PATH)) return null;
  const stored = fs.readFileSync(TOKEN_PATH, 'utf8');
  if (JSON.parse(stored).protected === 1) return decodeTokens(stored, 'calendar:legacy');
  const token = JSON.parse(stored);
  fs.writeFileSync(TOKEN_PATH, encodeTokens(token, 'calendar:legacy'), { mode: 0o600 });
  return token;
}

function saveTokens(userId, organizationId, tokens) {
  db.prepare(`
    INSERT INTO google_calendar_connections (organization_id, user_id, tokens, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(organization_id, user_id)
    DO UPDATE SET tokens = excluded.tokens, updated_at = datetime('now')
  `).run(organizationId, userId, encodeTokens(tokens, `calendar:${organizationId}:${userId}`));
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

async function revokeTokens(userId, organizationId) {
  const token = getStoredTokens(userId, organizationId);
  const revokeToken = token?.refresh_token || token?.access_token;
  if (!revokeToken) return;
  try {
    await fetchWithTimeout('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(revokeToken), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
  } catch (err) {
    console.error('Erro ao revogar token do Google Calendar:', err.message);
  }
}

module.exports = {
  getOAuth2Client,
  getAuthenticatedClient,
  isAuthenticated,
  saveTokens,
  deleteTokens,
  revokeTokens,
  TOKEN_PATH
};
