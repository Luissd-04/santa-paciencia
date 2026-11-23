// Portal do hóspede (/reserva/:token): quando o hóspede o abriu e quando a
// equipa lhe enviou o link. A ficha da reserva mostra «Último envio · aberto
// pelo hóspede a …».
//
// Só conta o hóspede: um pedido com uma sessão válida de alguém da equipa da
// organização da reserva (ex.: «Abrir o portal ↗» na ficha) não é registado.
// Não se guarda o IP nem o navegador, só as horas.
const { db } = require('../config/database');
const { SESSION_COOKIE, digestToken } = require('./authService');

// A última abertura grava-se no máximo uma vez a cada 10 minutos: recarregar a
// página (ou o regresso da Stripe) não escreve na base a cada pedido.
const OPEN_THROTTLE_MINUTES = 10;

function sessionCookie(req) {
  for (const part of String(req.headers?.cookie || '').split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1 || part.slice(0, idx).trim() !== SESSION_COOKIE) continue;
    try { return decodeURIComponent(part.slice(idx + 1).trim()); } catch { return ''; }
  }
  return '';
}

// Há uma sessão ativa de alguém da equipa desta organização? Consulta direta
// (sem getSessionUser) para a visita ao portal não contar como atividade da
// equipa nem prolongar a sessão.
function isStaffViewer(req, organizationId) {
  const sessionId = sessionCookie(req);
  if (!/^[a-f0-9]{64}$/.test(sessionId) || !organizationId) return false;
  return Boolean(db.prepare(`SELECT 1 FROM auth_sessions s
      JOIN users u ON u.id = s.user_id AND u.active = 1
      JOIN memberships m ON m.user_id = s.user_id AND m.organization_id = ? AND m.active = 1
    WHERE s.id = ? AND s.expires_at > ?`).get(organizationId, digestToken(sessionId), new Date().toISOString()));
}

// Regista a abertura pelo hóspede. Devolve true quando escreveu.
function recordOpen(req, reservation) {
  if (!reservation?.id || isStaffViewer(req, reservation.organization_id)) return false;
  return db.prepare(`UPDATE reservations
      SET portal_first_opened_at = COALESCE(portal_first_opened_at, datetime('now')),
          portal_last_opened_at = datetime('now')
    WHERE id = ? AND organization_id = ?
      AND (portal_last_opened_at IS NULL OR portal_last_opened_at <= datetime('now', ?))`)
    .run(reservation.id, reservation.organization_id, `-${OPEN_THROTTLE_MINUTES} minutes`).changes > 0;
}

// Último envio do link do portal por email (modelo «A sua reserva»), a partir
// do registo dos envios (email_deliveries), no formato do SQLite (UTC).
function lastLinkSentAt(organizationId, reservationId) {
  const row = db.prepare(`SELECT MAX(updated_at) AS at FROM email_deliveries
    WHERE organization_id = ? AND reservation_id = ? AND template_slug = 'portal_hospede' AND state = 'sent'`).get(organizationId, reservationId);
  return row?.at ? new Date(Number(row.at)).toISOString().slice(0, 19).replace('T', ' ') : null;
}

module.exports = { OPEN_THROTTLE_MINUTES, isStaffViewer, recordOpen, lastLinkSentAt };
