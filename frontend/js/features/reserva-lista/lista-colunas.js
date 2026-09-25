// Estado privado; interface partilhada em AppModules.reservas.
(() => {
AppModules.define('reservas', {
  applyReservasColWidths: { get: () => applyReservasColWidths },
  renderReservasHead: { get: () => renderReservasHead },
  RES_CELL: { get: () => RES_CELL },
  resColOrder: { get: () => resColOrder, set: value => { resColOrder = value; } },
});

// ── Colunas da lista: redimensionáveis E reordenáveis pelo utilizador ──
// data-col liga <col> ↔ <th> ↔ <td>. Estado guardado em SS:
//   res:colw     → { key: larguraPx }  (larguras manuais; se vazio → auto-fit ao ecrã)
//   res:colorder → [key, ...]          (ordem; 'actions' fica sempre no fim)
const RES_COLUMNS = [
  { key: 'id',                 label: 'ID',         sort: 'id' },
  { key: 'created_at',         label: 'Reserva',    sort: 'created_at' },
  { key: 'guest_name',         label: 'Hóspede',    sort: 'guest_name' },
  { key: 'accommodation_name', label: 'Alojamento', sort: 'accommodation_name' },
  { key: 'check_in',           label: 'Check-in',   sort: 'check_in' },
  { key: 'check_out',          label: 'Check-out',  sort: 'check_out' },
  { key: 'nights',             label: 'Noites',     sort: 'nights' },
  { key: 'num_guests',         label: 'Hóspedes',   sort: 'num_guests' },
  { key: 'total_amount',       label: 'Total',      sort: 'total_amount' },
  { key: 'channel',            label: 'Canal',      sort: 'channel' },
  { key: 'status',             label: 'Estado',     sort: 'status' },
  { key: 'payment_status',     label: 'Pagamento',  sort: 'payment_status' },
  { key: 'actions',            label: 'Ações',      sort: null },
];
const RES_COL_META = Object.fromEntries(RES_COLUMNS.map(c => [c.key, c]));
const RES_COL_KEYS = RES_COLUMNS.map(c => c.key);
// colunas que "esticam" para a tabela encher o ecrã quando não há larguras manuais
const RES_COL_FLEX = ['guest_name', 'accommodation_name', 'channel', 'status', 'payment_status'];
const RES_COL_DEFAULT_W = {
  id: 96, created_at: 96, guest_name: 190, accommodation_name: 160,
  check_in: 96, check_out: 96, nights: 62, num_guests: 84,
  total_amount: 88, channel: 92, status: 112, payment_status: 120, actions: 132,
};
const RES_COL_MIN_W = 52;
const RES_COL_MAX_W = 640;

let resColOrder = (function () {
  const saved = AppModules.core.SS.get('res:colorder', null);
  let order = Array.isArray(saved) ? saved.filter(k => RES_COL_META[k]) : [];
  RES_COL_KEYS.forEach(k => { if (!order.includes(k)) order.push(k); });
  order = order.filter(k => k !== 'actions');
  order.push('actions'); // "Ações" fica sempre encostada à direita
  return order;
})();

function reservasColsHaveManualWidths() {
  const s = AppModules.core.SS.get('res:colw', null);
  return !!(s && typeof s === 'object' && Object.keys(s).length > 0);
}

// Larguras a aplicar. Com larguras manuais → usa-as tal como estão. Sem elas →
// distribui o espaço livre pelas colunas flex para a tabela encher o ecrã.
function getReservasColWidths() {
  const out = { ...RES_COL_DEFAULT_W };
  const saved = AppModules.core.SS.get('res:colw', null);
  if (saved && typeof saved === 'object' && Object.keys(saved).length) {
    Object.keys(saved).forEach(k => {
      const n = Number(saved[k]);
      if (out[k] != null && n >= RES_COL_MIN_W && n <= RES_COL_MAX_W) out[k] = Math.round(n);
    });
    return out;
  }
  const wrap = document.querySelector('#reservas-desktop .reservas-table-wrap');
  let avail = 0;
  if (wrap && wrap.clientWidth) {
    const cs = getComputedStyle(wrap);
    avail = Math.floor(wrap.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0));
  }
  const sum = RES_COL_KEYS.reduce((a, k) => a + out[k], 0);
  if (avail && avail > sum + 4) {
    const extra = avail - sum;
    const flexSum = RES_COL_FLEX.reduce((a, k) => a + out[k], 0) || 1;
    let used = 0;
    RES_COL_FLEX.forEach((k, i) => {
      const add = i === RES_COL_FLEX.length - 1 ? extra - used : Math.round(extra * (out[k] / flexSum));
      out[k] += add;
      used += add;
    });
  }
  return out;
}

function saveReservasColWidth(colKey, px) {
  const saved = AppModules.core.SS.get('res:colw', null) || {};
  saved[colKey] = Math.round(px);
  AppModules.core.SS.set('res:colw', saved);
}

// (Re)constrói <colgroup> + <thead> a partir de resColOrder e das larguras.
function renderReservasHead() {
  const table = document.getElementById('reservas-table');
  if (!table) return;
  const cg = table.querySelector('colgroup');
  const tr = table.querySelector('thead tr');
  if (!cg || !tr) return;
  const widths = getReservasColWidths();

  cg.innerHTML = resColOrder.map(k => `<col data-col="${k}" style="width:${widths[k]}px">`).join('');
  tr.innerHTML = resColOrder.map(k => {
    const c = RES_COL_META[k];
    const drag = k === 'actions' ? 'false' : 'true';
    const sortBits = c.sort ? ` ${AppActions.attrs("click", "lista-colunas-sort-tabela-bac31bc", [String((c.sort) ?? '')])}` : '';
    const icon = c.sort ? ` <span class="sort-icon" id="sort-${c.sort}"></span>` : '';
    return `<th data-col="${k}" draggable="${drag}" class="th-col${c.sort ? ' th-sort' : ''}"${sortBits}>${c.label}${icon}</th>`;
  }).join('');

  applyReservasColWidths();
  initReservasResizableCols();
  initReservasHeadDnD();
  restoreReservasSortIcon();
  if (window.lucide) lucide.createIcons();
}

function restoreReservasSortIcon() {
  document.querySelectorAll('#reservas-table .sort-icon').forEach(el => {
    el.textContent = '↕'; el.style.opacity = '0.25';
  });
  const sIcon = document.getElementById('sort-' + AppModules.reservas.sortCol);
  if (sIcon) { sIcon.textContent = AppModules.reservas.sortAsc ? '↑' : '↓'; sIcon.style.opacity = '1'; }
}

function applyReservasColWidths() {
  const table = document.getElementById('reservas-table');
  if (!table) return;
  const widths = getReservasColWidths();
  table.querySelectorAll('colgroup > col[data-col]').forEach(col => {
    const w = widths[col.dataset.col];
    if (w) col.style.width = w + 'px';
  });
  recomputeReservasTableMetrics();
}

// Fixa: (a) largura total da tabela = soma exata das colunas (arrastar uma
// coluna não redistribui as outras); (b) offsets --sr-0/1/2 das 3 últimas
// colunas da ordem atual, que ficam coladas à direita (CSS nth-last-child).
function recomputeReservasTableMetrics() {
  const table = document.getElementById('reservas-table');
  if (!table) return;
  const cols = Array.from(table.querySelectorAll('colgroup > col[data-col]'));
  const w = i => (cols[i] ? parseFloat(cols[i].style.width) || 0 : 0);
  const total = cols.reduce((a, _, i) => a + w(i), 0);
  const n = cols.length;
  table.style.width = total + 'px';
  table.style.minWidth = total + 'px';
  table.style.setProperty('--sr-0', '0px');
  table.style.setProperty('--sr-1', w(n - 1) + 'px');
  table.style.setProperty('--sr-2', (w(n - 1) + w(n - 2)) + 'px');
}

function initReservasResizableCols() {
  const headRow = document.querySelector('#reservas-table thead tr');
  if (!headRow) return;
  const ths = Array.from(headRow.querySelectorAll('th[data-col]'));
  ths.forEach((th, i) => {
    if (i === ths.length - 1) return;            // última coluna não redimensiona
    if (th.querySelector('.col-resizer')) return;

    const grip = document.createElement('span');
    grip.className = 'col-resizer';
    grip.setAttribute('aria-hidden', 'true');
    grip.setAttribute('draggable', 'false');
    th.appendChild(grip);

    let startX = 0, startW = 0, colEl = null;
    const point = (e) => (e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX);
    const onMove = (e) => {
      if (!colEl) return;
      const px = Math.max(RES_COL_MIN_W, Math.min(RES_COL_MAX_W, startW + (point(e) - startX)));
      colEl.style.width = px + 'px';
      recomputeReservasTableMetrics();
      if (e.cancelable) e.preventDefault();
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
      document.body.classList.remove('col-resizing');
      if (!colEl) return;
      // 1ª vez que se mexe: congela as larguras atuais como manuais, para o
      // auto-fit deixar de re-escalar tudo a cada carregamento/resize.
      if (!reservasColsHaveManualWidths()) {
        const snap = {};
        document.querySelectorAll('#reservas-table colgroup > col[data-col]').forEach(c => {
          snap[c.dataset.col] = Math.round(parseFloat(c.style.width) || RES_COL_DEFAULT_W[c.dataset.col]);
        });
        AppModules.core.SS.set('res:colw', snap);
      }
      saveReservasColWidth(th.dataset.col, parseFloat(colEl.style.width) || startW);
      recomputeReservasTableMetrics();
    };
    const onDown = (e) => {
      e.preventDefault();   // impede também o dragstart nativo do <th>
      e.stopPropagation();  // não dispara o sortTabela() do <th>
      colEl = document.querySelector('#reservas-table colgroup > col[data-col="' + th.dataset.col + '"]');
      startX = point(e);
      startW = colEl ? (parseFloat(colEl.style.width) || th.offsetWidth) : th.offsetWidth;
      document.body.classList.add('col-resizing');
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onUp);
    };
    grip.addEventListener('mousedown', onDown);
    grip.addEventListener('touchstart', onDown, { passive: false });
    grip.addEventListener('click', (e) => e.stopPropagation());
  });
}

