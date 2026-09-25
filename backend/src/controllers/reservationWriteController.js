const { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } = require('../services/calendarService');
const { sendConfirmationEmail, sendCancellationEmail, sendPaymentConfirmationEmail } = require('../services/emailService');
const { recordConsent } = require('../services/rgpdService');
const { syncReservationOperationalTasks } = require('../services/operationalTasksService');

const { ensureLegacyPayment, setPaidAmount } = require('../services/paymentLedger');
const { findConflict, validateExtraUnits } = require('../services/reservationAvailability');
const { validateReservationInput } = require('../services/reservationValidation');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../config/database');
const { calculateReservationTotals, getPaymentStatus, getReservationBirthDates } = require('../services/reservationRules');

const { findBlockConflict } = require('../services/accommodationBlockService');
const { notifyOrganization } = require('../services/pushService');
const { recordHistory, diffReservationFields } = require('../services/reservationHistoryService');

const { safeJson, computeStandardTotals, upsertAdditionalGuests, getOrganizationServices, syncReservationTasksToGoogle } = require('../services/reservationSupport');

async function create(req, res, next) {
  try {
    const { reservation, reservationId, guestRecord, accommodation, organizationId } = db.transaction(() => {
    validateReservationInput(req.body);
    const {
      guest, accommodation_id, check_in, check_out,
      num_guests, num_adults, num_children, breakfast_included, channel, payment_method,
      notes, rgpd_consent, rgpd_ip, guests_data, voucher_code,
      amount_paid, payment_date, payment_status: reqPaymentStatus,
      total_amount: manualTotalCreate, nightly_prices: nightlyPricesCreate
    } = req.body;
    const initialStatus = req.body.status || 'confirmada';
    const extraUnits = req.body.accommodations_data || [];
    const totalGuests = (num_adults != null || num_children != null)
      ? (Number(num_adults ?? 1) + Number(num_children ?? 0))
      : (num_guests || 1);
    const organizationId = req.user.organization_id;

    if (!accommodation_id || !check_in || !check_out) {
      throw Object.assign(new Error(({ error: 'Datas e alojamento são obrigatórios' }).error), { status: 400 });
    }

    // Normalizar dados do hóspede — todos os campos são opcionais no backoffice
    const guestName  = guest?.name?.trim()  || 'Hóspede';
    const guestEmail = guest?.email?.trim() || `sp-interno-${Date.now()}@reserva.local`;

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

    // Calcular valores
    const accommodation = db.prepare('SELECT * FROM accommodations WHERE id = ? AND organization_id = ?').get(accommodation_id, organizationId);
    if (!accommodation) throw Object.assign(new Error(({ error: 'Alojamento não encontrado' }).error), { status: 404 });
    if (totalGuests > Number(accommodation.max_guests || 0)) {
      throw Object.assign(new Error(({ error: `Este alojamento permite no máximo ${accommodation.max_guests} hóspedes.` }).error), { status: 400 });
    }

    const pricingPeriods = db.prepare(
      'SELECT * FROM pricing_periods WHERE accommodation_id = ? AND organization_id = ? ORDER BY start_date ASC'
    ).all(accommodation_id, organizationId);

    let totals;
    try {
      totals = calculateReservationTotals(accommodation, getOrganizationServices(organizationId), {
        check_in,
        check_out,
        num_guests: totalGuests,
        pricing_periods: pricingPeriods,
        breakfast_included,
        guest,
        guests_data: guests_data || [],
        nightly_prices: nightlyPricesCreate,
      });
    } catch (error) {
      throw Object.assign(new Error(({ error: error.message }).error), { status: 400 });
    }

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

    // Aplicar voucher se fornecido
    let voucherDiscount = 0;
    let appliedVoucherId = null;
    if (voucher_code) {
      const vCode = String(voucher_code).toUpperCase().trim();
      const voucher = db.prepare(
        "SELECT * FROM vouchers WHERE code = ? AND organization_id = ? AND status = 'active'"
      ).get(vCode, organizationId);
      if (voucher) {
        const today = new Date().toISOString().slice(0, 10);
        const dateOk = (!voucher.valid_from || voucher.valid_from <= today) && (!voucher.valid_until || voucher.valid_until >= today);
        if (dateOk) {
          appliedVoucherId = voucher.id;
          voucherDiscount = voucher.type === 'discount_pct'
            ? totals.totalAmount * (voucher.value / 100)
            : Math.min(voucher.value, totals.totalAmount);
        }
      }
    }
    const voucherAdjusted = Math.max(0, totals.totalAmount - voucherDiscount);
    const finalTotal = manualTotalCreate !== undefined ? Number(manualTotalCreate) : voucherAdjusted;

    // Edição manual = total gravado difere do padrão do calendário dinâmico
    // (sem overrides por noite), descontado o voucher. Fica registado quem/quando.
    let priceEdited = false;
    try {
      const standard = calculateReservationTotals(accommodation, getOrganizationServices(organizationId), {
        check_in, check_out, num_guests: totalGuests,
        pricing_periods: pricingPeriods, breakfast_included,
        guest, guests_data: guests_data || [],
      });
      priceEdited = Math.abs(finalTotal - Math.max(0, standard.totalAmount - voucherDiscount)) > 0.01;
    } catch { /* referência indisponível — não marcar */ }

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
      JSON.stringify(upsertAdditionalGuests(guests_data, organizationId)),
      paidAmt, payment_date || null, autoPaymentStatus,
      JSON.stringify(totals.nightlyPrices || []),
      priceEdited ? new Date().toISOString() : null,
      priceEdited ? req.user.id : null, initialStatus, JSON.stringify(extraUnits)
    );
    if (appliedVoucherId) {
      db.prepare(
        "UPDATE vouchers SET status = 'used', used_at = datetime('now'), used_in_reservation_id = ?, updated_at = datetime('now') WHERE id = ? AND organization_id = ?"
      ).run(reservationId, appliedVoucherId, organizationId);
    }

    const reservation = db.prepare('SELECT * FROM reservations WHERE id = ? AND organization_id = ?').get(reservationId, organizationId);
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

      return { reservation, reservationId, guestRecord, accommodation, organizationId };
    }).immediate();

    // Google Calendar (async, não bloqueia resposta)
    syncReservationTasksToGoogle(reservationId, organizationId, req.user.id);
    createCalendarEvent(reservation, { userId: req.user.id, organizationId }).then(eventId => {
      if (eventId) {
        db.prepare('UPDATE reservations SET google_event_id = ?, google_calendar_user_id = ? WHERE id = ? AND organization_id = ?')
          .run(eventId, req.user.id, reservationId, organizationId);
      }
    });

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
    const { updated, accommodation, organizationId, cancelling, nextPaymentStatus, existing } = db.transaction(() => {
    validateReservationInput(req.body);
    const organizationId = req.user.organization_id;
    const existing = db.prepare('SELECT * FROM reservations WHERE id = ? AND organization_id = ?').get(req.params.id, organizationId);
    if (!existing) throw Object.assign(new Error(({ error: 'Reserva não encontrada' }).error), { status: 404 });

    const {
      check_in, check_out, num_guests, num_adults, num_children, breakfast_included,
      channel, payment_method, notes, status, payment_status, guests_data, guest,
      accommodation_id, amount_paid, payment_date, total_amount: manualTotal,
      accommodations_data, nightly_prices: nightlyPricesUpdate, arrival_time
    } = req.body;

    const newAccommodationId = accommodation_id || existing.accommodation_id;
    const accommodation = db.prepare('SELECT * FROM accommodations WHERE id = ? AND organization_id = ?')
      .get(newAccommodationId, organizationId);
    if (!accommodation) throw Object.assign(new Error(({ error: 'Alojamento não encontrado' }).error), { status: 404 });

    const pricingPeriods2 = db.prepare(
      'SELECT * FROM pricing_periods WHERE accommodation_id = ? AND organization_id = ? ORDER BY start_date ASC'
    ).all(newAccommodationId, organizationId);

    const newCheckIn = check_in || existing.check_in;
    const newCheckOut = check_out || existing.check_out;
    const newAdults = num_adults != null ? Number(num_adults) : existing.num_adults;
    const newChildren = num_children != null ? Number(num_children) : (existing.num_children ?? 0);
    const guests = (num_adults != null || num_children != null)
      ? (newAdults + newChildren)
      : (num_guests || existing.num_guests);
    const bkfOn2 = breakfast_included !== undefined ? (breakfast_included ? 1 : 0) : existing.breakfast_included;
    const incomingGuestsData = guests_data !== undefined ? guests_data : safeJson(existing.guests_data, []);
    const existingGuest = db.prepare('SELECT birth_date FROM guests WHERE id = ? AND organization_id = ?').get(existing.guest_id, organizationId) || {};
    const guestForBirthDates = guest || { birth_date: existingGuest.birth_date };
    // Preço por noite: usa o enviado; senão preserva o guardado (reconciliado por data).
    const incomingNightly = nightlyPricesUpdate !== undefined
      ? nightlyPricesUpdate
      : safeJson(existing.nightly_prices, []);
    let totals;
    try {
      totals = calculateReservationTotals(accommodation, getOrganizationServices(organizationId), {
        check_in: newCheckIn,
        check_out: newCheckOut,
        num_guests: guests,
        breakfast_included: bkfOn2,
        birth_dates: getReservationBirthDates(guestForBirthDates, incomingGuestsData),
        pricing_periods: pricingPeriods2,
        nightly_prices: incomingNightly,
      });
    } catch (error) {
      throw Object.assign(new Error(({ error: error.message }).error), { status: 400 });
    }

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
      db.prepare(`UPDATE guests SET
        name = COALESCE(?, name), email = COALESCE(?, email), phone = COALESCE(?, phone),
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
        guest.name || null, guest.email || null, guest.phone || null,
        guest.document_type || null, guest.document_number || null,
        guest.document_issuer_country || null,
        guest.nationality || null, guest.first_name || null,
        guest.last_name || null, guest.birth_date || null,
        guest.birth_city || null, guest.birth_country || null,
        guest.nif || null, guest.country || null,
        guest.address || null, guest.postal_code || null, guest.city || null,
        guest.residence_country || null,
        guest.company || null, guest.company_nif || null,
        existing.guest_id,
        organizationId
      );
    }
    const newPaidAmt = amount_paid !== undefined ? Number(amount_paid) : (existing.amount_paid || 0);
    const newAccData = accommodations_data !== undefined
      ? JSON.stringify(accommodations_data)
      : (existing.accommodations_data || '[]');
    // Multi-suite sem total explícito: preservar o total guardado — o recálculo
    // só conhece a suite principal e destruiria o valor das restantes.
    const accsCount = safeJson(newAccData, []).length;
    const effectiveTotal = manualTotal !== undefined
      ? Number(manualTotal)
      : (accsCount > 1 ? Number(existing.total_amount) : totals.totalAmount);

    // Edição manual = total efetivo difere do padrão do calendário dinâmico
    // (sem overrides por noite). Preserva o registo anterior se continuar editada.
    let priceEditedAt = existing.price_edited_at || null;
    let priceEditedBy = existing.price_edited_by_user_id || null;
    try {
      const standard = computeStandardTotals(
        organizationId,
        {
          check_in: newCheckIn,
          check_out: newCheckOut,
          num_guests: guests,
          breakfast_included: bkfOn2,
          accommodations_data: newAccData,
        },
        accommodation, pricingPeriods2, getOrganizationServices(organizationId),
        getReservationBirthDates(guestForBirthDates, incomingGuestsData)
      );
      const edited = Math.abs(effectiveTotal - standard.totalAmount) > 0.01;
      if (edited && Math.abs(effectiveTotal - Number(existing.total_amount)) > 0.01) {
        // Nova edição manual — atualizar quem/quando
        priceEditedAt = new Date().toISOString();
        priceEditedBy = req.user.id;
      } else if (!edited) {
        priceEditedAt = null;
        priceEditedBy = null;
      }
    } catch { /* referência indisponível — manter registo atual */ }
    const autoPaymentStatus2 = getPaymentStatus(newPaidAmt, effectiveTotal, payment_status || existing.payment_status || 'pendente');
    const reactivating = existing.status === 'cancelada' && status && status !== 'cancelada';
    const nextStatus = reactivating
      ? (existing.cancelled_previous_status || status)
      : status || (
        existing.status === 'aguardar_pagamento' && newPaidAmt > 0
          ? 'confirmada'
          : existing.status
      );
    const nextPaymentStatus = reactivating && payment_status === undefined
      ? (existing.cancelled_previous_payment_status || existing.payment_status || autoPaymentStatus2)
      : autoPaymentStatus2;

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
      totals.touristTax,
      channel || existing.channel,
      payment_method !== undefined ? (payment_method || null) : existing.payment_method,
      notes !== undefined ? notes : existing.notes, nextStatus,
      nextPaymentStatus,
      guests_data !== undefined ? JSON.stringify(upsertAdditionalGuests(guests_data, organizationId)) : (existing.guests_data || '[]'),
      newAccData,
      newPaidAmt,
      payment_date !== undefined ? (payment_date || null) : existing.payment_date,
      JSON.stringify(totals.nightlyPrices || []),
      cancelling ? existing.status : (existing.cancelled_previous_status || null),
      cancelling ? existing.payment_status : (existing.cancelled_previous_payment_status || null),
      arrival_time !== undefined
        ? (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(arrival_time).trim()) ? String(arrival_time).trim() : null)
        : existing.arrival_time,
      priceEditedAt, priceEditedBy,
      req.params.id,
      organizationId
    );

    if (amount_paid !== undefined) setPaidAmount(existing, newPaidAmt);
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

    // Google Calendar tarefas (async)
    syncReservationTasksToGoogle(req.params.id, organizationId, req.user.id);

    // Google Calendar: cancelar remove o evento (paridade com o DELETE)
    if (cancelling) {
      deleteCalendarEvent(updated, {
        userId: updated.google_calendar_user_id || req.user.id,
        organizationId
      });
    } else {
      updateCalendarEvent(updated, {
        userId: updated.google_calendar_user_id || req.user.id,
        organizationId
      });
    }

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
    if (nextPaymentStatus === 'confirmado' && existing.payment_status !== 'confirmado') {
      const guestRecord = db.prepare('SELECT * FROM guests WHERE id = ? AND organization_id = ?').get(updated.guest_id, organizationId);
      sendPaymentConfirmationEmail(guestRecord, updated, accommodation)
        .catch(err => console.warn('Email não enviado:', err.message));
    }

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/reservations/:id  (cancela)
module.exports = { create, update };
