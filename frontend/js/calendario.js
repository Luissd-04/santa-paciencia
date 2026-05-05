let calMode = 'calendar';
let timelineStart = new Date();
timelineStart.setHours(0, 0, 0, 0);
let tlDragging = { resId: null, fromAccId: null };

let timelineDays   = 14;
const TL_LABEL_W   = 190;
const TL_DAY_W     = 52;

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
  updateCalendarLegendUi();
  renderCalView();
}

function setTimelineRange(days) {
  timelineDays = Number(days);
  updateTimelineRangeUi();
  if (calMode === 'timeline') {
    updateTimelineLabel();
    renderTimeline();
  }
}

function getTimelineDayWidth() {
  const wrap = document.getElementById('timeline-wrap');
  const usable = Math.max(0, (wrap?.clientWidth || 0) - TL_LABEL_W - 4);
  if (!usable) return TL_DAY_W;
  if (timelineDays <= 14) {
    return Math.max(TL_DAY_W, Math.floor(usable / timelineDays));
  }
  return TL_DAY_W;
}

// ── PUBLIC ENTRY POINT ──
function renderCalView() {
  if (calMode === 'timeline') renderTimeline();
  else renderCal();
}

function setCalMode(m) {
  calMode = m;
  updateCalendarModeUi();
  const calWrap  = document.querySelector('.cal-wrap');
  const tlWrap   = document.getElementById('timeline-wrap');
  const rangeToggle = document.getElementById('timeline-range-toggle');
  if (calWrap) calWrap.style.display  = m === 'calendar'  ? '' : 'none';
  if (tlWrap)  tlWrap.style.display   = m === 'timeline'  ? '' : 'none';
  if (rangeToggle) rangeToggle.style.display = m === 'timeline' ? '' : 'none';
  updateTimelineRangeUi();
  if (m === 'timeline') { updateTimelineLabel(); renderTimeline(); }
  else renderCal();
}

