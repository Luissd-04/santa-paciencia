// V2: a folha que sobe de baixo no telemóvel («Criar», sino) e que, no
// computador, abre por baixo do botão que a chamou (`anchor`). Uma só de
// cada vez; fecha no fundo, no ✕, com Escape ou ao abrir outra. Enquanto
// está aberta o resto da app fica inerte, como no menu.
(() => {
AppModules.define('v2', {
  abrirFolha: { get: () => abrirFolha },
  fecharFolha: { get: () => fecharFolha },
  telemovelV2: { get: () => telemovelV2 },
});

const PHONE = '(max-width: 767px), (max-height: 500px) and (orientation: landscape)';
let previousFocus = null;
let onClose = null;

function telemovelV2() {
  return Boolean(document.documentElement.dataset.look) && window.matchMedia(PHONE).matches;
}

// { id, title, sub, lead (html antes do título), head (html à direita),
// body, foot, anchor, close } → devolve o elemento da folha. `close` corre
// ao fechar (uma vez).
function abrirFolha({ id, title, sub = '', lead = '', head = '', body = '', foot = '', anchor = null, close = null }) {
  fecharFolha();
  const core = AppModules.core;
  const root = document.createElement('div');
  root.className = 'v2f-root';
  // No computador fica presa ao botão: por baixo dele e alinhada à direita.
  if (anchor && !telemovelV2()) {
    const rect = anchor.getBoundingClientRect();
    root.classList.add('v2f-pop');
    root.style.setProperty('--v2f-top', `${Math.round(rect.bottom + 10)}px`);
    root.style.setProperty('--v2f-right', `${Math.max(16, Math.round(window.innerWidth - rect.right))}px`);
  }
  root.innerHTML = `<div class="v2f-scrim" data-on-click="v2-fechar-folha"></div>
    <section class="v2f" id="${id}" role="dialog" aria-modal="true" aria-labelledby="${id}-titulo" tabindex="-1">
      <span class="v2f-grab" aria-hidden="true"></span>
      <header class="v2f-head">${lead}<h2 id="${id}-titulo">${core.escapeHtml(title)}<small id="${id}-sub">${core.escapeHtml(sub)}</small></h2>${head}
        <button type="button" class="v2f-x" aria-label="Fechar" data-on-click="v2-fechar-folha">${core.lcIcon('x', 18)}</button></header>
      <div class="v2f-body">${body}</div>
      ${foot ? `<footer class="v2f-foot">${foot}</footer>` : ''}
    </section>`;
  document.body.append(root);
  previousFocus = document.activeElement;
  onClose = close;
  document.getElementById('app-layout').inert = true;
  document.body.style.overflow = 'hidden';
  if (window.lucide) lucide.createIcons();
  const sheet = root.querySelector('.v2f');
  requestAnimationFrame(() => { root.classList.add('is-open'); sheet.focus({ preventScroll: true }); });
  return sheet;
}

function fecharFolha() {
  const root = document.querySelector('.v2f-root');
  if (!root) return;
  root.remove();
  document.getElementById('app-layout').inert = false;
  document.body.style.overflow = '';
  const done = onClose;
  onClose = null;
  done?.();
  if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  previousFocus = null;
}

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && document.querySelector('.v2f-root')) { event.preventDefault(); fecharFolha(); }
});

AppActions.register({
  'v2-fechar-folha': () => { fecharFolha() },
}, 'click');

AppModules.onReset('features/v2/folha.js', () => { fecharFolha(); });

})();
