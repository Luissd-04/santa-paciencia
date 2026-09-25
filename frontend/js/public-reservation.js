// Estado privado; interface partilhada em AppModules.booking.
(() => {
AppModules.define('booking', {
  $: { get: () => $ },
  API_BASE: { get: () => API_BASE },
  COUNTRIES: { get: () => COUNTRIES },
  DOC_TYPES: { get: () => DOC_TYPES },
  escapeHtml: { get: () => escapeHtml },
  safeMediaUrl: { get: () => safeMediaUrl },
  PHONE_CODES: { get: () => PHONE_CODES },
  state: { get: () => state },
});

const API_BASE = '';

// Escape para uso em innerHTML/template literals — local porque
// public-reservation.js não carrega helpers.js.
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeMediaUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw, location.origin);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    if (raw.startsWith('/') && !raw.startsWith('//')) return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    return parsed.href;
  } catch {
    return '';
  }
}

const searchParams = new URLSearchParams(location.search);

const state = {
  slug: searchParams.get('slug') || decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || ''),
  property: null,
  units: [],
  services: [],
  availability: [],
  selectedUnitId: '',
  step: 1,
  bgIndex: 0,
  lastBgChange: 0,
  // Anti-bot: timestamp de quando a página foi carregada. Usado para
  // calcular elapsed_ms no payload e rejeitar submits demasiado rápidos.
  pageLoadedAt: Date.now()
};

const $ = id => document.getElementById(id);

