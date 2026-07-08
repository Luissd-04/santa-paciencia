let eventosView = SS.get('evt:view', 'calendar');
let eventosMode = SS.get('evt:mode', 'calendar');
let eventosYear = Number(SS.get('evt:year', new Date().getFullYear()));
let eventosMonth = Number(SS.get('evt:month', new Date().getMonth()));
let eventosTimelineDays = Number(SS.get('evt:tlDays', 14));
const eventosTypeFilters = new Set();
let eventosPanDrag = null;
let eventosEditingId = null;
let eventosData = [];
let eventosTeamMembers = [];
const EVENTOS_LABEL_W = 190;
const EVENTOS_ZOOM = { 7: 80, 14: 48, 30: 24 };

const EVENT_TYPES = [
  { id: 'limpeza', label: 'Limpezas', singular: 'Limpeza', icon: 'brush-cleaning', color: '#8B3A24' },
  { id: 'reuniao', label: 'Compromissos', singular: 'Compromisso', icon: 'calendar-check', color: '#4a7fa5' },
  { id: 'pequeno_almoco', label: 'Pequenos-almoços', singular: 'Pequeno-almoço', icon: 'coffee', color: '#c9a84c' },
  { id: 'checkin', label: 'Check-ins', singular: 'Check-in', icon: 'log-in', color: '#4f8f6b' },
  { id: 'checkout', label: 'Check-outs', singular: 'Check-out', icon: 'log-out', color: '#6f6bb3' },
  { id: 'manutencao', label: 'Manutenção', singular: 'Manutenção', icon: 'wrench', color: '#c46a2d' },
  { id: 'agenda_local', label: 'Agenda Local', singular: 'Evento local', icon: 'party-popper', color: '#b0468a' },
  { id: 'outro', label: 'Outros', singular: 'Outro', icon: 'circle-dot', color: '#8a8278' },
];

async function loadEventos() {
  try {
    const [payload] = await Promise.all([
      apiGet('/api/events'),
      loadEventosTeamMembers(),
    ]);
    eventosData = payload.data || [];
  } catch {
    toast('❌ Erro ao carregar eventos.', 'error');
    eventosData = [];
  }
  renderEventosView();
}

async function loadEventosTeamMembers() {
  try {
    const payload = await apiGet('/api/team/members');
    eventosTeamMembers = payload?.data?.members || [];
  } catch {
    eventosTeamMembers = currentUser ? [{ name: currentUser.name, role: currentUser.role }] : [];
  }
}

function renderEventosView() {
  SS.set('evt:view', eventosView);
  SS.set('evt:mode', eventosMode);
  SS.set('evt:year', eventosYear);
  SS.set('evt:month', eventosMonth);
  populateEventosAccommodationSelects();
  AppUI.enhanceSelects(document.getElementById('view-eventos'));
  AppUI.refreshDropdowns(document.getElementById('view-eventos'));
  updateEventosViewUi();
  updateEventosModeUi();
  if (eventosView === 'list') renderEventosList();
  else if (eventosMode === 'timeline') renderEventosTimeline();
  else renderEventosCalendar();
  renderEventosAgendaMobile();
  if (window.lucide) lucide.createIcons();
}

// No mobile, Calendário/Timeline dão lugar a uma agenda dia-a-dia
// (mesmo padrão de #calendar-agenda-mobile usado no calendário de reservas).
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
  const events = filteredEventos();
  const groups = dates.map(dateStr => {
    const dayEvents = events.filter(e => e.date === dateStr)
      .sort((a, b) => (a.start_time || '99:99').localeCompare(b.start_time || '99:99'));
    if (!dayEvents.length) return '';
    const d = new Date(dateStr + 'T12:00:00');
    let dayLabel = d.toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short' });
    if (dateStr === todayStr) dayLabel = 'Hoje · ' + dayLabel;
    return `<section class="agenda-day">
      <div class="agenda-day-title">${dayLabel}</div>
      <div class="agenda-day-list">
        ${dayEvents.map(e => {
          const type = getEventoType(e.type);
          const done = e.status === 'concluido';
          const time = formatEventoTime(e);
          return `<button type="button" class="agenda-item${done ? ' eventos-pill-done' : ''}" onclick="openEventoModal('${e.id}')" style="--agenda-color:${type.color};">
            <span class="agenda-item-dot"></span>
            <span class="agenda-item-main">
              <strong>${escapeHtml(e.title)}</strong>
              <small>${type.singular}${e.accommodation_name ? ' · ' + escapeHtml(e.accommodation_name) : ''}${time ? ' · ' + time : ''}</small>
            </span>
            <span class="agenda-item-status${done ? ' agenda-status-done' : ''}">${done ? lcIcon('check', 14) : (Number(e.important) ? '!' : '')}</span>
          </button>`;
        }).join('')}
      </div>
    </section>`;
  }).filter(Boolean);
  wrap.innerHTML = groups.join('') || `<div class="agenda-empty">Sem eventos nos próximos ${horizonDays} dias.</div>`;
  if (window.lucide) lucide.createIcons();
}

