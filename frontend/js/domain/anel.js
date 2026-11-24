// Gráficos redondos (anel) dos Relatórios e da consola, num só sítio: anel fino
// com pontas redondas e intervalos (Chart.js, doughnut), total no centro e
// legenda em lista, ambos em HTML. O estilo está em css/anel.css.
//
// DonutRing.mount(host, { labels, values, colors, format, tooltip, ariaLabel, font, animation })
// preenche `host` e devolve a instância do Chart (ou null sem Chart.js).
(() => {
// Contraste mínimo (WCAG, elementos gráficos) entre o anel e o painel.
const MIN_CONTRAST = 3.3; // margem sobre 3:1 para os brilhos do fundo do vidro
// Fundos mais escuros do que isto pedem cores clareadas.
const DARK_LUMINANCE = 0.2;
// Fundo de referência quando o painel é translúcido até à raiz (tema vidro escuro).
const DARK_BASE = [20, 20, 22];

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

// Percentagens inteiras que somam 100 (método do maior resto).
function percents(values) {
  const list = values.map(v => Math.max(0, Number(v) || 0));
  const total = list.reduce((sum, v) => sum + v, 0);
  if (!(total > 0)) return list.map(() => 0);
  const raw = list.map(v => v * 100 / total);
  const out = raw.map(Math.floor);
  const order = raw.map((x, i) => i).sort((a, b) => (raw[b] - out[b]) - (raw[a] - out[a]) || a - b);
  for (let k = 0, left = 100 - out.reduce((s, v) => s + v, 0); k < left; k++) out[order[k % order.length]]++;
  return out;
}

// «#rgb», «#rrggbb», «rgb(...)» ou «rgba(...)» → [r, g, b, a]; null se não souber ler.
function parse(color) {
  const text = String(color || '').trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text);
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map(c => c + c).join('') : hex[1];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4), 16), 1];
  }
  const rgb = /^rgba?\(([^)]+)\)/i.exec(text);
  if (!rgb) return null;
  const parts = rgb[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return parts.length >= 3 && parts.every(Number.isFinite) ? [parts[0], parts[1], parts[2], parts[3] ?? 1] : null;
}

const luminance = ([r, g, b]) => {
  const lin = v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const hex = ([r, g, b]) => `#${[r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;

// Cor do painel já composta com o que está por baixo (as variáveis do vidro são translúcidas).
function backdrop(el) {
  const layers = [];
  // O fundo da página faz transição ao mudar de aspeto; a variável já tem o valor final.
  const page = parse(getComputedStyle(document.documentElement).getPropertyValue('--v2-bg'));
  for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
    const rgba = (node === document.body && page) || parse(getComputedStyle(node).backgroundColor);
    if (rgba && rgba[3] > 0) { layers.push(rgba); if (rgba[3] >= 1) break; }
  }
  const last = layers[layers.length - 1];
  let base = last && last[3] >= 1 ? last.slice(0, 3) : null;
  if (!base) base = DARK_BASE;
  for (let i = layers.length - 1; i >= 0; i--) {
    const [r, g, b, a] = layers[i];
    if (a >= 1) continue;
    base = [r * a + base[0] * (1 - a), g * a + base[1] * (1 - a), b * a + base[2] * (1 - a)];
  }
  return base;
}

// Em painéis escuros, clareia (misturando com branco) só as cores que ficariam
// abaixo de 3:1; as restantes e o tema claro ficam como estão.
function lift(color, bg) {
  const rgb = parse(color);
  if (!rgb || !bg || luminance(bg) >= DARK_LUMINANCE) return color;
  let out = rgb.slice(0, 3);
  for (let t = 0.04; contrast(out, bg) < MIN_CONTRAST && t <= 1; t += 0.04) out = rgb.slice(0, 3).map(v => v + (255 - v) * t);
  return hex(out);
}

function config({ labels, values, colors, tooltip, font, animation }) {
  // Um só segmento (100 %) fecha o anel: sem intervalo nem pontas redondas.
  const single = values.filter(v => Number(v) > 0).length <= 1;
  return {
    type: 'doughnut',
    data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 0, spacing: single ? 0 : 4, borderRadius: single ? 0 : 24, hoverOffset: 4 }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '80%', rotation: 0,
      layout: { padding: 6 },
      ...(animation === false ? { animation: false } : {}),
      ...(font ? { font: { family: font } } : {}),
      plugins: { legend: { display: false }, tooltip: tooltip ? { callbacks: { label: tooltip } } : {} },
    },
  };
}

function markup({ labels, values, colors, format, ariaLabel }) {
  const pct = percents(values);
  const total = values.reduce((sum, v) => sum + (Math.max(0, Number(v) || 0)), 0);
  const rows = labels.map((label, i) => `<li><span class="anel-ponto" style="background:${esc(colors[i])}"></span><span class="anel-nome">${esc(label)} <em>${pct[i]}%</em></span><b>${esc(format(values[i]))}</b></li>`).join('');
  return `<div class="anel"${ariaLabel ? ` role="img" aria-label="${esc(ariaLabel)}"` : ''}><div class="anel-painel"><div class="anel-grafico"><canvas aria-hidden="true"></canvas><div class="anel-centro"><b>${esc(format(total))}</b><span>Total</span></div></div></div><ul class="anel-legenda">${rows}</ul></div>`;
}

function mount(host, { labels, values, colors, format = v => String(v), tooltip, ariaLabel, font, animation }) {
  host.innerHTML = markup({ labels, values, colors, format, ariaLabel });
  const bg = backdrop(host.querySelector('.anel-painel'));
  const shown = colors.map(c => lift(c, bg));
  host.querySelectorAll('.anel-ponto').forEach((dot, i) => { dot.style.background = shown[i]; });
  if (typeof window.Chart === 'undefined') return null;
  return new window.Chart(host.querySelector('canvas'), config({ labels, values, colors: shown, tooltip, font, animation }));
}

// Redesenhar quando o aspeto ou o modo mudam (as cores do painel mudam).
const listeners = new Set();
function onThemeChange(fn) {
  listeners.add(fn);
  if (listeners.size === 1 && typeof MutationObserver !== 'undefined') {
    new MutationObserver(() => listeners.forEach(f => f())).observe(document.documentElement, { attributes: true, attributeFilter: ['data-look', 'data-mode', 'data-theme'] });
  }
}

globalThis.DonutRing = Object.freeze({ percents, lift, contrast, parse, backdrop, config, mount, onThemeChange });
})();
