// Deslizar para mudar de período em ecrãs táteis (Calendário e Eventos).
// SwipeNav.attach(el, { onPrev, onNext, enabled }): só toque/caneta; o rato
// fica de fora. O scroll vertical continua nativo (touch-action: pan-y).
(() => {
  const EDGE = 24;          // px junto ao bordo do ecrã (gesto «voltar» do iOS)
  const MIN_DIST = 50;      // px
  const MIN_RATIO = 0.22;   // fração da largura
  const DOMINANCE = 1.5;    // |dx| > 1.5 · |dy|
  const ANIM_MS = 200;
  const RESIST = 0.6;
  const BLOCK = 'input, textarea, select, [contenteditable="true"], [contenteditable=""]';
  const OVERLAYS = '.modal-bg.open, .modal-bg.active, .v2f-root, .side-drawer.open, #side-drawer.open';

  const reduced = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function overlayOpen() {
    if (document.querySelector(OVERLAYS)) return true;
    return [...document.querySelectorAll('.modal-bg')].some(m => m.style.display && m.style.display !== 'none');
  }

  // Contentor com scroll horizontal real entre o alvo e a área.
  function horizontalScroller(target, root) {
    for (let n = target; n && n !== root; n = n.parentElement) {
      if (n.scrollWidth > n.clientWidth + 1) {
        const ox = getComputedStyle(n).overflowX;
        if (ox === 'auto' || ox === 'scroll') return true;
      }
    }
    return false;
  }

  function attach(el, opts) {
    if (!el || el.__swipeNav) return;
    el.__swipeNav = true;
    el.classList.add('swipe-area');
    const { onPrev, onNext } = opts;
    let s = null;      // gesto em curso
    let busy = false;

    const setX = (x, ms) => {
      el.style.transition = ms ? `transform ${ms}ms ease-out, opacity ${ms}ms ease-out` : 'none';
      el.style.transform = x ? `translateX(${x}px)` : '';
    };
    const clear = () => { el.style.transition = ''; el.style.transform = ''; el.style.opacity = ''; };
    const wait = ms => new Promise(r => setTimeout(r, ms));

    el.addEventListener('pointerdown', e => {
      s = null;
      if (busy || (e.pointerType !== 'touch' && e.pointerType !== 'pen') || !e.isPrimary) return;
      if (opts.enabled && !opts.enabled()) return;
      if (e.clientX < EDGE || e.clientX > window.innerWidth - EDGE) return;
      if (e.target.closest && e.target.closest(BLOCK)) return;
      if (overlayOpen() || horizontalScroller(e.target, el)) return;
      s = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0, active: false, dead: false };
    });

    el.addEventListener('pointermove', e => {
      if (!s || e.pointerId !== s.id || s.dead) return;
      s.dx = e.clientX - s.x; s.dy = e.clientY - s.y;
      if (!s.active) {
        if (Math.abs(s.dy) > 10 && Math.abs(s.dy) >= Math.abs(s.dx)) { s.dead = true; return; }
        if (Math.abs(s.dx) > 10 && Math.abs(s.dx) > DOMINANCE * Math.abs(s.dy)) s.active = true;
        else return;
      }
      if (!reduced()) setX(s.dx * RESIST, 0);
    });

    async function finish(e, cancelled) {
      if (!s || e.pointerId !== s.id) return;
      const g = s; s = null;
      const w = el.clientWidth || window.innerWidth;
      const ok = !cancelled && !g.dead && g.active
        && Math.abs(g.dx) > DOMINANCE * Math.abs(g.dy)
        && Math.abs(g.dx) >= Math.max(MIN_DIST, w * MIN_RATIO);
      if (g.active && !cancelled) {
        // Só depois de um deslize verdadeiro se engole o clique seguinte.
        const eat = ev => { ev.stopPropagation(); ev.preventDefault(); };
        window.addEventListener('click', eat, { capture: true, once: true });
        setTimeout(() => window.removeEventListener('click', eat, true), 350);
      }
      if (!ok) { if (g.active && !reduced()) { setX(0, ANIM_MS); setTimeout(clear, ANIM_MS + 20); } else clear(); return; }
      const dir = g.dx < 0 ? 1 : -1; // esquerda -> seguinte
      const fn = dir > 0 ? onNext : onPrev;
      busy = true;
      try {
        if (reduced()) { await fn(); return; }
        setX(-dir * w * 0.5, ANIM_MS); el.style.opacity = '0';
        await wait(ANIM_MS);
        await fn();
        setX(dir * w * 0.5, 0); el.style.opacity = '0';
        void el.offsetWidth;
        el.style.transition = `transform ${ANIM_MS}ms ease-out, opacity ${ANIM_MS}ms ease-out`;
        el.style.transform = ''; el.style.opacity = '';
        await wait(ANIM_MS);
      } finally { clear(); busy = false; }
    }
    el.addEventListener('pointerup', e => finish(e, false));
    el.addEventListener('pointercancel', e => finish(e, true));
  }

  window.SwipeNav = { attach };
})();
