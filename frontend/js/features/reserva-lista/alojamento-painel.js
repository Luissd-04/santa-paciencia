/* ─── Accommodation panel ─── */

function openAccommodationPanelFromBtn(btn) {
  const r = JSON.parse(btn.dataset.res);
  const accs = JSON.parse(btn.dataset.accs || '[]');
  openAccommodationPanel(r.id, r.accId, r.ci, r.co, r.ng, r.na, r.nc, r.bkf, r.nights, accs);
}

async function openAccommodationPanel(resId, currentAccId, checkIn, checkOut, numGuests, numAdults, numChildren, breakfast, nights, initAccsData) {
  const mainCard = document.querySelector('.rdv2-main');
  if (!mainCard) return;
  mainCard.querySelector('.rdv2-acc-panel')?.remove();
  mainCard.style.position = 'relative';

  const panel = document.createElement('div');
  panel.className = 'rdv2-acc-panel';
  panel.innerHTML = `
    <div class="rdv2-acc-panel-head">
      <span>${lcIcon('home', 13)} Editar Alojamento</span>
      <button class="rdv2-icon-btn" onclick="this.closest('.rdv2-acc-panel').remove()">${lcIcon('x', 13)}</button>
    </div>
    <div class="rdv2-acc-panel-body" id="rdv2-acc-panel-body">
      <div class="rdv2-acc-loading">A calcular preços…</div>
    </div>
    <div class="rdv2-acc-discount" id="rdv2-acc-discount" style="display:none;">
      <div class="rdv2-acc-discount-head">${lcIcon('tag', 11)} Desconto</div>
      <div class="rdv2-acc-discount-row">
        <div class="rdv2-disc-toggle">
          <button type="button" class="rdv2-disc-type active" data-type="pct" onclick="setAccDiscountType('pct')">%</button>
          <button type="button" class="rdv2-disc-type" data-type="eur" onclick="setAccDiscountType('eur')">€</button>
        </div>
        <input type="number" class="rdv2-disc-input" id="rdv2-disc-val" min="0" step="0.01" placeholder="0" oninput="updateAccPanelTotal()" autocomplete="off">
        <div class="rdv2-acc-final-price">Total: <strong id="rdv2-acc-final-total">—</strong></div>
      </div>
    </div>
    <div class="rdv2-acc-panel-foot">
      <button class="btn btn-ghost btn-sm" onclick="this.closest('.rdv2-acc-panel').remove()">Cancelar</button>
      <button class="btn btn-primary btn-sm" id="rdv2-acc-save-btn" onclick="saveAccommodationChange('${resId}')">Guardar</button>
    </div>
  `;
  mainCard.appendChild(panel);
  if (window.lucide) lucide.createIcons({ nodes: [panel] });

  panel._discType = 'pct';
  panel._rows = [];
  panel._selectedId = currentAccId;
  panel._baseTotal = 0;
  panel._nights = Number(nights) || 1;
  panel._initAccsData = Array.isArray(initAccsData) ? initAccsData : (typeof initAccsData === 'string' ? JSON.parse(initAccsData || '[]') : []);

  try {
    const availData = await apiGet(`/api/reservations/availability?check_in=${checkIn}&check_out=${checkOut}&exclude_id=${encodeURIComponent(resId)}`);
    const unavailable = new Set(availData.data?.unavailable || []);
    const numG = Number(numGuests) || 1;
    const bkf = breakfast === true || breakfast === 'true' || breakfast === 1;

    const rows = await Promise.all(accommodations.map(async (a) => {
      const periods = typeof loadWizPricingPeriods === 'function' ? await loadWizPricingPeriods(a.id) : [];
      let calc = null;
      try {
        if (window.ReservationPricing?.calculateReservationTotal) {
          calc = window.ReservationPricing.calculateReservationTotal(a, servicosData, {
            check_in: checkIn, check_out: checkOut,
            num_guests: numG, breakfast_included: bkf,
            birth_dates: [], pricing_periods: periods,
          });
        }
      } catch {}
      return { acc: a, unavail: unavailable.has(a.id), calc };
    }));

    panel._rows = rows;

    const body = document.getElementById('rdv2-acc-panel-body');
    if (!body) return;

    // Initial selection: use existing accommodations_data if available
    const initSelected = new Map();
    if (panel._initAccsData && panel._initAccsData.length > 0) {
      for (const row of panel._initAccsData) initSelected.set(row.accommodation_id, Number(row.price_per_night || 0));
    } else {
      const curRow = rows.find(r => r.acc.id === currentAccId);
      initSelected.set(currentAccId, Number(curRow?.acc?.price_per_night || 0));
    }

    body.innerHTML = rows.map(({ acc, unavail, calc }) => {
      const isCurrent = acc.id === currentAccId;
      const isChecked = initSelected.has(acc.id);
      const customPrice = initSelected.has(acc.id) ? initSelected.get(acc.id) : Number(acc.price_per_night || 0);
      return `
        <div class="rdv2-acc-option${unavail && !isChecked ? ' rdv2-acc-unavail' : ''}${isChecked ? ' rdv2-acc-selected' : ''}" data-id="${acc.id}">
          <label class="rdv2-acc-check-wrap">
            <input type="checkbox" class="rdv2-acc-cb" value="${acc.id}" ${isChecked ? 'checked' : ''} ${unavail && !isChecked ? 'disabled' : ''} onchange="onAccCheckChange(this)">
          </label>
          <div class="rdv2-acc-opt-info">
            <div class="rdv2-acc-opt-name">${acc.name}${isCurrent ? ' <span class="rdv2-badge-current">atual</span>' : ''}${unavail ? ' <span class="rdv2-badge-unavail">ocupado</span>' : ''}</div>
            <div class="rdv2-acc-opt-meta">${acc.max_guests ? `max ${acc.max_guests} hósp. · ` : ''}Base: €${Number(acc.price_per_night||0).toFixed(0)}/noite</div>
          </div>
          <div class="rdv2-acc-price-edit">
            <input type="number" class="rdv2-acc-priceinput" data-accid="${acc.id}" min="0" step="0.01" value="${customPrice.toFixed(2)}" oninput="updateAccPanelTotal()" autocomplete="off">
            <span class="rdv2-acc-priceinput-label">€/noite</span>
          </div>
        </div>`;
    }).join('');

    const discSection = document.getElementById('rdv2-acc-discount');
    if (discSection) discSection.style.display = '';
    updateAccPanelTotal();

  } catch {
    const body = document.getElementById('rdv2-acc-panel-body');
    if (body) body.innerHTML = '<div style="padding:16px;color:var(--vermelho,#b03030);font-size:13px;">Erro ao carregar alojamentos.</div>';
  }
}

