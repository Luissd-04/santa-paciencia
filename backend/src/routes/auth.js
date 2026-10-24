const router = require('express').Router();
const { loginLimiter, forgotPasswordLimiter } = require('../middleware/rateLimiter');
const { db } = require('../config/database');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const {
  SESSION_COOKIE,
  consumeResetTokenAsync,
  createPasswordResetToken,
  createSession,
  createUserAsync,
  deleteSession,
  digestToken,
  getResetToken,
  getUserByEmail,
  hashPasswordAsync,
  isValidEmail,
  publicUser,
  validatePassword,
  verifyPasswordAsync,
} = require('../services/authService');

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
  getInvitationByToken,
  getMembershipByUserAndOrganization,
} = require('../services/orgService');

const { createHmac } = require('crypto');
const COOKIE_MAX_AGE = Number(process.env.SESSION_TTL_DAYS || 14) * 86400000;

function oauthState(sessionId, purpose) {
  const token = require('crypto').randomBytes(32).toString('hex');
  db.prepare('DELETE FROM oauth_states WHERE expires_at < ?').run(Date.now());
  db.prepare('INSERT INTO oauth_states(token_hash,session_hash,purpose,expires_at) VALUES(?,?,?,?)').run(digestToken(token), digestToken(sessionId), purpose, Date.now() + 10 * 60000);
  return token;
}
function verifyOAuthState(req, res, purpose) {
  const ok = typeof req.query.state === 'string' && db.prepare('DELETE FROM oauth_states WHERE token_hash=? AND session_hash=? AND purpose=? AND expires_at>?').run(digestToken(req.query.state), digestToken(req.sessionId), purpose, Date.now()).changes;
  if (!ok) { res.status(400).send('Estado OAuth inválido ou expirado. Volte a iniciar a ligação.'); return false; }
  return true;
}

let dummyHash;
function dummyPasswordHash() {
  dummyHash ||= require('../services/authService').hashPassword(require('crypto').randomBytes(16).toString('hex'));
  return dummyHash;
}

function sessionMeta(req) {
  return { userAgent: req.get('user-agent') || '', ip: req.ip || '' };
}

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

