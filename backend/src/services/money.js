// Valores monetários: comparações e cálculos fazem-se em cêntimos inteiros,
// para não acumular erro binário. Um valor inválido dá NaN, para que quem
// valida o possa recusar.
const cents = value => Math.round(Number(value) * 100);
const fromCents = value => value / 100;
module.exports = { cents, fromCents };
