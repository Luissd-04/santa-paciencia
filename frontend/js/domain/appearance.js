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
  // CSS da V2: só se descarrega quando há um aspeto novo escolhido.
  const ALL_STYLES = ['aparencia', 'componentes', 'painel', 'reservas', 'calendario', 'eventos', 'notificacoes', 'mensagens', 'hospedes', 'alojamentos', 'despesas', 'precos', 'vouchers', 'definicoes', 'ajuda', 'fichas', 'comunicados', 'telemovel'].map(name => `/css/v2/${name}.css`);
  // A página de entrar (sempre no Clássico) só precisa dos tokens e dos
  // componentes: o resto da V2 vem só quando a conta usa mesmo um aspeto novo.
  const LOGIN_STYLES = ALL_STYLES.slice(0, 2);
  // Páginas com o seu próprio CSS (plataforma.html) declaram-no no <head>:
  // «appearance-styles=own» não descarrega o CSS da app e «appearance-fallback»
  // dá-lhes um aspeto novo quando a conta ainda está na V1.
  const meta = name => document.querySelector(`meta[name="${name}"]`)?.content || '';
  const OWN_STYLES = meta('appearance-styles') === 'own';
  const FALLBACK = meta('appearance-fallback') === 'classico' ? 'classico' : null;
  const loaded = new Set();
  let login = meta('appearance-login') === 'classico';
  let prefs = null;
  try { prefs = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { prefs = null; }

  function loadStyles(list) {
    const missing = list.filter(href => !loaded.has(href));
    if (!missing.length) return;
    missing.forEach(href => loaded.add(href));
    // Ainda a ler o <head>: document.write mantém o CSS a bloquear o primeiro
    // desenho, para a página não aparecer um instante com o aspeto da V1.
    if (document.readyState === 'loading') {
      document.write(missing.map(href => `<link rel="stylesheet" href="${href}">`).join(''));
      return;
    }
    for (const href of missing) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      document.head.append(link);
    }
  }

  function resolve() {
    const look = login ? 'classico' : (prefs?.look === 'classico' || prefs?.look === 'vidro' ? prefs.look : FALLBACK);
    const chosen = prefs?.look === 'classico' || prefs?.look === 'vidro' || (!login && look);
    if (look && !OWN_STYLES) loadStyles(chosen ? ALL_STYLES : LOGIN_STYLES);
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
    setLogin: value => { login = value === true; resolve(); },
    current: () => (prefs ? { ...prefs } : { look: 'atual', mode: 'auto' }),
  });
})();