// Arrastar o cabeçalho para reordenar colunas (HTML5 drag & drop).
let _resDragKey = null;
function initReservasHeadDnD() {
  const tr = document.querySelector('#reservas-table thead tr');
  if (!tr) return;
  const clearMarks = () => tr.querySelectorAll('.th-dragging,.th-drop-l,.th-drop-r')
    .forEach(el => el.classList.remove('th-dragging', 'th-drop-l', 'th-drop-r'));

  tr.querySelectorAll('th[data-col]').forEach(th => {
    const key = th.dataset.col;
    if (key === 'actions') return; // fica sempre no fim

    th.addEventListener('dragstart', (e) => {
      if (e.target && e.target.classList && e.target.classList.contains('col-resizer')) { e.preventDefault(); return; }
      _resDragKey = key;
      th.classList.add('th-dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', key); } catch (_) {}
    });
    th.addEventListener('dragend', () => { _resDragKey = null; clearMarks(); });
    th.addEventListener('dragover', (e) => {
      if (!_resDragKey || _resDragKey === key) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const rect = th.getBoundingClientRect();
      const after = (e.clientX - rect.left) > rect.width / 2;
      th.classList.toggle('th-drop-r', after);
      th.classList.toggle('th-drop-l', !after);
    });
    th.addEventListener('dragleave', () => th.classList.remove('th-drop-l', 'th-drop-r'));
    th.addEventListener('drop', (e) => {
      e.preventDefault();
      const from = _resDragKey;
      _resDragKey = null;
      clearMarks();
      if (!from || from === key) return;
      const rect = th.getBoundingClientRect();
      const after = (e.clientX - rect.left) > rect.width / 2;
      let order = resColOrder.filter(k => k !== from);
      let idx = order.indexOf(key);
      if (idx < 0) return;
      if (after) idx += 1;
      order.splice(idx, 0, from);
      order = order.filter(k => k !== 'actions');
      order.push('actions');
      resColOrder = order;
      AppModules.core.SS.set('res:colorder', resColOrder);
      renderReservasHead();
      AppModules.reservas.renderTabela();
    });
  });
}

