// Estado privado; interface partilhada em AppModules.reservas.
(() => {
AppModules.define('reservas', {
  _wizBuildAccommodationsData: { get: () => _wizBuildAccommodationsData },
  _wizResetExtraRoomsPanel: { get: () => _wizResetExtraRoomsPanel },
  fetchSuiteAvailability: { get: () => fetchSuiteAvailability },
  renderWizExtraRooms: { get: () => renderWizExtraRooms },
  wizExtraRoomsSubtotal: { get: () => wizExtraRoomsSubtotal },
  wizToggleExtraRooms: { get: () => wizToggleExtraRooms },
});

async function fetchSuiteAvailability() {
  const ci = AppModules.core.normalizeIsoDateValue(document.getElementById('f-checkin')?.value);
  const co = AppModules.core.normalizeIsoDateValue(document.getElementById('f-checkout')?.value);
  if (!ci || !co || new Date(co) <= new Date(ci)) {
    AppModules.reservas._unavailableSuites = new Set();
    AppModules.reservas.renderSuiteCards();
    return;
  }
  try {
    const excludeParam = AppModules.core.editingId ? `&exclude_id=${encodeURIComponent(AppModules.core.editingId)}` : '';
    const data = await AppModules.core.apiGet(`/api/reservations/availability?check_in=${ci}&check_out=${co}${excludeParam}`);
    AppModules.reservas._unavailableSuites = new Set(data.data?.unavailable || []);
  } catch (e) {
    AppModules.reservas._unavailableSuites = new Set();
  }
  AppModules.reservas.renderSuiteCards();
  // If currently selected suite became unavailable, deselect it
  const selEl = document.getElementById('f-aloj');
  if (selEl?.value && AppModules.reservas._unavailableSuites.has(selEl.value)) {
    selEl.value = '';
    AppModules.reservas.updateWizSummary();
    AppModules.reservas.calcTotal();
  }
  const extraPanel = document.getElementById('wiz-extra-rooms-panel');
  if (extraPanel && extraPanel.style.display !== 'none') renderWizExtraRooms();
}

// ── Quartos extra na mesma reserva (multi-suite) ──

function _wizResetExtraRoomsPanel() {
  const panel = document.getElementById('wiz-extra-rooms-panel');
  const label = document.getElementById('wiz-extra-rooms-toggle-label');
  if (panel) panel.style.display = 'none';
  if (label) label.textContent = 'Adicionar outro quarto';
}

function wizToggleExtraRooms() {
  const panel = document.getElementById('wiz-extra-rooms-panel');
  const label = document.getElementById('wiz-extra-rooms-toggle-label');
  if (!panel) return;
  const opening = panel.style.display === 'none';
  panel.style.display = opening ? '' : 'none';
  if (label) label.textContent = opening ? 'Esconder quartos extra' : 'Adicionar outro quarto';
  if (opening) renderWizExtraRooms();
}

function _wizExtraRoomNights() {
  const ci = AppModules.core.normalizeIsoDateValue(document.getElementById('f-checkin')?.value);
  const co = AppModules.core.normalizeIsoDateValue(document.getElementById('f-checkout')?.value);
  return window.ReservationDates?.countNights(ci, co) || 0;
}

function wizExtraRoomsSubtotal() {
  return AppModules.reservas._wizExtraRooms.reduce((sum, r) => sum + (Number(r.subtotal) || 0), 0);
}

// Monta o array accommodations_data (suite principal + quartos extra) no mesmo
// formato já usado pelo painel "Editar Alojamento" (reserva-lista.js), para o
// backend persistir e recalcular exatamente da mesma forma.
function _wizBuildAccommodationsData(primaryId, primaryName) {
  const nights = AppModules.reservas._nightlyPrices.length || _wizExtraRoomNights() || 1;
  const primarySubtotal = AppModules.reservas._nightlyPrices.reduce((sum, n) => sum + (Number(n.price) || 0), 0);
  const primaryRoom = {
    accommodation_id: primaryId,
    name: primaryName || '',
    price_per_night: nights > 0 ? primarySubtotal / nights : 0,
    nights,
    subtotal: primarySubtotal,
  };
  return [primaryRoom, ...AppModules.reservas._wizExtraRooms.map(r => ({ ...r, nights }))];
}

async function renderWizExtraRooms() {
  const panel = document.getElementById('wiz-extra-rooms-panel');
  if (!panel) return;
  const ci = AppModules.core.normalizeIsoDateValue(document.getElementById('f-checkin')?.value);
  const co = AppModules.core.normalizeIsoDateValue(document.getElementById('f-checkout')?.value);
  const primaryId = document.getElementById('f-aloj')?.value;
  if (!ci || !co || new Date(co) <= new Date(ci) || !primaryId) {
    panel.innerHTML = '<div style="font-size:13px;color:var(--cinza);padding:8px 2px;">Define primeiro as datas e o alojamento principal.</div>';
    return;
  }
  panel.innerHTML = '<div class="rdv2-acc-loading">A verificar disponibilidade…</div>';
  let unavailable = new Set();
  try {
    const excludeParam = AppModules.core.editingId ? `&exclude_id=${encodeURIComponent(AppModules.core.editingId)}` : '';
    const data = await AppModules.core.apiGet(`/api/reservations/availability?check_in=${ci}&check_out=${co}${excludeParam}`);
    unavailable = new Set(data.data?.unavailable || []);
  } catch { /* falha a verificar disponibilidade — mostra tudo como disponível */ }

  const selectedIds = new Set(AppModules.reservas._wizExtraRooms.map(r => r.accommodation_id));
  const rows = AppModules.core.accommodations.filter(a => a.id !== primaryId).map(a => {
    const isChecked = selectedIds.has(a.id);
    const isUnavail = unavailable.has(a.id) && !isChecked;
    const existing = AppModules.reservas._wizExtraRooms.find(r => r.accommodation_id === a.id);
    const price = existing ? Number(existing.price_per_night) : Number(a.price_per_night || 0);
    return `
      <div class="rdv2-acc-option${isUnavail ? ' rdv2-acc-unavail' : ''}${isChecked ? ' rdv2-acc-selected' : ''}" data-id="${a.id}">
        <label class="rdv2-acc-check-wrap">
          <input type="checkbox" class="rdv2-acc-cb" value="${a.id}" ${isChecked ? 'checked' : ''} ${isUnavail ? 'disabled' : ''} data-on-change="disponibilidade-on-wiz-extra-room-check-6470c85">
        </label>
        <div class="rdv2-acc-opt-info">
          <div class="rdv2-acc-opt-name">${AppModules.core.escapeHtml(a.name)}${isUnavail ? ' <span class="rdv2-badge-unavail">ocupado</span>' : ''}</div>
          <div class="rdv2-acc-opt-meta">${a.max_guests ? `max ${a.max_guests} hósp. · ` : ''}Base: €${Number(a.price_per_night || 0).toFixed(0)}/noite</div>
        </div>
        <div class="rdv2-acc-price-edit">
          <input type="number" class="rdv2-acc-priceinput" data-accid="${a.id}" min="0" step="0.01" value="${price.toFixed(2)}" data-on-input="disponibilidade-on-wiz-extra-room-price-input-cbe0d5d" autocomplete="off">
          <span class="rdv2-acc-priceinput-label">€/noite</span>
        </div>
      </div>`;
  }).join('');
  panel.innerHTML = rows || '<div style="font-size:13px;color:var(--cinza);padding:8px 2px;">Não há mais alojamentos.</div>';
  if (window.lucide) lucide.createIcons({ nodes: [panel] });
}

function onWizExtraRoomCheck(cb) {
  const row = cb.closest('.rdv2-acc-option');
  if (row) row.classList.toggle('rdv2-acc-selected', cb.checked);
  const accId = cb.value;
  const nights = _wizExtraRoomNights();
  AppModules.reservas._wizExtraRooms = AppModules.reservas._wizExtraRooms.filter(r => r.accommodation_id !== accId);
  if (cb.checked) {
    const acc = AppModules.core.accommodations.find(a => a.id === accId);
    const priceInput = row?.querySelector('.rdv2-acc-priceinput');
    const pricePerNight = parseFloat(priceInput?.value) || Number(acc?.price_per_night || 0);
    AppModules.reservas._wizExtraRooms.push({
      accommodation_id: accId, name: acc?.name || '',
      price_per_night: pricePerNight, subtotal: pricePerNight * nights,
    });
  }
  AppModules.reservas._manualTotalOverride = null;
  AppModules.reservas.calcTotal();
}

function onWizExtraRoomPriceInput(input) {
  const accId = input.dataset.accid;
  const pricePerNight = parseFloat(input.value) || 0;
  const nights = _wizExtraRoomNights();
  const item = AppModules.reservas._wizExtraRooms.find(r => r.accommodation_id === accId);
  if (item) { item.price_per_night = pricePerNight; item.subtotal = pricePerNight * nights; }
  AppModules.reservas._manualTotalOverride = null;
  AppModules.reservas.calcTotal();
}


AppActions.register({
  "disponibilidade-on-wiz-extra-room-check-6470c85": (el, event, args) => { onWizExtraRoomCheck(el) },
}, "change");

AppActions.register({
  "disponibilidade-on-wiz-extra-room-price-input-cbe0d5d": (el, event, args) => { onWizExtraRoomPriceInput(el) },
}, "input");

})();
