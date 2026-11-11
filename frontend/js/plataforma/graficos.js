// Consola da plataforma: gráficos (Chart.js, carregado a pedido por
// AppModules.core.ensureLibrary('chart')). As cores vêm das variáveis --v2-* do
// aspeto atual e os gráficos desenham-se outra vez quando o aspeto muda.
(() => {
AppModules.define('consola', {
  charts: { get: () => charts },
});

const fmt = AppModules.consola.fmt;
const esc = fmt.esc;
const live = new Set();
let pending = [];
let counter = 0;

function theme() {
  const root = document.documentElement;
  const style = getComputedStyle(root);
  const read = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
  const colors = {
    ink: read('--v2-ink', '#222'), muted: read('--v2-muted', '#666'), soft: read('--v2-soft', '#999'),
    divider: read('--v2-divider', 'rgba(127,127,127,.2)'), accent: read('--v2-accent', '#843424'),
    ok: read('--v2-ok', '#2f6b4f'), warn: read('--v2-warn', '#8a5a10'), info: read('--v2-info', '#2f5f86'),
    bad: read('--v2-bad', '#a02522'), violet: read('--v2-violet', '#5b4a8a'),
    font: read('--v2-font', 'system-ui, sans-serif'),
  };
  // No clássico a cor de marca é o tijolo; no vidro o acento é neutro, por isso o azul.
  colors.primary = root.dataset.look === 'classico' ? colors.accent : colors.info;
  colors.palette = [colors.primary, colors.violet, colors.ok, colors.warn, colors.bad, colors.soft];
  return colors;
}

// Cor com transparência (as variáveis podem ser #rrggbb ou rgb/rgba).
function alpha(color, a) {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color);
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map(c => c + c).join('') : hex[1];
    return `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4), 16)}, ${a})`;
  }
  const rgb = /^rgba?\(([^)]+)\)/i.exec(color);
  if (rgb) { const [r, g, b] = rgb[1].split(',').map(s => s.trim()); return `rgba(${r}, ${g}, ${b}, ${a})`; }
  return color;
}

const short = (text, max = 24) => (String(text).length > max ? `${String(text).slice(0, max - 1)}…` : String(text));

function baseOptions(t) {
  return {
    responsive: true, maintainAspectRatio: false, animation: false,
    font: { family: t.font },
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: item => ` ${item.dataset.label ? `${item.dataset.label}: ` : ''}${fmt.num(item.parsed.y ?? item.parsed.x ?? item.parsed)}` } },
    },
  };
}

function lineConfig(spec, t) {
  const color = (d, i) => (d.tone ? t[d.tone] : t.palette[i % t.palette.length]);
  return {
    type: spec.kind === 'bar' ? 'bar' : 'line',
    data: {
      labels: spec.labels,
      datasets: spec.datasets.map((d, i) => spec.kind === 'bar'
        ? { label: d.label, data: d.data, backgroundColor: color(d, i), borderRadius: 5, maxBarThickness: 28 }
        : { label: d.label, data: d.data, borderColor: color(d, i), backgroundColor: alpha(color(d, i), 0.14), borderWidth: 2, pointRadius: 3, pointHoverRadius: 5,
            pointBackgroundColor: color(d, i), tension: 0.3, fill: true, spanGaps: false }),
    },
    options: {
      ...baseOptions(t),
      scales: {
        x: { grid: { display: false }, border: { color: t.divider }, ticks: { color: t.muted, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } },
        y: { beginAtZero: true, grid: { color: t.divider }, border: { display: false }, ticks: { color: t.muted, precision: 0, maxTicksLimit: 5 } },
      },
    },
  };
}

function donutConfig(spec, t) {
  return {
    type: 'doughnut',
    data: { labels: spec.labels, datasets: [{ data: spec.datasets[0].data, backgroundColor: spec.labels.map((_, i) => t.palette[i % t.palette.length]), borderWidth: 0, spacing: 2 }] },
    options: {
      ...baseOptions(t), cutout: '62%',
      plugins: {
        legend: { display: true, position: 'bottom', labels: { color: t.ink, boxWidth: 10, boxHeight: 10, padding: 12, usePointStyle: true, font: { family: t.font, size: 12 } } },
        tooltip: { callbacks: { label: item => ` ${item.label}: ${fmt.num(item.parsed)}` } },
      },
    },
  };
}

