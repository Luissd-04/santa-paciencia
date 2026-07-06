// ── PREÇOS DINÂMICOS ──
const PRECOS_MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const PRECOS_DAY_NAMES   = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

let _precosAlojId  = '';
let _precosYear    = new Date().getFullYear();
let _precosMonth   = new Date().getMonth() + 1;
let _precosPeriods = [];
let _precosBase    = 0;
let _precosTab     = 'calendario';
let _rangeStart    = null;
let _rangeEnd      = null;
let _hoverDay      = null;
let _precosNavClick = false;
let _precosOutsideListenerAttached = false;

function initPrecos() {
  _rangeStart = null;
  _rangeEnd   = null;
  _hoverDay   = null;

  _precosAlojId = (typeof SS !== 'undefined' ? SS.get('precos:aloj') : '') || '';
  populatePrecosAlojSelector();

  _updatePrecosBase();
  updatePrecosSidePanel();

  if (_precosAlojId) {
    loadPrecosPeriods();
  } else {
    renderPrecosCalendar();
    renderPrecosPeriods();
  }

  if (!_precosOutsideListenerAttached) {
    document.addEventListener('click', _precosHandleOutsideClick, true);
    _precosOutsideListenerAttached = true;
  }
}

function _precosHandleOutsideClick(e) {
  if (!_rangeStart || _rangeEnd) return;
  // Nav buttons set _precosNavClick before re-render; skip cancellation
  if (_precosNavClick) { _precosNavClick = false; return; }
  // If click is inside the pricing view, don't cancel
  if (e.target.closest('#view-precos')) return;
  cancelPrecosSelection();
}

