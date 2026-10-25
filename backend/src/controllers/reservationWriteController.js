const { reclaimReleasedVoucher } = require('../services/voucherService');
const { httpError } = require('../services/httpError');
const { queueCalendarUpsert, kickCalendarQueue } = require('../services/calendarService');
const { recordConsent } = require('../services/rgpdService');
const { syncReservationOperationalTasks } = require('../services/operationalTasksService');

const ledger = require('../services/financialLedger');
const lifecycle = require('../services/reservationLifecycle');
const creation = require('../services/reservationCreation');
const { assertAvailable, validateExtraUnits } = require('../services/reservationAvailability');
const { validateReservationInput, assertMoneyLimit } = require('../services/reservationValidation');
const { db } = require('../config/database');

const { stayChanged, priceCreate, priceUpdate, assertExpectedTotal, createQuote, updateQuote } = require('../services/reservationQuote');
const { cents } = require('../services/money');
const moneyChanged = (value, current) => value !== undefined && cents(value) !== cents(current || 0);
// Só estas alterações afetam um pagamento online em curso (montante, estadia
// ou estado). Notas, hora de chegada e dados de contacto não o interrompem.
function affectsOnlinePayment(body, existing) {
  return stayChanged(body, existing) || moneyChanged(body.total_amount, existing.total_amount)
    || (body.status !== undefined && body.status !== existing.status);
}

const { recordHistory, diffReservationFields } = require('../services/reservationHistoryService');

const { safeJson } = require('../services/reservationSupport');
const guests = require('../services/guestService');

// Repetir a criação depois de perder a resposta (rede instável) devolve a
// reserva já criada em vez de um conflito de datas ou de um duplicado.
function createIntent(req) {
  const key = req.body.idempotency_key;
  if (key === undefined) return null;
  if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(key)) {
    throw httpError('Identificador de pedido inválido.', 400);
  }
  const { idempotency_key: _key, expected_total: _expected, ...payload } = req.body;
  return { key, fingerprint: require('crypto').createHash('sha256').update(JSON.stringify(payload)).digest('hex') };
}
function replayedCreate(organizationId, intent) {
  const saved = db.prepare('SELECT * FROM reservation_create_intents WHERE organization_id = ? AND intent_key = ?').get(organizationId, intent.key);
  if (!saved) return null;
  if (saved.fingerprint !== intent.fingerprint) {
    throw httpError(`A reserva ${saved.reservation_id} já foi criada antes da falha de ligação. Abra-a para aplicar as alterações.`, 409);
  }
  return db.prepare(`SELECT r.*, g.name AS guest_name, a.name AS accommodation_name FROM reservations r
    JOIN guests g ON g.id = r.guest_id JOIN accommodations a ON a.id = r.accommodation_id
    WHERE r.id = ? AND r.organization_id = ?`).get(saved.reservation_id, organizationId);
}

