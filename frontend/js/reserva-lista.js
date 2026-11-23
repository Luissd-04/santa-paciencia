// Estado privado; interface partilhada em AppModules.reservas.
(() => {
AppModules.define('reservas', {
  clearResExactDateFilter: { get: () => clearResExactDateFilter },
  clearResIdFilter: { get: () => clearResIdFilter },
  getFilteredReservas: { get: () => getFilteredReservas },
  filterValues: { get: () => filterValues },
  hasControlFilters: { get: () => hasControlFilters },
  resAllActive: { get: () => resAllActive, set: value => { resAllActive = Boolean(value); } },
  setFilterValues: { get: () => setFilterValues },
  resIdFilter: { get: () => resIdFilter },
  showOnly: { get: () => showOnly },
  preCheckinUrl: { get: () => preCheckinUrl },
  renderResCard: { get: () => renderResCard },
  reservasDetailOpen: { get: () => reservasDetailOpen, set: value => { reservasDetailOpen = value; } },
  applyViewDefault: { get: () => scope => {
    if (!['operational', 'past'].includes(scope)) return;
    reservasPeriodScope = scope;
    AppModules.core.SS.set('res:period', scope);
    // Mesma ordenação que ao escolher o período à mão (setReservasPeriodScope).
    sortCol = scope === 'past' ? 'check_out' : 'check_in';
    sortAsc = scope !== 'past';
    AppModules.core.SS.set('res:sort', sortCol);
    AppModules.core.SS.set('res:asc', sortAsc);
  } },
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

// Conjunto explícito de reservas (atalhos «Precisa de atenção» do Painel).
// Enquanto ativo, a lista pede só esses IDs (todo o histórico) e os restantes
// filtros ficam repostos; mexer em qualquer filtro ou mudar de vista limpa-o.
let resIdFilter = null; // { ids: string[], label: string } | null

function renderResIdFilterChip() {
  const el = document.getElementById('res-ids-filter-chip');
  if (!el) return;
  if (!resIdFilter) { el.style.display = 'none'; el.innerHTML = ''; return; }
  const esc = AppModules.core.escapeHtml;
  const n = resIdFilter.ids.length;
  el.style.display = 'block';
  el.innerHTML = `<div class="chip active" role="button" tabindex="0" ${AppModules.core.KEY_ACTIVATE} aria-label="Remover filtro" style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;" ${AppActions.attrs('click', 'reserva-lista-clear-res-id-filter-5c1d7e2', [])}>A mostrar ${n} reserva${n === 1 ? '' : 's'}: ${esc(resIdFilter.label)} ✕</div>`;
}

function clearResIdFilter() {
  if (!resIdFilter) return;
  resIdFilter = null;
  renderResIdFilterChip();
}

function showOnly(ids, label) {
  const list = [...new Set((ids || []).map(String))];
  AppModules.reservas.clearReservasFilters(); // repõe filtros (limpa também o conjunto anterior)
  resIdFilter = { ids: list, label: label || 'Selecção' };
  renderResIdFilterChip();
  AppModules.reservas.renderTabela();
}

// Filtros da lista que aceitam vários valores (<select multiple>).
const MULTI_FILTERS = ['filter-estado', 'filter-suite', 'filter-canal', 'filter-pagamento', 'filter-precheckin'];

// Valores escolhidos num filtro múltiplo (lista vazia = sem filtro).
function filterValues(id) {
  return AppUI.selectedValues(document.getElementById(id));
}

function setFilterValues(id, values) {
  const select = document.getElementById(id);
  if (select) AppUI.setSelectedValues(select, values);
}

// «Por receber» do Painel: pagamento pendente + parcial em todas as datas, sem canceladas.
let resAllActive = false;

// Há algum filtro escolhido nos controlos (pesquisa, estado, alojamento, canal,
// pagamento, pré-check-in, datas ou data exata)?
function hasControlFilters() {
  const value = id => document.getElementById(id)?.value || '';
  return Boolean(['search-input', 'mobile-search-input', 'filter-date-from', 'filter-date-to'].some(value)
    || MULTI_FILTERS.some(id => filterValues(id).length) || resExactDateFilter);
}

// Os chips mobile são apenas UI sobre o filtro filter-estado — fonte única
// de verdade. «Todas» limpa; os outros ligam/desligam o estado (vários possíveis).
function setMobileChip(el, filter) {
  const chosen = filterValues('filter-estado');
  setFilterValues('filter-estado', !filter ? [] : chosen.includes(filter) ? chosen.filter(v => v !== filter) : [...chosen, filter]);
  clearResExactDateFilter();
  clearResIdFilter();
  AppModules.reservas.renderTabela();
}

function syncMobileChips(values = []) {
  // data-filter, não o onclick (inexistente desde a migração para
  // data-on-click — o match nunca acontecia e nenhum chip ficava ativo).
  const chosen = Array.isArray(values) ? values : (values ? [values] : []);
  document.querySelectorAll('.mobile-filter-chips .chip').forEach(chip => {
    const filter = chip.dataset.filter || '';
    chip.classList.toggle('active', filter ? chosen.includes(filter) : !chosen.length);
  });
}

// Filtro partilhado entre a tabela desktop e os cards mobile (fonte única).
function getFilteredReservas() {
  return AppModules.core.reservas;
}


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
    ? `<span style="font-size:11px;color:var(--vermelho);display:block;">falta ${ReservationMoney.format(rem)}</span>`
    : '';
  return `<div class="mrc-total">
      <span class="mrc-channel">${AppModules.core.escapeHtml(AppModules.core.channelLabel(r.channel) || '—')} · ${AppModules.core.badgePagamento(r.payment_status)} · ${AppModules.core.badgePrecheckin(r.precheckin_state)}</span>
      <span class="mrc-price">${ReservationMoney.format(total)}${remHtml}</span>
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
  const bc = window.ReservationStatus.color(r.status);
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
    MULTI_FILTERS.some(id => filterValues(id).length) ||
    document.getElementById('filter-date-from')?.value ||
    document.getElementById('filter-date-to')?.value ||
    resExactDateFilter ||
    resIdFilter ||
    resAllActive ||
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
  "reserva-lista-clear-res-id-filter-5c1d7e2": () => { clearResIdFilter(); AppModules.reservas.renderTabela(); },
}, "click");

AppActions.register({
  "reserva-lista-show-detail-3d67b14": (el, event, args) => { AppModules.reservas.showDetail(args[0]) },
}, "click");

// Limpeza da funcionalidade ao sair ou trocar de organização.
AppModules.onReset('reserva-lista.js', () => {
  resExactDateFilter = null;
  resAllActive = false;
  reservasPeriodScope = 'operational';
  AppModules.core.SS.set('res:period', 'operational');
});

})();
