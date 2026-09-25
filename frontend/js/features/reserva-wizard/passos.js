// Estado privado; interface partilhada em AppModules.reservas.
(() => {
AppModules.define('reservas', {
  renderSuiteCards: { get: () => renderSuiteCards },
  updateWizSummary: { get: () => updateWizSummary },
  wizGuestSearch: { get: () => wizGuestSearch },
});

function updateWizUI() {
  const total = 3;
  for (let i = 1; i <= total; i++) {
    const item = document.getElementById('ws-' + i);
    if (item) {
      item.classList.remove('wiz-active', 'wiz-done');
      if (i === AppModules.reservas.wizStep) item.classList.add('wiz-active');
      else if (i < AppModules.reservas.wizStep) item.classList.add('wiz-done');
    }
    const panel = document.getElementById('wiz-panel-' + i);
    if (panel) panel.classList.toggle('active', i === AppModules.reservas.wizStep);
  }
  const counter = document.getElementById('wiz-step-counter');
  if (counter) counter.textContent = `Passo ${AppModules.reservas.wizStep} de ${total}`;
  const numEl = document.getElementById('wiz-step-num');
  if (numEl) numEl.textContent = AppModules.reservas.wizStep;

  const prev = document.getElementById('btn-wiz-prev');
  const next = document.getElementById('btn-wiz-next');
  const save = document.getElementById('btn-guardar');
  if (prev) prev.style.display = AppModules.reservas.wizStep > 1 ? '' : 'none';
  if (next) next.style.display = AppModules.reservas.wizStep < total ? '' : 'none';
  if (save) {
    save.style.display = AppModules.reservas.wizStep === total ? '' : 'none';
    save.innerHTML = (AppModules.core.editingId
      ? `<i data-lucide="save" style="width:14px;height:14px;"></i> Atualizar Reserva`
      : `<i data-lucide="save" style="width:14px;height:14px;"></i> Guardar Reserva`);
  }
  if (AppModules.reservas.wizStep === 1) { renderSuiteCards(); AppModules.reservas.calcTotal(); }
  if (AppModules.reservas.wizStep === 3) buildWizConfirm();
  if (window.lucide) lucide.createIcons();
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

function wizNext() {
  if (!validateWizStep(AppModules.reservas.wizStep)) return;
  if (AppModules.reservas.wizStep < 3) {
    AppModules.reservas.wizStep++;
    updateWizUI();
    const body = document.querySelector('.modal-wizard .modal-body');
    if (body) body.scrollTop = 0;
  }
}

function wizPrev() {
  if (AppModules.reservas.wizStep > 1) {
    AppModules.reservas.wizStep--;
    updateWizUI();
    const body = document.querySelector('.modal-wizard .modal-body');
    if (body) body.scrollTop = 0;
  }
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
  set('ws-total', total && Number(total) > 0 ? '€' + Number(total).toLocaleString('pt-PT', { minimumFractionDigits: 2 }) : '—');
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
        ? `<img src="${AppModules.core.escapeHtml(AppModules.core.safeMediaUrl(coverUrl))}" class="suite-card-cover" alt="${AppModules.core.escapeHtml(a.name)}" loading="lazy">`
        : blocked
          ? `<div style="font-size:16px;margin-bottom:6px;">🔒</div>`
          : `<div style="width:10px;height:10px;border-radius:50%;background:${cor};margin-bottom:8px;"></div>`}
      ${blocked ? `<div class="suite-card-lock">🔒</div>` : ''}
      <div class="suite-card-name">${AppModules.core.escapeHtml(a.name)}</div>
      ${blocked
        ? `${unavail ? `<div class="suite-card-unavail-lbl">Indisponível</div>` : ''}
           ${overCapacity ? `<div class="suite-card-capacity-lbl">Capacidade máxima: ${maxGuests} hóspede${maxGuests !== 1 ? 's' : ''}</div>` : ''}`
        : suiteCardPriceHtml(a, ci, co)}
    </div>`;
  }).join('');
  if (window.lucide) lucide.createIcons();
}

// Preço do cartão: dinâmico (média/noite + total + ocupação extra) quando há datas,
// tal como no frontoffice; senão, o preço-base estático.
function suiteCardPriceHtml(a, ci, co) {
  const datesOk = ci && co && new Date(co) > new Date(ci);
  const fallback = `<div class="suite-card-price">€${a.price_per_night}<span class="suite-card-sub"> / noite</span></div>`;
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
    ? `<div class="suite-card-extra">+ €${totals.extraOccupancyCost.toFixed(2)} ocupação extra</div>`
    : '';
  return `<div class="suite-card-price">€${avg.toFixed(2)}<span class="suite-card-sub"> / noite</span>
    <div class="suite-card-total">€${grand.toFixed(2)} total</div>${extra}</div>`;
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

function buildWizConfirm() {
  AppModules.reservas.calcTotal();
  const nome = (document.getElementById('f-nome-completo')?.value || '').trim();
  const apelido = '';
  const email = document.getElementById('f-email')?.value || '';
  const prefix = document.getElementById('f-tel-prefix')?.value || '';
  const telNum = document.getElementById('f-tel-num')?.value || '';
  const pais = document.getElementById('f-pais')?.value || '';
  const alojId = document.getElementById('f-aloj')?.value;
  const suite = AppModules.core.accommodations.find(a => a.id === alojId);
  const cor = suite?.color || 'var(--marca)';
  const ci = AppModules.core.normalizeIsoDateValue(document.getElementById('f-checkin')?.value);
  const co = AppModules.core.normalizeIsoDateValue(document.getElementById('f-checkout')?.value);
  const nights = ci && co ? Math.max(0, Math.round((new Date(co) - new Date(ci)) / 86400000)) : 0;
  const canal = document.getElementById('f-canal')?.value || '';
  const numH = parseInt(document.getElementById('f-num-hospedes')?.value) || 1;
  const bkf = document.getElementById('f-breakfast')?.value === 'true';
  const total = parseFloat(document.getElementById('f-total')?.value) || 0;
  const extraOccupancyCost = AppModules.reservas.getExtraOccupancyCharge(suite, numH, nights, AppModules.reservas.wizEffectiveBirthDates(), ci);
  const hasPeriods = (AppModules.reservas._cachedPricingPeriods[alojId] || []).length > 0;
  const hasNightlyEdits = Object.keys(AppModules.reservas._nightlyOverrides).length > 0;
  const priceLabel = hasNightlyEdits ? 'Preço por noite personalizado' : (hasPeriods ? 'Preço dinâmico' : `€${suite?.price_per_night || 0}/noite`);
  const card = document.getElementById('wiz-conf-card');
  if (!card) return;
  card.innerHTML = `<div class="wiz-conf-grid">
    <div class="wiz-conf-cell">
      <div class="wiz-conf-lbl">Hóspede</div>
      <div class="wiz-conf-val">${[nome, apelido].filter(Boolean).join(' ') || '—'}</div>
      <div class="wiz-conf-sub">${email}</div>
      <div class="wiz-conf-sub">${(prefix + ' ' + telNum).trim()} · ${pais}</div>
    </div>
    <div class="wiz-conf-cell">
      <div class="wiz-conf-lbl">Alojamento</div>
      <div class="wiz-conf-val" style="display:flex;align-items:center;gap:6px;">
        <span style="width:8px;height:8px;border-radius:50%;background:${cor};flex-shrink:0;display:inline-block;"></span>
        ${AppModules.core.escapeHtml(suite?.name || '—')}
      </div>
      <div class="wiz-conf-sub">${canal} · ${numH} hóspede${numH !== 1 ? 's' : ''}</div>
      <div class="wiz-conf-sub">${bkf ? '🥐 Pequeno-almoço incl.' : 'Sem pequeno-almoço'}</div>
      ${AppModules.reservas._wizExtraRooms.length > 0 ? `<div class="wiz-conf-sub">+ ${AppModules.reservas._wizExtraRooms.length} quarto${AppModules.reservas._wizExtraRooms.length !== 1 ? 's' : ''} extra: ${AppModules.core.escapeHtml(AppModules.reservas._wizExtraRooms.map(r => r.name).join(', '))}</div>` : ''}
    </div>
    <div class="wiz-conf-cell">
      <div class="wiz-conf-lbl">Datas</div>
      <div class="wiz-conf-val">${ci ? AppModules.core.formatDate(ci) : '—'} → ${co ? AppModules.core.formatDate(co) : '—'}</div>
      <div class="wiz-conf-sub">${nights} noite${nights !== 1 ? 's' : ''}</div>
    </div>
    <div class="wiz-conf-cell accent">
      <div class="wiz-conf-lbl">Total</div>
      <div class="wiz-conf-val">€${total.toLocaleString('pt-PT', { minimumFractionDigits: 2 })}</div>
      <div class="wiz-conf-sub">${priceLabel} × ${nights} noites${extraOccupancyCost ? ` · extra €${extraOccupancyCost.toFixed(2)}` : ''}</div>
    </div>
  </div>`;
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
