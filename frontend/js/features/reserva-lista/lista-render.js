function renderMobileCards() {
  const container = document.getElementById('mobile-res-cards');
  if (!container) return;

  const filtered = getFilteredReservas();
  updateReservasSummary(filtered.length, filtered.length === 1 ? 'reserva visível' : 'resultados visíveis');

  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="es-icon">📭</div><h3>Sem reservas</h3><p>Nenhuma reserva encontrada.</p></div>';
    return;
  }

  if (hasActiveReservasFilter()) {
    container.innerHTML = filtered.sort((a, b) => new Date(b.check_in) - new Date(a.check_in)).map(renderResCard).join('');
    if (window.lucide) lucide.createIcons();
    return;
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const upcoming = filtered.filter(r => r.check_out >= todayStr).sort((a, b) => new Date(a.check_in) - new Date(b.check_in));
  const past = filtered.filter(r => r.check_out < todayStr).sort((a, b) => new Date(b.check_out) - new Date(a.check_out));

  const expanded = reservasPastExpanded || upcoming.length === 0;
  const upcomingHtml = upcoming.length
    ? `<div class="m-res-section-label">Próximas · ativas</div>${upcoming.map(renderResCard).join('')}`
    : '';
  const pastHtml = past.length
    ? `<button type="button" class="m-res-past-toggle m-press" onclick="toggleReservasPastSection()">
        <span>Reservas passadas</span>
        <span class="m-res-past-count">${past.length}</span>
        <i data-lucide="chevron-down" class="m-res-past-chevron${expanded ? ' is-open' : ''}"></i>
      </button>
      <div class="m-res-past-list" style="display:${expanded ? 'grid' : 'none'}">${past.map(renderResCard).join('')}</div>`
    : '';

  container.innerHTML = upcomingHtml + pastHtml;
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
  // a lista pode ter sido medida com clientWidth=0 (estava oculta) — re-ajustar
  // as larguras agora que está visível
  if (list && reservasViewMode === 'list') requestAnimationFrame(applyReservasColWidths);
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
  reservasViewMode = mode === 'list' ? 'list' : 'card';
  SS.set('res:view', reservasViewMode);
  renderTabela();
  requestAnimationFrame(moveReservasViewPill);
}


async function loadReservas() {
  // Restore persisted filters
  const sv = (id, key) => { const el = document.getElementById(id); if (el && !el.value) el.value = SS.get(key, ''); };
  sv('search-input', 'res:q'); sv('filter-estado', 'res:fe'); sv('filter-suite', 'res:fs');
  sv('filter-canal', 'res:fc'); sv('filter-pagamento', 'res:fp');
  sv('filter-date-from', 'res:fd'); sv('filter-date-to', 'res:ft');
  AppUI.refreshDropdowns(document.getElementById('view-reservas'));
  // Cabeçalho da lista: ordem + larguras (auto-fit ao ecrã) + pegas + drag-reorder
  renderReservasHead();

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
  document.querySelectorAll('.sort-icon').forEach(el => { el.textContent = '↕'; el.style.opacity = '0.25'; });
  const icon = document.getElementById('sort-' + col);
  if (icon) { icon.textContent = sortAsc ? '↑' : '↓'; icon.style.opacity = '1'; }
  renderTabela();
}

function renderTabela() {
  const fe = document.getElementById('filter-estado')?.value || '';
  SS.set('res:q', document.getElementById('search-input')?.value || '');
  SS.set('res:fe', fe);
  SS.set('res:fs', document.getElementById('filter-suite')?.value || '');
  SS.set('res:fc', document.getElementById('filter-canal')?.value || '');
  SS.set('res:fp', document.getElementById('filter-pagamento')?.value || '');
  SS.set('res:fd', normalizeIsoDateValue(document.getElementById('filter-date-from')?.value || ''));
  SS.set('res:ft', normalizeIsoDateValue(document.getElementById('filter-date-to')?.value || ''));
  syncMobileChips(fe);
  updateReservasClearBtn();

  let data = getFilteredReservas().sort((a, b) => {
    let va = a[sortCol] ?? '';
    let vb = b[sortCol] ?? '';
    if (sortCol === 'check_in' || sortCol === 'check_out' || sortCol === 'created_at') {
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
  tbody.innerHTML = data.map(r =>
    `<tr onclick="showDetail('${r.id}')">${resColOrder.map(k => RES_CELL[k](r)).join('')}</tr>`
  ).join('');
  if (window.lucide) lucide.createIcons();
  applyReservasViewMode();
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
  reservasDetailOpen = isDetail;
  document.querySelectorAll('.view-toolbar-reservas, .reservas-filter-panel, #reservas-mobile, #reservas-desktop').forEach(el => {
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
  ['res:q', 'res:fe', 'res:fs', 'res:fc', 'res:fp', 'res:fd', 'res:ft', 'res:chip'].forEach(key => SS.set(key, ''));
  clearResExactDateFilter();
  AppUI.refreshDropdowns(document.getElementById('view-reservas'));
  renderTabela(); // renderTabela chama syncMobileChips com o valor limpo
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

// Reserva atualmente aberta na ficha (para confirmação de edição de valores, etc.)
let _rdv2Current = null;

