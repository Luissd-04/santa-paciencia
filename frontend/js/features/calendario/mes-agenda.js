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
  const todayStr = new Date().toISOString().slice(0, 10);

  const grid = document.getElementById('cal-grid');

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

  setCalCount(visReservas.length, visReservas.length === 1 ? 'reserva visível' : 'reservas visíveis');

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
    const dayIsBlocked = day => !day.otherMonth && typeof isDateBlockedAnywhere === 'function' && (
      filters.suite
        ? isDateBlockedForAccommodation(filters.suite, day.dateStr)
        : isDateBlockedAnywhere(day.dateStr)
    );
    // Dia bloqueado: o clique abre o bloqueio para edição em vez de nova reserva
    const dayClickAttr = day => day.otherMonth ? '' : (dayIsBlocked(day)
      ? `onclick="openBlockFromCalendar('${day.dateStr}', '${filters.suite || ''}')"`
      : `onclick="openModalFromCalendar('${day.dateStr}')"`);

    const dayCells = week.map(day => {
      const blocked = dayIsBlocked(day);
      return `<div class="cal-day${day.otherMonth ? ' other-month' : ''}${day.isToday ? ' today' : ''}${blocked ? ' cal-day-blocked' : ''}" ${dayClickAttr(day)}${blocked ? ' title="🔒 Data bloqueada — clique para editar"' : ''}>
        <div class="day-num">${day.dayNum}</div>
        ${blocked ? '<span class="cal-day-lock">🔒</span>' : ''}
      </div>`;
    }).join('');

    // Event spans — absolutely positioned so bars start/end at the midpoint of each day column
    let eventHtml = '';
    const visLanes = lanes.length;
    const { laneH: LANE_H, laneGap: LANE_GAP, maxSuiteRows: MAX_SUITE_ROWS } = CAL;

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
        const color      = calAccColor(r.accommodation_id);
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
        const suiteInfos = calReservationSuiteInfo(r);
        const isMulti    = suiteInfos.length > 1;
        const barH       = Math.min(suiteInfos.length, MAX_SUITE_ROWS) * LANE_H;
        const firstName  = escapeHtml(r.guest_name.split(' ')[0]);
        const inner      = isMulti
          ? suiteInfos.slice(0, MAX_SUITE_ROWS).map((s, idx) => {
              const rowBorder = startsHere ? `3px solid ${s.color}` : '3px solid transparent';
              return `<div class="cal-span-row" style="top:${idx * LANE_H}px;height:${LANE_H}px;background:${s.color}${CAL.alpha.gridFill};color:${s.color};border-left:${rowBorder};">
                <span class="cal-span-text">${firstName} · ${escapeHtml(s.name.replace('Suite ',''))}</span>
              </div>`;
            }).join('')
          : `<span class="cal-span-text">${firstName} · ${escapeHtml(r.accommodation_name.replace('Suite ',''))}</span>`;
        eventHtml += `<div class="cal-event-span ${statusCls}${checkoutCls} ${roundCls}${isMulti ? ' cal-event-multi' : ''}"
          style="left:${leftPct.toFixed(2)}%;width:${widthPct.toFixed(2)}%;top:${topPx}px;height:${barH}px;${isMulti ? '' : `background:${color}${CAL.alpha.gridFill};color:${color};border-left:${borderLeft};`}"
          onclick="event.stopPropagation();showDetail('${r.id}')"
          title="${escapeHtml(r.guest_name)} — ${escapeHtml(suiteInfos.map(s => s.name).join(' + '))}">
          ${inner}
        </div>`;
      }
    }

    const containerH = stackTop;
    const clickOverlays = week.map((day, col) =>
      day.otherMonth ? '' : `<div class="cal-day-click-area" style="left:${(col/7*100).toFixed(2)}%;width:${(100/7).toFixed(2)}%;" ${dayClickAttr(day)}></div>`
    ).join('');
    const eventsRow  = `<div class="cal-week-events" style="height:${containerH}px;">${clickOverlays}${eventHtml}</div>`;
    const colSeps    = [1,2,3,4,5,6].map(i => `<div class="cal-col-sep" style="left:calc(${i}*100%/7)"></div>`).join('');
    weeksHtml.push(`<div class="cal-week">${colSeps}<div class="cal-week-days">${dayCells}</div>${eventsRow}</div>`);
  }

  grid.innerHTML = weeksHtml.join('');

  const emptyBox = document.getElementById('cal-grid-empty');
  if (emptyBox) {
    emptyBox.innerHTML = visReservas.length ? '' : emptyStateHtml(
      '📅', 'Sem reservas neste mês', 'Nenhuma reserva visível com estes filtros.', { inline: true }
    );
  }

  renderCalendarAgenda(allDays.filter(day => !day.otherMonth).map(day => day.dateStr), filters);
  renderCalLandscape(allDays, filters);
}

