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
  document.querySelectorAll('.view').forEach(x => x.classList.remove('active'));
  document.getElementById('view-' + v).classList.add('active');
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

// ── GOOGLE CALENDAR ──
async function loadCalendarStatus() {
  try {
    const data = await apiGet('/auth/google/status');
    const connected = data.connected ?? data?.data?.connected ?? false;
    const badge = document.getElementById('gcal-badge');
    const dot = connected ? '<span class="dot dot-green"></span>' : '<span class="dot dot-red"></span>';
    if (badge) badge.innerHTML = dot + ' ' + (connected ? 'Ligado' : 'Desligado');
    document.getElementById('sync-total').textContent = data.inCalendar ?? data?.data?.inCalendar ?? 0;
    document.getElementById('sync-ok').textContent = data.inCalendar ?? data?.data?.inCalendar ?? 0;
    document.getElementById('sync-removed').textContent = data.removed ?? data?.data?.removed ?? 0;
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
      toast('🗓 Estado do Google Calendar atualizado!', 'info');
    }
  }, 500);
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

init().then(() => { if (window.lucide) lucide.createIcons(); });
