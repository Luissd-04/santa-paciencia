function openAlojCalendar() {
  const gcalId = document.getElementById('aloj-gcal-id').value.trim();
  if (gcalId) {
    const url = 'https://calendar.google.com/calendar/r?cid=' + encodeURIComponent(gcalId);
    window.open(url, '_blank');
  } else {
    const id = document.getElementById('aloj-editing-id').value;
    showView('calendario');
    setTimeout(() => {
      const sel = document.getElementById('cal-suite-filter');
      if (sel) { sel.value = id; renderCal(); }
    }, 100);
  }
}

function openAlojCalendarDirect(id, gcalId, nome) {
  if (gcalId) {
    window.open('https://calendar.google.com/calendar/r?cid=' + encodeURIComponent(gcalId), '_blank');
  } else {
    showView('calendario');
    setTimeout(() => {
      const sel = document.getElementById('cal-suite-filter');
      if (sel) { sel.value = id; renderCal(); }
    }, 150);
  }
}

async function deleteAlojamento() {
  const id = document.getElementById('aloj-editing-id').value;
  const name = document.getElementById('aloj-nome').value || id;
  if (!id) return;
  if (!confirm(`Apagar o alojamento "${name}"?\n\nEsta ação é irreversível. Todas as reservas canceladas associadas serão apagadas.`)) return;
  try {
    const res = await apiDelete(`/api/accommodations/${id}`);
    if (res.success) {
      toast('🗑 Alojamento apagado.', 'info');
      currentAlojDetail = null;
      SS.set('aloj:id', null);
      showView('alojamentos');
      await loadAccommodations();
    } else {
      toast('❌ ' + (res.error || 'Erro ao apagar alojamento.'), 'error');
    }
  } catch (e) {
    toast('❌ ' + (e?.payload?.error || e?.message || 'Erro de ligação ao servidor.'), 'error');
  }
}

function toggleWifiPass(btn) {
  const input = btn.previousElementSibling;
  const showing = input.type === 'text';
  input.type = showing ? 'password' : 'text';
  const icon = btn.querySelector('i[data-lucide]');
  icon.setAttribute('data-lucide', showing ? 'eye' : 'eye-off');
  if (window.lucide) lucide.createIcons();
}

function setExtraOccupancyFields(a = {}) {
  const maxGuests = Number(a.max_guests) || 2;
  const includedEl = document.getElementById('aloj-hospedes-incluidos');
  if (includedEl) includedEl.value = a.base_guests_included || Math.min(maxGuests, 2);
  renderExtraOccupancyOptions(normalizeExtraOccupancyOptions(a));
}

function normalizeExtraOccupancyOptions(a = {}) {
  let options = [];
  if (Array.isArray(a.extra_occupancy_options)) {
    options = a.extra_occupancy_options;
  } else if (typeof a.extra_occupancy_options === 'string' && a.extra_occupancy_options.trim()) {
    try { options = JSON.parse(a.extra_occupancy_options); } catch { options = []; }
  }

  if (!options.length && a.extra_bed_enabled) {
    options = [{
      type: a.extra_bed_type || 'sofa_cama',
      capacity: Number(a.extra_bed_capacity) || 0,
      price: Number(a.extra_bed_price) || 0,
      charge_type: a.extra_bed_charge_type || 'per_guest_night',
      notes: a.extra_bed_notes || ''
    }];
  }

  return options.map(option => ({
    type: option.type || 'sofa_cama',
    custom_name: option.custom_name || '',
    capacity: Math.max(0, Number(option.capacity) || 0),
    price: Math.max(0, Number(option.price) || 0),
    charge_type: option.charge_type || 'per_guest_night',
    notes: option.notes || ''
  }));
}

