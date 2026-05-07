// ── STATE ──
let _reportYear  = new Date().getFullYear();
let _reportAccId = '';
let _reportTab   = SS.get('report:tab', 'faturamento');
let _despYear    = new Date().getFullYear();
let _lucroYear   = new Date().getFullYear();
let _lucroAccId  = '';

let _chartRevenue      = null;
let _chartChannel      = null;
let _chartAccom        = null;
let _chartDespMonthly  = null;
let _chartDespCategory = null;
let _chartLucro        = null;

const MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const MONTH_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const CHANNEL_COLORS = { airbnb:'#FF5A5F', booking:'#003580', direto:'#843424', expedia:'#FFC72C', vrbo:'#195ABA', outro:'#8a8278' };
const CAT_COLORS = { limpeza:'#4a90d9', manutencao:'#e67e22', marketing:'#9b59b6', impostos:'#e74c3c', servicos:'#2ecc71', consumiveis:'#f39c12', outro:'#95a5a6' };
const CAT_LABELS = { limpeza:'Limpeza', manutencao:'Manutenção', marketing:'Marketing', impostos:'Impostos', servicos:'Serviços', consumiveis:'Consumíveis', outro:'Outro' };
const MARCA = '#843424';

const fmtEur = v => '€' + Number(v || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── TAB SWITCHING ──
function switchReportTab(tab) {
  _reportTab = tab;
  SS.set('report:tab', tab);
  ['faturamento', 'despesas', 'lucro'].forEach(t => {
    const btn   = document.getElementById('rtab-btn-' + t);
    const panel = document.getElementById('rtab-' + t);
    if (btn)   btn.classList.toggle('active', t === tab);
    if (panel) panel.style.display = t === tab ? '' : 'none';
  });
  if (tab === 'faturamento') _loadFaturamento();
  if (tab === 'despesas')    _loadDespesas();
  if (tab === 'lucro')       _loadLucro();
}

async function loadRelatorios() {
  switchReportTab(_reportTab);
}

// ══════════════════════════════════════
//  FATURAMENTO
// ══════════════════════════════════════
async function _loadFaturamento() {
  const kpiEl = document.getElementById('report-kpis');
  if (kpiEl) kpiEl.innerHTML = '<div class="report-loading"><i data-lucide="loader" style="width:20px;height:20px;"></i> A carregar...</div>';
  try {
    const qs   = `?year=${_reportYear}${_reportAccId ? '&accommodation_id=' + _reportAccId : ''}`;
    const data = await apiGet('/api/reports/financial' + qs);
    const d    = data.data;
    _renderFatFilters(d.available_years);
    _renderReportKPIs(d.totals);
    _renderRevenueChart(d.months);
    _renderChannelChart(d.channels);
    _renderAccomChart(d.accommodations);
    _renderReportTable(d.months);
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    if (kpiEl) kpiEl.innerHTML = '<div class="report-loading" style="color:var(--vermelho);">Erro ao carregar relatório.</div>';
  }
}

function setReportYear(y) { _reportYear = Number(y); _loadFaturamento(); }
function setReportAccId(id) { _reportAccId = id; _loadFaturamento(); }

function _renderFatFilters(availableYears) {
  const sel = document.getElementById('report-year-sel');
  if (sel) {
    sel.innerHTML = availableYears.map(y =>
      `<option value="${y}"${y === _reportYear ? ' selected' : ''}>${y}</option>`
    ).join('');
    sel.dataset.filled = '1';
  }
  const accSel = document.getElementById('report-acc-sel');
  if (accSel && !accSel.dataset.filled) {
    accSel.innerHTML = '<option value="">Todos os alojamentos</option>' +
      accommodations.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
    accSel.value = _reportAccId;
    accSel.dataset.filled = '1';
  }
}

function _renderReportKPIs(totals) {
  const el = document.getElementById('report-kpis');
  if (!el) return;
  el.innerHTML = `
    <div class="report-kpi-card">
      <div class="report-kpi-icon" style="background:rgba(132,52,36,.1);color:var(--marca);">
        <i data-lucide="euro" style="width:18px;height:18px;"></i>
      </div>
      <div class="report-kpi-body">
        <div class="report-kpi-value">${fmtEur(totals.revenue)}</div>
        <div class="report-kpi-label">Receita total ${_reportYear}</div>
      </div>
    </div>
    <div class="report-kpi-card">
      <div class="report-kpi-icon" style="background:rgba(46,125,82,.1);color:var(--verde);">
        <i data-lucide="clipboard-check" style="width:18px;height:18px;"></i>
      </div>
      <div class="report-kpi-body">
        <div class="report-kpi-value">${totals.reservations}</div>
        <div class="report-kpi-label">Reservas confirmadas</div>
      </div>
    </div>
    <div class="report-kpi-card">
      <div class="report-kpi-icon" style="background:rgba(74,111,165,.1);color:var(--azul-claro);">
        <i data-lucide="moon" style="width:18px;height:18px;"></i>
      </div>
      <div class="report-kpi-body">
        <div class="report-kpi-value">${totals.avg_occupancy}%</div>
        <div class="report-kpi-label">Ocupação média anual</div>
      </div>
    </div>
    <div class="report-kpi-card">
      <div class="report-kpi-icon" style="background:rgba(201,168,76,.12);color:var(--dourado);">
        <i data-lucide="trending-up" style="width:18px;height:18px;"></i>
      </div>
      <div class="report-kpi-body">
        <div class="report-kpi-value">${fmtEur(totals.revpar)}</div>
        <div class="report-kpi-label">RevPAR (receita/noite)</div>
      </div>
    </div>`;
}

function _renderRevenueChart(months) {
  const canvas = document.getElementById('chart-revenue');
  if (!canvas || typeof Chart === 'undefined') return;
  if (_chartRevenue) { _chartRevenue.destroy(); _chartRevenue = null; }
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridColor = isDark ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.06)';
  const textColor = isDark ? '#aaa' : '#8a8278';
  _chartRevenue = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: MONTH_SHORT,
      datasets: [
        {
          label: 'Receita (€)',
          data: months.map(m => m.revenue),
          backgroundColor: months.map(m => m.month === new Date().getMonth() && _reportYear === new Date().getFullYear()
            ? 'rgba(132,52,36,.9)' : 'rgba(132,52,36,.65)'),
          borderRadius: 5, borderSkipped: false,
        },
        {
          label: 'Ocupação (%)',
          data: months.map(m => m.occupancy_rate),
          type: 'line',
          borderColor: 'rgba(74,111,165,.8)',
          backgroundColor: 'rgba(74,111,165,.08)',
          borderWidth: 2, pointRadius: 3,
          pointBackgroundColor: 'rgba(74,111,165,1)',
          yAxisID: 'yOcc', tension: 0.35, fill: true,
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: textColor, font: { size: 11 }, boxWidth: 12, padding: 16 } },
        tooltip: { callbacks: { label: ctx => ctx.datasetIndex === 0
          ? ` €${Number(ctx.raw).toLocaleString('pt-PT', { minimumFractionDigits: 2 })}`
          : ` ${ctx.raw}%` } }
      },
      scales: {
        x: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 11 } } },
        y: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 11 },
          callback: v => '€' + Number(v).toLocaleString('pt-PT') } },
        yOcc: { position: 'right', grid: { drawOnChartArea: false }, min: 0, max: 100,
          ticks: { color: 'rgba(74,111,165,.8)', font: { size: 11 }, callback: v => v + '%' } }
      }
    }
  });
}

