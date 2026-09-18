const { db } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const { ledgerTotal, ensureLegacyPayment } = require('../services/paymentLedger');
const { getPaymentStatus } = require('../services/reservationRules');
const { recordHistory } = require('../services/reservationHistoryService');
async function addPayment(req, res, next) {
  try {
    const { paymentId, numAmount, method, payment_date, notes, newPaid, autoStatus } = db.transaction(() => {
    const { id } = req.params;
    const organizationId = req.user.organization_id;
    const { amount, method, payment_date, notes } = req.body;

    const numAmount = Math.round(Number(amount) * 100) / 100;
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      throw Object.assign(new Error(({ error: 'Montante inválido' }).error), { status: 400 });
    }

    const reservation = db.prepare('SELECT * FROM reservations WHERE id = ? AND organization_id = ?').get(id, organizationId);
    if (!reservation) throw Object.assign(new Error(({ error: 'Reserva não encontrada' }).error), { status: 404 });

    const reservationTotal = Number(reservation.total_amount) || 0;
    const paymentCap = Math.max(reservationTotal * 10, 1000000);
    if (numAmount > paymentCap) {
      throw Object.assign(new Error(({ error: `Montante excessivo (máximo permitido: €${paymentCap.toFixed(2)}).` }).error), { status: 400 });
    }

    ensureLegacyPayment(reservation);
    const paymentId = `rp-${uuidv4()}`;
    db.prepare(`
      INSERT INTO reservation_payments (id, reservation_id, organization_id, amount, method, payment_date, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(paymentId, id, organizationId, numAmount, method || null, payment_date || null, notes || null);

    const newPaid = ledgerTotal(id, organizationId);
    const autoStatus = getPaymentStatus(newPaid, reservation.total_amount, reservation.payment_status);

    db.prepare(`UPDATE reservations SET amount_paid = ?, payment_status = ?, updated_at = datetime('now') WHERE id = ? AND organization_id = ?`)
      .run(newPaid, autoStatus, id, organizationId);

    recordHistory({
      organizationId, reservationId: id, userId: req.user.id, action: 'payment_added',
      meta: { amount: numAmount, method: method || null, payment_date: payment_date || null },
    });

      return { paymentId, numAmount, method, payment_date, notes, newPaid, autoStatus };
    }).immediate();
    res.json({ success: true, data: { id: paymentId, amount: numAmount, method, payment_date, notes, newTotalPaid: newPaid, newPaymentStatus: autoStatus } });
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

    const payment = db.prepare('SELECT * FROM reservation_payments WHERE id = ? AND reservation_id = ? AND organization_id = ?').get(paymentId, id, organizationId);
    if (!payment) throw Object.assign(new Error(({ error: 'Pagamento não encontrado' }).error), { status: 404 });

    db.prepare('DELETE FROM reservation_payments WHERE id = ? AND organization_id = ?').run(paymentId, organizationId);

    const newPaid = ledgerTotal(id, organizationId);
    if (newPaid < 0) throw Object.assign(new Error('Remover este movimento deixaria um saldo negativo. Corrige primeiro o ajuste associado.'), { status: 409 });
    const autoStatus = getPaymentStatus(newPaid, reservation.total_amount, 'pendente');

    db.prepare(`UPDATE reservations SET amount_paid = ?, payment_status = ?, updated_at = datetime('now') WHERE id = ? AND organization_id = ?`)
      .run(newPaid, autoStatus, id, organizationId);

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
