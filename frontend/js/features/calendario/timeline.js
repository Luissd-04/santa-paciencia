// Estado privado; interface partilhada em AppModules.calendario.
(() => {
AppModules.define('calendario', {
  drawTimeline: { get: () => drawTimeline },
});

function drawTimeline(autoScroll = true) {
  AppModules.core.SS.set('tlDays', AppModules.calendario.timelineDays);
  const wrap = document.getElementById('timeline-wrap');
  if (!wrap) return;

  const dayW    = AppModules.calendario.getTimelineDayWidth();
  const filters = AppModules.calendario.getCalendarFilters();
  AppModules.calendario.updateCalendarLegendUi();
  const filteredReservations = AppModules.calendario.calendarReservas.filter(r => AppModules.calendario.reservationMatchesCalendarFilters(r, filters));
  const alojList = filters.suite
    ? AppModules.core.accommodations.filter(a => a.id === filters.suite)
    : AppModules.core.accommodations;

  const now       = new Date();
  const year      = now.getFullYear();
  const yearStart = new Date(year, 0, 1);
  const totalDays = Math.round((new Date(year + 1, 0, 1) - yearStart) / 86400000);
  const todayStr  = now.toISOString().slice(0, 10);
  const startStr  = `${year}-01-01`;
  const endStr    = `${year + 1}-01-01`;
  const curMonthStart = `${year}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const curMonthEnd   = (() => { const d = new Date(year, now.getMonth() + 1, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; })();

  // Geometria da timeline: uma só fonte de verdade em CSS custom properties
  // (o CSS lê --tl-day-w / --tl-days-total / --tl-label-w — ver views/calendar.css),
  // em vez de width/min-width inline em centenas de células.
  wrap.style.setProperty('--tl-day-w', dayW + 'px');
  wrap.style.setProperty('--tl-days-total', String(totalDays));
  wrap.style.setProperty('--tl-label-w', AppModules.calendario.CAL.tlLabelW + 'px');

  const yearReservations = filteredReservations.filter(r => r.check_out > startStr && r.check_in < endStr);
  AppModules.calendario.setCalCount(yearReservations.length, yearReservations.length === 1 ? 'reserva este ano' : 'reservas este ano');

  const dayNames   = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  // Month header cells
  let monthCells = '';
  for (let m = 0; m < 12; m++) {
    const mDays    = Math.round((new Date(year, m + 1, 1) - new Date(year, m, 1)) / 86400000);
    const mStart   = `${year}-${String(m + 1).padStart(2, '0')}-01`;
    const mEnd     = m === 11 ? `${year + 1}-01-01` : `${year}-${String(m + 2).padStart(2, '0')}-01`;
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
      ${dayW >= AppModules.calendario.CAL.weekdayNameMinDayW ? `<div class="tl-day-name">${dayNames[d.getDay()]}</div>` : ''}
      <div class="tl-day-num">${d.getDate()}</div>
    </div>`;
  }

  const rows = alojList.length === 0
    ? ''
    : alojList.map(a => {
        let cellHtml = '';
        for (let i = 0; i < totalDays; i++) {
          const d  = new Date(year, 0, 1 + i);
          const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          const isMonthStart = d.getDate() === 1 && i > 0;
          cellHtml += `<div class="tl-cell${ds === todayStr ? ' tl-today-col' : ''}${isMonthStart ? ' tl-month-start' : ''}" ${AppActions.attrs("click", "timeline-open-modal-from-calendar-7ae6ef8", [String((ds) ?? ''), String((a.id) ?? '')])}></div>`;
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
          const width = Math.max(AppModules.calendario.CAL.tlBlockMinW, right - left - AppModules.calendario.CAL.tlBlockInset);
          if (right <= 0 || left >= totalWidth || width <= 0) return '';
          const bg = AppModules.calendario.calAccColor(r.accommodation_id);
          const checkoutCls = r.task_status?.checkout_done ? ' tl-block-checked-out' : '';
          return `<div class="tl-block tl-block-${r.status}${checkoutCls}" style="left:${left}px;width:${width}px;--tl-color:${bg};background:${bg}${AppModules.calendario.CAL.alpha.tlFill};border-color:${bg}${AppModules.calendario.CAL.alpha.tlBorder};"
                       data-res-id="${r.id}"
                       data-acc-id="${r.accommodation_id}"
                       ${AppActions.attrs("pointerdown", "timeline-tl-pointer-down-e17f561", [r.id])}
                       title="${AppModules.core.escapeHtml(r.guest_name)} · ${r.check_in} → ${r.check_out}">
            <div class="tl-resize-handle tl-resize-left" ${AppActions.attrs("pointerdown", "timeline-stop-propagation-3708716", [r.id])}></div>
            <div class="tl-block-main">
              <span class="tl-block-name">${AppModules.core.escapeHtml(r.guest_name.split(' ')[0])}</span>
              <span class="tl-block-status" style="color:${bg};">${r.status}</span>
            </div>
            <span class="tl-block-meta">${AppModules.calendario.shortDatePt(r.check_in)} → ${AppModules.calendario.shortDatePt(r.check_out)} · ${nights} noite${nights !== 1 ? 's' : ''}</span>
            <div class="tl-resize-handle tl-resize-right" ${AppActions.attrs("pointerdown", "timeline-stop-propagation-e7ac927", [r.id])}></div>
          </div>`;
        }).join('');

        return `<div class="tl-row"
                     data-acc-id="${AppModules.core.escapeHtml(a.id)}"
                     data-acc-name="${AppModules.core.escapeHtml(a.name)}">
          <div class="tl-label">
            <div class="tl-label-title">${AppModules.core.escapeHtml(a.name)}</div>
            <div class="tl-label-sub">${AppModules.core.escapeHtml(a.type || 'alojamento')} · ${monthCount} reserva${monthCount !== 1 ? 's' : ''} este mês</div>
          </div>
          <div class="tl-days-area">
            <div class="tl-cells">${cellHtml}</div>
            ${typeof AppModules.bloqueios.blockBandsHtml === 'function' ? AppModules.bloqueios.blockBandsHtml(a.id, yearStart, totalDays, dayW) : ''}
            ${blocks}
          </div>
        </div>`;
      }).join('');

  const emptyBanner =
    alojList.length === 0
      ? AppModules.core.emptyStateHtml('🏠', 'Sem alojamentos', 'Não há alojamentos para mostrar.', { inline: true })
      : (yearReservations.length === 0
          ? AppModules.core.emptyStateHtml('📅', 'Sem reservas', 'Nenhuma reserva no período com estes filtros.', { inline: true })
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

  if (window.lucide) lucide.createIcons();
  AppModules.calendario.attachTimelinePan();
  if (autoScroll) requestAnimationFrame(() => AppModules.calendario.scrollTimelineToToday(dayW));
}


AppActions.register({
  "timeline-tl-pointer-down-e17f561": (el, event, args) => { AppModules.calendario.tlPointerDown(event,(String(args[0])),'move') },
  "timeline-stop-propagation-3708716": (el, event, args) => { event.stopPropagation();AppModules.calendario.tlPointerDown(event,(String(args[0])),'resize-left') },
  "timeline-stop-propagation-e7ac927": (el, event, args) => { event.stopPropagation();AppModules.calendario.tlPointerDown(event,(String(args[0])),'resize-right') },
}, "pointerdown");

AppActions.register({
  "timeline-open-modal-from-calendar-7ae6ef8": (el, event, args) => { AppModules.reservas.openModalFromCalendar(args[0],args[1]) },
}, "click");

})();
