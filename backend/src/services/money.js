// Valores monetários: comparações e cálculos fazem-se em cêntimos inteiros,
// para não acumular erro binário. Um valor inválido dá NaN, para que quem
// valida o possa recusar.
const cents = value => Math.round(Number(value) * 100);
const fromCents = value => value / 100;
// Formato português («1 234,56 €»), o mesmo dos emails e do frontend.
const formatEUR = value => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(Number(value) || 0);
module.exports = { cents, fromCents, formatEUR };
