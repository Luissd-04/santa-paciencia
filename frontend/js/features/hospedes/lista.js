// Estado privado; interface partilhada em AppModules.hospedes.
(() => {
AppModules.define('hospedes', {
  drawHospedes: { get: () => drawHospedes },
  loadHospedes: { get: () => loadHospedes },
  renderHospedes: { get: () => renderHospedes },
  setHospedesView: { get: () => setHospedesView },
  sortHospedes: { get: () => sortHospedes },
});

// ── LOAD ──
async function loadHospedes() {
  const searchEl = document.getElementById('hospedes-search');
  if (searchEl && !searchEl.value) searchEl.value = AppModules.core.SS.get('hsp:q', '');
  // Restore view mode UI
  document.getElementById('hvt-cards')?.classList.toggle('active', AppModules.hospedes.hospedesViewMode === 'cards');
  document.getElementById('hvt-lista')?.classList.toggle('active', AppModules.hospedes.hospedesViewMode === 'lista');
  document.getElementById('hospedes-cards-view') && (document.getElementById('hospedes-cards-view').style.display = AppModules.hospedes.hospedesViewMode === 'cards' ? '' : 'none');
  document.getElementById('hospedes-lista-view') && (document.getElementById('hospedes-lista-view').style.display = AppModules.hospedes.hospedesViewMode === 'lista' ? '' : 'none');

  await AppModules.hospedes.hospedesPaged.load(AppModules.hospedes.getHospedesQuery(), { force: true });
}

function setHospedesView(mode) {
  AppModules.hospedes.hospedesViewMode = mode;
  AppModules.core.SS.set('hsp:mode', mode);
  document.getElementById('hvt-cards').classList.toggle('active', mode === 'cards');
  document.getElementById('hvt-lista').classList.toggle('active', mode === 'lista');
  document.getElementById('hospedes-cards-view').style.display = mode === 'cards' ? '' : 'none';
  document.getElementById('hospedes-lista-view').style.display = mode === 'lista' ? '' : 'none';
  renderHospedes();
}

function renderHospedes() {
  AppModules.core.SS.set('hsp:q', document.getElementById('hospedes-search')?.value || '');
  AppModules.hospedes.hospedesPaged.schedule(AppModules.hospedes.getHospedesQuery());
}

function drawHospedes() {
  if (!document.getElementById('hospedes-cards-grid')) return;
  const state = AppModules.hospedes.hospedesPaged.state;
  updateHospedesSummary();
  renderHospedesCards();
  renderHospedesList();
  if (state.loading || state.error) {
    document.getElementById('hospedes-cards-grid').innerHTML = '';
    document.getElementById('hospedes-lista-body').innerHTML = '';
    document.getElementById('hospedes-empty').style.display = 'none';
    document.getElementById('hospedes-lista-empty').style.display = 'none';
  }
  document.getElementById('hospedes-loading').style.display = state.loading ? 'flex' : 'none';
  AppModules.core.renderPagination('hospedes-pagination', state, page => AppModules.hospedes.hospedesPaged.load(AppModules.hospedes.getHospedesQuery(), { page, force: true }));
}

function updateHospedesSummary() {
  const summary = AppModules.hospedes.hospedesPaged.state.summary;
  for (const [id, key] of [['hospedes-total', 'total'], ['hospedes-vip', 'vip'], ['hospedes-repeat', 'repeat']]) {
    const el = document.getElementById(id);
    if (el) el.textContent = AppModules.hospedes.hospedesPaged.state.loading ? '…' : String(summary[key] || 0);
  }
}

function filteredHospedes() { return AppModules.hospedes.hospedes; }

// ── CARDS VIEW ──
function renderHospedesCards() {
  const loading = document.getElementById('hospedes-loading');
  const grid = document.getElementById('hospedes-cards-grid');
  const empty = document.getElementById('hospedes-empty');
  loading.style.display = 'none';

  const data = filteredHospedes();
  if (data.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  grid.innerHTML = data.map(g => `
    <div class="hospede-card" ${AppActions.attrs("click", "lista-show-hospede-detail-4ac247d", [String((g.id) ?? '')])} title="Ver detalhes do hóspede">
      <div class="hospede-card-top">
        ${AppModules.hospedes.flagImg(g, 72)}
      </div>
      <div class="hospede-name">${AppModules.core.escapeHtml(g.name)}</div>
      ${g.company ? `<div class="hospede-info-row" style="margin-top:-4px;"><span style="font-size:12px;color:var(--cinza);">${AppModules.core.escapeHtml(g.company)}</span></div>` : ''}
      <div class="hospede-info-row">
        ${AppModules.core.lcIcon('briefcase', 14)}
        <span>${g.reservation_count || 0} reserva${g.reservation_count !== 1 ? 's' : ''}</span>
        ${g.last_check_in ? `<span class="hospede-dot">·</span><span>${AppModules.hospedes.formatShortDate(g.last_check_in)}</span>` : ''}
      </div>
      ${g.phone ? `<div class="hospede-info-row">${AppModules.core.lcIcon('smartphone', 14)} <span>${AppModules.core.escapeHtml(g.phone)}</span></div>` : ''}
      ${AppModules.core.realEmail(g.email) ? `<div class="hospede-info-row">${AppModules.core.lcIcon('mail', 14)} <span class="hospede-email">${AppModules.core.escapeHtml(AppModules.core.realEmail(g.email))}</span></div>` : (g.email_personal ? `<div class="hospede-info-row">${AppModules.core.lcIcon('mail', 14)} <span class="hospede-email">${AppModules.core.escapeHtml(g.email_personal)}</span></div>` : '')}
      ${(g.country || g.nationality) ? `<div class="hospede-info-row">${AppModules.core.lcIcon('map-pin', 14)} <span>${AppModules.core.escapeHtml(g.country || g.nationality)}</span></div>` : ''}
      ${AppModules.hospedes.guestTagsHtml(g)}
    </div>
  `).join('');
  if (window.lucide) lucide.createIcons();
}

// ── LIST VIEW ──
function sortHospedes(col) {
  if (AppModules.hospedes.hospedesSortCol === col) {
    AppModules.hospedes.hospedesSortAsc = !AppModules.hospedes.hospedesSortAsc;
  } else {
    AppModules.hospedes.hospedesSortCol = col;
    AppModules.hospedes.hospedesSortAsc = true;
  }
  AppModules.core.SS.set('hsp:sort', AppModules.hospedes.hospedesSortCol);
  AppModules.core.SS.set('hsp:asc', AppModules.hospedes.hospedesSortAsc);
  document.querySelectorAll('[id^="hsort-"]').forEach(el => el.textContent = '');
  const icon = document.getElementById('hsort-' + col);
  if (icon) icon.textContent = AppModules.hospedes.hospedesSortAsc ? '↑' : '↓';
  renderHospedes();
}

function renderHospedesList() {
  const data = filteredHospedes();

  const tbody = document.getElementById('hospedes-lista-body');
  const empty = document.getElementById('hospedes-lista-empty');

  if (data.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  tbody.innerHTML = data.map(g => `
    <tr ${AppActions.attrs("click", "lista-show-hospede-detail-4ac247d", [String((g.id) ?? '')])} style="cursor:pointer;">
      <td>
        <div style="display:flex;align-items:center;gap:10px;">
          ${AppModules.hospedes.flagImg(g, 32)}
          <div>
            <b>${AppModules.core.escapeHtml(g.name)}</b>
            <div style="display:inline-flex;gap:4px;margin-left:6px;">${AppModules.hospedes.guestTagsHtml(g)}</div>
          </div>
        </div>
      </td>
      <td style="font-size:12.5px;color:var(--cinza);">${AppModules.core.escapeHtml(AppModules.core.realEmail(g.email) || g.email_personal || '—')}</td>
      <td style="font-size:12.5px;">${AppModules.core.escapeHtml(g.phone || '—')}</td>
      <td style="font-size:12.5px;">${AppModules.core.escapeHtml(g.country || g.nationality || '—')}</td>
      <td style="text-align:center;"><b>${g.reservation_count || 0}</b></td>
      <td style="font-size:12.5px;">${g.last_check_in ? AppModules.core.formatDate(g.last_check_in) : '—'}</td>
      <td data-on-click="lista-stop-propagation-22499e1" style="white-space:nowrap;">
        <button class="btn btn-ghost btn-sm" ${AppActions.attrs("click", "lista-open-guest-edit-742bde2", [String((g.id) ?? '')])} title="Editar">
          ${AppModules.core.lcIcon('pencil', 13)}
        </button>
        <button class="btn btn-sm" style="background:rgba(176,48,48,.1);color:var(--vermelho)" ${AppActions.attrs("click", "lista-delete-guest-d1593cb", [String((g.id) ?? ''), String((g.name) ?? '')])} title="Remover">
          ${AppModules.core.lcIcon('trash-2', 13)}
        </button>
      </td>
    </tr>
  `).join('');
  if (window.lucide) lucide.createIcons();
}


AppActions.register({
  "lista-show-hospede-detail-4ac247d": (el, event, args) => { AppModules.hospedes.showHospedeDetail(args[0]) },
  "lista-stop-propagation-22499e1": (el, event, args) => { event.stopPropagation() },
  "lista-open-guest-edit-742bde2": (el, event, args) => { AppModules.hospedes.openGuestEdit(args[0]) },
  "lista-delete-guest-d1593cb": (el, event, args) => { AppModules.hospedes.deleteGuest(args[0],args[1]) },
}, "click");

AppActions.register({
  
}, "click");

})();
