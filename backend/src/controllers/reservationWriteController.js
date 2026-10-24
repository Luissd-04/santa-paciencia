const { redeemVoucher, releaseVoucherIfUnpaid, reclaimReleasedVoucher } = require('../services/voucherService');
const { queueCalendarUpsert, detachReservationEvent, kickCalendarQueue } = require('../services/calendarService');
const { isAuthenticated: hasGoogleCalendar } = require('../config/google');
const { sendConfirmationEmail, sendCancellationEmail, sendPaymentConfirmationEmail } = require('../services/emailService');
const { recordConsent } = require('../services/rgpdService');
const { syncReservationOperationalTasks } = require('../services/operationalTasksService');

const { ensureLegacyPayment, setPaidAmount } = require('../services/paymentLedger');
const { findConflict, validateExtraUnits } = require('../services/reservationAvailability');
const { validateReservationInput, assertMoneyLimit } = require('../services/reservationValidation');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../config/database');
const { getPaymentStatus } = require('../services/reservationRules');

const { stayChanged, priceCreate, priceUpdate, assertExpectedTotal, createQuote, updateQuote } = require('../services/reservationQuote');
const moneyChanged = (value, current) => value !== undefined && Math.round(Number(value) * 100) !== Math.round(Number(current || 0) * 100);
// Só estas alterações afetam um pagamento online em curso (montante, estadia
// ou estado). Notas, hora de chegada e dados de contacto não o interrompem.
function affectsOnlinePayment(body, existing) {
  return stayChanged(body, existing) || moneyChanged(body.total_amount, existing.total_amount)
    || moneyChanged(body.amount_paid, existing.amount_paid)
    || (body.status !== undefined && body.status !== existing.status);
}

const { findBlockConflict } = require('../services/accommodationBlockService');
const { notifyOrganization } = require('../services/pushService');
const { recordHistory, diffReservationFields } = require('../services/reservationHistoryService');

const { safeJson, upsertAdditionalGuests } = require('../services/reservationSupport');

