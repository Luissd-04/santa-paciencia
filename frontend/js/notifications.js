let _notifications = [];
let _notifOpen = false;
let _notifTimer = null;

const NOTIF_PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

async function loadNotifications() {
  try {
    const data = await apiGet('/api/reservations/notifications');
    _notifications = (data?.data?.notifications || []).sort(
      (a, b) => NOTIF_PRIORITY_ORDER[a.priority] - NOTIF_PRIORITY_ORDER[b.priority]
    );
  } catch (_) {
    _notifications = [];
  }
  renderNotifBadge();
  if (_notifOpen) renderNotifDropdown();
}

function renderNotifBadge() {
  const badge = document.getElementById('notif-badge');
  const count = _notifications.filter(n => n.priority === 'high').length;
  if (!badge) return;
  badge.textContent = count > 9 ? '9+' : String(count);
  badge.style.display = count > 0 ? '' : 'none';
}

function toggleNotif(e) {
  e.stopPropagation();
  _notifOpen = !_notifOpen;
  const dropdown = document.getElementById('notif-dropdown');
  if (!dropdown) return;
  if (_notifOpen) {
    renderNotifDropdown();
    dropdown.style.display = '';
    requestAnimationFrame(() => dropdown.classList.add('open'));
  } else {
    closeNotif();
  }
}

function closeNotif() {
  _notifOpen = false;
  const dropdown = document.getElementById('notif-dropdown');
  if (!dropdown) return;
  dropdown.classList.remove('open');
  setTimeout(() => { if (!_notifOpen) dropdown.style.display = 'none'; }, 200);
}

function renderNotifDropdown() {
  const dropdown = document.getElementById('notif-dropdown');
  if (!dropdown) return;

  if (_notifications.length === 0) {
    dropdown.innerHTML = `
      <div class="notif-header">Notificações</div>
      <div class="notif-empty">
        <i data-lucide="bell-off" style="width:28px;height:28px;opacity:.3;"></i>
        <span>Sem notificações de momento</span>
      </div>`;
    if (window.lucide) lucide.createIcons();
    return;
  }

  const icons = {
    'log-in': 'log-in', 'log-out': 'log-out',
    'calendar-clock': 'calendar-clock', 'circle-alert': 'circle-alert', 'clock': 'clock',
  };
  const priorityClass = { high: 'notif-high', medium: 'notif-medium', low: 'notif-low' };

  const items = _notifications.map(n => `
    <div class="notif-item ${priorityClass[n.priority] || ''}" onclick="notifGoTo('${n.reservation_id}')">
      <div class="notif-item-icon"><i data-lucide="${icons[n.icon] || 'bell'}" style="width:15px;height:15px;"></i></div>
      <div class="notif-item-body">
        <div class="notif-item-title">${n.title}</div>
        <div class="notif-item-sub">${n.subtitle}</div>
      </div>
    </div>
  `).join('');

  dropdown.innerHTML = `
    <div class="notif-header">
      <span>Notificações</span>
      <span class="notif-count">${_notifications.length}</span>
    </div>
    <div class="notif-list">${items}</div>
    <div class="notif-footer" onclick="loadNotifications()">
      <i data-lucide="refresh-cw" style="width:13px;height:13px;"></i> Atualizar
    </div>`;
  if (window.lucide) lucide.createIcons();
}

function notifGoTo(reservationId) {
  closeNotif();
  showView('reservas');
  setTimeout(() => {
    const row = document.querySelector(`tr[data-id="${reservationId}"]`);
    if (row) { row.scrollIntoView({ behavior: 'smooth', block: 'center' }); row.classList.add('row-highlight'); setTimeout(() => row.classList.remove('row-highlight'), 1500); }
    else showDetail(reservationId);
  }, 300);
}

function startNotifPolling() {
  loadNotifications();
  clearInterval(_notifTimer);
  _notifTimer = setInterval(loadNotifications, 5 * 60 * 1000);
}

document.addEventListener('click', e => {
  if (_notifOpen && !document.getElementById('notif-wrap')?.contains(e.target)) closeNotif();
});
