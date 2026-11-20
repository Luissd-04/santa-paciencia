const { randomUUID } = require('crypto');
const { db } = require('../config/database');
const { httpError } = require('./httpError');
const files = require('./supportAttachments');
const { recordPlatformAudit } = require('./platformAccess');
function listReplies() { return db.prepare('SELECT * FROM support_saved_replies ORDER BY title COLLATE NOCASE').all(); }
function saveReply(id, input) {
  const title = typeof input?.title === 'string' ? input.title.trim() : '';
  const body = typeof input?.body === 'string' ? input.body.trim() : '';
  if (!title || title.length > 80 || !body || body.length > 5000) throw httpError('Indique um título (até 80 caracteres) e uma resposta (até 5000 caracteres).', 400);
  if (id && !db.prepare('SELECT 1 FROM support_saved_replies WHERE id=?').get(id)) throw httpError('Resposta não encontrada.', 404);
  if (!id && db.prepare('SELECT COUNT(*) AS n FROM support_saved_replies').get().n >= 100) throw httpError('Limite de 100 respostas guardadas.', 400);
  id ||= randomUUID();
  db.prepare(`INSERT INTO support_saved_replies(id,title,body) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,body=excluded.body,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`).run(id,title,body);
  return db.prepare('SELECT * FROM support_saved_replies WHERE id=?').get(id);
}
function deleteReply(id) {
  if (!db.prepare('DELETE FROM support_saved_replies WHERE id=?').run(id).changes) throw httpError('Resposta não encontrada.',404);
}
// Fila persistente: se o disco falhar, a próxima manutenção tenta novamente.
function drainFiles() {
  for (const row of db.prepare('SELECT stored_name FROM support_file_deletions').all()) {
    files.removeStored([row]);
    db.prepare('DELETE FROM support_file_deletions WHERE stored_name=?').run(row.stored_name);
  }
}
function removeTicket(id, userId = null) {
  db.transaction(() => {
    if (!db.prepare('SELECT 1 FROM support_tickets WHERE id=?').get(id)) throw httpError('Pedido não encontrado.',404);
    db.prepare('INSERT OR IGNORE INTO support_file_deletions SELECT stored_name FROM support_attachments WHERE ticket_id=?').run(id);
    db.prepare('DELETE FROM support_tickets WHERE id=?').run(id);
    recordPlatformAudit({ userId, action: 'support.delete', targetType: 'support_ticket', targetId: id });
  })();
  drainFiles();
}
function removeAttachment(id, userId) {
  db.transaction(() => {
    const row = files.findAttachment(id);
    if (!row) throw httpError('Anexo não encontrado.',404);
    db.prepare('INSERT OR IGNORE INTO support_file_deletions VALUES(?)').run(row.stored_name);
    db.prepare('DELETE FROM support_attachments WHERE id=?').run(id);
    recordPlatformAudit({ userId, action: 'support.attachment_delete', targetType: 'support_ticket', targetId: row.ticket_id });
  })();
  drainFiles();
}
function retentionDays() {
  // Ativação explícita pela administração: 0 mantém a limpeza automática desligada.
  const raw = db.prepare('SELECT retention_days FROM platform_support_settings WHERE id=1').get()?.retention_days ?? Number(process.env.SUPPORT_RETENTION_DAYS || 0);
  return Number.isInteger(raw) && raw >= 30 && raw <= 3650 ? raw : 0;
}
function setRetention(days, userId) {
  if (!Number.isInteger(days) || (days !== 0 && (days < 30 || days > 3650))) throw httpError('Escolha 0 (desligado) ou um prazo entre 30 e 3650 dias.',400);
  db.prepare('INSERT INTO platform_support_settings(id,retention_days) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET retention_days=excluded.retention_days').run(days);
  recordPlatformAudit({ userId, action: 'support.retention', details: { days } });
  return { days };
}
function cleanup(now = new Date()) {
  drainFiles();
  const days = retentionDays();
  if (!days) return { deleted: 0, days };
  const cutoff = new Date(now.getTime() - days * 86400000).toISOString();
  const rows = db.prepare("SELECT id FROM support_tickets WHERE status='resolved' AND datetime(updated_at)<datetime(?) LIMIT 100").all(cutoff);
  for (const row of rows) removeTicket(row.id);
  return { deleted: rows.length, days };
}
module.exports = { listReplies, saveReply, deleteReply, removeTicket, removeAttachment, retentionDays, setRetention, cleanup };
