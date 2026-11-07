// Notificações (V2): resumo ao lado da lista no ecrã grande. Carregado com a
// vista (features.js), para não pesar no arranque; a lista é do núcleo
// (notifications.js), que chama renderSide/filter quando este módulo existe.
(() => {
AppModules.define('notificacoes', {
  filter: { get: () => filterNotifications },
  renderSide: { get: () => renderNotificationsSide },
});

// Contagens por grupo; tocar num grupo filtra a lista. O botão da barra
// recolhe o painel para o lado e a escolha fica guardada neste aparelho.
// Na V1 o painel não aparece (operations.css) e a lista mostra tudo.
const NOTIF_GROUPS = [
  ['estadias', 'Chegadas e saídas', 'log-in', ['checkin_today', 'checkout_today', 'checkin_tomorrow']],
  ['pedidos', 'Pedidos', 'clock', ['pending']],
  ['pagamentos', 'Pagamentos', 'circle-alert', ['unpaid', 'payment_review']],
  ['tarefas', 'Tarefas', 'sparkles', ['important_task']],
  ['envios', 'Emails e avisos', 'mail', ['email_review', 'notice_failed']],
  ['outras', 'Outras', 'bell', []],
];
const NOTIF_SIDE_KEY = 'sp-notif-resumo';
let notifSideFilter = '';
let notifSideClosed = (() => { try { return localStorage.getItem(NOTIF_SIDE_KEY) === 'fechado'; } catch { return false; } })();

function notifGroup(n) {
  return (NOTIF_GROUPS.find(([, , , types]) => types.includes(n.type)) || NOTIF_GROUPS[NOTIF_GROUPS.length - 1])[0];
}

function renderNotificationsSide(notifications) {
  document.getElementById('notifications-page-shell')?.classList.toggle('notif-side-closed', notifSideClosed);
  const toggle = document.getElementById('notif-side-toggle');
  if (toggle) {
    toggle.setAttribute('aria-pressed', String(!notifSideClosed));
    toggle.title = notifSideClosed ? 'Mostrar o resumo' : 'Recolher o resumo';
  }
  const box = document.getElementById('notifications-side-summary');
  if (!box) return;
  const counts = Object.fromEntries(NOTIF_GROUPS.map(([key]) => [key, 0]));
  notifications.forEach(n => { counts[notifGroup(n)] += 1; });
  if (notifSideFilter && !counts[notifSideFilter]) notifSideFilter = '';
  const urgent = notifications.filter(n => n.priority === 'high').length;
  const row = (key, label, icon, count) => `<button type="button" class="notif-side-row${notifSideFilter === key ? ' is-active' : ''}" aria-pressed="${notifSideFilter === key}" ${AppActions.attrs('click', 'notifications-side-filter', [key])}>
      ${AppModules.core.lcIcon(icon, 15)}<span>${label}</span><strong>${count}</strong>
    </button>`;
  box.innerHTML = `<p class="notif-side-urgent"><strong>${urgent}</strong> ${urgent === 1 ? 'urgente' : 'urgentes'}</p>
    ${row('', 'Todas', 'list', notifications.length)}
    ${NOTIF_GROUPS.filter(([key]) => counts[key]).map(([key, label, icon]) => row(key, label, icon, counts[key])).join('')}`;
}

function filterNotifications(notifications) {
  return notifSideFilter ? notifications.filter(n => notifGroup(n) === notifSideFilter) : notifications;
}

function setNotifSideFilter(key) {
  notifSideFilter = notifSideFilter === key ? '' : key;
  AppModules.core.renderNotificationsPage();
}

function toggleNotificationsSide() {
  notifSideClosed = !notifSideClosed;
  try { localStorage.setItem(NOTIF_SIDE_KEY, notifSideClosed ? 'fechado' : 'aberto'); } catch { /* Vale só nesta página. */ }
  AppModules.core.renderNotificationsPage();
}

async function openPushSettings() {
  await AppModules.core.showView('definicoes');
  AppModules.core.switchSettingsTab('push');
}

AppActions.register({
  "notifications-side-filter": (el, event, args) => { setNotifSideFilter(args[0]) },
  "notifications-toggle-side": () => { toggleNotificationsSide() },
  "notifications-open-push-settings": () => { openPushSettings() },
}, "click");

})();
