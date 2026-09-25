// Estado privado; interface partilhada em AppModules.reservas.
(() => {
AppModules.define('reservas', {
  _rdv2Current: { get: () => _rdv2Current, set: value => { _rdv2Current = value; } },
  applyReservasViewMode: { get: () => applyReservasViewMode },
  clearReservasFilters: { get: () => clearReservasFilters },
  loadReservas: { get: () => loadReservas },
  renderGuestsCell: { get: () => renderGuestsCell },
  renderMobileCards: { get: () => renderMobileCards },
  renderTabela: { get: () => renderTabela },
  setReservasPeriodScope: { get: () => setReservasPeriodScope },
  setReservasDetailMode: { get: () => setReservasDetailMode },
  setReservasViewMode: { get: () => setReservasViewMode },
  showReservasList: { get: () => showReservasList },
  sortTabela: { get: () => sortTabela },
  toggleReservasFiltersSheet: { get: () => toggleReservasFiltersSheet },
  updateReservasSummary: { get: () => updateReservasSummary },
});

function renderMobileCards() {
  const container = document.getElementById('mobile-res-cards');
  if (!container) return;

  const state = AppModules.reservas.reservasPaged.state;
  if (state.loading) { container.innerHTML = '<div class="loading">A carregar reservas…</div>'; return; }
  if (state.error) { container.innerHTML = '<div class="empty-state">Não foi possível carregar as reservas. Tenta novamente.</div>'; return; }
  const filtered = AppModules.reservas.getFilteredReservas();
  container.innerHTML = filtered.length ? filtered.map(AppModules.reservas.renderResCard).join('')
    : '<div class="empty-state"><div class="es-icon">📭</div><h3>Sem reservas</h3><p>Nenhuma reserva encontrada.</p></div>';
  if (window.lucide) lucide.createIcons();
}


function updateReservasViewToggle() {
  document.querySelectorAll('[data-res-view]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.resView === AppModules.reservas.reservasViewMode);
  });
  moveReservasViewPill();
}

function moveReservasViewPill() {
  const pill = document.getElementById('reservas-view-pill');
  const toggle = document.getElementById('reservas-view-toggle');
  if (!pill || !toggle) return;
  const activeBtn = toggle.querySelector(`.cal-mode-btn[data-res-view="${AppModules.reservas.reservasViewMode}"]`);
  if (!activeBtn) return;
  const toggleRect = toggle.getBoundingClientRect();
  const btnRect = activeBtn.getBoundingClientRect();
  pill.style.left = (btnRect.left - toggleRect.left) + 'px';
  pill.style.width = btnRect.width + 'px';
}

function applyReservasViewMode() {
  if (AppModules.reservas.reservasDetailOpen) return;
  const cards = document.getElementById('reservas-mobile');
  const list = document.getElementById('reservas-desktop');
  const mobile = window.matchMedia('(max-width: 600px), (max-height: 500px) and (orientation: landscape)').matches;
  const cardsVisible = mobile || AppModules.reservas.reservasViewMode === 'card';
  if (cards) cards.style.setProperty('display', cardsVisible ? 'block' : 'none', 'important');
  if (list) list.style.setProperty('display', cardsVisible ? 'none' : 'block', 'important');
  // a lista pode ter sido medida com clientWidth=0 (estava oculta) — re-ajustar
  // as larguras agora que está visível
  if (list && AppModules.reservas.reservasViewMode === 'list') requestAnimationFrame(AppModules.reservas.applyReservasColWidths);
  updateReservasViewToggle();
}

// No mobile, o painel de filtros (suite/canal/pagamento/datas) vira uma
// folha deslizante — mesmo mecanismo de #precos-side-panel (precos.js).
//
// #view-reservas fica com transform:translateY(0) preso (herdado da
// animação de entrada view-entering, que a showView() nunca remove
// enquanto a vista está ativa — ver app.js:34-39). Qualquer transform
// no ancestral, mesmo um "no-op" como translateY(0), vira o containing
// block de elementos position:fixed — a folha ficava fixa à vista
// (que é mais alta que o ecrã), não ao viewport, por isso abria fora
// de vista. m-sheet-ancestor-fix neutraliza isso enquanto a folha está aberta.
function toggleReservasFiltersSheet(open) {
  document.getElementById('reservas-filter-panel')?.classList.toggle('m-sheet-open', open);
  document.getElementById('reservas-filters-backdrop')?.classList.toggle('active', open);
  document.getElementById('view-reservas')?.classList.toggle('m-sheet-ancestor-fix', open);
}

function setReservasViewMode(mode) {
  AppModules.reservas.reservasViewMode = mode === 'list' ? 'list' : 'card';
  AppModules.core.SS.set('res:view', AppModules.reservas.reservasViewMode);
  renderTabela();
  requestAnimationFrame(moveReservasViewPill);
}


async function loadReservas() {
  // Restore persisted filters
  const sv = (id, key) => { const el = document.getElementById(id); if (el && !el.value) el.value = AppModules.core.SS.get(key, ''); };
  sv('search-input', 'res:q');
  const mobileSearch = document.getElementById('mobile-search-input');
  if (mobileSearch) mobileSearch.value = document.getElementById('search-input')?.value || '';
  sv('filter-estado', 'res:fe'); sv('filter-suite', 'res:fs');
  sv('filter-canal', 'res:fc'); sv('filter-pagamento', 'res:fp');
  sv('filter-date-from', 'res:fd'); sv('filter-date-to', 'res:ft');
  AppUI.refreshDropdowns(document.getElementById('view-reservas'));
  // Cabeçalho da lista: ordem + larguras (auto-fit ao ecrã) + pegas + drag-reorder
  AppModules.reservas.renderReservasHead();

  if (typeof AppModules.calendario.invalidateCalendarReservations === 'function') AppModules.calendario.invalidateCalendarReservations();
  if (window.PubSub) PubSub.emit('reservas:updated');
  await AppModules.reservas.reservasPaged.load(AppModules.reservas.getReservasQuery(), { force: true });
}

function sortTabela(col) {
  if (AppModules.reservas.sortCol === col) {
    AppModules.reservas.sortAsc = !AppModules.reservas.sortAsc;
  } else {
    AppModules.reservas.sortCol = col;
    AppModules.reservas.sortAsc = true;
  }
  AppModules.core.SS.set('res:sort', AppModules.reservas.sortCol);
  AppModules.core.SS.set('res:asc', AppModules.reservas.sortAsc);
  updateReservasSortIndicators();
  renderTabela();
}

function updateReservasSortIndicators() {
  document.querySelectorAll('.sort-icon').forEach(el => { el.textContent = '↕'; el.style.opacity = '0.25'; });
  const icon = document.getElementById('sort-' + AppModules.reservas.sortCol);
  if (icon) { icon.textContent = AppModules.reservas.sortAsc ? '↑' : '↓'; icon.style.opacity = '1'; }
}

function setReservasPeriodScope(scope) {
  if (!['operational', 'past'].includes(scope)) return;
  AppModules.reservas.reservasPeriodScope = scope;
  AppModules.core.SS.set('res:period', scope);
  for (const id of ['filter-date-from', 'filter-date-to']) {
    const input = document.getElementById(id);
    if (input) input.value = '';
  }
  AppModules.reservas.clearResExactDateFilter();
  AppModules.reservas.sortCol = scope === 'past' ? 'check_out' : 'check_in';
  AppModules.reservas.sortAsc = scope !== 'past';
  AppModules.core.SS.set('res:sort', AppModules.reservas.sortCol);
  AppModules.core.SS.set('res:asc', AppModules.reservas.sortAsc);
  updateReservasSortIndicators();
  AppModules.reservas.updateReservasPeriodUI(AppModules.reservas.reservasPaged.state.summary);
  renderTabela();
}

function renderTabela() {
  const fe = document.getElementById('filter-estado')?.value || '';
  AppModules.core.SS.set('res:q', document.getElementById('search-input')?.value || '');
  AppModules.core.SS.set('res:fe', fe);
  AppModules.core.SS.set('res:fs', document.getElementById('filter-suite')?.value || '');
  AppModules.core.SS.set('res:fc', document.getElementById('filter-canal')?.value || '');
  AppModules.core.SS.set('res:fp', document.getElementById('filter-pagamento')?.value || '');
  AppModules.core.SS.set('res:fd', AppModules.core.normalizeIsoDateValue(document.getElementById('filter-date-from')?.value || ''));
  AppModules.core.SS.set('res:ft', AppModules.core.normalizeIsoDateValue(document.getElementById('filter-date-to')?.value || ''));
  AppModules.reservas.syncMobileChips(fe);
  AppModules.reservas.updateReservasClearBtn();

  AppModules.reservas.reservasPaged.schedule(AppModules.reservas.getReservasQuery());
}

function renderGuestsCell(r) {
  const adults   = r.num_adults != null ? Number(r.num_adults) : Number(r.num_guests || 0);
  const children = Number(r.num_children || 0);
  const svg = (sz, col) =>
    `<svg width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="none" stroke="${col}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;flex-shrink:0"><circle cx="12" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/></svg>`;
  const parts = [];
  if (adults   > 0) parts.push(`<span style="display:inline-flex;align-items:center;gap:3px;font-size:12px;color:var(--azul)">${adults}${svg(13,'currentColor')}</span>`);
  if (children > 0) parts.push(`<span style="display:inline-flex;align-items:center;gap:3px;font-size:12px;color:var(--azul-claro)">${children}${svg(10,'currentColor')}</span>`);
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
  AppModules.reservas.reservasDetailOpen = isDetail;
  document.querySelectorAll('.view-toolbar-reservas, .reservas-filter-panel, #reservas-period-bar, #reservas-mobile, #reservas-desktop, #reservas-pagination').forEach(el => {
    el.style.setProperty('display', isDetail ? 'none' : '', isDetail ? 'important' : '');
  });
  const detailPage = document.getElementById('reserva-detail-page');
  if (detailPage) detailPage.style.display = isDetail ? 'block' : 'none';
  if (!isDetail) applyReservasViewMode();
}

function showReservasList() {
  // Detalhe aberto com entrada própria no history: voltar atrás — o popstate
  // volta a chamar esta função já sem `reservaDetail` e fecha via DOM.
  if (history.state?.reservaDetail) { history.back(); return; }
  setReservasDetailMode(false);
  AppUI.closeModal('detail-bg');
  if (window.innerWidth <= 600) renderMobileCards();
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
  ['res:q', 'res:fe', 'res:fs', 'res:fc', 'res:fp', 'res:fd', 'res:ft', 'res:chip'].forEach(key => AppModules.core.SS.set(key, ''));
  AppModules.reservas.clearResExactDateFilter();
  AppModules.reservas.reservasPeriodScope = 'operational';
  AppModules.core.SS.set('res:period', 'operational');
  AppModules.reservas.sortCol = 'check_in';
  AppModules.reservas.sortAsc = true;
  AppModules.core.SS.set('res:sort', 'check_in');
  AppModules.core.SS.set('res:asc', true);
  updateReservasSortIndicators();
  AppUI.refreshDropdowns(document.getElementById('view-reservas'));
  renderTabela(); // renderTabela chama syncMobileChips com o valor limpo
}

async function deleteReserva(id) {
  if (!confirm('Tem a certeza que quer eliminar esta reserva?')) return;
  try {
    const res = await AppModules.core.apiDelete(`/api/reservations/${id}`);
    if (res.success) {
      AppModules.core.toast('🗑 Reserva cancelada.', 'info');
      await loadReservas();
      if (typeof AppModules.calendario.renderCalView === 'function') AppModules.calendario.renderCalView();
      AppModules.core.renderDashboard();
    } else {
      AppModules.core.toast('❌ ' + (res.error || 'Erro ao cancelar.'), 'error');
    }
  } catch (e) {
    AppModules.core.toast('❌ Erro de ligação ao servidor.', 'error');
  }
}

// Reserva atualmente aberta na ficha (para confirmação de edição de valores, etc.)
let _rdv2Current = null;


// Limpeza da funcionalidade ao sair ou trocar de organização.
AppModules.onReset('features/reserva-lista/lista-render.js', () => {
  _rdv2Current = null;
});

})();
