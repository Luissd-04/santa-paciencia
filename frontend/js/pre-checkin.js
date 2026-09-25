// Estado privado; interface partilhada em AppModules.precheckin.
(() => {
const $ = id => document.getElementById(id);
const token = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '');
let reservationData = null;

const COUNTRIES = [
  { name: 'Portugal', flag: 'PT' }, { name: 'Espanha', flag: 'ES' },
  { name: 'França', flag: 'FR' }, { name: 'Itália', flag: 'IT' },
  { name: 'Alemanha', flag: 'DE' }, { name: 'Bélgica', flag: 'BE' },
  { name: 'Holanda', flag: 'NL' }, { name: 'Reino Unido', flag: 'GB' },
  { name: 'Irlanda', flag: 'IE' }, { name: 'Brasil', flag: 'BR' },
  { name: 'EUA', flag: 'US' }, { name: 'Canadá', flag: 'CA' },
  { name: 'Suíça', flag: 'CH' }, { name: 'Áustria', flag: 'AT' },
  { name: 'Polónia', flag: 'PL' }, { name: 'Ucrânia', flag: 'UA' },
  { name: 'China', flag: 'CN' }, { name: 'Japão', flag: 'JP' },
  { name: 'Índia', flag: 'IN' }, { name: 'Austrália', flag: 'AU' },
  { name: 'África do Sul', flag: 'ZA' }, { name: 'Angola', flag: 'AO' },
  { name: 'Moçambique', flag: 'MZ' }, { name: 'Cabo Verde', flag: 'CV' }
];

function fmtDate(value) {
  if (!value) return '—';
  return new Date(value + 'T12:00:00').toLocaleDateString('pt-PT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function isoDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const match = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : raw;
}

function displayDate(value) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-');
    return `${d}-${m}-${y}`;
  }
  return value;
}

// Bandeira SVG (flag-icons) — o emoji de bandeira não aparece no Windows.
function flagHtml(code) {
  const cc = String(code || '').trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(cc)) return '<span class="flag-fallback">🌐</span>';
  return `<span class="fi fi-${cc}" title="${cc.toUpperCase()}"></span>`;
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || payload.success === false) throw new Error(payload.error || 'Pedido indisponível.');
  return payload;
}

