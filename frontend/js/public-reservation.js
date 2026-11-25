// Estado privado; interface partilhada em AppModules.booking.
(() => {
AppModules.define('booking', {
  $: { get: () => $ },
  API_BASE: { get: () => API_BASE },
  DOC_TYPES: { get: () => DOC_TYPES },
  escapeHtml: { get: () => escapeHtml },
  mediaThumb: { get: () => mediaThumb },
  coverOf: { get: () => coverOf },
  imgAttrs: { get: () => imgAttrs },
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

// Pede ao servidor uma miniatura (`?w=`) em vez da foto original, que pode
// ter vários MB. Só para fotos carregadas na própria aplicação; URLs externos
// e de outras origens ficam como estão.
function mediaThumb(value, width) {
  const safe = safeMediaUrl(value);
  if (!safe) return '';
  try {
    const parsed = new URL(safe, location.origin);
    if (parsed.origin !== location.origin || !/^\/uploads\/[^/]+$/.test(parsed.pathname)) return safe;
    parsed.searchParams.set('w', String(width));
    return safe.startsWith('/') ? `${parsed.pathname}${parsed.search}` : parsed.href;
  } catch { return safe; }
}

// Capa no formato do sítio (recorte do servidor, `cover.variants`) e a
// posição do ponto principal dentro dele; sem capa própria, a 1.ª fotografia.
// `maxWidth`: largura do recorte no servidor (quando conhecida), para o srcset.
function coverOf(item, format) {
  const variant = item?.cover?.variants?.[format];
  return {
    src: variant || item?.cover_image || item?.images?.[0]?.url || '',
    position: item?.cover?.position?.[format] || '50% 50%',
    maxWidth: variant ? window.ResponsiveImage?.publicCoverWidth(item.cover, format) : null,
  };
}

// Atributos src/srcset/sizes de uma fotografia (domain/responsive-image.js);
// sem ele, uma miniatura única de 1024 px. `maxWidth`: largura do ficheiro.
function imgAttrs(url, { maxWidth, sizes = '100vw' } = {}) {
  const safe = safeMediaUrl(url);
  if (!safe) return '';
  const RI = window.ResponsiveImage;
  if (!RI) return `src="${escapeHtml(mediaThumb(safe, 1024))}"`;
  return RI.attrs(safe, { maxWidth, sizes });
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
  // Anti-bot: timestamp de quando a página foi carregada. Usado para
  // calcular elapsed_ms no payload e rejeitar submits demasiado rápidos.
  pageLoadedAt: Date.now()
};

const $ = id => document.getElementById(id);

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