// Auto-fit à largura do ecrã enquanto o utilizador não ajustar colunas à mão.
let _resFitT = null;
window.addEventListener('resize', () => {
  AppModules.reservas.applyReservasViewMode();
  if (reservasColsHaveManualWidths()) return;
  const v = document.getElementById('view-reservas');
  if (!v || !v.classList.contains('active')) return;
  clearTimeout(_resFitT);
  _resFitT = setTimeout(applyReservasColWidths, 120);
});

// ── Templates de célula por coluna (a ordem vem de resColOrder) ──
function resActionButtons(r) {
  const approve = r.status === 'pendente'
    ? `<button class="btn btn-sm" style="background:rgba(46,125,82,.12);color:#2e7d52" ${AppActions.attrs("click", "lista-colunas-aprovar-reserva-0f31ccd", [String((r.id) ?? '')])} title="Aprovar e enviar pre check-in">${AppModules.core.lcIcon('check', 13)}</button>`
    : '';
  const edit = `<button class="btn btn-ghost btn-sm" ${AppActions.attrs("click", "lista-colunas-open-edit-modal-e85a518", [String((r.id) ?? '')])} title="Editar">${AppModules.core.lcIcon('pencil', 13)}</button>`;
  const tail = r.status === 'cancelada'
    ? `<button class="btn btn-sm" style="background:rgba(46,125,82,.12);color:#2e7d52" ${AppActions.attrs("click", "lista-colunas-reativar-reserva-9888cf4", [String((r.id) ?? '')])} title="Reativar reserva">${AppModules.core.lcIcon('refresh-cw', 13)}</button>` +
      (AppModules.reservas.hasRole('manager')
        ? `<button class="btn btn-sm" style="background:rgba(176,48,48,.18);color:var(--vermelho)" ${AppActions.attrs("click", "lista-colunas-apagar-reserva-definitivo-727881f", [String((r.id) ?? '')])} title="Apagar definitivamente">${AppModules.core.lcIcon('trash-2', 13)}</button>`
        : '')
    : `<button class="btn btn-sm" style="background:rgba(176,48,48,.1);color:var(--vermelho)" ${AppActions.attrs("click", "lista-colunas-cancelar-reserva-2d9df9b", [String((r.id) ?? '')])} title="Cancelar reserva">${AppModules.core.lcIcon('x-circle', 13)}</button>`;
  return approve + edit + tail;
}