async function create(req, res, next) {
  try {
    const intent = createIntent(req);
    const previous = intent && replayedCreate(req.user.organization_id, intent);
    if (previous) return res.json({ success: true, replayed: true, data: previous });
    let replay = null;
    const created = db.transaction(() => {
    // Pedido simultâneo com a mesma chave já gravado: devolver esse.
    if (intent && (replay = replayedCreate(req.user.organization_id, intent))) return null;
    validateReservationInput(req.body);
    const {
      guest, accommodation_id, check_in, check_out,
      num_adults, num_children, channel, payment_method,
      notes, rgpd_consent, rgpd_ip, guests_data,
      amount_paid, payment_date,
    } = req.body;
    const extraUnits = req.body.accommodations_data || [];
    const organizationId = req.user.organization_id;

    if (!accommodation_id || !check_in || !check_out) {
      throw httpError('Datas e alojamento são obrigatórios', 400);
    }

    // Todos os campos do hóspede são opcionais no backoffice.
    const guestRecord = guests.upsertByEmail(organizationId, guest || {});

    // Registar consentimento RGPD
    if (rgpd_consent) {
      recordConsent(guestRecord.id, rgpd_ip || req.ip, organizationId);
    }

    // Calcular valores (mesma função da pré-visualização do wizard)
    const pricing = priceCreate(organizationId, req.body);
    const { accommodation, totals, finalTotal, priceEdited, voucherDiscount } = pricing;

    // Disponibilidade (anti double-booking), incluindo bloqueios manuais.
    assertAvailable(organizationId, accommodation_id, totals.checkIn, totals.checkOut, null);

    validateExtraUnits(organizationId, extraUnits, accommodation_id, totals.checkIn, totals.checkOut, null);

    // Voucher inválido ou esgotado: recusar em vez de criar sem desconto.
    if (pricing.voucherError) throw pricing.voucherError;
    const appliedVoucherId = pricing.voucher?.id || null;
    assertExpectedTotal(req.body.expected_total, finalTotal);
    // Reserva (o sinal decide se fica confirmada), pré-reserva ou pedido.
    const initialStatus = lifecycle.nextStatus(null, req.body.status || 'aguardar_pagamento',
      { organization_id: organizationId, channel: channel || 'direto', total_amount: finalTotal, check_in: totals.checkIn });

    const reservation = creation.create(organizationId, {
      guest_id: guestRecord.id, accommodation_id, check_in: totals.checkIn, check_out: totals.checkOut,
      nights: totals.nights, num_guests: totals.guests,
      num_adults: num_adults != null ? Number(num_adults) : totals.guests,
      num_children: num_children != null ? Number(num_children) : 0,
      total_amount: finalTotal, breakfast_included: totals.breakfastIncluded, tourist_tax: totals.touristTax,
      channel: channel || 'direto', payment_method: payment_method || null, payment_date: payment_date || null,
      notes: notes || null, license_number: accommodation.license_number,
      guests_data: JSON.stringify(guests.upsertAdditionalGuests(guests_data, organizationId, guestRecord.id)),
      nightly_prices: JSON.stringify(totals.nightlyPrices || []),
      price_edited_at: priceEdited ? new Date().toISOString() : null,
      price_edited_by_user_id: priceEdited ? req.user.id : null,
      status: initialStatus, accommodations_data: JSON.stringify(extraUnits),
    }, {
      source: 'backoffice', actorUserId: req.user.id, calendarUserId: req.user.id,
      voucher: appliedVoucherId ? { id: appliedVoucherId, discount: voucherDiscount } : null,
      initialPayment: { amount: Number(amount_paid) || 0, method: payment_method, date: payment_date },
    });
    const reservationId = reservation.id;

    if (intent) {
      db.prepare('INSERT INTO reservation_create_intents (organization_id, intent_key, fingerprint, reservation_id) VALUES (?, ?, ?, ?)')
        .run(organizationId, intent.key, intent.fingerprint, reservationId);
    }

      return { reservation, reservationId, guestRecord, accommodation, organizationId };
    }).immediate();
    if (!created) return res.json({ success: true, replayed: true, data: replay });
    const { reservation, guestRecord, accommodation } = created;
    creation.afterCreate(reservation, { guestName: guestRecord.name, accommodationName: accommodation.name, actorUserId: req.user.id });

    res.status(201).json({
      success: true,
      data: { ...reservation, guest_name: guestRecord.name, accommodation_name: accommodation.name }
    });

  } catch (err) {
    next(err);
  }
}

