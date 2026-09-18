(function () {
  const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const MONTHS_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  // Em ecrãs de toque o seletor nativo do sistema é melhor — não o substituímos.
  const NATIVE = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

  let cur = blank();
  let _isOpening = false;
  let _lastClose = 0;
  let _lastCloseInput = null;

  function blank() {
    return { input: null, opts: {}, month: null, view: 'days', pop: null, focusIso: null, yearPage: 0 };
  }

  const RD = () => window.ReservationDates;
  function isoVal(v) { return RD() ? RD().normalizeIsoDate(v) : ''; }
  function ptVal(v) { return RD() ? RD().formatPtDate(v) : ''; }
  function isoOf(y, m, d) { return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }
  function todayIso() { const d = new Date(); return isoOf(d.getFullYear(), d.getMonth(), d.getDate()); }
  function addDaysIso(iso, n) {
    const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n);
    return isoOf(d.getFullYear(), d.getMonth(), d.getDate());
  }
  function addMonthsIso(iso, n) {
    const d = new Date(`${iso}T12:00:00`);
    const day = d.getDate();
    d.setDate(1); d.setMonth(d.getMonth() + n);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last));
    return isoOf(d.getFullYear(), d.getMonth(), d.getDate());
  }

  // ---------------------------------------------------------------- bounds
  function bounds() {
    const now = new Date().getFullYear();
    const bd = cur.opts.isBirthDate;
    return {
      min: cur.opts.minDate || (bd ? '1900-01-01' : null),
      max: cur.opts.maxDate || (bd ? todayIso() : null),
      yearMin: cur.opts.minYear != null ? cur.opts.minYear : (bd ? 1900 : now - 5),
      yearMax: cur.opts.maxYear != null ? cur.opts.maxYear : (bd ? now : now + 10),
    };
  }
  function disabledIso(iso, b) {
    b = b || bounds();
    return (b.min && iso < b.min) || (b.max && iso > b.max);
  }
  function clampIso(iso) {
    const b = bounds();
    if (b.min && iso < b.min) return b.min;
    if (b.max && iso > b.max) return b.max;
    return iso;
  }
  function rangeSiblingIso() {
    const s = cur.opts._rangeSibling;
    return s ? isoVal(s.value) : '';
  }

  // ---------------------------------------------------------------- open/close
  function open(input, opts) {
    if (!input) return;
    _isOpening = true;
    setTimeout(() => { _isOpening = false; }, 0);
    hardClose();

    cur = blank();
    cur.input = input;
    cur.opts = Object.assign({}, opts || {});
    // Constrangimentos de intervalo (calculados no momento de abrir)
    if (cur.opts._rangeRole === 'end' && cur.opts._rangeSibling) {
      const s = isoVal(cur.opts._rangeSibling.value);
      if (s) cur.opts.minDate = s;
    }
    if (cur.opts._rangeRole === 'start' && cur.opts._rangeSibling) {
      const e = isoVal(cur.opts._rangeSibling.value);
      if (e) cur.opts.maxDate = e;
    }

    const v = isoVal(input.value);
    const now = new Date();
    if (v) cur.month = new Date(`${v}T12:00:00`);
    else if (cur.opts.isBirthDate) cur.month = new Date(now.getFullYear() - 25, now.getMonth(), 1, 12);
    else cur.month = new Date(now.getFullYear(), now.getMonth(), 1, 12);
    cur.focusIso = v || clampIso(todayIso());

    render();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
  }

  function hardClose() {
    window.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', onResize);
    document.querySelectorAll('.date-pop').forEach(el => el.remove());
  }
  function close() {
    const input = cur.input;
    hardClose();
    cur = blank();
    _lastClose = Date.now();
    _lastCloseInput = input;
    return input;
  }

  function onScroll() {
    if (!cur.input) return;
    const r = cur.input.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) { close(); return; }
    position();
  }
  function onResize() { if (cur.input) position(); }

  // ---------------------------------------------------------------- commit
  function setInputValue(input, iso) {
    if (input.type === 'date') input.value = iso || '';
    else input.value = iso ? ptVal(iso) : '';
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function commit(iso) {
    if (!cur.input) return;
    const opts = cur.opts;
    setInputValue(cur.input, iso);
    if (typeof opts.onChange === 'function') opts.onChange(iso);

    // Fluxo de intervalo: ao escolher o início, avança para o fim — mas só se
    // o fim estiver por preencher (ou tiver ficado inválido).
    if (iso && opts._rangeRole === 'start' && opts._rangeSibling && !opts._rangeChained) {
      const sib = opts._rangeSibling;
      if (isoVal(sib.value) && isoVal(sib.value) < iso) setInputValue(sib, '');
      if (!isoVal(sib.value)) {
        const start = cur.input;
        const sibOpts = Object.assign({}, opts._rangeSiblingOpts, {
          _rangeRole: 'end', _rangeSibling: start, _rangeSiblingOpts: opts, _rangeChained: true,
        });
        close();
        setTimeout(() => open(sib, sibOpts), 0);
        return;
      }
    }
    close();
  }

  // ---------------------------------------------------------------- render
  function render() {
    hardCloseKeepListeners();
    if (!cur.input || !cur.month) return;

    const pop = document.createElement('div');
    pop.className = 'date-pop';
    pop.tabIndex = -1;
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Calendário');
    pop.innerHTML = cur.view === 'days' ? viewDays()
      : cur.view === 'months' ? viewMonths()
        : viewYears();

    wire(pop);
    pop.addEventListener('click', e => e.stopPropagation());
    pop.addEventListener('mousedown', e => {
      // não deixar o clique no "vazio" do popup tirar o foco / fechar
      if (e.target === pop || /date-(head|grid|week|foot)|dp-grid-my/.test(e.target.className)) e.preventDefault();
    });
    pop.addEventListener('keydown', onKey);

    document.body.appendChild(pop);
    cur.pop = pop;
    position();
    pop.focus({ preventScroll: true });
  }
  function hardCloseKeepListeners() {
    document.querySelectorAll('.date-pop').forEach(el => el.remove());
    cur.pop = null;
  }

  function headHtml(prevNav, caption, nextNav, capNav) {
    return '<div class="date-head">' +
      `<button type="button" class="dp-nav" data-nav="${prevNav}" aria-label="Anterior">‹</button>` +
      `<button type="button" class="dp-caption" data-nav="${capNav}">${caption}</button>` +
      `<button type="button" class="dp-nav" data-nav="${nextNav}" aria-label="Seguinte">›</button>` +
      '</div>';
  }

  function footHtml(b) {
    const todayOff = disabledIso(todayIso(), b);
    return '<div class="date-foot">' +
      `<button type="button" class="dp-foot-btn" data-act="today"${todayOff ? ' disabled' : ''}>Hoje</button>` +
      '<button type="button" class="dp-foot-btn dp-foot-clear" data-act="clear">Limpar</button>' +
      '</div>';
  }

  function viewDays() {
    const y = cur.month.getFullYear(), m = cur.month.getMonth();
    const b = bounds();
    const sel = isoVal(cur.input.value);
    const tIso = todayIso();
    const sibIso = cur.opts._rangeRole === 'end' ? rangeSiblingIso() : '';
    const offset = (new Date(y, m, 1).getDay() + 6) % 7;
    const total = new Date(y, m + 1, 0).getDate();

    let h = headHtml('pm', `${MONTHS[m]} ${y}`, 'nm', 'to-months');
    h += '<div class="date-week"><span>S</span><span>T</span><span>Q</span><span>Q</span><span>S</span><span>S</span><span>D</span></div>';
    h += '<div class="date-grid" role="grid">';
    for (let i = 0; i < offset; i++) h += '<span class="dp-day dp-pad"></span>';
    for (let d = 1; d <= total; d++) {
      const iso = isoOf(y, m, d);
      const cls = ['dp-day'];
      if (iso === sel) cls.push('selected');
      if (iso === tIso) cls.push('today');
      if (iso === cur.focusIso) cls.push('dp-focus');
      if (sibIso) {
        const a = sibIso < (cur.focusIso || sibIso) ? sibIso : (cur.focusIso || sibIso);
        const z = sibIso < (cur.focusIso || sibIso) ? (cur.focusIso || sibIso) : sibIso;
        if (iso > a && iso < z) cls.push('dp-in-range');
        if (iso === sibIso) cls.push('dp-range-anchor');
      }
      const dis = disabledIso(iso, b);
      if (dis) cls.push('dp-disabled');
      h += `<button type="button" class="${cls.join(' ')}" tabindex="-1" data-iso="${iso}"${dis ? ' aria-disabled="true"' : ''}>${d}</button>`;
    }
    h += '</div>';
    h += footHtml(b);
    return h;
  }

  function viewMonths() {
    const y = cur.month.getFullYear();
    let h = headHtml('py', String(y), 'ny', 'to-years');
    h += '<div class="dp-grid-my">';
    MONTHS_SHORT.forEach((mon, i) => {
      h += `<button type="button" class="dp-cell${i === cur.month.getMonth() ? ' selected' : ''}" data-month="${i}">${mon}</button>`;
    });
    h += '</div>';
    h += footHtml(bounds());
    return h;
  }

  function viewYears() {
    const b = bounds();
    const per = 12;
    const yr0 = cur.month.getFullYear();
    const start = yr0 - (((yr0 % per) + per) % per) + cur.yearPage * per;
    let h = headHtml('pyp', `${start}–${start + per - 1}`, 'nyp', 'to-months');
    h += '<div class="dp-grid-my">';
    for (let i = 0; i < per; i++) {
      const yr = start + i;
      const dis = yr < b.yearMin || yr > b.yearMax;
      h += `<button type="button" class="dp-cell${yr === yr0 ? ' selected' : ''}${dis ? ' dp-disabled' : ''}" data-year="${yr}">${yr}</button>`;
    }
    h += '</div>';
    h += footHtml(b);
    return h;
  }

  function wire(pop) {
    pop.querySelectorAll('[data-nav]').forEach(btn => btn.addEventListener('click', () => {
      const n = btn.dataset.nav;
      if (n === 'pm') shiftMonth(-1);
      else if (n === 'nm') shiftMonth(1);
      else if (n === 'py') shiftYear(-1);
      else if (n === 'ny') shiftYear(1);
      else if (n === 'pyp') { cur.yearPage--; render(); }
      else if (n === 'nyp') { cur.yearPage++; render(); }
      else if (n === 'to-months') { cur.view = 'months'; render(); }
      else if (n === 'to-years') { cur.view = 'years'; cur.yearPage = 0; render(); }
    }));
    pop.querySelectorAll('[data-iso]').forEach(btn => {
      if (btn.getAttribute('aria-disabled')) return;
      btn.addEventListener('click', () => commit(btn.dataset.iso));
      btn.addEventListener('mouseenter', () => {
        if (cur.opts._rangeRole === 'end') { cur.focusIso = btn.dataset.iso; paintRange(); }
      });
    });
    pop.querySelectorAll('[data-month]').forEach(btn => btn.addEventListener('click', () => {
      cur.month = new Date(cur.month.getFullYear(), Number(btn.dataset.month), 1, 12);
      cur.view = 'days'; render();
    }));
    pop.querySelectorAll('[data-year]').forEach(btn => {
      if (btn.classList.contains('dp-disabled')) return;
      btn.addEventListener('click', () => {
        cur.month = new Date(Number(btn.dataset.year), cur.month.getMonth(), 1, 12);
        cur.view = 'months'; render();
      });
    });
    pop.querySelectorAll('[data-act]').forEach(btn => btn.addEventListener('click', () => {
      if (btn.dataset.act === 'today') {
        const t = clampIso(todayIso());
        if (!disabledIso(t)) commit(t);
      } else {
        commit('');
      }
    }));
  }

  function shiftMonth(delta) {
    cur.month = new Date(cur.month.getFullYear(), cur.month.getMonth() + delta, 1, 12);
    render();
  }
  function shiftYear(delta) {
    cur.month = new Date(cur.month.getFullYear() + delta, cur.month.getMonth(), 1, 12);
    render();
  }

  function paintRange() {
    if (!cur.pop) return;
    const sibIso = rangeSiblingIso();
    if (!sibIso || !cur.focusIso) return;
    const a = sibIso < cur.focusIso ? sibIso : cur.focusIso;
    const z = sibIso < cur.focusIso ? cur.focusIso : sibIso;
    cur.pop.querySelectorAll('.dp-day[data-iso]').forEach(el => {
      const iso = el.dataset.iso;
      el.classList.toggle('dp-in-range', iso > a && iso < z && iso !== sibIso);
      el.classList.toggle('dp-focus', iso === cur.focusIso);
    });
  }

  // ---------------------------------------------------------------- keyboard
  function onKey(e) {
    if (e.key === 'Escape') { const i = close(); i && i.focus && i.focus(); return; }
    if (e.key === 'Tab') return trapTab(e);
    if (cur.view !== 'days') return;

    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.key in step) {
      e.preventDefault();
      moveFocus(addDaysIso(cur.focusIso || todayIso(), step[e.key]));
    } else if (e.key === 'PageUp') {
      e.preventDefault(); moveFocus(addMonthsIso(cur.focusIso, e.shiftKey ? -12 : -1));
    } else if (e.key === 'PageDown') {
      e.preventDefault(); moveFocus(addMonthsIso(cur.focusIso, e.shiftKey ? 12 : 1));
    } else if (e.key === 'Home') {
      e.preventDefault();
      const d = new Date(`${cur.focusIso}T12:00:00`);
      moveFocus(isoOf(d.getFullYear(), d.getMonth(), 1));
    } else if (e.key === 'End') {
      e.preventDefault();
      const d = new Date(`${cur.focusIso}T12:00:00`);
      moveFocus(isoOf(d.getFullYear(), d.getMonth(), new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (cur.focusIso && !disabledIso(cur.focusIso)) commit(cur.focusIso);
    }
  }

  function moveFocus(iso) {
    cur.focusIso = iso;
    const d = new Date(`${iso}T12:00:00`);
    if (d.getFullYear() !== cur.month.getFullYear() || d.getMonth() !== cur.month.getMonth()) {
      cur.month = new Date(d.getFullYear(), d.getMonth(), 1, 12);
      render();
    } else {
      cur.pop.querySelectorAll('.dp-day[data-iso]').forEach(el =>
        el.classList.toggle('dp-focus', el.dataset.iso === iso));
      if (cur.opts._rangeRole === 'end') paintRange();
    }
  }

  function trapTab(e) {
    const f = Array.from(cur.pop.querySelectorAll('button:not([disabled])'))
      .filter(b => b.tabIndex !== -1);
    if (!f.length) { e.preventDefault(); cur.pop.focus(); return; }
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === cur.pop)) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  }

  // ---------------------------------------------------------------- position
  function position() {
    const pop = cur.pop, input = cur.input;
    if (!pop || !input) return;
    const r = input.getBoundingClientRect();
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - pw - 8));
    let top = r.bottom + 8;
    if (top + ph > window.innerHeight && r.top - ph - 8 > 8) top = r.top - ph - 8;
    pop.style.left = left + 'px';
    pop.style.top = Math.max(8, top) + 'px';
  }

  // ---------------------------------------------------------------- attach
  function readNativeBounds(input, opts) {
    if (input.min && !opts.minDate) opts.minDate = isoVal(input.min);
    if (input.max && !opts.maxDate) opts.maxDate = isoVal(input.max);
  }

  function attach(input, opts) {
    if (!input || input.dataset.dpAttached || input.hasAttribute('data-dp-native')) return;
    opts = opts || {};
    input.dataset.dpAttached = '1';
    readNativeBounds(input, opts);
    if (NATIVE) return; // toque → seletor do sistema

    // Não converter o tipo: type=date mantém valor ISO (readonly, sem picker
    // nativo); type=text mantém a sua máscara de escrita e recebe valor PT.
    if (input.type === 'date') {
      input.readOnly = true;
      input.classList.add('dp-input');
    }
    input.setAttribute('autocomplete', 'off');

    // guarda contra reabrir imediatamente a seguir a fechar (o foco volta ao
    // campo após Escape/seleção e dispararia outra abertura)
    const openFn = () => {
      if (input === _lastCloseInput && Date.now() - _lastClose < 200) return;
      open(input, opts);
    };
    input.addEventListener('focus', openFn);
    input.addEventListener('click', openFn);
    // bloqueia o seletor nativo do browser (abre no mousedown) sem impedir o click
    input.addEventListener('mousedown', e => { if (input.readOnly) { e.preventDefault(); openFn(); } });
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); openFn(); }
      else if ((e.key === 'Enter' || e.key === ' ') && input.readOnly) { e.preventDefault(); openFn(); }
    });

    const ctrl = input.closest('.birth-date-control');
    if (ctrl) {
      const btn = ctrl.querySelector('.birth-date-picker-btn');
      if (btn) btn.onclick = e => { e.stopPropagation(); openFn(); };
    } else if (!input.hasAttribute('data-dp-no-button') && input.parentNode) {
      const wrap = document.createElement('div');
      wrap.className = 'birth-date-control';
      input.parentNode.insertBefore(wrap, input);
      wrap.appendChild(input);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'birth-date-picker-btn';
      btn.setAttribute('aria-label', 'Abrir calendário');
      btn.innerHTML = '<i data-lucide="calendar-days"></i>';
      btn.addEventListener('click', e => { e.stopPropagation(); openFn(); });
      wrap.appendChild(btn);
      if (window.lucide) lucide.createIcons();
    }
  }

  function attachRange(fromInput, toInput, opts) {
    opts = opts || {};
    if (NATIVE) {
      if (fromInput && toInput) {
        const sync = () => { toInput.min = fromInput.value || ''; };
        fromInput.addEventListener('change', sync);
        sync();
      }
      return;
    }
    if (fromInput) attach(fromInput, Object.assign({}, opts, {
      _rangeRole: 'start', _rangeSibling: toInput, _rangeSiblingOpts: opts,
    }));
    if (toInput) attach(toInput, Object.assign({}, opts, {
      _rangeRole: 'end', _rangeSibling: fromInput, _rangeSiblingOpts: opts,
    }));
  }

  function enhanceAll(root) {
    root = root || document;
    // Pares de intervalo declarados: data-dp-range-end="<id do campo inicial>"
    root.querySelectorAll('input[data-dp-range-end]:not([data-dp-attached])').forEach(to => {
      const from = document.getElementById(to.getAttribute('data-dp-range-end'));
      if (from) attachRange(from, to, from.hasAttribute('data-dp-birthdate') ? { isBirthDate: true } : {});
    });
    root.querySelectorAll('input[type="date"]:not([data-dp-attached]):not([data-dp-native])').forEach(el => {
      if (el.closest('.date-pop')) return;
      attach(el, el.hasAttribute('data-dp-birthdate') ? { isBirthDate: true } : {});
    });
  }

  // ---------------------------------------------------------------- init (só backoffice)
  const IS_BACKOFFICE = !!document.getElementById('app-layout');
  if (IS_BACKOFFICE) {
    let moT = null;
    const mo = new MutationObserver(() => {
      clearTimeout(moT);
      moT = setTimeout(() => enhanceAll(document), 60);
    });
    const boot = () => { enhanceAll(document); mo.observe(document.body, { childList: true, subtree: true }); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }

  document.addEventListener('pointerdown', e => {
    if (_isOpening || !cur.pop) return;
    if (cur.pop.contains(e.target) || e.target === cur.input) return;
    close();
  });

  window.AppDatePicker = {
    attach, attachRange, open, close, enhanceAll,
    _s: shiftMonth,
    _c: (d) => { if (cur.month) commit(isoOf(cur.month.getFullYear(), cur.month.getMonth(), d)); },
  };
})();
