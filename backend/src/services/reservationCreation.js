// Gravação de uma reserva nova, igual no backoffice e no pedido do site.
// Quem cria valida os dados, o preço e a disponibilidade; este serviço grava
// sempre pelos mesmos passos: linha da reserva, voucher, política de
// pagamento, pagamento inicial, estado, histórico e acontecimento.
const crypto = require('crypto');
const { db } = require('../config/database');
const { recordHistory } = require('./reservationHistoryService');
const ledger = require('./financialLedger');
const events = require('./reservationEvents');

const COLUMNS = new Set([
  'guest_id', 'accommodation_id', 'check_in', 'check_out', 'nights', 'num_guests', 'num_adults', 'num_children',
  'total_amount', 'breakfast_included', 'tourist_tax', 'channel', 'payment_method', 'payment_date', 'notes',
  'license_number', 'guests_data', 'nightly_prices', 'accommodations_data', 'price_edited_at', 'price_edited_by_user_id',
  'status', 'public_token', 'precheckin_token', 'precheckin_token_expires_at', 'arrival_time', 'guest_snapshot',
]);
const SOURCES = {
  // A equipa escolhe o estado; os pagamentos e a política acertam-no.
  backoffice: { event: 'reservation.created', deriveStatus: true },
  // Um pedido do site só muda de estado com a aprovação ou com o pagamento.
  public: { event: 'reservation.requested', deriveStatus: false },
};

const newReservationId = () => `SP-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

// Chamar dentro da transação de quem cria. `initialPayment` é o valor já
// recebido (registado no ledger); `calendarUserId` pede o evento no Google
// Calendar desse utilizador. Devolve a reserva gravada.
function create(organizationId, fields, { source, actorUserId = null, voucher = null, initialPayment = null,
  calendarUserId = null, eventPayload = {} }) {
  const config = SOURCES[source];
  if (!config) throw new Error(`Origem de reserva inválida: ${source}`);
  const unknown = Object.keys(fields).filter(key => !COLUMNS.has(key));
  if (unknown.length) throw new Error(`Campos de reserva desconhecidos: ${unknown.join(', ')}`);

  const id = newReservationId();
  const row = { status: 'confirmada', channel: 'direto', ...fields };
  const keys = Object.keys(row);
  db.prepare(`INSERT INTO reservations (id, organization_id, ${keys.join(', ')}, amount_paid, payment_status)
    VALUES (?, ?, ${keys.map(() => '?').join(', ')}, 0, 'pendente')`).run(id, organizationId, ...keys.map(key => row[key]));

  if (voucher) require('./voucherService').redeemVoucher(organizationId, voucher.id, id, voucher.discount);
  require('./paymentPolicy').attachPolicy({ id, organization_id: organizationId, check_in: row.check_in, channel: row.channel });
  if (initialPayment?.amount) {
    ledger.ensureLegacyPayment({ id, organization_id: organizationId, amount_paid: initialPayment.amount,
      payment_method: initialPayment.method || null, payment_date: initialPayment.date || null }, 'Pagamento registado na criação da reserva');
  }
  ledger.recompute(id, organizationId, { deriveStatus: config.deriveStatus });

  const reservation = db.prepare('SELECT * FROM reservations WHERE id = ? AND organization_id = ?').get(id, organizationId);
  recordHistory({ organizationId, reservationId: id, userId: actorUserId, action: 'created', meta: {
    check_in: reservation.check_in, check_out: reservation.check_out, accommodation_id: reservation.accommodation_id,
    total_amount: reservation.total_amount, ...(source === 'public' ? { source } : {}),
  } });
  // Google Calendar: a intenção fica gravada com a reserva; a fila cria o evento.
  if (calendarUserId && require('../config/google').isAuthenticated(calendarUserId, organizationId)) {
    require('./calendarService').queueCalendarUpsert(organizationId, 'reservation', id, calendarUserId);
  }
  events.emit(config.event, { organizationId, reservationId: id, actorUserId, payload: eventPayload });
  return reservation;
}

// Depois do commit: tarefas operacionais (check-in, check-out, limpeza) e a
// fila do calendário. Uma falha aqui não desfaz a reserva; o scheduler volta
// a sincronizar.
function afterCreate(reservation, { guestName, accommodationName, actorUserId = null }) {
  try {
    require('./operationalTasksService').syncReservationOperationalTasks({
      ...reservation, guest_name: guestName, accommodation_name: accommodationName,
    }, actorUserId);
  } catch { console.warn('Sincronização operacional pendente após criar a reserva.'); }
  require('./calendarService').kickCalendarQueue(reservation.organization_id);
}

module.exports = { create, afterCreate, newReservationId };
