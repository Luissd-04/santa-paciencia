const { db } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const { syncOperationalEventsToGoogle } = require('../services/calendarService');
const { recordHistory } = require('../services/reservationHistoryService');
const { getOccupancyStats, occupancyRate, firstOfMonth: firstDayOfMonth } = require('../services/occupancyStats');
const { localDateIso } = require('../services/reservationRules');
const { isUnderpaid, formatEUR, fromCents, cents } = require('../services/money');

async function getDashboardStats(req, res, next) {
  try {
    const organizationId = req.user.organization_id;
    const now = new Date();
    // Janela [1 do mês, 1 do mês seguinte) — o limite superior é exclusivo para
    // que a última noite do mês (check-out no dia 1 seguinte) também conte.
    const monthStart = firstDayOfMonth(now.getFullYear(), now.getMonth() + 1);
    const nextMonthStart = now.getMonth() === 11
      ? firstDayOfMonth(now.getFullYear() + 1, 1)
      : firstDayOfMonth(now.getFullYear(), now.getMonth() + 2);

    const financial = db.prepare(`
      SELECT
        COALESCE(SUM(${require('../services/reportingService').revenueSql('reservations')}), 0) AS reserved,
        COALESCE(SUM(CASE WHEN status != 'cancelada' AND trim(COALESCE(invoice_number, '')) != '' THEN total_amount ELSE 0 END), 0) AS invoiced,
        COALESCE(SUM(amount_paid), 0) AS received
      FROM reservations WHERE organization_id = ?
    `).get(organizationId);

    const confirmedReservations = db.prepare(`
      SELECT COUNT(*) as count FROM reservations WHERE organization_id = ? AND status = 'confirmada'
    `).get(organizationId);

    const todayDate = localDateIso(now);
    const today = db.prepare(`SELECT
      COUNT(CASE WHEN check_in=? THEN 1 END) AS arrivals,
      COUNT(CASE WHEN check_out=? THEN 1 END) AS departures,
      COUNT(CASE WHEN payment_status='pendente' THEN 1 END) AS pendingPayments,
      COUNT(CASE WHEN check_in=? AND status='confirmada' THEN 1 END) AS confirmedArrivals,
      COUNT(CASE WHEN check_in=? AND status='pendente' THEN 1 END) AS pendingArrivals
      FROM reservations WHERE organization_id=? AND status!='cancelada'`)
      .get(todayDate, todayDate, todayDate, todayDate, organizationId);
    const upcoming = db.prepare(`SELECT r.id,r.accommodation_id,r.check_in,r.check_out,r.nights,r.status,
      g.name AS guest_name,a.name AS accommodation_name FROM reservations r
      JOIN guests g ON g.id=r.guest_id AND g.organization_id=r.organization_id
      JOIN accommodations a ON a.id=r.accommodation_id AND a.organization_id=r.organization_id
      WHERE r.organization_id=? AND r.status NOT IN ('cancelada','check_out') AND r.check_in>=?
      ORDER BY r.check_in,r.id LIMIT 5`).all(organizationId, todayDate);

    // Noites-quarto: uma reserva do alojamento inteiro (ou multi-suite) ocupa
    // várias unidades por noite, não apenas uma.
    const occupancy = getOccupancyStats(organizationId, monthStart, nextMonthStart);

    // Ocupação por unidade no mês corrente, para o painel "Disponibilidade".
    const unitRows = occupancy.unitIds.length ? db.prepare(`
      SELECT id, name, color, price_per_night FROM accommodations
      WHERE organization_id = ? AND id IN (${occupancy.unitIds.map(() => '?').join(',')})
      ORDER BY name
    `).all(organizationId, ...occupancy.unitIds) : [];
    const availability = unitRows.map(unit => {
      const nights = occupancy.byUnit[unit.id] || 0;
      return {
        id: unit.id,
        name: unit.name,
        color: unit.color,
        price_per_night: unit.price_per_night,
        nights,
        days_in_month: occupancy.totalDays,
        occupancy_rate: occupancyRate(nights, occupancy.totalDays),
      };
    });

    res.json({
      success: true,
      data: {
        totalReserved: financial.reserved,
        totalInvoiced: financial.invoiced,
        totalReceived: financial.received,
        totalBilled: financial.invoiced, // Alias de compatibilidade; valor com fatura registada.
        confirmedReservations: confirmedReservations.count,
        nightsThisMonth: occupancy.occupiedNights,
        occupancyRate: occupancy.rate,
        month: monthStart.slice(0, 7),
        today,
        upcoming,
        availability
      }
    });
  } catch (err) {
    next(err);
  }
}