function guestForm(guest, index, numAdults) {
  const isChild = index > 0 && index >= (numAdults ?? 99);
  const label = index === 0
    ? 'Hóspede principal'
    : isChild ? `Hóspede ${index + 1} — criança` : `Hóspede ${index + 1}`;
  return `
    <div class="guest-card" data-guest="${index}" data-is-child="${isChild}" style="border:1px solid rgba(132,52,36,.14);border-radius:14px;padding:16px;margin:14px 0;background:#fff;">
      <div class="step-heading" style="margin-bottom:14px;">
        <span>${label}</span>
        <h2 style="font-size:22px;">${escapeAttr(guest?.name || label)}</h2>
      </div>
      <label>
        <span>Nome completo *</span>
        <input data-field="name" required value="${escapeAttr(guest?.name || '')}" placeholder="Nome completo" autocomplete="off">
      </label>
      ${index === 0 ? `
      <label>
        <span>Email *</span>
        <input data-field="email" type="email" required value="${escapeAttr(guest?.email || '')}" placeholder="email@exemplo.com" autocomplete="off">
      </label>` : ''}
      ${index <= 1 ? `
      <label>
        <span>Telefone</span>
        <input data-field="phone" type="tel" value="${escapeAttr(guest?.phone || '')}" placeholder="+351 900 000 000" autocomplete="off">
      </label>` : ''}
      <div class="field-grid two">
        <label>
          <span>Data de nascimento *</span>
          <input data-field="birth_date" ${isChild ? 'required' : 'data-foreign-required'} class="birth-input pc-birth-input" type="text" inputmode="numeric" maxlength="10" placeholder="dd-mm-aaaa" value="${escapeAttr(displayDate(guest?.birth_date || ''))}" autocomplete="off">
        </label>
        <label>
          <span>Nacionalidade *</span>
          <div class="country-search">
            <input data-field="nationality" class="country-input pc-country-input" required value="${escapeAttr(guest?.nationality || guest?.country || '')}" placeholder="Portugal" autocomplete="off">
            <div class="country-dropdown" style="display:none;"></div>
          </div>
        </label>
      </div>
      <div class="field-grid two">
        <label class="foreign-field">
          <span data-base-label="Local de nascimento">Local de nascimento</span>
          <input data-field="birth_city" data-foreign-required value="${escapeAttr(guest?.birth_city || '')}" placeholder="Cidade de nascimento" autocomplete="off">
        </label>
        <label class="foreign-field">
          <span data-base-label="País de nascimento">País de nascimento</span>
          <div class="country-search">
            <input data-field="birth_country" data-foreign-required class="country-input pc-country-input" value="${escapeAttr(guest?.birth_country || '')}" placeholder="Portugal" autocomplete="off">
            <div class="country-dropdown" style="display:none;"></div>
          </div>
        </label>
      </div>
      <label class="foreign-field">
        <span data-base-label="Morada de residência">Morada de residência</span>
        <input data-field="address" data-foreign-required value="${escapeAttr(guest?.address || '')}" placeholder="Rua, número, andar" autocomplete="off">
      </label>
      <div class="field-grid two">
        <label>
          <span>Código postal</span>
          <input data-field="postal_code" value="${escapeAttr(guest?.postal_code || '')}" placeholder="0000-000" autocomplete="off">
        </label>
        <label class="foreign-field">
          <span data-base-label="Localidade de residência">Localidade de residência</span>
          <input data-field="city" data-foreign-required value="${escapeAttr(guest?.city || '')}" placeholder="Localidade" autocomplete="off">
        </label>
      </div>
      <label class="foreign-field">
        <span data-base-label="País de residência">País de residência</span>
        <div class="country-search">
          <input data-field="residence_country" data-foreign-required class="country-input pc-country-input" value="${escapeAttr(guest?.residence_country || '')}" placeholder="Portugal" autocomplete="off">
          <div class="country-dropdown" style="display:none;"></div>
        </div>
      </label>
      ${isChild ? '' : `
      <div class="field-grid two">
        <label class="foreign-field">
          <span data-base-label="Tipo de documento">Tipo de documento</span>
          <select data-field="document_type" data-foreign-required>
            <option value="">Escolher...</option>
            <option value="passport" ${guest?.document_type === 'passport' ? 'selected' : ''}>Passaporte</option>
            <option value="id_card" ${guest?.document_type === 'id_card' ? 'selected' : ''}>Cartão de cidadão / ID</option>
            <option value="other" ${guest?.document_type === 'other' ? 'selected' : ''}>Outro</option>
          </select>
        </label>
        <label class="foreign-field">
          <span data-base-label="Número do documento">Número do documento</span>
          <input data-field="document_number" data-foreign-required value="${escapeAttr(guest?.document_number || '')}" placeholder="Documento" autocomplete="off">
        </label>
      </div>
      <label class="foreign-field">
        <span data-base-label="País emissor do documento">País emissor do documento</span>
        <div class="country-search">
          <input data-field="document_issuer_country" data-foreign-required class="country-input pc-country-input" value="${escapeAttr(guest?.document_issuer_country || guest?.nationality || guest?.country || '')}" placeholder="Portugal" autocomplete="off">
          <div class="country-dropdown" style="display:none;"></div>
        </div>
      </label>`}
      ${index === 0 ? companyFields(guest) : ''}
    </div>
  `;
}

// Faturação: o NIF pedido é o da empresa quando a reserva é feita em nome dela.
function companyFields(guest) {
  const isCompany = Boolean(guest?.company || guest?.company_nif);
  return `
    <label class="pc-company-toggle" style="display:flex;align-items:center;gap:8px;margin:12px 0 4px;">
      <input type="checkbox" data-field="is_company" ${isCompany ? 'checked' : ''} style="width:auto;margin:0;">
      <span>Esta reserva é em nome de uma empresa</span>
    </label>
    <label data-nif-field="personal" style="${isCompany ? 'display:none;' : ''}">
      <span>NIF</span>
      <input data-field="nif" inputmode="numeric" maxlength="20" value="${escapeAttr(guest?.nif || '')}" placeholder="Número de identificação fiscal" autocomplete="off">
    </label>
    <div class="field-grid two" data-nif-field="company" style="${isCompany ? '' : 'display:none;'}">
      <label>
        <span>Nome da empresa *</span>
        <input data-field="company" ${isCompany ? 'required' : ''} value="${escapeAttr(guest?.company || '')}" placeholder="Nome da empresa" autocomplete="off">
      </label>
      <label>
        <span>NIF da empresa *</span>
        <input data-field="company_nif" inputmode="numeric" maxlength="20" ${isCompany ? 'required' : ''} value="${escapeAttr(guest?.company_nif || '')}" placeholder="NIF da empresa" autocomplete="off">
      </label>
    </div>
  `;
}

