// Estado privado; interface partilhada em AppModules.reservas.
(() => {
AppModules.define('reservas', {
  clearResExactDateFilter: { get: () => clearResExactDateFilter },
  getFilteredReservas: { get: () => getFilteredReservas },
  preCheckinUrl: { get: () => preCheckinUrl },
  renderResCard: { get: () => renderResCard },
  reservasDetailOpen: { get: () => reservasDetailOpen, set: value => { reservasDetailOpen = value; } },
  reservasPeriodScope: { get: () => reservasPeriodScope, set: value => { reservasPeriodScope = value; } },
  reservasViewMode: { get: () => reservasViewMode, set: value => { reservasViewMode = value; } },
  resExactDateFilter: { get: () => resExactDateFilter, set: value => { resExactDateFilter = value; } },
  setMobileChip: { get: () => setMobileChip },
  setResExactDateFilter: { get: () => setResExactDateFilter },
  sortAsc: { get: () => sortAsc, set: value => { sortAsc = value; } },
  sortCol: { get: () => sortCol, set: value => { sortCol = value; } },
  syncMobileChips: { get: () => syncMobileChips },
  updateReservasClearBtn: { get: () => updateReservasClearBtn },
});

let sortCol = AppModules.core.SS.get('res:sort', 'check_in');
let sortAsc = AppModules.core.SS.get('res:asc', true);
let reservasViewMode = AppModules.core.SS.get('res:view', 'card');
let reservasDetailOpen = false;
let reservasPeriodScope = AppModules.core.SS.get('res:period', 'operational');
if (!['operational', 'past'].includes(reservasPeriodScope)) reservasPeriodScope = 'operational';

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
  AppModules.reservas.renderTabela();
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
  el.innerHTML = `<div class="chip active" style="display:inline-flex;align-items:center;gap:6px;" data-on-click="reserva-lista-clear-res-exact-date-filter-a0fba32">${label} ✕</div>`;
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
  AppModules.reservas.renderTabela();
}

function syncMobileChips(filterValue) {
  // data-filter, não o onclick (inexistente desde a migração para
  // data-on-click — o match nunca acontecia e nenhum chip ficava ativo).
  document.querySelectorAll('.mobile-filter-chips .chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.filter === (filterValue || ''));
  });
}

// Filtro partilhado entre a tabela desktop e os cards mobile (fonte única).
function getFilteredReservas() {
  return AppModules.core.reservas;
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
        <div class="mrc-name">${AppModules.core.escapeHtml(r.guest_name)}</div>
        <div class="mrc-id">${AppModules.core.escapeHtml(r.id)} · ${AppModules.core.escapeHtml(r.accommodation_name)}</div>
      </div>
      ${AppModules.core.badgeEstado(r.status)}
    </div>`;
}

function renderResCardMeta(r) {
  return `<div class="mrc-meta">
      <div class="mrc-meta-item"><i data-lucide="calendar"></i> ${AppModules.core.formatDate(r.check_in)}</div>
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
      <span class="mrc-channel">${AppModules.core.escapeHtml(r.channel || '—')} · ${AppModules.core.badgePagamento(r.payment_status)}</span>
      <span class="mrc-price">€${total.toFixed(2)}${remHtml}</span>
    </div>`;
}

// O cartão inteiro já abre o detalhe (onclick em .m-res-card) — daí não
// haver botão "Ver". Fica só a ação secundária "Editar".
function renderResCardActions(r) {
  return `<div class="mrc-actions" data-on-click="reserva-lista-stop-propagation-22499e1">
      <button class="m-card-btn" ${AppActions.attrs("click", "reserva-lista-open-edit-modal-e85a518", [String((r.id) ?? '')])}>
        <i data-lucide="pencil"></i> Editar
      </button>
    </div>`;
}

function renderResCard(r) {
  const bc = STATUS_COLORS[r.status] || 'var(--marca)';
  return `<div class="m-res-card m-card" style="border-left-color:${bc}" ${AppActions.attrs("click", "reserva-lista-show-detail-3d67b14", [String((r.id) ?? '')])}>
    ${renderResCardHeader(r)}
    ${renderResCardMeta(r)}
    ${renderResCardTotal(r)}
    ${renderResCardActions(r)}
  </div>`;
}

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
    resExactDateFilter ||
    reservasPeriodScope !== 'operational'
  );
}

// "Limpar filtros" na barra só aparece quando há mesmo algum filtro ativo
// (pesquisa, estado, suite, canal, pagamento, datas ou atalho de data exata).
function updateReservasClearBtn() {
  const btn = document.getElementById('reservas-clear-filters');
  if (btn) btn.style.display = hasActiveReservasFilter() ? '' : 'none';
}


AppActions.register({
  "reserva-lista-stop-propagation-22499e1": (el, event, args) => { event.stopPropagation() },
  "reserva-lista-open-edit-modal-e85a518": (el, event, args) => { AppModules.reservas.openEditModal(args[0]) },
  "reserva-lista-clear-res-exact-date-filter-a0fba32": (el, event, args) => { clearResExactDateFilter();AppModules.reservas.renderTabela(); },
}, "click");

AppActions.register({
  "reserva-lista-show-detail-3d67b14": (el, event, args) => { AppModules.reservas.showDetail(args[0]) },
}, "click");

// Limpeza da funcionalidade ao sair ou trocar de organização.
AppModules.onReset('reserva-lista.js', () => {
  resExactDateFilter = null;
  reservasPeriodScope = 'operational';
  AppModules.core.SS.set('res:period', 'operational');
});

})();
