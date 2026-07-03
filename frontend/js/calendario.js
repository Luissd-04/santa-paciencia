let calMode = SS.get('calMode', 'calendar');
let tlPointerDrag = null;
let tlPanDrag = null;
let timelineDays  = SS.get('tlDays', 14);
const TL_LABEL_W  = 190;
const TL_ZOOM     = { 7: 80, 14: 48, 30: 24 };

function getCalendarFilters() {
  return {
    suite: document.getElementById('cal-suite-filter')?.value || '',
    status: document.getElementById('cal-status-filter')?.value || '',
    channel: document.getElementById('cal-channel-filter')?.value || '',
  };
}

function reservationMatchesCalendarFilters(r, filters) {
  if (r.status === 'cancelada') return false;
  if (filters.suite && r.accommodation_id !== filters.suite) return false;
  if (filters.status && r.status !== filters.status) return false;
  if (filters.channel && r.channel !== filters.channel) return false;
  return true;
}

function shortDatePt(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' });
}

// Nomes das suítes de uma reserva. Reservas multi-suíte guardam accommodations_data
// (array com várias suítes); as normais têm apenas accommodation_id/name.
function calReservationSuites(r) {
  let accs = [];
  try {
    accs = typeof r.accommodations_data === 'string'
      ? JSON.parse(r.accommodations_data || '[]')
      : (r.accommodations_data || []);
  } catch { accs = []; }
  if (Array.isArray(accs) && accs.length > 1) {
    return accs.map(a => a.name || accommodations.find(x => x.id === a.accommodation_id)?.name || '—');
  }
  return [r.accommodation_name || accommodations.find(a => a.id === r.accommodation_id)?.name || '—'];
}

function updateTimelineRangeUi() {
  document.querySelectorAll('#timeline-range-toggle .cal-mode-btn').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.range) === timelineDays);
  });
}

function updateCalendarModeUi() {
  document.querySelectorAll('[data-mode]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === calMode);
  });
}

function updateCalendarLegendUi() {
  const statusFilter = document.getElementById('cal-status-filter')?.value || '';
  document.getElementById('legend-confirmada')?.classList.toggle('active', statusFilter === 'confirmada');
  document.getElementById('legend-pendente')?.classList.toggle('active', statusFilter === 'pendente');
}

function toggleCalendarLegendFilter(status) {
  const select = document.getElementById('cal-status-filter');
  if (!select) return;
  select.value = select.value === status ? '' : status;
  AppUI.refreshSelect(select);
  updateCalendarLegendUi();
  renderCalView();
}

function setTimelineRange(days) {
  const wrap = document.getElementById('timeline-wrap');
  const oldDayW = getTimelineDayWidth();
  const centerOffset = wrap ? wrap.scrollLeft + (wrap.clientWidth - TL_LABEL_W) / 2 - TL_LABEL_W : 0;
  const centerDayIdx = oldDayW > 0 ? centerOffset / oldDayW : 0;

  timelineDays = Number(days);
  SS.set('tlDays', timelineDays);
  updateTimelineRangeUi();

  if (calMode === 'timeline') {
    const newDayW = getTimelineDayWidth();
    renderTimeline(false);
    requestAnimationFrame(() => {
      if (wrap) wrap.scrollLeft = TL_LABEL_W + centerDayIdx * newDayW - (wrap.clientWidth - TL_LABEL_W) / 2;
    });
  }
}

function getTimelineDayWidth() {
  return TL_ZOOM[timelineDays] || 48;
}

