// Regras puras do estado de uma reserva derivado do dinheiro recebido. Todos
// os caminhos que mexem em pagamentos (separador Pagamentos, edição, Stripe,
// pré-check-in, política) usam estas funções; não leem nem escrevem na base.

// Estados em que o dinheiro recebido decide se a reserva está confirmada.
// Pedidos por aprovar, pré-check-in, estadias e cancelamentos não mudam por
// receber ou perder um pagamento.
const PAYMENT_DRIVEN_STATUSES = ['aguardar_pagamento', 'confirmada'];

// Estado do pagamento a partir do valor líquido recebido. `refunded` indica
// que o ledger tem reembolsos: liquidado a zero por reembolso não é "pendente".
function paymentStatusFor({ paidCents, totalCents, current = 'pendente', refunded = false }) {
  if (paidCents >= totalCents && paidCents > 0) return 'confirmado';
  if (paidCents > 0) return 'parcial';
  if (refunded) return 'reembolsado';
  // Nada a pagar (ex.: voucher de 100%): a reserva está liquidada.
  if (totalCents <= 0 && current !== 'reembolsado') return 'confirmado';
  return current === 'reembolsado' ? 'reembolsado' : 'pendente';
}

// Com política conta o sinal contratado; sem política, o pagamento integral.
// `allowDowngrade` deixa uma reserva confirmada voltar a aguardar o sinal
// quando um pagamento é removido; a Stripe nunca o faz (um reembolso externo
// é revisto pela equipa, não reabre a cobrança).
function statusAfterPayment({ status, paidCents, totalCents, depositCents = null, allowDowngrade = true }) {
  if (!PAYMENT_DRIVEN_STATUSES.includes(status)) return status;
  if (paidCents >= (depositCents ?? totalCents)) return 'confirmada';
  if (allowDowngrade && depositCents !== null) return 'aguardar_pagamento';
  return status;
}

module.exports = { PAYMENT_DRIVEN_STATUSES, paymentStatusFor, statusAfterPayment };