// Repetir a criação depois de perder a resposta (rede instável) devolve a
// reserva já criada em vez de um conflito de datas ou de um duplicado.
function createIntent(req) {
  const key = req.body.idempotency_key;
  if (key === undefined) return null;
  if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(key)) {
    throw Object.assign(new Error('Identificador de pedido inválido.'), { status: 400 });
  }
  const { idempotency_key: _key, expected_total: _expected, ...payload } = req.body;
  return { key, fingerprint: require('crypto').createHash('sha256').update(JSON.stringify(payload)).digest('hex') };
}
function replayedCreate(organizationId, intent) {
  const saved = db.prepare('SELECT * FROM reservation_create_intents WHERE organization_id = ? AND intent_key = ?').get(organizationId, intent.key);
  if (!saved) return null;
  if (saved.fingerprint !== intent.fingerprint) {
    throw Object.assign(new Error(`A reserva ${saved.reservation_id} já foi criada antes da falha de ligação. Abra-a para aplicar as alterações.`), { status: 409 });
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
      amount_paid, payment_date, payment_status: reqPaymentStatus,
    } = req.body;
    const initialStatus = req.body.status || 'confirmada';
    const extraUnits = req.body.accommodations_data || [];
    const organizationId = req.user.organization_id;

    if (!accommodation_id || !check_in || !check_out) {
      throw Object.assign(new Error(({ error: 'Datas e alojamento são obrigatórios' }).error), { status: 400 });
    }

    // Normalizar dados do hóspede — todos os campos são opcionais no backoffice
    const guestName  = guest?.name?.trim()  || 'Hóspede';
    const guestEmail = guest?.email?.trim() || `sp-interno-${uuidv4()}@reserva.local`;

    // Criar ou actualizar hóspede
    let guestRecord = db.prepare('SELECT * FROM guests WHERE email = ? AND organization_id = ?').get(guestEmail, organizationId);

    if (!guestRecord) {
      const guestId = uuidv4();
      db.prepare(`
        INSERT INTO guests (id, name, email, phone, document_type, document_number, document_issuer_country,
          nationality, first_name, last_name, birth_date, birth_city, birth_country, nif, country,
          address, postal_code, city, residence_country, company, company_nif, organization_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(guestId, guestName, guestEmail, guest?.phone || null,
             guest?.document_type || null, guest?.document_number || null,
             guest?.document_issuer_country || null, guest?.nationality || null,
             guest?.first_name || null, guest?.last_name || null, guest?.birth_date || null,
             guest?.birth_city || null, guest?.birth_country || null,
             guest?.nif || null, guest?.country || null,
             guest?.address || null, guest?.postal_code || null, guest?.city || null,
             guest?.residence_country || null,
             guest?.company || null, guest?.company_nif || null, organizationId);
      guestRecord = db.prepare('SELECT * FROM guests WHERE id = ? AND organization_id = ?').get(guestId, organizationId);
    } else {
      db.prepare(`UPDATE guests SET
        name = COALESCE(?, name), phone = COALESCE(?, phone),
        document_type = COALESCE(?, document_type), document_number = COALESCE(?, document_number),
        document_issuer_country = COALESCE(?, document_issuer_country),
        nationality = COALESCE(?, nationality), first_name = COALESCE(?, first_name),
        last_name = COALESCE(?, last_name), birth_date = COALESCE(?, birth_date),
        birth_city = COALESCE(?, birth_city), birth_country = COALESCE(?, birth_country),
        nif = COALESCE(?, nif), country = COALESCE(?, country),
        address = COALESCE(?, address), postal_code = COALESCE(?, postal_code), city = COALESCE(?, city),
        residence_country = COALESCE(?, residence_country),
        company = COALESCE(?, company), company_nif = COALESCE(?, company_nif)
        WHERE id = ? AND organization_id = ?`).run(
        guest?.name || null, guest?.phone || null,
        guest?.document_type || null, guest?.document_number || null,
        guest?.document_issuer_country || null,
        guest?.nationality || null, guest?.first_name || null,
        guest?.last_name || null, guest?.birth_date || null,
        guest?.birth_city || null, guest?.birth_country || null,
        guest?.nif || null, guest?.country || null,
        guest?.address || null, guest?.postal_code || null, guest?.city || null,
        guest?.residence_country || null,
        guest?.company || null, guest?.company_nif || null,
        guestRecord.id,
        organizationId
      );
      guestRecord = db.prepare('SELECT * FROM guests WHERE id = ? AND organization_id = ?').get(guestRecord.id, organizationId);
    }

    // Registar consentimento RGPD
    if (rgpd_consent) {
      recordConsent(guestRecord.id, rgpd_ip || req.ip, organizationId);
    }

    // Calcular valores (mesma função da pré-visualização do wizard)
    const pricing = priceCreate(organizationId, req.body);
    const { accommodation, totals, finalTotal, priceEdited, voucherDiscount } = pricing;

    // Verificar disponibilidade (anti double-booking)
    const conflict = findConflict(organizationId, accommodation_id, totals.checkIn, totals.checkOut, null);
    if (conflict) {
      throw Object.assign(new Error(({
        error: `Este alojamento já está ocupado nessas datas (reserva ${conflict.id}).`
      }).error), { status: 409 });
    }

    // Verificar bloqueios manuais (manutenção, uso pessoal, etc.)
    const block = findBlockConflict(organizationId, accommodation_id, totals.checkIn, totals.checkOut);
    if (block) {
      throw Object.assign(new Error(({
        error: `Estas datas estão bloqueadas${block.reason ? ` (${block.reason})` : ''}.`
      }).error), { status: 409 });
    }

    validateExtraUnits(organizationId, extraUnits, accommodation_id, totals.checkIn, totals.checkOut, null);

    // Voucher inválido ou esgotado: recusar em vez de criar sem desconto.
    if (pricing.voucherError) throw pricing.voucherError;
    const appliedVoucherId = pricing.voucher?.id || null;
    assertExpectedTotal(req.body.expected_total, finalTotal);

    const paidAmt = Number(amount_paid) || 0;
    const autoPaymentStatus = getPaymentStatus(paidAmt, finalTotal, reqPaymentStatus || 'pendente');

    // Criar reserva
    const reservationId = `SP-${uuidv4().slice(0, 8).toUpperCase()}`;
    db.prepare(`
      INSERT INTO reservations (
        id, organization_id, guest_id, accommodation_id, check_in, check_out, nights, num_guests,
        num_adults, num_children,
        total_amount, breakfast_included, tourist_tax, channel, payment_method,
        notes, license_number, guests_data, amount_paid, payment_date, payment_status, nightly_prices,
        price_edited_at, price_edited_by_user_id, status, accommodations_data
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      reservationId, organizationId, guestRecord.id, accommodation_id, totals.checkIn, totals.checkOut,
      totals.nights, totals.guests,
      num_adults != null ? Number(num_adults) : totals.guests,
      num_children != null ? Number(num_children) : 0,
      finalTotal, totals.breakfastIncluded,
      totals.touristTax, channel || 'direto', payment_method || null,
      notes || null, accommodation.license_number,
      JSON.stringify(upsertAdditionalGuests(guests_data, organizationId, guestRecord.id)),
      paidAmt, payment_date || null, autoPaymentStatus,
      JSON.stringify(totals.nightlyPrices || []),
      priceEdited ? new Date().toISOString() : null,
      priceEdited ? req.user.id : null, initialStatus, JSON.stringify(extraUnits)
    );
    if (appliedVoucherId) redeemVoucher(organizationId, appliedVoucherId, reservationId, voucherDiscount);

    const reservation = db.prepare('SELECT * FROM reservations WHERE id = ? AND organization_id = ?').get(reservationId, organizationId);
    require('../services/paymentPolicy').attachPolicy(reservation);
    ensureLegacyPayment(reservation);
    recordHistory({
      organizationId, reservationId, userId: req.user.id, action: 'created',
      meta: { check_in: reservation.check_in, check_out: reservation.check_out, accommodation_id: reservation.accommodation_id, total_amount: reservation.total_amount },
    });
    syncReservationOperationalTasks({
      ...reservation,
      guest_name: guestRecord.name,
      accommodation_name: accommodation.name,
    }, req.user.id);

    // Google Calendar: intenção gravada com a reserva; a fila cria o evento.
    if (hasGoogleCalendar(req.user.id, organizationId)) queueCalendarUpsert(organizationId, 'reservation', reservationId, req.user.id);

    if (intent) {
      db.prepare('INSERT INTO reservation_create_intents (organization_id, intent_key, fingerprint, reservation_id) VALUES (?, ?, ?, ?)')
        .run(organizationId, intent.key, intent.fingerprint, reservationId);
    }

      return { reservation, reservationId, guestRecord, accommodation, organizationId };
    }).immediate();
    if (!created) return res.json({ success: true, replayed: true, data: replay });
    const { reservation, guestRecord, accommodation, organizationId } = created;
    kickCalendarQueue(organizationId);

    // Email de confirmação (async)
    sendConfirmationEmail(guestRecord, reservation, accommodation)
      .catch(err => console.warn('Email não enviado:', err.message));

    notifyOrganization(organizationId, 'new_reservation', {
      title: '🆕 Nova reserva',
      body: `${guestRecord.name} · ${accommodation.name} · ${reservation.check_in} → ${reservation.check_out}`,
      url: `/reservas?reserva=${reservation.id}`,
      excludeUserId: req.user.id,
    });

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
    if (owned?.policy_cancellation_json) throw Object.assign(new Error('Esta reserva tem um cancelamento financeiro registado. Crie uma nova reserva para uma nova estadia.'), { status: 409 });
    validateReservationInput(req.body);
    if (owned && affectsOnlinePayment(req.body, owned)) await require('../services/stripePayments').closeOpenCheckout(owned.id);
    const { updated, accommodation, organizationId, cancelling, nextPaymentStatus, existing } = db.transaction(() => {
    const organizationId = req.user.organization_id;
    const existing = db.prepare('SELECT * FROM reservations WHERE id = ? AND organization_id = ?').get(req.params.id, organizationId);
    if (!existing) throw Object.assign(new Error(({ error: 'Reserva não encontrada' }).error), { status: 404 });
    if (affectsOnlinePayment(req.body, existing)) require('../services/stripePaymentGuards').assertNoActiveCheckout(existing.id);
    if (req.body.amount_paid !== undefined && Math.round(Number(req.body.amount_paid) * 100) !== Math.round(Number(existing.amount_paid) * 100)
      && db.prepare('SELECT 1 FROM stripe_payment_attempts WHERE reservation_id=? AND captured_cents>0').get(existing.id)) {
      throw Object.assign(new Error('Registe pagamentos adicionais no histórico. Os pagamentos Stripe só podem ser reembolsados através da Stripe.'), { status: 409 });
    }

    const {
      channel, payment_method, notes, status, payment_status, guests_data, guest,
      amount_paid, payment_date, accommodations_data, arrival_time
    } = req.body;

    // Preço da alteração: mesma função da pré-visualização do wizard.
    const pricing = priceUpdate(organizationId, existing, req.body);
    const { accommodation, totals, newAccommodationId, newCheckIn, newAdults, newChildren, newAccData, pricingChanged, redemption } = pricing;

    // Cancelamento via mudança de estado (dropdown/wizard) — só na transição.
    const cancelling = existing.status !== 'cancelada' && status === 'cancelada';

    // Cancelar nunca deve falhar por disponibilidade — saltar as verificações.
    if (!cancelling) {
      // Verificar disponibilidade (excluir a própria reserva)
      const conflict2 = findConflict(organizationId, newAccommodationId, totals.checkIn, totals.checkOut, req.params.id);
      if (conflict2) {
        throw Object.assign(new Error(({
          error: `Este alojamento já está ocupado nessas datas (reserva ${conflict2.id}).`
        }).error), { status: 409 });
      }

      // Multi-suite: verificar também os quartos adicionais (não só a suite
      // principal) — sem isto seria possível fazer double-booking de um quarto
      // secundário via API, mesmo que a UI já bloqueie isso no cliente.
      if (Array.isArray(accommodations_data)) {
        for (const item of accommodations_data) {
          if (!item?.accommodation_id || item.accommodation_id === newAccommodationId) continue;
          const extraConflict = findConflict(organizationId, item.accommodation_id, totals.checkIn, totals.checkOut, req.params.id);
          if (extraConflict) {
            throw Object.assign(new Error(({
              error: `O alojamento adicional "${item.name || item.accommodation_id}" já está ocupado nessas datas (reserva ${extraConflict.id}).`
            }).error), { status: 409 });
          }
        }
      }

      // Verificar bloqueios manuais
      const block2 = findBlockConflict(organizationId, newAccommodationId, totals.checkIn, totals.checkOut);
      if (block2) {
        throw Object.assign(new Error(({
          error: `Estas datas estão bloqueadas${block2.reason ? ` (${block2.reason})` : ''}.`
        }).error), { status: 409 });
      }
    }

    if (!cancelling) validateExtraUnits(organizationId, accommodations_data ?? safeJson(existing.accommodations_data, []), newAccommodationId, totals.checkIn, totals.checkOut, req.params.id);

    // Actualizar dados do hóspede se fornecidos
    if (guest) {
      require('../services/guestPatch').updateGuest(existing.guest_id, organizationId, guest);
    }
    const newPaidAmt = amount_paid !== undefined ? Number(amount_paid) : (existing.amount_paid || 0);
    if (pricing.confirmation) {
      throw Object.assign(new Error(pricing.confirmation.message), { status: 409, code: pricing.confirmation.code,
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
    const autoPaymentStatus2 = getPaymentStatus(newPaidAmt, effectiveTotal, payment_status || existing.payment_status || 'pendente');
    const reactivating = existing.status === 'cancelada' && status && status !== 'cancelada';
    const nextStatus = reactivating
      ? (existing.cancelled_previous_status || status)
      : status || (
        ['aguardar_pagamento', 'confirmada'].includes(existing.status) && existing.payment_policy_json
          ? (Math.round(newPaidAmt * 100) >= require('../services/paymentPolicy').planFor({ ...existing, total_amount: effectiveTotal, check_in: newCheckIn }).depositCents ? 'confirmada' : 'aguardar_pagamento')
          : existing.status === 'aguardar_pagamento' && (existing.payment_policy_json
          ? Math.round(newPaidAmt * 100) >= require('../services/paymentPolicy').planFor({ ...existing, total_amount: effectiveTotal, check_in: newCheckIn }).depositCents
          : newPaidAmt > 0)
          ? 'confirmada'
          : existing.status
      );
    const nextPaymentStatus = autoPaymentStatus2;

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
      notes !== undefined ? notes : existing.notes, nextStatus,
      nextPaymentStatus,
      guests_data !== undefined ? JSON.stringify(upsertAdditionalGuests(guests_data, organizationId, existing.guest_id)) : (existing.guests_data || '[]'),
      newAccData,
      newPaidAmt,
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
    if (amount_paid !== undefined) setPaidAmount(existing, newPaidAmt);
    if (cancelling) releaseVoucherIfUnpaid(organizationId, existing.id);
    if (reactivating) reclaimReleasedVoucher(organizationId, existing.id);
    // Google Calendar: cancelar remove o evento (paridade com o DELETE); as
    // restantes alterações atualizam-no. Gravado na mesma transação.
    if (cancelling) detachReservationEvent(organizationId, existing.id);
    else if (existing.google_event_id || (reactivating && existing.google_calendar_user_id)) {
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

      return { updated, accommodation, organizationId, cancelling, nextPaymentStatus, existing };
    }).immediate();

    kickCalendarQueue(organizationId);

    // Email + push de cancelamento (paridade com o DELETE)
    if (cancelling) {
      const guestRecord = db.prepare('SELECT * FROM guests WHERE id = ? AND organization_id = ?').get(updated.guest_id, organizationId);
      sendCancellationEmail(guestRecord, updated, accommodation)
        .catch(err => console.warn('Email não enviado:', err.message));
      notifyOrganization(organizationId, 'cancellation', {
        title: '❌ Reserva cancelada',
        body: `${guestRecord?.name || 'Hóspede'} · ${accommodation.name} · ${updated.check_in} → ${updated.check_out}`,
        url: `/reservas?reserva=${req.params.id}`,
        excludeUserId: req.user.id,
      });
    }

    // Email de pagamento se confirmado agora
    if (nextPaymentStatus === 'confirmado' && existing.payment_status !== 'confirmado' && Number(updated.total_amount) > 0) {
      const guestRecord = db.prepare('SELECT * FROM guests WHERE id = ? AND organization_id = ?').get(updated.guest_id, organizationId);
      sendPaymentConfirmationEmail(guestRecord, updated, accommodation)
        .catch(err => console.warn('Email não enviado:', err.message));
    }

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
        throw Object.assign(new Error('Datas e alojamento são obrigatórios'), { status: 400 });
      }
      return res.json({ success: true, data: createQuote(organizationId, req.body) });
    }
    const existing = db.prepare('SELECT * FROM reservations WHERE id = ? AND organization_id = ?').get(req.params.id, organizationId);
    if (!existing) throw Object.assign(new Error('Reserva não encontrada'), { status: 404 });
    res.json({ success: true, data: updateQuote(organizationId, existing, req.body) });
  } catch (err) {
    next(err);
  }
}

module.exports = { create, update, quote };