router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  const user = getUserByEmail(email);
  // Resposta genérica para não revelar se o email existe (anti-enumeration)
  const genericError = { success: false, error: 'Credenciais inválidas.' };
  // Calcular sempre um scrypt: sem conta, a resposta não pode ser mais rápida.
  const valid = await verifyPasswordAsync(String(password || ''), user?.active ? user.password_hash : dummyPasswordHash());
  if (!user?.active || !valid) return res.status(401).json(genericError);

  try {
    const { sessionId } = createSession(user.id, null, null, sessionMeta(req));
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

router.post('/invitations/accept', loginLimiter, async (req, res) => {
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
    if (!await verifyPasswordAsync(String(password), existingUser.password_hash)) {
      return res.status(401).json({ success: false, error: 'Password incorreta.' });
    }

    const alreadyMember = getMembershipByUserAndOrganization(existingUser.id, invitation.organization_id);
    try {
      acceptInvitation({ invitationId: invitation.id, userId: existingUser.id });
      const { sessionId } = createSession(existingUser.id, invitation.organization_id, null, sessionMeta(req));
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
    const preparedHash = await hashPasswordAsync(password);
    const user = db.transaction(() => {
      const created = require('../services/authService').createUser({ name: trimmedName, email: normalizedEmail, password, role: invitation.role }, preparedHash);
      acceptInvitation({ invitationId: invitation.id, userId: created.id });
      return created;
    }).immediate();
    const { sessionId } = createSession(user.id, invitation.organization_id, null, sessionMeta(req));
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
    const { sessionId } = createSession(req.user.id, organization_id, req.sessionId, sessionMeta(req));
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
      const sender = db.prepare(`SELECT m.organization_id FROM memberships m
        JOIN google_email_connections c ON c.organization_id = m.organization_id
        WHERE m.user_id = ? AND m.active = 1 ORDER BY m.created_at LIMIT 1`).get(user.id);
      if (!sender) throw new Error('Sem remetente de email configurado para recuperação de conta.');
      const delivery = await sendMail(sender.organization_id, {
        to: email,
        subject: 'Recuperar palavra-passe — Santa Paciência',
        html: emailWrap(
          'Recuperar palavra-passe',
          `<p>Olá, ${String(user.name.split(' ')[0]).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))}.</p>
           <p>Recebemos um pedido para recuperar a tua palavra-passe.</p>
           <p style="margin:24px 0;">
             <a href="${resetUrl}" style="background:#843424;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">
               Definir nova palavra-passe
             </a>
           </p>
           <p style="color:#888;font-size:13px;">Este link expira em 1 hora. Se não pediste a recuperação, ignora este email — a tua conta está segura.</p>`
        ),
      });
      if (!delivery) throw new Error('Serviço de email não confirmou o envio.');
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
  const [local, domain] = (row.email || '').split('@');
  const masked = local.slice(0, 1) + '***' + (local.length > 1 ? local.slice(-1) : '');
  res.json({ success: true, data: { email: `${masked}@${domain}` } });
});

router.post('/reset-password', loginLimiter, async (req, res) => {
  const { token, password, confirm_password } = req.body || {};
  if (!token || !password || !confirm_password) {
    return res.status(400).json({ success: false, error: 'Preenche todos os campos.' });
  }
  if (password !== confirm_password) {
    return res.status(400).json({ success: false, error: 'As passwords não coincidem.' });
  }
  try {
    await consumeResetTokenAsync(token, password);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/change-password', requireAuth, loginLimiter, require('../middleware/rateLimiter').sensitiveAccountLimiter, async (req, res) => {
  const { current_password, password, confirm_password } = req.body || {};
  if (!current_password || !password || !confirm_password) {
    return res.status(400).json({ success: false, error: 'Preenche todos os campos.' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!await verifyPasswordAsync(String(current_password), user.password_hash)) {
    // 400 e não 401: o frontend trata 401 como sessão expirada e faz logout.
    return res.status(400).json({ success: false, error: 'Palavra-passe atual incorreta.' });
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
    .run(await hashPasswordAsync(password), req.user.id);
  // Termina as sessões noutros dispositivos; a atual continua ativa.
  db.prepare('DELETE FROM auth_sessions WHERE user_id = ? AND id != ?').run(req.user.id, digestToken(req.sessionId));
  res.json({ success: true });
});

// ── Perfil ──
// PUT /auth/profile { name, email, current_password } — a palavra-passe atual
// só é exigida quando o email muda (o email é o identificador de login).
router.put('/profile', requireAuth, loginLimiter, require('../middleware/rateLimiter').sensitiveAccountLimiter, async (req, res) => {
  const { name, email, current_password } = req.body || {};
  const trimmedName = String(name || '').trim();
  const newEmail = normalizeEmail(email);
  if (!trimmedName) return res.status(400).json({ success: false, error: 'O nome é obrigatório.' });
  if (trimmedName.length > 120) return res.status(400).json({ success: false, error: 'O nome é demasiado longo.' });
  if (!isValidEmail(newEmail)) return res.status(400).json({ success: false, error: 'O email não tem um formato válido.' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const emailChanged = newEmail !== user.email;
  if (emailChanged) {
    if (!current_password || !await verifyPasswordAsync(String(current_password), user.password_hash)) {
      return res.status(400).json({ success: false, error: 'Para mudar o email, confirma a palavra-passe atual.' });
    }
    const other = getUserByEmail(newEmail);
    if (other && other.id !== user.id) {
      return res.status(400).json({ success: false, error: 'Já existe uma conta com esse email.' });
    }
  }
  if (emailChanged) {
    const token = require('crypto').randomBytes(32).toString('hex');
    const tokenHash = digestToken(token);
    const origin = require('../services/publicOrigin').publicOrigin(req);
    const url = `${origin}/auth/confirm-email?token=${encodeURIComponent(token)}`;
    const esc = require('../services/emailComposer').escapeHtml;
    db.prepare('INSERT INTO email_changes(token_hash,user_id,old_email,new_email,expires_at) VALUES(?,?,?,?,?)').run(tokenHash, user.id, user.email, newEmail, Date.now() + 30 * 60000);
    try {
      const sent = await require('../services/emailService').sendMail(req.user.organization_id, { to: newEmail, subject: 'Confirmar alteração de email', html: emailWrap('Confirmar novo endereço', `<p>Confirme a alteração do email da sua conta. O link expira em 30 minutos e exige sessão iniciada na mesma conta.</p><p><a href="${esc(url)}">Confirmar endereço</a></p>`) });
      if (!sent?.id) throw new Error('O email de confirmação não foi enviado. Ligue o Gmail e tente novamente.');
      // Keep only the most recently delivered verification; the login email is unchanged.
      db.prepare('DELETE FROM email_changes WHERE user_id=? AND token_hash!=?').run(user.id, tokenHash);
    } catch {
      db.prepare('DELETE FROM email_changes WHERE token_hash=?').run(tokenHash);
      return res.status(409).json({ success: false, error: 'Não foi possível enviar a confirmação. O endereço de acesso continua inalterado.' });
    }
  }
  db.prepare(`UPDATE users SET name = ?, updated_at = datetime('now') WHERE id = ?`).run(trimmedName, user.id);
  const sessionUser = require('../services/authService').getSessionUser(req.sessionId);
  res.json({ success: true, data: { user: serializeUser(sessionUser), email_pending: emailChanged ? newEmail : null } });
});

router.get('/confirm-email', requireAuth, (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  const pending = db.prepare('SELECT * FROM email_changes WHERE token_hash=? AND user_id=? AND expires_at>?').get(digestToken(token), req.user.id, Date.now());
  if (!pending) return res.status(400).send('Link inválido ou expirado. Inicie sessão na conta original e peça uma nova alteração de email.');
  const esc = require('../services/emailComposer').escapeHtml;
  res.set('Referrer-Policy', 'no-referrer').send(`<html lang="pt"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Confirmar email</title><body><h1>Confirmar alteração de email</h1><p>Novo endereço: ${esc(pending.new_email)}</p><form method="post" action="/auth/confirm-email"><input type="hidden" name="token" value="${esc(token)}"><button type="submit">Confirmar novo endereço</button></form></body></html>`);
});
router.post('/confirm-email', requireAuth, loginLimiter, async (req, res) => {
  const tokenHash = digestToken(String(req.body.token || ''));
  let previous;
  try {
    previous = db.transaction(() => {
      const pending = db.prepare('SELECT * FROM email_changes WHERE token_hash=? AND user_id=? AND expires_at>?').get(tokenHash, req.user.id, Date.now());
      const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
      if (!pending || pending.old_email !== user.email) throw new Error('Link inválido ou expirado.');
      if (getUserByEmail(pending.new_email)) throw new Error('O novo email já pertence a uma conta.');
      db.prepare("UPDATE users SET email=?, updated_at=datetime('now') WHERE id=?").run(pending.new_email, user.id);
      db.prepare('DELETE FROM email_changes WHERE user_id=?').run(user.id);
      db.prepare('DELETE FROM auth_sessions WHERE user_id=? AND id!=?').run(user.id, digestToken(req.sessionId));
      db.prepare('DELETE FROM password_reset_tokens WHERE user_id=?').run(user.id);
      return pending;
    }).immediate();
  } catch (error) { return res.status(400).send(require('../services/emailComposer').escapeHtml(error.message)); }
  try {
    await require('../services/emailService').sendMail(req.user.organization_id, { to: previous.old_email, subject: 'Email de acesso alterado', html: emailWrap('Email de acesso alterado', '<p>O email de acesso da sua conta foi alterado após confirmação do novo endereço. Se não reconhece esta alteração, contacte o responsável pela sua organização.</p>') });
  } catch { console.warn('Notificação de alteração de email pendente de verificação.'); }
  res.send('<html lang="pt"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Email confirmado</title><body><h1>Email confirmado</h1><p>Use o novo endereço no próximo acesso.</p><a href="/">Voltar à aplicação</a></body></html>');
});

// ── Sessões ativas ──
router.get('/sessions', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT s.id, s.created_at, s.last_seen_at, s.expires_at, s.user_agent, s.ip, o.name AS organization_name
    FROM auth_sessions s
    LEFT JOIN organizations o ON o.id = s.organization_id
    WHERE s.user_id = ? AND datetime(s.expires_at) > datetime('now')
    ORDER BY s.last_seen_at DESC
  `).all(req.user.id);
  // A lista expõe apenas uma referência opaca, nunca o cookie nem o hash armazenado.
  const crypto = require('crypto');
  const publicId = id => crypto.createHash('sha256').update(id).digest('hex').slice(0, 16);
  res.json({
    success: true,
    data: rows.map(r => ({
      id: publicId(r.id),
      current: r.id === digestToken(req.sessionId),
      created_at: r.created_at,
      last_seen_at: r.last_seen_at,
      user_agent: r.user_agent,
      ip: r.ip,
      organization_name: r.organization_name,
    })),
  });
});

router.delete('/sessions/:id', requireAuth, (req, res) => {
  const crypto = require('crypto');
  const rows = db.prepare('SELECT id FROM auth_sessions WHERE user_id = ?').all(req.user.id);
  const target = rows.find(r => crypto.createHash('sha256').update(r.id).digest('hex').slice(0, 16) === req.params.id);
  if (!target) return res.status(404).json({ success: false, error: 'Sessão não encontrada.' });
  db.prepare('DELETE FROM auth_sessions WHERE id = ? AND user_id = ?').run(target.id, req.user.id);
  const current = target.id === digestToken(req.sessionId);
  if (current) clearSessionCookie(res);
  res.json({ success: true, data: { current } });
});

// Termina todas as sessões exceto a atual.
router.post('/sessions/revoke-others', requireAuth, (req, res) => {
  const info = db.prepare('DELETE FROM auth_sessions WHERE user_id = ? AND id != ?').run(req.user.id, digestToken(req.sessionId));
  res.json({ success: true, data: { removed: info.changes } });
});

require('./googleAuth')(router, { oauthState, verifyOAuthState });
require('./emailMessages')(router);

module.exports = router;
