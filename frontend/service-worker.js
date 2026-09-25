/* ═══════════════════════════════════════════════════════════════
   Santa Paciência — Service Worker
   Estratégia: Network-first para API e assets locais (HTML/CSS/JS
               ficam sempre frescos após deploy; cache é só fallback
               offline). Cache-first apenas para CDNs (fontes, libs).
═══════════════════════════════════════════════════════════════ */

const CACHE_NAME = 'sp-v39';
const CACHE_VERSION = 37;
const CACHE_PREFIX = 'sp-';

/* Núcleo da aplicação e páginas públicas: pré-cacheado na instalação */
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/pre-checkin.html',
  '/reservation-status.html',
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
  '/css/mobile/base.css',
  '/css/mobile/reservas.css',
  '/css/mobile/vouchers-operacoes.css',
  '/css/mobile/hospedes-despesas.css',
  '/css/mobile/alojamentos-eventos.css',
  '/css/mobile/paisagem.css',
  '/css/mobile/ajustes.css',
  '/js/public-reservation.js',
  '/js/features/public-reservation/helpers.js',
  '/js/features/public-reservation/landing.js',
  '/js/features/public-reservation/dados-hospedes.js',
  '/js/features/public-reservation/disponibilidade.js',
  '/js/features/public-reservation/precos.js',
  '/js/features/public-reservation/submissao.js',
  '/css/views/dashboard.css',
  '/css/views/reservas.css',
  '/css/views/despesas.css',
  '/css/views/operations.css',
  '/css/views/calendar.css',
  '/css/vendor/flag-icons.min.css',
  '/css/public-reservation.css',
  '/css/reservation-status.css',
  '/js/app.js',
  '/js/auth.js',
  '/js/state.js',
  '/js/helpers.js',
  '/js/domain/modules.js',
  '/js/domain/actions.js',
  '/js/index-actions.js',
  '/js/public-reservation-actions.js',
  '/js/ui.js',
  '/js/ui-blocks.js',
  '/js/pubsub.js',
  '/js/notifications.js',
  '/js/dashboard.js',
  '/js/pre-checkin.js',
  '/js/reservation-status.js',
  '/js/validators.js',
  '/js/domain/pagination.js',
  '/js/domain/event-types.js',
  '/js/domain/features.js',
  '/js/domain/libraries.js',
  '/js/domain/dates.js',
  '/js/domain/pricing.js',
  '/js/domain/date-picker.js',
  '/js/domain/table-cols.js',
  '/js/domain/export-columns.js',
  '/favicon.png',
];

/* Módulos carregados pela vista que os usa (ver js/domain/features.js).
   Não entram no pré-cache: são guardados em cache no primeiro pedido, pelo
   network-first abaixo. A lista existe para o verificador de recursos poder
   confirmar que o service worker e o registo dizem o mesmo. */
const FEATURE_ASSETS = [
  '/js/reserva-wizard.js',
  '/js/features/reserva-wizard/editor.js',
  '/js/features/reserva-wizard/rascunhos.js',
  '/js/features/reserva-wizard/precos.js',
  '/js/features/reserva-wizard/datas-hospedes.js',
  '/js/features/reserva-wizard/disponibilidade.js',
  '/js/features/reserva-wizard/passos.js',
  '/js/features/reserva-wizard/guardar.js',
  '/js/reserva-lista.js',
  '/js/features/reserva-lista/lista-dados.js',
  '/js/features/reserva-lista/lista-colunas.js',
  '/js/features/reserva-lista/lista-render.js',
  '/js/features/reserva-lista/detalhe.js',
  '/js/features/reserva-lista/detalhe-formularios.js',
  '/js/features/reserva-lista/documentos.js',
  '/js/features/reserva-lista/alojamento-painel.js',
  '/js/features/reserva-lista/acoes.js',
  '/js/features/reserva-lista/exportacao.js',
  '/js/reserva-detalhe-tabs.js',
  '/js/blocks.js',
  '/js/calendario.js',
  '/js/features/calendario/dados.js',
  '/js/features/calendario/mes-agenda.js',
  '/js/features/calendario/paisagem.js',
  '/js/features/calendario/timeline.js',
  '/js/features/calendario/interacoes.js',
  '/js/eventos.js',
  '/js/hospedes.js',
  '/js/features/hospedes/paises.js',
  '/js/features/hospedes/lista.js',
  '/js/features/hospedes/detalhe.js',
  '/js/features/hospedes/exportacao.js',
  '/js/alojamentos.js',
  '/js/features/alojamentos/galeria.js',
  '/js/features/alojamentos/servicos-heranca.js',
  '/js/features/alojamentos/exportacao.js',
  '/js/features/alojamentos/configuracao.js',
  '/js/despesas.js',
  '/js/relatorios.js',
  '/js/vouchers.js',
  '/js/precos.js',
  '/js/invoice.js',
  '/js/features/invoice/historico.js',
  '/js/features/invoice/arquivo.js',
  '/js/features/invoice/composicao.js',
  '/js/features/invoice/auxiliares.js',
  '/js/emails.js',
  '/js/features/emails/codes.js',
  '/js/features/emails/editor.js',
  '/js/features/emails/preview.js',
  '/js/fornecedores.js',
  '/js/team.js',
  '/js/push.js',
];

/* Marcação por vista (frontend/views/*.html), pedida por ensureViewMarkup()
   na primeira abertura — mesma estratégia network-first dos módulos acima,
   nunca pré-cacheada no arranque. */
const VIEW_ASSETS = [
  '/views/reservas.html',
  '/views/calendario.html',
  '/views/eventos.html',
  '/views/alojamentos.html',
  '/views/alojamento-detalhe.html',
  '/views/hospedes.html',
  '/views/hospede-detalhe.html',
  '/views/invoice.html',
  '/views/despesas.html',
  '/views/relatorios.html',
  '/views/vouchers.html',
  '/views/precos.html',
  '/views/definicoes.html',
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
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
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
      !/^\/(?:js|css|views)\//.test(url.pathname)) {
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