const RES_CELL = {
  id: r => `<td data-col="id"><code style="font-size:11.5px;color:var(--azul-claro)">${r.id}</code></td>`,
  created_at: r => `<td data-col="created_at"><span style="font-size:12px;color:var(--cinza)">${AppModules.core.formatDate((r.created_at || '').slice(0, 10))}</span></td>`,
  guest_name: r => `<td data-col="guest_name"><b>${AppModules.core.escapeHtml(r.guest_name)}</b><br><span style="font-size:11.5px;color:var(--cinza)">${AppModules.core.escapeHtml(r.guest_email || '')}</span></td>`,
  accommodation_name: r => `<td data-col="accommodation_name">${AppModules.core.accomChip(r)}</td>`,
  check_in: r => `<td data-col="check_in">${AppModules.core.formatDate(r.check_in)}</td>`,
  check_out: r => `<td data-col="check_out">${AppModules.core.formatDate(r.check_out)}</td>`,
  nights: r => `<td data-col="nights">${r.nights}</td>`,
  num_guests: r => `<td data-col="num_guests">${AppModules.reservas.renderGuestsCell(r)}</td>`,
  total_amount: r => `<td data-col="total_amount"><b>€${Number(r.total_amount || 0).toFixed(2)}</b></td>`,
  channel: r => `<td data-col="channel"><span style="font-size:12px;color:var(--cinza)">${r.channel || ''}</span></td>`,
  status: r => `<td data-col="status">${AppModules.core.badgeEstado(r.status)}</td>`,
  payment_status: r => {
    const paid = Number(r.amount_paid || 0);
    const total = Number(r.total_amount || 0);
    let extra = '';
    if (paid > 0) {
      const rem = total - paid;
      extra = rem > 0.01
        ? `<br><span style="font-size:11px;color:var(--vermelho);">€${paid.toFixed(2)} / falta €${rem.toFixed(2)}</span>`
        : `<br><span style="font-size:11px;color:var(--cinza);">€${paid.toFixed(2)}</span>`;
    }
    return `<td data-col="payment_status">${AppModules.core.badgePagamento(r.payment_status)}${extra}</td>`;
  },
  actions: r => `<td data-col="actions" data-on-click="lista-colunas-stop-propagation-22499e1" style="white-space:nowrap"><div class="res-actions">${resActionButtons(r)}</div></td>`,
};


AppActions.register({
  "lista-colunas-stop-propagation-22499e1": (el, event, args) => { event.stopPropagation() },
}, "click");

AppActions.register({
  "lista-colunas-cancelar-reserva-2d9df9b": (el, event, args) => { AppModules.reservas.cancelarReserva(args[0]) },
  "lista-colunas-apagar-reserva-definitivo-727881f": (el, event, args) => { AppModules.reservas.apagarReservaDefinitivo(args[0]) },
  "lista-colunas-reativar-reserva-9888cf4": (el, event, args) => { AppModules.reservas.reativarReserva(args[0]) },
  "lista-colunas-open-edit-modal-e85a518": (el, event, args) => { AppModules.reservas.openEditModal(args[0]) },
  "lista-colunas-aprovar-reserva-0f31ccd": (el, event, args) => { AppModules.reservas.aprovarReserva(args[0]) },
  "lista-colunas-sort-tabela-bac31bc": (el, event, args) => { AppModules.reservas.sortTabela(args[0]) },
}, "click");

// Limpeza da funcionalidade ao sair ou trocar de organização.
AppModules.onReset('features/reserva-lista/lista-colunas.js', () => {
  _resDragKey = null;
  _resFitT = null;
});

})();
