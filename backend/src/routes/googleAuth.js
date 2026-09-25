const { fetchWithTimeout } = require('../services/httpClient');
const { oauthCallbackLimiter } = require('../middleware/rateLimiter');
const { deleteTokens, getOAuth2Client, isAuthenticated, saveTokens, revokeTokens } = require('../config/google');
const { deleteAllSyncedEvents } = require('../services/calendarService');
const {
  getEmailOAuth2Client, saveEmailTokens, deleteEmailTokens,
  isEmailAuthenticated, getEmailConnectionInfo, GMAIL_SCOPES,
} = require('../config/googleEmail');
const {
  getTasksOAuth2Client, saveTasksTokens, deleteTasksTokens,
  isTasksAuthenticated, getTasksConnectionInfo, TASKS_SCOPES,
  revokeTasksTokens, deleteAllSyncedTasks,
} = require('../config/googleTasks');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const { db } = require('../config/database');
const SCOPES = ['https://www.googleapis.com/auth/calendar'];

module.exports = function registerGoogleAuth(router, { oauthState, verifyOAuthState }) {
router.get('/google', requireAuth, (req, res) => {
  const oAuth2Client = getOAuth2Client();
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
    state: oauthState(req.sessionId),
  });
  res.redirect(authUrl);
});

router.get('/google/callback', oauthCallbackLimiter, requireAuth, async (req, res) => {
  if (!verifyOAuthState(req, res)) return;
  const { code } = req.query;
  if (!code) return res.status(400).send('Código de autorização em falta.');

  try {
    const oAuth2Client = getOAuth2Client();
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);

    saveTokens(req.user.id, req.user.organization_id, tokens);

    console.log('✅ Google Calendar autenticado com sucesso!');
    res.send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:50px;">
        <h1>✅ Google Calendar ligado!</h1>
        <p>Podes fechar esta janela e voltar ao dashboard.</p>
        <script>setTimeout(() => window.close(), 3000);</script>
      </body></html>
    `);
  } catch (err) {
    console.error('Erro no OAuth:', { type: err.name, status: err.status || err.response?.status });
    res.status(500).send('Não foi possível ligar o Google Calendar. Tenta novamente.');
  }
});

router.get('/google/status', requireAuth, (req, res) => {
  res.json({ connected: isAuthenticated(req.user.id, req.user.organization_id) });
});

router.delete('/google', requireAuth, async (req, res) => {
  const { id: userId, organization_id: organizationId } = req.user;
  let removed = 0;
  if (isAuthenticated(userId, organizationId)) {
    try {
      removed = await deleteAllSyncedEvents(userId, organizationId);
    } catch (err) {
      console.error('Erro ao limpar eventos antes de desligar o Google Calendar:', { type: err.name, status: err.status || err.response?.status });
    }
    await revokeTokens(userId, organizationId);
  }
  deleteTokens(userId, organizationId);
  res.json({ success: true, message: `Google Calendar desligado (${removed} eventos removidos)` });
});

// ── GMAIL OAUTH ──
router.get('/google-email', requireAuth, requireRole('manager'), (req, res) => {
  if (!process.env.GOOGLE_EMAIL_REDIRECT_URI) {
    return res.status(500).send('GOOGLE_EMAIL_REDIRECT_URI não configurado no .env');
  }
  const oAuth2Client = getEmailOAuth2Client();
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: GMAIL_SCOPES,
    prompt: 'consent',
    state: oauthState(req.sessionId),
  });
  res.redirect(authUrl);
});

router.get('/google-email/callback', oauthCallbackLimiter, requireAuth, requireRole('manager'), async (req, res) => {
  if (!verifyOAuthState(req, res)) return;
  const { code } = req.query;
  if (!code) return res.status(400).send('Código de autorização em falta.');
  try {
    // Token exchange manual — mais fiável entre versões da biblioteca
    const tokenRes = await fetchWithTimeout('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: process.env.GOOGLE_EMAIL_REDIRECT_URI,
        grant_type: 'authorization_code',
      }).toString(),
    });
    const tokens = await tokenRes.json();
    if (tokens.error) throw new Error(tokens.error_description || tokens.error);
    const oAuth2Client = getEmailOAuth2Client();
    oAuth2Client.setCredentials(tokens);

    // Obter endereço de email da conta
    let email = null;
    try {
      const { data } = await oAuth2Client.request({ url: 'https://www.googleapis.com/oauth2/v2/userinfo' });
      email = data.email;
    } catch { /* não crítico */ }

    saveEmailTokens(req.user.organization_id, tokens, email);
    console.log(`✅ Gmail ligado: ${email}`);
    res.send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:50px;">
        <h1>✅ Gmail ligado!</h1>
        <p>${email ? `A enviar emails como <strong>${email}</strong>.` : ''}</p>
        <p>Podes fechar esta janela e voltar ao dashboard.</p>
        <script>setTimeout(() => window.close(), 3000);</script>
      </body></html>
    `);
  } catch (err) {
    console.error('Erro no OAuth Gmail:', { type: err.name, status: err.status || err.response?.status });
    res.status(500).send('Não foi possível ligar o Gmail. Tenta novamente.');
  }
});

