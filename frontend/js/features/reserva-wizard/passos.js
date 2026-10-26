// Estado privado; interface partilhada em AppModules.reservas.
(() => {
AppModules.define('reservas', {
  renderSuiteCards: { get: () => renderSuiteCards },
  updateWizSummary: { get: () => updateWizSummary },
  wizGuestSearch: { get: () => wizGuestSearch },
  resetMobileSteps: { get: () => resetMobileSteps },
  showMobileStep: { get: () => showMobileStep },
  goToMobileStep: { get: () => goToMobileStep },
  mobileStepNext: { get: () => mobileStepNext },
  mobileStepPrev: { get: () => mobileStepPrev },
  stepGuestCount: { get: () => stepGuestCount },
  toggleMobileFold: { get: () => toggleMobileFold },
  setMobileCanal: { get: () => setMobileCanal },
  setMobileBreakfast: { get: () => setMobileBreakfast },
  renderMobileStay: { get: () => renderMobileStay },
});

// ── Nova reserva no telemóvel: três passos sobre o mesmo formulário ──
// Os campos são os mesmos do computador; no telemóvel cada passo mostra só a
// sua parte (atributos data-mstep, ver views/reservas.css). Documentos e
// acompanhantes ficam recolhidos: o hóspede preenche-os no pré-check-in.
const MOBILE_STEP_NAMES = ['Estadia', 'Hóspede', 'Preço e confirmação'];
const SHORT_MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const SHORT_WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
// Canais com botão próprio; os restantes escolhem-se em «Mais…».
const MAIN_CHANNELS = ['direto', 'booking', 'airbnb'];
const OPTIONAL_GUEST_FIELDS = ['f-nascimento', 'f-local-nascimento', 'f-doc-tipo', 'f-doc-num', 'f-doc-emissor', 'f-nif', 'f-empresa', 'f-morada', 'f-cp', 'f-cidade'];
let mobileStep = 1;
let mobileFolds = { docs: false, extras: false, price: false, canal: false };

// «3 jul» (com o ano só quando não é o atual).
function shortDate(iso) {
  const year = iso.slice(0, 4) === String(new Date().getFullYear()) ? '' : ` ${iso.slice(0, 4)}`;
  return `${Number(iso.slice(8, 10))} ${SHORT_MONTHS[Number(iso.slice(5, 7)) - 1]}${year}`;
}

function resetMobileSteps() {
  mobileStep = 1;
  // Ao editar uma ficha que já tem documentos, esses campos abrem logo.
  const hasDocs = OPTIONAL_GUEST_FIELDS.some(id => (document.getElementById(id)?.value || '').trim());
  // O mesmo para preços por noite, total ou desconto já alterados.
  const priceEdited = Object.keys(AppModules.reservas._nightlyOverrides || {}).length > 0
    || AppModules.reservas._manualTotalOverride != null
    || (parseFloat(document.getElementById('f-discount-val')?.value) || 0) > 0;
  const canal = document.getElementById('f-canal')?.value;
  mobileFolds = { docs: hasDocs, extras: false, price: priceEdited, canal: !!canal && !MAIN_CHANNELS.includes(canal) };
  renderMobileSteps();
}

// Mostra um passo sem validar (ex.: a gravação encontrou um campo em falta).
function showMobileStep(step) {
  if (!(step >= 1 && step <= MOBILE_STEP_NAMES.length)) return;
  mobileStep = step;
  renderMobileSteps();
  const modal = document.querySelector('#modal-bg .resf-modal');
  if (modal) modal.scrollTop = 0;
}

// Numa reserva nova, avançar valida os passos pelo caminho; na edição pode
// ir-se a qualquer passo.
function goToMobileStep(step) {
  if (step === mobileStep) return;
  if (!AppModules.core.editingId) {
    for (let current = mobileStep; current < step; current++) if (!validateWizStep(current)) return;
  }
  showMobileStep(step);
}
const mobileStepNext = () => goToMobileStep(mobileStep + 1);
const mobileStepPrev = () => goToMobileStep(mobileStep - 1);

function stepGuestCount(inputId, delta) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const min = Number(input.min) || 0;
  const max = Number(input.max) || 20;
  const next = Math.min(max, Math.max(min, (parseInt(input.value, 10) || 0) + delta));
  if (String(next) !== input.value) {
    input.value = String(next);
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  renderMobileControls();
}

function toggleMobileFold(name) {
  mobileFolds[name] = !mobileFolds[name];
  renderMobileControls();
}

// Botões de canal: escrevem no mesmo campo do computador; «Mais…» mostra a lista toda.
function setMobileCanal(value) {
  const select = document.getElementById('f-canal');
  if (!select) return;
  if (!value) {
    mobileFolds.canal = true;
  } else {
    mobileFolds.canal = false;
    if (select.value !== value) {
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
  renderMobileStay();
}

function setMobileBreakfast(included) {
  const select = document.getElementById('f-breakfast');
  if (!select) return;
  select.value = included ? 'true' : 'false';
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

// Cartão das datas («sex, 3 jul»), pequeno-almoço e canal, a partir dos campos do formulário.
function renderMobileStay() {
  const value = id => document.getElementById(id)?.value || '';
  const ci = AppModules.core.normalizeIsoDateValue(value('f-checkin'));
  const co = AppModules.core.normalizeIsoDateValue(value('f-checkout'));
  const showDate = (id, iso) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = iso ? `${SHORT_WEEKDAYS[new Date(`${iso}T12:00:00`).getDay()]}, ${shortDate(iso)}` : 'Escolher';
    el.classList.toggle('empty', !iso);
  };
  showDate('resf-checkin-display', ci);
  showDate('resf-checkout-display', co);
  const nights = ci && co ? window.ReservationDates.countNights(ci, co) : 0;
  const pill = document.getElementById('resf-dates-nights');
  if (pill) pill.textContent = nights > 0 ? `${nights} noite${nights !== 1 ? 's' : ''}` : '→';
  const breakfast = document.getElementById('resf-breakfast-switch');
  if (breakfast) breakfast.checked = value('f-breakfast') === 'true';
  const canal = value('f-canal');
  const more = mobileFolds.canal || !MAIN_CHANNELS.includes(canal);
  document.querySelectorAll('#resf-canal-group [data-canal]').forEach(chip => {
    chip.setAttribute('aria-pressed', String(chip.dataset.canal ? !more && chip.dataset.canal === canal : more));
  });
  document.getElementById('resf-canal-group')?.classList.toggle('resf-canal-more', more);
}

// Contadores no limite e blocos recolhidos (o número de acompanhantes muda
// com os adultos e crianças).
function renderMobileControls() {
  document.querySelectorAll('#modal-bg [data-stepper-for]').forEach(btn => {
    const input = document.getElementById(btn.dataset.stepperFor);
    const value = parseInt(input?.value, 10) || 0;
    const delta = Number(btn.dataset.stepperDelta);
    btn.disabled = delta < 0 ? value <= (Number(input?.min) || 0) : value >= (Number(input?.max) || 20);
  });
  const section = document.getElementById('resf-guest-section');
  section?.classList.toggle('resf-docs-shown', mobileFolds.docs);
  section?.classList.toggle('resf-extras-shown', mobileFolds.extras);
  document.getElementById('resf-docs-toggle')?.setAttribute('aria-expanded', String(mobileFolds.docs));
  document.getElementById('modal-bg')?.classList.toggle('resf-price-shown', mobileFolds.price);
  document.getElementById('resf-price-toggle')?.setAttribute('aria-expanded', String(mobileFolds.price));
  const extras = document.querySelectorAll('#extra-guests-container .extra-guest-row').length;
  const extrasToggle = document.getElementById('resf-extras-toggle');
  if (extrasToggle) {
    extrasToggle.hidden = !extras;
    extrasToggle.setAttribute('aria-expanded', String(mobileFolds.extras));
    const title = document.getElementById('resf-extras-toggle-title');
    if (title) title.textContent = `${extras === 1 ? 'Acompanhante' : 'Acompanhantes'} (${extras})`;
  }
  renderMobileStay();
}

function renderMobileSteps() {
  const bg = document.getElementById('modal-bg');
  if (!bg) return;
  const editing = !!AppModules.core.editingId;
  bg.dataset.mstep = String(mobileStep);
  bg.classList.toggle('resf-mobile-editing', editing);
  document.querySelectorAll('#resf-mstepper [data-mstep-tab]').forEach(tab => {
    const step = Number(tab.dataset.mstepTab);
    tab.classList.toggle('done', step < mobileStep);
    if (step === mobileStep) tab.setAttribute('aria-current', 'step');
    else tab.removeAttribute('aria-current');
  });
  const label = document.getElementById('resf-mstepper-label');
  if (label) label.textContent = `Passo ${mobileStep} de ${MOBILE_STEP_NAMES.length} · ${MOBILE_STEP_NAMES[mobileStep - 1]}`;
  const prev = document.getElementById('resf-mstep-prev');
  const next = document.getElementById('resf-mstep-next');
  if (prev) prev.hidden = editing || mobileStep === 1;
  if (next) next.hidden = editing || mobileStep === MOBILE_STEP_NAMES.length;
  if (mobileStep === MOBILE_STEP_NAMES.length) buildMobileSummary();
  renderMobileControls();
}

// Resumo do último passo, com atalhos para corrigir a estadia ou o hóspede.
function buildMobileSummary() {
  const box = document.getElementById('resf-msummary');
  if (!box) return;
  const esc = AppModules.core.escapeHtml;
  const value = id => (document.getElementById(id)?.value || '').trim();
  const suite = AppModules.core.accommodations.find(a => a.id === value('f-aloj'));
  const ci = AppModules.core.normalizeIsoDateValue(value('f-checkin'));
  const co = AppModules.core.normalizeIsoDateValue(value('f-checkout'));
  const nights = ci && co ? window.ReservationDates.countNights(ci, co) : 0;
  const adults = parseInt(value('f-num-adultos'), 10) || 0;
  const children = parseInt(value('f-num-criancas'), 10) || 0;
  const canal = document.getElementById('f-canal');
  const people = [`${adults} adulto${adults !== 1 ? 's' : ''}`, children ? `${children} criança${children !== 1 ? 's' : ''}` : ''].filter(Boolean).join(', ');
  const stay = [ci && co ? `${shortDate(ci)} → ${shortDate(co)}` : '', nights ? `${nights} noite${nights !== 1 ? 's' : ''}` : '', people, canal?.selectedOptions[0]?.textContent || ''].filter(Boolean).join(' · ');
  const phone = value('f-tel-num') ? `${value('f-tel-prefix')} ${value('f-tel-num')}`.trim() : '';
  const contact = [AppModules.core.realEmail(value('f-email')), phone].filter(Boolean).join(' · ');
  const row = (title, sub, step) => `<div class="resf-msummary-row">
      <div class="resf-msummary-text"><div class="resf-msummary-title">${esc(title)}</div>${sub ? `<div class="resf-msummary-sub">${esc(sub)}</div>` : ''}</div>
      <button type="button" class="resf-msummary-edit" data-mstep-tab="${step}" data-on-click="index-mobile-step-go">Alterar</button>
    </div>`;
  box.innerHTML = row(suite?.name || 'Alojamento por escolher', stay, 1) + row(value('f-nome-completo') || 'Hóspede por indicar', contact, 2);
}

function validateWizStep(step) {
  if (step === 1) {
    const ci = AppModules.core.normalizeIsoDateValue(document.getElementById('f-checkin').value);
    const co = AppModules.core.normalizeIsoDateValue(document.getElementById('f-checkout').value);
    if (!ci) { AppModules.core.toast('⚠️ Seleciona a data de check-in.', 'error'); return false; }
    if (!co) { AppModules.core.toast('⚠️ Seleciona a data de check-out.', 'error'); return false; }
    if (new Date(co) <= new Date(ci)) { AppModules.core.toast('⚠️ O check-out deve ser depois do check-in.', 'error'); return false; }
    const alojVal = document.getElementById('f-aloj').value;
    if (!alojVal) { AppModules.core.toast('⚠️ Seleciona um alojamento.', 'error'); return false; }
    if (AppModules.reservas._unavailableSuites.has(alojVal)) { AppModules.core.toast('⚠️ Este alojamento está ocupado nas datas selecionadas.', 'error'); return false; }
    const suite = AppModules.core.accommodations.find(a => a.id === alojVal);
    const requestedGuests = parseInt(document.getElementById('f-num-hospedes')?.value, 10) || 1;
    const maxGuests = Number(suite?.max_guests) || 0;
    if (maxGuests > 0 && requestedGuests > maxGuests) {
      AppModules.core.toast(`⚠️ Capacidade máxima: ${maxGuests} hóspede${maxGuests !== 1 ? 's' : ''}.`, 'error');
      return false;
    }
    return true;
  }
  if (step === 2) {
    if (!document.getElementById('f-nome-completo').value.trim())
      { AppModules.core.toast('⚠️ Introduz o nome completo do hóspede.', 'error'); return false; }
    return true;
  }
  return true;
}

function updateWizSummary() {
  const nome = (document.getElementById('f-nome-completo')?.value || '').trim();
  const apelido = '';
  const alojId = document.getElementById('f-aloj')?.value;
  const suite = AppModules.core.accommodations.find(a => a.id === alojId);
  const ci = AppModules.core.normalizeIsoDateValue(document.getElementById('f-checkin')?.value);
  const co = AppModules.core.normalizeIsoDateValue(document.getElementById('f-checkout')?.value);
  const nights = ci && co ? Math.max(0, Math.round((new Date(co) - new Date(ci)) / 86400000)) : 0;
  const total = document.getElementById('f-total')?.value;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('ws-guest', [nome, apelido].filter(Boolean).join(' ') || '—');
  set('ws-suite', suite?.name || '—');
  set('ws-checkin', ci ? AppModules.core.formatDate(ci) : '—');
  set('ws-nights', nights > 0 ? nights + ' noite' + (nights !== 1 ? 's' : '') : '—');
  set('ws-total', total && Number(total) > 0 ? ReservationMoney.format(total) : '—');
  renderMobileStay();
}

function renderSuiteCards() {
  const grid = document.getElementById('suite-cards-grid');
  if (!grid) return;
  const alojEl = document.getElementById('f-aloj');
  let currentAlojId = alojEl?.value;
  const ci = AppModules.core.normalizeIsoDateValue(document.getElementById('f-checkin')?.value);
  const co = AppModules.core.normalizeIsoDateValue(document.getElementById('f-checkout')?.value);
  const requestedGuests = parseInt(document.getElementById('f-num-hospedes')?.value, 10) || 1;
  const datesSet = !!(ci && co && new Date(co) > new Date(ci));
  if (!AppModules.core.accommodations.length) {
    grid.innerHTML = '<p style="font-size:13px;color:var(--cinza);">Nenhum alojamento disponível.</p>';
    return;
  }
  const currentSuite = AppModules.core.accommodations.find(a => a.id === currentAlojId);
  const currentMaxGuests = Number(currentSuite?.max_guests) || 0;
  if (currentMaxGuests > 0 && requestedGuests > currentMaxGuests) {
    if (alojEl) alojEl.value = '';
    currentAlojId = '';
    updateWizSummary();
  }
  grid.innerHTML = AppModules.core.accommodations.map(a => {
    const cor = a.color || 'var(--marca)';
    const maxGuests = Number(a.max_guests) || 0;
    const unavail = datesSet && AppModules.reservas._unavailableSuites.has(a.id);
    const overCapacity = maxGuests > 0 && requestedGuests > maxGuests;
    const blocked = unavail || overCapacity;
    const sel = !blocked && currentAlojId === a.id ? 'selected' : '';
    const cls = `suite-card-opt${sel ? ' selected' : ''}${blocked ? ' unavailable' : ''}${overCapacity ? ' capacity-blocked' : ''}`;
    const click = blocked ? '' : `${AppActions.attrs("click", "passos-select-suite-card-069e405", [String((a.id) ?? '')])}`;
    const title = overCapacity
      ? `Capacidade máxima: ${maxGuests} hóspede${maxGuests !== 1 ? 's' : ''}`
      : (unavail ? 'Indisponível nas datas selecionadas' : a.name);
    const coverUrl = a.cover_image ? (a.cover_image.startsWith('http') ? a.cover_image : AppModules.core.API_BASE + a.cover_image) : '';
    return `<div class="${cls}" ${click} title="${title}">
      <div class="suite-check"><i data-lucide="check" style="width:10px;height:10px;color:#fff;"></i></div>
      ${coverUrl
        ? `<img src="${AppModules.core.escapeHtml(AppModules.core.mediaThumb(coverUrl, 480))}" class="suite-card-cover" alt="${AppModules.core.escapeHtml(a.name)}" loading="lazy" decoding="async">`
        : blocked
          ? `<div class="suite-card-dot" style="font-size:16px;margin-bottom:6px;">🔒</div>`
          : `<div class="suite-card-dot" style="width:10px;height:10px;border-radius:50%;background:${cor};margin-bottom:8px;"></div>`}
      ${blocked ? `<div class="suite-card-lock">🔒</div>` : ''}
      <div class="suite-card-body">
        <div class="suite-card-name">${AppModules.core.escapeHtml(a.name)}</div>
        ${blocked
          ? `${unavail ? `<div class="suite-card-unavail-lbl">Indisponível</div>` : ''}
             ${overCapacity ? `<div class="suite-card-capacity-lbl">Capacidade máxima: ${maxGuests} hóspede${maxGuests !== 1 ? 's' : ''}</div>` : ''}`
          : suiteCardPriceHtml(a, ci, co)}
      </div>
    </div>`;
  }).join('');
  if (window.lucide) lucide.createIcons();
}

// Preço do cartão: dinâmico (média/noite + total + ocupação extra) quando há datas,
// tal como no frontoffice; senão, o preço-base estático.
function suiteCardPriceHtml(a, ci, co) {
  const datesOk = ci && co && new Date(co) > new Date(ci);
  const fallback = `<div class="suite-card-price">${ReservationMoney.formatShort(a.price_per_night)}<span class="suite-card-sub"> / noite</span></div>`;
  if (!datesOk || !window.ReservationPricing) return fallback;
  const numHospedes = parseInt(document.getElementById('f-num-hospedes')?.value, 10) || 1;
  const totals = window.ReservationPricing.calculateReservationTotal(a, [], {
    check_in: ci,
    check_out: co,
    num_guests: numHospedes,
    birth_dates: AppModules.reservas.wizEffectiveBirthDates(),
    pricing_periods: AppModules.reservas._cachedPricingPeriods[a.id] || [],
  });
  if (!totals || !totals.baseAmount || !totals.nights) return fallback;
  const avg = totals.baseAmount / totals.nights;
  const grand = totals.baseAmount + (totals.extraOccupancyCost || 0);
  const extra = totals.extraOccupancyCost > 0
    ? `<div class="suite-card-extra">+ ${ReservationMoney.format(totals.extraOccupancyCost)} ocupação extra</div>`
    : '';
  return `<div class="suite-card-price">${ReservationMoney.format(avg)}<span class="suite-card-sub"> / noite</span>
    <div class="suite-card-total">${ReservationMoney.format(grand)} total</div>${extra}</div>`;
}

function selectSuiteCard(id) {
  if (AppModules.reservas._unavailableSuites.has(id)) return;
  const suite = AppModules.core.accommodations.find(a => a.id === id);
  const requestedGuests = parseInt(document.getElementById('f-num-hospedes')?.value, 10) || 1;
  const maxGuests = Number(suite?.max_guests) || 0;
  if (maxGuests > 0 && requestedGuests > maxGuests) return;
  const sel = document.getElementById('f-aloj');
  const previous = sel?.value;
  if (sel) sel.value = id;
  delete AppModules.reservas._cachedPricingPeriods[id]; // force refresh on next calcTotal
  // Trocar de alojamento parte de preços novos (os overrides eram do anterior).
  if (previous !== id) {
    AppModules.reservas._nightlyOverrides = {};
    AppModules.reservas._manualTotalOverride = null;
    AppModules.reservas._nightlyGridSig = '';
    const allInp = document.getElementById('resf-nightly-all-val'); if (allInp) allInp.value = '';
  }
  // A nova suite principal não pode continuar também na lista de quartos extra.
  if (AppModules.reservas._wizExtraRooms.some(r => r.accommodation_id === id)) {
    AppModules.reservas._wizExtraRooms = AppModules.reservas._wizExtraRooms.filter(r => r.accommodation_id !== id);
  }
  const extraPanel = document.getElementById('wiz-extra-rooms-panel');
  if (extraPanel && extraPanel.style.display !== 'none') AppModules.reservas.renderWizExtraRooms();
  renderSuiteCards();
  AppModules.reservas.calcTotal();
}

// ── GUEST SEARCH AUTOCOMPLETE ──
let _guestSearchTimer = null;
let _guestSearchResults = [];

async function wizGuestSearch(q) {
  const drop = document.getElementById('wiz-guest-drop');
  if (!drop) return;
  if (!q || q.length < 2) { _guestSearchResults = []; drop.innerHTML = ''; drop.classList.remove('open'); return; }
  clearTimeout(_guestSearchTimer);
  _guestSearchTimer = setTimeout(async () => {
    try {
      const data = await AppModules.core.apiGet(`/api/guests?search=${encodeURIComponent(q)}`);
      _guestSearchResults = (data.data || []).slice(0, 8);
      if (!_guestSearchResults.length) {
        drop.innerHTML = '<div style="padding:10px 14px;font-size:12px;color:var(--cinza);">Sem resultados</div>';
        drop.classList.add('open');
        return;
      }
      drop.innerHTML = _guestSearchResults.map((g, idx) => {
        const name = [g.first_name, g.last_name].filter(Boolean).join(' ') || g.name || '—';
        const meta = [g.email, g.phone].filter(Boolean).join(' · ');
        return `<div class="guest-drop-item" ${AppActions.attrs("click", "passos-wiz-select-guest-40ccb6d", [idx])}>
          <div class="gdi-name">${name.replace(/</g, '&lt;')}</div>
          <div class="gdi-meta">${meta.replace(/</g, '&lt;')}</div>
        </div>`;
      }).join('');
      drop.classList.add('open');
    } catch (e) { drop.classList.remove('open'); }
  }, 280);
}

function wizSelectGuest(idx) {
  const g = _guestSearchResults[idx];
  if (!g) return;
  document.getElementById('f-nome-completo').value = [g.first_name, g.last_name].filter(Boolean).join(' ') || g.name || '';
  document.getElementById('f-email').value = g.email || '';
  const rawPhone = g.phone || '';
  const mc = AppModules.reservas.DIAL_COUNTRIES.find(c => rawPhone.startsWith(c.dial));
  if (mc) {
    document.getElementById('f-tel-prefix').value = mc.dial;
    document.getElementById('f-tel-num').value = rawPhone.slice(mc.dial.length).trim();
  } else {
    document.getElementById('f-tel-num').value = rawPhone;
  }
  document.getElementById('f-pais').value = g.country || g.nationality || '';
  document.getElementById('f-doc-tipo').value = g.document_type || '';
  document.getElementById('f-doc-num').value = g.document_number || '';
  document.getElementById('f-doc-emissor').value = g.document_issuer_country || '';
  document.getElementById('f-nascimento').value = AppModules.reservas.formatDateForBirthInput(g.birth_date || '');
  document.getElementById('f-local-nascimento').value = g.birth_city || '';
  document.getElementById('f-nif').value = g.nif || '';
  document.getElementById('f-empresa').value = g.company || '';
  document.getElementById('f-morada').value = g.address || '';
  document.getElementById('f-cp').value = g.postal_code || '';
  document.getElementById('f-cidade').value = g.city || '';
  AppModules.reservas.updateForeignRequirements();
  AppModules.reservas.calcTotal();
  updateWizSummary();
  const drop = document.getElementById('wiz-guest-drop');
  if (drop) { drop.innerHTML = ''; drop.classList.remove('open'); }
  const si = document.getElementById('wiz-guest-search');
  if (si) si.value = '';
  AppModules.core.toast('✅ Dados do hóspede preenchidos.', 'success');
}

// Close guest dropdowns when clicking outside
document.addEventListener('click', function(e) {
  const birthPop = document.getElementById('birth-date-calendar-pop');
  if (birthPop && !birthPop.contains(e.target) && !e.target.closest('.birth-date-control')) {
    closeBirthDateCalendar();
  }
  const mainDrop = document.getElementById('wiz-guest-drop');
  const mainWrap = document.getElementById('wiz-guest-search')?.closest('.guest-search-wrap');
  if (mainDrop && mainWrap && !mainWrap.contains(e.target)) mainDrop.classList.remove('open');
  document.querySelectorAll('.extra-guest-row').forEach(row => {
    const wrap = row.querySelector('.guest-search-wrap');
    const idx = row.dataset.extraIdx;
    const drop = document.getElementById(`extra-guest-drop-${idx}`);
    if (drop && wrap && !wrap.contains(e.target)) drop.classList.remove('open');
  });
});


AppActions.register({
  "passos-wiz-select-guest-40ccb6d": (el, event, args) => { wizSelectGuest(args[0]) },
  "passos-select-suite-card-069e405": (el, event, args) => { selectSuiteCard(args[0]) },
}, "click");

// Limpeza da funcionalidade ao sair ou trocar de organização.
AppModules.onReset('features/reserva-wizard/passos.js', () => {
  clearTimeout(_guestSearchTimer); clearInterval(_guestSearchTimer); _guestSearchTimer = null;
  _guestSearchResults = [];
});

})();
