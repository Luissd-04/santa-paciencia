function getExtraOccupancyCharge(suite, numGuests, nights, birthDates = [], checkIn = null) {
  return window.ReservationPricing?.getExtraOccupancyCharge(suite, numGuests, nights, birthDates, checkIn) || 0;
}

function normalizeExtraOccupancyOptionsForPrice(suite) {
  return window.ReservationPricing?.normalizeExtraOccupancyOptions(suite) || [];
}

function getGuestBirthDatesFromUi() {
  return [
    getBirthDateValue(document.getElementById('f-nascimento')),
    ...Array.from(document.querySelectorAll('.extra-guest-row [data-field="birth_date"]')).map(el => getBirthDateValue(el))
  ].filter(Boolean);
}

// ── Idades das crianças (seleção rápida, como no formulário público) ──

function wizChildRowBirthDates() {
  return Array.from(document.querySelectorAll('.extra-guest-row[data-is-child="true"] [data-field="birth_date"]'))
    .map(el => getBirthDateValue(el) || null);
}

function renderWizChildAges() {
  const wrap = document.getElementById('resf-child-ages');
  if (!wrap) return;
  const count = parseInt(document.getElementById('f-num-criancas')?.value) || 0;
  if (count <= 0) { wrap.style.display = 'none'; wrap.innerHTML = ''; return; }

  const ci = normalizeIsoDateValue(document.getElementById('f-checkin')?.value) || new Date().toISOString().slice(0, 10);
  const prev = Array.from(wrap.querySelectorAll('select')).map(s => s.value);
  const rowAges = wizChildRowBirthDates().map(d => (d ? getAgeAtDate(d, ci) : null));

  let html = '<label class="form-label">Idade das crianças</label><div style="display:flex;flex-wrap:wrap;gap:8px;">';
  for (let i = 0; i < count; i++) {
    // Preferência: valor já escolhido → idade derivada da ficha da criança → vazio
    const sel = prev[i] || (rowAges[i] != null && rowAges[i] >= 0 ? String(Math.min(rowAges[i], 17)) : '');
    let opts = '<option value="">Idade</option>';
    for (let a = 0; a <= 17; a++) opts += `<option value="${a}"${String(a) === sel ? ' selected' : ''}>${a} ano${a !== 1 ? 's' : ''}</option>`;
    html += `<label style="flex:1;min-width:110px;display:flex;flex-direction:column;gap:3px;">
      <select class="form-control" data-wiz-child-age="${i}" onchange="onWizChildAgeChange()">${opts}</select>
      <small class="wiz-child-age-hint" style="font-size:11px;color:var(--cinza);min-height:14px;"></small>
    </label>`;
  }
  html += '</div>';
  wrap.innerHTML = html;
  wrap.style.display = '';
  updateWizChildAgeHints();
}

function onWizChildAgeChange() {
  updateWizChildAgeHints();
  calcTotal();
}

function updateWizChildAgeHints() {
  const suite = accommodations.find(a => a.id === document.getElementById('f-aloj')?.value);
  const babyLimit = Number(suite?.baby_age_limit ?? 2);
  const childLimit = Number(suite?.child_age_limit ?? 12);
  const babyPrice = Number(suite?.baby_price ?? 0);
  const childPrice = Number(suite?.child_price ?? 0);
  document.querySelectorAll('#resf-child-ages [data-wiz-child-age]').forEach(sel => {
    const hint = sel.parentElement?.querySelector('.wiz-child-age-hint');
    if (!hint) return;
    if (sel.value === '' || !suite) { hint.textContent = ''; return; }
    const age = Number(sel.value);
    if (age < babyLimit) hint.textContent = babyPrice > 0 ? `Bebé · €${babyPrice.toFixed(2)}/noite` : 'Bebé · sem custo';
    else if (age < childLimit) hint.textContent = childPrice > 0 ? `Criança · €${childPrice.toFixed(2)}/noite` : 'Criança · sem custo';
    else hint.textContent = 'Preço de adulto';
  });
}

