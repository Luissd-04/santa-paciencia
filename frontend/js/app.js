// ── NAVIGATION ──
const VIEW_TITLES = {
  dashboard:  'Dashboard',
  reservas:   'Reservas',
  calendario: 'Calendário',
  eventos:    'Eventos',
  hospedes:   'Hóspedes',
  notificacoes:'Notificações',
  alojamentos:'Alojamentos & Serviços',
  invoice:    'Mensagens',
  despesas:   'Despesas',
  relatorios: 'Relatórios Financeiros',
  vouchers:   'Vouchers',
  precos:     'Preços Dinâmicos',
  definicoes: 'Definições'
};

/* Dark mode removido — sempre light */

function showView(v, pushState = true) {
  if (v === 'gcal') {
    switchSettingsTab('gcal', false);
    v = 'definicoes';
  }
  if (v === 'equipa') {
    switchSettingsTab('equipa', false);
    v = 'definicoes';
  }
  if (v === 'emails') {
    switchSettingsTab('emails', false);
    v = 'definicoes';
  }
  document.querySelectorAll('.view').forEach(x => x.classList.remove('active', 'view-entering'));
  const nextView = document.getElementById('view-' + v);
  if (!nextView) return;
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
  if (v === 'reservas') {
    if (!window.__openingReservationDetail && typeof showReservasList === 'function') showReservasList();
    loadReservas();
  }
  if (v === 'calendario') loadReservas().then(() => renderCalView());
  if (v === 'eventos') loadEventos();
  if (v === 'hospedes') loadHospedes();
  if (v === 'notificacoes') { loadNotifications(); renderNotificationsPage(); }
  if (v === 'alojamentos') { renderAlojamentos(); initAlojDrag(); loadServicos(); }
  if (v === 'despesas')   loadDespesas();
  if (v === 'relatorios') loadRelatorios();
  if (v === 'invoice') loadInvoiceView();
  else if (typeof _stopInvoicePoll === 'function') _stopInvoicePoll();
  if (v === 'vouchers') loadVouchers();
  if (v === 'precos') initPrecos();
  if (v === 'definicoes') renderSettingsView();
}

window.addEventListener('popstate', (e) => {
  let v = e.state?.view || 'dashboard';
  if (v === 'gcal') { settingsTab = 'gcal'; v = 'definicoes'; }
  if (v === 'equipa') { settingsTab = 'equipa'; v = 'definicoes'; }
  if (v === 'emails') { settingsTab = 'emails'; v = 'definicoes'; }
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

function toggleQuickActionMenu(event) {
  event.stopPropagation();
  const menu = document.getElementById('quick-action-menu');
  if (!menu) return;
  menu.style.display = menu.style.display === 'none' || !menu.style.display ? 'block' : 'none';
  if (window.lucide) lucide.createIcons();
}

function closeQuickActionMenu() {
  const menu = document.getElementById('quick-action-menu');
  if (menu) menu.style.display = 'none';
}

function quickActionNovaReserva() {
  closeQuickActionMenu();
  showView('reservas');
  setTimeout(() => openModal(), 100);
}

function quickActionNovoEvento() {
  closeQuickActionMenu();
  showView('eventos');
  setTimeout(() => openEventoModal(), 100);
}

function quickActionNovaNotificacao() {
  closeQuickActionMenu();
  showView('notificacoes');
  setTimeout(() => openManualNotificationModal(), 100);
}

document.addEventListener('click', event => {
  if (!event.target.closest?.('.quick-action-wrap')) closeQuickActionMenu();
});

// ── SETTINGS ──
let settingsTab = SS.get('settings:tab', 'gcal');

function switchSettingsTab(tab, render = true) {
  if (tab === 'equipa' && currentUser?.role !== 'owner') tab = 'gcal';
  settingsTab = ['gcal', 'database', 'operations', 'emails', 'fornecedores', 'equipa'].includes(tab) ? tab : 'gcal';
  SS.set('settings:tab', settingsTab);

  document.querySelectorAll('[data-settings-tab]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.settingsTab === settingsTab);
  });
  document.querySelectorAll('.settings-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === 'settings-' + settingsTab);
  });

  if (render) renderSettingsView();
}

