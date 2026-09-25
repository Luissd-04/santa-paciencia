// Estado privado; interface partilhada em AppModules.core.
(() => {
AppModules.define('core', {
  abrirHospede: { get: () => abrirHospede },
  abrirMensagensDaReserva: { get: () => abrirMensagensDaReserva },
  abrirReserva: { get: () => abrirReserva },
  cleanGcalDuplicates: { get: () => cleanGcalDuplicates },
  cleanGtasksDuplicates: { get: () => cleanGtasksDuplicates },
  closeSideDrawer: { get: () => closeSideDrawer },
  connectGcal: { get: () => connectGcal },
  connectGmail: { get: () => connectGmail },
  connectGoogleTasks: { get: () => connectGoogleTasks },
  disconnectGcal: { get: () => disconnectGcal },
  disconnectGmail: { get: () => disconnectGmail },
  disconnectGoogleTasks: { get: () => disconnectGoogleTasks },
  initApp: { get: () => initApp },
  loadAccommodations: { get: () => loadAccommodations },
  novaReserva: { get: () => novaReserva },
  quickActionNovaNotificacao: { get: () => quickActionNovaNotificacao },
  quickActionNovaReserva: { get: () => quickActionNovaReserva },
  quickActionNovoEvento: { get: () => quickActionNovoEvento },
  saveGcalSyncSettings: { get: () => saveGcalSyncSettings },
  showView: { get: () => showView },
  switchSettingsTab: { get: () => switchSettingsTab },
  syncAllGcal: { get: () => syncAllGcal },
  syncGoogleTasks: { get: () => syncGoogleTasks },
  testGmail: { get: () => testGmail },
  toggleQuickActionMenu: { get: () => toggleQuickActionMenu },
  toggleSidebar: { get: () => toggleSidebar },
  toggleSidebarCollapse: { get: () => toggleSidebarCollapse },
});

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
  definicoes: 'Definições',
  'hospede-detalhe': 'Ficha de Hóspede'
};

/* Dark mode removido — sempre light */

// Mostra a vista e, na primeira abertura, traz o código que a serve. A vista
// fica visível primeiro (o esqueleto já está no HTML) e só depois corre a
// inicialização, para que uma ligação lenta não deixe o ecrã parado.
async function showView(v, pushState = true) {
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
  // animation-fill-mode:forwards deixa o transform:translateY(0) colado
  // no fim da animação — isso torna a .view containing block de filhos
  // position:fixed (ex.: folhas .m-sheet), que ficam mal ancoradas se a
  // vista for mais alta que o ecrã. Remover a classe ao terminar a
  // animação larga o transform e evita o bug.
  nextView.addEventListener('animationend', () => {
    nextView.classList.remove('view-entering');
  }, { once: true });
  // x.dataset.view === v é sempre um booleano real: getAttribute('onclick')
  // já não existe desde a migração para data-on-click, e
  // classList.toggle('active', undefined) não remove a classe — alterna-a a
  // cada chamada, como se o segundo argumento não tivesse sido passado.
  // Isso acumulava "active" em quase todos os itens ao longo da sessão.
  document.querySelectorAll('.nav-item').forEach(x => {
    const active = x.dataset.view === v;
    x.classList.toggle('active', active);
    if (active) x.setAttribute('aria-current', 'page');
    else x.removeAttribute('aria-current');
  });
  document.querySelectorAll('.side-drawer-item[data-view]').forEach(x => {
    const active = x.dataset.view === v;
    if (active) x.setAttribute('aria-current', 'page');
    else x.removeAttribute('aria-current');
  });
  document.getElementById('topbar-title').textContent = VIEW_TITLES[v] || v;
  setActiveBN(v);
  document.body.classList.toggle('view-eventos-active', v === 'eventos');
  document.body.classList.toggle('view-calendario-active', v === 'calendario');
  document.body.classList.toggle('view-despesas-active', v === 'despesas');
  if (pushState) history.pushState({ view: v }, '', '/' + (v === 'dashboard' ? '' : v));
  if (window.lucide) lucide.createIcons();

  const feature = AppModules.core.VIEW_FEATURE[v];
  if (feature) {
    AppModules.core.clearFeatureLoadError(v);
    // Código e marcação trazem-se em paralelo — nenhum depende do outro para
    // ser pedido, só initView() precisa dos dois já prontos. A marcação é
    // pedida para a funcionalidade inteira (todas as suas vistas), não só a
    // que está a abrir: código desta funcionalidade pode mexer na marcação
    // de uma vista irmã sem passar por aqui (ex.: separadores dentro de uma
    // ficha de detalhe já aberta).
    const [featureOk, markupOk] = await Promise.all([
      AppModules.core.ensureFeature(feature),
      AppModules.core.ensureViewMarkup(feature),
    ]);
    if (!featureOk || !markupOk) {
      AppModules.core.showFeatureLoadError(v, feature || v, () => showView(v, false));
      return;
    }
    // Entretanto o utilizador pode ter mudado de vista: não inicializar uma
    // vista que já não está no ecrã.
    if (!document.getElementById('view-' + v)?.classList.contains('active')) return;
  }
  await initView(v);
}

// Arranque da vista, já com o código dela carregado.
async function initView(v) {
  if (v === 'dashboard') AppModules.core.renderDashboard();
  if (v === 'reservas') {
    if (typeof AppModules.reservas.clearResExactDateFilter === 'function') AppModules.reservas.clearResExactDateFilter();
    if (!AppModules.core.openingReservationDetail && typeof AppModules.reservas.showReservasList === 'function') AppModules.reservas.showReservasList();
    AppModules.reservas.loadReservas();
  }
  if (v === 'calendario') { await AppModules.bloqueios.ensureBlocksLoaded(); AppModules.calendario.renderCalView(); }
  if (v === 'eventos') AppModules.eventos.loadEventos();
  if (v === 'hospedes') AppModules.hospedes.loadHospedes();
  if (v === 'notificacoes') { AppModules.core.loadNotifications(); AppModules.core.renderNotificationsPage(); }
  if (v === 'alojamentos') { await AppModules.bloqueios.ensureBlocksLoaded(); AppModules.alojamentos.renderAlojamentos(); AppModules.alojamentos.initAlojDrag(); AppModules.alojamentos.renderServicos(); }
  if (v === 'despesas')   AppModules.despesas.loadDespesas();
  if (v === 'relatorios') AppModules.relatorios.loadRelatorios();
  if (v === 'invoice') AppModules.invoice.loadInvoiceView();
  else if (typeof AppModules.invoice._stopInvoicePoll === 'function') AppModules.invoice._stopInvoicePoll();
  if (v === 'vouchers') AppModules.vouchers.loadVouchers();
  if (v === 'precos') AppModules.precos.initPrecos();
  if (v === 'definicoes') renderSettingsView();
}

window.addEventListener('popstate', async (e) => {
  let v = e.state?.view || 'dashboard';
  if (v === 'gcal') { settingsTab = 'gcal'; v = 'definicoes'; }
  if (v === 'equipa') { settingsTab = 'equipa'; v = 'definicoes'; }
  if (v === 'emails') { settingsTab = 'emails'; v = 'definicoes'; }
  if (e.state?.reservaDetail && v === 'reservas') {
    AppModules.core.openingReservationDetail = true;
    try { await showView('reservas', false); } finally { AppModules.core.openingReservationDetail = false; }
    if (typeof AppModules.reservas.showDetail === 'function') AppModules.reservas.showDetail(e.state.reservaDetail, { fromHistory: true });
    return;
  }
  if (VIEW_TITLES[v]) showView(v, false);
});

// Deep-link: /reservas?reserva=<id> abre diretamente a ficha da reserva.
// Usado no boot (links de email) e nos cliques em notificações push.
async function handleDeepLinkUrl(raw) {
  const u = new URL(raw, window.location.origin);
  const view = u.pathname.replace(/^\/+|\/+$/g, '') || 'dashboard';
  const reservaId = u.searchParams.get('reserva');
  if (view === 'reservas' && reservaId) {
    if (await AppModules.core.ensureFeature('reservas')) { AppModules.reservas.showDetail(reservaId); return; }
  }
  showView(VIEW_TITLES[view] ? view : 'dashboard');
}

// ── ATALHOS ENTRE VISTAS ──
// Usados por vistas que não dependem do destino: o código de destino só chega
// quando o utilizador carrega no atalho.
// Abrir a ficha de uma reserva a partir do painel, de uma notificação ou de
// outra vista: a showDetail trata da navegação, só falta ter o módulo.
async function abrirReserva(reservationId) {
  await AppModules.core.featureAction('showDetail', reservationId);
}

// O assistente de reservas é uma sobreposição: abre sobre a vista atual, tal
// como fazia antes de haver carregamento por vista.
async function novaReserva() {
  await AppModules.core.featureAction('openModal');
}

async function abrirHospede(guestId) {
  await AppModules.core.featureAction('showHospedeDetail', guestId);
}

async function abrirMensagensDaReserva(reservationId, guestEmail, guestName) {
  await AppModules.core.featureAction('openInvoiceForReservation', reservationId, guestEmail, guestName);
}

// ── MOBILE BOTTOM NAV ──
const BOTTOM_NAV_VIEWS = ['dashboard', 'reservas', 'calendario', 'eventos', 'despesas'];
let sideDrawerPreviousFocus = null;

function setActiveBN(v) {
  BOTTOM_NAV_VIEWS.forEach(name => {
    const el = document.getElementById('bn-' + name);
    if (el) {
      const active = name === v;
      el.classList.toggle('active', active);
      if (active) el.setAttribute('aria-current', 'page');
      else el.removeAttribute('aria-current');
    }
  });
}

function openSideDrawer() {
  const drawer = document.getElementById('side-drawer');
  const trigger = document.getElementById('mobile-menu-trigger');
  sideDrawerPreviousFocus = document.activeElement;
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
  trigger?.setAttribute('aria-expanded', 'true');
  document.getElementById('side-drawer-overlay').classList.add('active');
  document.getElementById('app-layout').inert = true;
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => (drawer.querySelector('button:not([disabled])') || drawer).focus({ preventScroll: true }));
}

