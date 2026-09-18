/* ═══════════════════════════════════════════════════════════════
   Santa Paciência — Service Worker
   Estratégia: Network-first para API e assets locais (HTML/CSS/JS
               ficam sempre frescos após deploy; cache é só fallback
               offline). Cache-first apenas para CDNs (fontes, libs).
═══════════════════════════════════════════════════════════════ */

const CACHE_NAME = 'sp-v28';
const CACHE_VERSION = 28;

/* Assets estáticos que devem funcionar offline */
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/pre-checkin.html',
  '/css/styles.css',
  '/css/styles/base.css',
  '/css/styles/shell.css',
  '/css/styles/alojamentos.css',
  '/css/styles/hospedes.css',
  '/css/styles/emails.css',
  '/css/styles/calendario.css',
  '/css/styles/complementos.css',
  '/css/styles/relatorios.css',
  '/css/styles/definicoes.css',
  '/css/styles/formularios.css',
  '/css/base.css',
  '/css/layout.css',
  '/css/components.css',
  '/css/themes.css',
  '/css/mobile.css',
  '/css/views/dashboard.css',
  '/css/views/reservas.css',
  '/css/views/despesas.css',
  '/css/views/operations.css',
  '/css/views/calendar.css',
  '/css/vendor/flag-icons.min.css',
  '/css/public-reservation.css',
  '/js/app.js',
  '/js/auth.js',
  '/js/state.js',
  '/js/helpers.js',
  '/js/ui.js',
  '/js/ui-blocks.js',
  '/js/pubsub.js',
  '/js/notifications.js',
  '/js/push.js',
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
  '/js/domain/table-cols.js',
  '/js/features/reserva-lista/lista-colunas.js',
  '/js/features/reserva-lista/lista-render.js',
  '/js/features/reserva-lista/detalhe.js',
  '/js/features/reserva-lista/detalhe-formularios.js',
  '/js/features/reserva-lista/documentos.js',
  '/js/features/reserva-lista/alojamento-painel.js',
  '/js/features/reserva-lista/acoes.js',
  '/js/features/reserva-lista/exportacao.js',
  '/js/features/reserva-wizard/editor.js',
  '/js/features/reserva-wizard/rascunhos.js',
  '/js/features/reserva-wizard/precos.js',
  '/js/features/reserva-wizard/datas-hospedes.js',
  '/js/features/reserva-wizard/disponibilidade.js',
  '/js/features/reserva-wizard/passos.js',
  '/js/features/reserva-wizard/guardar.js',
  '/js/features/alojamentos/galeria.js',
  '/js/features/alojamentos/servicos-heranca.js',
  '/js/features/alojamentos/exportacao.js',
  '/js/features/alojamentos/configuracao.js',
  '/js/features/calendario/mes-agenda.js',
  '/js/features/calendario/paisagem.js',
  '/js/features/calendario/timeline.js',
  '/js/features/calendario/interacoes.js',
  '/js/features/invoice/historico.js',
  '/js/features/invoice/arquivo.js',
  '/js/features/invoice/composicao.js',
  '/js/features/invoice/auxiliares.js',
  '/js/vendor/xlsx-0.20.3.min.js',
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

  // Dados autenticados, documentos e URLs com tokens nunca vão para a Cache API.
  if (url.origin === self.location.origin && !STATIC_ASSETS.includes(url.pathname) &&
      !/^\/(?:js|css)\//.test(url.pathname)) {
    event.respondWith(fetch(request, { cache: 'no-store' }));
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
    icon: '/favicon.png',
    badge: '/favicon.png',
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

  event.waitUntil((async () => {
    const windowClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    /* Só janelas da app (excluir páginas públicas, que não têm o handler de message) */
    const isApp = (w) => {
      const p = new URL(w.url).pathname;
      return !p.startsWith('/pre-checkin') && !p.startsWith('/reservar') && !/^\/reserva\//.test(p);
    };
    const client = windowClients.find((w) => new URL(w.url).origin === self.location.origin && isApp(w));
    if (client) {
      if ('focus' in client) await client.focus();
      client.postMessage({ type: 'sp-navigate', url: targetUrl });
      return;
    }
    if (clients.openWindow) await clients.openWindow(targetUrl);
  })());
});
