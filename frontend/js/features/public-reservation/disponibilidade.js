// Estado privado; interface partilhada em AppModules.booking.
(() => {
AppModules.define('booking', {
  applyVoucher: { get: () => applyVoucher },
  bindEvents: { get: () => bindEvents },
  clearStepError: { get: () => clearStepError },
  showStepError: { get: () => showStepError },
});

async function applyVoucher() {
  const code = (AppModules.booking.$('pb-voucher')?.value || '').trim().toUpperCase();
  const statusEl = AppModules.booking.$('pb-voucher-status');
  if (!statusEl) return;
  if (!code) {
    AppModules.booking._voucherData = null;
    statusEl.style.display = 'none';
    AppModules.booking.recalc();
    return;
  }
  statusEl.style.display = '';
  statusEl.style.background = '#f5f5f5';
  statusEl.style.color = '#666';
  statusEl.textContent = 'A verificar...';
  try {
    const res = await AppModules.booking.api(`/api/public/booking/${AppModules.booking.state.slug}/voucher?code=${encodeURIComponent(code)}`);
    AppModules.booking._voucherData = res.data;
    const disc = AppModules.booking._voucherData.type === 'discount_pct'
      ? `${AppModules.booking._voucherData.value}% de desconto`
      : `€${Number(AppModules.booking._voucherData.value).toFixed(2)} de desconto`;
    statusEl.style.background = '#f0faf4';
    statusEl.style.color = '#2d6a4f';
    statusEl.textContent = `✓ ${AppModules.booking._voucherData.description ? AppModules.booking._voucherData.description + ' · ' : ''}${disc}`;
    AppModules.booking.recalc();
  } catch (err) {
    AppModules.booking._voucherData = null;
    statusEl.style.background = '#fef0f0';
    statusEl.style.color = '#c0392b';
    statusEl.textContent = err.message;
    AppModules.booking.recalc();
  }
}

let _availTimer = null;
function scheduleAvailabilityFetch() {
  clearTimeout(_availTimer);
  _availTimer = setTimeout(fetchAvailability, 300);
}

function showStepError(msg) {
  const el = AppModules.booking.$('step-error');
  if (!el) return;
  el.textContent = msg;
  el.style.display = '';
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function clearStepError() {
  const el = AppModules.booking.$('step-error');
  if (el) el.style.display = 'none';
}

function bindEvents() {
  AppModules.booking.setupCountrySearch('pb-country', 'pb-country-dropdown', () => {
    renderExtraGuests();
  });
  AppModules.booking.setupPhoneCodeSearch();

  const checkinEl = AppModules.booking.$('pb-checkin');
  const checkoutEl = AppModules.booking.$('pb-checkout');
  function openCheckin() {
    AppDatePicker.open(checkinEl, {
      onChange: (isoDate) => {
        if (!AppModules.booking.iso(checkoutEl.value)) {
          setTimeout(() => AppDatePicker.open(checkoutEl, { minDate: isoDate }), 60);
        }
      }
    });
  }
  function openCheckout() {
    AppDatePicker.open(checkoutEl, { minDate: AppModules.booking.iso(checkinEl.value) || undefined });
  }
  checkinEl.addEventListener('focus', openCheckin);
  checkinEl.addEventListener('click', openCheckin);
  checkinEl.addEventListener('input', () => {
    if (checkinEl.value.replace(/\D/g, '').length === 8) checkinEl.value = AppModules.booking.ptDate(checkinEl.value);
    AppModules.booking.recalc();
  });
  checkoutEl.addEventListener('focus', openCheckout);
  checkoutEl.addEventListener('click', openCheckout);
  checkoutEl.addEventListener('input', () => {
    if (checkoutEl.value.replace(/\D/g, '').length === 8) checkoutEl.value = AppModules.booking.ptDate(checkoutEl.value);
    AppModules.booking.recalc();
  });
  const birthEl = AppModules.booking.$('pb-birth');
  birthEl.addEventListener('focus', () => AppDatePicker.open(birthEl, { isBirthDate: true }));
  birthEl.addEventListener('click', () => AppDatePicker.open(birthEl, { isBirthDate: true }));
  AppModules.booking.$('pb-children').addEventListener('input', () => { AppModules.booking.renderChildAges(); AppModules.booking.recalc(); });
  ['pb-checkin','pb-checkout','pb-adults','pb-children','pb-birth'].forEach(id => AppModules.booking.$(id).addEventListener('change', () => {
    scheduleAvailabilityFetch();
    AppModules.booking.renderChildAges();
    renderExtraGuests();
    AppModules.booking.recalc();
  }));
  AppModules.booking.$('unit-list').addEventListener('click', (e) => {
    const card = e.target.closest('.unit-card');
    if (!card || card.classList.contains('blocked')) return;
    AppModules.booking.state.selectedUnitId = card.dataset.unit;
    AppModules.booking.renderUnits();
    AppModules.booking.recalc();
  });
  AppModules.booking.$('pb-voucher')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); applyVoucher(); } });
  AppModules.booking.$('next-btn').addEventListener('click', AppModules.booking.nextStep);
  AppModules.booking.$('prev-btn').addEventListener('click', AppModules.booking.prevStep);
}