function closeSideDrawer() {
  const drawer = document.getElementById('side-drawer');
  drawer.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
  document.getElementById('mobile-menu-trigger')?.setAttribute('aria-expanded', 'false');
  document.getElementById('side-drawer-overlay').classList.remove('active');
  document.getElementById('app-layout').inert = false;
  document.body.style.overflow = '';
  if (sideDrawerPreviousFocus?.isConnected) sideDrawerPreviousFocus.focus({ preventScroll: true });
  sideDrawerPreviousFocus = null;
}

document.addEventListener('keydown', event => {
  const drawer = document.getElementById('side-drawer');
  if (!drawer?.classList.contains('open')) return;
  if (event.key === 'Escape') { event.preventDefault(); closeSideDrawer(); return; }
  if (event.key !== 'Tab') return;
  const items = Array.from(drawer.querySelectorAll('button:not([disabled]), [tabindex]:not([tabindex="-1"])'));
  if (!items.length) { event.preventDefault(); drawer.focus(); return; }
  const first = items[0], last = items.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});

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

async function quickActionNovaReserva() {
  closeQuickActionMenu();
  await showView('reservas');
  if (typeof AppModules.reservas.openModal === 'function') AppModules.reservas.openModal();
}

async function quickActionNovoEvento() {
  closeQuickActionMenu();
  await showView('eventos');
  if (typeof AppModules.eventos.openEventoModal === 'function') AppModules.eventos.openEventoModal();
}

