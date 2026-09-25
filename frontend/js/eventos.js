// Estado privado; interface partilhada em AppModules.eventos.
(() => {
AppModules.define('eventos', {
  closeEventoModal: { get: () => closeEventoModal },
  deleteEventoFromModal: { get: () => deleteEventoFromModal },
  eventosListPaged: { get: () => eventosListPaged },
  eventosListQueryChanged: { get: () => eventosListQueryChanged },
  eventosNext: { get: () => eventosNext },
  eventosPrev: { get: () => eventosPrev },
  eventosToday: { get: () => eventosToday },
  invalidateEventosRange: { get: () => invalidateEventosRange },
  loadEventos: { get: () => loadEventos },
  openEventoModal: { get: () => openEventoModal },
  saveEvento: { get: () => saveEvento },
  setEventosMode: { get: () => setEventosMode },
  setEventosTimelineRange: { get: () => setEventosTimelineRange },
  setEventosView: { get: () => setEventosView },
});

let eventosView = AppModules.core.SS.get('evt:view', 'calendar');
let eventosMode = AppModules.core.SS.get('evt:mode', 'calendar');
let eventosYear = Number(AppModules.core.SS.get('evt:year', new Date().getFullYear()));
let eventosMonth = Number(AppModules.core.SS.get('evt:month', new Date().getMonth()));
let eventosTimelineDays = Number(AppModules.core.SS.get('evt:tlDays', 14));
const eventosTypeFilters = new Set();
let eventosPanDrag = null;
let eventosEditingId = null;
let eventosTeamMembers = [];
const EVENTOS_LABEL_W = 190;
const EVENTOS_ZOOM = { 7: 80, 14: 48, 30: 24 };
// Constantes de layout da timeline de Eventos (antes magic numbers soltos).
const EVT = {
  tlZoomDefault: 48,
  weekdayNameMinDayW: 40,   // px/dia abaixo dos quais se esconde o nome do dia
  tlBlockMinW: 18,
  tlBlockInset: 4,
  alpha: { fill: '18', border: '55' },
};

// Contador da barra ("N eventos") — mesmo padrão de #view-reservas / #view-calendario.
function setEventosCount(n) {
  const label = Number(n) === 1 ? 'evento' : 'eventos';
  [['eventos-results-total', 'eventos-results-detail'],
   ['eventos-list-total', 'eventos-list-detail']].forEach(([totalId, detailId]) => {
    const t = document.getElementById(totalId);
    const d = document.getElementById(detailId);
    if (t) t.textContent = String(n ?? 0);
    if (d) d.textContent = label;
  });
}


// A vista tem dois consumos distintos, como o calendário de reservas:
//  - calendário/timeline/agenda desenham um intervalo de datas → carregam esse
//    intervalo e só esse (eventosRange);
//  - a lista pagina no servidor (eventosListPaged).
// Antes, ambos partilhavam um único GET /api/events sem limites, que trazia a
// coleção inteira para memória.
const eventosCalendarRange = AppModules.core.createRangeCollection('/api/events');
const eventosAgendaRange = AppModules.core.createRangeCollection('/api/events');
let eventosRenderVersion = 0;

// Horizonte desenhado por cada modo, com folga para os dias adjacentes que o
// calendário mostra fora do mês.
function eventosPeriod() {
  const iso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  if (eventosView !== 'list' && eventosMode === 'timeline') {
    const start = new Date();
    start.setDate(start.getDate() - 1);
    const end = new Date(start);
    end.setDate(end.getDate() + eventosTimelineDays + 2);
    return { from: iso(start), to: iso(end) };
  }
  const monthStart = new Date(eventosYear, eventosMonth, 1);
  monthStart.setDate(monthStart.getDate() - monthStart.getDay());
  const monthEnd = new Date(eventosYear, eventosMonth + 1, 0);
  monthEnd.setDate(monthEnd.getDate() + 6 - monthEnd.getDay());
  return { from: iso(monthStart), to: iso(monthEnd) };
}

function eventosAgendaPeriod() {
  const today = new Date();
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 20);
  return { from: isoDate(today.getFullYear(), today.getMonth(), today.getDate()),
    to: isoDate(end.getFullYear(), end.getMonth(), end.getDate()) };
}

function invalidateEventosRange() {
  eventosCalendarRange.reset();
  eventosAgendaRange.reset();
}

function eventosRangeMessage(ids, message, retry = null) {
  for (const id of ids) {
    const el = document.getElementById(id);
    if (!el) continue;
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

async function ensureEventosRange(collection, query, ids, draw, isCurrent) {
  const key = JSON.stringify(query);
  if (collection.state.key !== key) eventosRangeMessage(ids, 'A carregar eventos…');
  const loaded = await collection.load(query);
  if (!isCurrent()) return;
  if (loaded && collection.state.key === key) draw();
  else if (collection.state.error) {
    eventosRangeMessage(ids, collection.state.error, () => renderEventosView());
    setEventosCount('—');
  }
}

// Coleção paginada da lista. O estado distingue carregamento, erro e vazio.
const eventosListPaged = AppModules.core.createPagedCollection('/api/events', () => renderEventosListState());

function getEventosListQuery() {
  const search = (document.getElementById('eventos-search')?.value || '').trim();
  const accommodation = document.getElementById('eventos-list-acc-filter')?.value || '';
  const status = document.getElementById('eventos-list-status-filter')?.value || '';
  const range = document.getElementById('eventos-list-date-filter')?.value || '';
  const iso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const today = new Date();
  const todayStr = iso(today);

  const query = {};
  if (search) query.search = search;
  if (accommodation) query.accommodation_id = accommodation;
  if (status) query.status = status;
  if (eventosTypeFilters.size) query.types = [...eventosTypeFilters].join(',');
  if (range === 'today') { query.from = todayStr; query.to = todayStr; }
  else if (range === 'week') {
    const end = new Date(today); end.setDate(today.getDate() + 7);
    query.from = todayStr; query.to = iso(end);
  } else if (range === 'month') {
    query.from = iso(new Date(today.getFullYear(), today.getMonth(), 1));
    query.to = iso(new Date(today.getFullYear(), today.getMonth() + 1, 0));
  } else if (range === 'upcoming') {
    query.from = todayStr;
  }
  return query;
}

// A escrita usa o atraso curto da coleção (que também cancela pedidos
// anteriores); mudar um filtro pede logo.
function eventosListQueryChanged(options = {}) {
  const query = getEventosListQuery();
  if (options.immediate) eventosListPaged.load(query);
  else eventosListPaged.schedule(query);
}

async function loadEventos() {
  const session = AppModules.sessionVersion;
  await loadEventosTeamMembers();
  if (session !== AppModules.sessionVersion) return;
  return renderEventosView();
}

async function loadEventosTeamMembers() {
  try {
    const payload = await AppModules.core.apiGet('/api/team/members');
    eventosTeamMembers = payload?.data?.members || [];
  } catch {
    eventosTeamMembers = AppModules.core.currentUser ? [{ name: AppModules.core.currentUser.name, role: AppModules.core.currentUser.role }] : [];
  }
}

async function renderEventosView() {
  const version = ++eventosRenderVersion;
  const isCurrent = () => version === eventosRenderVersion;
  AppModules.core.SS.set('evt:view', eventosView);
  AppModules.core.SS.set('evt:mode', eventosMode);
  AppModules.core.SS.set('evt:year', eventosYear);
  AppModules.core.SS.set('evt:month', eventosMonth);
  populateEventosAccommodationSelects();
  AppUI.enhanceSelects(document.getElementById('view-eventos'));
  AppUI.refreshDropdowns(document.getElementById('view-eventos'));
  updateEventosViewUi();
  updateEventosModeUi();

  if (eventosView === 'list') {
    eventosListQueryChanged({ immediate: true });
  } else {
    // A agenda não estende o mês selecionado até hoje. Cada consumidor
    // tem a sua coleção e pode recuperar de uma falha independentemente.
    await Promise.all([
      ensureEventosRange(eventosCalendarRange, eventosPeriod(), ['eventos-cal-grid', 'eventos-timeline-wrap'],
        () => eventosMode === 'timeline' ? renderEventosTimeline() : renderEventosCalendar(), isCurrent),
      ensureEventosRange(eventosAgendaRange, eventosAgendaPeriod(), ['eventos-agenda-mobile'], renderEventosAgendaMobile, isCurrent),
    ]);
  }
  if (window.lucide) lucide.createIcons();
}

const EVENTOS_AGENDA_DAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

// No mobile, Calendário/Timeline dão lugar a uma agenda dia-a-dia
// (mesmo padrão de #calendar-agenda-mobile usado no calendário de reservas).
// Ordem: tira de datas (navegação/scroll-to) → chips de categoria → agenda
// multi-dia (todos os dias do horizonte, incl. estado vazio por dia).
function renderEventosAgendaMobile() {
  const wrap = document.getElementById('eventos-agenda-mobile');
  if (!wrap) return;
  const today = new Date();
  const todayStr = isoDate(today.getFullYear(), today.getMonth(), today.getDate());
  const horizonDays = 21;
  const dates = [];
  for (let i = 0; i < horizonDays; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    dates.push(isoDate(d.getFullYear(), d.getMonth(), d.getDate()));
  }
  const events = filteredEventos(eventosAgendaRange.state.rows);

  const stripHtml = dates.map(dateStr => {
    const d = new Date(dateStr + 'T12:00:00');
    const isToday = dateStr === todayStr;
    return `<button type="button" class="eds-day${isToday ? ' is-today active' : ''}" data-date="${dateStr}" ${AppActions.attrs("click", "eventos-scroll-to-eventos-agenda-day-a78e6ec", [String((dateStr) ?? '')])}>
      <span class="eds-day-name">${EVENTOS_AGENDA_DAY_NAMES[d.getDay()]}</span>
      <span class="eds-day-num">${d.getDate()}</span>
    </button>`;
  }).join('');

  const daySections = dates.map(dateStr => {
    const dayEvents = events.filter(e => e.date === dateStr)
      .sort((a, b) => (a.start_time || '99:99').localeCompare(b.start_time || '99:99'));
    const d = new Date(dateStr + 'T12:00:00');
    let dayLabel = d.toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short' });
    if (dateStr === todayStr) dayLabel = 'Hoje · ' + dayLabel;
    const body = dayEvents.length
      ? `<div class="agenda-day-list">${dayEvents.map(renderEventoTaskCard).join('')}</div>`
      : `<div class="eventos-agenda-day-empty">Sem eventos neste dia</div>`;
    return `<section class="agenda-day" id="eventos-agenda-day-${dateStr}">
      <div class="agenda-day-title">${dayLabel}</div>
      ${body}
    </section>`;
  });

  wrap.innerHTML = `
    <div class="eventos-date-strip" id="eventos-date-strip">${stripHtml}</div>
    <div class="eventos-type-chips-row"></div>
    <div class="eventos-agenda-days">${daySections.join('')}</div>
  `;
  renderEventosTypeChips();
  if (window.lucide) lucide.createIcons();
}

function renderEventoTaskCard(evento) {
  const type = getEventoType(evento.type);
  const done = evento.status === 'concluido';
  const important = Number(evento.important) > 0;
  const priorityColor = important ? 'var(--vermelho)' : type.color;
  const time = formatEventoTime(evento);
  return `<div class="agenda-item eventos-task-item${done ? ' eventos-pill-done' : ''}" style="--agenda-color:${priorityColor};" role="button" tabindex="0" ${AppActions.attrs("click", "eventos-open-evento-modal-a2a7fbb", [String((evento.id) ?? '')])} ${AppActions.attrs("keydown", "eventos-if-6aef6e2", [String((evento.id) ?? '')])}>
    <input type="checkbox" class="eventos-task-check" ${done ? 'checked' : ''} ${AppActions.attrs("click", "eventos-stop-propagation-185b92b", [String((evento.id) ?? '')])} aria-label="Marcar concluído">
    <span class="agenda-item-main">
      <strong>${AppModules.core.escapeHtml(evento.title)}</strong>
      <small>${type.singular}${evento.accommodation_name ? ' · ' + AppModules.core.escapeHtml(evento.accommodation_name) : ''}${time ? ' · ' + time : ''}</small>
    </span>
  </div>`;
}

// Tocar num dia da tira desloca até à secção correspondente na lista
// abaixo (a lista mostra sempre todos os dias do horizonte, não troca
// para uma vista de dia único) e marca esse chip como selecionado.
function scrollToEventosAgendaDay(dateStr, btn) {
  document.getElementById('eventos-agenda-day-' + dateStr)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.querySelectorAll('#eventos-date-strip .eds-day').forEach(el => el.classList.remove('active'));
  btn?.classList.add('active');
}

function setEventosView(view) {
  eventosView = view === 'list' ? 'list' : 'calendar';
  return renderEventosView();
}

function setEventosMode(mode) {
  const nextMode = mode === 'timeline' ? 'timeline' : 'calendar';
  if (nextMode === eventosMode) return;
  if (nextMode === 'timeline') {
    const today = new Date();
    eventosYear = today.getFullYear();
    eventosMonth = today.getMonth();
  }
  const toTimeline = nextMode === 'timeline';
  const calWrap = document.getElementById('eventos-cal-wrap');
  const tlWrap = document.getElementById('eventos-timeline-wrap');
  const rangeToggle = document.getElementById('eventos-range-toggle');
  const outgoing = toTimeline ? calWrap : tlWrap;
  const incoming = toTimeline ? tlWrap  : calWrap;
  const exitAnim  = toTimeline ? 'cal-slide-exit-left'   : 'cal-slide-exit-right';
  const enterAnim = toTimeline ? 'cal-slide-enter-right' : 'cal-slide-enter-left';
  document.querySelectorAll('[data-eventos-mode]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.eventosMode === nextMode);
  });
  requestAnimationFrame(moveEventosModePill);
  if (outgoing) outgoing.classList.add(exitAnim);
  setTimeout(() => {
    eventosMode = nextMode;
    AppModules.core.SS.set('evt:mode', eventosMode);
    if (outgoing) { outgoing.style.display = 'none'; outgoing.classList.remove(exitAnim); }
    if (incoming) {
      incoming.style.display = '';
      void incoming.offsetWidth;
      incoming.classList.add(enterAnim);
      setTimeout(() => incoming.classList.remove(enterAnim), 280);
    }
    if (toTimeline) {
      if (rangeToggle) {
        rangeToggle.style.display = '';
        void rangeToggle.offsetWidth;
        rangeToggle.classList.add('tl-range-enter');
        setTimeout(() => rangeToggle.classList.remove('tl-range-enter'), 280);
        updateEventosRangeUi();
      }
      renderEventosTimeline();
    } else {
      if (rangeToggle) rangeToggle.style.display = 'none';
      renderEventosCalendar();
    }
  }, 190);
}

function updateEventosViewUi() {
  document.querySelectorAll('[data-eventos-view]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.eventosView === eventosView);
  });
  document.querySelectorAll('.eventos-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === `eventos-panel-${eventosView}`);
  });
}

