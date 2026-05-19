const API_BASE = '';

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
  dateInput: null,
  dateMonth: null,
  lastBgChange: 0
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

function fuzzyMatch(search, target) {
  const s = search.toLowerCase();
  const t = target.toLowerCase();
  if (t.startsWith(s)) return 100 + (100 - t.indexOf(s));
  if (t.includes(s)) return 50;
  let score = 0;
  let si = 0;
  for (let i = 0; i < t.length && si < s.length; i++) {
    if (t[i] === s[si]) { score += 10; si++; }
  }
  return si === s.length ? score : 0;
}

function iso(value) {
  return window.ReservationDates?.normalizeIsoDate(value) || '';
}

function ptDate(value) {
  return window.ReservationDates?.formatPtDate(value) || value || '';
}

function fmtCurrency(value) {
  return `€${Number(value || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function nights() {
  return window.ReservationDates?.countNights($('pb-checkin').value, $('pb-checkout').value) || 0;
}

function totalGuests() {
  return (Number($('pb-adults').value) || 1) + (Number($('pb-children').value) || 0);
}

function selectedUnit() {
  if (state.selectedUnitId === 'property' || !state.selectedUnitId) return null;
  return state.units.find(u => u.id === state.selectedUnitId) || null;
}

async function api(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || `Erro ${res.status}`);
  return payload;
}

async function init() {
  if (!state.slug) return showFatal('Link inválido.');
  try {
    const payload = await api(`/api/public/booking/${state.slug}`);
    state.property = payload.data.property;
    state.units = payload.data.units || [];
    state.services = payload.data.services || [];
    state.selectedUnitId = 'property';
    renderLanding();
    bindEvents();
    updateIDFieldLabels();
    renderStep();
    recalc();
  } catch (err) {
    showFatal(err.message);
  }
}

function showFatal(message) {
  document.body.innerHTML = `<div style="min-height:100vh;display:grid;place-items:center;background:#17120f;color:#fff;font-family:Inter,sans-serif;padding:24px;text-align:center;"><div><h1>Não foi possível abrir a página</h1><p>${message}</p></div></div>`;
}

function allImages() {
  const imgs = [
    ...(state.property?.images || []),
    ...state.units.flatMap(u => u.images || [])
  ].map(img => img.url).filter(Boolean);
  return Array.from(new Set(imgs));
}

function renderLanding() {
  const p = state.property;
  document.title = `Reservar ${p.name}`;
  $('property-name').textContent = p.name;
  const location = [p.city, p.country].filter(Boolean).join(' · ') || 'Reserva online';
  $('property-location').textContent = location;
  $('property-description').textContent = p.description || 'Escolha as datas e envie o pedido de reserva. Confirmaremos a disponibilidade o mais rapidamente possível.';
  const imgs = allImages();
  const fallback = 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1600&q=80';
  $('ambient-bg').style.backgroundImage = `url('${imgs[0] || fallback}')`;
  renderRail('gallery-top', imgs.length ? imgs : [fallback]);
  renderRail('gallery-bottom', imgs.length ? imgs.slice().reverse() : [fallback]);
  rotateBackground();
  renderUnits();
}

function rotateBackground() {
  const now = Date.now();
  if (now - state.lastBgChange < 8000) return;
  const pool = allImages();
  if (!pool.length) return;
  state.bgIndex = (state.bgIndex + 1) % pool.length;
  $('ambient-bg').style.backgroundImage = `url('${pool[state.bgIndex]}')`;
  state.lastBgChange = now;
  setTimeout(rotateBackground, 8000);
}

function renderRail(id, imgs) {
  const rail = $(id);
  if (!imgs.length) return;
  const doubled = [...imgs, ...imgs, ...imgs, ...imgs].slice(0, Math.max(16, imgs.length * 3));
  rail.innerHTML = doubled.map(url => `<img class="rail-img" src="${url}" alt="" loading="lazy">`).join('');
  rail.classList.remove('paused');
  void rail.offsetHeight;
  rail.style.animation = 'none';
  void rail.offsetHeight;
  rail.style.animation = '';
}

function availabilityFor(unitId) {
  return state.availability.find(a => a.id === unitId);
}

function renderUnits() {
  const container = $('unit-list');
  const propertyAv = state.availability.find(a => a.type === 'property');
  const propertyBlocked = propertyAv && !propertyAv.available;
  const propertySelected = state.selectedUnitId === 'property' || state.selectedUnitId === state.property?.id;
  const propertyReason = propertyAv?.occupied
    ? 'Indisponível nas datas selecionadas'
    : propertyAv?.over_capacity
    ? `Capacidade máxima: ${propertyAv.max_guests} hóspedes`
    : 'Propriedade inteira para sua exclusividade';

  const propertyPrice = Number(state.property?.price_per_night) || 0;
  const priceHtml = propertyPrice > 0 ? `<div class="unit-price">${fmtCurrency(propertyPrice)}<small>/ noite</small></div>` : '';

  const propertyCard = `
    <div class="unit-card ${propertySelected ? 'selected' : ''} ${propertyBlocked ? 'blocked' : ''} property-card" data-unit="property">
      <img src="${state.property?.images?.[0]?.url || ''}" alt="">
      <div>
        <h4>${state.property?.name || 'Alojamento completo'}</h4>
        <p>${propertyReason}</p>
      </div>
      ${priceHtml}
    </div>`;

  const unitCards = state.units.map(unit => {
    const av = availabilityFor(unit.id);
    const blocked = av && !av.available;
    const selected = state.selectedUnitId === unit.id && !blocked;
    const reason = av?.over_capacity
      ? `Capacidade máxima: ${unit.max_guests} hóspedes`
      : av?.occupied ? 'Indisponível nas datas selecionadas' : `${unit.max_guests} hóspedes · ${unit.num_rooms || 1} quarto`;
    return `
      <div class="unit-card ${selected ? 'selected' : ''} ${blocked ? 'blocked' : ''}" data-unit="${unit.id}">
        <img src="${unit.cover_image || unit.images?.[0]?.url || ''}" alt="">
        <div>
          <h4>${unit.name}</h4>
          <p>${reason}</p>
        </div>
        <div class="unit-price">${fmtCurrency(unit.price_per_night)}<small>/ noite</small></div>
      </div>`;
  }).join('');

  container.innerHTML = propertyCard + unitCards;
}

function updateIDFieldLabels() {
  const country = $('pb-country').value.trim();
  const isStranger = country && country !== 'Portugal';

  if (isStranger) {
    $('pb-nif-label').textContent = 'Documento de identidade *';
    $('pb-nif').required = true;
    $('pb-birth-city').required = true;
    $('pb-id-type').required = true;
    $('pb-id-country').required = true;

    document.querySelectorAll('label span').forEach(span => {
      if (span.textContent.includes('Local de nascimento')) {
        span.textContent = 'Local de nascimento *';
      } else if (span.textContent.includes('Tipo de documento')) {
        span.textContent = 'Tipo de documento *';
      } else if (span.textContent.includes('País emissor')) {
        span.textContent = 'País emissor do documento *';
      }
    });
  } else {
    $('pb-nif-label').textContent = 'NIF';
    $('pb-nif').required = false;
    $('pb-birth-city').required = false;
    $('pb-id-type').required = false;
    $('pb-id-country').required = false;

    document.querySelectorAll('label span').forEach(span => {
      if (span.textContent.includes('Local de nascimento')) {
        span.textContent = 'Local de nascimento';
      } else if (span.textContent.includes('Tipo de documento')) {
        span.textContent = 'Tipo de documento';
      } else if (span.textContent.includes('País emissor')) {
        span.textContent = 'País emissor do documento';
      }
    });
  }
}

function setupCountrySearch(inputId, dropdownId, onPick) {
  const input = typeof inputId === 'string' ? $(inputId) : inputId;
  const dropdown = typeof dropdownId === 'string' ? $(dropdownId) : dropdownId;
  if (!input || !dropdown) return;

  let ignoreBlur = false;
  const handler = { input, dropdown, ignoreBlur: false };

  input.addEventListener('focus', () => {
    renderCountryDropdown(input.value, dropdown);
    dropdown.style.display = 'block';
  });

  input.addEventListener('input', () => {
    renderCountryDropdown(input.value, dropdown);
    dropdown.style.display = 'block';
  });

  input.addEventListener('blur', () => {
    if (handler.ignoreBlur) { handler.ignoreBlur = false; return; }
    setTimeout(() => { dropdown.style.display = 'none'; }, 80);
  });

  dropdown.addEventListener('mousedown', (e) => {
    handler.ignoreBlur = true;
    const item = e.target.closest('.country-dropdown-item');
    if (!item) return;
    e.preventDefault();
    const c = COUNTRIES.find(x => x.name === item.dataset.country);
    input.value = c.name;
    dropdown.style.display = 'none';
    if (onPick) onPick(c);
  });

  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });
}

function renderCountryDropdown(search, dropdown) {
  const results = search.trim()
    ? COUNTRIES.filter(c => fuzzyMatch(search, c.name) > 0)
        .sort((a, b) => fuzzyMatch(search, b.name) - fuzzyMatch(search, a.name))
        .slice(0, 12)
    : COUNTRIES;

  dropdown.innerHTML = results.map(c => `
    <div class="country-dropdown-item" data-country="${c.name}">
      <span>${c.flag}</span>
      <span>${c.name}</span>
    </div>`).join('');
}

function setupPhoneCodeSearch() {
  const btn = $('pb-phone-code-btn');
  const dropdown = $('pb-phone-code-dropdown');
  let searchStr = '';
  let searchTimer = null;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = dropdown.style.display === 'block';
    dropdown.style.display = open ? 'none' : 'block';
    if (!open) { searchStr = ''; renderPhoneCodeDropdown('', dropdown); }
  });

  btn.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { dropdown.style.display = 'none'; return; }
    if (e.key.length === 1) {
      searchStr += e.key;
      dropdown.style.display = 'block';
      renderPhoneCodeDropdown(searchStr, dropdown);
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { searchStr = ''; }, 1200);
    }
  });

  dropdown.addEventListener('mousedown', (e) => {
    const item = e.target.closest('.country-dropdown-item');
    if (!item) return;
    e.preventDefault();
    $('pb-phone-code').value = item.dataset.code;
    btn.textContent = `${item.dataset.flag} ${item.dataset.code}`;
    dropdown.style.display = 'none';
    searchStr = '';
  });

  document.addEventListener('click', (e) => {
    if (!btn.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });

  renderPhoneCodeDropdown('', dropdown);
}

function renderPhoneCodeDropdown(search, dropdown) {
  const results = search.trim()
    ? PHONE_CODES.filter(c => fuzzyMatch(search, c.code) > 0 || fuzzyMatch(search, c.country) > 0)
        .sort((a, b) => {
          const sa = Math.max(fuzzyMatch(search, a.code), fuzzyMatch(search, a.country));
          const sb = Math.max(fuzzyMatch(search, b.code), fuzzyMatch(search, b.country));
          return sb - sa;
        })
        .slice(0, 12)
    : PHONE_CODES;

  dropdown.innerHTML = results.map(p => `
    <div class="country-dropdown-item" data-code="${p.code}" data-flag="${p.flag}" data-country="${p.country}">
      <span>${p.flag}</span>
      <span>${p.code}</span>
      <span style="color:#999;margin-left:auto;font-size:12px">${p.country}</span>
    </div>`).join('');
}

function setupDocTypeSearch(inputId, dropdownId, onPick) {
  const input = typeof inputId === 'string' ? $(inputId) : inputId;
  const btn = input?.closest('.doc-type-wrap')?.querySelector('.doc-type-btn');
  const dropdown = typeof dropdownId === 'string' ? $(dropdownId) : dropdownId;
  if (!btn || !dropdown) return;

  let ignoreBlur = false;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = dropdown.style.display === 'block';
    dropdown.style.display = open ? 'none' : 'block';
    if (!open) renderDocTypeDropdown('', dropdown);
  });

  btn.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { dropdown.style.display = 'none'; return; }
    if (e.key.length === 1) {
      renderDocTypeDropdown(e.key, dropdown);
      dropdown.style.display = 'block';
    }
  });

  dropdown.addEventListener('mousedown', (e) => {
    const item = e.target.closest('.doc-type-item');
    if (!item) return;
    e.preventDefault();
    const docType = DOC_TYPES.find(d => d.value === item.dataset.value);
    input.value = item.dataset.value;
    btn.textContent = docType.label;
    dropdown.style.display = 'none';
    if (onPick) onPick(docType);
  });

  document.addEventListener('click', (e) => {
    if (!btn.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });

  renderDocTypeDropdown('', dropdown);
}

function renderDocTypeDropdown(search, dropdown) {
  const results = DOC_TYPES;
  dropdown.innerHTML = results.map(d => `
    <div class="doc-type-item" data-value="${d.value}">
      <span>${d.label}</span>
    </div>`).join('');
}

function setupGuestDocTypeSearch(btn, input, dropdown) {
  if (!btn || !input || !dropdown) return;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = dropdown.style.display === 'block';
    dropdown.style.display = open ? 'none' : 'block';
    if (!open) renderDocTypeDropdown('', dropdown);
  });

  btn.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { dropdown.style.display = 'none'; return; }
    if (e.key.length === 1) {
      renderDocTypeDropdown(e.key, dropdown);
      dropdown.style.display = 'block';
    }
  });

  dropdown.addEventListener('mousedown', (e) => {
    const item = e.target.closest('.doc-type-item');
    if (!item) return;
    e.preventDefault();
    const docType = DOC_TYPES.find(d => d.value === item.dataset.value);
    input.value = item.dataset.value;
    btn.textContent = docType.label;
    dropdown.style.display = 'none';
  });

  document.addEventListener('click', (e) => {
    if (!btn.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });

  renderDocTypeDropdown('', dropdown);
}

function setupGuestPhoneCodeSearch(guestIndex) {
  const guestSection = document.querySelector(`[data-guest-index="${guestIndex}"]`);
  if (!guestSection) return;

  const btn = guestSection.querySelector('.guest-phone-code-btn');
  const codeInput = guestSection.querySelector('input[data-field="phone_code"]');
  const phoneInput = guestSection.querySelector('input[data-field="phone"]');
  const dropdown = btn.parentElement.querySelector('.country-dropdown');
  if (!dropdown) {
    const newDropdown = document.createElement('div');
    newDropdown.className = 'country-dropdown';
    newDropdown.style.display = 'none';
    btn.parentElement.appendChild(newDropdown);
  }
  const finalDropdown = btn.parentElement.querySelector('.country-dropdown');

  let searchStr = '';
  let searchTimer = null;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = finalDropdown.style.display === 'block';
    finalDropdown.style.display = open ? 'none' : 'block';
    if (!open) { searchStr = ''; renderPhoneCodeDropdown('', finalDropdown); }
  });

  btn.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { finalDropdown.style.display = 'none'; return; }
    if (e.key.length === 1) {
      searchStr += e.key;
      finalDropdown.style.display = 'block';
      renderPhoneCodeDropdown(searchStr, finalDropdown);
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { searchStr = ''; }, 1200);
    }
  });

  finalDropdown.addEventListener('mousedown', (e) => {
    const item = e.target.closest('.country-dropdown-item');
    if (!item) return;
    e.preventDefault();
    codeInput.value = item.dataset.code;
    btn.textContent = `${item.dataset.flag} ${item.dataset.code}`;
    finalDropdown.style.display = 'none';
    searchStr = '';
  });

  document.addEventListener('click', (e) => {
    if (!btn.contains(e.target) && !finalDropdown.contains(e.target)) {
      finalDropdown.style.display = 'none';
    }
  });

  renderPhoneCodeDropdown('', finalDropdown);
}

let _voucherData = null;

async function applyVoucher() {
  const code = ($('pb-voucher')?.value || '').trim().toUpperCase();
  const statusEl = $('pb-voucher-status');
  if (!statusEl) return;
  if (!code) {
    _voucherData = null;
    statusEl.style.display = 'none';
    recalc();
    return;
  }
  statusEl.style.display = '';
  statusEl.style.background = '#f5f5f5';
  statusEl.style.color = '#666';
  statusEl.textContent = 'A verificar...';
  try {
    const res = await api(`/api/public/booking/${state.slug}/voucher?code=${encodeURIComponent(code)}`);
    _voucherData = res.data;
    const disc = _voucherData.type === 'discount_pct'
      ? `${_voucherData.value}% de desconto`
      : `€${Number(_voucherData.value).toFixed(2)} de desconto`;
    statusEl.style.background = '#f0faf4';
    statusEl.style.color = '#2d6a4f';
    statusEl.textContent = `✓ ${_voucherData.description ? _voucherData.description + ' · ' : ''}${disc}`;
    recalc();
  } catch (err) {
    _voucherData = null;
    statusEl.style.background = '#fef0f0';
    statusEl.style.color = '#c0392b';
    statusEl.textContent = err.message;
    recalc();
  }
}

let _availTimer = null;
function scheduleAvailabilityFetch() {
  clearTimeout(_availTimer);
  _availTimer = setTimeout(fetchAvailability, 300);
}

function showStepError(msg) {
  const el = $('step-error');
  if (!el) return;
  el.textContent = msg;
  el.style.display = '';
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function clearStepError() {
  const el = $('step-error');
  if (el) el.style.display = 'none';
}

function bindEvents() {
  setupCountrySearch('pb-country', 'pb-country-dropdown', () => {
    updateIDFieldLabels();
    renderExtraGuests();
  });
  setupCountrySearch('pb-id-country', 'pb-id-country-dropdown');
  setupPhoneCodeSearch();
  setupDocTypeSearch('pb-id-type', 'pb-id-type-dropdown');

  ['pb-checkin','pb-checkout','pb-birth'].forEach(id => {
    const input = $(id);
    input.addEventListener('focus', () => openDatePicker(input));
    input.addEventListener('click', () => openDatePicker(input));
    input.addEventListener('input', () => {
      if (input.value.replace(/\D/g, '').length === 8) input.value = ptDate(input.value);
      recalc();
    });
  });
  ['pb-checkin','pb-checkout','pb-adults','pb-children','pb-birth'].forEach(id => $(id).addEventListener('change', () => {
    scheduleAvailabilityFetch();
    renderExtraGuests();
    recalc();
  }));
  $('unit-list').addEventListener('click', (e) => {
    const card = e.target.closest('.unit-card');
    if (!card || card.classList.contains('blocked')) return;
    state.selectedUnitId = card.dataset.unit;
    renderUnits();
    recalc();
  });
  $('pb-voucher')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); applyVoucher(); } });
  $('next-btn').addEventListener('click', nextStep);
  $('prev-btn').addEventListener('click', prevStep);
  document.addEventListener('click', e => {
    const pop = document.querySelector('.date-pop');
    if (pop && !pop.contains(e.target) && !e.target.closest('input')) closeDatePicker();
  });
}

async function fetchAvailability() {
  const ci = iso($('pb-checkin').value);
  const co = iso($('pb-checkout').value);
  if (!ci || !co || nights() <= 0) {
    state.availability = [];
    renderUnits();
    return;
  }
  const guests = totalGuests();
  const payload = await api(`/api/public/booking/${state.slug}/availability?check_in=${ci}&check_out=${co}&num_guests=${guests}`).catch(() => null);
  state.availability = payload?.data || [];
  if (availabilityFor(state.selectedUnitId) && !availabilityFor(state.selectedUnitId).available) {
    state.selectedUnitId = state.units.find(u => availabilityFor(u.id)?.available)?.id || '';
  }
  renderUnits();
}

function renderExtraGuests() {
  const count = Math.max(1, totalGuests());
  const wrap = $('extra-guests');
  const existing = Array.from(wrap.querySelectorAll('[data-guest-index]')).map((section, idx) => {
    const index = Number(section.dataset.guestIndex);
    return {
      index,
      name: section.querySelector('[data-field="name"]')?.value || '',
      email: section.querySelector('[data-field="email"]')?.value || '',
      phone_code: section.querySelector('[data-field="phone_code"]')?.value || '+351',
      phone: section.querySelector('[data-field="phone"]')?.value || '',
      country: section.querySelector('[data-field="country"]')?.value || 'Portugal',
      birth_date: section.querySelector('[data-field="birth_date"]')?.value || '',
      birth_city: section.querySelector('[data-field="birth_city"]')?.value || '',
      nif: section.querySelector('[data-field="nif"]')?.value || '',
      id_type: section.querySelector('[data-field="id_type"]')?.value || '',
      id_country: section.querySelector('[data-field="id_country"]')?.value || '',
      address: section.querySelector('[data-field="address"]')?.value || '',
      postal_code: section.querySelector('[data-field="postal_code"]')?.value || '',
      city: section.querySelector('[data-field="city"]')?.value || ''
    };
  });

  const parts = [];
  for (let i = 2; i <= count; i++) {
    const prev = existing.find(g => g.index === i) || {};
    const country = prev.country || 'Portugal';
    const isStranger = country && country !== 'Portugal';

    parts.push(`
      <div data-guest-index="${i}" style="border-top: 1px solid var(--line); padding-top: 18px; margin-top: 18px;">
        <h3 style="margin: 0 0 18px; font-size: 18px; color: var(--brand);">Hóspede ${i}</h3>
        <label>
          <span>Nome completo *</span>
          <input data-field="name" required value="${prev.name || ''}" placeholder="Nome completo">
        </label>
        <div class="field-grid two">
          <label>
            <span>Email *</span>
            <input data-field="email" type="email" required value="${prev.email || ''}" placeholder="email@exemplo.com">
          </label>
          <label>
            <span>Telefone *</span>
            <div class="phone-input-group">
              <div class="phone-code-wrap">
                <button type="button" class="phone-code-btn guest-phone-code-btn" data-field="phone_code" data-guest-index="${i}">🇵🇹 +351</button>
                <input type="hidden" data-field="phone_code" value="${prev.phone_code || '+351'}">
              </div>
              <input data-field="phone" type="tel" required value="${prev.phone || ''}" placeholder="912 345 678">
            </div>
          </label>
        </div>
        <div class="field-grid two">
          <label>
            <span>País de residência *</span>
            <div class="country-search">
              <input data-field="country" class="country-input guest-country-input" required value="${country}" placeholder="Portugal" autocomplete="off" data-guest-index="${i}">
              <div class="country-dropdown" style="display: none;"></div>
            </div>
          </label>
          <label>
            <span>Data de nascimento *</span>
            <input class="birth-input guest-birth-input" data-field="birth_date" type="text" inputmode="numeric" required value="${prev.birth_date || ''}" placeholder="dd-mm-aaaa" maxlength="10">
            <small class="rate-hint"></small>
          </label>
        </div>
        <div class="field-grid two">
          <label>
            <span>${isStranger ? 'Local de nascimento *' : 'Local de nascimento'}</span>
            <input data-field="birth_city" ${isStranger ? 'required' : ''} value="${prev.birth_city || ''}" placeholder="Cidade de nascimento">
          </label>
          <label>
            <span>${isStranger ? 'Documento de identidade *' : 'Documento de identidade'}</span>
            <input data-field="nif" ${isStranger ? 'required' : ''} value="${prev.nif || ''}" placeholder="Número ou passaporte">
          </label>
        </div>
        <div class="field-grid two">
          <label>
            <span>${isStranger ? 'Tipo de documento *' : 'Tipo de documento'}</span>
            <div class="doc-type-wrap" style="position: relative;">
              <button type="button" class="doc-type-btn guest-doc-type-btn" data-guest-index="${i}">Selecionar</button>
              <input type="hidden" data-field="id_type" value="${prev.id_type || ''}">
              <div class="doc-type-dropdown" style="display: none;"></div>
            </div>
          </label>
          <label>
            <span>${isStranger ? 'País emissor do documento *' : 'País emissor do documento'}</span>
            <div class="country-search">
              <input data-field="id_country" class="country-input guest-id-country-input" ${isStranger ? 'required' : ''} value="${prev.id_country || ''}" placeholder="País" autocomplete="off" data-guest-index="${i}">
              <div class="country-dropdown" style="display: none;"></div>
            </div>
          </label>
        </div>
        <div class="field-grid two">
          <label>
            <span>Morada</span>
            <input data-field="address" value="${prev.address || ''}" placeholder="Rua, número e complementos">
          </label>
          <label>
            <span>Código postal</span>
            <input data-field="postal_code" value="${prev.postal_code || ''}" placeholder="1000-000">
          </label>
        </div>
        <label>
          <span>Cidade</span>
          <input data-field="city" value="${prev.city || ''}" placeholder="Lisboa">
        </label>
      </div>`);
  }
  wrap.innerHTML = parts.join('');

  // Setup date pickers for all guest birth dates
  wrap.querySelectorAll('.guest-birth-input').forEach(input => {
    input.addEventListener('focus', () => openDatePicker(input));
    input.addEventListener('click', () => openDatePicker(input));
    input.addEventListener('input', () => {
      if (input.value.replace(/\D/g, '').length === 8) input.value = ptDate(input.value);
      recalc();
    });
  });

  // Setup country selectors, phone codes, and doc types for all guests
  wrap.querySelectorAll('[data-guest-index]').forEach(guestSection => {
    const guestIndex = guestSection.dataset.guestIndex;
    const countryInput = guestSection.querySelector('.guest-country-input');
    const idCountryInput = guestSection.querySelector('.guest-id-country-input');
    const phoneCodeBtn = guestSection.querySelector('.guest-phone-code-btn');
    const docTypeBtn = guestSection.querySelector('.guest-doc-type-btn');
    const docTypeInput = guestSection.querySelector('[data-field="id_type"]');
    const docTypeDropdown = guestSection.querySelector('.doc-type-dropdown');

    if (countryInput && idCountryInput) {
      const countryDropdown = countryInput.parentElement.querySelector('.country-dropdown');
      const idCountryDropdown = idCountryInput.parentElement.querySelector('.country-dropdown');

      setupCountrySearch(countryInput, countryDropdown, () => {
        renderExtraGuests();
        recalc();
      });
      setupCountrySearch(idCountryInput, idCountryDropdown);
    }

    if (phoneCodeBtn) {
      setupGuestPhoneCodeSearch(guestIndex);
    }

    if (docTypeBtn && docTypeInput && docTypeDropdown) {
      setupGuestDocTypeSearch(docTypeBtn, docTypeInput, docTypeDropdown);
    }
  });
}

function specialRate(unit, birthDate, index) {
  const ci = iso($('pb-checkin').value) || new Date().toISOString().slice(0, 10);
  const age = ageAt(iso(birthDate), ci);
  if (age === null) return null;
  const included = Math.max(1, Math.min(unit.base_guests_included || 2, unit.max_guests || 2));
  if (index < included) return null;
  if (age < unit.baby_age_limit) return { label: 'Preço de bebé aplicado', price: unit.baby_price || 0 };
  if (age >= unit.baby_age_limit && age < unit.child_age_limit) return { label: 'Preço de criança aplicado', price: unit.child_price || 0 };
  return null;
}

function ageAt(birthIso, refIso) {
  return window.ReservationDates?.ageAtDate(birthIso, refIso) ?? null;
}

function getBirthDates() {
  return [
    iso($('pb-birth').value),
    ...Array.from(document.querySelectorAll('.extra-guest-box [data-field="birth_date"]')).map(input => iso(input.value))
  ].filter(Boolean);
}

function extraCharge(unit, n) {
  return window.ReservationPricing?.getExtraOccupancyCharge(
    unit,
    totalGuests(),
    n,
    getBirthDates(),
    iso($('pb-checkin').value)
  ) || 0;
}

function recalc() {
  const unit = selectedUnit();
  const n = nights();
  const adults = Number($('pb-adults').value) || 1;
  const children = Number($('pb-children').value) || 0;
  const guests = adults + children;
  const isPropertySelected = state.selectedUnitId === 'property' || state.selectedUnitId === state.property?.id;
  const hasDates = !!n;

  $('summary-guests').textContent = children > 0
    ? `${adults} adulto${adults !== 1 ? 's' : ''} · ${children} criança${children !== 1 ? 's' : ''}`
    : `${adults} adulto${adults !== 1 ? 's' : ''}`;
  $('summary-dates').textContent = iso($('pb-checkin').value) && iso($('pb-checkout').value) ? `${ptDate($('pb-checkin').value)} - ${ptDate($('pb-checkout').value)}` : '-';
  $('summary-nights').textContent = n ? `${n} noite${n !== 1 ? 's' : ''}` : '-';

  document.querySelectorAll('.summary-row.muted').forEach(row => row.style.display = hasDates ? '' : 'none');
  const totalRow = document.querySelector('.summary-total');
  if (totalRow) totalRow.style.display = hasDates ? '' : 'none';
  const note = $('summary-dates-note');
  if (note) note.style.display = hasDates ? '' : 'none';

  if (isPropertySelected) {
    $('summary-unit').textContent = state.property?.name || 'Alojamento completo';
    $('summary-media').style.backgroundImage = `url('${state.property?.images?.[0]?.url || ''}')`;
  } else if (unit) {
    $('summary-unit').textContent = unit.name;
    $('summary-media').style.backgroundImage = `url('${unit.cover_image || unit.images?.[0]?.url || ''}')`;
  } else {
    return;
  }

  if (!n) return;

  let totals;
  if (isPropertySelected) {
    const rawTotals = window.ReservationPricing.calculateReservationTotal(state.property, state.services, {
      check_in: iso($('pb-checkin').value),
      check_out: iso($('pb-checkout').value),
      num_guests: guests,
      breakfast_included: false,
      birth_dates: [],
      pricing_periods: state.property?.pricing_periods || []
    });
    totals = {
      ...rawTotals,
      extraOccupancyCost: 0,
      totalAmount: rawTotals.baseAmount + rawTotals.breakfastCost + rawTotals.touristTax
    };
  } else {
    totals = window.ReservationPricing.calculateReservationTotal(unit, state.services, {
      check_in: iso($('pb-checkin').value),
      check_out: iso($('pb-checkout').value),
      num_guests: guests,
      breakfast_included: false,
      birth_dates: getBirthDates(),
      pricing_periods: unit.pricing_periods || []
    });
    updateRateHints(unit);
  }

  const discountAmount = _voucherData ? (
    _voucherData.type === 'discount_pct'
      ? totals.totalAmount * (_voucherData.value / 100)
      : Math.min(_voucherData.value, totals.totalAmount)
  ) : 0;
  const finalTotal = Math.max(0, totals.totalAmount - discountAmount);

  $('summary-base').textContent = fmtCurrency(totals.baseAmount);
  $('summary-extras').textContent = fmtCurrency(totals.extraOccupancyCost);
  $('summary-services').textContent = fmtCurrency(totals.breakfastCost + totals.touristTax);

  const discRow = $('summary-discount-row');
  if (discRow) {
    discRow.style.display = discountAmount > 0 ? '' : 'none';
    if ($('summary-discount')) $('summary-discount').textContent = `−${fmtCurrency(discountAmount)}`;
  }

  $('summary-total').textContent = fmtCurrency(finalTotal);
}

function updateRateHints(unit) {
  const main = specialRate(unit, $('pb-birth').value, 0);
  $('pb-main-rate').textContent = main ? `${main.label} · ${fmtCurrency(main.price)}/noite` : '';
  document.querySelectorAll('.extra-guest-box').forEach((box, idx) => {
    const hint = box.querySelector('.rate-hint');
    const info = specialRate(unit, box.querySelector('[data-field="birth_date"]').value, idx + 1);
    hint.textContent = info ? `${info.label} · ${fmtCurrency(info.price)}/noite` : '';
  });
}

function renderStep() {
  document.querySelectorAll('.form-step').forEach(step => step.classList.toggle('active', Number(step.dataset.step) === state.step));
  document.querySelectorAll('[data-step-dot]').forEach(dot => dot.classList.toggle('active', Number(dot.dataset.stepDot) === state.step));
  $('prev-btn').style.display = state.step > 1 ? '' : 'none';
  $('next-btn').textContent = state.step === 3 ? 'Enviar pedido' : 'Continuar';
}

function nextStep() {
  if (!validateStep()) return;
  if (state.step === 3) return submitReservation();
  state.step++;
  renderStep();
}

function prevStep() {
  if (state.step > 1) {
    state.step--;
    renderStep();
  }
}

function validateStep() {
  clearStepError();
  if (state.step === 1) {
    if (!iso($('pb-checkin').value) || !iso($('pb-checkout').value) || nights() <= 0) { showStepError('Escolha datas válidas.'); return false; }
    if (!state.selectedUnitId) { showStepError('Escolha um alojamento disponível.'); return false; }
  }
  if (state.step === 2) {
    const name = $('pb-name').value.trim();
    const email = $('pb-email').value.trim();
    const phone = $('pb-phone').value.trim();
    const birthDate = iso($('pb-birth').value);
    const country = $('pb-country').value.trim();
    const isStranger = country && country !== 'Portugal';
    const nif = $('pb-nif').value.trim();
    const idType = $('pb-id-type').value.trim();
    const birthCity = $('pb-birth-city').value.trim();
    const idCountry = $('pb-id-country').value.trim();

    if (!name || !email || !phone || !birthDate || !country) {
      showStepError('Preencha todos os campos obrigatórios (*) do hóspede principal.');
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showStepError('Email inválido.');
      return false;
    }
    if (isStranger && (!birthCity || !nif || !idType || !idCountry)) {
      showStepError('Estrangeiros devem indicar local de nascimento, documento de identidade e país emissor.');
      return false;
    }

    const guestSections = Array.from(document.querySelectorAll('[data-guest-index]'));
    for (let i = 0; i < guestSections.length; i++) {
      const section = guestSections[i];
      const idx = Number(section.dataset.guestIndex);
      const guestName = section.querySelector('[data-field="name"]').value.trim();
      const guestEmail = section.querySelector('[data-field="email"]').value.trim();
      const guestPhone = section.querySelector('[data-field="phone"]').value.trim();
      const guestBirth = iso(section.querySelector('[data-field="birth_date"]').value);
      const guestCountry = section.querySelector('[data-field="country"]').value.trim();
      const guestBirthCity = section.querySelector('[data-field="birth_city"]').value.trim();
      const guestNif = section.querySelector('[data-field="nif"]').value.trim();
      const guestIdType = section.querySelector('[data-field="id_type"]').value.trim();
      const guestIdCountry = section.querySelector('[data-field="id_country"]').value.trim();
      const guestIsStranger = guestCountry && guestCountry !== 'Portugal';

      if (!guestName || !guestEmail || !guestPhone || !guestBirth || !guestCountry) {
        showStepError(`Preencha todos os campos obrigatórios (*) do hóspede ${idx}.`);
        return false;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) {
        showStepError(`Email inválido para hóspede ${idx}.`);
        return false;
      }
      if (guestIsStranger && (!guestBirthCity || !guestNif || !guestIdType || !guestIdCountry)) {
        showStepError(`Hóspede ${idx} (estrangeiro) deve indicar local de nascimento, documento de identidade e país emissor.`);
        return false;
      }
    }
  }
  if (state.step === 3 && !$('pb-rgpd').checked) { showStepError('É necessário aceitar o RGPD.'); return false; }
  return true;
}

function collectPayload() {
  const nameParts = $('pb-name').value.trim().split(' ');
  const accommodationId = state.selectedUnitId === state.property?.id ? 'property' : state.selectedUnitId;
  const phoneCode = $('pb-phone-code').value;
  const phone = $('pb-phone').value.trim();

  const payload = {
    accommodation_id: accommodationId,
    check_in: iso($('pb-checkin').value),
    check_out: iso($('pb-checkout').value),
    num_guests: totalGuests(),
    num_adults: Number($('pb-adults').value) || 1,
    num_children: Number($('pb-children').value) || 0,
    breakfast_included: false,
    voucher_code: _voucherData?.code || null,
    arrival_time: $('pb-arrival').value || null,
    notes: $('pb-notes').value.trim() || null,
    rgpd_consent: $('pb-rgpd').checked,
    guest: {
      name: $('pb-name').value.trim(),
      first_name: nameParts[0] || '',
      last_name: nameParts.slice(1).join(' '),
      email: $('pb-email').value.trim(),
      phone: phone ? `${phoneCode} ${phone}` : null,
      country: $('pb-country').value.trim(),
      nationality: $('pb-country').value.trim(),
      birth_date: iso($('pb-birth').value),
      birth_city: $('pb-birth-city').value.trim() || null,
      nif: $('pb-nif').value.trim() || null,
      id_type: $('pb-id-type').value.trim() || null,
      id_country: $('pb-id-country').value.trim() || null,
      address: $('pb-address').value.trim() || null,
      postal_code: $('pb-postal').value.trim() || null,
      city: $('pb-city').value.trim() || null
    },
    guests_data: Array.from(document.querySelectorAll('[data-guest-index]')).map(guestSection => {
      const fullName = guestSection.querySelector('[data-field="name"]').value.trim();
      const parts = fullName.split(' ');
      const guestPhoneCode = guestSection.querySelector('input[data-field="phone_code"]').value;
      const guestPhone = guestSection.querySelector('[data-field="phone"]').value.trim();
      return {
        name: fullName,
        first_name: parts[0] || '',
        last_name: parts.slice(1).join(' '),
        email: guestSection.querySelector('[data-field="email"]').value.trim(),
        phone: guestPhone ? `${guestPhoneCode} ${guestPhone}` : null,
        country: guestSection.querySelector('[data-field="country"]').value.trim(),
        nationality: guestSection.querySelector('[data-field="country"]').value.trim(),
        birth_date: iso(guestSection.querySelector('[data-field="birth_date"]').value),
        birth_city: guestSection.querySelector('[data-field="birth_city"]').value.trim() || null,
        nif: guestSection.querySelector('[data-field="nif"]').value.trim() || null,
        id_type: guestSection.querySelector('[data-field="id_type"]').value.trim() || null,
        id_country: guestSection.querySelector('[data-field="id_country"]').value.trim() || null,
        address: guestSection.querySelector('[data-field="address"]').value.trim() || null,
        postal_code: guestSection.querySelector('[data-field="postal_code"]').value.trim() || null,
        city: guestSection.querySelector('[data-field="city"]').value.trim() || null
      };
    })
  };
  return payload;
}

async function submitReservation() {
  const btn = $('next-btn');
  try {
    const payload = collectPayload();
    AppUI.setButtonLoading(btn, true, 'A processar...');

    const result = await api(`/api/public/booking/${state.slug}/reservations`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    $('success-box').classList.add('show');
    $('success-box').innerHTML = `
      <strong>Pedido enviado com sucesso!</strong><br>
      A reserva ficou pendente de confirmação.<br>
      <small>Referência: ${result.data.id}</small><br>
      <small>Total: ${fmtCurrency(result.data.total_amount)}</small>
    `;
    $('next-btn').style.display = 'none';
  } catch (err) {
    showStepError('Erro ao enviar pedido: ' + err.message);
    AppUI.setButtonLoading(btn, false);
  }
}

function openDatePicker(input) {
  state.dateInput = input;
  const current = iso(input.value);
  state.dateMonth = current ? new Date(`${current}T12:00:00`) : new Date();
  renderDatePicker();
}

function closeDatePicker() {
  document.querySelector('.date-pop')?.remove();
  state.dateInput = null;
}

function shiftMonth(delta) {
  state.dateMonth = new Date(state.dateMonth.getFullYear(), state.dateMonth.getMonth() + delta, 1, 12);
  renderDatePicker();
}

function shiftYear(delta) {
  state.dateMonth = new Date(state.dateMonth.getFullYear() + delta, state.dateMonth.getMonth(), 1, 12);
  renderDatePicker();
}

function chooseDate(day) {
  const d = new Date(state.dateMonth.getFullYear(), state.dateMonth.getMonth(), day, 12);
  const wasCheckin = state.dateInput === $('pb-checkin');
  state.dateInput.value = ptDate(d.toISOString().slice(0, 10));
  state.dateInput.dispatchEvent(new Event('change', { bubbles: true }));
  closeDatePicker();
  recalc();
  if (wasCheckin && !iso($('pb-checkout').value)) {
    state.dateMonth = d;
    setTimeout(() => { state.dateInput = $('pb-checkout'); renderDatePicker(); }, 60);
  }
}

function renderDatePicker() {
  document.querySelector('.date-pop')?.remove();
  const pop = document.createElement('div');
  pop.className = 'date-pop';
  const y = state.dateMonth.getFullYear();
  const m = state.dateMonth.getMonth();
  const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const offset = (new Date(y, m, 1).getDay() + 6) % 7;
  const days = new Date(y, m + 1, 0).getDate();
  const currentYear = new Date().getFullYear();
  const yearStart = currentYear - 20;
  const yearEnd = currentYear + 20;

  let html = '<div class="date-head">';
  html += '<button type="button" onclick="shiftMonth(-12)" title="Ano anterior">«</button>';
  html += '<select id="date-month-select" style="flex:1;padding:8px 12px;border:1px solid rgba(132,52,36,.2);border-radius:12px;font-size:13px;background:#fff;color:var(--ink);cursor:pointer;font-weight:600">';
  html += months.map((mon, i) => `<option value="${i}" ${i === m ? 'selected' : ''}>${mon}</option>`).join('');
  html += '</select>';
  html += '<select id="date-year-select" style="flex:1;padding:8px 12px;border:1px solid rgba(132,52,36,.2);border-radius:12px;font-size:13px;background:#fff;color:var(--ink);cursor:pointer;font-weight:600">';
  for (let yr = yearStart; yr <= yearEnd; yr++) {
    html += `<option value="${yr}" ${yr === y ? 'selected' : ''}>${yr}</option>`;
  }
  html += '</select>';
  html += '<button type="button" onclick="shiftMonth(12)" title="Próximo ano">»</button>';
  html += '</div>';
  html += '<div class="date-week"><span>S</span><span>T</span><span>Q</span><span>Q</span><span>S</span><span>S</span><span>D</span></div><div class="date-grid">';
  for (let i = 0; i < offset; i++) html += '<span></span>';
  for (let d = 1; d <= days; d++) html += `<button type="button" onclick="chooseDate(${d})">${d}</button>`;
  html += '</div>';
  pop.innerHTML = html;

  // Setup month/year selectors
  pop.querySelector('#date-month-select')?.addEventListener('change', (e) => {
    const newMonth = Number(e.target.value);
    if (!isNaN(newMonth)) {
      state.dateMonth = new Date(state.dateMonth.getFullYear(), newMonth, 1, 12);
      renderDatePicker();
    }
  });

  pop.querySelector('#date-year-select')?.addEventListener('change', (e) => {
    const newYear = Number(e.target.value);
    if (!isNaN(newYear) && newYear >= yearStart && newYear <= yearEnd) {
      state.dateMonth = new Date(newYear, state.dateMonth.getMonth(), 1, 12);
      renderDatePicker();
    }
  });

  pop.addEventListener('click', e => e.stopPropagation());
  document.body.appendChild(pop);
  const rect = state.dateInput.getBoundingClientRect();
  pop.style.left = `${Math.min(rect.left, window.innerWidth - 296)}px`;
  pop.style.top = `${rect.bottom + 8}px`;
}

init();