async function quickActionNovaNotificacao() {
  closeQuickActionMenu();
  await showView('notificacoes');
  AppModules.core.openManualNotificationModal();
}

document.addEventListener('click', event => {
  if (!event.target.closest?.('.quick-action-wrap')) closeQuickActionMenu();
});

// ── SETTINGS ──
let settingsTab = AppModules.core.SS.get('settings:tab', 'gcal');

function switchSettingsTab(tab, render = true) {
  if (tab === 'equipa' && AppModules.core.currentUser?.role !== 'owner') tab = 'gcal';
  settingsTab = ['gcal', 'database', 'operations', 'emails', 'fornecedores', 'push', 'equipa'].includes(tab) ? tab : 'gcal';
  AppModules.core.SS.set('settings:tab', settingsTab);

  document.querySelectorAll('[data-settings-tab]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.settingsTab === settingsTab);
  });
  document.querySelectorAll('.settings-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === 'settings-' + settingsTab);
  });

  if (render) renderSettingsView();
}

function renderSettingsView() {
  if (settingsTab === 'equipa' && AppModules.core.currentUser?.role !== 'owner') settingsTab = 'gcal';
  switchSettingsTab(settingsTab, false);
  AppUI.enhanceSelects(document.getElementById('view-definicoes'));
  AppUI.refreshDropdowns(document.getElementById('view-definicoes'));
  if (settingsTab === 'gcal') { loadCalendarStatus(); loadGmailStatus(); loadGoogleTasksStatus(); }
  if (settingsTab === 'database') {
    if (typeof AppModules.core.initExportReminderControls === 'function') AppModules.core.initExportReminderControls();
  }
  if (settingsTab === 'operations' && typeof AppModules.core.loadAutoTaskSettings === 'function') AppModules.core.loadAutoTaskSettings();
  if (settingsTab === 'emails' && typeof AppModules.definicoes.loadEmailTemplates === 'function') AppModules.definicoes.loadEmailTemplates();
  if (settingsTab === 'fornecedores' && typeof AppModules.definicoes.loadFornecedores === 'function') AppModules.definicoes.loadFornecedores();
  if (settingsTab === 'push' && typeof AppModules.definicoes.initPushSettings === 'function') AppModules.definicoes.initPushSettings();
  if (settingsTab === 'equipa' && AppModules.core.currentUser?.role === 'owner') AppModules.definicoes.loadTeamOverview();
  if (window.lucide) lucide.createIcons();
}