function scrollTimelineToToday(dayW) {
  const wrap = document.getElementById('timeline-wrap');
  if (!wrap) return;
  const today = new Date();
  const yearStart = new Date(today.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((today - yearStart) / 86400000);
  const todayX = TL_LABEL_W + dayOfYear * dayW;
  wrap.scrollLeft = Math.max(0, todayX - TL_LABEL_W - 2 * dayW);
}

// ── PUBLIC ENTRY POINT ──
function renderCalView() {
  const filterEl    = document.getElementById('cal-status-filter');

  const calWrap     = document.querySelector('.cal-wrap');
  const agendaWrap  = document.getElementById('calendar-agenda-mobile');
  const tlWrap      = document.getElementById('timeline-wrap');
  const rangeToggle = document.getElementById('timeline-range-toggle');
  const toTimeline  = calMode === 'timeline';

  if (calWrap)     calWrap.style.display     = toTimeline ? 'none' : '';
  if (tlWrap)      tlWrap.style.display      = toTimeline ? '' : 'none';
  if (agendaWrap)  agendaWrap.style.display  = toTimeline ? 'none' : '';
  if (rangeToggle) rangeToggle.style.display = toTimeline ? '' : 'none';

  document.querySelector('.section-card-calendar')?.classList.toggle('is-timeline-mode', toTimeline);
  updateCalendarModeUi();
  if (toTimeline) { updateTimelineRangeUi(); updateTimelineLabel(); renderTimeline(); }
  else renderCal();
  requestAnimationFrame(movePill);
}

function movePill() {
  const pill = document.getElementById('cal-mode-pill');
  const mainToggle = document.getElementById('cal-main-toggle');
  if (!pill || !mainToggle) return;
  const activeBtn = mainToggle.querySelector(`.cal-mode-btn[data-mode="${calMode}"]`);
  if (!activeBtn) return;
  const toggleRect = mainToggle.getBoundingClientRect();
  const btnRect = activeBtn.getBoundingClientRect();
  pill.style.left  = (btnRect.left - toggleRect.left) + 'px';
  pill.style.width = btnRect.width + 'px';
}

function setCalMode(m) {
  calMode = m;
  SS.set('calMode', m);
  updateCalendarModeUi();
  movePill();
  document.querySelector('.section-card-calendar')?.classList.toggle('is-timeline-mode', m === 'timeline');

  const calWrap     = document.querySelector('.cal-wrap');
  const agendaWrap  = document.getElementById('calendar-agenda-mobile');
  const tlWrap      = document.getElementById('timeline-wrap');
  const rangeToggle = document.getElementById('timeline-range-toggle');
  const toTimeline  = m === 'timeline';

  const outgoing  = toTimeline ? calWrap : tlWrap;
  const incoming  = toTimeline ? tlWrap  : calWrap;
  const exitAnim  = toTimeline ? 'cal-slide-exit-left'   : 'cal-slide-exit-right';
  const enterAnim = toTimeline ? 'cal-slide-enter-right' : 'cal-slide-enter-left';

  outgoing.classList.add(exitAnim);
  if (agendaWrap) agendaWrap.style.display = toTimeline ? 'none' : '';

  if (!toTimeline && rangeToggle) rangeToggle.style.display = 'none';

  setTimeout(() => {
    outgoing.style.display = 'none';
    outgoing.classList.remove(exitAnim);

    incoming.style.display = '';
    void incoming.offsetWidth;
    incoming.classList.add(enterAnim);
    setTimeout(() => incoming.classList.remove(enterAnim), 280);

    if (toTimeline && rangeToggle) {
      rangeToggle.style.display = '';
      void rangeToggle.offsetWidth;
      rangeToggle.classList.add('tl-range-enter');
      setTimeout(() => rangeToggle.classList.remove('tl-range-enter'), 280);
      updateTimelineRangeUi();
      updateTimelineLabel();
      renderTimeline();
    } else {
      renderCal();
    }
  }, 190);
}

// ── CALENDAR ──
function renderCal() {
  SS.set('calYear', calYear);
  SS.set('calMonth', calMonth);
  const filters = getCalendarFilters();
  updateCalendarLegendUi();
  const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  document.getElementById('cal-label').textContent = months[calMonth] + ' ' + calYear;

  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInM  = new Date(calYear, calMonth + 1, 0).getDate();
  const prevDays = new Date(calYear, calMonth, 0).getDate();
  const todayStr = now.toISOString().slice(0, 10);

  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';

  // Build all visible days (prev-month padding + current month + next-month padding)
  const allDays = [];

  for (let i = firstDay - 1; i >= 0; i--) {
    const dayNum = prevDays - i;
    const pm = calMonth === 0 ? 11 : calMonth - 1;
    const py = calMonth === 0 ? calYear - 1 : calYear;
    allDays.push({ dateStr: `${py}-${String(pm+1).padStart(2,'0')}-${String(dayNum).padStart(2,'0')}`, dayNum, otherMonth: true });
  }
  for (let d = 1; d <= daysInM; d++) {
    const dateStr = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    allDays.push({ dateStr, dayNum: d, otherMonth: false, isToday: dateStr === todayStr });
  }
  const total  = firstDay + daysInM;
  const remain = total % 7 === 0 ? 0 : 7 - (total % 7);
  for (let i = 1; i <= remain; i++) {
    const nm = calMonth === 11 ? 0 : calMonth + 1;
    const ny = calMonth === 11 ? calYear + 1 : calYear;
    allDays.push({ dateStr: `${ny}-${String(nm+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`, dayNum: i, otherMonth: true });
  }

  // Reservations visible in this calendar view, sorted longest-first for better lane packing
  const visStart = allDays[0].dateStr;
  const visEnd   = allDays[allDays.length - 1].dateStr;
  const visReservas = reservas.filter(r => {
    if (!reservationMatchesCalendarFilters(r, filters)) return false;
    return r.check_out >= visStart && r.check_in <= visEnd;
  }).sort((a, b) => {
    const lenA = new Date(a.check_out) - new Date(a.check_in);
    const lenB = new Date(b.check_out) - new Date(b.check_in);
    return lenA !== lenB ? lenB - lenA : a.check_in.localeCompare(b.check_in);
  });

  const MAX_LANES = 3;

  for (let w = 0; w < allDays.length; w += 7) {
    const week     = allDays.slice(w, w + 7);
    const weekStart = week[0].dateStr;
    const weekEnd   = week[6].dateStr;

    // Reservations overlapping this week
    const weekRes = visReservas.filter(r => r.check_out >= weekStart && r.check_in <= weekEnd);

    // Greedy lane assignment: each lane holds non-overlapping reservations
    const lanes = [];
    weekRes.forEach(r => {
      const effStart = r.check_in  < weekStart ? weekStart : r.check_in;
      const effEnd   = r.check_out > weekEnd   ? weekEnd   : r.check_out;
      let placed = false;
      for (let l = 0; l < lanes.length; l++) {
        const last = lanes[l][lanes[l].length - 1];
        // Two reservations can share a lane when A ends in this week, B starts in this week,
        // and B's bar (starting at mid check-in) begins at or after A's bar (ending at mid check-out).
        const aEndsInWeek   = last.r.check_out <= weekEnd;
        const bStartsInWeek = r.check_in >= weekStart;
        if (aEndsInWeek && bStartsInWeek && effStart >= last.effEnd) {
          lanes[l].push({ r, effStart, effEnd }); placed = true; break;
        }
      }
      if (!placed) lanes.push([{ r, effStart, effEnd }]);
    });

    // Day cells — just the day number, click opens new-reservation modal
    const dayCells = week.map(day => {
      const click = day.otherMonth ? '' : `onclick="openModalFromCalendar('${day.dateStr}')"`;
      return `<div class="cal-day${day.otherMonth ? ' other-month' : ''}${day.isToday ? ' today' : ''}" ${click}>
        <div class="day-num">${day.dayNum}</div>
      </div>`;
    }).join('');

    // Event spans — absolutely positioned so bars start/end at the midpoint of each day column
    let eventHtml = '';
    const visLanes = Math.min(lanes.length, MAX_LANES);
    const LANE_H = 20, LANE_GAP = 2, MAX_SUITE_ROWS = 3;

    // Altura de cada lane = maior barra nela. Reservas multi-suíte ocupam a
    // espessura de várias reservas (uma linha por suíte).
    const laneRows = l => Math.max(1, ...lanes[l].map(({ r }) => Math.min(calReservationSuites(r).length, MAX_SUITE_ROWS)));
    const laneTops = [];
    let stackTop = 0;
    for (let l = 0; l < visLanes; l++) {
      laneTops[l] = stackTop;
      stackTop += laneRows(l) * LANE_H + LANE_GAP;
    }

    for (let l = 0; l < visLanes; l++) {
      for (const { r, effStart, effEnd } of lanes[l]) {
        const accom      = accommodations.find(a => a.id === r.accommodation_id);
        const color      = accom?.color || '#843424';
        const statusCls  = r.status === 'pendente' ? 'cal-event-pending' : 'cal-event-confirmed';
        const col0       = week.findIndex(d => d.dateStr === effStart); // 0-indexed
        const col1       = week.findIndex(d => d.dateStr === effEnd);   // 0-indexed
        const startsHere = r.check_in  >= weekStart;
        const endsHere   = r.check_out <= weekEnd;
        const sameDay    = col0 === col1 && startsHere && endsHere;
        // Bar starts at midpoint of check-in column, ends at midpoint of check-out column.
        // For same-day bookings fall back to a full column.
        const leftPct  = sameDay ? col0 / 7 * 100 : (startsHere ? (col0 + 0.5) / 7 * 100 : 0);
        const rightPct = sameDay ? (col0 + 1) / 7 * 100 : (endsHere ? (col1 + 0.5) / 7 * 100 : 100);
        const widthPct = rightPct - leftPct;
        const roundCls   = (startsHere ? 'cal-span-round-left ' : '') + (endsHere ? 'cal-span-round-right' : '');
        const borderLeft = startsHere ? `3px solid ${color}` : '3px solid transparent';
        const topPx      = laneTops[l];
        const suites     = calReservationSuites(r);
        const isMulti    = suites.length > 1;
        const barH       = Math.min(suites.length, MAX_SUITE_ROWS) * LANE_H;
        const firstName  = r.guest_name.split(' ')[0];
        const inner      = isMulti
          ? `<span class="cal-span-text cal-span-multi"><span class="cal-span-guest">${firstName}</span>${suites.slice(0, MAX_SUITE_ROWS).map(s => `<span class="cal-span-suite">${s.replace('Suite ','')}</span>`).join('')}</span>`
          : `<span class="cal-span-text">${firstName} · ${r.accommodation_name.replace('Suite ','')}</span>`;
        eventHtml += `<div class="cal-event-span ${statusCls} ${roundCls}${isMulti ? ' cal-event-multi' : ''}"
          style="left:${leftPct.toFixed(2)}%;width:${widthPct.toFixed(2)}%;top:${topPx}px;height:${barH}px;background:${color}22;color:${color};border-left:${borderLeft};"
          onclick="event.stopPropagation();showDetail('${r.id}')"
          title="${r.guest_name} — ${suites.join(' + ')}">
          ${inner}
        </div>`;
      }
    }

    // "+N mais" per-day overflow indicator when lanes exceed MAX_LANES
    if (lanes.length > MAX_LANES) {
      week.forEach((day, col) => {
        const extra = lanes.slice(MAX_LANES).filter(lane =>
          lane.some(({effStart, effEnd}) => day.dateStr >= effStart && day.dateStr <= effEnd)
        ).length;
        if (extra > 0) {
          eventHtml += `<div class="cal-event-more" style="left:${(col/7*100).toFixed(2)}%;width:${(100/7).toFixed(2)}%;top:${stackTop}px;" onclick="event.stopPropagation()">+${extra} mais</div>`;
        }
      });
    }

    const containerH = stackTop + (lanes.length > MAX_LANES ? LANE_H + LANE_GAP : 0);
    const clickOverlays = week.map((day, col) =>
      day.otherMonth ? '' : `<div class="cal-day-click-area" style="left:${(col/7*100).toFixed(2)}%;width:${(100/7).toFixed(2)}%;" onclick="openModalFromCalendar('${day.dateStr}')"></div>`
    ).join('');
    const eventsRow  = `<div class="cal-week-events" style="height:${containerH}px;">${clickOverlays}${eventHtml}</div>`;
    const colSeps    = [1,2,3,4,5,6].map(i => `<div class="cal-col-sep" style="left:calc(${i}*100%/7)"></div>`).join('');
    grid.innerHTML += `<div class="cal-week">${colSeps}<div class="cal-week-days">${dayCells}</div>${eventsRow}</div>`;
  }

  renderCalendarAgenda(allDays.filter(day => !day.otherMonth).map(day => day.dateStr), filters);
}

function renderCalendarAgenda(monthDays, filters = getCalendarFilters()) {
  const agenda = document.getElementById('calendar-agenda-mobile');
  if (!agenda) return;

  const monthReservations = reservas
    .filter(r => reservationMatchesCalendarFilters(r, filters))
    .filter(r => r.check_out >= monthDays[0] && r.check_in <= monthDays[monthDays.length - 1])
    .sort((a, b) => a.check_in.localeCompare(b.check_in) || a.check_out.localeCompare(b.check_out));

  const groups = monthDays.map(dateStr => {
    const dayReservations = monthReservations.filter(r => r.check_in <= dateStr && r.check_out >= dateStr);
    if (!dayReservations.length) return '';
    const date = new Date(`${dateStr}T12:00:00`);
    const dayLabel = date.toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short' });
    return `<section class="agenda-day">
      <div class="agenda-day-title">${dayLabel}</div>
      <div class="agenda-day-list">
        ${dayReservations.map(r => {
          const accommodation = accommodations.find(a => a.id === r.accommodation_id);
          const color = accommodation?.color || '#843424';
          const isCheckIn = r.check_in === dateStr;
          const isCheckOut = r.check_out === dateStr;
          const marker = isCheckIn ? 'Check-in' : isCheckOut ? 'Check-out' : 'Estadia';
          return `<button type="button" class="agenda-item" onclick="showDetail('${r.id}')" style="--agenda-color:${color};">
            <span class="agenda-item-dot"></span>
            <span class="agenda-item-main">
              <strong>${r.guest_name || 'Reserva'}</strong>
              <small>${r.accommodation_name || accommodation?.name || 'Alojamento'} · ${marker}</small>
            </span>
            <span class="agenda-item-status">${r.status || '—'}</span>
          </button>`;
        }).join('')}
      </div>
    </section>`;
  }).filter(Boolean);

  agenda.innerHTML = groups.join('') || `<div class="agenda-empty">Sem reservas visíveis neste mês.</div>`;
  if (window.lucide) lucide.createIcons();
}

function calPrev() {
  if (calMode === 'timeline') {
    const wrap = document.getElementById('timeline-wrap');
    if (wrap) wrap.scrollLeft -= (wrap.clientWidth - TL_LABEL_W) * 0.7;
    return;
  }
  calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } renderCal();
}

