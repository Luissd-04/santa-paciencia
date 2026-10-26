// Estado privado; interface partilhada em AppModules.core.
(() => {
(function () {
  function isValidDateParts(year, month, day, options = {}) {
    const y = Number(year);
    const m = Number(month);
    const d = Number(day);
    const minYear = options.minYear || 1900;
    const maxYear = options.maxYear || 2100;
    if (y < minYear || y > maxYear || m < 1 || m > 12 || d < 1 || d > 31) return false;
    const date = new Date(`${year}-${month}-${day}T12:00:00`);
    return date.getFullYear() === y && date.getMonth() + 1 === m && date.getDate() === d;
  }

  function normalizeIsoDate(value, options = {}) {
    const raw = String(value || '').trim();
    if (!raw) return '';

    const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
      const [, year, month, day] = isoMatch;
      return isValidDateParts(year, month, day, options) ? raw : '';
    }

    const ptMatch = raw.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
    if (ptMatch) {
      const [, day, month, year] = ptMatch;
      return isValidDateParts(year, month, day, options) ? `${year}-${month}-${day}` : '';
    }

    const digits = raw.replace(/\D/g, '');
    if (digits.length === 8) {
      const day = digits.slice(0, 2);
      const month = digits.slice(2, 4);
      const year = digits.slice(4, 8);
      return isValidDateParts(year, month, day, options) ? `${year}-${month}-${day}` : '';
    }

    return '';
  }

  function formatPtDate(value) {
    const iso = normalizeIsoDate(value);
    if (!iso) return value || '';
    const [year, month, day] = iso.split('-');
    return `${day}-${month}-${year}`;
  }

  function formatShortPtDate(value) {
    const iso = normalizeIsoDate(value);
    if (!iso) return '—';
    const date = new Date(`${iso}T12:00:00`);
    return date.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function countNights(checkIn, checkOut) {
    const ci = normalizeIsoDate(checkIn);
    const co = normalizeIsoDate(checkOut);
    if (!ci || !co) return 0;
    return Math.max(0, Math.round((new Date(`${co}T12:00:00`) - new Date(`${ci}T12:00:00`)) / 86400000));
  }

  function ageAtDate(birthDate, refDate) {
    const birthIso = normalizeIsoDate(birthDate, { minYear: 1900, maxYear: new Date().getFullYear() });
    const refIso = normalizeIsoDate(refDate);
    if (!birthIso || !refIso) return null;
    const birth = new Date(`${birthIso}T12:00:00`);
    const ref = new Date(`${refIso}T12:00:00`);
    if (Number.isNaN(birth.getTime()) || Number.isNaN(ref.getTime()) || birth > ref) return null;
    let age = ref.getFullYear() - birth.getFullYear();
    const monthDiff = ref.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && ref.getDate() < birth.getDate())) age--;
    return age;
  }

  // Data de calendário local (AAAA-MM-DD). toISOString() devolve o dia em UTC:
  // em Lisboa, no verão, entre as 00h e a 01h ainda seria o dia anterior.
  function localIso(date = new Date(), offsetDays = 0) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate() + offsetDays);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // Soma (ou subtrai) dias a uma data AAAA-MM-DD; devolve AAAA-MM-DD.
  // Ao meio-dia, para a mudança de hora nunca passar para o dia ao lado.
  function addDays(iso, days = 1) {
    const value = normalizeIsoDate(iso);
    if (!value) return '';
    return localIso(new Date(`${value}T12:00:00`), days);
  }

  // Instantes (pagamentos, histórico, mensagens) mostram-se na hora do
  // alojamento, como no servidor (services/dates.js, TZ por omissão Lisboa).
  // O SQLite guarda "AAAA-MM-DD HH:MM:SS" em UTC, sem «T» nem «Z»; o Safari
  // não lê esse formato, por isso é convertido aqui.
  const BUSINESS_TIME_ZONE = 'Europe/Lisbon';
  const DATE_TIME_STYLES = {
    full: { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' },
    compact: { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' },
  };
  function parseInstant(value) {
    if (value instanceof Date) return value;
    const raw = String(value || '').trim();
    if (!raw) return null;
    const sql = raw.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}(?::\d{2})?)$/);
    const date = new Date(sql ? `${sql[1]}T${sql[2]}Z` : raw);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  function formatDateTime(value, style = 'full') {
    const date = parseInstant(value);
    if (!date) return value ? String(value) : '—';
    return date.toLocaleString('pt-PT', { timeZone: BUSINESS_TIME_ZONE, ...(DATE_TIME_STYLES[style] || DATE_TIME_STYLES.full) });
  }

  window.ReservationDates = {
    localIso,
    addDays,
    parseInstant,
    formatDateTime,
    normalizeIsoDate,
    formatPtDate,
    formatShortPtDate,
    countNights,
    ageAtDate,
    isValidDateParts,
  };
})();

})();
