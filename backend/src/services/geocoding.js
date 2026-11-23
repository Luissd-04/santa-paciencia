// Pesquisa de moradas (Nominatim/OpenStreetMap) feita pelo servidor: o browser
// não pode chamar o Nominatim por causa da CSP (connect-src) e a política de
// utilização exige um User-Agent identificável e no máximo 1 pedido por segundo.
const { fetchWithTimeout } = require('./httpClient');

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'SantaPaciencia/1.0 (gestao de alojamento local)';
const TIMEOUT_MS = 8000;
let minGapMs = 1100;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 500;
const MAX_QUERY = 300;

const cache = new Map();
let lastCall = 0;
let queue = Promise.resolve();

class GeocodeError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Espaça os pedidos ao Nominatim (1 por segundo no total, não por utilizador).
function throttled(task) {
  const run = queue.then(async () => {
    const wait = lastCall + minGapMs - Date.now();
    if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
    lastCall = Date.now();
    return task();
  });
  queue = run.catch(() => {});
  return run;
}

async function search(rawQuery) {
  const q = typeof rawQuery === 'string' ? rawQuery.trim().replace(/\s+/g, ' ') : '';
  if (!q) throw new GeocodeError(400, 'Indique a morada a pesquisar.');
  if (q.length > MAX_QUERY) throw new GeocodeError(400, 'A morada é demasiado longa.');

  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;

  const url = `${ENDPOINT}?${new URLSearchParams({ format: 'json', q, limit: '1', 'accept-language': 'pt-PT' })}`;
  let rows;
  try {
    const resp = await throttled(() => fetchWithTimeout(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }));
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    rows = await resp.json();
    if (!Array.isArray(rows)) throw new Error('Resposta inválida');
  } catch {
    throw new GeocodeError(502, 'O serviço de mapas não está disponível. Tente novamente dentro de instantes.');
  }

  const first = rows[0];
  const lat = Number.parseFloat(first?.lat);
  const lon = Number.parseFloat(first?.lon);
  const value = first && Number.isFinite(lat) && Number.isFinite(lon)
    ? { lat, lon, display_name: String(first.display_name || '') }
    : null;
  // Só se guardam resultados válidos; "sem resultados" também (evita repetir pedidos iguais).
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
  return value;
}

// Só para testes: limpa a cache e permite encurtar o intervalo entre pedidos.
function resetForTests({ gapMs = 1100 } = {}) { cache.clear(); lastCall = 0; minGapMs = gapMs; }

module.exports = { search, resetForTests, GeocodeError };
