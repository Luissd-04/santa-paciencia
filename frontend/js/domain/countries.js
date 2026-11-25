// Lista de países partilhada pelas páginas públicas (pedido de reserva e
// pré-check-in): nomes em português e inglês, código ISO 3166-1 alfa-2 e
// pesquisa em ambas as línguas («United Kingdom» e «Reino Unido» dão o mesmo).
// O valor que o servidor guarda continua a ser o nome em português.
(() => {
AppModules.define('countries', {
  all: { get: () => all },
  find: { get: () => find },
  search: { get: () => search },
  normalize: { get: () => normalize },
  matches: { get: () => matches },
});

const CODES = 'AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW'.split(' ');

// Nomes alternativos comuns (siglas, nomes antigos e nomes nativos).
const ALIASES = {
  GB: ['UK', 'Inglaterra', 'England', 'Escócia', 'Scotland', 'Gales', 'Wales', 'Great Britain', 'Grã-Bretanha', 'Britain'],
  US: ['EUA', 'USA', 'U.S.A.', 'United States of America', 'América', 'America'],
  NL: ['Holanda', 'Holland', 'Nederland'],
  CZ: ['República Checa', 'Czech Republic', 'Czechia'],
  TR: ['Turkey', 'Türkiye'],
  AE: ['Emirados Árabes', 'UAE', 'Dubai'],
  BA: ['Bósnia'],
  MK: ['Macedónia'],
  DE: ['Deutschland'], ES: ['España'], IT: ['Italia'], AT: ['Österreich'], CH: ['Schweiz', 'Suisse', 'Svizzera'],
  CI: ['Ivory Coast', 'Costa do Marfim'], KR: ['South Korea', 'Korea'], KP: ['North Korea'],
  MM: ['Burma', 'Birmânia'], CV: ['Cape Verde'], SZ: ['Swaziland', 'Essuatíni'],
  CD: ['Congo-Kinshasa', 'DR Congo'], VA: ['Vaticano', 'Vatican'],
};

const fold = value => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toLowerCase();

let list = null;
function all() {
  if (list) return list;
  let pt, en;
  try {
    pt = new Intl.DisplayNames(['pt-PT'], { type: 'region' });
    en = new Intl.DisplayNames(['en'], { type: 'region' });
  } catch (e) {
    pt = en = { of: code => code };
  }
  list = CODES.map(code => {
    const namePt = pt.of(code) || code;
    const nameEn = en.of(code) || namePt;
    const names = [namePt, nameEn, code, ...(ALIASES[code] || [])].map(fold).filter(Boolean);
    return { code, flag: code, name: namePt, pt: namePt, en: nameEn, names, ptKey: fold(namePt), enKey: fold(nameEn) };
  }).sort((a, b) => a.pt.localeCompare(b.pt, 'pt'));
  return list;
}

// Procura exata: nome em português, inglês, alias ou código ISO.
function find(text) {
  const key = fold(text);
  if (!key) return null;
  return all().find(c => c.names.includes(key)) || null;
}

// Nome em português guardado no servidor; texto livre fica como foi escrito.
function normalize(text) {
  const country = find(text);
  return country ? country.pt : String(text || '').trim();
}

function score(query, country) {
  const key = fold(query);
  if (!key) return 1;
  let best = 0;
  for (const name of country.names) {
    if (name === key) best = Math.max(best, 300);
    else if (name.startsWith(key)) best = Math.max(best, 200 - Math.min(name.length, 60) / 100);
    else if (name.split(' ').some(word => word.startsWith(key))) best = Math.max(best, 120);
    else if (key.length > 2 && name.includes(key)) best = Math.max(best, 60);
  }
  if (key.length === 2 && country.code.toLowerCase() === key) best = Math.max(best, 150);
  return best;
}

// Para listas com código ISO próprio (indicativos telefónicos).
function matches(query, code) {
  const country = all().find(c => c.code === String(code || '').toUpperCase());
  return country ? score(query, country) > 0 : false;
}

function search(query, limit = 12) {
  const key = fold(query);
  if (!key) return all();
  return all()
    .map(country => ({ country, points: score(query, country) }))
    .filter(item => item.points > 0)
    .sort((a, b) => b.points - a.points || a.country.pt.localeCompare(b.country.pt, 'pt'))
    .slice(0, limit)
    .map(item => item.country);
}

})();