function populatePrecosAlojSelector() {
  const sel = document.getElementById('precos-aloj-sel');
  if (!sel || typeof accommodations === 'undefined') return;
  sel.innerHTML = '<option value="">— Selecionar alojamento —</option>' +
    accommodations.map(a => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)}</option>`).join('');
  if (_precosAlojId) sel.value = _precosAlojId;
  if (window.AppUI) AppUI.enhanceSelect(sel, { placeholder: '— Selecionar alojamento —' });
}

function _updatePrecosBase() {
  const acc  = (typeof accommodations !== 'undefined') ? accommodations.find(a => a.id === _precosAlojId) : null;
  _precosBase = Number(acc?.price_per_night || 0);
  const badge = document.getElementById('precos-base-price-badge');
  const val   = document.getElementById('precos-base-price-val');
  if (badge) badge.style.display = _precosAlojId ? '' : 'none';
  if (val)   val.textContent = `€${_precosBase.toFixed(2)}`;
}

async function onPrecosAlojChange() {
  const sel = document.getElementById('precos-aloj-sel');
  _precosAlojId = sel?.value || '';
  if (typeof SS !== 'undefined') SS.set('precos:aloj', _precosAlojId);
  _rangeStart = null;
  _rangeEnd   = null;
  _hoverDay   = null;
  setPrecosMobileSheetOpen(false);
  _updatePrecosBase();
  // Clear bulk form fields when switching accommodation
  ['precos-bulk-name','precos-bulk-start','precos-bulk-end','precos-bulk-price','precos-bulk-min-nights']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  _initPrecosDow();
  updatePrecosSidePanel();
  if (_precosAlojId) {
    await loadPrecosPeriods();
  } else {
    _precosPeriods = [];
    renderPrecosCalendar();
    renderPrecosPeriods();
  }
}

async function loadPrecosPeriods() {
  if (!_precosAlojId) return;
  try {
    const res = await apiGet(`/api/accommodations/${_precosAlojId}/pricing-periods`);
    _precosPeriods = res.data || [];
    renderPrecosCalendar();
    renderPrecosPeriods();
  } catch (e) {
    toast('❌ Erro ao carregar períodos de preço.', 'error');
  }
}

function showPrecosTab(tab) {
  _precosTab = tab;
  ['calendario', 'config'].forEach(t => {
    const panel = document.getElementById(`precos-panel-${t}`);
    const btn   = document.getElementById(`precos-tab-btn-${t}`);
    if (panel) panel.style.display = t === tab ? '' : 'none';
    if (btn)   btn.classList.toggle('active', t === tab);
  });
}

function precosNavMonth(dir) {
  _precosNavClick = true; // prevent outside-click handler from cancelling selection
  _precosMonth += dir;
  if (_precosMonth > 12) { _precosMonth = 1; _precosYear++; }
  if (_precosMonth < 1)  { _precosMonth = 12; _precosYear--; }
  renderPrecosCalendar();
}

function _periodMatchesDay(p, iso) {
  if (p.start_date > iso || p.end_date < iso) return false;
  if (!p.days_of_week) return true;
  try {
    const dow = typeof p.days_of_week === 'string' ? JSON.parse(p.days_of_week) : p.days_of_week;
    return dow.includes(new Date(iso + 'T12:00:00').getDay());
  } catch { return true; }
}

function _getPriceForDay(iso) {
  const sorted = [..._precosPeriods].sort((a, b) => a.start_date.localeCompare(b.start_date));
  const period = sorted.find(p => _periodMatchesDay(p, iso));
  return period ? { price: Number(period.price_per_night), period } : { price: _precosBase, period: null };
}

function _fmtDisplay(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function renderPrecosCalendar() {
  const container = document.getElementById('precos-calendar-container');
  const hintEl    = document.getElementById('precos-selection-hint');
  if (!container) return;

  const today    = new Date().toISOString().slice(0, 10);
  const firstDay = new Date(_precosYear, _precosMonth - 1, 1);
  const lastDay  = new Date(_precosYear, _precosMonth, 0);
  const startDow = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  let rangeA = _rangeStart, rangeB = _rangeEnd;
  if (rangeA && rangeB && rangeA > rangeB) [rangeA, rangeB] = [rangeB, rangeA];

  let hoverA = null, hoverB = null;
  if (_rangeStart && !_rangeEnd && _hoverDay) {
    hoverA = _rangeStart < _hoverDay ? _rangeStart : _hoverDay;
    hoverB = _rangeStart < _hoverDay ? _hoverDay   : _rangeStart;
  }

  // Header with month nav
  let html = `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;padding:0 2px;">
    <button class="btn btn-ghost btn-sm" data-precos-nav onclick="_precosNavClick=true;precosNavMonth(-1)" style="gap:4px;">${lcIcon('chevron-left',16)} Anterior</button>
    <div style="font-size:17px;font-weight:700;color:var(--texto);">${PRECOS_MONTH_NAMES[_precosMonth-1]} ${_precosYear}</div>
    <button class="btn btn-ghost btn-sm" data-precos-nav onclick="_precosNavClick=true;precosNavMonth(1)" style="gap:4px;">Seguinte ${lcIcon('chevron-right',16)}</button>
  </div>`;

  if (!_precosAlojId) {
    html += `<div style="text-align:center;padding:40px 20px;color:var(--cinza);font-size:14px;">Seleciona um alojamento para ver o calendário de preços.</div>`;
    container.innerHTML = html;
    if (hintEl) hintEl.innerHTML = '';
    if (window.lucide) lucide.createIcons();
    return;
  }

  // Day headers
  html += `<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px;margin-bottom:3px;">`;
  PRECOS_DAY_NAMES.forEach(d => {
    html += `<div style="text-align:center;font-size:10px;font-weight:700;color:var(--cinza);text-transform:uppercase;letter-spacing:.4px;padding:5px 0;">${d}</div>`;
  });
  html += `</div>`;

  // Day grid
  html += `<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px;">`;
  for (let i = 0; i < startDow; i++) {
    html += `<div style="min-height:64px;"></div>`;
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const mm  = String(_precosMonth).padStart(2, '0');
    const dd  = String(d).padStart(2, '0');
    const iso = `${_precosYear}-${mm}-${dd}`;
    const { price, period } = _getPriceForDay(iso);

    const isToday = iso === today;
    const isStart = iso === _rangeStart;
    const isEnd   = iso === _rangeEnd;
    const inFinal = rangeA && rangeB && iso > rangeA && iso < rangeB;
    const inHover = hoverA && iso >= hoverA && iso <= hoverB && !isStart;

    // Determine period color tier
    let periodTier = 'none'; // 'none' | 'cheaper' | 'pricier' | 'same'
    if (period) {
      if (price < _precosBase)      periodTier = 'cheaper';
      else if (price > _precosBase) periodTier = 'pricier';
      else                          periodTier = 'same';
    }

    let bg          = 'var(--bg-card,#fff)';
    let borderColor = 'var(--borda)';
    let dayColor    = 'var(--texto)';
    let priceColor  = 'var(--cinza)';
    let priceFw     = '400';
    let periodBar   = '';

    if (isStart || isEnd) {
      bg = 'var(--marca)'; borderColor = 'var(--marca)';
      dayColor = '#fff'; priceColor = 'rgba(255,255,255,.85)'; priceFw = '600';
    } else if (inFinal) {
      bg = 'rgba(139,58,36,.1)'; borderColor = 'rgba(139,58,36,.3)';
    } else if (inHover) {
      bg = 'rgba(74,127,165,.1)'; borderColor = 'rgba(74,127,165,.35)';
    } else if (periodTier === 'cheaper') {
      bg = 'rgba(34,197,94,.12)'; borderColor = 'rgba(34,197,94,.4)';
      priceColor = '#16a34a'; priceFw = '700';
      periodBar = `<div style="height:3px;border-radius:0 0 7px 7px;background:#16a34a;position:absolute;bottom:0;left:0;right:0;opacity:.55;"></div>`;
    } else if (periodTier === 'pricier') {
      bg = 'rgba(239,68,68,.1)'; borderColor = 'rgba(239,68,68,.4)';
      priceColor = '#dc2626'; priceFw = '700';
      periodBar = `<div style="height:3px;border-radius:0 0 7px 7px;background:#dc2626;position:absolute;bottom:0;left:0;right:0;opacity:.55;"></div>`;
    } else if (periodTier === 'same') {
      bg = 'rgba(74,127,165,.07)'; borderColor = 'rgba(74,127,165,.3)';
      priceColor = 'var(--azul)'; priceFw = '600';
      periodBar = `<div style="height:3px;border-radius:0 0 7px 7px;background:var(--azul);position:absolute;bottom:0;left:0;right:0;opacity:.45;"></div>`;
    }

    const todayDot = isToday
      ? `<div style="width:4px;height:4px;border-radius:50%;background:${(isStart||isEnd)?'rgba(255,255,255,.7)':'var(--marca)'};margin:0 auto 2px;"></div>`
      : '';

    const tip = period ? ` title="${period.name}: €${price % 1 === 0 ? price : price.toFixed(2)}/noite"` : '';
    const priceLbl = price % 1 === 0 ? `€${price}` : `€${price.toFixed(2)}`;

    html += `<div class="precos-day-cell" data-date="${iso}"
      style="position:relative;min-height:64px;border-radius:8px;padding:7px 4px 6px;text-align:center;background:${bg};border:1px solid ${borderColor};cursor:pointer;transition:background .1s,border-color .1s;user-select:none;"
      onclick="handlePrecosDayClick('${iso}')"
      onmouseenter="handlePrecosDayHover('${iso}')"
      onmouseleave="handlePrecosDayLeave()"
      ${tip}>
      ${todayDot}
      <div style="font-size:14px;font-weight:600;color:${dayColor};line-height:1;">${d}</div>
      <div style="font-size:11px;font-weight:${priceFw};color:${priceColor};margin-top:4px;line-height:1;">${priceLbl}</div>
      ${periodBar}
    </div>`;
  }
  html += `</div>`;

  // Legend
  html += `<div style="display:flex;gap:14px;margin-top:14px;flex-wrap:wrap;padding:0 2px;">
    <div style="display:flex;align-items:center;gap:5px;font-size:11.5px;color:var(--cinza);">
      <div style="width:12px;height:12px;border-radius:3px;border:1px solid var(--borda);flex-shrink:0;"></div> Preço base
    </div>
    <div style="display:flex;align-items:center;gap:5px;font-size:11.5px;color:var(--cinza);">
      <div style="width:12px;height:12px;border-radius:3px;background:rgba(34,197,94,.18);border:1px solid rgba(34,197,94,.5);flex-shrink:0;"></div> Mais barato
    </div>
    <div style="display:flex;align-items:center;gap:5px;font-size:11.5px;color:var(--cinza);">
      <div style="width:12px;height:12px;border-radius:3px;background:rgba(239,68,68,.14);border:1px solid rgba(239,68,68,.5);flex-shrink:0;"></div> Mais caro
    </div>
    <div style="display:flex;align-items:center;gap:5px;font-size:11.5px;color:var(--cinza);">
      <div style="width:12px;height:12px;border-radius:3px;background:var(--marca);flex-shrink:0;"></div> Seleção
    </div>
  </div>`;

  container.innerHTML = html;

  // Selection hint
  if (hintEl) {
    if (_rangeStart && !_rangeEnd) {
      hintEl.innerHTML = `<div style="margin-top:10px;padding:9px 14px;background:rgba(74,127,165,.1);border-left:3px solid var(--azul);border-radius:6px;font-size:13px;color:var(--azul);display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        ${lcIcon('info',14)}
        <span><b>Início:</b> ${_fmtDisplay(_rangeStart)} — Clica noutro dia para definir o fim do período.</span>
        <button class="btn btn-ghost btn-sm" style="margin-left:auto;font-size:12px;color:var(--cinza);" onclick="cancelPrecosSelection()">Cancelar</button>
      </div>`;
      if (window.lucide) lucide.createIcons();
    } else {
      hintEl.innerHTML = '';
    }
  }

  if (window.lucide) lucide.createIcons();
}