function setEventosTimelineRange(days) {
  const wrap = document.getElementById('eventos-timeline-wrap');
  const oldDayW = getEventosDayWidth();
  const centerOffset = wrap ? wrap.scrollLeft + (wrap.clientWidth - EVENTOS_LABEL_W) / 2 - EVENTOS_LABEL_W : 0;
  const centerDayIdx = oldDayW > 0 ? centerOffset / oldDayW : 0;
  eventosTimelineDays = Number(days);
  AppModules.core.SS.set('evt:tlDays', eventosTimelineDays);
  updateEventosRangeUi();
  if (eventosMode === 'timeline') {
    const newDayW = getEventosDayWidth();
    renderEventosTimeline(false);
    requestAnimationFrame(() => {
      if (wrap) wrap.scrollLeft = EVENTOS_LABEL_W + centerDayIdx * newDayW - (wrap.clientWidth - EVENTOS_LABEL_W) / 2;
    });
  }
}

function getEventosDayWidth() {
  return EVENTOS_ZOOM[eventosTimelineDays] || EVT.tlZoomDefault;
}

function scrollEventosTimelineToToday(dayW) {
  const wrap = document.getElementById('eventos-timeline-wrap');
  if (!wrap) return;
  const today = new Date();
  const yearStart = new Date(today.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((today - yearStart) / 86400000);
  const todayX = EVENTOS_LABEL_W + dayOfYear * dayW;
  wrap.scrollLeft = Math.max(0, todayX - EVENTOS_LABEL_W - 2 * dayW);
}

function scheduleEventosTimelineTodayScroll(dayW) {
  requestAnimationFrame(() => {
    scrollEventosTimelineToToday(dayW);
    requestAnimationFrame(() => scrollEventosTimelineToToday(dayW));
    setTimeout(() => scrollEventosTimelineToToday(dayW), 80);
  });
}

function updateEventosModeUi() {
  document.querySelectorAll('[data-eventos-mode]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.eventosMode === eventosMode);
  });
  const calWrap = document.getElementById('eventos-cal-wrap');
  const tlWrap = document.getElementById('eventos-timeline-wrap');
  const rangeToggle = document.getElementById('eventos-range-toggle');
  const calendarPanelActive = eventosView === 'calendar';
  if (calWrap) calWrap.style.display = calendarPanelActive && eventosMode === 'calendar' ? '' : 'none';
  if (tlWrap) tlWrap.style.display = calendarPanelActive && eventosMode === 'timeline' ? '' : 'none';
  if (rangeToggle) rangeToggle.style.display = calendarPanelActive && eventosMode === 'timeline' ? '' : 'none';
  updateEventosRangeUi();
  requestAnimationFrame(moveEventosModePill);
}

