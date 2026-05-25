(function () {
  const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  let cur = { input: null, month: null, opts: {} };
  let _isOpening = false;

  function isoVal(v) { return window.ReservationDates?.normalizeIsoDate(v) || ''; }
  function ptVal(v)  { return window.ReservationDates?.formatPtDate(v)      || ''; }

  function close() {
    document.querySelector('.date-pop')?.remove();
    cur.input = null;
  }

  function open(input, opts) {
    if (!input) return;
    _isOpening = true;
    setTimeout(() => { _isOpening = false; }, 0);
    cur.input = input;
    cur.opts  = opts || {};
    const v   = isoVal(input.value);
    const now = new Date();
    if (v) {
      cur.month = new Date(`${v}T12:00:00`);
    } else if (cur.opts.isBirthDate) {
      cur.month = new Date(now.getFullYear() - 25, now.getMonth(), 1, 12);
    } else {
      cur.month = new Date(now.getFullYear(), now.getMonth(), 1, 12);
    }
    render();
  }

  function shift(delta) {
    if (!cur.month) return;
    cur.month = new Date(cur.month.getFullYear(), cur.month.getMonth() + delta, 1, 12);
    render();
  }

  function choose(day) {
    if (!cur.input || !cur.month) return;
    const d      = new Date(cur.month.getFullYear(), cur.month.getMonth(), day, 12);
    const iso    = d.toISOString().slice(0, 10);
    cur.input.value = ptVal(iso);
    cur.input.dispatchEvent(new Event('change', { bubbles: true }));
    if (typeof cur.opts.onChange === 'function') cur.opts.onChange(iso);
    close();
  }

  function render() {
    document.querySelector('.date-pop')?.remove();
    if (!cur.input || !cur.month) return;

    const y       = cur.month.getFullYear();
    const m       = cur.month.getMonth();
    const nowYear = new Date().getFullYear();
    const { isBirthDate, minDate, maxDate } = cur.opts;
    const yearMin = cur.opts.minYear ?? (isBirthDate ? 1900 : nowYear - 5);
    const yearMax = cur.opts.maxYear ?? (isBirthDate ? nowYear : nowYear + 10);
    const selIso  = isoVal(cur.input.value);
    const offset  = (new Date(y, m, 1).getDay() + 6) % 7;
    const days    = new Date(y, m + 1, 0).getDate();

    const pop = document.createElement('div');
    pop.className = 'date-pop';

    let html = '<div class="date-head">';
    html += '<button type="button" onclick="AppDatePicker._s(-12)" title="Ano anterior">«</button>';
    html += '<button type="button" onclick="AppDatePicker._s(-1)"  title="Mês anterior">‹</button>';
    html += '<select class="dp-month">';
    MONTHS.forEach((mon, i) => { html += `<option value="${i}"${i===m?' selected':''}>${mon}</option>`; });
    html += '</select>';
    html += '<select class="dp-year">';
    for (let yr = yearMin; yr <= yearMax; yr++) {
      html += `<option value="${yr}"${yr===y?' selected':''}>${yr}</option>`;
    }
    html += '</select>';
    html += '<button type="button" onclick="AppDatePicker._s(1)"   title="Próximo mês">›</button>';
    html += '<button type="button" onclick="AppDatePicker._s(12)"  title="Próximo ano">»</button>';
    html += '</div>';
    html += '<div class="date-week"><span>S</span><span>T</span><span>Q</span><span>Q</span><span>S</span><span>S</span><span>D</span></div>';
    html += '<div class="date-grid">';
    for (let i = 0; i < offset; i++) html += '<span></span>';
    for (let d = 1; d <= days; d++) {
      const dayIso  = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const isSel   = dayIso === selIso;
      const disabled = (minDate && dayIso < minDate) || (maxDate && dayIso > maxDate);
      if (disabled) {
        html += `<button type="button" class="dp-day dp-disabled">${d}</button>`;
      } else {
        html += `<button type="button" class="dp-day${isSel?' selected':''}" onclick="AppDatePicker._c(${d})">${d}</button>`;
      }
    }
    html += '</div>';
    pop.innerHTML = html;

    pop.querySelector('.dp-month')?.addEventListener('change', e => {
      cur.month = new Date(y, Number(e.target.value), 1, 12);
      render();
    });
    pop.querySelector('.dp-year')?.addEventListener('change', e => {
      cur.month = new Date(Number(e.target.value), m, 1, 12);
      render();
    });

    pop.addEventListener('click', e => e.stopPropagation());
    pop.addEventListener('mousedown', e => { if (e.target.tagName !== 'SELECT') e.preventDefault(); });
    document.body.appendChild(pop);

    const rect = cur.input.getBoundingClientRect();
    const pw   = pop.offsetWidth;
    const ph   = pop.offsetHeight;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - pw - 8));
    pop.style.left = `${left}px`;
    pop.style.top  = `${rect.bottom + 8}px`;
    if (rect.bottom + 8 + ph > window.innerHeight) {
      pop.style.top = `${rect.top - ph - 8}px`;
    }
  }

  function attach(input, opts) {
    if (!input || input.dataset.dpAttached) return;
    input.dataset.dpAttached = '1';
    opts = opts || {};

    if (input.type === 'date') {
      const v = input.value;
      input.type        = 'text';
      input.placeholder = 'dd-mm-aaaa';
      input.inputMode   = 'numeric';
      input.autocomplete = 'off';
      if (v) input.value = ptVal(v);
    }

    input.addEventListener('focus', () => open(input, opts));
    input.addEventListener('click', () => open(input, opts));

    const ctrl = input.closest('.birth-date-control');
    if (ctrl) {
      const btn = ctrl.querySelector('.birth-date-picker-btn');
      if (btn) btn.onclick = e => { e.stopPropagation(); open(input, opts); };
    } else {
      const wrap = document.createElement('div');
      wrap.className = 'birth-date-control';
      input.parentNode.insertBefore(wrap, input);
      wrap.appendChild(input);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'birth-date-picker-btn';
      btn.setAttribute('aria-label', 'Abrir calendário');
      btn.innerHTML = '<i data-lucide="calendar-days"></i>';
      btn.addEventListener('click', e => { e.stopPropagation(); open(input, opts); });
      wrap.appendChild(btn);
      if (window.lucide) lucide.createIcons();
    }
  }

  document.addEventListener('click', () => { if (!_isOpening) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

  window.AppDatePicker = { attach, open, close, _s: shift, _c: choose };
})();
