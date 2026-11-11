// Consola da plataforma (V2): só para quem administra a plataforma. Visão geral
// (números, organizações e incidentes), Clientes (lista completa e ficha numa
// folha lateral) e Incidentes (por fornecedor, mais a instância). Os dados vêm
// de /api/platform/*; o servidor pede a palavra-passe outra vez (423) antes de
// responder, e sem permissão devolve 404.
(() => {
AppModules.define('plataforma', {
  loadPlataforma: { get: () => loadPlataforma },
});

const core = () => AppModules.core;
const esc = value => core().escapeHtml(value);
const icon = (name, size = 16) => core().lcIcon(name, size);

const TABS = [['geral', 'Visão geral'], ['clientes', 'Clientes'], ['incidentes', 'Incidentes']];
const STATUS = {
  active: { label: 'Ativa', tone: 'ok' },
  trial: { label: 'Teste', tone: 'warn' },
  suspended: { label: 'Suspensa', tone: 'bad' },
};
const INTEGRATIONS = [['google', 'Google'], ['gmail', 'Gmail'], ['stripe', 'Stripe']];
const INTEGRATION_STATE = { ok: ['ok', 'ligado'], error: ['bad', 'com erro'], off: ['neutral', 'desligado'] };
const PROVIDERS = [['gmail', 'Gmail'], ['google_calendar', 'Google Calendar'], ['google_tasks', 'Google Tasks'], ['stripe', 'Stripe'], ['payments', 'Pagamentos']];
const PROVIDER_ALIASES = { calendar: 'google_calendar', gcal: 'google_calendar', tasks: 'google_tasks', pagamentos: 'payments', payment: 'payments', instance: 'instance' };
const OVERVIEW_ORGS = 6;

// status: loading | ready | locked | denied | empty | error
const state = { status: 'loading', tab: 'geral', overview: null, orgs: [], incidents: { incidents: [], instance: [] }, search: '', filter: '', unlockError: '', busy: false };
let loadToken = 0;
let redirectTimer = null;

const root = () => document.getElementById('pv2-root');
const num = value => (Number(value) || 0).toLocaleString('pt-PT');

// ── Formatação ──
function parseDate(value) {
  if (!value) return null;
  let text = String(value).trim();
  if (!text.includes('T')) text = text.replace(' ', 'T');
  if (!/(Z|[+-]\d\d:?\d\d)$/.test(text)) text += 'Z';
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function relativo(value, empty = 'Sem atividade') {
  const date = parseDate(value);
  if (!date) return empty;
  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return 'agora mesmo';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `há ${days} ${days === 1 ? 'dia' : 'dias'}`;
  const months = Math.round(days / 30);
  if (months < 12) return `há ${months} ${months === 1 ? 'mês' : 'meses'}`;
  const years = Math.round(days / 365);
  return `há ${years} ${years === 1 ? 'ano' : 'anos'}`;
}

function bytes(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let size = n;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return `${size.toLocaleString('pt-PT', { maximumFractionDigits: i < 2 ? 0 : 1 })} ${units[i]}`;
}

function duration(seconds) {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s < 0) return '—';
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  if (days) return `${days} d ${hours} h`;
  if (hours) return `${hours} h ${minutes} min`;
  return `${minutes} min`;
}

function providerKey(raw) {
  const key = String(raw || '').toLowerCase().replace(/[\s-]+/g, '_');
  return PROVIDER_ALIASES[key] || key;
}
function providerLabel(raw) {
  const key = providerKey(raw);
  if (key === 'instance') return 'Instância';
  return PROVIDERS.find(([k]) => k === key)?.[1] || String(raw || 'Outro');
}

const statusOf = org => STATUS[org.status] || { label: org.status || '—', tone: 'neutral' };
const since = value => { const text = relativo(value, '—'); return text === '—' ? text : text === 'agora mesmo' ? 'desde agora' : `desde ${text}`; };
const chip = (tone, text) => `<span class="v2-chip ${tone}">${esc(text)}</span>`;
const stateHtml = org => { const s = statusOf(org); return `<span class="pv2-state"><i class="v2-dot pv2-${s.tone}"></i>${esc(s.label)}</span>`; };
const planHtml = org => (org.plan ? chip('info', org.plan) : chip('neutral', 'Sem pacote'));

function integrationsHtml(org) {
  return `<span class="pv2-ints">${INTEGRATIONS.map(([key, label]) => {
    const [tone, text] = INTEGRATION_STATE[org.integrations?.[key]] || INTEGRATION_STATE.off;
    return `<span class="pv2-int is-${tone}" title="${esc(label)}: ${text}" aria-label="${esc(label)}: ${text}"><i class="v2-dot pv2-${tone}"></i>${esc(label)}</span>`;
  }).join('')}</span>`;
}

// ── Carregar ──
async function loadPlataforma() {
  const token = ++loadToken;
  clearTimeout(redirectTimer);
  state.status = 'loading';
  state.unlockError = '';
  render();
  try {
    const [overview, orgs, incidents] = await Promise.all([
      core().apiGet('/api/platform/overview'),
      core().apiGet('/api/platform/organizations'),
      core().apiGet('/api/platform/incidents'),
    ]);
    if (token !== loadToken) return;
    state.overview = overview?.data || {};
    state.orgs = Array.isArray(orgs?.data) ? orgs.data : [];
    state.incidents = {
      incidents: Array.isArray(incidents?.data?.incidents) ? incidents.data.incidents : [],
      instance: Array.isArray(incidents?.data?.instance) ? incidents.data.instance : [],
    };
    state.status = 'ready';
  } catch (error) {
    if (token !== loadToken) return;
    if (!applyError(error)) state.status = 'error';
  }
  render();
}

// Trata os erros que mudam o ecrã inteiro; devolve false para os outros.
function applyError(error) {
  if (error?.status === 423 && error.payload?.locked === true) { state.status = 'locked'; return true; }
  if (error?.status === 404) {
    state.status = 'denied';
    clearTimeout(redirectTimer);
    redirectTimer = setTimeout(() => {
      if (document.getElementById('view-plataforma')?.classList.contains('active')) core().showView('dashboard');
    }, 1800);
    return true;
  }
  if (error?.status === 501) { state.status = 'empty'; return true; }
  return false;
}

// ── Desenho ──
function render() {
  const host = root();
  if (!host) return;
  const head = `<header class="v2-head pv2-head"><h2>Operação da plataforma</h2><i class="pv2-rule" aria-hidden="true"></i></header>`;
  let body;
  if (state.status === 'loading') body = '<div class="loading" role="status">A carregar…</div>';
  else if (state.status === 'locked') body = unlockHtml();
  else if (state.status === 'denied') body = `<div class="v2-card pv2-notice"><h3>Sem acesso</h3><p class="v2-empty">Esta área é só para quem administra a plataforma. A voltar ao dashboard…</p></div>`;
  else if (state.status === 'empty') body = `<div class="v2-card pv2-notice"><p class="v2-empty">Ainda sem dados.</p></div>`;
  else if (state.status === 'error') body = `<div class="v2-card pv2-notice"><p class="v2-empty">Não foi possível carregar a consola.</p>
    <button type="button" class="btn btn-ghost btn-sm" ${AppActions.attrs('click', 'pv2-recarregar')}>Tentar novamente</button></div>`;
  else body = `${tabsHtml()}<div id="pv2-tab">${tabHtml()}</div>`;
  host.innerHTML = `<div class="v2-painel pv2-page">${head}${body}</div>`;
  if (window.lucide) lucide.createIcons();
  if (state.status === 'locked') host.querySelector('#pv2-pw')?.focus({ preventScroll: true });
}

function tabsHtml() {
  return `<div class="v2-pills pv2-tabs" role="group" aria-label="Secções">${TABS.map(([key, label]) => `<button type="button" aria-pressed="${state.tab === key}"
    ${AppActions.attrs('click', 'pv2-separador', [key])}>${label}</button>`).join('')}</div>`;
}

function tabHtml() {
  if (state.tab === 'clientes') return clientesHtml();
  if (state.tab === 'incidentes') return incidentesHtml();
  return geralHtml();
}

function renderTab() {
  const box = document.getElementById('pv2-tab');
  if (!box) return;
  box.innerHTML = tabHtml();
  if (window.lucide) lucide.createIcons();
}

// Desbloqueio
function unlockHtml() {
  return `<form class="v2-card pv2-unlock" ${AppActions.attrs('submit', 'pv2-desbloquear')} novalidate>
    <h3>Confirme a sua palavra-passe</h3>
    <p class="pv2-muted">Por segurança, confirme a palavra-passe para abrir a consola.</p>
    <label class="pv2-label" for="pv2-pw">Palavra-passe</label>
    <input class="form-control" type="password" id="pv2-pw" name="password" autocomplete="current-password" required>
    <p class="pv2-error" role="alert"${state.unlockError ? '' : ' hidden'}>${esc(state.unlockError)}</p>
    <button type="submit" class="btn btn-primary"${state.busy ? ' disabled' : ''}>Confirmar</button>
  </form>`;
}

// Visão geral
function kpi(label, value, sub, action) {
  const attrs = action ? `role="button" tabindex="0" ${core().KEY_ACTIVATE} ${AppActions.attrs('click', 'pv2-separador', [action])}` : '';
  return `<div class="v2-card v2-kpi${action ? '' : ' pv2-static'}" ${attrs}><small>${esc(label)}</small><strong>${num(value)}</strong><span>${esc(sub)}</span></div>`;
}

function allIncidents() {
  const instance = state.incidents.instance.map(i => ({ ...i, provider: 'instance' }));
  return [...state.incidents.incidents, ...instance];
}

function geralHtml() {
  const o = state.overview || {};
  const orgs = state.orgs.slice(0, OVERVIEW_ORGS);
  const feed = allIncidents();
  return `<div class="v2-kpis">
      ${kpi('Organizações', o.organizations, 'na plataforma', 'clientes')}
      ${kpi('Incidentes ativos', o.active_incidents, 'por resolver', 'incidentes')}
      ${kpi('Pedidos abertos', o.open_requests, 'à espera de resposta')}
      ${kpi('Inativos há 14 dias ou mais', o.inactive_14d, 'organizações sem atividade')}
    </div>
    <div class="v2-grid">
      <div class="v2-card v2-dense"><div class="v2-card-h"><h3>Organizações</h3>
        <button type="button" class="v2-link" ${AppActions.attrs('click', 'pv2-separador', ['clientes'])}>Ver todas</button></div>
        ${orgs.length ? `<div class="pv2-table pv2-orgs"><div class="pv2-th"><span>Organização</span><span>Pacote</span><span>Estado</span><span></span></div>${orgs.map(orgRowHtml).join('')}</div>`
          : '<p class="v2-empty">Ainda sem organizações.</p>'}</div>
      <div class="v2-card v2-dense"><div class="v2-card-h"><h3>Feed de incidentes</h3></div>
        ${feed.length ? feed.map(feedHtml).join('') : `<p class="v2-empty">${icon('check-circle', 16)} Sem incidentes ativos.</p>`}</div>
    </div>`;
}

function orgRowHtml(org) {
  return `<div class="v2-row v2-row-link pv2-org" role="button" tabindex="0" ${core().KEY_ACTIVATE} ${AppActions.attrs('click', 'pv2-abrir-org', [String(org.id)])}>
    <span class="v2-row-text"><b>${esc(org.name)}</b><span>${esc(org.slug || '')}</span></span>
    ${planHtml(org)}${stateHtml(org)}<span class="pv2-go" aria-hidden="true">${icon('chevron-right', 16)}</span></div>`;
}

function feedHtml(item) {
  const names = (item.organizations || []).map(o => o.name).filter(Boolean);
  const where = names.length ? ` · ${names.slice(0, 2).join(', ')}${names.length > 2 ? ` e mais ${names.length - 2}` : ''}` : '';
  return `<div class="v2-row pv2-feed">
    <span class="v2-row-text"><b>${esc(providerLabel(item.provider))}</b><span>${esc(item.detail || item.title || '')}${esc(where)}</span></span>
    ${chip('bad', 'Incidente')}<span class="pv2-since">${esc(since(item.since))}</span></div>`;
}

// Clientes
function filteredOrgs() {
  const term = state.search.trim().toLowerCase();
  return state.orgs.filter(org => (!state.filter || org.status === state.filter)
    && (!term || `${org.name} ${org.slug || ''}`.toLowerCase().includes(term)));
}

function clientesHtml() {
  const count = key => state.orgs.filter(o => o.status === key).length;
  const filters = [['', 'Todas', state.orgs.length], ...Object.entries(STATUS).map(([key, s]) => [key, s.label, count(key)])];
  return `<div class="pv2-toolbar">
      <div class="search-box pv2-search"><i data-lucide="search"></i>
        <input type="text" id="pv2-pesquisa" value="${esc(state.search)}" placeholder="Pesquisar organização…" autocomplete="off" aria-label="Pesquisar organização" ${AppActions.attrs('input', 'pv2-pesquisa')}></div>
      <div class="v2-pills" role="group" aria-label="Filtrar por estado">${filters.map(([key, label, n]) => `<button type="button" aria-pressed="${state.filter === key}"
        ${AppActions.attrs('click', 'pv2-filtro', [key])}>${esc(label)} <em>${n}</em></button>`).join('')}</div>
    </div>
    <div class="v2-card v2-dense" id="pv2-lista">${clientesLista()}</div>`;
}

function clientesLista() {
  const rows = filteredOrgs();
  if (!rows.length) return `<p class="v2-empty">${state.orgs.length ? 'Nenhuma organização corresponde.' : 'Ainda sem organizações.'}</p>`;
  return `<div class="pv2-table pv2-clients"><div class="pv2-th"><span>Organização</span><span>Estado</span><span>Última atividade</span><span>Alojamentos</span><span>Reservas 30 dias</span><span>Integrações</span><span>Problemas</span></div>
    ${rows.map(clienteRowHtml).join('')}</div>`;
}

function clienteRowHtml(org) {
  const s = statusOf(org);
  const problems = Number(org.open_problems) || 0;
  const accommodations = Number(org.accommodations) || 0;
  const reservations = Number(org.reservations_30d) || 0;
  return `<div class="v2-row v2-row-link pv2-client" role="button" tabindex="0" ${core().KEY_ACTIVATE} ${AppActions.attrs('click', 'pv2-abrir-org', [String(org.id)])}>
    <span class="v2-row-text"><b>${esc(org.name)}</b><span>${esc(org.slug || '')}</span></span>
    ${stateHtml(org)}
    <span class="pv2-muted">${esc(relativo(org.last_activity_at))}</span>
    <span class="pv2-num">${num(accommodations)}</span>
    <span class="pv2-num">${num(reservations)}</span>
    ${integrationsHtml(org)}
    <span class="pv2-prob">${problems ? chip('bad', String(problems)) : chip('ok', '0')}</span>
    <span class="pv2-sub">${esc(s.label)} · ${esc(relativo(org.last_activity_at))} · ${num(accommodations)} alojamento${accommodations === 1 ? '' : 's'} · ${num(reservations)} reserva${reservations === 1 ? '' : 's'} em 30 dias</span>
  </div>`;
}

// Incidentes
function incidentesHtml() {
  const groups = new Map();
  for (const item of state.incidents.incidents) {
    const key = providerKey(item.provider);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  const known = PROVIDERS.map(([key]) => key);
  const keys = [...known.filter(k => groups.has(k)), ...[...groups.keys()].filter(k => !known.includes(k))];
  const cards = keys.map(key => {
    const items = groups.get(key);
    return `<div class="v2-card v2-dense"><div class="v2-card-h"><h3>${esc(providerLabel(key))}</h3>${chip('bad', `${items.length} ${items.length === 1 ? 'incidente' : 'incidentes'}`)}</div>
      ${items.map(incidentHtml).join('')}</div>`;
  }).join('');
  return `<div class="pv2-incidents">
    <div class="pv2-incidents-main">${cards || `<div class="v2-card v2-dense"><p class="v2-empty">${icon('check-circle', 16)} Sem incidentes de fornecedores.</p></div>`}</div>
    ${instanciaHtml()}</div>`;
}

function incidentHtml(item) {
  const orgs = Array.isArray(item.organizations) ? item.organizations : [];
  const extra = Math.max(0, (Number(item.count) || 0) - orgs.length);
  return `<div class="v2-row pv2-incident">
    <span class="v2-row-text"><b>${esc(item.title || providerLabel(item.provider))}</b>${item.detail ? `<span>${esc(item.detail)}</span>` : ''}
      ${orgs.length || extra ? `<span class="pv2-orgs-affected">${orgs.map(o => `<button type="button" class="v2-chip neutral" ${AppActions.attrs('click', 'pv2-abrir-org', [String(o.id)])}>${esc(o.name)}</button>`).join('')}${extra ? `<span class="pv2-muted">e mais ${num(extra)}</span>` : ''}</span>` : ''}</span>
    <span class="pv2-since">${esc(since(item.since))}</span></div>`;
}

function instanciaHtml() {
  const instance = state.overview?.instance || {};
  const disk = instance.disk;
  const used = disk && disk.total_bytes ? Math.min(100, Math.round((1 - disk.free_bytes / disk.total_bytes) * 100)) : null;
  const line = (label, value) => `<div class="pv2-kv"><span>${label}</span><b>${value}</b></div>`;
  const incidents = state.incidents.instance;
  return `<div class="v2-card v2-dense pv2-instance"><div class="v2-card-h"><h3>Instância</h3></div>
    ${line('Build', esc(instance.app_build || '—'))}
    ${line('Tempo ligado', esc(duration(instance.uptime_seconds)))}
    ${line('Tamanho da base', esc(bytes(instance.database_bytes)))}
    ${line('Disco', disk ? `${esc(bytes(disk.free_bytes))} livres de ${esc(bytes(disk.total_bytes))}` : '—')}
    ${used === null ? '' : `<div class="v2-bar" role="img" aria-label="Disco usado: ${used}%"><i style="width:${used}%;background:${used >= 90 ? 'var(--v2-bad)' : 'var(--v2-accent)'}"></i></div>`}
    ${incidents.length ? incidents.map(i => `<div class="v2-row pv2-incident"><span class="v2-row-text"><b>${esc(i.title || 'Incidente')}</b>${i.detail ? `<span>${esc(i.detail)}</span>` : ''}</span>${chip('bad', 'Incidente')}</div>`).join('')
      : `<p class="v2-empty">${icon('check-circle', 16)} Sem incidentes da instância.</p>`}</div>`;
}

// ── Ficha da organização ──
async function openOrg(id) {
  const base = state.orgs.find(o => String(o.id) === String(id));
  if (!(await core().ensureFeature('v2'))) return;
  AppModules.v2.abrirFolha({
    id: 'pv2-ficha',
    title: base?.name || 'Organização',
    sub: base?.slug || '',
    body: '<div class="loading" role="status">A carregar…</div>',
  });
  try {
    const payload = await core().apiGet(`/api/platform/organizations/${encodeURIComponent(id)}`);
    const sheet = document.getElementById('pv2-ficha');
    if (!sheet) return;
    const org = payload?.data || {};
    sheet.querySelector('.v2f-body').innerHTML = fichaHtml(org);
    sheet.querySelector('#pv2-ficha-titulo').firstChild.textContent = org.name || '';
    const sub = sheet.querySelector('#pv2-ficha-sub');
    if (sub) sub.textContent = org.slug || '';
    sheet.querySelector('.v2f-foot')?.remove();
    sheet.insertAdjacentHTML('beforeend', `<footer class="v2f-foot"><button type="button" class="btn btn-ghost" data-on-click="v2-fechar-folha">Fechar</button>
      <button type="button" class="btn btn-primary" id="pv2-guardar" ${AppActions.attrs('click', 'pv2-guardar', [String(org.id ?? id)])}>Guardar</button></footer>`);
    if (window.lucide) lucide.createIcons();
  } catch (error) {
    AppModules.v2.fecharFolha();
    if (applyError(error)) { render(); return; }
    core().toast('❌ ' + (error?.payload?.error || 'Não foi possível abrir a ficha.'), 'error');
  }
}

function fichaHtml(org) {
  const problems = Array.isArray(org.problems) ? org.problems : [];
  const onboarding = org.onboarding || {};
  const steps = [['google', 'Google ligado'], ['accommodation', 'Alojamento criado'], ['reservation', 'Primeira reserva']];
  return `<section class="pv2-sec"><h3>Integrações</h3>${INTEGRATIONS.map(([key, label]) => {
      const [tone, text] = INTEGRATION_STATE[org.integrations?.[key]] || INTEGRATION_STATE.off;
      return `<div class="pv2-kv"><span>${esc(label)}</span><b><i class="v2-dot pv2-${tone}"></i>${text.charAt(0).toUpperCase() + text.slice(1)}</b></div>`;
    }).join('')}</section>
    <section class="pv2-sec"><h3>Problemas abertos</h3>${problems.length ? problems.map(p => `<div class="v2-row"><span class="v2-row-text"><b>${esc(p.title)}</b>${p.detail ? `<span>${esc(p.detail)}</span>` : ''}</span></div>`).join('')
      : `<p class="v2-empty">${icon('check-circle', 16)} Sem problemas abertos.</p>`}</section>
    <section class="pv2-sec"><h3>Primeiros passos</h3>${steps.map(([key, label]) => `<div class="pv2-step${onboarding[key] ? ' is-done' : ''}">${icon(onboarding[key] ? 'check-circle' : 'circle', 18)}<span>${label}</span></div>`).join('')}</section>
    <section class="pv2-sec"><label class="pv2-label" for="pv2-estado">Estado</label>
      <select class="form-control" id="pv2-estado">${Object.entries(STATUS).map(([key, s]) => `<option value="${key}"${org.status === key ? ' selected' : ''}>${s.label}</option>`).join('')}</select></section>
    <section class="pv2-sec"><label class="pv2-label" for="pv2-notas">Notas internas</label>
      <textarea class="form-control" id="pv2-notas" rows="5" placeholder="Só visível para a plataforma.">${esc(org.notes || '')}</textarea></section>`;
}

async function saveOrg(id, button) {
  const status = document.getElementById('pv2-estado')?.value;
  const notes = document.getElementById('pv2-notas')?.value ?? '';
  if (button) button.disabled = true;
  try {
    const payload = await core().apiPut(`/api/platform/organizations/${encodeURIComponent(id)}`, { status, notes });
    const updated = payload?.data;
    const index = state.orgs.findIndex(o => String(o.id) === String(id));
    if (index >= 0 && updated && typeof updated === 'object') state.orgs[index] = { ...state.orgs[index], ...updated };
    else if (index >= 0) state.orgs[index] = { ...state.orgs[index], status };
    core().toast('✅ Ficha guardada.', 'success');
    AppModules.v2.fecharFolha();
    renderTab();
  } catch (error) {
    if (button) button.disabled = false;
    if (error?.status === 423 && error.payload?.locked === true) { AppModules.v2.fecharFolha(); applyError(error); render(); return; }
    core().toast('❌ ' + (error?.payload?.error || 'Não foi possível guardar.'), 'error');
  }
}

async function unlock(form) {
  if (state.busy) return;
  const input = form.querySelector('#pv2-pw');
  const password = input?.value || '';
  if (!password) { state.unlockError = 'Escreva a palavra-passe.'; render(); return; }
  state.busy = true;
  state.unlockError = '';
  form.querySelector('button[type="submit"]').disabled = true;
  try {
    await core().apiPost('/api/platform/unlock', { password }, { skipAuthRedirect: true });
    state.busy = false;
    await loadPlataforma();
  } catch (error) {
    state.busy = false;
    state.unlockError = error?.status === 400 || error?.status === 401 ? 'Palavra-passe incorreta.' : (error?.payload?.error || 'Não foi possível confirmar. Tenta novamente.');
    render();
  }
}

AppActions.register({
  'pv2-separador': (el, event, [tab]) => {
    if (!TABS.some(([key]) => key === tab) || state.tab === tab) return;
    state.tab = tab;
    render();
  },
  'pv2-filtro': (el, event, [key]) => { state.filter = key; renderTab(); },
  'pv2-abrir-org': (el, event, [id]) => { event.stopPropagation(); return openOrg(id); },
  'pv2-guardar': (el, event, [id]) => saveOrg(id, el),
  'pv2-recarregar': () => loadPlataforma(),
}, 'click');

AppActions.register({
  'pv2-pesquisa': el => {
    state.search = el.value;
    const list = document.getElementById('pv2-lista');
    if (list) list.innerHTML = clientesLista();
  },
}, 'input');

AppActions.register({
  'pv2-desbloquear': (el, event) => { event.preventDefault(); return unlock(el); },
}, 'submit');

AppModules.onReset('features/plataforma/consola.js', () => {
  loadToken++;
  clearTimeout(redirectTimer);
  Object.assign(state, { status: 'loading', tab: 'geral', overview: null, orgs: [], incidents: { incidents: [], instance: [] }, search: '', filter: '', unlockError: '', busy: false });
});

})();
