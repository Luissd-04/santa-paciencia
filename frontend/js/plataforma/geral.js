// Consola da plataforma: Visão geral. Números, quatro gráficos de 12 semanas,
// feed de incidentes e organizações recentes.
(() => {
AppModules.define('consola', {
  geral: { get: () => page },
});

const fmt = AppModules.consola.fmt;
const api = AppModules.consola.api;
const charts = AppModules.consola.charts;
const { esc, num } = fmt;
const RECENT = 6;

function tile(label, value, sub, href) {
  const inner = `<small>${esc(label)}</small><strong>${num(value)}</strong><span>${esc(sub)}</span>`;
  return href ? fmt.link(href, inner, 'v2-card v2-kpi pl-tile') : `<div class="v2-card v2-kpi pl-tile pl-static">${inner}</div>`;
}

function feedRow(item) {
  const names = (item.organizations || []).map(o => o.name).filter(Boolean);
  const where = names.length ? ` · ${names.slice(0, 2).join(', ')}${names.length > 2 ? ` e mais ${names.length - 2}` : ''}` : '';
  return `<div class="v2-row pl-feed">
    <span class="v2-row-text"><b>${esc(fmt.providerLabel(item.provider))}</b><span>${esc(item.detail || item.title || '')}${esc(where)}</span></span>
    ${fmt.chip('bad', 'Incidente')}<span class="pl-since">${esc(fmt.since(item.since))}</span></div>`;
}

function recentRow(org) {
  return fmt.link(fmt.orgHref(org.id), `<span class="v2-row-text"><b>${esc(org.name)}</b><span>${esc(org.slug || '')} · ${esc(fmt.relativo(org.created_at, 'sem data'))}</span></span>
    ${fmt.stateHtml(org)}<span class="pl-go" aria-hidden="true">${fmt.icon('chevron-right', 16)}</span>`, 'v2-row pl-link-row');
}

function ticketRow(t) {
  const org = t.organization?.name || 'Sem organização';
  return fmt.link(`/plataforma/suporte/${encodeURIComponent(t.id)}`, `<span class="v2-row-text"><b>${esc(t.subject)}</b><span>${esc(t.number)} · ${esc(org)} · ${esc(fmt.relativo(t.last_message_at || t.created_at, 'sem data'))}</span></span>
    ${t.unread ? '<span class="pl-unread" title="Por ler"></span>' : ''}${fmt.chip(fmt.TICKET_STATUS[t.status]?.tone || 'neutral', fmt.TICKET_STATUS[t.status]?.label || String(t.status || ''))}`, 'v2-row pl-link-row');
}

function trendCards(trends) {
  const labels = (trends?.weeks || []).map(fmt.weekLabel);
  const since = trends?.collecting_since;
  const note = since ? `A recolher dados desde ${fmt.dateLong(since)}.` : 'A recolher dados.';
  const series = key => (Array.isArray(trends?.[key]) ? trends[key] : []);
  const spec = (title, key, kind, tone) => ({ title, sub: 'Últimas 12 semanas', kind, labels, datasets: [{ label: title, data: series(key), tone }], emptyText: note });
  return [
    spec('Reservas criadas', 'reservations_created', 'bar', 'primary'),
    spec('Organizações ativas', 'active_organizations', 'line', 'primary'),
    spec('Utilizadores ativos', 'active_users', 'line', 'violet'),
    spec('Incidentes abertos', 'incidents_open', 'line', 'bad'),
  ].map(charts.card).join('');
}

const page = {
  async render(ctx) {
    const [overview, orgs, incidents, trends, support] = await Promise.all([api.overview(), api.orgs(), api.incidents(), api.trends(12),
      // O Suporte não pode partir a visão geral: só o desbloqueio sobe à moldura.
      api.supportTickets().catch(error => { if (error?.status === 423 || error?.status === 401) throw error; return null; })]);
    if (ctx.stale()) return;
    const feed = [...incidents.incidents, ...incidents.instance.map(i => ({ ...i, provider: 'instance' }))];
    const recent = [...orgs].sort((a, b) => (fmt.parseDate(b.created_at)?.getTime() || 0) - (fmt.parseDate(a.created_at)?.getTime() || 0)).slice(0, RECENT);
    const latest = (support?.tickets || []).filter(t => t.status !== 'resolved')
      .sort((a, b) => (fmt.parseDate(b.last_message_at || b.created_at)?.getTime() || 0) - (fmt.parseDate(a.last_message_at || a.created_at)?.getTime() || 0)).slice(0, 5);
    ctx.host.innerHTML = `<div class="pl-page">
      <div class="v2-kpis">
        ${tile('Organizações', overview.organizations, 'na plataforma', '/plataforma/clientes')}
        ${tile('Incidentes ativos', overview.active_incidents, 'por resolver', '/plataforma/incidentes')}
        ${tile('Pedidos abertos', overview.open_requests, 'à espera de resposta', '/plataforma/suporte')}
        ${tile('Inativos há 14+ dias', overview.inactive_14d, 'organizações sem atividade', '/plataforma/clientes')}
      </div>
      <div class="pl-charts">${trendCards(trends)}</div>
      <div class="pl-three">
        <div class="v2-card v2-dense"><div class="v2-card-h"><h3>Feed de incidentes</h3>${fmt.link('/plataforma/incidentes', 'Ver todos', 'v2-link')}</div>
          ${feed.length ? feed.slice(0, 8).map(feedRow).join('') : fmt.empty('Sem incidentes ativos.', 'check-circle')}</div>
        <div class="v2-card v2-dense"><div class="v2-card-h"><h3>Organizações recentes</h3>${fmt.link('/plataforma/clientes', 'Ver todas', 'v2-link')}</div>
          ${recent.length ? recent.map(recentRow).join('') : fmt.empty('Ainda sem organizações.')}</div>
        <div class="v2-card v2-dense"><div class="v2-card-h"><h3>Últimos pedidos</h3>${fmt.link('/plataforma/suporte', 'Ver todos', 'v2-link')}</div>
          ${latest.length ? latest.map(ticketRow).join('') : fmt.empty(support ? 'Sem pedidos por resolver.' : 'Ainda sem pedidos.', 'inbox')}</div>
      </div></div>`;
    charts.flush(ctx.host);
  },
};
})();
