// Montantes em euros com o formato português («1 234,56 €»), o mesmo dos
// emails. Uma só implementação para o backoffice e as páginas públicas.
(() => {
const full = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });
const short = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 2 });

// Sempre com cêntimos: totais, pagamentos, valores em falta.
const format = value => full.format(Number(value) || 0);
// Sem cêntimos quando o valor é inteiro: preços por noite e eixos de gráficos.
const formatShort = value => short.format(Number(value) || 0);

window.ReservationMoney = Object.freeze({ format, formatShort });
})();
