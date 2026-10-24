// Transições do ciclo de vida de uma reserva: cancelar, aprovar e o
// pré-check-in. Todos os caminhos (botão, edição do estado, link do hóspede,
// política de pagamento, expiração) passam por aqui, com os mesmos efeitos.
// As transições pelo dinheiro recebido estão em reservationState.
const { db } = require('../config/database');
const { httpError } = require('./httpError');
const { recordHistory } = require('./reservationHistoryService');
const events = require('./reservationEvents');

const CANCEL_REASONS = ['staff', 'guest', 'ttl', 'nonpayment'];
// Estados a partir dos quais o envio do link inicia o pré-check-in.
const PRECHECKIN_FROM = ['pre_reserva', 'pendente', 'confirmada', 'aguardar_pagamento'];

const load = (organizationId, id) => db.prepare('SELECT * FROM reservations WHERE id = ? AND organization_id = ?').get(id, organizationId);

// Chamar dentro da transação de quem cancela. Grava o estado e os efeitos
// comuns a todos os cancelamentos: voucher não pago libertado, evento do
// calendário removido, histórico e acontecimento (emails e avisos). Devolve
// false se a reserva já estava cancelada.
function markCancelled(reservation, { reason, actorUserId = null, policy = false, meta = {}, note = null }) {
  if (!CANCEL_REASONS.includes(reason)) throw new Error(`Motivo de cancelamento inválido: ${reason}`);
  const { id, organization_id: organizationId } = reservation;
  const changed = db.prepare(`UPDATE reservations SET status = 'cancelada',
      cancelled_previous_status = status, cancelled_previous_payment_status = payment_status,
      notes = CASE WHEN ? IS NULL THEN notes ELSE COALESCE(notes || char(10), '') || ? END,
      updated_at = datetime('now')
    WHERE id = ? AND organization_id = ? AND status != 'cancelada'`).run(note, note, id, organizationId).changes;
  if (!changed) return false;
  require('./voucherService').releaseVoucherIfUnpaid(organizationId, id);
  require('./calendarService').detachReservationEvent(organizationId, id);
  recordHistory({ organizationId, reservationId: id, userId: actorUserId, action: 'cancelled', meta: { reason, ...(policy ? { policy: true } : {}), ...meta } });
  events.emit('reservation.cancelled', { organizationId, reservationId: id, actorUserId, payload: { reason, policy } });
  return true;
}

// Depois do commit: tarefas operacionais e fila do calendário. Uma falha aqui
// não desfaz o cancelamento; o scheduler volta a sincronizar.
function afterCancel(organizationId, id) {
  try {
    const r = load(organizationId, id);
    if (r) require('./operationalTasksService').syncReservationOperationalTasks(r);
  } catch { console.warn('Sincronização operacional pendente após cancelamento.'); }
  require('./calendarService').kickCalendarQueue(organizationId);
}

// Cancelamento pela equipa (botão ou edição do estado). Com política de
// pagamento, o reembolso contratado é tratado por paymentPolicyAutomation.
async function cancel(organizationId, id, { actorUserId = null, key, expectedRefundCents } = {}) {
  const reservation = load(organizationId, id);
  if (!reservation) throw httpError('Reserva não encontrada', 404);
  if (reservation.status === 'cancelada') return { alreadyCancelled: true };
  if (reservation.payment_policy_json) {
    await require('./paymentPolicyAutomation').cancelByPolicy(id, { reason: 'staff', userId: actorUserId, key, expectedRefundCents });
    return { policy: true };
  }
  await require('./stripePayments').closeOpenCheckout(id);
  db.transaction(() => {
    require('./stripePaymentGuards').assertNoActiveCheckout(id);
    markCancelled(load(organizationId, id), { reason: 'staff', actorUserId });
  }).immediate();
  afterCancel(organizationId, id);
  return { cancelled: true };
}

// Aprovar um pedido: passa ao pré-check-in e envia o link ao hóspede. Nunca
// faz recuar uma estadia em curso ou terminada.
function approve(organizationId, id, { actorUserId = null, origin }) {
  const { ensurePublicToken, ensurePrecheckinToken } = require('./reservationSupport');
  const result = db.transaction(() => {
    const reservation = load(organizationId, id);
    if (!reservation) throw httpError('Reserva não encontrada', 404);
    if (reservation.status === 'cancelada') throw httpError('Reserva cancelada não pode ser aprovada.');
    if (['check_in', 'check_out'].includes(reservation.status)) throw httpError('A estadia já começou; a reserva não pode voltar ao pré-check-in.', 409);
    ensurePublicToken(reservation);
    const token = ensurePrecheckinToken(reservation);
    const url = `${origin}/pre-checkin/${token}`;
    db.prepare("UPDATE reservations SET status = 'pre_checkin', updated_at = datetime('now') WHERE id = ? AND organization_id = ?").run(id, organizationId);
    recordHistory({ organizationId, reservationId: id, userId: actorUserId, action: 'approved' });
    events.emit('reservation.approved', { organizationId, reservationId: id, actorUserId, payload: { precheckinUrl: url } });
    return { reservation: load(organizationId, id), url };
  }).immediate();
  try {
    require('./operationalTasksService').syncReservationOperationalTasks(result.reservation, actorUserId);
  } catch { console.warn('Sincronização operacional pendente após aprovação.'); }
  return result;
}

// Envio do link de pré-check-in com sucesso: inicia o pré-check-in das reservas
// ainda não preenchidas. Chamar dentro de uma transação, com a reserva atual.
function startPrecheckin(current, { actorUserId = null } = {}) {
  if (current.precheckin_submitted_at || !PRECHECKIN_FROM.includes(current.status)) return current.status;
  db.prepare("UPDATE reservations SET status = 'pre_checkin', updated_at = datetime('now') WHERE id = ? AND organization_id = ?")
    .run(current.id, current.organization_id);
  recordHistory({ organizationId: current.organization_id, reservationId: current.id, userId: actorUserId, action: 'updated',
    changes: [{ field: 'status', from: current.status, to: 'pre_checkin' }], meta: { source: 'send_precheckin' } });
  return 'pre_checkin';
}

// Estado depois de o hóspede concluir o pré-check-in: confirmada, salvo se a
// política de pagamento ainda espera o sinal.
function statusAfterPrecheckin(current) {
  if (current.status !== 'pre_checkin') return current.status;
  const { cents } = require('./money');
  return require('./reservationState').statusAfterPayment({
    status: 'confirmada', paidCents: cents(current.amount_paid || 0), totalCents: cents(current.total_amount || 0),
    depositCents: current.payment_policy_json ? require('./paymentPolicy').planFor(current).depositCents : null,
  });
}

module.exports = { CANCEL_REASONS, PRECHECKIN_FROM, markCancelled, afterCancel, cancel, approve, startPrecheckin, statusAfterPrecheckin };
