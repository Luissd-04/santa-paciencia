const { sendPreCheckinEmail } = require('../services/emailService');

const { flushReservationTaskCleanup } = require('../services/operationalTasksService');
const { purgeReservations } = require('../services/reservationPurge');

const { addPayment, deletePayment, saveInvoice } = require('./reservationPaymentsController');

const { unavailableUnits } = require('../services/reservationAvailability');

const { db } = require('../config/database');
const { getReservationBirthDates } = require('../services/reservationRules');

const { recordHistory } = require('../services/reservationHistoryService');

const { safeJson, computeStandardTotals, getOrganizationServices, publicUrl, ensurePublicToken, ensurePrecheckinToken } = require('../services/reservationSupport');
const { create, update, quote } = require('./reservationWriteController');
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

    // Reservas antigas podem ter apenas o token do pré-check-in. A ficha de
    // backoffice precisa também do token público para abrir o pagamento.
    if (req.user.role !== 'staff') ensurePublicToken(reservation);
    reservation.payment_policy = require('../services/paymentPolicy').describe(reservation);
    // Os três estados e o que a equipa pode fazer a seguir (reservationLifecycle).
    const lifecycle = require('../services/reservationLifecycle');
    reservation.precheckin_state = require('../services/reservationState').precheckinState(reservation);
    reservation.status_options = lifecycle.statusOptions(reservation, req.user);
    reservation.status_undo = lifecycle.undoStatus(reservation, req.user);
    reservation.can_pay_online = require('../services/stripePayments').awaitsOnlinePayment(reservation);

    reservation.payments = db.prepare(`
      SELECT * FROM reservation_payments
      WHERE reservation_id = ? AND organization_id = ?
      ORDER BY payment_date ASC, created_at ASC
    `).all(req.params.id, req.user.organization_id);

    // Estado das tarefas de check-in/check-out (para os botões "feito" na ficha)
    reservation.task_status = getReservationTaskStatus(req.user.organization_id, reservation);

    // Voucher em uso: o wizard mostra-o e deixa o servidor recalculá-lo.
    const redemption = require('../services/voucherService').activeRedemption(req.user.organization_id, reservation.id);
    reservation.voucher = redemption
      ? { code: redemption.code, type: redemption.type, value: Number(redemption.value), discount_amount: redemption.discount_amount }
      : null;

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
    const result = await require('../services/reservationLifecycle').cancel(req.user.organization_id, req.params.id, {
      actorUserId: req.user.id, key: req.body?.key, expectedRefundCents: req.body?.refundCents,
    });
    // Repetir o pedido (duplo clique, resposta perdida) não volta a avisar o hóspede.
    if (result.alreadyCancelled) return res.json({ success: true, message: 'A reserva já estava cancelada.' });
    res.json({ success: true, message: result.policy ? 'Reserva cancelada segundo a política guardada.' : 'Reserva cancelada' });
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
      purgeReservations(organizationId, [reservation.id]);
      require('../services/auditLog').recordAudit({ organizationId, userId: req.user.id, action: 'reservation.deleted', targetType: 'reservation', targetId: reservation.id,
        meta: { check_in: reservation.check_in, check_out: reservation.check_out, total_amount: reservation.total_amount } });
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
    const { reservation, url } = require('../services/reservationLifecycle').approve(req.user.organization_id, req.params.id, { actorUserId: req.user.id, origin: publicUrl(req) });
    res.json({ success: true, data: { ...reservation, pre_checkin_url: url } });
  } catch (err) {
    next(err);
  }
}

// POST /api/reservations/:id/send-precheckin
// Envia (ou só gera, com send: false) o link do pré-check-in.
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
      if (require('../services/emailAddress').isDeliverableEmail(guest.email)) {
        try {
          // Pedido pela equipa agora: não espera pela janela de envio do modelo.
          const delivery = await sendPreCheckinEmail(guest, reservation, accommodation, preCheckinUrl, { ignoreWindow: true });
          emailSent = Boolean(delivery?.id);
        } catch (err) {
          console.warn('Email de pre-check-in não enviado:', err.message);
        }
      }
    }

    // Um email enviado já conta como enviado (emailService); o link gerado
    // para a equipa partilhar também.
    if (!shouldSend) require('../services/reservationLifecycle').markPrecheckinSent(reservation, { actorUserId: req.user.id });
    const updated = db.prepare('SELECT * FROM reservations WHERE id = ? AND organization_id = ?').get(reservation.id, organizationId);
    res.json({ success: true, data: { pre_checkin_url: preCheckinUrl, email_sent: emailSent, status: updated.status,
      precheckin_state: require('../services/reservationState').precheckinState(updated) } });
  } catch (err) {
    next(err);
  }
}

// POST /api/reservations/:id/email-deliveries/resolve — depois de confirmar no
// Gmail, a equipa marca um envio incerto como entregue ou autoriza repeti-lo.
async function resolveEmailDelivery(req, res, next) {
  try {
    const organizationId = req.user.organization_id;
    const reservation = db.prepare('SELECT id FROM reservations WHERE id = ? AND organization_id = ?').get(req.params.id, organizationId);
    if (!reservation) return res.status(404).json({ error: 'Reserva não encontrada' });
    const slug = String(req.body?.template_slug || '');
    if (!/^[a-z0-9_-]{1,80}$/i.test(slug)) return res.status(400).json({ error: 'Modelo inválido.' });
    const resolved = require('../services/emailDelivery').resolveDelivery(organizationId, reservation.id, slug, req.body?.resolution);
    recordHistory({ organizationId, reservationId: reservation.id, userId: req.user.id, action: 'email_delivery_resolved',
      meta: { template_slug: slug, resolution: req.body.resolution } });
    res.json({ success: true, data: { resolved } });
  } catch (err) {
    next(err);
  }
}

// GET /api/reservations/stats/dashboard
module.exports = { resolveEmailDelivery, getAll, getById, create, update, quote, approve, sendPrecheckinLink, cancel, hardDelete, getDashboardStats, getAvailability, getNotifications, addPayment, deletePayment, saveInvoice, setTaskStatus, getHistory };
