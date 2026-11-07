// Notificações na V2: a página da maqueta. Filtros (Todas, Por ler, Reservas,
// Pagamentos, Tarefas, Sistema) e «Marcar todas como lidas»; a lista agrupada
// por quando cada aviso apareceu (Hoje, Ontem, Esta semana, Antes), com o
// ponto de «por ler», a hora relativa e as ações de cada aviso; ao lado (ecrã
// grande), o resumo recolhível com urgentes, por ler e os avisos no telemóvel.
// O estado lido/por ler vem do servidor (services/notificationState). Carregado
// com a vista; na V1 a lista do núcleo (notifications.js) fica como estava.
(() => {
AppModules.define('notificacoes', {
  renderPage: { get: () => renderPage },
});

// [chave, etiqueta, ícone, tom, tipos]
const GROUPS = [
  ['reservas', 'Reservas', 'calendar-check', 'info', ['checkin_today', 'checkout_today', 'checkin_tomorrow', 'pending']],
  ['pagamentos', 'Pagamentos', 'credit-card', 'warn', ['unpaid', 'payment_review']],
  ['tarefas', 'Tarefas', 'list-checks', 'violet', ['important_task']],
  ['sistema', 'Sistema', 'settings', 'bad', []],
];
const SIDE_KEY = 'sp-notif-resumo';
let filter = '';
let sideClosed = (() => { try { return localStorage.getItem(SIDE_KEY) === 'fechado'; } catch { return false; } })();
let current = [];

const isV2 = () => Boolean(document.documentElement?.dataset?.look);
const groupOf = n => (GROUPS.find(([, , , , types]) => types.includes(n.type)) || GROUPS[GROUPS.length - 1]);

function shown(list) {
  if (filter === 'por-ler') return list.filter(n => !n.read);
  if (filter) return list.filter(n => groupOf(n)[0] === filter);
  return list;
}

// «há 5 min», «há 2 h», «ontem», «qui», «12 out».
function whenLabel(iso) {
  const then = new Date(iso);
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const today = window.ReservationDates.localIso(new Date());
  const day = window.ReservationDates.localIso(then);
  if (day === today) return `há ${Math.round(minutes / 60)} h`;
  if (day === window.ReservationDates.addDays(today, -1)) return 'ontem';
  if (day >= window.ReservationDates.addDays(today, -6)) return then.toLocaleDateString('pt-PT', { weekday: 'short' }).replace('.', '');
  return then.toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' }).replace('.', '');
}

function sectionOf(iso) {
  const today = window.ReservationDates.localIso(new Date());
  const day = window.ReservationDates.localIso(new Date(iso));
  if (day === today) return 'Hoje';
  if (day === window.ReservationDates.addDays(today, -1)) return 'Ontem';
  if (day >= window.ReservationDates.addDays(today, -6)) return 'Esta semana';
  return 'Antes';
}

function itemHtml(n) {
  const core = AppModules.core;
  const esc = core.escapeHtml;
  const [, , icon, tone] = groupOf(n);
  return `<div class="nv2-item${n.read ? '' : ' is-unread'}" ${AppActions.attrs('click', 'notificacoes-v2-ler', [n.key])}>
      <span class="nv2-dot" aria-label="${n.read ? '' : 'Por ler'}"></span>
      <span class="nv2-ic ${tone}">${core.lcIcon(n.icon || icon, 16)}</span>
      <span class="nv2-text"><b>${esc(n.title)}</b><small>${esc(n.subtitle || '')}</small></span>
      <span class="nv2-when">${whenLabel(n.first_seen_at)}</span>
      <span class="nv2-actions">${core.notifActionsHtml(n)}</span>
    </div>`;
}

function renderToolbar(list) {
  const box = document.getElementById('notif-v2-toolbar');
  if (!box) return;
  const unread = list.filter(n => !n.read).length;
  const chips = [['', 'Todas', list.length], ['por-ler', 'Por ler', unread],
    ...GROUPS.map(([key, label]) => [key, label, list.filter(n => groupOf(n)[0] === key).length])];
  box.innerHTML = `<div class="nv2-chips" role="group" aria-label="Filtrar notificações">${chips
    .filter(([key, , count]) => !key || count || key === filter)
    .map(([key, label, count]) => `<button type="button" class="nv2-chip${key === filter ? ' is-on' : ''}" aria-pressed="${key === filter}" ${AppActions.attrs('click', 'notificacoes-v2-filtro', [key])}>${label}${key && count ? ` <em>${count}</em>` : ''}</button>`)
    .join('')}</div>
    <button type="button" class="btn btn-ghost btn-sm nv2-read-all" ${unread ? '' : 'disabled'} ${AppActions.attrs('click', 'notificacoes-v2-ler-todas')}>${AppModules.core.lcIcon('check-check', 15)} Marcar todas como lidas</button>`;
}

function renderSide(list) {
  document.getElementById('notifications-page-shell')?.classList.toggle('notif-side-closed', sideClosed);
  const toggle = document.getElementById('notif-side-toggle');
  if (toggle) {
    toggle.setAttribute('aria-pressed', String(!sideClosed));
    toggle.title = sideClosed ? 'Mostrar o resumo' : 'Recolher o resumo';
  }
  const box = document.getElementById('notifications-side-summary');
  if (!box) return;
  const urgent = list.filter(n => n.priority === 'high').length;
  const unread = list.filter(n => !n.read).length;
  box.innerHTML = `<div class="nv2-stats"><div><strong class="is-bad">${urgent}</strong><span>${urgent === 1 ? 'urgente' : 'urgentes'}</span></div>
    <div><strong>${unread}</strong><span>por ler</span></div></div>
    ${GROUPS.map(([key, label, icon, tone]) => [label, icon, tone, list.filter(n => groupOf(n)[0] === key).length])
      .filter(([, , , count]) => count)
      .map(([label, icon, tone, count]) => `<div class="nv2-side-row"><span class="nv2-ic ${tone}">${AppModules.core.lcIcon(icon, 14)}</span><span>${label}</span><b>${count}</b></div>`).join('')}`;
}

function renderPage(list) {
  if (!isV2()) return false;
  // Avisos criados no próprio browser (lembrete de exportação, …) não passam
  // pelo servidor: ficam por ler e com a hora de agora.
  for (const n of list) {
    n.key ??= [n.type, n.export_key || n.reservation_id || '', n.title].join('|');
    n.first_seen_at ??= new Date().toISOString();
    n.read ??= false;
  }
  current = list;
  renderToolbar(list);
  renderSide(list);
  const box = document.getElementById('notifications-page-list');
  if (!box) return true;
  const items = shown(list).slice().sort((a, b) => b.first_seen_at.localeCompare(a.first_seen_at) || (a.priority === 'high' ? -1 : 1));
  if (!items.length) {
    box.innerHTML = AppModules.core.emptyStateHtml('🔔', filter ? 'Nada aqui' : 'Sem notificações', filter ? 'Nenhuma notificação com este filtro.' : 'Não há alertas operacionais neste momento.');
    return true;
  }
  const sections = new Map();
  for (const n of items) {
    const name = sectionOf(n.first_seen_at);
    if (!sections.has(name)) sections.set(name, []);
    sections.get(name).push(n);
  }
  box.innerHTML = [...sections].map(([name, rows]) => `<section class="nv2-section"><h4>${name}</h4>${rows.map(itemHtml).join('')}</section>`).join('');
  if (window.lucide) lucide.createIcons();
  return true;
}

async function markRead(payload) {
  const keys = payload.all ? current.filter(n => !n.read).map(n => n.key) : payload.keys;
  if (!keys.length) return;
  for (const n of current) if (keys.includes(n.key)) n.read = true;
  AppModules.core.renderNotificationsPage();
  try {
    await AppModules.core.apiPost('/api/reservations/notifications/read', payload);
  } catch {
    // Fica marcado no ecrã; o próximo carregamento traz o estado do servidor.
  }
  AppModules.core.loadNotifications();
}

async function openPushSettings() {
  await AppModules.core.showView('definicoes');
  AppModules.core.switchSettingsTab('push');
}

AppActions.register({
  'notificacoes-v2-filtro': (el, event, args) => { filter = args[0]; AppModules.core.renderNotificationsPage() },
  // Tocar num aviso (ou numa das suas ações) marca-o como lido.
  'notificacoes-v2-ler': (el, event, args) => { const n = current.find(item => item.key === args[0]); if (n && !n.read) markRead({ keys: [n.key] }) },
  'notificacoes-v2-ler-todas': () => { markRead({ all: true }) },
  'notifications-toggle-side': () => {
    sideClosed = !sideClosed;
    try { localStorage.setItem(SIDE_KEY, sideClosed ? 'fechado' : 'aberto'); } catch { /* Vale só nesta página. */ }
    AppModules.core.renderNotificationsPage();
  },
  'notifications-open-push-settings': () => { openPushSettings() },
}, 'click');

})();
