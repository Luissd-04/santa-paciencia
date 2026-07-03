/* ═══════════════════════════════════════════════════════════════
   Santa Paciência — Service Worker
   Estratégia: Cache-first para assets estáticos,
               Network-first para API e HTML.
═══════════════════════════════════════════════════════════════ */

const CACHE_NAME = 'sp-v14';
const CACHE_VERSION = 14;

/* Assets estáticos que devem funcionar offline */
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/pre-checkin.html',
  '/css/styles.css',
  '/css/base.css',
  '/css/layout.css',
  '/css/components.css',
  '/css/themes.css',
  '/css/mobile.css',
  '/css/views/dashboard.css',
  '/css/views/reservas.css',
  '/css/views/despesas.css',
  '/css/views/operations.css',
  '/css/public-reservation.css',
  '/js/app.js',
  '/js/auth.js',
  '/js/state.js',
  '/js/helpers.js',
  '/js/ui.js',
  '/js/pubsub.js',
  '/js/notifications.js',
  '/js/dashboard.js',
  '/js/reserva-lista.js',
  '/js/reserva-wizard.js',
  '/js/pre-checkin.js',
  '/js/calendario.js',
  '/js/blocks.js',
  '/js/hospedes.js',
  '/js/alojamentos.js',
  '/js/despesas.js',
  '/js/fornecedores.js',
  '/js/relatorios.js',
  '/js/eventos.js',
  '/js/vouchers.js',
  '/js/precos.js',
  '/js/emails.js',
  '/js/invoice.js',
  '/js/validators.js',
  '/js/team.js',
  '/js/domain/dates.js',
  '/js/domain/pricing.js',
  '/js/domain/date-picker.js',
  '/favicon.png',
];

/* ─── Install: pré-cachear assets estáticos ─── */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      /* addAll falha silenciosamente se algum asset não existir ainda */
      return Promise.allSettled(
        STATIC_ASSETS.map((url) =>
          cache.add(url).catch(() => { /* ignorar assets em falta */ })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

/* ─── Activate: limpar caches antigas ─── */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

/* ─── Fetch: estratégia por tipo de pedido ─── */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  /* Ignorar pedidos não-GET e extensões do browser */
  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  /* API calls → Network-first (dados têm de ser frescos) */
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  /* CDN (fontes, lucide, chart.js, etc.) → Cache-first */
  if (
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com') ||
    url.hostname.includes('unpkg.com') ||
    url.hostname.includes('cdn.jsdelivr.net') ||
    url.hostname.includes('cdnjs.cloudflare.com')
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  /* Assets locais (HTML, CSS, JS, imagens) → Network-first para updates imediatos */
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request));
    return;
  }
});

/* ─── Estratégias ─── */

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    /* Offline e não em cache: devolver página principal em cache */
    if (request.destination === 'document') {
      return caches.match('/') || caches.match('/index.html');
    }
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(
      JSON.stringify({ error: 'offline', message: 'Sem ligação à internet' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/* ─── Push Notifications (preparado para quando o backend enviar) ─── */
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: 'Santa Paciência', body: event.data.text() };
  }

  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag || 'sp-notification',
    data: { url: data.url || '/' },
    requireInteraction: data.requireInteraction || false,
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Santa Paciência', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
