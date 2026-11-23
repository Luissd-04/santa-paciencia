// Vistas predefinidas (Definições → Vistas predefinidas). A conta guarda, por
// ecrã, como abre em computador e em telemóvel (/auth/view-prefs). Aqui fica o
// que o resto da aplicação precisa: que tipo de aparelho é este, o que está
// escolhido e a aplicação da escolha à PRIMEIRA abertura de cada ecrã numa
// sessão. Depois disso vale o que a pessoa for mudando (sessionStorage) até
// terminar a sessão. Sem nada guardado, tudo se comporta como sempre.
(() => {
// Mesmo critério do telemóvel em eventos.js e calendario.js.
const PHONE_QUERY = '(max-width: 600px)';
const SCREENS = ['eventos', 'calendario', 'reservas', 'hospedes', 'relatorios'];

function viewDevice() {
  return window.matchMedia?.(PHONE_QUERY).matches ? 'mobile' : 'desktop';
}

function userPrefs() {
  const prefs = AppModules.core.currentUser?.view_prefs;
  return prefs && typeof prefs === 'object' ? prefs : {};
}

// O que está guardado para este aparelho (ou para o indicado); null = de origem.
function viewPref(screen, device = viewDevice()) {
  return userPrefs()[screen]?.[device] ?? null;
}

const flagKey = (screen, device) => `vp:${device}:${screen}`;

// true só na primeira vez (por ecrã e tipo de aparelho) desde que a sessão começou.
function takeFirstOpen(screen) {
  const device = viewDevice();
  const key = flagKey(screen, device);
  if (AppModules.core.SS.get(key, false)) return false;
  AppModules.core.SS.set(key, true);
  return true;
}

// Chamado antes de iniciar cada ecrã (app.js initView).
function applyViewDefault(screen) {
  if (!SCREENS.includes(screen) || !takeFirstOpen(screen)) return;
  const value = viewPref(screen);
  if (value === null) return;
  const apply = AppModules[screen]?.applyViewDefault;
  if (typeof apply === 'function') apply(value);
}

// Ecrã inicial: só ao arrancar na raiz, uma vez por sessão e tipo de aparelho.
function homeViewDefault() {
  if (!takeFirstOpen('inicio')) return null;
  return viewPref('inicio');
}

// Terminar sessão ou trocar de organização: voltam a valer as predefinições.
AppModules.onReset('domain/view-prefs.js', () => {
  for (const device of ['desktop', 'mobile']) {
    for (const screen of [...SCREENS, 'inicio']) AppModules.core.SS.set(flagKey(screen, device), false);
  }
});

AppModules.define('core', {
  viewDevice: { get: () => viewDevice },
  viewPref: { get: () => viewPref },
  applyViewDefault: { get: () => applyViewDefault },
  homeViewDefault: { get: () => homeViewDefault },
});
})();
