/* Santa Paciência — página de reservas dentro de outro site.
 *
 * Colar no site (WordPress: bloco «HTML personalizado»; Elementor: widget «HTML»):
 *
 *   <div data-sp-reservas="o-seu-alojamento"></div>
 *   <script src="https://<domínio da aplicação>/embed.js" async></script>
 *
 * Cria um iframe com /reservar/<slug>?embed=1, ajusta a altura ao conteúdo
 * (sem barra de deslocamento dentro do iframe) e, ao mudar de passo, leva o
 * topo do formulário à vista. Só aceita mensagens vindas do domínio de onde
 * este ficheiro foi carregado. O site tem de estar nos «Domínios autorizados»
 * da conta; caso contrário o browser recusa mostrar a página.
 *
 * Opções no <div>: data-titulo="…" (título do iframe, para leitores de ecrã)
 * e data-offset="80" (altura de um cabeçalho fixo do site, em píxeis).
 */
(function () {
  'use strict';
  if (window.__spReservasLoaded) return;
  window.__spReservasLoaded = true;

  function scriptOrigin() {
    var script = document.currentScript;
    if (!script) {
      var all = document.getElementsByTagName('script');
      for (var i = all.length - 1; i >= 0; i--) {
        if (/\/embed\.js(?:[?#]|$)/.test(all[i].src)) { script = all[i]; break; }
      }
    }
    try { return new URL(script.src, location.href).origin; } catch (e) { return ''; }
  }

  var ORIGIN = scriptOrigin();
  if (!ORIGIN) return;
  var SLUG = /^[a-z0-9][a-z0-9-]{0,119}$/i;
  var MIN_HEIGHT = 320;
  var MAX_HEIGHT = 20000;
  var frames = [];

  function mount(host) {
    if (!host || host.getAttribute('data-sp-montado')) return;
    var slug = (host.getAttribute('data-sp-reservas') || '').trim();
    if (!SLUG.test(slug)) {
      if (window.console) console.warn('[Santa Paciência] data-sp-reservas inválido:', slug);
      return;
    }
    host.setAttribute('data-sp-montado', '1');
    var iframe = document.createElement('iframe');
    iframe.src = ORIGIN + '/reservar/' + encodeURIComponent(slug) + '?embed=1';
    iframe.title = host.getAttribute('data-titulo') || 'Reservar estadia';
    iframe.setAttribute('loading', 'lazy');
    iframe.setAttribute('allow', 'payment');
    iframe.setAttribute('scrolling', 'no');
    iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    iframe.style.cssText = 'display:block;width:100%;min-width:0;height:1200px;border:0;overflow:hidden;background:transparent;';
    host.appendChild(iframe);
    frames.push({ iframe: iframe, host: host });
  }

  function mountAll() {
    var hosts = document.querySelectorAll('[data-sp-reservas]');
    for (var i = 0; i < hosts.length; i++) mount(hosts[i]);
  }

  function frameFor(source) {
    for (var i = 0; i < frames.length; i++) if (frames[i].iframe.contentWindow === source) return frames[i];
    return null;
  }

  // Leva o topo do iframe à vista se estiver acima do ecrã ou muito abaixo.
  function reveal(entry) {
    var offset = parseInt(entry.host.getAttribute('data-offset'), 10) || 16;
    var top = entry.iframe.getBoundingClientRect().top;
    if (top >= offset && top < window.innerHeight * 0.4) return;
    var y = top + (window.pageYOffset || document.documentElement.scrollTop) - offset;
    try { window.scrollTo({ top: y, behavior: 'smooth' }); } catch (e) { window.scrollTo(0, y); }
  }

  window.addEventListener('message', function (event) {
    if (event.origin !== ORIGIN) return;
    var data = event.data;
    if (!data || typeof data !== 'object' || data.source !== 'santa-paciencia') return;
    var entry = frameFor(event.source);
    if (!entry) return;
    if (data.type === 'sp-embed-height') {
      var height = Math.round(Number(data.height));
      if (!isFinite(height)) return;
      entry.iframe.style.height = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, height)) + 'px';
    } else if (data.type === 'sp-embed-step' || data.type === 'sp-embed-scroll') {
      reveal(entry);
    }
  });

  // Construtores de páginas (Elementor) podem acrescentar o bloco depois.
  window.SantaPacienciaReservas = { montar: mountAll };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountAll);
  else mountAll();
})();
