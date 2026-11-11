// Consola da plataforma: Utilização. Como a plataforma é usada (browsers,
// sistemas, dispositivos, app instalada, páginas) e como são as equipas.
(() => {
AppModules.define('consola', {
  utilizacao: { get: () => page },
});

const fmt = AppModules.consola.fmt;
const api = AppModules.consola.api;
const charts = AppModules.consola.charts;
const DAYS = 30;

const pairs = (obj, labels) => Object.entries(labels).map(([key, label]) => ({ label, value: Number(obj?.[key]) || 0 })).filter(r => r.value > 0);

function donut(title, rows, sub = `sessões, ${DAYS} dias`) {
  return charts.card({ title, sub, kind: 'donut', height: 230, labels: rows.map(r => r.name ?? r.label), datasets: [{ label: title, data: rows.map(r => r.value) }], emptyText: 'Ainda sem sessões.' });
}

const page = {
  async render(ctx) {
    const usage = await api.usage(DAYS);
    if (ctx.stale()) return;
    if (!usage) {
      ctx.host.innerHTML = `<div class="pl-page"><div class="v2-card v2-dense">${fmt.empty('A utilização ainda não está disponível.', 'bar-chart-2')}</div></div>`;
      return;
    }
    const views = (Array.isArray(usage.views) ? usage.views : []).filter(v => Number(v.count) > 0).slice(0, 10);
    const sizes = usage.team?.sizes || [];
    const sizeRows = ['1', '2-3', '4-6', '7+'].map(bucket => ({ bucket, value: Number(sizes.find(s => s.bucket === bucket)?.organizations) || 0 }));
    ctx.host.innerHTML = `<div class="pl-page">
      <p class="pl-lead">Últimos ${DAYS} dias, todas as organizações.</p>
      <div class="pl-charts pl-charts-3">
        ${donut('Browsers', charts.topN(usage.browsers, 'sessions', 5))}
        ${donut('Sistemas', charts.topN(usage.os, 'sessions', 5))}
        ${donut('Dispositivos', pairs(usage.devices, fmt.DEVICES))}
        ${donut('App ou browser', pairs(usage.display, fmt.DISPLAY))}
      </div>
      <div class="pl-charts pl-start">
        ${charts.card({ title: 'Páginas mais usadas', sub: `visitas, ${DAYS} dias`, kind: 'hbar', height: Math.max(180, views.length * 32 + 40), labels: views.map(v => fmt.viewName(v.view)), datasets: [{ label: 'Visitas', data: views.map(v => Number(v.count) || 0) }], emptyText: 'Ainda sem visitas.' })}
        <div class="pl-col">
          ${charts.card({ title: 'Tamanho das equipas', sub: 'organizações', kind: 'bar', height: 180, labels: sizeRows.map(r => fmt.BUCKETS[r.bucket]), datasets: [{ label: 'Organizações', data: sizeRows.map(r => r.value), tone: 'primary' }], emptyText: 'Ainda sem equipas.' })}
          ${donut('Papéis', pairs(usage.team?.roles, fmt.ROLES), 'pessoas')}
        </div>
      </div></div>`;
    charts.flush(ctx.host);
  },
};
})();