function hbarConfig(spec, t) {
  return {
    type: 'bar',
    data: { labels: spec.labels, datasets: [{ label: spec.datasets[0].label, data: spec.datasets[0].data, backgroundColor: t.primary, borderRadius: 5, maxBarThickness: 18 }] },
    options: {
      ...baseOptions(t), indexAxis: 'y',
      scales: {
        x: { beginAtZero: true, grid: { color: t.divider }, border: { display: false }, ticks: { color: t.muted, precision: 0, maxTicksLimit: 5 } },
        y: { grid: { display: false }, border: { color: t.divider }, ticks: { color: t.ink, callback(value) { return short(this.getLabelForValue(value)); } } },
      },
    },
  };
}

function configFor(spec, t) {
  if (spec.kind === 'donut') return donutConfig(spec, t);
  if (spec.kind === 'hbar') return hbarConfig(spec, t);
  return lineConfig(spec, t);
}

function build(entry) {
  entry.chart?.destroy();
  entry.chart = null;
  if (!entry.canvas.isConnected) { live.delete(entry); return; }
  entry.chart = new window.Chart(entry.canvas, configFor(entry.spec, theme()));
}

async function draw(canvas, spec) {
  if (!(await AppModules.core.ensureLibrary('chart')) || !canvas.isConnected) {
    if (canvas.isConnected) canvas.closest('.pl-chart')?.replaceChildren(Object.assign(document.createElement('p'), { className: 'v2-empty', textContent: 'Não foi possível carregar o gráfico.' }));
    return;
  }
  const entry = { canvas, spec, chart: null };
  live.add(entry);
  build(entry);
}

const hasData = spec => spec.datasets.some(d => d.data.some(value => Number(value) > 0));

// Cartão com título e gráfico; sem dados mostra a mensagem em vez de um gráfico vazio.
// O desenho só acontece em flush(), depois de o HTML estar na página.
// spec: { title, sub, kind: line|bar|donut|hbar, labels, datasets: [{label, data, tone?}], emptyText, height, cls }
function card(spec) {
  const id = `plc-${++counter}`;
  const head = `<div class="v2-card-h"><h3>${esc(spec.title)}</h3>${spec.sub ? `<span class="pl-sub">${esc(spec.sub)}</span>` : ''}</div>`;
  if (!hasData(spec)) {
    return `<div class="v2-card v2-dense pl-chart-card ${spec.cls || ''}">${head}<div class="pl-chart-empty">${fmt.empty(spec.emptyText || 'Ainda sem dados.', 'bar-chart-2')}</div></div>`;
  }
  const total = spec.datasets[0].data.reduce((sum, v) => sum + (Number(v) || 0), 0);
  const summary = `${spec.title}: ${spec.labels.map((l, i) => `${l} ${fmt.num(spec.datasets[0].data[i])}`).join(', ')}${spec.kind === 'donut' ? ` (total ${fmt.num(total)})` : ''}`;
  pending.push({ id, spec });
  return `<div class="v2-card v2-dense pl-chart-card ${spec.cls || ''}">${head}<div class="pl-chart" style="--h:${Number(spec.height) || 220}px"><canvas id="${id}" role="img" aria-label="${esc(summary)}"></canvas></div></div>`;
}

function flush(host) {
  const todo = pending;
  pending = [];
  for (const { id, spec } of todo) {
    const canvas = host.querySelector(`#${id}`);
    if (canvas) draw(canvas, spec);
  }
}

function disposeAll() {
  pending = [];
  for (const entry of live) entry.chart?.destroy();
  live.clear();
}

function redrawAll() {
  for (const entry of [...live]) build(entry);
}

// Os gráficos seguem o aspeto: mudar data-look / data-mode (escolha do utilizador
// ou do sistema, no modo automático) redesenha-os com as cores novas.
new MutationObserver(redrawAll).observe(document.documentElement, { attributes: true, attributeFilter: ['data-look', 'data-mode'] });

// Séries de «nome, contagem» → etiquetas e valores; o que passa do limite junta-se em «Outros».
function topN(rows, key, limit = 6) {
  const sorted = [...(Array.isArray(rows) ? rows : [])].map(r => ({ name: String(r.name ?? r.view ?? '—'), value: Number(r[key]) || 0 })).filter(r => r.value > 0).sort((a, b) => b.value - a.value);
  const head = sorted.slice(0, limit);
  const rest = sorted.slice(limit).reduce((sum, r) => sum + r.value, 0);
  if (rest > 0) head.push({ name: 'Outros', value: rest });
  return head;
}

const charts = { card, flush, disposeAll, topN };
})();
