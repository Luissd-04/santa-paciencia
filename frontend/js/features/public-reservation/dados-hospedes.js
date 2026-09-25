// Estado privado; interface partilhada em AppModules.booking.
(() => {
AppModules.define('booking', {
  _voucherData: { get: () => _voucherData, set: value => { _voucherData = value; } },
  setupCountrySearch: { get: () => setupCountrySearch },
  setupGuestPhoneCodeSearch: { get: () => setupGuestPhoneCodeSearch },
  setupPhoneCodeSearch: { get: () => setupPhoneCodeSearch },
});

function setupCountrySearch(inputId, dropdownId, onPick) {
  const input = typeof inputId === 'string' ? AppModules.booking.$(inputId) : inputId;
  const dropdown = typeof dropdownId === 'string' ? AppModules.booking.$(dropdownId) : dropdownId;
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
    const c = AppModules.booking.COUNTRIES.find(x => x.name === item.dataset.country);
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
    ? AppModules.booking.COUNTRIES.filter(c => AppModules.booking.fuzzyMatch(search, c.name) > 0)
        .sort((a, b) => AppModules.booking.fuzzyMatch(search, b.name) - AppModules.booking.fuzzyMatch(search, a.name))
        .slice(0, 12)
    : AppModules.booking.COUNTRIES;

  dropdown.innerHTML = results.map(c => `
    <div class="country-dropdown-item" data-country="${c.name}">
      <span>${AppModules.booking.flagHtml(c.flag)}</span>
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
      ? AppModules.booking.PHONE_CODES.filter(c => AppModules.booking.fuzzyMatch(q, c.code) > 0 || AppModules.booking.fuzzyMatch(q, c.country) > 0)
          .sort((a, b) =>
            Math.max(AppModules.booking.fuzzyMatch(q, b.code), AppModules.booking.fuzzyMatch(q, b.country)) -
            Math.max(AppModules.booking.fuzzyMatch(q, a.code), AppModules.booking.fuzzyMatch(q, a.country)))
          .slice(0, 12)
      : AppModules.booking.PHONE_CODES;
    results.innerHTML = list.map(p => `
      <div class="country-dropdown-item" data-code="${p.code}" data-cc="${AppModules.booking.ccFromFlagEmoji(p.flag)}" data-country="${p.country}">
        <span>${AppModules.booking.flagHtml(p.flag)}</span><span>${p.code}</span>
        <span style="color:#999;margin-left:auto;font-size:12px">${p.country}</span>
      </div>`).join('');
  }
  filter('');
  searchInput.addEventListener('input', () => filter(searchInput.value));
  searchInput.addEventListener('keydown', e => { if (e.key === 'Escape') dropdown.style.display = 'none'; });
  setTimeout(() => searchInput.focus(), 0);
}

function setupPhoneCodeSearch() {
  const btn = AppModules.booking.$('pb-phone-code-btn');
  const dropdown = AppModules.booking.$('pb-phone-code-dropdown');

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
    AppModules.booking.$('pb-phone-code').value = item.dataset.code;
    btn.innerHTML = `${AppModules.booking.flagHtml(item.dataset.cc)} ${item.dataset.code}`;
    dropdown.style.display = 'none';
  });

  document.addEventListener('click', (e) => {
    if (!btn.contains(e.target) && !dropdown.contains(e.target)) dropdown.style.display = 'none';
  });
}


function setupDocTypeSearch(inputId, dropdownId, onPick) {
  const input = typeof inputId === 'string' ? AppModules.booking.$(inputId) : inputId;
  const btn = input?.closest('.doc-type-wrap')?.querySelector('.doc-type-btn');
  const dropdown = typeof dropdownId === 'string' ? AppModules.booking.$(dropdownId) : dropdownId;
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
    const docType = AppModules.booking.DOC_TYPES.find(d => d.value === item.dataset.value);
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
  const results = AppModules.booking.DOC_TYPES;
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
    const docType = AppModules.booking.DOC_TYPES.find(d => d.value === item.dataset.value);
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
    btn.innerHTML = `${AppModules.booking.flagHtml(item.dataset.cc)} ${item.dataset.code}`;
    finalDropdown.style.display = 'none';
  });
  document.addEventListener('click', (e) => {
    if (!btn.contains(e.target) && !finalDropdown.contains(e.target)) finalDropdown.style.display = 'none';
  });
}

let _voucherData = null;


})();
