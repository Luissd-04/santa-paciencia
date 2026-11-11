// Acesso à consola da plataforma (só para o dono da instância). São precisas
// duas coisas: a marca na base (scripts/platform-admin.js) e o email em
// PLATFORM_ADMIN_EMAILS. Mesmo assim, a consola só abre depois de confirmar a
// palavra-passe nesta sessão, e fica aberta 30 minutos.
const { randomUUID } = require('crypto');
const { db } = require('../config/database');
const { digestToken, normalizeEmail, verifyPasswordAsync } = require('./authService');

const UNLOCK_MINUTES = 30;
const SESSION_TOKEN = /^[a-f0-9]{64}$/;

// Lido a cada chamada: mudar o ambiente e reiniciar chega para tirar o acesso.
function adminEmails() {
  return new Set(String(process.env.PLATFORM_ADMIN_EMAILS || '').split(',').map(normalizeEmail).filter(Boolean));
}

// `user` só precisa do id: a marca, o email e o estado vêm sempre da base.
function isPlatformAdmin(user) {
  if (!user?.id) return false;
  const row = db.prepare('SELECT email, active, platform_admin FROM users WHERE id = ?').get(user.id);
  return !!row?.active && row.platform_admin === 1 && adminEmails().has(normalizeEmail(row.email));
}

function platformRole(user) {
  if (!isPlatformAdmin(user)) return null;
  return db.prepare('SELECT platform_role FROM users WHERE id = ?').get(user.id)?.platform_role === 'marketing' ? 'marketing' : 'admin';
}

// Confirma a palavra-passe (como o login) e abre a consola nesta sessão.
// Devolve { unlockedUntil } ou null se a palavra-passe ou a sessão não servirem.
async function unlock(sessionId, userId, password) {
  if (typeof sessionId !== 'string' || !SESSION_TOKEN.test(sessionId)) return null;
  const user = db.prepare('SELECT id, active, password_hash FROM users WHERE id = ?').get(userId);
  const valid = await verifyPasswordAsync(String(password || ''), user?.password_hash);
  if (!user?.active || !valid || !isPlatformAdmin(user)) return null;
  const unlockedUntil = new Date(Date.now() + UNLOCK_MINUTES * 60000).toISOString();
  const changed = db.prepare(`UPDATE auth_sessions SET platform_unlocked_until = ? WHERE id = ? AND user_id = ?`)
    .run(unlockedUntil, digestToken(sessionId), user.id).changes;
  return changed ? { unlockedUntil } : null;
}

function isUnlocked(sessionId) {
  if (typeof sessionId !== 'string' || !SESSION_TOKEN.test(sessionId)) return false;
  const row = db.prepare('SELECT platform_unlocked_until FROM auth_sessions WHERE id = ?').get(digestToken(sessionId));
  const until = Date.parse(row?.platform_unlocked_until || '');
  return Number.isFinite(until) && until > Date.now();
}

// Registo próprio da plataforma, fora do de cada organização. `ip` é o
// req.ip (IP real do visitante, conforme TRUST_PROXY). Sem palavras-passe nem
// dados pessoais em `details`.
function recordPlatformAudit({ userId = null, action, targetType = null, targetId = null, details = null, ip = null }) {
  try {
    db.prepare(`INSERT INTO platform_audit_events (id, user_id, action, target_type, target_id, details_json, ip)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(randomUUID(), userId, action, targetType, targetId,
      details ? JSON.stringify(details) : null, ip ? String(ip).slice(0, 64) : null);
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', event: 'platform_audit_write_failed', action, code: err.code || err.name }));
  }
}

module.exports = { UNLOCK_MINUTES, platformRole, isPlatformAdmin, unlock, isUnlocked, recordPlatformAudit };
