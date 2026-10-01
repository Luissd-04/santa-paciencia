// Navegação partilhada pelos formulários públicos.
(() => {
  function setupNavigation() {
    const controls = document.querySelector('[data-flow-controls]');
    const mobileSlot = document.querySelector('[data-flow-mobile]');
    if (!controls || !mobileSlot) return;
    const desktopSlot = controls.parentElement;
    const marker = document.createComment('Navegação em desktop');
    desktopSlot.insertBefore(marker, controls);
    const mobile = window.matchMedia('(max-width: 900px)');
    const place = () => {
      if (mobile.matches) mobileSlot.append(controls);
      else marker.after(controls);
    };
    mobile.addEventListener('change', place);
    place();
  }

  function focusStep(heading) {
    heading?.setAttribute('tabindex', '-1');
    heading?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
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