function setupCompanyToggle(card) {
  const toggle = card.querySelector('[data-field="is_company"]');
  if (!toggle) return;
  const personal = card.querySelector('[data-nif-field="personal"]');
  const company = card.querySelector('[data-nif-field="company"]');
  const apply = () => {
    const on = toggle.checked;
    personal.style.display = on ? 'none' : '';
    company.style.display = on ? '' : 'none';
    company.querySelectorAll('input').forEach(input => { input.required = on; });
  };
  toggle.addEventListener('change', apply);
  apply();
}

function escapeAttr(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}

function safeMediaUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw, location.origin);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
  } catch { return ''; }
}

function collectGuest(card) {
  const get = field => card.querySelector(`[data-field="${field}"]`)?.value.trim() || '';
  const name = get('name');
  const parts = name.split(/\s+/).filter(Boolean);
  const nationality = get('nationality');
  const isCompany = Boolean(card.querySelector('[data-field="is_company"]')?.checked);
  return {
    name,
    email: get('email'),
    phone: get('phone'),
    first_name: parts[0] || '',
    last_name: parts.slice(1).join(' '),
    birth_date: isoDate(get('birth_date')),
    nationality,
    country: nationality,
    document_type: get('document_type'),
    document_number: get('document_number'),
    document_issuer_country: get('document_issuer_country'),
    birth_city: get('birth_city'),
    birth_country: get('birth_country'),
    address: get('address'),
    postal_code: get('postal_code'),
    city: get('city'),
    residence_country: get('residence_country'),
    nif: isCompany ? '' : get('nif'),
    company: isCompany ? get('company') : '',
    company_nif: isCompany ? get('company_nif') : '',
  };
}

function fuzzyMatch(query, text) {
  const q = String(query || '').trim().toLowerCase();
  const t = String(text || '').toLowerCase();
  if (!q) return 1;
  if (t.startsWith(q)) return 3;
  if (t.includes(q)) return 2;
  return 0;
}

function renderCountryDropdown(search, dropdown) {
  const results = (search.trim()
    ? COUNTRIES.filter(c => fuzzyMatch(search, c.name) > 0)
        .sort((a, b) => fuzzyMatch(search, b.name) - fuzzyMatch(search, a.name))
    : COUNTRIES).slice(0, 12);
  dropdown.innerHTML = results.map(c => `
    <div class="country-dropdown-item" data-country="${escapeAttr(c.name)}">
      <span class="pc-country-code">${flagHtml(c.flag)}</span>
      <span>${c.name}</span>
    </div>`).join('');
}

function updateForeignRequired(card) {
  const nationality = (card.querySelector('[data-field="nationality"]')?.value || '').trim();
  const isForeign = Boolean(nationality && nationality.toLowerCase() !== 'portugal');
  card.querySelectorAll('[data-foreign-required]').forEach(el => {
    el.required = isForeign;
    const span = el.closest('label')?.querySelector('[data-base-label]');
    if (span) span.textContent = span.dataset.baseLabel + (isForeign ? ' *' : '');
  });
}

function setupCountryInput(input) {
  const isNationality = input.dataset.field === 'nationality';
  const dropdown = input.parentElement.querySelector('.country-dropdown');
  if (!dropdown) return;
  renderCountryDropdown(input.value, dropdown);
  input.addEventListener('focus', () => {
    renderCountryDropdown(input.value, dropdown);
    dropdown.style.display = 'block';
  });
  input.addEventListener('input', () => {
    renderCountryDropdown(input.value, dropdown);
    dropdown.style.display = 'block';
    if (isNationality) updateForeignRequired(input.closest('.guest-card'));
  });
  dropdown.addEventListener('mousedown', event => {
    const item = event.target.closest('.country-dropdown-item');
    if (!item) return;
    event.preventDefault();
    input.value = item.dataset.country;
    dropdown.style.display = 'none';
    if (isNationality) updateForeignRequired(input.closest('.guest-card'));
  });
  input.addEventListener('blur', () => setTimeout(() => { dropdown.style.display = 'none'; }, 90));
}

function renderTimePresets(checkInTime) {
  const container = document.getElementById('pc-time-presets');
  if (!container) return;
  const startH = parseInt(String(checkInTime || '').split(':')[0], 10);
  const officialH = isNaN(startH) ? 15 : startH;
  // As sugestões começam antes da hora oficial de check-in: há quem chegue mais
  // cedo (deixar bagagem, por exemplo) e precise de indicar essa hora.
  const from = Math.min(8, officialH);
  const times = Array.from({ length: 23 - from + 1 }, (_, i) => `${String(i + from).padStart(2, '0')}:00`);
  container.innerHTML = times.map(t => {
    const official = parseInt(t, 10) === officialH;
    return `<button type="button" data-time="${t}"${official ? ' title="Hora de check-in do alojamento"' : ''}>${t}</button>`;
  }).join('');
  container.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById('pc-arrival-time');
      if (input) { input.value = btn.dataset.time; input.focus(); }
    });
  });
}

