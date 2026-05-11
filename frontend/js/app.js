// ── NAVIGATION ──
const VIEW_TITLES = {
  dashboard:  'Dashboard',
  reservas:   'Reservas',
  calendario: 'Calendário',
  hospedes:   'Hóspedes',
  alojamentos:'Alojamentos & Serviços',
  despesas:   'Despesas',
  relatorios: 'Relatórios Financeiros',
  emails:     'Templates de Email',
  gcal:       'Google Calendar',
  equipa:     'Equipa'
};

const THEME_KEY = 'sp-theme';

function applyTheme(theme) {
  const resolved = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', resolved);
  const label = document.getElementById('theme-toggle-label');
  if (label) label.textContent = resolved === 'dark' ? 'Modo claro' : 'Modo escuro';
}

function getStoredTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === 'dark' || stored === 'light') return stored;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
  if (window.lucide) lucide.createIcons();
}

function showView(v, pushState = true) {
  document.querySelectorAll('.view').forEach(x => x.classList.remove('active', 'view-entering'));
  const nextView = document.getElementById('view-' + v);
  nextView.classList.add('active');
  void nextView.offsetWidth;
  nextView.classList.add('view-entering');
  document.querySelectorAll('.nav-item').forEach(x => {
    x.classList.toggle('active', x.getAttribute('onclick')?.includes("'" + v + "'"));
  });
  document.getElementById('topbar-title').textContent = VIEW_TITLES[v] || v;
  setActiveBN(v);
  if (pushState) history.pushState({ view: v }, '', '/' + (v === 'dashboard' ? '' : v));
  if (window.lucide) lucide.createIcons();
  if (v === 'dashboard') renderDashboard();
  if (v === 'reservas') loadReservas();
  if (v === 'calendario') loadReservas().then(() => renderCalView());
  if (v === 'hospedes') loadHospedes();
  if (v === 'alojamentos') { renderAlojamentos(); initAlojDrag(); loadServicos(); }
  if (v === 'despesas')   loadDespesas();
  if (v === 'relatorios') loadRelatorios();
  if (v === 'emails') loadEmailTemplates();
  if (v === 'gcal') loadCalendarStatus();
  if (v === 'equipa' && currentUser?.role === 'owner') loadTeamOverview();
}

window.addEventListener('popstate', (e) => {
  const v = e.state?.view || 'dashboard';
  if (VIEW_TITLES[v]) showView(v, false);
});

// ── MOBILE BOTTOM NAV ──
const BOTTOM_NAV_VIEWS = ['dashboard', 'reservas', 'calendario', 'hospedes'];

function setActiveBN(v) {
  BOTTOM_NAV_VIEWS.forEach(name => {
    const el = document.getElementById('bn-' + name);
    if (el) el.classList.toggle('active', name === v);
  });
  const mais = document.getElementById('bn-mais');
  if (mais) mais.classList.toggle('active', !BOTTOM_NAV_VIEWS.includes(v));
}

function openSideDrawer() {
  document.getElementById('side-drawer').classList.add('open');
  document.getElementById('side-drawer-overlay').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeSideDrawer() {
  document.getElementById('side-drawer').classList.remove('open');
  document.getElementById('side-drawer-overlay').classList.remove('active');
  document.body.style.overflow = '';
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
    const frag = document.createDocumentFragment();
    accommodations.forEach(a => {
      const opt = document.createElement('option');
      opt.value = a.id;
      opt.textContent = a.name;
      frag.appendChild(opt);
    });
    el.appendChild(frag);
  });
}

// ── SIDEBAR MOBILE ──
function toggleSidebar() {
  if (window.innerWidth <= 600) {
    openSideDrawer();
    return;
  }
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
    const res = await fetch(API_BASE + '/auth/google', { method: 'DELETE', credentials: 'include' });
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
  AppUI.setButtonLoading(btn, true, 'A sincronizar...');
  try {
    const res = await apiPost('/api/calendar/sync-all', {});
    if (res.success) {
      const d = res.data;
      toast(`✅ Sincronização completa: ${d.created} criados, ${d.updated} atualizados${d.skipped ? ', ' + d.skipped + ' já ligados a outro membro' : ''}${d.errors ? ', ' + d.errors + ' erros' : ''}.`, 'success');
      await loadCalendarStatus();
    } else {
      toast('❌ ' + (res.error || 'Erro ao sincronizar.'), 'error');
    }
  } catch (e) {
    toast('❌ Erro de ligação.', 'error');
  } finally {
    AppUI.setButtonLoading(btn, false);
  }
}

// ── INIT ──
async function initApp() {
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
  if (window.lucide) lucide.createIcons();
  if (localStorage.getItem('sbCollapsed') === '1') {
    document.querySelector('.layout').classList.add('sb-collapsed');
    const icon = document.querySelector('.sb-collapse-btn i[data-lucide]');
    if (icon) { icon.setAttribute('data-lucide', 'panel-left-open'); lucide.createIcons(); }
  }

  const pathView = window.location.pathname.replace(/^\/+|\/+$/g, '') || 'dashboard';
  showView(VIEW_TITLES[pathView] ? pathView : 'dashboard', false);
  if (window.AppDatePicker) {
    ['f-checkin','f-checkout','f-payment-date','despesa-date','filter-date-from','filter-date-to'].forEach(id => {
      AppDatePicker.attach(document.getElementById(id));
    });
    ['f-nascimento','gedit-birth-date'].forEach(id => {
      AppDatePicker.attach(document.getElementById(id), { isBirthDate: true });
    });
  }

  // Restore list filters that can't be recovered from URL alone.
  if (pathView === 'alojamentos' || pathView === 'reservas') {
    const sv = (id, key) => { const el = document.getElementById(id); if (el && !el.value) el.value = SS.get(key, ''); };
    sv('aloj-search', 'aloj:q'); sv('aloj-filter-type', 'aloj:type'); sv('aloj-filter-link', 'aloj:link');
  }
}

applyTheme(getStoredTheme());
boot();
