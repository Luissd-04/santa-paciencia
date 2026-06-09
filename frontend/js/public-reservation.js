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
  const rgpdBox = $('rgpd-text-box');
  if (rgpdBox) {
    const text = p.rgpd_text || 'Os seus dados pessoais são recolhidos e tratados para a gestão da sua reserva e cumprimento das obrigações legais aplicáveis ao alojamento local em Portugal. Os dados são conservados pelo período legalmente exigido. Tem direito de acesso, retificação e apagamento dos seus dados por contacto direto com o estabelecimento.';
    rgpdBox.textContent = text;
    rgpdBox.style.display = '';
  }
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

  const n = nights();
  const hasDates = n > 0;
  const checkIn = iso($('pb-checkin').value);
  const checkOut = iso($('pb-checkout').value);
  const guests = totalGuests();

  function unitPriceHtml(unit, pricingPeriods) {
    if (!hasDates || !window.ReservationPricing) return '';
    const totals = window.ReservationPricing.calculateReservationTotal(unit, [], {
      check_in: checkIn,
      check_out: checkOut,
      num_guests: guests,
      pricing_periods: pricingPeriods || [],
      birth_dates: []
    });
    if (!totals || !totals.baseAmount) return '';
    const avgPerNight = totals.baseAmount / n;
    const extraHtml = totals.extraOccupancyCost > 0
      ? `<div class="unit-price-extra">+ ${fmtCurrency(totals.extraOccupancyCost)} ocupação extra</div>`
      : '';
    return `<div class="unit-price">${fmtCurrency(avgPerNight)}<small>/ noite</small><div class="unit-price-total">${fmtCurrency(totals.baseAmount + totals.extraOccupancyCost)} total</div>${extraHtml}</div>`;
  }

  const propertyPrice = Number(state.property?.price_per_night) || 0;
  const priceHtml = propertyPrice > 0 ? unitPriceHtml(state.property, state.property?.pricing_periods) : '';

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

    let descHtml;
    if (av?.over_capacity) {
      descHtml = `<p>Capacidade máxima: ${unit.max_guests} hóspedes</p>`;
    } else if (av?.occupied) {
      descHtml = `<p>Indisponível nas datas selecionadas</p>`;
    } else {
      const baseGuests = Number(unit.base_guests_included) || Number(unit.max_guests) || 1;
      const extraCapacity = Math.max(0, Number(unit.max_guests) - baseGuests);
      const extraOpts = window.ReservationPricing?.normalizeExtraOccupancyOptions(unit) || [];
      const extraPrice = extraOpts[0]?.price || 0;
      const rooms = unit.num_rooms || 1;
      const extraLine = extraCapacity > 0 && extraPrice > 0
        ? `<p class="unit-desc-extra">${extraCapacity} hóspede${extraCapacity !== 1 ? 's' : ''} adiciona${extraCapacity !== 1 ? 'is' : 'l'} · ${fmtCurrency(extraPrice)}/noite</p>`
        : '';
      descHtml = `<p>${baseGuests} hóspede${baseGuests !== 1 ? 's' : ''} · ${rooms} quarto${rooms !== 1 ? 's' : ''}</p>${extraLine}`;
    }

    return `
      <div class="unit-card ${selected ? 'selected' : ''} ${blocked ? 'blocked' : ''}" data-unit="${unit.id}">
        <img src="${unit.cover_image || unit.images?.[0]?.url || ''}" alt="">
        <div>
          <h4>${unit.name}</h4>
          ${descHtml}
        </div>
        ${unitPriceHtml(unit, unit.pricing_periods)}
      </div>`;
  }).join('');

  container.innerHTML = propertyCard + unitCards;
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

