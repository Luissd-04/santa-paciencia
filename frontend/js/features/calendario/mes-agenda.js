// Estado privado; interface partilhada em AppModules.calendario.
(() => {
AppModules.define('calendario', {
  drawCal: { get: () => drawCal },
  openCalendarOverflow: { get: () => openCalendarOverflow },
});

function drawCal() {
  AppModules.core.SS.set('calYear', AppModules.core.calYear);
  AppModules.core.SS.set('calMonth', AppModules.core.calMonth);
  const filters = AppModules.calendario.getCalendarFilters();
  AppModules.calendario.updateCalendarLegendUi();
  const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  document.getElementById('cal-label').textContent = months[AppModules.core.calMonth] + ' ' + AppModules.core.calYear;

  const firstDay = new Date(AppModules.core.calYear, AppModules.core.calMonth, 1).getDay();
  const daysInM  = new Date(AppModules.core.calYear, AppModules.core.calMonth + 1, 0).getDate();
  const prevDays = new Date(AppModules.core.calYear, AppModules.core.calMonth, 0).getDate();
  const todayStr = new Date().toISOString().slice(0, 10);

  const grid = document.getElementById('cal-grid');

  // Build all visible days (prev-month padding + current month + next-month padding)
  const allDays = [];

  for (let i = firstDay - 1; i >= 0; i--) {
    const dayNum = prevDays - i;
    const pm = AppModules.core.calMonth === 0 ? 11 : AppModules.core.calMonth - 1;
    const py = AppModules.core.calMonth === 0 ? AppModules.core.calYear - 1 : AppModules.core.calYear;
    allDays.push({ dateStr: `${py}-${String(pm+1).padStart(2,'0')}-${String(dayNum).padStart(2,'0')}`, dayNum, otherMonth: true });
  }
  for (let d = 1; d <= daysInM; d++) {
    const dateStr = `${AppModules.core.calYear}-${String(AppModules.core.calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    allDays.push({ dateStr, dayNum: d, otherMonth: false, isToday: dateStr === todayStr });
  }
  const total  = firstDay + daysInM;
  const remain = total % 7 === 0 ? 0 : 7 - (total % 7);
  for (let i = 1; i <= remain; i++) {
    const nm = AppModules.core.calMonth === 11 ? 0 : AppModules.core.calMonth + 1;
    const ny = AppModules.core.calMonth === 11 ? AppModules.core.calYear + 1 : AppModules.core.calYear;
    allDays.push({ dateStr: `${ny}-${String(nm+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`, dayNum: i, otherMonth: true });
  }

  // Reservations visible in this calendar view, sorted longest-first for better lane packing
  const visStart = allDays[0].dateStr;
  const visEnd   = allDays[allDays.length - 1].dateStr;
  const visReservas = AppModules.calendario.calendarReservas.filter(r => {
    if (!AppModules.calendario.reservationMatchesCalendarFilters(r, filters)) return false;
    return r.check_out >= visStart && r.check_in <= visEnd;
  }).sort((a, b) => {
    const lenA = new Date(a.check_out) - new Date(a.check_in);
    const lenB = new Date(b.check_out) - new Date(b.check_in);
    return lenA !== lenB ? lenB - lenA : a.check_in.localeCompare(b.check_in);
  });

  AppModules.calendario.setCalCount(visReservas.length, visReservas.length === 1 ? 'reserva visível' : 'reservas visíveis');

  // Acumula o HTML de cada semana e escreve o #cal-grid uma só vez (antes o
  // grid.innerHTML += dentro do loop re-parseava toda a grelha a cada semana).
  const weeksHtml = [];

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
    const dayIsBlocked = day => !day.otherMonth && typeof AppModules.bloqueios.isDateBlockedAnywhere === 'function' && (
      filters.suite
        ? AppModules.bloqueios.isDateBlockedForAccommodation(filters.suite, day.dateStr)
        : AppModules.bloqueios.isDateBlockedAnywhere(day.dateStr)
    );
    // Dia bloqueado: o clique abre o bloqueio para edição em vez de nova reserva
    const dayClickAttr = day => day.otherMonth ? '' : (dayIsBlocked(day)
      ? `${AppActions.attrs("click", "mes-agenda-open-block-from-calendar-969183d", [String((day.dateStr) ?? ''), String((filters.suite || '') ?? '')])}`
      : `${AppActions.attrs("click", "mes-agenda-open-modal-from-calendar-76a36bf", [String((day.dateStr) ?? '')])}`);

    const dayCells = week.map(day => {
      const blocked = dayIsBlocked(day);
      return `<div class="cal-day${day.otherMonth ? ' other-month' : ''}${day.isToday ? ' today' : ''}${blocked ? ' cal-day-blocked' : ''}" ${dayClickAttr(day)}${blocked ? ' title="🔒 Data bloqueada — clique para editar"' : ''}>
        <div class="day-num">${day.dayNum}</div>
        ${blocked ? '<span class="cal-day-lock">🔒</span>' : ''}
      </div>`;
    }).join('');

    // Event spans — absolutely positioned so bars start/end at the midpoint of each day column
    let eventHtml = '';
    const { laneH: LANE_H, laneGap: LANE_GAP, maxSuiteRows: MAX_SUITE_ROWS,
      maxDesktopLaneRows: MAX_LANE_ROWS } = AppModules.calendario.CAL;

    // Altura de cada lane = maior barra nela. Reservas multi-suíte ocupam a
    // espessura de várias reservas (uma linha por suíte).
    const laneRows = l => Math.max(1, ...lanes[l].map(({ r }) => Math.min(AppModules.calendario.calReservationSuites(r).length, MAX_SUITE_ROWS)));
    let visLanes = 0;
    let visibleRows = 0;
    while (visLanes < lanes.length) {
      const rows = laneRows(visLanes);
      if (visLanes > 0 && visibleRows + rows > MAX_LANE_ROWS) break;
      visibleRows += rows;
      visLanes++;
    }
    const hiddenEntries = lanes.slice(visLanes).flat();
    const laneTops = [];
    let stackTop = 0;
    for (let l = 0; l < visLanes; l++) {
      laneTops[l] = stackTop;
      stackTop += laneRows(l) * LANE_H + LANE_GAP;
    }

    for (let l = 0; l < visLanes; l++) {
      for (const { r, effStart, effEnd } of lanes[l]) {
        const color      = AppModules.calendario.calAccColor(r.accommodation_id);
        const statusCls  = r.status === 'pendente' ? 'cal-event-pending' : 'cal-event-confirmed';
        const checkoutCls = r.task_status?.checkout_done ? ' cal-event-checked-out' : '';
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
        const suiteInfos = AppModules.calendario.calReservationSuiteInfo(r);
        const isMulti    = suiteInfos.length > 1;
        const barH       = Math.min(suiteInfos.length, MAX_SUITE_ROWS) * LANE_H;
        const firstName  = AppModules.core.escapeHtml(r.guest_name.split(' ')[0]);
        const inner      = isMulti
          ? suiteInfos.slice(0, MAX_SUITE_ROWS).map((s, idx) => {
              const rowBorder = startsHere ? `3px solid ${s.color}` : '3px solid transparent';
              return `<div class="cal-span-row" style="top:${idx * LANE_H}px;height:${LANE_H}px;background:${s.color}${AppModules.calendario.CAL.alpha.gridFill};color:${s.color};border-left:${rowBorder};">
                <span class="cal-span-text">${firstName} · ${AppModules.core.escapeHtml(s.name.replace('Suite ',''))}</span>
              </div>`;
            }).join('')
          : `<span class="cal-span-text">${firstName} · ${AppModules.core.escapeHtml(r.accommodation_name.replace('Suite ',''))}</span>`;
        eventHtml += `<div class="cal-event-span ${statusCls}${checkoutCls} ${roundCls}${isMulti ? ' cal-event-multi' : ''}"
          style="left:${leftPct.toFixed(2)}%;width:${widthPct.toFixed(2)}%;top:${topPx}px;height:${barH}px;${isMulti ? '' : `background:${color}${AppModules.calendario.CAL.alpha.gridFill};color:${color};border-left:${borderLeft};`}"
          ${AppActions.attrs("click", "mes-agenda-stop-propagation-eb43f3e", [String((r.id) ?? '')])}
          title="${AppModules.core.escapeHtml(r.guest_name)} — ${AppModules.core.escapeHtml(suiteInfos.map(s => s.name).join(' + '))}">
          ${inner}
        </div>`;
      }
    }

    const overflowTop = stackTop;
    const overflowHtml = week.map((day, col) => {
      if (day.otherMonth) return '';
      const hiddenCount = hiddenEntries.filter(({ r }) => r.check_in <= day.dateStr && r.check_out >= day.dateStr).length;
      if (!hiddenCount) return '';
      const label = `Mostrar ${hiddenCount} reserva${hiddenCount !== 1 ? 's' : ''} em ${day.dateStr}`;
      return `<button type="button" class="cal-overflow-btn" style="left:${(col / 7 * 100).toFixed(2)}%;width:${(100 / 7).toFixed(2)}%;top:${overflowTop}px;" aria-label="${label}" ${AppActions.attrs("click", "mes-agenda-open-overflow-87a42f1", [day.dateStr])}>+ ${hiddenCount} mais</button>`;
    }).join('');
    const containerH = stackTop + (hiddenEntries.length ? LANE_H + LANE_GAP : 0);
    const clickOverlays = week.map((day, col) =>
      day.otherMonth ? '' : `<div class="cal-day-click-area" style="left:${(col/7*100).toFixed(2)}%;width:${(100/7).toFixed(2)}%;" ${dayClickAttr(day)}></div>`
    ).join('');
    const eventsRow  = `<div class="cal-week-events" style="height:${containerH}px;">${clickOverlays}${eventHtml}${overflowHtml}</div>`;
    const colSeps    = [1,2,3,4,5,6].map(i => `<div class="cal-col-sep" style="left:calc(${i}*100%/7)"></div>`).join('');
    weeksHtml.push(`<div class="cal-week">${colSeps}<div class="cal-week-days">${dayCells}</div>${eventsRow}</div>`);
  }

  grid.innerHTML = weeksHtml.join('');

  const emptyBox = document.getElementById('cal-grid-empty');
  if (emptyBox) {
    emptyBox.innerHTML = visReservas.length ? '' : AppModules.core.emptyStateHtml(
      '📅', 'Sem reservas neste mês', 'Nenhuma reserva visível com estes filtros.', { inline: true }
    );
  }

  renderCalendarAgenda(allDays.filter(day => !day.otherMonth).map(day => day.dateStr), filters);
  AppModules.calendario.renderCalLandscape(allDays, filters);
}

function closeCalendarOverflow() {
  const modal = document.getElementById('calendar-overflow-modal');
  if (!modal) return;
  AppUI.closeModal(modal);
  modal.remove();
}

function openCalendarOverflow(dateStr) {
  const filters = AppModules.calendario.getCalendarFilters();
  const reservations = AppModules.calendario.calendarReservas
    .filter(r => AppModules.calendario.reservationMatchesCalendarFilters(r, filters))
    .filter(r => r.check_in <= dateStr && r.check_out >= dateStr)
    .sort((a, b) => a.check_in.localeCompare(b.check_in) || a.guest_name.localeCompare(b.guest_name));
  const dateLabel = new Date(`${dateStr}T12:00:00`).toLocaleDateString('pt-PT', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });
  document.getElementById('calendar-overflow-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'calendar-overflow-modal';
  modal.className = 'modal-bg';
  modal.innerHTML = `<div class="modal calendar-overflow-dialog">
    <div class="modal-header">
      <div><h3>Reservas do dia</h3><p>${AppModules.core.escapeHtml(dateLabel)}</p></div>
      <button type="button" class="modal-close" aria-label="Fechar" ${AppActions.attrs("click", "mes-agenda-close-overflow-0d3c59b")}>${AppModules.core.lcIcon('x', 18)}</button>
    </div>
    <div class="calendar-overflow-list">
      ${reservations.map(r => `<button type="button" class="calendar-overflow-item" ${AppActions.attrs("click", "mes-agenda-open-overflow-reservation-b4219da", [String(r.id)])}>
        <span class="calendar-overflow-dot" style="background:${AppModules.calendario.calAccColor(r.accommodation_id)}"></span>
        <span><strong>${AppModules.core.escapeHtml(r.guest_name || 'Reserva')}</strong><small>${AppModules.core.escapeHtml(r.accommodation_name || 'Alojamento')} · ${AppModules.core.escapeHtml(r.status || '—')}</small></span>
      </button>`).join('')}
    </div>
  </div>`;
  document.body.appendChild(modal);
  AppUI.openModal(modal);
  if (window.lucide) lucide.createIcons();
}

function openOverflowReservation(id) {
  closeCalendarOverflow();
  AppModules.reservas.showDetail(id);
}

function toggleAgendaCheckoutFilter() {
  AppModules.calendario.calAgendaHideCheckedOut = !AppModules.calendario.calAgendaHideCheckedOut;
  AppModules.core.SS.set('calAgendaHideCheckedOut', AppModules.calendario.calAgendaHideCheckedOut);
  AppModules.calendario.renderCal();
}

function renderCalendarAgenda(monthDays, filters = AppModules.calendario.getCalendarFilters(), targetId = 'calendar-agenda-mobile') {
  const agenda = document.getElementById(targetId);
  if (!agenda) return;

  const filterBar = `<div class="agenda-checkout-filter-bar">
    <button type="button" class="legend-pill legend-checkout-filter${AppModules.calendario.calAgendaHideCheckedOut ? ' active' : ''}" data-on-click="mes-agenda-toggle-agenda-checkout-filter-3b558fb">
      ${AppModules.calendario.calAgendaHideCheckedOut ? 'A mostrar: sem check-out' : 'A mostrar: todas'}
    </button>
  </div>`;

  const monthReservations = AppModules.calendario.calendarReservas
    .filter(r => AppModules.calendario.reservationMatchesCalendarFilters(r, filters))
    .filter(r => !AppModules.calendario.calAgendaHideCheckedOut || !r.task_status?.checkout_done)
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
          const suiteInfos = AppModules.calendario.calReservationSuiteInfo(r);
          const isMulti    = suiteInfos.length > 1;
          const color      = suiteInfos[0].color;
          const isCheckIn  = r.check_in === dateStr;
          const isCheckOut = r.check_out === dateStr;
          const marker     = isCheckIn ? 'Check-in' : isCheckOut ? 'Check-out' : 'Estadia';
          const suitesHtml = isMulti
            ? `<span class="agenda-item-suites">${suiteInfos.map(s => `<small style="color:${s.color};"><span class="agenda-item-suite-dot" style="background:${s.color};"></span>${AppModules.core.escapeHtml(s.name)}</small>`).join('')}</span>`
            : `<small>${AppModules.core.escapeHtml(suiteInfos[0].name)} · ${marker}</small>`;
          const checkoutDot = r.task_status?.checkout_done ? '<span class="agenda-item-checkout-dot"></span>' : '';
          return `<button type="button" class="agenda-item${isMulti ? ' agenda-item-multi' : ''}" ${AppActions.attrs("click", "mes-agenda-show-detail-3d67b14", [String((r.id) ?? '')])} style="--agenda-color:${color};">
            ${checkoutDot}
            <span class="agenda-item-dot"></span>
            <span class="agenda-item-main">
              <strong>${AppModules.core.escapeHtml(r.guest_name || 'Reserva')}</strong>
              ${suitesHtml}
            </span>
            <span class="agenda-item-status">${r.status || '—'}</span>
          </button>`;
        }).join('')}
      </div>
    </section>`;
  }).filter(Boolean);

  const emptyMsg = monthDays.length === 1 ? 'Sem reservas visíveis neste dia.' : 'Sem reservas visíveis neste mês.';
  agenda.innerHTML = filterBar + (groups.join('') || AppModules.core.emptyStateHtml('📅', 'Sem reservas', emptyMsg, { inline: true }));
  if (window.lucide) lucide.createIcons();
}

// ── TELEMÓVEL EM PAISAGEM: grelha mensal dedicada a ecrã inteiro ──
// Chamada a partir de renderCal() com os dias já calculados (allDays),
// evita repetir a matemática do mês. Só tem efeito visual dentro do
// media query de paisagem (ver mobile.css) — em qualquer outra
// orientação/largura fica escondida, por isso é barato renderizar sempre.

AppActions.register({
  "mes-agenda-toggle-agenda-checkout-filter-3b558fb": (el, event, args) => { toggleAgendaCheckoutFilter() },
}, "click");

AppActions.register({
  "mes-agenda-show-detail-3d67b14": (el, event, args) => { AppModules.reservas.showDetail(args[0]) },
  "mes-agenda-stop-propagation-eb43f3e": (el, event, args) => { event.stopPropagation();AppModules.reservas.showDetail(args[0]) },
  "mes-agenda-open-overflow-87a42f1": (el, event, args) => { event.stopPropagation();openCalendarOverflow(args[0]) },
  "mes-agenda-close-overflow-0d3c59b": (el, event, args) => { closeCalendarOverflow() },
  "mes-agenda-open-overflow-reservation-b4219da": (el, event, args) => { openOverflowReservation(args[0]) },
  "mes-agenda-open-modal-from-calendar-76a36bf": (el, event, args) => { AppModules.reservas.openModalFromCalendar(args[0]) },
  "mes-agenda-open-block-from-calendar-969183d": (el, event, args) => { AppModules.bloqueios.openBlockFromCalendar(args[0], args[1]) },
}, "click");

})();
