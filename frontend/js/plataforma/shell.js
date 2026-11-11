// Consola da plataforma: moldura (barra lateral, barra de cima), router por
// History API, aspeto e desbloqueio. É o último script da página: arranca a
// consola depois de api, format, gráficos e páginas estarem carregados.
(() => {
AppModules.define('consola', {
  mostrarBloqueio: { get: () => showLocked },
  contadorSuporte: { get: () => setSupportBadge },
  contadorTarefas: { get: () => setTasksBadge },
});

const fmt = AppModules.consola.fmt;
const api = AppModules.consola.api;
const charts = AppModules.consola.charts;
const { esc } = fmt;

const ROUTES = [
  { key: 'geral', path: '/plataforma', title: 'Visão geral', page: 'geral' },
  { key: 'clientes', path: '/plataforma/clientes', title: 'Clientes', page: 'clientes' },
  { key: 'utilizacao', path: '/plataforma/utilizacao', title: 'Utilização', page: 'utilizacao' },
  { key: 'incidentes', path: '/plataforma/incidentes', title: 'Incidentes', page: 'incidentes' },
  { key: 'suporte', path: '/plataforma/suporte', title: 'Suporte', page: 'suporte' },
  { key: 'registo', path: '/plataforma/registo', title: 'Registo', page: 'registo' },
  { key: 'tarefas', path: '/plataforma/tarefas', title: 'Tarefas', page: 'tarefas' },
  { key: 'comunicados', path: '/plataforma/comunicados', title: 'Comunicados', page: 'comunicados' },
  { key: 'pacotes', path: '/plataforma/pacotes', title: 'Pacotes', page: 'pacotes' },
];
const LOOKS = [['classico', 'classico', 'auto', 'Clássico'], ['claro', 'vidro', 'claro', 'Vidro claro'], ['escuro', 'vidro', 'escuro', 'Vidro escuro']];

const $ = id => document.getElementById(id);
const content = () => $('pl-content');
const mobile = window.matchMedia('(max-width: 900px)');
const st = { token: 0, route: null, user: null, denied: false, busy: false, unlockError: '', drawer: false };

// ── Router ──
function match(pathname) {
  const path = pathname.replace(/\/+$/, '') || '/';
  const found = ROUTES.find(r => r.path === path);
  if (found) return { ...found };
  const detail = /^\/plataforma\/clientes\/([^/]+)$/.exec(path);
  if (detail) {
    let id = detail[1];
    try { id = decodeURIComponent(id); } catch { /* fica como veio */ }
    return { key: 'clientes', path, title: 'Clientes', page: 'cliente', id };
  }
  const ticket = /^\/plataforma\/suporte\/([^/]+)$/.exec(path);
  if (ticket) {
    let id = ticket[1];
    try { id = decodeURIComponent(id); } catch { /* fica como veio */ }
    return { key: 'suporte', path, title: 'Suporte', page: 'pedido', id };
  }
  return { key: '', path, title: 'Página não encontrada', page: null };
}

function mark(route) {
  document.querySelectorAll('#pl-nav [data-nav]').forEach(a => {
    if (a.dataset.nav === route.key) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  $('pl-title').textContent = route.title;
  document.title = `${route.title} · Plataforma · Santa Paciência`;
}

// Contador do Suporte na barra lateral: pedidos com mensagem do cliente por ler.
function setSupportBadge(count) {
  const badge = $('pl-badge-suporte');
  if (!badge) return;
  const n = Number(count) || 0;
  badge.textContent = n > 99 ? '99+' : String(n);
  badge.hidden = n < 1;
  badge.setAttribute('aria-label', `${n} por ler`);
}
// Falhas (423, 404, rede) ficam para a página; o contador só não aparece.
async function refreshSupportBadge() {
  try {
    const data = await api.supportTickets();
    setSupportBadge(data ? data.tickets.filter(t => t.unread).length : 0);
  } catch { setSupportBadge(0); }
}

// Contador de Tarefas: as minhas tarefas abertas (GET /api/platform/tasks/summary).
function setTasksBadge(count) {
  const badge = $('pl-badge-tarefas');
  if (!badge) return;
  const n = Number(count) || 0;
  badge.textContent = n > 99 ? '99+' : String(n);
  badge.hidden = n < 1;
  badge.setAttribute('aria-label', `${n} tarefas abertas`);
}
async function refreshTasksBadge() {
  try {
    const payload = await AppModules.core.apiGet('/api/platform/tasks/summary');
    setTasksBadge(payload?.data?.mine_open);
  } catch { setTasksBadge(0); }
}

function show(html) {
  charts.disposeAll();
  content().innerHTML = html;
  if (window.lucide) lucide.createIcons();
}

const loadingHtml = '<div class="loading pl-loading" role="status">A carregar…</div>';

async function load(route) {
  const token = ++st.token;
  st.route = route;
  mark(route);
  closeDrawer();
  if (st.denied) { showDenied(); return; }
  if (!route.page) { showNotFound(); return; }
  show(loadingHtml);
  const ctx = { host: content(), route, stale: () => token !== st.token };
  if (route.key !== 'suporte') refreshSupportBadge();
  if (route.key !== 'tarefas') refreshTasksBadge();
  try {
    await AppModules.consola[route.page].render(ctx);
    if (ctx.stale()) return;
    if (window.lucide) lucide.createIcons();
  } catch (error) {
    if (ctx.stale()) return;
    fail(error);
  }
}

function go(path, { replace = false } = {}) {
  const route = match(path);
  if (replace) history.replaceState({}, '', path); else history.pushState({}, '', path);
  window.scrollTo(0, 0);
  return load(route);
}

// ── Estados que ocupam a página toda ──
function fail(error) {
  if (error?.status === 423 && error.payload?.locked === true) { showLocked(); return; }
  if (error?.status === 404) { st.denied = true; showDenied(); return; }
  show(`<div class="pl-page"><div class="v2-card pl-notice"><h3>Não foi possível carregar</h3>
    <p class="v2-empty">${esc(error?.status === 501 ? 'Ainda sem dados.' : 'Verifique a ligação e tente novamente.')}</p>
    <button type="button" class="btn btn-ghost btn-sm" ${AppActions.attrs('click', 'pl-recarregar')}>Tentar novamente</button></div></div>`);
}

function showDenied() {
  charts.disposeAll();
  $('pl-title').textContent = 'Sem acesso';
  document.title = 'Sem acesso · Plataforma · Santa Paciência';
  show(`<div class="pl-page"><div class="v2-card pl-notice"><h3>Sem acesso</h3>
    <p class="v2-empty">Esta área é só para quem administra a plataforma.</p>
    <a class="btn btn-primary btn-sm" href="/dashboard">Voltar à app</a></div></div>`);
}

function showNotFound() {
  show(`<div class="pl-page"><div class="v2-card pl-notice"><h3>Página não encontrada</h3>
    <p class="v2-empty">Esta página da consola não existe.</p>${fmt.link('/plataforma', 'Ir para a visão geral', 'btn btn-ghost btn-sm')}</div></div>`);
}

function showLocked() {
  show(`<form class="v2-card pl-unlock" ${AppActions.attrs('submit', 'pl-desbloquear')} novalidate>
    <h3>Confirme a sua palavra-passe</h3>
    <p class="pl-muted">Por segurança, confirme a palavra-passe para abrir a consola.</p>
    <label class="pl-label" for="pl-pw">Palavra-passe</label>
    <input class="form-control" type="password" id="pl-pw" name="password" autocomplete="current-password" required>
    <p class="pl-error" role="alert"${st.unlockError ? '' : ' hidden'}>${esc(st.unlockError)}</p>
    <button type="submit" class="btn btn-primary"${st.busy ? ' disabled' : ''}>Confirmar</button></form>`);
  $('pl-pw')?.focus({ preventScroll: true });
}

async function unlock(form) {
  if (st.busy) return;
  const password = form.querySelector('#pl-pw')?.value || '';
  if (!password) { st.unlockError = 'Escreva a palavra-passe.'; showLocked(); return; }
  st.busy = true;
  st.unlockError = '';
  form.querySelector('button[type="submit"]').disabled = true;
  try {
    await api.unlock(password);
    st.busy = false;
    api.reset();
    await load(st.route || match(location.pathname));
  } catch (error) {
    st.busy = false;
    st.unlockError = error?.status === 400 || error?.status === 401 ? 'Palavra-passe incorreta.' : (error?.payload?.error || 'Não foi possível confirmar. Tente novamente.');
    showLocked();
  }
}

// ── Gaveta (telemóvel) ──
function syncDrawer() {
  const side = $('pl-side');
  const hidden = mobile.matches && !st.drawer;
  side.inert = hidden;
  $('pl-main').inert = mobile.matches && st.drawer;
  $('pl-scrim').hidden = !(mobile.matches && st.drawer);
  $('pl-menu').setAttribute('aria-expanded', String(mobile.matches && st.drawer));
  document.body.classList.toggle('pl-drawer-open', mobile.matches && st.drawer);
}
function openDrawer() { st.drawer = true; syncDrawer(); $('pl-side').querySelector('a[href]')?.focus(); }
function closeDrawer({ focus = false } = {}) {
  if (!st.drawer) { syncDrawer(); return; }
  st.drawer = false;
  syncDrawer();
  if (focus) $('pl-menu').focus();
}

// ── Aspeto ──
// A consola segue a conta; na V1 («atual») usa o Clássico. O seletor grava na conta.
function currentLook() {
  const { look, mode } = AppAppearance.current();
  if (look === 'vidro') return (document.documentElement.dataset.mode || (mode === 'escuro' ? 'escuro' : 'claro')) === 'escuro' ? 'escuro' : 'claro';
  return 'classico';
}
function markLook() {
  const now = currentLook();
  document.querySelectorAll('#pl-aspeto button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.look === now)));
}
async function setLook(key) {
  const option = LOOKS.find(l => l[0] === key);
  if (!option || key === currentLook()) return;
  const before = AppAppearance.current();
  AppAppearance.apply({ look: option[1], mode: option[2] });
  markLook();
  try {
    await AppModules.core.apiPut('/auth/appearance', { appearance: { look: option[1], mode: option[2] } });
  } catch (error) {
    if (error?.status === 401) { location.replace('/'); return; }
    AppAppearance.apply(before);
    markLook();
    AppModules.core.toast('Não foi possível guardar o aspeto.', 'error');
  }
}

function fillUser(user) {
  const name = user?.name || user?.email || 'Utilizador';
  $('pl-user-name').textContent = name;
  $('pl-user-mail').textContent = user?.email && user.email !== name ? user.email : '';
  $('pl-avatar').textContent = AppModules.core.initials(name);
}

// ── Ações ──
AppActions.register({
  'pl-ir': (el, event) => {
    // Ctrl, Cmd, Shift ou botão do meio: deixa o browser abrir noutro separador.
    if (event.defaultPrevented || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return undefined;
    const href = el.getAttribute('href') || '';
    if (!href.startsWith('/plataforma')) return undefined;
    if (href === location.pathname) { closeDrawer(); return false; }
    go(href);
    return false;
  },
  'pl-gaveta': () => (st.drawer ? closeDrawer() : openDrawer()),
  'pl-gaveta-fechar': () => closeDrawer({ focus: true }),
  'pl-recarregar': () => { api.reset(); return load(st.route || match(location.pathname)); },
  'pl-aspeto': (el, event, [key]) => setLook(key),
}, 'click');
AppActions.register({
  'pl-desbloquear': (el, event) => { event.preventDefault(); return unlock(el); },
}, 'submit');

// ── Arranque ──
async function boot() {
  window.addEventListener('popstate', () => load(match(location.pathname)));
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && st.drawer) closeDrawer({ focus: true }); });
  mobile.addEventListener('change', () => { st.drawer = false; syncDrawer(); });
  syncDrawer();
  markLook();
  show(loadingHtml);
  let user = null;
  try { user = await api.me(); }
  catch (error) { fail(error); return; }
  if (!user) { location.replace('/'); return; }
  st.user = user;
  // Modo app ou browser desta sessão, uma vez (a consola não carrega a telemetria da app).
  try {
    const mode = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true ? 'standalone' : 'browser';
    fetch('/api/telemetry', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ views: {}, display_mode: mode }) }).catch(() => {});
  } catch { /* nunca incomoda a consola */ }
  // O aspeto da conta; na V1 a consola fica no Clássico (appearance-fallback).
  AppAppearance.apply(user.appearance);
  markLook();
  fillUser(user);
  if (user.is_platform_admin === false) st.denied = true;
  await load(match(location.pathname));
}

boot();
})();
