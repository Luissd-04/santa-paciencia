let sortCol = SS.get('res:sort', 'check_in');
let sortAsc = SS.get('res:asc', true);
let mobileChipFilter = SS.get('res:chip', '');
let reservasViewMode = 'list';
let reservasDetailOpen = false;

function _openDateTo() {
  const to = document.getElementById('filter-date-to');
  if (!to || to.value) return;
  if (window.AppDatePicker) setTimeout(() => AppDatePicker.open(to), 80);
}

function setMobileChip(el, filter) {
  mobileChipFilter = filter;
  SS.set('res:chip', filter);
  document.querySelectorAll('.mobile-filter-chips .chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderMobileCards();
}

const STATUS_COLORS = {
  confirmada: 'var(--marca)',
  pendente:   'var(--laranja)',
  cancelada:  'var(--vermelho)',
};

function renderResCardHeader(r) {
  return `<div class="mrc-top">
      <div>
        <div class="mrc-name">${r.guest_name}</div>
        <div class="mrc-id">${r.id} · ${r.accommodation_name}</div>
      </div>
      ${badgeEstado(r.status)}
    </div>`;
}

function renderResCardMeta(r) {
  return `<div class="mrc-meta">
      <div class="mrc-meta-item"><i data-lucide="calendar"></i> ${formatDate(r.check_in)}</div>
      <div class="mrc-meta-item"><i data-lucide="moon"></i> ${r.nights} noite${r.nights !== 1 ? 's' : ''}</div>
    </div>`;
}

function renderResCardTotal(r) {
  const paid  = Number(r.amount_paid  || 0);
  const total = Number(r.total_amount || 0);
  const rem   = total - paid;
  const remHtml = paid > 0 && rem > 0.01
    ? `<span style="font-size:11px;color:var(--vermelho);display:block;">falta €${rem.toFixed(2)}</span>`
    : '';
  return `<div class="mrc-total">
      <span class="mrc-channel">${r.channel || '—'} · ${badgePagamento(r.payment_status)}</span>
      <span class="mrc-price">€${total.toFixed(2)}${remHtml}</span>
    </div>`;
}

function renderResCardActions(r) {
  return `<div class="mrc-actions" onclick="event.stopPropagation()">
      <button class="m-card-btn primary" onclick="showDetail('${r.id}')">
        <i data-lucide="eye"></i> Ver
      </button>
      <button class="m-card-btn" onclick="openEditModal('${r.id}')">
        <i data-lucide="pencil"></i> Editar
      </button>
    </div>`;
}

function renderResCard(r) {
  const bc = STATUS_COLORS[r.status] || 'var(--marca)';
  return `<div class="m-res-card" style="border-left-color:${bc}" onclick="showDetail('${r.id}')">
    ${renderResCardHeader(r)}
    ${renderResCardMeta(r)}
    ${renderResCardTotal(r)}
    ${renderResCardActions(r)}
  </div>`;
}

function renderMobileCards() {
  const container = document.getElementById('mobile-res-cards');
  if (!container) return;

  const searchEl = document.getElementById('search-input') || document.getElementById('mobile-search-input');
  const q = (searchEl?.value || '').toLowerCase();
  const fe = document.getElementById('filter-estado')?.value || '';
  const fs = document.getElementById('filter-suite')?.value || '';
  const fc = document.getElementById('filter-canal')?.value || '';
  const fp = document.getElementById('filter-pagamento')?.value || '';
  const fd = normalizeIsoDateValue(document.getElementById('filter-date-from')?.value || '');
  const ft = normalizeIsoDateValue(document.getElementById('filter-date-to')?.value || '');
  const filtered = reservas.filter(r => {
    const matchQ = !q || (r.guest_name + ' ' + r.id + ' ' + (r.guest_email || '') + ' ' + r.accommodation_name).toLowerCase().includes(q);
    const matchE = !fe || r.status === fe;
    const matchS = !fs || r.accommodation_id === fs;
    const matchC = !fc || r.channel === fc;
    const matchP = !fp || r.payment_status === fp;
    const matchD = !fd || r.check_in >= fd;
    const matchT = !ft || r.check_out <= ft;
    return matchQ && matchE && matchS && matchC && matchP && matchD && matchT;
  }).sort((a, b) => new Date(b.check_in) - new Date(a.check_in));
  updateReservasSummary(filtered.length, filtered.length === 1 ? 'reserva visível' : 'resultados visíveis');

  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="es-icon">📭</div><h3>Sem reservas</h3><p>Nenhuma reserva encontrada.</p></div>';
    return;
  }

  container.innerHTML = filtered.map(renderResCard).join('');
  if (window.lucide) lucide.createIcons();
}

function updateReservasViewToggle() {
  document.querySelectorAll('[data-res-view]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.resView === reservasViewMode);
  });
  moveReservasViewPill();
}

function moveReservasViewPill() {
  const pill = document.getElementById('reservas-view-pill');
  const toggle = document.getElementById('reservas-view-toggle');
  if (!pill || !toggle) return;
  const activeBtn = toggle.querySelector(`.cal-mode-btn[data-res-view="${reservasViewMode}"]`);
  if (!activeBtn) return;
  const toggleRect = toggle.getBoundingClientRect();
  const btnRect = activeBtn.getBoundingClientRect();
  pill.style.left = (btnRect.left - toggleRect.left) + 'px';
  pill.style.width = btnRect.width + 'px';
}

function applyReservasViewMode() {
  if (reservasDetailOpen) return;
  const cards = document.getElementById('reservas-mobile');
  const list = document.getElementById('reservas-desktop');
  if (cards) cards.style.setProperty('display', reservasViewMode === 'card' ? 'block' : 'none', 'important');
  if (list) list.style.setProperty('display', reservasViewMode === 'list' ? 'block' : 'none', 'important');
  updateReservasViewToggle();
}

function setReservasViewMode(mode) {
  reservasViewMode = mode === 'list' ? 'list' : 'card';
  renderTabela();
  requestAnimationFrame(moveReservasViewPill);
}

const DIAL_COUNTRIES = [
  { code:'PT', name:'Portugal',         dial:'+351', flag:'🇵🇹' },
  { code:'ES', name:'Espanha',          dial:'+34',  flag:'🇪🇸' },
  { code:'FR', name:'França',           dial:'+33',  flag:'🇫🇷' },
  { code:'GB', name:'Reino Unido',      dial:'+44',  flag:'🇬🇧' },
  { code:'DE', name:'Alemanha',         dial:'+49',  flag:'🇩🇪' },
  { code:'IT', name:'Itália',           dial:'+39',  flag:'🇮🇹' },
  { code:'NL', name:'Países Baixos',    dial:'+31',  flag:'🇳🇱' },
  { code:'BE', name:'Bélgica',          dial:'+32',  flag:'🇧🇪' },
  { code:'CH', name:'Suíça',            dial:'+41',  flag:'🇨🇭' },
  { code:'AT', name:'Áustria',          dial:'+43',  flag:'🇦🇹' },
  { code:'SE', name:'Suécia',           dial:'+46',  flag:'🇸🇪' },
  { code:'NO', name:'Noruega',          dial:'+47',  flag:'🇳🇴' },
  { code:'DK', name:'Dinamarca',        dial:'+45',  flag:'🇩🇰' },
  { code:'FI', name:'Finlândia',        dial:'+358', flag:'🇫🇮' },
  { code:'IE', name:'Irlanda',          dial:'+353', flag:'🇮🇪' },
  { code:'PL', name:'Polónia',          dial:'+48',  flag:'🇵🇱' },
  { code:'CZ', name:'República Checa',  dial:'+420', flag:'🇨🇿' },
  { code:'HU', name:'Hungria',          dial:'+36',  flag:'🇭🇺' },
  { code:'RO', name:'Roménia',          dial:'+40',  flag:'🇷🇴' },
  { code:'GR', name:'Grécia',           dial:'+30',  flag:'🇬🇷' },
  { code:'US', name:'Estados Unidos',   dial:'+1',   flag:'🇺🇸' },
  { code:'CA', name:'Canadá',           dial:'+1',   flag:'🇨🇦' },
  { code:'MX', name:'México',           dial:'+52',  flag:'🇲🇽' },
  { code:'BR', name:'Brasil',           dial:'+55',  flag:'🇧🇷' },
  { code:'AR', name:'Argentina',        dial:'+54',  flag:'🇦🇷' },
  { code:'CL', name:'Chile',            dial:'+56',  flag:'🇨🇱' },
  { code:'CO', name:'Colômbia',         dial:'+57',  flag:'🇨🇴' },
  { code:'AO', name:'Angola',           dial:'+244', flag:'🇦🇴' },
  { code:'MZ', name:'Moçambique',       dial:'+258', flag:'🇲🇿' },
  { code:'CV', name:'Cabo Verde',       dial:'+238', flag:'🇨🇻' },
  { code:'GW', name:'Guiné-Bissau',     dial:'+245', flag:'🇬🇼' },
  { code:'ST', name:'São Tomé e Príncipe', dial:'+239', flag:'🇸🇹' },
  { code:'ZA', name:'África do Sul',    dial:'+27',  flag:'🇿🇦' },
  { code:'MA', name:'Marrocos',         dial:'+212', flag:'🇲🇦' },
  { code:'CN', name:'China',            dial:'+86',  flag:'🇨🇳' },
  { code:'JP', name:'Japão',            dial:'+81',  flag:'🇯🇵' },
  { code:'KR', name:'Coreia do Sul',    dial:'+82',  flag:'🇰🇷' },
  { code:'IN', name:'Índia',            dial:'+91',  flag:'🇮🇳' },
  { code:'AU', name:'Austrália',        dial:'+61',  flag:'🇦🇺' },
  { code:'NZ', name:'Nova Zelândia',    dial:'+64',  flag:'🇳🇿' },
  { code:'RU', name:'Rússia',           dial:'+7',   flag:'🇷🇺' },
  { code:'TR', name:'Turquia',          dial:'+90',  flag:'🇹🇷' },
  { code:'IL', name:'Israel',           dial:'+972', flag:'🇮🇱' },
  { code:'AE', name:'Emirados Árabes',  dial:'+971', flag:'🇦🇪' },
  { code:'LU', name:'Luxemburgo',       dial:'+352', flag:'🇱🇺' },
  { code:'SK', name:'Eslováquia',       dial:'+421', flag:'🇸🇰' },
  { code:'HR', name:'Croácia',          dial:'+385', flag:'🇭🇷' },
  { code:'UA', name:'Ucrânia',          dial:'+380', flag:'🇺🇦' },
];

function buildCountrySelects() {
  const prefixOpts = DIAL_COUNTRIES.map(c =>
    `<option value="${c.dial}" data-code="${c.code}">${c.flag} ${c.dial}</option>`
  ).join('');
  const countryOpts = '<option value="">— País —</option>' +
    DIAL_COUNTRIES.map(c => `<option value="${c.name}">${c.flag} ${c.name}</option>`).join('');

  document.querySelectorAll('.phone-prefix').forEach(el => { el.innerHTML = prefixOpts; });
  document.querySelectorAll('select#f-pais, select#f-doc-emissor, select.guest-country').forEach(el => { el.innerHTML = countryOpts; });
  enhanceReservationSelects();
}

