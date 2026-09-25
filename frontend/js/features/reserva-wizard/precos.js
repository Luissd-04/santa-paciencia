// Estado privado; interface partilhada em AppModules.reservas.
(() => {
AppModules.define('reservas', {
  applyNightlyToAll: { get: () => applyNightlyToAll },
  calcTotal: { get: () => calcTotal },
  distributeManualTotal: { get: () => distributeManualTotal },
  onManualTotalInput: { get: () => onManualTotalInput },
  resetFormDiscount: { get: () => resetFormDiscount },
  resetNightlyOverrides: { get: () => resetNightlyOverrides },
  resetNightlyState: { get: () => resetNightlyState },
  setFormDiscountType: { get: () => setFormDiscountType },
  snapshotManualDistribWeights: { get: () => snapshotManualDistribWeights },
});

async function calcTotal() {
  const ci = AppModules.core.normalizeIsoDateValue(document.getElementById('f-checkin').value);
  const co = AppModules.core.normalizeIsoDateValue(document.getElementById('f-checkout').value);
  const numHospedes = parseInt(document.getElementById('f-num-hospedes').value) || 1;
  const breakfast = document.getElementById('f-breakfast')?.value === 'true';
  const alojId = document.getElementById('f-aloj').value;
  const suite = AppModules.core.accommodations.find(a => a.id === alojId);

  // Update nights badge from dates alone (no suite needed)
  const badge = document.getElementById('wiz-nights-badge-wrap');
  const valEl = document.getElementById('wiz-nights-val');
  if (ci && co) {
    const noitesOnly = window.ReservationDates?.countNights(ci, co) || 0;
    if (badge) badge.style.display = noitesOnly > 0 ? '' : 'none';
    if (valEl) valEl.textContent = noitesOnly;
    // Trigger availability check (debounced)
    clearTimeout(AppModules.reservas._availTimer);
    AppModules.reservas._availTimer = setTimeout(AppModules.reservas.fetchSuiteAvailability, 300);
    // Períodos de todos os alojamentos para os cartões mostrarem preço dinâmico.
    AppModules.reservas.preloadAllPricingPeriods();
  } else {
    if (badge) badge.style.display = 'none';
    AppModules.reservas._unavailableSuites = new Set();
    AppModules.reservas.renderSuiteCards();
  }

  if (ci && co && suite) {
    const pricingPeriods = await AppModules.reservas.loadWizPricingPeriods(alojId);
    const totals = window.ReservationPricing.calculateReservationTotal(suite, AppModules.core.servicosData, {
      check_in: ci,
      check_out: co,
      num_guests: numHospedes,
      breakfast_included: breakfast,
      birth_dates: AppModules.reservas.wizEffectiveBirthDates(),
      pricing_periods: pricingPeriods,
      nightly_prices: AppModules.reservas.nightlyOverrideArray(),
    });
    AppModules.reservas._nightlyPrices = totals.nightlyPrices || [];
    // Padrão por noite (sem overrides) para referência em cinzento na grelha
    const stdNightly = window.ReservationPricing.buildNightlyPrices(Number(suite.price_per_night || 0), ci, co, pricingPeriods);
    AppModules.reservas._standardNightlyByDate = Object.fromEntries(stdNightly.map(n => [n.date, n.price]));
    renderNightlyGrid();

    // Quartos extra (multi-suite): somam-se à suite principal antes do desconto;
    // os extras (taxa turística, PA, ocupação extra) já só contam para a principal.
    AppModules.reservas._wizMultiSuite = AppModules.reservas._wizExtraRooms.length > 0;
    const combinedBaseTotal = totals.totalAmount + AppModules.reservas.wizExtraRoomsSubtotal();

    const discVal = parseFloat(document.getElementById('f-discount-val')?.value) || 0;
    const discType = document.getElementById('f-discount-type')?.value || 'pct';
    let finalTotal = combinedBaseTotal;
    if (discVal > 0) {
      finalTotal = discType === 'pct'
        ? combinedBaseTotal * (1 - Math.min(discVal, 100) / 100)
        : Math.max(0, combinedBaseTotal - discVal);
    }
    // Total manual sobrepõe-se a tudo (mas coexiste com o desconto, que continua visível).
    if (AppModules.reservas._manualTotalOverride != null) finalTotal = AppModules.reservas._manualTotalOverride;

    document.getElementById('f-noites').value = totals.nights;
    document.getElementById('f-total').value = finalTotal.toFixed(2);
    const badge2 = document.getElementById('resf-total-badge');
    if (badge2) badge2.textContent = `€${finalTotal.toFixed(2)}`;

    // Breakdown + campo de total editável
    const extras = (totals.extraOccupancyCost || 0) + (totals.touristTax || 0) + (totals.breakfastCost || 0);
    AppModules.reservas._lastExtrasTotal = extras;
    const baseEl = document.getElementById('resf-nightly-base');
    if (baseEl) baseEl.textContent = `€${(totals.baseAmount || 0).toFixed(2)}`;
    const extrasEl = document.getElementById('resf-nightly-extras');
    const extrasWrap = document.getElementById('resf-nightly-extras-wrap');
    if (extrasEl) extrasEl.textContent = `€${extras.toFixed(2)}`;
    if (extrasWrap) extrasWrap.style.display = extras > 0.005 ? '' : 'none';
    updateNightlyTotalField(finalTotal);

    const discWrap = document.getElementById('resf-discount-wrap');
    if (discWrap) discWrap.style.display = '';
    const discPreview = document.getElementById('f-discount-preview');
    if (discPreview) {
      const saving = totals.totalAmount - (AppModules.reservas._manualTotalOverride != null ? AppModules.reservas._manualTotalOverride : finalTotal);
      discPreview.textContent = discVal > 0 && saving > 0.005 ? `Poupança: €${saving.toFixed(2)}` : '';
    }
  } else {
    if (!suite) {
      document.getElementById('f-total').value = '';
      const b = document.getElementById('resf-total-badge'); if (b) b.textContent = '';
      const discWrap = document.getElementById('resf-discount-wrap'); if (discWrap) discWrap.style.display = 'none';
    }
    AppModules.reservas._nightlyPrices = [];
    renderNightlyGrid();
    if (!ci || !co) document.getElementById('f-noites').value = '';
  }
  AppModules.reservas.updateWizSummary();
  AppModules.reservas.updateSpecialRateHints();
}

// ── PREÇO POR NOITE (grelha editável) ──
function nightlyGridSignature() {
  return AppModules.reservas._nightlyPrices.map(n => n.date).join('|');
}

function formatNightLabel(iso) {
  const d = new Date(`${iso}T12:00:00`);
  const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${days[d.getDay()]}, ${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]}`;
}

function renderNightlyGrid() {
  const wrap = document.getElementById('resf-nightly-wrap');
  const grid = document.getElementById('resf-nightly-grid');
  if (!wrap || !grid) return;
  if (!AppModules.reservas._nightlyPrices.length) {
    wrap.style.display = 'none';
    grid.innerHTML = '';
    AppModules.reservas._nightlyGridSig = '';
    return;
  }
  wrap.style.display = '';
  const sig = nightlyGridSignature();
  if (sig === AppModules.reservas._nightlyGridSig) {
    // Mesma estrutura de datas: não reconstruir (preserva foco); só atualizar destaque.
    document.querySelectorAll('#resf-nightly-grid .resf-nightly-row').forEach(row => {
      row.classList.toggle('edited', AppModules.reservas._nightlyOverrides[row.dataset.date] != null);
    });
    return;
  }
  AppModules.reservas._nightlyGridSig = sig;
  grid.innerHTML = AppModules.reservas._nightlyPrices.map(n => {
    const edited = AppModules.reservas._nightlyOverrides[n.date] != null;
    const std = AppModules.reservas._standardNightlyByDate[n.date];
    return `<div class="resf-nightly-row${edited ? ' edited' : ''}" data-date="${n.date}">
      <span class="resf-nightly-date">${formatNightLabel(n.date)}${edited ? '<span class="resf-nightly-tag">editado</span>' : ''}${std != null ? `<span class="resf-nightly-std">padrão €${Number(std).toFixed(2)}</span>` : ''}</span>
      <div class="resf-nightly-input">
        <span>€</span>
        <input type="number" min="0" step="0.01" value="${Number(n.price).toFixed(2)}"
          ${AppActions.attrs("input", "precos-on-nightly-price-input-335f2a4", [String((n.date) ?? '')])} autocomplete="off">
      </div>
    </div>`;
  }).join('');
}

function onNightlyPriceInput(date, value) {
  const v = value === '' ? null : Number(value);
  if (v == null || isNaN(v)) delete AppModules.reservas._nightlyOverrides[date];
  else AppModules.reservas._nightlyOverrides[date] = Math.max(0, v);
  // Alterar preços por noite recalcula o total a partir das noites.
  AppModules.reservas._manualTotalOverride = null;
  calcTotal();
}

function applyNightlyToAll() {
  const raw = document.getElementById('resf-nightly-all-val')?.value;
  const v = raw === '' ? null : Number(raw);
  if (v == null || isNaN(v) || v < 0) { AppModules.core.toast('Introduz um preço válido para aplicar a todas as noites.', 'error'); return; }
  AppModules.reservas._nightlyPrices.forEach(n => { AppModules.reservas._nightlyOverrides[n.date] = v; });
  AppModules.reservas._manualTotalOverride = null;
  AppModules.reservas._nightlyGridSig = ''; // forçar reconstrução para refletir os novos valores nos inputs
  calcTotal();
}

function resetNightlyOverrides() {
  AppModules.reservas._nightlyOverrides = {};
  AppModules.reservas._manualTotalOverride = null;
  AppModules.reservas._nightlyGridSig = '';
  const allInp = document.getElementById('resf-nightly-all-val'); if (allInp) allInp.value = '';
  calcTotal();
}

function updateNightlyTotalField(finalTotal) {
  const inp = document.getElementById('f-total-manual');
  if (!inp) return;
  // Reflete sempre o total atual, exceto enquanto o utilizador está a escrever no campo.
  if (document.activeElement !== inp) inp.value = finalTotal.toFixed(2);
}

// Fixa os pesos por noite ao entrar no campo de total — enquanto o utilizador
// digita ("1" → "12" → "120") as proporções mantêm-se as de partida.
function snapshotManualDistribWeights() {
  AppModules.reservas._manualDistribWeights = AppModules.reservas._nightlyPrices.map(n => Math.max(0, Number(n.price) || 0));
  AppModules.reservas._manualDistribWarned = false;
  document.getElementById('f-total-manual')?.select();
}

// Distribui o total digitado (menos extras) pelas noites, proporcionalmente
// aos preços atuais, em cêntimos; o resto do arredondamento vai para a última
// noite para a soma bater exata. Todas as noites a €0 → divisão igual.
function distributeManualTotal(target) {
  if (!AppModules.reservas._nightlyPrices.length) return;
  const extras = AppModules.reservas._lastExtrasTotal || 0;
  const baseCents = Math.max(0, Math.round((target - extras) * 100));
  if (target > 0 && target < extras && !AppModules.reservas._manualDistribWarned) {
    AppModules.reservas._manualDistribWarned = true;
    AppModules.core.toast(`O total é inferior aos extras (€${extras.toFixed(2)}) — noites ficam a €0.`, 'info');
  }
  const weights = (AppModules.reservas._manualDistribWeights && AppModules.reservas._manualDistribWeights.length === AppModules.reservas._nightlyPrices.length)
    ? AppModules.reservas._manualDistribWeights
    : AppModules.reservas._nightlyPrices.map(n => Math.max(0, Number(n.price) || 0));
  const wSum = weights.reduce((a, b) => a + b, 0);
  const n = AppModules.reservas._nightlyPrices.length;
  let allocated = 0;
  AppModules.reservas._nightlyPrices.forEach((night, i) => {
    let cents;
    if (i === n - 1) cents = Math.max(0, baseCents - allocated);
    else if (wSum > 0) cents = Math.round(baseCents * weights[i] / wSum);
    else cents = Math.round(baseCents / n);
    allocated += cents;
    AppModules.reservas._nightlyOverrides[night.date] = cents / 100;
  });
  AppModules.reservas._manualTotalOverride = null;      // o total volta a ser derivado das noites
  AppModules.reservas._nightlyGridSig = '';             // forçar rebuild da grelha com os novos valores
}

function onManualTotalInput(value) {
  const v = value === '' ? null : Number(value);
  if (v == null || isNaN(v) || v < 0) return; // input incompleto/inválido: não distribuir
  // Multi-suite: a grelha só mostra a suite principal — distribuir o total das
  // duas suites inflava-a. Mantém-se o total fixo (comportamento antigo).
  if (AppModules.reservas._wizMultiSuite) {
    AppModules.reservas._manualTotalOverride = Math.max(0, v);
    calcTotal();
    return;
  }
  // O total digitado é o valor final desejado — um desconto ativo voltaria a
  // subtrair-se em cima dele, por isso é limpo.
  const discInp = document.getElementById('f-discount-val');
  if (discInp && parseFloat(discInp.value) > 0) discInp.value = '';
  distributeManualTotal(v);
  calcTotal();
}

function resetNightlyState() {
  AppModules.reservas._nightlyOverrides = {};
  AppModules.reservas._nightlyPrices = [];
  AppModules.reservas._nightlyGridSig = '';
  AppModules.reservas._manualTotalOverride = null;
  AppModules.reservas._manualDistribWeights = null;
  AppModules.reservas._wizMultiSuite = false;
  const allInp = document.getElementById('resf-nightly-all-val'); if (allInp) allInp.value = '';
}

function setFormDiscountType(type) {
  const el = document.getElementById('f-discount-type');
  if (el) el.value = type;
  document.querySelectorAll('.resf-disc-type').forEach(b => b.classList.toggle('active', b.dataset.type === type));
  const inp = document.getElementById('f-discount-val');
  if (inp) { inp.value = ''; inp.placeholder = type === 'pct' ? '0' : '0.00'; }
  calcTotal();
}

function resetFormDiscount() {
  const el = document.getElementById('f-discount-type'); if (el) el.value = 'pct';
  const inp = document.getElementById('f-discount-val'); if (inp) inp.value = '';
  const prev = document.getElementById('f-discount-preview'); if (prev) prev.textContent = '';
  document.querySelectorAll('.resf-disc-type').forEach(b => b.classList.toggle('active', b.dataset.type === 'pct'));
  const wrap = document.getElementById('resf-discount-wrap'); if (wrap) wrap.style.display = 'none';
}


AppActions.register({
  "precos-on-nightly-price-input-335f2a4": (el, event, args) => { onNightlyPriceInput(args[0], el.value) },
}, "input");

})();