function updateEventosRangeUi() {
  document.querySelectorAll('[data-eventos-range]').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.eventosRange) === eventosTimelineDays);
  });
}

function moveEventosModePill() {
  const pill = document.getElementById('eventos-mode-pill');
  const toggle = document.getElementById('eventos-mode-toggle');
  if (!pill || !toggle) return;
  const activeBtn = toggle.querySelector('.cal-mode-btn.active');
  if (!activeBtn) return;
  const toggleRect = toggle.getBoundingClientRect();
  const btnRect = activeBtn.getBoundingClientRect();
  pill.style.left = (btnRect.left - toggleRect.left) + 'px';
  pill.style.width = btnRect.width + 'px';
}

function filteredEventos(rows = eventosCalendarRange.state.rows) {
  return rows.filter(evento => eventosTypeFilters.size === 0 || eventosTypeFilters.has(evento.type));
}

function renderEventosCalendar() {
  renderEventosTypeChips();
  const label = document.getElementById('eventos-label');
  const grid = document.getElementById('eventos-cal-grid');
  if (!grid) return;
  const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  if (label) label.textContent = `${months[eventosMonth]} ${eventosYear}`;

  const firstDay = new Date(eventosYear, eventosMonth, 1).getDay();
  const daysInMonth = new Date(eventosYear, eventosMonth + 1, 0).getDate();
  const prevDays = new Date(eventosYear, eventosMonth, 0).getDate();
  const todayStr = new Date().toISOString().slice(0, 10);
  const visibleDays = [];

  for (let i = firstDay - 1; i >= 0; i--) {
    const day = prevDays - i;
    const month = eventosMonth === 0 ? 11 : eventosMonth - 1;
    const year = eventosMonth === 0 ? eventosYear - 1 : eventosYear;
    visibleDays.push({ day, dateStr: isoDate(year, month, day), otherMonth: true });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    visibleDays.push({ day, dateStr: isoDate(eventosYear, eventosMonth, day), otherMonth: false });
  }
  while (visibleDays.length % 7 !== 0) {
    const nextIndex = visibleDays.length - (firstDay + daysInMonth) + 1;
    const month = eventosMonth === 11 ? 0 : eventosMonth + 1;
    const year = eventosMonth === 11 ? eventosYear + 1 : eventosYear;
    visibleDays.push({ day: nextIndex, dateStr: isoDate(year, month, nextIndex), otherMonth: true });
  }

  const events = filteredEventos();
  grid.innerHTML = visibleDays.map(day => {
    const dayEvents = events.filter(e => e.date === day.dateStr);
    return `<div class="cal-day eventos-day${day.otherMonth ? ' other-month' : ''}${day.dateStr === todayStr ? ' today' : ''}" ${AppActions.attrs("dblclick", "eventos-open-evento-modal-bc5ccca", [day.dateStr])}>
      <div class="day-num">${day.day}</div>
      <div class="eventos-day-list">
        ${dayEvents.map(renderEventoPillCompact).join('')}
      </div>
    </div>`;
  }).join('');

  const monthEvents = events.filter(e => visibleDays.some(d => !d.otherMonth && d.dateStr === e.date));
  setEventosCount(monthEvents.length);
  const emptyBox = document.getElementById('eventos-cal-empty');
  if (emptyBox) {
    emptyBox.innerHTML = monthEvents.length ? '' : AppModules.core.emptyStateHtml(
      '📅', 'Sem eventos neste mês', 'Nenhum evento visível com estes filtros.', { inline: true }
    );
  }
  if (window.lucide) lucide.createIcons();
}