function enhanceReservationSelects(root = document) {
  if (!window.AppUI) return;
  root.querySelectorAll('.phone-prefix').forEach(el => AppUI.enhanceSelect(el, { placeholder: '+351' }));
  root.querySelectorAll('select#f-pais, select#f-doc-emissor, select.guest-country, select[data-field="doc_emissor"]').forEach(el => {
    AppUI.enhanceSelect(el, { placeholder: 'País' });
  });
  root.querySelectorAll('select#f-doc-tipo, select[data-field="doc_type"], select[data-field="id_type"]').forEach(el => {
    AppUI.enhanceSelect(el, { placeholder: 'Tipo de documento' });
  });
}

async function loadReservas() {
  // Restore persisted filters
  const sv = (id, key) => { const el = document.getElementById(id); if (el && !el.value) el.value = SS.get(key, ''); };
  sv('search-input', 'res:q'); sv('filter-estado', 'res:fe'); sv('filter-suite', 'res:fs');
  sv('filter-canal', 'res:fc'); sv('filter-pagamento', 'res:fp');
  sv('filter-date-from', 'res:fd'); sv('filter-date-to', 'res:ft');
  AppUI.refreshDropdowns(document.getElementById('view-reservas'));
  // Restore sort icon
  document.querySelectorAll('.sort-icon').forEach(el => el.textContent = '');
  const sIcon = document.getElementById('sort-' + sortCol);
  if (sIcon) sIcon.textContent = sortAsc ? '↑' : '↓';

  document.getElementById('tabela-loading').style.display = 'flex';
  document.getElementById('tabela-body').innerHTML = '';
  document.getElementById('tabela-empty').style.display = 'none';
  try {
    const data = await apiGet('/api/reservations');
    reservas = data.data || [];
    if (window.PubSub) PubSub.emit('reservas:updated', reservas);
    renderTabela();
  } catch (e) {
    toast('❌ Erro ao carregar reservas. Backend ligado?', 'error');
    document.getElementById('tabela-loading').style.display = 'none';
  }
}

function sortTabela(col) {
  if (sortCol === col) {
    sortAsc = !sortAsc;
  } else {
    sortCol = col;
    sortAsc = true;
  }
  SS.set('res:sort', sortCol);
  SS.set('res:asc', sortAsc);
  document.querySelectorAll('.sort-icon').forEach(el => el.textContent = '');
  const icon = document.getElementById('sort-' + col);
  if (icon) icon.textContent = sortAsc ? '↑' : '↓';
  renderTabela();
}

function renderTabela() {
  const q  = (document.getElementById('search-input')    || { value: '' }).value.toLowerCase();
  const fe = (document.getElementById('filter-estado')   || { value: '' }).value;
  const fs = (document.getElementById('filter-suite')    || { value: '' }).value;
  const fc = (document.getElementById('filter-canal')    || { value: '' }).value;
  const fp = (document.getElementById('filter-pagamento')|| { value: '' }).value;
  const fd = normalizeIsoDateValue((document.getElementById('filter-date-from')|| { value: '' }).value);
  const ft = normalizeIsoDateValue((document.getElementById('filter-date-to')  || { value: '' }).value);
  SS.set('res:q', document.getElementById('search-input')?.value || '');
  SS.set('res:fe', fe); SS.set('res:fs', fs); SS.set('res:fc', fc);
  SS.set('res:fp', fp); SS.set('res:fd', fd); SS.set('res:ft', ft);

  let data = reservas.filter(r => {
    const matchQ = !q || (r.guest_name + ' ' + r.id + ' ' + (r.guest_email || '') + ' ' + r.accommodation_name).toLowerCase().includes(q);
    const matchE = !fe || r.status === fe;
    const matchS = !fs || r.accommodation_id === fs;
    const matchC = !fc || r.channel === fc;
    const matchP = !fp || r.payment_status === fp;
    const matchD = !fd || r.check_in >= fd;
    const matchT = !ft || r.check_out <= ft;
    return matchQ && matchE && matchS && matchC && matchP && matchD && matchT;
  }).sort((a, b) => {
    let va = a[sortCol] ?? '';
    let vb = b[sortCol] ?? '';
    if (sortCol === 'check_in' || sortCol === 'check_out') {
      va = new Date(va); vb = new Date(vb);
    } else if (sortCol === 'total_amount' || sortCol === 'nights') {
      va = Number(va); vb = Number(vb);
    } else {
      va = String(va).toLowerCase(); vb = String(vb).toLowerCase();
    }
    if (va < vb) return sortAsc ? -1 : 1;
    if (va > vb) return sortAsc ? 1 : -1;
    return 0;
  });

  const tbody = document.getElementById('tabela-body');
  const empty = document.getElementById('tabela-empty');
  const loading = document.getElementById('tabela-loading');

  loading.style.display = 'none';
  updateReservasSummary(data.length, data.length === 1 ? 'reserva visível' : 'resultados visíveis');

  if (data.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    renderMobileCards();
    applyReservasViewMode();
    return;
  }
  empty.style.display = 'none';
  renderMobileCards();
  tbody.innerHTML = data.map(r => `
    <tr onclick="showDetail('${r.id}')">
      <td><code style="font-size:11.5px;color:var(--azul-claro)">${r.id}</code></td>
      <td><b>${r.guest_name}</b><br><span style="font-size:11.5px;color:var(--cinza)">${r.guest_email || ''}</span></td>
      <td>${accomChip(r)}</td>
      <td>${formatDate(r.check_in)}</td>
      <td>${formatDate(r.check_out)}</td>
      <td>${r.nights}</td>
      <td>${renderGuestsCell(r)}</td>
      <td><b>€${Number(r.total_amount || 0).toFixed(2)}</b></td>
      <td><span style="font-size:12px;color:var(--cinza)">${r.channel}</span></td>
      <td>${badgeEstado(r.status)}</td>
      <td>${badgePagamento(r.payment_status)}${(() => {
        const paid = Number(r.amount_paid || 0);
        const total = Number(r.total_amount || 0);
        if (paid <= 0) return '';
        const rem = total - paid;
        if (rem > 0.01) return `<br><span style="font-size:11px;color:var(--vermelho);">€${paid.toFixed(2)} / falta €${rem.toFixed(2)}</span>`;
        return `<br><span style="font-size:11px;color:var(--cinza);">€${paid.toFixed(2)}</span>`;
      })()}</td>
      <td onclick="event.stopPropagation()" style="white-space:nowrap">
        <button class="btn btn-ghost btn-sm" onclick="openEditModal('${r.id}')" title="Editar">
          ${lcIcon('pencil', 13)}
        </button>
        <button class="btn btn-ghost btn-sm" onclick="openInvoiceForReservation('${r.id}','${(r.guest_email||'').replace(/'/g,"\\'")}','${(r.guest_name||'').replace(/'/g,"\\'")}');event.stopPropagation()" title="Enviar email">
          ${lcIcon('mail', 13)}
        </button>
        ${r.status === 'cancelada'
          ? `<button class="btn btn-sm" style="background:rgba(46,125,82,.12);color:#2e7d52" onclick="reativarReserva('${r.id}')" title="Reativar reserva">
               ${lcIcon('refresh-cw', 13)}
             </button>`
          : `<button class="btn btn-sm" style="background:rgba(176,48,48,.1);color:var(--vermelho)" onclick="deleteReserva('${r.id}')" title="Cancelar reserva">
               ${lcIcon('trash-2', 13)}
             </button>`}
      </td>
    </tr>`).join('');
  if (window.lucide) lucide.createIcons();
  applyReservasViewMode();
}

function renderGuestsCell(r) {
  const adults   = r.num_adults != null ? Number(r.num_adults) : Number(r.num_guests || 0);
  const children = Number(r.num_children || 0);
  const iconPerson = (sz, col) =>
    `<svg width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="none" stroke="${col}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;flex-shrink:0"><circle cx="12" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/></svg>`;
  const parts = [];
  if (adults   > 0) parts.push(`<span style="display:inline-flex;align-items:center;gap:3px;font-size:12px;color:var(--azul)">${adults}${iconPerson(13, 'currentColor')}</span>`);
  if (children > 0) parts.push(`<span style="display:inline-flex;align-items:center;gap:3px;font-size:12px;color:var(--azul-claro)">${children}${iconPerson(10, 'currentColor')}</span>`);
  return parts.length
    ? `<span style="display:inline-flex;align-items:center;gap:6px">${parts.join('')}</span>`
    : '—';
}

function updateReservasSummary(total, detailText) {
  const totalEl = document.getElementById('reservas-results-total');
  const detailEl = document.getElementById('reservas-results-detail');
  if (totalEl) totalEl.textContent = String(total ?? 0);
  if (detailEl) detailEl.textContent = detailText || 'resultados visíveis';
}

function setReservasDetailMode(isDetail) {
  reservasDetailOpen = isDetail;
  document.querySelectorAll('.view-toolbar-reservas, .reservas-filter-panel, #reservas-mobile, #reservas-desktop').forEach(el => {
    el.style.setProperty('display', isDetail ? 'none' : '', isDetail ? 'important' : '');
  });
  const detailPage = document.getElementById('reserva-detail-page');
  if (detailPage) detailPage.style.display = isDetail ? 'block' : 'none';
  if (!isDetail) applyReservasViewMode();
}

function showReservasList() {
  setReservasDetailMode(false);
  AppUI.closeModal('detail-bg');
  if (window.innerWidth <= 700) renderMobileCards();
}