function setupBirthInput(input) {
  const open = () => window.AppDatePicker?.open(input, { isBirthDate: true });
  input.addEventListener('focus', open);
  input.addEventListener('click', open);
}

function normalizeTimeInput(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  let hours = Math.min(23, Number(digits.slice(0, 2)) || 0);
  let mins = Math.min(59, Number(digits.slice(2, 4).padEnd(2, '0')) || 0);
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function setupArrivalTime() {
  const input = $('pc-arrival-time');
  input.addEventListener('input', () => {
    const raw = input.value;
    const digits = raw.replace(/\D/g, '');
    input.value = digits.length >= 3 ? normalizeTimeInput(raw) : digits;
  });
  input.addEventListener('blur', () => { input.value = normalizeTimeInput(input.value); });
}

function render(data) {
  reservationData = data;
  const r = data.reservation;
  $('pc-reservation-ref').textContent = r.id;
  $('pc-stay').textContent = `${r.accommodation_name} · ${fmtDate(r.check_in)} a ${fmtDate(r.check_out)}`;
  $('pc-accommodation').textContent = r.accommodation_name;
  $('pc-checkin').textContent = fmtDate(r.check_in);
  $('pc-checkout').textContent = fmtDate(r.check_out);
  $('pc-guest-count').textContent = `${r.num_guests} hóspede${Number(r.num_guests) !== 1 ? 's' : ''}`;
  const image = safeMediaUrl(r.cover_image || r.images?.[0] || '');
  if (image) {
    $('pc-bg').style.backgroundImage = `url(${JSON.stringify(image)})`;
    $('pc-summary-photo').style.backgroundImage = `url(${JSON.stringify(image)})`;
  }
  $('pc-arrival-time').value = normalizeTimeInput(r.arrival_time || '');

  const guests = [data.guest, ...(data.guests_data || [])];
  while (guests.length < Number(r.num_guests || 1)) guests.push({});
  const numAdults = Number(r.num_adults || r.num_guests || 1);
  $('pc-guests').innerHTML = guests.slice(0, Number(r.num_guests || 1)).map((g, i) => guestForm(g, i, numAdults)).join('');
  document.querySelectorAll('.pc-country-input').forEach(setupCountryInput);
  document.querySelectorAll('.pc-birth-input').forEach(setupBirthInput);
  document.querySelectorAll('.guest-card').forEach(card => {
    updateForeignRequired(card);
    setupCompanyToggle(card);
  });
  renderTimePresets(r.checkin_time);

  if (r.precheckin_submitted_at) {
    $('pc-success').classList.add('show');
    $('pc-success').innerHTML = '<strong>Pré check-in já submetido.</strong><br>Para corrigir algum dado, contacte diretamente o alojamento.';
    $('pc-submit').disabled = true;
  }
}

function showError(message) {
  const box = $('pc-error');
  box.textContent = message;
  box.style.display = '';
}

async function load() {
  try {
    const payload = await api(`/api/public/pre-checkin/${token}`);
    render(payload.data);
  } catch (err) {
    showError(err.message);
    $('pc-submit').disabled = true;
  }
}

$('precheckin-form').addEventListener('submit', async event => {
  event.preventDefault();
  $('pc-error').style.display = 'none';
  const btn = $('pc-submit');
  btn.disabled = true;
  btn.textContent = 'A enviar...';
  try {
    const cards = Array.from(document.querySelectorAll('[data-guest]'));
    const guests = cards.map(collectGuest);
    await api(`/api/public/pre-checkin/${token}`, {
      method: 'POST',
      body: JSON.stringify({
        arrival_time: $('pc-arrival-time').value,
        rgpd_consent: $('pc-rgpd').checked,
        guest: guests[0],
        guests_data: guests.slice(1),
      }),
    });
    $('pc-success').classList.add('show');
    $('pc-success').innerHTML = '<strong>Pré check-in enviado com sucesso!</strong><br>Obrigado. A reserva fica agora a aguardar pagamento.';
    btn.textContent = 'Enviado';
  } catch (err) {
    showError(err.message);
    btn.disabled = false;
    btn.textContent = 'Enviar pré check-in';
  }
});

setupArrivalTime();
load();

})();
