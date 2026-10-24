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

module.exports = { businessTimeZone, localDay, addDays, daysBetween };
