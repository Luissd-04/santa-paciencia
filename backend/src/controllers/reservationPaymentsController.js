const { db } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const { ledgerTotal, ensureLegacyPayment } = require('../services/paymentLedger');
const { getPaymentStatus } = require('../services/reservationRules');
const { recordHistory } = require('../services/reservationHistoryService');
function policyStatus(reservation, paid) {
  if (!reservation.payment_policy_json || !['aguardar_pagamento', 'confirmada'].includes(reservation.status)) return reservation.status;
  const { cents, planFor } = require('../services/paymentPolicy');
  return cents(paid) >= planFor(reservation).depositCents ? 'confirmada' : 'aguardar_pagamento';
}
async function addPayment(req, res, next) {
  try {
    const intentKey = req.body.idempotency_key;
    if (intentKey !== undefined && (typeof intentKey !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(intentKey))) {
      throw Object.assign(new Error('Identificador de pagamento inválido.'), { status: 400 });
    }
    const fingerprint = JSON.stringify([Number(req.body.amount), req.body.method || null, req.body.payment_date || null, req.body.notes || null]);
    const replay = () => {
      if (!intentKey) return null;
      const saved = db.prepare('SELECT * FROM manual_payment_intents WHERE organization_id=? AND reservation_id=? AND intent_key=?').get(req.user.organization_id, req.params.id, intentKey);
      if (!saved) return null;
      if (saved.fingerprint !== fingerprint) throw Object.assign(new Error('Este pagamento já foi registado com outros dados. Atualize o histórico antes de continuar.'), { status: 409 });
      return JSON.parse(saved.response_json);
    };
    const previous = replay();
    if (previous) return res.json({ success: true, data: previous });
    const owned = db.prepare('SELECT id FROM reservations WHERE id=? AND organization_id=?').get(req.params.id, req.user.organization_id);
    if (owned) await require('../services/stripePayments').closeOpenCheckout(owned.id);
    const data = db.transaction(() => {
    const previous = replay();
    if (previous) return previous;
    const { id } = req.params;
    const organizationId = req.user.organization_id;
    const { amount, method, payment_date, notes } = req.body;

    if (payment_date && !require('../services/reservationRules').normalizeDateValue(payment_date)) throw Object.assign(new Error('Data de pagamento inválida.'), { status: 400 });
    const numAmount = Math.round(Number(amount) * 100) / 100;
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      throw Object.assign(new Error(({ error: 'Montante inválido' }).error), { status: 400 });
    }

    const reservation = db.prepare('SELECT * FROM reservations WHERE id = ? AND organization_id = ?').get(id, organizationId);
    if (!reservation) throw Object.assign(new Error(({ error: 'Reserva não encontrada' }).error), { status: 404 });
    require('../services/stripePaymentGuards').assertNoActiveCheckout(reservation.id);

    const { MAX_MONEY } = require('../services/reservationValidation');
    if (numAmount > MAX_MONEY || Math.round((Number(reservation.amount_paid || 0) + numAmount) * 100) > Math.round(MAX_MONEY * 100)) {
      throw Object.assign(new Error('Montante excessivo (máximo permitido: 999 999,99 € por reserva).'), { status: 400 });
    }

    ensureLegacyPayment(reservation);
    const paymentId = `rp-${uuidv4()}`;
    db.prepare(`
      INSERT INTO reservation_payments (id, reservation_id, organization_id, amount, method, payment_date, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(paymentId, id, organizationId, numAmount, method || null, payment_date || null, notes || null);

    const newPaid = ledgerTotal(id, organizationId);
    const autoStatus = getPaymentStatus(newPaid, reservation.total_amount, reservation.payment_status);

    db.prepare(`UPDATE reservations SET amount_paid = ?, payment_status = ?, status = ?, updated_at = datetime('now') WHERE id = ? AND organization_id = ?`)
      .run(newPaid, autoStatus, policyStatus(reservation, newPaid), id, organizationId);

    recordHistory({
      organizationId, reservationId: id, userId: req.user.id, action: 'payment_added',
      meta: { amount: numAmount, method: method || null, payment_date: payment_date || null },
    });

      const response = { id: paymentId, amount: numAmount, method, payment_date, notes, newTotalPaid: newPaid, newPaymentStatus: autoStatus };
      if (intentKey) db.prepare('INSERT INTO manual_payment_intents(organization_id,reservation_id,intent_key,fingerprint,response_json) VALUES(?,?,?,?,?)').run(organizationId, id, intentKey, fingerprint, JSON.stringify(response));
      return response;
    }).immediate();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/reservations/:id/payments/:paymentId
async function deletePayment(req, res, next) {
  try {
    const { newPaid, autoStatus } = db.transaction(() => {
    const { id, paymentId } = req.params;
    const organizationId = req.user.organization_id;

    const reservation = db.prepare('SELECT * FROM reservations WHERE id = ? AND organization_id = ?').get(id, organizationId);
    if (!reservation) throw Object.assign(new Error(({ error: 'Reserva não encontrada' }).error), { status: 404 });
    require('../services/stripePaymentGuards').assertNoActiveCheckout(reservation.id);

    const payment = db.prepare('SELECT * FROM reservation_payments WHERE id = ? AND reservation_id = ? AND organization_id = ?').get(paymentId, id, organizationId);
    if (!payment) throw Object.assign(new Error(({ error: 'Pagamento não encontrado' }).error), { status: 404 });
    if (payment.id.startsWith('stripe-')) throw Object.assign(new Error('Este movimento é gerido pela Stripe. Efetue o reembolso no painel Stripe.'), { status: 409 });

    db.prepare('DELETE FROM reservation_payments WHERE id = ? AND organization_id = ?').run(paymentId, organizationId);

    const newPaid = ledgerTotal(id, organizationId);
    if (newPaid < 0) throw Object.assign(new Error('Remover este movimento deixaria um saldo negativo. Corrige primeiro o ajuste associado.'), { status: 409 });
    const autoStatus = getPaymentStatus(newPaid, reservation.total_amount, 'pendente');

    db.prepare(`UPDATE reservations SET amount_paid = ?, payment_status = ?, status = ?, updated_at = datetime('now') WHERE id = ? AND organization_id = ?`)
      .run(newPaid, autoStatus, policyStatus(reservation, newPaid), id, organizationId);

    recordHistory({
      organizationId, reservationId: id, userId: req.user.id, action: 'payment_deleted',
      meta: { amount: payment.amount, method: payment.method || null, payment_date: payment.payment_date || null },
    });

      return { newPaid, autoStatus };
    }).immediate();
    res.json({ success: true, newTotalPaid: newPaid, newPaymentStatus: autoStatus });
  } catch (err) {
    next(err);
  }
}

// PUT /api/reservations/:id/invoice — regista/atualiza a fatura da reserva (uma por reserva).
async function saveInvoice(req, res, next) {
  try {
    const { id } = req.params;
    const organizationId = req.user.organization_id;
    const { invoice_number, invoice_date, invoice_sent_date, invoice_sent_method } = req.body;

    const reservation = db.prepare('SELECT id FROM reservations WHERE id = ? AND organization_id = ?').get(id, organizationId);
    if (!reservation) return res.status(404).json({ error: 'Reserva não encontrada' });

    db.prepare(`UPDATE reservations SET
        invoice_number = ?, invoice_date = ?, invoice_sent_date = ?, invoice_sent_method = ?, updated_at = datetime('now')
      WHERE id = ? AND organization_id = ?`)
      .run(
        (invoice_number || '').trim() || null,
        invoice_date || null,
        invoice_sent_date || null,
        (invoice_sent_method || '').trim() || null,
        id, organizationId
      );

    const updated = db.prepare(
      'SELECT invoice_number, invoice_date, invoice_sent_date, invoice_sent_method FROM reservations WHERE id = ? AND organization_id = ?'
    ).get(id, organizationId);
    recordHistory({
      organizationId, reservationId: id, userId: req.user.id, action: 'invoice_saved',
      meta: { invoice_number: updated.invoice_number || null },
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}


module.exports = { addPayment, deletePayment, saveInvoice };
