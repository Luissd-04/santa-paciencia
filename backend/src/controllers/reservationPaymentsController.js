const { db } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const ledger = require('../services/financialLedger');
const { httpError } = require('../services/httpError');
const { recordHistory } = require('../services/reservationHistoryService');

async function addPayment(req, res, next) {
  try {
    const intentKey = req.body.idempotency_key;
    if (intentKey !== undefined && (typeof intentKey !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(intentKey))) {
      throw httpError('Identificador de pagamento inválido.');
    }
    const fingerprint = JSON.stringify([Number(req.body.amount), req.body.method || null, req.body.payment_date || null, req.body.notes || null]);
    const replay = () => {
      if (!intentKey) return null;
      const saved = db.prepare('SELECT * FROM manual_payment_intents WHERE organization_id=? AND reservation_id=? AND intent_key=?').get(req.user.organization_id, req.params.id, intentKey);
      if (!saved) return null;
      if (saved.fingerprint !== fingerprint) throw httpError('Este pagamento já foi registado com outros dados. Atualize o histórico antes de continuar.', 409);
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

    if (payment_date && !require('../services/reservationRules').normalizeDateValue(payment_date)) throw httpError('Data de pagamento inválida.');
    const numAmount = Math.round(Number(amount) * 100) / 100;
    if (!Number.isFinite(numAmount) || numAmount <= 0) throw httpError('Montante inválido');

    const reservation = db.prepare('SELECT * FROM reservations WHERE id = ? AND organization_id = ?').get(id, organizationId);
    if (!reservation) throw httpError('Reserva não encontrada', 404);
    require('../services/stripePaymentGuards').assertNoActiveCheckout(reservation.id);

    const { MAX_MONEY } = require('../services/reservationValidation');
    if (numAmount > MAX_MONEY || Math.round((Number(reservation.amount_paid || 0) + numAmount) * 100) > Math.round(MAX_MONEY * 100)) {
      throw httpError('Montante excessivo (máximo permitido: 999 999,99 € por reserva).');
    }

    ledger.ensureLegacyPayment(reservation);
    const paymentId = ledger.addEntry(reservation, { id: `rp-${uuidv4()}`, amount: numAmount, method: method || null,
      paymentDate: payment_date || null, notes: notes || null });
    const result = ledger.recompute(id, organizationId);

    recordHistory({
      organizationId, reservationId: id, userId: req.user.id, action: 'payment_added',
      meta: { amount: numAmount, method: method || null, payment_date: payment_date || null },
    });

      const response = { id: paymentId, amount: numAmount, method, payment_date, notes, newTotalPaid: result.paid, newPaymentStatus: result.paymentStatus };
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
    const result = db.transaction(() => {
    const { id, paymentId } = req.params;
    const organizationId = req.user.organization_id;

    const reservation = db.prepare('SELECT * FROM reservations WHERE id = ? AND organization_id = ?').get(id, organizationId);
    if (!reservation) throw httpError('Reserva não encontrada', 404);
    require('../services/stripePaymentGuards').assertNoActiveCheckout(reservation.id);

    const payment = ledger.removeEntry(reservation, paymentId);
    const result = ledger.recompute(id, organizationId, { fallbackPaymentStatus: 'pendente' });

    recordHistory({
      organizationId, reservationId: id, userId: req.user.id, action: 'payment_deleted',
      meta: { amount: payment.amount, method: payment.method || null, payment_date: payment.payment_date || null },
    });

      return result;
    }).immediate();
    res.json({ success: true, newTotalPaid: result.paid, newPaymentStatus: result.paymentStatus });
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
