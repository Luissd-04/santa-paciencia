const router = require('express').Router();
const { getOAuth2Client, TOKEN_PATH } = require('../config/google');
const fs = require('fs');
const path = require('path');

const SCOPES = ['https://www.googleapis.com/auth/calendar'];

// Passo 1: Redirecionar para o Google
router.get('/google', (req, res) => {
  const oAuth2Client = getOAuth2Client();
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });
  res.redirect(authUrl);
});

// Passo 2: Callback após autorização do Google
router.get('/google/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Código de autorização em falta.');

  try {
    const oAuth2Client = getOAuth2Client();
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);

    // Guardar token
    const dir = path.dirname(TOKEN_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));

    console.log('✅ Google Calendar autenticado com sucesso!');
    res.send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:50px;">
        <h1>✅ Google Calendar ligado!</h1>
        <p>Podes fechar esta janela e voltar ao dashboard.</p>
        <script>setTimeout(() => window.close(), 3000);</script>
      </body></html>
    `);
  } catch (err) {
    console.error('Erro no OAuth:', err);
    res.status(500).send('Erro ao autenticar com o Google: ' + err.message);
  }
});

// Estado da ligação
router.get('/google/status', (req, res) => {
  const { isAuthenticated } = require('../config/google');
  res.json({ connected: isAuthenticated() });
});

// Desligar
router.delete('/google', (req, res) => {
  if (fs.existsSync(TOKEN_PATH)) fs.unlinkSync(TOKEN_PATH);
  res.json({ success: true, message: 'Google Calendar desligado' });
});

module.exports = router;