// Estado privado; interface partilhada em AppModules.precheckin.
(() => {
const $ = id => document.getElementById(id);
const token = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '');
let reservationData = null;
let currentStep = 0;
let steps = [];

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
// ISO 3166-1 alpha-2 para seleção; a API conserva os nomes portugueses
// existentes. A conversão ICAO pertence à exportação do boletim.
const regionNames = new Intl.DisplayNames(['pt-PT'], { type: 'region' });
const countryCodes = 'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ');
for (const code of countryCodes) {
  if (!COUNTRIES.some(country => country.flag === code)) COUNTRIES.push({ flag: code, name: regionNames.of(code) });
}
const fold = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
function resolveCountry(value) {
  const key = fold(value);
  return COUNTRIES.find(c => [c.name, c.flag, regionNames.of(c.flag)].some(name => fold(name) === key));
}

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
  if (!res.ok || payload.success === false) {
    const error = new Error(payload.error || 'Pedido indisponível.');
    error.fieldErrors = payload.fieldErrors;
    throw error;
  }
  return payload;
}

function guestForm(guest, index, numAdults) {
  const isChild = index > 0 && index >= (numAdults ?? 99);
  const label = index === 0
    ? 'Hóspede principal'
    : isChild ? `Hóspede ${index + 1} — criança` : `Hóspede ${index + 1}`;
  return `
    <details class="guest-card" data-guest="${index}" data-is-child="${isChild}" ${index === 0 ? 'open' : ''}>
      <summary><span><small>${label}</small><strong class="pc-guest-name">${escapeAttr(guest?.name || label)}</strong></span><span class="pc-guest-status">Por preencher</span></summary>
      <div class="pc-guest-fields">
      <label>
        <span>Nome completo *</span>
        <input data-field="name" required value="${escapeAttr(guest?.name || '')}" placeholder="Nome completo" autocomplete="off">
      </label>
      ${index === 0 ? `
      <div class="field-grid two">
        <label>
          <span>Email *</span>
          <input data-field="email" type="email" required value="${escapeAttr(guest?.email || '')}" placeholder="email@exemplo.com" autocomplete="email">
        </label>
        <label>
          <span>Telefone</span>
          <input data-field="phone" type="tel" value="${escapeAttr(guest?.phone || '')}" placeholder="+351 900 000 000" autocomplete="tel">
        </label>
      </div>` : ''}
      <div class="field-grid two">
        <label>
          <span data-base-label="Data de nascimento">Data de nascimento${isChild ? ' *' : ''}</span>
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
          <span data-base-label="País de residência">País de residência</span>
          <div class="country-search">
            <input data-field="residence_country" data-foreign-required class="country-input pc-country-input" value="${escapeAttr(guest?.residence_country || '')}" placeholder="Portugal" autocomplete="off">
            <div class="country-dropdown" style="display:none;"></div>
          </div>
        </label>
        <label class="foreign-field">
          <span data-base-label="Tipo de documento">Tipo de documento</span>
          <select data-field="document_type" data-foreign-required>
            <option value="">Escolher...</option>
            ${[['passaporte', 'Passaporte'], ['cc', 'Cartão de cidadão / ID'], ['bi', 'Bilhete de identidade'], ['nie', 'NIE'], ['outro', 'Outro']].map(([value, label]) =>
              `<option value="${value}" ${(({ passport: 'passaporte', id_card: 'cc', other: 'outro' })[guest?.document_type] || guest?.document_type) === value ? 'selected' : ''}>${label}</option>`).join('')}
          </select>
        </label>
      </div>
      <div class="field-grid two">
        <label class="foreign-field">
          <span data-base-label="Número do documento">Número do documento</span>
          <input data-field="document_number" data-foreign-required value="${escapeAttr(guest?.document_number || '')}" placeholder="Documento" autocomplete="off">
        </label>
        <label class="foreign-field">
          <span data-base-label="País emissor do documento">País emissor do documento</span>
          <div class="country-search">
            <input data-field="document_issuer_country" data-foreign-required class="country-input pc-country-input" value="${escapeAttr(guest?.document_issuer_country || guest?.nationality || guest?.country || '')}" placeholder="Portugal" autocomplete="off">
            <div class="country-dropdown" style="display:none;"></div>
          </div>
        </label>
      </div>
      ${index > 0 ? '<button type="button" class="pc-text-button foreign-field" data-copy-residence>Usar país de residência do hóspede principal</button>' : ''}
      <button type="button" class="pc-text-button foreign-field" data-copy-nationality>Usar a nacionalidade como país emissor</button>
      ${index === 0 ? companyFields(guest) : ''}
      ${index > 0 ? '<button type="button" class="secondary-btn" data-complete-guest>Concluir hóspede</button>' : ''}
      </div>
    </details>
  `;
}

