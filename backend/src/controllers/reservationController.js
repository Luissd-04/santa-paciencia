const { deleteCalendarEvent } = require('../services/calendarService');
const { sendCancellationEmail, sendPreCheckinEmail } = require('../services/emailService');

const {
  syncReservationOperationalTasks,
  queueReservationTaskCleanup,
  flushReservationTaskCleanup,
} = require('../services/operationalTasksService');

const { addPayment, deletePayment, saveInvoice } = require('./reservationPaymentsController');

const { unavailableUnits } = require('../services/reservationAvailability');

const { db } = require('../config/database');
const { getReservationBirthDates } = require('../services/reservationRules');

const { notifyOrganization } = require('../services/pushService');
const { recordHistory } = require('../services/reservationHistoryService');

const { safeJson, computeStandardTotals, getOrganizationServices, publicUrl, ensurePublicToken, ensurePrecheckinToken } = require('../services/reservationSupport');
const { create, update } = require('./reservationWriteController');
const { getDashboardStats, getReservationTaskStatus, setTaskStatus, getHistory, getNotifications } = require('./reservationOperationsController');

async function getAvailability(req, res, next) {
  try {
    const { check_in, check_out, exclude_id } = req.query;
    const organizationId = req.user.organization_id;
    if (!check_in || !check_out) {
      return res.json({ success: true, data: { unavailable: [] } });
    }

    const unavailable = unavailableUnits(organizationId, check_in, check_out, exclude_id);
    res.json({ success: true, data: { unavailable } });
  } catch (err) {
    next(err);
  }
}

// GET /api/reservations
async function getAll(req, res, next) {
  try {
    const result = require('../services/listQueries').listReservations(req.user.organization_id, req.query);
    res.json({ success: true, ...result });
  } catch (error) { next(error); }
}

// GET /api/reservations/:id
async function getById(req, res, next) {
  try {
    const reservation = db.prepare(`
      SELECT r.*, g.name as guest_name, g.email as guest_email, g.phone as guest_phone,
             g.document_number, g.nationality, g.rgpd_consent,
             g.company as guest_company, g.nif as guest_nif,
             a.name as accommodation_name, a.license_number
      FROM reservations r
      JOIN guests g ON r.guest_id = g.id
      JOIN accommodations a ON r.accommodation_id = a.id
      WHERE r.id = ? AND r.organization_id = ?
    `).get(req.params.id, req.user.organization_id);

    if (!reservation) return res.status(404).json({ error: 'Reserva não encontrada' });

    reservation.payments = db.prepare(`
      SELECT * FROM reservation_payments
      WHERE reservation_id = ? AND organization_id = ?
      ORDER BY payment_date ASC, created_at ASC
    `).all(req.params.id, req.user.organization_id);

    // Estado das tarefas de check-in/check-out (para os botões "feito" na ficha)
    reservation.task_status = getReservationTaskStatus(req.user.organization_id, reservation);

    // Total padrão do calendário dinâmico (referência para desconto/acréscimo na ficha)
    try {
      const orgId = req.user.organization_id;
      const acc = db.prepare('SELECT * FROM accommodations WHERE id = ? AND organization_id = ?')
        .get(reservation.accommodation_id, orgId);
      const periods = db.prepare('SELECT * FROM pricing_periods WHERE accommodation_id = ? AND organization_id = ? ORDER BY start_date ASC')
        .all(reservation.accommodation_id, orgId);
      const guestRow = db.prepare('SELECT birth_date FROM guests WHERE id = ? AND organization_id = ?')
        .get(reservation.guest_id, orgId) || {};
      const standard = computeStandardTotals(
        orgId, reservation, acc, periods, getOrganizationServices(orgId),
        getReservationBirthDates(guestRow, safeJson(reservation.guests_data, []))
      );
      reservation.standard_total = standard.totalAmount;
      reservation.standard_nightly_prices = standard.nightlyPrices;
    } catch { /* referência indisponível */ }

    if (reservation.price_edited_by_user_id) {
      reservation.price_edited_by_name = db.prepare('SELECT name FROM users WHERE id = ?')
        .get(reservation.price_edited_by_user_id)?.name || null;
    }

    res.json({ success: true, data: reservation });
  } catch (err) {
    next(err);
  }
}

