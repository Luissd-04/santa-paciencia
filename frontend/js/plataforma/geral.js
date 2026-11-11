// Consola da plataforma: Visão geral. «Precisa de atenção», números, saúde dos
// clientes, quatro gráficos de 12 semanas, feed de incidentes e organizações recentes.
(() => {
AppModules.define('consola', {
  geral: { get: () => page },
});

const fmt = AppModules.consola.fmt;
const api = AppModules.consola.api;
const charts = AppModules.consola.charts;
const { esc, num } = fmt;
const RECENT = 6;
const HEALTH_ROWS = 8;
const MINUTE = 60000;
const RISK = { high: ['bad', 'Alto'], medium: ['warn', 'Médio'], low: ['ok', 'Baixo'] };
const ATT_TAG = { support: 'Suporte', incident: 'Incidente', risk: 'Risco', instance: 'Instância', tasks: 'Tarefas' };
const ATT_CTA = { support: 'Responder', incident: 'Ver incidente', risk: 'Ver cliente', instance: 'Ver', tasks: 'Abrir' };
const live = { ctx: null, at: 0, busy: false, timer: 0 };

// Secções novas: um erro não parte a visão geral; só o desbloqueio (423) e a sessão (401) sobem à moldura.
const optional = promise => promise.catch(error => { if (error?.status === 423 || error?.status === 401) throw error; return null; });

function tile(label, value, sub, href, preset = '') {
  const shown = typeof value === 'string' ? esc(value) : num(value);
  const inner = `<small>${esc(label)}</small><strong>${shown}</strong><span>${esc(sub)}</span>`;
  if (!href) return `<div class="v2-card v2-kpi pl-tile pl-static">${inner}</div>`;
  const anchor = fmt.link(href, inner, 'v2-card v2-kpi pl-tile');
  // O filtro viaja num envoltório: a ação do envoltório corre depois da navegação (pl-ir), antes de a lista desenhar.
  return preset ? `<div class="pl-tile-wrap" ${AppActions.attrs('click', 'pl-geral-filtro', [preset])}>${anchor}</div>` : anchor;
}

function hoursText(hours) {
  if (hours === null || hours === undefined) return 'Ainda sem respostas';
  if (hours < 1) return `1.ª resposta em média: ${Math.max(1, Math.round(hours * 60))} min`;
  return `1.ª resposta em média: ${hours.toLocaleString('pt-PT', { maximumFractionDigits: 1 })} h`;
}

function attentionHtml(items) {
  const rows = items.map(a => `<div class="pl-att-row">
      <span class="pl-att-tag v2-chip ${['ok', 'warn', 'bad', 'info', 'violet', 'neutral'].includes(a.tone) ? a.tone : 'neutral'}">${esc(ATT_TAG[a.kind] || 'Aviso')}</span>
      <span class="pl-att-text"><b>${esc(a.title)}</b><span>${esc(a.detail)}</span></span>
      ${fmt.link(String(a.href || '/plataforma'), esc(ATT_CTA[a.kind] || 'Abrir'), 'v2-btn sm pl-att-cta')}</div>`).join('');
  return `<section class="v2-card" aria-labelledby="pl-att-h"><div class="v2-card-h"><h3 id="pl-att-h">Precisa de atenção</h3>
    ${items.length ? fmt.chip('warn', `${items.length} ${items.length === 1 ? 'item' : 'itens'}`) : fmt.chip('ok', 'Tudo em ordem')}</div>
    ${rows || fmt.empty('Nada por tratar neste momento.', 'check-circle')}</section>`;
}

function trendText(f) {
  const t = f?.reservations_trend;
  if (t === null || t === undefined) return f?.reservations_4w ? `${num(f.reservations_4w)} novas` : '—';
  return `${t > 0 ? '+' : t < 0 ? '−' : ''}${Math.abs(t)}%`;
}

const meter = (score, risk) => `<span class="pl-meter-wrap"><progress class="pl-meter pl-${esc(risk)}" max="100" value="${Number(score) || 0}" aria-label="Saúde ${Number(score) || 0} em 100"></progress><b class="pl-score">${Number(score) || 0}</b></span>`;

function healthHtml(health, orgs) {
  const byId = new Map(orgs.map(o => [String(o.id), o]));
  const order = { high: 0, medium: 1, low: 2 };
  const rows = health.filter(h => byId.has(String(h.organization_id)))
    .sort((a, b) => order[a.risk] - order[b.risk] || a.score - b.score).slice(0, HEALTH_ROWS);
  const body = rows.map(h => {
    const org = byId.get(String(h.organization_id));
    const [tone, label] = RISK[h.risk] || RISK.low;
    const plan = org.plan?.name || (typeof org.plan === 'string' ? org.plan : '') || 'Sem pacote';
    const members = Number(org.members) || 0;
    return fmt.link(fmt.orgHref(org.id), `<span class="pl-hs-name"><b>${esc(org.name)}</b><span>${esc(plan)} · ${num(members)} ${members === 1 ? 'pessoa' : 'pessoas'}</span></span>
      ${meter(h.score, h.risk)}<span class="pl-hs-trend pl-num">${esc(trendText(h.factors))}</span>
      <span class="pl-hs-last pl-muted">${esc(fmt.relativo(org.last_activity_at))}</span>
      <span class="pl-hs-risk">${fmt.chip(tone, label)}</span>`, 'pl-hs-row');
  }).join('');
  return `<section class="v2-card" aria-labelledby="pl-hs-h"><div class="v2-card-h"><h3 id="pl-hs-h">Saúde dos clientes</h3><span class="pl-muted">Ordenado por risco</span></div>
    ${body ? `<div class="pl-hs"><div class="pl-hs-row pl-hs-head"><span>Cliente</span><span>Saúde</span><span>Reservas (4 sem.)</span><span>Último acesso</span><span>Risco</span></div>${body}</div>
      <p class="pl-note pl-hs-foot">A saúde junta dias com atividade, tendência de reservas, integrações ligadas, problemas abertos e pedidos por resolver. ${fmt.link('/plataforma/clientes', 'Ver todos os clientes', 'v2-link')}</p>`
    : fmt.empty('Ainda sem clientes para avaliar.', 'heart-pulse')}</section>`;
}

function refreshBarHtml() {
  return `<div class="pl-refresh"><span class="pl-muted" id="pl-geral-quando" aria-live="off">${esc(updatedText())}</span>
    <button type="button" class="v2-btn sm" id="pl-geral-atualizar"${live.busy ? ' disabled' : ''} ${AppActions.attrs('click', 'pl-geral-atualizar')}>Atualizar</button></div>`;
}

function updatedText() {
  const minutes = Math.max(0, Math.floor((Date.now() - live.at) / MINUTE));
  return minutes < 1 ? 'Atualizado agora mesmo' : `Atualizado há ${minutes} min`;
}

function startClock() {
  clearInterval(live.timer);
  live.timer = setInterval(() => {
    const el = document.getElementById('pl-geral-quando');
    if (!el || !live.ctx || live.ctx.stale()) { clearInterval(live.timer); return; }
    el.textContent = updatedText();
  }, 30000);
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
    live.ctx = ctx;
    const [overview, orgs, incidents, trends, support, health, attention, stats] = await Promise.all([api.overview(), api.orgs(), api.incidents(), api.trends(12),
      // O Suporte não pode partir a visão geral: só o desbloqueio sobe à moldura.
      optional(api.supportTickets()), optional(api.health()), optional(api.attention()), optional(api.supportStats())]);
    if (ctx.stale()) return;
    live.at = Date.now();
    live.busy = false;
    const feed = [...incidents.incidents, ...incidents.instance.map(i => ({ ...i, provider: 'instance' }))];
    const recent = [...orgs].sort((a, b) => (fmt.parseDate(b.created_at)?.getTime() || 0) - (fmt.parseDate(a.created_at)?.getTime() || 0)).slice(0, RECENT);
    const latest = (support?.tickets || []).filter(t => t.status !== 'resolved')
      .sort((a, b) => (fmt.parseDate(b.last_message_at || b.created_at)?.getTime() || 0) - (fmt.parseDate(a.last_message_at || a.created_at)?.getTime() || 0)).slice(0, 5);
    const weekAgo = Date.now() - 7 * 86400000;
    const active7 = orgs.filter(o => (fmt.parseDate(o.last_activity_at)?.getTime() || 0) >= weekAgo).length;
    const scores = (health || []).map(h => Number(h.score) || 0);
    const average = scores.length ? Math.round(scores.reduce((sum, v) => sum + v, 0) / scores.length) : null;
    const atRisk = (health || []).filter(h => h.risk === 'high').length;
    const providers = [...new Set(feed.map(i => fmt.providerLabel(i.provider)))];
    charts.disposeAll();
    ctx.host.innerHTML = `<div class="pl-page">
      ${refreshBarHtml()}
      ${attention ? attentionHtml(attention) : ''}
      <div class="v2-kpis pl-kpis-5">
        ${tile('Clientes ativos (7 dias)', `${num(active7)} / ${num(orgs.length)}`, 'organizações com acesso na semana', '/plataforma/clientes')}
        ${tile('Saúde média', average === null ? '—' : average, average === null ? 'sem dados ainda' : `${num(atRisk)} ${atRisk === 1 ? 'cliente em risco' : 'clientes em risco'}`, '/plataforma/clientes', 'risk')}
        ${tile('Pedidos por resolver', overview.open_requests, hoursText(stats?.avg_first_response_hours), '/plataforma/suporte')}
        ${tile('Incidentes ativos', overview.active_incidents, providers.length ? providers.slice(0, 3).join(' · ') : 'sem incidentes', '/plataforma/incidentes')}
        ${tile('Inativos há 14+ dias', overview.inactive_14d, 'organizações sem atividade', '/plataforma/clientes', 'inactive')}
      </div>
      ${healthHtml(health || [], orgs)}
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
    if (window.lucide) lucide.createIcons();
    startClock();
  },
};

// «Atualizar»: apaga a memória do api.js e desenha a página outra vez, no sítio.
async function reload() {
  const ctx = live.ctx;
  if (!ctx || live.busy || ctx.stale()) return;
  live.busy = true;
  const button = document.getElementById('pl-geral-atualizar');
  if (button) button.disabled = true;
  try {
    api.reset();
    await page.render(ctx);
  } catch (error) {
    live.busy = false;
    if (ctx.stale()) return;
    AppModules.core.toast('Não foi possível atualizar. Tente novamente.', 'error');
    const again = document.getElementById('pl-geral-atualizar');
    if (again) again.disabled = false;
  }
}

AppActions.register({
  'pl-geral-atualizar': () => reload(),
  // Deixa a lista de clientes já filtrada (risco ou inativos). Ignora cliques para novo separador.
  'pl-geral-filtro': (el, event, [preset]) => {
    if (event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    AppModules.consola.clientes.preset = preset;
  },
}, 'click');
})();