function _renderChannelChart(channels) {
  const canvas = document.getElementById('chart-channel');
  if (!canvas || typeof Chart === 'undefined') return;
  if (_chartChannel) { _chartChannel.destroy(); _chartChannel = null; }
  if (!channels.length) { canvas.parentElement.innerHTML += '<div class="report-empty">Sem dados de canais.</div>'; return; }
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#aaa' : '#8a8278';
  const labels = channels.map(c => c.channel || 'outro');
  const values = channels.map(c => c.revenue || 0);
  const colors = labels.map(c => CHANNEL_COLORS[c] || CHANNEL_COLORS.outro);
  _chartChannel = new Chart(canvas, {
    type: 'doughnut',
    data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 2,
      borderColor: isDark ? '#1e1e1e' : '#fff', hoverOffset: 6 }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '62%',
      plugins: {
        legend: { position: 'bottom', labels: { color: textColor, font: { size: 11 }, padding: 12, boxWidth: 12 } },
        tooltip: { callbacks: { label: ctx => ` €${Number(ctx.raw).toLocaleString('pt-PT', { minimumFractionDigits: 2 })} · ${ctx.label}` } }
      }
    }
  });
}

function _renderAccomChart(accoms) {
  const canvas = document.getElementById('chart-accom');
  if (!canvas || typeof Chart === 'undefined') return;
  if (_chartAccom) { _chartAccom.destroy(); _chartAccom = null; }
  if (!accoms.length) { canvas.parentElement.innerHTML += '<div class="report-empty">Sem dados de alojamentos.</div>'; return; }
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridColor = isDark ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.06)';
  const textColor = isDark ? '#aaa' : '#8a8278';
  _chartAccom = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: accoms.map(a => a.name),
      datasets: [{ label: 'Receita (€)', data: accoms.map(a => a.revenue),
        backgroundColor: accoms.map(a => (a.color || MARCA) + 'bb'),
        borderColor: accoms.map(a => a.color || MARCA),
        borderWidth: 1.5, borderRadius: 4, borderSkipped: false }]
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` €${Number(ctx.raw).toLocaleString('pt-PT', { minimumFractionDigits: 2 })}` } } },
      scales: {
        x: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 11 },
          callback: v => '€' + Number(v).toLocaleString('pt-PT') } },
        y: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 11 } } }
      }
    }
  });
}

