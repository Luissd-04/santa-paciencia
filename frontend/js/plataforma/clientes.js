// Consola da plataforma: lista de clientes (organizações), com pesquisa, filtro
// por estado, filtro «Em risco» / «Inativos 14+ dias» e ordenação por saúde.
// Cada linha abre a página do cliente.
(() => {
AppModules.define('consola', {
  clientes: { get: () => page },
});

const fmt = AppModules.consola.fmt;
const api = AppModules.consola.api;
const { esc, num } = fmt;
const INACTIVE_MS = 14 * 86400000;
const RISK = { high: ['bad', 'Alto'], medium: ['warn', 'Médio'], low: ['ok', 'Baixo'] };
const state = { orgs: [], health: new Map(), search: '', filter: '', extra: '', sort: '', plans: [], draft: null, created: null, busy: false };

// `plan` é {id, name} ou null; aceita também o texto antigo.
const planName = org => (org.plan && typeof org.plan === 'object' ? org.plan.name : org.plan) || '';
const isInactive = org => { const at = fmt.parseDate(org.last_activity_at)?.getTime(); return !at || at <= Date.now() - INACTIVE_MS; };
const healthOf = org => state.health.get(String(org.id)) || null;

const EXTRA = { risk: org => healthOf(org)?.risk === 'high', inactive: isInactive };

function filtered() {
  const term = state.search.trim().toLowerCase();
  const rows = state.orgs.filter(org => (!state.filter || org.status === state.filter)
    && (!state.extra || EXTRA[state.extra](org))
    && (!term || `${org.name} ${org.slug || ''}`.toLowerCase().includes(term)));
  // Saúde: pior primeiro; quem não tem pontuação fica no fim.
  if (state.sort === 'health') rows.sort((a, b) => (healthOf(a)?.score ?? 101) - (healthOf(b)?.score ?? 101) || String(a.name).localeCompare(String(b.name), 'pt'));
  return rows;
}

function healthCell(org) {
  const h = healthOf(org);
  if (!h) return '<span class="pl-health pl-muted">—</span>';
  const label = (RISK[h.risk] || RISK.low)[1].toLowerCase();
  const score = Number(h.score) || 0;
  return `<span class="pl-health" title="Risco ${esc(label)}"><span class="pl-meter-wrap"><progress class="pl-meter pl-${esc(h.risk)}" max="100" value="${score}" aria-label="Saúde ${score} em 100, risco ${esc(label)}"></progress><b class="pl-score">${score}</b></span></span>`;
}

function rowHtml(org) {
  const problems = Number(org.open_problems) || 0;
  const accommodations = Number(org.accommodations) || 0;
  const reservations = Number(org.reservations_30d) || 0;
  const members = Number(org.members) || 0;
  const last = fmt.relativo(org.last_activity_at);
  const s = fmt.statusOf(org);
  const plan = planName(org);
  return fmt.link(fmt.orgHref(org.id), `
    <span class="v2-row-text"><b>${esc(org.name)}</b><span>${esc(org.slug || '')}</span></span>
    <span class="pl-plan${plan ? '' : ' pl-plan-none'}">${esc(plan || 'Sem pacote')}</span>
    ${fmt.stateHtml(org)}
    <span class="pl-num">${num(members)}</span>
    <span class="pl-muted">${esc(last)}</span>
    <span class="pl-num">${num(accommodations)}</span>
    <span class="pl-num">${num(reservations)}</span>
    ${fmt.integrationsHtml(org)}
    ${healthCell(org)}
    <span class="pl-prob">${problems ? fmt.chip('bad', String(problems)) : fmt.chip('ok', '0')}</span>
    <span class="pl-sub-line">${esc(s.label)} · ${esc(plan || 'Sem pacote')} · ${num(members)} ${members === 1 ? 'pessoa' : 'pessoas'} · ${esc(last)} · ${num(accommodations)} alojamento${accommodations === 1 ? '' : 's'} · ${num(reservations)} reserva${reservations === 1 ? '' : 's'} em 30 dias${problems ? ` · ${num(problems)} ${problems === 1 ? 'problema' : 'problemas'}` : ''}</span>`, 'v2-row pl-row pl-client pl-client-h');
}

function listHtml() {
  const rows = filtered();
  if (!rows.length) return fmt.empty(state.orgs.length ? 'Nenhuma organização corresponde.' : 'Ainda sem organizações.');
  return `<div class="pl-table"><div class="pl-th pl-client pl-client-h"><span>Organização</span><span>Pacote</span><span>Estado</span><span>Equipa</span><span>Último acesso</span><span>Alojamentos</span><span>Reservas 30 dias</span><span>Integrações</span><span>Saúde</span><span>Problemas</span></div>
    ${rows.map(rowHtml).join('')}</div>`;
}

function pillsHtml() {
  const count = key => state.orgs.filter(o => o.status === key).length;
  const filters = [['', 'Todas', state.orgs.length], ...Object.entries(fmt.STATUS).map(([key, s]) => [key, s.label, count(key)])];
  return filters.map(([key, label, n]) => `<button type="button" aria-pressed="${state.filter === key}" ${AppActions.attrs('click', 'pl-cli-filtro', [key])}>${esc(label)} <em>${n}</em></button>`).join('');
}

function extraHtml() {
  const risk = state.orgs.filter(EXTRA.risk).length;
  const inactive = state.orgs.filter(EXTRA.inactive).length;
  const items = [['risk', 'Em risco', risk], ['inactive', 'Inativos 14+ dias', inactive]];
  return items.map(([key, label, n]) => `<button type="button" aria-pressed="${state.extra === key}" ${AppActions.attrs('click', 'pl-cli-extra', [key])}>${esc(label)} <em>${n}</em></button>`).join('');
}

function refresh() {
  const list = document.getElementById('pl-lista');
  if (list) list.innerHTML = listHtml();
  const pills = document.getElementById('pl-filtros');
  if (pills) pills.innerHTML = pillsHtml();
  const extra = document.getElementById('pl-filtros-extra');
  if (extra) extra.innerHTML = extraHtml();
  if (window.lucide) lucide.createIcons();
}

function creationHtml() {
  if (!AppModules.consola.canManage) return '';
  if (state.created) return `<section class="v2-card v2-dense"><h3>Estabelecimento criado</h3><p>Partilhe este convite com o proprietário. É válido durante 7 dias; o envio não é automático.</p><label class="pl-label" for="pl-cli-convite">Ligação de convite</label><input class="form-control" id="pl-cli-convite" readonly value="${esc(new URL(state.created.invitation_url, location.origin).href)}"><p>${fmt.link(fmt.orgHref(state.created.id), 'Abrir ficha do estabelecimento', 'btn btn-ghost')}</p><button type="button" class="btn btn-ghost" ${AppActions.attrs('click', 'pl-cli-fechar')}>Fechar</button></section>`;
  if (!state.draft) return `<button type="button" class="btn btn-primary" ${AppActions.attrs('click', 'pl-cli-novo')}>Novo estabelecimento</button>`;
  const d = state.draft;
  return `<form class="v2-card v2-dense" ${AppActions.attrs('submit', 'pl-cli-criar')}>
    <h3>Novo estabelecimento</h3><p>Cria um novo cliente, com espaço próprio e convite para o proprietário.</p>
    <div class="pl-pac-grid">
      <div><label class="pl-label" for="pl-cli-nome">Nome do estabelecimento</label><input class="form-control" id="pl-cli-nome" name="name" required maxlength="120" value="${esc(d.name)}" ${AppActions.attrs('input', 'pl-cli-campo', ['name'])}></div>
      <div><label class="pl-label" for="pl-cli-email">Email do proprietário</label><input class="form-control" id="pl-cli-email" name="owner_email" type="email" required maxlength="254" value="${esc(d.owner_email)}" ${AppActions.attrs('input', 'pl-cli-campo', ['owner_email'])}></div>
      <div><label class="pl-label" for="pl-cli-pacote">Pacote</label><select class="form-control" id="pl-cli-pacote" name="plan_id" ${AppActions.attrs('change', 'pl-cli-campo', ['plan_id'])}><option value="">Sem pacote</option>${state.plans.map(p => `<option value="${esc(p.id)}"${d.plan_id === p.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
      <div><label class="pl-label" for="pl-cli-estado">Estado inicial</label><select class="form-control" id="pl-cli-estado" name="status" ${AppActions.attrs('change', 'pl-cli-campo', ['status'])}><option value="trial"${d.status === 'trial' ? ' selected' : ''}>Em teste</option><option value="active"${d.status === 'active' ? ' selected' : ''}>Ativo</option></select></div>
    </div><p class="pl-error" id="pl-cli-erro" role="alert"></p>
    <button type="submit" class="btn btn-primary"${state.busy ? ' disabled' : ''}>Criar e gerar convite</button>
    <button type="button" class="btn btn-ghost"${state.busy ? ' disabled' : ''} ${AppActions.attrs('click', 'pl-cli-fechar')}>Cancelar</button></form>`;
}
function paintCreation() { const el = document.getElementById('pl-cli-editor'); if (el) el.innerHTML = creationHtml(); }
async function createClient(form) {
  if (state.busy || !state.draft) return;
  state.busy = true;
  form.querySelectorAll('button').forEach(b => { b.disabled = true; });
  try {
    state.created = await api.createOrg({ ...state.draft });
    state.draft = null;
    paintCreation();
    state.orgs = await api.orgs(); refresh();
  } catch (error) {
    if (error?.status === 423) { AppModules.consola.mostrarBloqueio(); return; }
    const el = document.getElementById('pl-cli-erro'); if (el) el.textContent = error?.payload?.error || 'Não foi possível criar o estabelecimento.';
  } finally { state.busy = false; form.querySelectorAll('button').forEach(b => { b.disabled = false; }); }
}

const page = {
  async render(ctx) {
    const [orgs, plans, health] = await Promise.all([api.orgs(), AppModules.core.apiGet('/api/platform/plans').then(r => r.data || []),
      // A saúde é um extra: se falhar, a lista mostra «—». Só o desbloqueio (423) e a sessão (401) sobem.
      api.health().catch(error => { if (error?.status === 423 || error?.status === 401) throw error; return []; })]);
    if (ctx.stale()) return;
    state.orgs = orgs;
    state.plans = plans;
    state.health = new Map(health.map(h => [String(h.organization_id), h]));
    // Vindo da visão geral: abre já filtrada (uma só vez).
    if (page.preset) { state.extra = EXTRA[page.preset] ? page.preset : ''; state.sort = page.preset === 'risk' ? 'health' : state.sort; state.filter = ''; state.search = ''; page.preset = ''; }
    ctx.host.innerHTML = `<div class="pl-page">
      <div id="pl-cli-editor">${creationHtml()}</div>
      <div class="pl-toolbar">
        <div class="search-box pl-search"><i data-lucide="search"></i>
          <input type="search" id="pl-pesquisa" value="${esc(state.search)}" placeholder="Pesquisar organização…" autocomplete="off" aria-label="Pesquisar organização" ${AppActions.attrs('input', 'pl-cli-pesquisa')}></div>
        <div class="pl-pills" id="pl-filtros" role="group" aria-label="Filtrar por estado">${pillsHtml()}</div>
        <div class="pl-filters">
          <div class="pl-pills" id="pl-filtros-extra" role="group" aria-label="Filtrar por saúde e atividade">${extraHtml()}</div>
          <label class="pl-sort"><span>Ordenar por</span>
            <select class="form-control" id="pl-ordem" ${AppActions.attrs('change', 'pl-cli-ordem')}>
              <option value=""${state.sort ? '' : ' selected'}>Nome</option>
              <option value="health"${state.sort === 'health' ? ' selected' : ''}>Saúde (pior primeiro)</option></select></label>
        </div>
      </div>
      <div class="v2-card v2-dense" id="pl-lista">${listHtml()}</div></div>`;
  },
};

AppActions.register({
  'pl-cli-novo': () => { state.created = null; state.draft = { name: '', owner_email: '', plan_id: '', status: 'trial' }; paintCreation(); document.getElementById('pl-cli-nome')?.focus(); },
  'pl-cli-fechar': () => { if (state.busy) return; state.draft = null; state.created = null; paintCreation(); },
  'pl-cli-filtro': (el, event, [key]) => { state.filter = key; refresh(); },
  // Carregar outra vez no mesmo botão tira o filtro.
  'pl-cli-extra': (el, event, [key]) => { state.extra = state.extra === key ? '' : key; refresh(); },
}, 'click');
AppActions.register({
  'pl-cli-campo': (el, event, [key]) => { if (state.draft) state.draft[key] = el.value; },
  'pl-cli-ordem': el => { state.sort = el.value === 'health' ? 'health' : ''; refresh(); },
}, 'change');
AppActions.register({
  'pl-cli-campo': (el, event, [key]) => { if (state.draft) state.draft[key] = el.value; },
  'pl-cli-pesquisa': el => {
    state.search = el.value;
    const list = document.getElementById('pl-lista');
    if (list) list.innerHTML = listHtml();
  },
}, 'input');
AppActions.register({ 'pl-cli-criar': (form, event) => { event.preventDefault(); return createClient(form); } }, 'submit');
})();