function renderEventosTimeline(autoScroll = true) {
  renderEventosTypeChips();
  const wrap = document.getElementById('eventos-timeline-wrap');
  if (!wrap) return;

  const dayW = getEventosDayWidth();
  const now = new Date();
  const year = now.getFullYear();
  const yearStart = new Date(year, 0, 1);
  const totalDays = Math.round((new Date(year + 1, 0, 1) - yearStart) / 86400000);
  const todayStr = now.toISOString().slice(0, 10);
  const startStr = `${year}-01-01`;
  const endStr = `${year + 1}-01-01`;
  const curMonthStart = `${year}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const curMonthEnd = (() => { const d = new Date(year, now.getMonth() + 1, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; })();

  const dayNames   = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  const filteredEvents = eventosCalendarRange.state.rows.filter(e =>
    (eventosTypeFilters.size === 0 || eventosTypeFilters.has(e.type)) && e.date >= startStr && e.date < endStr
  );

  // Geometria por CSS custom properties (ver css/styles.css .tl-* + views/calendar.css) —
  // deixa de haver width/min-width inline em centenas de células.
  wrap.style.setProperty('--tl-day-w', dayW + 'px');
  wrap.style.setProperty('--tl-days-total', String(totalDays));
  wrap.style.setProperty('--tl-label-w', EVENTOS_LABEL_W + 'px');
  setEventosCount(filteredEvents.length);

  const generalRow = { id: '', name: 'Sem alojamento', type: 'geral' };
  const hasGeneralEvents = filteredEvents.some(e => !e.accommodation_id);
  const alojList = eventosTypeFilters.size > 0
    ? AppModules.core.accommodations.filter(a => filteredEvents.some(e => e.accommodation_id === a.id))
    : AppModules.core.accommodations;
  const rowList = hasGeneralEvents ? [...alojList, generalRow] : alojList;

  // Month header cells
  let monthCells = '';
  for (let m = 0; m < 12; m++) {
    const mDays  = Math.round((new Date(year, m + 1, 1) - new Date(year, m, 1)) / 86400000);
    const mStart = `${year}-${String(m + 1).padStart(2, '0')}-01`;
    const mEnd   = m === 11 ? `${year + 1}-01-01` : `${year}-${String(m + 2).padStart(2, '0')}-01`;
    const hasToday = todayStr >= mStart && todayStr < mEnd;
    monthCells += `<div class="tl-month-head${hasToday ? ' tl-month-today' : ''}" style="--tl-month-days:${mDays};">${monthNames[m]}</div>`;
  }

  // Day header cells
  let dayCells = '';
  for (let i = 0; i < totalDays; i++) {
    const d  = new Date(year, 0, 1 + i);
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const isToday      = ds === todayStr;
    const isWeekend    = d.getDay() === 0 || d.getDay() === 6;
    const isMonthStart = d.getDate() === 1 && i > 0;
    dayCells += `<div class="tl-day-head${isToday ? ' tl-today' : ''}${isWeekend ? ' tl-weekend' : ''}${isMonthStart ? ' tl-month-start' : ''}">
      ${dayW >= EVT.weekdayNameMinDayW ? `<div class="tl-day-name">${dayNames[d.getDay()]}</div>` : ''}
      <div class="tl-day-num">${d.getDate()}</div>
    </div>`;
  }

  const rows = rowList.length === 0
    ? ''
    : rowList.map(row => {
        let cellHtml = '';
        for (let i = 0; i < totalDays; i++) {
          const d  = new Date(year, 0, 1 + i);
          const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          const isMonthStart = d.getDate() === 1 && i > 0;
          cellHtml += `<div class="tl-cell${ds === todayStr ? ' tl-today-col' : ''}${isMonthStart ? ' tl-month-start' : ''}"></div>`;
        }

        const rowEvents = filteredEvents.filter(e => row.id ? e.accommodation_id === row.id : !e.accommodation_id);
        const monthCount = rowEvents.filter(e => e.date >= curMonthStart && e.date < curMonthEnd).length;

        const blocks = rowEvents.map(e => {
          const d      = new Date(e.date + 'T00:00:00');
          const offset = Math.round((d - yearStart) / 86400000);
          if (offset < 0 || offset >= totalDays) return '';
          const type       = getEventoType(e.type);
          const color      = type.color;
          const totalWidth = totalDays * dayW;
          const left  = Math.max(0, offset * dayW + dayW / 2);
          const right = Math.min(totalWidth, (offset + 1) * dayW + dayW / 2);
          const width = Math.max(EVT.tlBlockMinW, right - left - EVT.tlBlockInset);
          if (right <= 0 || left >= totalWidth || width <= 0) return '';
          const doneCls = e.status === 'concluido' ? ' eventos-tl-done' : '';
          const tlInitials = accInitials(e.accommodation_name);
          return `<div class="tl-block eventos-tl-block${doneCls}" style="left:${left}px;width:${width}px;--tl-color:${color};background:${color}${EVT.alpha.fill};border-color:${color}${EVT.alpha.border};cursor:pointer;"
                       ${AppActions.attrs("click", "eventos-open-evento-modal-a2a7fbb", [String((e.id) ?? '')])}
                       title="${AppModules.core.escapeHtml(type.singular)} · ${AppModules.core.escapeHtml(e.title)}${e.accommodation_name ? ' · ' + AppModules.core.escapeHtml(e.accommodation_name) : ''}">
            <div class="tl-block-header">
              <i data-lucide="${type.icon}"></i>${tlInitials ? `<span class="tl-block-initials">${tlInitials}</span>` : `<span class="tl-block-initials">${type.singular}</span>`}
            </div>
            <span class="tl-block-meta">${formatEventoTime(e) || type.singular}</span>
          </div>`;
        }).join('');

        return `<div class="tl-row"
                     data-acc-id="${row.id}"
                     data-acc-name="${AppModules.core.escapeHtml(row.name)}">
          <div class="tl-label">
            <div class="tl-label-title">${AppModules.core.escapeHtml(row.name)}</div>
            <div class="tl-label-sub">${row.type || 'alojamento'} · ${monthCount} evento${monthCount !== 1 ? 's' : ''} este mês</div>
          </div>
          <div class="tl-days-area">
            <div class="tl-cells">${cellHtml}</div>
            ${blocks}
          </div>
        </div>`;
      }).join('');

  const emptyBanner =
    rowList.length === 0
      ? AppModules.core.emptyStateHtml('🏠', 'Sem alojamentos', 'Não há alojamentos para mostrar.', { inline: true })
      : (filteredEvents.length === 0
          ? AppModules.core.emptyStateHtml('📅', 'Sem eventos', 'Nenhum evento no período com estes filtros.', { inline: true })
          : '');

  wrap.innerHTML = `
    <div class="timeline-scroll">
      <div class="tl-header">
        <div class="tl-label tl-header-label">Alojamento</div>
        <div class="tl-header-cols">
          <div class="tl-months-row">${monthCells}</div>
          <div class="tl-days-row">${dayCells}</div>
        </div>
      </div>
      <div class="tl-body">${rows}</div>
    </div>
    ${emptyBanner}`;

  attachEventosTimelinePan();
  if (autoScroll) scheduleEventosTimelineTodayScroll(dayW);
  if (window.lucide) lucide.createIcons();
}

function renderEventosTypeChips() {
  const html = AppModules.core.EVENT_TYPES.map(t => {
    const active = eventosTypeFilters.has(t.id);
    return `<button class="evt-type-chip${active ? ' active' : ''}" style="--chip-color:${t.color}" ${AppActions.attrs("click", "eventos-toggle-evento-type-chip-750c6ad", [String((t.id) ?? '')])} title="${t.label}">
      <i data-lucide="${t.icon}"></i><span>${t.label}</span>
    </button>`;
  }).join('');
  document.querySelectorAll('.eventos-type-chips-row').forEach(row => { row.innerHTML = html; });
  if (window.lucide) lucide.createIcons();
}

function toggleEventoTypeChip(typeId) {
  if (eventosTypeFilters.has(typeId)) {
    eventosTypeFilters.delete(typeId);
  } else {
    eventosTypeFilters.add(typeId);
  }
  if (eventosView === 'list') eventosListQueryChanged({ immediate: true });
  else if (eventosMode === 'timeline') renderEventosTimeline();
  else renderEventosCalendar();
  // No mobile o que está visível é a agenda, não o calendário/timeline
  renderEventosAgendaMobile();
}

// Estado da lista: carregamento, erro e vazio são distintos — um erro de rede
// não pode aparecer como "sem eventos".
function renderEventosListState() {
  renderEventosTypeChips();
  const state = eventosListPaged.state;
  const body = document.getElementById('eventos-list-body');
  if (!body) return;

  const show = (id, visible, text) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = visible ? 'block' : 'none';
    if (text !== undefined) el.textContent = text;
  };

  show('eventos-list-loading', state.loading && !state.rows.length);
  show('eventos-list-error', !!state.error);
  show('eventos-list-error-detail', !!state.error, state.error || '');
  show('eventos-list-empty', !state.loading && !state.error && !state.rows.length);

  setEventosCount(state.error ? '—' : state.total);
  AppModules.core.renderPagination('eventos-list-pagination', state, page => eventosListPaged.load(getEventosListQuery(), { page }));

  if (state.error) { body.innerHTML = ''; return; }
  body.innerHTML = state.rows.map(renderEventoListRow).join('');
  if (window.lucide) lucide.createIcons();
}

function renderEventoListRow(evento) {
  const type = getEventoType(evento.type);
  const acc = evento.accommodation_name || AppModules.core.accommodations.find(a => a.id === evento.accommodation_id)?.name || '—';
  return `<tr>
      <td>
        <div class="eventos-date-cell">
          <strong>${AppModules.core.formatDate(evento.date)}</strong>
          <span>${formatEventoTime(evento) || 'Sem hora'}</span>
        </div>
      </td>
      <td>
        <div class="eventos-title-cell">
          <span class="eventos-pill eventos-pill-${evento.type}"><i data-lucide="${type.icon}"></i>${type.singular}</span>
          ${Number(evento.important) ? `<span class="eventos-important"><i data-lucide="circle-alert"></i> Importante</span>` : ''}
          <strong>${AppModules.core.escapeHtml(evento.title)}</strong>
          ${Number(evento.auto_generated) ? `<small>Tarefa automática da reserva</small>` : ''}
          ${evento.notes ? `<small>${AppModules.core.escapeHtml(evento.notes)}</small>` : ''}
        </div>
      </td>
      <td>${AppModules.core.escapeHtml(acc)}</td>
      <td>${AppModules.core.escapeHtml(evento.responsible || '—')}</td>
      <td>${badgeEventoStatus(evento.status)}</td>
      <td>
        <div class="eventos-row-actions">
          <button class="btn btn-ghost btn-sm" ${AppActions.attrs("click", "eventos-toggle-evento-status-b4bebd4", [String((evento.id) ?? '')])}>
            ${evento.status === 'concluido' ? AppModules.core.lcIcon('rotate-ccw', 13) + ' Planeado' : AppModules.core.lcIcon('check', 13) + ' Concluir'}
          </button>
          <button class="btn btn-ghost btn-sm" ${AppActions.attrs("click", "eventos-open-evento-modal-a2a7fbb", [String((evento.id) ?? '')])}>${AppModules.core.lcIcon('pencil', 13)} Editar</button>
          <button class="btn btn-ghost btn-sm" ${AppActions.attrs("click", "eventos-delete-evento-e910ecc", [String((evento.id) ?? '')])}>${AppModules.core.lcIcon('trash-2', 13)} Apagar</button>
        </div>
      </td>
    </tr>`;
}

// Um evento aberto/alterado pode vir da lista paginada ou do intervalo
// desenhado no calendário — procura-se nos dois.
function findEvento(id) {
  return eventosListPaged.state.rows.find(e => e.id === id)
      || eventosCalendarRange.state.rows.find(e => e.id === id)
      || eventosAgendaRange.state.rows.find(e => e.id === id)
      || null;
}

// Recarrega o que estiver visível, depois de criar/alterar/apagar.
async function refreshEventos() {
  invalidateEventosRange();
  if (eventosView === 'list') await eventosListPaged.load(getEventosListQuery(), { force: true });
  renderEventosView();
}

function attachEventosTimelinePan() {
  const wrap = document.getElementById('eventos-timeline-wrap');
  if (!wrap) return;
  wrap.removeEventListener('pointerdown', eventosPanPointerDown);
  wrap.removeEventListener('click', eventosPanClickCapture, true);
  wrap.removeEventListener('dblclick', eventosTimelineDblClick);
  wrap.addEventListener('pointerdown', eventosPanPointerDown);
  wrap.addEventListener('click', eventosPanClickCapture, true);
  wrap.addEventListener('dblclick', eventosTimelineDblClick);
}

// Duplo-clique numa zona vazia da timeline → criar evento nessa data/alojamento.
function eventosTimelineDblClick(e) {
  if (e.target.closest('.eventos-tl-block')) return; // clicar num evento já abre via onclick
  const area = e.target.closest('.tl-days-area');
  const row = e.target.closest('.tl-row');
  if (!area || !row) return;
  const dayW = getEventosDayWidth();
  const year = new Date().getFullYear();
  const rect = area.getBoundingClientRect();
  const dayIdx = Math.floor((e.clientX - rect.left) / dayW);
  if (dayIdx < 0) return;
  const d = new Date(year, 0, 1 + dayIdx);
  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  openEventoModal(null, dateStr, row.dataset.accId || null);
}

function eventosPanPointerDown(e) {
  if (e.button !== 0) return;
  const interactive = e.target.closest('button, a, input, select, textarea');
  if (interactive && !interactive.classList.contains('eventos-tl-block')) return;
  e.preventDefault();
  const wrap = e.currentTarget;
  eventosPanDrag = {
    pointerId: e.pointerId,
    startX: e.clientX,
    startY: e.clientY,
    scrollLeft: wrap.scrollLeft,
    moved: false,
    suppressClick: false,
    wrap,
  };
  wrap.setPointerCapture?.(e.pointerId);
  wrap.classList.add('tl-panning');
  document.body.classList.add('tl-is-panning');
  window.getSelection?.()?.removeAllRanges?.();
  wrap.addEventListener('pointermove', eventosPanPointerMove);
  wrap.addEventListener('pointerup', eventosPanPointerUp);
  wrap.addEventListener('pointercancel', eventosPanPointerCancel);
}

function eventosPanPointerMove(e) {
  const d = eventosPanDrag;
  if (!d) return;
  const dx = e.clientX - d.startX;
  const dy = e.clientY - d.startY;
  if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
    d.moved = true;
    d.suppressClick = true;
  }
  if (!d.moved) return;
  e.preventDefault();
  window.getSelection?.()?.removeAllRanges?.();
  d.wrap.scrollLeft = d.scrollLeft - dx;
}

function eventosPanPointerUp(e) {
  const d = eventosPanDrag;
  if (!d) return;
  cleanupEventosPan(e);
  if (d.suppressClick) {
    d.wrap.dataset.suppressClick = '1';
    setTimeout(() => {
      if (d.wrap.dataset.suppressClick === '1') delete d.wrap.dataset.suppressClick;
    }, 0);
  }
}

function eventosPanPointerCancel(e) {
  cleanupEventosPan(e);
}

function cleanupEventosPan(e) {
  const d = eventosPanDrag;
  if (!d) return;
  d.wrap.releasePointerCapture?.(d.pointerId || e?.pointerId);
  d.wrap.classList.remove('tl-panning');
  document.body.classList.remove('tl-is-panning');
  d.wrap.removeEventListener('pointermove', eventosPanPointerMove);
  d.wrap.removeEventListener('pointerup', eventosPanPointerUp);
  d.wrap.removeEventListener('pointercancel', eventosPanPointerCancel);
  eventosPanDrag = null;
}

function eventosPanClickCapture(e) {
  if (e.currentTarget.dataset.suppressClick !== '1') return;
  e.preventDefault();
  e.stopPropagation();
  delete e.currentTarget.dataset.suppressClick;
}

function accInitials(name) {
  if (!name) return '';
  return name.split(/\s+/).filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 3);
}

const DONE_CHECK = '<span class="eventos-pill-check"><i data-lucide="check"></i></span>';

function renderEventoPill(evento) {
  const type = getEventoType(evento.type);
  const done = evento.status === 'concluido';
  return `<button type="button" class="eventos-pill eventos-pill-${evento.type}${Number(evento.important) ? ' eventos-pill-important' : ''}${done ? ' eventos-pill-done' : ''}" ${AppActions.attrs("click", "eventos-stop-propagation-42fa735", [String((evento.id) ?? '')])}>
    <i data-lucide="${type.icon}"></i>${Number(evento.important) ? AppModules.core.lcIcon('circle-alert', 12) : ''}${AppModules.core.escapeHtml(evento.title)}${done ? DONE_CHECK : ''}
  </button>`;
}

function renderEventoPillCompact(evento) {
  const type = getEventoType(evento.type);
  const done = evento.status === 'concluido';
  const timeLabel = evento.start_time ? ` ${evento.start_time}` : '';
  const tooltip = AppModules.core.escapeHtml(evento.title + (evento.accommodation_name ? ` · ${evento.accommodation_name}` : '') + timeLabel + (done ? ' · concluído' : ''));
  const initials = accInitials(evento.accommodation_name);
  return `<button type="button"
    class="eventos-pill eventos-pill-${evento.type} eventos-pill-compact${Number(evento.important) ? ' eventos-pill-important' : ''}${done ? ' eventos-pill-done' : ''}"
    title="${tooltip}"
    aria-label="${tooltip}"
    ${AppActions.attrs("click", "eventos-stop-propagation-42fa735", [String((evento.id) ?? '')])}>
    <i data-lucide="${type.icon}"></i>${Number(evento.important) ? AppModules.core.lcIcon('circle-alert', 10) : ''}<span class="pill-title">${AppModules.core.escapeHtml(evento.title)}</span>${initials ? `<span class="pill-acc-name">${initials}</span>` : ''}${done ? DONE_CHECK : ''}
  </button>`;
}

// Preenche o <select> de tipo a partir de EVENT_TYPES — fonte única no frontend
// (evita manter as <option> hardcoded no index.html em sincronia).
function populateEventoTypeSelect() {
  const el = document.getElementById('evento-type');
  if (!el || el.dataset.populated === '1') return;
  const current = el.value;
  el.innerHTML = AppModules.core.EVENT_TYPES.map(t => `<option value="${t.id}">${t.singular}</option>`).join('');
  el.value = current || 'limpeza';
  el.dataset.populated = '1';
}

function openEventoModal(id = null, date = null, accId = null) {
  eventosEditingId = id;
  const evento = id ? findEvento(id) : null;
  populateEventoTypeSelect();
  populateEventosAccommodationSelects();
  populateEventosResponsibleSelect(evento?.responsible || AppModules.core.currentUser?.name || '');
  document.getElementById('evento-modal-title').textContent = evento ? 'Editar Evento' : 'Novo Evento';
  document.getElementById('evento-title').value = evento?.title || '';
  document.getElementById('evento-type').value = evento?.type || 'limpeza';
  document.getElementById('evento-status').value = evento?.status || 'planeado';
  document.getElementById('evento-date').value = window.ReservationDates?.formatPtDate(evento?.date || date || new Date().toISOString().slice(0, 10)) || '';
  document.getElementById('evento-start-time').value = evento?.start_time || '';
  document.getElementById('evento-end-time').value = evento?.end_time || '';
  document.getElementById('evento-accommodation').value = evento?.accommodation_id || accId || '';
  document.getElementById('evento-responsible').value = evento?.responsible || AppModules.core.currentUser?.name || '';
  document.getElementById('evento-notes').value = evento?.notes || '';
  const delBtn = document.getElementById('evento-delete-btn');
  if (delBtn) delBtn.style.display = evento ? '' : 'none';
  AppUI.openModal('evento-modal-bg');
  AppUI.enhanceSelects(document.getElementById('evento-modal-bg'));
  AppUI.refreshDropdowns(document.getElementById('evento-modal-bg'));
  if (window.lucide) lucide.createIcons();
}

function closeEventoModal() {
  eventosEditingId = null;
  AppUI.closeModal('evento-modal-bg');
}

async function saveEvento() {
  const btn = document.getElementById('evento-save-btn');
  const body = {
    title: document.getElementById('evento-title').value.trim(),
    type: document.getElementById('evento-type').value,
    status: document.getElementById('evento-status').value,
    date: window.ReservationDates?.normalizeIsoDate(document.getElementById('evento-date').value) || '',
    start_time: document.getElementById('evento-start-time').value || null,
    end_time: document.getElementById('evento-end-time').value || null,
    accommodation_id: document.getElementById('evento-accommodation').value || null,
    responsible: document.getElementById('evento-responsible').value.trim(),
    notes: document.getElementById('evento-notes').value.trim(),
  };
  // Mensagens específicas (ajuda a perceber qual campo está em falta) + salvaguarda na data.
  if (!body.title) {
    AppModules.core.toast('⚠️ Indica o título do evento.', 'error');
    return;
  }
  if (!body.date) {
    body.date = new Date().toISOString().slice(0, 10);
  }

  AppUI.setButtonLoading(btn, true, 'A guardar...');
  try {
    const isEdit = Boolean(eventosEditingId);
    const payload = isEdit
      ? await AppModules.core.apiPut(`/api/events/${eventosEditingId}`, body)
      : await AppModules.core.apiPost('/api/events', body);
    closeEventoModal();
    AppModules.core.toast(isEdit ? '✅ Evento atualizado.' : '✅ Evento criado.', 'success');
    await refreshEventos();
  } catch (err) {
    AppModules.core.toast('❌ ' + (err?.payload?.error || err.message || 'Erro ao guardar evento.'), 'error');
  } finally {
    AppUI.setButtonLoading(btn, false);
  }
}

async function toggleEventoStatus(id) {
  const evento = findEvento(id);
  if (!evento) return;
  try {
    await AppModules.core.apiPut(`/api/events/${id}`, { ...evento, status: evento.status === 'concluido' ? 'planeado' : 'concluido' });
    await refreshEventos();
  } catch (err) {
    AppModules.core.toast('❌ ' + (err?.payload?.error || 'Não foi possível atualizar.'), 'error');
  }
}

async function deleteEvento(id) {
  if (!confirm('Eliminar este evento?')) return;
  try {
    await AppModules.core.apiDelete(`/api/events/${id}`);
    AppModules.core.toast('Evento eliminado.', 'info');
    await refreshEventos();
  } catch (err) {
    AppModules.core.toast('❌ ' + (err?.payload?.error || 'Não foi possível eliminar.'), 'error');
  }
}

// Apagar a partir do modal (usado na vista de calendário — abre o evento e apaga).
async function deleteEventoFromModal() {
  if (!eventosEditingId) return;
  const id = eventosEditingId;
  if (!confirm('Eliminar este evento? Esta ação não pode ser desfeita.')) return;
  try {
    await AppModules.core.apiDelete(`/api/events/${id}`);
    closeEventoModal();
    AppModules.core.toast('Evento eliminado.', 'info');
    await refreshEventos();
  } catch (err) {
    AppModules.core.toast('❌ ' + (err?.payload?.error || 'Não foi possível eliminar.'), 'error');
  }
}

function populateEventosAccommodationSelects() {
  ['eventos-list-acc-filter', 'evento-accommodation'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const current = el.value;
    el.innerHTML = id === 'evento-accommodation'
      ? '<option value="">Sem alojamento</option>'
      : '<option value="">Todos os alojamentos</option>';
    AppModules.core.accommodations.forEach(a => {
      const opt = document.createElement('option');
      opt.value = a.id;
      opt.textContent = a.name;
      el.appendChild(opt);
    });
    el.value = current;
  });
}

function populateEventosResponsibleSelect(selected = '') {
  const el = document.getElementById('evento-responsible');
  if (!el) return;
  const names = Array.from(new Set([
    ...(eventosTeamMembers || []).map(member => member.name).filter(Boolean),
    AppModules.core.currentUser?.name,
    selected,
  ].filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt'));
  el.innerHTML = '<option value="">Sem responsável</option>';
  names.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    el.appendChild(opt);
  });
  el.value = selected || AppModules.core.currentUser?.name || '';
}

function eventosPrev() {
  if (eventosMode === 'timeline') {
    const wrap = document.getElementById('eventos-timeline-wrap');
    if (wrap) wrap.scrollLeft -= (wrap.clientWidth - EVENTOS_LABEL_W) * 0.7;
    return;
  }
  eventosMonth--;
  if (eventosMonth < 0) { eventosMonth = 11; eventosYear--; }
  renderEventosView();
}

function eventosNext() {
  if (eventosMode === 'timeline') {
    const wrap = document.getElementById('eventos-timeline-wrap');
    if (wrap) wrap.scrollLeft += (wrap.clientWidth - EVENTOS_LABEL_W) * 0.7;
    return;
  }
  eventosMonth++;
  if (eventosMonth > 11) { eventosMonth = 0; eventosYear++; }
  renderEventosView();
}

function eventosToday() {
  const now = new Date();
  eventosYear = now.getFullYear();
  eventosMonth = now.getMonth();
  if (eventosView === 'calendar' && eventosMode === 'timeline') {
    scrollEventosTimelineToToday(getEventosDayWidth());
    return;
  }
  renderEventosView();
}

function getEventoType(type) {
  return AppModules.core.EVENT_TYPES.find(t => t.id === type) || AppModules.core.EVENT_TYPES[AppModules.core.EVENT_TYPES.length - 1];
}

function formatEventoTime(evento) {
  if (evento.start_time && evento.end_time) return `${evento.start_time} - ${evento.end_time}`;
  return evento.start_time || evento.end_time || '';
}

function badgeEventoStatus(status) {
  const done = status === 'concluido';
  return `<span class="badge ${done ? 'badge-confirmada' : 'badge-pendente'}">${done ? 'Concluído' : 'Planeado'}</span>`;
}

// escapeHtml definido em helpers.js (carregado antes)

function isoDate(year, monthIndex, day) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

AppActions.register({
  "eventos-stop-propagation-42fa735": (el, event, args) => { event.stopPropagation();openEventoModal(args[0]) },
  "eventos-toggle-evento-status-b4bebd4": (el, event, args) => { toggleEventoStatus(args[0]) },
  "eventos-open-evento-modal-a2a7fbb": (el, event, args) => { openEventoModal(args[0]) },
  "eventos-delete-evento-e910ecc": (el, event, args) => { deleteEvento(args[0]) },
  "eventos-toggle-evento-type-chip-750c6ad": (el, event, args) => { toggleEventoTypeChip(args[0]) },
  "eventos-stop-propagation-185b92b": (el, event, args) => { event.stopPropagation();toggleEventoStatus(args[0]) },
  "eventos-scroll-to-eventos-agenda-day-a78e6ec": (el, event, args) => { scrollToEventosAgendaDay(args[0], el) },
}, "click");

AppActions.register({
  "eventos-open-evento-modal-bc5ccca": (el, event, args) => { openEventoModal(null,(String(args[0]))) },
}, "dblclick");

AppActions.register({
  "eventos-if-6aef6e2": (el, event, args) => { if(event.key==='Enter'||event.key===' '){event.preventDefault();openEventoModal(args[0]);} },
}, "keydown");

// Limpeza da funcionalidade ao sair ou trocar de organização.
AppModules.onReset('eventos.js', () => {
  eventosRenderVersion++;
  eventosTypeFilters.clear();
  eventosPanDrag = null;
  eventosEditingId = null;
  eventosTeamMembers = [];
  eventosCalendarRange.reset();
  eventosAgendaRange.reset();
  eventosListPaged.reset();
});

})();
