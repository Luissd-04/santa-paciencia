let sortCol = SS.get('res:sort', 'check_in');
let sortAsc = SS.get('res:asc', true);
let reservasViewMode = SS.get('res:view', 'card');
let reservasDetailOpen = false;

// Filtro de data exata (distinto do filtro de intervalo filter-date-from/to),
// usado pelos atalhos "Chegadas hoje"/"Partidas hoje" do dashboard.
let resExactDateFilter = null; // { field: 'check_in'|'check_out', date: 'AAAA-MM-DD' } | null

function setResExactDateFilter(field, date) {
  resExactDateFilter = { field, date };
  ['filter-date-from', 'filter-date-to'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  renderResExactFilterChip();
  renderTabela();
}

function clearResExactDateFilter() {
  if (!resExactDateFilter) return;
  resExactDateFilter = null;
  renderResExactFilterChip();
}

function renderResExactFilterChip() {
  const el = document.getElementById('res-exact-filter-chip');
  if (!el) return;
  if (!resExactDateFilter) {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }
  const label = resExactDateFilter.field === 'check_in' ? 'Chegadas de hoje' : 'Partidas de hoje';
  el.style.display = 'block';
  el.innerHTML = `<div class="chip active" style="display:inline-flex;align-items:center;gap:6px;" onclick="clearResExactDateFilter();renderTabela();">${label} ✕</div>`;
}

// Os chips mobile são apenas UI sobre o dropdown filter-estado — fonte única
// de verdade. syncMobileChips() realinha o chip ativo com o valor do dropdown.
function setMobileChip(el, filter) {
  const fe = document.getElementById('filter-estado');
  if (fe) {
    fe.value = filter;
    AppUI.refreshDropdowns(document.getElementById('view-reservas'));
  }
  clearResExactDateFilter();
  syncMobileChips(filter);
  renderTabela();
}

function syncMobileChips(filterValue) {
  document.querySelectorAll('.mobile-filter-chips .chip').forEach(chip => {
    const on = chip.getAttribute('onclick') || '';
    const match = on.match(/setMobileChip\(this,'([^']*)'\)/);
    chip.classList.toggle('active', !!match && match[1] === (filterValue || ''));
  });
}

// Filtro partilhado entre a tabela desktop e os cards mobile (fonte única).
function getFilteredReservas() {
  const searchEl = document.getElementById('search-input') || document.getElementById('mobile-search-input');
  const q  = (searchEl?.value || '').toLowerCase();
  const fe = document.getElementById('filter-estado')?.value || '';
  const fs = document.getElementById('filter-suite')?.value || '';
  const fc = document.getElementById('filter-canal')?.value || '';
  const fp = document.getElementById('filter-pagamento')?.value || '';
  const fd = normalizeIsoDateValue(document.getElementById('filter-date-from')?.value || '');
  const ft = normalizeIsoDateValue(document.getElementById('filter-date-to')?.value || '');
  return reservas.filter(r => {
    const matchQ = !q || (r.guest_name + ' ' + r.id + ' ' + (r.guest_email || '') + ' ' + r.accommodation_name).toLowerCase().includes(q);
    const matchE = !fe || r.status === fe;
    const matchS = !fs || r.accommodation_id === fs;
    const matchC = !fc || r.channel === fc;
    const matchP = !fp || r.payment_status === fp;
    const matchD = !fd || r.check_in >= fd;
    const matchT = !ft || r.check_out <= ft;
    const matchExact = !resExactDateFilter || r[resExactDateFilter.field] === resExactDateFilter.date;
    return matchQ && matchE && matchS && matchC && matchP && matchD && matchT && matchExact;
  });
}

const STATUS_COLORS = {
  pre_reserva: 'var(--roxo)',
  confirmada: 'var(--marca)',
  pendente:   'var(--laranja)',
  pre_checkin: 'var(--dourado)',
  aguardar_pagamento: 'var(--azul-claro)',
  cancelada:  'var(--vermelho)',
};

function preCheckinUrl(token) {
  return token ? `${window.location.origin}/pre-checkin/${encodeURIComponent(token)}` : '';
}

function renderResCardHeader(r) {
  return `<div class="mrc-top">
      <div>
        <div class="mrc-name">${escapeHtml(r.guest_name)}</div>
        <div class="mrc-id">${escapeHtml(r.id)} · ${escapeHtml(r.accommodation_name)}</div>
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

// O cartão inteiro já abre o detalhe (onclick em .m-res-card) — daí não
// haver botão "Ver". Fica só a ação secundária "Editar".
function renderResCardActions(r) {
  return `<div class="mrc-actions" onclick="event.stopPropagation()">
      <button class="m-card-btn" onclick="openEditModal('${r.id}')">
        <i data-lucide="pencil"></i> Editar
      </button>
    </div>`;
}

function renderResCard(r) {
  const bc = STATUS_COLORS[r.status] || 'var(--marca)';
  return `<div class="m-res-card m-card" style="border-left-color:${bc}" onclick="showDetail('${r.id}')">
    ${renderResCardHeader(r)}
    ${renderResCardMeta(r)}
    ${renderResCardTotal(r)}
    ${renderResCardActions(r)}
  </div>`;
}

let reservasPastExpanded = false;

// Sem filtros ativos, um utilizador no telemóvel quer sobretudo ver o
// que está para vir (chegadas/estadias) — as passadas ficam atrás de um
// separador colapsável. Com um filtro explícito (pesquisa, estado,
// suite, canal, pagamento, datas) mostramos a lista plana como antes,
// porque o filtro já é uma pesquisa deliberada (pode incluir passadas).
function hasActiveReservasFilter() {
  const q = document.getElementById('search-input')?.value || document.getElementById('mobile-search-input')?.value || '';
  return Boolean(
    q ||
    document.getElementById('filter-estado')?.value ||
    document.getElementById('filter-suite')?.value ||
    document.getElementById('filter-canal')?.value ||
    document.getElementById('filter-pagamento')?.value ||
    document.getElementById('filter-date-from')?.value ||
    document.getElementById('filter-date-to')?.value ||
    resExactDateFilter
  );
}

function toggleReservasPastSection() {
  reservasPastExpanded = !reservasPastExpanded;
  renderMobileCards();
}

// "Limpar filtros" na barra só aparece quando há mesmo algum filtro ativo
// (pesquisa, estado, suite, canal, pagamento, datas ou atalho de data exata).
function updateReservasClearBtn() {
  const btn = document.getElementById('reservas-clear-filters');
  if (btn) btn.style.display = hasActiveReservasFilter() ? '' : 'none';
}

