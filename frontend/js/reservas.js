let sortCol = 'check_in';
let sortAsc = true;
let mobileChipFilter = '';

function setMobileChip(el, filter) {
  mobileChipFilter = filter;
  document.querySelectorAll('.mobile-filter-chips .chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderMobileCards();
}

function renderMobileCards() {
  const container = document.getElementById('mobile-res-cards');
  if (!container) return;

  const q = (document.getElementById('mobile-search-input') || {value:''}).value.toLowerCase();
  const statusColors = {
    'confirmada': 'var(--marca)', 'pendente': 'var(--laranja)', 'cancelada': 'var(--vermelho)'
  };

  const filtered = reservas.filter(r => {
    const matchQ = !q || (r.guest_name + ' ' + r.id + ' ' + r.accommodation_name).toLowerCase().includes(q);
    const matchS = !mobileChipFilter || r.status === mobileChipFilter;
    return matchQ && matchS;
  }).sort((a, b) => new Date(b.check_in) - new Date(a.check_in));
  updateReservasSummary(filtered.length, mobileChipFilter ? `filtro ${mobileChipFilter}` : 'resultados visíveis');

  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="es-icon">📭</div><h3>Sem reservas</h3><p>Nenhuma reserva encontrada.</p></div>';
    return;
  }

  container.innerHTML = filtered.map(r => {
    const bc = statusColors[r.status] || 'var(--marca)';
    return `<div class="m-res-card" style="border-left-color:${bc}" onclick="showDetail('${r.id}')">
      <div class="mrc-top">
        <div>
          <div class="mrc-name">${r.guest_name}</div>
          <div class="mrc-id">${r.id} · ${r.accommodation_name}</div>
        </div>
        ${badgeEstado(r.status)}
      </div>
      <div class="mrc-meta">
        <div class="mrc-meta-item"><i data-lucide="calendar"></i> ${formatDate(r.check_in)}</div>
        <div class="mrc-meta-item"><i data-lucide="moon"></i> ${r.nights} noite${r.nights !== 1 ? 's' : ''}</div>
      </div>
      <div class="mrc-total">
        <span class="mrc-channel">${r.channel || '—'} · ${badgePagamento(r.payment_status)}</span>
        <span class="mrc-price">€${Number(r.total_amount || 0).toFixed(2)}${(() => {
          const paid = Number(r.amount_paid || 0);
          const total = Number(r.total_amount || 0);
          const rem = total - paid;
          if (paid > 0 && rem > 0.01) return `<span style="font-size:11px;color:var(--vermelho);display:block;">falta €${rem.toFixed(2)}</span>`;
          return '';
        })()}</span>
      </div>
      <div class="mrc-actions" onclick="event.stopPropagation()">
        <button class="m-card-btn primary" onclick="showDetail('${r.id}')">
          <i data-lucide="eye"></i> Ver
        </button>
        <button class="m-card-btn" onclick="openEditModal('${r.id}')">
          <i data-lucide="pencil"></i> Editar
        </button>
      </div>
    </div>`;
  }).join('');

  if (window.lucide) lucide.createIcons();
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
}

