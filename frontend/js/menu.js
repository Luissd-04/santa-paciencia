// Estado privado; interface partilhada em AppModules.core.
(() => {
AppModules.define('core', {
  NAV_ITEMS: { get: () => NAV_ITEMS },
  closeDrawerAccount: { get: () => () => toggleDrawerAccount(false) },
  markActiveNavigation: { get: () => markActiveNavigation },
  openMenuEditor: { get: () => openMenuEditor },
  renderNavigation: { get: () => renderNavigation },
  setNavBadge: { get: () => setNavBadge },
});

/* ═══════════════════════════════════════════════════════════════
   Menus da aplicação — uma só lista de onde saem o menu lateral do
   computador, o menu do telemóvel e a barra de baixo. No telemóvel cada
   pessoa escolhe a ordem, o que esconde e os 5 atalhos da barra
   (memberships.menu_prefs, services/menuPrefs.js). Definições fica sempre
   no fim e a conta fica fixa no fundo do menu.
═══════════════════════════════════════════════════════════════ */
const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', short: 'Início', icon: 'layout-dashboard', section: 'principal' },
  { id: 'reservas', label: 'Reservas', icon: 'clipboard-list', section: 'principal' },
  { id: 'calendario', label: 'Calendário', icon: 'calendar-days', section: 'principal' },
  { id: 'eventos', label: 'Eventos', icon: 'calendar-range', barIcon: 'calendar-check', section: 'principal' },
  { id: 'notificacoes', label: 'Notificações', icon: 'bell', section: 'principal' },
  { id: 'invoice', label: 'Mensagens', icon: 'mail', section: 'principal', badge: 'invoice' },
  { id: 'hospedes', label: 'Hóspedes', icon: 'users', section: 'gestao' },
  { id: 'alojamentos', label: 'Alojamentos', icon: 'home', section: 'gestao' },
  { id: 'precos', label: 'Preços', icon: 'tag', section: 'gestao' },
  { id: 'despesas', label: 'Despesas', icon: 'receipt', section: 'gestao' },
  { id: 'relatorios', label: 'Relatórios', icon: 'bar-chart-3', section: 'gestao' },
  { id: 'vouchers', label: 'Vouchers', icon: 'ticket', section: 'gestao' },
  // No computador os modelos ficam dentro de Definições.
  { id: 'modelos-email', label: 'Modelos de email', icon: 'mail-open', section: 'gestao', view: 'definicoes', tab: 'emails', mobileOnly: true },
];
const SETTINGS_ITEM = { id: 'definicoes', label: 'Definições', icon: 'settings' };
const SECTIONS = [['principal', 'Principal'], ['gestao', 'Gestão']];
const DEFAULT_BAR = ['dashboard', 'reservas', 'calendario', 'eventos', 'despesas'];
const BAR_SIZE = 5;
const ROLE_LABELS = { owner: 'Proprietário', manager: 'Gestor', staff: 'Equipa' };

const byId = new Map(NAV_ITEMS.map(item => [item.id, item]));
const viewOf = item => item.view || item.id;
const esc = value => AppModules.core.escapeHtml(value);
const icon = (name, size = 16) => `<i data-lucide="${name}" style="width:${size}px;height:${size}px;"></i>`;
const badgeHtml = item => item.badge ? `<span class="nav-badge" data-nav-badge="${item.badge}" style="display:none;"></span>` : '';

// Contadores (ex.: mensagens novas) nos três menus; voltam a aparecer
// depois de os menus serem redesenhados.
const navBadges = {};
function setNavBadge(name, count) {
  navBadges[name] = Number(count) || 0;
  document.querySelectorAll(`[data-nav-badge="${name}"]`).forEach(el => {
    el.textContent = navBadges[name] > 9 ? '9+' : String(navBadges[name]);
    el.style.display = navBadges[name] > 0 ? '' : 'none';
  });
}

// Preferências guardadas, sem ids que já não existam e com os novos itens
// (acrescentados depois da última edição) no fim.
function menuPrefs() {
  const saved = AppModules.core.currentUser?.menu_prefs || null;
  const known = id => byId.has(id);
  const order = (saved?.order || []).filter(known);
  NAV_ITEMS.forEach(item => { if (!order.includes(item.id)) order.push(item.id); });
  const bar = (saved?.bar || []).filter(known).slice(0, BAR_SIZE);
  return {
    custom: Boolean(saved),
    order,
    hidden: new Set((saved?.hidden || []).filter(known)),
    bar: bar.length === BAR_SIZE ? bar : DEFAULT_BAR,
  };
}

// ── Computador: menu lateral por secções, sempre na ordem original ──
function renderSidebar() {
  const nav = document.querySelector('#main-sidebar .sidebar-nav');
  if (!nav) return;
  nav.innerHTML = SECTIONS.map(([section, title]) => `<div class="nav-section sb-label">${title}</div>${NAV_ITEMS
    .filter(item => item.section === section && !item.mobileOnly)
    .map(item => `<button type="button" class="nav-item" data-view="${item.id}" ${AppActions.attrs('click', 'menu-open', [item.id])}>
        <span class="icon">${icon(item.icon, 18)}</span><span class="nav-label"> ${esc(item.label)}</span>${badgeHtml(item)}
      </button>`).join('')}`).join('');
}

// ── Telemóvel: o menu de cada pessoa e a conta fixa no fundo ──
function drawerItemHtml(item) {
  return `<button type="button" class="side-drawer-item" data-view="${viewOf(item)}" data-nav-id="${item.id}" ${AppActions.attrs('click', 'menu-open', [item.id])}>
    ${icon(item.icon)} ${esc(item.label)}${badgeHtml(item)}
  </button>`;
}

function renderDrawer() {
  const list = document.getElementById('side-drawer-nav');
  if (!list) return;
  const prefs = menuPrefs();
  const visible = prefs.order.map(id => byId.get(id)).filter(item => !prefs.hidden.has(item.id));
  list.innerHTML = prefs.custom
    ? `<div class="side-drawer-section">O meu menu</div>${visible.map(drawerItemHtml).join('')}`
    : SECTIONS.map(([section, title]) => `<div class="side-drawer-section">${title}</div>${visible.filter(item => item.section === section).map(drawerItemHtml).join('')}`).join('');
  list.insertAdjacentHTML('beforeend', `<div class="side-drawer-settings">${drawerItemHtml(SETTINGS_ITEM)}</div>`);
  const user = AppModules.core.currentUser || {};
  const name = document.getElementById('side-drawer-user-name');
  const sub = document.getElementById('side-drawer-user-sub');
  const avatar = document.getElementById('side-drawer-avatar');
  if (name) name.textContent = user.name || 'Sessão';
  if (sub) sub.textContent = [ROLE_LABELS[user.role] || user.role, user.organization_name].filter(Boolean).join(' · ');
  if (avatar) avatar.textContent = (user.name || '?').trim().charAt(0).toUpperCase();
}

function toggleDrawerAccount(force) {
  const panel = document.getElementById('side-drawer-account-actions');
  const button = document.getElementById('side-drawer-account-toggle');
  if (!panel || !button) return;
  const open = force ?? panel.hidden;
  panel.hidden = !open;
  button.setAttribute('aria-expanded', String(open));
}

function renderBottomBar() {
  const bar = document.getElementById('bottom-nav-bar');
  if (!bar) return;
  bar.innerHTML = menuPrefs().bar.map(id => byId.get(id)).map(item => `<button type="button" class="bn-item" id="bn-${item.id}" data-view="${viewOf(item)}" ${AppActions.attrs('click', 'menu-open-bar', [item.id])}>
      ${icon(item.barIcon || item.icon, 22)}<span>${esc(item.short || item.label)}</span>
    </button>`).join('');
}

function renderNavigation() {
  renderSidebar();
  renderDrawer();
  renderBottomBar();
  Object.entries(navBadges).forEach(([name, count]) => setNavBadge(name, count));
  const active = document.querySelector('.view.active')?.id?.replace(/^view-/, '');
  if (active) markActiveNavigation(active);
  if (window.lucide) lucide.createIcons();
}

// Destaque do item da vista aberta nos três menus.
function markActiveNavigation(view) {
  document.querySelectorAll('.nav-item[data-view], .side-drawer-item[data-view], .bn-item[data-view]').forEach(el => {
    const active = el.dataset.view === view && el.dataset.navId !== 'modelos-email';
    el.classList.toggle('active', active);
    if (active) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });
}

function openNavItem(id, { fromDrawer = true } = {}) {
  const item = byId.get(id) || (id === SETTINGS_ITEM.id ? SETTINGS_ITEM : null);
  if (!item) return;
  if (fromDrawer) AppModules.core.closeSideDrawer();
  AppModules.core.showView(viewOf(item));
  if (item.tab) AppModules.core.switchSettingsTab(item.tab);
}

/* ── Editar menu (telemóvel) ─────────────────────────────────────── */
let editor = null; // { order, hidden, bar, slot }

function openMenuEditor() {
  const prefs = menuPrefs();
  editor = { order: [...prefs.order], hidden: new Set(prefs.hidden), bar: [...prefs.bar], slot: null };
  AppModules.core.closeSideDrawer();
  let host = document.getElementById('menu-editor');
  if (!host) {
    host = document.createElement('div');
    host.id = 'menu-editor';
    host.className = 'menu-editor';
    host.setAttribute('role', 'dialog');
    host.setAttribute('aria-modal', 'true');
    host.setAttribute('aria-labelledby', 'menu-editor-title');
    document.body.appendChild(host);
  }
  host.hidden = false;
  document.body.style.overflow = 'hidden';
  renderMenuEditor();
  host.querySelector('.menu-editor-head button')?.focus({ preventScroll: true });
}

function closeMenuEditor() {
  const host = document.getElementById('menu-editor');
  if (host) host.hidden = true;
  document.body.style.overflow = '';
  editor = null;
}

function renderMenuEditor() {
  const host = document.getElementById('menu-editor');
  if (!host || !editor) return;
  const rows = editor.order.map(id => byId.get(id)).map((item, index) => {
    const hidden = editor.hidden.has(item.id);
    return `<li class="menu-editor-row${hidden ? ' is-hidden' : ''}" data-nav-id="${item.id}">
      <button type="button" class="menu-editor-handle" aria-label="Mover ${esc(item.label)} (posição ${index + 1})" data-menu-handle="${item.id}">${icon('grip-vertical', 18)}</button>
      <span class="menu-editor-icon">${icon(item.icon, 18)}</span>
      <span class="menu-editor-name">${esc(item.label)}</span>
      <button type="button" class="menu-editor-eye" aria-pressed="${!hidden}" aria-label="${hidden ? 'Mostrar' : 'Esconder'} ${esc(item.label)}" ${AppActions.attrs('click', 'menu-editor-toggle', [item.id])}>${icon(hidden ? 'eye-off' : 'eye', 18)}</button>
    </li>`;
  }).join('');
  const slots = editor.bar.map((id, index) => {
    const item = byId.get(id);
    return `<button type="button" class="menu-editor-slot${editor.slot === index ? ' is-picking' : ''}" aria-label="Atalho ${index + 1}: ${esc(item.label)}. Trocar" ${AppActions.attrs('click', 'menu-editor-slot', [String(index)])}>
      ${icon(item.barIcon || item.icon, 18)}<span>${esc(item.short || item.label)}</span>
    </button>`;
  }).join('');
  const picker = editor.slot === null ? '' : `<div class="menu-editor-picker" role="group" aria-label="Escolher o atalho ${editor.slot + 1}">
      ${NAV_ITEMS.filter(item => !editor.bar.includes(item.id)).map(item => `<button type="button" ${AppActions.attrs('click', 'menu-editor-pick', [item.id])}>${icon(item.icon, 16)} ${esc(item.label)}</button>`).join('')}
    </div>`;
  host.innerHTML = `
    <div class="menu-editor-head">
      <button type="button" data-on-click="menu-editor-cancel">Cancelar</button>
      <h2 id="menu-editor-title">Editar menu</h2>
      <span aria-hidden="true"></span>
    </div>
    <div class="menu-editor-body">
      <p class="menu-editor-hint">Arrasta pela pega para mudar a ordem. Toca no olho para esconder um item.</p>
      <section class="menu-editor-card">
        <h3>Menu lateral</h3>
        <ol class="menu-editor-list" id="menu-editor-list">${rows}</ol>
      </section>
      <section class="menu-editor-card">
        <h3>Barra de baixo · ${BAR_SIZE} atalhos</h3>
        <div class="menu-editor-bar">${slots}</div>
        ${picker}
      </section>
      <p class="menu-editor-note">Toca num atalho para o trocar. Definições fica sempre no fim do menu e a tua conta no fundo. Fica guardado na tua conta: cada pessoa da equipa tem o seu.</p>
    </div>
    <div class="menu-editor-foot">
      <button type="button" class="btn btn-ghost" data-on-click="menu-editor-reset">Repor original</button>
      <button type="button" class="btn btn-primary" data-on-click="menu-editor-save">Guardar</button>
    </div>`;
  if (window.lucide) lucide.createIcons();
}

// Arrastar pela pega (rato ou dedo). As setas do teclado também mudam a ordem.
let drag = null;
document.addEventListener('pointerdown', event => {
  const handle = event.target.closest?.('[data-menu-handle]');
  if (!handle || !editor) return;
  event.preventDefault();
  const row = handle.closest('.menu-editor-row');
  drag = { id: handle.dataset.menuHandle, row, pointerId: event.pointerId };
  row.classList.add('is-dragging');
  handle.setPointerCapture?.(event.pointerId);
});
document.addEventListener('pointermove', event => {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const list = document.getElementById('menu-editor-list');
  const rows = [...list.querySelectorAll('.menu-editor-row')];
  const target = rows.find(row => {
    const box = row.getBoundingClientRect();
    return row !== drag.row && event.clientY > box.top && event.clientY < box.bottom;
  });
  if (!target) return;
  const box = target.getBoundingClientRect();
  const after = event.clientY > box.top + box.height / 2;
  list.insertBefore(drag.row, after ? target.nextSibling : target);
});
const endDrag = () => {
  if (!drag || !editor) { drag = null; return; }
  drag.row.classList.remove('is-dragging');
  editor.order = [...document.querySelectorAll('#menu-editor-list .menu-editor-row')].map(row => row.dataset.navId);
  drag = null;
  renderMenuEditor();
};
document.addEventListener('pointerup', endDrag);
document.addEventListener('pointercancel', endDrag);
document.addEventListener('keydown', event => {
  const handle = event.target.closest?.('[data-menu-handle]');
  if (handle && editor && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
    event.preventDefault();
    const id = handle.dataset.menuHandle;
    const from = editor.order.indexOf(id);
    const to = from + (event.key === 'ArrowUp' ? -1 : 1);
    if (to < 0 || to >= editor.order.length) return;
    editor.order.splice(to, 0, ...editor.order.splice(from, 1));
    renderMenuEditor();
    document.querySelector(`[data-menu-handle="${id}"]`)?.focus();
    return;
  }
  if (event.key === 'Escape' && editor) { event.preventDefault(); closeMenuEditor(); }
});

async function saveMenuPrefs(prefs) {
  try {
    const payload = await AppModules.core.apiRequest('/auth/menu-prefs', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ menu_prefs: prefs }),
    });
    if (AppModules.core.currentUser) AppModules.core.currentUser.menu_prefs = payload?.data?.menu_prefs ?? null;
    closeMenuEditor();
    renderNavigation();
    AppModules.core.toast(prefs ? 'Menu guardado.' : 'Menu reposto.', 'success');
  } catch (error) {
    AppModules.core.toast(error?.payload?.error || 'Não foi possível guardar o menu.', 'error');
  }
}

AppActions.register({
  'menu-open': (el, event, args) => { openNavItem(args[0], { fromDrawer: Boolean(el.closest('#side-drawer')) }) },
  'menu-open-bar': (el, event, args) => { openNavItem(args[0], { fromDrawer: false }) },
  'menu-open-editor': () => { openMenuEditor() },
  'menu-toggle-account': () => { toggleDrawerAccount() },
  'menu-editor-cancel': () => { closeMenuEditor() },
  'menu-editor-toggle': (el, event, args) => {
    if (editor.hidden.has(args[0])) editor.hidden.delete(args[0]);
    else editor.hidden.add(args[0]);
    renderMenuEditor();
  },
  'menu-editor-slot': (el, event, args) => { editor.slot = editor.slot === Number(args[0]) ? null : Number(args[0]); renderMenuEditor(); },
  'menu-editor-pick': (el, event, args) => { editor.bar[editor.slot] = args[0]; editor.slot = null; renderMenuEditor(); },
  'menu-editor-reset': () => { saveMenuPrefs(null) },
  'menu-editor-save': () => { saveMenuPrefs({ order: editor.order, hidden: [...editor.hidden], bar: editor.bar }) },
}, 'click');

renderSidebar();
renderBottomBar();
})();