function escapeExtraOccupancyText(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

function renderExtraOccupancyOptions(options = []) {
  const list = document.getElementById('aloj-extra-occupancy-list');
  if (!list) return;
  if (!options.length) {
    list.innerHTML = `<div style="padding:12px 14px;border:1px dashed var(--borda);border-radius:8px;color:var(--cinza);font-size:13px;">Sem ocupação adicional configurada.</div>`;
    return;
  }

  list.innerHTML = options.map((option, index) => `
    <div class="extra-occupancy-row" style="border:1px solid var(--borda);border-radius:8px;padding:12px;background:#fff;">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;align-items:end;">
        <div class="form-group" style="margin:0;">
          <label class="form-label">Tipo</label>
          <select class="form-control" data-field="type" onchange="onExtraOccupancyTypeChange(this)">
            <option value="cama_extra" ${option.type === 'cama_extra' ? 'selected' : ''}>Cama extra</option>
            <option value="sofa_cama" ${option.type === 'sofa_cama' ? 'selected' : ''}>Sofá-cama</option>
            <option value="berco" ${option.type === 'berco' ? 'selected' : ''}>Berço</option>
            <option value="outro" ${option.type === 'outro' ? 'selected' : ''}>Outro</option>
          </select>
        </div>
        <div class="form-group" data-custom-extra-wrap style="margin:0;display:${option.type === 'outro' ? '' : 'none'};">
          <label class="form-label">Nome do extra</label>
          <input class="form-control" data-field="custom_name" value="${escapeExtraOccupancyText(option.custom_name)}" placeholder="Ex: Colchão no chão" autocomplete="off">
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">Capacidade</label>
          <input class="form-control" data-field="capacity" type="number" min="0" max="20" value="${option.capacity}" autocomplete="off">
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">Preço (€)</label>
          <input class="form-control" data-field="price" type="number" min="0" step="0.01" value="${option.price}" autocomplete="off">
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">Cobrança</label>
          <select class="form-control" data-field="charge_type">
            <option value="per_guest_night" ${option.charge_type === 'per_guest_night' ? 'selected' : ''}>Por hóspede/noite</option>
            <option value="per_bed_night" ${option.charge_type === 'per_bed_night' ? 'selected' : ''}>Por cama/noite</option>
          </select>
        </div>
        <button type="button" onclick="removeExtraOccupancyOption(${index})" title="Remover extra" style="height:32px;width:32px;padding:0;border:0;background:transparent;color:var(--vermelho);cursor:pointer;display:flex;align-items:center;justify-content:center;justify-self:end;">
          ${lcIcon('trash-2', 14)}
        </button>
      </div>
      <div class="form-group" style="margin:10px 0 0;">
        <label class="form-label">Notas</label>
        <textarea class="form-control" data-field="notes" rows="2" placeholder="Ex: mediante verificação de disponibilidade prévia">${escapeExtraOccupancyText(option.notes)}</textarea>
      </div>
    </div>
  `).join('');
  if (window.lucide) lucide.createIcons();
}

function collectExtraOccupancyOptions() {
  return Array.from(document.querySelectorAll('#aloj-extra-occupancy-list .extra-occupancy-row')).map(row => ({
    type: row.querySelector('[data-field="type"]')?.value || 'sofa_cama',
    custom_name: row.querySelector('[data-field="custom_name"]')?.value.trim() || '',
    capacity: parseInt(row.querySelector('[data-field="capacity"]')?.value) || 0,
    price: parseFloat(row.querySelector('[data-field="price"]')?.value) || 0,
    charge_type: row.querySelector('[data-field="charge_type"]')?.value || 'per_guest_night',
    notes: row.querySelector('[data-field="notes"]')?.value.trim() || ''
  }));
}

function addExtraOccupancyOption(option = {}) {
  const options = collectExtraOccupancyOptions();
  options.push({
    type: option.type || 'cama_extra',
    custom_name: option.custom_name || '',
    capacity: option.capacity ?? 1,
    price: option.price ?? 0,
    charge_type: option.charge_type || 'per_guest_night',
    notes: option.notes || ''
  });
  renderExtraOccupancyOptions(options);
}

function removeExtraOccupancyOption(index) {
  const options = collectExtraOccupancyOptions();
  options.splice(index, 1);
  renderExtraOccupancyOptions(options);
}

function onExtraOccupancyTypeChange(select) {
  const row = select.closest('.extra-occupancy-row');
  const customWrap = row?.querySelector('[data-custom-extra-wrap]');
  if (customWrap) customWrap.style.display = select.value === 'outro' ? '' : 'none';
  const notes = row?.querySelector('[data-field="notes"]');
  if (select.value === 'berco' && notes && !notes.value.trim()) {
    notes.value = 'Mediante verificação de disponibilidade prévia.';
  }
}

function getOptionalIcalUrl(inputId, label) {
  const value = document.getElementById(inputId)?.value.trim() || '';
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol === 'http:' || url.protocol === 'https:') return value;
  } catch (_) {}
  toast(`${label}: insere um URL http/https válido.`, 'error');
  throw new Error('invalid_ical_url');
}