// Tarefa operacional de check-in/check-out de uma reserva (a mais relevante:
// primeiro a que coincide com a data atual da reserva, senão a mais recente).
function findReservationTask(orgId, reservationId, kind, date) {
  return db.prepare(`
    SELECT * FROM operational_events
    WHERE organization_id = ? AND reservation_id = ? AND auto_kind = ?
    ORDER BY (date = ?) DESC, created_at DESC
  `).get(orgId, reservationId, kind, date);
}

function getReservationTaskStatus(orgId, reservation) {
  const checkin = findReservationTask(orgId, reservation.id, 'checkin', reservation.check_in);
  const checkout = findReservationTask(orgId, reservation.id, 'checkout', reservation.check_out);
  return {
    checkin_done: checkin?.status === 'concluido',
    checkout_done: checkout?.status === 'concluido',
  };
}

// POST /api/reservations/:id/task-status  { kind: 'checkin'|'checkout', done: bool }
// Marca a tarefa de check-in/check-out como feita (ou volta a planeado) a partir
// da ficha da reserva. Cria a tarefa já concluída se ainda não existir (ex.:
// geração automática desligada nas definições).
function setTaskStatus(req, res, next) {
  try {
    const orgId = req.user.organization_id;
    const kind = req.body?.kind;
    const done = !!req.body?.done;
    if (!['checkin', 'checkout'].includes(kind)) {
      return res.status(400).json({ success: false, error: 'Tipo de tarefa inválido.' });
    }

    const r = db.prepare(`
      SELECT r.*, a.name AS accommodation_name
      FROM reservations r
      JOIN accommodations a ON a.id = r.accommodation_id
      WHERE r.id = ? AND r.organization_id = ?
    `).get(req.params.id, orgId);
    if (!r) return res.status(404).json({ success: false, error: 'Reserva não encontrada.' });

    const date = kind === 'checkin' ? r.check_in : r.check_out;
    const existing = findReservationTask(orgId, r.id, kind, date);

    if (existing) {
      db.prepare(`
        UPDATE operational_events
        SET status = ?, completed_at = ?, updated_at = datetime('now')
        WHERE id = ? AND organization_id = ?
      `).run(done ? 'concluido' : 'planeado', done ? new Date().toISOString() : null, existing.id, orgId);
    } else if (done) {
      db.prepare(`
        INSERT OR IGNORE INTO operational_events (
          id, organization_id, title, type, date, accommodation_id,
          status, notes, reservation_id, created_by_user_id, completed_at,
          auto_generated, auto_kind, auto_key, important
        ) VALUES (?, ?, ?, ?, ?, ?, 'concluido', ?, ?, ?, ?, 1, ?, ?, 0)
      `).run(
        uuidv4(), orgId,
        `${kind === 'checkin' ? 'Check-in' : 'Check-out'} · ${r.accommodation_name}`,
        kind, date, r.accommodation_id,
        `Reserva ${r.id}`, r.id, req.user.id, new Date().toISOString(),
        kind, `${r.id}:${kind}:${date}:${r.accommodation_id || 'geral'}`
      );
    }

    recordHistory({
      organizationId: orgId, reservationId: r.id, userId: req.user.id, action: 'task_status',
      meta: { kind, done },
    });

    const task = findReservationTask(orgId, r.id, kind, date);
    if (task) syncOperationalEventsToGoogle([task], { userId: req.user.id, organizationId: orgId })
      .catch(err => console.error('Erro ao sincronizar estado da tarefa:', err.message));
    res.json({ success: true, data: getReservationTaskStatus(orgId, r) });
  } catch (err) {
    next(err);
  }
}

