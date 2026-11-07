// Despesas na V2: os quatro números da maqueta. Este mês (face ao mês
// anterior), este ano (média por mês), a maior categoria (parte do ano) e um
// atalho para ler um talão. Os dados vêm de /api/expenses/summary; o registo
// é o de sempre.
(() => {
AppModules.define('despesas', {
  renderDespesasKpiV2: { get: () => renderDespesasKpiV2 },
});

function kpi(icon, label, value, sub, attrs = '') {
  return `<div class="kpi-card dv2-kpi" ${attrs}><div class="kpi-label">${AppModules.core.lcIcon(icon, 15)} ${label}</div><div class="kpi-value">${value}</div><div class="kpi-sub">${sub}</div></div>`;
}

function renderDespesasKpiV2(s) {
  if (!document.documentElement?.dataset?.look) return false;
  const core = AppModules.core;
  const eur = core.formatEUR;
  const grid = document.getElementById('despesas-kpi-grid');
  if (grid) {
    const prev = Number(s.previousMonthTotal || 0);
    const diff = prev ? Math.round((Number(s.monthTotal) - prev) / prev * 100) : null;
    const monthsSoFar = new Date().getMonth() + 1;
    const top = s.byCategory?.[0];
    const share = top && Number(s.yearTotal) ? Math.round(top.total / s.yearTotal * 100) : 0;
    grid.innerHTML = [
      kpi('wallet', 'Este mês', eur(s.monthTotal), diff == null ? 'sem despesas no mês anterior'
        : `<span class="${diff > 0 ? 'dv2-up' : 'dv2-down'}">${diff > 0 ? '+' : ''}${diff}%</span> face ao mês anterior`),
      kpi('calendar', 'Este ano', eur(s.yearTotal), `média ${eur(Number(s.yearTotal) / monthsSoFar)} / mês`),
      kpi('tag', 'Maior categoria', top ? core.escapeHtml(AppModules.despesas.EXPENSE_CATS[top.category]?.label || top.category) : '—', top ? `${share}% do ano` : 'ainda sem despesas'),
      kpi('scan-line', 'Ler talão', 'Foto', 'a IA preenche a despesa', `role="button" tabindex="0" ${core.KEY_ACTIVATE} data-on-click="trigger-receipt-input"`),
    ].join('');
  }
  if (window.lucide) lucide.createIcons();
  return true;
}

})();
