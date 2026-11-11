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

function detailHtml(data) {
  if (!data) return '';
  const { esc } = fmt;
  const areas = { reservations: 'Reservas', accommodations: 'Alojamentos', calendar: 'Calendário', guests: 'Hóspedes', expenses: 'Despesas', suppliers: 'Fornecedores', reports: 'Relatórios', events: 'Eventos', vouchers: 'Vouchers', support: 'Suporte', team: 'Equipa', backup: 'Cópias de segurança', settings: 'Definições', 'email-templates': 'Modelos de email', push: 'Notificações', tasks: 'Tarefas', ops: 'Estado do sistema', announcements: 'Comunicados', 'payment-policy': 'Política de pagamentos', other: 'Outras áreas' };
  const errorTypes = { script: 'execução', resource: 'carregamento de recursos', promise: 'operações assíncronas' };
  const apiRows = data.diagnostics.filter(r => r.kind === 'api');
  const errors = data.diagnostics.filter(r => r.kind !== 'api');
  const steps = [['owner','Proprietário com acesso'],['accommodation','Primeiro alojamento'],['reservation','Primeira reserva'],['team','Equipa convidada'],['email','Email ligado'],['calendar','Calendário ligado']];
  return `<section class="v2-card v2-dense"><h3>Erros e desempenho · 30 dias</h3><p class="pl-note">Totais agregados. Tempos médios e máximos observados no servidor, em milissegundos.</p>
    ${apiRows.length ? apiRows.map(r => `<div class="pl-kv"><span>${esc(areas[r.name] || 'Outras áreas')} · ${fmt.num(r.count)} pedidos</span><b>${fmt.num(r.avg_ms)} ms em média · ${fmt.num(r.max_ms)} ms máximo</b></div>`).join('') : fmt.empty('Ainda sem tempos da API.')}
    ${errors.length ? errors.map(r => `<div class="pl-kv"><span>${r.kind === 'frontend' ? 'App' : 'API'} · ${esc(r.kind === 'frontend' ? (errorTypes[r.name] || 'outros erros') : (areas[r.name] || 'Outras áreas'))}</span><b>${fmt.num(r.count)} erros</b></div>`).join('') : '<p>Sem erros registados no período.</p>'}</section>
    <section class="v2-card v2-dense"><h3>Adoção das funcionalidades · 30 dias</h3><p class="pl-note">Organizações que abriram cada página, sobre o total de organizações.</p>${data.adoption.map(r => `<div class="pl-kv"><span>${esc(fmt.viewName(r.view))}</span><b>${fmt.num(r.organizations)} / ${fmt.num(r.total)} · ${fmt.num(r.visits)} visitas</b></div>`).join('')}</section>
    <section class="v2-card v2-dense"><h3>Primeiros passos por cliente</h3><p class="pl-note">Etapas observadas; equipa e integrações são opcionais.</p>${data.onboarding.length ? data.onboarding.map(o => `<div class="v2-row"><div><b>${fmt.link(fmt.orgHref(o.id), esc(o.name))}</b><p>${steps.map(([key,label]) => `${o[key] ? '✓' : '○'} ${label}`).join(' · ')}</p></div></div>`).join('') : fmt.empty('Ainda sem clientes.')}</section>`;
}

const page = {
  async render(ctx) {
    const [usage, detail] = await Promise.all([api.usage(DAYS), AppModules.core.apiGet('/api/platform/diagnostics').then(r => r.data)]);
    if (ctx.stale()) return;
    if (!usage) {
      ctx.host.innerHTML = `<div class="pl-page"><div class="v2-card v2-dense">${fmt.empty('A utilização ainda não está disponível.', 'bar-chart-2')}</div></div>`;
      return;
    }
    const views = (Array.isArray(usage.views) ? usage.views : []).filter(v => Number(v.count) > 0).slice(0, 10);
    const sizes = usage.team?.sizes || [];
    const sizeRows = ['1', '2-3', '4-6', '7+'].map(bucket => ({ bucket, value: Number(sizes.find(s => s.bucket === bucket)?.organizations) || 0 }));
    ctx.host.innerHTML = `<div class="pl-page">
      ${detailHtml(detail)}
      <p class="pl-lead">Últimos ${DAYS} dias, todas as organizações.</p>
      <div class="pl-charts pl-charts-3">
        ${donut('Browsers', charts.topN(usage.browsers, 'sessions', 5))}
        ${donut('Sistemas', charts.topN(usage.os, 'sessions', 5))}
        ${donut('Dispositivos', pairs(usage.devices, fmt.DEVICES))}
        <div class="pl-col">${donut('App ou browser', pairs(usage.display, fmt.DISPLAY))}
          <p class="pl-note">Sem informação: sessões anteriores à recolha ou sem envio.</p></div>
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
