// Montantes em euros com o formato português («1 234,56 €»), o mesmo dos
// emails. Uma só implementação para o backoffice e as páginas públicas.
(() => {
const full = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });
const short = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 2 });

// Sempre com cêntimos: totais, pagamentos, valores em falta.
const format = value => full.format(Number(value) || 0);
// Sem cêntimos quando o valor é inteiro: preços por noite e eixos de gráficos.
const formatShort = value => short.format(Number(value) || 0);

// Valor escrito à mão: aceita vírgula ou ponto como separador decimal e
// espaços ou o outro sinal como separador de milhares («1 234,56»,
// «1234.56», «1.234,56»). Devolve NaN quando não é um número.
function parse(value) {
  const raw = String(value ?? '').trim().replace(/[\s€]/g, '');
  if (!raw) return NaN;
  const lastComma = raw.lastIndexOf(','), lastDot = raw.lastIndexOf('.');
  const decimal = lastComma > lastDot ? ',' : '.';
  const thousands = decimal === ',' ? '.' : ',';
  const normalized = raw.split(thousands).join('').replace(decimal, '.');
  return /^-?\d+(\.\d+)?$/.test(normalized) ? Number(normalized) : NaN;
}

window.ReservationMoney = Object.freeze({ format, formatShort, parse });
})();