// Converte cada idade escolhida numa data de nascimento aproximada alinhada ao
// check-in (idade-ao-check-in = idade escolhida), como no formulário público.
function wizChildAgeBirthDates() {
  const ci = normalizeIsoDateValue(document.getElementById('f-checkin')?.value) || new Date().toISOString().slice(0, 10);
  const year = Number(ci.slice(0, 4));
  const monthDay = ci.slice(4); // "-MM-DD"
  return Array.from(document.querySelectorAll('#resf-child-ages [data-wiz-child-age]')).map(s =>
    s.value === '' ? null : `${year - Number(s.value)}${monthDay}`
  );
}

// Datas de nascimento efetivas para o cálculo: adultos primeiro (posições sem
// desconto), depois as crianças — data explícita da ficha da criança quando
// preenchida, senão a derivada da idade escolhida.
function wizEffectiveBirthDates() {
  const adults = parseInt(document.getElementById('f-num-adultos')?.value) || 1;
  const children = parseInt(document.getElementById('f-num-criancas')?.value) || 0;
  if (!children) return getGuestBirthDatesFromUi();
  const rowDates = wizChildRowBirthDates();
  const ageDates = wizChildAgeBirthDates();
  const childDates = [];
  for (let i = 0; i < children; i++) childDates.push(rowDates[i] || ageDates[i] || null);
  return [...Array(adults).fill(null), ...childDates];
}

function formatDateForBirthInput(value) {
  return window.ReservationDates?.formatPtDate(value) || value || '';
}

function normalizeBirthDateValue(value) {
  return window.ReservationDates?.normalizeIsoDate(value, {
    minYear: 1900,
    maxYear: new Date().getFullYear()
  }) || '';
}

function isValidDateParts(year, month, day) {
  return window.ReservationDates?.isValidDateParts(year, month, day, {
    minYear: 1900,
    maxYear: new Date().getFullYear()
  }) || false;
}

function getBirthDateValue(input) {
  return normalizeBirthDateValue(input?.value || '');
}

function handleBirthDateInput(input) {
  const digits = String(input.value || '').replace(/\D/g, '');
  if (digits.length === 8) normalizeBirthDateInput(input);
}

function normalizeBirthDateInput(input) {
  if (!input) return;
  const iso = normalizeBirthDateValue(input.value);
  if (iso) input.value = formatDateForBirthInput(iso);
  calcTotal();
  updateSpecialRateHints();
}

function normalizeIsoDateValue(value) {
  return window.ReservationDates?.normalizeIsoDate(value) || '';
}

function formatDateForStandardInput(value) {
  return window.ReservationDates?.formatPtDate(value) || value || '';
}

function getAgeSpecialRates(suite, birthDates = [], checkIn = null) {
  return window.ReservationPricing?.getAgeSpecialRates(suite, birthDates, checkIn) || [];
}

function getAgeSpecialRateInfo(suite, birthDate, checkIn = null) {
  if (!suite || !birthDate || !checkIn) return null;
  const age = getAgeAtDate(birthDate, checkIn);
  if (age === null) return null;
  const babyLimit = Number(suite.baby_age_limit ?? 2);
  const childLimit = Number(suite.child_age_limit ?? 12);
  if (age <= babyLimit) {
    return { type: 'bebé', label: 'Preço de bebé aplicado', price: Number(suite.baby_price ?? 0), age };
  }
  if (age > babyLimit && age < childLimit) {
    return { type: 'criança', label: 'Preço de criança aplicado', price: Number(suite.child_price ?? 0), age };
  }
  return null;
}

