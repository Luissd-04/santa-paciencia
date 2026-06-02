const router = require('express').Router();
const { loginLimiter, forgotPasswordLimiter } = require('../middleware/rateLimiter');
const { deleteTokens, getOAuth2Client, isAuthenticated, saveTokens } = require('../config/google');
const {
  getEmailOAuth2Client, saveEmailTokens, deleteEmailTokens,
  isEmailAuthenticated, getEmailConnectionInfo, GMAIL_SCOPES,
} = require('../config/googleEmail');
const {
  getTasksOAuth2Client, saveTasksTokens, deleteTasksTokens,
  isTasksAuthenticated, getTasksConnectionInfo, TASKS_SCOPES,
} = require('../config/googleTasks');
const { db } = require('../config/database');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const {
  SESSION_COOKIE,
  consumeResetToken,
  createPasswordResetToken,
  createSession,
  createUser,
  deleteSession,
  getResetToken,
  getUserByEmail,
  hashPassword,
  isValidEmail,
  publicUser,
  validatePassword,
  verifyPassword,
} = require('../services/authService');

const transporter = (() => {
  try { return require('../config/email'); } catch { return null; }
})();

function canSendEmail() {
  return transporter && process.env.EMAIL_ENABLED !== 'false' && process.env.EMAIL_FROM;
}

function appUrl() {
  return process.env.PUBLIC_APP_URL || process.env.FRONTEND_PUBLIC_URL || '';
}