function setAccDiscountType(type) {
  const panel = document.querySelector('.rdv2-acc-panel');
  if (!panel) return;
  panel._discType = type;
  panel.querySelectorAll('.rdv2-disc-type').forEach(b => b.classList.toggle('active', b.dataset.type === type));
  const inp = document.getElementById('rdv2-disc-val');
  if (inp) { inp.value = ''; inp.placeholder = type === 'pct' ? '0' : '0.00'; }
  updateAccPanelTotal();
}

function onAccCheckChange(cb) {
  const row = cb.closest('.rdv2-acc-option');
  if (row) row.classList.toggle('rdv2-acc-selected', cb.checked);
  updateAccPanelTotal();
}

function updateAccPanelTotal() {
  const panel = document.querySelector('.rdv2-acc-panel');
  if (!panel) return;
  const nights = panel._nights || 1;

  // Sum all checked accommodations: price_per_night × nights
  let base = 0;
  panel.querySelectorAll('.rdv2-acc-cb:checked').forEach(cb => {
    const accId = cb.value;
    const priceInput = panel.querySelector(`.rdv2-acc-priceinput[data-accid="${accId}"]`);
    const pricePerNight = parseFloat(priceInput?.value) || 0;
    base += pricePerNight * nights;
  });

  const discVal = parseFloat(document.getElementById('rdv2-disc-val')?.value) || 0;
  const discType = panel._discType || 'pct';
  let final = base;
  if (discVal > 0) {
    final = discType === 'pct'
      ? base * (1 - Math.min(discVal, 100) / 100)
      : Math.max(0, base - discVal);
  }
  const el = document.getElementById('rdv2-acc-final-total');
  if (el) el.textContent = `€${final.toFixed(2)}`;
  panel._baseTotal = base;
  panel._finalTotal = final;
}

