// Definições → Aparência: escolher o aspeto (atual, clássico ou vidro) e, no
// vidro, claro, escuro ou automático. Muda logo no ecrã e guarda na conta;
// se o servidor recusar, volta ao que estava.
(() => {
AppModules.define('definicoes', {
  renderAppearance: { get: () => renderAppearance },
});

function renderAppearance() {
  const current = window.AppAppearance.current();
  document.querySelectorAll('[data-appearance-look]').forEach(button => {
    button.setAttribute('aria-checked', String(button.dataset.appearanceLook === current.look));
  });
  document.querySelectorAll('[data-appearance-mode]').forEach(button => {
    button.setAttribute('aria-checked', String(button.dataset.appearanceMode === current.mode));
  });
  const mode = document.getElementById('appearance-mode');
  if (mode) mode.hidden = current.look !== 'vidro';
}

let saving = Promise.resolve();
function saveAppearance(next) {
  const previous = window.AppAppearance.current();
  window.AppAppearance.apply(next);
  renderAppearance();
  // Pedidos em fila: dois toques rápidos ficam guardados pela ordem certa.
  saving = saving.then(async () => {
    try {
      const payload = await AppModules.core.apiPut('/auth/appearance', { appearance: next });
      if (AppModules.core.currentUser) AppModules.core.currentUser.appearance = payload?.data?.appearance || next;
    } catch (error) {
      window.AppAppearance.apply(previous);
      renderAppearance();
      AppModules.core.toast('❌ ' + (error?.payload?.error || 'Não foi possível guardar a aparência.'), 'error');
    }
  });
  return saving;
}

AppActions.register({
  'appearance-open': () => { AppModules.core.switchSettingsTab('aparencia') },
  'appearance-set-look': (el, event, args) => saveAppearance({ ...window.AppAppearance.current(), look: args[0] }),
  'appearance-set-mode': (el, event, args) => saveAppearance({ ...window.AppAppearance.current(), mode: args[0] }),
}, 'click');

})();