// Faturação: o NIF pedido é o da empresa quando a reserva é feita em nome dela.
function companyFields(guest) {
  const isCompany = Boolean(guest?.company || guest?.company_nif);
  return `
    <label class="pc-company-toggle">
      <input type="checkbox" data-field="is_company" ${isCompany ? 'checked' : ''}>
      <span class="pc-company-copy">
        <strong>Esta reserva é em nome de uma empresa</strong>
        <small>Adicionar dados de faturação da empresa</small>
      </span>
      <span class="pc-company-switch" aria-hidden="true"></span>
    </label>
    <label data-nif-field="personal" ${isCompany ? 'hidden' : ''}>
      <span>NIF</span>
      <input data-field="nif" inputmode="numeric" maxlength="20" value="${escapeAttr(guest?.nif || '')}" placeholder="Número de identificação fiscal" autocomplete="off">
    </label>
    <div class="field-grid two pc-company-fields" data-nif-field="company" ${isCompany ? '' : 'hidden'}>
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
    personal.hidden = on;
    company.hidden = !on;
    company.querySelectorAll('input').forEach(input => { input.required = on; });
    updateGuestStatus(card);
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
    residence_country: get('residence_country'),
    is_company: isCompany,
    nif: isCompany ? '' : get('nif'),
    company: isCompany ? get('company') : '',
    company_nif: isCompany ? get('company_nif') : '',
  };
}

function updateForeignRequired(card) {
  const nationality = (card.querySelector('[data-field="nationality"]')?.value || '').trim();
  const isForeign = Boolean(nationality && resolveCountry(nationality)?.flag !== 'PT');
  card.querySelectorAll('.foreign-field').forEach(field => { field.hidden = !isForeign; });
  card.querySelectorAll('[data-foreign-required]').forEach(el => {
    el.required = isForeign;
    if (!isForeign) clearFieldError(el);
    const span = el.closest('label')?.querySelector('[data-base-label]');
    if (span) span.textContent = span.dataset.baseLabel + (isForeign ? ' *' : '');
  });
}

function setupCountryInput(input) {
  const dropdown = input.parentElement.querySelector('.country-dropdown');
  if (!dropdown) return;
  dropdown.id = `${input.id}-options`;
  dropdown.setAttribute('role', 'listbox');
  dropdown.setAttribute('aria-label', input.closest('label').querySelector('span').textContent.replace(' *', ''));
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', dropdown.id);
  input.setAttribute('aria-expanded', 'false');
  let matches = [], active = -1;
  const close = () => {
    dropdown.style.display = 'none';
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  };
  const open = (showAll = false) => {
    const query = showAll && resolveCountry(input.value) ? '' : fold(input.value);
    matches = COUNTRIES.filter(c => [c.name, c.flag, regionNames.of(c.flag)].some(name => fold(name).includes(query)));
    active = -1;
    input.removeAttribute('aria-activedescendant');
    dropdown.innerHTML = matches.length ? matches.map((c, i) => `<div class="country-dropdown-item" role="option" aria-selected="false" id="${dropdown.id}-${i}" data-country-code="${c.flag}">${flagHtml(c.flag)}<span>${escapeAttr(c.name)}</span></div>`).join('') : '<div class="pc-country-empty">Nenhum país encontrado.</div>';
    dropdown.style.display = 'block';
    input.setAttribute('aria-expanded', 'true');
  };
  const commit = country => {
    if (!country) return;
    input.value = country.name;
    input.dataset.countryCode = country.flag;
    close();
    input.dispatchEvent(new Event('change', { bubbles: true }));
    validateField(input);
  };
  const initial = resolveCountry(input.value);
  if (initial) { input.value = initial.name; input.dataset.countryCode = initial.flag; }
  input.addEventListener('focus', () => open(true));
  input.addEventListener('input', () => {
    delete input.dataset.countryCode;
    open();
  });
  input.addEventListener('keydown', event => {
    if (event.key === 'Escape') { close(); event.preventDefault(); }
    if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault();
      if (input.getAttribute('aria-expanded') !== 'true') open();
      if (!matches.length) return;
      active = active === -1
        ? (event.key === 'ArrowDown' ? 0 : matches.length - 1)
        : (active + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length;
      dropdown.querySelectorAll('[role="option"]').forEach((option, i) => option.setAttribute('aria-selected', String(i === active)));
      const option = dropdown.children[active];
      input.setAttribute('aria-activedescendant', option.id);
      option.scrollIntoView({ block: 'nearest' });
    }
    if (event.key === 'Enter' && input.getAttribute('aria-expanded') === 'true') {
      event.preventDefault();
      commit(matches[active] || resolveCountry(input.value) || (matches.length === 1 ? matches[0] : null));
    }
    if (event.key === 'Tab') close();
  });
  dropdown.addEventListener('mousedown', event => event.preventDefault());
  dropdown.addEventListener('click', event => {
    const item = event.target.closest('[data-country-code]');
    if (!item) return;
    commit(COUNTRIES.find(c => c.flag === item.dataset.countryCode));
  });
  input.addEventListener('blur', () => {
    const country = resolveCountry(input.value);
    if (country) { input.value = country.name; input.dataset.countryCode = country.flag; }
    setTimeout(close, 120);
    if (input.dataset.field === 'nationality') updateForeignRequired(input.closest('.guest-card'));
    validateField(input);
    updateGuestStatus(input.closest('.guest-card'));
  });
}

function parseTime(value) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || ''));
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function allCards() { return Array.from(document.querySelectorAll('.guest-card')); }
function fieldMessage(input) {
  // Etapas recolhidas continuam a ser validadas no envio final.
  const label = input.closest('label');
  if (input.disabled || (label?.hidden && input.id !== 'pc-arrival-time') || label?.closest('[data-nif-field][hidden]')) return '';
  const value = input.value.trim();
  if (input.type === 'checkbox') return input.required && !input.checked ? 'Confirme o tratamento dos dados para continuar.' : '';
  if (!value) return input.required ? 'Preencha este campo.' : '';
  if (input.classList.contains('pc-country-input') && !resolveCountry(value)) return 'Escolha um país da lista.';
  if (input.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Introduza um email válido, por exemplo nome@dominio.pt.';
  if (input.dataset.field === 'birth_date') {
    const iso = isoDate(value);
    const date = new Date(iso + 'T12:00:00');
    const today = new Date();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== iso || date > today) return 'Introduza uma data de nascimento válida, no formato dd-mm-aaaa.';
  }
  if (input.id === 'pc-arrival-time' && parseTime(value) === null) return 'Introduza uma hora entre 00:00 e 23:59.';
  return '';
}
function clearFieldError(input) {
  input.removeAttribute('aria-invalid');
  const error = $(input.id + '-error');
  if (error) { error.textContent = ''; error.hidden = true; }
}
function displayFieldError(input, message) {
  let error = $(input.id + '-error');
  if (!error) {
    error = document.createElement('small');
    error.id = input.id + '-error';
    error.className = 'pc-field-error';
    error.setAttribute('aria-live', 'polite');
    (input.closest('label') || input.parentElement).append(error);
    input.setAttribute('aria-describedby', [input.getAttribute('aria-describedby'), error.id].filter(Boolean).join(' '));
  }
  error.hidden = !message;
  error.textContent = message;
  if (message) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
}
function validateField(input) {
  const message = fieldMessage(input);
  if (message) displayFieldError(input, message);
  else clearFieldError(input);
  if (!document.querySelector('[aria-invalid="true"]')) $('pc-error').style.display = 'none';
  return !message;
}
function updateGuestStatus(card) {
  if (!card) return;
  const complete = Array.from(card.querySelectorAll('input, select')).every(input => !fieldMessage(input));
  const status = card.querySelector('.pc-guest-status');
  status.textContent = complete ? 'Completo' : 'Por preencher';
  status.classList.toggle('is-complete', complete);
  card.querySelector('.pc-guest-name').textContent = card.querySelector('[data-field="name"]').value.trim() || `Hóspede ${Number(card.dataset.guest) + 1}`;
}
function stepForCard(card) { return Number(card.dataset.guest) === 0 ? 0 : 1; }
function showStep(index, focus = true) {
  if ($('pc-submit').disabled) return;
  currentStep = index;
  const final = index === steps.length - 1;
  allCards().forEach(card => { card.hidden = final || stepForCard(card) !== index; });
  $('pc-guests').hidden = final;
  $('pc-final').hidden = !final;
  $('pc-back').hidden = index === 0;
  $('pc-next').hidden = final;
  $('pc-submit').hidden = !final;
  $('pc-stay').textContent = `Etapa ${index + 1} de ${steps.length}`;
  $('pc-step-title').textContent = steps[index];
  const residence = allCards()[0]?.querySelector('[data-field="residence_country"]');
  allCards().forEach(card => {
    const button = card.querySelector('[data-copy-residence]');
    if (button) button.hidden = !resolveCountry(residence?.value) || resolveCountry(card.querySelector('[data-field="nationality"]').value)?.flag === 'PT';
  });
  $('pc-progress').querySelectorAll('button').forEach((button, i) => {
    button.disabled = i > index;
    if (i === index) button.setAttribute('aria-current', 'step');
    else button.removeAttribute('aria-current');
  });
  if (!final && !allCards().some(card => !card.hidden && card.open)) {
    const card = allCards().find(card => !card.hidden);
    if (card) card.open = true;
  }
  if (focus) AppModules.publicFlow.focusStep($('pc-step-title'));
}
function focusInvalid(input) {
  const card = input.closest('.guest-card');
  showStep(card ? stepForCard(card) : steps.length - 1, false);
  if (card) card.open = true;
  if (input.id === 'pc-arrival-time') $('pc-custom-time').hidden = false;
  input.focus();
  input.scrollIntoView({ block: 'center', behavior: 'instant' });
}
function validateInputs(inputs) {
  const invalid = inputs.filter(input => !validateField(input));
  allCards().forEach(updateGuestStatus);
  if (invalid.length) {
    const card = invalid[0].closest('.guest-card');
    showError(`${card ? `Hóspede ${Number(card.dataset.guest) + 1}: ` : ''}reveja os campos assinalados.`);
    focusInvalid(invalid[0]);
    return false;
  }
  $('pc-error').style.display = 'none';
  return true;
}
function setupGuestCard(card) {
  card.querySelectorAll('input, select').forEach(input => {
    input.id = `pc-guest-${card.dataset.guest}-${input.dataset.field}`;
    input.addEventListener('blur', () => { validateField(input); updateGuestStatus(card); });
    input.addEventListener('change', () => {
      if (input.dataset.field === 'nationality') updateForeignRequired(card);
      validateField(input);
      updateGuestStatus(card);
    });
    input.addEventListener('input', () => { clearFieldError(input); updateGuestStatus(card); });
  });
  card.addEventListener('toggle', () => {
    if (card.open) allCards().filter(other => other !== card && !other.hidden).forEach(other => { other.open = false; });
  });
  const copyCountry = (field, source) => {
    const country = resolveCountry(source.value);
    if (!country) { displayFieldError(source, 'Escolha primeiro um país para o poder copiar.'); focusInvalid(source); return; }
    const target = card.querySelector(`[data-field="${field}"]`);
    target.value = country.name;
    target.dataset.countryCode = country.flag;
    target.dispatchEvent(new Event('change', { bubbles: true }));
  };
  card.querySelector('[data-copy-nationality]')?.addEventListener('click', () => copyCountry('document_issuer_country', card.querySelector('[data-field="nationality"]')));
  card.querySelector('[data-copy-residence]')?.addEventListener('click', () => copyCountry('residence_country', allCards()[0].querySelector('[data-field="residence_country"]')));
  card.querySelector('[data-complete-guest]')?.addEventListener('click', () => {
    if (!validateInputs(Array.from(card.querySelectorAll('input, select')))) return;
    const next = allCards().find(other => Number(other.dataset.guest) > Number(card.dataset.guest));
    card.open = false;
    if (next) { next.open = true; next.querySelector('summary').focus(); }
    else $('pc-next').focus();
  });
}

function formatMinutes(total) {
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function syncTimePresetState() {
  const selected = $('pc-arrival-time')?.value || '';
  document.querySelectorAll('#pc-time-presets button').forEach(button => {
    const active = button.dataset.time === selected;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

// Sugestões de hora em hora, ancoradas na hora oficial do alojamento. Assim,
// um check-in às 15:30 gera 15:30, 16:30, 17:30... em vez de mudar de ritmo
// logo na segunda opção. Uma chegada antecipada continua disponível por escrita.
function renderTimePresets(checkInTime) {
  const container = document.getElementById('pc-time-presets');
  if (!container) return;
  const start = parseTime(checkInTime) ?? 15 * 60;
  const times = [];
  for (let t = start; t < 24 * 60 && times.length < 6; t += 60) times.push(t);
  container.innerHTML = times.map(formatMinutes).map(t =>
    `<button type="button" data-time="${t}" aria-pressed="false">${t}</button>`
  ).join('');
  container.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById('pc-arrival-time');
      if (input) {
        input.value = btn.dataset.time;
        $('pc-custom-time').hidden = true;
        clearFieldError(input);
        syncTimePresetState();
        updateTimeHint();
      }
    });
  });
  $('pc-custom-time').hidden = !($('pc-arrival-time').value && !times.map(formatMinutes).includes($('pc-arrival-time').value));
  $('pc-official-time').textContent = `Check-in a partir das ${formatMinutes(start)}. Indique a hora prevista de chegada.`;
  syncTimePresetState();
}

function updateTimeHint() {
  const hint = $('pc-time-hint');
  const checkin = reservationData?.reservation?.checkin_time || '';
  const chosen = parseTime($('pc-arrival-time').value);
  const official = parseTime(checkin);
  const early = chosen !== null && official !== null && chosen < official;
  hint.hidden = !early;
  hint.textContent = early ? `O check-in começa às ${checkin}. Uma chegada antecipada precisa de confirmação pelo alojamento.` : '';
}

function setupBirthInput(input) {
  const open = () => window.AppDatePicker?.open(input, { isBirthDate: true });
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'pc-text-button';
  button.textContent = 'Escolher no calendário';
  button.addEventListener('click', open);
  input.closest('label').append(button);
}

function normalizeTimeInput(value) {
  const raw = String(value || '').trim();
  const match = /^(\d{1,2})(?::(\d{2}))?$/.exec(raw);
  if (match) return `${match[1].padStart(2, '0')}:${match[2] || '00'}`;
  if (/^\d{3,4}$/.test(raw)) return `${raw.slice(0, -2).padStart(2, '0')}:${raw.slice(-2)}`;
  return raw;
}

// Só formata enquanto se escreve: ao apagar (Backspace/Delete), o valor fica
// como o utilizador o deixou — antes "14:3" voltava logo a "14:30" e não era
// possível limpar o campo. O zero final só entra ao sair do campo.
function setupArrivalTime() {
  const input = $('pc-arrival-time');
  input.addEventListener('input', event => {
    if (String(event.inputType || '').startsWith('insert')) {
      const digits = input.value.replace(/\D/g, '').slice(0, 4);
      input.value = digits.length >= 3 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
    }
    syncTimePresetState();
    updateTimeHint();
  });
  input.addEventListener('blur', () => {
    input.value = normalizeTimeInput(input.value);
    syncTimePresetState();
    updateTimeHint();
    validateField(input);
  });
  $('pc-other-time').addEventListener('click', () => { $('pc-custom-time').hidden = false; input.focus(); });
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
  if (safeMediaUrl(image)) {
    $('pc-bg').style.backgroundImage = `url(${JSON.stringify(mediaThumb(image, 1600))})`;
    $('pc-summary-photo').style.backgroundImage = `url(${JSON.stringify(mediaThumb(image, 1024))})`;
  }
  $('pc-summary-photo').hidden = !safeMediaUrl(image);
  $('pc-summary').classList.toggle('pc-no-photo', !safeMediaUrl(image));
  if (data.privacy_text) {
    $('pc-privacy').querySelector('summary').textContent = 'Política de privacidade do alojamento';
    $('pc-privacy-text').textContent = new DOMParser().parseFromString(data.privacy_text, 'text/html').body.textContent;
  }
  $('pc-arrival-time').value = normalizeTimeInput(r.arrival_time || '');

  const guests = [data.guest, ...(data.guests_data || [])];
  while (guests.length < Number(r.num_guests || 1)) guests.push({});
  const numAdults = Number(r.num_adults || r.num_guests || 1);
  $('pc-guests').innerHTML = guests.slice(0, Number(r.num_guests || 1)).map((g, i) => guestForm(g, i, numAdults)).join('');
  allCards().forEach(setupGuestCard);
  document.querySelectorAll('.pc-country-input').forEach(setupCountryInput);
  document.querySelectorAll('.pc-birth-input').forEach(setupBirthInput);
  document.querySelectorAll('.guest-card').forEach(card => {
    updateForeignRequired(card);
    setupCompanyToggle(card);
    updateGuestStatus(card);
  });
  steps = allCards().length > 1 ? ['Hóspede principal', 'Restantes hóspedes', 'Chegada e confirmação'] : ['Hóspede principal', 'Chegada e confirmação'];
  $('pc-progress').innerHTML = steps.map((title, i) => `<button type="button" data-step="${i}"><span>${i + 1}</span>${title}</button>`).join('');
  $('pc-progress').querySelectorAll('button').forEach((button, i) => button.addEventListener('click', () => showStep(i)));
  $('pc-next').disabled = false;
  showStep(0, false);
  renderTimePresets(r.checkin_time);
  updateTimeHint();
  showSubmittedState(r.precheckin_submitted_at);
}

// Já enviado: o formulário continua editável até ao dia de chegada.
function showSubmittedState(submittedAt) {
  const note = $('pc-edit-note');
  if (!submittedAt) { note.hidden = true; return; }
  const until = reservationData?.reservation?.editable_until;
  note.hidden = false;
  note.textContent = `Já enviou o pré check-in a ${fmtDate(String(submittedAt).slice(0, 10))}. `
    + `Pode corrigir os dados${until ? ` até ${fmtDate(until)}` : ''}: altere o que precisar e carregue em "Guardar alterações".`;
  $('pc-submit').textContent = 'Guardar alterações';
}

// Link fechado (prazo, reserva cancelada, link inválido): mostra só a
// mensagem, sem resumo vazio nem formulário.
function showClosed(message) {
  $('pc-summary').hidden = true;
  $('precheckin-form').hidden = true;
  $('pc-closed-message').textContent = message;
  $('pc-closed').hidden = false;
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
    showClosed(err.message);
  }
}

$('precheckin-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!reservationData || $('pc-submit').disabled) return;
  if (currentStep !== steps.length - 1) { $('pc-next').click(); return; }
  $('pc-arrival-time').value = normalizeTimeInput($('pc-arrival-time').value);
  const fields = [...allCards().flatMap(card => Array.from(card.querySelectorAll('input, select'))), $('pc-arrival-time'), $('pc-rgpd')];
  if (!validateInputs(fields)) return;
  $('pc-error').style.display = 'none';
  const btn = $('pc-submit');
  btn.disabled = true;
  $('pc-back').disabled = true;
  btn.textContent = 'A enviar...';
  try {
    const cards = Array.from(document.querySelectorAll('[data-guest]'));
    const guests = cards.map(collectGuest);
    const result = await api(`/api/public/pre-checkin/${token}`, {
      method: 'POST',
      body: JSON.stringify({
        arrival_time: $('pc-arrival-time').value,
        rgpd_consent: $('pc-rgpd').checked,
        guest: guests[0],
        guests_data: guests.slice(1),
      }),
    });
    AppModules.publicFlow.complete(result.data?.resubmission ? 'alteracoes' : 'dados', {
      reference: reservationData.reservation.id,
      returnPath: location.pathname,
      paymentPath: reservationData.reservation.payment_path,
    });
  } catch (err) {
    btn.disabled = false;
    $('pc-back').disabled = false;
    showError(err.message);
    const invalid = (err.fieldErrors || []).map(item => {
      const input = item.guest_index === undefined ? $(item.field === 'arrival_time' ? 'pc-arrival-time' : 'pc-rgpd') : $(`pc-guest-${item.guest_index}-${item.field}`);
      if (input) displayFieldError(input, item.message);
      return input;
    }).filter(Boolean);
    if (invalid.length) focusInvalid(invalid[0]);
    btn.textContent = reservationData.reservation.precheckin_submitted_at ? 'Guardar alterações' : 'Enviar pré check-in';
  }
});

AppModules.publicFlow.setupNavigation();
setupArrivalTime();
$('pc-rgpd').addEventListener('change', () => validateField($('pc-rgpd')));
$('pc-back').addEventListener('click', () => showStep(Math.max(0, currentStep - 1)));
$('pc-next').addEventListener('click', () => {
  const inputs = allCards().filter(card => !card.hidden).flatMap(card => Array.from(card.querySelectorAll('input, select')));
  if (validateInputs(inputs)) showStep(Math.min(currentStep + 1, steps.length - 1));
});
load();

})();
