// Estado privado; interface partilhada em AppModules.calendario.
(() => {
AppModules.define('calendario', {
  calendarLoadMessage: { get: () => calendarLoadMessage },
  calendarReservas: { get: () => calendarReservas, set: value => { calendarReservas = value; } },
  invalidateCalendarReservations: { get: () => invalidateCalendarReservations },
  renderCal: { get: () => renderCal },
  renderTimeline: { get: () => renderTimeline },
});

// O calendário carrega o intervalo desenhado, independentemente da lista.
let calendarReservas = [];
let calendarDataKey = '', calendarPendingKey = '', calendarPending = null;
let calendarController = null, calendarGeneration = 0;

function calendarPeriod(mode) {
  const iso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  if (mode === 'timeline') {
    const year = new Date().getFullYear();
    return { overlap_from: `${year}-01-01`, overlap_to: `${year}-12-31` };
  }
  const start = new Date(AppModules.core.calYear, AppModules.core.calMonth, 1);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(AppModules.core.calYear, AppModules.core.calMonth + 1, 0);
  end.setDate(end.getDate() + 6 - end.getDay());
  return { overlap_from: iso(start), overlap_to: iso(end) };
}

function invalidateCalendarReservations() {
  calendarGeneration++;
  calendarController?.abort(); calendarController = null;
  calendarPending = null; calendarPendingKey = ''; calendarDataKey = '';
  calendarReservas = [];
}

function calendarLoadMessage(message, retry = null) {
  for (const id of ['cal-grid', 'calendar-agenda-mobile', 'cll-grid', 'timeline-wrap']) {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = message;
      if (retry) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-ghost btn-sm';
        button.textContent = 'Tentar novamente';
        button.addEventListener('click', retry);
        el.appendChild(button);
      }
    }
  }
  AppModules.calendario.setCalCount('—', message);
}

function ensureCalendarReservations(mode) {
  const query = calendarPeriod(mode);
  const key = JSON.stringify(query);
  if (key === calendarPendingKey && calendarPending) return calendarPending;
  if (key === calendarDataKey) return Promise.resolve(true);
  invalidateCalendarReservations();
  calendarLoadMessage('A carregar reservas…');
  calendarController = new AbortController();
  const version = calendarGeneration;
  calendarPendingKey = key;
  calendarPending = (async () => {
    try {
      const result = await AppModules.core.apiGetAllPages('/api/reservations', query, { signal: calendarController.signal });
      if (version !== calendarGeneration) return false;
      calendarReservas = result.data;
      calendarDataKey = key;
      return true;
    } catch (error) {
      if (version === calendarGeneration && !calendarController.signal.aborted) {
        const message = error.code === 'API_UPDATE_REQUIRED' ? error.message
          : error.name === 'AbortError' ? 'O servidor demorou demasiado a responder.' : 'Não foi possível carregar as reservas.';
        calendarLoadMessage(message, () => AppModules.calendario.renderCalView());
      }
      return false;
    } finally {
      if (version === calendarGeneration) { calendarPending = null; calendarPendingKey = ''; }
    }
  })();
  return calendarPending;
}

async function renderCal() {
  const key = JSON.stringify(calendarPeriod('calendar'));
  if (await ensureCalendarReservations('calendar') && AppModules.calendario.calMode !== 'timeline' && key === calendarDataKey) AppModules.calendario.drawCal();
}

async function renderTimeline(autoScroll = true) {
  if (await ensureCalendarReservations('timeline') && AppModules.calendario.calMode === 'timeline') AppModules.calendario.drawTimeline(autoScroll);
}

// Limpeza da funcionalidade ao sair ou trocar de organização.
AppModules.onReset('features/calendario/dados.js', () => {
  invalidateCalendarReservations();
  calendarLoadMessage('');
});

})();