function emailWrap(title, body) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#2a2520;">
      <h2 style="color:#843424;margin-bottom:8px;">${title}</h2>
      ${body}
      <hr style="border:none;border-top:1px solid #e8ddd0;margin:24px 0;">
      <p style="font-size:12px;color:#888;">Santa Paciência · Gestão de Alojamento Local</p>
    </div>
  `;
}
const {
  acceptInvitation,
  buildInvitationUrl,
  createMembership,
  createOrganization,
  getClaimableLegacyOrganization,
  getInvitationByToken,
  getMembershipByUserAndOrganization,
} = require('../services/orgService');

const SCOPES = ['https://www.googleapis.com/auth/calendar'];
const COOKIE_MAX_AGE = Number(process.env.SESSION_TTL_DAYS || 14) * 86400000;

function setSessionCookie(res, sessionId) {
  const secure = process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true';
  res.cookie(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  });
}

function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true';
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
  });
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function serializeUser(user) {
  return {
    ...publicUser(user),
    organization_id: user.organization_id,
    organization_name: user.organization_name,
    organization_slug: user.organization_slug,
  };
}

router.get('/register-status', (req, res) => {
  res.json({
    success: true,
    data: {
      enabled: false,
      mode: 'invite-only',
      reason: 'O registo está desativado. O acesso é feito apenas por convite do proprietário.',
    }
  });
});

router.get('/invitations/:token', (req, res) => {
  const invitation = getInvitationByToken(req.params.token);
  if (!invitation) return res.status(404).json({ success: false, error: 'Convite não encontrado.' });
  if (invitation.accepted_at) return res.status(410).json({ success: false, error: 'Este convite já foi aceite.' });
  if (new Date(invitation.expires_at).getTime() <= Date.now()) {
    return res.status(410).json({ success: false, error: 'Este convite expirou.' });
  }

  res.json({
    success: true,
    data: {
      email: invitation.email,
      role: invitation.role,
      organization_name: invitation.organization_name,
      expires_at: invitation.expires_at,
      user_exists: !!getUserByEmail(invitation.email),
    }
  });
});

router.post('/login', loginLimiter, (req, res) => {
  const { email, password } = req.body || {};
  const user = getUserByEmail(email);
  // Resposta genérica para não revelar se o email existe (anti-enumeration)
  const genericError = { success: false, error: 'Credenciais inválidas.' };
  if (!user) return res.status(401).json(genericError);
  if (!user.active) return res.status(401).json(genericError);
  if (!verifyPassword(String(password || ''), user.password_hash)) {
    return res.status(401).json(genericError);
  }

  try {
    const { sessionId } = createSession(user.id);
    setSessionCookie(res, sessionId);
    const sessionUser = require('../services/authService').getSessionUser(sessionId);
    res.json({ success: true, data: { user: serializeUser(sessionUser) } });
  } catch (err) {
    res.status(403).json({ success: false, error: err.message });
  }
});

// Registo público desativado — acesso apenas por convite do proprietário
router.post('/register', (req, res) => {
  res.status(403).json({ success: false, error: 'O registo direto está desativado. Contacta o proprietário para receberes um convite.' });
});

router.post('/invitations/accept', (req, res) => {
  const { token, name, password, confirm_password } = req.body || {};
  const invitation = getInvitationByToken(token);

  if (!invitation) return res.status(404).json({ success: false, error: 'Convite não encontrado.' });
  if (invitation.accepted_at) return res.status(410).json({ success: false, error: 'Este convite já foi aceite.' });
  if (new Date(invitation.expires_at).getTime() <= Date.now()) {
    return res.status(410).json({ success: false, error: 'Este convite expirou.' });
  }

  const normalizedEmail = normalizeEmail(invitation.email);
  const existingUser = getUserByEmail(normalizedEmail);

  if (existingUser) {
    // User already has an account — verify their password and add membership
    if (!password) {
      return res.status(400).json({ success: false, error: 'Introduz a tua password para aceitar o convite.' });
    }
    if (!existingUser.active) {
      return res.status(403).json({ success: false, error: 'Esta conta está desativada.' });
    }
    if (!verifyPassword(String(password), existingUser.password_hash)) {
      return res.status(401).json({ success: false, error: 'Password incorreta.' });
    }

    const alreadyMember = getMembershipByUserAndOrganization(existingUser.id, invitation.organization_id);
    try {
      if (!alreadyMember) {
        acceptInvitation({ invitationId: invitation.id, userId: existingUser.id });
      }
      const { sessionId } = createSession(existingUser.id, invitation.organization_id);
      setSessionCookie(res, sessionId);
      const sessionUser = require('../services/authService').getSessionUser(sessionId);
      return res.json({ success: true, data: { user: serializeUser(sessionUser) } });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  // New user — full registration flow
  const trimmedName = String(name || '').trim();
  if (!trimmedName || !password || !confirm_password) {
    return res.status(400).json({ success: false, error: 'Preenche todos os campos obrigatórios.' });
  }
  if (password !== confirm_password) {
    return res.status(400).json({ success: false, error: 'As passwords não coincidem.' });
  }
  try {
    validatePassword(password);
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }

  try {
    const user = createUser({
      name: trimmedName,
      email: normalizedEmail,
      password,
      role: invitation.role,
    });
    acceptInvitation({ invitationId: invitation.id, userId: user.id });
    const { sessionId } = createSession(user.id, invitation.organization_id);
    setSessionCookie(res, sessionId);
    const sessionUser = require('../services/authService').getSessionUser(sessionId);
    res.status(201).json({
      success: true,
      data: {
        user: serializeUser(sessionUser),
        invite_url: buildInvitationUrl(token),
      }
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.get('/memberships', requireAuth, (req, res) => {
  const memberships = db.prepare(`
    SELECT m.organization_id, m.role, o.name as organization_name, o.slug as organization_slug
    FROM memberships m
    JOIN organizations o ON o.id = m.organization_id
    WHERE m.user_id = ? AND m.active = 1
    ORDER BY CASE m.role WHEN 'owner' THEN 1 WHEN 'manager' THEN 2 ELSE 3 END, m.created_at ASC
  `).all(req.user.id);
  res.json({ success: true, data: { memberships } });
});

router.post('/switch-org', requireAuth, (req, res) => {
  const { organization_id } = req.body || {};
  if (!organization_id) {
    return res.status(400).json({ success: false, error: 'organization_id é obrigatório.' });
  }
  const membership = getMembershipByUserAndOrganization(req.user.id, organization_id);
  if (!membership) {
    return res.status(403).json({ success: false, error: 'Não tens acesso a este espaço.' });
  }
  try {
    const { sessionId } = createSession(req.user.id, organization_id, req.sessionId);
    setSessionCookie(res, sessionId);
    const sessionUser = require('../services/authService').getSessionUser(sessionId);
    res.json({ success: true, data: { user: serializeUser(sessionUser) } });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/logout', requireAuth, (req, res) => {
  deleteSession(req.sessionId);
  clearSessionCookie(res);
  res.json({ success: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ success: true, data: { user: serializeUser(req.user) } });
});

router.post('/forgot-password', forgotPasswordLimiter, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const user = getUserByEmail(email);
  if (user && user.active) {
    try {
      const token = createPasswordResetToken(user.id);
      const resetUrl = `${appUrl()}/?reset=${token}`;
      const { sendMail } = require('../services/emailService');
      await sendMail(user.organization_id, {
        to: email,
        subject: 'Recuperar palavra-passe — Santa Paciência',
        html: emailWrap(
          'Recuperar palavra-passe',
          `<p>Olá, ${user.name.split(' ')[0]}.</p>
           <p>Recebemos um pedido para recuperar a tua palavra-passe.</p>
           <p style="margin:24px 0;">
             <a href="${resetUrl}" style="background:#843424;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">
               Definir nova palavra-passe
             </a>
           </p>
           <p style="color:#888;font-size:13px;">Este link expira em 1 hora. Se não pediste a recuperação, ignora este email — a tua conta está segura.</p>`
        ),
      });
    } catch (err) {
      console.error('Erro ao enviar email de recuperação:', err.message);
    }
  }
  // Always respond success to prevent email enumeration
  res.json({ success: true });
});

router.get('/reset-password/:token', (req, res) => {
  const row = getResetToken(req.params.token);
  if (!row) return res.status(410).json({ success: false, error: 'Este link de recuperação é inválido ou já expirou.' });
  res.json({ success: true, data: { email: row.email } });
});

router.post('/reset-password', (req, res) => {
  const { token, password, confirm_password } = req.body || {};
  if (!token || !password || !confirm_password) {
    return res.status(400).json({ success: false, error: 'Preenche todos os campos.' });
  }
  if (password !== confirm_password) {
    return res.status(400).json({ success: false, error: 'As passwords não coincidem.' });
  }
  try {
    consumeResetToken(token, password);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/change-password', requireAuth, (req, res) => {
  const { current_password, password, confirm_password } = req.body || {};
  if (!current_password || !password || !confirm_password) {
    return res.status(400).json({ success: false, error: 'Preenche todos os campos.' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!verifyPassword(String(current_password), user.password_hash)) {
    return res.status(401).json({ success: false, error: 'Palavra-passe atual incorreta.' });
  }
  if (password !== confirm_password) {
    return res.status(400).json({ success: false, error: 'As passwords não coincidem.' });
  }
  try {
    validatePassword(password);
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
  db.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(hashPassword(password), req.user.id);
  res.json({ success: true });
});

router.get('/google', requireAuth, (req, res) => {
  const oAuth2Client = getOAuth2Client();
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });
  res.redirect(authUrl);
});

router.get('/google/callback', requireAuth, async (req, res) => {
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
    console.error('Erro no OAuth:', err);
    res.status(500).send('Erro ao autenticar com o Google: ' + err.message);
  }
});

router.get('/google/status', requireAuth, (req, res) => {
  res.json({ connected: isAuthenticated(req.user.id, req.user.organization_id) });
});

router.delete('/google', requireAuth, (req, res) => {
  deleteTokens(req.user.id, req.user.organization_id);
  res.json({ success: true, message: 'Google Calendar desligado' });
});

// ── GMAIL OAUTH ──
router.get('/google-email', requireAuth, (req, res) => {
  if (!process.env.GOOGLE_EMAIL_REDIRECT_URI) {
    return res.status(500).send('GOOGLE_EMAIL_REDIRECT_URI não configurado no .env');
  }
  const oAuth2Client = getEmailOAuth2Client();
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: GMAIL_SCOPES,
    prompt: 'consent',
  });
  res.redirect(authUrl);
});

router.get('/google-email/callback', requireAuth, async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Código de autorização em falta.');
  try {
    const oAuth2Client = getEmailOAuth2Client();
    const { tokens } = await oAuth2Client.getToken(code);
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
    const detail = err.response?.data || err.message;
    console.error('Erro no OAuth Gmail:', JSON.stringify(detail));
    res.status(500).send('Erro ao autenticar com o Gmail: ' + JSON.stringify(detail));
  }
});

router.get('/google-email/status', requireAuth, (req, res) => {
  const info = getEmailConnectionInfo(req.user.organization_id);
  res.json({ success: true, data: info });
});

router.delete('/google-email', requireAuth, (req, res) => {
  deleteEmailTokens(req.user.organization_id);
  res.json({ success: true, message: 'Gmail desligado' });
});

router.post('/google-email/test', requireAuth, async (req, res) => {
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
    console.error('Gmail test error:', err);
    const errMsg = err.message || '';
    const errData = err.response?.data?.error || '';
    const isAuthError = errMsg.includes('invalid_grant') || errMsg.includes('Login Required')
      || errMsg.includes('Token has been expired') || errMsg.includes('Invalid Credentials')
      || errData === 'invalid_grant' || err.status === 401 || err.code === 401;
    if (isAuthError) deleteEmailTokens(req.user.organization_id);
    res.status(isAuthError ? 401 : 500).json({
      success: false,
      needs_reauth: isAuthError,
      error: isAuthError ? 'A ligação ao Gmail expirou. Vai a Definições → Gmail e volta a ligar a conta.' : errMsg,
    });
  }
});

// ── EMAIL: envio avulso (Invoice / Conversas) ──
router.post('/email/send', requireAuth, async (req, res) => {
  const { to, subject, html, to_name, reservation_id } = req.body || {};
  if (!to || !subject || !html) {
    return res.status(400).json({ success: false, error: 'to, subject e html são obrigatórios.' });
  }
  try {
    const { sendMail } = require('../services/emailService');
    await sendMail(req.user.organization_id, { to, subject, html });

    const { randomUUID } = require('crypto');
    db.prepare(`
      INSERT INTO invoice_messages (id, organization_id, to_email, to_name, subject, body_html, reservation_id, sent_by_user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      req.user.organization_id,
      to,
      to_name || null,
      subject,
      html,
      reservation_id || null,
      req.user.id
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao enviar email avulso:', err);
    const errMsg = err.message || '';
    const errData = err.response?.data?.error || '';
    const isAuthError = errMsg.includes('Login Required')
      || errMsg.includes('invalid_grant')
      || errMsg.includes('Token has been expired')
      || errMsg.includes('Invalid Credentials')
      || errData === 'invalid_grant'
      || err.status === 401 || err.code === 401;
    if (isAuthError) {
      deleteEmailTokens(req.user.organization_id);
      return res.status(401).json({
        success: false,
        needs_reauth: true,
        error: 'A ligação ao Gmail expirou. Vai a Definições → Gmail e volta a ligar a conta.',
      });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/email/inbox', requireAuth, async (req, res) => {
  const { to_email, max = 30 } = req.query;
  if (!to_email) return res.status(400).json({ success: false, error: 'to_email é obrigatório.' });

  const { getAuthenticatedEmailClient, getEmailConnectionInfo } = require('../config/googleEmail');
  const info = getEmailConnectionInfo(req.user.organization_id);
  if (!info.connected) return res.json({ success: true, data: { messages: [], needs_reauth: false } });

  try {
    const auth = getAuthenticatedEmailClient(req.user.organization_id);

    /* Pesquisar mensagens to/from este email */
    const q = `from:${to_email} OR to:${to_email}`;
    const listRes = await auth.request({
      url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages',
      params: { q, maxResults: Number(max) || 30 },
    });

    const msgIds = listRes.data.messages || [];
    if (!msgIds.length) return res.json({ success: true, data: { messages: [] } });

    /* Buscar cada mensagem em paralelo (batch de 10 para não sobrecarregar) */
    const fetchBatch = async (ids) => Promise.all(
      ids.map(({ id }) =>
        auth.request({
          url: `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}`,
          params: { format: 'full' },
        }).then(r => r.data).catch(() => null)
      )
    );

    const batchSize = 10;
    const rawMessages = [];
    for (let i = 0; i < msgIds.length; i += batchSize) {
      const batch = await fetchBatch(msgIds.slice(i, i + batchSize));
      rawMessages.push(...batch.filter(Boolean));
    }

    const myEmail = (info.email || '').toLowerCase();

    const messages = rawMessages.map(msg => {
      const headers = {};
      (msg.payload?.headers || []).forEach(h => { headers[h.name.toLowerCase()] = h.value; });

      const from    = headers['from']    || '';
      const to      = headers['to']      || '';
      const subject = headers['subject'] || '(sem assunto)';
      const dateStr = headers['date']    || '';
      const date    = dateStr ? new Date(dateStr).toISOString() : new Date(msg.internalDate ? Number(msg.internalDate) : Date.now()).toISOString();

      const fromEmail = (from.match(/<([^>]+)>/) || [])[1] || from;
      const direction = fromEmail.toLowerCase() === myEmail ? 'sent' : 'received';

      const body = extractBody(msg.payload);

      return { id: msg.id, threadId: msg.threadId, from, to, subject, date, direction, body, snippet: msg.snippet || '' };
    }).sort((a, b) => new Date(a.date) - new Date(b.date));

    res.json({ success: true, data: { messages } });
  } catch (err) {
    const errMsg = err.message || '';
    const errData = err.response?.data?.error || '';
    const isAuthError = errMsg.includes('invalid_grant') || errMsg.includes('Login Required')
      || errMsg.includes('Token has been expired') || errMsg.includes('Invalid Credentials')
      || errData === 'invalid_grant' || err.status === 401 || err.code === 401;
    if (isAuthError) deleteEmailTokens(req.user.organization_id);
    const needs_reauth = isAuthError || errMsg.includes('insufficient') || err.code === 403;
    console.error('Gmail inbox error:', errMsg);
    res.json({ success: true, data: { messages: [], needs_reauth, error: errMsg } });
  }
});