// ── ACCOMMODATIONS ──
// Serviços e taxas (preço do pequeno-almoço, taxa turística) entram no cálculo
// de qualquer reserva, por isso são lidos no arranque e não com a vista de
// Alojamentos. O editor da tabela vive em features/alojamentos/.
async function loadServicos() {
  try {
    const res = await AppModules.core.apiGet('/api/accommodations/settings');
    AppModules.core.servicosData = res.data || AppModules.core.servicosData;
  } catch (e) { /* mantém os valores por omissão */ }
  if (typeof AppModules.alojamentos.renderServicos === 'function') AppModules.alojamentos.renderServicos();
}

async function loadAccommodations() {
  try {
    const data = await AppModules.core.apiGet('/api/accommodations');
    AppModules.core.accommodations = data.data || [];
    populateAccommodationSelects();
    AppUI.refreshDropdowns(document);
    // A vista de Alojamentos só é redesenhada se já tiver sido aberta.
    if (typeof AppModules.alojamentos.renderAlojamentos === 'function') { AppModules.alojamentos.renderAlojamentos(); AppModules.alojamentos.initAlojDrag(); }
  } catch (e) {
    AppModules.core.toast('❌ Erro ao carregar alojamentos.', 'error');
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
    AppModules.core.accommodations.forEach(a => {
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
    const res = await AppModules.core.apiGet('/auth/google-email/status');
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
  const popup = window.open(AppModules.core.API_BASE + '/auth/google-email', '_blank', 'width=600,height=700');
  AppModules.core.toast('📧 Janela de autorização aberta...', 'info');
  const poll = setInterval(async () => {
    if (!popup || popup.closed) {
      clearInterval(poll);
      await new Promise(r => setTimeout(r, 1000));
      await loadGmailStatus();
      AppModules.core.toast('📧 Gmail ligado!', 'success');
    }
  }, 500);
}

async function disconnectGmail() {
  try {
    const res = await fetch(AppModules.core.API_BASE + '/auth/google-email', { method: 'DELETE', credentials: 'include' });
    const data = await res.json();
    if (data.success) {
      AppModules.core.toast('📧 Gmail desligado.', 'info');
      await loadGmailStatus();
    } else {
      AppModules.core.toast('❌ Erro ao desligar Gmail.', 'error');
    }
  } catch {
    AppModules.core.toast('❌ Erro de ligação.', 'error');
  }
}

async function testGmail() {
  const btn = document.getElementById('gmail-test-btn');
  AppUI.setButtonLoading(btn, true, 'A enviar...');
  try {
    const res = await AppModules.core.apiPost('/auth/google-email/test', {});
    if (res.success) {
      AppModules.core.toast('✅ Email de teste enviado para a conta ligada.', 'success');
    } else {
      AppModules.core.toast('❌ ' + (res.error || 'Erro ao enviar.'), 'error');
      if (res.needs_reauth) await loadGmailStatus();
    }
  } catch (err) {
    const payload = err?.payload;
    AppModules.core.toast('❌ ' + (payload?.error || err?.message || 'Erro de ligação.'), 'error');
    if (payload?.needs_reauth) await loadGmailStatus();
  } finally {
    AppUI.setButtonLoading(btn, false);
  }
}

// ── GOOGLE TASKS ──
async function loadGoogleTasksStatus() {
  try {
    const [authRes, statsRes] = await Promise.all([
      AppModules.core.apiGet('/auth/google-tasks/status'),
      AppModules.core.apiGet('/api/tasks/status').catch(() => ({ data: {} })),
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
    if (el('gtasks-clean-btn'))      el('gtasks-clean-btn').style.display      = connected ? ''     : 'none';

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
  const popup = window.open(AppModules.core.API_BASE + '/auth/google-tasks', '_blank', 'width=600,height=700');
  AppModules.core.toast('✅ Janela de autorização aberta...', 'info');
  const poll = setInterval(async () => {
    if (!popup || popup.closed) {
      clearInterval(poll);
      await new Promise(r => setTimeout(r, 1000));
      await loadGoogleTasksStatus();
      AppModules.core.toast('✅ Google Tasks ligado!', 'success');
    }
  }, 500);
}

async function disconnectGoogleTasks() {
  try {
    const res = await fetch(AppModules.core.API_BASE + '/auth/google-tasks', { method: 'DELETE', credentials: 'include' });
    const data = await res.json();
    if (data.success) {
      AppModules.core.toast('Google Tasks desligado.', 'info');
      await loadGoogleTasksStatus();
    }
  } catch {
    AppModules.core.toast('❌ Erro ao desligar.', 'error');
  }
}

async function syncGoogleTasks() {
  const btn = document.getElementById('gtasks-sync-btn');
  AppUI.setButtonLoading(btn, true, 'A sincronizar...');
  try {
    const res = await AppModules.core.apiPost('/api/tasks/sync', {});
    if (res.success) {
      const d = res.data;
      AppModules.core.toast(`✅ Tasks sincronizadas: ${d.created} criadas, ${d.updated} atualizadas${d.errors ? ', ' + d.errors + ' erros' : ''}.`, 'success');
      await loadGoogleTasksStatus();
    } else {
      AppModules.core.toast('❌ ' + (res.error || 'Erro ao sincronizar.'), 'error');
    }
  } catch (e) {
    AppModules.core.toast('❌ ' + (e?.payload?.error || e?.message || 'Erro de ligação.'), 'error');
  } finally {
    AppUI.setButtonLoading(btn, false);
  }
}

// Remove tarefas duplicadas no Google Tasks (órfãos deixados pelo bug antigo de sincronização).
async function cleanGtasksDuplicates() {
  if (!confirm('Procurar e apagar tarefas DUPLICADAS no teu Google Tasks (criadas pela app)?\n\nMantém sempre uma cópia de cada.')) return;
  const btn = document.getElementById('gtasks-clean-btn');
  AppUI.setButtonLoading(btn, true, 'A limpar...');
  try {
    const res = await AppModules.core.apiPost('/api/tasks/clean-duplicates', {});
    if (res.success) {
      AppModules.core.toast(res.deleted > 0
        ? `✅ ${res.deleted} tarefa(s) duplicada(s) removida(s).`
        : '✅ Não foram encontradas duplicadas.', 'success');
      await loadGoogleTasksStatus();
    } else {
      AppModules.core.toast('❌ ' + (res.error || 'Erro ao limpar duplicados.'), 'error');
    }
  } catch (e) {
    AppModules.core.toast('❌ ' + (e?.payload?.error || 'Erro de ligação.'), 'error');
  } finally {
    AppUI.setButtonLoading(btn, false);
  }
}

// ── GOOGLE CALENDAR ──
async function loadCalendarStatus() {
  try {
    const [statusPayload, settingsPayload] = await Promise.all([
      AppModules.core.apiGet('/api/calendar/status'),
      AppModules.core.apiGet('/api/calendar/settings').catch(() => ({ data: {} })),
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

    const calToggle = el('gcal-sync-calendar-toggle');
    if (calToggle) calToggle.checked = s.syncCalendar ?? false;
    const tasksToggle = el('gcal-sync-tasks-toggle');
    if (tasksToggle) tasksToggle.checked = s.syncTasks ?? false;

    const tasksStat = el('gcal-tasks-stat');
    if (tasksStat) {
      if (s.syncCalendar && d.tasksInCalendar != null) {
        tasksStat.textContent = `${d.tasksInCalendar} eventos no Google Calendar`;
        tasksStat.style.display = '';
      } else {
        tasksStat.style.display = 'none';
      }
    }

    const connectBtn    = el('gcal-connect-btn');
    const disconnectBtn = el('gcal-disconnect-btn');
    const syncBtn       = el('gcal-sync-btn');
    const cleanBtn      = el('gcal-clean-btn');
    if (connectBtn)    connectBtn.style.display    = connected ? 'none'         : '';
    if (disconnectBtn) disconnectBtn.style.display = connected ? ''             : 'none';
    if (syncBtn)       syncBtn.style.display       = connected ? 'inline-flex'  : 'none';
    if (cleanBtn)      cleanBtn.style.display      = connected ? 'inline-flex'  : 'none';
  } catch (e) {}
}

async function saveGcalSyncSettings() {
  const calToggle = document.getElementById('gcal-sync-calendar-toggle');
  const tasksToggle = document.getElementById('gcal-sync-tasks-toggle');
  if (!calToggle && !tasksToggle) return;
  try {
    await AppModules.core.apiPost('/api/calendar/settings', {
      syncCalendar: calToggle ? calToggle.checked : undefined,
      syncTasks: tasksToggle ? tasksToggle.checked : undefined,
    });
    if ((calToggle && calToggle.checked) || (tasksToggle && tasksToggle.checked)) {
      await syncAllGcal();
    } else {
      await loadCalendarStatus();
    }
  } catch {
    AppModules.core.toast('❌ Erro ao guardar definição.', 'error');
  }
}

function connectGcal() {
  const popup = window.open(AppModules.core.API_BASE + '/auth/google', '_blank', 'width=600,height=700');
  AppModules.core.toast('🗓 Janela de autorização aberta...', 'info');
  const poll = setInterval(async () => {
    if (!popup || popup.closed) {
      clearInterval(poll);
      await new Promise(r => setTimeout(r, 1000));
      await loadCalendarStatus();
      AppModules.core.toast('🗓 Google Calendar ligado!', 'success');
    }
  }, 500);
}

async function disconnectGcal() {
  try {
    const res = await fetch(AppModules.core.API_BASE + '/auth/google', { method: 'DELETE', credentials: 'include' });
    const data = await res.json();
    if (data.success) {
      AppModules.core.toast('🗓 Google Calendar desligado.', 'info');
      await loadCalendarStatus();
    } else {
      AppModules.core.toast('❌ Erro ao desligar.', 'error');
    }
  } catch (e) {
    AppModules.core.toast('❌ Erro de ligação.', 'error');
  }
}

async function syncAllGcal() {
  const btn = document.getElementById('gcal-sync-btn');
  AppUI.setButtonLoading(btn, true, 'A sincronizar...');
  try {
    const res = await AppModules.core.apiPost('/api/calendar/sync-all', {});
    if (res.success) {
      const d = res.data;
      const taskInfo = d.syncTasks ? ` · Tarefas: ${d.taskCreated} criadas, ${d.taskUpdated} atualizadas${d.taskErrors ? ', ' + d.taskErrors + ' erros' : ''}` : '';
      const calInfo = d.calendarsCreated ? ` · ${d.calendarsCreated} calendário(s) de alojamento criado(s)` : '';
      AppModules.core.toast(`✅ Sincronização completa: ${d.created} criados, ${d.updated} atualizados${d.skipped ? ', ' + d.skipped + ' já ligados a outro membro' : ''}${d.errors ? ', ' + d.errors + ' erros' : ''}${calInfo}${taskInfo}.`, 'success');
      await loadCalendarStatus();
    } else {
      AppModules.core.toast('❌ ' + (res.error || 'Erro ao sincronizar.'), 'error');
    }
  } catch (e) {
    AppModules.core.toast('❌ Erro de ligação.', 'error');
  } finally {
    AppUI.setButtonLoading(btn, false);
  }
}

// Remove eventos duplicados no Google (órfãos deixados pelo bug antigo de sincronização).
async function cleanGcalDuplicates() {
  if (!confirm('Procurar e apagar eventos DUPLICADOS no teu Google Calendar (criados pela app)?\n\nMantém sempre uma cópia de cada. Não mexe nos teus eventos pessoais.')) return;
  const btn = document.getElementById('gcal-clean-btn');
  AppUI.setButtonLoading(btn, true, 'A limpar...');
  try {
    const res = await AppModules.core.apiPost('/api/calendar/clean-duplicates', {});
    if (res.success) {
      AppModules.core.toast(res.deleted > 0
        ? `✅ ${res.deleted} evento(s) duplicado(s) removido(s).`
        : '✅ Não foram encontrados duplicados.', 'success');
    } else {
      AppModules.core.toast('❌ ' + (res.error || 'Erro ao limpar duplicados.'), 'error');
    }
  } catch (e) {
    AppModules.core.toast('❌ ' + (e?.payload?.error || 'Erro de ligação.'), 'error');
  } finally {
    AppUI.setButtonLoading(btn, false);
  }
}

// ── INIT ──
let appEventsBound = false;
async function initApp() {
  if (!appEventsBound) {
  appEventsBound = true;
  const coverInput = document.getElementById('cover-input');
  if (coverInput) coverInput.addEventListener('change', function () {
    if (this.files[0]) AppModules.alojamentos.uploadCoverImage(this.files[0]);
    this.value = '';
  });
  // Os dois inputs de ficheiro vivem na ficha do alojamento: as funções que os
  // tratam só existem depois de a vista Alojamentos carregar, por isso são
  // resolvidas no momento da escolha e não aqui.
  const imgInput = document.getElementById('img-input');
  if (imgInput) imgInput.addEventListener('change', event => AppModules.alojamentos.handleImgSelect(event));

  }
  AppUI.enhanceSelects(document);
  await loadAccommodations();
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
  // Deep-link /reservas?reserva=<id>: limpar o estado ANTES do showView — após
  // F5 o history.state ainda traz `reservaDetail` e o showReservasList interno
  // faria history.back() indevido. A entrada base fica a lista.
  const deepId = new URLSearchParams(window.location.search).get('reserva');
  if (deepId && pathView === 'reservas') history.replaceState({ view: 'reservas' }, '', '/reservas');
  await showView(VIEW_TITLES[pathView] ? pathView : 'dashboard', false);
  if (deepId && pathView === 'reservas' && typeof AppModules.reservas.showDetail === 'function') AppModules.reservas.showDetail(deepId);
  if (window.AppDatePicker) {
    // Os campos type=date são ligados automaticamente (enhanceAll + observer no
    // date-picker.js); intervalos via data-dp-range-end e nascimentos via
    // data-dp-birthdate. Só falta o f-nascimento — input de texto com máscara.
    AppDatePicker.attach(document.getElementById('f-nascimento'), { isBirthDate: true });
    AppDatePicker.enhanceAll();
  }

  // Restore list filters that can't be recovered from URL alone.
  if (pathView === 'alojamentos' || pathView === 'reservas') {
    const sv = (id, key) => { const el = document.getElementById(id); if (el && !el.value) el.value = AppModules.core.SS.get(key, ''); };
    sv('aloj-search', 'aloj:q'); sv('aloj-filter-type', 'aloj:type'); sv('aloj-filter-link', 'aloj:link');
  }
}

document.documentElement.setAttribute('data-theme', 'light');
localStorage.removeItem('sp-theme');
AppModules.core.boot();

/* ── PWA: Service Worker — obrigatório para notificações push ──
   O SW usa network-first para assets locais, portanto JS/CSS ficam
   frescos após deploy; caches antigas são limpas no `activate` do SW. */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .catch(() => {});
  });
  // Navegação pedida pelo SW (clique numa notificação push com a app já aberta)
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'sp-navigate' && e.data.url) handleDeepLinkUrl(e.data.url);
  });
}

})();
