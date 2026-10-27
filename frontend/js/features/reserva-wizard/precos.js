// Estado privado; interface partilhada em AppModules.reservas.
(() => {
AppModules.define('reservas', {
  applyRoomNights: { get: () => applyRoomNights },
  calcTotal: { get: () => calcTotal },
  distributeManualTotal: { get: () => distributeManualTotal },
  onManualTotalInput: { get: () => onManualTotalInput },
  resetFormDiscount: { get: () => resetFormDiscount },
  resetRoomNights: { get: () => resetRoomNights },
  resetNightlyState: { get: () => resetNightlyState },
  setFormDiscountType: { get: () => setFormDiscountType },
  snapshotManualDistribWeights: { get: () => snapshotManualDistribWeights },
});

// Recálculos sobrepostos (cada um espera pelos períodos de preço): só o mais
// recente escreve no formulário.
let calcSeq = 0;

async function calcTotal() {
  const seq = ++calcSeq;
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
    const [pricingPeriods] = await Promise.all([
      AppModules.reservas.loadWizPricingPeriods(alojId),
      ...AppModules.reservas._wizExtraRooms.map(r => AppModules.reservas.loadWizPricingPeriods(r.accommodation_id)),
    ]);
    if (seq !== calcSeq) return;
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
    renderRoomPrices();

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
    // Valor local só para compor o pedido; o total visível (badge, campo de
    // total final) é o devolvido pelo servidor em scheduleWizQuote.
    document.getElementById('f-total').value = finalTotal.toFixed(2);

    // Breakdown + campo de total editável
    const extras = (totals.extraOccupancyCost || 0) + (totals.touristTax || 0) + (totals.breakfastCost || 0);
    AppModules.reservas._lastExtrasTotal = extras;
    // Alojamento = soma de todos os quartos, para o resumo bater com o total.
    const roomCount = 1 + AppModules.reservas._wizExtraRooms.length;
    const baseLabel = document.getElementById('resf-nightly-base-label');
    if (baseLabel) baseLabel.textContent = roomCount > 1 ? `${roomCount} quartos` : 'Alojamento';
    const baseEl = document.getElementById('resf-nightly-base');
    if (baseEl) baseEl.textContent = `${ReservationMoney.format((totals.baseAmount || 0) + AppModules.reservas.wizExtraRoomsSubtotal())}`;
    const extrasEl = document.getElementById('resf-nightly-extras');
    const extrasWrap = document.getElementById('resf-nightly-extras-wrap');
    if (extrasEl) extrasEl.textContent = `${ReservationMoney.format(extras)}`;
    if (extrasWrap) extrasWrap.style.display = extras > 0.005 ? '' : 'none';

    const discWrap = document.getElementById('resf-discount-wrap');
    if (discWrap) discWrap.style.display = '';
    const discPreview = document.getElementById('f-discount-preview');
    if (discPreview) {
      const saving = totals.totalAmount - (AppModules.reservas._manualTotalOverride != null ? AppModules.reservas._manualTotalOverride : finalTotal);
      discPreview.textContent = discVal > 0 && saving > 0.005 ? `Poupança: ${ReservationMoney.format(saving)}` : '';
    }
  } else {
    if (!suite) {
      document.getElementById('f-total').value = '';
      const b = document.getElementById('resf-total-badge'); if (b) b.textContent = '';
      const discWrap = document.getElementById('resf-discount-wrap'); if (discWrap) discWrap.style.display = 'none';
    }
    AppModules.reservas._nightlyPrices = [];
    renderRoomPrices();
    if (!ci || !co) document.getElementById('f-noites').value = '';
  }
  AppModules.reservas.scheduleWizQuote();
  AppModules.reservas.updateWizSummary();
  AppModules.reservas.updateSpecialRateHints();
}

// ── PREÇO POR QUARTO E POR NOITE (grelha editável) ──
// Um bloco por quarto, com miniatura; a suite principal usa _nightlyOverrides
// e cada quarto extra os seus `overrides` (disponibilidade.js).

function formatNightLabel(iso) {
  const d = new Date(`${iso}T12:00:00`);
  const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${days[d.getDay()]}, ${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]}`;
}

const priceCents = value => Math.round((Number(value) || 0) * 100);
const isPrimaryRoom = id => id === document.getElementById('f-aloj')?.value;

// Quartos da reserva com as noites atuais: o principal primeiro.
function wizPriceRooms() {
  const primaryId = document.getElementById('f-aloj')?.value;
  const primary = AppModules.core.accommodations.find(a => a.id === primaryId);
  if (!primary || !AppModules.reservas._nightlyPrices.length) return [];
  const primaryNights = AppModules.reservas._nightlyPrices.map(n => {
    const standard = AppModules.reservas._standardNightlyByDate[n.date];
    return { date: n.date, price: Number(n.price) || 0, standard: standard ?? n.price };
  });
  return [
    { id: primary.id, name: primary.name, primary: true, nights: primaryNights },
    ...AppModules.reservas.wizExtraRoomsPricing().map(r => ({ id: r.accommodation_id, name: r.name, primary: false, nights: r.nights })),
  ].map(room => {
    const acc = AppModules.core.accommodations.find(a => a.id === room.id);
    const subtotalCents = room.nights.reduce((sum, n) => sum + priceCents(n.price), 0);
    const same = room.nights.every(n => priceCents(n.price) === priceCents(room.nights[0]?.price));
    return { ...room, name: room.name || acc?.name || '', acc, subtotal: subtotalCents / 100, same,
      average: room.nights.length ? Math.round(subtotalCents / room.nights.length) / 100 : 0 };
  });
}

function roomMetaText(room) {
  const nights = `${room.nights.length} noite${room.nights.length === 1 ? '' : 's'}`;
  return room.same
    ? `${nights} · ${ReservationMoney.format(room.average)} por noite`
    : `${nights} · média ${ReservationMoney.format(room.average)}`;
}

function roomThumbHtml(acc) {
  const cover = acc?.cover_image ? (acc.cover_image.startsWith('http') ? acc.cover_image : AppModules.core.API_BASE + acc.cover_image) : '';
  return cover
    ? `<img src="${AppModules.core.escapeHtml(AppModules.core.mediaThumb(cover, 160))}" class="resf-room-thumb" alt="" loading="lazy" decoding="async">`
    : `<span class="resf-room-thumb resf-room-thumb-dot" style="background:${AppModules.core.escapeHtml(acc?.color || 'var(--marca)')}"></span>`;
}

// Data da noite e, se o preço difere do calendário, o aviso por baixo.
function nightDateHtml(n, edited) {
  return `<span class="resf-nightly-day">${formatNightLabel(n.date)}</span>${edited
    ? `<span class="resf-nightly-note"><span class="resf-nightly-tag">editado</span><span class="resf-nightly-std">padrão ${ReservationMoney.format(n.standard)}</span></span>` : ''}`;
}

function nightRowHtml(room, n) {
  const edited = priceCents(n.price) !== priceCents(n.standard);
  return `<div class="resf-nightly-row${edited ? ' edited' : ''}" data-date="${n.date}">
      <span class="resf-nightly-date">${nightDateHtml(n, edited)}</span>
      <div class="resf-nightly-input">
        <span>€</span>
        <input type="number" min="0" step="0.01" value="${Number(n.price).toFixed(2)}"
          aria-label="${AppModules.core.escapeHtml(`${room.name}, ${formatNightLabel(n.date)}`)}"
          ${AppActions.attrs("input", "precos-room-night-input", [room.id, n.date])} autocomplete="off">
      </div>
    </div>`;
}

function roomBlockHtml(room, open, multiple) {
  const nights = room.nights.length;
  return `<details class="resf-room-price" data-room="${AppModules.core.escapeHtml(room.id)}"${open ? ' open' : ''}>
    <summary class="resf-room-head">
      ${roomThumbHtml(room.acc)}
      <span class="resf-room-name"><b>${AppModules.core.escapeHtml(room.name)}</b>${room.primary && multiple ? '<span class="suite-card-role">Principal</span>' : ''}<small data-room-meta>${roomMetaText(room)}</small></span>
      <span class="resf-room-sub" data-room-sub>${ReservationMoney.format(room.subtotal)}</span>
      <i data-lucide="chevron-down" class="resf-room-chev" aria-hidden="true"></i>
    </summary>
    <div class="resf-room-body">
      <div class="resf-nightly-apply">
        <div class="resf-nightly-input">
          <span>€</span>
          <input type="number" min="0" step="0.01" placeholder="0.00" class="resf-room-all" aria-label="${AppModules.core.escapeHtml(`Preço para todas as noites de ${room.name}`)}" autocomplete="off">
        </div>
        <button type="button" class="resf-nightly-btn" ${AppActions.attrs("click", "precos-room-apply", [room.id])}>Aplicar ${nights === 1 ? 'à noite' : `às ${nights} noites`}</button>
        <button type="button" class="resf-nightly-reset" ${AppActions.attrs("click", "precos-room-reset", [room.id])}>Repor</button>
      </div>
      <div class="resf-nightly-grid">${room.nights.map(n => nightRowHtml(room, n)).join('')}</div>
    </div>
  </details>`;
}

function renderRoomPrices() {
  const wrap = document.getElementById('resf-nightly-wrap');
  const grid = document.getElementById('resf-nightly-grid');
  if (!wrap || !grid) return;
  const rooms = wizPriceRooms();
  if (!rooms.length) {
    wrap.style.display = 'none';
    grid.innerHTML = '';
    AppModules.reservas._nightlyGridSig = '';
    return;
  }
  wrap.style.display = '';
  const sig = rooms.map(r => `${r.id}:${r.nights.map(n => n.date).join(',')}`).join('|');
  if (sig === AppModules.reservas._nightlyGridSig) {
    // Mesmos quartos e datas: não reconstruir (preserva o foco de quem escreve);
    // só atualizar subtotais e destaques.
    rooms.forEach(room => {
      const block = grid.querySelector(`.resf-room-price[data-room="${CSS.escape(room.id)}"]`);
      if (!block) return;
      block.querySelector('[data-room-sub]').textContent = ReservationMoney.format(room.subtotal);
      block.querySelector('[data-room-meta]').textContent = roomMetaText(room);
      room.nights.forEach(n => {
        const row = block.querySelector(`.resf-nightly-row[data-date="${n.date}"]`);
        if (!row) return;
        const edited = priceCents(n.price) !== priceCents(n.standard);
        row.classList.toggle('edited', edited);
        row.querySelector('.resf-nightly-date').innerHTML = `${nightDateHtml(n, edited)}`;
      });
    });
    return;
  }
  // Com dois quartos os blocos abrem; a partir de três ficam fechados. Um
  // bloco aberto ou fechado à mão mantém-se assim.
  const openState = new Map([...grid.querySelectorAll('.resf-room-price')].map(el => [el.dataset.room, el.open]));
  const openByDefault = rooms.length <= 2;
  AppModules.reservas._nightlyGridSig = sig;
  grid.innerHTML = rooms.map(room => roomBlockHtml(room, openState.has(room.id) ? openState.get(room.id) : openByDefault, rooms.length > 1)).join('');
  if (window.lucide) lucide.createIcons();
}

function onRoomNightInput(roomId, date, value) {
  const v = value === '' ? null : Number(value);
  const overrides = isPrimaryRoom(roomId)
    ? AppModules.reservas._nightlyOverrides
    : AppModules.reservas._wizExtraRooms.find(r => r.accommodation_id === roomId)?.overrides;
  if (!overrides) return;
  if (v == null || isNaN(v)) delete overrides[date];
  else overrides[date] = Math.max(0, v);
  // Alterar preços por noite recalcula o total a partir das noites.
  AppModules.reservas._manualTotalOverride = null;
  calcTotal();
}

function applyRoomNights(roomId) {
  const input = document.querySelector(`.resf-room-price[data-room="${CSS.escape(roomId)}"] .resf-room-all`);
  const v = input?.value === '' ? null : Number(input?.value);
  if (v == null || isNaN(v) || v < 0) { AppModules.core.toast('Introduz um preço válido para aplicar a todas as noites.', 'error'); return; }
  const room = wizPriceRooms().find(r => r.id === roomId);
  if (!room) return;
  const overrides = isPrimaryRoom(roomId)
    ? AppModules.reservas._nightlyOverrides
    : AppModules.reservas._wizExtraRooms.find(r => r.accommodation_id === roomId).overrides;
  room.nights.forEach(n => { overrides[n.date] = v; });
  AppModules.reservas._manualTotalOverride = null;
  AppModules.reservas._nightlyGridSig = ''; // reconstruir para mostrar os novos valores nos campos
  calcTotal();
}

function resetRoomNights(roomId) {
  if (isPrimaryRoom(roomId)) {
    AppModules.reservas._nightlyOverrides = {};
  } else {
    const room = AppModules.reservas._wizExtraRooms.find(r => r.accommodation_id === roomId);
    if (!room) return;
    room.overrides = {};
    room.flatPrice = null;
  }
  AppModules.reservas._manualTotalOverride = null;
  AppModules.reservas._nightlyGridSig = '';
  calcTotal();
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
    AppModules.core.toast(`O total é inferior aos extras (${ReservationMoney.format(extras)}) — noites ficam a €0.`, 'info');
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
  // Multi-suite: o total não se distribui por vários quartos. Com voucher, o
  // servidor descontaria-o outra vez sobre as noites distribuídas. Em ambos o
  // total digitado fica fixo.
  if (AppModules.reservas._wizMultiSuite || AppModules.reservas.wizVoucherActive()) {
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
  "precos-room-night-input": (el, event, args) => { onRoomNightInput(args[0], args[1], el.value) },
}, "input");

AppActions.register({
  "precos-room-apply": (el, event, args) => { applyRoomNights(args[0]) },
  "precos-room-reset": (el, event, args) => { resetRoomNights(args[0]) },
}, "click");

})();
