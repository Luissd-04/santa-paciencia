// Comunicados da plataforma na app: uma barra fina por baixo do cabeçalho, com
// os comunicados ativos (show_topbar) que a pessoa ainda não fechou. Só pede
// depois de a app abrir (não pesa no arranque) e volta a pedir de 10 em 10
// minutos. Fechar guarda-se por pessoa (POST /api/announcements/:id/dismiss).
// O texto vem do servidor: passa sempre por escapeHtml.
(() => {
  const REFRESH_MS = 10 * 60 * 1000;
  const FIRST_MS = 1500;
  // [tom, ícone] de cada tipo: manutenção info, incidente bad, novidade ok, aviso warn.
  const KINDS = { maintenance: ['info', 'wrench'], incident: ['bad', 'triangle-alert'], news: ['ok', 'sparkles'], notice: ['warn', 'info'] };
  let items = [];
  let timer = 0;
  let first = 0;
  let running = false;

  const core = () => (typeof AppModules === 'undefined' ? null : AppModules.core);
  const esc = value => core().escapeHtml(value);

  function host() {
    let bar = document.getElementById('announcement-bar');
    if (bar) return bar;
    const main = document.getElementById('main-content');
    const top = main?.querySelector('.topbar');
    if (!main || !top) return null;
    bar = document.createElement('div');
    bar.id = 'announcement-bar';
    bar.className = 'ann-bar';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Comunicados');
    top.after(bar);
    return bar;
  }

  function render() {
    const visible = items.filter(item => item.show_topbar && !item.dismissed);
    const bar = host();
    if (!bar) return;
    bar.hidden = !visible.length;
    bar.innerHTML = visible.map(item => {
      const [tone, icon] = KINDS[item.kind] || KINDS.notice;
      return `<div class="ann-item is-${tone}" role="${item.kind === 'incident' ? 'alert' : 'status'}" data-ann-id="${esc(item.id)}">
        <i data-lucide="${icon}" class="ann-ic" aria-hidden="true"></i>
        <span class="ann-text"><strong>${esc(item.title)}.</strong> ${esc(item.body)}</span>
        <button type="button" class="ann-x" aria-label="Fechar aviso: ${esc(item.title)}" ${AppActions.attrs('click', 'announcement-dismiss', [item.id])}>
          Fechar</button></div>`;
    }).join('');
    if (visible.length && window.lucide) lucide.createIcons();
  }

  async function refresh() {
    if (!running || document.hidden || !core()?.currentUser) return;
    try {
      const payload = await core().apiGet('/api/announcements', { skipAuthRedirect: true });
      if (!running) return;
      items = Array.isArray(payload?.data) ? payload.data : [];
      render();
    } catch { /* Sem rede ou sem sessão: tenta na próxima volta. */ }
  }

  async function dismiss(id) {
    // Esconde já; se o servidor falhar, volta a aparecer no próximo pedido.
    const item = items.find(entry => entry.id === id);
    if (item) item.dismissed = true;
    render();
    try { await core().apiPost(`/api/announcements/${encodeURIComponent(id)}/dismiss`, {}, { skipAuthRedirect: true }); }
    catch { if (item) { item.dismissed = false; render(); } }
  }

  function start() {
    if (running) return;
    running = true;
    first = setTimeout(refresh, FIRST_MS);
    timer = setInterval(refresh, REFRESH_MS);
  }

  function stop() {
    running = false;
    clearTimeout(first);
    clearInterval(timer);
    items = [];
    document.getElementById('announcement-bar')?.remove();
  }

  AppActions.register({ 'announcement-dismiss': (el, event, [id]) => dismiss(id) }, 'click');

  // O login e o fim de sessão mostram e escondem #app-layout (auth.js): é o sinal
  // para começar e parar, sem mexer no código do login.
  function watch() {
    const layout = document.getElementById('app-layout');
    if (!layout) return;
    const sync = () => (layout.style.display === 'none' ? stop() : start());
    if (layout.style.display !== 'none') start();
    new MutationObserver(sync).observe(layout, { attributes: true, attributeFilter: ['style'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch, { once: true });
  else watch();

  window.AppAnnouncements = Object.freeze({ refresh });
})();
