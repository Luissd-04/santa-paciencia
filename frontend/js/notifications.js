let _notifications = [];
let _notifOpen = false;
let _notifTimer = null;

const NOTIF_PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
const EXPORT_REMINDER_DEFS = {
  alojamentos_xls: { label: 'Alojamentos XLS', action: 'exportAlojamentosXLS' },
  alojamentos_pdf: { label: 'Alojamentos PDF', action: 'exportAlojamentosPDF' },
  reservas_xls: { label: 'Reservas XLS', action: 'exportReservasXLS' },
  reservas_pdf: { label: 'Reservas PDF', action: 'exportReservasPDF' },
  hospedes_xls: { label: 'Hóspedes XLS', action: 'exportHospedesXLS' },
  hospedes_pdf: { label: 'Hóspedes PDF', action: 'exportHospedesPDF' },
  cliente_zip: { label: 'Dados do cliente ZIP', action: 'exportDB' },
};
const AUTO_TASK_SETTING_FIELDS = ['breakfast', 'cleaning', 'checkin', 'checkout'];

function exportReminderStorageKey() {
  return `sp:export-reminders:${currentUser?.organization_id || 'default'}`;
}

function getExportReminders() {
  try {
    const raw = localStorage.getItem(exportReminderStorageKey());
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveExportReminders(reminders) {
  try { localStorage.setItem(exportReminderStorageKey(), JSON.stringify(reminders || {})); } catch {}
}

function nextExportReminderDate(days) {
  return new Date(Date.now() + Number(days) * 86400000).toISOString();
}

function setExportReminder(key, value) {
  const reminders = getExportReminders();
  const days = Number(value);
  if (!EXPORT_REMINDER_DEFS[key]) return;

  if (!days) {
    delete reminders[key];
    toast('🔕 Lembrete de exportação desligado.', 'success');
  } else {
    reminders[key] = {
      interval_days: days,
      next_due_at: nextExportReminderDate(days),
      updated_at: new Date().toISOString()
    };
    toast(`🔔 Lembrete ativado a cada ${days === 30 ? '1 mês' : days + ' dias'}.`, 'success');
  }

  saveExportReminders(reminders);
  initExportReminderControls();
  loadNotifications();
}

function initExportReminderControls() {
  const reminders = getExportReminders();
  document.querySelectorAll('[data-export-reminder]').forEach(select => {
    const item = reminders[select.dataset.exportReminder];
    select.value = item?.interval_days ? String(item.interval_days) : '';
  });
  AppUI.refreshDropdowns(document.getElementById('settings-database'));
}

function getExportReminderNotifications() {
  const reminders = getExportReminders();
  const now = Date.now();
  return Object.entries(reminders)
    .filter(([key, item]) => EXPORT_REMINDER_DEFS[key] && item?.interval_days && Date.parse(item.next_due_at || 0) <= now)
    .map(([key, item]) => ({
      type: 'export_reminder',
      priority: 'medium',
      icon: 'download',
      title: 'Exportação recomendada',
      subtitle: `${EXPORT_REMINDER_DEFS[key].label} · a cada ${Number(item.interval_days) === 30 ? '1 mês' : item.interval_days + ' dias'}`,
      export_key: key,
      due_at: item.next_due_at,
    }));
}

function completeExportReminder(key, message) {
  const reminders = getExportReminders();
  const item = reminders[key];
  if (!item?.interval_days) return;
  reminders[key] = {
    ...item,
    next_due_at: nextExportReminderDate(item.interval_days),
    last_answered_at: new Date().toISOString()
  };
  saveExportReminders(reminders);
  if (message) toast(message, 'success');
  loadNotifications();
}

function approveExportReminder(key) {
  const def = EXPORT_REMINDER_DEFS[key];
  if (!def || typeof window[def.action] !== 'function') {
    toast('❌ Exportação indisponível.', 'error');
    return;
  }
  window[def.action]();
  completeExportReminder(key, '✅ Exportação iniciada. Próximo lembrete agendado.');
}

function refuseExportReminder(key) {
  completeExportReminder(key, 'Lembrete recusado. Voltamos a avisar no próximo ciclo.');
}

async function loadNotifications() {
  try {
    const data = await apiGet('/api/reservations/notifications');
    _notifications = [...(data?.data?.notifications || []), ...getExportReminderNotifications()].sort(
      (a, b) => NOTIF_PRIORITY_ORDER[a.priority] - NOTIF_PRIORITY_ORDER[b.priority]
    );
  } catch (_) {
    _notifications = getExportReminderNotifications();
  }
  renderNotifBadge();
  if (_notifOpen) renderNotifDropdown();
  if (document.getElementById('view-notificacoes')?.classList.contains('active')) renderNotificationsPage();
}

function renderNotifBadge() {
  const badge = document.getElementById('notif-badge');
  const count = _notifications.length;
  if (!badge) return;
  badge.textContent = count > 9 ? '9+' : String(count);
  badge.style.display = count > 0 ? '' : 'none';
}

function notificationClickAttr(n) {
  if (n.type === 'export_reminder') return `onclick="closeNotif();showView('notificacoes')"`;
  return `onclick="notifGoTo('${n.reservation_id}')"`;
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
    'sparkles': 'sparkles', 'bell-plus': 'bell-plus',
    'download': 'download',
  };
  const priorityClass = { high: 'notif-high', medium: 'notif-medium', low: 'notif-low' };

  const items = _notifications.map(n => `
    <div class="notif-item ${priorityClass[n.priority] || ''}" ${notificationClickAttr(n)}>
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

function renderNotificationsPage() {
  const list = document.getElementById('notifications-page-list');
  if (!list) return;

  if (_notifications.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="es-icon">🔔</div>
        <h3>Sem notificações</h3>
        <p>Não há alertas operacionais neste momento.</p>
      </div>`;
    return;
  }

  const priorityClass = { high: 'notif-high', medium: 'notif-medium', low: 'notif-low' };
  const icons = {
    'log-in': 'log-in', 'log-out': 'log-out',
    'calendar-clock': 'calendar-clock', 'circle-alert': 'circle-alert', 'clock': 'clock',
    'sparkles': 'sparkles', 'bell-plus': 'bell-plus',
    'download': 'download',
  };

  list.innerHTML = _notifications.map(n => `
    <div class="notifications-page-item ${priorityClass[n.priority] || ''}">
      <span class="notif-item-icon"><i data-lucide="${icons[n.icon] || 'bell'}"></i></span>
      <span class="notifications-page-copy">
        <strong>${n.title}</strong>
        <small>${n.subtitle}</small>
      </span>
      ${n.type === 'export_reminder' ? `
        <span class="notifications-page-actions">
          <button class="btn btn-primary btn-sm" onclick="approveExportReminder('${n.export_key}')">
            <i data-lucide="download"></i> Exportar agora
          </button>
          <button class="btn btn-ghost btn-sm" onclick="refuseExportReminder('${n.export_key}')">
            <i data-lucide="x"></i> Recusar
          </button>
        </span>
      ` : `
        <button class="btn btn-ghost btn-sm" onclick="notifGoTo('${n.reservation_id}')">
          <i data-lucide="chevron-right"></i> Ver
        </button>
      `}
    </div>
  `).join('');
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

async function loadAutoTaskSettings() {
  try {
    const payload = await apiGet('/api/events/settings');
    const data = payload.data || {};
    AUTO_TASK_SETTING_FIELDS.forEach(key => {
      const el = document.getElementById(`auto-task-${key}`);
      if (el) el.checked = data[key] !== false;
    });
  } catch (err) {
    toast('❌ Erro ao carregar tarefas automáticas.', 'error');
  }
}

async function saveAutoTaskSettings() {
  const body = {};
  AUTO_TASK_SETTING_FIELDS.forEach(key => {
    const el = document.getElementById(`auto-task-${key}`);
    if (el) body[key] = el.checked;
  });
  try {
    await apiPost('/api/events/settings', body);
    toast('✅ Definições de tarefas atualizadas.', 'success');
    if (typeof loadEventos === 'function') loadEventos();
    loadNotifications();
  } catch (err) {
    toast('❌ ' + (err?.payload?.error || 'Erro ao guardar definições.'), 'error');
  }
}

function openManualNotificationModal() {
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('manual-notification-title').value = '';
  document.getElementById('manual-notification-date').value = today;
  document.getElementById('manual-notification-time').value = '';
  document.getElementById('manual-notification-notes').value = '';
  AppUI.openModal('manual-notification-modal-bg');
  if (window.lucide) lucide.createIcons();
}

function closeManualNotificationModal() {
  AppUI.closeModal('manual-notification-modal-bg');
}

async function saveManualNotification() {
  const btn = document.getElementById('manual-notification-save-btn');
  const title = document.getElementById('manual-notification-title')?.value.trim();
  const date = document.getElementById('manual-notification-date')?.value;
  const start = document.getElementById('manual-notification-time')?.value || null;
  const notes = document.getElementById('manual-notification-notes')?.value.trim();
  if (!title || !date) {
    toast('⚠️ Título e data são obrigatórios.', 'error');
    return;
  }
  AppUI.setButtonLoading(btn, true, 'A guardar...');
  try {
    await apiPost('/api/events', {
      title,
      date,
      start_time: start,
      type: 'outro',
      status: 'planeado',
      important: true,
      notes,
    });
    closeManualNotificationModal();
    toast('✅ Notificação adicionada.', 'success');
    await loadNotifications();
    if (typeof loadEventos === 'function') loadEventos();
  } catch (err) {
    toast('❌ ' + (err?.payload?.error || 'Erro ao guardar notificação.'), 'error');
  } finally {
    AppUI.setButtonLoading(btn, false);
  }
}

function startNotifPolling() {
  loadNotifications();
  clearInterval(_notifTimer);
  _notifTimer = setInterval(loadNotifications, 5 * 60 * 1000);
}

document.addEventListener('click', e => {
  if (_notifOpen && !document.getElementById('notif-wrap')?.contains(e.target)) closeNotif();
});
