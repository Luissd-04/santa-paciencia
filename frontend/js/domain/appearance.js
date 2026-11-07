// Aspeto da aplicação escolhido por cada pessoa (Definições → Aparência; no
// servidor em users.appearance). «atual» é a V1 sem alterações; «classico» e
// «vidro» são a V2, e o vidro tem claro, escuro ou automático (segue o sistema).
// Carregado no <head>, antes do CSS ser aplicado, com a última escolha guardada
// neste aparelho para a página não piscar; depois do login vale a da conta.
(() => {
  const KEY = 'sp-appearance';
  const root = document.documentElement;
  const dark = window.matchMedia('(prefers-color-scheme: dark)');
  const BAR_COLORS = { atual: '#843424', classico: '#843424', claro: '#eceef2', escuro: '#0a0a0c' };
  let prefs = null;
  try { prefs = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { prefs = null; }

  function resolve() {
    const look = prefs?.look === 'classico' || prefs?.look === 'vidro' ? prefs.look : null;
    if (look) root.dataset.look = look; else delete root.dataset.look;
    const mode = look === 'vidro' ? (prefs.mode === 'escuro' || (prefs.mode !== 'claro' && dark.matches) ? 'escuro' : 'claro') : null;
    if (mode) root.dataset.mode = mode; else delete root.dataset.mode;
    const bar = document.querySelector('meta[name="theme-color"]');
    if (bar) bar.content = BAR_COLORS[mode || look || 'atual'];
  }

  // `next` vem da conta ({ look, mode }); null volta à V1 (ex.: fim de sessão).
  function apply(next) {
    prefs = next && (next.look === 'classico' || next.look === 'vidro') ? { look: next.look, mode: next.mode || 'auto' } : null;
    try {
      if (prefs) localStorage.setItem(KEY, JSON.stringify(prefs));
      else localStorage.removeItem(KEY);
    } catch { /* Sem storage, vale só nesta página. */ }
    resolve();
  }

  if (dark.addEventListener) dark.addEventListener('change', resolve);
  resolve();
  window.AppAppearance = Object.freeze({
    apply,
    current: () => (prefs ? { ...prefs } : { look: 'atual', mode: 'auto' }),
  });
})();