async function loadReservas() {
  document.getElementById('tabela-loading').style.display = 'flex';
  document.getElementById('tabela-body').innerHTML = '';
  document.getElementById('tabela-empty').style.display = 'none';
  try {
    const data = await apiGet('/api/reservations');
    reservas = data.data || [];
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
  const fd = (document.getElementById('filter-date-from')|| { value: '' }).value;
  const ft = (document.getElementById('filter-date-to')  || { value: '' }).value;

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
}

function updateReservasSummary(total, detailText) {
  const totalEl = document.getElementById('reservas-results-total');
  const detailEl = document.getElementById('reservas-results-detail');
  if (totalEl) totalEl.textContent = String(total ?? 0);
  if (detailEl) detailEl.textContent = detailText || 'resultados visíveis';
}

function updateForeignRequirements() {
  const pais = document.getElementById('f-pais')?.value;
  const isForeign = pais && pais !== 'Portugal';
  document.querySelectorAll('.req-foreign').forEach(el => {
    el.style.display = isForeign ? '' : 'none';
  });
}

function _resetGuestFields() {
  ['f-primeiro-nome','f-apelido','f-email','f-tel-num',
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
  document.getElementById('f-checkin').value = config.checkIn || '';
  document.getElementById('f-checkout').value = config.checkOut || '';
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
  document.getElementById('modal-bg').classList.add('open');
}

function openModalFromCalendar(checkIn, accommodationId = '') {
  if (!checkIn) return;
  openModal({
    checkIn,
    checkOut: addDaysToIsoDate(checkIn, 1),
    accommodationId,
    step: 2
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
    document.getElementById('f-primeiro-nome').value = guestFull.first_name || nameParts[0] || '';
    document.getElementById('f-apelido').value        = guestFull.last_name  || nameParts.slice(1).join(' ') || '';
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
    document.getElementById('f-nascimento').value        = guestFull.birth_date || '';
    document.getElementById('f-local-nascimento').value  = guestFull.birth_city || '';
    updateForeignRequirements();
    document.getElementById('f-nif').value            = guestFull.nif || '';
    document.getElementById('f-morada').value         = guestFull.address || '';
    document.getElementById('f-cp').value             = guestFull.postal_code || '';
    document.getElementById('f-cidade').value         = guestFull.city || '';

    document.getElementById('f-checkin').value       = r.check_in || '';
    document.getElementById('f-checkout').value      = r.check_out || '';
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
    if (payDateEl2) payDateEl2.value = r.payment_date || '';
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
      setVal('first_name', g.first_name || (g.name || '').split(' ')[0]);
      setVal('last_name',  g.last_name  || (g.name || '').split(' ').slice(1).join(' '));
      setVal('email',      g.email);
      const rawP = g.phone || '';
      const mc = DIAL_COUNTRIES.find(c => rawP.startsWith(c.dial));
      setVal('tel_prefix', mc ? mc.dial : '+351');
      setVal('tel_num', mc ? rawP.slice(mc.dial.length).trim() : rawP);
      setVal('country',        g.country || g.nationality);
      setVal('doc_type',       g.document_type);
      setVal('doc_number',     g.document_number);
      setVal('birth_date',     g.birth_date);
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
    document.getElementById('modal-bg').classList.add('open');
  } catch (e) {
    toast('❌ Erro ao carregar reserva.', 'error');
  }
}

function closeModal() {
  const bg = document.getElementById('modal-bg');
  const modal = bg.querySelector('.modal');
  modal.classList.add('modal-closing');
  setTimeout(() => { bg.classList.remove('open'); modal.classList.remove('modal-closing'); editingId = null; }, 320);
}

function calcTotal() {
  const ci = document.getElementById('f-checkin').value;
  const co = document.getElementById('f-checkout').value;
  const numHospedes = parseInt(document.getElementById('f-num-hospedes').value) || 1;
  const breakfast = document.getElementById('f-breakfast')?.value === 'true';
  const alojId = document.getElementById('f-aloj').value;
  const suite = accommodations.find(a => a.id === alojId);

  // Update nights badge from dates alone (no suite needed)
  const badge = document.getElementById('wiz-nights-badge-wrap');
  const valEl = document.getElementById('wiz-nights-val');
  if (ci && co) {
    const noitesOnly = Math.max(0, Math.round((new Date(co) - new Date(ci)) / 86400000));
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
    const noites = Math.max(0, Math.round((new Date(co) - new Date(ci)) / (1000 * 60 * 60 * 24)));
    document.getElementById('f-noites').value = noites;
    const taxSvc = servicosData.find(s => s.id === 'tourist_tax');
    const bkfSvc = servicosData.find(s => s.id === 'breakfast');
    const taxCost = (taxSvc?.active !== false) ? (taxSvc?.value ?? 3) * numHospedes * noites : 0;
    const bkfRate = bkfSvc?.value ?? 19;
    const bkfCost = breakfast ? bkfRate * numHospedes * noites : 0;
    const extraOccupancyCost = getExtraOccupancyCharge(suite, numHospedes, noites, getGuestBirthDatesFromUi(), ci);
    document.getElementById('f-total').value = ((suite.price_per_night * noites) + extraOccupancyCost + taxCost + bkfCost).toFixed(2);
  }
  updateWizSummary();
}

function getExtraOccupancyCharge(suite, numGuests, nights, birthDates = [], checkIn = null) {
  if (!suite) return 0;
  const options = normalizeExtraOccupancyOptionsForPrice(suite);
  const maxGuests = Number(suite.max_guests) || numGuests;
  const included = Math.max(1, Math.min(
    Number(suite.base_guests_included) || Math.min(maxGuests, 2),
    maxGuests
  ));
  let remainingGuests = Math.max(0, numGuests - included);
  if (!remainingGuests) return 0;
  const specialRates = getAgeSpecialRates(suite, birthDates, checkIn).slice(0, remainingGuests);
  let total = specialRates.reduce((sum, rate) => sum + (rate * nights), 0);
  remainingGuests -= specialRates.length;

  return options.reduce((runningTotal, option) => {
    if (remainingGuests <= 0) return runningTotal;
    const capacity = Math.max(0, Number(option.capacity) || 0);
    if (!capacity) return runningTotal;
    const guestsCovered = Math.min(remainingGuests, capacity);
    remainingGuests -= guestsCovered;
    const price = Number(option.price) || 0;
    if (option.charge_type === 'per_bed_night') return runningTotal + (price * nights);
    return runningTotal + (price * guestsCovered * nights);
  }, total);
}

function normalizeExtraOccupancyOptionsForPrice(suite) {
  let options = [];
  if (Array.isArray(suite.extra_occupancy_options)) {
    options = suite.extra_occupancy_options;
  } else if (typeof suite.extra_occupancy_options === 'string' && suite.extra_occupancy_options.trim()) {
    try { options = JSON.parse(suite.extra_occupancy_options); } catch { options = []; }
  }

  if (!options.length && suite.extra_bed_enabled) {
    options = [{
      capacity: Number(suite.extra_bed_capacity) || 0,
      price: Number(suite.extra_bed_price) || 0,
      charge_type: suite.extra_bed_charge_type || 'per_guest_night'
    }];
  }

  return options.map(option => ({
    capacity: Math.max(0, Number(option?.capacity) || 0),
    price: Math.max(0, Number(option?.price) || 0),
    charge_type: option?.charge_type === 'per_bed_night' ? 'per_bed_night' : 'per_guest_night'
  }));
}

function getGuestBirthDatesFromUi() {
  return [
    document.getElementById('f-nascimento')?.value || '',
    ...Array.from(document.querySelectorAll('.extra-guest-row [data-field="birth_date"]')).map(el => el.value || '')
  ].filter(Boolean);
}

function getAgeSpecialRates(suite, birthDates = [], checkIn = null) {
  const babyLimit = Number(suite.baby_age_limit ?? 2);
  const childLimit = Number(suite.child_age_limit ?? 12);
  const babyPrice = Number(suite.baby_price ?? 0);
  const childPrice = Number(suite.child_price ?? 0);
  return birthDates
    .map(date => {
      const age = getAgeAtDate(date, checkIn);
      if (age === null) return null;
      if (age < babyLimit) return { age, rate: babyPrice };
      if (age >= babyLimit && age < childLimit) return { age, rate: childPrice };
      return null;
    })
    .filter(Boolean)
    .sort((a, b) => a.age - b.age)
    .map(item => item.rate);
}

function getAgeAtDate(birthDate, refDate) {
  if (!birthDate || !refDate) return null;
  const birth = new Date(`${birthDate}T12:00:00`);
  const ref = new Date(`${refDate}T12:00:00`);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(ref.getTime()) || birth > ref) return null;
  let age = ref.getFullYear() - birth.getFullYear();
  const monthDiff = ref.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && ref.getDate() < birth.getDate())) age--;
  return age;
}