function setEventosView(view) {
  eventosView = view === 'list' ? 'list' : 'calendar';
  renderEventosView();
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
    SS.set('evt:mode', eventosMode);
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
  SS.set('evt:tlDays', eventosTimelineDays);
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
  return EVENTOS_ZOOM[eventosTimelineDays] || 48;
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

function filteredEventos() {
  return eventosData.filter(evento => eventosTypeFilters.size === 0 || eventosTypeFilters.has(evento.type));
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
    return `<div class="cal-day eventos-day${day.otherMonth ? ' other-month' : ''}${day.dateStr === todayStr ? ' today' : ''}" ondblclick="openEventoModal(null,'${day.dateStr}')">
      <div class="day-num">${day.day}</div>
      <div class="eventos-day-list">
        ${dayEvents.map(renderEventoPillCompact).join('')}
      </div>
    </div>`;
  }).join('');
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

  const filteredEvents = eventosData.filter(e =>
    (eventosTypeFilters.size === 0 || eventosTypeFilters.has(e.type)) && e.date >= startStr && e.date < endStr
  );

  const generalRow = { id: '', name: 'Sem alojamento', type: 'geral' };
  const hasGeneralEvents = filteredEvents.some(e => !e.accommodation_id);
  const alojList = eventosTypeFilters.size > 0
    ? accommodations.filter(a => filteredEvents.some(e => e.accommodation_id === a.id))
    : accommodations;
  const rowList = hasGeneralEvents ? [...alojList, generalRow] : alojList;

  // Month header cells
  let monthCells = '';
  for (let m = 0; m < 12; m++) {
    const mDays  = Math.round((new Date(year, m + 1, 1) - new Date(year, m, 1)) / 86400000);
    const mStart = `${year}-${String(m + 1).padStart(2, '0')}-01`;
    const mEnd   = m === 11 ? `${year + 1}-01-01` : `${year}-${String(m + 2).padStart(2, '0')}-01`;
    const hasToday = todayStr >= mStart && todayStr < mEnd;
    monthCells += `<div class="tl-month-head${hasToday ? ' tl-month-today' : ''}" style="width:${mDays * dayW}px;min-width:${mDays * dayW}px;">${monthNames[m]}</div>`;
  }

  // Day header cells
  let dayCells = '';
  for (let i = 0; i < totalDays; i++) {
    const d  = new Date(year, 0, 1 + i);
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const isToday      = ds === todayStr;
    const isWeekend    = d.getDay() === 0 || d.getDay() === 6;
    const isMonthStart = d.getDate() === 1 && i > 0;
    dayCells += `<div class="tl-day-head${isToday ? ' tl-today' : ''}${isWeekend ? ' tl-weekend' : ''}${isMonthStart ? ' tl-month-start' : ''}" style="width:${dayW}px;min-width:${dayW}px;">
      ${dayW >= 40 ? `<div class="tl-day-name">${dayNames[d.getDay()]}</div>` : ''}
      <div class="tl-day-num">${d.getDate()}</div>
    </div>`;
  }

  const rows = rowList.length === 0
    ? `<div style="padding:40px;text-align:center;color:var(--cinza);">Nenhum alojamento encontrado.</div>`
    : rowList.map(row => {
        let cellHtml = '';
        for (let i = 0; i < totalDays; i++) {
          const d  = new Date(year, 0, 1 + i);
          const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          const isMonthStart = d.getDate() === 1 && i > 0;
          cellHtml += `<div class="tl-cell${ds === todayStr ? ' tl-today-col' : ''}${isMonthStart ? ' tl-month-start' : ''}" style="width:${dayW}px;min-width:${dayW}px;"></div>`;
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
          const width = Math.max(18, right - left - 4);
          if (right <= 0 || left >= totalWidth || width <= 0) return '';
          const doneCls = e.status === 'concluido' ? ' eventos-tl-done' : '';
          const tlInitials = accInitials(e.accommodation_name);
          return `<div class="tl-block eventos-tl-block${doneCls}" style="left:${left}px;width:${width}px;--tl-color:${color};background:${color}18;border-color:${color}55;cursor:pointer;"
                       onclick="openEventoModal('${e.id}')"
                       title="${escapeHtml(type.singular)} · ${escapeHtml(e.title)}${e.accommodation_name ? ' · ' + escapeHtml(e.accommodation_name) : ''}">
            <div class="tl-block-header">
              <i data-lucide="${type.icon}"></i>${tlInitials ? `<span class="tl-block-initials">${tlInitials}</span>` : `<span class="tl-block-initials">${type.singular}</span>`}
            </div>
            <span class="tl-block-meta">${formatEventoTime(e) || type.singular}</span>
          </div>`;
        }).join('');

        return `<div class="tl-row"
                     data-acc-id="${row.id}"
                     data-acc-name="${escapeHtml(row.name)}">
          <div class="tl-label" style="min-width:${EVENTOS_LABEL_W}px;max-width:${EVENTOS_LABEL_W}px;">
            <div class="tl-label-title">${escapeHtml(row.name)}</div>
            <div class="tl-label-sub">${row.type || 'alojamento'} · ${monthCount} evento${monthCount !== 1 ? 's' : ''} este mês</div>
          </div>
          <div class="tl-days-area" style="width:${totalDays * dayW}px;flex:none;">
            <div class="tl-cells">${cellHtml}</div>
            ${blocks}
          </div>
        </div>`;
      }).join('');

  const totalW = EVENTOS_LABEL_W + totalDays * dayW;
  wrap.innerHTML = `
    <div class="timeline-scroll" style="min-width:${totalW}px;">
      <div class="tl-header">
        <div class="tl-label tl-header-label" style="min-width:${EVENTOS_LABEL_W}px;max-width:${EVENTOS_LABEL_W}px;">Alojamento</div>
        <div class="tl-header-cols">
          <div class="tl-months-row">${monthCells}</div>
          <div class="tl-days-row">${dayCells}</div>
        </div>
      </div>
      <div class="tl-body">${rows}</div>
    </div>`;

  attachEventosTimelinePan();
  if (autoScroll) scheduleEventosTimelineTodayScroll(dayW);
  if (window.lucide) lucide.createIcons();
}