function updateSpecialRateHints() {
  const suite = accommodations.find(a => a.id === document.getElementById('f-aloj')?.value);
  const checkIn = document.getElementById('f-checkin')?.value || new Date().toISOString().slice(0, 10);
  const included = Math.max(1, Math.min(
    Number(suite?.base_guests_included) || Math.min(Number(suite?.max_guests) || 2, 2),
    Number(suite?.max_guests) || 20
  ));
  const setHint = (el, birthDate, guestIndex = 0) => {
    if (!el) return;
    const info = getAgeSpecialRateInfo(suite, birthDate, checkIn);
    el.style.display = info ? '' : 'none';
    if (!info) {
      el.textContent = '';
      return;
    }
    const applied = guestIndex >= included;
    el.textContent = `${info.label}${applied ? '' : ' se for hóspede adicional'} · €${info.price.toFixed(2)}/noite`;
  };

  setHint(
    document.getElementById('f-nascimento-rate-hint'),
    getBirthDateValue(document.getElementById('f-nascimento')),
    0
  );
  document.querySelectorAll('.extra-guest-row').forEach((row, idx) => {
    setHint(
      row.querySelector('.guest-rate-hint'),
      getBirthDateValue(row.querySelector('[data-field="birth_date"]')),
      idx + 1
    );
  });
}

function getAgeAtDate(birthDate, refDate) {
  return window.ReservationDates?.ageAtDate(birthDate, refDate) ?? null;
}

