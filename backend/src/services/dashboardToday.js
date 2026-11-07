// Dados do painel da V2: o dia de hoje (chegadas, saídas e tarefas), o que
// precisa de atenção, o valor por receber e a ocupação do mês anterior. Junta-se
// ao resumo de /stats/dashboard; a V1 ignora estes campos.
const { db } = require('../config/database');
const { getOccupancyStats, firstOfMonth } = require('./occupancyStats');
const { addDays } = require('./dates');

const ACTIVE = "r.status NOT IN ('cancelada')";
const RESERVATION_COLUMNS = `r.id, r.check_in, r.check_out, r.nights, r.status, r.arrival_time,
  r.total_amount, r.amount_paid, r.precheckin_submitted_at, g.name AS guest_name, a.name AS accommodation_name,
  a.color AS accommodation_color, COALESCE(a.checkin_time, p.checkin_time) AS checkin_time,
  COALESCE(a.checkout_time, p.checkout_time) AS checkout_time`;
const FROM = `FROM reservations r
  JOIN guests g ON g.id = r.guest_id AND g.organization_id = r.organization_id
  JOIN accommodations a ON a.id = r.accommodation_id AND a.organization_id = r.organization_id
  LEFT JOIN accommodations p ON p.id = a.parent_id AND p.organization_id = a.organization_id`;

const missing = r => Math.max(0, Math.round((Number(r.total_amount || 0) - Number(r.amount_paid || 0)) * 100) / 100);

function taskDone(orgId, reservationId, kind) {
  return db.prepare(`SELECT 1 FROM operational_events WHERE organization_id = ? AND reservation_id = ? AND auto_kind = ? AND status = 'concluido' LIMIT 1`)
    .get(orgId, reservationId, kind) ? true : false;
}

function reservationItem(orgId, r, kind) {
  return {
    id: r.id, kind, guest_name: r.guest_name, accommodation_name: r.accommodation_name, accommodation_color: r.accommodation_color,
    status: r.status, time: kind === 'checkin' ? (r.arrival_time || r.checkin_time || null) : (r.checkout_time || null),
    missing: missing(r), done: taskDone(orgId, r.id, kind),
  };
}

function dashboardToday(orgId, today, now = new Date()) {
  const arrivals = db.prepare(`SELECT ${RESERVATION_COLUMNS} ${FROM} WHERE r.organization_id = ? AND ${ACTIVE} AND r.check_in = ? ORDER BY r.arrival_time, g.name`).all(orgId, today);
  const departures = db.prepare(`SELECT ${RESERVATION_COLUMNS} ${FROM} WHERE r.organization_id = ? AND ${ACTIVE} AND r.check_out = ? ORDER BY g.name`).all(orgId, today);
  // Tarefas manuais do dia (as de check-in/check-out já aparecem como chegadas e saídas).
  const tasks = db.prepare(`SELECT e.id, e.title, e.type, e.start_time, e.status, e.responsible, a.name AS accommodation_name
    FROM operational_events e LEFT JOIN accommodations a ON a.id = e.accommodation_id AND a.organization_id = e.organization_id
    WHERE e.organization_id = ? AND e.date = ? AND e.auto_kind IS NULL ORDER BY COALESCE(e.start_time, '99'), e.title`).all(orgId, today)
    .map(t => ({ ...t, done: t.status === 'concluido' }));
  const items = [
    ...departures.map(r => reservationItem(orgId, r, 'checkout')),
    ...tasks.map(t => ({ kind: 'task', id: t.id, title: t.title, type: t.type, time: t.start_time || null, accommodation_name: t.accommodation_name, responsible: t.responsible, done: t.done })),
    ...arrivals.map(r => reservationItem(orgId, r, 'checkin')),
  ].sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));

  const pendingApproval = db.prepare(`SELECT ${RESERVATION_COLUMNS} ${FROM} WHERE r.organization_id = ? AND r.status = 'pendente' ORDER BY r.check_in LIMIT 20`).all(orgId);
  const awaitingDeposit = db.prepare(`SELECT ${RESERVATION_COLUMNS} ${FROM} WHERE r.organization_id = ? AND r.status IN ('aguardar_pagamento','pre_reserva')
    AND r.total_amount - COALESCE(r.amount_paid, 0) > 0.005 ORDER BY r.check_in LIMIT 20`).all(orgId);
  const precheckinMissing = db.prepare(`SELECT ${RESERVATION_COLUMNS} ${FROM} WHERE r.organization_id = ? AND r.status = 'confirmada'
    AND r.precheckin_submitted_at IS NULL AND r.check_in BETWEEN ? AND ? ORDER BY r.check_in LIMIT 20`).all(orgId, today, addDays(today, 7));
  const brief = r => ({ id: r.id, guest_name: r.guest_name, check_in: r.check_in, check_out: r.check_out, accommodation_name: r.accommodation_name, missing: missing(r) });

  const receivable = db.prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(total_amount - COALESCE(amount_paid, 0)), 0) AS amount
    FROM reservations r WHERE r.organization_id = ? AND ${ACTIVE} AND r.total_amount - COALESCE(r.amount_paid, 0) > 0.005`).get(orgId);

  const year = now.getFullYear(), month = now.getMonth() + 1;
  const prevStart = month === 1 ? firstOfMonth(year - 1, 12) : firstOfMonth(year, month - 1);
  const previous = getOccupancyStats(orgId, prevStart, firstOfMonth(year, month));

  return {
    today: items,
    attention: { pendingApproval: pendingApproval.map(brief), awaitingDeposit: awaitingDeposit.map(brief), precheckinMissing: precheckinMissing.map(brief) },
    receivable: { count: receivable.count, amount: Math.round(receivable.amount * 100) / 100 },
    previousOccupancyRate: previous.rate,
  };
}

module.exports = { dashboardToday };
