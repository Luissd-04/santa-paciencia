// Definições → A minha conta. Aparência: escolher o aspeto (atual, clássico ou
// vidro) e, no vidro, claro, escuro ou automático. Muda logo no ecrã e guarda
// na conta; se o servidor recusar, volta ao que estava. Versão da aplicação:
// o commit em execução e desde quando (vem com a sessão, /auth/me).
(() => {
AppModules.define('definicoes', {
  renderAppearance: { get: () => renderAppearance },
  saveAppearance: { get: () => saveAppearance },
  renderAbout: { get: () => renderAbout },
  renderViewPrefs: { get: () => renderViewPrefs },
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

// ── Vistas predefinidas ──
// Opções por ecrã e aparelho. As de origem são as que a app usa sem nada guardado.
// No telemóvel (aspetos novos) os Eventos só têm a Semana: o Mês e a Lista não cabem (css/v2/eventos.css).
const VP_PHONE_EVENTOS = [['semana', 'Semana']];
const VP_SCREENS = [
  { id: 'eventos', name: 'Eventos', hint: 'Tarefas, limpezas e manutenções',
    desktop: [['calendar', 'Mês'], ['semana', 'Semana'], ['list', 'Lista']], mobile: VP_PHONE_EVENTOS,
    fallback: () => (document.documentElement.dataset.look ? 'semana' : 'calendar') },
  { id: 'calendario', name: 'Calendário', hint: 'Ocupação dos alojamentos',
    desktop: [['calendar', 'Mês'], ['timeline:7', 'Linha do tempo · 7 dias'], ['timeline:14', 'Linha do tempo · 14 dias'], ['timeline:30', 'Linha do tempo · 30 dias']],
    // A linha do tempo não existe no telemóvel (calendario.js usa sempre o Mês).
    mobile: [['calendar', 'Mês']], fallback: () => 'calendar' },
  { id: 'reservas', name: 'Reservas', hint: 'Período mostrado ao abrir',
    both: [['operational', 'Em curso e próximas'], ['past', 'Passadas']], fallback: () => 'operational' },
  { id: 'hospedes', name: 'Hóspedes', hint: 'Como se mostra a lista',
    both: [['list', 'Lista'], ['cards', 'Cartões']], fallback: () => 'cards' },
  { id: 'relatorios', name: 'Relatórios', hint: 'Separador que abre primeiro',
    both: [['faturamento', 'Faturação'], ['despesas', 'Despesas'], ['lucro', 'Lucro']], fallback: () => 'faturamento' },
  { id: 'inicio', name: 'Ecrã inicial', hint: 'O que abre ao entrar na app',
    both: [['dashboard', 'Painel'], ['calendario', 'Calendário'], ['reservas', 'Reservas'], ['eventos', 'Eventos']], fallback: () => 'dashboard' },
];
const VP_DEVICES = [['desktop', 'Computador'], ['mobile', 'Telemóvel']];

function viewPrefsNow() { return AppModules.core.currentUser?.view_prefs || {}; }

function renderViewPrefs() {
  const table = document.getElementById('vistas-table');
  if (!table) return;
  const esc = AppModules.core.escapeHtml;
  const prefs = viewPrefsNow();
  const head = `<div class="vistas-row vistas-head" role="row"><span role="columnheader">Ecrã</span>${VP_DEVICES.map(([, label]) => `<span role="columnheader">${label}</span>`).join('')}</div>`;
  const rows = VP_SCREENS.map(screen => {
    const cells = VP_DEVICES.map(([device, label]) => {
      const options = screen[device] || screen.both;
      const value = prefs[screen.id]?.[device] ?? screen.fallback();
      const select = `<select class="form-control" aria-label="${esc(screen.name)} no ${label.toLowerCase()}" data-vista-screen="${screen.id}" data-vista-device="${device}" data-on-change="vistas-set"${options.length < 2 ? ' disabled' : ''}>`
        + options.map(([id, text]) => `<option value="${id}"${id === value ? ' selected' : ''}>${esc(text)}</option>`).join('') + '</select>';
      return `<div class="vistas-cell" role="cell"><span class="vistas-device">${label}</span>${select}</div>`;
    }).join('');
    return `<div class="vistas-row" role="row"><div class="vistas-name" role="rowheader"><b>${esc(screen.name)}</b><small>${esc(screen.hint)}</small></div>${cells}</div>`;
  }).join('');
  table.innerHTML = head + rows;
}

let vistasTimer = null;
function vistasConfirm(text) {
  const status = document.getElementById('vistas-status');
  if (!status) return;
  status.textContent = text;
  status.classList.add('is-saved');
  clearTimeout(vistasTimer);
  vistasTimer = setTimeout(() => {
    status.classList.remove('is-saved');
    status.textContent = 'No telemóvel só aparecem vistas que funcionam nesse tamanho. Guardado automaticamente.';
  }, 2500);
}

let vistasSaving = Promise.resolve();
function saveViewPrefs(next, okText) {
  const previous = viewPrefsNow();
  if (AppModules.core.currentUser) AppModules.core.currentUser.view_prefs = next;
  // Pedidos em fila, como na aparência: ficam guardados pela ordem certa.
  vistasSaving = vistasSaving.then(async () => {
    try {
      const payload = await AppModules.core.apiPut('/auth/view-prefs', { view_prefs: next });
      if (AppModules.core.currentUser) AppModules.core.currentUser.view_prefs = payload?.data?.view_prefs || next;
      vistasConfirm(okText);
    } catch (error) {
      if (AppModules.core.currentUser) AppModules.core.currentUser.view_prefs = previous;
      renderViewPrefs();
      AppModules.core.toast('❌ ' + (error?.payload?.error || 'Não foi possível guardar as vistas.'), 'error');
    }
  });
  return vistasSaving;
}

function setViewPref(screen, device, value) {
  const prefs = structuredClone(viewPrefsNow());
  prefs[screen] = { ...(prefs[screen] || {}), [device]: value };
  return saveViewPrefs(prefs, '✓ Guardado');
}

AppActions.register({
  'vistas-open': () => { AppModules.core.switchSettingsTab('vistas') },
  'vistas-reset': () => { saveViewPrefs({}, '✓ Predefinições repostas').then(renderViewPrefs); renderViewPrefs(); },
}, 'click');
AppActions.register({
  'vistas-set': el => setViewPref(el.dataset.vistaScreen, el.dataset.vistaDevice, el.value),
}, 'change');

AppActions.register({
  'appearance-open': () => { AppModules.core.switchSettingsTab('aparencia') },
  'about-open': () => { AppModules.core.switchSettingsTab('sobre') },
  'appearance-set-look': (el, event, args) => saveAppearance({ ...window.AppAppearance.current(), look: args[0] }),
  'appearance-set-mode': (el, event, args) => saveAppearance({ ...window.AppAppearance.current(), mode: args[0] }),
}, 'click');

})();
