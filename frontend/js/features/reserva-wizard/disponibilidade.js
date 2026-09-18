async function fetchSuiteAvailability() {
  const ci = normalizeIsoDateValue(document.getElementById('f-checkin')?.value);
  const co = normalizeIsoDateValue(document.getElementById('f-checkout')?.value);
  if (!ci || !co || new Date(co) <= new Date(ci)) {
    _unavailableSuites = new Set();
    renderSuiteCards();
    return;
  }
  try {
    const excludeParam = editingId ? `&exclude_id=${encodeURIComponent(editingId)}` : '';
    const data = await apiGet(`/api/reservations/availability?check_in=${ci}&check_out=${co}${excludeParam}`);
    _unavailableSuites = new Set(data.data?.unavailable || []);
  } catch (e) {
    _unavailableSuites = new Set();
  }
  renderSuiteCards();
  // If currently selected suite became unavailable, deselect it
  const selEl = document.getElementById('f-aloj');
  if (selEl?.value && _unavailableSuites.has(selEl.value)) {
    selEl.value = '';
    updateWizSummary();
    calcTotal();
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
  const ci = normalizeIsoDateValue(document.getElementById('f-checkin')?.value);
  const co = normalizeIsoDateValue(document.getElementById('f-checkout')?.value);
  return window.ReservationDates?.countNights(ci, co) || 0;
}

function wizExtraRoomsSubtotal() {
  return _wizExtraRooms.reduce((sum, r) => sum + (Number(r.subtotal) || 0), 0);
}

// Monta o array accommodations_data (suite principal + quartos extra) no mesmo
// formato já usado pelo painel "Editar Alojamento" (reserva-lista.js), para o
// backend persistir e recalcular exatamente da mesma forma.
function _wizBuildAccommodationsData(primaryId, primaryName) {
  const nights = _nightlyPrices.length || _wizExtraRoomNights() || 1;
  const primarySubtotal = _nightlyPrices.reduce((sum, n) => sum + (Number(n.price) || 0), 0);
  const primaryRoom = {
    accommodation_id: primaryId,
    name: primaryName || '',
    price_per_night: nights > 0 ? primarySubtotal / nights : 0,
    nights,
    subtotal: primarySubtotal,
  };
  return [primaryRoom, ..._wizExtraRooms.map(r => ({ ...r, nights }))];
}

async function renderWizExtraRooms() {
  const panel = document.getElementById('wiz-extra-rooms-panel');
  if (!panel) return;
  const ci = normalizeIsoDateValue(document.getElementById('f-checkin')?.value);
  const co = normalizeIsoDateValue(document.getElementById('f-checkout')?.value);
  const primaryId = document.getElementById('f-aloj')?.value;
  if (!ci || !co || new Date(co) <= new Date(ci) || !primaryId) {
    panel.innerHTML = '<div style="font-size:13px;color:var(--cinza);padding:8px 2px;">Define primeiro as datas e o alojamento principal.</div>';
    return;
  }
  panel.innerHTML = '<div class="rdv2-acc-loading">A verificar disponibilidade…</div>';
  let unavailable = new Set();
  try {
    const excludeParam = editingId ? `&exclude_id=${encodeURIComponent(editingId)}` : '';
    const data = await apiGet(`/api/reservations/availability?check_in=${ci}&check_out=${co}${excludeParam}`);
    unavailable = new Set(data.data?.unavailable || []);
  } catch { /* falha a verificar disponibilidade — mostra tudo como disponível */ }

  const selectedIds = new Set(_wizExtraRooms.map(r => r.accommodation_id));
  const rows = accommodations.filter(a => a.id !== primaryId).map(a => {
    const isChecked = selectedIds.has(a.id);
    const isUnavail = unavailable.has(a.id) && !isChecked;
    const existing = _wizExtraRooms.find(r => r.accommodation_id === a.id);
    const price = existing ? Number(existing.price_per_night) : Number(a.price_per_night || 0);
    return `
      <div class="rdv2-acc-option${isUnavail ? ' rdv2-acc-unavail' : ''}${isChecked ? ' rdv2-acc-selected' : ''}" data-id="${a.id}">
        <label class="rdv2-acc-check-wrap">
          <input type="checkbox" class="rdv2-acc-cb" value="${a.id}" ${isChecked ? 'checked' : ''} ${isUnavail ? 'disabled' : ''} onchange="onWizExtraRoomCheck(this)">
        </label>
        <div class="rdv2-acc-opt-info">
          <div class="rdv2-acc-opt-name">${a.name}${isUnavail ? ' <span class="rdv2-badge-unavail">ocupado</span>' : ''}</div>
          <div class="rdv2-acc-opt-meta">${a.max_guests ? `max ${a.max_guests} hósp. · ` : ''}Base: €${Number(a.price_per_night || 0).toFixed(0)}/noite</div>
        </div>
        <div class="rdv2-acc-price-edit">
          <input type="number" class="rdv2-acc-priceinput" data-accid="${a.id}" min="0" step="0.01" value="${price.toFixed(2)}" oninput="onWizExtraRoomPriceInput(this)" autocomplete="off">
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
  _wizExtraRooms = _wizExtraRooms.filter(r => r.accommodation_id !== accId);
  if (cb.checked) {
    const acc = accommodations.find(a => a.id === accId);
    const priceInput = row?.querySelector('.rdv2-acc-priceinput');
    const pricePerNight = parseFloat(priceInput?.value) || Number(acc?.price_per_night || 0);
    _wizExtraRooms.push({
      accommodation_id: accId, name: acc?.name || '',
      price_per_night: pricePerNight, subtotal: pricePerNight * nights,
    });
  }
  _manualTotalOverride = null;
  calcTotal();
}

function onWizExtraRoomPriceInput(input) {
  const accId = input.dataset.accid;
  const pricePerNight = parseFloat(input.value) || 0;
  const nights = _wizExtraRoomNights();
  const item = _wizExtraRooms.find(r => r.accommodation_id === accId);
  if (item) { item.price_per_night = pricePerNight; item.subtotal = pricePerNight * nights; }
  _manualTotalOverride = null;
  calcTotal();
}

