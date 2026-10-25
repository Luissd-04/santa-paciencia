// Transições do ciclo de vida de uma reserva: cancelar, aprovar, os passos
// escolhidos pela equipa e o envio do pré-check-in. Todos os caminhos (botão,
// edição do estado, link do hóspede, política de pagamento, expiração) passam
// por aqui, com os mesmos efeitos. As regras estão em reservationState.
const { db } = require('../config/database');
const { httpError } = require('./httpError');
const { recordHistory } = require('./reservationHistoryService');
const events = require('./reservationEvents');
const state = require('./reservationState');
const { cents } = require('./money');

const CANCEL_REASONS = ['staff', 'guest', 'ttl', 'nonpayment'];

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
  nextStatus(reservation, 'cancelada');
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

// O que decide os passos de uma reserva: o sinal já recebido (ledger contra
// paymentPolicy.requiredDepositCents) e o estado do pré-check-in. `r` pode ser
// um rascunho (ex.: cotação da edição) com o total e o canal novos.
function context(r) {
  const paidCents = r.id ? cents(require('./financialLedger').ledgerTotal(r.id, r.organization_id)) : 0;
  return { depositPaid: paidCents >= require('./paymentPolicy').requiredDepositCents(r), precheckin: state.precheckinState(r) };
}

// Estado a gravar quando a equipa pede `requested` (indefinido: sem mudança).
// Recusa com a explicação os passos que o ciclo não permite (ex.: check-in sem
// sinal ou sem pré-check-in). Entre «aguarda sinal» e «confirmada» decide
// depois financialLedger.recompute, com o total já atualizado.
function nextStatus(current, requested, r = current) {
  if (requested === undefined || requested === null || requested === '') return current?.status ?? 'aguardar_pagamento';
  if (!state.STATUSES.includes(requested)) throw httpError('Estado de reserva inválido.', 400);
  const result = state.transition(current?.status ?? null, requested, context(r));
  if (result.error) throw httpError(result.error, 409, { code: 'status_transition' });
  return result.status;
}

// Opções do seletor de estado (ficha e formulário), já resolvidas pelo sinal.
const statusOptions = r => state.statusOptions(r.id && r.status ? r.status : null, context(r));

// Estado ao reativar uma reserva cancelada: o anterior, com a reserva ativa
// outra vez decidida pelo sinal.
function reactivationStatus(existing) {
  const previous = existing.cancelled_previous_status;
  if (!previous || state.PAYMENT_DRIVEN_STATUSES.includes(previous)) return 'aguardar_pagamento';
  return previous;
}

// Aprovar um pedido: passa a reserva ativa (confirmada se o sinal já estiver
// pago) e envia o link do pré-check-in ao hóspede.
function approve(organizationId, id, { actorUserId = null, origin }) {
  const { ensurePublicToken, ensurePrecheckinToken } = require('./reservationSupport');
  const result = db.transaction(() => {
    const reservation = load(organizationId, id);
    if (!reservation) throw httpError('Reserva não encontrada', 404);
    if (reservation.status !== 'pendente') throw httpError('Só um pedido pendente pode ser aprovado.', 409);
    ensurePublicToken(reservation);
    const token = ensurePrecheckinToken(reservation);
    const url = `${origin}/pre-checkin/${token}`;
    db.prepare("UPDATE reservations SET status = 'aguardar_pagamento', updated_at = datetime('now') WHERE id = ? AND organization_id = ?").run(id, organizationId);
    require('./financialLedger').recompute(id, organizationId);
    recordHistory({ organizationId, reservationId: id, userId: actorUserId, action: 'approved' });
    events.emit('reservation.approved', { organizationId, reservationId: id, actorUserId, payload: { precheckinUrl: url } });
    return { reservation: load(organizationId, id), url };
  }).immediate();
  try {
    require('./operationalTasksService').syncReservationOperationalTasks(result.reservation, actorUserId);
  } catch { console.warn('Sincronização operacional pendente após aprovação.'); }
  return result;
}

// O link do pré-check-in chegou ao hóspede (email enviado ou link partilhado
// pela equipa). Só a primeira vez conta; não mexe no estado da reserva.
function markPrecheckinSent(reservation, { actorUserId = null } = {}) {
  const changed = db.prepare(`UPDATE reservations SET precheckin_sent_at = datetime('now')
    WHERE id = ? AND organization_id = ? AND precheckin_sent_at IS NULL`).run(reservation.id, reservation.organization_id).changes;
  if (changed) recordHistory({ organizationId: reservation.organization_id, reservationId: reservation.id, userId: actorUserId, action: 'precheckin_sent' });
}

// Uma vez, depois da migração dos estados (20261025_reservation_states): as
// reservas a aguardar o sinal acertam-se pelo ledger (sinal já pago confirma).
function reconcileLegacyStatuses() {
  const id = '20261025_reservation_states_ledger';
  const done = () => db.prepare('SELECT 1 FROM schema_migrations WHERE id = ?').get(id);
  if (done()) return 0;
  const ledger = require('./financialLedger');
  return db.transaction(() => {
    if (done()) return 0;
    const rows = db.prepare("SELECT * FROM reservations WHERE status = 'aguardar_pagamento'").all();
    for (const r of rows) {
      ledger.ensureLegacyPayment(r);
      ledger.recompute(r.id, r.organization_id, { allowDowngrade: false });
    }
    db.prepare('INSERT INTO schema_migrations (id) VALUES (?)').run(id);
    return rows.length;
  }).immediate();
}

module.exports = { CANCEL_REASONS, markCancelled, afterCancel, cancel, context, nextStatus, statusOptions, reactivationStatus, approve, markPrecheckinSent, reconcileLegacyStatuses };