// ── GUARDAR ALOJAMENTO ──
async function saveAlojamento() {
  const id = document.getElementById('aloj-editing-id').value;
  if (!id) return;

  const checkedAmenities = getSelectedAmenitiesFromUi();

  const parentId = document.getElementById('aloj-parent-id')?.value || null;
  const hasParent = !!parentId;
  const maxGuests = parseInt(document.getElementById('aloj-capacidade').value) || 2;
  const baseGuestsIncluded = Math.min(
    parseInt(document.getElementById('aloj-hospedes-incluidos')?.value) || Math.min(maxGuests, 2),
    maxGuests
  );
  const extraOccupancyOptions = collectExtraOccupancyOptions();
  const firstExtra = extraOccupancyOptions[0] || null;
  let airbnbIcalUrl = null;
  let bookingIcalUrl = null;
  try {
    airbnbIcalUrl = getOptionalIcalUrl('aloj-airbnb-ical-url', 'Airbnb iCal');
    bookingIcalUrl = getOptionalIcalUrl('aloj-booking-ical-url', 'Booking.com iCal');
  } catch (_) {
    return;
  }

  const body = {
    name: document.getElementById('aloj-nome').value,
    license_number: document.getElementById('aloj-licenca').value + '/AL',
    type: document.getElementById('aloj-tipo').value,
    parent_id: parentId,
    area: parseInt(document.getElementById('aloj-area').value) || null,
    max_guests: maxGuests,
    num_rooms: parseInt(document.getElementById('aloj-quartos').value) || 1,
    num_bathrooms: parseInt(document.getElementById('aloj-casasbanho').value) || 1,
    price_per_night: parseFloat(document.getElementById('aloj-preco').value) || 0,
    min_nights: parseInt(document.getElementById('aloj-min-nights')?.value) || 1,
    rgpd_text: document.getElementById('aloj-rgpd-text')?.value?.trim() || null,
    base_guests_included: baseGuestsIncluded,
    baby_age_limit: parseInt(document.getElementById('aloj-baby-age-limit')?.value) || 0,
    baby_price: parseFloat(document.getElementById('aloj-baby-price')?.value) || 0,
    child_age_limit: parseInt(document.getElementById('aloj-child-age-limit')?.value) || 0,
    child_price: parseFloat(document.getElementById('aloj-child-price')?.value) || 0,
    extra_occupancy_options: extraOccupancyOptions,
    extra_bed_enabled: extraOccupancyOptions.length > 0,
    extra_bed_type: firstExtra?.type || 'sofa_cama',
    extra_bed_capacity: firstExtra?.capacity || 0,
    extra_bed_price: firstExtra?.price || 0,
    extra_bed_charge_type: firstExtra?.charge_type || 'per_guest_night',
    description: document.getElementById('desc-pt').value,
    description_en: document.getElementById('desc-en').value,
    description_fr: document.getElementById('desc-fr').value,
    description_es: document.getElementById('desc-es').value,
    description_de: document.getElementById('desc-de').value,
    description_it: document.getElementById('desc-it').value,
    description_nl: document.getElementById('desc-nl').value,
    google_calendar_id: document.getElementById('aloj-gcal-id').value || null,
    google_calendar_manual: document.getElementById('aloj-gcal-manual').checked,
    airbnb_ical_url: airbnbIcalUrl,
    booking_ical_url: bookingIcalUrl,
    color:         document.getElementById('aloj-color')?.value || null,
    own_amenities: checkedAmenities,
  };

  // Only include inherited fields if this accommodation owns them (no parent)
  if (!hasParent) {
    Object.assign(body, {
      address:    document.getElementById('aloj-morada').value,
      postal_code: document.getElementById('aloj-cp').value,
      city:       document.getElementById('aloj-cidade').value,
      region:     document.getElementById('aloj-regiao').value,
      country:    document.getElementById('aloj-pais').value,
      wifi_name:     document.getElementById('aloj-wifi-nome').value.trim()     || null,
      wifi_password: document.getElementById('aloj-wifi-password').value.trim() || null,
      door_code:     document.getElementById('aloj-door-code').value.trim()     || null,
      checkin_time:  document.getElementById('aloj-checkin-time').value  || null,
      checkout_time: document.getElementById('aloj-checkout-time').value || null,
      social_facebook:  document.getElementById('aloj-social-fb')?.value.trim()  || null,
      social_instagram: document.getElementById('aloj-social-ig')?.value.trim()  || null,
      social_website:   document.getElementById('aloj-social-web')?.value.trim() || null,
    });
  }

  try {
    const res = await apiPut('/api/accommodations/' + id, body);
    if (res.success) {
      const activeTab = getActiveAlojTab();
      toast('✅ Alojamento guardado!', 'success');
      document.getElementById('aloj-detalhe-nome').textContent = body.name;
      await loadAccommodations();
      await openAlojamento(id, activeTab);
    } else {
      toast('❌ ' + (res.error || 'Erro ao guardar.'), 'error');
    }
  } catch (e) {
    toast('❌ Erro de ligação ao servidor.', 'error');
  }
}