async function saveAccommodationChange(resId) {
  const panel = document.querySelector('.rdv2-acc-panel');
  if (!panel) return;

  const nights = panel._nights || 1;
  const checkedItems = [];
  panel.querySelectorAll('.rdv2-acc-cb:checked').forEach(cb => {
    const accId = cb.value;
    const acc = accommodations.find(a => a.id === accId);
    const priceInput = panel.querySelector(`.rdv2-acc-priceinput[data-accid="${accId}"]`);
    const pricePerNight = parseFloat(priceInput?.value) || Number(acc?.price_per_night || 0);
    checkedItems.push({
      accommodation_id: accId,
      name: acc?.name || '',
      price_per_night: pricePerNight,
      nights,
      subtotal: pricePerNight * nights,
    });
  });

  if (checkedItems.length === 0) { toast('⚠️ Seleciona pelo menos um alojamento', 'error'); return; }

  const finalTotal = panel._finalTotal !== undefined ? panel._finalTotal : panel._baseTotal;
  const primaryAccId = checkedItems[0].accommodation_id;

  const saveBtn = document.getElementById('rdv2-acc-save-btn');
  if (saveBtn) saveBtn.disabled = true;
  try {
    const res = await apiPut(`/api/reservations/${resId}`, {
      accommodation_id: primaryAccId,
      accommodations_data: checkedItems,
      total_amount: finalTotal,
    });
    if (res.success) {
      toast('✅ Alojamento atualizado', 'success');
      panel.remove();
      await loadReservas();
      showDetail(resId);
    } else {
      toast('❌ ' + (res.error || 'Erro ao guardar'), 'error');
      if (saveBtn) saveBtn.disabled = false;
    }
  } catch {
    toast('❌ Erro de ligação', 'error');
    if (saveBtn) saveBtn.disabled = false;
  }
}

function startInlinePriceEdit(id, currentTotal) {
  const placeholder = document.getElementById('rdv2-acc-subtot');
  const totalRowEl = document.querySelector('.rdv2-total-row .rdv2-amt');
  if (!placeholder) return;

  const input = document.createElement('input');
  input.type = 'number';
  input.step = '0.01';
  input.min = '0';
  input.value = Number(currentTotal).toFixed(2);
  input.style.cssText = 'width:90px;padding:3px 6px;border:1px solid var(--brand-shell);border-radius:6px;font-size:13px;font-weight:600;text-align:right;background:var(--surface-card);color:var(--text-main);';

  const restore = (val) => {
    const span = document.createElement('span');
    span.id = 'rdv2-acc-subtot';
    span.className = 'rdv2-amt';
    span.textContent = `€${Number(val).toFixed(2)}`;
    input.replaceWith(span);
    return span;
  };

  let saving = false;
  const save = async () => {
    if (saving) return;
    saving = true;
    const newVal = parseFloat(input.value);
    if (isNaN(newVal) || newVal < 0) { saving = false; input.focus(); return; }
    const span = restore(newVal);
    // Confirmar alteração de valores contra o padrão do calendário dinâmico
    if (Math.abs(newVal - Number(currentTotal)) > 0.005
        && typeof confirmPriceChange === 'function'
        && _rdv2Current?.standard_total != null) {
      const ok = await confirmPriceChange({
        standardTotal: _rdv2Current.standard_total,
        newTotal: newVal,
        editedAt: _rdv2Current.price_edited_at,
        editedByName: _rdv2Current.price_edited_by_name,
      });
      if (!ok) {
        span.textContent = `€${Number(currentTotal).toFixed(2)}`;
        saving = false;
        return;
      }
    }
    try {
      const res = await apiPut(`/api/reservations/${id}`, { total_amount: newVal });
      if (res.success) {
        if (totalRowEl) totalRowEl.textContent = `€${newVal.toFixed(2)}`;
        toast('✅ Preço atualizado', 'success');
        await loadReservas();
      } else {
        span.textContent = `€${Number(currentTotal).toFixed(2)}`;
        toast('❌ ' + (res.error || 'Erro ao atualizar'), 'error');
      }
    } catch (e) {
      span.textContent = `€${Number(currentTotal).toFixed(2)}`;
      toast('❌ Erro de ligação', 'error');
    }
  };

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); save(); }
    if (e.key === 'Escape') { restore(currentTotal); }
  });
  input.addEventListener('blur', save);

  placeholder.replaceWith(input);
  input.select();
}

