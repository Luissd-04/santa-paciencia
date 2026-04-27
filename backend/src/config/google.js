const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

const TOKEN_PATH = path.join(__dirname, '../../tokens/google_token.json');

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

function getAuthenticatedClient() {
  const oAuth2Client = getOAuth2Client();

  if (!fs.existsSync(TOKEN_PATH)) {
    throw new Error('Google Calendar não autenticado. Acede a /auth/google para ligar.');
  }

  const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
  oAuth2Client.setCredentials(token);

  // Auto-renovar token se expirado
  oAuth2Client.on('tokens', (newTokens) => {
    if (newTokens.refresh_token) token.refresh_token = newTokens.refresh_token;
    token.access_token = newTokens.access_token;
    token.expiry_date = newTokens.expiry_date;
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));
  });

  return oAuth2Client;
}

function isAuthenticated() {
  return fs.existsSync(TOKEN_PATH);
}

module.exports = { getOAuth2Client, getAuthenticatedClient, isAuthenticated, TOKEN_PATH };
