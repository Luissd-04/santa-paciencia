// Acesso à consola da plataforma (só para a equipa da instância). São precisas
// duas coisas: a marca na base (scripts/platform-admin.js) e o email em
// PLATFORM_ADMIN_EMAILS. Mesmo assim, a consola só abre depois de confirmar a
// palavra-passe nesta sessão, e fica aberta 30 minutos.
//
// Cargos: cada pessoa tem um ou mais (platform_roles, separados por vírgulas).
// As permissões são a soma dos cargos; Administração inclui todas.
const { randomUUID } = require('crypto');
const { db } = require('../config/database');
const { digestToken, normalizeEmail, verifyPasswordAsync } = require('./authService');

const UNLOCK_MINUTES = 30;
const SESSION_TOKEN = /^[a-f0-9]{64}$/;

const PLATFORM_ROLES = {
  admin: 'Administração',
  marketing: 'Marketing e comercial',
  support: 'Suporte',
};

// O que cada capacidade exige (qualquer um dos cargos indicados; admin vale sempre).
//  - read: ver a consola (visão geral, clientes, pacotes, tarefas, comunicados)
//  - sales: comercial, marketing, demonstrações/testes e comunicados
//  - support: caixa de pedidos de suporte, anexos e respostas guardadas
//  - product: bugs e sugestões
//  - admin: finanças, equipa, configurações, exportação, registo, diagnóstico,
//    alterações a clientes e pacotes, conservação e eliminações do suporte
const CAPABILITIES = {
  read: ['marketing', 'support'],
  sales: ['marketing'],
  support: ['support'],
  product: ['marketing', 'support'],
  admin: [],
};

// Lido a cada chamada: mudar o ambiente e reiniciar chega para tirar o acesso.
function adminEmails() {
  return new Set(String(process.env.PLATFORM_ADMIN_EMAILS || '').split(',').map(normalizeEmail).filter(Boolean));
}

// Lista válida, ordenada e sem repetidos; vazia se nada servir.
function cleanRoles(value) {
  const list = Array.isArray(value) ? value : String(value ?? '').split(',');
  const roles = new Set(list.map(role => String(role).trim().toLowerCase()).filter(role => Object.hasOwn(PLATFORM_ROLES, role)));
  return Object.keys(PLATFORM_ROLES).filter(role => roles.has(role));
}

// Resultado por objeto `user` (um por pedido): as permissões leem-se uma vez,
// mesmo que muitas linhas de uma lista as consultem.
const cache = new WeakMap();

function lookup(user) {
  if (!user?.id) return { admin: false, roles: [] };
  if (typeof user === 'object' && cache.has(user)) return cache.get(user);
  const row = db.prepare('SELECT email, active, platform_admin, platform_role, platform_roles FROM users WHERE id = ?').get(user.id);
  const admin = !!row?.active && row.platform_admin === 1 && adminEmails().has(normalizeEmail(row.email));
  const roles = admin ? cleanRoles(row.platform_roles ?? row.platform_role ?? 'admin') : [];
  // Sem nenhum cargo válido, fica só com leitura (nunca com Administração por omissão).
  const result = { admin, roles };
  if (typeof user === 'object') cache.set(user, result);
  return result;
}

// `user` só precisa do id: a marca, o email e o estado vêm sempre da base.
function isPlatformAdmin(user) {
  return lookup(user).admin;
}

function platformRoles(user) {
  return lookup(user).roles;
}

function can(user, capability) {
  const { admin, roles } = lookup(user);
  if (!admin) return false;
  if (roles.includes('admin')) return true;
  const needed = CAPABILITIES[capability];
  if (!needed) return false;
  // `read` também serve a quem ficou sem cargos válidos: é da equipa.
  if (capability === 'read') return true;
  return needed.some(role => roles.includes(role));
}

// Compatibilidade: o cargo «principal» (admin se o tiver).
function platformRole(user) {
  const { admin, roles } = lookup(user);
  if (!admin) return null;
  return roles.includes('admin') ? 'admin' : roles[0] || 'marketing';
}

// Grava os cargos (pelo menos um) e fecha as consolas abertas dessa pessoa.
function setPlatformRoles(userId, value) {
  const roles = cleanRoles(value);
  if (!roles.length) return null;
  db.transaction(() => {
    db.prepare("UPDATE users SET platform_roles = ?, updated_at = datetime('now') WHERE id = ?").run(roles.join(','), userId);
    db.prepare('UPDATE auth_sessions SET platform_unlocked_until = NULL WHERE user_id = ?').run(userId);
  })();
  return roles;
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

module.exports = {
  UNLOCK_MINUTES, PLATFORM_ROLES, CAPABILITIES,
  cleanRoles, platformRoles, platformRole, setPlatformRoles, can,
  isPlatformAdmin, unlock, isUnlocked, recordPlatformAudit,
};
