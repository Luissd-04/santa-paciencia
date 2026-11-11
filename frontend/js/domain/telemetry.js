// Utilização da aplicação (POST /api/telemetry): conta as vistas abertas e envia
// só totais por vista, de 60 em 60 segundos e quando a página fica escondida.
// Só começa depois de start() (utilizador com sessão). Erros são ignorados: a
// telemetria nunca deve incomodar quem usa a app.
(() => {
  const FLUSH_MS = 60 * 1000;
  // Sem protótipo: um nome de vista nunca colide com propriedades de Object.
  const pending = Object.create(null);
  let started = false;
  let firstSendDone = false;

  // «standalone» quando a app está instalada (PWA); senão «browser».
  function displayMode() {
    try {
      const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
      return standalone ? 'standalone' : 'browser';
    } catch { return 'browser'; }
  }

  // Mesmo identificador de separador que helpers.js envia (live.js).
  function clientId() {
    try { return window.AppModules?.core?.liveClientId || null; } catch { return null; }
  }

  function flush() {
    const views = { ...pending };
    if (!Object.keys(views).length) return;
    for (const name in pending) delete pending[name];

    const body = { views };
    if (!firstSendDone) {
      body.display_mode = displayMode();
      firstSendDone = true;
    }
    const headers = { 'Content-Type': 'application/json' };
    const id = clientId();
    if (id) headers['X-Client-Id'] = id;

    try {
      fetch('/api/telemetry', {
        method: 'POST',
        credentials: 'include',
        keepalive: true,
        headers,
        body: JSON.stringify(body),
      }).catch(() => {});
    } catch { /* sem fetch ou sem rede: ignorar */ }
  }

  // Chamada em showView, com o nome final da vista.
  function view(name) {
    if (typeof name !== 'string' || !name) return;
    pending[name] = (pending[name] || 0) + 1;
  }

  // Chamada quando o utilizador fica autenticado. Repetir não duplica nada.
  function start() {
    if (started) return;
    started = true;
    setInterval(flush, FLUSH_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
  }

  window.AppTelemetry = Object.freeze({ start, view });
})();