function _renderReportTable(months) {
  const tbody = document.getElementById('report-table-body');
  if (!tbody) return;
  const today = new Date();
  tbody.innerHTML = months.map(m => {
    const isCurrent = m.month === today.getMonth() && _reportYear === today.getFullYear();
    return `<tr class="${isCurrent ? 'report-row-current' : ''}">
      <td>${MONTH_NAMES[m.month]}</td>
      <td style="text-align:right;">${m.reservations}</td>
      <td style="text-align:right;">${m.nights}</td>
      <td style="text-align:right;font-weight:600;">${fmtEur(m.revenue)}</td>
      <td style="text-align:right;">
        <span class="report-occ-bar">
          <span class="report-occ-fill" style="width:${m.occupancy_rate}%;background:${m.occupancy_rate > 70 ? 'var(--verde)' : m.occupancy_rate > 40 ? 'var(--dourado)' : 'var(--cinza)'};"></span>
        </span>
        ${m.occupancy_rate}%
      </td>
    </tr>`;
  }).join('');
}

// ══════════════════════════════════════
//  DESPESAS
// ══════════════════════════════════════
async function _loadDespesas() {
  const kpiEl = document.getElementById('desp-kpis');
  if (kpiEl) kpiEl.innerHTML = '<div class="report-loading"><i data-lucide="loader" style="width:20px;height:20px;"></i> A carregar...</div>';
  try {
    const data = await apiGet(`/api/reports/expenses?year=${_despYear}`);
    const d    = data.data;
    _renderDespFilters(d.available_years);
    _renderDespKPIs(d.totals, d.byCategory);
    _renderDespMonthlyChart(d.months);
    _renderDespCategoryChart(d.byCategory);
    _renderDespTable(d.months);
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    if (kpiEl) kpiEl.innerHTML = '<div class="report-loading" style="color:var(--vermelho);">Erro ao carregar despesas.</div>';
  }
}

function setDespYear(y) { _despYear = Number(y); _loadDespesas(); }

function _renderDespFilters(availableYears) {
  const sel = document.getElementById('desp-year-sel');
  if (!sel) return;
  sel.innerHTML = availableYears.map(y =>
    `<option value="${y}"${y === _despYear ? ' selected' : ''}>${y}</option>`
  ).join('');
}

