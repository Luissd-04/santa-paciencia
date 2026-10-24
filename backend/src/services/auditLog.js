// Registo de ações sensíveis da organização (permissões, eliminações,
// exportações/restauros, anonimizações, integrações). Fica fora do histórico
// das reservas, que desaparece com uma eliminação definitiva.
// `meta` leva só identificadores, papéis e contagens — nunca dados pessoais.
const { randomUUID } = require('crypto');
const { db } = require('../config/database');

function recordAudit({ organizationId, userId = null, action, targetType = null, targetId = null, meta = null }) {
  try {
    db.prepare(`INSERT INTO audit_events (id, organization_id, user_id, action, target_type, target_id, meta)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(randomUUID(), organizationId, userId, action, targetType, targetId, meta ? JSON.stringify(meta) : null);
  } catch (err) {
    // Uma falha no registo não pode impedir a operação, mas tem de ficar visível.
    console.error(JSON.stringify({ level: 'error', event: 'audit_write_failed', action, code: err.code || err.name }));
  }
}

function listAudit(organizationId, { limit = 100, before = null } = {}) {
  const max = Math.min(Math.max(Number(limit) || 100, 1), 500);
  return db.prepare(`SELECT a.id, a.action, a.target_type, a.target_id, a.meta, a.created_at, a.user_id, u.name AS user_name
    FROM audit_events a LEFT JOIN users u ON u.id = a.user_id
    WHERE a.organization_id = ? AND (? IS NULL OR a.created_at < ?)
    ORDER BY a.created_at DESC, a.id DESC LIMIT ?`).all(organizationId, before, before, max)
    .map(row => ({ ...row, meta: row.meta ? JSON.parse(row.meta) : null }));
}

module.exports = { recordAudit, listAudit };
