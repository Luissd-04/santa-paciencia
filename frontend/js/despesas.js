// Estado privado; interface partilhada em AppModules.despesas.
(() => {
AppModules.define('despesas', {
  despesasPaged: { get: () => despesasPaged },
  EXPENSE_CATS: { get: () => EXPENSE_CATS },
  loadDespesas: { get: () => loadDespesas },
});

let despesaEditId = null;
let despesaFilterYear  = AppModules.core.SS.get('desp:year', String(new Date().getFullYear()));
let despesaFilterMonth = AppModules.core.SS.get('desp:month', new Date().toISOString().slice(0, 7));   // YYYY-MM
let despesaPeriods = [];   // meses (YYYY-MM) com despesas, mais recente primeiro

const MESES_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const despMonthLabel = ym => `${MESES_PT[Number(ym.slice(5, 7)) - 1] || ym} ${ym.slice(0, 4)}`;

const EXPENSE_CATS = {
  limpeza:          { label: 'Limpeza',             color: '#4a90d9', icon: 'brush-cleaning' },
  produtos_limpeza: { label: 'Produtos de limpeza', color: '#3498db', icon: 'spray-can'      },
  pequenos_almocos: { label: 'Pequenos-almoços',    color: '#e8a33d', icon: 'croissant'      },
  roupas:           { label: 'Roupas',              color: '#8e6bb0', icon: 'shirt'          },
  manutencao:       { label: 'Manutenção',          color: '#e67e22', icon: 'wrench'         },
  marketing:        { label: 'Marketing',           color: '#9b59b6', icon: 'megaphone'      },
  impostos:         { label: 'Impostos',            color: '#e74c3c', icon: 'landmark'       },
  servicos:         { label: 'Serviços',            color: '#2ecc71', icon: 'briefcase'      },
  consumiveis:      { label: 'Consumíveis',         color: '#f39c12', icon: 'package'        },
  // Legado (removido do seletor, mantido para render de despesas antigas):
  supermercado:     { label: 'Supermercado',        color: '#27ae60', icon: 'shopping-cart' },
  outro:            { label: 'Outro',               color: '#95a5a6', icon: 'circle-dot'     },
};

let suppliersData = [];

// ── Colunas da tabela: redimensionáveis + reordenáveis + ordenáveis ──
// Mesmo padrão de #reservas-table — ver js/domain/table-cols.js.
let despesasSortCol = AppModules.core.SS.get('desp:sort', 'date');
let despesasSortAsc = AppModules.core.SS.get('desp:asc', false);   // por defeito: data desc (mais recente 1º)

const DESPESAS_SERVER_SORTS = new Set(['date', 'amount', 'description', 'category', 'supplier', 'payment_method', 'invoice_ref', 'created_at']);
if (!DESPESAS_SERVER_SORTS.has(despesasSortCol)) {
  despesasSortCol = 'date';
  despesasSortAsc = false;
  AppModules.core.SS.set('desp:sort', despesasSortCol);
  AppModules.core.SS.set('desp:asc', despesasSortAsc);
}

function sortDespesas(key) {
  // Só as colunas que o servidor sabe ordenar: sem isto, um clique numa coluna
  // não suportada devolvia HTTP 400 e a lista ficava em erro.
  if (!DESPESAS_SERVER_SORTS.has(key)) return;
  if (despesasSortCol === key) despesasSortAsc = !despesasSortAsc;
  else { despesasSortCol = key; despesasSortAsc = key !== 'date'; }
  AppModules.core.SS.set('desp:sort', despesasSortCol);
  AppModules.core.SS.set('desp:asc', despesasSortAsc);
  // Ordenar abrange todos os registos do filtro, não só a página aberta.
  despesasQueryChanged({ immediate: true });
}

function despSortValue(d, key) {
  if (key === 'amount') return Number(d.amount) || 0;
  if (key === 'has_nif') return d.has_nif ? 1 : 0;
  if (key === 'category') return EXPENSE_CATS[d.category]?.label || d.category || '';
  return d[key] || '';
}

const DESP_COLUMNS = [
  { key: 'date',           label: 'Data',        sort: 'date',           defaultW: 104, minW: 76 },
  { key: 'category',       label: 'Categoria',   sort: 'category',       defaultW: 140, minW: 96 },
  { key: 'description',    label: 'Descrição',   sort: 'description',    defaultW: 260, minW: 120, flex: true },
  { key: 'supplier',       label: 'Fornecedor',  sort: 'supplier',       defaultW: 140, minW: 90, flex: true },
  { key: 'invoice_ref',    label: 'Nº Fatura',   sort: 'invoice_ref',    defaultW: 118, minW: 84 },
  { key: 'has_nif',        label: 'Contribuinte', sort: 'has_nif',       defaultW: 128, minW: 112 },
  { key: 'amount',         label: 'Valor',       sort: 'amount',         defaultW: 104, minW: 78 },
  { key: 'payment_method', label: 'Método',      sort: 'payment_method', defaultW: 120, minW: 84, flex: true },
  { key: 'actions',        label: 'Ações',       sort: null,             defaultW: 92, minW: 84 },
];

const DESP_CELL = {
  date: d => `<td data-col="date" style="font-size:13px;">${AppModules.core.formatDate(d.date)}</td>`,
  category: d => {
    const c = EXPENSE_CATS[d.category] || EXPENSE_CATS.outro;
    return `<td data-col="category"><span style="display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:20px;font-size:11.5px;font-weight:600;background:${c.color}22;color:${c.color};">${c.icon ? `<i data-lucide="${c.icon}" style="width:11px;height:11px;"></i>` : ''}${c.label}</span></td>`;
  },
  description: d => `<td data-col="description" title="${AppModules.core.escapeHtml(d.description)}${d.notes ? ' — ' + AppModules.core.escapeHtml(d.notes) : ''}">${AppModules.core.escapeHtml(d.description)}${d.notes ? `<br><span style="font-size:11px;color:var(--cinza);">${AppModules.core.escapeHtml(d.notes)}</span>` : ''}</td>`,
  supplier: d => `<td data-col="supplier" style="font-size:12.5px;">${AppModules.core.escapeHtml(d.supplier || '—')}</td>`,
  invoice_ref: d => `<td data-col="invoice_ref" style="font-size:12px;color:var(--cinza);">${AppModules.core.escapeHtml(d.invoice_ref || '—')}${d.receipt_image ? ` <a href="${AppModules.core.escapeHtml(d.receipt_image)}" target="_blank" title="Ver talão" style="color:var(--marca);text-decoration:none;">${AppModules.core.lcIcon('paperclip', 12)}</a>` : ''}</td>`,
  has_nif: d => `<td data-col="has_nif" style="font-size:11.5px;">${d.has_nif
    ? '<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:20px;background:rgba(46,125,82,.12);color:#2e7d52;font-weight:600;">Com NIF</span>'
    : '<span style="color:var(--cinza);">Sem NIF</span>'}</td>`,
  amount: d => `<td data-col="amount" style="font-weight:600;color:var(--vermelho);">${AppModules.core.formatEUR(d.amount)}</td>`,
  payment_method: d => `<td data-col="payment_method" style="font-size:12.5px;color:var(--cinza);">${AppModules.core.escapeHtml(d.payment_method || '—')}</td>`,
  actions: d => `<td data-col="actions" data-stop="1" style="white-space:nowrap;">
      <button class="btn btn-ghost btn-sm" data-on-click="open-despesa-modal" data-id="${AppModules.core.escapeHtml(d.id)}" title="Editar">${AppModules.core.lcIcon('pencil', 13)}</button>
      <button class="btn btn-sm" style="background:rgba(176,48,48,.1);color:var(--vermelho);" data-on-click="delete-despesa" data-id="${AppModules.core.escapeHtml(d.id)}" title="Remover">${AppModules.core.lcIcon('trash-2', 13)}</button>
    </td>`,
};

const despCols = AppModules.core.createColLayout({
  tableId: 'despesas-table',
  storageKey: 'desp',
  storage: 'local',       // larguras/ordem sobrevivem ao fechar o browser
  mode: 'fit',            // colunas re-escalam sempre para caber (nunca saem do ecrã)
  wrapSelector: '.despesas-table-wrap',
  activeViewId: 'view-despesas',
  lastFixed: 'actions',
  columns: DESP_COLUMNS,
  onSort: sortDespesas,
  sortState: () => ({ col: despesasSortCol, asc: despesasSortAsc }),
  onReorder: renderDespesas,
});

// Filtros de Despesas viram uma folha deslizante no telemóvel — mesmo
// mecanismo de #reservas-filter-panel/#calendario-filter-panel.
function toggleDespesasFiltersSheet(open) {
  document.getElementById('despesas-filter-panel')?.classList.toggle('m-sheet-open', open);
  document.getElementById('despesas-filters-backdrop')?.classList.toggle('active', open);
  document.getElementById('view-despesas')?.classList.toggle('m-sheet-ancestor-fix', open);
}

// Filtros ativos = qualquer coisa diferente dos valores por omissão.
function despesasFiltersActive() {
  const period = document.getElementById('despesa-filter-period')?.value || 'ano';
  const cat    = document.getElementById('despesa-filter-category')?.value || '';
  const sup    = document.getElementById('despesa-filter-supplier')?.value || '';
  const search = (document.getElementById('despesa-search')?.value || '').trim();
  const yearChanged = period === 'ano' && despesaFilterYear !== String(new Date().getFullYear());
  return period !== 'ano' || yearChanged || cat !== '' || sup !== '' || search !== '';
}

function updateDespesasFilterBadge() {
  const badge = document.getElementById('despesas-filter-badge');
  if (badge) badge.style.display = despesasFiltersActive() ? '' : 'none';
}

function clearDespesasFiltros() {
  const period = document.getElementById('despesa-filter-period');
  const cat = document.getElementById('despesa-filter-category');
  const sup = document.getElementById('despesa-filter-supplier');
  if (period) period.value = 'ano';
  // Volta ao ano/mês atuais (syncDespesaPeriodSelects recalcula a partir daqui).
  const year = document.getElementById('despesa-filter-year');
  const month = document.getElementById('despesa-filter-month');
  if (year) year.innerHTML = '';
  if (month) month.innerHTML = '';
  despesaFilterYear = String(new Date().getFullYear());
  despesaFilterMonth = new Date().toISOString().slice(0, 7);
  if (cat) cat.value = '';
  if (sup) sup.value = '';
  const search = document.getElementById('despesa-search');
  if (search) search.value = '';
  AppUI.refreshDropdowns(document.getElementById('view-despesas'));
  loadDespesas();
}

// Preenche os dropdowns Ano/Mês só com períodos que têm despesas e mostra-os
// consoante o modo: "Por ano" → Ano; "Por mês" → Ano + Mês; "Tudo" → nenhum.
function syncDespesaPeriodSelects(period) {
  const yearSel  = document.getElementById('despesa-filter-year');
  const monthSel = document.getElementById('despesa-filter-month');
  if (!yearSel || !monthSel) return;

  const now = new Date();
  const curYear = String(now.getFullYear());
  const curMonth = now.toISOString().slice(0, 7);

  // Valor escolhido pelo utilizador tem prioridade sobre o guardado.
  if (yearSel.value) despesaFilterYear = yearSel.value;
  const years = [...new Set(despesaPeriods.map(p => p.slice(0, 4)))];
  if (!years.length) years.push(curYear);
  if (!years.includes(despesaFilterYear)) despesaFilterYear = years.includes(curYear) ? curYear : years[0];

  const months = despesaPeriods.filter(p => p.startsWith(despesaFilterYear + '-'));
  if (!months.length) months.push(despesaFilterYear === curYear ? curMonth : `${despesaFilterYear}-01`);
  const pickedMonth = monthSel.value || despesaFilterMonth;
  // Ao mudar de ano, o mês salta para o mais recente com despesas nesse ano.
  despesaFilterMonth = months.includes(pickedMonth) ? pickedMonth
    : months.includes(curMonth) ? curMonth : months[0];

  yearSel.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
  yearSel.value = despesaFilterYear;
  monthSel.innerHTML = months.map(m => `<option value="${m}">${MESES_PT[Number(m.slice(5, 7)) - 1]}</option>`).join('');
  monthSel.value = despesaFilterMonth;

  AppModules.core.SS.set('desp:year', despesaFilterYear);
  AppModules.core.SS.set('desp:month', despesaFilterMonth);

  const view = document.getElementById('view-despesas');
  AppUI.enhanceSelects(view);
  AppUI.refreshSelect(yearSel);
  AppUI.refreshSelect(monthSel);
  const wrapOf = sel => sel.closest('.app-select') || sel;
  wrapOf(yearSel).style.display  = period === 'tudo' ? 'none' : '';
  wrapOf(monthSel).style.display = period !== 'mes' ? 'none' : '';
}

// ── LOAD ──
// A lista pagina no servidor. `despesasData` deixou de existir: a vista mostra
// a página atual (despesasPaged.state.rows) e os totais vêm do `summary`, que
// cobre todas as páginas do filtro ativo.
const despesasPaged = AppModules.core.createPagedCollection('/api/expenses', () => renderDespesas());

function getDespesasQuery() {
  const period = document.getElementById('despesa-filter-period')?.value || 'ano';
  const query = {};
  if (period === 'mes') query.month = despesaFilterMonth;
  else if (period === 'ano') query.year = String(despesaFilterYear);
  // 'tudo' => sem filtro de período

  const search = (document.getElementById('despesa-search')?.value || '').trim();
  if (search) query.search = search;
  const category = document.getElementById('despesa-filter-category')?.value || '';
  if (category) query.category = category;
  const supplier = document.getElementById('despesa-filter-supplier')?.value || '';
  if (supplier) query.supplier = supplier;

  query.sort = despesasSortCol;
  query.direction = despesasSortAsc ? 'asc' : 'desc';
  return query;
}

// A escrita usa o atraso curto da coleção (que cancela o pedido anterior);
// mudar um filtro pede logo.
function despesasQueryChanged(options = {}) {
  if (options.reloadPeriods) syncDespesaPeriodSelects(document.getElementById('despesa-filter-period')?.value || 'ano');
  updateDespesasFilterBadge();
  const query = getDespesasQuery();
  if (options.immediate) despesasPaged.load(query, options.force ? { force: true } : {});
  else despesasPaged.schedule(query);
}

async function loadDespesas() {
  const session = AppModules.sessionVersion;
  const period = document.getElementById('despesa-filter-period')?.value || 'ano';

  try {
    despesaPeriods = (await AppModules.core.apiGet('/api/expenses/periods')).data || [];
  } catch { /* sem períodos: os dropdowns caem no ano/mês atual */ }
  if (session !== AppModules.sessionVersion) return;
  syncDespesaPeriodSelects(period);
  updateDespesasFilterBadge();

  // Os totais globais (mês/ano/maior categoria) são independentes da página e
  // do filtro — continuam a vir do seu próprio endpoint.
  try {
    const [summary, suppliers] = await Promise.all([
      AppModules.core.apiGet('/api/expenses/summary'),
      AppModules.core.apiGet('/api/suppliers').catch(() => ({ data: [] })),
    ]);
    if (session !== AppModules.sessionVersion) return;
    suppliersData = suppliers.data || [];
    populateSupplierFilter();
    renderDespesasKpi(summary.data || {});
    renderDespesasKpiMobile(summary.data || {});
  } catch (e) {
    if (session !== AppModules.sessionVersion) return;
    AppModules.core.toast('❌ Erro ao carregar o resumo de despesas.', 'error');
  }

  await despesasPaged.load(getDespesasQuery(), { force: true });
}

// Exportação: percorre todas as páginas do filtro ativo, não só a visível.
async function getDespesasParaExportar() {
  const { data } = await AppModules.core.apiGetAllPages('/api/expenses', getDespesasQuery());
  return data;
}

function renderDespesasKpi(s) {
  const grid = document.getElementById('despesas-kpi-grid');
  if (!grid) return;
  grid.innerHTML = `
    <div class="kpi-card" style="border-color:var(--vermelho);">
      <div class="kpi-label">Este mês</div>
      <div class="kpi-value" style="color:var(--vermelho);">${AppModules.core.formatEUR(s.monthTotal)}</div>
      <div class="kpi-sub">${despMonthLabel(new Date().toISOString().slice(0, 7))}</div>
    </div>
    <div class="kpi-card" style="border-color:var(--laranja);">
      <div class="kpi-label">Este ano</div>
      <div class="kpi-value" style="color:var(--laranja);">${AppModules.core.formatEUR(s.yearTotal)}</div>
      <div class="kpi-sub">${new Date().getFullYear()}</div>
    </div>
    <div class="kpi-card" style="border-color:var(--roxo);">
      <div class="kpi-label">Maior categoria (ano)</div>
      <div class="kpi-value" style="font-size:18px;padding-top:4px;">
        ${s.byCategory && s.byCategory[0] ? (EXPENSE_CATS[s.byCategory[0].category]?.label || s.byCategory[0].category) : '—'}
      </div>
      <div class="kpi-sub">${s.byCategory && s.byCategory[0] ? AppModules.core.formatEUR(s.byCategory[0].total) : ''}</div>
    </div>`;
}

// Versão mobile: as 3 primeiras métricas juntam-se num único cartão de 3
// colunas (em vez de cartões soltos com contorno colorido) e "Maior
// categoria" fica num cartão à parte — mesmo sistema usado no Dashboard.
function renderDespesasKpiMobile(s) {
  const wrap = document.getElementById('despesas-kpi-mobile');
  if (!wrap) return;
  const top = s.byCategory && s.byCategory[0];
  wrap.innerHTML = `
    <div class="dkm-band">
      <div class="dkm-col"><div class="dkm-value">${AppModules.core.formatEUR(s.monthTotal)}</div><div class="dkm-label">Este mês</div></div>
      <div class="dkm-col"><div class="dkm-value">${AppModules.core.formatEUR(s.yearTotal)}</div><div class="dkm-label">Este ano</div></div>
    </div>
    <div class="dkm-top-cat">
      <div>
        <div class="dkm-top-cat-label">Maior categoria (ano)</div>
        <div class="dkm-top-cat-value">${top ? (EXPENSE_CATS[top.category]?.label || top.category) : '—'}</div>
      </div>
      <div class="dkm-top-cat-amount">${top ? AppModules.core.formatEUR(top.total) : ''}</div>
    </div>`;
}

// Popula o filtro de fornecedores a partir da lista carregada, preservando a seleção.
function populateSupplierFilter() {
  const sel = document.getElementById('despesa-filter-supplier');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">Todos os fornecedores</option>' +
    suppliersData.map(s => `<option value="${AppModules.core.escapeHtml(s.name)}">${AppModules.core.escapeHtml(s.name)}</option>`).join('');
  if ([...sel.options].some(o => o.value === current)) sel.value = current;
  AppUI.enhanceSelects(document.getElementById('view-despesas'));
  AppUI.refreshSelect(sel);
}

// Carregamento, erro e lista vazia são três estados distintos — uma falha de
// rede não pode aparecer como "sem despesas".
function renderDespesas() {
  const state = despesasPaged.state;
  const loading = document.getElementById('despesas-loading');
  const tbody   = document.getElementById('despesas-body');
  const empty   = document.getElementById('despesas-empty');
  const errorEl = document.getElementById('despesas-error');
  const tableWrap = document.querySelector('.despesas-table-wrap');
  const mobileWrap = document.getElementById('despesas-mobile-cards');
  if (!tbody) return;

  updateDespesasFilterBadge();
  loading.style.display = state.loading && !state.rows.length ? 'flex' : 'none';
  AppModules.core.renderPagination('despesas-pagination', state, page => despesasPaged.load(getDespesasQuery(), { page }));

  const hide = () => { if (tableWrap) tableWrap.style.display = 'none'; tbody.innerHTML = ''; if (mobileWrap) mobileWrap.innerHTML = ''; };

  if (state.error) {
    hide();
    empty.style.display = 'none';
    errorEl.style.display = 'block';
    document.getElementById('despesas-error-detail').textContent = state.error;
    return;
  }
  errorEl.style.display = 'none';

  if (!state.rows.length) {
    if (state.loading) { hide(); empty.style.display = 'none'; return; }
    hide();
    const period = document.getElementById('despesa-filter-period')?.value || 'ano';
    const hasFilters = !!(document.getElementById('despesa-search')?.value
      || document.getElementById('despesa-filter-category')?.value
      || document.getElementById('despesa-filter-supplier')?.value);
    const scope = period === 'mes' ? `em ${despMonthLabel(despesaFilterMonth)}` : period === 'ano' ? `em ${despesaFilterYear}` : 'registadas';
    empty.innerHTML = hasFilters
      ? AppModules.core.emptyStateHtml('🔍', 'Sem despesas para estes filtros',
          'Nenhuma despesa corresponde à pesquisa, categoria ou fornecedor selecionados neste período.')
      : AppModules.core.emptyStateHtml('💸', `Sem despesas ${scope}`,
          period === 'tudo'
            ? 'Ainda não registaste nenhuma despesa.'
            : 'Experimenta mudar o período (ex.: <b>Todo o histórico</b>) — as tuas despesas podem estar noutro mês/ano.');
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  if (tableWrap) tableWrap.style.display = '';

  const rows = state.rows;
  // Total de TODAS as páginas do filtro ativo, não apenas das linhas visíveis.
  const total = Number(state.summary?.total_amount || 0);

  despCols.renderHead();

  const order = despCols.order;
  const amountIdx = order.indexOf('amount');
  const labelIdx = amountIdx > 0 ? amountIdx - 1 : 0;
  const totalRow = `<tr class="despesas-total-row">${order.map((k, i) => {
    if (k === 'amount') return `<td data-col="amount" style="font-weight:700;font-size:15px;color:var(--vermelho);">${AppModules.core.formatEUR(total)}</td>`;
    if (i === labelIdx) return `<td data-col="${k}" style="text-align:right;font-weight:600;color:var(--cinza);font-size:13px;">Total do período</td>`;
    return `<td data-col="${k}"></td>`;
  }).join('')}</tr>`;

  tbody.innerHTML = rows.map(d => `<tr>${order.map(k => DESP_CELL[k](d)).join('')}</tr>`).join('') + totalRow;
  renderDespesasMobileCards(rows, total);
  if (window.lucide) lucide.createIcons();
}

function renderDespesasMobileCards(filtered, total) {
  const wrap = document.getElementById('despesas-mobile-cards');
  if (!wrap) return;
  wrap.innerHTML = filtered.map(d => {
    const cat = EXPENSE_CATS[d.category] || EXPENSE_CATS.outro;
    return `<div class="m-expense-card">
      <div class="mec-top">
        <span class="mec-cat">${cat.icon ? `<i data-lucide="${cat.icon}" style="color:${cat.color};"></i>` : ''}${cat.label}</span>
        <span class="mec-date">${AppModules.core.formatDate(d.date)}</span>
      </div>
      <div class="mec-desc">${AppModules.core.escapeHtml(d.description)}</div>
      ${d.supplier ? `<div class="mec-supplier"><i data-lucide="truck"></i> ${AppModules.core.escapeHtml(d.supplier)}</div>` : ''}
      <div class="mec-bottom">
        <span class="mec-amount">${AppModules.core.formatEUR(d.amount)}</span>
        <div class="mec-actions" data-stop="1">
          <button class="m-card-btn" data-on-click="open-despesa-modal" data-id="${AppModules.core.escapeHtml(d.id)}"><i data-lucide="pencil"></i></button>
          <button class="m-card-btn" data-on-click="delete-despesa" data-id="${AppModules.core.escapeHtml(d.id)}"><i data-lucide="trash-2"></i></button>
        </div>
      </div>
    </div>`;
  }).join('') + `<div class="mec-total-row"><span>Total do período</span><span>${AppModules.core.formatEUR(total)}</span></div>`;
}

// Popula o dropdown de fornecedores no modal, garantindo que o valor atual
// (mesmo que já não exista na lista) fica disponível.
function populateSupplierDropdown(selected) {
  const sel = document.getElementById('despesa-supplier');
  if (!sel) return;
  const names = suppliersData.map(s => s.name);
  if (selected && !names.includes(selected)) names.unshift(selected);
  sel.innerHTML = '<option value="">— Nenhum —</option>' +
    names.map(n => `<option value="${AppModules.core.escapeHtml(n)}"${n === selected ? ' selected' : ''}>${AppModules.core.escapeHtml(n)}</option>`).join('');
  sel.value = selected || '';
}

// ── MODAL ──
function openDespesaModal(id) {
  despesaEditId = id || null;
  const d = id ? despesasPaged.state.rows.find(x => x.id === id) : null;
  document.getElementById('despesa-modal-title').textContent = d ? 'Editar Despesa' : 'Nova Despesa';
  document.getElementById('despesa-date').value        = AppModules.core.formatDateForStandardInput(d ? d.date : new Date().toISOString().slice(0, 10));
  document.getElementById('despesa-category').value    = d ? d.category    : 'limpeza';
  document.getElementById('despesa-description').value = d ? d.description : '';
  document.getElementById('despesa-amount').value      = d ? d.amount      : '';
  document.getElementById('despesa-payment').value     = d ? (d.payment_method || 'numerário') : 'numerário';
  document.getElementById('despesa-invoice-ref').value = d ? (d.invoice_ref || '') : '';
  document.getElementById('despesa-has-nif').value     = d && d.has_nif ? '1' : '0';
  document.getElementById('despesa-notes').value       = d ? (d.notes || '') : '';
  const dupW = document.getElementById('despesa-dup-warning'); if (dupW) dupW.style.display = 'none';
  populateSupplierDropdown(d ? (d.supplier || '') : '');
  AppUI.enhanceSelects(document.getElementById('despesa-modal-bg'));
  AppUI.refreshDropdowns(document.getElementById('despesa-modal-bg'));
  AppUI.openModal('despesa-modal-bg');
  if (window.lucide) lucide.createIcons();
  checkDespesaDuplicate();
}

// Verifica no servidor se já existe fatura com o mesmo nº + fornecedor e avisa (não bloqueia).
async function checkDespesaDuplicate() {
  const warn = document.getElementById('despesa-dup-warning');
  const txt = document.getElementById('despesa-dup-text');
  if (!warn || !txt) return;
  const invoiceRef = (document.getElementById('despesa-invoice-ref')?.value || '').trim();
  const supplier = (document.getElementById('despesa-supplier')?.value || '').trim();
  if (!invoiceRef) { warn.style.display = 'none'; return; }
  try {
    const qs = `?invoice_ref=${encodeURIComponent(invoiceRef)}&supplier=${encodeURIComponent(supplier)}${despesaEditId ? `&exclude_id=${encodeURIComponent(despesaEditId)}` : ''}`;
    const res = await AppModules.core.apiGet(`/api/expenses/check-invoice${qs}`);
    const info = res?.data || res;
    if (info?.exists) {
      const n = info.count;
      txt.textContent = `Já existe ${n} despesa${n !== 1 ? 's' : ''} com a fatura "${invoiceRef}"${supplier ? ` de ${supplier}` : ''}. Podes guardar na mesma se for outra linha da mesma fatura.`;
      warn.style.display = '';
      if (window.lucide) lucide.createIcons();
    } else {
      warn.style.display = 'none';
    }
  } catch { warn.style.display = 'none'; }
}

function closeDespesaModal() {
  const bg = document.getElementById('despesa-modal-bg');
  const modal = bg.querySelector('.modal');
  modal.classList.add('modal-closing');
  setTimeout(() => { AppUI.closeModal(bg); modal.classList.remove('modal-closing'); despesaEditId = null; }, 320);
}

async function saveDespesa() {
  const date        = AppModules.core.normalizeIsoDateValue(document.getElementById('despesa-date').value);
  const category    = document.getElementById('despesa-category').value;
  const description = document.getElementById('despesa-description').value.trim();
  const amount      = parseFloat(document.getElementById('despesa-amount').value);
  const payment_method = document.getElementById('despesa-payment').value;
  const invoice_ref = document.getElementById('despesa-invoice-ref').value.trim() || null;
  const notes       = document.getElementById('despesa-notes').value.trim() || null;
  const supplier    = document.getElementById('despesa-supplier')?.value.trim() || null;
  const has_nif     = document.getElementById('despesa-has-nif')?.value === '1' ? 1 : 0;

  if (!date || !description || isNaN(amount)) {
    AppModules.core.toast('Preencha data, descrição e valor.', 'error'); return;
  }

  const body = { date, category, description, amount, payment_method, invoice_ref, notes, supplier, has_nif };
  try {
    const res = despesaEditId
      ? await AppModules.core.apiPut(`/api/expenses/${despesaEditId}`, body)
      : await AppModules.core.apiPost('/api/expenses', body);
    if (res.success) {
      if (res.propagated > 0) {
        AppModules.core.toast(`✅ Nº de fatura atualizado em mais ${res.propagated} despesa${res.propagated !== 1 ? 's' : ''} da mesma fatura.`, 'success');
      } else if (res.nif_propagated > 0) {
        AppModules.core.toast(`✅ Estado do NIF aplicado a mais ${res.nif_propagated} linha${res.nif_propagated !== 1 ? 's' : ''} da mesma fatura.`, 'success');
      } else if (res.inherited_nif) {
        AppModules.core.toast('✅ Despesa adicionada — herdou o estado Com/Sem NIF da fatura existente.', 'success');
      } else {
        AppModules.core.toast(despesaEditId ? '✅ Despesa atualizada!' : '✅ Despesa adicionada!', 'success');
      }
      closeDespesaModal();
      await loadDespesas();
    } else {
      AppModules.core.toast('❌ ' + (res.error || 'Erro ao guardar.'), 'error');
    }
  } catch (e) {
    AppModules.core.toast('❌ Erro de ligação ao servidor.', 'error');
  }
}

const DESPESAS_EXPORT_COLUMNS = [
  { key: 'date',            label: 'Data',         default: true, get: d => AppModules.core.formatDate(d.date) },
  { key: 'category',        label: 'Categoria',    default: true, get: d => EXPENSE_CATS[d.category]?.label || d.category },
  { key: 'description',     label: 'Descrição',    default: true, get: d => d.description },
  { key: 'supplier',        label: 'Fornecedor',   default: true, get: d => d.supplier || '' },
  { key: 'invoice_ref',     label: 'Nº Fatura',    default: true, get: d => d.invoice_ref || '' },
  { key: 'has_nif',         label: 'Contribuinte', default: true, get: d => d.has_nif ? 'Com NIF' : 'Sem NIF' },
  { key: 'amount',          label: 'Valor (€)',    default: true, get: d => Number(d.amount).toFixed(2) },
  { key: 'payment_method',  label: 'Método',       default: true, get: d => d.payment_method || '' },
  { key: 'notes',           label: 'Notas',        default: true, get: d => d.notes || '' },
];

async function exportDespesasXLSX() {
  if (!despesasPaged.state.total) { AppModules.core.toast('Sem despesas para exportar.', 'error'); return; }
  if (!await AppModules.core.ensureLibrary('xlsx')) return;
  AppModules.core.openExportColumnPicker('despesas', 'Despesas', DESPESAS_EXPORT_COLUMNS, selectedKeys => _doExportDespesasXLSX(selectedKeys));
}

async function _doExportDespesasXLSX(selectedKeys) {
  // Todas as páginas do filtro ativo. Uma falha a meio interrompe a operação
  // em vez de gerar um ficheiro parcial (ver apiGetAllPages).
  let despesas;
  try {
    despesas = await getDespesasParaExportar();
  } catch (e) {
    AppModules.core.toast('❌ ' + (e.message || 'Não foi possível exportar as despesas.'), 'error');
    return;
  }
  const rows = AppModules.core.buildExportRowsXlsx(despesas, DESPESAS_EXPORT_COLUMNS, selectedKeys);
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Despesas');
  XLSX.writeFile(wb, `despesas_${despesaFilterMonth || 'todas'}.xlsx`);
}

async function deleteDespesa(id) {
  const d = despesasPaged.state.rows.find(x => x.id === id);
  if (!confirm(`Remover despesa "${d?.description || id}"?`)) return;
  try {
    const res = await AppModules.core.apiDelete(`/api/expenses/${id}`);
    if (res.success) { AppModules.core.toast('🗑 Despesa removida.', 'info'); await loadDespesas(); }
    else AppModules.core.toast('❌ ' + (res.error || 'Erro ao remover.'), 'error');
  } catch (e) {
    AppModules.core.toast('❌ Erro de ligação ao servidor.', 'error');
  }
}

// ══════════════════════════════════════
//  LEITURA DE TALÕES POR IA
// ══════════════════════════════════════
let _receiptImage = null;   // data URI da foto (comprimida)
let _receiptLines = [];      // [{ description, category, amount }]

const RECEIPT_CATS = [
  ['limpeza', 'Limpeza'], ['produtos_limpeza', 'Produtos de limpeza'],
  ['pequenos_almocos', 'Pequenos-almoços'], ['roupas', 'Roupas'],
  ['manutencao', 'Manutenção'], ['marketing', 'Marketing'], ['impostos', 'Impostos'],
  ['servicos', 'Serviços'], ['consumiveis', 'Consumíveis'], ['outro', 'Outro'],
];

// Redimensiona/comprime a foto no browser antes de enviar.
// 2560px + qualidade 0.9 aproveita a visão de alta resolução do modelo (lê melhor
// talões pequenos/amarrotados); continua barato porque comprime para JPEG.
//
// Fotos tiradas diretamente com a câmara trazem a tag EXIF "Orientation" (ex. rodado
// 90° em retrato no iPhone); desenhar o ficheiro tal como está num <img>+canvas ignora
// essa tag e envia a imagem rodada para a IA de visão, que falha a ler o talão.
// createImageBitmap com imageOrientation:'from-image' já lê essa tag nativamente —
// tentamos primeiro essa via e só caímos no caminho antigo (Image+canvas) se a API
// não existir ou falhar, sem alterar o comportamento nesses browsers.
function _compressImage(file, maxDim = 2560, quality = 0.9) {
  const drawAndResolve = (source, resolve) => {
    let { width, height } = source;
    if (width > height && width > maxDim) { height = Math.round(height * maxDim / width); width = maxDim; }
    else if (height >= width && height > maxDim) { width = Math.round(width * maxDim / height); height = maxDim; }
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    canvas.getContext('2d').drawImage(source, 0, 0, width, height);
    resolve(canvas.toDataURL('image/jpeg', quality));
  };

  const legacyPath = () => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => drawAndResolve(img, resolve);
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  if (!window.createImageBitmap) return legacyPath();
  return createImageBitmap(file, { imageOrientation: 'from-image' })
    .then(bitmap => new Promise(resolve => drawAndResolve(bitmap, resolve)))
    .catch(() => legacyPath());
}

// As câmaras Apple gravam por defeito em HEIC, que a maioria dos browsers (fora o
// Safari) não decodifica num <img> — e a API de visão também não o aceita. Detetamos
// HEIC e convertemos para JPEG no browser antes de comprimir/enviar.
function _isHeic(file) {
  const t = (file.type || '').toLowerCase();
  if (t.includes('heic') || t.includes('heif')) return true;
  return /\.(heic|heif)$/i.test(file.name || '');
}

let _heic2anyPromise = null;
function _loadHeic2any() {
  if (window.heic2any) return Promise.resolve(window.heic2any);
  if (_heic2anyPromise) return _heic2anyPromise;
  _heic2anyPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';
    s.integrity = 'sha384-OTofQ0MEeiSgh62havBcemCIK0gqj809wX6UA0uPISNMRnR6NZyCdGzX3SbLrgwL';
    s.crossOrigin = 'anonymous';
    s.onload = () => window.heic2any ? resolve(window.heic2any) : reject(new Error('heic2any indisponível'));
    s.onerror = () => reject(new Error('Falha ao carregar o conversor HEIC'));
    document.head.appendChild(s);
  });
  return _heic2anyPromise;
}

// Devolve um ficheiro/blob que o browser consegue decodificar (converte HEIC → JPEG).
async function _ensureSupportedImage(file) {
  if (!_isHeic(file)) return file;
  const heic2any = await _loadHeic2any();
  const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
  return Array.isArray(out) ? out[0] : out;
}

async function onReceiptSelected(input) {
  const file = input.files && input.files[0];
  input.value = ''; // permite reescolher a mesma foto
  if (!file) return;
  if (!(file.type || '').startsWith('image/') && !_isHeic(file)) { AppModules.core.toast('Escolhe uma imagem.', 'error'); return; }

  _openReceiptModalLoading();
  let dataUri;
  try {
    const usable = await _ensureSupportedImage(file);
    dataUri = await _compressImage(usable);
  } catch (err) {
    console.error('Falha a preparar a imagem do talão:', err);
    _renderReceiptError(_isHeic(file)
      ? 'Não foi possível converter a foto HEIC. Tenta outra vez, ou muda a câmara para JPEG (Definições › Câmara › Formatos › "Mais compatível") e tira nova foto.'
      : 'Não foi possível ler a imagem. Tenta outra foto (JPEG ou PNG).');
    return;
  }
  _receiptImage = dataUri;
  try {
    const res = await AppModules.core.apiPost('/api/expenses/scan-receipt', { image: dataUri });
    if (res.success) _renderReceiptReview(res.data);
    else _renderReceiptError(res.error || 'Erro ao ler o talão.');
  } catch (e) {
    if (e?.payload?.error) {
      _renderReceiptError(e.payload.error);
    } else {
      console.error('Falha ao contactar /api/expenses/scan-receipt:', e);
      _renderReceiptError('Não foi possível contactar o servidor. Verifica a tua ligação à internet e tenta novamente.');
    }
  }
}

function _openReceiptModalLoading() {
  const el = document.getElementById('receipt-review-content');
  if (el) el.innerHTML = `<div style="text-align:center;padding:44px 20px;color:var(--cinza);">
    <i data-lucide="loader" style="width:26px;height:26px;"></i>
    <div style="margin-top:12px;font-size:14px;">A ler o talão com IA…</div>
    <div style="font-size:12px;margin-top:4px;">Pode demorar alguns segundos.</div></div>`;
  const saveBtn = document.getElementById('receipt-save-btn');
  if (saveBtn) saveBtn.style.display = 'none';
  AppUI.openModal('receipt-modal-bg');
  if (window.lucide) lucide.createIcons();
}

function _renderReceiptError(msg) {
  const el = document.getElementById('receipt-review-content');
  if (el) el.innerHTML = `<div style="text-align:center;padding:32px 20px;">
    <div style="font-size:34px;">📷</div>
    <h3 style="margin:8px 0;">Não deu para ler o talão</h3>
    <p style="color:var(--cinza);font-size:13px;">${AppModules.core.escapeHtml(msg)}</p>
    <button class="btn btn-primary btn-sm" style="margin-top:12px;" data-on-click="retry-receipt-photo">Tentar outra foto</button>
  </div>`;
  const saveBtn = document.getElementById('receipt-save-btn');
  if (saveBtn) saveBtn.style.display = 'none';
}

function _renderReceiptReview(data) {
  _receiptLines = (data.items || []).map(i => ({ description: i.description, category: i.category, amount: i.amount }));
  const today = new Date().toISOString().slice(0, 10);
  const dateVal = data.date || today;
  const el = document.getElementById('receipt-review-content');
  el.innerHTML = `
    <div style="display:flex;gap:14px;align-items:flex-start;margin-bottom:14px;flex-wrap:wrap;">
      <img src="${_receiptImage}" alt="talão" style="width:84px;height:108px;object-fit:cover;border-radius:8px;border:1px solid var(--cinza-claro);cursor:zoom-in;" data-on-click="open-receipt-image">
      <div class="form-grid" style="flex:1;min-width:260px;">
        <div class="form-group"><label class="form-label">Data</label><input class="form-control" id="rl-date" type="date" value="${dateVal}"></div>
        <div class="form-group"><label class="form-label">Fornecedor</label><input class="form-control" id="rl-supplier" list="rl-supplier-list" value="${AppModules.core.escapeHtml(data.supplier || '')}" placeholder="Fornecedor" autocomplete="off"><datalist id="rl-supplier-list">${(suppliersData || []).map(s => `<option value="${AppModules.core.escapeHtml(s.name)}"></option>`).join('')}</datalist></div>
        <div class="form-group"><label class="form-label">Nº Fatura</label><input class="form-control" id="rl-invoice" value="${AppModules.core.escapeHtml(data.invoice_ref || '')}" placeholder="Nº fatura" autocomplete="off" data-on-focusout="check-receipt-duplicate"></div>
        <div class="form-group"><label class="form-label">Pagamento</label><select class="form-control" id="rl-payment">
          <option value="numerário">Numerário</option><option value="transferencia">Transferência</option>
          <option value="mbway">MBWay</option><option value="cartao" selected>Cartão</option></select></div>
        <div class="form-group"><label class="form-label">Contribuinte (NIF na fatura)</label><select class="form-control" id="rl-has-nif">
          <option value="0"${data.has_nif ? '' : ' selected'}>Sem NIF</option>
          <option value="1"${data.has_nif ? ' selected' : ''}>Com NIF</option></select></div>
      </div>
    </div>
    <div id="rl-dup-warning" style="display:none;margin-bottom:10px;">
      <div style="background:#fff8e6;border:1px solid #f2d98a;color:#8a6d1f;border-radius:8px;padding:9px 12px;font-size:12.5px;display:flex;align-items:center;gap:8px;">
        ${AppModules.core.lcIcon('alert-triangle', 15)}<span id="rl-dup-text"></span>
      </div>
    </div>
    <div style="font-size:12.5px;color:var(--cinza);margin-bottom:8px;">
      ${AppModules.core.lcIcon('info', 13)} A IA lê o talão mas pode enganar-se — <b>confere os valores e categorias</b> antes de guardar.
    </div>
    <div class="table-wrap" style="max-height:320px;overflow:auto;">
      <table class="tabela" style="font-size:13px;">
        <thead><tr><th>Artigo</th><th style="width:160px;">Categoria</th><th style="width:100px;text-align:right;">Valor (€)</th><th style="width:38px;"></th></tr></thead>
        <tbody id="receipt-lines-body"></tbody>
      </table>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;">
      <button class="btn btn-ghost btn-sm" data-on-click="add-receipt-line">${AppModules.core.lcIcon('plus', 13)} Adicionar linha</button>
      <div style="font-weight:700;">Total: <span id="rl-total">€0.00</span></div>
    </div>`;
  const saveBtn = document.getElementById('receipt-save-btn');
  if (saveBtn) saveBtn.style.display = '';
  _renderReceiptLines();
  AppUI.openModal('receipt-modal-bg');
  if (window.lucide) lucide.createIcons();
  checkReceiptDuplicate();
}

// Aviso de fatura já existente no fluxo da IA (mesmo nº + fornecedor).
async function checkReceiptDuplicate() {
  const warn = document.getElementById('rl-dup-warning');
  const txt = document.getElementById('rl-dup-text');
  if (!warn || !txt) return;
  const invoiceRef = (document.getElementById('rl-invoice')?.value || '').trim();
  const supplier = (document.getElementById('rl-supplier')?.value || '').trim();
  if (!invoiceRef) { warn.style.display = 'none'; return; }
  try {
    const res = await AppModules.core.apiGet(`/api/expenses/check-invoice?invoice_ref=${encodeURIComponent(invoiceRef)}&supplier=${encodeURIComponent(supplier)}`);
    const info = res?.data || res;
    if (info?.exists) {
      const n = info.count;
      txt.textContent = `Atenção: já existe ${n} despesa${n !== 1 ? 's' : ''} com a fatura "${invoiceRef}"${supplier ? ` de ${supplier}` : ''}. Confirma que não estás a registar a mesma fatura duas vezes.`;
      warn.style.display = '';
      if (window.lucide) lucide.createIcons();
    } else {
      warn.style.display = 'none';
    }
  } catch { warn.style.display = 'none'; }
}

function _receiptLineRow(line, idx) {
  const opts = RECEIPT_CATS.map(([v, l]) => `<option value="${v}"${v === line.category ? ' selected' : ''}>${l}</option>`).join('');
  return `<tr>
    <td><input class="form-control" data-rl="desc" value="${AppModules.core.escapeHtml(line.description || '')}" placeholder="Artigo" autocomplete="off"></td>
    <td><select class="form-control" data-rl="cat">${opts}</select></td>
    <td><input class="form-control no-number-spin" data-rl="amount" type="number" step="0.01" min="0" value="${line.amount}" style="text-align:right;"></td>
    <td><button class="btn btn-sm" data-on-click="remove-receipt-line" data-idx="${idx}" title="Remover linha" style="background:rgba(176,48,48,.1);color:var(--vermelho);">${AppModules.core.lcIcon('trash-2', 13)}</button></td>
  </tr>`;
}

function _renderReceiptLines() {
  const tbody = document.getElementById('receipt-lines-body');
  if (!tbody) return;
  tbody.innerHTML = _receiptLines.length
    ? _receiptLines.map((l, i) => _receiptLineRow(l, i)).join('')
    : `<tr><td colspan="4" style="text-align:center;color:var(--cinza);padding:16px;">Sem linhas — adiciona uma.</td></tr>`;
  tbody.querySelectorAll('[data-rl="amount"]').forEach(inp => { inp.oninput = _updateReceiptTotal; });
  _updateReceiptTotal();
  if (window.lucide) lucide.createIcons();
}

function _updateReceiptTotal() {
  let total = 0;
  document.querySelectorAll('#receipt-lines-body [data-rl="amount"]').forEach(i => { total += parseFloat(i.value) || 0; });
  const el = document.getElementById('rl-total');
  if (el) el.textContent = AppModules.core.formatEUR(total);
}

function _syncReceiptLinesFromDom() {
  const rows = document.querySelectorAll('#receipt-lines-body tr');
  const collected = [...rows]
    .filter(tr => tr.querySelector('[data-rl="desc"]'))
    .map(tr => ({
      description: tr.querySelector('[data-rl="desc"]').value.trim(),
      category: tr.querySelector('[data-rl="cat"]').value,
      amount: parseFloat(tr.querySelector('[data-rl="amount"]').value) || 0,
    }));
  if (collected.length || !rows.length) _receiptLines = collected;
}

function addReceiptLine() {
  _syncReceiptLinesFromDom();
  _receiptLines.push({ description: '', category: 'outro', amount: 0 });
  _renderReceiptLines();
}

function removeReceiptLine(idx) {
  _syncReceiptLinesFromDom();
  _receiptLines.splice(idx, 1);
  _renderReceiptLines();
}

function closeReceiptModal() {
  const bg = document.getElementById('receipt-modal-bg');
  const modal = bg.querySelector('.modal');
  modal.classList.add('modal-closing');
  setTimeout(() => { AppUI.closeModal(bg); modal.classList.remove('modal-closing'); }, 320);
  _receiptImage = null;
  _receiptLines = [];
}

async function saveReceiptExpenses() {
  _syncReceiptLinesFromDom();
  const date    = document.getElementById('rl-date')?.value;
  const supplier = (document.getElementById('rl-supplier')?.value || '').trim();
  const invoice  = (document.getElementById('rl-invoice')?.value || '').trim();
  const payment  = document.getElementById('rl-payment')?.value || 'numerário';
  const hasNif   = document.getElementById('rl-has-nif')?.value === '1' ? 1 : 0;
  if (!date) { AppModules.core.toast('Indica a data do talão.', 'error'); return; }
  const valid = _receiptLines.filter(l => l.description && l.amount > 0);
  if (!valid.length) { AppModules.core.toast('Não há linhas válidas para guardar.', 'error'); return; }
  const expenses = valid.map(l => ({
    date, description: l.description, category: l.category, amount: l.amount,
    supplier, invoice_ref: invoice, payment_method: payment, has_nif: hasNif,
  }));
  const btn = document.getElementById('receipt-save-btn');
  AppUI.setButtonLoading(btn, true);
  try {
    const res = await AppModules.core.apiPost('/api/expenses/bulk', { image: _receiptImage, expenses, has_nif: hasNif });
    if (res.success) {
      AppModules.core.toast(`✅ ${res.count} despesa${res.count !== 1 ? 's' : ''} guardada${res.count !== 1 ? 's' : ''}.`, 'success');
      closeReceiptModal();
      await loadDespesas();
    } else {
      AppModules.core.toast('❌ ' + (res.error || 'Erro ao guardar.'), 'error');
    }
  } catch (e) {
    AppModules.core.toast('❌ ' + (e?.payload?.error || 'Erro ao guardar as despesas.'), 'error');
  } finally {
    AppUI.setButtonLoading(btn, false);
  }
}

// ── AÇÕES (data-action) ──
// Ver js/domain/actions.js. Cada handler aqui substitui um onclick/onchange/
// oninput/onblur que estava antes espalhado pelo HTML desta vista.
AppActions.register({
  'open-despesa-modal': el => openDespesaModal(el.dataset.id),
  'delete-despesa': el => deleteDespesa(el.dataset.id),
  'despesa-modal-backdrop': (el, e) => { if (e.target === el) closeDespesaModal(); },
  'close-despesa-modal': () => closeDespesaModal(),
  'save-despesa': () => saveDespesa(),
  'export-despesas-xlsx': () => exportDespesasXLSX(),
  'open-despesas-filters': () => toggleDespesasFiltersSheet(true),
  'close-despesas-filters': () => toggleDespesasFiltersSheet(false),
  'clear-despesas-filtros': () => clearDespesasFiltros(),
  'trigger-receipt-input': () => document.getElementById('receipt-file-input').click(),
  'retry-receipt-photo': () => { closeReceiptModal(); setTimeout(() => document.getElementById('receipt-file-input').click(), 350); },
  'open-receipt-image': () => { if (_receiptImage) window.open(_receiptImage, '_blank'); },
  'receipt-modal-backdrop': (el, e) => { if (e.target === el) closeReceiptModal(); },
  'close-receipt-modal': () => closeReceiptModal(),
  'save-receipt-expenses': () => saveReceiptExpenses(),
  'add-receipt-line': () => addReceiptLine(),
  'remove-receipt-line': el => removeReceiptLine(Number(el.dataset.idx)),
});
AppActions.register({
  'despesas-query-changed-reload': () => despesasQueryChanged({ immediate: true, reloadPeriods: true }),
  'despesas-query-changed-immediate': () => despesasQueryChanged({ immediate: true }),
  'receipt-file-selected': el => onReceiptSelected(el),
}, 'change');
AppActions.register({
  'despesas-query-changed': () => despesasQueryChanged(),
}, 'input');
AppActions.register({
  'check-despesa-duplicate': () => checkDespesaDuplicate(),
  'check-receipt-duplicate': () => checkReceiptDuplicate(),
}, 'focusout');

// Limpeza da funcionalidade ao sair ou trocar de organização.
AppModules.onReset('despesas.js', () => {
  despesaEditId = null;
  despesaPeriods = [];
  suppliersData = [];
  despesasPaged.reset();
  _receiptImage = null;
  _receiptLines = [];
});

})();
