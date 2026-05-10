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
  { name: 'Portugal', code: '+351', flag: '🇵🇹' },
  { name: 'Espanha', code: '+34', flag: '🇪🇸' },
  { name: 'França', code: '+33', flag: '🇫🇷' },
  { name: 'Itália', code: '+39', flag: '🇮🇹' },
  { name: 'Alemanha', code: '+49', flag: '🇩🇪' },
  { name: 'Bélgica', code: '+32', flag: '🇧🇪' },
  { name: 'Holanda', code: '+31', flag: '🇳🇱' },
  { name: 'Polónia', code: '+48', flag: '🇵🇱' },
  { name: 'Suíça', code: '+41', flag: '🇨🇭' },
  { name: 'Áustria', code: '+43', flag: '🇦🇹' },
  { name: 'Brasil', code: '+55', flag: '🇧🇷' },
  { name: 'Angola', code: '+244', flag: '🇦🇴' },
  { name: 'Moçambique', code: '+258', flag: '🇲🇿' },
  { name: 'Cabo Verde', code: '+238', flag: '🇨🇻' },
  { name: 'Timor-Leste', code: '+670', flag: '🇹🇱' },
  { name: 'Guiné Bissau', code: '+245', flag: '🇬🇼' },
  { name: 'São Tomé e Príncipe', code: '+239', flag: '🇸🇹' },
  { name: 'Reino Unido', code: '+44', flag: '🇬🇧' },
  { name: 'Irlanda', code: '+353', flag: '🇮🇪' },
  { name: 'Grécia', code: '+30', flag: '🇬🇷' },
  { name: 'Suécia', code: '+46', flag: '🇸🇪' },
  { name: 'Noruega', code: '+47', flag: '🇳🇴' },
  { name: 'Dinamarca', code: '+45', flag: '🇩🇰' },
  { name: 'Finlândia', code: '+358', flag: '🇫🇮' },
  { name: 'EUA', code: '+1', flag: '🇺🇸' },
  { name: 'Canadá', code: '+1', flag: '🇨🇦' },
  { name: 'México', code: '+52', flag: '🇲🇽' },
  { name: 'Argentina', code: '+54', flag: '🇦🇷' },
  { name: 'Chile', code: '+56', flag: '🇨🇱' },
  { name: 'Colômbia', code: '+57', flag: '🇨🇴' },
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
  const raw = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const pt = raw.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (pt) return `${pt[3]}-${pt[2]}-${pt[1]}`;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 8) return `${digits.slice(4)}-${digits.slice(2,4)}-${digits.slice(0,2)}`;
  return '';
}

function ptDate(value) {
  const v = iso(value);
  if (!v) return value || '';
  const [y, m, d] = v.split('-');
  return `${d}-${m}-${y}`;
}