function _renderDespKPIs(totals, byCategory) {
  const el = document.getElementById('desp-kpis');
  if (!el) return;
  const topCat = byCategory[0];
  const topCatLabel = topCat ? (CAT_LABELS[topCat.category] || topCat.category) : '—';
  el.innerHTML = `
    <div class="report-kpi-card">
      <div class="report-kpi-icon" style="background:rgba(231,76,60,.1);color:#e74c3c;">
        <i data-lucide="receipt" style="width:18px;height:18px;"></i>
      </div>
      <div class="report-kpi-body">
        <div class="report-kpi-value">${fmtEur(totals.year_total)}</div>
        <div class="report-kpi-label">Despesas totais ${_despYear}</div>
      </div>
    </div>
    <div class="report-kpi-card">
      <div class="report-kpi-icon" style="background:rgba(46,125,82,.1);color:var(--verde);">
        <i data-lucide="hash" style="width:18px;height:18px;"></i>
      </div>
      <div class="report-kpi-body">
        <div class="report-kpi-value">${totals.count}</div>
        <div class="report-kpi-label">Nº de despesas</div>
      </div>
    </div>
    <div class="report-kpi-card">
      <div class="report-kpi-icon" style="background:rgba(74,111,165,.1);color:var(--azul-claro);">
        <i data-lucide="tag" style="width:18px;height:18px;"></i>
      </div>
      <div class="report-kpi-body">
        <div class="report-kpi-value">${topCatLabel}</div>
        <div class="report-kpi-label">Maior categoria${topCat ? ' · ' + fmtEur(topCat.total) : ''}</div>
      </div>
    </div>
    <div class="report-kpi-card">
      <div class="report-kpi-icon" style="background:rgba(201,168,76,.12);color:var(--dourado);">
        <i data-lucide="calendar" style="width:18px;height:18px;"></i>
      </div>
      <div class="report-kpi-body">
        <div class="report-kpi-value">${fmtEur(totals.avg_monthly)}</div>
        <div class="report-kpi-label">Média mensal</div>
      </div>
    </div>`;
}

function _renderDespMonthlyChart(months) {
  const canvas = document.getElementById('chart-desp-monthly');
  if (!canvas || typeof Chart === 'undefined') return;
  if (_chartDespMonthly) { _chartDespMonthly.destroy(); _chartDespMonthly = null; }
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridColor = isDark ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.06)';
  const textColor = isDark ? '#aaa' : '#8a8278';
  const today = new Date();
  _chartDespMonthly = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: MONTH_SHORT,
      datasets: [{
        label: 'Despesas (€)',
        data: months.map(m => m.total),
        backgroundColor: months.map(m => m.month === today.getMonth() && _despYear === today.getFullYear()
          ? 'rgba(231,76,60,.9)' : 'rgba(231,76,60,.6)'),
        borderRadius: 5, borderSkipped: false,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: textColor, font: { size: 11 }, boxWidth: 12, padding: 16 } },
        tooltip: { callbacks: { label: ctx => ` €${Number(ctx.raw).toLocaleString('pt-PT', { minimumFractionDigits: 2 })}` } }
      },
      scales: {
        x: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 11 } } },
        y: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 11 },
          callback: v => '€' + Number(v).toLocaleString('pt-PT') } }
      }
    }
  });
}

function _renderDespCategoryChart(byCategory) {
  const canvas = document.getElementById('chart-desp-category');
  if (!canvas || typeof Chart === 'undefined') return;
  if (_chartDespCategory) { _chartDespCategory.destroy(); _chartDespCategory = null; }
  if (!byCategory.length) {
    canvas.parentElement.innerHTML += '<div class="report-empty">Sem despesas registadas.</div>';
    return;
  }
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#aaa' : '#8a8278';
  const labels = byCategory.map(c => CAT_LABELS[c.category] || c.category);
  const values = byCategory.map(c => c.total);
  const colors = byCategory.map(c => CAT_COLORS[c.category] || CAT_COLORS.outro);
  _chartDespCategory = new Chart(canvas, {
    type: 'doughnut',
    data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 2,
      borderColor: isDark ? '#1e1e1e' : '#fff', hoverOffset: 6 }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '62%',
      plugins: {
        legend: { position: 'bottom', labels: { color: textColor, font: { size: 11 }, padding: 12, boxWidth: 12 } },
        tooltip: { callbacks: { label: ctx => ` €${Number(ctx.raw).toLocaleString('pt-PT', { minimumFractionDigits: 2 })} · ${ctx.label}` } }
      }
    }
  });
}

function _renderDespTable(months) {
  const tbody = document.getElementById('desp-table-body');
  if (!tbody) return;
  const today = new Date();
  const yearTotal = months.reduce((s, m) => s + m.total, 0);
  tbody.innerHTML = months.map(m => {
    const isCurrent = m.month === today.getMonth() && _despYear === today.getFullYear();
    return `<tr class="${isCurrent ? 'report-row-current' : ''}">
      <td>${MONTH_NAMES[m.month]}</td>
      <td style="text-align:right;">${m.count}</td>
      <td style="text-align:right;font-weight:600;color:${m.total > 0 ? '#e74c3c' : 'inherit'};">${fmtEur(m.total)}</td>
    </tr>`;
  }).join('') + `<tr style="border-top:2px solid var(--cinza-claro);font-weight:700;">
    <td>Total</td>
    <td style="text-align:right;">${months.reduce((s,m)=>s+m.count,0)}</td>
    <td style="text-align:right;color:#e74c3c;">${fmtEur(yearTotal)}</td>
  </tr>`;
}