function toggleAgendaCheckoutFilter() {
  calAgendaHideCheckedOut = !calAgendaHideCheckedOut;
  SS.set('calAgendaHideCheckedOut', calAgendaHideCheckedOut);
  renderCal();
}

function renderCalendarAgenda(monthDays, filters = getCalendarFilters(), targetId = 'calendar-agenda-mobile') {
  const agenda = document.getElementById(targetId);
  if (!agenda) return;

  const filterBar = `<div class="agenda-checkout-filter-bar">
    <button type="button" class="legend-pill legend-checkout-filter${calAgendaHideCheckedOut ? ' active' : ''}" onclick="toggleAgendaCheckoutFilter()">
      ${calAgendaHideCheckedOut ? 'A mostrar: sem check-out' : 'A mostrar: todas'}
    </button>
  </div>`;

  const monthReservations = reservas
    .filter(r => reservationMatchesCalendarFilters(r, filters))
    .filter(r => !calAgendaHideCheckedOut || !r.task_status?.checkout_done)
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
          const suiteInfos = calReservationSuiteInfo(r);
          const isMulti    = suiteInfos.length > 1;
          const color      = suiteInfos[0].color;
          const isCheckIn  = r.check_in === dateStr;
          const isCheckOut = r.check_out === dateStr;
          const marker     = isCheckIn ? 'Check-in' : isCheckOut ? 'Check-out' : 'Estadia';
          const suitesHtml = isMulti
            ? `<span class="agenda-item-suites">${suiteInfos.map(s => `<small style="color:${s.color};"><span class="agenda-item-suite-dot" style="background:${s.color};"></span>${escapeHtml(s.name)}</small>`).join('')}</span>`
            : `<small>${escapeHtml(suiteInfos[0].name)} · ${marker}</small>`;
          const checkoutDot = r.task_status?.checkout_done ? '<span class="agenda-item-checkout-dot"></span>' : '';
          return `<button type="button" class="agenda-item${isMulti ? ' agenda-item-multi' : ''}" onclick="showDetail('${r.id}')" style="--agenda-color:${color};">
            ${checkoutDot}
            <span class="agenda-item-dot"></span>
            <span class="agenda-item-main">
              <strong>${escapeHtml(r.guest_name || 'Reserva')}</strong>
              ${suitesHtml}
            </span>
            <span class="agenda-item-status">${r.status || '—'}</span>
          </button>`;
        }).join('')}
      </div>
    </section>`;
  }).filter(Boolean);

  const emptyMsg = monthDays.length === 1 ? 'Sem reservas visíveis neste dia.' : 'Sem reservas visíveis neste mês.';
  agenda.innerHTML = filterBar + (groups.join('') || emptyStateHtml('📅', 'Sem reservas', emptyMsg, { inline: true }));
  if (window.lucide) lucide.createIcons();
}

// ── TELEMÓVEL EM PAISAGEM: grelha mensal dedicada a ecrã inteiro ──
// Chamada a partir de renderCal() com os dias já calculados (allDays),
// evita repetir a matemática do mês. Só tem efeito visual dentro do
// media query de paisagem (ver mobile.css) — em qualquer outra
// orientação/largura fica escondida, por isso é barato renderizar sempre.
