// Valores monetários: comparações e cálculos fazem-se em cêntimos inteiros,
// para não acumular erro binário. Um valor inválido dá NaN, para que quem
// valida o possa recusar.
const cents = value => Math.round(Number(value) * 100);
const fromCents = value => value / 100;
// Arredondado ao cêntimo, em euros.
const roundEUR = value => fromCents(cents(value));
// Em falta, em cêntimos (negativo se foi pago a mais).
const dueCents = (total, paid) => cents(total || 0) - cents(paid || 0);
// Ainda falta pagar alguma coisa.
const isUnderpaid = (paid, total) => dueCents(total, paid) > 0;
// Mínimo de uma cobrança online (Stripe): 0,50 €.
const MIN_ONLINE_CENTS = 50;
// Formato português («1 234,56 €»), o mesmo dos emails e do frontend.
const formatEUR = value => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(Number(value) || 0);
module.exports = { cents, fromCents, roundEUR, dueCents, isUnderpaid, MIN_ONLINE_CENTS, formatEUR };