/* Extrai o body HTML ou texto de um payload MIME (recursivo) */
function extractBody(payload) {
  if (!payload) return '';

  const decodeB64 = (data) => {
    if (!data) return '';
    try { return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8'); } catch { return ''; }
  };

  /* Preferir text/html, fallback text/plain */
  if (payload.mimeType === 'text/html')  return decodeB64(payload.body?.data);
  if (payload.mimeType === 'text/plain') return decodeB64(payload.body?.data).replace(/\n/g, '<br>');

  if (payload.parts) {
    let html = '', plain = '';
    for (const part of payload.parts) {
      const content = extractBody(part);
      if (part.mimeType === 'text/html' || part.mimeType?.startsWith('multipart/')) html = html || content;
      else if (part.mimeType === 'text/plain') plain = plain || content;
    }
    return html || plain;
  }

  return decodeB64(payload.body?.data);
}

router.get('/email/messages', requireAuth, (req, res) => {
  const { to_email, reservation_id, limit = 200 } = req.query;
  let query = `
    SELECT m.*, u.name as sent_by_name
    FROM invoice_messages m
    LEFT JOIN users u ON u.id = m.sent_by_user_id
    WHERE m.organization_id = ?
  `;
  const params = [req.user.organization_id];
  if (to_email)       { query += ' AND m.to_email = ?';       params.push(to_email); }
  if (reservation_id) { query += ' AND m.reservation_id = ?'; params.push(reservation_id); }
  query += ` ORDER BY m.sent_at DESC LIMIT ${Math.min(Number(limit) || 200, 500)}`;
  const messages = db.prepare(query).all(...params);
  res.json({ success: true, data: { messages } });
});

// ── CONVERSATION ARCHIVES ──
router.get('/email/archives', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT thread_key, key_type FROM conversation_archives WHERE organization_id = ?')
    .all(req.user.organization_id);
  res.json({ success: true, data: rows });
});

