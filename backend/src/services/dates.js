// Datas de calendário do alojamento («hoje», «amanhã»). Calculadas no fuso do
// alojamento (TZ, por omissão Europe/Lisbon), nunca com toISOString(), que
// devolve o dia em UTC: em Lisboa, no verão, entre as 00h e a 01h, seria ontem.
function businessTimeZone() {
  const zone = process.env.TZ || 'Europe/Lisbon';
  // TZ pode ter um formato POSIX que o Intl não aceita (ex.: ":/etc/localtime").
  try { new Intl.DateTimeFormat('en-CA', { timeZone: zone }); return zone; } catch { return 'Europe/Lisbon'; }
}

function localDay(date = new Date(), offsetDays = 0) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: businessTimeZone(), year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  return offsetDays ? addDays(day, offsetDays) : day;
}

// Hora de parede no alojamento ({ hour, minute }), sem depender do fuso do
// servidor (Date#getHours usa o do processo).
function localTime(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: businessTimeZone(), hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(date);
  const get = type => Number(parts.find(p => p.type === type)?.value || 0);
  return { hour: get('hour'), minute: get('minute') };
}

// Instante (Date) em que é «HH:MM» do dia AAAA-MM-DD no alojamento — ex.: o
// check-in às 15:00. Corrige o desvio do fuso nesse dia (hora de verão).
function zonedDateTime(day, time = '00:00') {
  const [h = 0, m = 0] = String(time).split(':').map(Number);
  const wall = Date.UTC(...String(day).slice(0, 10).split('-').map((n, i) => Number(n) - (i === 1 ? 1 : 0)), h || 0, m || 0);
  const offsetAt = instant => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: businessTimeZone(), hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(new Date(instant)).map(part => [part.type, part.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - instant;
  };
  const guess = wall - offsetAt(wall);
  return new Date(wall - offsetAt(guess));
}

// Aritmética de dias de calendário (AAAA-MM-DD), feita ao meio-dia UTC para
// não depender do fuso nem da mudança de hora.
const DAY_MS = 86400000;
const noonUtc = day => Date.parse(`${String(day).slice(0, 10)}T12:00:00Z`);
function addDays(day, days) {
  return new Date(noonUtc(day) + days * DAY_MS).toISOString().slice(0, 10);
}
function daysBetween(from, to) {
  return Math.round((noonUtc(to) - noonUtc(from)) / DAY_MS);
}

// Datas curtas para avisos e listas: «3 jul», com o ano só quando não é o
// atual; um intervalo no mesmo mês junta os dias («3 → 6 jul»).
const SHORT_MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function shortDate(day, { year = null, today = localDay() } = {}) {
  const [y, m, d] = String(day).slice(0, 10).split('-').map(Number);
  const showYear = year ?? String(y) !== today.slice(0, 4);
  return `${d} ${SHORT_MONTHS[m - 1]}${showYear ? ` ${y}` : ''}`;
}
// «sáb, 14 nov» (dia da semana abreviado, sem ponto).
const SHORT_WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
function weekdayDate(day, options = {}) {
  const [y, m, d] = String(day).slice(0, 10).split('-').map(Number);
  return `${SHORT_WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${shortDate(day, options)}`;
}
function shortRange(from, to, { today = localDay() } = {}) {
  const crossesYear = from.slice(0, 4) !== to.slice(0, 4);
  const year = crossesYear || from.slice(0, 4) !== today.slice(0, 4);
  if (!crossesYear && from.slice(0, 7) === to.slice(0, 7)) return `${Number(from.slice(8, 10))} → ${shortDate(to, { year, today })}`;
  return `${shortDate(from, { year, today })} → ${shortDate(to, { year, today })}`;
}

module.exports = { businessTimeZone, localDay, localTime, zonedDateTime, addDays, daysBetween, shortDate, shortRange, weekdayDate };
