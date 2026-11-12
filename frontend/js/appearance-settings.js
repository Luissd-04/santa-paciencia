// Definições → A minha conta. Aparência: escolher o aspeto (atual, clássico ou
// vidro) e, no vidro, claro, escuro ou automático. Muda logo no ecrã e guarda
// na conta; se o servidor recusar, volta ao que estava. Versão da aplicação:
// o commit em execução e desde quando (vem com a sessão, /auth/me).
(() => {
AppModules.define('definicoes', {
  renderAppearance: { get: () => renderAppearance },
  saveAppearance: { get: () => saveAppearance },
  renderAbout: { get: () => renderAbout },
});

function renderAbout() {
  const version = AppModules.core.currentUser?.app_version || {};
  const commit = document.getElementById('about-commit');
  const started = document.getElementById('about-started');
  if (commit) commit.textContent = version.commit || 'Não indicada neste servidor';
  if (started) started.textContent = version.started_at
    ? new Date(version.started_at).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' }) : '—';
}

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
  if (document.documentElement.dataset.look) AppModules.core.ensureFeature('v2');
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
  'about-open': () => { AppModules.core.switchSettingsTab('sobre') },
  'appearance-set-look': (el, event, args) => saveAppearance({ ...window.AppAppearance.current(), look: args[0] }),
  'appearance-set-mode': (el, event, args) => saveAppearance({ ...window.AppAppearance.current(), mode: args[0] }),
}, 'click');

})();