// ── CALENDAR ──
function renderCal() {
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
    const LANE_H = 20, LANE_GAP = 2;

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
        const topPx      = l * (LANE_H + LANE_GAP);
        eventHtml += `<div class="cal-event-span ${statusCls} ${roundCls}"
          style="left:${leftPct.toFixed(2)}%;width:${widthPct.toFixed(2)}%;top:${topPx}px;background:${color}22;color:${color};border-left:${borderLeft};"
          onclick="event.stopPropagation();showDetail('${r.id}')"
          title="${r.guest_name} — ${r.accommodation_name}">
          <span class="cal-span-text">${r.guest_name.split(' ')[0]} · ${r.accommodation_name.replace('Suite ','')}</span>
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
          const topPx = visLanes * (LANE_H + LANE_GAP);
          eventHtml += `<div class="cal-event-more" style="left:${(col/7*100).toFixed(2)}%;width:${(100/7).toFixed(2)}%;top:${topPx}px;">+${extra} mais</div>`;
        }
      });
    }

    const numRows    = visLanes + (lanes.length > MAX_LANES ? 1 : 0);
    const containerH = numRows > 0 ? numRows * (LANE_H + LANE_GAP) : 0;
    const eventsRow  = eventHtml ? `<div class="cal-week-events" style="height:${containerH}px;">${eventHtml}</div>` : '';
    const colSeps    = [1,2,3,4,5,6].map(i => `<div class="cal-col-sep" style="left:calc(${i}*100%/7)"></div>`).join('');
    grid.innerHTML += `<div class="cal-week">${colSeps}<div class="cal-week-days">${dayCells}</div>${eventsRow}</div>`;
  }
}

function calPrev() {
  if (calMode === 'timeline') {
    timelineStart = new Date(timelineStart);
    timelineStart.setDate(timelineStart.getDate() - Math.max(3, Math.round(timelineDays / 2)));
    updateTimelineLabel();
    renderTimeline();
    return;
  }
  calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } renderCal();
}

function calNext() {
  if (calMode === 'timeline') {
    timelineStart = new Date(timelineStart);
    timelineStart.setDate(timelineStart.getDate() + Math.max(3, Math.round(timelineDays / 2)));
    updateTimelineLabel();
    renderTimeline();
    return;
  }
  calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } renderCal();
}

function goToday() {
  if (calMode === 'timeline') {
    timelineStart = new Date();
    timelineStart.setHours(0, 0, 0, 0);
    updateTimelineLabel();
    renderTimeline();
    // Scroll to today column after render
    setTimeout(() => {
      const wrap = document.getElementById('timeline-wrap');
      if (wrap) wrap.scrollLeft = 0;
    }, 50);
    return;
  }
  calYear = now.getFullYear(); calMonth = now.getMonth(); renderCal();
}

// ── TIMELINE ──
function updateTimelineLabel() {
  const label = document.getElementById('cal-label');
  if (!label) return;
  const end = new Date(timelineStart);
  end.setDate(end.getDate() + timelineDays - 1);
  const ms = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  label.textContent = `${timelineStart.getDate()} ${ms[timelineStart.getMonth()]} — ${end.getDate()} ${ms[end.getMonth()]} ${end.getFullYear()} · janela ${timelineDays} dias`;
}

function renderTimeline() {
  const wrap = document.getElementById('timeline-wrap');
  if (!wrap) return;

  const dayW = getTimelineDayWidth();
  const filters = getCalendarFilters();
  updateCalendarLegendUi();
  const filteredReservations = reservas.filter(r => reservationMatchesCalendarFilters(r, filters));
  const alojList    = filters.suite
    ? accommodations.filter(a => a.id === filters.suite)
    : accommodations;

  const start    = new Date(timelineStart);
  const todayStr = new Date().toISOString().slice(0, 10);
  const dayNames = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

  const days = [];
  for (let i = 0; i < timelineDays; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }

  const endDate = new Date(start);
  endDate.setDate(endDate.getDate() + timelineDays);
  const startStr = start.toISOString().slice(0, 10);
  const endStr   = endDate.toISOString().slice(0, 10);

  const headerDays = days.map(d => {
    const ds      = d.toISOString().slice(0, 10);
    const isToday = ds === todayStr;
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    return `<div class="tl-day-head${isToday ? ' tl-today' : ''}${isWeekend ? ' tl-weekend' : ''}" style="width:${dayW}px;min-width:${dayW}px;">
      <div class="tl-day-name">${dayNames[d.getDay()]}</div>
      <div class="tl-day-num">${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}</div>
    </div>`;
  }).join('');

  const ACCOM_COLOR = {};
  accommodations.forEach(a => { ACCOM_COLOR[a.id] = a.color || '#843424'; });
  const STATUS_BG = {
    confirmada: '#2e7d52', pendente: '#c47820',
    'check-in': '#1e6090', 'check-out': '#5a4a8a', outro: '#8a8278'
  };

  const rows = alojList.length === 0
    ? `<div style="padding:40px;text-align:center;color:var(--cinza);">Nenhum alojamento encontrado.</div>`
    : alojList.map(a => {
        const dayBg = days.map(d => {
          const ds = d.toISOString().slice(0, 10);
          return `<div class="tl-cell${ds === todayStr ? ' tl-today-col' : ''}" style="width:${dayW}px;min-width:${dayW}px;" onclick="openModalFromCalendar('${ds}','${a.id}')"></div>`;
        }).join('');

        const alojReservas = filteredReservations.filter(r =>
          r.accommodation_id === a.id &&
          r.check_out > startStr &&
          r.check_in  < endStr
        );

        const blocks = alojReservas.map(r => {
          const ci     = new Date(r.check_in  + 'T00:00:00');
          const co     = new Date(r.check_out + 'T00:00:00');
          const offset = Math.round((ci - start) / 86400000);
          const nights = Math.round((co - ci)    / 86400000);
          const totalWidth = timelineDays * dayW;
          const startPos = (offset * dayW) + (dayW / 2);
          const endPos = ((offset + nights) * dayW) + (dayW / 2);
          const left  = Math.max(0, startPos);
          const right = Math.min(totalWidth, endPos);
          const width = Math.max(18, right - left - 4);
          if (right <= 0 || left >= totalWidth || width <= 0) return '';
          const bg    = ACCOM_COLOR[r.accommodation_id] || STATUS_BG[r.status] || STATUS_BG.outro;
          return `<div class="tl-block tl-block-${r.status}" style="left:${left}px;width:${width}px;--tl-color:${bg};background:${bg}18;border-color:${bg}55;"
                       onclick="showDetail('${r.id}')"
                       draggable="true"
                       data-res-id="${r.id}"
                       data-acc-id="${r.accommodation_id}"
                       ondragstart="tlDragStart(event)"
                       ondragend="tlDragEnd(event)"
                       title="${r.guest_name} · ${r.check_in} → ${r.check_out}">
            <div class="tl-block-main">
              <span class="tl-block-name">${r.guest_name.split(' ')[0]}</span>
              <span class="tl-block-status" style="color:${bg};">${r.status}</span>
            </div>
            <span class="tl-block-meta">${shortDatePt(r.check_in)} → ${shortDatePt(r.check_out)} · ${nights} noite${nights !== 1 ? 's' : ''}</span>
          </div>`;
        }).join('');

        return `<div class="tl-row"
                     data-acc-id="${a.id}"
                     data-acc-name="${a.name.replace(/"/g, '&quot;')}"
                     ondragover="tlDragOver(event)"
                     ondrop="tlDrop(event)"
                     ondragleave="tlDragLeave(event)">
          <div class="tl-label" style="min-width:${TL_LABEL_W}px;max-width:${TL_LABEL_W}px;">
            <div class="tl-label-title">${a.name}</div>
            <div class="tl-label-sub">${a.type || 'alojamento'} · ${alojReservas.length} reserva${alojReservas.length !== 1 ? 's' : ''}</div>
          </div>
          <div class="tl-days-area" style="width:${timelineDays * dayW}px;flex:none;">
            <div class="tl-cells">${dayBg}</div>
            ${blocks}
          </div>
        </div>`;
      }).join('');

  const totalW = TL_LABEL_W + timelineDays * dayW;

  wrap.innerHTML = `
    <div class="timeline-scroll" style="min-width:${totalW}px;">
      <div class="tl-header">
        <div class="tl-label tl-header-label" style="min-width:${TL_LABEL_W}px;max-width:${TL_LABEL_W}px;">Alojamento</div>
        <div style="display:flex;">${headerDays}</div>
      </div>
      <div class="tl-body">${rows}</div>
    </div>
    <div class="tl-nav-hint">
      ${lcIcon('move-horizontal', 12)} Arraste horizontalmente para navegar · use a janela 7/14/30 dias para mudar o nível de detalhe
    </div>`;

  if (window.lucide) lucide.createIcons();
}

// ── TIMELINE DRAG & DROP ──
function tlDragStart(event) {
  const el = event.currentTarget;
  tlDragging.resId    = el.dataset.resId;
  tlDragging.fromAccId = el.dataset.accId;
  el.classList.add('tl-dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', tlDragging.resId);
}

function tlDragEnd(event) {
  event.currentTarget.classList.remove('tl-dragging');
}

function tlDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  event.currentTarget.classList.add('tl-drag-over');
}

function tlDragLeave(event) {
  if (!event.currentTarget.contains(event.relatedTarget)) {
    event.currentTarget.classList.remove('tl-drag-over');
  }
}

function tlDrop(event) {
  event.preventDefault();
  const row = event.currentTarget;
  row.classList.remove('tl-drag-over');
  const toAccId   = row.dataset.accId;
  const toAccName = row.dataset.accName;
  if (!tlDragging.resId || toAccId === tlDragging.fromAccId) return;

  const fromAcc = accommodations.find(a => a.id === tlDragging.fromAccId);
  tlShowConfirm(
    `Mover reserva de <b>${fromAcc?.name || tlDragging.fromAccId}</b> para <b>${toAccName}</b>?`,
    async () => {
      try {
        const res = await apiPut(`/api/reservations/${tlDragging.resId}`, { accommodation_id: toAccId });
        if (res.success) {
          toast('✅ Reserva movida!', 'success');
          await loadReservas();
          renderTimeline();
        } else {
          toast('❌ ' + (res.error || 'Erro ao mover reserva.'), 'error');
        }
      } catch (e) {
        toast('❌ Erro de ligação.', 'error');
      }
    }
  );
}

function tlShowConfirm(msgHtml, onConfirm) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:9999;';
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:14px;padding:28px 32px;max-width:400px;width:92%;box-shadow:0 8px 32px rgba(0,0,0,.18);">
      <div style="font-size:15px;color:var(--azul);line-height:1.5;margin-bottom:22px;">${msgHtml}</div>
      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button class="btn btn-ghost btn-sm" id="_tl-cancel">Cancelar</button>
        <button class="btn btn-primary btn-sm" id="_tl-confirm">Confirmar alteração</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#_tl-cancel').onclick  = () => overlay.remove();
  overlay.querySelector('#_tl-confirm').onclick = () => { overlay.remove(); onConfirm(); };
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
}