function buildPhoneSearchDropdown(dropdown) {
  dropdown.innerHTML = `
    <div style="padding:6px 8px 4px;">
      <input class="phone-code-search-input" type="text" placeholder="País ou código..." autocomplete="off"
        style="width:100%;box-sizing:border-box;padding:5px 9px;border:1px solid var(--borda);border-radius:8px;font-size:13px;outline:none;background:var(--bg-card);color:var(--ink);">
    </div>
    <div class="phone-code-results"></div>`;
  const searchInput = dropdown.querySelector('.phone-code-search-input');
  const results = dropdown.querySelector('.phone-code-results');
  function filter(q) {
    const list = q.trim()
      ? PHONE_CODES.filter(c => fuzzyMatch(q, c.code) > 0 || fuzzyMatch(q, c.country) > 0)
          .sort((a, b) =>
            Math.max(fuzzyMatch(q, b.code), fuzzyMatch(q, b.country)) -
            Math.max(fuzzyMatch(q, a.code), fuzzyMatch(q, a.country)))
          .slice(0, 12)
      : PHONE_CODES;
    results.innerHTML = list.map(p => `
      <div class="country-dropdown-item" data-code="${p.code}" data-flag="${p.flag}" data-country="${p.country}">
        <span>${p.flag}</span><span>${p.code}</span>
        <span style="color:#999;margin-left:auto;font-size:12px">${p.country}</span>
      </div>`).join('');
  }
  filter('');
  searchInput.addEventListener('input', () => filter(searchInput.value));
  searchInput.addEventListener('keydown', e => { if (e.key === 'Escape') dropdown.style.display = 'none'; });
  setTimeout(() => searchInput.focus(), 0);
}

