// Entradas do sino que vêm do registo de acontecimentos (reservation_events):
// avisos que não chegaram e pagamentos (recebido, falhado, reembolso). O texto
// é sempre humano: nada de nomes de efeitos nem de erros técnicos.
const { db } = require('../config/database');
const { NO_GMAIL_MESSAGE } = require('./staffNotifier');

const DAYS = 14;
const PAYMENT_DAYS = 7;

// Efeito → [canal, o que era]. Os efeitos ao hóspede dizem o email que era.
const EFFECTS = {
  staff_push_new: ['push', 'da nova reserva'],
  staff_push_new_request: ['push', 'do novo pedido'],
  staff_push_payment: ['push', 'do pagamento'],
  staff_push_payment_issue: ['push', 'do problema de pagamento'],
  staff_push_cancelled: ['push', 'do cancelamento'],
  staff_push_precheckin: ['push', 'do pré-check-in'],
  staff_email_new_request: ['email', 'do novo pedido'],
  staff_email_payment: ['email', 'do pagamento'],
  staff_email_payment_issue: ['email', 'do problema de pagamento'],
  staff_email_cancelled: ['email', 'do cancelamento'],
  guest_confirmation_email: ['guest', 'de pedido recebido'],
  guest_cancellation_email: ['guest', 'de cancelamento'],
  guest_accepted_email: ['guest', 'de reserva aceite'],
  guest_precheckin_email: ['guest', 'de pré-check-in'],
  guest_payment_email: ['guest', 'de pagamento recebido'],
  guest_template_email: ['guest', 'agendado'],
  guest_policy_notice: ['guest', 'sobre o pagamento'],
};

function sentence(effect, guest, error) {
  const [channel, what] = EFFECTS[effect] || ['other', ''];
  const who = guest ? ` da reserva de ${guest}` : '';
  if (channel === 'push') return `O aviso ${what}${who} não chegou ao telemóvel da equipa.`;
  if (channel === 'email') {
    return error === NO_GMAIL_MESSAGE
      ? `${NO_GMAIL_MESSAGE}.`
      : `O aviso por email ${what}${who} não chegou à equipa.`;
  }
  if (channel === 'guest') return `O email ${what}${guest ? ` para ${guest}` : ''} não foi enviado ao hóspede. Abra a reserva para ver o que fazer.`;
  return `Um aviso${who} não foi entregue.`;
}

// Avisos (push, email) que esgotaram as tentativas: ninguém os recebeu. Sem
// Gmail ligado, uma só entrada para todos os emails à equipa.
function failedNotices(organizationId) {
  const rows = db.prepare(`SELECT e.id AS event_id, e.reservation_id, f.effect, f.last_error, g.name AS guest_name,
      CASE WHEN f.updated_at IS NULL THEN e.created_at ELSE f.updated_at END AS at
    FROM reservation_event_effects f
    JOIN reservation_events e ON e.id = f.event_id
    LEFT JOIN reservations r ON r.id = e.reservation_id AND r.organization_id = e.organization_id
    LEFT JOIN guests g ON g.id = r.guest_id
    WHERE e.organization_id = ? AND f.state = 'failed' AND f.updated_at > datetime('now', ?)
    ORDER BY f.updated_at DESC LIMIT 50`).all(organizationId, `-${DAYS} days`);
  const gmailOn = require('../config/googleEmail').isEmailAuthenticated(organizationId);
  const out = [];
  let noGmailShown = false;
  for (const f of rows) {
    if (f.last_error === NO_GMAIL_MESSAGE) {
      // Já ligou o Gmail: o aviso deixa de fazer sentido.
      if (gmailOn || noGmailShown) continue;
      noGmailShown = true;
    }
    out.push({ type: 'notice_failed', priority: 'high', icon: 'bell-off', title: 'Aviso não entregue',
      subtitle: sentence(f.effect, f.guest_name, f.last_error), reservation_id: f.reservation_id, event_id: f.event_id,
      occurred_at: toIso(f.at) });
  }
  return out;
}

const toIso = sqlite => sqlite ? `${String(sqlite).replace(' ', 'T')}Z` : undefined;

// Pagamento recebido / falhado / reembolsado / a rever, para proprietário e gestor.
function paymentNotices(organizationId, userId) {
  const { paymentIssueText } = require('./reservationEffects');
  const { formatEUR } = require('./money');
  const rows = db.prepare(`SELECT e.id, e.type, e.reservation_id, e.actor_user_id, e.payload, e.created_at, g.name AS guest_name, a.name AS accommodation_name
    FROM reservation_events e
    JOIN reservations r ON r.id = e.reservation_id AND r.organization_id = e.organization_id
    LEFT JOIN guests g ON g.id = r.guest_id
    LEFT JOIN accommodations a ON a.id = r.accommodation_id
    WHERE e.organization_id = ? AND e.type IN ('payment.received', 'payment.failed', 'payment.refunded', 'payment.review')
      AND e.created_at > datetime('now', ?)
    ORDER BY e.created_at DESC, e.rowid DESC LIMIT 50`).all(organizationId, `-${PAYMENT_DAYS} days`);
  const out = [];
  for (const e of rows) {
    const payload = JSON.parse(e.payload || '{}');
    const where = [e.guest_name, e.accommodation_name].filter(Boolean).join(' · ');
    const base = { priority: 'medium', icon: 'banknote', reservation_id: e.reservation_id, event_id: e.id, occurred_at: toIso(e.created_at) };
    if (e.type === 'payment.received') {
      // Quem registou o pagamento à mão não precisa de aviso do que fez.
      if (e.actor_user_id && e.actor_user_id === userId) continue;
      out.push({ ...base, type: 'payment_received', title: `Pagamento recebido · ${formatEUR(Number(payload.amount) || 0)}`, subtitle: where });
    } else {
      const text = paymentIssueText(e.type, payload);
      out.push({ ...base, type: e.type === 'payment.refunded' ? 'payment_refunded' : 'payment_issue', priority: e.type === 'payment.refunded' ? 'medium' : 'high',
        icon: e.type === 'payment.refunded' ? 'undo-2' : 'circle-alert', title: text.title, subtitle: [where, text.body].filter(Boolean).join(' · ') });
    }
  }
  return out;
}

module.exports = { failedNotices, paymentNotices, sentence };
