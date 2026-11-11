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

// meta = { userAgent, ip } do pedido — só para mostrar em "Sessões ativas" —
// e displayMode ('standalone' | 'browser'), para a consola da plataforma.
const DISPLAY_MODES = new Set(['standalone', 'browser']);
const SUSPENDED_MESSAGE = 'A conta desta organização está suspensa. Contacte o suporte.';
const PLATFORM_ONLY_MESSAGE = 'Esta sessão é só da consola da plataforma.';

function suspendedError() {
  return Object.assign(new Error(SUSPENDED_MESSAGE), { status: 403, suspended: true });
}

function organizationStatus(organizationId) {
  return db.prepare('SELECT status FROM organizations WHERE id = ?').get(organizationId)?.status || null;
}

function insertSession(userId, organizationId, oldSessionId, meta) {
  // Invalidar sessão anterior para forçar rotação de ID
  if (oldSessionId) {
    deleteSession(oldSessionId);
  }

  const sessionId = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86400000).toISOString();

  db.prepare(`
    INSERT INTO auth_sessions (id, user_id, organization_id, expires_at, created_at, last_seen_at, user_agent, ip, display_mode)
    VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), ?, ?, ?)
  `).run(digestToken(sessionId), userId, organizationId, expiresAt,
    meta.userAgent ? String(meta.userAgent).slice(0, 400) : null, meta.ip || null,
    DISPLAY_MODES.has(meta.displayMode) ? meta.displayMode : null);

  return { sessionId, expiresAt };
}

// Sessão numa organização: a indicada (tem de ter membership ativa e não
// estar suspensa) ou, sem organização, a principal entre as não suspensas.
function createSession(userId, organizationId, oldSessionId = null, meta = {}) {
  const membership = organizationId
    ? getMembershipByUserAndOrganization(userId, organizationId)
    : getPrimaryMembership(userId);

  if (!membership) {
    throw new Error('O utilizador não pertence a nenhuma organização ativa.');
  }
  if (organizationStatus(membership.organization_id) === 'suspended') throw suspendedError();
  require('./platformTrials').assertAllowed(membership.organization_id);
  require('./platformTrials').begin(membership.organization_id);

  return insertSession(userId, membership.organization_id, oldSessionId, meta);
}

// Sessão só da consola da plataforma (organization_id NULL): só para quem é
// dono da instância. Fora de /api/platform/* quase tudo responde 403
// (middleware/requireAuth.js).
function createPlatformSession(userId, oldSessionId = null, meta = {}) {
  if (!require('./platformAccess').isPlatformAdmin({ id: userId })) {
    throw Object.assign(new Error('Sem acesso à consola da plataforma.'), { status: 403 });
  }
  return insertSession(userId, null, oldSessionId, meta);
}

// Para onde esta pessoa pode entrar: a consola (se for dona da instância) e
// as organizações com membership ativa que não estão suspensas.
function getDestinations(userId) {
  const organizations = db.prepare(`
    SELECT o.id, o.name, m.role
    FROM memberships m
    JOIN organizations o ON o.id = m.organization_id
    WHERE m.user_id = ? AND m.active = 1 AND o.status != 'suspended'
    ORDER BY CASE m.role WHEN 'owner' THEN 1 WHEN 'manager' THEN 2 ELSE 3 END, m.created_at ASC
  `).all(userId).filter(o => !require('./platformTrials').blocked(o.id));
  return { platform: require('./platformAccess').isPlatformAdmin({ id: userId }), organizations };
}

// Tem memberships ativas, mas todas em organizações suspensas.
function onlySuspendedMemberships(userId) {
  const row = db.prepare(`
    SELECT SUM(o.status = 'suspended') AS suspended, SUM(o.status != 'suspended') AS other
    FROM memberships m JOIN organizations o ON o.id = m.organization_id
    WHERE m.user_id = ? AND m.active = 1
  `).get(userId);
  return (row?.suspended || 0) > 0 && !(row?.other || 0);
}

// Atividade do dia (daily_activity), para os utilizadores ativos da consola:
// uma escrita por sessão e por dia, lembrada em memória. O user_id só serve
// para contar pessoas distintas e nunca sai da base.
const activitySeen = new Map(); // digest da sessão → dia
let activityDay = null;
function markActive(sessionDigest, organizationId, userId) {
  const day = require('./dates').localDay();
  if (day !== activityDay) { activitySeen.clear(); activityDay = day; }
  if (activitySeen.get(sessionDigest) === day) return;
  db.prepare('INSERT OR IGNORE INTO daily_activity (organization_id, day, user_id) VALUES (?, ?, ?)').run(organizationId, day, userId);
  activitySeen.set(sessionDigest, day);
}

function getSessionUser(sessionId) {
  if (typeof sessionId !== 'string' || !/^[a-f0-9]{64}$/.test(sessionId)) return null;

  const row = db.prepare(`
    SELECT
      s.id, s.expires_at, s.organization_id,
      u.id as user_id, u.name, u.email, u.role as system_role, u.active,
      m.role as membership_role, m.active as membership_active,
      o.name as organization_name, o.slug as organization_slug, o.status as organization_status
    FROM auth_sessions s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN memberships m ON m.user_id = u.id AND m.organization_id = s.organization_id
    LEFT JOIN organizations o ON o.id = s.organization_id
    WHERE s.id = ?
  `).get(digestToken(sessionId));

  if (!row) return null;
  // Sessão sem organização: só vale enquanto a pessoa for dona da instância
  // (marca na base e email em PLATFORM_ADMIN_EMAILS, lidos agora).
  const platformOnly = !row.organization_id;
  const allowed = platformOnly
    ? require('./platformAccess').isPlatformAdmin({ id: row.user_id })
    : !!row.membership_active;
  if (!row.active || !allowed || new Date(row.expires_at).getTime() <= Date.now()) {
    deleteSession(sessionId);
    return null;
  }

  db.prepare(`UPDATE auth_sessions SET last_seen_at = datetime('now') WHERE id = ? AND datetime(last_seen_at) < datetime('now', '-5 minutes')`).run(row.id);
  if (row.organization_id && row.organization_status !== 'suspended') markActive(row.id, row.organization_id, row.user_id);

  return {
    id: row.user_id,
    name: row.name,
    email: row.email,
    role: platformOnly ? null : row.membership_role,
    organization_id: row.organization_id || null,
    organization_name: platformOnly ? null : row.organization_name,
    organization_slug: platformOnly ? null : row.organization_slug,
    organization_status: platformOnly ? null : row.organization_status,
    trial_access: platformOnly ? null : require('./platformTrials').access(row.organization_id),
    platform_only: platformOnly,
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
    WHERE rt.token = ? AND rt.used_at IS NULL AND datetime(rt.expires_at) > datetime('now')
  `).get(digestToken(token));
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
  SESSION_COOKIE, SUSPENDED_MESSAGE, PLATFORM_ONLY_MESSAGE,
  clearExpiredSessions,
  createPlatformSession,
  getDestinations,
  onlySuspendedMemberships,
  suspendedError,
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
