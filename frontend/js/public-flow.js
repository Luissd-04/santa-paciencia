// Navegação partilhada pelos formulários públicos.
(() => {
  const mobileQuery = '(max-width: 900px)';
  let scrollTimer;
  let scrollFrame;
  function setupNavigation() {
    const controls = document.querySelector('[data-flow-controls]');
    const mobileSlot = document.querySelector('[data-flow-mobile]');
    if (!controls || !mobileSlot) return;
    const desktopSlot = document.querySelector('[data-flow-desktop]');
    if (!desktopSlot) return;
    const mobile = window.matchMedia(mobileQuery);
    const place = () => {
      if (mobile.matches) mobileSlot.append(controls);
      else desktopSlot.append(controls);
    };
    if (mobile.addEventListener) mobile.addEventListener('change', place);
    else mobile.addListener(place);
    place();
  }

  function focusStep(heading) {
    clearTimeout(scrollTimer);
    cancelAnimationFrame(scrollFrame);
    heading?.setAttribute('tabindex', '-1');
    heading?.focus({ preventScroll: true });
    if (!window.matchMedia(mobileQuery).matches) return;
    const toTop = () => {
      if (!window.matchMedia(mobileQuery).matches) return;
      window.scrollTo(0, 0);
      if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
    };
    toTop();
    scrollFrame = requestAnimationFrame(toTop);
    // O Safari reajusta o viewport depois de fechar o teclado virtual.
    scrollTimer = setTimeout(toTop, 300);
  }

  function complete(kind, details = {}) {
    // A confirmação continua acessível mesmo quando o browser bloqueia storage.
    try {
      sessionStorage.setItem('public-flow-receipt', JSON.stringify({ kind, ...details }));
    } catch { /* Os detalhes são opcionais; o envio já foi aceite pela API. */ }
    location.replace(`/public-success.html?tipo=${encodeURIComponent(kind)}`);
  }

  AppModules.define('publicFlow', {
    setupNavigation: { get: () => setupNavigation },
    focusStep: { get: () => focusStep },
    complete: { get: () => complete },
  });
})();