const COUNTRIES = [
  { name: 'Portugal', flag: '🇵🇹' },
  { name: 'Espanha', flag: '🇪🇸' },
  { name: 'França', flag: '🇫🇷' },
  { name: 'Itália', flag: '🇮🇹' },
  { name: 'Alemanha', flag: '🇩🇪' },
  { name: 'Bélgica', flag: '🇧🇪' },
  { name: 'Holanda', flag: '🇳🇱' },
  { name: 'Polónia', flag: '🇵🇱' },
  { name: 'Suíça', flag: '🇨🇭' },
  { name: 'Áustria', flag: '🇦🇹' },
  { name: 'República Checa', flag: '🇨🇿' },
  { name: 'Eslováquia', flag: '🇸🇰' },
  { name: 'Eslovénia', flag: '🇸🇮' },
  { name: 'Hungria', flag: '🇭🇺' },
  { name: 'Roménia', flag: '🇷🇴' },
  { name: 'Bulgária', flag: '🇧🇬' },
  { name: 'Croácia', flag: '🇭🇷' },
  { name: 'Sérvia', flag: '🇷🇸' },
  { name: 'Bósnia', flag: '🇧🇦' },
  { name: 'Montenegro', flag: '🇲🇪' },
  { name: 'Macedónia do Norte', flag: '🇲🇰' },
  { name: 'Albânia', flag: '🇦🇱' },
  { name: 'Kosovo', flag: '🇽🇰' },
  { name: 'Grécia', flag: '🇬🇷' },
  { name: 'Chipre', flag: '🇨🇾' },
  { name: 'Malta', flag: '🇲🇹' },
  { name: 'Luxemburgo', flag: '🇱🇺' },
  { name: 'Liechtenstein', flag: '🇱🇮' },
  { name: 'Mónaco', flag: '🇲🇨' },
  { name: 'Andorra', flag: '🇦🇩' },
  { name: 'Suécia', flag: '🇸🇪' },
  { name: 'Noruega', flag: '🇳🇴' },
  { name: 'Dinamarca', flag: '🇩🇰' },
  { name: 'Finlândia', flag: '🇫🇮' },
  { name: 'Islândia', flag: '🇮🇸' },
  { name: 'Estónia', flag: '🇪🇪' },
  { name: 'Letónia', flag: '🇱🇻' },
  { name: 'Lituânia', flag: '🇱🇹' },
  { name: 'Bielorrússia', flag: '🇧🇾' },
  { name: 'Ucrânia', flag: '🇺🇦' },
  { name: 'Moldávia', flag: '🇲🇩' },
  { name: 'Rússia', flag: '🇷🇺' },
  { name: 'Reino Unido', flag: '🇬🇧' },
  { name: 'Irlanda', flag: '🇮🇪' },
  { name: 'Brasil', flag: '🇧🇷' },
  { name: 'Argentina', flag: '🇦🇷' },
  { name: 'Chile', flag: '🇨🇱' },
  { name: 'Colômbia', flag: '🇨🇴' },
  { name: 'Peru', flag: '🇵🇪' },
  { name: 'Venezuela', flag: '🇻🇪' },
  { name: 'Uruguai', flag: '🇺🇾' },
  { name: 'Paraguai', flag: '🇵🇾' },
  { name: 'Equador', flag: '🇪🇨' },
  { name: 'Bolívia', flag: '🇧🇴' },
  { name: 'Guiana', flag: '🇬🇾' },
  { name: 'Suriname', flag: '🇸🇷' },
  { name: 'México', flag: '🇲🇽' },
  { name: 'Cuba', flag: '🇨🇺' },
  { name: 'República Dominicana', flag: '🇩🇴' },
  { name: 'EUA', flag: '🇺🇸' },
  { name: 'Canadá', flag: '🇨🇦' },
  { name: 'Marrocos', flag: '🇲🇦' },
  { name: 'Argélia', flag: '🇩🇿' },
  { name: 'Tunísia', flag: '🇹🇳' },
  { name: 'Líbia', flag: '🇱🇾' },
  { name: 'Egito', flag: '🇪🇬' },
  { name: 'Etiópia', flag: '🇪🇹' },
  { name: 'Quénia', flag: '🇰🇪' },
  { name: 'Tanzânia', flag: '🇹🇿' },
  { name: 'África do Sul', flag: '🇿🇦' },
  { name: 'Nigéria', flag: '🇳🇬' },
  { name: 'Gana', flag: '🇬🇭' },
  { name: 'Senegal', flag: '🇸🇳' },
  { name: 'Côte d\'Ivoire', flag: '🇨🇮' },
  { name: 'Camarões', flag: '🇨🇲' },
  { name: 'Angola', flag: '🇦🇴' },
  { name: 'Moçambique', flag: '🇲🇿' },
  { name: 'Cabo Verde', flag: '🇨🇻' },
  { name: 'Timor-Leste', flag: '🇹🇱' },
  { name: 'Guiné Bissau', flag: '🇬🇼' },
  { name: 'São Tomé e Príncipe', flag: '🇸🇹' },
  { name: 'Guiné Equatorial', flag: '🇬🇶' },
  { name: 'China', flag: '🇨🇳' },
  { name: 'Japão', flag: '🇯🇵' },
  { name: 'Coreia do Sul', flag: '🇰🇷' },
  { name: 'Coreia do Norte', flag: '🇰🇵' },
  { name: 'Vietname', flag: '🇻🇳' },
  { name: 'Tailândia', flag: '🇹🇭' },
  { name: 'Indonésia', flag: '🇮🇩' },
  { name: 'Malásia', flag: '🇲🇾' },
  { name: 'Singapura', flag: '🇸🇬' },
  { name: 'Filipinas', flag: '🇵🇭' },
  { name: 'Hong Kong', flag: '🇭🇰' },
  { name: 'Taiwan', flag: '🇹🇼' },
  { name: 'Índia', flag: '🇮🇳' },
  { name: 'Paquistão', flag: '🇵🇰' },
  { name: 'Bangladeche', flag: '🇧🇩' },
  { name: 'Sri Lanka', flag: '🇱🇰' },
  { name: 'Nepal', flag: '🇳🇵' },
  { name: 'Mianmar', flag: '🇲🇲' },
  { name: 'Camboja', flag: '🇰🇭' },
  { name: 'Laos', flag: '🇱🇦' },
  { name: 'Turquia', flag: '🇹🇷' },
  { name: 'Israel', flag: '🇮🇱' },
  { name: 'Jordânia', flag: '🇯🇴' },
  { name: 'Líbano', flag: '🇱🇧' },
  { name: 'Síria', flag: '🇸🇾' },
  { name: 'Iraque', flag: '🇮🇶' },
  { name: 'Irão', flag: '🇮🇷' },
  { name: 'Kuwait', flag: '🇰🇼' },
  { name: 'Arábia Saudita', flag: '🇸🇦' },
  { name: 'Emirados Árabes Unidos', flag: '🇦🇪' },
  { name: 'Qatar', flag: '🇶🇦' },
  { name: 'Bahrein', flag: '🇧🇭' },
  { name: 'Omã', flag: '🇴🇲' },
  { name: 'Iémen', flag: '🇾🇪' },
  { name: 'Afeganistão', flag: '🇦🇫' },
  { name: 'Cazaquistão', flag: '🇰🇿' },
  { name: 'Uzbequistão', flag: '🇺🇿' },
  { name: 'Austrália', flag: '🇦🇺' },
  { name: 'Nova Zelândia', flag: '🇳🇿' },
];

const DOC_TYPES = [
  { value: 'cc', label: 'Cartão de Cidadão' },
  { value: 'passport', label: 'Passaporte' },
  { value: 'other', label: 'Outro' }
];