function renderExtraGuests() {
  const n = parseInt(document.getElementById('f-num-hospedes').value) || 1;
  const wrap = document.getElementById('extra-guests-wrap');
  const container = document.getElementById('extra-guests-container');
  if (!wrap || !container) return;
  if (n <= 1) { wrap.style.display = 'none'; container.innerHTML = ''; return; }
  wrap.style.display = '';

  const existing = Array.from(container.querySelectorAll('.extra-guest-row')).map(row => ({
    nome_completo:   row.querySelector('[data-field="nome_completo"]')?.value   || '',
    email:           row.querySelector('[data-field="email"]')?.value           || '',
    tel_prefix:      row.querySelector('[data-field="tel_prefix"]')?.value      || '+351',
    tel_num:         row.querySelector('[data-field="tel_num"]')?.value         || '',
    country:         row.querySelector('[data-field="country"]')?.value         || '',
    birth_date:      formatDateForBirthInput(row.querySelector('[data-field="birth_date"]')?.value || ''),
    birth_city:      row.querySelector('[data-field="birth_city"]')?.value      || '',
    doc_type:        row.querySelector('[data-field="doc_type"]')?.value        || '',
    doc_number:      row.querySelector('[data-field="doc_number"]')?.value      || '',
    doc_emissor:     row.querySelector('[data-field="doc_emissor"]')?.value     || '',
    nif:             row.querySelector('[data-field="nif"]')?.value             || '',
  }));

  const prefixOpts = DIAL_COUNTRIES.map(c =>
    `<option value="${c.dial}" data-flag="${c.code.toLowerCase()}">${c.dial}</option>`
  ).join('');
  const countryOpts = '<option value="">— País —</option>' +
    DIAL_COUNTRIES.map(c => `<option value="${c.name}" data-flag="${c.code.toLowerCase()}">${c.name}</option>`).join('');

  const numAdultos = parseInt(document.getElementById('f-num-adultos')?.value) || 1;
  const parts = [];
  for (let i = 2; i <= n; i++) {
    const idx = i - 2;
    const p = existing[idx] || {};
    const isChild = i > numAdultos;
    const rowLabel = isChild ? `Hóspede ${i} — criança` : `Hóspede ${i}`;
    parts.push(`
      <div class="extra-guest-row" data-extra-idx="${idx}" data-is-child="${isChild}" style="background:var(--cinza-claro);border-radius:10px;padding:14px;margin-bottom:12px;">
        <div style="font-size:12px;font-weight:700;color:var(--cinza);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;">${rowLabel}</div>
        ${!isChild ? `<div class="form-group form-full" style="margin-bottom:12px;">
          <label class="form-label">Pesquisa rápida (hóspede existente)</label>
          <div class="guest-search-wrap">
            <input class="form-control extra-guest-search-input" placeholder="Nome, email ou telefone…" autocomplete="off"
              oninput="extraGuestSearch(this.value,${idx})">
            <div class="guest-drop" id="extra-guest-drop-${idx}"></div>
          </div>
        </div>` : ''}
        <div class="form-grid" style="margin:0;gap:12px;">
          <div class="form-group form-full" style="margin-bottom:0;">
            <label class="form-label">Nome Completo <span class="req-star">*</span></label>
            <input class="form-control" data-field="nome_completo" placeholder="Nome completo" value="${p.nome_completo || ''}" autocomplete="off">
          </div>
          ${!isChild ? `<div class="form-group" style="margin-bottom:0;">
            <label class="form-label">Email</label>
            <input class="form-control" data-field="email" type="email" placeholder="email@exemplo.com" value="${p.email || ''}" autocomplete="off">
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">Telefone</label>
            <div class="phone-group">
              <select class="form-control phone-prefix" data-field="tel_prefix">${prefixOpts}</select>
              <input class="form-control phone-number" data-field="tel_num" type="tel" placeholder="912 345 678" value="${p.tel_num || ''}" autocomplete="off">
            </div>
          </div>` : ''}
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">País</label>
            <select class="form-control guest-country" data-field="country"
              onchange="updateExtraForeignReqs(this.closest('.extra-guest-row'))">${countryOpts}</select>
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">Data de Nascimento</label>
            <div class="birth-date-control">
              <input class="form-control birth-date-input" data-field="birth_date" type="text" inputmode="numeric" maxlength="10" placeholder="dd-mm-aaaa" data-date-format="pt" value="${formatDateForBirthInput(p.birth_date || '')}" oninput="handleBirthDateInput(this)" onblur="normalizeBirthDateInput(this);calcTotal();updateSpecialRateHints()" autocomplete="off">
              <button class="birth-date-picker-btn" type="button" onclick="AppDatePicker.open(this.closest('.birth-date-control').querySelector('.birth-date-input'),{isBirthDate:true})" aria-label="Abrir calendário">
                <i data-lucide="calendar-days"></i>
              </button>
            </div>
            <div class="guest-rate-hint"></div>
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">Local de Nascimento <span class="req-foreign-extra" style="display:none;color:var(--vermelho)">*</span></label>
            <input class="form-control" data-field="birth_city" placeholder="Cidade de nascimento" value="${p.birth_city || ''}" autocomplete="off">
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">Tipo de Documento <span class="req-foreign-extra" style="display:none;color:var(--vermelho)">*</span></label>
            <select class="form-control" data-field="doc_type">
              <option value="">— Selecionar —</option>
              <option value="cc">Cartão de Cidadão</option>
              <option value="bi">Bilhete de Identidade</option>
              <option value="passaporte">Passaporte</option>
              <option value="nie">NIE</option>
              <option value="outro">Outro</option>
            </select>
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">Nº de Documento <span class="req-foreign-extra" style="display:none;color:var(--vermelho)">*</span></label>
            <input class="form-control" data-field="doc_number" placeholder="XX000000" value="${p.doc_number || ''}" autocomplete="off">
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">País Emissor do Documento <span class="req-foreign-extra" style="display:none;color:var(--vermelho)">*</span></label>
            <select class="form-control" data-field="doc_emissor">${countryOpts}</select>
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">NIF</label>
            <input class="form-control" data-field="nif" placeholder="000 000 000" value="${p.nif || ''}" autocomplete="off">
          </div>
        </div>
      </div>`);
  }
  container.innerHTML = parts.join('');

  // Attach date pickers to newly inserted birth date inputs
  if (window.AppDatePicker) {
    container.querySelectorAll('.birth-date-input').forEach(input =>
      AppDatePicker.attach(input, { isBirthDate: true })
    );
  }

  // Restore select values + update foreign requirements after DOM insertion
  container.querySelectorAll('.extra-guest-row').forEach((row, idx) => {
    const p = existing[idx] || {};
    const prefixSel = row.querySelector('[data-field="tel_prefix"]');
    if (prefixSel && p.tel_prefix) prefixSel.value = p.tel_prefix;
    const countrySel = row.querySelector('[data-field="country"]');
    if (countrySel && p.country) countrySel.value = p.country;
    const docSel = row.querySelector('[data-field="doc_type"]');
    if (docSel && p.doc_type) docSel.value = p.doc_type;
    const emissorSel = row.querySelector('[data-field="doc_emissor"]');
    if (emissorSel && p.doc_emissor) emissorSel.value = p.doc_emissor;
    updateExtraForeignReqs(row);
  });

  enhanceReservationSelects(container);
  AppUI.refreshDropdowns(container);
  if (window.lucide) lucide.createIcons();
  updateSpecialRateHints();
}