function clearReservasFilters() {
  ['search-input', 'filter-date-from', 'filter-date-to', 'mobile-search-input'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  ['filter-estado', 'filter-suite', 'filter-canal', 'filter-pagamento'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  ['res:q', 'res:fe', 'res:fs', 'res:fc', 'res:fp', 'res:fd', 'res:ft', 'res:chip'].forEach(key => SS.set(key, ''));
  mobileChipFilter = '';
  document.querySelectorAll('.mobile-filter-chips .chip').forEach((chip, index) => {
    chip.classList.toggle('active', index === 0);
  });
  AppUI.refreshDropdowns(document.getElementById('view-reservas'));
  renderTabela();
}

function updateForeignRequirements() {
  const pais = document.getElementById('f-pais')?.value;
  const isForeign = pais && pais !== 'Portugal';
  document.querySelectorAll('.req-foreign').forEach(el => {
    el.style.display = isForeign ? '' : 'none';
  });
}

function _resetGuestFields() {
  ['f-nome-completo','f-email','f-tel-num',
   'f-doc-num','f-local-nascimento','f-nascimento','f-nif','f-morada','f-cp','f-cidade','f-notas'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const docTipo = document.getElementById('f-doc-tipo'); if (docTipo) docTipo.value = '';
  const pais = document.getElementById('f-pais'); if (pais) pais.value = '';
  const docEmissor = document.getElementById('f-doc-emissor'); if (docEmissor) docEmissor.value = '';
  const prefix = document.getElementById('f-tel-prefix'); if (prefix) prefix.value = '+351';
  const rgpd = document.getElementById('f-rgpd-check'); if (rgpd) { rgpd.checked = false; rgpd.closest('.rgpd-box')?.classList.remove('rgpd-accepted'); }
  updateForeignRequirements();
}

function onPaymentStatusChange() {
  const ps = document.getElementById('f-payment-status').value;
  document.getElementById('pagamento-metodo-wrap').style.display =
    (ps === 'confirmado' || ps === 'parcial') ? '' : 'none';
}

function onAmountPaidChange() {
  const paid = parseFloat(document.getElementById('f-amount-paid').value) || 0;
  const total = parseFloat(document.getElementById('f-total').value) || 0;
  const psEl = document.getElementById('f-payment-status');
  const remWrap = document.getElementById('payment-remaining-wrap');
  const remVal = document.getElementById('payment-remaining-val');

  if (paid > 0 && total > 0) {
    if (paid >= total) {
      psEl.value = 'confirmado';
      if (remWrap) remWrap.style.display = 'none';
    } else {
      psEl.value = 'parcial';
      const rem = total - paid;
      if (remWrap) remWrap.style.display = '';
      if (remVal) remVal.textContent = '€' + rem.toFixed(2);
    }
  } else {
    psEl.value = 'pendente';
    if (remWrap) remWrap.style.display = 'none';
  }
  onPaymentStatusChange();
}

// ── WIZARD STATE ──
let wizStep = 1;

function addDaysToIsoDate(dateStr, days = 1) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function openModal(config = {}) {
  editingId = null;
  wizStep = config.step || 1;
  const titleEl = document.getElementById('modal-title');
  if (titleEl) titleEl.textContent = 'Nova Reserva';
  buildCountrySelects();
  _resetGuestFields();
  document.getElementById('f-checkin').value = formatDateForStandardInput(config.checkIn || '');
  document.getElementById('f-checkout').value = formatDateForStandardInput(config.checkOut || '');
  document.getElementById('f-num-hospedes').value = 2;
  document.getElementById('f-breakfast').value = 'false';
  document.getElementById('f-canal').value = 'direto';
  document.getElementById('f-estado').value = 'confirmada';
  document.getElementById('f-payment-status').value = 'pendente';
  document.getElementById('pagamento-metodo-wrap').style.display = 'none';
  document.getElementById('f-pagamento').value = 'transferencia';
  const amtPaidEl = document.getElementById('f-amount-paid'); if (amtPaidEl) amtPaidEl.value = '';
  const payDateEl = document.getElementById('f-payment-date'); if (payDateEl) payDateEl.value = '';
  const remWrap = document.getElementById('payment-remaining-wrap'); if (remWrap) remWrap.style.display = 'none';
  document.getElementById('f-noites').value = '';
  document.getElementById('f-total').value = '';
  const alojSelect = document.getElementById('f-aloj');
  if (alojSelect) alojSelect.value = config.accommodationId || '';
  const rgpdWrap = document.getElementById('wiz-rgpd-wrap');
  if (rgpdWrap) rgpdWrap.style.display = '';
  const searchEl = document.getElementById('wiz-guest-search');
  if (searchEl) searchEl.value = '';
  renderExtraGuests();
  if (config.checkIn && config.checkOut) {
    _availTimer && clearTimeout(_availTimer);
    _availTimer = setTimeout(fetchSuiteAvailability, 0);
  } else {
    _unavailableSuites = new Set();
  }
  renderSuiteCards();
  calcTotal();
  updateWizSummary();
  updateWizUI();
  AppUI.refreshDropdowns(document.getElementById('modal-bg'));
  AppUI.openModal('modal-bg');
}

function openModalFromCalendar(checkIn, accommodationId = '') {
  if (!checkIn) return;
  openModal({
    checkIn,
    checkOut: addDaysToIsoDate(checkIn, 1),
    accommodationId,
    step: 1
  });
}

async function openEditModal(id) {
  try {
    const data = await apiGet(`/api/reservations/${id}`);
    const r = data.data;
    let guestFull = {};
    try { const gd = await apiGet(`/api/guests/${r.guest_id}`); guestFull = gd.data || {}; } catch {}

    editingId = id;
    document.getElementById('modal-title').textContent = 'Editar Reserva — ' + id;
    document.getElementById('btn-guardar').textContent = 'Atualizar Reserva';
    buildCountrySelects();
    _resetGuestFields();

    const nameParts = (r.guest_name || '').trim().split(' ');
    const nomeFull = [guestFull.first_name || nameParts[0], guestFull.last_name || nameParts.slice(1).join(' ')].filter(Boolean).join(' ');
    document.getElementById('f-nome-completo').value = nomeFull || r.guest_name || '';
    document.getElementById('f-email').value          = r.guest_email || '';
    // Split stored phone into prefix + number
    const rawPhone = r.guest_phone || guestFull.phone || '';
    const matchedCountry = DIAL_COUNTRIES.find(c => rawPhone.startsWith(c.dial));
    if (matchedCountry) {
      document.getElementById('f-tel-prefix').value = matchedCountry.dial;
      document.getElementById('f-tel-num').value = rawPhone.slice(matchedCountry.dial.length).trim();
    } else {
      document.getElementById('f-tel-num').value = rawPhone;
    }
    const countryName = guestFull.country || guestFull.nationality || '';
    document.getElementById('f-pais').value           = countryName;
    document.getElementById('f-doc-tipo').value          = guestFull.document_type || '';
    document.getElementById('f-doc-num').value           = guestFull.document_number || '';
    document.getElementById('f-doc-emissor').value       = guestFull.document_issuer_country || '';
    document.getElementById('f-nascimento').value        = formatDateForBirthInput(guestFull.birth_date || '');
    document.getElementById('f-local-nascimento').value  = guestFull.birth_city || '';
    updateForeignRequirements();
    document.getElementById('f-nif').value            = guestFull.nif || '';
    document.getElementById('f-morada').value         = guestFull.address || '';
    document.getElementById('f-cp').value             = guestFull.postal_code || '';
    document.getElementById('f-cidade').value         = guestFull.city || '';

    document.getElementById('f-checkin').value       = formatDateForStandardInput(r.check_in || '');
    document.getElementById('f-checkout').value      = formatDateForStandardInput(r.check_out || '');
    document.getElementById('f-num-hospedes').value  = r.num_guests || 2;
    document.getElementById('f-breakfast').value     = r.breakfast_included ? 'true' : 'false';
    document.getElementById('f-canal').value         = r.channel || 'direto';
    document.getElementById('f-estado').value        = r.status || 'confirmada';
    const ps = r.payment_status === 'pago' ? 'confirmado' : (r.payment_status || 'pendente');
    document.getElementById('f-payment-status').value = ps;
    document.getElementById('pagamento-metodo-wrap').style.display = (ps === 'confirmado' || ps === 'parcial') ? '' : 'none';
    document.getElementById('f-pagamento').value     = r.payment_method || 'transferencia';
    const amtPaidEl2 = document.getElementById('f-amount-paid');
    if (amtPaidEl2) amtPaidEl2.value = r.amount_paid > 0 ? Number(r.amount_paid).toFixed(2) : '';
    const payDateEl2 = document.getElementById('f-payment-date');
    if (payDateEl2) payDateEl2.value = formatDateForStandardInput(r.payment_date || '');
    const remWrap2 = document.getElementById('payment-remaining-wrap');
    const remVal2  = document.getElementById('payment-remaining-val');
    if (ps === 'parcial' && r.amount_paid > 0 && r.total_amount > r.amount_paid) {
      if (remWrap2) remWrap2.style.display = '';
      if (remVal2) remVal2.textContent = '€' + (r.total_amount - r.amount_paid).toFixed(2);
    } else {
      if (remWrap2) remWrap2.style.display = 'none';
    }
    document.getElementById('f-notas').value         = r.notes || '';
    document.getElementById('f-noites').value        = r.nights || '';
    document.getElementById('f-total').value         = Number(r.total_amount || 0).toFixed(2);

    const rgpd = document.getElementById('f-rgpd-check');
    if (rgpd) { rgpd.checked = true; rgpd.closest('.rgpd-box')?.classList.add('rgpd-accepted'); }

    const alojSelect = document.getElementById('f-aloj');
    if (alojSelect) alojSelect.value = r.accommodation_id;

    renderExtraGuests();
    const guestsData = typeof r.guests_data === 'string' ? JSON.parse(r.guests_data || '[]') : (r.guests_data || []);
    guestsData.forEach((g, idx) => {
      const rows = document.querySelectorAll('.extra-guest-row');
      if (!rows[idx]) return;
      const row = rows[idx];
      const setVal = (field, val) => { const el = row.querySelector(`[data-field="${field}"]`); if (el) el.value = val || ''; };
      setVal('nome_completo', [g.first_name, g.last_name].filter(Boolean).join(' ') || g.name || '');
      setVal('email',      g.email);
      const rawP = g.phone || '';
      const mc = DIAL_COUNTRIES.find(c => rawP.startsWith(c.dial));
      setVal('tel_prefix', mc ? mc.dial : '+351');
      setVal('tel_num', mc ? rawP.slice(mc.dial.length).trim() : rawP);
      setVal('country',        g.country || g.nationality);
      setVal('birth_date',     formatDateForBirthInput(g.birth_date));
      setVal('birth_city',     g.birth_city);
      setVal('doc_type',       g.document_type);
      setVal('doc_number',     g.document_number);
      setVal('doc_emissor',    g.document_issuer_country);
      setVal('nif',            g.nif);
    });

    wizStep = 1;
    const rgpdWrap = document.getElementById('wiz-rgpd-wrap');
    if (rgpdWrap) rgpdWrap.style.display = 'none';
    const searchEl = document.getElementById('wiz-guest-search');
    if (searchEl) searchEl.value = '';
    renderSuiteCards();
    updateWizSummary();
    updateWizUI();
    AppUI.refreshDropdowns(document.getElementById('modal-bg'));
    AppUI.openModal('modal-bg');
  } catch (e) {
    toast('❌ Erro ao carregar reserva.', 'error');
  }
}

function closeModal() {
  const bg = document.getElementById('modal-bg');
  const modal = bg.querySelector('.modal');
  modal.classList.add('modal-closing');
  setTimeout(() => { AppUI.closeModal(bg); modal.classList.remove('modal-closing'); editingId = null; }, 320);
  _backofficeVoucher = null;
  const vCode = document.getElementById('f-voucher-code');
  const vStatus = document.getElementById('f-voucher-status');
  if (vCode) vCode.value = '';
  if (vStatus) { vStatus.style.display = 'none'; vStatus.style.background = ''; vStatus.style.color = ''; vStatus.textContent = ''; }
}

function calcTotal() {
  const ci = normalizeIsoDateValue(document.getElementById('f-checkin').value);
  const co = normalizeIsoDateValue(document.getElementById('f-checkout').value);
  const numHospedes = parseInt(document.getElementById('f-num-hospedes').value) || 1;
  const breakfast = document.getElementById('f-breakfast')?.value === 'true';
  const alojId = document.getElementById('f-aloj').value;
  const suite = accommodations.find(a => a.id === alojId);

  // Update nights badge from dates alone (no suite needed)
  const badge = document.getElementById('wiz-nights-badge-wrap');
  const valEl = document.getElementById('wiz-nights-val');
  if (ci && co) {
    const noitesOnly = window.ReservationDates?.countNights(ci, co) || 0;
    if (badge) badge.style.display = noitesOnly > 0 ? '' : 'none';
    if (valEl) valEl.textContent = noitesOnly;
    // Trigger availability check (debounced)
    clearTimeout(_availTimer);
    _availTimer = setTimeout(fetchSuiteAvailability, 300);
  } else {
    if (badge) badge.style.display = 'none';
    _unavailableSuites = new Set();
    renderSuiteCards();
  }

  if (ci && co && suite) {
    const totals = window.ReservationPricing.calculateReservationTotal(suite, servicosData, {
      check_in: ci,
      check_out: co,
      num_guests: numHospedes,
      breakfast_included: breakfast,
      birth_dates: getGuestBirthDatesFromUi(),
    });
    document.getElementById('f-noites').value = totals.nights;
    document.getElementById('f-total').value = totals.totalAmount.toFixed(2);
  } else {
    if (!suite) document.getElementById('f-total').value = '';
    if (!ci || !co) document.getElementById('f-noites').value = '';
  }
  updateWizSummary();
  updateSpecialRateHints();
}

function getExtraOccupancyCharge(suite, numGuests, nights, birthDates = [], checkIn = null) {
  return window.ReservationPricing?.getExtraOccupancyCharge(suite, numGuests, nights, birthDates, checkIn) || 0;
}

function normalizeExtraOccupancyOptionsForPrice(suite) {
  return window.ReservationPricing?.normalizeExtraOccupancyOptions(suite) || [];
}

function getGuestBirthDatesFromUi() {
  return [
    getBirthDateValue(document.getElementById('f-nascimento')),
    ...Array.from(document.querySelectorAll('.extra-guest-row [data-field="birth_date"]')).map(el => getBirthDateValue(el))
  ].filter(Boolean);
}

function formatDateForBirthInput(value) {
  return window.ReservationDates?.formatPtDate(value) || value || '';
}

function normalizeBirthDateValue(value) {
  return window.ReservationDates?.normalizeIsoDate(value, {
    minYear: 1900,
    maxYear: new Date().getFullYear()
  }) || '';
}

function isValidDateParts(year, month, day) {
  return window.ReservationDates?.isValidDateParts(year, month, day, {
    minYear: 1900,
    maxYear: new Date().getFullYear()
  }) || false;
}

function getBirthDateValue(input) {
  return normalizeBirthDateValue(input?.value || '');
}

function handleBirthDateInput(input) {
  const digits = String(input.value || '').replace(/\D/g, '');
  if (digits.length === 8) normalizeBirthDateInput(input);
}

function normalizeBirthDateInput(input) {
  if (!input) return;
  const iso = normalizeBirthDateValue(input.value);
  if (iso) input.value = formatDateForBirthInput(iso);
  calcTotal();
  updateSpecialRateHints();
}

function normalizeIsoDateValue(value) {
  return window.ReservationDates?.normalizeIsoDate(value) || '';
}

function formatDateForStandardInput(value) {
  return window.ReservationDates?.formatPtDate(value) || value || '';
}

function getAgeSpecialRates(suite, birthDates = [], checkIn = null) {
  return window.ReservationPricing?.getAgeSpecialRates(suite, birthDates, checkIn) || [];
}

function getAgeSpecialRateInfo(suite, birthDate, checkIn = null) {
  if (!suite || !birthDate || !checkIn) return null;
  const age = getAgeAtDate(birthDate, checkIn);
  if (age === null) return null;
  const babyLimit = Number(suite.baby_age_limit ?? 2);
  const childLimit = Number(suite.child_age_limit ?? 12);
  if (age < babyLimit) {
    return { type: 'bebé', label: 'Preço de bebé aplicado', price: Number(suite.baby_price ?? 0), age };
  }
  if (age >= babyLimit && age < childLimit) {
    return { type: 'criança', label: 'Preço de criança aplicado', price: Number(suite.child_price ?? 0), age };
  }
  return null;
}

function updateSpecialRateHints() {
  const suite = accommodations.find(a => a.id === document.getElementById('f-aloj')?.value);
  const checkIn = document.getElementById('f-checkin')?.value || new Date().toISOString().slice(0, 10);
  const included = Math.max(1, Math.min(
    Number(suite?.base_guests_included) || Math.min(Number(suite?.max_guests) || 2, 2),
    Number(suite?.max_guests) || 20
  ));
  const setHint = (el, birthDate, guestIndex = 0) => {
    if (!el) return;
    const info = getAgeSpecialRateInfo(suite, birthDate, checkIn);
    el.style.display = info ? '' : 'none';
    if (!info) {
      el.textContent = '';
      return;
    }
    const applied = guestIndex >= included;
    el.textContent = `${info.label}${applied ? '' : ' se for hóspede adicional'} · €${info.price.toFixed(2)}/noite`;
  };

  setHint(
    document.getElementById('f-nascimento-rate-hint'),
    getBirthDateValue(document.getElementById('f-nascimento')),
    0
  );
  document.querySelectorAll('.extra-guest-row').forEach((row, idx) => {
    setHint(
      row.querySelector('.guest-rate-hint'),
      getBirthDateValue(row.querySelector('[data-field="birth_date"]')),
      idx + 1
    );
  });
}

function getAgeAtDate(birthDate, refDate) {
  return window.ReservationDates?.ageAtDate(birthDate, refDate) ?? null;
}

function renderExtraGuests() {
  const n = parseInt(document.getElementById('f-num-hospedes').value) || 1;
  const wrap = document.getElementById('extra-guests-wrap');
  const container = document.getElementById('extra-guests-container');
  if (!wrap || !container) return;
  if (n <= 1) { wrap.style.display = 'none'; container.innerHTML = ''; return; }
  wrap.style.display = '';

  const existing = Array.from(container.querySelectorAll('.extra-guest-row')).map(row => ({
    nome_completo:   row.querySelector('[data-field="nome_completo"]')?.value   || '',
    email:           row.querySelector('[data-field="email"]')?.value           || '',
    tel_prefix:      row.querySelector('[data-field="tel_prefix"]')?.value      || '+351',
    tel_num:         row.querySelector('[data-field="tel_num"]')?.value         || '',
    country:         row.querySelector('[data-field="country"]')?.value         || '',
    birth_date:      formatDateForBirthInput(row.querySelector('[data-field="birth_date"]')?.value || ''),
    birth_city:      row.querySelector('[data-field="birth_city"]')?.value      || '',
    doc_type:        row.querySelector('[data-field="doc_type"]')?.value        || '',
    doc_number:      row.querySelector('[data-field="doc_number"]')?.value      || '',
    doc_emissor:     row.querySelector('[data-field="doc_emissor"]')?.value     || '',
    nif:             row.querySelector('[data-field="nif"]')?.value             || '',
  }));

  const prefixOpts = DIAL_COUNTRIES.map(c =>
    `<option value="${c.dial}">${c.flag} ${c.dial}</option>`
  ).join('');
  const countryOpts = '<option value="">— País —</option>' +
    DIAL_COUNTRIES.map(c => `<option value="${c.name}">${c.flag} ${c.name}</option>`).join('');

  const parts = [];
  for (let i = 2; i <= n; i++) {
    const idx = i - 2;
    const p = existing[idx] || {};
    parts.push(`
      <div class="extra-guest-row" data-extra-idx="${idx}" style="background:var(--cinza-claro);border-radius:10px;padding:14px;margin-bottom:12px;">
        <div style="font-size:12px;font-weight:700;color:var(--cinza);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;">Hóspede ${i}</div>
        <div class="form-group form-full" style="margin-bottom:12px;">
          <label class="form-label">Pesquisa rápida (hóspede existente)</label>
          <div class="guest-search-wrap">
            <input class="form-control extra-guest-search-input" placeholder="Nome, email ou telefone…" autocomplete="off"
              oninput="extraGuestSearch(this.value,${idx})">
            <div class="guest-drop" id="extra-guest-drop-${idx}"></div>
          </div>
        </div>
        <div class="form-grid" style="margin:0;gap:12px;">
          <div class="form-group form-full" style="margin-bottom:0;">
            <label class="form-label">Nome Completo <span class="req-star">*</span></label>
            <input class="form-control" data-field="nome_completo" placeholder="Nome completo" value="${p.nome_completo || ''}">
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">Email <span class="req-star">*</span></label>
            <input class="form-control" data-field="email" type="email" placeholder="email@exemplo.com" value="${p.email || ''}">
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">Telefone <span class="req-star">*</span></label>
            <div class="phone-group">
              <select class="form-control phone-prefix" data-field="tel_prefix">${prefixOpts}</select>
              <input class="form-control phone-number" data-field="tel_num" type="tel" placeholder="912 345 678" value="${p.tel_num || ''}">
            </div>
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">País <span class="req-star">*</span></label>
            <select class="form-control guest-country" data-field="country"
              onchange="updateExtraForeignReqs(this.closest('.extra-guest-row'))">${countryOpts}</select>
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">Data de Nascimento <span class="req-star">*</span></label>
            <div class="birth-date-control">
              <input class="form-control birth-date-input" data-field="birth_date" type="text" inputmode="numeric" maxlength="10" placeholder="dd-mm-aaaa" data-date-format="pt" value="${formatDateForBirthInput(p.birth_date || '')}" oninput="handleBirthDateInput(this)" onblur="normalizeBirthDateInput(this);calcTotal();updateSpecialRateHints()">
              <button class="birth-date-picker-btn" type="button" onclick="AppDatePicker.open(this.closest('.birth-date-control').querySelector('.birth-date-input'),{isBirthDate:true})" aria-label="Abrir calendário">
                <i data-lucide="calendar-days"></i>
              </button>
            </div>
            <div class="guest-rate-hint"></div>
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">Local de Nascimento <span class="req-foreign-extra" style="display:none;color:var(--vermelho)">*</span></label>
            <input class="form-control" data-field="birth_city" placeholder="Cidade de nascimento" value="${p.birth_city || ''}">
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">Tipo de Documento <span class="req-foreign-extra" style="display:none;color:var(--vermelho)">*</span></label>
            <select class="form-control" data-field="doc_type">
              <option value="">— Selecionar —</option>
              <option value="cc">Cartão de Cidadão</option>
              <option value="bi">Bilhete de Identidade</option>
              <option value="passaporte">Passaporte</option>
              <option value="nie">NIE</option>
              <option value="outro">Outro</option>
            </select>
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">Nº de Documento <span class="req-foreign-extra" style="display:none;color:var(--vermelho)">*</span></label>
            <input class="form-control" data-field="doc_number" placeholder="XX000000" value="${p.doc_number || ''}">
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">País Emissor do Documento <span class="req-foreign-extra" style="display:none;color:var(--vermelho)">*</span></label>
            <select class="form-control" data-field="doc_emissor">${countryOpts}</select>
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">NIF</label>
            <input class="form-control" data-field="nif" placeholder="000 000 000" value="${p.nif || ''}">
          </div>
        </div>
      </div>`);
  }
  container.innerHTML = parts.join('');

  // Attach date pickers to newly inserted birth date inputs
  if (window.AppDatePicker) {
    container.querySelectorAll('.birth-date-input').forEach(input =>
      AppDatePicker.attach(input, { isBirthDate: true })
    );
  }

  // Restore select values + update foreign requirements after DOM insertion
  container.querySelectorAll('.extra-guest-row').forEach((row, idx) => {
    const p = existing[idx] || {};
    const prefixSel = row.querySelector('[data-field="tel_prefix"]');
    if (prefixSel && p.tel_prefix) prefixSel.value = p.tel_prefix;
    const countrySel = row.querySelector('[data-field="country"]');
    if (countrySel && p.country) countrySel.value = p.country;
    const docSel = row.querySelector('[data-field="doc_type"]');
    if (docSel && p.doc_type) docSel.value = p.doc_type;
    const emissorSel = row.querySelector('[data-field="doc_emissor"]');
    if (emissorSel && p.doc_emissor) emissorSel.value = p.doc_emissor;
    updateExtraForeignReqs(row);
  });

  enhanceReservationSelects(container);
  AppUI.refreshDropdowns(container);
  if (window.lucide) lucide.createIcons();
  updateSpecialRateHints();
}

function updateExtraForeignReqs(row) {
  const isForeign = (row.querySelector('[data-field="country"]')?.value || '') !== 'Portugal'
    && row.querySelector('[data-field="country"]')?.value !== '';
  row.querySelectorAll('.req-foreign-extra').forEach(el => {
    el.style.display = isForeign ? '' : 'none';
  });
}

// ── EXTRA GUEST SEARCH ──
const _extraSearchTimers = {};
const _extraSearchResultsMap = {};

async function extraGuestSearch(q, idx) {
  const drop = document.getElementById(`extra-guest-drop-${idx}`);
  if (!drop) return;
  if (!q || q.length < 2) {
    _extraSearchResultsMap[idx] = [];
    drop.innerHTML = '';
    drop.classList.remove('open');
    return;
  }
  clearTimeout(_extraSearchTimers[idx]);
  _extraSearchTimers[idx] = setTimeout(async () => {
    try {
      const data = await apiGet(`/api/guests?search=${encodeURIComponent(q)}`);
      _extraSearchResultsMap[idx] = (data.data || []).slice(0, 8);
      if (!_extraSearchResultsMap[idx].length) {
        drop.innerHTML = '<div style="padding:10px 14px;font-size:12px;color:var(--cinza);">Sem resultados</div>';
        drop.classList.add('open');
        return;
      }
      drop.innerHTML = _extraSearchResultsMap[idx].map((g, gIdx) => {
        const name = [g.first_name, g.last_name].filter(Boolean).join(' ') || g.name || '—';
        const meta = [g.email, g.phone].filter(Boolean).join(' · ');
        return `<div class="guest-drop-item" onclick="extraGuestSelect(${idx},${gIdx})">
          <div class="gdi-name">${name.replace(/</g,'&lt;')}</div>
          <div class="gdi-meta">${meta.replace(/</g,'&lt;')}</div>
        </div>`;
      }).join('');
      drop.classList.add('open');
    } catch (e) { drop.classList.remove('open'); }
  }, 280);
}

function extraGuestSelect(idx, gIdx) {
  const g = (_extraSearchResultsMap[idx] || [])[gIdx];
  if (!g) return;
  const row = document.querySelector(`.extra-guest-row[data-extra-idx="${idx}"]`);
  if (!row) return;
  const setVal = (field, val) => { const el = row.querySelector(`[data-field="${field}"]`); if (el) el.value = val || ''; };
  setVal('nome_completo', [g.first_name, g.last_name].filter(Boolean).join(' ') || g.name || '');
  setVal('email',       g.email);
  const rawPhone = g.phone || '';
  const mc = DIAL_COUNTRIES.find(c => rawPhone.startsWith(c.dial));
  setVal('tel_prefix',  mc ? mc.dial : '+351');
  setVal('tel_num',     mc ? rawPhone.slice(mc.dial.length).trim() : rawPhone);
  setVal('country',     g.country || g.nationality);
  setVal('birth_date',  formatDateForBirthInput(g.birth_date));
  setVal('birth_city',  g.birth_city);
  setVal('doc_type',    g.document_type);
  setVal('doc_number',  g.document_number);
  setVal('doc_emissor', g.document_issuer_country);
  setVal('nif',         g.nif);
  updateExtraForeignReqs(row);
  AppUI.refreshDropdowns(row);
  calcTotal();
  const drop = document.getElementById(`extra-guest-drop-${idx}`);
  if (drop) { drop.innerHTML = ''; drop.classList.remove('open'); }
  const si = row.querySelector('.extra-guest-search-input');
  if (si) si.value = '';
  toast('✅ Dados preenchidos.', 'success');
}

// ── WIZARD FUNCTIONS ──

let _unavailableSuites = new Set();
let _availTimer = null;

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
}

function updateWizUI() {
  const total = 3;
  for (let i = 1; i <= total; i++) {
    const item = document.getElementById('ws-' + i);
    if (item) {
      item.classList.remove('wiz-active', 'wiz-done');
      if (i === wizStep) item.classList.add('wiz-active');
      else if (i < wizStep) item.classList.add('wiz-done');
    }
    const panel = document.getElementById('wiz-panel-' + i);
    if (panel) panel.classList.toggle('active', i === wizStep);
  }
  const counter = document.getElementById('wiz-step-counter');
  if (counter) counter.textContent = `Passo ${wizStep} de ${total}`;
  const numEl = document.getElementById('wiz-step-num');
  if (numEl) numEl.textContent = wizStep;

  const prev = document.getElementById('btn-wiz-prev');
  const next = document.getElementById('btn-wiz-next');
  const save = document.getElementById('btn-guardar');
  if (prev) prev.style.display = wizStep > 1 ? '' : 'none';
  if (next) next.style.display = wizStep < total ? '' : 'none';
  if (save) {
    save.style.display = wizStep === total ? '' : 'none';
    save.innerHTML = (editingId
      ? `<i data-lucide="save" style="width:14px;height:14px;"></i> Atualizar Reserva`
      : `<i data-lucide="save" style="width:14px;height:14px;"></i> Guardar Reserva`);
  }
  if (wizStep === 1) { renderSuiteCards(); calcTotal(); }
  if (wizStep === 3) buildWizConfirm();
  if (window.lucide) lucide.createIcons();
}

function validateWizStep(step) {
  if (step === 1) {
    const ci = normalizeIsoDateValue(document.getElementById('f-checkin').value);
    const co = normalizeIsoDateValue(document.getElementById('f-checkout').value);
    if (!ci) { toast('⚠️ Seleciona a data de check-in.', 'error'); return false; }
    if (!co) { toast('⚠️ Seleciona a data de check-out.', 'error'); return false; }
    if (new Date(co) <= new Date(ci)) { toast('⚠️ O check-out deve ser depois do check-in.', 'error'); return false; }
    const alojVal = document.getElementById('f-aloj').value;
    if (!alojVal) { toast('⚠️ Seleciona um alojamento.', 'error'); return false; }
    if (_unavailableSuites.has(alojVal)) { toast('⚠️ Este alojamento está ocupado nas datas selecionadas.', 'error'); return false; }
    const suite = accommodations.find(a => a.id === alojVal);
    const requestedGuests = parseInt(document.getElementById('f-num-hospedes')?.value, 10) || 1;
    const maxGuests = Number(suite?.max_guests) || 0;
    if (maxGuests > 0 && requestedGuests > maxGuests) {
      toast(`⚠️ Capacidade máxima: ${maxGuests} hóspede${maxGuests !== 1 ? 's' : ''}.`, 'error');
      return false;
    }
    return true;
  }
  if (step === 2) {
    const nome = (document.getElementById('f-nome-completo')?.value || '').trim();
    if (!nome) { toast('⚠️ O nome do hóspede é obrigatório.', 'error'); return false; }
    return true;
  }
  return true;
}

function wizNext() {
  if (!validateWizStep(wizStep)) return;
  if (wizStep < 3) {
    wizStep++;
    updateWizUI();
    const body = document.querySelector('.modal-wizard .modal-body');
    if (body) body.scrollTop = 0;
  }
}

function wizPrev() {
  if (wizStep > 1) {
    wizStep--;
    updateWizUI();
    const body = document.querySelector('.modal-wizard .modal-body');
    if (body) body.scrollTop = 0;
  }
}

function updateWizSummary() {
  const nome = (document.getElementById('f-nome-completo')?.value || '').trim();
  const apelido = '';
  const alojId = document.getElementById('f-aloj')?.value;
  const suite = accommodations.find(a => a.id === alojId);
  const ci = normalizeIsoDateValue(document.getElementById('f-checkin')?.value);
  const co = normalizeIsoDateValue(document.getElementById('f-checkout')?.value);
  const nights = ci && co ? Math.max(0, Math.round((new Date(co) - new Date(ci)) / 86400000)) : 0;
  const total = document.getElementById('f-total')?.value;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('ws-guest', [nome, apelido].filter(Boolean).join(' ') || '—');
  set('ws-suite', suite?.name || '—');
  set('ws-checkin', ci ? formatDate(ci) : '—');
  set('ws-nights', nights > 0 ? nights + ' noite' + (nights !== 1 ? 's' : '') : '—');
  set('ws-total', total && Number(total) > 0 ? '€' + Number(total).toLocaleString('pt-PT', { minimumFractionDigits: 2 }) : '—');
}

function renderSuiteCards() {
  const grid = document.getElementById('suite-cards-grid');
  if (!grid) return;
  const alojEl = document.getElementById('f-aloj');
  let currentAlojId = alojEl?.value;
  const ci = normalizeIsoDateValue(document.getElementById('f-checkin')?.value);
  const co = normalizeIsoDateValue(document.getElementById('f-checkout')?.value);
  const requestedGuests = parseInt(document.getElementById('f-num-hospedes')?.value, 10) || 1;
  const datesSet = !!(ci && co && new Date(co) > new Date(ci));
  if (!accommodations.length) {
    grid.innerHTML = '<p style="font-size:13px;color:var(--cinza);">Nenhum alojamento disponível.</p>';
    return;
  }
  const currentSuite = accommodations.find(a => a.id === currentAlojId);
  const currentMaxGuests = Number(currentSuite?.max_guests) || 0;
  if (currentMaxGuests > 0 && requestedGuests > currentMaxGuests) {
    if (alojEl) alojEl.value = '';
    currentAlojId = '';
    updateWizSummary();
  }
  grid.innerHTML = accommodations.map(a => {
    const cor = a.color || 'var(--marca)';
    const maxGuests = Number(a.max_guests) || 0;
    const unavail = datesSet && _unavailableSuites.has(a.id);
    const overCapacity = maxGuests > 0 && requestedGuests > maxGuests;
    const blocked = unavail || overCapacity;
    const sel = !blocked && currentAlojId === a.id ? 'selected' : '';
    const cls = `suite-card-opt${sel ? ' selected' : ''}${blocked ? ' unavailable' : ''}${overCapacity ? ' capacity-blocked' : ''}`;
    const click = blocked ? '' : `onclick="selectSuiteCard('${a.id}')"`;
    const title = overCapacity
      ? `Capacidade máxima: ${maxGuests} hóspede${maxGuests !== 1 ? 's' : ''}`
      : (unavail ? 'Indisponível nas datas selecionadas' : a.name);
    const coverUrl = a.cover_image ? (a.cover_image.startsWith('http') ? a.cover_image : API_BASE + a.cover_image) : '';
    return `<div class="${cls}" ${click} title="${title}">
      <div class="suite-check"><i data-lucide="check" style="width:10px;height:10px;color:#fff;"></i></div>
      ${coverUrl
        ? `<img src="${coverUrl}" class="suite-card-cover" alt="${a.name}">`
        : blocked
          ? `<div style="font-size:16px;margin-bottom:6px;">🔒</div>`
          : `<div style="width:10px;height:10px;border-radius:50%;background:${cor};margin-bottom:8px;"></div>`}
      ${blocked ? `<div class="suite-card-lock">🔒</div>` : ''}
      <div class="suite-card-name">${a.name}</div>
      ${blocked
        ? `${unavail ? `<div class="suite-card-unavail-lbl">Indisponível</div>` : ''}
           ${overCapacity ? `<div class="suite-card-capacity-lbl">Capacidade máxima: ${maxGuests} hóspede${maxGuests !== 1 ? 's' : ''}</div>` : ''}`
        : `<div class="suite-card-price">€${a.price_per_night}<span class="suite-card-sub"> / noite</span></div>`}
    </div>`;
  }).join('');
  if (window.lucide) lucide.createIcons();
}

function selectSuiteCard(id) {
  if (_unavailableSuites.has(id)) return;
  const suite = accommodations.find(a => a.id === id);
  const requestedGuests = parseInt(document.getElementById('f-num-hospedes')?.value, 10) || 1;
  const maxGuests = Number(suite?.max_guests) || 0;
  if (maxGuests > 0 && requestedGuests > maxGuests) return;
  const sel = document.getElementById('f-aloj');
  if (sel) sel.value = id;
  renderSuiteCards();
  calcTotal();
}

function buildWizConfirm() {
  calcTotal();
  const nome = (document.getElementById('f-nome-completo')?.value || '').trim();
  const apelido = '';
  const email = document.getElementById('f-email')?.value || '';
  const prefix = document.getElementById('f-tel-prefix')?.value || '';
  const telNum = document.getElementById('f-tel-num')?.value || '';
  const pais = document.getElementById('f-pais')?.value || '';
  const alojId = document.getElementById('f-aloj')?.value;
  const suite = accommodations.find(a => a.id === alojId);
  const cor = suite?.color || 'var(--marca)';
  const ci = normalizeIsoDateValue(document.getElementById('f-checkin')?.value);
  const co = normalizeIsoDateValue(document.getElementById('f-checkout')?.value);
  const nights = ci && co ? Math.max(0, Math.round((new Date(co) - new Date(ci)) / 86400000)) : 0;
  const canal = document.getElementById('f-canal')?.value || '';
  const numH = parseInt(document.getElementById('f-num-hospedes')?.value) || 1;
  const bkf = document.getElementById('f-breakfast')?.value === 'true';
  const total = parseFloat(document.getElementById('f-total')?.value) || 0;
  const extraOccupancyCost = getExtraOccupancyCharge(suite, numH, nights, getGuestBirthDatesFromUi(), ci);
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
        ${suite?.name || '—'}
      </div>
      <div class="wiz-conf-sub">${canal} · ${numH} hóspede${numH !== 1 ? 's' : ''}</div>
      <div class="wiz-conf-sub">${bkf ? '🥐 Pequeno-almoço incl.' : 'Sem pequeno-almoço'}</div>
    </div>
    <div class="wiz-conf-cell">
      <div class="wiz-conf-lbl">Datas</div>
      <div class="wiz-conf-val">${ci ? formatDate(ci) : '—'} → ${co ? formatDate(co) : '—'}</div>
      <div class="wiz-conf-sub">${nights} noite${nights !== 1 ? 's' : ''}</div>
    </div>
    <div class="wiz-conf-cell accent">
      <div class="wiz-conf-lbl">Total</div>
      <div class="wiz-conf-val">€${total.toLocaleString('pt-PT', { minimumFractionDigits: 2 })}</div>
      <div class="wiz-conf-sub">€${suite?.price_per_night || 0}/noite × ${nights} noites${extraOccupancyCost ? ` · extra €${extraOccupancyCost.toFixed(2)}` : ''}</div>
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
      const data = await apiGet(`/api/guests?search=${encodeURIComponent(q)}`);
      _guestSearchResults = (data.data || []).slice(0, 8);
      if (!_guestSearchResults.length) {
        drop.innerHTML = '<div style="padding:10px 14px;font-size:12px;color:var(--cinza);">Sem resultados</div>';
        drop.classList.add('open');
        return;
      }
      drop.innerHTML = _guestSearchResults.map((g, idx) => {
        const name = [g.first_name, g.last_name].filter(Boolean).join(' ') || g.name || '—';
        const meta = [g.email, g.phone].filter(Boolean).join(' · ');
        return `<div class="guest-drop-item" onclick="wizSelectGuest(${idx})">
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
  const mc = DIAL_COUNTRIES.find(c => rawPhone.startsWith(c.dial));
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
  document.getElementById('f-nascimento').value = formatDateForBirthInput(g.birth_date || '');
  document.getElementById('f-local-nascimento').value = g.birth_city || '';
  document.getElementById('f-nif').value = g.nif || '';
  document.getElementById('f-morada').value = g.address || '';
  document.getElementById('f-cp').value = g.postal_code || '';
  document.getElementById('f-cidade').value = g.city || '';
  updateForeignRequirements();
  calcTotal();
  updateWizSummary();
  const drop = document.getElementById('wiz-guest-drop');
  if (drop) { drop.innerHTML = ''; drop.classList.remove('open'); }
  const si = document.getElementById('wiz-guest-search');
  if (si) si.value = '';
  toast('✅ Dados do hóspede preenchidos.', 'success');
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

function collectExtraGuests() {
  return Array.from(document.querySelectorAll('.extra-guest-row')).map(row => {
    const nomeCompleto = (row.querySelector('[data-field="nome_completo"]')?.value || '').trim();
    const parts        = nomeCompleto.split(' ');
    const tel_prefix   = row.querySelector('[data-field="tel_prefix"]')?.value  || '';
    const tel_num      = row.querySelector('[data-field="tel_num"]')?.value     || '';
    return {
      name:                     nomeCompleto,
      first_name:               parts[0] || '',
      last_name:                parts.slice(1).join(' '),
      email:                    row.querySelector('[data-field="email"]')?.value          || '',
      phone:                    tel_prefix + tel_num.replace(/\s/g, ''),
      nationality:              row.querySelector('[data-field="country"]')?.value        || '',
      country:                  row.querySelector('[data-field="country"]')?.value        || '',
      birth_date:               getBirthDateValue(row.querySelector('[data-field="birth_date"]')) || '',
      birth_city:               row.querySelector('[data-field="birth_city"]')?.value    || '',
      document_type:            row.querySelector('[data-field="doc_type"]')?.value      || '',
      document_number:          row.querySelector('[data-field="doc_number"]')?.value    || '',
      document_issuer_country:  row.querySelector('[data-field="doc_emissor"]')?.value   || '',
      nif:                      row.querySelector('[data-field="nif"]')?.value           || '',
    };
  }).filter(g => g.name || g.email);
}

let _backofficeVoucher = null;

async function verifyBackofficeVoucher() {
  const code = (document.getElementById('f-voucher-code')?.value || '').trim().toUpperCase();
  const statusEl = document.getElementById('f-voucher-status');
  if (!statusEl) return;

  statusEl.style.display = 'block';

  if (!code) {
    _backofficeVoucher = null;
    statusEl.style.background = '#f5f5f5';
    statusEl.style.color = '#888';
    statusEl.textContent = 'Introduza um código de voucher.';
    return;
  }

  statusEl.style.background = '#f5f5f5';
  statusEl.style.color = '#666';
  statusEl.textContent = 'A verificar...';
  try {
    const res = await apiGet(`/api/vouchers/validate?code=${encodeURIComponent(code)}`);
    _backofficeVoucher = res.data;
    const disc = _backofficeVoucher.type === 'discount_pct'
      ? `${_backofficeVoucher.value}% de desconto`
      : `€${Number(_backofficeVoucher.value).toFixed(2)} de desconto`;
    statusEl.style.background = '#f0faf4';
    statusEl.style.color = '#2d6a4f';
    statusEl.textContent = `✓ ${_backofficeVoucher.description ? _backofficeVoucher.description + ' · ' : ''}${disc}`;
  } catch (err) {
    _backofficeVoucher = null;
    statusEl.style.background = '#fef0f0';
    statusEl.style.color = '#c0392b';
    statusEl.textContent = err?.payload?.error || 'Voucher inválido ou já utilizado';
  }
}

async function saveReserva() {
  const nomeCompleto = document.getElementById('f-nome-completo').value.trim();
  const nomeParts    = nomeCompleto.split(' ');
  const primeiroNome = nomeParts[0] || '';
  const apelido      = nomeParts.slice(1).join(' ');
  const email        = document.getElementById('f-email').value.trim();
  const telPrefix    = document.getElementById('f-tel-prefix')?.value || '';
  const telNum       = document.getElementById('f-tel-num')?.value.trim() || '';
  const tel          = telPrefix + telNum.replace(/\s/g, '');
  const pais         = document.getElementById('f-pais').value.trim();
  const checkin  = normalizeIsoDateValue(document.getElementById('f-checkin').value);
  const checkout = normalizeIsoDateValue(document.getElementById('f-checkout').value);
  const alojId   = document.getElementById('f-aloj').value;
  const rgpdCheck = document.getElementById('f-rgpd-check');

  const birthDate = getBirthDateValue(document.getElementById('f-nascimento'));
  if (!nomeCompleto) { toast('⚠️ O nome do hóspede é obrigatório.', 'error'); return; }
  if (!checkin || !checkout) { toast('Por favor selecione as datas.', 'error'); return; }
  if (checkin >= checkout) { toast('O check-out deve ser depois do check-in.', 'error'); return; }
  const selectedAccommodation = accommodations.find(a => a.id === alojId);
  const requestedGuests = parseInt(document.getElementById('f-num-hospedes').value) || 1;
  if (selectedAccommodation?.max_guests && requestedGuests > selectedAccommodation.max_guests) {
    toast(`Este alojamento permite no máximo ${selectedAccommodation.max_guests} hóspede${selectedAccommodation.max_guests !== 1 ? 's' : ''}.`, 'error');
    return;
  }

  const nomeFull = nomeCompleto;
  const btn = document.getElementById('btn-guardar');
  AppUI.setButtonLoading(btn, true, 'A guardar...');

  try {
    if (editingId) {
      const body = {
        check_in: checkin,
        check_out: checkout,
        num_guests: parseInt(document.getElementById('f-num-hospedes').value) || 1,
        breakfast_included: document.getElementById('f-breakfast')?.value === 'true',
        channel: document.getElementById('f-canal').value,
        status: document.getElementById('f-estado').value,
        payment_status: document.getElementById('f-payment-status').value,
        payment_method: document.getElementById('f-pagamento').value,
        amount_paid: parseFloat(document.getElementById('f-amount-paid')?.value) || 0,
        payment_date: normalizeIsoDateValue(document.getElementById('f-payment-date')?.value) || null,
        notes: document.getElementById('f-notas').value,
        guests_data: collectExtraGuests(),
        guest: {
          name: nomeFull, first_name: primeiroNome, last_name: apelido,
          email, phone: tel, nationality: pais, country: pais,
          document_type:            document.getElementById('f-doc-tipo')?.value          || null,
          document_number:          document.getElementById('f-doc-num')?.value           || null,
          document_issuer_country:  document.getElementById('f-doc-emissor')?.value       || null,
          birth_date:               birthDate || null,
          birth_city:               document.getElementById('f-local-nascimento')?.value  || null,
          nif:                      document.getElementById('f-nif')?.value               || null,
          address:                  document.getElementById('f-morada')?.value            || null,
          postal_code:              document.getElementById('f-cp')?.value                || null,
          city:                     document.getElementById('f-cidade')?.value            || null,
        },
      };
      const res = await apiPut(`/api/reservations/${editingId}`, body);
      if (res.success) {
        toast('✅ Reserva atualizada!', 'success');
        closeModal();
        await loadReservas();
        if (typeof renderCalView === 'function') renderCalView();
        renderDashboard();
      } else {
        toast('❌ ' + (res.error || 'Erro ao atualizar reserva.'), 'error');
      }
    } else {
      const body = {
        guest: {
          name: nomeFull, first_name: primeiroNome, last_name: apelido,
          email, phone: tel, nationality: pais, country: pais,
          document_type:            document.getElementById('f-doc-tipo')?.value          || null,
          document_number:          document.getElementById('f-doc-num')?.value           || null,
          document_issuer_country:  document.getElementById('f-doc-emissor')?.value       || null,
          birth_date:               birthDate || null,
          birth_city:               document.getElementById('f-local-nascimento')?.value  || null,
          nif:                      document.getElementById('f-nif')?.value               || null,
          address:                  document.getElementById('f-morada')?.value            || null,
          postal_code:              document.getElementById('f-cp')?.value                || null,
          city:                     document.getElementById('f-cidade')?.value            || null,
        },
        accommodation_id: alojId,
        check_in: checkin,
        check_out: checkout,
        num_guests: parseInt(document.getElementById('f-num-hospedes').value) || 1,
        breakfast_included: document.getElementById('f-breakfast')?.value === 'true',
        channel: document.getElementById('f-canal').value,
        status: document.getElementById('f-estado').value,
        payment_status: document.getElementById('f-payment-status').value,
        payment_method: document.getElementById('f-pagamento').value,
        amount_paid: parseFloat(document.getElementById('f-amount-paid')?.value) || 0,
        payment_date: normalizeIsoDateValue(document.getElementById('f-payment-date')?.value) || null,
        notes: document.getElementById('f-notas').value,
        voucher_code: document.getElementById('f-voucher-code')?.value.trim().toUpperCase() || null,
        rgpd_consent: true,
        guests_data: collectExtraGuests(),
      };
      const res = await apiPost('/api/reservations', body);
      if (res.success) {
        toast('✅ Reserva criada com sucesso!', 'success');
        closeModal();
        await loadReservas();
        if (typeof renderCalView === 'function') renderCalView();
        renderDashboard();
      } else {
        toast('❌ ' + (res.error || 'Erro ao criar reserva.'), 'error');
      }
    }
  } catch (e) {
    toast('❌ Erro de ligação ao servidor.', 'error');
  } finally {
    AppUI.setButtonLoading(btn, false);
  }
}

async function deleteReserva(id) {
  if (!confirm('Tem a certeza que quer eliminar esta reserva?')) return;
  try {
    const res = await apiDelete(`/api/reservations/${id}`);
    if (res.success) {
      toast('🗑 Reserva cancelada.', 'info');
      await loadReservas();
      if (typeof renderCalView === 'function') renderCalView();
      renderDashboard();
    } else {
      toast('❌ ' + (res.error || 'Erro ao cancelar.'), 'error');
    }
  } catch (e) {
    toast('❌ Erro de ligação ao servidor.', 'error');
  }
}

async function showDetail(id) {
  try {
    if (!document.getElementById('view-reservas')?.classList.contains('active')) {
      window.__openingReservationDetail = true;
      showView('reservas');
      window.__openingReservationDetail = false;
    }
    setReservasDetailMode(true);
    const detailContent = document.getElementById('reserva-detail-content');
    const detailLoading = document.querySelector('#reserva-detail-page .reserva-detail-loading');
    if (detailContent) detailContent.innerHTML = '';
    if (detailLoading) detailLoading.style.display = 'flex';
    const data = await apiGet(`/api/reservations/${id}`);
    const r = data.data;
    const guestsData = typeof r.guests_data === 'string' ? JSON.parse(r.guests_data || '[]') : (r.guests_data || []);
    const acc = accommodations.find(a => a.id === r.accommodation_id);
    const paid = Number(r.amount_paid || 0);
    const total = Number(r.total_amount || 0);
    const remaining = total - paid;
    if (detailLoading) detailLoading.style.display = 'none';
    detailContent.innerHTML = `
      <div class="reserva-detail-hero">
        <button class="btn btn-ghost btn-sm" onclick="showReservasList()">
          ${lcIcon('arrow-left', 14)} Voltar
        </button>
        <div class="reserva-detail-title">
          <span>${r.id}</span>
          <h2>${r.guest_name}</h2>
        </div>
        <div class="reserva-detail-actions">
          <button class="btn btn-primary" onclick="openEditModal('${r.id}')">
            ${lcIcon('pencil', 13)} Editar
          </button>
          ${r.guest_email ? `
          <button class="btn btn-ghost" onclick="openInvoiceForReservation('${r.id}','${(r.guest_email||'').replace(/'/g,"\\'")}','${(r.guest_name||'').replace(/'/g,"\\'")}')">
            ${lcIcon('mail', 13)} Enviar email
          </button>` : ''}
          ${r.status === 'cancelada'
            ? `<button class="btn btn-success" onclick="reativarReserva('${r.id}')">
                ${lcIcon('refresh-cw', 13)} Reativar Reserva
               </button>`
            : `<button class="btn btn-danger" onclick="cancelarReserva('${r.id}')">
                ${lcIcon('x-circle', 13)} Cancelar Reserva
               </button>`}
        </div>
      </div>
      <div class="detail-grid">
        <div class="detail-row"><div class="detail-label">Hóspede</div><div class="detail-val"><b>${r.guest_name}</b></div></div>
        <div class="detail-row"><div class="detail-label">Email</div><div class="detail-val">${r.guest_email || '—'}</div></div>
        <div class="detail-row"><div class="detail-label">Telefone</div><div class="detail-val">${r.guest_phone || '—'}</div></div>
        <div class="detail-row"><div class="detail-label">Alojamento</div><div class="detail-val">${accomChip(r)}</div></div>
        <div class="detail-row"><div class="detail-label">Canal</div><div class="detail-val">${r.channel}</div></div>
        <div class="detail-row"><div class="detail-label">Hóspedes</div><div class="detail-val">${r.num_guests}</div></div>
        <div class="detail-row"><div class="detail-label">Check-in</div><div class="detail-val">${formatDate(r.check_in)}</div></div>
        <div class="detail-row"><div class="detail-label">Check-out</div><div class="detail-val">${formatDate(r.check_out)}</div></div>
        <div class="detail-row"><div class="detail-label">Noites</div><div class="detail-val">${r.nights}</div></div>
        <div class="detail-row"><div class="detail-label">Estado</div><div class="detail-val">${badgeEstado(r.status)}</div></div>
        <div class="detail-row"><div class="detail-label">Pagamento</div><div class="detail-val">${badgePagamento(r.payment_status)}</div></div>
        ${r.payment_date ? `<div class="detail-row"><div class="detail-label">Data Pagamento</div><div class="detail-val">${formatDate(r.payment_date)}</div></div>` : ''}
      </div>
      ${(() => {
        if (!guestsData.length) return '';
        return `<div style="margin-top:16px;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--cinza);margin-bottom:8px;">Hóspedes Adicionais</div>
          ${guestsData.map((g, i) => `<div style="background:var(--cinza-claro);border-radius:8px;padding:10px 14px;margin-bottom:6px;font-size:13px;">
            <b>Hóspede ${i + 2}</b> — ${g.name || '—'}
            ${g.email ? `· ${g.email}` : ''}${g.phone ? ` · ${g.phone}` : ''}${g.nationality ? ` · ${g.nationality}` : ''}
          </div>`).join('')}
        </div>`;
      })()}
      <div style="margin-top:20px;display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;">
        ${(() => {
          return [['Alojamento', (acc?.price_per_night || 0) * r.nights, false],
           ['Ocupação extra', getExtraOccupancyCharge(acc, r.num_guests || 1, r.nights || 0, guestsData.map(g => g.birth_date).filter(Boolean), r.check_in), false],
           ['Taxa Turística', r.tourist_tax || 0, false],
           ['Pequeno-almoço', r.breakfast_included ? r.num_guests * r.nights * (servicosData.find(s => s.id === 'breakfast')?.value ?? 19) : 0, false],
           ['Total', r.total_amount || 0, false]];
        })().map(([l, v, _]) => `
          <div style="background:var(--cinza-claro);border-radius:10px;padding:14px;text-align:center;">
            <div style="font-size:11px;color:var(--cinza);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">${l}</div>
            <div style="font-family:'Playfair Display',serif;font-size:22px;color:var(--azul);">€${Number(v).toFixed(2)}</div>
          </div>`).join('')}
        ${(() => {
          if (paid <= 0) return '';
          return `
          <div style="background:rgba(46,125,82,.08);border-radius:10px;padding:14px;text-align:center;border:1px solid rgba(46,125,82,.2);">
            <div style="font-size:11px;color:var(--cinza);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Valor Pago</div>
            <div style="font-family:'Playfair Display',serif;font-size:22px;color:#2e7d52;">€${paid.toFixed(2)}</div>
          </div>
          ${remaining > 0.01 ? `
          <div style="background:rgba(176,48,48,.08);border-radius:10px;padding:14px;text-align:center;border:1px solid rgba(176,48,48,.2);">
            <div style="font-size:11px;color:var(--cinza);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Em Falta</div>
            <div style="font-family:'Playfair Display',serif;font-size:22px;color:var(--vermelho);">€${remaining.toFixed(2)}</div>
          </div>` : ''}`;
        })()}
      </div>
      ${r.notes ? `<div style="margin-top:16px;background:rgba(201,168,76,.1);border-left:3px solid var(--dourado);padding:12px 16px;border-radius:6px;font-size:13.5px;color:var(--texto);">📝 ${r.notes}</div>` : ''}
      <div style="margin-top:12px;font-size:12px;color:${r.google_event_id ? 'var(--verde)' : 'var(--cinza)'};">
        ${lcIcon('calendar', 12)} ${r.google_event_id ? 'Sincronizado com Google Calendar' : 'Não sincronizado com Google Calendar'}
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    toast('❌ Erro ao carregar detalhe.', 'error');
    showReservasList();
  }
}

async function cancelarReserva(id) {
  if (!confirm('Cancelar esta reserva? Será removida do Google Calendar.')) return;
  try {
    const res = await apiDelete(`/api/reservations/${id}`);
    if (res.success) {
      AppUI.closeModal('detail-bg');
      showReservasList();
      toast('❌ Reserva cancelada.', 'info');
      await loadReservas();
      if (typeof renderCalView === 'function') renderCalView();
      renderDashboard();
    } else {
      toast('❌ ' + (res.error || 'Erro ao cancelar.'), 'error');
    }
  } catch (e) {
    toast('❌ Erro de ligação ao servidor.', 'error');
  }
}

async function reativarReserva(id) {
  if (!confirm('Reativar esta reserva? Vai restaurar os estados que existiam antes do cancelamento.')) return;
  try {
    const res = await apiPut(`/api/reservations/${id}`, { status: 'confirmada' });
    if (res.success) {
      const detailBg = document.getElementById('detail-bg');
      if (detailBg?.classList.contains('open')) detailBg.classList.remove('open');
      showReservasList();
      toast('✅ Reserva reativada!', 'success');
      await loadReservas();
      if (typeof renderCalView === 'function') renderCalView();
      renderDashboard();
    } else {
      toast('❌ ' + (res.error || 'Erro ao reativar.'), 'error');
    }
  } catch (e) {
    toast('❌ Erro de ligação ao servidor.', 'error');
  }
}

function _getFilteredReservasForExport() {
  const q  = (document.getElementById('search-input')?.value || '').toLowerCase();
  const fe = document.getElementById('filter-estado')?.value || '';
  const fs = document.getElementById('filter-suite')?.value || '';
  const fc = document.getElementById('filter-canal')?.value || '';
  const fp = document.getElementById('filter-pagamento')?.value || '';
  const fd = normalizeIsoDateValue(document.getElementById('filter-date-from')?.value || '');
  const ft = normalizeIsoDateValue(document.getElementById('filter-date-to')?.value || '');
  return reservas.filter(r => {
    const matchQ = !q  || (r.guest_name + ' ' + r.id + ' ' + (r.guest_email||'') + ' ' + r.accommodation_name).toLowerCase().includes(q);
    return matchQ &&
      (!fe || r.status === fe) &&
      (!fs || r.accommodation_id === fs) &&
      (!fc || r.channel === fc) &&
      (!fp || r.payment_status === fp) &&
      (!fd || r.check_in >= fd) &&
      (!ft || r.check_out <= ft);
  });
}

function exportReservasXLS() {
  if (typeof XLSX === 'undefined') { toast('❌ Biblioteca XLSX não carregada.', 'error'); return; }
  showOperationProgress('A exportar reservas XLS', 'A preparar dados...', 15);
  const data = _getFilteredReservasForExport();
  const rows = data.map(r => ({
    'ID':             r.id,
    'Hóspede':        r.guest_name,
    'Email':          r.guest_email || '',
    'Alojamento':     r.accommodation_name,
    'Check-in':       r.check_in,
    'Check-out':      r.check_out,
    'Noites':         r.nights,
    'Hóspedes':       r.num_guests,
    'Canal':          r.channel,
    'Estado':         r.status,
    'Pagamento':      r.payment_status,
    'Total (€)':      r.total_amount,
    'Pago (€)':       r.amount_paid,
    'Em falta (€)':   Math.max(0, r.total_amount - r.amount_paid),
    'Notas':          r.notes || '',
  }));
  updateOperationProgress(60, 'A gerar Excel...');
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Reservas');
  updateOperationProgress(90, 'A iniciar download...');
  XLSX.writeFile(wb, `reservas_${new Date().toISOString().slice(0,10)}.xlsx`);
  updateOperationProgress(100, 'Concluído.');
  hideOperationProgress();
  toast('📊 Excel exportado!', 'success');
}

async function importReservasXLS(input) {
  if (typeof XLSX === 'undefined') { toast('❌ Biblioteca XLSX não carregada.', 'error'); return; }
  const file = input.files[0];
  if (!file) return;
  input.value = '';
  showOperationProgress('A importar reservas', 'A ler ficheiro...', 8);

  const reader = new FileReader();
  reader.onload = async e => {
    try {
      updateOperationProgress(20, 'A interpretar Excel...');
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      if (!rows.length) { toast('⚠️ Ficheiro vazio.', 'error'); hideOperationProgress(); return; }

      const pick = (row, ...keys) => {
        for (const k of keys) {
          if (row[k] !== undefined && row[k] !== '') return String(row[k]).trim();
        }
        return '';
      };
      const normalizeStatus = value => {
        const v = String(value || '').toLowerCase();
        if (v.includes('cancel')) return 'cancelada';
        if (v.includes('pend')) return 'pendente';
        return 'confirmada';
      };
      const normalizePayment = value => {
        const v = String(value || '').toLowerCase();
        if (v.includes('confirm') || v.includes('pago')) return 'confirmado';
        if (v.includes('parc')) return 'parcial';
        return 'pendente';
      };
      const normalizeImportDate = value => {
        const iso = normalizeIsoDateValue(value);
        if (iso) return iso;
        const serial = Number(value);
        const parsed = Number.isFinite(serial) && serial > 20000 ? XLSX.SSF?.parse_date_code?.(serial) : null;
        if (!parsed) return '';
        return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
      };
      const asAmount = value => parseFloat(String(value || '').replace(',', '.')) || 0;

      let created = 0, skipped = 0;
      for (const [idx, row] of rows.entries()) {
        const guestName = pick(row, 'Hóspede', 'Hospede', 'guest_name', 'Nome');
        const guestEmail = pick(row, 'Email', 'guest_email') || `reserva_${Date.now()}_${created}@sem-email.local`;
        const checkIn = normalizeImportDate(pick(row, 'Check-in', 'check_in'));
        const checkOut = normalizeImportDate(pick(row, 'Check-out', 'check_out'));
        const accKey = pick(row, 'Alojamento', 'accommodation_name', 'accommodation_id');
        const acc = accommodations.find(a => a.id === accKey || a.name === accKey);
        if (!guestName || !checkIn || !checkOut || !acc) { skipped++; continue; }

        const parts = guestName.split(' ');
        const amountPaid = asAmount(pick(row, 'Pago (€)', 'Pago', 'amount_paid'));
        try {
          await apiPost('/api/reservations', {
            guest: {
              name: guestName,
              first_name: parts[0] || guestName,
              last_name: parts.slice(1).join(' '),
              email: guestEmail,
              phone: pick(row, 'Telefone', 'Phone', 'phone') || null,
              country: pick(row, 'País', 'Pais', 'country') || null,
              nationality: pick(row, 'País', 'Pais', 'country') || null,
            },
            accommodation_id: acc.id,
            check_in: checkIn,
            check_out: checkOut,
            num_guests: parseInt(pick(row, 'Hóspedes', 'Hospedes', 'num_guests'), 10) || 1,
            breakfast_included: false,
            channel: pick(row, 'Canal', 'channel') || 'direto',
            status: normalizeStatus(pick(row, 'Estado', 'status')),
            payment_status: normalizePayment(pick(row, 'Pagamento', 'payment_status')),
            payment_method: pick(row, 'Método pagamento', 'Metodo pagamento', 'payment_method') || null,
            amount_paid: amountPaid,
            notes: pick(row, 'Notas', 'notes'),
            rgpd_consent: true,
            guests_data: [],
          });
          created++;
        } catch {
          skipped++;
        }
        updateOperationProgress(25 + ((idx + 1) / rows.length) * 65, `A importar ${idx + 1}/${rows.length} reservas...`);
      }
      updateOperationProgress(94, 'A atualizar vistas...');
      toast(`✅ ${created} reservas importadas${skipped ? `, ${skipped} ignoradas` : ''}.`, 'success');
      await loadReservas();
      if (typeof renderCalView === 'function') renderCalView();
      if (typeof renderDashboard === 'function') renderDashboard();
      updateOperationProgress(100, 'Concluído.');
    } catch (err) {
      toast('❌ Erro ao ler ficheiro: ' + err.message, 'error');
    } finally {
      hideOperationProgress();
    }
  };
  reader.readAsArrayBuffer(file);
}

function exportReservasPDF() {
  if (typeof window.jspdf === 'undefined') { toast('❌ Biblioteca jsPDF não carregada.', 'error'); return; }
  showOperationProgress('A exportar reservas PDF', 'A preparar documento...', 15);
  const { jsPDF } = window.jspdf;
  const doc  = new jsPDF({ orientation: 'landscape' });
  const data = _getFilteredReservasForExport();
  doc.setFontSize(16); doc.text('Reservas — Santa Paciência', 14, 18);
  doc.setFontSize(10); doc.text(`Exportado em ${new Date().toLocaleDateString('pt-PT')} · ${data.length} reserva${data.length !== 1 ? 's' : ''}`, 14, 26);
  doc.autoTable({
    startY: 32,
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [132, 52, 36], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [252, 250, 248] },
    head: [['ID','Hóspede','Alojamento','Check-in','Check-out','Noites','Canal','Estado','Total']],
    body: data.map(r => [
      r.id, r.guest_name, r.accommodation_name,
      r.check_in, r.check_out, r.nights, r.channel, r.status,
      '€' + Number(r.total_amount).toFixed(2),
    ]),
  });
  updateOperationProgress(90, 'A iniciar download...');
  doc.save(`reservas_${new Date().toISOString().slice(0,10)}.pdf`);
  updateOperationProgress(100, 'Concluído.');
  hideOperationProgress();
  toast('📄 PDF exportado!', 'success');
}
