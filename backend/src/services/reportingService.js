// Definição única de receita, usada pelo dashboard e pelos relatórios.
//
// Decisão 6 da auditoria: a receita de uma reserva ativa é o total contratado
// (inclui a taxa turística); numa reserva cancelada é o que ficou pago (sinal
// retido, já descontados os reembolsos). Uma reserva cancelada sem dinheiro
// retido não conta.
const revenueSql = (alias = 'r') =>
  `(CASE WHEN ${alias}.status != 'cancelada' THEN COALESCE(${alias}.total_amount, 0) ELSE COALESCE(${alias}.amount_paid, 0) END)`;

// Reservas que entram nos relatórios: as ativas e as canceladas com dinheiro retido.
const reportableSql = (alias = 'r') => `(${alias}.status != 'cancelada' OR COALESCE(${alias}.amount_paid, 0) > 0)`;

// Contagens de reservas e noites só incluem estadias que vão acontecer.
const activeCountSql = (alias = 'r') => `SUM(CASE WHEN ${alias}.status != 'cancelada' THEN 1 ELSE 0 END)`;
const activeNightsSql = (alias = 'r') => `SUM(CASE WHEN ${alias}.status != 'cancelada' THEN ${alias}.nights ELSE 0 END)`;

// A mesma regra para uma reserva já lida.
function revenueOf(reservation) {
  return reservation.status !== 'cancelada' ? Number(reservation.total_amount || 0) : Number(reservation.amount_paid || 0);
}

module.exports = { revenueSql, reportableSql, activeCountSql, activeNightsSql, revenueOf };
