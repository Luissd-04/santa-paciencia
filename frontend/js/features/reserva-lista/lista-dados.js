// Estado privado; interface partilhada em AppModules.reservas.
(() => {
AppModules.define('reservas', {
  getEffectiveReservasPeriod: { get: () => getEffectiveReservasPeriod },
  getReservasQuery: { get: () => getReservasQuery },
  reservasPaged: { get: () => reservasPaged },
  reservasTodayIso: { get: () => reservasTodayIso },
  searchReservas: { get: () => searchReservas },
  updateReservasPeriodUI: { get: () => updateReservasPeriodUI },
});

function reservasTodayIso() {
  const now = new Date();
  const pad = value => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// A pesquisa e as canceladas devem encontrar registos em todo o histórico.
// Datas explícitas também prevalecem sobre o seletor de período para evitar
// combinações silenciosamente impossíveis (por exemplo, "passadas" + amanhã).
function getEffectiveReservasPeriod() {
  const value = id => document.getElementById(id)?.value || '';
  const today = reservasTodayIso();
  if (value('search-input') || value('mobile-search-input') || value('filter-estado') === 'cancelada') return 'all';
  const exact = AppModules.reservas.resExactDateFilter;
  if (exact?.date) return exact.date < today ? 'past' : 'operational';
  const from = AppModules.core.normalizeIsoDateValue(value('filter-date-from'));
  const to = AppModules.core.normalizeIsoDateValue(value('filter-date-to'));
  if (from || to) {
    if (to && to < today) return 'past';
    if (from && from >= today) return 'operational';
    return 'all';
  }
  return AppModules.reservas.reservasPeriodScope;
}

function updateReservasPeriodUI(summary = {}) {
  const effective = getEffectiveReservasPeriod();
  const selected = AppModules.reservas.reservasPeriodScope;
  const overridden = effective === 'all';
  document.querySelectorAll('[data-res-period]').forEach(button => {
    const active = !overridden && button.dataset.resPeriod === selected;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  const operationalCount = document.getElementById('reservas-period-operational-count');
  const pastCount = document.getElementById('reservas-period-past-count');
  if (operationalCount) operationalCount.textContent = summary.operational ?? '—';
  if (pastCount) pastCount.textContent = summary.past ?? '—';

  const search = document.getElementById('search-input')?.value || document.getElementById('mobile-search-input')?.value || '';
  const status = document.getElementById('filter-estado')?.value || '';
  const hasDates = Boolean(AppModules.reservas.resExactDateFilter || document.getElementById('filter-date-from')?.value || document.getElementById('filter-date-to')?.value);
  let text = selected === 'past'
    ? 'Histórico, das mais recentes para as mais antigas'
    : 'Inclui estadias em curso e reservas futuras';
  if (search) text = 'A pesquisa abrange todo o histórico';
  else if (status === 'cancelada') text = 'As canceladas abrangem todas as datas';
  else if (hasDates && effective === 'all') text = 'O intervalo escolhido abrange todo o histórico';
  else if (hasDates) text = effective === 'past' ? 'A mostrar o período passado escolhido' : 'A mostrar o período atual ou futuro escolhido';
  const context = document.getElementById('reservas-period-context');
  if (context) context.textContent = text;
}

function searchReservas(input) {
  for (const id of ['search-input', 'mobile-search-input']) {
    const other = document.getElementById(id);
    if (other && other !== input) other.value = input.value;
  }
  AppModules.reservas.renderTabela();
}

function getReservasQuery() {
  const value = id => document.getElementById(id)?.value || '';
  const query = {
    search: value('search-input') || value('mobile-search-input'),
    status: value('filter-estado'), accommodation_id: value('filter-suite'),
    channel: value('filter-canal'), payment_status: value('filter-pagamento'),
    from: AppModules.core.normalizeIsoDateValue(value('filter-date-from')), to: AppModules.core.normalizeIsoDateValue(value('filter-date-to')),
    scope: getEffectiveReservasPeriod(), today: reservasTodayIso(),
    sort: AppModules.reservas.sortCol, direction: AppModules.reservas.sortAsc ? 'asc' : 'desc',
  };
  if (AppModules.reservas.resExactDateFilter) query[AppModules.reservas.resExactDateFilter.field] = AppModules.reservas.resExactDateFilter.date;
  return Object.fromEntries(Object.entries(query).filter(([, value]) => value !== ''));
}

const reservasPaged = AppModules.core.createPagedCollection('/api/reservations', state => {
  AppModules.core.reservas = state.rows;
  drawReservasPage();
});

function drawReservasPage() {
  const state = reservasPaged.state;
  const body = document.getElementById('tabela-body');
  if (!body) return;
  const loading = document.getElementById('tabela-loading');
  const empty = document.getElementById('tabela-empty');
  loading.style.display = state.loading ? 'flex' : 'none';
  empty.style.display = !state.loading && !state.error && !state.rows.length ? 'block' : 'none';
  body.innerHTML = state.loading || state.error ? '' : state.rows.map(r =>
    `<tr ${AppActions.attrs("click", "lista-dados-show-detail-3d67b14", [String((r.id) ?? '')])}>${AppModules.reservas.resColOrder.map(k => AppModules.reservas.RES_CELL[k](r)).join('')}</tr>`
  ).join('');
  AppModules.reservas.renderMobileCards();
  const scope = getEffectiveReservasPeriod();
  const detail = scope === 'operational' ? 'em curso ou próximas'
    : scope === 'past' ? 'reservas passadas'
      : 'resultados em todo o histórico';
  AppModules.reservas.updateReservasSummary(state.total, detail);
  updateReservasPeriodUI(state.summary);
  AppModules.core.renderPagination('reservas-pagination', state, page => reservasPaged.load(getReservasQuery(), { page, force: true }));
  if (window.lucide) lucide.createIcons();
  AppModules.reservas.applyReservasViewMode();
}

AppActions.register({
  "lista-dados-show-detail-3d67b14": (el, event, args) => { AppModules.reservas.showDetail(args[0]) },
}, "click");

// Limpeza da funcionalidade ao sair ou trocar de organização.
AppModules.onReset('features/reserva-lista/lista-dados.js', () => {
  reservasPaged.reset();
});

})();
