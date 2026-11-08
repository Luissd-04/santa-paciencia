// V2 no telemóvel (maquetas tel-01 a tel-03): o menu lateral no aspeto novo
// (a conta em cima, pesquisa, claro/escuro e Definições/Sair em baixo), o
// sino numa folha com filtros e avisos por dia, e o «+» que abre «Criar».
// Carregado só com um aspeto novo (auth.js); na V1 e no computador os botões
// fazem o que sempre fizeram.
(() => {
const core = () => AppModules.core;
const v2 = () => AppModules.v2;

// ── «+»: Criar ──
// [ícone, etiqueta, tom, ação]
const CRIAR = [
  ['calendar-plus', 'Reserva', 'info', 'v2-criar-reserva'],
  ['list-checks', 'Tarefa', 'violet', 'v2-criar-tarefa'],
  ['receipt', 'Despesa', 'warn', 'v2-criar-despesa'],
  ['scan-line', 'Ler talão', 'ok', null],
  ['ticket', 'Voucher', 'bad', 'v2-criar-voucher'],
  ['alarm-clock', 'Lembrete', 'info', 'v2-criar-lembrete'],
];
const CRIAR_MAIS = [['ban', 'Bloquear datas', 'v2-criar-bloqueio'], ['tag', 'Período de preço', 'v2-criar-periodo']];

function abrirCriar() {
  const ic = core().lcIcon;
  const tiles = CRIAR.map(([icon, label, tone, action]) => action
    ? `<button type="button" class="v2c-tile is-${tone}" data-on-click="${action}"><span>${ic(icon, 21)}</span>${label}</button>`
    // Ler talão: o próprio toque abre a câmara (o iPhone só deixa a partir de um toque).
    : `<label class="v2c-tile is-${tone}"><span>${ic(icon, 21)}</span>${label}<input type="file" accept="image/*" capture="environment" hidden data-on-change="v2-criar-talao"></label>`).join('');
  v2().abrirFolha({
    id: 'v2-criar',
    title: 'Criar',
    body: `<div class="v2c-grid">${tiles}</div>
      <div class="v2c-list">${CRIAR_MAIS.map(([icon, label, action]) => `<button type="button" data-on-click="${action}">${ic(icon, 18)}<span>${label}</span>${ic('chevron-right', 16)}</button>`).join('')}</div>`,
  });
}

// Fecha a folha e só depois abre o que foi escolhido (cada um no seu módulo).
async function criar(open) {
  v2().fecharFolha();
  await open();
}

async function lerTalao(input) {
  v2().fecharFolha();
  if (!input.files?.[0]) return;
  if (await core().ensureFeature('despesas')) AppModules.despesas.onReceiptSelected(input);
}

// ── Sino ──
async function abrirSino() {
  const ic = core().lcIcon;
  v2().abrirFolha({
    id: 'v2-sino',
    title: 'Notificações',
    head: `<button type="button" class="btn btn-ghost btn-sm" data-on-click="notificacoes-v2-ler-todas">${ic('check-check', 15)} Ler todas</button>`,
    body: '<div class="loading">A carregar…</div>',
    foot: `<button type="button" class="btn btn-ghost" data-on-click="v2-sino-push">${ic('settings-2', 16)} Avisos no telemóvel</button>
      <button type="button" class="btn btn-primary" data-on-click="v2-sino-todas">Ver todas</button>`,
  });
  // Os avisos desenham-se com o módulo da página Notificações (filtros, por
  // ler, secções por dia e ações de cada aviso).
  if (!await core().ensureFeature('notificacoes')) return;
  core().renderNotificationsPage();
  core().loadNotifications();
}

// ── Menu lateral ──
const MODES = [['claro', 'sun', 'Claro'], ['escuro', 'moon', 'Escuro'], ['auto', 'sun-moon', 'Auto']];

function prepararMenu() {
  const drawer = document.getElementById('side-drawer');
  if (!drawer) return;
  const ic = core().lcIcon;
  if (!drawer.querySelector('.v2d-search')) {
    drawer.querySelector('.side-drawer-scroll')?.insertAdjacentHTML('afterbegin',
      `<button type="button" class="v2d-search" data-on-click="v2-menu-pesquisar">${ic('search', 17)}<span>Pesquisar hóspede, reserva…</span></button>`);
    drawer.insertAdjacentHTML('beforeend', `<div class="v2d-foot">
        <div class="v2d-modes" role="radiogroup" aria-label="Claro ou escuro">${MODES.map(([mode, icon, label]) => `<button type="button" role="radio" data-v2-mode="${mode}" ${AppActions.attrs('click', 'v2-menu-modo', [mode])}>${ic(icon, 15)}${label}</button>`).join('')}</div>
        <div class="v2d-row"><button type="button" class="btn btn-ghost" data-on-click="v2-menu-definicoes">${ic('settings', 16)} Definições</button>
          <button type="button" class="btn btn-ghost" data-on-click="index-close-side-drawer-4a3b8ba">${ic('log-out', 16)} Sair</button></div>
      </div>`);
  }
  const avatar = document.getElementById('side-drawer-avatar');
  if (avatar) avatar.textContent = core().initials(core().currentUser?.name || '?');
  // Claro, escuro ou automático só no vidro (o clássico tem um só).
  const { look, mode } = window.AppAppearance.current();
  const modes = drawer.querySelector('.v2d-modes');
  modes.hidden = look !== 'vidro';
  modes.querySelectorAll('[data-v2-mode]').forEach(button => button.setAttribute('aria-checked', String(button.dataset.v2Mode === mode)));
  // Avisos por ler ao lado de «Notificações», como no sino.
  const bell = document.getElementById('notif-badge');
  const unread = bell && bell.style.display !== 'none' ? bell.textContent : '';
  drawer.querySelectorAll('.side-drawer-item[data-nav-id="notificacoes"]').forEach(item => {
    let badge = item.querySelector('.v2d-count');
    if (!badge) item.insertAdjacentHTML('beforeend', '<span class="nav-badge v2d-count"></span>');
    badge = item.querySelector('.v2d-count');
    badge.textContent = unread;
    badge.hidden = !unread;
  });
  if (window.lucide) lucide.createIcons();
}

async function pesquisar() {
  core().closeSideDrawer();
  await core().showView('reservas');
  // No telemóvel a lista tem a sua própria caixa de pesquisa.
  document.getElementById('mobile-search-input')?.focus();
}

// O «+» e o sino do telemóvel abrem as folhas da V2; o toque não chega à
// ação da V1 (que está no document). O menu abre como sempre e ganha as peças novas.
function intercept(selector, handler) {
  document.addEventListener('click', event => {
    if (!v2().telemovelV2() || !event.target.closest?.(selector)) return;
    event.stopPropagation();
    handler();
  }, true);
}
intercept('#mobile-fab', abrirCriar);
intercept('.topbar .notif-bell', abrirSino);
document.addEventListener('click', event => {
  if (v2().telemovelV2() && event.target.closest?.('#mobile-menu-trigger')) setTimeout(prepararMenu);
  // A ação de um aviso (ex.: «Ver» a reserva) leva para outro sítio: a folha fecha.
  if (event.target.closest?.('#v2-sino .nv2-actions')) setTimeout(() => v2().fecharFolha());
}, true);

AppActions.register({
  'v2-criar-reserva': () => criar(() => core().novaReserva()),
  'v2-criar-tarefa': () => criar(() => core().quickActionNovoEvento()),
  'v2-criar-despesa': () => criar(async () => { if (await core().ensureFeature('despesas')) AppModules.despesas.openDespesaModal(); }),
  'v2-criar-voucher': () => criar(async () => { if (await core().ensureFeature('vouchers')) AppModules.vouchers.openVoucherModal(); }),
  'v2-criar-lembrete': () => criar(() => core().quickActionNovaNotificacao()),
  'v2-criar-bloqueio': () => criar(async () => { if (await core().ensureFeature('bloqueios')) AppModules.bloqueios.openBlockModal(); }),
  'v2-criar-periodo': () => criar(async () => { await core().showView('precos'); AppModules.precos.openPrecosPeriodModal?.(); }),
  'v2-sino-push': () => { v2().fecharFolha(); return AppModules.notificacoes.openPushSettings(); },
  'v2-sino-todas': () => { v2().fecharFolha(); core().showView('notificacoes'); },
  'v2-menu-pesquisar': () => pesquisar(),
  'v2-menu-definicoes': () => { core().closeSideDrawer(); core().showView('definicoes'); },
  'v2-menu-modo': async (el, event, args) => {
    await core().featureAction('saveAppearance', { ...window.AppAppearance.current(), mode: args[0] });
    prepararMenu();
  },
}, 'click');
AppActions.register({
  'v2-criar-talao': el => lerTalao(el),
}, 'change');

})();