// GET /api/reservations/:id/history — timeline da reserva (staff)
function getHistory(req, res, next) {
  try {
    const organizationId = req.user.organization_id;
    const reservation = db.prepare('SELECT id FROM reservations WHERE id = ? AND organization_id = ?')
      .get(req.params.id, organizationId);
    if (!reservation) return res.status(404).json({ error: 'Reserva não encontrada' });

    const rows = db.prepare(`
      SELECT h.*, u.name AS user_name
      FROM reservation_history h
      LEFT JOIN users u ON u.id = h.user_id
      WHERE h.reservation_id = ? AND h.organization_id = ?
      ORDER BY h.created_at DESC, h.rowid DESC
    `).all(req.params.id, organizationId);

    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
}

function getNotifications(req, res, next) {
  try {
    const orgId = req.user.organization_id;
    const today    = localDateIso();
    const tomorrow = localDateIso(new Date(), 1);

    const baseSelect = `
      SELECT r.id, r.check_in, r.check_out, r.status, r.total_amount, r.amount_paid,
             g.name as guest_name, a.name as accommodation_name
      FROM reservations r
      JOIN guests g ON g.id = r.guest_id
      JOIN accommodations a ON a.id = r.accommodation_id
      WHERE r.organization_id = ?`;

    // Check-ins/outs com a tarefa operacional já concluída não geram notificação
    // (o motivo do alerta está resolvido — marcado como feito na ficha ou nos eventos).
    const notDone = kind => `
      AND NOT EXISTS (
        SELECT 1 FROM operational_events e
        WHERE e.organization_id = r.organization_id
          AND e.reservation_id = r.id
          AND e.auto_kind = '${kind}'
          AND e.status = 'concluido'
      )`;

    const checkinsToday    = db.prepare(`${baseSelect} AND r.check_in = ?  AND r.status != 'cancelada' ${notDone('checkin')}`).all(orgId, today);
    const checkinsTomorrow = db.prepare(`${baseSelect} AND r.check_in = ?  AND r.status != 'cancelada' ${notDone('checkin')}`).all(orgId, tomorrow);
    const checkoutsToday   = db.prepare(`${baseSelect} AND r.check_out = ? AND r.status != 'cancelada' ${notDone('checkout')}`).all(orgId, today);
    const pending          = db.prepare(`${baseSelect} AND r.status = 'pendente'`).all(orgId);
    const unpaid           = db.prepare(`${baseSelect} AND r.status = 'confirmada' AND r.total_amount > 0`).all(orgId)
      .filter(r => isUnderpaid(r.amount_paid, r.total_amount));
    const importantTasks   = db.prepare(`
      SELECT e.id, e.title, e.date, e.start_time, e.type, e.reservation_id,
             a.name AS accommodation_name
      FROM operational_events e
      LEFT JOIN accommodations a ON a.id = e.accommodation_id AND a.organization_id = e.organization_id
      WHERE e.organization_id = ?
        AND e.status = 'planeado'
        AND e.important = 1
        AND e.date >= ?
        AND e.date <= ?
      ORDER BY e.date ASC, COALESCE(e.start_time, '99:99') ASC
    `).all(orgId, today, tomorrow);

    const notifications = [];

    checkinsToday.forEach(r => notifications.push({
      type: 'checkin_today', priority: 'high', icon: 'log-in',
      title: 'Check-in hoje',
      subtitle: `${r.guest_name} · ${r.accommodation_name}`,
      reservation_id: r.id,
    }));
    checkoutsToday.forEach(r => notifications.push({
      type: 'checkout_today', priority: 'high', icon: 'log-out',
      title: 'Check-out hoje',
      subtitle: `${r.guest_name} · ${r.accommodation_name}`,
      reservation_id: r.id,
    }));
    checkinsTomorrow.forEach(r => notifications.push({
      type: 'checkin_tomorrow', priority: 'high', icon: 'calendar-clock',
      title: 'Check-in amanhã',
      subtitle: `${r.guest_name} · ${r.accommodation_name}`,
      reservation_id: r.id,
    }));
    unpaid.forEach(r => {
      const em = fromCents(cents(r.total_amount) - cents(r.amount_paid || 0));
      notifications.push({
        type: 'unpaid', priority: 'medium', icon: 'circle-alert',
        title: 'Pagamento em falta',
        subtitle: `${r.guest_name} · ${formatEUR(em)} por receber`,
        reservation_id: r.id,
      });
    });
    pending.forEach(r => notifications.push({
      type: 'pending', priority: 'high', icon: 'clock',
      title: 'Reserva pendente',
      subtitle: `${r.guest_name} · ${r.accommodation_name}`,
      reservation_id: r.id,
    }));
    importantTasks.forEach(e => notifications.push({
      type: 'important_task',
      priority: e.date === today ? 'high' : 'medium',
      icon: e.type === 'limpeza' ? 'sparkles' : 'circle-alert',
      title: e.type === 'limpeza' ? 'Limpeza importante' : 'Tarefa importante',
      subtitle: `${e.title}${e.date === tomorrow ? ' · amanhã' : ''}${e.accommodation_name ? ` · ${e.accommodation_name}` : ''}`,
      reservation_id: e.reservation_id,
      event_id: e.id,
    }));

    if (req.user.role !== 'staff') {
      const issues = db.prepare(`SELECT id, guest_id, payment_policy_json, policy_accepted_at, policy_cancellation_json, status, total_amount, amount_paid, check_in, balance_notice_sent_at FROM reservations WHERE organization_id=? AND payment_policy_json IS NOT NULL`).all(orgId);
      for (const r of issues) {
        const cancellation = r.policy_cancellation_json && JSON.parse(r.policy_cancellation_json);
        let title;
        if (cancellation?.state === 'manual_review') title = 'Reembolso requer revisão manual';
        else if (cancellation && cancellation.state !== 'complete') title = 'Reembolso pendente';
        else if (!cancellation && isUnderpaid(r.amount_paid, r.total_amount) && !r.policy_accepted_at && r.status !== 'cancelada') title = 'Pagamento: falta aceitar as condições';
        else if (!cancellation && r.check_in <= today && isUnderpaid(r.amount_paid, r.total_amount) && r.status !== 'cancelada') title = 'Pagamento em falta na chegada ou após a estadia';
        if (title) notifications.push({ type: 'payment_review', priority: 'high', icon: 'circle-alert', title, subtitle: `Reserva ${r.id} · verifique os movimentos antes de cobrar ou reembolsar`, reservation_id: r.id });
      }
      const attempts = db.prepare("SELECT reservation_id FROM stripe_payment_attempts WHERE organization_id=? AND state IN ('creating','open','processing') AND datetime(created_at) < datetime('now','-23 hours') GROUP BY reservation_id").all(orgId);
      for (const a of attempts) notifications.push({ type: 'payment_review', priority: 'high', icon: 'circle-alert', title: 'Pagamento por reconciliar', subtitle: 'Confirme o resultado na Stripe antes de repetir a cobrança.', reservation_id: a.reservation_id });
      const deliveries = db.prepare(`SELECT reservation_id, template_slug,
          CASE WHEN SUM(state='uncertain') > 0 THEN 'uncertain' ELSE 'blocked' END AS state, MAX(last_error) AS last_error, MAX(updated_at) AS updated_at
        FROM email_deliveries WHERE organization_id=? AND state IN ('blocked','uncertain')
        GROUP BY reservation_id, template_slug ORDER BY updated_at DESC LIMIT 100`).all(orgId);
      // Avisos (emails, push) que esgotaram as tentativas: ninguém os recebeu.
      const effects = db.prepare(`SELECT e.reservation_id, e.type, f.effect, f.last_error FROM reservation_event_effects f
        JOIN reservation_events e ON e.id = f.event_id
        WHERE e.organization_id = ? AND f.state = 'failed' AND f.updated_at > datetime('now', '-14 days')
        ORDER BY f.updated_at DESC LIMIT 50`).all(orgId);
      for (const f of effects) notifications.push({ type: 'notice_failed', priority: 'high', icon: 'bell-off', title: 'Aviso não entregue',
        subtitle: `${f.effect.replace(/_/g, ' ')} · ${f.last_error || 'falhou depois de várias tentativas'}`, reservation_id: f.reservation_id });
      for (const d of deliveries) notifications.push({ type: 'email_review', priority: 'high', icon: 'mail', title: d.state === 'blocked' ? 'Email por enviar' : 'Envio de email por confirmar', subtitle: `${d.template_slug} · ${d.last_error || 'Aguarde a conclusão e confirme no Gmail antes de repetir.'}`, reservation_id: d.reservation_id, template_slug: d.template_slug, delivery_state: d.state });
    }
    res.json({ success: true, data: { notifications } });
  } catch (err) {
    next(err);
  }
}

module.exports = { getDashboardStats, getReservationTaskStatus, setTaskStatus, getHistory, getNotifications };