async function fetchAvailability() {
  const ci = AppModules.booking.iso(AppModules.booking.$('pb-checkin').value);
  const co = AppModules.booking.iso(AppModules.booking.$('pb-checkout').value);
  if (!ci || !co || AppModules.booking.nights() <= 0) {
    AppModules.booking.state.availability = [];
    AppModules.booking.renderUnits();
    return;
  }
  const guests = AppModules.booking.totalGuests();
  const payload = await AppModules.booking.api(`/api/public/booking/${AppModules.booking.state.slug}/availability?check_in=${ci}&check_out=${co}&num_guests=${guests}`).catch(() => null);
  AppModules.booking.state.availability = payload?.data || [];
  if (AppModules.booking.availabilityFor(AppModules.booking.state.selectedUnitId) && !AppModules.booking.availabilityFor(AppModules.booking.state.selectedUnitId).available) {
    AppModules.booking.state.selectedUnitId = AppModules.booking.state.units.find(u => AppModules.booking.availabilityFor(u.id)?.available)?.id || '';
  }
  AppModules.booking.renderUnits();
}

function renderExtraGuests() {
  const count = Math.max(1, AppModules.booking.totalGuests());
  const wrap = AppModules.booking.$('extra-guests');
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
          <input data-field="name" required value="${AppModules.booking.escapeHtml(prev.name || '')}" placeholder="Nome completo" autocomplete="off">
        </label>
        <div class="field-grid two">
          <label>
            <span>Email *</span>
            <input data-field="email" type="email" required value="${AppModules.booking.escapeHtml(prev.email || '')}" placeholder="email@exemplo.com" autocomplete="off">
          </label>
          <label>
            <span>Telefone *</span>
            <div class="phone-input-group">
              <div class="phone-code-wrap">
                <button type="button" class="phone-code-btn guest-phone-code-btn" data-field="phone_code" data-guest-index="${i}"><span class="fi fi-pt"></span> +351</button>
                <input type="hidden" data-field="phone_code" value="${AppModules.booking.escapeHtml(prev.phone_code || '+351')}">
              </div>
              <input data-field="phone" type="tel" required value="${AppModules.booking.escapeHtml(prev.phone || '')}" placeholder="912 345 678" autocomplete="off">
            </div>
          </label>
        </div>
        <div class="field-grid two">
          <label>
            <span>Nacionalidade *</span>
            <div class="country-search">
              <input data-field="country" class="country-input guest-country-input" required value="${AppModules.booking.escapeHtml(country)}" placeholder="Portugal" autocomplete="off" data-guest-index="${i}">
              <div class="country-dropdown" style="display: none;"></div>
            </div>
          </label>
          <label>
            <span>Data de nascimento</span>
            <input class="birth-input guest-birth-input" data-field="birth_date" type="text" inputmode="numeric" value="${prev.birth_date || ''}" placeholder="dd-mm-aaaa" maxlength="10" autocomplete="off">
            <small class="rate-hint"></small>
          </label>
        </div>
      </div>`);
  }
  wrap.innerHTML = parts.join('');

  // Setup date pickers for all guest birth dates
  wrap.querySelectorAll('.guest-birth-input').forEach(input => {
    input.addEventListener('focus', () => AppDatePicker.open(input, { isBirthDate: true, onChange: () => AppModules.booking.recalc() }));
    input.addEventListener('click', () => AppDatePicker.open(input, { isBirthDate: true, onChange: () => AppModules.booking.recalc() }));
    input.addEventListener('input', () => {
      if (input.value.replace(/\D/g, '').length === 8) input.value = AppModules.booking.ptDate(input.value);
      AppModules.booking.recalc();
    });
  });

  // Setup country selectors and phone codes for all guests
  wrap.querySelectorAll('[data-guest-index]').forEach(guestSection => {
    const guestIndex = guestSection.dataset.guestIndex;
    const countryInput = guestSection.querySelector('.guest-country-input');
    const phoneCodeBtn = guestSection.querySelector('.guest-phone-code-btn');

    if (countryInput) {
      const countryDropdown = countryInput.parentElement.querySelector('.country-dropdown');
      AppModules.booking.setupCountrySearch(countryInput, countryDropdown, () => {
        renderExtraGuests();
        AppModules.booking.recalc();
      });
    }

    if (phoneCodeBtn) {
      AppModules.booking.setupGuestPhoneCodeSearch(guestIndex);
    }
  });
}


})();