function renderSettingsView() {
  if (settingsTab === 'equipa' && currentUser?.role !== 'owner') settingsTab = 'gcal';
  switchSettingsTab(settingsTab, false);
  AppUI.enhanceSelects(document.getElementById('view-definicoes'));
  AppUI.refreshDropdowns(document.getElementById('view-definicoes'));
  if (settingsTab === 'gcal') { loadCalendarStatus(); loadGmailStatus(); loadGoogleTasksStatus(); }
  if (settingsTab === 'database') {
    if (!reservas?.length) loadReservas();
    if (!hospedes?.length) loadHospedes();
    if (typeof initExportReminderControls === 'function') initExportReminderControls();
  }
  if (settingsTab === 'operations' && typeof loadAutoTaskSettings === 'function') loadAutoTaskSettings();
  if (settingsTab === 'emails' && typeof loadEmailTemplates === 'function') loadEmailTemplates();
  if (settingsTab === 'fornecedores' && typeof loadFornecedores === 'function') loadFornecedores();
  if (settingsTab === 'equipa' && currentUser?.role === 'owner') loadTeamOverview();
  if (window.lucide) lucide.createIcons();
}

// ── ACCOMMODATIONS ──
async function loadAccommodations() {
  try {
    const data = await apiGet('/api/accommodations');
    accommodations = data.data || [];
    populateAccommodationSelects();
    AppUI.refreshDropdowns(document);
    renderAlojamentos();
    initAlojDrag();
  } catch (e) {
    toast('❌ Erro ao carregar alojamentos.', 'error');
  }
}

