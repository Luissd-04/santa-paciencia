const crypto = require('crypto');
const { db } = require('../config/database');
const { getMembershipByUserAndOrganization, getPrimaryMembership } = require('./orgService');

const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS || 14);
const SESSION_COOKIE = process.env.SESSION_COOKIE_NAME || 'sp_session';

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

function validatePassword(password) {
  const value = String(password || '');
  if (value.length < 8) {
    throw new Error('A password deve ter pelo menos 8 caracteres.');
  }
  if (!/[A-Z]/.test(value)) {
    throw new Error('A password deve conter pelo menos uma letra maiúscula.');
  }
  if (!/[0-9]/.test(value)) {
    throw new Error('A password deve conter pelo menos um número.');
  }
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, originalHash] = stored.split(':');
  const derived = crypto.scryptSync(password, salt, 64);
  const original = Buffer.from(originalHash, 'hex');
  if (derived.length !== original.length) return false;
  return crypto.timingSafeEqual(derived, original);
}

function createSession(userId, organizationId, oldSessionId = null) {
  const membership = organizationId
    ? getMembershipByUserAndOrganization(userId, organizationId)
    : getPrimaryMembership(userId);

  if (!membership) {
    throw new Error('O utilizador não pertence a nenhuma organização ativa.');
  }

  // Invalidar sessão anterior para forçar rotação de ID
  if (oldSessionId) {
    db.prepare('DELETE FROM auth_sessions WHERE id = ?').run(oldSessionId);
  }

  const sessionId = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86400000).toISOString();

  db.prepare(`
    INSERT INTO auth_sessions (id, user_id, organization_id, expires_at, created_at, last_seen_at)
    VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(sessionId, userId, membership.organization_id, expiresAt);

  return { sessionId, expiresAt };
}

function getSessionUser(sessionId) {
  if (!sessionId) return null;

  const row = db.prepare(`
    SELECT
      s.id, s.expires_at, s.organization_id,
      u.id as user_id, u.name, u.email, u.role as system_role, u.active,
      m.role as membership_role, m.active as membership_active,
      o.name as organization_name, o.slug as organization_slug
    FROM auth_sessions s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN memberships m ON m.user_id = u.id AND m.organization_id = s.organization_id
    LEFT JOIN organizations o ON o.id = s.organization_id
    WHERE s.id = ?
  `).get(sessionId);

  if (!row) return null;
  if (!row.active || !row.membership_active || new Date(row.expires_at).getTime() <= Date.now()) {
    deleteSession(sessionId);
    return null;
  }

  db.prepare(`UPDATE auth_sessions SET last_seen_at = datetime('now') WHERE id = ?`).run(sessionId);

  return {
    id: row.user_id,
    name: row.name,
    email: row.email,
    role: row.membership_role,
    organization_id: row.organization_id,
    organization_name: row.organization_name,
    organization_slug: row.organization_slug,
  };
}

function deleteSession(sessionId) {
  if (!sessionId) return;
  db.prepare('DELETE FROM auth_sessions WHERE id = ?').run(sessionId);
}

function clearExpiredSessions() {
  db.prepare(`DELETE FROM auth_sessions WHERE datetime(expires_at) <= datetime('now')`).run();
}

function getUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(normalizeEmail(email));
}

function createUser({ name, email, password, role = 'admin' }) {
  const trimmedName = String(name || '').trim();
  const normalizedEmail = normalizeEmail(email);

  if (!trimmedName || !normalizedEmail || !password) {
    throw new Error('Nome, email e password são obrigatórios.');
  }

  if (!isValidEmail(normalizedEmail)) {
    throw new Error('O email indicado não é válido.');
  }

  validatePassword(password);

  if (getUserByEmail(normalizedEmail)) {
    throw new Error('Já existe um utilizador com esse email.');
  }

  const id = crypto.randomUUID();
  const passwordHash = hashPassword(password);

  db.prepare(`
    INSERT INTO users (id, name, email, password_hash, role, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
  `).run(id, trimmedName, normalizedEmail, passwordHash, role);

  return db.prepare('SELECT id, name, email, role, active, created_at FROM users WHERE id = ?').get(id);
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

function createPasswordResetToken(userId) {
  db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(userId);
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 3600000).toISOString();
  db.prepare(`
    INSERT INTO password_reset_tokens (id, user_id, token, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(crypto.randomUUID(), userId, token, expiresAt);
  return token;
}

function getResetToken(token) {
  return db.prepare(`
    SELECT rt.*, u.email, u.name
    FROM password_reset_tokens rt
    JOIN users u ON u.id = rt.user_id
    WHERE rt.token = ? AND rt.used_at IS NULL AND datetime(rt.expires_at) > datetime('now')
  `).get(token);
}

function consumeResetToken(token, newPassword) {
  const row = getResetToken(token);
  if (!row) throw new Error('Link inválido ou expirado. Pede um novo email de recuperação.');
  validatePassword(newPassword);
  const hash = hashPassword(newPassword);
  db.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`).run(hash, row.user_id);
  db.prepare(`UPDATE password_reset_tokens SET used_at = datetime('now') WHERE token = ?`).run(token);
  db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(row.user_id);
}

module.exports = {
  SESSION_COOKIE,
  clearExpiredSessions,
  consumeResetToken,
  createPasswordResetToken,
  createSession,
  createUser,
  deleteSession,
  getResetToken,
  getSessionUser,
  getUserByEmail,
  hashPassword,
  isValidEmail,
  normalizeEmail,
  publicUser,
  validatePassword,
  verifyPassword,
};
