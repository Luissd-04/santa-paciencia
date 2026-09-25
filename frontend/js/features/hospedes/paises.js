// Estado privado; interface partilhada em AppModules.hospedes.
(() => {
AppModules.define('hospedes', {
  COUNTRIES: { get: () => COUNTRIES },
  flagImg: { get: () => flagImg },
  formatShortDate: { get: () => formatShortDate },
  guestTagsHtml: { get: () => guestTagsHtml },
});

// ── COUNTRIES ──
const COUNTRIES = [
  { code: 'af', name: 'Afeganistão' }, { code: 'za', name: 'África do Sul' },
  { code: 'al', name: 'Albânia' }, { code: 'de', name: 'Alemanha' },
  { code: 'ad', name: 'Andorra' }, { code: 'ao', name: 'Angola' },
  { code: 'sa', name: 'Arábia Saudita' }, { code: 'dz', name: 'Argélia' },
  { code: 'ar', name: 'Argentina' }, { code: 'am', name: 'Arménia' },
  { code: 'au', name: 'Austrália' }, { code: 'at', name: 'Áustria' },
  { code: 'az', name: 'Azerbaijão' }, { code: 'be', name: 'Bélgica' },
  { code: 'bh', name: 'Bahrein' }, { code: 'bd', name: 'Bangladesh' },
  { code: 'by', name: 'Bielorrússia' }, { code: 'bo', name: 'Bolívia' },
  { code: 'ba', name: 'Bósnia e Herzegovina' }, { code: 'br', name: 'Brasil' },
  { code: 'bg', name: 'Bulgária' }, { code: 'cv', name: 'Cabo Verde' },
  { code: 'ca', name: 'Canadá' }, { code: 'cl', name: 'Chile' },
  { code: 'cn', name: 'China' }, { code: 'cy', name: 'Chipre' },
  { code: 'co', name: 'Colômbia' }, { code: 'cr', name: 'Costa Rica' },
  { code: 'hr', name: 'Croácia' }, { code: 'cu', name: 'Cuba' },
  { code: 'dk', name: 'Dinamarca' }, { code: 'eg', name: 'Egito' },
  { code: 'ae', name: 'Emirados Árabes' }, { code: 'sk', name: 'Eslováquia' },
  { code: 'si', name: 'Eslovénia' }, { code: 'es', name: 'Espanha' },
  { code: 'us', name: 'Estados Unidos' }, { code: 'ee', name: 'Estónia' },
  { code: 'et', name: 'Etiópia' }, { code: 'ph', name: 'Filipinas' },
  { code: 'fi', name: 'Finlândia' }, { code: 'fr', name: 'França' },
  { code: 'ge', name: 'Geórgia' }, { code: 'gh', name: 'Gana' },
  { code: 'gr', name: 'Grécia' }, { code: 'gt', name: 'Guatemala' },
  { code: 'hu', name: 'Hungria' }, { code: 'in', name: 'Índia' },
  { code: 'id', name: 'Indonésia' }, { code: 'iq', name: 'Iraque' },
  { code: 'ir', name: 'Irão' }, { code: 'ie', name: 'Irlanda' },
  { code: 'is', name: 'Islândia' }, { code: 'il', name: 'Israel' },
  { code: 'it', name: 'Itália' }, { code: 'jp', name: 'Japão' },
  { code: 'jo', name: 'Jordânia' }, { code: 'kz', name: 'Cazaquistão' },
  { code: 'ke', name: 'Quénia' }, { code: 'kw', name: 'Kuwait' },
  { code: 'lv', name: 'Letónia' }, { code: 'lb', name: 'Líbano' },
  { code: 'ly', name: 'Líbia' }, { code: 'li', name: 'Listenstaine' },
  { code: 'lt', name: 'Lituânia' }, { code: 'lu', name: 'Luxemburgo' },
  { code: 'mo', name: 'Macau' }, { code: 'mk', name: 'Macedónia do Norte' },
  { code: 'my', name: 'Malásia' }, { code: 'ma', name: 'Marrocos' },
  { code: 'mx', name: 'México' }, { code: 'md', name: 'Moldávia' },
  { code: 'mc', name: 'Mónaco' }, { code: 'mz', name: 'Moçambique' },
  { code: 'na', name: 'Namíbia' }, { code: 'ng', name: 'Nigéria' },
  { code: 'no', name: 'Noruega' }, { code: 'nz', name: 'Nova Zelândia' },
  { code: 'nl', name: 'Países Baixos' }, { code: 'pk', name: 'Paquistão' },
  { code: 'pe', name: 'Peru' }, { code: 'pl', name: 'Polónia' },
  { code: 'pt', name: 'Portugal' }, { code: 'qa', name: 'Qatar' },
  { code: 'gb', name: 'Reino Unido' }, { code: 'cz', name: 'República Checa' },
  { code: 'ro', name: 'Roménia' }, { code: 'ru', name: 'Rússia' },
  { code: 'rw', name: 'Ruanda' }, { code: 'sm', name: 'San Marino' },
  { code: 'sn', name: 'Senegal' }, { code: 'rs', name: 'Sérvia' },
  { code: 'sg', name: 'Singapura' }, { code: 'so', name: 'Somália' },
  { code: 'lk', name: 'Sri Lanka' }, { code: 'se', name: 'Suécia' },
  { code: 'ch', name: 'Suíça' }, { code: 'th', name: 'Tailândia' },
  { code: 'tw', name: 'Taiwan' }, { code: 'tz', name: 'Tanzânia' },
  { code: 'tr', name: 'Turquia' }, { code: 'ua', name: 'Ucrânia' },
  { code: 'ug', name: 'Uganda' }, { code: 'uy', name: 'Uruguai' },
  { code: 've', name: 'Venezuela' }, { code: 'vn', name: 'Vietname' },
  { code: 'zm', name: 'Zâmbia' }, { code: 'zw', name: 'Zimbabwe' },
];

// Nationality free-text → ISO2 fallback for older records
const NATIONALITY_FALLBACK = {
  'portuguesa': 'pt', 'portuguese': 'pt', 'portugal': 'pt',
  'espanhola': 'es', 'espanhol': 'es', 'española': 'es', 'spain': 'es',
  'francesa': 'fr', 'francês': 'fr', 'french': 'fr',
  'britânica': 'gb', 'british': 'gb', 'inglesa': 'gb', 'inglês': 'gb',
  'alemã': 'de', 'alemão': 'de', 'german': 'de',
  'italiana': 'it', 'italiano': 'it', 'italian': 'it',
  'neerlandesa': 'nl', 'holandesa': 'nl', 'dutch': 'nl',
  'americana': 'us', 'americano': 'us', 'estados unidos': 'us',
  'brasileira': 'br', 'brasileiro': 'br', 'brazil': 'br',
  'japonesa': 'jp', 'japonês': 'jp', 'japanese': 'jp',
  'chinesa': 'cn', 'chinês': 'cn', 'chinese': 'cn',
  'canadiana': 'ca', 'canadiano': 'ca', 'canadian': 'ca',
  'australiana': 'au', 'australiano': 'au', 'australian': 'au',
  'suíça': 'ch', 'suíço': 'ch', 'swiss': 'ch',
  'austríaca': 'at', 'austríaco': 'at', 'austrian': 'at',
  'belga': 'be', 'belgian': 'be',
  'sueca': 'se', 'sueco': 'se', 'swedish': 'se',
  'norueguesa': 'no', 'norueguês': 'no', 'norwegian': 'no',
  'dinamarquesa': 'dk', 'dinamarquês': 'dk', 'danish': 'dk',
  'finlandesa': 'fi', 'finlandês': 'fi', 'finnish': 'fi',
  'polaca': 'pl', 'polaco': 'pl', 'polish': 'pl',
  'checa': 'cz', 'checo': 'cz', 'czech': 'cz',
  'húngara': 'hu', 'húngaro': 'hu', 'hungarian': 'hu',
  'romena': 'ro', 'romeno': 'ro', 'romanian': 'ro',
  'grega': 'gr', 'grego': 'gr', 'greek': 'gr',
  'turca': 'tr', 'turco': 'tr', 'turkish': 'tr',
  'mexicana': 'mx', 'mexicano': 'mx', 'mexican': 'mx',
  'argentina': 'ar', 'argentino': 'ar', 'argentinian': 'ar',
  'indiana': 'in', 'indiano': 'in', 'indian': 'in',
  'irlandesa': 'ie', 'irlandês': 'ie', 'irish': 'ie',
  'russa': 'ru', 'russo': 'ru', 'russian': 'ru',
  'ucraniana': 'ua', 'ucraniano': 'ua', 'ukrainian': 'ua',
  'israelita': 'il', 'israelense': 'il', 'israeli': 'il',
  'singapuriana': 'sg', 'singapuriano': 'sg', 'singaporean': 'sg',
  'coreana': 'kr', 'coreano': 'kr', 'korean': 'kr', 'coreia do sul': 'kr',
  'tailandesa': 'th', 'tailandês': 'th', 'thai': 'th',
  'filipina': 'ph', 'filipino': 'ph', 'filipino': 'ph',
  'marroquina': 'ma', 'marroquino': 'ma', 'moroccan': 'ma',
};

function resolveCountryCode(g) {
  // Prefer standardized country field
  if (g.country) {
    const found = COUNTRIES.find(c => c.name.toLowerCase() === g.country.toLowerCase().trim());
    if (found) return found.code;
  }
  // Fallback: nationality free text
  if (g.nationality) {
    const key = g.nationality.toLowerCase().trim();
    // Try exact country name match
    const found = COUNTRIES.find(c => c.name.toLowerCase() === key);
    if (found) return found.code;
    // Try fallback map
    return NATIONALITY_FALLBACK[key] || null;
  }
  return null;
}

// Bandeira do hóspede — SVG (flag-icons) em vez de emoji, que o Windows
// não desenha. Ver flagHtml() em helpers.js.
function flagImg(g, size = 64) {
  const code = resolveCountryCode(g);
  return AppModules.core.flagHtml(code, { size, className: 'hospede-flag' });
}

function formatShortDate(s) {
  if (!s) return '—';
  const d = new Date(s + 'T12:00:00');
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' });
}

function guestTagsHtml(g) {
  const tags = [];
  if (g.is_favorite) tags.push(`<span class="htag htag-favorito">⭐ Favorito</span>`);
  if (g.is_vip) tags.push(`<span class="htag htag-vip">👑 VIP</span>`);
  if (g.is_unwanted) tags.push(`<span class="htag htag-nao-desejado">🚫 Não desejado</span>`);
  return tags.length ? `<div class="hospede-tags">${tags.join('')}</div>` : '';
}


})();
