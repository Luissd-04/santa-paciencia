// Consola da plataforma: lista de clientes (organizações), com pesquisa e
// filtro por estado. Cada linha abre a página do cliente.
(() => {
AppModules.define('consola', {
  clientes: { get: () => page },
});

const fmt = AppModules.consola.fmt;
const api = AppModules.consola.api;
const { esc, num } = fmt;
const state = { orgs: [], search: '', filter: '' };

function filtered() {
  const term = state.search.trim().toLowerCase();
  return state.orgs.filter(org => (!state.filter || org.status === state.filter)
    && (!term || `${org.name} ${org.slug || ''}`.toLowerCase().includes(term)));
}

function rowHtml(org) {
  const problems = Number(org.open_problems) || 0;
  const accommodations = Number(org.accommodations) || 0;
  const reservations = Number(org.reservations_30d) || 0;
  const members = Number(org.members) || 0;
  const last = fmt.relativo(org.last_activity_at);
  const s = fmt.statusOf(org);
  return fmt.link(fmt.orgHref(org.id), `
    <span class="v2-row-text"><b>${esc(org.name)}</b><span>${esc(org.slug || '')}</span></span>
    ${fmt.stateHtml(org)}
    <span class="pl-num">${num(members)}</span>
    <span class="pl-muted">${esc(last)}</span>
    <span class="pl-num">${num(accommodations)}</span>
    <span class="pl-num">${num(reservations)}</span>
    ${fmt.integrationsHtml(org)}
    <span class="pl-prob">${problems ? fmt.chip('bad', String(problems)) : fmt.chip('ok', '0')}</span>
    <span class="pl-sub-line">${esc(s.label)} · ${num(members)} ${members === 1 ? 'pessoa' : 'pessoas'} · ${esc(last)} · ${num(accommodations)} alojamento${accommodations === 1 ? '' : 's'} · ${num(reservations)} reserva${reservations === 1 ? '' : 's'} em 30 dias</span>`, 'v2-row pl-row pl-client');
}

function listHtml() {
  const rows = filtered();
  if (!rows.length) return fmt.empty(state.orgs.length ? 'Nenhuma organização corresponde.' : 'Ainda sem organizações.');
  return `<div class="pl-table"><div class="pl-th pl-client"><span>Organização</span><span>Estado</span><span>Equipa</span><span>Último acesso</span><span>Alojamentos</span><span>Reservas 30 dias</span><span>Integrações</span><span>Problemas</span></div>
    ${rows.map(rowHtml).join('')}</div>`;
}

function pillsHtml() {
  const count = key => state.orgs.filter(o => o.status === key).length;
  const filters = [['', 'Todas', state.orgs.length], ...Object.entries(fmt.STATUS).map(([key, s]) => [key, s.label, count(key)])];
  return filters.map(([key, label, n]) => `<button type="button" aria-pressed="${state.filter === key}" ${AppActions.attrs('click', 'pl-cli-filtro', [key])}>${esc(label)} <em>${n}</em></button>`).join('');
}

function refresh() {
  const list = document.getElementById('pl-lista');
  if (list) list.innerHTML = listHtml();
  const pills = document.getElementById('pl-filtros');
  if (pills) pills.innerHTML = pillsHtml();
  if (window.lucide) lucide.createIcons();
}

const page = {
  async render(ctx) {
    state.orgs = await api.orgs();
    if (ctx.stale()) return;
    ctx.host.innerHTML = `<div class="pl-page">
      <div class="pl-toolbar">
        <div class="search-box pl-search"><i data-lucide="search"></i>
          <input type="search" id="pl-pesquisa" value="${esc(state.search)}" placeholder="Pesquisar organização…" autocomplete="off" aria-label="Pesquisar organização" ${AppActions.attrs('input', 'pl-cli-pesquisa')}></div>
        <div class="pl-pills" id="pl-filtros" role="group" aria-label="Filtrar por estado">${pillsHtml()}</div>
      </div>
      <div class="v2-card v2-dense" id="pl-lista">${listHtml()}</div></div>`;
  },
};

AppActions.register({
  'pl-cli-filtro': (el, event, [key]) => { state.filter = key; refresh(); },
}, 'click');
AppActions.register({
  'pl-cli-pesquisa': el => {
    state.search = el.value;
    const list = document.getElementById('pl-lista');
    if (list) list.innerHTML = listHtml();
  },
}, 'input');
})();
