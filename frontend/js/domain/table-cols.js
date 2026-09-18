/* ═══════════════════════════════════════════════════════════════
   SANTA PACIÊNCIA — colunas de tabela redimensionáveis + reordenáveis
   Extraído do padrão de #reservas-table. data-col liga <col> ↔ <th> ↔ <td>.

   Estado guardado (session ou localStorage, via `storage`):
     <key>:colw     → { colKey: valor }   larguras/pesos por coluna
     <key>:colorder → [colKey, ...]       ordem (`lastFixed` fica sempre no fim)

   Dois modos (`mode`):
     'scroll' (default) — larguras em px absolutos; a tabela pode ser mais larga
                          que o container → scroll horizontal. (ex.: Reservas, 13 col.)
     'fit'             — os valores guardados são PESOS (proporções). As colunas
                          re-escalam sempre para caber na largura visível,
                          mantendo as proporções. Um ResizeObserver reajusta
                          quando o container muda (sidebar, janela). (ex.: Despesas)

   Uso:
     const layout = createColLayout({
       tableId: 'despesas-table', storageKey: 'desp', storage: 'local',
       mode: 'fit', wrapSelector: '.despesas-table-wrap',
       lastFixed: 'actions',
       columns: [{ key, label, sort, defaultW, minW, flex }, ...],
       onSort, sortState: () => ({ col, asc }), onReorder,
     });
     layout.renderHead();   // no render da tabela
     tbody.innerHTML = layout.order.map(k => cell[k](row)).join('');
═══════════════════════════════════════════════════════════════ */

