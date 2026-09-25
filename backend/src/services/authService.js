const crypto = require('crypto');
const scryptAsync = require('node:util').promisify(crypto.scrypt);
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
  if (/^\s|\s$/.test(value)) {
    throw new Error('A password não pode começar ou terminar com espaços.');
  }
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1F\x7F]/.test(value)) {
    throw new Error('A password contém caracteres de controlo inválidos.');
  }
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

// O servidor HTTP calcula passwords no pool de workers, sem bloquear pedidos.
async function hashPasswordAsync(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = await scryptAsync(password, salt, 64);
  return `${salt}:${hash.toString('hex')}`;
}

async function verifyPasswordAsync(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, originalHash] = stored.split(':');
  const derived = await scryptAsync(password, salt, 64);
  const original = Buffer.from(originalHash, 'hex');
  return derived.length === original.length && crypto.timingSafeEqual(derived, original);
}

async function createUserAsync(input) {
  validatePassword(input.password);
  return createUser(input, await hashPasswordAsync(input.password));
}

// meta = { userAgent, ip } do pedido — só para mostrar em "Sessões ativas".
function createSession(userId, organizationId, oldSessionId = null, meta = {}) {
  const membership = organizationId
    ? getMembershipByUserAndOrganization(userId, organizationId)
    : getPrimaryMembership(userId);

  if (!membership) {
    throw new Error('O utilizador não pertence a nenhuma organização ativa.');
  }

  // Invalidar sessão anterior para forçar rotação de ID
  if (oldSessionId) {
    deleteSession(oldSessionId);
  }

  const sessionId = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86400000).toISOString();

  db.prepare(`
    INSERT INTO auth_sessions (id, user_id, organization_id, expires_at, created_at, last_seen_at, user_agent, ip)
    VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), ?, ?)
  `).run(digestToken(sessionId), userId, membership.organization_id, expiresAt,
    meta.userAgent ? String(meta.userAgent).slice(0, 400) : null, meta.ip || null);

  return { sessionId, expiresAt };
}

function getSessionUser(sessionId) {
  if (typeof sessionId !== 'string' || !/^[a-f0-9]{64}$/.test(sessionId)) return null;

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
  `).get(digestToken(sessionId));

  if (!row) return null;
  if (!row.active || !row.membership_active || new Date(row.expires_at).getTime() <= Date.now()) {
    deleteSession(sessionId);
    return null;
  }

  db.prepare(`UPDATE auth_sessions SET last_seen_at = datetime('now') WHERE id = ? AND datetime(last_seen_at) < datetime('now', '-5 minutes')`).run(digestToken(sessionId));

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
  if (typeof sessionId !== 'string' || !/^[a-f0-9]{64}$/.test(sessionId)) return;
  db.prepare('DELETE FROM auth_sessions WHERE id = ?').run(digestToken(sessionId));
}

function clearExpiredSessions() {
  db.prepare(`DELETE FROM auth_sessions WHERE datetime(expires_at) <= datetime('now')`).run();
}

function getUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(normalizeEmail(email));
}

function createUser({ name, email, password, role = 'admin' }, preparedHash) {
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
  const passwordHash = preparedHash || hashPassword(password);

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
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 3600000).toISOString();
  db.transaction(() => {
    db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(userId);
    db.prepare(`INSERT INTO password_reset_tokens (id, user_id, token, expires_at)
      VALUES (?, ?, ?, ?)`).run(crypto.randomUUID(), userId, digestToken(token), expiresAt);
  })();
  return token;
}

function digestToken(token) {
  return 'sha256:' + crypto.createHash('sha256').update(token).digest('hex');
}

function getResetToken(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
  return db.prepare(`
    SELECT rt.*, u.email, u.name
    FROM password_reset_tokens rt
    JOIN users u ON u.id = rt.user_id
    WHERE rt.token IN (?, ?) AND rt.used_at IS NULL AND datetime(rt.expires_at) > datetime('now')
  `).get(digestToken(token), token); // Compatibilidade com links emitidos antes da atualização.
}

function consumeResetToken(token, newPassword) {
  validatePassword(newPassword);
  applyResetToken(token, hashPassword(newPassword));
}

async function consumeResetTokenAsync(token, newPassword) {
  validatePassword(newPassword);
  if (!getResetToken(token)) throw new Error('Link inválido ou expirado. Pede um novo email de recuperação.');
  applyResetToken(token, await hashPasswordAsync(newPassword));
}

function applyResetToken(token, hash) {
  db.transaction(() => {
    const row = getResetToken(token);
    if (!row) throw new Error('Link inválido ou expirado. Pede um novo email de recuperação.');
    db.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`).run(hash, row.user_id);
    db.prepare(`UPDATE password_reset_tokens SET used_at = datetime('now') WHERE id = ?`).run(row.id);
    db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(row.user_id);
  }).immediate();
}

module.exports = {
  hashPasswordAsync, verifyPasswordAsync, createUserAsync, consumeResetTokenAsync,
  SESSION_COOKIE,
  clearExpiredSessions,
  consumeResetToken,
  createPasswordResetToken,
  createSession,
  createUser,
  deleteSession,
  digestToken,
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
