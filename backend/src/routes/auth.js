const router = require('express').Router();
const { getOAuth2Client, TOKEN_PATH } = require('../config/google');
const { db } = require('../config/database');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const {
  SESSION_COOKIE,
  createSession,
  createUser,
  deleteSession,
  getUserByEmail,
  isValidEmail,
  publicUser,
  validatePassword,
  verifyPassword,
} = require('../services/authService');
const {
  acceptInvitation,
  buildInvitationUrl,
  createMembership,
  createOrganization,
  getClaimableLegacyOrganization,
  getInvitationByToken,
  getMembershipByUserAndOrganization,
} = require('../services/orgService');
const fs = require('fs');
const path = require('path');

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
      enabled: true,
      mode: 'owner',
      reason: 'Cada novo registo cria um novo espaço de proprietário.',
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

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = getUserByEmail(email);
  if (!user) {
    return res.status(404).json({ success: false, error: 'Email não registado.' });
  }
  if (!user.active) {
    return res.status(403).json({ success: false, error: 'Esta conta está desativada.' });
  }
  if (!verifyPassword(String(password || ''), user.password_hash)) {
    return res.status(401).json({ success: false, error: 'Senha incorreta.' });
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

router.post('/register', (req, res) => {
  const { name, email, password, confirm_password, organization_name } = req.body || {};
  const trimmedName = String(name || '').trim();
  const normalizedEmail = normalizeEmail(email);
  const orgName = String(organization_name || '').trim();

  if (!trimmedName || !normalizedEmail || !password || !confirm_password || !orgName) {
    return res.status(400).json({ success: false, error: 'Preenche todos os campos obrigatórios.' });
  }
  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({ success: false, error: 'O email indicado não é válido.' });
  }
  if (password !== confirm_password) {
    return res.status(400).json({ success: false, error: 'As passwords não coincidem.' });
  }
  try {
    validatePassword(password);
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
  if (getUserByEmail(normalizedEmail)) {
    return res.status(409).json({ success: false, error: 'Este email já está a ser utilizado.' });
  }

  try {
    const user = createUser({
      name: trimmedName,
      email: normalizedEmail,
      password,
      role: 'owner',
    });

    const claimableOrg = getClaimableLegacyOrganization();
    let organization;
    if (claimableOrg) {
      db.prepare(`UPDATE organizations SET name = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(orgName, claimableOrg.id);
      organization = db.prepare('SELECT * FROM organizations WHERE id = ?').get(claimableOrg.id);
    } else {
      organization = createOrganization(orgName);
    }

    createMembership({
      organizationId: organization.id,
      userId: user.id,
      role: 'owner',
      invitedByUserId: null,
    });

    const { sessionId } = createSession(user.id, organization.id);
    setSessionCookie(res, sessionId);
    const sessionUser = require('../services/authService').getSessionUser(sessionId);
    res.status(201).json({ success: true, data: { user: serializeUser(sessionUser) } });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
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
    deleteSession(req.sessionId);
    const { sessionId } = createSession(req.user.id, organization_id);
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

router.get('/google', requireAuth, requireRole('manager'), (req, res) => {
  const oAuth2Client = getOAuth2Client();
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });
  res.redirect(authUrl);
});

router.get('/google/callback', requireAuth, requireRole('manager'), async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Código de autorização em falta.');

  try {
    const oAuth2Client = getOAuth2Client();
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);

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

router.get('/google/status', requireAuth, (req, res) => {
  const { isAuthenticated } = require('../config/google');
  res.json({ connected: isAuthenticated() });
});

router.delete('/google', requireAuth, requireRole('manager'), (req, res) => {
  if (fs.existsSync(TOKEN_PATH)) fs.unlinkSync(TOKEN_PATH);
  res.json({ success: true, message: 'Google Calendar desligado' });
});

module.exports = router;
