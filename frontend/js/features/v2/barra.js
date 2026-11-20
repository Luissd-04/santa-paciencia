// V2: a barra de cima e o menu (maquetas tel-01 a tel-03 e 09 a 11). No
// telemóvel: o menu lateral no aspeto novo (a conta em cima, pesquisa,
// claro/escuro e Definições/Sair em baixo), o sino numa folha com filtros e
// avisos por dia, e o «+» que abre «Criar». No computador as mesmas folhas
// abrem por baixo do botão: o sino, a conta e a «Ação Rápida» (que passa a
// «Criar»). Carregado só com um aspeto novo (auth.js); na V1 os botões fazem
// o que sempre fizeram.
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

function abrirCriar(anchor) {
  const ic = core().lcIcon;
  const tiles = CRIAR.map(([icon, label, tone, action]) => action
    ? `<button type="button" class="v2c-tile is-${tone}" data-on-click="${action}"><span>${ic(icon, 21)}</span>${label}</button>`
    // Ler talão: o próprio toque abre a câmara (o iPhone só deixa a partir de um toque).
    : `<label class="v2c-tile is-${tone}"><span>${ic(icon, 21)}</span>${label}<input type="file" accept="image/*" capture="environment" hidden data-on-change="v2-criar-talao"></label>`).join('');
  v2().abrirFolha({
    id: 'v2-criar',
    anchor,
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
async function abrirSino(anchor) {
  const ic = core().lcIcon;
  v2().abrirFolha({
    id: 'v2-sino',
    anchor,
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

// Claro, escuro ou automático (só no vidro; o clássico tem um só).
function modesHtml() {
  const { look, mode } = window.AppAppearance.current();
  return `<div class="v2d-modes" role="radiogroup" aria-label="Claro ou escuro"${look === 'vidro' ? '' : ' hidden'}>${MODES.map(([value, icon, label]) =>
    `<button type="button" role="radio" aria-checked="${value === mode}" data-v2-mode="${value}" ${AppActions.attrs('click', 'v2-menu-modo', [value])}>${core().lcIcon(icon, 15)}${label}</button>`).join('')}</div>`;
}

function prepararMenu() {
  const drawer = document.getElementById('side-drawer');
  if (!drawer) return;
  const ic = core().lcIcon;
  if (!drawer.querySelector('.v2d-search')) {
    drawer.querySelector('.side-drawer-scroll')?.insertAdjacentHTML('afterbegin',
      `<button type="button" class="v2d-search" data-on-click="v2-menu-pesquisar">${ic('search', 17)}<span>Pesquisar hóspede, reserva…</span></button>`);
    drawer.insertAdjacentHTML('beforeend', `<div class="v2d-foot">
        <span class="v2d-modes-slot"></span>
        <div class="v2d-row"><button type="button" class="btn btn-ghost v2d-ajuda" data-on-click="v2-menu-ajuda">${ic('circle-help', 16)} Ajuda e feedback<span class="nav-badge" data-nav-badge="ajuda" style="display:none;"></span></button></div>
        <div class="v2d-row"><button type="button" class="btn btn-ghost" data-on-click="v2-menu-definicoes">${ic('settings', 16)} Definições</button>
          <button type="button" class="btn btn-ghost" data-on-click="index-close-side-drawer-4a3b8ba">${ic('log-out', 16)} Sair</button></div>
      </div>`);
  }
  const avatar = document.getElementById('side-drawer-avatar');
  if (avatar) avatar.textContent = core().initials(core().currentUser?.name || '?');
  drawer.querySelector('.v2d-modes-slot').innerHTML = modesHtml();
  core().setNavBadge('ajuda', core().supportSummary?.unread, Number(core().supportSummary?.needs_customer) > 0);
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

// ── Conta (computador) ──
function abrirConta(anchor) {
  const ic = core().lcIcon;
  const esc = core().escapeHtml;
  const user = core().currentUser || {};
  // Os espaços (trocar de espaço) vêm do menu da conta da V1, já desenhados.
  const orgs = document.getElementById('user-menu-orgs')?.innerHTML || '';
  v2().abrirFolha({
    id: 'v2-conta',
    anchor,
    title: user.name || 'Sessão',
    sub: user.email || '',
    lead: `<span class="v2-av v2f-av">${esc(core().initials(user.name || '?'))}</span>`,
    body: `${orgs ? `<div class="v2k-orgs">${orgs}</div>` : ''}${modesHtml()}
      <div class="v2c-list">${[['user-round', 'A minha conta', 'v2-conta-perfil'], ['monitor-smartphone', 'Sessões ativas', 'v2-conta-sessoes'],
        // Só para o dono da instância (a API volta a confirmar).
        ...(user.is_platform_admin === true ? [['layout-list', 'Consola da plataforma', 'v2-conta-plataforma']] : []),
        ['settings', 'Definições', 'v2-conta-definicoes'], ['log-out', 'Sair', 'index-logout-34b5979']]
        .map(([icon, label, action]) => `<button type="button" data-on-click="${action}">${ic(icon, 18)}<span>${label}</span></button>`).join('')}</div>`,
  });
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
// No computador: o sino, a conta e a «Ação Rápida» abrem por baixo do botão.
function interceptDesktop(selector, handler) {
  document.addEventListener('click', event => {
    const button = event.target.closest?.(selector);
    if (!document.documentElement.dataset.look || v2().telemovelV2() || !button) return;
    event.stopPropagation();
    handler(button);
  }, true);
}
interceptDesktop('.topbar .notif-bell', abrirSino);
interceptDesktop('#auth-user-chip', abrirConta);
interceptDesktop('.quick-action-wrap > .btn', abrirCriar);
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
  'v2-menu-ajuda': () => { core().closeSideDrawer(); core().showView('ajuda'); },
  'v2-menu-definicoes': () => { core().closeSideDrawer(); core().showView('definicoes'); },
  'v2-menu-modo': async (el, event, args) => {
    await core().featureAction('saveAppearance', { ...window.AppAppearance.current(), mode: args[0] });
    document.querySelectorAll('[data-v2-mode]').forEach(button => button.setAttribute('aria-checked', String(button.dataset.v2Mode === args[0])));
  },
  'v2-conta-perfil': () => { v2().fecharFolha(); core().openProfileModal(); },
  'v2-conta-sessoes': () => { v2().fecharFolha(); core().openSessionsModal(); },
  'v2-conta-definicoes': () => { v2().fecharFolha(); core().showView('definicoes'); },
  'v2-conta-plataforma': () => { location.href = '/plataforma'; },
}, 'click');
AppActions.register({
  'v2-criar-talao': el => lerTalao(el),
}, 'change');

})();
