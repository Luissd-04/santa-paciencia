// Consola da plataforma: pedidos a /api/platform/*. Os dados ficam em memória
// até à próxima recarga (api.reset). Os endpoints novos podem ainda não existir
// no servidor: `soft` devolve null em 404/501 para a secção ficar vazia sem
// partir o resto. 423 (palavra-passe por confirmar) e 404 dos endpoints antigos
// sobem para a moldura (shell.js); 401 volta ao início de sessão.
(() => {
AppModules.define('consola', {
  api: { get: () => api },
});

const core = () => AppModules.core;
const cache = new Map();

function toLogin() {
  location.replace('/');
  return new Promise(() => {});
}

async function guard(run) {
  try { return await run(); }
  catch (error) {
    if (error?.status === 401) return toLogin();
    throw error;
  }
}

// Pedido com memória: o mesmo caminho não se repete até reset().
function cached(path, ttlKey = path) {
  if (!cache.has(ttlKey)) {
    const request = guard(() => core().apiGet(path)).then(payload => payload?.data ?? null);
    cache.set(ttlKey, request);
    request.catch(() => { if (cache.get(ttlKey) === request) cache.delete(ttlKey); });
  }
  return cache.get(ttlKey);
}

// Endpoint novo: sem servidor que o conheça (404/501), a secção fica vazia.
async function soft(path) {
  try { return await cached(path); }
  catch (error) {
    if (error?.status === 404 || error?.status === 501) return null;
    throw error;
  }
}

const list = value => (Array.isArray(value) ? value : []);

// Suporte: o estado de «por ler» muda a cada resposta, por isso não há memória
// longa. A mesma lista pedida duas vezes em 4 s (página + contador da barra
// lateral) reaproveita o pedido; qualquer escrita apaga-o. 404/501 = null.
let supportMemo = null;
const supportUrl = id => `/api/platform/support/tickets${id ? `/${encodeURIComponent(id)}` : ''}`;
async function supportSoft(run) {
  try { return (await guard(run))?.data ?? null; }
  catch (error) {
    if (error?.status === 404 || error?.status === 501) return null;
    throw error;
  }
}

const api = {
  reset: () => cache.clear(),
  me: () => guard(() => core().apiGet('/auth/me')).then(payload => payload?.data?.user || null),
  overview: () => cached('/api/platform/overview').then(data => data || {}),
  orgs: () => cached('/api/platform/organizations').then(list),
  incidents: () => cached('/api/platform/incidents').then(data => ({ incidents: list(data?.incidents), instance: list(data?.instance) })),
  trends: (weeks = 12) => soft(`/api/platform/trends?weeks=${weeks}`),
  usage: (days = 30) => soft(`/api/platform/usage?days=${days}`),
  org: id => soft(`/api/platform/organizations/${encodeURIComponent(id)}`),
  async audit({ before = null, limit = 50 } = {}) {
    const query = `limit=${limit}${before ? `&before=${encodeURIComponent(before)}` : ''}`;
    try {
      const payload = await guard(() => core().apiGet(`/api/platform/audit?${query}`));
      return list(payload?.data);
    } catch (error) {
      if (error?.status === 404 || error?.status === 501) return null;
      throw error;
    }
  },
  async saveOrg(id, body) {
    const payload = await guard(() => core().apiPut(`/api/platform/organizations/${encodeURIComponent(id)}`, body));
    const updated = payload?.data;
    const key = `/api/platform/organizations/${encodeURIComponent(id)}`;
    if (updated && typeof updated === 'object') cache.set(key, Promise.resolve(updated));
    // A lista guardada acompanha a alteração (estado visível nas outras páginas).
    const orgs = await cache.get('/api/platform/organizations')?.catch(() => null);
    const row = Array.isArray(orgs) ? orgs.find(o => String(o.id) === String(id)) : null;
    if (row) Object.assign(row, updated && typeof updated === 'object' ? updated : { status: body.status });
    return updated || null;
  },
  supportTickets() {
    if (!supportMemo || Date.now() - supportMemo.at > 4000) {
      const request = supportSoft(() => core().apiGet(`${supportUrl()}?status=all`))
        .then(data => (data ? { tickets: list(data.tickets), counts: data.counts || {} } : null));
      supportMemo = { at: Date.now(), request };
      request.catch(() => { if (supportMemo?.request === request) supportMemo = null; });
    }
    return supportMemo.request;
  },
  // Abrir o pedido marca-o como lido: nunca vem da memória.
  supportTicket(id) { supportMemo = null; return supportSoft(() => core().apiGet(supportUrl(id))); },
  async supportReply(id, body) { supportMemo = null; return (await guard(() => core().apiPost(`${supportUrl(id)}/messages`, body)))?.data ?? null; },
  async supportStatus(id, status) { supportMemo = null; return (await guard(() => core().apiPut(supportUrl(id), { status })))?.data ?? null; },
  // 400 = palavra-passe incorreta; sem redirecionar para o início de sessão.
  unlock: password => core().apiPost('/api/platform/unlock', { password }, { skipAuthRedirect: true }),
};
})();