function updateExtraForeignReqs(row) {
  const isForeign = (row.querySelector('[data-field="country"]')?.value || '') !== 'Portugal'
    && row.querySelector('[data-field="country"]')?.value !== '';
  row.querySelectorAll('.req-foreign-extra').forEach(el => {
    el.style.display = isForeign ? '' : 'none';
  });
}

// ── EXTRA GUEST SEARCH ──
const _extraSearchTimers = {};
const _extraSearchResultsMap = {};

async function extraGuestSearch(q, idx) {
  const drop = document.getElementById(`extra-guest-drop-${idx}`);
  if (!drop) return;
  if (!q || q.length < 2) {
    _extraSearchResultsMap[idx] = [];
    drop.innerHTML = '';
    drop.classList.remove('open');
    return;
  }
  clearTimeout(_extraSearchTimers[idx]);
  _extraSearchTimers[idx] = setTimeout(async () => {
    try {
      const data = await apiGet(`/api/guests?search=${encodeURIComponent(q)}`);
      _extraSearchResultsMap[idx] = (data.data || []).slice(0, 8);
      if (!_extraSearchResultsMap[idx].length) {
        drop.innerHTML = '<div style="padding:10px 14px;font-size:12px;color:var(--cinza);">Sem resultados</div>';
        drop.classList.add('open');
        return;
      }
      drop.innerHTML = _extraSearchResultsMap[idx].map((g, gIdx) => {
        const name = [g.first_name, g.last_name].filter(Boolean).join(' ') || g.name || '—';
        const meta = [g.email, g.phone].filter(Boolean).join(' · ');
        return `<div class="guest-drop-item" onclick="extraGuestSelect(${idx},${gIdx})">
          <div class="gdi-name">${name.replace(/</g,'&lt;')}</div>
          <div class="gdi-meta">${meta.replace(/</g,'&lt;')}</div>
        </div>`;
      }).join('');
      drop.classList.add('open');
    } catch (e) { drop.classList.remove('open'); }
  }, 280);
}

function extraGuestSelect(idx, gIdx) {
  const g = (_extraSearchResultsMap[idx] || [])[gIdx];
  if (!g) return;
  const row = document.querySelector(`.extra-guest-row[data-extra-idx="${idx}"]`);
  if (!row) return;
  const setVal = (field, val) => { const el = row.querySelector(`[data-field="${field}"]`); if (el) el.value = val || ''; };
  setVal('nome_completo', [g.first_name, g.last_name].filter(Boolean).join(' ') || g.name || '');
  setVal('email',       g.email);
  const rawPhone = g.phone || '';
  const mc = DIAL_COUNTRIES.find(c => rawPhone.startsWith(c.dial));
  setVal('tel_prefix',  mc ? mc.dial : '+351');
  setVal('tel_num',     mc ? rawPhone.slice(mc.dial.length).trim() : rawPhone);
  setVal('country',     g.country || g.nationality);
  setVal('birth_date',  formatDateForBirthInput(g.birth_date));
  setVal('birth_city',  g.birth_city);
  setVal('doc_type',    g.document_type);
  setVal('doc_number',  g.document_number);
  setVal('doc_emissor', g.document_issuer_country);
  setVal('nif',         g.nif);
  updateExtraForeignReqs(row);
  AppUI.refreshDropdowns(row);
  calcTotal();
  const drop = document.getElementById(`extra-guest-drop-${idx}`);
  if (drop) { drop.innerHTML = ''; drop.classList.remove('open'); }
  const si = row.querySelector('.extra-guest-search-input');
  if (si) si.value = '';
  toast('✅ Dados preenchidos.', 'success');
}

// ── WIZARD FUNCTIONS ──

let _unavailableSuites = new Set();
let _availTimer = null;

