// Estado privado; interface partilhada em AppModules.calendario.
(() => {
AppModules.define('calendario', {
  calLandBlockShortcut: { get: () => calLandBlockShortcut },
  calNext: { get: () => calNext },
  calPrev: { get: () => calPrev },
  goToday: { get: () => goToday },
  renderCalLandscape: { get: () => renderCalLandscape },
  updateTimelineLabel: { get: () => updateTimelineLabel },
});

function renderCalLandscape(allDays, filters = AppModules.calendario.getCalendarFilters()) {
  const grid  = document.getElementById('cll-grid');
  const title = document.getElementById('cll-title');
  if (!grid || !title) return;

  title.textContent = AppModules.calendario.MONTHS_PT[AppModules.core.calMonth] + ' ' + AppModules.core.calYear;

  const visStart = allDays[0].dateStr;
  const visEnd   = allDays[allDays.length - 1].dateStr;
  // Mesmo critério do grid de secretária: barras contínuas por reserva,
  // mais longas primeiro para um empacotamento de lanes mais estável.
  const visReservas = AppModules.calendario.calendarReservas.filter(r =>
    AppModules.calendario.reservationMatchesCalendarFilters(r, filters) && r.check_out >= visStart && r.check_in <= visEnd
  ).sort((a, b) => {
    const lenA = new Date(a.check_out) - new Date(a.check_in);
    const lenB = new Date(b.check_out) - new Date(b.check_in);
    return lenA !== lenB ? lenB - lenA : a.check_in.localeCompare(b.check_in);
  });

  const LANE_H = AppModules.calendario.CAL.laneH, LANE_GAP = AppModules.calendario.CAL.laneGapLandscape;
  let html = '';

  for (let w = 0; w < allDays.length; w += 7) {
    const week      = allDays.slice(w, w + 7);
    const weekStart = week[0].dateStr;
    const weekEnd   = week[6].dateStr;
    const weekRes   = visReservas.filter(r => r.check_out >= weekStart && r.check_in <= weekEnd);

    // Empacotamento greedy em lanes — igual ao grid de secretária, mas sem
    // limite de lanes: aqui a semana cresce em altura em vez de cortar
    // com "+N mais".
    const lanes = [];
    weekRes.forEach(r => {
      const effStart = r.check_in  < weekStart ? weekStart : r.check_in;
      const effEnd   = r.check_out > weekEnd   ? weekEnd   : r.check_out;
      let placed = false;
      for (let l = 0; l < lanes.length; l++) {
        const last = lanes[l][lanes[l].length - 1];
        const aEndsInWeek   = last.r.check_out <= weekEnd;
        const bStartsInWeek = r.check_in >= weekStart;
        if (aEndsInWeek && bStartsInWeek && effStart >= last.effEnd) {
          lanes[l].push({ r, effStart, effEnd }); placed = true; break;
        }
      }
      if (!placed) lanes.push([{ r, effStart, effEnd }]);
    });

    const visibleLaneCount = Math.min(lanes.length, AppModules.calendario.CAL.maxLandscapeLanes);
    const hiddenEntries = lanes.slice(visibleLaneCount).flat();
    const laneTops = [];
    let stackTop = 0;
    for (let l = 0; l < visibleLaneCount; l++) {
      laneTops[l] = stackTop;
      stackTop += LANE_H + LANE_GAP;
    }

    const dayCells = week.map(day => {
      if (day.otherMonth) return `<div class="cll-day-cell cll-other"><div class="cll-day-num">${day.dayNum}</div></div>`;
      const blocked = typeof AppModules.bloqueios.isDateBlockedAnywhere === 'function' && AppModules.bloqueios.isDateBlockedAnywhere(day.dateStr);
      const numHtml = day.isToday
        ? `<div class="cll-today-num">${day.dayNum}</div>`
        : `<div class="cll-day-num">${day.dayNum}</div>`;
      return `<div class="cll-day-cell${blocked ? ' cll-locked' : ''}" ${AppActions.attrs("click", "paisagem-open-cal-landscape-new-reservation-278341c", [String((day.dateStr) ?? '')])}>
        ${numHtml}
        ${blocked ? '<i data-lucide="lock" class="cll-lock-icon"></i>' : ''}
      </div>`;
    }).join('');

    // Área de clique por coluna (dia inteiro) por baixo das barras — mesma
    // técnica do grid de secretária (clickOverlays antes, eventos depois).
    const clickAreas = week.map((day, col) =>
      day.otherMonth ? '' : `<div class="cll-day-click-area" style="left:${(col/7*100).toFixed(2)}%;width:${(100/7).toFixed(2)}%;" ${AppActions.attrs("click", "paisagem-open-cal-landscape-new-reservation-278341c", [String((day.dateStr) ?? '')])}></div>`
    ).join('');

    let eventHtml = '';
    for (let l = 0; l < visibleLaneCount; l++) {
      for (const { r, effStart, effEnd } of lanes[l]) {
        const color      = AppModules.calendario.calAccColor(r.accommodation_id);
        const col0       = week.findIndex(d => d.dateStr === effStart);
        const col1       = week.findIndex(d => d.dateStr === effEnd);
        const startsHere = r.check_in  >= weekStart;
        const endsHere   = r.check_out <= weekEnd;
        const sameDay    = col0 === col1 && startsHere && endsHere;
        const leftPct  = sameDay ? col0 / 7 * 100 : (startsHere ? (col0 + 0.5) / 7 * 100 : 0);
        const rightPct = sameDay ? (col0 + 1) / 7 * 100 : (endsHere ? (col1 + 0.5) / 7 * 100 : 100);
        const widthPct = rightPct - leftPct;
        const roundCls  = (startsHere ? 'cll-span-round-left ' : '') + (endsHere ? 'cll-span-round-right' : '');
        const firstName = AppModules.core.escapeHtml((r.guest_name || '').split(' ')[0]);
        const accName   = AppModules.core.escapeHtml((r.accommodation_name || '').replace('Suite ', ''));
        const checkoutCls = r.task_status?.checkout_done ? ' cll-booking-checked-out' : '';
        eventHtml += `<div class="cll-booking${checkoutCls} ${roundCls}" style="left:${leftPct.toFixed(2)}%;width:${widthPct.toFixed(2)}%;top:${laneTops[l]}px;height:${LANE_H}px;background:${color}${AppModules.calendario.CAL.alpha.landFill};border-left-color:${color};color:${color};" title="${AppModules.core.escapeHtml(r.guest_name || '')} · ${AppModules.core.escapeHtml(r.accommodation_name || '')}" ${AppActions.attrs("click", "paisagem-stop-propagation-eb43f3e", [String((r.id) ?? '')])}>${firstName} · ${accName}</div>`;
      }
    }

    const overflowHtml = week.map((day, col) => {
      if (day.otherMonth) return '';
      const count = hiddenEntries.filter(({ r }) => r.check_in <= day.dateStr && r.check_out >= day.dateStr).length;
      if (!count) return '';
      return `<button type="button" class="cll-overflow" style="left:${(col / 7 * 100).toFixed(2)}%;width:${(100 / 7).toFixed(2)}%;top:${stackTop}px;" aria-label="Mostrar ${count} reservas em ${day.dateStr}" ${AppActions.attrs("click", "paisagem-open-overflow-e57a310", [day.dateStr])}>+${count}</button>`;
    }).join('');
    const eventsHeight = stackTop + (hiddenEntries.length ? LANE_H + LANE_GAP : 0);

    const colSeps = [1, 2, 3, 4, 5, 6].map(i => `<div class="cll-col-sep" style="left:calc(${i}*100%/7)"></div>`).join('');

    html += `<div class="cll-week">${colSeps}
      <div class="cll-week-days">${dayCells}</div>
      <div class="cll-week-events" style="height:${eventsHeight}px;">${clickAreas}${eventHtml}${overflowHtml}</div>
    </div>`;
  }

  grid.innerHTML = html;

  const emptyBox = document.getElementById('cll-empty');
  if (emptyBox) {
    emptyBox.innerHTML = visReservas.length ? '' : AppModules.core.emptyStateHtml(
      '📅', 'Sem reservas neste mês', 'Nenhuma reserva visível com estes filtros.', { inline: true }
    );
  }

  if (window.lucide) lucide.createIcons();
}

// Toque num dia da grelha de paisagem: abre logo a criação de reserva nesse
// dia (tal como a grelha de secretária já faz via openModalFromCalendar).
function openCalLandscapeNewReservation(dateStr) {
  AppModules.calendario.calLandSelectedDate = dateStr;
  AppModules.reservas.openModalFromCalendar(dateStr);
}

// Atalho do botão "Bloquear datas" no topo da grelha de paisagem — usa o
// último dia tocado (ou hoje, se ainda nenhum foi selecionado).
function calLandBlockShortcut() {
  AppModules.bloqueios.openBlockModal('', AppModules.calendario.calLandSelectedDate || new Date().toISOString().slice(0, 10));
}

function calPrev() {
  if (AppModules.calendario.calMode === 'timeline') {
    const wrap = document.getElementById('timeline-wrap');
    if (wrap) wrap.scrollLeft -= (wrap.clientWidth - AppModules.calendario.CAL.tlLabelW) * 0.7;
    return;
  }
  AppModules.core.calMonth--; if (AppModules.core.calMonth < 0) { AppModules.core.calMonth = 11; AppModules.core.calYear--; } AppModules.calendario.renderCal();
}

function calNext() {
  if (AppModules.calendario.calMode === 'timeline') {
    const wrap = document.getElementById('timeline-wrap');
    if (wrap) wrap.scrollLeft += (wrap.clientWidth - AppModules.calendario.CAL.tlLabelW) * 0.7;
    return;
  }
  AppModules.core.calMonth++; if (AppModules.core.calMonth > 11) { AppModules.core.calMonth = 0; AppModules.core.calYear++; } AppModules.calendario.renderCal();
}

function goToday() {
  if (AppModules.calendario.calMode === 'timeline') {
    AppModules.calendario.scrollTimelineToToday(AppModules.calendario.getTimelineDayWidth());
    return;
  }
  const today = new Date();
  AppModules.core.calYear = today.getFullYear(); AppModules.core.calMonth = today.getMonth(); AppModules.calendario.renderCal();
}

// ── TIMELINE ──
function updateTimelineLabel() {
  const label = document.getElementById('cal-label');
  if (label) label.textContent = `Timeline ${new Date().getFullYear()}`;
}


AppActions.register({
  "paisagem-stop-propagation-eb43f3e": (el, event, args) => { event.stopPropagation();AppModules.reservas.showDetail(args[0]) },
  "paisagem-open-overflow-e57a310": (el, event, args) => { event.stopPropagation();AppModules.calendario.openCalendarOverflow(args[0]) },
  "paisagem-open-cal-landscape-new-reservation-278341c": (el, event, args) => { openCalLandscapeNewReservation(args[0]) },
}, "click");

})();