router.post('/email/archives', requireAuth, (req, res) => {
  const { thread_key, key_type = 'reservation' } = req.body || {};
  if (!thread_key) return res.status(400).json({ error: 'thread_key obrigatório' });
  const { randomUUID } = require('crypto');
  db.prepare(`INSERT OR REPLACE INTO conversation_archives (id, organization_id, thread_key, key_type)
    VALUES (?, ?, ?, ?)`).run(randomUUID(), req.user.organization_id, thread_key, key_type);
  res.json({ success: true });
});

router.delete('/email/archives/:thread_key', requireAuth, (req, res) => {
  db.prepare('DELETE FROM conversation_archives WHERE organization_id = ? AND thread_key = ?')
    .run(req.user.organization_id, req.params.thread_key);
  res.json({ success: true });
});

// ── GOOGLE TASKS OAUTH ──
router.get('/google-tasks', requireAuth, (req, res) => {
  if (!process.env.GOOGLE_TASKS_REDIRECT_URI) {
    return res.status(500).send('GOOGLE_TASKS_REDIRECT_URI não configurado no .env');
  }
  const oAuth2Client = getTasksOAuth2Client();
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: TASKS_SCOPES,
    prompt: 'consent',
  });
  res.redirect(authUrl);
});

router.get('/google-tasks/callback', requireAuth, async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Código de autorização em falta.');
  try {
    const oAuth2Client = getTasksOAuth2Client();
    const { tokens } = await oAuth2Client.getToken(code);
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
    console.error('Erro no OAuth Tasks:', err);
    res.status(500).send('Erro ao autenticar com o Google Tasks: ' + err.message);
  }
});

router.get('/google-tasks/status', requireAuth, (req, res) => {
  const info = getTasksConnectionInfo(req.user.organization_id);
  res.json({ success: true, data: info });
});

router.delete('/google-tasks', requireAuth, (req, res) => {
  deleteTasksTokens(req.user.organization_id);
  res.json({ success: true, message: 'Google Tasks desligado' });
});

module.exports = router;
