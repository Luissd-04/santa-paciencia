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
  if (!offsetDays) return day;
  return new Date(Date.parse(`${day}T12:00:00Z`) + offsetDays * 86400000).toISOString().slice(0, 10);
}

module.exports = { businessTimeZone, localDay };