// PUT /api/reservations/:id
async function update(req, res, next) {
  try {
    const owned = db.prepare('SELECT * FROM reservations WHERE id=? AND organization_id=?').get(req.params.id, req.user.organization_id);
    if (owned?.payment_policy_json && req.body.status === 'cancelada' && owned.status !== 'cancelada') return require('./reservationController').cancel(req, res, next);
    if (owned?.policy_cancellation_json) throw httpError('Esta reserva tem um cancelamento financeiro registado. Crie uma nova reserva para uma nova estadia.', 409);
    validateReservationInput(req.body);
    if (owned && affectsOnlinePayment(req.body, owned)) await require('../services/stripePayments').closeOpenCheckout(owned.id);
    const { updated, accommodation, organizationId, cancelling } = db.transaction(() => {
    const organizationId = req.user.organization_id;
    const existing = db.prepare('SELECT * FROM reservations WHERE id = ? AND organization_id = ?').get(req.params.id, organizationId);
    if (!existing) throw httpError('Reserva não encontrada', 404);
    if (affectsOnlinePayment(req.body, existing)) require('../services/stripePaymentGuards').assertNoActiveCheckout(existing.id);
    // Os pagamentos registam-se só no separador Pagamentos (movimento com valor,
    // método e data). A edição não altera o valor pago.
    if (moneyChanged(req.body.amount_paid, existing.amount_paid)) {
      throw httpError('Registe os pagamentos no separador Pagamentos da reserva.', 409, { code: 'payments_tab' });
    }

    const {
      channel, payment_method, notes, status, guests_data, guest,
      payment_date, accommodations_data, arrival_time
    } = req.body;

    // Preço da alteração: mesma função da pré-visualização do wizard.
    const pricing = priceUpdate(organizationId, existing, req.body);
    const { accommodation, totals, newAccommodationId, newCheckIn, newAdults, newChildren, newAccData, pricingChanged, redemption } = pricing;

    // Cancelamento via mudança de estado (dropdown/wizard) — só na transição.
    const cancelling = existing.status !== 'cancelada' && status === 'cancelada';

    // Cancelar nunca deve falhar por disponibilidade — saltar as verificações.
    if (!cancelling) {
      // Disponibilidade (excluir a própria reserva), incluindo bloqueios manuais.
      assertAvailable(organizationId, newAccommodationId, totals.checkIn, totals.checkOut, req.params.id);

      // Multi-suite: verificar também os quartos adicionais (não só a suite
      // principal) — sem isto seria possível fazer double-booking de um quarto
      // secundário via API, mesmo que a UI já bloqueie isso no cliente.
      if (Array.isArray(accommodations_data)) {
        for (const item of accommodations_data) {
          if (!item?.accommodation_id || item.accommodation_id === newAccommodationId) continue;
          assertAvailable(organizationId, item.accommodation_id, totals.checkIn, totals.checkOut, req.params.id,
            `O alojamento adicional "${item.name || item.accommodation_id}"`);
        }
      }
    }

    if (!cancelling) validateExtraUnits(organizationId, accommodations_data ?? safeJson(existing.accommodations_data, []), newAccommodationId, totals.checkIn, totals.checkOut, req.params.id);

    // Actualizar dados do hóspede se fornecidos
    if (guest) {
      guests.updateGuest(existing.guest_id, organizationId, guest);
    }
    if (pricing.confirmation) {
      throw httpError(pricing.confirmation.message, 409, { code: pricing.confirmation.code,
        details: { total_amount: pricing.effectiveTotal } });
    }
    if (redemption && pricing.voucherDiscount != null) {
      db.prepare('UPDATE voucher_redemptions SET discount_amount = ? WHERE id = ?').run(pricing.voucherDiscount, redemption.id);
    }
    const effectiveTotal = pricing.effectiveTotal;
    assertExpectedTotal(req.body.expected_total, effectiveTotal);

    // Edição manual = total efetivo difere do padrão do calendário dinâmico
    // (sem overrides por noite). Preserva o registo anterior se continuar editada.
    let priceEditedAt = existing.price_edited_at || null;
    let priceEditedBy = existing.price_edited_by_user_id || null;
    if (pricing.standardTotal != null) {
      const edited = Math.abs(effectiveTotal - pricing.standardTotal) > 0.01;
      if (edited && Math.abs(effectiveTotal - Number(existing.total_amount)) > 0.01) {
        // Nova edição manual — atualizar quem/quando
        priceEditedAt = new Date().toISOString();
        priceEditedBy = req.user.id;
      } else if (!edited) {
        priceEditedAt = null;
        priceEditedBy = null;
      }
    }
    const reactivating = existing.status === 'cancelada' && status && status !== 'cancelada';
    // Passo escolhido pela equipa, validado pelo ciclo de vida (ao reativar, o
    // estado anterior ao cancelamento). Entre «aguarda sinal» e «confirmada»
    // decide o dinheiro recebido, com o total, as datas e o canal novos.
    const draft = { ...existing, total_amount: effectiveTotal, channel: channel || existing.channel, check_in: totals.checkIn };
    const chosenStatus = reactivating ? lifecycle.reactivationStatus(existing) : lifecycle.nextStatus(existing, status, draft);
    const depositMayChange = draft.channel !== existing.channel || draft.check_in !== existing.check_in
      || cents(effectiveTotal) !== cents(existing.total_amount);

    // Cancelamento pela edição do estado: os mesmos efeitos do botão cancelar.
    if (cancelling) lifecycle.markCancelled(existing, { reason: 'staff', actorUserId: req.user.id });

    db.prepare(`
      UPDATE reservations SET
        accommodation_id = ?, check_in = ?, check_out = ?, nights = ?, num_guests = ?,
        num_adults = ?, num_children = ?,
        total_amount = ?, breakfast_included = ?, tourist_tax = ?,
        channel = ?, payment_method = ?, notes = ?, status = ?,
        payment_status = ?, guests_data = ?, accommodations_data = ?,
        amount_paid = ?, payment_date = ?, nightly_prices = ?,
        cancelled_previous_status = ?, cancelled_previous_payment_status = ?,
        arrival_time = ?,
        price_edited_at = ?, price_edited_by_user_id = ?, updated_at = datetime('now')
      WHERE id = ? AND organization_id = ?
    `).run(
      newAccommodationId,
      totals.checkIn, totals.checkOut, totals.nights, totals.guests,
      newAdults ?? totals.guests, newChildren ?? 0,
      effectiveTotal, totals.breakfastIncluded,
      pricingChanged ? totals.touristTax : existing.tourist_tax,
      channel || existing.channel,
      payment_method !== undefined ? (payment_method || null) : existing.payment_method,
      notes !== undefined ? notes : existing.notes, chosenStatus,
      existing.payment_status,
      guests_data !== undefined ? JSON.stringify(guests.upsertAdditionalGuests(guests_data, organizationId, existing.guest_id)) : (existing.guests_data || '[]'),
      newAccData,
      existing.amount_paid || 0,
      payment_date !== undefined ? (payment_date || null) : existing.payment_date,
      pricingChanged ? JSON.stringify(totals.nightlyPrices || []) : existing.nightly_prices,
      cancelling ? existing.status : (existing.cancelled_previous_status || null),
      cancelling ? existing.payment_status : (existing.cancelled_previous_payment_status || null),
      arrival_time !== undefined
        ? (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(arrival_time).trim()) ? String(arrival_time).trim() : null)
        : existing.arrival_time,
      priceEditedAt, priceEditedBy,
      req.params.id,
      organizationId
    );

    if (existing.payment_policy_json && (existing.check_in !== totals.checkIn || existing.check_out !== totals.checkOut || Number(existing.total_amount) !== Number(effectiveTotal) || existing.accommodation_id !== newAccommodationId)) {
      db.prepare(`UPDATE reservations SET policy_accepted_at=NULL, policy_auto_consent=NULL, stripe_payment_method_id=NULL,
        balance_attempted_at=NULL, balance_deadline=NULL, balance_notice_sent_at=NULL WHERE id=?`).run(existing.id);
    }
    // Reservas antigas só tinham amount_paid: migrar antes de recalcular a partir do ledger.
    ledger.ensureLegacyPayment(existing);
    // O total pode ter mudado: o estado do pagamento é sempre derivado do ledger.
    ledger.recompute(existing.id, organizationId, { deriveStatus: chosenStatus !== existing.status || depositMayChange });
    if (reactivating) reclaimReleasedVoucher(organizationId, existing.id);
    // Google Calendar: cancelar remove o evento (paridade com o DELETE); as
    // restantes alterações atualizam-no. Gravado na mesma transação.
    if (!cancelling && (existing.google_event_id || (reactivating && existing.google_calendar_user_id))) {
      queueCalendarUpsert(organizationId, 'reservation', existing.id, existing.google_calendar_user_id || req.user.id);
    }
    const updated = db.prepare('SELECT * FROM reservations WHERE id = ? AND organization_id = ?').get(req.params.id, organizationId);
    const historyChanges = diffReservationFields(existing, updated);
    if (historyChanges.length) {
      recordHistory({
        organizationId, reservationId: req.params.id, userId: req.user.id, action: 'updated',
        changes: historyChanges,
        meta: reactivating ? { reactivated: true } : (cancelling ? { cancelled: true } : null),
      });
    }
    syncReservationOperationalTasks({
      ...updated,
      accommodation_name: accommodation.name,
    }, req.user.id);

      return { updated, accommodation, organizationId, cancelling };
    }).immediate();

    kickCalendarQueue(organizationId);

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

// POST /api/reservations/quote e /api/reservations/:id/quote
// Pré-visualização do total com o mesmo cálculo da gravação; não grava nada.
function quote(req, res, next) {
  try {
    validateReservationInput(req.body);
    const organizationId = req.user.organization_id;
    if (!req.params.id) {
      if (!req.body.accommodation_id || !req.body.check_in || !req.body.check_out) {
        throw httpError('Datas e alojamento são obrigatórios', 400);
      }
      return res.json({ success: true, data: createQuote(organizationId, req.body) });
    }
    const existing = db.prepare('SELECT * FROM reservations WHERE id = ? AND organization_id = ?').get(req.params.id, organizationId);
    if (!existing) throw httpError('Reserva não encontrada', 404);
    res.json({ success: true, data: updateQuote(organizationId, existing, req.body) });
  } catch (err) {
    next(err);
  }
}

module.exports = { create, update, quote };