// ══════════════════════════════════════
//  LUCRO
// ══════════════════════════════════════
async function _loadLucro() {
  const kpiEl = document.getElementById('lucro-kpis');
  if (kpiEl) kpiEl.innerHTML = '<div class="report-loading"><i data-lucide="loader" style="width:20px;height:20px;"></i> A carregar...</div>';
  try {
    const [fatData, despData] = await Promise.all([
      apiGet(`/api/reports/financial?year=${_lucroYear}${_lucroAccId ? '&accommodation_id=' + _lucroAccId : ''}`),
      apiGet(`/api/reports/expenses?year=${_lucroYear}`)
    ]);
    const fat  = fatData.data;
    const desp = despData.data;
    _renderLucroFilters(fat.available_years);
    _renderLucroKPIs(fat.totals, desp.totals);
    _renderLucroChart(fat.months, desp.months);
    _renderLucroTable(fat.months, desp.months);
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    if (kpiEl) kpiEl.innerHTML = '<div class="report-loading" style="color:var(--vermelho);">Erro ao carregar dados de lucro.</div>';
  }
}

function setLucroYear(y)   { _lucroYear = Number(y); _loadLucro(); }
function setLucroAccId(id) { _lucroAccId = id; _loadLucro(); }

function _renderLucroFilters(availableYears) {
  const sel = document.getElementById('lucro-year-sel');
  if (sel) {
    sel.innerHTML = availableYears.map(y =>
      `<option value="${y}"${y === _lucroYear ? ' selected' : ''}>${y}</option>`
    ).join('');
  }
  const accSel = document.getElementById('lucro-acc-sel');
  if (accSel && !accSel.dataset.filled) {
    accSel.innerHTML = '<option value="">Todos os alojamentos</option>' +
      accommodations.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
    accSel.value = _lucroAccId;
    accSel.dataset.filled = '1';
  }
}

function _renderLucroKPIs(fatTotals, despTotals) {
  const el = document.getElementById('lucro-kpis');
  if (!el) return;
  const revenue  = fatTotals.revenue || 0;
  const expenses = despTotals.year_total || 0;
  const profit   = revenue - expenses;
  const margin   = revenue > 0 ? Math.round(profit / revenue * 100) : 0;
  const profitColor = profit >= 0 ? 'var(--verde)' : 'var(--vermelho)';
  el.innerHTML = `
    <div class="report-kpi-card">
      <div class="report-kpi-icon" style="background:rgba(132,52,36,.1);color:var(--marca);">
        <i data-lucide="trending-up" style="width:18px;height:18px;"></i>
      </div>
      <div class="report-kpi-body">
        <div class="report-kpi-value">${fmtEur(revenue)}</div>
        <div class="report-kpi-label">Receita ${_lucroYear}</div>
      </div>
    </div>
    <div class="report-kpi-card">
      <div class="report-kpi-icon" style="background:rgba(231,76,60,.1);color:#e74c3c;">
        <i data-lucide="trending-down" style="width:18px;height:18px;"></i>
      </div>
      <div class="report-kpi-body">
        <div class="report-kpi-value">${fmtEur(expenses)}</div>
        <div class="report-kpi-label">Despesas ${_lucroYear}</div>
      </div>
    </div>
    <div class="report-kpi-card">
      <div class="report-kpi-icon" style="background:${profit >= 0 ? 'rgba(46,125,82,.1)' : 'rgba(231,76,60,.1)'};color:${profitColor};">
        <i data-lucide="landmark" style="width:18px;height:18px;"></i>
      </div>
      <div class="report-kpi-body">
        <div class="report-kpi-value" style="color:${profitColor};">${fmtEur(profit)}</div>
        <div class="report-kpi-label">Lucro bruto</div>
      </div>
    </div>
    <div class="report-kpi-card">
      <div class="report-kpi-icon" style="background:rgba(201,168,76,.12);color:var(--dourado);">
        <i data-lucide="percent" style="width:18px;height:18px;"></i>
      </div>
      <div class="report-kpi-body">
        <div class="report-kpi-value" style="color:${profitColor};">${margin}%</div>
        <div class="report-kpi-label">Margem de lucro</div>
      </div>
    </div>`;
}

