// ── NAVIGATION ──
const VIEW_TITLES = {
  dashboard: 'Dashboard',
  reservas: 'Reservas',
  calendario: 'Calendário',
  hospedes: 'Hóspedes',
  alojamentos: 'Alojamentos & Serviços',
  despesas: 'Despesas',
  emails: 'Templates de Email',
  gcal: 'Google Calendar'
};

function showView(v) {
  document.querySelectorAll('.view').forEach(x => x.classList.remove('active', 'view-entering'));
  const nextView = document.getElementById('view-' + v);
  nextView.classList.add('active');
  void nextView.offsetWidth;
  nextView.classList.add('view-entering');
  document.querySelectorAll('.nav-item').forEach(x => {
    x.classList.toggle('active', x.getAttribute('onclick')?.includes("'" + v + "'"));
  });
  document.getElementById('topbar-title').textContent = VIEW_TITLES[v] || v;
  if (window.lucide) lucide.createIcons();
  if (v === 'dashboard') renderDashboard();
  if (v === 'reservas') loadReservas();
  if (v === 'calendario') loadReservas().then(() => renderCalView());
  if (v === 'hospedes') loadHospedes();
  if (v === 'alojamentos') { renderAlojamentos(); initAlojDrag(); loadServicos(); }
  if (v === 'despesas') loadDespesas();
  if (v === 'emails') loadEmailTemplates();
  if (v === 'gcal') loadCalendarStatus();
}

// ── ACCOMMODATIONS ──
async function loadAccommodations() {
  try {
    const data = await apiGet('/api/accommodations');
    accommodations = data.data || [];
    populateAccommodationSelects();
    renderAlojamentos();
    initAlojDrag();
  } catch (e) {
    toast('❌ Erro ao carregar alojamentos.', 'error');
  }
}

function populateAccommodationSelects() {
  ['f-aloj', 'filter-suite', 'cal-suite-filter'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const isFilter = id !== 'f-aloj';
    el.innerHTML = isFilter ? '<option value="">Todas as suites</option>' : '';
    accommodations.forEach(a => {
      el.innerHTML += `<option value="${a.id}">${a.name}</option>`;
    });
  });
}

// ── SIDEBAR MOBILE ──
function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const open = sidebar.classList.toggle('sidebar-open');
  if (overlay) overlay.classList.toggle('active', open);
}

function toggleSidebarCollapse() {
  const layout = document.querySelector('.layout');
  const collapsed = layout.classList.toggle('sb-collapsed');
  localStorage.setItem('sbCollapsed', collapsed ? '1' : '0');
  const icon = document.querySelector('.sb-collapse-btn i[data-lucide]');
  if (icon) {
    icon.setAttribute('data-lucide', collapsed ? 'panel-left-open' : 'panel-left-close');
    if (window.lucide) lucide.createIcons();
  }
}

// ── GOOGLE CALENDAR ──
async function loadCalendarStatus() {
  try {
    const data = await apiGet('/api/calendar/status');
    const d = data?.data ?? data;
    const connected = d.connected ?? false;

    const badge = document.getElementById('gcal-badge');
    if (badge) badge.innerHTML = connected
      ? '<span class="dot dot-green"></span> Ligado'
      : '<span class="dot dot-red"></span> Desligado';

    const el = id => document.getElementById(id);
    if (el('sync-total'))   el('sync-total').textContent   = d.total      ?? 0;
    if (el('sync-ok'))      el('sync-ok').textContent      = d.inCalendar ?? 0;
    if (el('sync-removed')) el('sync-removed').textContent = d.removed    ?? 0;

    const connectBtn    = el('gcal-connect-btn');
    const disconnectBtn = el('gcal-disconnect-btn');
    const syncBtn       = el('gcal-sync-btn');
    if (connectBtn)    connectBtn.style.display    = connected ? 'none'         : '';
    if (disconnectBtn) disconnectBtn.style.display = connected ? ''             : 'none';
    if (syncBtn)       syncBtn.style.display       = connected ? 'inline-flex'  : 'none';
  } catch (e) {}
}

function connectGcal() {
  const popup = window.open(API_BASE + '/auth/google', '_blank', 'width=600,height=700');
  toast('🗓 Janela de autorização aberta...', 'info');
  const poll = setInterval(async () => {
    if (!popup || popup.closed) {
      clearInterval(poll);
      await new Promise(r => setTimeout(r, 1000));
      await loadCalendarStatus();
      toast('🗓 Google Calendar ligado!', 'success');
    }
  }, 500);
}

async function disconnectGcal() {
  try {
    const res = await fetch(API_BASE + '/auth/google', { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      toast('🗓 Google Calendar desligado.', 'info');
      await loadCalendarStatus();
    } else {
      toast('❌ Erro ao desligar.', 'error');
    }
  } catch (e) {
    toast('❌ Erro de ligação.', 'error');
  }
}

async function syncAllGcal() {
  const btn = document.getElementById('gcal-sync-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'A sincronizar…'; }
  try {
    const res = await apiPost('/api/calendar/sync-all', {});
    if (res.success) {
      const d = res.data;
      toast(`✅ Sincronização completa: ${d.created} criados, ${d.updated} atualizados${d.errors ? ', ' + d.errors + ' erros' : ''}.`, 'success');
      await loadCalendarStatus();
    } else {
      toast('❌ ' + (res.error || 'Erro ao sincronizar.'), 'error');
    }
  } catch (e) {
    toast('❌ Erro de ligação.', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = lcIcon('refresh-cw', 14) + ' Sincronizar tudo'; }
    if (window.lucide) lucide.createIcons();
  }
}

// ── INIT ──
async function init() {
  const coverInput = document.getElementById('cover-input');
  if (coverInput) coverInput.addEventListener('change', function () {
    if (this.files[0]) uploadCoverImage(this.files[0]);
    this.value = '';
  });
  const imgInput = document.getElementById('img-input');
  if (imgInput) imgInput.addEventListener('change', handleImgSelect);

  await loadAccommodations();
  await renderDashboard();
  loadCalendarStatus();
  loadServicos();
}

init().then(() => {
  if (window.lucide) lucide.createIcons();
  // Restore sidebar collapsed state
  if (localStorage.getItem('sbCollapsed') === '1') {
    document.querySelector('.layout').classList.add('sb-collapsed');
    const icon = document.querySelector('.sb-collapse-btn i[data-lucide]');
    if (icon) { icon.setAttribute('data-lucide', 'panel-left-open'); lucide.createIcons(); }
  }
});
