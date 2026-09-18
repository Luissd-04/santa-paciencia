let calMode = SS.get('calMode', 'calendar');
// Agenda vertical (telemóvel em pé): por padrão só mostra reservas cujo
// check-out ainda não foi marcado — evita lista cheia de estadias já saídas.
let calAgendaHideCheckedOut = SS.get('calAgendaHideCheckedOut', true);
let tlPointerDrag = null;
let tlPanDrag = null;
let timelineDays  = SS.get('tlDays', 14);

// Constantes de layout do Calendário/Timeline — antes espalhadas como magic
// numbers por renderCal / renderCalLandscape / renderTimeline.
const CAL = {
  tlLabelW: 190,                       // largura da coluna de alojamento (timeline)
  tlZoom: { 7: 80, 14: 48, 30: 24 },   // dias visíveis -> px por dia
  tlZoomDefault: 48,
  laneH: 20,                           // altura de cada lane de reservas
  laneGap: 2,                          // folga entre lanes — grelha mensal desktop
  laneGapLandscape: 3,                 // folga entre lanes — grelha landscape
  maxSuiteRows: 3,                     // linhas visíveis numa barra multi-suíte
  tlBlockMinW: 18,                     // largura mínima de um bloco na timeline
  tlBlockInset: 4,                     // recorte à direita de um bloco na timeline
  weekdayNameMinDayW: 40,              // px/dia abaixo dos quais se esconde o nome do dia
  fallbackColor: '#843424',            // cor de alojamento sem cor definida
  alpha: { gridFill: '22', landFill: '18', tlFill: '18', tlBorder: '55' },
};

// Cor de um alojamento (com fallback único) — usado pelas 3 grelhas.
const calAccColor = id => (accommodations.find(a => a.id === id)?.color) || CAL.fallbackColor;

const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
let calLandSelectedDate = null;

// No mobile, os filtros do Calendário (suite/estado/canal) viram uma
// folha deslizante — mesmo mecanismo de #reservas-filter-panel
// (ver comentário em toggleReservasFiltersSheet, reserva-lista.js).
function toggleCalendarioFiltersSheet(open) {
  document.getElementById('calendario-filter-panel')?.classList.toggle('m-sheet-open', open);
  document.getElementById('calendario-filters-backdrop')?.classList.toggle('active', open);
  document.getElementById('view-calendario')?.classList.toggle('m-sheet-ancestor-fix', open);
}

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

// Como calReservationSuites, mas devolve também a cor de cada alojamento
// (para pintar cada linha da reserva multi-suíte com a cor certa).
function calReservationSuiteInfo(r) {
  let accs = [];
  try {
    accs = typeof r.accommodations_data === 'string'
      ? JSON.parse(r.accommodations_data || '[]')
      : (r.accommodations_data || []);
  } catch { accs = []; }
  if (Array.isArray(accs) && accs.length > 1) {
    return accs.map(a => {
      const found = accommodations.find(x => x.id === a.accommodation_id);
      return { name: a.name || found?.name || '—', color: found?.color || CAL.fallbackColor };
    });
  }
  const acc = accommodations.find(a => a.id === r.accommodation_id);
  return [{ name: r.accommodation_name || acc?.name || '—', color: acc?.color || CAL.fallbackColor }];
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
  const centerOffset = wrap ? wrap.scrollLeft + (wrap.clientWidth - CAL.tlLabelW) / 2 - CAL.tlLabelW : 0;
  const centerDayIdx = oldDayW > 0 ? centerOffset / oldDayW : 0;

  timelineDays = Number(days);
  SS.set('tlDays', timelineDays);
  updateTimelineRangeUi();

  if (calMode === 'timeline') {
    const newDayW = getTimelineDayWidth();
    renderTimeline(false);
    requestAnimationFrame(() => {
      if (wrap) wrap.scrollLeft = CAL.tlLabelW + centerDayIdx * newDayW - (wrap.clientWidth - CAL.tlLabelW) / 2;
    });
  }
}

function getTimelineDayWidth() {
  return CAL.tlZoom[timelineDays] || CAL.tlZoomDefault;
}

function scrollTimelineToToday(dayW) {
  const wrap = document.getElementById('timeline-wrap');
  if (!wrap) return;
  const today = new Date();
  const yearStart = new Date(today.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((today - yearStart) / 86400000);
  const todayX = CAL.tlLabelW + dayOfYear * dayW;
  wrap.scrollLeft = Math.max(0, todayX - CAL.tlLabelW - 2 * dayW);
}

// Contador da barra ("N reservas visíveis") — mesmo padrão de #view-reservas.
function setCalCount(n, label) {
  const total  = document.getElementById('cal-results-total');
  const detail = document.getElementById('cal-results-detail');
  if (total)  total.textContent  = String(n ?? 0);
  if (detail) detail.textContent = label || 'reservas visíveis';
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