let _hoverRafId = null;
function handlePrecosDayHover(iso) {
  if (!_rangeStart || _rangeEnd || _hoverDay === iso) return;
  _hoverDay = iso;
  if (_hoverRafId) return;
  _hoverRafId = requestAnimationFrame(() => {
    _hoverRafId = null;
    renderPrecosCalendar();
  });
}

function handlePrecosDayLeave() {
  if (_rangeStart && !_rangeEnd && _hoverDay) {
    _hoverDay = null;
    renderPrecosCalendar();
  }
}

function handlePrecosDayClick(iso) {
  if (!_precosAlojId) return;

  if (!_rangeStart || (_rangeStart && _rangeEnd)) {
    _rangeStart = iso;
    _rangeEnd   = null;
    _hoverDay   = null;
    // Fill start date input immediately
    const startEl = document.getElementById('precos-bulk-start');
    if (startEl) startEl.value = _isoToPt(iso);
    const endEl = document.getElementById('precos-bulk-end');
    if (endEl) endEl.value = '';
    renderPrecosCalendar();
    return;
  }

  // Complete range
  let start = _rangeStart, end = iso;
  if (start > end) [start, end] = [end, start];
  _rangeStart = start;
  _rangeEnd   = end;
  _hoverDay   = null;
  // Fill both date inputs
  const startEl = document.getElementById('precos-bulk-start');
  const endEl   = document.getElementById('precos-bulk-end');
  if (startEl) startEl.value = _isoToPt(start);
  if (endEl)   endEl.value   = _isoToPt(end);
  renderPrecosCalendar();
  setPrecosMobileSheetOpen(true); // no telemóvel, o painel de edição sobe como folha inferior assim que o intervalo fica completo
}