function populateAccommodationSelects() {
  ['f-aloj', 'filter-suite', 'cal-suite-filter', 'eventos-list-acc-filter', 'evento-accommodation'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const isFilter = id !== 'f-aloj' && id !== 'evento-accommodation';
    el.innerHTML = isFilter
      ? `<option value="">${id === 'eventos-list-acc-filter' ? 'Todos os alojamentos' : 'Todas as suites'}</option>`
      : (id === 'evento-accommodation' ? '<option value="">Sem alojamento</option>' : '');
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

// ── GMAIL ──
async function loadGmailStatus() {
  try {
    const res = await apiGet('/auth/google-email/status');
    const d = res?.data ?? res;
    const connected = d.connected ?? false;
    const email = d.email || '';

    const badge = document.getElementById('gmail-badge');
    if (badge) badge.innerHTML = connected
      ? `<span class="dot dot-green"></span> Ligado${email ? ' — ' + email : ''}`
      : '<span class="dot dot-red"></span> Desligado';

    const connectBtn    = document.getElementById('gmail-connect-btn');
    const disconnectBtn = document.getElementById('gmail-disconnect-btn');
    const testBtn       = document.getElementById('gmail-test-btn');
    if (connectBtn)    connectBtn.style.display    = connected ? 'none' : '';
    if (disconnectBtn) disconnectBtn.style.display = connected ? ''     : 'none';
    if (testBtn)       testBtn.style.display       = connected ? ''     : 'none';
  } catch (e) {}
}

function connectGmail() {
  const popup = window.open(API_BASE + '/auth/google-email', '_blank', 'width=600,height=700');
  toast('📧 Janela de autorização aberta...', 'info');
  const poll = setInterval(async () => {
    if (!popup || popup.closed) {
      clearInterval(poll);
      await new Promise(r => setTimeout(r, 1000));
      await loadGmailStatus();
      toast('📧 Gmail ligado!', 'success');
    }
  }, 500);
}

async function disconnectGmail() {
  try {
    const res = await fetch(API_BASE + '/auth/google-email', { method: 'DELETE', credentials: 'include' });
    const data = await res.json();
    if (data.success) {
      toast('📧 Gmail desligado.', 'info');
      await loadGmailStatus();
    } else {
      toast('❌ Erro ao desligar Gmail.', 'error');
    }
  } catch {
    toast('❌ Erro de ligação.', 'error');
  }
}

async function testGmail() {
  const btn = document.getElementById('gmail-test-btn');
  AppUI.setButtonLoading(btn, true, 'A enviar...');
  try {
    const res = await apiPost('/auth/google-email/test', {});
    if (res.success) {
      toast('✅ Email de teste enviado para a conta ligada.', 'success');
    } else {
      toast('❌ ' + (res.error || 'Erro ao enviar.'), 'error');
      if (res.needs_reauth) await loadGmailStatus();
    }
  } catch (err) {
    const payload = err?.payload;
    toast('❌ ' + (payload?.error || err?.message || 'Erro de ligação.'), 'error');
    if (payload?.needs_reauth) await loadGmailStatus();
  } finally {
    AppUI.setButtonLoading(btn, false);
  }
}

// ── GOOGLE TASKS ──
async function loadGoogleTasksStatus() {
  try {
    const [authRes, statsRes] = await Promise.all([
      apiGet('/auth/google-tasks/status'),
      apiGet('/api/tasks/status').catch(() => ({ data: {} })),
    ]);
    const info  = authRes?.data  ?? authRes;
    const stats = statsRes?.data ?? {};
    const connected = info.connected ?? false;

    const badge = document.getElementById('gtasks-badge');
    if (badge) badge.innerHTML = connected
      ? `<span class="dot dot-green"></span> Ligado${info.email ? ' — ' + info.email : ''}`
      : '<span class="dot dot-red"></span> Desligado';

    const el = id => document.getElementById(id);
    if (el('gtasks-connect-btn'))    el('gtasks-connect-btn').style.display    = connected ? 'none' : '';
    if (el('gtasks-disconnect-btn')) el('gtasks-disconnect-btn').style.display = connected ? ''     : 'none';
    if (el('gtasks-sync-btn'))       el('gtasks-sync-btn').style.display       = connected ? ''     : 'none';

    const statsRow = el('gtasks-stats-row');
    if (statsRow) {
      statsRow.style.display = connected ? '' : 'none';
      if (connected) {
        if (el('gtasks-synced'))  el('gtasks-synced').textContent  = stats.synced  ?? 0;
        if (el('gtasks-pending')) el('gtasks-pending').textContent = stats.pending ?? 0;
      }
    }
  } catch (e) {}
}

function connectGoogleTasks() {
  const popup = window.open(API_BASE + '/auth/google-tasks', '_blank', 'width=600,height=700');
  toast('✅ Janela de autorização aberta...', 'info');
  const poll = setInterval(async () => {
    if (!popup || popup.closed) {
      clearInterval(poll);
      await new Promise(r => setTimeout(r, 1000));
      await loadGoogleTasksStatus();
      toast('✅ Google Tasks ligado!', 'success');
    }
  }, 500);
}

async function disconnectGoogleTasks() {
  try {
    const res = await fetch(API_BASE + '/auth/google-tasks', { method: 'DELETE', credentials: 'include' });
    const data = await res.json();
    if (data.success) {
      toast('Google Tasks desligado.', 'info');
      await loadGoogleTasksStatus();
    }
  } catch {
    toast('❌ Erro ao desligar.', 'error');
  }
}

async function syncGoogleTasks() {
  const btn = document.getElementById('gtasks-sync-btn');
  AppUI.setButtonLoading(btn, true, 'A sincronizar...');
  try {
    const res = await apiPost('/api/tasks/sync', {});
    if (res.success) {
      const d = res.data;
      toast(`✅ Tasks sincronizadas: ${d.created} criadas, ${d.updated} atualizadas${d.errors ? ', ' + d.errors + ' erros' : ''}.`, 'success');
      await loadGoogleTasksStatus();
    } else {
      toast('❌ ' + (res.error || 'Erro ao sincronizar.'), 'error');
    }
  } catch (e) {
    toast('❌ ' + (e?.payload?.error || e?.message || 'Erro de ligação.'), 'error');
  } finally {
    AppUI.setButtonLoading(btn, false);
  }
}

// ── GOOGLE CALENDAR ──
async function loadCalendarStatus() {
  try {
    const [statusPayload, settingsPayload] = await Promise.all([
      apiGet('/api/calendar/status'),
      apiGet('/api/calendar/settings').catch(() => ({ data: {} })),
    ]);
    const d = statusPayload?.data ?? statusPayload;
    const s = settingsPayload?.data ?? {};
    const connected = d.connected ?? false;

    const badge = document.getElementById('gcal-badge');
    if (badge) badge.innerHTML = connected
      ? '<span class="dot dot-green"></span> Ligado'
      : '<span class="dot dot-red"></span> Desligado';

    const el = id => document.getElementById(id);
    if (el('sync-total'))   el('sync-total').textContent   = d.total      ?? 0;
    if (el('sync-ok'))      el('sync-ok').textContent      = d.inCalendar ?? 0;
    if (el('sync-removed')) el('sync-removed').textContent = d.removed    ?? 0;

    const toggle = el('gcal-sync-tasks-toggle');
    if (toggle) toggle.checked = s.syncTasks ?? false;

    const tasksStat = el('gcal-tasks-stat');
    if (tasksStat) {
      if (s.syncTasks && d.tasksInCalendar != null) {
        tasksStat.textContent = `${d.tasksInCalendar} tarefas no Google Calendar`;
        tasksStat.style.display = '';
      } else {
        tasksStat.style.display = 'none';
      }
    }

    const connectBtn    = el('gcal-connect-btn');
    const disconnectBtn = el('gcal-disconnect-btn');
    const syncBtn       = el('gcal-sync-btn');
    if (connectBtn)    connectBtn.style.display    = connected ? 'none'         : '';
    if (disconnectBtn) disconnectBtn.style.display = connected ? ''             : 'none';
    if (syncBtn)       syncBtn.style.display       = connected ? 'inline-flex'  : 'none';
  } catch (e) {}
}

async function saveGcalSyncTasksSetting() {
  const toggle = document.getElementById('gcal-sync-tasks-toggle');
  if (!toggle) return;
  try {
    await apiPost('/api/calendar/settings', { syncTasks: toggle.checked });
    if (toggle.checked) {
      await syncAllGcal();
    } else {
      await loadCalendarStatus();
    }
  } catch {
    toast('❌ Erro ao guardar definição.', 'error');
  }
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
      const taskInfo = d.syncTasks ? ` · Tarefas: ${d.taskCreated} criadas, ${d.taskUpdated} atualizadas${d.taskErrors ? ', ' + d.taskErrors + ' erros' : ''}` : '';
      toast(`✅ Sincronização completa: ${d.created} criados, ${d.updated} atualizados${d.skipped ? ', ' + d.skipped + ' já ligados a outro membro' : ''}${d.errors ? ', ' + d.errors + ' erros' : ''}${taskInfo}.`, 'success');
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

  AppUI.enhanceSelects(document);
  await loadAccommodations();
  if (typeof loadBlocks === 'function') loadBlocks();
  await renderDashboard();
  loadCalendarStatus();
  loadServicos();
  if (window.lucide) lucide.createIcons();
  if (localStorage.getItem('sbCollapsed') === '1') {
    document.querySelector('.layout').classList.add('sb-collapsed');
    const icon = document.querySelector('.sb-collapse-btn i[data-lucide]');
    if (icon) { icon.setAttribute('data-lucide', 'panel-left-open'); lucide.createIcons(); }
  }

  let pathView = window.location.pathname.replace(/^\/+|\/+$/g, '') || 'dashboard';
  if (pathView === 'gcal') { settingsTab = 'gcal'; pathView = 'definicoes'; }
  if (pathView === 'equipa') { settingsTab = 'equipa'; pathView = 'definicoes'; }
  showView(VIEW_TITLES[pathView] ? pathView : 'dashboard', false);
  if (window.AppDatePicker) {
    ['f-checkin','f-checkout','f-payment-date','despesa-date','evento-date','manual-notification-date','filter-date-from','filter-date-to'].forEach(id => {
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

document.documentElement.setAttribute('data-theme', 'light');
localStorage.removeItem('sp-theme');
boot();

/* ── PWA: Service Worker — desregistar tudo + limpar caches antigas ──
   Mesmo após unregister, browsers podem manter caches de antigos SWs. Sem
   limpar `caches`, o user mantém JS/CSS obsoleto após um deploy.
*/
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(r => r.unregister());
  }).catch(() => {});
}
if ('caches' in window) {
  caches.keys().then(keys => {
    keys.filter(k => k.startsWith('sp-')).forEach(k => caches.delete(k));
  }).catch(() => {});
}

/* ── PWA: Service Worker (comentado em dev) ──
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .catch(() => {});
  });
}
*/
