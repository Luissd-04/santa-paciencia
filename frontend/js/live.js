// Avisos em direto do servidor (GET /api/live). O servidor só diz «isto mudou»
// (tópicos `notifications` e `events`); quem está à escuta volta a pedir os
// dados à API. Substitui os pedidos a cada minuto do sino.
(() => {
AppModules.define('core', {
  liveClientId: { get: () => CLIENT_ID },
  onLive: { get: () => onLive },
  startLiveUpdates: { get: () => startLiveUpdates },
  stopLiveUpdates: { get: () => stopLiveUpdates },
});

// Identifica este separador nos pedidos à API (helpers.js): uma alteração
// feita aqui não recarrega os ecrãs deste separador, só os dos outros.
const CLIENT_ID = (crypto.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
const TOPICS = ['notifications', 'events'];
let source = null;
let connectedOnce = false;
let retryTimer = null;

// Os avisos passam pelo PubSub da aplicação (pubsub.js), como «live:events».
function onLive(topic, handler) {
  return PubSub.on(`live:${topic}`, () => {
    try { handler(); } catch (error) { console.warn('Aviso em direto:', error); }
  });
}

function fire(topics) {
  for (const topic of topics) if (TOPICS.includes(topic)) PubSub.emit(`live:${topic}`);
}

function startLiveUpdates() {
  if (source || typeof EventSource === 'undefined') return;
  clearTimeout(retryTimer);
  source = new EventSource(`${AppModules.core.API_BASE}/api/live`, { withCredentials: true });
  // Ao voltar a ligar (rede, telemóvel em espera), pode ter mudado algo entretanto.
  source.addEventListener('ready', () => {
    if (connectedOnce) fire(TOPICS);
    connectedOnce = true;
  });
  source.addEventListener('change', event => {
    let data;
    try { data = JSON.parse(event.data); } catch { return; }
    const origins = Array.isArray(data.origins) ? data.origins : [];
    const ownChange = origins.length > 0 && origins.every(origin => origin === CLIENT_ID);
    // O sino atualiza-se sempre; os ecrãs, só com alterações feitas noutro lado.
    fire((data.topics || []).filter(topic => topic === 'notifications' || !ownChange));
  });
  // O browser volta a ligar sozinho; se desistir (ex.: sessão terminada),
  // tentar de novo daqui a um minuto.
  source.addEventListener('error', () => {
    if (source?.readyState !== EventSource.CLOSED) return;
    source = null;
    retryTimer = setTimeout(() => { if (AppModules.core.currentUser) startLiveUpdates(); }, 60000);
  });
}

function stopLiveUpdates() {
  clearTimeout(retryTimer);
  source?.close();
  source = null;
  connectedOnce = false;
}

AppModules.onReset('live.js', stopLiveUpdates);
})();
