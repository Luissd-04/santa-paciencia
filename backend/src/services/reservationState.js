// Regras puras dos três estados de uma reserva: o da reserva (ciclo de vida),
// o do pagamento e o do pré-check-in. Todos os caminhos (criação, edição,
// pagamentos, Stripe, aprovação, link do hóspede, política) usam estas
// funções; não leem nem escrevem na base (isso é reservationLifecycle).

// Estados da reserva, pela ordem do ciclo de vida.
const STATUSES = ['pre_reserva', 'pendente', 'aguardar_pagamento', 'confirmada', 'check_in', 'check_out', 'cancelada'];

// Uma reserva ativa está «a aguardar o sinal» ou «confirmada» (sinal
// recebido): é sempre o dinheiro recebido que decide entre os dois.
const PAYMENT_DRIVEN_STATUSES = ['aguardar_pagamento', 'confirmada'];

// Passos que a equipa pode dar a partir de cada estado (null: reserva nova).
// «ativa» é a reserva aceite, aguardar_pagamento ou confirmada conforme o sinal.
// O ciclo só avança; a confirmação chega com o pagamento, não com uma escolha.
const NEXT = {
  new: ['ativa', 'pre_reserva', 'pendente'],
  pre_reserva: ['ativa', 'cancelada'],
  pendente: ['ativa', 'cancelada'],
  aguardar_pagamento: ['check_in', 'cancelada'],
  confirmada: ['check_in', 'cancelada'],
  check_in: ['check_out', 'cancelada'],
  check_out: [],
  cancelada: [],
};

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

// Uma reserva ativa fica confirmada quando o recebido chega ao sinal
// (`depositCents`, 0 quando não há sinal a receber). `allowDowngrade` deixa
// uma reserva confirmada voltar a aguardar o sinal quando a equipa apaga um
// pagamento; a Stripe nunca o faz (um reembolso externo é revisto pela equipa).
function statusAfterPayment({ status, paidCents, depositCents, allowDowngrade = true }) {
  if (!PAYMENT_DRIVEN_STATUSES.includes(status)) return status;
  if (paidCents >= depositCents) return 'confirmada';
  return allowDowngrade ? 'aguardar_pagamento' : status;
}

// Pré-check-in: não enviado, enviado (link enviado ou partilhado pela equipa)
// ou preenchido (pelo hóspede ou pela equipa, no mesmo formulário).
const PRECHECKIN_STATES = ['nao_enviado', 'enviado', 'preenchido'];
function precheckinState(r) {
  if (r.precheckin_submitted_at) return 'preenchido';
  return r.precheckin_sent_at ? 'enviado' : 'nao_enviado';
}
// A mesma regra em SQL, para listar e filtrar (`alias` da tabela reservations).
const precheckinStateSql = (alias = 'r') => `CASE WHEN ${alias}.precheckin_submitted_at IS NOT NULL THEN 'preenchido'
  WHEN ${alias}.precheckin_sent_at IS NOT NULL THEN 'enviado' ELSE 'nao_enviado' END`;

const LABELS = { aguardar_pagamento: 'aguarda sinal', confirmada: 'confirmada', check_in: 'em estadia', check_out: 'concluída',
  cancelada: 'cancelada', pendente: 'pendente', pre_reserva: 'pré-reserva' };

// Verifica um passo pedido pela equipa. `ctx`: { depositPaid, precheckin }.
// Devolve { status } (o estado a gravar) ou { error } com a explicação.
function transition(from, to, ctx = {}) {
  const current = from || 'new';
  // Entre «aguarda sinal» e «confirmada» decide o dinheiro, não a escolha.
  if (to === from || (PAYMENT_DRIVEN_STATUSES.includes(from) && PAYMENT_DRIVEN_STATUSES.includes(to))) return { status: from };
  const allowed = NEXT[current] || [];
  const target = PAYMENT_DRIVEN_STATUSES.includes(to) ? 'ativa' : to;
  if (to === 'check_in' && allowed.includes('check_in')) {
    const missing = [];
    if (from !== 'confirmada') missing.push('a reserva ainda não está confirmada (falta o sinal; regista-o no separador Pagamentos)');
    if (ctx.precheckin !== 'preenchido') missing.push('o pré-check-in ainda não foi preenchido (envia o link ao hóspede ou preenche os dados na ficha)');
    if (missing.length) return { error: `Não é possível fazer o check-in: ${missing.join(' e ')}.` };
    return { status: 'check_in' };
  }
  if (!allowed.includes(target)) {
    if (to === 'check_out') return { error: 'O check-out só se faz depois do check-in.' };
    if (!from) return { error: 'Uma reserva nova começa como reserva, pré-reserva ou pedido pendente.' };
    return { error: `Uma reserva ${LABELS[from] || from} não pode passar a ${LABELS[to] || to}.` };
  }
  if (target === 'ativa') return { status: ctx.depositPaid ? 'confirmada' : 'aguardar_pagamento' };
  return { status: to };
}

// Estados que o seletor mostra: o atual (ou o de uma reserva nova) e os
// passos seguintes, com a reserva ativa já resolvida pelo sinal.
function statusOptions(from, ctx = {}) {
  const active = ctx.depositPaid ? 'confirmada' : 'aguardar_pagamento';
  const next = (NEXT[from || 'new'] || []).map(step => (step === 'ativa' ? active : step));
  return [...new Set([...(from ? [from] : []), ...next])];
}

module.exports = { STATUSES, PAYMENT_DRIVEN_STATUSES, PRECHECKIN_STATES, paymentStatusFor, statusAfterPayment,
  precheckinState, precheckinStateSql, transition, statusOptions };
