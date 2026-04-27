let calMode = 'calendar';
let timelineStart = new Date();
timelineStart.setHours(0, 0, 0, 0);

const TL_DAYS      = 30;
const TL_LABEL_W   = 190;
const TL_DAY_W     = 52;  // Fixed width per day — always overflows → horizontal scroll

// ── PUBLIC ENTRY POINT ──
function renderCalView() {
  if (calMode === 'timeline') renderTimeline();
  else renderCal();
}

function setCalMode(m) {
  calMode = m;
  document.querySelectorAll('.cal-mode-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.mode === m));
  const calWrap  = document.querySelector('.cal-wrap');
  const tlWrap   = document.getElementById('timeline-wrap');
  if (calWrap) calWrap.style.display  = m === 'calendar'  ? '' : 'none';
  if (tlWrap)  tlWrap.style.display   = m === 'timeline'  ? '' : 'none';
  if (m === 'timeline') { updateTimelineLabel(); renderTimeline(); }
  else renderCal();
}

// ── CALENDAR ──
function renderCal() {
  const suiteFilter = document.getElementById('cal-suite-filter').value;
  const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  document.getElementById('cal-label').textContent = months[calMonth] + ' ' + calYear;

  const firstDay  = new Date(calYear, calMonth, 1).getDay();
  const daysInM   = new Date(calYear, calMonth + 1, 0).getDate();
  const prevDays  = new Date(calYear, calMonth, 0).getDate();

  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';

  for (let i = firstDay - 1; i >= 0; i--) {
    grid.innerHTML += `<div class="cal-day other-month"><div class="day-num">${prevDays - i}</div></div>`;
  }

  for (let d = 1; d <= daysInM; d++) {
    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isToday = dateStr === now.toISOString().slice(0, 10);

    const dayReservas = reservas.filter(r => {
      if (r.status === 'cancelada') return false;
      if (suiteFilter && r.accommodation_id !== suiteFilter) return false;
      return dateStr >= r.check_in && dateStr < r.check_out;
    });

    const events = dayReservas.slice(0, 3).map(r => `
      <div class="cal-event event-${r.accommodation_id}" onclick="event.stopPropagation();showDetail('${r.id}')" title="${r.guest_name} — ${r.accommodation_name}">
        ${r.guest_name.split(' ')[0]} · ${r.accommodation_name.replace('Suite ', '')}
      </div>`).join('') +
      (dayReservas.length > 3 ? `<div style="font-size:10px;color:var(--cinza);padding:2px 6px;">+${dayReservas.length - 3} mais</div>` : '');

    grid.innerHTML += `<div class="cal-day${isToday ? ' today' : ''}">
      <div class="day-num">${d}</div>${events}
    </div>`;
  }

  const total  = firstDay + daysInM;
  const remain = total % 7 === 0 ? 0 : 7 - (total % 7);
  for (let i = 1; i <= remain; i++) {
    grid.innerHTML += `<div class="cal-day other-month"><div class="day-num">${i}</div></div>`;
  }
}

function calPrev() {
  if (calMode === 'timeline') {
    timelineStart = new Date(timelineStart);
    timelineStart.setDate(timelineStart.getDate() - 14);
    updateTimelineLabel();
    renderTimeline();
    return;
  }
  calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } renderCal();
}

function calNext() {
  if (calMode === 'timeline') {
    timelineStart = new Date(timelineStart);
    timelineStart.setDate(timelineStart.getDate() + 14);
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
  end.setDate(end.getDate() + TL_DAYS - 1);
  const ms = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  label.textContent = `${timelineStart.getDate()} ${ms[timelineStart.getMonth()]} — ${end.getDate()} ${ms[end.getMonth()]} ${end.getFullYear()}`;
}

function renderTimeline() {
  const wrap = document.getElementById('timeline-wrap');
  if (!wrap) return;

  const dayW = TL_DAY_W;

  const suiteFilter = document.getElementById('cal-suite-filter').value;
  const alojList    = suiteFilter
    ? accommodations.filter(a => a.id === suiteFilter)
    : accommodations;

  const start    = new Date(timelineStart);
  const todayStr = new Date().toISOString().slice(0, 10);
  const dayNames = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

  const days = [];
  for (let i = 0; i < TL_DAYS; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }

  const endDate = new Date(start);
  endDate.setDate(endDate.getDate() + TL_DAYS);
  const startStr = start.toISOString().slice(0, 10);
  const endStr   = endDate.toISOString().slice(0, 10);

  const headerDays = days.map(d => {
    const ds      = d.toISOString().slice(0, 10);
    const isToday = ds === todayStr;
    return `<div class="tl-day-head${isToday ? ' tl-today' : ''}" style="width:${dayW}px;min-width:${dayW}px;">
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
          return `<div class="tl-cell${ds === todayStr ? ' tl-today-col' : ''}" style="width:${dayW}px;min-width:${dayW}px;"></div>`;
        }).join('');

        const alojReservas = reservas.filter(r =>
          r.accommodation_id === a.id &&
          r.status !== 'cancelada' &&
          r.check_out > startStr &&
          r.check_in  < endStr
        );

        const blocks = alojReservas.map(r => {
          const ci     = new Date(r.check_in  + 'T00:00:00');
          const co     = new Date(r.check_out + 'T00:00:00');
          const offset = Math.round((ci - start) / 86400000);
          const nights = Math.round((co - ci)    / 86400000);
          const visOff  = Math.max(0, offset);
          const visDays = Math.min(nights + Math.min(0, offset), TL_DAYS - visOff);
          if (visDays <= 0) return '';
          const left  = visOff  * dayW;
          const width = visDays * dayW - 4;
          const bg    = ACCOM_COLOR[r.accommodation_id] || STATUS_BG[r.status] || STATUS_BG.outro;
          return `<div class="tl-block" style="left:${left}px;width:${width}px;background:${bg}18;border-color:${bg}55;"
                       onclick="showDetail('${r.id}')"
                       title="${r.guest_name} · ${r.check_in} → ${r.check_out}">
            <span class="tl-block-name">${r.guest_name.split(' ')[0]}</span>
            <span class="tl-block-status" style="color:${bg};">${r.status}</span>
          </div>`;
        }).join('');

        return `<div class="tl-row">
          <div class="tl-label" style="min-width:${TL_LABEL_W}px;max-width:${TL_LABEL_W}px;">${a.name}</div>
          <div class="tl-days-area" style="width:${TL_DAYS * dayW}px;flex:none;">
            <div class="tl-cells">${dayBg}</div>
            ${blocks}
          </div>
        </div>`;
      }).join('');

  const totalW = TL_LABEL_W + TL_DAYS * dayW;

  wrap.innerHTML = `
    <div class="timeline-scroll" style="min-width:${totalW}px;">
      <div class="tl-header">
        <div class="tl-label tl-header-label" style="min-width:${TL_LABEL_W}px;max-width:${TL_LABEL_W}px;">Alojamento</div>
        <div style="display:flex;">${headerDays}</div>
      </div>
      <div class="tl-body">${rows}</div>
    </div>
    <div class="tl-nav-hint">
      ${lcIcon('move-horizontal', 12)} Arraste horizontalmente para navegar · Use ← → para mudar de período
    </div>`;

  if (window.lucide) lucide.createIcons();
}