// ── MAPA DE LOCALIZAÇÃO ──
let _alojMap    = null;
let _alojMarker = null;

function resetAlojMap() {
  if (_alojMap) { _alojMap.remove(); _alojMap = null; _alojMarker = null; }
  const ph  = document.getElementById('aloj-map-placeholder');
  const map = document.getElementById('aloj-map');
  if (ph)  ph.style.display  = '';
  if (map) map.style.display = 'none';
  const btn = document.getElementById('aloj-map-btn');
  if (btn) { btn.disabled = false; btn.innerHTML = `${lcIcon('search',13)} Verificar endereço`; }
}

async function geocodeAndShowMap() {
  const morada  = (document.getElementById('aloj-morada')?.value  || '').trim();
  const cp      = (document.getElementById('aloj-cp')?.value      || '').trim();
  const cidade  = (document.getElementById('aloj-cidade')?.value  || '').trim();
  const pais    = (document.getElementById('aloj-pais')?.value    || 'Portugal').trim();
  const q = [morada, cp, cidade, pais].filter(Boolean).join(', ');
  if (!morada && !cidade) { toast('Preencha a morada antes de pesquisar.', 'error'); return; }

  const ph  = document.getElementById('aloj-map-placeholder');
  const mapEl = document.getElementById('aloj-map');
  const btn = document.getElementById('aloj-map-btn');

  if (ph)  ph.style.display  = 'none';
  if (mapEl) mapEl.style.display = 'block';
  if (btn) { btn.disabled = true; btn.textContent = '⏳ A pesquisar...'; }

  if (!_alojMap) {
    _alojMap = L.map('aloj-map').setView([39.55, -8.0], 7);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19
    }).addTo(_alojMap);
  } else {
    _alojMap.invalidateSize();
  }

  try {
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`,
      { headers: { 'Accept-Language': 'pt' } }
    );
    const results = await resp.json();
    if (!results.length) { toast('Morada não encontrada. Verifique os dados.', 'error'); return; }
    const latlng = [parseFloat(results[0].lat), parseFloat(results[0].lon)];
    _alojMap.setView(latlng, 16);
    if (_alojMarker) _alojMarker.remove();
    _alojMarker = L.marker(latlng).addTo(_alojMap);
    _alojMarker.bindPopup(`<b>${results[0].display_name}</b>`).openPopup();
    toast('✅ Localização encontrada!', 'success');
  } catch (e) {
    toast('❌ Erro ao pesquisar morada.', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = `${lcIcon('search',13)} Verificar endereço`; if (window.lucide) lucide.createIcons(); }
  }
}

// ── DESCRIÇÃO MULTILINGUE ──
function switchDescLang(lang) {
  document.querySelectorAll('.desc-lang-tab').forEach(t => t.classList.toggle('active', t.dataset.lang === lang));
  document.querySelectorAll('.desc-lang-area').forEach(a => a.style.display = a.id === 'desc-' + lang ? 'block' : 'none');
}