function setupPhoneCodeSearch() {
  const btn = $('pb-phone-code-btn');
  const dropdown = $('pb-phone-code-dropdown');

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = dropdown.style.display === 'block';
    dropdown.style.display = open ? 'none' : 'block';
    if (!open) buildPhoneSearchDropdown(dropdown);
  });

  dropdown.addEventListener('mousedown', (e) => {
    const item = e.target.closest('.country-dropdown-item');
    if (!item) return;
    e.preventDefault();
    $('pb-phone-code').value = item.dataset.code;
    btn.textContent = `${item.dataset.flag} ${item.dataset.code}`;
    dropdown.style.display = 'none';
  });

  document.addEventListener('click', (e) => {
    if (!btn.contains(e.target) && !dropdown.contains(e.target)) dropdown.style.display = 'none';
  });
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
  if (!btn || !codeInput) return;
  let finalDropdown = btn.parentElement.querySelector('.country-dropdown');
  if (!finalDropdown) {
    finalDropdown = document.createElement('div');
    finalDropdown.className = 'country-dropdown';
    finalDropdown.style.display = 'none';
    btn.parentElement.appendChild(finalDropdown);
  }
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = finalDropdown.style.display === 'block';
    finalDropdown.style.display = open ? 'none' : 'block';
    if (!open) buildPhoneSearchDropdown(finalDropdown);
  });
  finalDropdown.addEventListener('mousedown', (e) => {
    const item = e.target.closest('.country-dropdown-item');
    if (!item) return;
    e.preventDefault();
    codeInput.value = item.dataset.code;
    btn.textContent = `${item.dataset.flag} ${item.dataset.code}`;
    finalDropdown.style.display = 'none';
  });
  document.addEventListener('click', (e) => {
    if (!btn.contains(e.target) && !finalDropdown.contains(e.target)) finalDropdown.style.display = 'none';
  });
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
    renderExtraGuests();
  });
  setupPhoneCodeSearch();

  const checkinEl = $('pb-checkin');
  const checkoutEl = $('pb-checkout');
  function openCheckin() {
    AppDatePicker.open(checkinEl, {
      onChange: (isoDate) => {
        if (!iso(checkoutEl.value)) {
          setTimeout(() => AppDatePicker.open(checkoutEl, { minDate: isoDate }), 60);
        }
      }
    });
  }
  function openCheckout() {
    AppDatePicker.open(checkoutEl, { minDate: iso(checkinEl.value) || undefined });
  }
  checkinEl.addEventListener('focus', openCheckin);
  checkinEl.addEventListener('click', openCheckin);
  checkinEl.addEventListener('input', () => {
    if (checkinEl.value.replace(/\D/g, '').length === 8) checkinEl.value = ptDate(checkinEl.value);
    recalc();
  });
  checkoutEl.addEventListener('focus', openCheckout);
  checkoutEl.addEventListener('click', openCheckout);
  checkoutEl.addEventListener('input', () => {
    if (checkoutEl.value.replace(/\D/g, '').length === 8) checkoutEl.value = ptDate(checkoutEl.value);
    recalc();
  });
  const birthEl = $('pb-birth');
  birthEl.addEventListener('focus', () => AppDatePicker.open(birthEl, { isBirthDate: true }));
  birthEl.addEventListener('click', () => AppDatePicker.open(birthEl, { isBirthDate: true }));
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
      country: section.querySelector('[data-field="country"]')?.value || '',
      birth_date: section.querySelector('[data-field="birth_date"]')?.value || ''
    };
  });

  const parts = [];
  for (let i = 2; i <= count; i++) {
    const prev = existing.find(g => g.index === i) || {};
    const country = prev.country || '';

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
            <span>Nacionalidade *</span>
            <div class="country-search">
              <input data-field="country" class="country-input guest-country-input" required value="${country}" placeholder="Portugal" autocomplete="off" data-guest-index="${i}">
              <div class="country-dropdown" style="display: none;"></div>
            </div>
          </label>
          <label>
            <span>Data de nascimento</span>
            <input class="birth-input guest-birth-input" data-field="birth_date" type="text" inputmode="numeric" value="${prev.birth_date || ''}" placeholder="dd-mm-aaaa" maxlength="10">
            <small class="rate-hint"></small>
          </label>
        </div>
      </div>`);
  }
  wrap.innerHTML = parts.join('');

  // Setup date pickers for all guest birth dates
  wrap.querySelectorAll('.guest-birth-input').forEach(input => {
    input.addEventListener('focus', () => AppDatePicker.open(input, { isBirthDate: true, onChange: () => recalc() }));
    input.addEventListener('click', () => AppDatePicker.open(input, { isBirthDate: true, onChange: () => recalc() }));
    input.addEventListener('input', () => {
      if (input.value.replace(/\D/g, '').length === 8) input.value = ptDate(input.value);
      recalc();
    });
  });

  // Setup country selectors and phone codes for all guests
  wrap.querySelectorAll('[data-guest-index]').forEach(guestSection => {
    const guestIndex = guestSection.dataset.guestIndex;
    const countryInput = guestSection.querySelector('.guest-country-input');
    const phoneCodeBtn = guestSection.querySelector('.guest-phone-code-btn');

    if (countryInput) {
      const countryDropdown = countryInput.parentElement.querySelector('.country-dropdown');
      setupCountrySearch(countryInput, countryDropdown, () => {
        renderExtraGuests();
        recalc();
      });
    }

    if (phoneCodeBtn) {
      setupGuestPhoneCodeSearch(guestIndex);
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

  document.querySelectorAll('.summary-row.muted:not(#summary-discount-row)').forEach(row => row.style.display = hasDates ? '' : 'none');
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
    const _minN = Number(selectedUnit()?.min_nights || state.property?.min_nights || 1);
    if (nights() < _minN) { showStepError(`A estadia mínima é de ${_minN} noite${_minN !== 1 ? 's' : ''}.`); return false; }
    if (!state.selectedUnitId) { showStepError('Escolha um alojamento disponível.'); return false; }
  }
  if (state.step === 2) {
    const name = $('pb-name').value.trim();
    const email = $('pb-email').value.trim();
    const phone = $('pb-phone').value.trim();
    const country = $('pb-country').value.trim();

    if (!name || !email || !phone || !country) {
      showStepError('Preencha todos os campos obrigatórios (*) do hóspede principal.');
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showStepError('Email inválido.');
      return false;
    }

    const guestSections = Array.from(document.querySelectorAll('[data-guest-index]'));
    for (let i = 0; i < guestSections.length; i++) {
      const section = guestSections[i];
      const idx = Number(section.dataset.guestIndex);
      const guestName = section.querySelector('[data-field="name"]').value.trim();
      const guestEmail = section.querySelector('[data-field="email"]').value.trim();
      const guestPhone = section.querySelector('[data-field="phone"]').value.trim();
      const guestCountry = section.querySelector('[data-field="country"]').value.trim();

      if (!guestName || !guestEmail || !guestPhone || !guestCountry) {
        showStepError(`Preencha todos os campos obrigatórios (*) do hóspede ${idx}.`);
        return false;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) {
        showStepError(`Email inválido para hóspede ${idx}.`);
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
    notes: $('pb-notes').value.trim() || null,
    rgpd_consent: $('pb-rgpd').checked,
    guest: {
      name: $('pb-name').value.trim(),
      first_name: nameParts[0] || '',
      last_name: nameParts.slice(1).join(' '),
      email: $('pb-email').value.trim(),
      phone: phone ? `${phoneCode} ${phone}` : null,
      nationality: $('pb-country').value.trim(),
      birth_date: iso($('pb-birth').value) || null
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
        nationality: guestSection.querySelector('[data-field="country"]').value.trim(),
        birth_date: iso(guestSection.querySelector('[data-field="birth_date"]').value) || null
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


init();
