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

function flagEmoji(code) {
  return String(code || '')
    .toUpperCase()
    .replace(/./g, char => String.fromCodePoint(127397 + char.charCodeAt(0)));
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
        <h2 style="font-size:22px;">${guest?.name || label}</h2>
      </div>
      <label>
        <span>Nome completo *</span>
        <input data-field="name" required value="${escapeAttr(guest?.name || '')}" placeholder="Nome completo">
      </label>
      <div class="field-grid two">
        <label>
          <span>Data de nascimento *</span>
          <input data-field="birth_date" ${isChild ? 'required' : 'data-foreign-required'} class="birth-input pc-birth-input" type="text" inputmode="numeric" maxlength="10" placeholder="dd-mm-aaaa" value="${escapeAttr(displayDate(guest?.birth_date || ''))}">
        </label>
        <label>
          <span>Nacionalidade *</span>
          <div class="country-search">
            <input data-field="nationality" class="country-input pc-country-input" required value="${escapeAttr(guest?.nationality || guest?.country || '')}" placeholder="Portugal" autocomplete="off">
            <div class="country-dropdown" style="display:none;"></div>
          </div>
        </label>
      </div>
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
          <input data-field="document_number" data-foreign-required value="${escapeAttr(guest?.document_number || '')}" placeholder="Documento">
        </label>
      </div>
      <label class="foreign-field">
        <span data-base-label="País emissor do documento">País emissor do documento</span>
        <div class="country-search">
          <input data-field="document_issuer_country" data-foreign-required class="country-input pc-country-input" value="${escapeAttr(guest?.document_issuer_country || guest?.nationality || guest?.country || '')}" placeholder="Portugal" autocomplete="off">
          <div class="country-dropdown" style="display:none;"></div>
        </div>
      </label>`}
    </div>
  `;
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

function collectGuest(card) {
  const get = field => card.querySelector(`[data-field="${field}"]`)?.value.trim() || '';
  const name = get('name');
  const parts = name.split(/\s+/).filter(Boolean);
  const nationality = get('nationality');
  return {
    name,
    first_name: parts[0] || '',
    last_name: parts.slice(1).join(' '),
    birth_date: isoDate(get('birth_date')),
    nationality,
    country: nationality,
    document_type: get('document_type'),
    document_number: get('document_number'),
    document_issuer_country: get('document_issuer_country'),
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
      <span class="pc-country-code">${flagEmoji(c.flag)}</span>
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
  const from = isNaN(startH) ? 15 : startH;
  const times = Array.from({ length: 23 - from + 1 }, (_, i) => `${String(i + from).padStart(2, '0')}:00`);
  container.innerHTML = times.map(t => `<button type="button" data-time="${t}">${t}</button>`).join('');
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
  const image = r.cover_image || r.images?.[0] || '';
  if (image) {
    $('pc-bg').style.backgroundImage = `url("${image}")`;
    $('pc-summary-photo').style.backgroundImage = `url("${image}")`;
  }
  $('pc-arrival-time').value = normalizeTimeInput(r.arrival_time || '');

  const guests = [data.guest, ...(data.guests_data || [])];
  while (guests.length < Number(r.num_guests || 1)) guests.push({});
  const numAdults = Number(r.num_adults || r.num_guests || 1);
  $('pc-guests').innerHTML = guests.slice(0, Number(r.num_guests || 1)).map((g, i) => guestForm(g, i, numAdults)).join('');
  document.querySelectorAll('.pc-country-input').forEach(setupCountryInput);
  document.querySelectorAll('.pc-birth-input').forEach(setupBirthInput);
  document.querySelectorAll('.guest-card').forEach(updateForeignRequired);
  renderTimePresets(r.checkin_time);

  if (r.precheckin_submitted_at) {
    $('pc-success').classList.add('show');
    $('pc-success').innerHTML = '<strong>Pré check-in já submetido.</strong><br>Pode reenviar se precisar de corrigir algum dado.';
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
