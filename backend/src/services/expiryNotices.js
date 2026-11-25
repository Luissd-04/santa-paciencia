// Prazos a terminar: pedidos do site por aprovar (PUBLIC_PENDING_TTL_HOURS) e
// reservas aceites à espera do pagamento (deposit_deadline). Servem o sino
// («Pedido expira em 6 h») e o pré-aviso por push, uma vez por reserva e prazo.
const { db } = require('../config/database');

const WARN_HOURS = 12;
const sqliteMs = value => Date.parse(`${String(value).replace(' ', 'T')}${/Z|[+-]\d\d:?\d\d$/.test(String(value)) ? '' : 'Z'}`);

// [{ kind: 'request' | 'payment', reservation, deadline: Date, hours }] com o prazo
// daqui a mais de 0 e até WARN_HOURS horas.
function expiring(orgId, now = new Date()) {
  const { PENDING_TTL_HOURS, NEVER_PROGRESSED_SQL } = require('./reservationScheduler');
  const limit = now.getTime() + WARN_HOURS * 3600000;
  const base = `SELECT r.id, r.status, r.check_in, r.check_out, r.created_at, r.deposit_deadline, g.name AS guest_name, a.name AS accommodation_name
    FROM reservations r JOIN guests g ON g.id = r.guest_id AND g.organization_id = r.organization_id
    JOIN accommodations a ON a.id = r.accommodation_id AND a.organization_id = r.organization_id
    WHERE r.organization_id = ? AND COALESCE(r.amount_paid, 0) = 0`;
  const out = [];
  const add = (kind, reservation, deadlineMs) => {
    if (!Number.isFinite(deadlineMs) || deadlineMs <= now.getTime() || deadlineMs > limit) return;
    out.push({ kind, reservation, deadline: new Date(deadlineMs), hours: Math.max(1, Math.ceil((deadlineMs - now.getTime()) / 3600000)) });
  };
  for (const r of db.prepare(`${base} AND r.status = 'pendente' AND r.channel = 'website' AND ${NEVER_PROGRESSED_SQL.replaceAll('reservations.', 'r.')}`).all(orgId)) {
    add('request', r, sqliteMs(r.created_at) + PENDING_TTL_HOURS * 3600000);
  }
  for (const r of db.prepare(`${base} AND r.status = 'aguardar_pagamento' AND r.deposit_deadline IS NOT NULL`).all(orgId)) {
    add('payment', r, Date.parse(r.deposit_deadline));
  }
  return out;
}

// Reservas aceites à espera do pagamento (para o sino), com o prazo.
function awaitingPayment(orgId) {
  return db.prepare(`SELECT r.id, r.deposit_deadline, g.name AS guest_name, a.name AS accommodation_name
    FROM reservations r JOIN guests g ON g.id = r.guest_id AND g.organization_id = r.organization_id
    JOIN accommodations a ON a.id = r.accommodation_id AND a.organization_id = r.organization_id
    WHERE r.organization_id = ? AND r.status = 'aguardar_pagamento' AND r.total_amount - COALESCE(r.amount_paid, 0) > 0.005
    ORDER BY r.deposit_deadline IS NULL, r.deposit_deadline`).all(orgId);
}

// Prazo por extenso na hora do alojamento («sex, 27 nov às 10:00»).
function deadlineText(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const dates = require('./dates');
  const day = dates.localDay(date);
  const { hour, minute } = dates.localTime(date);
  return `${dates.weekdayDate(day)} às ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

// Uma passagem do agendador: avisa por push (uma vez por reserva e prazo).
function warnExpiring(now = new Date()) {
  const events = require('./reservationEvents');
  let sent = 0;
  for (const { organization_id: orgId } of db.prepare('SELECT DISTINCT organization_id FROM push_subscriptions').all()) {
    for (const e of expiring(orgId, now)) {
      const id = events.emitOnce('reservation.expiring', { organizationId: orgId, reservationId: e.reservation.id, payload: { kind: e.kind, deadline: e.deadline.toISOString() } },
        `${e.kind}:${e.deadline.toISOString()}`);
      if (id) sent++;
    }
  }
  return sent;
}

module.exports = { expiring, awaitingPayment, deadlineText, warnExpiring, WARN_HOURS };
