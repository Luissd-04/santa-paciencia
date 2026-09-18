function renderCalLandscape(allDays, filters = getCalendarFilters()) {
  const grid  = document.getElementById('cll-grid');
  const title = document.getElementById('cll-title');
  if (!grid || !title) return;

  title.textContent = MONTHS_PT[calMonth] + ' ' + calYear;

  const visStart = allDays[0].dateStr;
  const visEnd   = allDays[allDays.length - 1].dateStr;
  // Mesmo critério do grid de secretária: barras contínuas por reserva,
  // mais longas primeiro para um empacotamento de lanes mais estável.
  const visReservas = reservas.filter(r =>
    reservationMatchesCalendarFilters(r, filters) && r.check_out >= visStart && r.check_in <= visEnd
  ).sort((a, b) => {
    const lenA = new Date(a.check_out) - new Date(a.check_in);
    const lenB = new Date(b.check_out) - new Date(b.check_in);
    return lenA !== lenB ? lenB - lenA : a.check_in.localeCompare(b.check_in);
  });

  const LANE_H = CAL.laneH, LANE_GAP = CAL.laneGapLandscape;
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

    const laneTops = [];
    let stackTop = 0;
    for (let l = 0; l < lanes.length; l++) {
      laneTops[l] = stackTop;
      stackTop += LANE_H + LANE_GAP;
    }

    const dayCells = week.map(day => {
      if (day.otherMonth) return `<div class="cll-day-cell cll-other"><div class="cll-day-num">${day.dayNum}</div></div>`;
      const blocked = typeof isDateBlockedAnywhere === 'function' && isDateBlockedAnywhere(day.dateStr);
      const numHtml = day.isToday
        ? `<div class="cll-today-num">${day.dayNum}</div>`
        : `<div class="cll-day-num">${day.dayNum}</div>`;
      return `<div class="cll-day-cell${blocked ? ' cll-locked' : ''}" onclick="openCalLandscapeNewReservation('${day.dateStr}')">
        ${numHtml}
        ${blocked ? '<i data-lucide="lock" class="cll-lock-icon"></i>' : ''}
      </div>`;
    }).join('');

    // Área de clique por coluna (dia inteiro) por baixo das barras — mesma
    // técnica do grid de secretária (clickOverlays antes, eventos depois).
    const clickAreas = week.map((day, col) =>
      day.otherMonth ? '' : `<div class="cll-day-click-area" style="left:${(col/7*100).toFixed(2)}%;width:${(100/7).toFixed(2)}%;" onclick="openCalLandscapeNewReservation('${day.dateStr}')"></div>`
    ).join('');

    let eventHtml = '';
    for (let l = 0; l < lanes.length; l++) {
      for (const { r, effStart, effEnd } of lanes[l]) {
        const color      = calAccColor(r.accommodation_id);
        const col0       = week.findIndex(d => d.dateStr === effStart);
        const col1       = week.findIndex(d => d.dateStr === effEnd);
        const startsHere = r.check_in  >= weekStart;
        const endsHere   = r.check_out <= weekEnd;
        const sameDay    = col0 === col1 && startsHere && endsHere;
        const leftPct  = sameDay ? col0 / 7 * 100 : (startsHere ? (col0 + 0.5) / 7 * 100 : 0);
        const rightPct = sameDay ? (col0 + 1) / 7 * 100 : (endsHere ? (col1 + 0.5) / 7 * 100 : 100);
        const widthPct = rightPct - leftPct;
        const roundCls  = (startsHere ? 'cll-span-round-left ' : '') + (endsHere ? 'cll-span-round-right' : '');
        const firstName = escapeHtml((r.guest_name || '').split(' ')[0]);
        const accName   = escapeHtml((r.accommodation_name || '').replace('Suite ', ''));
        const checkoutCls = r.task_status?.checkout_done ? ' cll-booking-checked-out' : '';
        eventHtml += `<div class="cll-booking${checkoutCls} ${roundCls}" style="left:${leftPct.toFixed(2)}%;width:${widthPct.toFixed(2)}%;top:${laneTops[l]}px;height:${LANE_H}px;background:${color}${CAL.alpha.landFill};border-left-color:${color};color:${color};" title="${escapeHtml(r.guest_name || '')} · ${escapeHtml(r.accommodation_name || '')}" onclick="event.stopPropagation();showDetail('${r.id}')">${firstName} · ${accName}</div>`;
      }
    }

    const colSeps = [1, 2, 3, 4, 5, 6].map(i => `<div class="cll-col-sep" style="left:calc(${i}*100%/7)"></div>`).join('');

    html += `<div class="cll-week">${colSeps}
      <div class="cll-week-days">${dayCells}</div>
      <div class="cll-week-events" style="height:${stackTop}px;">${clickAreas}${eventHtml}</div>
    </div>`;
  }

  grid.innerHTML = html;

  const emptyBox = document.getElementById('cll-empty');
  if (emptyBox) {
    emptyBox.innerHTML = visReservas.length ? '' : emptyStateHtml(
      '📅', 'Sem reservas neste mês', 'Nenhuma reserva visível com estes filtros.', { inline: true }
    );
  }

  if (window.lucide) lucide.createIcons();
}

// Toque num dia da grelha de paisagem: abre logo a criação de reserva nesse
// dia (tal como a grelha de secretária já faz via openModalFromCalendar).
function openCalLandscapeNewReservation(dateStr) {
  calLandSelectedDate = dateStr;
  openModalFromCalendar(dateStr);
}

// Atalho do botão "Bloquear datas" no topo da grelha de paisagem — usa o
// último dia tocado (ou hoje, se ainda nenhum foi selecionado).
function calLandBlockShortcut() {
  openBlockModal('', calLandSelectedDate || new Date().toISOString().slice(0, 10));
}

function calPrev() {
  if (calMode === 'timeline') {
    const wrap = document.getElementById('timeline-wrap');
    if (wrap) wrap.scrollLeft -= (wrap.clientWidth - CAL.tlLabelW) * 0.7;
    return;
  }
  calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } renderCal();
}

function calNext() {
  if (calMode === 'timeline') {
    const wrap = document.getElementById('timeline-wrap');
    if (wrap) wrap.scrollLeft += (wrap.clientWidth - CAL.tlLabelW) * 0.7;
    return;
  }
  calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } renderCal();
}

function goToday() {
  if (calMode === 'timeline') {
    scrollTimelineToToday(getTimelineDayWidth());
    return;
  }
  const today = new Date();
  calYear = today.getFullYear(); calMonth = today.getMonth(); renderCal();
}

// ── TIMELINE ──
function updateTimelineLabel() {
  const label = document.getElementById('cal-label');
  if (label) label.textContent = `Timeline ${new Date().getFullYear()}`;
}