function calNext() {
  if (calMode === 'timeline') {
    const wrap = document.getElementById('timeline-wrap');
    if (wrap) wrap.scrollLeft += (wrap.clientWidth - TL_LABEL_W) * 0.7;
    return;
  }
  calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } renderCal();
}

function goToday() {
  if (calMode === 'timeline') {
    scrollTimelineToToday(getTimelineDayWidth());
    return;
  }
  calYear = now.getFullYear(); calMonth = now.getMonth(); renderCal();
}

// ── TIMELINE ──
function updateTimelineLabel() {
  const label = document.getElementById('cal-label');
  if (label) label.textContent = `Timeline ${new Date().getFullYear()}`;
}

function renderTimeline(autoScroll = true) {
  SS.set('tlDays', timelineDays);
  const wrap = document.getElementById('timeline-wrap');
  if (!wrap) return;

  const dayW    = getTimelineDayWidth();
  const filters = getCalendarFilters();
  updateCalendarLegendUi();
  const filteredReservations = reservas.filter(r => reservationMatchesCalendarFilters(r, filters));
  const alojList = filters.suite
    ? accommodations.filter(a => a.id === filters.suite)
    : accommodations;

  const now       = new Date();
  const year      = now.getFullYear();
  const yearStart = new Date(year, 0, 1);
  const totalDays = Math.round((new Date(year + 1, 0, 1) - yearStart) / 86400000);
  const todayStr  = now.toISOString().slice(0, 10);
  const startStr  = `${year}-01-01`;
  const endStr    = `${year + 1}-01-01`;
  const curMonthStart = `${year}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const curMonthEnd   = (() => { const d = new Date(year, now.getMonth() + 1, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; })();

  const dayNames   = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  // Month header cells
  let monthCells = '';
  for (let m = 0; m < 12; m++) {
    const mDays    = Math.round((new Date(year, m + 1, 1) - new Date(year, m, 1)) / 86400000);
    const mStart   = `${year}-${String(m + 1).padStart(2, '0')}-01`;
    const mEnd     = m === 11 ? `${year + 1}-01-01` : `${year}-${String(m + 2).padStart(2, '0')}-01`;
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

  const ACCOM_COLOR = {};
  accommodations.forEach(a => { ACCOM_COLOR[a.id] = a.color || '#843424'; });

  const rows = alojList.length === 0
    ? `<div style="padding:40px;text-align:center;color:var(--cinza);">Nenhum alojamento encontrado.</div>`
    : alojList.map(a => {
        let cellHtml = '';
        for (let i = 0; i < totalDays; i++) {
          const d  = new Date(year, 0, 1 + i);
          const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          const isMonthStart = d.getDate() === 1 && i > 0;
          cellHtml += `<div class="tl-cell${ds === todayStr ? ' tl-today-col' : ''}${isMonthStart ? ' tl-month-start' : ''}" style="width:${dayW}px;min-width:${dayW}px;" onclick="openModalFromCalendar('${ds}','${a.id}')"></div>`;
        }

        const alojReservas = filteredReservations.filter(r =>
          r.accommodation_id === a.id &&
          r.check_out > startStr &&
          r.check_in  < endStr
        );

        const monthCount = alojReservas.filter(r =>
          r.check_out > curMonthStart && r.check_in < curMonthEnd
        ).length;

        const blocks = alojReservas.map(r => {
          const ci     = new Date(r.check_in  + 'T00:00:00');
          const co     = new Date(r.check_out + 'T00:00:00');
          const offset = Math.round((ci - yearStart) / 86400000);
          const nights = Math.round((co - ci) / 86400000);
          const totalWidth = totalDays * dayW;
          const left  = Math.max(0, offset * dayW + dayW / 2);
          const right = Math.min(totalWidth, (offset + nights) * dayW + dayW / 2);
          const width = Math.max(18, right - left - 4);
          if (right <= 0 || left >= totalWidth || width <= 0) return '';
          const bg = ACCOM_COLOR[r.accommodation_id] || '#843424';
          return `<div class="tl-block tl-block-${r.status}" style="left:${left}px;width:${width}px;--tl-color:${bg};background:${bg}18;border-color:${bg}55;"
                       data-res-id="${r.id}"
                       data-acc-id="${r.accommodation_id}"
                       onpointerdown="tlPointerDown(event,'${r.id}','move')"
                       title="${r.guest_name} · ${r.check_in} → ${r.check_out}">
            <div class="tl-resize-handle tl-resize-left" onpointerdown="event.stopPropagation();tlPointerDown(event,'${r.id}','resize-left')"></div>
            <div class="tl-block-main">
              <span class="tl-block-name">${r.guest_name.split(' ')[0]}</span>
              <span class="tl-block-status" style="color:${bg};">${r.status}</span>
            </div>
            <span class="tl-block-meta">${shortDatePt(r.check_in)} → ${shortDatePt(r.check_out)} · ${nights} noite${nights !== 1 ? 's' : ''}</span>
            <div class="tl-resize-handle tl-resize-right" onpointerdown="event.stopPropagation();tlPointerDown(event,'${r.id}','resize-right')"></div>
          </div>`;
        }).join('');

        return `<div class="tl-row"
                     data-acc-id="${a.id}"
                     data-acc-name="${a.name.replace(/"/g, '&quot;')}">
          <div class="tl-label" style="min-width:${TL_LABEL_W}px;max-width:${TL_LABEL_W}px;">
            <div class="tl-label-title">${a.name}</div>
            <div class="tl-label-sub">${a.type || 'alojamento'} · ${monthCount} reserva${monthCount !== 1 ? 's' : ''} este mês</div>
          </div>
          <div class="tl-days-area" style="width:${totalDays * dayW}px;flex:none;">
            <div class="tl-cells">${cellHtml}</div>
            ${typeof blockBandsHtml === 'function' ? blockBandsHtml(a.id, yearStart, totalDays, dayW) : ''}
            ${blocks}
          </div>
        </div>`;
      }).join('');

  const totalW = TL_LABEL_W + totalDays * dayW;

  wrap.innerHTML = `
    <div class="timeline-scroll" style="min-width:${totalW}px;">
      <div class="tl-header">
        <div class="tl-label tl-header-label" style="min-width:${TL_LABEL_W}px;max-width:${TL_LABEL_W}px;">Alojamento</div>
        <div class="tl-header-cols">
          <div class="tl-months-row">${monthCells}</div>
          <div class="tl-days-row">${dayCells}</div>
        </div>
      </div>
      <div class="tl-body">${rows}</div>
    </div>`;

  if (window.lucide) lucide.createIcons();
  attachTimelinePan();
  if (autoScroll) requestAnimationFrame(() => scrollTimelineToToday(dayW));
}

function attachTimelinePan() {
  const wrap = document.getElementById('timeline-wrap');
  if (!wrap || wrap.dataset.panReady === '1') return;
  wrap.dataset.panReady = '1';
  wrap.addEventListener('pointerdown', tlPanPointerDown);
  wrap.addEventListener('click', tlPanClickCapture, true);
}

function tlPanPointerDown(e) {
  if (e.button !== 0 || tlPointerDrag) return;
  if (e.target.closest('.tl-block, .tl-resize-handle, button, a, input, select, textarea')) return;
  e.preventDefault();

  const wrap = e.currentTarget;
  tlPanDrag = {
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
  wrap.addEventListener('pointermove', tlPanPointerMove);
  wrap.addEventListener('pointerup', tlPanPointerUp);
  wrap.addEventListener('pointercancel', tlPanPointerCancel);
}

function tlPanPointerMove(e) {
  const d = tlPanDrag;
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

function tlPanPointerUp(e) {
  const d = tlPanDrag;
  if (!d) return;
  cleanupTimelinePan(e);
  if (d.suppressClick) {
    d.wrap.dataset.suppressClick = '1';
    setTimeout(() => {
      if (d.wrap.dataset.suppressClick === '1') delete d.wrap.dataset.suppressClick;
    }, 0);
  }
}

function tlPanPointerCancel(e) {
  cleanupTimelinePan(e);
}

function cleanupTimelinePan(e) {
  const d = tlPanDrag;
  if (!d) return;
  d.wrap.releasePointerCapture?.(d.pointerId || e?.pointerId);
  d.wrap.classList.remove('tl-panning');
  document.body.classList.remove('tl-is-panning');
  d.wrap.removeEventListener('pointermove', tlPanPointerMove);
  d.wrap.removeEventListener('pointerup', tlPanPointerUp);
  d.wrap.removeEventListener('pointercancel', tlPanPointerCancel);
  tlPanDrag = null;
}

function tlPanClickCapture(e) {
  if (e.currentTarget.dataset.suppressClick !== '1') return;
  e.preventDefault();
  e.stopPropagation();
  delete e.currentTarget.dataset.suppressClick;
}

// ── TIMELINE DRAG (pointer-based) ──
function tlPointerDown(e, resId, type) {
  if (e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();

  const r = reservas.find(x => x.id === resId);
  if (!r) return;
  const blockEl = type === 'move'
    ? e.currentTarget
    : e.currentTarget.closest('.tl-block');
  if (!blockEl) return;

  const tooltip = document.createElement('div');
  tooltip.className = 'tl-drag-tooltip';
  document.body.appendChild(tooltip);

  // Ghost: clone visual do bloco que segue o cursor (só para 'move')
  let ghost = null;
  if (type === 'move') {
    ghost = document.createElement('div');
    ghost.className = 'tl-drop-ghost';
    ghost.style.cssText = blockEl.style.cssText;
    ghost.style.pointerEvents = 'none';
  }

  tlPointerDrag = {
    type, resId,
    startX:        e.clientX,
    origCheckIn:   r.check_in,
    origCheckOut:  r.check_out,
    origAccId:     r.accommodation_id,
    origLeft:      parseFloat(blockEl.style.left)  || 0,
    origWidth:     parseFloat(blockEl.style.width) || 100,
    blockEl, tooltip, ghost,
    dayW:          getTimelineDayWidth(),
    moved:         false,
    newCheckIn:    null,
    newCheckOut:   null,
    targetAccId:   null,
    targetAccName: null
  };

  blockEl.classList.add('tl-dragging');
  document.addEventListener('pointermove',   tlOnPointerMove);
  document.addEventListener('pointerup',     tlOnPointerUp);
  document.addEventListener('pointercancel', tlCancelDrag);
}

function tlOnPointerMove(e) {
  const d = tlPointerDrag;
  if (!d) return;

  const dx = e.clientX - d.startX;
  if (Math.abs(dx) > 4) d.moved = true;
  if (!d.moved) return;

  const dayDelta = Math.round(dx / d.dayW);
  const snapDx   = dayDelta * d.dayW;
  const origCi   = new Date(d.origCheckIn  + 'T12:00:00');
  const origCo   = new Date(d.origCheckOut + 'T12:00:00');

  let newCi, newCo;

  if (d.type === 'move') {
    newCi = tlAddDays(origCi, dayDelta);
    newCo = tlAddDays(origCo, dayDelta);
    const ghostLeft = Math.max(0, d.origLeft + snapDx);

    // Detectar row alvo (esconder bloco para não interferir com elementFromPoint)
    d.blockEl.style.pointerEvents = 'none';
    const below      = document.elementFromPoint(e.clientX, e.clientY);
    d.blockEl.style.pointerEvents = '';
    const targetRow  = below?.closest?.('.tl-row');
    const targetAccId = targetRow?.dataset?.accId;

    document.querySelectorAll('.tl-row.tl-drag-over').forEach(r => r.classList.remove('tl-drag-over'));
    d.targetAccId   = targetAccId && targetAccId !== d.origAccId ? targetAccId   : null;
    d.targetAccName = targetAccId && targetAccId !== d.origAccId ? targetRow.dataset.accName : null;
    if (d.targetAccId) targetRow.classList.add('tl-drag-over');

    // Mover ghost para a row alvo
    if (d.ghost) {
      const destRow   = d.targetAccId ? targetRow : d.blockEl.closest('.tl-row');
      const daysArea  = destRow?.querySelector('.tl-days-area');
      if (daysArea && d.ghost.parentNode !== daysArea) daysArea.appendChild(d.ghost);
      d.ghost.style.left  = ghostLeft + 'px';
      d.ghost.style.width = d.origWidth + 'px';
    }

  } else {
    // Resize: mover o próprio bloco
    const origNights = Math.round((origCo - origCi) / 86400000);
    let newLeft  = d.origLeft;
    let newWidth = d.origWidth;

    if (d.type === 'resize-left') {
      const clampedDelta = Math.min(dayDelta, origNights - 1);
      newLeft  = d.origLeft  + clampedDelta * d.dayW;
      newWidth = d.origWidth - clampedDelta * d.dayW;
      newCi    = tlAddDays(origCi, clampedDelta);
      newCo    = origCo;
    } else {
      const clampedDelta = Math.max(dayDelta, -(origNights - 1));
      newWidth = d.origWidth + clampedDelta * d.dayW;
      newCi    = origCi;
      newCo    = tlAddDays(origCo, clampedDelta);
    }

    d.blockEl.style.left  = Math.max(0, newLeft)  + 'px';
    d.blockEl.style.width = Math.max(d.dayW, newWidth) + 'px';
  }

  d.newCheckIn  = tlToDateStr(newCi);
  d.newCheckOut = tlToDateStr(newCo);

  // Detetar conflito para feedback visual imediato
  const checkAcc    = d.targetAccId || d.origAccId;
  const directConflict = reservas.some(r2 =>
    r2.id !== d.resId &&
    r2.accommodation_id === checkAcc &&
    r2.status !== 'cancelada' &&
    r2.check_in < d.newCheckOut &&
    r2.check_out > d.newCheckIn
  );
  const checkAccObj = accommodations.find(a => a.id === checkAcc);
  const childConflict = checkAccObj?.type === 'alojamento' &&
    accommodations.filter(a => a.parent_id === checkAcc).some(child =>
      reservas.some(r2 =>
        r2.id !== d.resId &&
        r2.accommodation_id === child.id &&
        r2.status !== 'cancelada' &&
        r2.check_in < d.newCheckOut &&
        r2.check_out > d.newCheckIn
      )
    );
  d.hasConflict = directConflict || childConflict;
  if (d.ghost) d.ghost.classList.toggle('tl-drop-ghost-conflict', d.hasConflict);

  const fmt = dt => `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}`;
  const label = d.targetAccId ? `${d.targetAccName} · ` : '';
  d.tooltip.textContent   = (d.hasConflict ? '⚠ ' : '') + label + `${fmt(newCi)} → ${fmt(newCo)}`;
  d.tooltip.style.left    = (e.clientX + 14) + 'px';
  d.tooltip.style.top     = (e.clientY - 38) + 'px';
  d.tooltip.style.display = 'block';
}

function tlOnPointerUp() {
  if (!tlPointerDrag) return;
  document.removeEventListener('pointermove',   tlOnPointerMove);
  document.removeEventListener('pointerup',     tlOnPointerUp);
  document.removeEventListener('pointercancel', tlCancelDrag);
  document.querySelectorAll('.tl-row.tl-drag-over').forEach(r => r.classList.remove('tl-drag-over'));

  const { resId, origCheckIn, origCheckOut, origAccId, newCheckIn, newCheckOut,
          targetAccId, targetAccName, blockEl, tooltip, ghost, moved } = tlPointerDrag;
  tlPointerDrag = null;
  blockEl.classList.remove('tl-dragging');
  tooltip.remove();
  ghost?.remove();

  if (!moved) { showDetail(resId); return; }

  const datesChanged = newCheckIn && (newCheckIn !== origCheckIn || newCheckOut !== origCheckOut);
  const roomChanged  = !!targetAccId;
  if (!datesChanged && !roomChanged) { renderTimeline(false); return; }

  const r      = reservas.find(x => x.id === resId);
  const fmtStr = s => s.split('-').reverse().slice(0, 2).join('/');
  const updates = {};
  if (datesChanged) { updates.check_in = newCheckIn; updates.check_out = newCheckOut; }
  if (roomChanged)  { updates.accommodation_id = targetAccId; }

  // Overbooking check — direto no mesmo alojamento
  const checkAcc  = targetAccId || origAccId;
  const ciCheck   = newCheckOut || origCheckOut;
  const coCheck   = newCheckIn  || origCheckIn;
  const conflicts = reservas.filter(r2 =>
    r2.id !== resId &&
    r2.accommodation_id === checkAcc &&
    r2.status !== 'cancelada' &&
    r2.check_in < ciCheck &&
    r2.check_out > coCheck
  );

  // Se o alojamento destino é um "alojamento completo" (pai), verificar quartos filhos
  const destAcc       = accommodations.find(a => a.id === checkAcc);
  const childUnits    = destAcc?.type === 'alojamento'
    ? accommodations.filter(a => a.parent_id === checkAcc)
    : [];
  const childConflicts = childUnits.flatMap(child =>
    reservas
      .filter(r2 =>
        r2.id !== resId &&
        r2.accommodation_id === child.id &&
        r2.status !== 'cancelada' &&
        r2.check_in < ciCheck &&
        r2.check_out > coCheck
      )
      .map(r2 => ({ ...r2, _childName: child.name }))
  );

  const fromAcc = accommodations.find(a => a.id === origAccId);
  let msgBody = `<b>${r?.guest_name || 'reserva'}</b>`;
  msgBody += `<table style="margin-top:12px;width:100%;font-size:13px;border-collapse:collapse;">`;
  if (roomChanged) {
    msgBody += `<tr>
      <td style="color:var(--cinza);padding:3px 8px 3px 0;white-space:nowrap;">Quarto</td>
      <td><span style="text-decoration:line-through;opacity:.55">${fromAcc?.name || origAccId}</span>
          &nbsp;→&nbsp;<b style="color:var(--azul)">${targetAccName}</b></td>
    </tr>`;
  }
  if (datesChanged) {
    msgBody += `<tr>
      <td style="color:var(--cinza);padding:3px 8px 3px 0;white-space:nowrap;">Datas</td>
      <td><span style="text-decoration:line-through;opacity:.55">${fmtStr(origCheckIn)} → ${fmtStr(origCheckOut)}</span>
          &nbsp;→&nbsp;<b style="color:var(--azul)">${fmtStr(newCheckIn)} → ${fmtStr(newCheckOut)}</b></td>
    </tr>`;
  }
  msgBody += `</table>`;

  if (conflicts.length > 0) {
    const names = conflicts.map(c => `<b>${c.guest_name}</b>`).join(', ');
    msgBody += `<div style="margin-top:12px;padding:10px 12px;background:#fff3f3;border:1.5px solid #fbb;border-radius:8px;font-size:12.5px;color:#b91c1c;">
      ⚠️ Overbooking — ${names} já tem${conflicts.length > 1 ? 'm' : ''} reserva nestas datas neste quarto.
    </div>`;
  }

  if (childConflicts.length > 0) {
    const occupiedRooms = [...new Set(childConflicts.map(c => `<b>${c._childName}</b>`))].join(', ');
    msgBody += `<div style="margin-top:12px;padding:10px 12px;background:#fff3f3;border:1.5px solid #fbb;border-radius:8px;font-size:12.5px;color:#b91c1c;">
      ⚠️ Alojamento completo não disponível — ${occupiedRooms} já ${childConflicts.length > 1 ? 'têm' : 'tem'} reserva nestas datas.
    </div>`;
  }

  const hasBlocker = conflicts.length > 0 || childConflicts.length > 0;
  tlShowConfirm(
    msgBody,
    async () => {
      try {
        const res = await apiPut(`/api/reservations/${resId}`, updates);
        if (res.success) {
          toast('✅ Reserva atualizada!', 'success');
          await loadReservas();
          renderTimeline(false);
        } else { toast('❌ ' + (res.error || 'Erro.'), 'error'); renderTimeline(false); }
      } catch { toast('❌ Erro de ligação.', 'error'); renderTimeline(false); }
    },
    () => renderTimeline(false),
    hasBlocker
  );
}

function tlCancelDrag() {
  document.removeEventListener('pointermove',   tlOnPointerMove);
  document.removeEventListener('pointerup',     tlOnPointerUp);
  document.removeEventListener('pointercancel', tlCancelDrag);
  document.querySelectorAll('.tl-row.tl-drag-over').forEach(r => r.classList.remove('tl-drag-over'));
  if (tlPointerDrag) {
    tlPointerDrag.blockEl.classList.remove('tl-dragging');
    tlPointerDrag.tooltip.remove();
    tlPointerDrag.ghost?.remove();
    tlPointerDrag = null;
  }
  renderTimeline(false);
}

function tlAddDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function tlToDateStr(d)  {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function tlShowConfirm(msgHtml, onConfirm, onCancel, isOverbooking = false) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:9999;';
  const actions = isOverbooking
    ? `<button class="btn btn-ghost btn-sm" id="_tl-cancel">Cancelar</button>`
    : `<button class="btn btn-ghost btn-sm" id="_tl-cancel">Cancelar</button>
       <button class="btn btn-primary btn-sm" id="_tl-confirm">Confirmar alteração</button>`;
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:14px;padding:28px 32px;max-width:420px;width:92%;box-shadow:0 8px 32px rgba(0,0,0,.18);">
      <div style="font-size:14.5px;color:var(--azul);line-height:1.6;margin-bottom:22px;">${msgHtml}</div>
      <div style="display:flex;gap:10px;justify-content:flex-end;">${actions}</div>
    </div>`;
  document.body.appendChild(overlay);
  const dismiss = cb => { overlay.remove(); cb?.(); };
  overlay.querySelector('#_tl-cancel').onclick  = () => dismiss(onCancel);
  overlay.querySelector('#_tl-confirm')?.addEventListener('click', () => { overlay.remove(); onConfirm(); });
  overlay.onclick = e => { if (e.target === overlay) dismiss(onCancel); };
}