function renderEventosTypeChips() {
  const html = EVENT_TYPES.map(t => {
    const active = eventosTypeFilters.has(t.id);
    return `<button class="evt-type-chip${active ? ' active' : ''}" style="--chip-color:${t.color}" onclick="toggleEventoTypeChip('${t.id}')" title="${t.label}">
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
  if (eventosView === 'list') renderEventosList();
  else if (eventosMode === 'timeline') renderEventosTimeline();
  else renderEventosCalendar();
  // No mobile o que está visível é a agenda, não o calendário/timeline
  renderEventosAgendaMobile();
}

function renderEventosList() {
  renderEventosTypeChips();
  const body = document.getElementById('eventos-list-body');
  const empty = document.getElementById('eventos-list-empty');
  if (!body) return;
  const rows = getEventosListFiltered();
  if (!rows.length) {
    body.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';
  body.innerHTML = rows.map(evento => {
    const type = getEventoType(evento.type);
    const acc = evento.accommodation_name || accommodations.find(a => a.id === evento.accommodation_id)?.name || '—';
    return `<tr>
      <td>
        <div class="eventos-date-cell">
          <strong>${formatDate(evento.date)}</strong>
          <span>${formatEventoTime(evento) || 'Sem hora'}</span>
        </div>
      </td>
      <td>
        <div class="eventos-title-cell">
          <span class="eventos-pill eventos-pill-${evento.type}"><i data-lucide="${type.icon}"></i>${type.singular}</span>
          ${Number(evento.important) ? `<span class="eventos-important"><i data-lucide="circle-alert"></i> Importante</span>` : ''}
          <strong>${escapeHtml(evento.title)}</strong>
          ${Number(evento.auto_generated) ? `<small>Tarefa automática da reserva</small>` : ''}
          ${evento.notes ? `<small>${escapeHtml(evento.notes)}</small>` : ''}
        </div>
      </td>
      <td>${escapeHtml(acc)}</td>
      <td>${escapeHtml(evento.responsible || '—')}</td>
      <td>${badgeEventoStatus(evento.status)}</td>
      <td>
        <div class="eventos-row-actions">
          <button class="btn btn-ghost btn-sm" onclick="toggleEventoStatus('${evento.id}')">
            ${evento.status === 'concluido' ? lcIcon('rotate-ccw', 13) + ' Planeado' : lcIcon('check', 13) + ' Concluir'}
          </button>
          <button class="btn btn-ghost btn-sm" onclick="openEventoModal('${evento.id}')">${lcIcon('pencil', 13)} Editar</button>
          <button class="btn btn-ghost btn-sm" onclick="deleteEvento('${evento.id}')">${lcIcon('trash-2', 13)} Apagar</button>
        </div>
      </td>
    </tr>`;
  }).join('');
  if (window.lucide) lucide.createIcons();
}

function getEventosListFiltered() {
  const q = (document.getElementById('eventos-search')?.value || '').toLowerCase();
  const acc = document.getElementById('eventos-list-acc-filter')?.value || '';
  const status = document.getElementById('eventos-list-status-filter')?.value || '';
  const range = document.getElementById('eventos-list-date-filter')?.value || '';
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const weekEnd = new Date(today); weekEnd.setDate(today.getDate() + 7);
  const monthStr = todayStr.slice(0, 7);

  return eventosData.filter(e => {
    const hay = `${e.title || ''} ${e.responsible || ''} ${e.notes || ''} ${e.accommodation_name || ''}`.toLowerCase();
    if (q && !hay.includes(q)) return false;
    if (eventosTypeFilters.size > 0 && !eventosTypeFilters.has(e.type)) return false;
    if (acc && e.accommodation_id !== acc) return false;
    if (status && e.status !== status) return false;
    if (range === 'today' && e.date !== todayStr) return false;
    if (range === 'week' && (e.date < todayStr || e.date > weekEnd.toISOString().slice(0, 10))) return false;
    if (range === 'month' && e.date.slice(0, 7) !== monthStr) return false;
    if (range === 'upcoming' && e.date < todayStr) return false;
    return true;
  }).sort((a, b) => (a.date + (a.start_time || '99:99')).localeCompare(b.date + (b.start_time || '99:99')));
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
  return `<button type="button" class="eventos-pill eventos-pill-${evento.type}${Number(evento.important) ? ' eventos-pill-important' : ''}${done ? ' eventos-pill-done' : ''}" onclick="event.stopPropagation();openEventoModal('${evento.id}')">
    <i data-lucide="${type.icon}"></i>${Number(evento.important) ? lcIcon('circle-alert', 12) : ''}${escapeHtml(evento.title)}${done ? DONE_CHECK : ''}
  </button>`;
}

function renderEventoPillCompact(evento) {
  const type = getEventoType(evento.type);
  const done = evento.status === 'concluido';
  const timeLabel = evento.start_time ? ` ${evento.start_time}` : '';
  const tooltip = escapeHtml(evento.title + (evento.accommodation_name ? ` · ${evento.accommodation_name}` : '') + timeLabel + (done ? ' · concluído' : ''));
  const initials = accInitials(evento.accommodation_name);
  return `<button type="button"
    class="eventos-pill eventos-pill-${evento.type} eventos-pill-compact${Number(evento.important) ? ' eventos-pill-important' : ''}${done ? ' eventos-pill-done' : ''}"
    title="${tooltip}"
    aria-label="${tooltip}"
    onclick="event.stopPropagation();openEventoModal('${evento.id}')">
    <i data-lucide="${type.icon}"></i>${Number(evento.important) ? lcIcon('circle-alert', 10) : ''}${initials ? `<span class="pill-acc-name">${initials}</span>` : ''}${done ? DONE_CHECK : ''}
  </button>`;
}

// Preenche o <select> de tipo a partir de EVENT_TYPES — fonte única no frontend
// (evita manter as <option> hardcoded no index.html em sincronia).
function populateEventoTypeSelect() {
  const el = document.getElementById('evento-type');
  if (!el || el.dataset.populated === '1') return;
  const current = el.value;
  el.innerHTML = EVENT_TYPES.map(t => `<option value="${t.id}">${t.singular}</option>`).join('');
  el.value = current || 'limpeza';
  el.dataset.populated = '1';
}

function openEventoModal(id = null, date = null, accId = null) {
  eventosEditingId = id;
  const evento = id ? eventosData.find(e => e.id === id) : null;
  populateEventoTypeSelect();
  populateEventosAccommodationSelects();
  populateEventosResponsibleSelect(evento?.responsible || currentUser?.name || '');
  document.getElementById('evento-modal-title').textContent = evento ? 'Editar Evento' : 'Novo Evento';
  document.getElementById('evento-title').value = evento?.title || '';
  document.getElementById('evento-type').value = evento?.type || 'limpeza';
  document.getElementById('evento-status').value = evento?.status || 'planeado';
  document.getElementById('evento-date').value = evento?.date || date || new Date().toISOString().slice(0, 10);
  document.getElementById('evento-start-time').value = evento?.start_time || '';
  document.getElementById('evento-end-time').value = evento?.end_time || '';
  document.getElementById('evento-accommodation').value = evento?.accommodation_id || accId || '';
  document.getElementById('evento-responsible').value = evento?.responsible || currentUser?.name || '';
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
    date: document.getElementById('evento-date').value,
    start_time: document.getElementById('evento-start-time').value || null,
    end_time: document.getElementById('evento-end-time').value || null,
    accommodation_id: document.getElementById('evento-accommodation').value || null,
    responsible: document.getElementById('evento-responsible').value.trim(),
    notes: document.getElementById('evento-notes').value.trim(),
  };
  // Mensagens específicas (ajuda a perceber qual campo está em falta) + salvaguarda na data.
  if (!body.title) {
    toast('⚠️ Indica o título do evento.', 'error');
    return;
  }
  if (!body.date) {
    body.date = new Date().toISOString().slice(0, 10);
  }

  AppUI.setButtonLoading(btn, true, 'A guardar...');
  try {
    const isEdit = Boolean(eventosEditingId);
    const payload = isEdit
      ? await apiPut(`/api/events/${eventosEditingId}`, body)
      : await apiPost('/api/events', body);
    const saved = payload.data;
    const idx = eventosData.findIndex(e => e.id === saved.id);
    if (idx >= 0) eventosData[idx] = { ...eventosData[idx], ...saved };
    else eventosData.push(saved);
    closeEventoModal();
    toast(isEdit ? '✅ Evento atualizado.' : '✅ Evento criado.', 'success');
    await loadEventos();
  } catch (err) {
    toast('❌ ' + (err?.payload?.error || err.message || 'Erro ao guardar evento.'), 'error');
  } finally {
    AppUI.setButtonLoading(btn, false);
  }
}

async function toggleEventoStatus(id) {
  const evento = eventosData.find(e => e.id === id);
  if (!evento) return;
  try {
    await apiPut(`/api/events/${id}`, { ...evento, status: evento.status === 'concluido' ? 'planeado' : 'concluido' });
    await loadEventos();
  } catch (err) {
    toast('❌ ' + (err?.payload?.error || 'Não foi possível atualizar.'), 'error');
  }
}

async function deleteEvento(id) {
  if (!confirm('Eliminar este evento?')) return;
  try {
    await apiDelete(`/api/events/${id}`);
    toast('Evento eliminado.', 'info');
    await loadEventos();
  } catch (err) {
    toast('❌ ' + (err?.payload?.error || 'Não foi possível eliminar.'), 'error');
  }
}

// Apagar a partir do modal (usado na vista de calendário — abre o evento e apaga).
async function deleteEventoFromModal() {
  if (!eventosEditingId) return;
  const id = eventosEditingId;
  if (!confirm('Eliminar este evento? Esta ação não pode ser desfeita.')) return;
  try {
    await apiDelete(`/api/events/${id}`);
    closeEventoModal();
    toast('Evento eliminado.', 'info');
    await loadEventos();
  } catch (err) {
    toast('❌ ' + (err?.payload?.error || 'Não foi possível eliminar.'), 'error');
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
    accommodations.forEach(a => {
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
    currentUser?.name,
    selected,
  ].filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt'));
  el.innerHTML = '<option value="">Sem responsável</option>';
  names.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    el.appendChild(opt);
  });
  el.value = selected || currentUser?.name || '';
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
  return EVENT_TYPES.find(t => t.id === type) || EVENT_TYPES[EVENT_TYPES.length - 1];
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