function renderExtraGuests() {
  const n = parseInt(document.getElementById('f-num-hospedes').value) || 1;
  const wrap = document.getElementById('extra-guests-wrap');
  const container = document.getElementById('extra-guests-container');
  if (!wrap || !container) return;
  if (n <= 1) { wrap.style.display = 'none'; container.innerHTML = ''; return; }
  wrap.style.display = '';

  const existing = Array.from(container.querySelectorAll('.extra-guest-row')).map(row => ({
    first_name:      row.querySelector('[data-field="first_name"]')?.value      || '',
    last_name:       row.querySelector('[data-field="last_name"]')?.value       || '',
    email:           row.querySelector('[data-field="email"]')?.value           || '',
    tel_prefix:      row.querySelector('[data-field="tel_prefix"]')?.value      || '+351',
    tel_num:         row.querySelector('[data-field="tel_num"]')?.value         || '',
    country:         row.querySelector('[data-field="country"]')?.value         || '',
    doc_type:        row.querySelector('[data-field="doc_type"]')?.value        || '',
    doc_number:      row.querySelector('[data-field="doc_number"]')?.value      || '',
    birth_date:      row.querySelector('[data-field="birth_date"]')?.value      || '',
    nif:             row.querySelector('[data-field="nif"]')?.value             || '',
  }));

  const prefixOpts = DIAL_COUNTRIES.map(c =>
    `<option value="${c.dial}">${c.flag} ${c.dial}</option>`
  ).join('');
  const countryOpts = '<option value="">— País —</option>' +
    DIAL_COUNTRIES.map(c => `<option value="${c.name}">${c.flag} ${c.name}</option>`).join('');

  container.innerHTML = '';
  for (let i = 2; i <= n; i++) {
    const p = existing[i - 2] || {};
    container.innerHTML += `
      <div class="extra-guest-row" style="background:var(--cinza-claro);border-radius:10px;padding:14px;margin-bottom:12px;">
        <div style="font-size:12px;font-weight:700;color:var(--cinza);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;">Hóspede ${i}</div>
        <div class="form-grid" style="margin:0;gap:12px;">
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">Nome</label>
            <input class="form-control" data-field="first_name" placeholder="Primeiro nome" value="${p.first_name || ''}">
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">Apelido</label>
            <input class="form-control" data-field="last_name" placeholder="Apelido" value="${p.last_name || ''}">
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">Email</label>
            <input class="form-control" data-field="email" type="email" placeholder="email@exemplo.com" value="${p.email || ''}">
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">Telefone</label>
            <div class="phone-group">
              <select class="form-control phone-prefix" data-field="tel_prefix">${prefixOpts}</select>
              <input class="form-control phone-number" data-field="tel_num" type="tel" placeholder="912 345 678" value="${p.tel_num || ''}">
            </div>
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">País</label>
            <select class="form-control guest-country" data-field="country">${countryOpts}</select>
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">Tipo de Documento</label>
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
            <label class="form-label">Nº de Documento</label>
            <input class="form-control" data-field="doc_number" placeholder="XX000000" value="${p.doc_number || ''}">
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">Data de Nascimento</label>
            <input class="form-control" data-field="birth_date" type="date" value="${p.birth_date || ''}" onchange="calcTotal()">
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">NIF</label>
            <input class="form-control" data-field="nif" placeholder="000 000 000" value="${p.nif || ''}">
          </div>
        </div>
      </div>`;
  }

  // Restore select values after DOM insertion
  container.querySelectorAll('.extra-guest-row').forEach((row, idx) => {
    const p = existing[idx] || {};
    const prefixSel = row.querySelector('[data-field="tel_prefix"]');
    if (prefixSel && p.tel_prefix) prefixSel.value = p.tel_prefix;
    const countrySel = row.querySelector('[data-field="country"]');
    if (countrySel && p.country) countrySel.value = p.country;
    const docSel = row.querySelector('[data-field="doc_type"]');
    if (docSel && p.doc_type) docSel.value = p.doc_type;
  });

  if (window.lucide) lucide.createIcons();
}