function fmtCurrency(value) {
  return `€${Number(value || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function nights() {
  const ci = iso($('pb-checkin').value);
  const co = iso($('pb-checkout').value);
  if (!ci || !co) return 0;
  return Math.max(0, Math.round((new Date(`${co}T12:00:00`) - new Date(`${ci}T12:00:00`)) / 86400000));
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
  $('property-location').textContent = [p.city, p.region, p.country].filter(Boolean).join(' · ') || 'Reserva online';
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
  const nifLabel = $('pb-nif-label');

  if (isStranger) {
    nifLabel.textContent = 'Documento de identidade *';
    $('pb-nif').required = true;
  } else {
    nifLabel.textContent = 'NIF';
    $('pb-nif').required = false;
  }
}

function setupCountrySearch(inputId, dropdownId) {
  const input = $(inputId);
  const dropdown = $(dropdownId);

  input.addEventListener('focus', () => {
    renderCountryDropdown(input.value, dropdown);
    dropdown.style.display = 'block';
  });

  input.addEventListener('input', () => {
    renderCountryDropdown(input.value, dropdown);
    if (input.value.trim()) dropdown.style.display = 'block';
  });

  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target) && e.target !== input) {
      dropdown.style.display = 'none';
    }
  });
}

function renderCountryDropdown(search, dropdown) {
  const results = search.trim()
    ? COUNTRIES.filter(c => fuzzyMatch(search, c.name) > 0)
        .sort((a, b) => fuzzyMatch(search, b.name) - fuzzyMatch(search, a.name))
        .slice(0, 10)
    : COUNTRIES;

  dropdown.innerHTML = results.map(country => `
    <div class="country-dropdown-item" data-country="${country.name}" data-code="${country.code}">
      <span>${country.flag}</span>
      <span>${country.name}</span>
      <span style="color: #999; margin-left: auto;">${country.code}</span>
    </div>
  `).join('');

  dropdown.querySelectorAll('.country-dropdown-item').forEach(item => {
    item.addEventListener('click', () => {
      const countryName = item.dataset.country;
      const input = dropdown.previousElementSibling.querySelector('.country-input');
      input.value = countryName;
      dropdown.style.display = 'none';

      if (input.id === 'pb-country') {
        updateIDFieldLabels();
        setupPhoneCode(countryName);
        renderExtraGuests();
      }
    });
  });
}

function setupPhoneCode(country) {
  const countryData = COUNTRIES.find(c => c.name === country);
  if (countryData) {
    $('pb-phone-code').value = countryData.code;
    $('pb-phone-code').innerHTML = `<option value="${countryData.code}">${countryData.flag} ${countryData.code} ${country}</option>`;
  }
}

function bindEvents() {
  setupCountrySearch('pb-country', 'pb-country-dropdown');
  setupCountrySearch('pb-id-country', 'pb-id-country-dropdown');

  ['pb-checkin','pb-checkout','pb-birth'].forEach(id => {
    const input = $(id);
    input.addEventListener('focus', () => openDatePicker(input));
    input.addEventListener('click', () => openDatePicker(input));
    input.addEventListener('input', () => {
      if (input.value.replace(/\D/g, '').length === 8) input.value = ptDate(input.value);
      recalc();
    });
  });
  ['pb-checkin','pb-checkout','pb-guests','pb-breakfast','pb-birth'].forEach(id => $(id).addEventListener('change', () => {
    fetchAvailability();
    renderExtraGuests();
    recalc();
  }));
  const breakfastSvc = state.services.find(s => s.id === 'breakfast');
  if (breakfastSvc && breakfastSvc.active === false) {
    const breakfastSelect = $('pb-breakfast');
    if (breakfastSelect) {
      breakfastSelect.disabled = true;
      breakfastSelect.value = 'false';
      breakfastSelect.parentElement.style.opacity = '0.6';
      const hint = document.createElement('small');
      hint.textContent = 'Temporariamente sem serviço de pequeno-almoço';
      hint.style.display = 'block';
      hint.style.color = '#999';
      hint.style.marginTop = '4px';
      breakfastSelect.parentElement.appendChild(hint);
    }
  }
  $('unit-list').addEventListener('click', (e) => {
    const card = e.target.closest('.unit-card');
    if (!card || card.classList.contains('blocked')) return;
    state.selectedUnitId = card.dataset.unit;
    renderUnits();
    recalc();
  });
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
  const guests = Number($('pb-guests').value) || 1;
  const payload = await api(`/api/public/booking/${state.slug}/availability?check_in=${ci}&check_out=${co}&num_guests=${guests}`).catch(() => null);
  state.availability = payload?.data || [];
  if (availabilityFor(state.selectedUnitId) && !availabilityFor(state.selectedUnitId).available) {
    state.selectedUnitId = state.units.find(u => availabilityFor(u.id)?.available)?.id || '';
  }
  renderUnits();
}

function renderExtraGuests() {
  const count = Math.max(1, Number($('pb-guests').value) || 1);
  const wrap = $('extra-guests');
  const existing = Array.from(wrap.querySelectorAll('.extra-guest-box')).map(box => ({
    name: box.querySelector('[data-field="name"]')?.value || '',
    country: box.querySelector('[data-field="country"]')?.value || '',
    birth_date: box.querySelector('[data-field="birth_date"]')?.value || '',
    nif: box.querySelector('[data-field="nif"]')?.value || ''
  }));
  wrap.innerHTML = '';
  for (let i = 2; i <= count; i++) {
    const prev = existing[i - 2] || {};
    const country = prev.country || 'Portugal';
    const isStranger = country !== 'Portugal';
    wrap.innerHTML += `
      <div class="extra-guest-box">
        <h4>Hóspede ${i}</h4>
        <label><span>Nome completo *</span><input data-field="name" required value="${prev.name}" placeholder="Nome completo"></label>
        <div class="field-grid two">
          <label><span>País *</span><input data-field="country" required value="${country}"></label>
          <label><span>Data de nascimento *</span><input class="birth-input" data-field="birth_date" required value="${prev.birth_date}" inputmode="numeric" maxlength="10" placeholder="dd-mm-aaaa"><small class="rate-hint"></small></label>
        </div>
        <div class="field-grid two">
          <label><span>${isStranger ? 'Documento de identidade *' : 'Documento de identidade'}</span><input data-field="nif" ${isStranger ? 'required' : ''} value="${prev.nif}" placeholder="Número ou passaporte"></label>
          <label><span>${isStranger ? 'Tipo de documento *' : 'Tipo de documento'}</span><select data-field="id_type" ${isStranger ? 'required' : ''}><option value="">Selecionar</option><option value="cc">Cartão de Cidadão</option><option value="passport">Passaporte</option><option value="other">Outro</option></select></label>
        </div>
      </div>`;
  }
  wrap.querySelectorAll('.birth-input').forEach(input => {
    input.addEventListener('focus', () => openDatePicker(input));
    input.addEventListener('click', () => openDatePicker(input));
    input.addEventListener('input', () => {
      if (input.value.replace(/\D/g, '').length === 8) input.value = ptDate(input.value);
      recalc();
    });
  });
  wrap.querySelectorAll('[data-field="country"]').forEach(input => {
    input.addEventListener('change', () => renderExtraGuests());
  });
}

function specialRate(unit, birthDate, index) {
  const ci = iso($('pb-checkin').value) || new Date().toISOString().slice(0, 10);
  const age = ageAt(iso(birthDate), ci);
  if (age === null) return null;
  const included = Math.max(1, Math.min(unit.base_guests_included || 2, unit.max_guests || 2));
  const applied = index >= included;
  if (age < unit.baby_age_limit) return { label: `Preço de bebé aplicado${applied ? '' : ' se for hóspede adicional'}`, price: unit.baby_price || 0, applied };
  if (age >= unit.baby_age_limit && age < unit.child_age_limit) return { label: `Preço de criança aplicado${applied ? '' : ' se for hóspede adicional'}`, price: unit.child_price || 0, applied };
  return null;
}

function ageAt(birthIso, refIso) {
  if (!birthIso || !refIso) return null;
  const birth = new Date(`${birthIso}T12:00:00`);
  const ref = new Date(`${refIso}T12:00:00`);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(ref.getTime())) return null;
  let age = ref.getFullYear() - birth.getFullYear();
  const m = ref.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < birth.getDate())) age--;
  return age;
}

function getBirthDates() {
  return [
    iso($('pb-birth').value),
    ...Array.from(document.querySelectorAll('.extra-guest-box [data-field="birth_date"]')).map(input => iso(input.value))
  ].filter(Boolean);
}

function extraCharge(unit, n) {
  const count = Math.max(1, Number($('pb-guests').value) || 1);
  const included = Math.max(1, Math.min(unit.base_guests_included || 2, unit.max_guests || 2));
  let remaining = Math.max(0, count - included);
  if (!remaining) return 0;
  const special = getBirthDates().slice(included).map(d => specialRate(unit, d, included)).filter(Boolean).slice(0, remaining);
  let total = special.reduce((sum, s) => sum + s.price * n, 0);
  remaining -= special.length;
  for (const option of unit.extra_occupancy_options || []) {
    if (remaining <= 0) break;
    const covered = Math.min(remaining, Number(option.capacity) || 0);
    remaining -= covered;
    if (option.charge_type === 'per_bed_night') total += (Number(option.price) || 0) * n;
    else total += (Number(option.price) || 0) * covered * n;
  }
  return total;
}

function recalc() {
  const unit = selectedUnit();
  const n = nights();
  const guests = Number($('pb-guests').value) || 1;
  $('summary-guests').textContent = guests;
  $('summary-dates').textContent = iso($('pb-checkin').value) && iso($('pb-checkout').value) ? `${ptDate($('pb-checkin').value)} - ${ptDate($('pb-checkout').value)}` : '-';
  $('summary-nights').textContent = n ? `${n} noite${n !== 1 ? 's' : ''}` : '-';

  if (state.selectedUnitId === state.property?.id) {
    $('summary-unit').textContent = state.property?.name || 'Alojamento completo';
    $('summary-media').style.backgroundImage = `url('${state.property?.images?.[0]?.url || ''}')`;
  } else if (unit) {
    $('summary-unit').textContent = unit.name;
    $('summary-media').style.backgroundImage = `url('${unit.cover_image || unit.images?.[0]?.url || ''}')`;
  } else {
    return;
  }

  if (!n) {
    $('summary-base').textContent = '-';
    $('summary-extras').textContent = '-';
    $('summary-services').textContent = '-';
    $('summary-total').textContent = '-';
    return;
  }

  const breakfastSvc = state.services.find(s => s.id === 'breakfast');
  const taxSvc = state.services.find(s => s.id === 'tourist_tax');
  const breakfast = $('pb-breakfast').value === 'true' ? (Number(breakfastSvc?.value) || 19) * guests * n : 0;
  const tax = (taxSvc?.active !== false) ? (Number(taxSvc?.value) || 3) * guests * n : 0;

  let base, extras;
  if (state.selectedUnitId === state.property?.id) {
    base = (state.property?.price_per_night || 0) * n;
    extras = 0;
  } else {
    base = (unit?.price_per_night || 0) * n;
    extras = extraCharge(unit, n);
    updateRateHints(unit);
  }

  $('summary-base').textContent = fmtCurrency(base);
  $('summary-extras').textContent = fmtCurrency(extras);
  $('summary-services').textContent = fmtCurrency(breakfast + tax);
  $('summary-total').textContent = fmtCurrency(base + extras + breakfast + tax);
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
  if (state.step === 1) {
    if (!iso($('pb-checkin').value) || !iso($('pb-checkout').value) || nights() <= 0) return alert('Escolha datas válidas.'), false;
    if (!state.selectedUnitId) return alert('Escolha um alojamento disponível.'), false;
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

    if (!name || !email || !phone || !birthDate || !country) {
      return alert('Preencha todos os campos obrigatórios (*).'), false;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return alert('Email inválido.'), false;
    }

    if (isStranger && (!nif || !idType)) {
      return alert('Estrangeiros devem indicar documento de identidade.'), false;
    }

    const guests = Number($('pb-guests').value) || 1;
    const guestBoxes = Array.from(document.querySelectorAll('.extra-guest-box'));
    if (guestBoxes.length > 0) {
      for (let i = 0; i < guestBoxes.length; i++) {
        const box = guestBoxes[i];
        const guestName = box.querySelector('[data-field="name"]').value.trim();
        const guestBirth = iso(box.querySelector('[data-field="birth_date"]').value);
        const guestCountry = box.querySelector('[data-field="country"]').value.trim();
        const guestNif = box.querySelector('[data-field="nif"]').value.trim();
        const guestIdType = box.querySelector('[data-field="id_type"]').value.trim();
        const guestIsStranger = guestCountry && guestCountry !== 'Portugal';

        if (!guestName || !guestBirth || !guestCountry) {
          return alert(`Preencha nome, país e data de nascimento do hóspede ${i + 2}.`), false;
        }

        if (guestIsStranger && (!guestNif || !guestIdType)) {
          return alert(`Hóspede ${i + 2} (estrangeiro) deve indicar documento de identidade.`), false;
        }
      }
    }
  }
  if (state.step === 3 && !$('pb-rgpd').checked) return alert('É necessário aceitar o RGPD.'), false;
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
    num_guests: Number($('pb-guests').value) || 1,
    breakfast_included: $('pb-breakfast').value === 'true',
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
    guests_data: Array.from(document.querySelectorAll('.extra-guest-box')).map(box => {
      const fullName = box.querySelector('[data-field="name"]').value.trim();
      const parts = fullName.split(' ');
      return {
        name: fullName,
        first_name: parts[0] || '',
        last_name: parts.slice(1).join(' '),
        country: box.querySelector('[data-field="country"]').value.trim(),
        nationality: box.querySelector('[data-field="country"]').value.trim(),
        birth_date: iso(box.querySelector('[data-field="birth_date"]').value),
        nif: box.querySelector('[data-field="nif"]').value.trim() || null,
        id_type: box.querySelector('[data-field="id_type"]').value.trim() || null
      };
    })
  };
  return payload;
}

async function submitReservation() {
  try {
    const payload = collectPayload();
    $('next-btn').disabled = true;
    $('next-btn').textContent = 'A processar...';

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
    alert('Erro ao enviar pedido: ' + err.message);
    $('next-btn').disabled = false;
    $('next-btn').textContent = 'Enviar pedido';
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
  state.dateInput.value = ptDate(d.toISOString().slice(0, 10));
  state.dateInput.dispatchEvent(new Event('change', { bubbles: true }));
  closeDatePicker();
  fetchAvailability();
  recalc();
}

function renderDatePicker() {
  document.querySelector('.date-pop')?.remove();
  const pop = document.createElement('div');
  pop.className = 'date-pop';
  const y = state.dateMonth.getFullYear();
  const m = state.dateMonth.getMonth();
  const label = state.dateMonth.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });
  const offset = (new Date(y, m, 1).getDay() + 6) % 7;
  const days = new Date(y, m + 1, 0).getDate();
  let html = '<div class="date-head"><button onclick="shiftYear(-1)">«</button><button onclick="shiftMonth(-1)">‹</button><strong>' + label + '</strong><button onclick="shiftMonth(1)">›</button><button onclick="shiftYear(1)">»</button></div>';
  html += '<div class="date-week"><span>S</span><span>T</span><span>Q</span><span>Q</span><span>S</span><span>S</span><span>D</span></div><div class="date-grid">';
  for (let i = 0; i < offset; i++) html += '<span></span>';
  for (let d = 1; d <= days; d++) html += `<button type="button" onclick="chooseDate(${d})">${d}</button>`;
  html += '</div>';
  pop.innerHTML = html;
  pop.addEventListener('click', e => e.stopPropagation());
  document.body.appendChild(pop);
  const rect = state.dateInput.getBoundingClientRect();
  pop.style.left = `${Math.min(rect.left, window.innerWidth - 296)}px`;
  pop.style.top = `${rect.bottom + 8}px`;
}

init();