const PHONE_CODES = [
  { code: '+351', country: 'Portugal', flag: '🇵🇹' },
  { code: '+34', country: 'Espanha', flag: '🇪🇸' },
  { code: '+33', country: 'França', flag: '🇫🇷' },
  { code: '+39', country: 'Itália', flag: '🇮🇹' },
  { code: '+49', country: 'Alemanha', flag: '🇩🇪' },
  { code: '+32', country: 'Bélgica', flag: '🇧🇪' },
  { code: '+31', country: 'Holanda', flag: '🇳🇱' },
  { code: '+48', country: 'Polónia', flag: '🇵🇱' },
  { code: '+41', country: 'Suíça', flag: '🇨🇭' },
  { code: '+43', country: 'Áustria', flag: '🇦🇹' },
  { code: '+420', country: 'República Checa', flag: '🇨🇿' },
  { code: '+421', country: 'Eslováquia', flag: '🇸🇰' },
  { code: '+36', country: 'Hungria', flag: '🇭🇺' },
  { code: '+40', country: 'Roménia', flag: '🇷🇴' },
  { code: '+359', country: 'Bulgária', flag: '🇧🇬' },
  { code: '+385', country: 'Croácia', flag: '🇭🇷' },
  { code: '+381', country: 'Sérvia', flag: '🇷🇸' },
  { code: '+30', country: 'Grécia', flag: '🇬🇷' },
  { code: '+46', country: 'Suécia', flag: '🇸🇪' },
  { code: '+47', country: 'Noruega', flag: '🇳🇴' },
  { code: '+45', country: 'Dinamarca', flag: '🇩🇰' },
  { code: '+358', country: 'Finlândia', flag: '🇫🇮' },
  { code: '+44', country: 'Reino Unido', flag: '🇬🇧' },
  { code: '+353', country: 'Irlanda', flag: '🇮🇪' },
  { code: '+55', country: 'Brasil', flag: '🇧🇷' },
  { code: '+54', country: 'Argentina', flag: '🇦🇷' },
  { code: '+56', country: 'Chile', flag: '🇨🇱' },
  { code: '+57', country: 'Colômbia', flag: '🇨🇴' },
  { code: '+51', country: 'Peru', flag: '🇵🇪' },
  { code: '+58', country: 'Venezuela', flag: '🇻🇪' },
  { code: '+598', country: 'Uruguai', flag: '🇺🇾' },
  { code: '+595', country: 'Paraguai', flag: '🇵🇾' },
  { code: '+593', country: 'Equador', flag: '🇪🇨' },
  { code: '+591', country: 'Bolívia', flag: '🇧🇴' },
  { code: '+592', country: 'Guiana', flag: '🇬🇾' },
  { code: '+597', country: 'Suriname', flag: '🇸🇷' },
  { code: '+52', country: 'México', flag: '🇲🇽' },
  { code: '+1', country: 'EUA/Canadá', flag: '🇺🇸' },
  { code: '+86', country: 'China', flag: '🇨🇳' },
  { code: '+81', country: 'Japão', flag: '🇯🇵' },
  { code: '+82', country: 'Coreia do Sul', flag: '🇰🇷' },
  { code: '+84', country: 'Vietname', flag: '🇻🇳' },
  { code: '+66', country: 'Tailândia', flag: '🇹🇭' },
  { code: '+62', country: 'Indonésia', flag: '🇮🇩' },
  { code: '+60', country: 'Malásia', flag: '🇲🇾' },
  { code: '+65', country: 'Singapura', flag: '🇸🇬' },
  { code: '+63', country: 'Filipinas', flag: '🇵🇭' },
  { code: '+852', country: 'Hong Kong', flag: '🇭🇰' },
  { code: '+91', country: 'Índia', flag: '🇮🇳' },
  { code: '+92', country: 'Paquistão', flag: '🇵🇰' },
  { code: '+880', country: 'Bangladeche', flag: '🇧🇩' },
  { code: '+94', country: 'Sri Lanka', flag: '🇱🇰' },
  { code: '+90', country: 'Turquia', flag: '🇹🇷' },
  { code: '+972', country: 'Israel', flag: '🇮🇱' },
  { code: '+20', country: 'Egito', flag: '🇪🇬' },
  { code: '+27', country: 'África do Sul', flag: '🇿🇦' },
  { code: '+234', country: 'Nigéria', flag: '🇳🇬' },
  { code: '+244', country: 'Angola', flag: '🇦🇴' },
  { code: '+258', country: 'Moçambique', flag: '🇲🇿' },
  { code: '+238', country: 'Cabo Verde', flag: '🇨🇻' },
  { code: '+670', country: 'Timor-Leste', flag: '🇹🇱' },
  { code: '+245', country: 'Guiné Bissau', flag: '🇬🇼' },
  { code: '+239', country: 'São Tomé e Príncipe', flag: '🇸🇹' },
  { code: '+61', country: 'Austrália', flag: '🇦🇺' },
  { code: '+64', country: 'Nova Zelândia', flag: '🇳🇿' },
];

// Código ISO 3166-1 alpha-2 a partir de um emoji de bandeira (regional
// indicators) — evita ter de reescrever os arrays COUNTRIES/PHONE_CODES.

})();