function createColLayout(opts) {
  const {
    tableId, storageKey, columns, lastFixed = null,
    wrapSelector = null, activeViewId = null,
    mode = 'scroll', storage = 'session',
    minW = 52, maxW = 640,
    onSort = null, sortState = null, onReorder = null,
  } = opts;

  const IS_FIT = mode === 'fit';
  const META = Object.fromEntries(columns.map(c => [c.key, c]));
  const KEYS = columns.map(c => c.key);
  const FLEX = columns.filter(c => c.flex).map(c => c.key);
  const DEFAULT_W = Object.fromEntries(columns.map(c => [c.key, c.defaultW || 120]));
  const MIN_W = Object.fromEntries(columns.map(c => [c.key, c.minW || minW]));
  const KW = storageKey + ':colw';
  const KO = storageKey + ':colorder';

  // ── Persistência (session por defeito; local sobrevive ao fechar o browser) ──
  const store = {
    get(k, d) {
      if (storage === 'local') {
        try { const v = localStorage.getItem('sp:' + k); return v == null ? d : JSON.parse(v); }
        catch { return d; }
      }
      return SS.get(k, d);
    },
    set(k, v) {
      if (storage === 'local') {
        try { localStorage.setItem('sp:' + k, JSON.stringify(v)); } catch (_) {}
        return;
      }
      SS.set(k, v);
    },
  };

  let order = (() => {
    const saved = store.get(KO, null);
    let o = Array.isArray(saved) ? saved.filter(k => META[k]) : [];
    KEYS.forEach(k => { if (!o.includes(k)) o.push(k); });
    if (lastFixed) { o = o.filter(k => k !== lastFixed); o.push(lastFixed); }
    return o;
  })();

  const table = () => document.getElementById(tableId);

  function wrapAvailWidth() {
    const wrap = wrapSelector ? document.querySelector(wrapSelector) : null;
    if (!wrap || !wrap.clientWidth) return 0;
    const cs = getComputedStyle(wrap);
    return Math.floor(wrap.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0));
  }

  // Distribui `target` px por `keys` proporcionalmente a `weight`, nunca abaixo
  // de `min`. Se nem os mínimos couberem, devolve os mínimos (a tabela faz scroll).
  function allocProportional(keys, target, weight, min) {
    const out = {};
    const sumMin = keys.reduce((a, k) => a + min[k], 0);
    if (!target || target <= sumMin) { keys.forEach(k => { out[k] = min[k]; }); return out; }
    let pool = keys.slice();
    let remaining = target;
    let changed = true;
    while (changed && pool.length) {
      changed = false;
      const sw = pool.reduce((a, k) => a + weight[k], 0) || 1;
      for (const k of pool.slice()) {
        if (remaining * (weight[k] / sw) < min[k]) {
          out[k] = min[k];
          remaining -= min[k];
          pool = pool.filter(x => x !== k);
          changed = true;
        }
      }
    }
    const sw = pool.reduce((a, k) => a + weight[k], 0) || 1;
    let acc = 0;
    pool.forEach((k, i) => {
      out[k] = i === pool.length - 1
        ? Math.max(min[k], remaining - acc)
        : Math.max(min[k], Math.round(remaining * (weight[k] / sw)));
      acc += out[k];
    });
    return out;
  }

  function savedMap() {
    const s = store.get(KW, null);
    return (s && typeof s === 'object') ? s : null;
  }
  function hasManualWidths() {
    const s = savedMap();
    return !!(s && Object.keys(s).length > 0);
  }

  // ── Larguras a aplicar (por modo) ──
  function widths() {
    if (IS_FIT) {
      // valores guardados = pesos; sem eles → defaultW como peso
      const weight = { ...DEFAULT_W };
      const saved = savedMap();
      if (saved) Object.keys(saved).forEach(k => {
        const n = Number(saved[k]);
        if (weight[k] != null && n > 0) weight[k] = n;
      });
      const avail = wrapAvailWidth();
      if (!avail) return { ...DEFAULT_W };
      return allocProportional(order, avail, weight, MIN_W);
    }
    // modo scroll: px absolutos
    const out = { ...DEFAULT_W };
    const saved = savedMap();
    if (saved && Object.keys(saved).length) {
      Object.keys(saved).forEach(k => {
        const n = Number(saved[k]);
        if (out[k] != null && n >= minW && n <= maxW) out[k] = Math.round(n);
      });
      return out;
    }
    const avail = wrapAvailWidth();
    const sum = KEYS.reduce((a, k) => a + out[k], 0);
    if (avail && avail > sum + 4 && FLEX.length) {
      const extra = avail - sum;
      const flexSum = FLEX.reduce((a, k) => a + out[k], 0) || 1;
      let used = 0;
      FLEX.forEach((k, i) => {
        const add = i === FLEX.length - 1 ? extra - used : Math.round(extra * (out[k] / flexSum));
        out[k] += add;
        used += add;
      });
    }
    return out;
  }

  function saveWidths(map) {
    store.set(KW, map);
  }

  function recomputeMetrics() {
    const t = table();
    if (!t) return;
    const cols = Array.from(t.querySelectorAll('colgroup > col[data-col]'));
    const total = cols.reduce((a, c) => a + (parseFloat(c.style.width) || 0), 0);
    t.style.width = total + 'px';
    t.style.minWidth = total + 'px';
  }

  function applyWidths() {
    const t = table();
    if (!t) return;
    const w = widths();
    t.querySelectorAll('colgroup > col[data-col]').forEach(col => {
      if (w[col.dataset.col]) col.style.width = w[col.dataset.col] + 'px';
    });
    recomputeMetrics();
  }

  function restoreSortIcon() {
    const t = table();
    if (!t || !sortState) return;
    const st = sortState() || {};
    t.querySelectorAll('.sort-icon').forEach(el => { el.textContent = '↕'; el.style.opacity = '0.25'; });
    const icon = st.col && t.querySelector('#sort-' + st.col);
    if (icon) { icon.textContent = st.asc ? '↑' : '↓'; icon.style.opacity = '1'; }
  }

  function currentColPx() {
    const t = table();
    const out = {};
    if (t) t.querySelectorAll('colgroup > col[data-col]').forEach(c => {
      out[c.dataset.col] = parseFloat(c.style.width) || DEFAULT_W[c.dataset.col];
    });
    return out;
  }

  function initResize() {
    const t = table();
    const headRow = t && t.querySelector('thead tr');
    if (!headRow) return;
    const ths = Array.from(headRow.querySelectorAll('th[data-col]'));
    ths.forEach((th, i) => {
      if (i === ths.length - 1) return;           // última coluna não redimensiona
      if (th.querySelector('.col-resizer')) return;
      const grip = document.createElement('span');
      grip.className = 'col-resizer';
      grip.setAttribute('aria-hidden', 'true');
      grip.setAttribute('draggable', 'false');
      th.appendChild(grip);

      const key = th.dataset.col;
      let startX = 0, base = null;
      const point = e => (e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX);

      const onMoveFit = e => {
        if (!base) return;
        const dx = point(e) - startX;
        const others = order.filter(k => k !== key);
        const avail = order.reduce((a, k) => a + base[k], 0);
        const sumMinOthers = others.reduce((a, k) => a + MIN_W[k], 0);
        const newC = Math.max(MIN_W[key], Math.min(avail - sumMinOthers, base[key] + dx));
        const rest = allocProportional(others, avail - newC, base, MIN_W);
        const t2 = table();
        t2.querySelectorAll('colgroup > col[data-col]').forEach(col => {
          const k = col.dataset.col;
          col.style.width = (k === key ? newC : rest[k]) + 'px';
        });
        recomputeMetrics();
        if (e.cancelable) e.preventDefault();
      };
      const onMoveScroll = e => {
        if (!base) return;
        const colEl = table().querySelector('colgroup > col[data-col="' + key + '"]');
        if (!colEl) return;
        const px = Math.max(minW, Math.min(maxW, base[key] + (point(e) - startX)));
        colEl.style.width = px + 'px';
        recomputeMetrics();
        if (e.cancelable) e.preventDefault();
      };
      const onMove = IS_FIT ? onMoveFit : onMoveScroll;

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onUp);
        document.body.classList.remove('col-resizing');
        if (!base) return;
        if (IS_FIT) {
          // guarda as larguras atuais como pesos (só as proporções importam)
          saveWidths(currentColPx());
        } else {
          if (!hasManualWidths()) saveWidths(currentColPx());
          const map = savedMap() || {};
          const colEl = table().querySelector('colgroup > col[data-col="' + key + '"]');
          map[key] = Math.round(parseFloat(colEl && colEl.style.width) || base[key]);
          saveWidths(map);
        }
        base = null;
        recomputeMetrics();
      };
      const onDown = e => {
        e.preventDefault();
        e.stopPropagation();
        base = currentColPx();
        startX = point(e);
        document.body.classList.add('col-resizing');
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onUp);
      };
      grip.addEventListener('mousedown', onDown);
      grip.addEventListener('touchstart', onDown, { passive: false });
      grip.addEventListener('click', e => e.stopPropagation());
    });
  }

  let dragKey = null;
  function initDnD() {
    const t = table();
    const tr = t && t.querySelector('thead tr');
    if (!tr) return;
    const clearMarks = () => tr.querySelectorAll('.th-dragging,.th-drop-l,.th-drop-r')
      .forEach(el => el.classList.remove('th-dragging', 'th-drop-l', 'th-drop-r'));

    tr.querySelectorAll('th[data-col]').forEach(th => {
      const key = th.dataset.col;
      if (key === lastFixed) return;
      th.addEventListener('dragstart', e => {
        if (e.target && e.target.classList && e.target.classList.contains('col-resizer')) { e.preventDefault(); return; }
        dragKey = key;
        th.classList.add('th-dragging');
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', key); } catch (_) {}
      });
      th.addEventListener('dragend', () => { dragKey = null; clearMarks(); });
      th.addEventListener('dragover', e => {
        if (!dragKey || dragKey === key) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const rect = th.getBoundingClientRect();
        const after = (e.clientX - rect.left) > rect.width / 2;
        th.classList.toggle('th-drop-r', after);
        th.classList.toggle('th-drop-l', !after);
      });
      th.addEventListener('dragleave', () => th.classList.remove('th-drop-l', 'th-drop-r'));
      th.addEventListener('drop', e => {
        e.preventDefault();
        const from = dragKey;
        dragKey = null;
        clearMarks();
        if (!from || from === key) return;
        const rect = th.getBoundingClientRect();
        const after = (e.clientX - rect.left) > rect.width / 2;
        let o = order.filter(k => k !== from);
        let idx = o.indexOf(key);
        if (idx < 0) return;
        if (after) idx += 1;
        o.splice(idx, 0, from);
        if (lastFixed) { o = o.filter(k => k !== lastFixed); o.push(lastFixed); }
        order = o;
        store.set(KO, order);
        renderHead();
        if (onReorder) onReorder();
      });
    });
  }

  function renderHead() {
    const t = table();
    if (!t) return;
    const cg = t.querySelector('colgroup');
    const tr = t.querySelector('thead tr');
    if (!cg || !tr) return;
    const w = widths();
    cg.innerHTML = order.map(k => `<col data-col="${k}" style="width:${w[k]}px">`).join('');
    tr.innerHTML = order.map(k => {
      const c = META[k];
      const drag = k === lastFixed ? 'false' : 'true';
      const icon = c.sort ? ` <span class="sort-icon" id="sort-${c.sort}"></span>` : '';
      return `<th data-col="${k}" draggable="${drag}" class="th-col${c.sort ? ' th-sort' : ''}">${c.label}${icon}</th>`;
    }).join('');
    if (onSort) {
      tr.querySelectorAll('th[data-col]').forEach(th => {
        const c = META[th.dataset.col];
        if (!c || !c.sort) return;
        th.addEventListener('click', e => {
          if (e.target && e.target.classList && e.target.classList.contains('col-resizer')) return;
          onSort(c.sort);
        });
      });
    }
    applyWidths();
    initResize();
    initDnD();
    restoreSortIcon();
    if (window.lucide) lucide.createIcons();
  }

  // ── Reagir a mudanças de largura disponível ──
  let fitT = null;
  let lastAvail = 0;
  const reflow = () => { clearTimeout(fitT); fitT = setTimeout(applyWidths, 90); };

  if (IS_FIT && typeof ResizeObserver === 'function') {
    // Apanha sidebar a abrir/fechar, janela, etc. O guard de ±4px evita o
    // loop clássico "aparece scrollbar → clientWidth muda → re-fit → some".
    const startRO = () => {
      const wrap = wrapSelector && document.querySelector(wrapSelector);
      if (!wrap) { setTimeout(startRO, 300); return; }
      lastAvail = wrapAvailWidth();
      new ResizeObserver(() => {
        const a = wrapAvailWidth();
        if (!a || Math.abs(a - lastAvail) < 4) return;
        lastAvail = a;
        reflow();
      }).observe(wrap);
    };
    startRO();
  } else {
    // modo scroll: só re-fit enquanto o utilizador não fixar larguras à mão
    window.addEventListener('resize', () => {
      if (hasManualWidths()) return;
      if (activeViewId) {
        const v = document.getElementById(activeViewId);
        if (!v || !v.classList.contains('active')) return;
      }
      reflow();
    });
  }

  return {
    get order() { return order; },
    renderHead,
    applyWidths,
    restoreSortIcon,
    reset() { store.set(KW, {}); applyWidths(); },
  };
}