// ── WIZARD FUNCTIONS ──

let _unavailableSuites = new Set();
let _availTimer = null;

async function fetchSuiteAvailability() {
  const ci = document.getElementById('f-checkin')?.value;
  const co = document.getElementById('f-checkout')?.value;
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
  if (wizStep === 2) { renderSuiteCards(); calcTotal(); }
  if (wizStep === 3) buildWizConfirm();
  if (window.lucide) lucide.createIcons();
}

function validateWizStep(step) {
  if (step === 1) {
    if (!document.getElementById('f-primeiro-nome').value.trim())
      { toast('⚠️ Introduz o primeiro nome do hóspede.', 'error'); return false; }
    if (!document.getElementById('f-email').value.trim())
      { toast('⚠️ Introduz o email do hóspede.', 'error'); return false; }
    if (!document.getElementById('f-tel-num').value.trim())
      { toast('⚠️ Introduz o telefone do hóspede.', 'error'); return false; }
    if (!document.getElementById('f-pais').value)
      { toast('⚠️ Seleciona o país do hóspede.', 'error'); return false; }
    const isForeign = document.getElementById('f-pais').value !== 'Portugal';
    if (isForeign) {
      if (!document.getElementById('f-doc-tipo').value)
        { toast('⚠️ Seleciona o tipo de documento.', 'error'); return false; }
      if (!document.getElementById('f-doc-num').value.trim())
        { toast('⚠️ Introduz o número de documento.', 'error'); return false; }
      if (!document.getElementById('f-doc-emissor').value)
        { toast('⚠️ Seleciona o país emissor do documento.', 'error'); return false; }
      if (!document.getElementById('f-nascimento').value)
        { toast('⚠️ Introduz a data de nascimento.', 'error'); return false; }
      if (!document.getElementById('f-local-nascimento').value.trim())
        { toast('⚠️ Introduz o local de nascimento.', 'error'); return false; }
    }
    return true;
  }
  if (step === 2) {
    const ci = document.getElementById('f-checkin').value;
    const co = document.getElementById('f-checkout').value;
    if (!ci) { toast('⚠️ Seleciona a data de check-in.', 'error'); return false; }
    if (!co) { toast('⚠️ Seleciona a data de check-out.', 'error'); return false; }
    if (new Date(co) <= new Date(ci)) { toast('⚠️ O check-out deve ser depois do check-in.', 'error'); return false; }
    const alojVal = document.getElementById('f-aloj').value;
    if (!alojVal) { toast('⚠️ Seleciona um alojamento.', 'error'); return false; }
    if (_unavailableSuites.has(alojVal)) { toast('⚠️ Este alojamento está ocupado nas datas selecionadas.', 'error'); return false; }
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
  const nome = (document.getElementById('f-primeiro-nome')?.value || '').trim();
  const apelido = (document.getElementById('f-apelido')?.value || '').trim();
  const alojId = document.getElementById('f-aloj')?.value;
  const suite = accommodations.find(a => a.id === alojId);
  const ci = document.getElementById('f-checkin')?.value;
  const co = document.getElementById('f-checkout')?.value;
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
  const currentAlojId = document.getElementById('f-aloj')?.value;
  const ci = document.getElementById('f-checkin')?.value;
  const co = document.getElementById('f-checkout')?.value;
  const datesSet = !!(ci && co && new Date(co) > new Date(ci));
  if (!accommodations.length) {
    grid.innerHTML = '<p style="font-size:13px;color:var(--cinza);">Nenhum alojamento disponível.</p>';
    return;
  }
  grid.innerHTML = accommodations.map(a => {
    const cor = a.color || 'var(--marca)';
    const unavail = datesSet && _unavailableSuites.has(a.id);
    const sel = !unavail && currentAlojId === a.id ? 'selected' : '';
    const cls = `suite-card-opt${sel ? ' selected' : ''}${unavail ? ' unavailable' : ''}`;
    const click = unavail ? '' : `onclick="selectSuiteCard('${a.id}')"`;
    return `<div class="${cls}" ${click} title="${unavail ? 'Indisponível nas datas selecionadas' : a.name}">
      <div class="suite-check"><i data-lucide="check" style="width:10px;height:10px;color:#fff;"></i></div>
      ${unavail
        ? `<div style="font-size:16px;margin-bottom:6px;">🔒</div>`
        : `<div style="width:10px;height:10px;border-radius:50%;background:${cor};margin-bottom:8px;"></div>`}
      <div class="suite-card-name">${a.name}</div>
      ${unavail
        ? `<div class="suite-card-unavail-lbl">Indisponível</div>`
        : `<div class="suite-card-price">€${a.price_per_night}<span class="suite-card-sub"> / noite</span></div>`}
    </div>`;
  }).join('');
  if (window.lucide) lucide.createIcons();
}

function selectSuiteCard(id) {
  if (_unavailableSuites.has(id)) return;
  const sel = document.getElementById('f-aloj');
  if (sel) sel.value = id;
  renderSuiteCards();
  calcTotal();
}

function buildWizConfirm() {
  calcTotal();
  const nome = document.getElementById('f-primeiro-nome')?.value || '';
  const apelido = document.getElementById('f-apelido')?.value || '';
  const email = document.getElementById('f-email')?.value || '';
  const prefix = document.getElementById('f-tel-prefix')?.value || '';
  const telNum = document.getElementById('f-tel-num')?.value || '';
  const pais = document.getElementById('f-pais')?.value || '';
  const alojId = document.getElementById('f-aloj')?.value;
  const suite = accommodations.find(a => a.id === alojId);
  const cor = suite?.color || 'var(--marca)';
  const ci = document.getElementById('f-checkin')?.value;
  const co = document.getElementById('f-checkout')?.value;
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
  document.getElementById('f-primeiro-nome').value = g.first_name || '';
  document.getElementById('f-apelido').value = g.last_name || '';
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
  document.getElementById('f-nascimento').value = g.birth_date || '';
  document.getElementById('f-local-nascimento').value = g.birth_city || '';
  document.getElementById('f-nif').value = g.nif || '';
  document.getElementById('f-morada').value = g.address || '';
  document.getElementById('f-cp').value = g.postal_code || '';
  document.getElementById('f-cidade').value = g.city || '';
  updateForeignRequirements();
  updateWizSummary();
  const drop = document.getElementById('wiz-guest-drop');
  if (drop) { drop.innerHTML = ''; drop.classList.remove('open'); }
  const si = document.getElementById('wiz-guest-search');
  if (si) si.value = '';
  toast('✅ Dados do hóspede preenchidos.', 'success');
}

// Close guest dropdown when clicking outside
document.addEventListener('click', function(e) {
  const drop = document.getElementById('wiz-guest-drop');
  const wrap = document.getElementById('wiz-guest-search')?.closest('.guest-search-wrap');
  if (drop && wrap && !wrap.contains(e.target)) drop.classList.remove('open');
});

function collectExtraGuests() {
  return Array.from(document.querySelectorAll('.extra-guest-row')).map(row => {
    const first_name  = row.querySelector('[data-field="first_name"]')?.value  || '';
    const last_name   = row.querySelector('[data-field="last_name"]')?.value   || '';
    const tel_prefix  = row.querySelector('[data-field="tel_prefix"]')?.value  || '';
    const tel_num     = row.querySelector('[data-field="tel_num"]')?.value     || '';
    return {
      name:           (first_name + ' ' + last_name).trim(),
      first_name,
      last_name,
      email:          row.querySelector('[data-field="email"]')?.value          || '',
      phone:          tel_prefix + tel_num.replace(/\s/g, ''),
      nationality:    row.querySelector('[data-field="country"]')?.value        || '',
      country:        row.querySelector('[data-field="country"]')?.value        || '',
      document_type:  row.querySelector('[data-field="doc_type"]')?.value      || '',
      document_number:row.querySelector('[data-field="doc_number"]')?.value    || '',
      birth_date:     row.querySelector('[data-field="birth_date"]')?.value    || '',
      nif:            row.querySelector('[data-field="nif"]')?.value           || '',
    };
  }).filter(g => g.first_name || g.email);
}

async function saveReserva() {
  const primeiroNome = document.getElementById('f-primeiro-nome').value.trim();
  const apelido      = document.getElementById('f-apelido').value.trim();
  const email        = document.getElementById('f-email').value.trim();
  const telPrefix    = document.getElementById('f-tel-prefix')?.value || '';
  const telNum       = document.getElementById('f-tel-num')?.value.trim() || '';
  const tel          = telPrefix + telNum.replace(/\s/g, '');
  const pais         = document.getElementById('f-pais').value.trim();
  const checkin  = document.getElementById('f-checkin').value;
  const checkout = document.getElementById('f-checkout').value;
  const alojId   = document.getElementById('f-aloj').value;
  const rgpdCheck = document.getElementById('f-rgpd-check');

  if (!primeiroNome) { toast('Por favor insira o nome do hóspede.', 'error'); return; }
  if (!apelido)      { toast('Por favor insira o apelido do hóspede.', 'error'); return; }
  if (!email)        { toast('Por favor insira o email do hóspede.', 'error'); return; }
  if (!telNum)       { toast('Por favor insira o telefone do hóspede.', 'error'); return; }
  if (!pais)         { toast('Por favor selecione o país do hóspede.', 'error'); return; }
  if (!checkin || !checkout) { toast('Por favor selecione as datas.', 'error'); return; }
  if (checkin >= checkout) { toast('O check-out deve ser depois do check-in.', 'error'); return; }
  const selectedAccommodation = accommodations.find(a => a.id === alojId);
  const requestedGuests = parseInt(document.getElementById('f-num-hospedes').value) || 1;
  if (selectedAccommodation?.max_guests && requestedGuests > selectedAccommodation.max_guests) {
    toast(`Este alojamento permite no máximo ${selectedAccommodation.max_guests} hóspede${selectedAccommodation.max_guests !== 1 ? 's' : ''}.`, 'error');
    return;
  }

  if (pais && pais !== 'Portugal') {
    if (!document.getElementById('f-nascimento').value)
      { toast('Para hóspedes estrangeiros, a data de nascimento é obrigatória.', 'error'); return; }
    if (!document.getElementById('f-local-nascimento').value.trim())
      { toast('Para hóspedes estrangeiros, o local de nascimento é obrigatório.', 'error'); return; }
    if (!document.getElementById('f-doc-tipo').value)
      { toast('Para hóspedes estrangeiros, o tipo de documento é obrigatório.', 'error'); return; }
    if (!document.getElementById('f-doc-num').value.trim())
      { toast('Para hóspedes estrangeiros, o número de documento é obrigatório.', 'error'); return; }
    if (!document.getElementById('f-doc-emissor').value)
      { toast('Para hóspedes estrangeiros, o país emissor do documento é obrigatório.', 'error'); return; }
  }
  if (rgpdCheck && !rgpdCheck.checked) {
    toast('O hóspede tem de aceitar o tratamento de dados (RGPD) para continuar.', 'error');
    rgpdCheck.closest('.rgpd-box')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  const nomeFull = (primeiroNome + ' ' + apelido).trim();
  const btn = document.getElementById('btn-guardar');
  btn.disabled = true;
  btn.textContent = '⏳ A guardar...';

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
        payment_date: document.getElementById('f-payment-date')?.value || null,
        notes: document.getElementById('f-notas').value,
        guests_data: collectExtraGuests(),
        guest: {
          name: nomeFull, first_name: primeiroNome, last_name: apelido,
          email, phone: tel, nationality: pais, country: pais,
          document_type:            document.getElementById('f-doc-tipo')?.value          || null,
          document_number:          document.getElementById('f-doc-num')?.value           || null,
          document_issuer_country:  document.getElementById('f-doc-emissor')?.value       || null,
          birth_date:               document.getElementById('f-nascimento')?.value        || null,
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
          birth_date:               document.getElementById('f-nascimento')?.value        || null,
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
        payment_date: document.getElementById('f-payment-date')?.value || null,
        notes: document.getElementById('f-notas').value,
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
    btn.disabled = false;
    btn.textContent = editingId ? 'Atualizar Reserva' : 'Guardar Reserva';
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
    const data = await apiGet(`/api/reservations/${id}`);
    const r = data.data;
    document.getElementById('detail-title').textContent = r.id + ' — ' + r.guest_name;
    document.getElementById('detail-body').innerHTML = `
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
        const gd = typeof r.guests_data === 'string' ? JSON.parse(r.guests_data || '[]') : (r.guests_data || []);
        if (!gd.length) return '';
        return `<div style="margin-top:16px;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--cinza);margin-bottom:8px;">Hóspedes Adicionais</div>
          ${gd.map((g, i) => `<div style="background:var(--cinza-claro);border-radius:8px;padding:10px 14px;margin-bottom:6px;font-size:13px;">
            <b>Hóspede ${i + 2}</b> — ${g.name || '—'}
            ${g.email ? `· ${g.email}` : ''}${g.phone ? ` · ${g.phone}` : ''}${g.nationality ? ` · ${g.nationality}` : ''}
          </div>`).join('')}
        </div>`;
      })()}
      <div style="margin-top:20px;display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;">
        ${(() => {
          const acc = accommodations.find(a => a.id === r.accommodation_id);
          return [['Alojamento', (acc?.price_per_night || 0) * r.nights, false],
           ['Ocupação extra', getExtraOccupancyCharge(acc, r.num_guests || 1, r.nights || 0, (typeof r.guests_data === 'string' ? JSON.parse(r.guests_data || '[]') : (r.guests_data || [])).map(g => g.birth_date).filter(Boolean), r.check_in), false],
           ['Taxa Turística', r.tourist_tax || 0, false],
           ['Pequeno-almoço', r.breakfast_included ? r.num_guests * r.nights * (servicosData.find(s => s.id === 'breakfast')?.value ?? 19) : 0, false],
           ['Total', r.total_amount || 0, false]];
        })().map(([l, v, _]) => `
          <div style="background:var(--cinza-claro);border-radius:10px;padding:14px;text-align:center;">
            <div style="font-size:11px;color:var(--cinza);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">${l}</div>
            <div style="font-family:'Playfair Display',serif;font-size:22px;color:var(--azul);">€${Number(v).toFixed(2)}</div>
          </div>`).join('')}
        ${(() => {
          const paid = Number(r.amount_paid || 0);
          const total = Number(r.total_amount || 0);
          const remaining = total - paid;
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
    document.getElementById('detail-footer').innerHTML = `
      <button class="btn btn-ghost" onclick="document.getElementById('detail-bg').classList.remove('open')">Fechar</button>
      <button class="btn btn-primary" onclick="document.getElementById('detail-bg').classList.remove('open');openEditModal('${r.id}')">
        ${lcIcon('pencil', 13)} Editar
      </button>
      ${r.status === 'cancelada'
        ? `<button class="btn btn-success" onclick="reativarReserva('${r.id}')">
            ${lcIcon('refresh-cw', 13)} Reativar Reserva
           </button>`
        : `<button class="btn btn-danger" onclick="cancelarReserva('${r.id}')">
            ${lcIcon('x-circle', 13)} Cancelar Reserva
           </button>`}
    `;
    if (window.lucide) lucide.createIcons();
    document.getElementById('detail-bg').classList.add('open');
  } catch (e) {
    toast('❌ Erro ao carregar detalhe.', 'error');
  }
}

async function cancelarReserva(id) {
  if (!confirm('Cancelar esta reserva? Será removida do Google Calendar.')) return;
  try {
    const res = await apiDelete(`/api/reservations/${id}`);
    if (res.success) {
      document.getElementById('detail-bg').classList.remove('open');
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
  if (!confirm('Reativar esta reserva? Será marcada como confirmada.')) return;
  try {
    const res = await apiPut(`/api/reservations/${id}`, { status: 'confirmada' });
    if (res.success) {
      const detailBg = document.getElementById('detail-bg');
      if (detailBg?.classList.contains('open')) detailBg.classList.remove('open');
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