function _renderLucroChart(fatMonths, despMonths) {
  const canvas = document.getElementById('chart-lucro');
  if (!canvas || typeof Chart === 'undefined') return;
  if (_chartLucro) { _chartLucro.destroy(); _chartLucro = null; }
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridColor = isDark ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.06)';
  const textColor = isDark ? '#aaa' : '#8a8278';
  const profits = fatMonths.map((m, i) => m.revenue - (despMonths[i]?.total || 0));
  _chartLucro = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: MONTH_SHORT,
      datasets: [
        {
          label: 'Receita (€)',
          data: fatMonths.map(m => m.revenue),
          backgroundColor: 'rgba(132,52,36,.7)',
          borderRadius: 4, borderSkipped: false, order: 2,
        },
        {
          label: 'Despesas (€)',
          data: despMonths.map(m => m.total),
          backgroundColor: 'rgba(231,76,60,.65)',
          borderRadius: 4, borderSkipped: false, order: 2,
        },
        {
          label: 'Lucro (€)',
          data: profits,
          type: 'line',
          borderColor: profits.map(p => p >= 0 ? 'rgba(46,125,82,.9)' : 'rgba(231,76,60,.9)'),
          backgroundColor: 'transparent',
          borderWidth: 2.5,
          pointRadius: 4,
          pointBackgroundColor: profits.map(p => p >= 0 ? 'rgba(46,125,82,1)' : 'rgba(231,76,60,1)'),
          tension: 0.3,
          order: 1,
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: textColor, font: { size: 11 }, boxWidth: 12, padding: 16 } },
        tooltip: { callbacks: { label: ctx => ` €${Number(ctx.raw).toLocaleString('pt-PT', { minimumFractionDigits: 2 })}` } }
      },
      scales: {
        x: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 11 } } },
        y: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 11 },
          callback: v => '€' + Number(v).toLocaleString('pt-PT') } }
      }
    }
  });
}

function _renderLucroTable(fatMonths, despMonths) {
  const tbody = document.getElementById('lucro-table-body');
  if (!tbody) return;
  const today = new Date();
  let totalRev = 0, totalDesp = 0;
  tbody.innerHTML = fatMonths.map((m, i) => {
    const desp   = despMonths[i]?.total || 0;
    const profit = m.revenue - desp;
    const margin = m.revenue > 0 ? Math.round(profit / m.revenue * 100) : 0;
    const isCurrent = m.month === today.getMonth() && _lucroYear === today.getFullYear();
    const profitColor = profit >= 0 ? 'var(--verde)' : 'var(--vermelho)';
    totalRev  += m.revenue;
    totalDesp += desp;
    return `<tr class="${isCurrent ? 'report-row-current' : ''}">
      <td>${MONTH_NAMES[m.month]}</td>
      <td style="text-align:right;">${fmtEur(m.revenue)}</td>
      <td style="text-align:right;color:#e74c3c;">${fmtEur(desp)}</td>
      <td style="text-align:right;font-weight:600;color:${profitColor};">${fmtEur(profit)}</td>
      <td style="text-align:right;color:${profitColor};">${margin}%</td>
    </tr>`;
  }).join('');
  const totalProfit = totalRev - totalDesp;
  const totalMargin = totalRev > 0 ? Math.round(totalProfit / totalRev * 100) : 0;
  const profitColor = totalProfit >= 0 ? 'var(--verde)' : 'var(--vermelho)';
  tbody.innerHTML += `<tr style="border-top:2px solid var(--cinza-claro);font-weight:700;">
    <td>Total</td>
    <td style="text-align:right;">${fmtEur(totalRev)}</td>
    <td style="text-align:right;color:#e74c3c;">${fmtEur(totalDesp)}</td>
    <td style="text-align:right;color:${profitColor};">${fmtEur(totalProfit)}</td>
    <td style="text-align:right;color:${profitColor};">${totalMargin}%</td>
  </tr>`;
}
