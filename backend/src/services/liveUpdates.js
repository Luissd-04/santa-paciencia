// Avisos em direto às páginas abertas da equipa (GET /api/live, Server-Sent
// Events). O servidor não envia dados, só «isto mudou»: a página volta a pedir
// o que precisa pela API autenticada de sempre. Assim o sino e os ecrãs de
// eventos atualizam-se quando há novidades, em vez de perguntarem a cada minuto.
//
// Tópicos: `notifications` (o sino) e `events` (tarefas e eventos, incluindo
// alterações feitas no Google Tasks). Fica num só processo: o servidor corre
// como uma instância (SQLite).
const { localDay } = require('./dates');

const HEARTBEAT_MS = 25000;
const DEBOUNCE_MS = 300;
const MAX_CLIENTS_PER_ORG = 50;
const TOPICS = ['notifications', 'events'];

const clients = new Map(); // organizationId → Set<res>
const pending = new Map(); // organizationId → { topics: Set, timer }

function send(res, event, data) {
  try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch { /* ligação fechada */ }
}

// Liga uma página. Sem compressão nem cache (no-transform), para cada aviso
// chegar logo; o comentário periódico mantém a ligação viva nos proxies.
function subscribe(req, res) {
  const organizationId = req.user.organization_id;
  const set = clients.get(organizationId) || new Set();
  if (set.size >= MAX_CLIENTS_PER_ORG) return res.status(429).json({ error: 'Demasiadas ligações abertas.' });
  res.status(200).set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store, no-transform',
    'X-Accel-Buffering': 'no',
    Connection: 'keep-alive',
  });
  res.flushHeaders?.();
  res.write('retry: 5000\n\n');
  send(res, 'ready', { topics: TOPICS });
  set.add(res);
  clients.set(organizationId, set);
  startClock();
  const heartbeat = setInterval(() => { try { res.write(': ping\n\n'); } catch { /* fechada */ } }, HEARTBEAT_MS);
  heartbeat.unref?.();
  req.on('close', () => {
    clearInterval(heartbeat);
    set.delete(res);
    if (!set.size) clients.delete(organizationId);
  });
}

// Pede um aviso. Pode ser chamado dentro de uma transação: o envio só sai
// depois (temporizador) e junta os pedidos seguidos num só aviso por tópico.
// `origin`: o separador que fez a alteração (cabeçalho X-Client-Id), para esse
// separador não recarregar o ecrã onde está; sem ele, uma alteração do servidor.
function publish(organizationId, topics = ['notifications'], { origin = 'server' } = {}) {
  if (!organizationId) return;
  const entry = pending.get(organizationId) || { topics: new Set(), origins: new Set(), timer: null };
  for (const topic of [].concat(topics)) entry.topics.add(topic);
  entry.origins.add(origin);
  if (!entry.timer) {
    entry.timer = setTimeout(() => {
      pending.delete(organizationId);
      const set = clients.get(organizationId);
      if (set) for (const res of set) send(res, 'change', { topics: [...entry.topics], origins: [...entry.origins] });
    }, DEBOUNCE_MS);
    entry.timer.unref?.();
  }
  pending.set(organizationId, entry);
}

function publishAll(topics) {
  for (const organizationId of clients.keys()) publish(organizationId, topics);
}

// O que muda só com o tempo: à meia-noite os check-ins de hoje são outros; de
// hora a hora, prazos (ex.: pagamento online por reconciliar há mais de 23 h).
// Arranca com a primeira página ligada.
let clockTimer = null;
const hourOf = date => Math.floor(date.getTime() / 3600000);
function startClock(now = () => new Date()) {
  if (clockTimer) return;
  let lastDay = localDay(now()), lastHour = hourOf(now());
  clockTimer = setInterval(() => {
    const date = now(), day = localDay(date), hour = hourOf(date);
    if (day !== lastDay || hour !== lastHour) publishAll(['notifications']);
    lastDay = day;
    lastHour = hour;
  }, 60000);
  clockTimer.unref?.();
}
function stopClock() { clearInterval(clockTimer); clockTimer = null; }

// Middleware: uma alteração da equipa que correu bem avisa as páginas da
// organização (cobre edições, pagamentos, tarefas, faturas, estados…).
function afterWrite(req, res, next) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.on('finish', () => {
      // `res.locals.liveQuiet`: pedidos que não alteram nada por si (avisam só se mudar).
      if (res.statusCode < 400 && req.user?.organization_id && !res.locals.liveQuiet) {
        const client = req.get('X-Client-Id');
        publish(req.user.organization_id, TOPICS, { origin: /^[A-Za-z0-9-]{8,64}$/.test(client || '') ? client : 'unknown' });
      }
    });
  }
  next();
}

const connections = organizationId => clients.get(organizationId)?.size || 0;

module.exports = { TOPICS, subscribe, publish, publishAll, startClock, stopClock, afterWrite, connections };