router.get('/google-email/status', requireAuth, requireRole('manager'), (req, res) => {
  const info = getEmailConnectionInfo(req.user.organization_id);
  res.json({ success: true, data: info });
});

router.delete('/google-email', requireAuth, requireRole('manager'), (req, res) => {
  deleteEmailTokens(req.user.organization_id);
  res.json({ success: true, message: 'Gmail desligado' });
});

router.post('/google-email/test', requireAuth, requireRole('manager'), async (req, res) => {
  try {
    const { sendViaGmail } = require('../config/googleEmail');
    const info = getEmailConnectionInfo(req.user.organization_id);
    if (!info.connected) return res.status(400).json({ success: false, error: 'Gmail não ligado' });
    const to = info.email || req.user.email;
    if (!to) return res.status(400).json({ success: false, error: 'Sem endereço de destino — desliga e volta a ligar o Gmail.' });
    await sendViaGmail(req.user.organization_id, {
      to,
      subject: 'Teste de email - Santa Paciencia',
      html: '<p>O email esta a funcionar correctamente a partir do Gmail ligado.</p>',
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Gmail test error:', { type: err.name, status: err.status || err.response?.status });
    const errMsg = err.message || '';
    const errData = err.response?.data?.error || '';
    const isAuthError = errMsg.includes('invalid_grant') || errMsg.includes('Login Required')
      || errMsg.includes('Token has been expired') || errMsg.includes('Invalid Credentials')
      || errData === 'invalid_grant' || err.status === 401 || err.code === 401;
    if (isAuthError) deleteEmailTokens(req.user.organization_id);
    res.status(isAuthError ? 401 : 500).json({
      success: false,
      needs_reauth: isAuthError,
      error: isAuthError ? 'A ligação ao Gmail expirou. Vai a Definições → Gmail e volta a ligar a conta.' : 'Não foi possível contactar o Gmail. Tenta novamente.',
    });
  }
});

// ── GOOGLE TASKS OAUTH ──
router.get('/google-tasks', requireAuth, requireRole('manager'), (req, res) => {
  if (!process.env.GOOGLE_TASKS_REDIRECT_URI) {
    return res.status(500).send('GOOGLE_TASKS_REDIRECT_URI não configurado no .env');
  }
  const oAuth2Client = getTasksOAuth2Client();
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: TASKS_SCOPES,
    prompt: 'consent',
    state: oauthState(req.sessionId),
  });
  res.redirect(authUrl);
});

router.get('/google-tasks/callback', oauthCallbackLimiter, requireAuth, requireRole('manager'), async (req, res) => {
  if (!verifyOAuthState(req, res)) return;
  const { code } = req.query;
  if (!code) return res.status(400).send('Código de autorização em falta.');
  try {
    // Token exchange manual — mais fiável entre versões da biblioteca
    const tokenRes = await fetchWithTimeout('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: process.env.GOOGLE_TASKS_REDIRECT_URI,
        grant_type: 'authorization_code',
      }).toString(),
    });
    const tokens = await tokenRes.json();
    if (tokens.error) throw new Error(tokens.error_description || tokens.error);
    const oAuth2Client = getTasksOAuth2Client();
    oAuth2Client.setCredentials(tokens);

    let email = null;
    try {
      const { data } = await oAuth2Client.request({ url: 'https://www.googleapis.com/oauth2/v2/userinfo' });
      email = data.email;
    } catch { /* não crítico */ }

    saveTasksTokens(req.user.organization_id, tokens, email);
    console.log(`✅ Google Tasks ligado: ${email}`);
    res.send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:50px;">
        <h1>✅ Google Tasks ligado!</h1>
        <p>${email ? `Conta: <strong>${email}</strong>` : ''}</p>
        <p>Podes fechar esta janela e voltar ao dashboard.</p>
        <script>setTimeout(() => window.close(), 3000);</script>
      </body></html>
    `);
  } catch (err) {
    console.error('Erro no OAuth Tasks:', { type: err.name, status: err.status || err.response?.status });
    res.status(500).send('Não foi possível ligar o Google Tasks. Tenta novamente.');
  }
});

router.get('/google-tasks/status', requireAuth, requireRole('manager'), (req, res) => {
  const info = getTasksConnectionInfo(req.user.organization_id);
  res.json({ success: true, data: info });
});

router.delete('/google-tasks', requireAuth, requireRole('manager'), async (req, res) => {
  const organizationId = req.user.organization_id;
  let removed = 0;
  if (isTasksAuthenticated(organizationId)) {
    try {
      removed = await deleteAllSyncedTasks(organizationId);
    } catch (err) {
      console.error('Erro ao limpar tarefas antes de desligar o Google Tasks:', { type: err.name, status: err.status || err.response?.status });
    }
    await revokeTasksTokens(organizationId);
  }
  deleteTasksTokens(organizationId);
  res.json({ success: true, message: `Google Tasks desligado (${removed} tarefas removidas)` });
});

};