// POST /api/reservations/:id/payments
// POST /api/reservations
async function cancel(req, res, next) {
  try {
    const organizationId = req.user.organization_id;
    const reservation = db.prepare('SELECT * FROM reservations WHERE id = ? AND organization_id = ?').get(req.params.id, organizationId);
    if (!reservation) return res.status(404).json({ error: 'Reserva não encontrada' });

    db.prepare(`
      UPDATE reservations SET
        status = 'cancelada',
        cancelled_previous_status = CASE WHEN status != 'cancelada' THEN status ELSE cancelled_previous_status END,
        cancelled_previous_payment_status = payment_status,
        updated_at = datetime('now')
      WHERE id = ? AND organization_id = ?
    `).run(req.params.id, organizationId);
    recordHistory({ organizationId, reservationId: req.params.id, userId: req.user.id, action: 'cancelled' });
    syncReservationOperationalTasks({ ...reservation, status: 'cancelada' }, req.user.id);

    // Remover do Google Calendar
    deleteCalendarEvent(reservation, {
      userId: reservation.google_calendar_user_id || req.user.id,
      organizationId
    });

    // Email de cancelamento
    const guest = db.prepare('SELECT * FROM guests WHERE id = ? AND organization_id = ?').get(reservation.guest_id, organizationId);
    const accommodation = db.prepare('SELECT * FROM accommodations WHERE id = ? AND organization_id = ?')
      .get(reservation.accommodation_id, organizationId);
    sendCancellationEmail(guest, reservation, accommodation)
      .catch(err => console.warn('Email não enviado:', err.message));

    notifyOrganization(organizationId, 'cancellation', {
      title: '❌ Reserva cancelada',
      body: `${guest?.name || 'Hóspede'} · ${accommodation?.name || ''} · ${reservation.check_in} → ${reservation.check_out}`,
      url: `/reservas?reserva=${req.params.id}`,
      excludeUserId: req.user.id,
    });

    res.json({ success: true, message: 'Reserva cancelada' });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/reservations/:id/permanent  (apagar definitivamente)
// Pré-requisito: reserva tem de estar `cancelada`. Apaga em cascade os
// pagamentos e eventos operacionais ligados. NÃO toca em:
//   • hóspede (guests) — pode ter outras reservas
//   • vouchers usados — mantém auditoria de qual reserva consumiu o voucher
//   • organization_email_log — histórico de comunicação por compliance RGPD
async function hardDelete(req, res, next) {
  try {
    const organizationId = req.user.organization_id;
    const reservation = db.prepare('SELECT * FROM reservations WHERE id = ? AND organization_id = ?')
      .get(req.params.id, organizationId);
    if (!reservation) return res.status(404).json({ error: 'Reserva não encontrada' });
    if (reservation.status !== 'cancelada') {
      return res.status(409).json({ error: 'Só é possível apagar reservas já canceladas. Cancela primeiro.' });
    }

    db.transaction(() => {
      // A fila é gravada na mesma transação e antes dos eventos locais. Assim os
      // IDs externos sobrevivem mesmo quando o Google está temporariamente em erro.
      queueReservationTaskCleanup(organizationId, reservation.id);
      db.prepare('DELETE FROM reservation_payments WHERE reservation_id = ? AND organization_id = ?')
        .run(reservation.id, organizationId);
      db.prepare('DELETE FROM operational_events WHERE reservation_id = ? AND organization_id = ?')
        .run(reservation.id, organizationId);
      db.prepare('DELETE FROM reservation_history WHERE reservation_id = ? AND organization_id = ?')
        .run(reservation.id, organizationId);
      db.prepare('DELETE FROM reservations WHERE id = ? AND organization_id = ?')
        .run(reservation.id, organizationId);
    })();

    const cleanup = await flushReservationTaskCleanup(organizationId);
    const message = cleanup.pending
      ? `Reserva apagada definitivamente. ${cleanup.pending} tarefa(s) do Google aguardam nova tentativa.`
      : 'Reserva apagada definitivamente.';
    res.json({ success: true, message, data: { google_tasks_cleanup: cleanup } });
  } catch (err) {
    next(err);
  }
}

async function approve(req, res, next) {
  try {
    const organizationId = req.user.organization_id;
    const reservation = db.prepare(`
      SELECT r.*, g.name as guest_name, g.email as guest_email
      FROM reservations r
      JOIN guests g ON r.guest_id = g.id AND r.organization_id = g.organization_id
      WHERE r.id = ? AND r.organization_id = ?
    `).get(req.params.id, organizationId);
    if (!reservation) return res.status(404).json({ error: 'Reserva não encontrada' });
    if (reservation.status === 'cancelada') return res.status(400).json({ error: 'Reserva cancelada não pode ser aprovada.' });

    ensurePublicToken(reservation);
    const precheckinToken = ensurePrecheckinToken(reservation);
    db.prepare("UPDATE reservations SET status = 'pre_checkin', updated_at = datetime('now') WHERE id = ? AND organization_id = ?")
      .run(req.params.id, organizationId);

    const updated = db.prepare('SELECT * FROM reservations WHERE id = ? AND organization_id = ?').get(req.params.id, organizationId);
    const guest = db.prepare('SELECT * FROM guests WHERE id = ? AND organization_id = ?').get(updated.guest_id, organizationId);
    const accommodation = db.prepare('SELECT * FROM accommodations WHERE id = ? AND organization_id = ?').get(updated.accommodation_id, organizationId);
    const preCheckinUrl = `${publicUrl(req)}/pre-checkin/${precheckinToken}`;

    recordHistory({ organizationId, reservationId: req.params.id, userId: req.user.id, action: 'approved' });
    sendPreCheckinEmail(guest, updated, accommodation, preCheckinUrl)
      .catch(err => console.warn('Email de pre-check-in não enviado:', err.message));
    syncReservationOperationalTasks({ ...updated, guest_name: guest.name, accommodation_name: accommodation.name }, req.user.id);

    res.json({ success: true, data: { ...updated, pre_checkin_url: preCheckinUrl } });
  } catch (err) {
    next(err);
  }
}

// POST /api/reservations/:id/send-precheckin
// Gera (se necessário) e envia o link de pré-checkin sem alterar o estado da
// reserva — ao contrário de approve(), serve para reservas criadas
// diretamente no backoffice (nascem "confirmada", nunca passam por "pendente").
async function sendPrecheckinLink(req, res, next) {
  try {
    const organizationId = req.user.organization_id;
    const reservation = db.prepare(`
      SELECT r.*, g.name as guest_name, g.email as guest_email
      FROM reservations r
      JOIN guests g ON r.guest_id = g.id AND r.organization_id = g.organization_id
      WHERE r.id = ? AND r.organization_id = ?
    `).get(req.params.id, organizationId);
    if (!reservation) return res.status(404).json({ error: 'Reserva não encontrada' });
    if (reservation.status === 'cancelada') return res.status(400).json({ error: 'Reserva cancelada não pode receber link de pré-checkin.' });

    ensurePublicToken(reservation);
    const precheckinToken = ensurePrecheckinToken(reservation);

    const guest = db.prepare('SELECT * FROM guests WHERE id = ? AND organization_id = ?').get(reservation.guest_id, organizationId);
    const accommodation = db.prepare('SELECT * FROM accommodations WHERE id = ? AND organization_id = ?').get(reservation.accommodation_id, organizationId);
    const preCheckinUrl = `${publicUrl(req)}/pre-checkin/${precheckinToken}`;

    const shouldSend = req.body?.send !== false;
    let emailSent = false;
    if (shouldSend) {
      if (guest.email) {
        try {
          await sendPreCheckinEmail(guest, reservation, accommodation, preCheckinUrl);
          emailSent = true;
        } catch (err) {
          console.warn('Email de pre-check-in não enviado:', err.message);
        }
      }
    }

    res.json({ success: true, data: { pre_checkin_url: preCheckinUrl, email_sent: emailSent } });
  } catch (err) {
    next(err);
  }
}

// POST /api/reservations/:id/reopen-precheckin
// Limpa `precheckin_submitted_at` — o único bloqueio que impede o hóspede de
// voltar a abrir o formulário depois de submeter. O link continua o mesmo; a
// validade é estendida se já tiver passado.
async function reopenPrecheckinLink(req, res, next) {
  try {
    const organizationId = req.user.organization_id;
    const reservation = db.prepare(`
      SELECT r.*, g.name as guest_name, g.email as guest_email
      FROM reservations r
      JOIN guests g ON r.guest_id = g.id AND r.organization_id = g.organization_id
      WHERE r.id = ? AND r.organization_id = ?
    `).get(req.params.id, organizationId);
    if (!reservation) return res.status(404).json({ error: 'Reserva não encontrada' });
    if (reservation.status === 'cancelada') return res.status(400).json({ error: 'Reserva cancelada não pode reabrir o pré-checkin.' });

    ensurePublicToken(reservation);
    const precheckinToken = ensurePrecheckinToken(reservation);
    const today = new Date().toISOString().slice(0, 10);
    const expiresAt = !reservation.precheckin_token_expires_at || reservation.precheckin_token_expires_at < today
      ? (reservation.check_out && reservation.check_out >= today ? reservation.check_out : today)
      : reservation.precheckin_token_expires_at;

    db.prepare(`UPDATE reservations
      SET precheckin_submitted_at = NULL, precheckin_reopened_at = datetime('now'),
          precheckin_token_expires_at = ?, updated_at = datetime('now')
      WHERE id = ? AND organization_id = ?`)
      .run(expiresAt, req.params.id, organizationId);

    recordHistory({ organizationId, reservationId: req.params.id, userId: req.user.id, action: 'precheckin_reopened' });

    const preCheckinUrl = `${publicUrl(req)}/pre-checkin/${precheckinToken}`;
    let emailSent = false;
    if (req.body?.send === true && reservation.guest_email) {
      const accommodation = db.prepare('SELECT * FROM accommodations WHERE id = ? AND organization_id = ?').get(reservation.accommodation_id, organizationId);
      const guest = db.prepare('SELECT * FROM guests WHERE id = ? AND organization_id = ?').get(reservation.guest_id, organizationId);
      try {
        await sendPreCheckinEmail(guest, reservation, accommodation, preCheckinUrl);
        emailSent = true;
      } catch (err) {
        console.warn('Email de pre-check-in não enviado:', err.message);
      }
    }

    res.json({ success: true, data: { pre_checkin_url: preCheckinUrl, email_sent: emailSent } });
  } catch (err) {
    next(err);
  }
}

// GET /api/reservations/stats/dashboard
module.exports = { getAll, getById, create, update, approve, sendPrecheckinLink, reopenPrecheckinLink, cancel, hardDelete, getDashboardStats, getAvailability, getNotifications, addPayment, deletePayment, saveInvoice, setTaskStatus, getHistory };