// No mobile, o painel de edição (#precos-side-panel) vira uma folha deslizante
// a partir do fundo do ecrã, em vez do painel lateral fixo do desktop.
function setPrecosMobileSheetOpen(open) {
  document.getElementById('precos-side-panel')?.classList.toggle('precos-sheet-open', open);
  document.getElementById('precos-sheet-backdrop')?.classList.toggle('active', open);
}

function cancelPrecosSelection() {
  clearPrecosBulkForm();
}

// ── LISTA DE PERÍODOS ──
function renderPrecosPeriods() {
  const list = document.getElementById('precos-periods-list');
  if (!list) return;

  if (!_precosAlojId) {
    list.innerHTML = `<div style="padding:24px;text-align:center;color:var(--cinza);font-size:14px;">Seleciona um alojamento para gerir os períodos de preço.</div>`;
    return;
  }

  if (!_precosPeriods.length) {
    list.innerHTML = `<div style="padding:16px;text-align:center;color:var(--cinza);font-size:13px;border:1px dashed var(--borda);border-radius:8px;">Sem períodos especiais. O preço base aplica-se em todas as noites.</div>`;
    return;
  }

  const DOW_LABELS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  function _dowBadge(days_of_week) {
    if (!days_of_week) return '';
    try {
      const list = typeof days_of_week === 'string' ? JSON.parse(days_of_week) : days_of_week;
      if (!list.length || list.length === 7) return '';
      const label = list.map(d => DOW_LABELS[d]).join(', ');
      return `<span style="display:inline-block;margin-left:6px;font-size:10px;font-weight:600;padding:1px 6px;border-radius:10px;background:rgba(var(--azul-rgb,59,130,246),.12);color:var(--azul);">${label}</span>`;
    } catch { return ''; }
  }

  const sorted = [..._precosPeriods].sort((a, b) => a.start_date.localeCompare(b.start_date));
  const table = `<table class="precos-periods-table" style="width:100%;border-collapse:collapse;font-size:13px;">
    <thead>
      <tr style="border-bottom:2px solid var(--cinza-claro);">
        <th style="text-align:left;padding:8px 10px;font-weight:600;color:var(--cinza);text-transform:uppercase;font-size:11px;letter-spacing:.4px;">Nome</th>
        <th style="text-align:left;padding:8px 10px;font-weight:600;color:var(--cinza);text-transform:uppercase;font-size:11px;letter-spacing:.4px;">Início</th>
        <th style="text-align:left;padding:8px 10px;font-weight:600;color:var(--cinza);text-transform:uppercase;font-size:11px;letter-spacing:.4px;">Fim</th>
        <th style="text-align:right;padding:8px 10px;font-weight:600;color:var(--cinza);text-transform:uppercase;font-size:11px;letter-spacing:.4px;">€/noite</th>
        <th style="text-align:right;padding:8px 10px;font-weight:600;color:var(--cinza);text-transform:uppercase;font-size:11px;letter-spacing:.4px;">Min.</th>
        <th style="width:80px;"></th>
      </tr>
    </thead>
    <tbody>
      ${sorted.map(p => {
        const price = Number(p.price_per_night);
        const dot = price < _precosBase ? '#16a34a' : price > _precosBase ? '#dc2626' : 'var(--azul)';
        return `<tr style="border-bottom:1px solid var(--cinza-claro);">
          <td style="padding:10px;">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <div style="width:9px;height:9px;border-radius:50%;background:${dot};flex-shrink:0;"></div>
              <span style="font-weight:500;">${escapeHtml(p.name)}</span>
              ${_dowBadge(p.days_of_week)}
            </div>
          </td>
          <td style="padding:10px;color:var(--cinza);">${_fmtDisplay(p.start_date)}</td>
          <td style="padding:10px;color:var(--cinza);">${_fmtDisplay(p.end_date)}</td>
          <td style="padding:10px;text-align:right;font-weight:700;color:${dot};">€${price % 1 === 0 ? price : price.toFixed(2)}</td>
          <td style="padding:10px;text-align:right;color:var(--cinza);font-size:12px;">${p.min_nights ?? 1}n</td>
          <td style="padding:10px;text-align:right;white-space:nowrap;">
            <button class="btn btn-ghost btn-sm" style="padding:4px 8px;" onclick="openPrecosPeriodModal('${p.id}')" title="Editar">${lcIcon('pencil',13)}</button>
            <button class="btn btn-ghost btn-sm" style="padding:4px 8px;color:var(--vermelho);" onclick="deletePrecosPeriod('${p.id}')" title="Eliminar">${lcIcon('trash-2',13)}</button>
          </td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>`;

  const cards = `<div class="precos-periods-mobile-cards">${sorted.map(p => {
    const price = Number(p.price_per_night);
    const dot = price < _precosBase ? '#16a34a' : price > _precosBase ? '#dc2626' : 'var(--azul)';
    return `<div class="m-period-card" style="border-left-color:${dot}" onclick="openPrecosPeriodModal('${p.id}')">
      <div class="mpc-top">
        <span class="mpc-name">${escapeHtml(p.name)}${_dowBadge(p.days_of_week)}</span>
        <span class="mpc-price" style="color:${dot}">€${price % 1 === 0 ? price : price.toFixed(2)}</span>
      </div>
      <div class="mpc-dates">${_fmtDisplay(p.start_date)} — ${_fmtDisplay(p.end_date)} · min. ${p.min_nights ?? 1}n</div>
      <div class="mpc-actions" onclick="event.stopPropagation()">
        <button class="m-card-btn" onclick="openPrecosPeriodModal('${p.id}')"><i data-lucide="pencil"></i></button>
        <button class="m-card-btn" onclick="deletePrecosPeriod('${p.id}')"><i data-lucide="trash-2"></i></button>
      </div>
    </div>`;
  }).join('')}</div>`;

  list.innerHTML = table + cards;
  if (window.lucide) lucide.createIcons();
}

// ── SIDE PANEL ──
function updatePrecosSidePanel() {
  const emptyEl = document.getElementById('precos-side-panel-empty');
  const formEl  = document.getElementById('precos-side-panel-form');
  if (!emptyEl || !formEl) return;

  if (!_precosAlojId) {
    emptyEl.style.display = '';
    formEl.style.display  = 'none';
    return;
  }

  // Accommodation selected — always show form
  emptyEl.style.display      = 'none';
  formEl.style.display       = 'flex';
  formEl.style.flexDirection = 'column';
  formEl.style.gap           = '12px';

  // Attach change listeners once (no-op if already attached)
  _attachPrecosBulkDateListeners();

  // Pre-fill dates from calendar selection if available
  const startEl = document.getElementById('precos-bulk-start');
  const endEl   = document.getElementById('precos-bulk-end');
  if (_rangeStart && startEl) startEl.value = _isoToPt(_rangeStart);
  if (_rangeEnd   && endEl)   endEl.value   = _isoToPt(_rangeEnd);

  // Pre-fill price from base if empty
  const priceEl = document.getElementById('precos-bulk-price');
  if (priceEl && !priceEl.value && _precosBase > 0) priceEl.value = _precosBase.toFixed(2);

  // Pre-fill min nights from accommodation default
  const acc = (typeof accommodations !== 'undefined') ? accommodations.find(a => a.id === _precosAlojId) : null;
  const minEl = document.getElementById('precos-bulk-min-nights');
  if (minEl && !minEl.value) minEl.value = acc?.min_nights ?? 2;

  if (window.lucide) lucide.createIcons();
}

function _attachPrecosBulkDateListeners() {
  const startEl = document.getElementById('precos-bulk-start');
  const endEl   = document.getElementById('precos-bulk-end');
  if (startEl && !startEl.dataset.precosListener) {
    startEl.dataset.precosListener = '1';
    startEl.addEventListener('change', () => {
      const iso = _ptToIso(startEl.value);
      _rangeStart = iso || null;
      _rangeEnd   = null;
      if (endEl) endEl.value = '';
      renderPrecosCalendar();
    });
  }
  if (endEl && !endEl.dataset.precosListener) {
    endEl.dataset.precosListener = '1';
    endEl.addEventListener('change', () => {
      const iso = _ptToIso(endEl.value);
      _rangeEnd = iso || null;
      renderPrecosCalendar();
    });
  }
}

function openPrecosBulkStartPicker() {
  const el = document.getElementById('precos-bulk-start');
  if (!el || !window.AppDatePicker) return;
  AppDatePicker.open(el, {});
}

function openPrecosBulkEndPicker() {
  const el = document.getElementById('precos-bulk-end');
  if (!el || !window.AppDatePicker) return;
  AppDatePicker.open(el, { minDate: _rangeStart || undefined });
}

// When user types dates manually, sync _rangeStart/_rangeEnd for calendar highlight
function onPrecosBulkDateInput() {
  const startRaw = document.getElementById('precos-bulk-start')?.value.trim();
  const endRaw   = document.getElementById('precos-bulk-end')?.value.trim();
  const s = _ptToIso(startRaw);
  const e = _ptToIso(endRaw);
  _rangeStart = s || null;
  _rangeEnd   = (e && s && e > s) ? e : null;
  renderPrecosCalendar();
}

function clearPrecosBulkForm() {
  _rangeStart = null;
  _rangeEnd   = null;
  _hoverDay   = null;
  ['precos-bulk-name','precos-bulk-start','precos-bulk-end','precos-bulk-price'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const acc = (typeof accommodations !== 'undefined') ? accommodations.find(a => a.id === _precosAlojId) : null;
  const minEl = document.getElementById('precos-bulk-min-nights');
  if (minEl) minEl.value = acc?.min_nights ?? 2;
  _initPrecosDow();
  setPrecosMobileSheetOpen(false);
  renderPrecosCalendar();
}

let _precosDowState = new Set([0,1,2,3,4,5,6]); // all selected by default

function _initPrecosDow() {
  _precosDowState = new Set([0,1,2,3,4,5,6]);
  _renderPrecosDow();
}

function _renderPrecosDow() {
  const allSelected = _precosDowState.size === 7;
  document.querySelectorAll('#precos-dow-btns .precos-dow-btn').forEach(btn => {
    const dow = btn.dataset.dow;
    if (dow === 'all') {
      btn.classList.toggle('active', allSelected);
    } else {
      btn.classList.toggle('active', _precosDowState.has(Number(dow)));
    }
  });
}

function togglePrecosDow(dow) {
  if (dow === 'all') {
    if (_precosDowState.size === 7) {
      // deselect all
      _precosDowState.clear();
    } else {
      // select all
      [0,1,2,3,4,5,6].forEach(d => _precosDowState.add(d));
    }
  } else {
    const d = Number(dow);
    if (_precosDowState.has(d)) {
      _precosDowState.delete(d);
    } else {
      _precosDowState.add(d);
    }
  }
  _renderPrecosDow();
}

async function savePrecosBulk() {
  const name  = document.getElementById('precos-bulk-name')?.value.trim();
  const price = parseFloat(document.getElementById('precos-bulk-price')?.value);
  const minN  = parseInt(document.getElementById('precos-bulk-min-nights')?.value) || 2;
  const start = _rangeStart;
  const end   = _rangeEnd;

  if (!name)  { toast('Introduz um nome para o período.', 'error'); return; }
  if (!start) { toast('Seleciona a data de início.', 'error'); return; }
  if (!end)   { toast('Seleciona a data de fim.', 'error'); return; }
  if (start >= end) { toast('A data de início deve ser anterior à data de fim.', 'error'); return; }
  if (isNaN(price) || price < 0) { toast('Introduz um preço válido.', 'error'); return; }
  if (_precosDowState.size === 0) { toast('Seleciona pelo menos um dia da semana.', 'error'); return; }

  const days_of_week = _precosDowState.size === 7 ? [] : [..._precosDowState];

  const btn = document.getElementById('precos-bulk-save-btn');
  if (btn) btn.disabled = true;
  try {
    const res = await apiPost(`/api/accommodations/${_precosAlojId}/pricing-periods/bulk`, {
      name,
      start_date: start,
      end_date: end,
      price_per_night: price,
      min_nights: minN,
      days_of_week
    });
    if (res.success) {
      const count = res.count || res.data?.length || 0;
      toast(`✅ ${count === 1 ? 'Período criado' : `${count} períodos criados`}!`, 'success');
      if (typeof invalidateWizPricingCache === 'function') invalidateWizPricingCache(_precosAlojId);
      clearPrecosBulkForm();
      await loadPrecosPeriods();
    } else {
      toast('❌ ' + (res.error || 'Erro ao guardar.'), 'error');
    }
  } catch (e) {
    toast('❌ Erro de ligação ao servidor.', 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ── MODAL DE PERÍODO ──
function openPrecosPeriodModal(id, prefillStart, prefillEnd) {
  const modal   = document.getElementById('precos-period-modal-bg');
  const titleEl = document.getElementById('precos-period-modal-title');
  const editEl  = document.getElementById('pp2-editing-id');
  if (!modal) return;

  if (id) {
    const p = _precosPeriods.find(x => x.id === id);
    if (!p) return;
    if (titleEl) titleEl.textContent = 'Editar Período de Preço';
    if (editEl)  editEl.value = id;
    document.getElementById('pp2-name').value  = p.name || '';
    document.getElementById('pp2-start').value = _isoToPt(p.start_date);
    document.getElementById('pp2-end').value   = _isoToPt(p.end_date);
    document.getElementById('pp2-price').value = Number(p.price_per_night).toFixed(2);
    const mnEl = document.getElementById('pp2-min-nights');
    if (mnEl) mnEl.value = p.min_nights ?? 1;
  } else {
    if (titleEl) titleEl.textContent = 'Novo Período de Preço';
    if (editEl)  editEl.value = '';
    document.getElementById('pp2-name').value  = '';
    document.getElementById('pp2-start').value = prefillStart ? _isoToPt(prefillStart) : '';
    document.getElementById('pp2-end').value   = prefillEnd   ? _isoToPt(prefillEnd)   : '';
    document.getElementById('pp2-price').value = _precosBase > 0 ? _precosBase.toFixed(2) : '';
    const mnEl = document.getElementById('pp2-min-nights');
    if (mnEl) {
      const acc = (typeof accommodations !== 'undefined') ? accommodations.find(a => a.id === _precosAlojId) : null;
      mnEl.value = acc?.min_nights ?? 2;
    }
  }

  modal.style.display = 'flex';
  setTimeout(() => document.getElementById('pp2-name')?.focus(), 60);
  if (window.lucide) lucide.createIcons();
}

function closePrecosPeriodModal() {
  const modal = document.getElementById('precos-period-modal-bg');
  if (modal) modal.style.display = 'none';
}

async function savePrecosPeriod() {
  const editingId = document.getElementById('pp2-editing-id')?.value;
  const name      = document.getElementById('pp2-name').value.trim();
  const startRaw  = document.getElementById('pp2-start').value.trim();
  const endRaw    = document.getElementById('pp2-end').value.trim();
  const price     = parseFloat(document.getElementById('pp2-price').value);
  const minN      = parseInt(document.getElementById('pp2-min-nights')?.value) || 1;

  if (!name)  { toast('Introduz um nome para o período.', 'error'); return; }
  const start = _ptToIso(startRaw);
  const end   = _ptToIso(endRaw);
  if (!start) { toast('Data de início inválida. Usa o formato dd-mm-aaaa.', 'error'); return; }
  if (!end)   { toast('Data de fim inválida. Usa o formato dd-mm-aaaa.', 'error'); return; }
  if (start >= end) { toast('A data de início deve ser anterior à data de fim.', 'error'); return; }
  if (isNaN(price) || price < 0) { toast('Introduz um preço válido.', 'error'); return; }

  const btn = document.getElementById('btn-save-precos-period');
  if (btn) btn.disabled = true;
  try {
    const body = { name, start_date: start, end_date: end, price_per_night: price, min_nights: minN };
    const res  = editingId
      ? await apiPut(`/api/accommodations/${_precosAlojId}/pricing-periods/${editingId}`, body)
      : await apiPost(`/api/accommodations/${_precosAlojId}/pricing-periods`, body);

    if (res.success) {
      toast(editingId ? '✅ Período atualizado!' : '✅ Período criado!', 'success');
      if (typeof invalidateWizPricingCache === 'function') invalidateWizPricingCache(_precosAlojId);
      closePrecosPeriodModal();
      _rangeStart = null;
      _rangeEnd   = null;
      await loadPrecosPeriods();
    } else {
      toast('❌ ' + (res.error || 'Erro ao guardar.'), 'error');
    }
  } catch (e) {
    toast('❌ Erro de ligação ao servidor.', 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function deletePrecosPeriod(id) {
  const p = _precosPeriods.find(x => x.id === id);
  if (!p || !confirm(`Eliminar o período "${p.name}"?`)) return;
  try {
    const res = await apiDelete(`/api/accommodations/${_precosAlojId}/pricing-periods/${id}`);
    if (res.success) {
      toast('🗑 Período eliminado.', 'info');
      if (typeof invalidateWizPricingCache === 'function') invalidateWizPricingCache(_precosAlojId);
      await loadPrecosPeriods();
    } else {
      toast('❌ ' + (res.error || 'Erro ao eliminar.'), 'error');
    }
  } catch (e) {
    toast('❌ Erro de ligação ao servidor.', 'error');
  }
}

// ── DATE HELPERS ──
function _isoToPt(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : (iso || '');
}

function _ptToIso(value) {
  const s = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{2})[/.-](\d{2})[/.-](\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}
