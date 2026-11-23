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
 * Copia o estilo do site: lê o fundo por trás do bloco (tema claro ou
 * escuro), a letra do texto e dos títulos, e o botão principal do site (cor,
 * cantos, maiúsculas). Vai no endereço do iframe (parâmetros sp_*), que o
 * servidor valida; o que o proprietário escolheu em «Aspeto» tem prioridade.
 *
 * No telemóvel desenha uma barra fixa no fundo do ecrã com o total e o botão
 * «Continuar» enquanto o formulário está à vista (dentro do iframe, que é tão
 * alto como o conteúdo, uma barra fixa ficava no fim, longe do ecrã).
 *
 * Opções no <div>: data-titulo="…" (título do iframe, para leitores de ecrã),
 * data-offset="80" (altura de um cabeçalho fixo do site, em píxeis) e
 * data-estilo="nao" (não copiar o estilo do site).
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
  var HEX = /^#[0-9a-f]{6}$/i;
  var MIN_HEIGHT = 320;
  var MAX_HEIGHT = 20000;
  var frames = [];

  // ── Estilo do site ──────────────────────────────────────────────────────
  function parseColor(value) {
    var m = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)/.exec(value || '');
    if (!m) return null;
    var a = m[4] === undefined ? 1 : (m[4].slice(-1) === '%' ? parseFloat(m[4]) / 100 : parseFloat(m[4]));
    return { r: Math.round(+m[1]), g: Math.round(+m[2]), b: Math.round(+m[3]), a: a };
  }
  function hex(c) {
    return '#' + [c.r, c.g, c.b].map(function (v) { var h = Math.max(0, Math.min(255, v)).toString(16); return h.length < 2 ? '0' + h : h; }).join('');
  }
  function luminance(c) {
    var f = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }
  function contrast(a, b) {
    var x = luminance(a), y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  function saturation(c) {
    var max = Math.max(c.r, c.g, c.b), min = Math.min(c.r, c.g, c.b);
    return max === 0 ? 0 : (max - min) / max;
  }

  // Fundo por trás do bloco: o primeiro antepassado com cor opaca.
  function backgroundBehind(el) {
    for (var node = el; node && node.nodeType === 1; node = node.parentElement) {
      var c = parseColor(getComputedStyle(node).backgroundColor);
      if (c && c.a >= 0.5) return c;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  }

  // «"Jost", sans-serif» → «Jost,sans-serif» (nome limpo + família genérica).
  function fontOf(el) {
    if (!el) return '';
    var stack = getComputedStyle(el).fontFamily || '';
    var parts = stack.split(',').map(function (p) { return p.trim().replace(/^["']|["']$/g, ''); }).filter(Boolean);
    if (!parts.length) return '';
    var first = parts[0].replace(/[^A-Za-z0-9 -]/g, '').slice(0, 60);
    var generic = parts.some(function (p) { return p.toLowerCase() === 'serif'; }) && !parts.some(function (p) { return p.toLowerCase() === 'sans-serif'; }) ? 'serif' : 'sans-serif';
    return first + ',' + generic;
  }

  function visible(el) {
    var r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 20) return false;
    var s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && parseFloat(s.opacity || '1') > 0.5;
  }

  // Botão principal do site: o mais «de marca» (cor saturada, diferente do
  // fundo), de preferência um «Reservar».
  var BUTTONS = '.elementor-button, .wp-block-button__link, .wp-element-button, .button, .btn, a[class*="button"], a[class*="btn"], button, input[type="submit"]';
  function mainButton(host, bg) {
    var list = document.querySelectorAll(BUTTONS);
    var best = null, bestScore = -1, fallback = null;
    for (var i = 0; i < list.length && i < 300; i++) {
      var el = list[i];
      if (host.contains(el) || !visible(el)) continue;
      if (!fallback) fallback = el;
      var c = parseColor(getComputedStyle(el).backgroundColor);
      if (!c || c.a < 0.8 || contrast(c, bg) < 1.3) continue;
      var text = (el.textContent || el.value || '').trim();
      var score = saturation(c) * 3 + (/reserv|book|marcar|agendar/i.test(text) ? 2 : 0) + (contrast(c, { r: 255, g: 255, b: 255 }) >= 3 ? 1 : 0);
      if (score > bestScore) { best = el; bestScore = score; }
    }
    return { el: best, any: best || fallback };
  }

  function detectStyle(host) {
    var out = {};
    try {
      var bg = backgroundBehind(host);
      out.sp_theme = contrast(bg, { r: 255, g: 255, b: 255 }) > contrast(bg, { r: 0, g: 0, b: 0 }) ? 'dark' : 'light';
      out.sp_bg = hex(bg).slice(1);
      var body = fontOf(host) || fontOf(document.body);
      if (body) out.sp_font = body;
      var heading = null;
      var heads = document.querySelectorAll('main h1, main h2, article h1, article h2, h1, h2');
      for (var i = 0; i < heads.length; i++) { if (!host.contains(heads[i]) && visible(heads[i])) { heading = heads[i]; break; } }
      var hfont = fontOf(heading);
      if (hfont) out.sp_hfont = hfont;
      var button = mainButton(host, bg);
      if (button.el) {
        var c = parseColor(getComputedStyle(button.el).backgroundColor);
        if (c) out.sp_accent = hex(c).slice(1);
      }
      if (button.any) {
        var s = getComputedStyle(button.any);
        var radius = parseFloat(s.borderTopLeftRadius) || 0;
        out.sp_radius = String(Math.min(99, Math.round(radius)));
        // Maiúsculas por CSS ou escritas assim («RESERVAR»).
        var label = (button.any.textContent || button.any.value || '').trim();
        var caps = label.length > 3 && label === label.toUpperCase() && /[A-ZÀ-Ý]/.test(label);
        out.sp_upper = s.textTransform === 'uppercase' || parseFloat(s.letterSpacing) >= 1 || caps ? '1' : '0';
      }
    } catch (e) { /* sem estilo detetado: fica o da conta */ }
    return out;
  }

  function query(params) {
    var parts = [];
    for (var key in params) if (Object.prototype.hasOwnProperty.call(params, key) && params[key]) parts.push(key + '=' + encodeURIComponent(params[key]));
    return parts.length ? '&' + parts.join('&') : '';
  }

  function mount(host) {
    if (!host || host.getAttribute('data-sp-montado')) return;
    var slug = (host.getAttribute('data-sp-reservas') || '').trim();
    if (!SLUG.test(slug)) {
      if (window.console) console.warn('[Santa Paciência] data-sp-reservas inválido:', slug);
      return;
    }
    host.setAttribute('data-sp-montado', '1');
    var style = host.getAttribute('data-estilo') === 'nao' ? {} : detectStyle(host);
    var iframe = document.createElement('iframe');
    iframe.src = ORIGIN + '/reservar/' + encodeURIComponent(slug) + '?embed=1' + query(style);
    iframe.title = host.getAttribute('data-titulo') || 'Reservar estadia';
    iframe.setAttribute('loading', 'lazy');
    iframe.setAttribute('allow', 'payment');
    iframe.setAttribute('scrolling', 'no');
    iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    iframe.style.cssText = 'display:block;width:100%;min-width:0;height:1200px;border:0;overflow:hidden;background:transparent;';
    host.appendChild(iframe);
    var entry = { iframe: iframe, host: host, bar: null, state: null };
    frames.push(entry);
    iframe.addEventListener('load', function () { send(entry, { type: 'sp-embed-hello' }); update(); });
  }

  function mountAll() {
    var hosts = document.querySelectorAll('[data-sp-reservas]');
    for (var i = 0; i < hosts.length; i++) mount(hosts[i]);
  }

  function frameFor(source) {
    for (var i = 0; i < frames.length; i++) if (frames[i].iframe.contentWindow === source) return frames[i];
    return null;
  }

  function send(entry, message) {
    message.source = 'santa-paciencia-host';
    try { entry.iframe.contentWindow.postMessage(message, ORIGIN); } catch (e) { /* iframe ainda sem página */ }
  }

  function offsetOf(entry) {
    return parseInt(entry.host.getAttribute('data-offset'), 10) || 16;
  }

  // Leva o topo do iframe à vista se estiver acima do ecrã ou muito abaixo.
  function reveal(entry) {
    var offset = offsetOf(entry);
    var top = entry.iframe.getBoundingClientRect().top;
    if (top >= offset && top < window.innerHeight * 0.4) return;
    var y = top + (window.pageYOffset || document.documentElement.scrollTop) - offset;
    try { window.scrollTo({ top: y, behavior: 'smooth' }); } catch (e) { window.scrollTo(0, y); }
  }

  // ── Barra fixa no telemóvel ─────────────────────────────────────────────
  function el(tag, css) {
    var node = document.createElement(tag);
    if (css) node.style.cssText = css;
    return node;
  }
  function makeBar(entry) {
    var bar = el('div', 'position:fixed;left:0;right:0;bottom:0;z-index:2147483000;display:none;box-sizing:border-box;'
      + 'padding:10px 16px calc(10px + env(safe-area-inset-bottom, 0px));font-family:inherit;line-height:1.3;'
      + 'box-shadow:0 -8px 24px rgba(0,0,0,.18);');
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Total da reserva');
    bar.setAttribute('data-sp-barra', '');
    var error = el('div', 'display:none;margin:0 0 8px;padding:8px 10px;font-size:13px;');
    error.setAttribute('role', 'alert');
    var row = el('div', 'display:flex;align-items:center;gap:10px;');
    var sum = el('div', 'min-width:0;flex:1;display:grid;');
    var label = el('span', 'font-size:11px;opacity:.75;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;');
    var total = el('strong', 'font-size:19px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;');
    var back = el('button', 'flex:none;width:46px;min-height:46px;padding:0;background:transparent;cursor:pointer;font:inherit;font-size:24px;line-height:1;');
    back.type = 'button';
    back.textContent = '‹';
    back.setAttribute('aria-label', 'Anterior');
    var next = el('button', 'flex:none;min-height:46px;padding:12px 20px;border:0;cursor:pointer;font:inherit;font-size:14px;');
    next.type = 'button';
    sum.appendChild(label);
    sum.appendChild(total);
    row.appendChild(sum);
    row.appendChild(back);
    row.appendChild(next);
    bar.appendChild(error);
    bar.appendChild(row);
    back.addEventListener('click', function () { send(entry, { type: 'sp-embed-action', action: 'prev' }); });
    next.addEventListener('click', function () { send(entry, { type: 'sp-embed-action', action: 'next' }); });
    document.body.appendChild(bar);
    return { root: bar, error: error, label: label, total: total, back: back, next: next };
  }

  function paintBar(entry) {
    var s = entry.state;
    if (!entry.bar) entry.bar = makeBar(entry);
    var b = entry.bar;
    var dark = s.theme === 'dark';
    var surface = HEX.test(s.surface) ? s.surface : (dark ? '#111214' : '#ffffff');
    var ink = dark ? '#ffffff' : '#23313b';
    var line = dark ? 'rgba(255,255,255,.18)' : 'rgba(35,49,59,.14)';
    var accent = HEX.test(s.accent) ? s.accent : '#843424';
    var onAccent = HEX.test(s.onAccent) ? s.onAccent : '#ffffff';
    var radius = s.square ? '0' : '12px';
    b.root.style.background = surface;
    b.root.style.color = ink;
    b.root.style.borderTop = '1px solid ' + line;
    b.label.textContent = s.label || '';
    b.label.style.textTransform = s.upper ? 'uppercase' : 'none';
    b.label.style.letterSpacing = s.upper ? '.1em' : '0';
    b.total.textContent = s.total || '';
    b.back.style.display = s.back ? '' : 'none';
    b.back.style.border = '1px solid ' + line;
    b.back.style.color = ink;
    b.back.style.borderRadius = radius;
    b.next.textContent = s.button || 'Continuar';
    b.next.disabled = !s.enabled;
    b.next.style.opacity = s.enabled ? '1' : '.6';
    b.next.style.background = accent;
    b.next.style.color = onAccent;
    b.next.style.borderRadius = radius;
    b.next.style.textTransform = s.upper ? 'uppercase' : 'none';
    b.next.style.letterSpacing = s.upper ? '.08em' : '0';
    b.error.textContent = s.error || '';
    b.error.style.display = s.error ? '' : 'none';
    b.error.style.background = dark ? 'rgba(231,76,60,.16)' : '#fef0f0';
    b.error.style.color = dark ? '#ffb3ab' : '#a32a1d';
    b.error.style.borderRadius = s.square ? '0' : '8px';
  }

  // Mostra a barra enquanto o formulário está à vista e a barra de dentro do
  // iframe (no fim do formulário) não está.
  function placeBar(entry) {
    var s = entry.state;
    if (!s) return;
    var rect = entry.iframe.getBoundingClientRect();
    var vh = window.innerHeight;
    var inView = rect.top < vh - 120 && rect.bottom > 160;
    var innerTop = rect.top + (Number(s.barTop) || 0);
    var innerBarVisible = innerTop < vh - 20 && innerTop + (Number(s.barHeight) || 0) > 0;
    var show = Boolean(s.mobile && s.visible && inView && !innerBarVisible);
    if (!show && !entry.bar) return;
    if (show) paintBar(entry);
    entry.bar.root.style.display = show ? 'block' : 'none';
  }

  var pending = 0;
  function update() {
    if (pending) return;
    pending = (window.requestAnimationFrame || setTimeout)(function () {
      pending = 0;
      for (var i = 0; i < frames.length; i++) {
        var entry = frames[i];
        var rect = entry.iframe.getBoundingClientRect();
        // Zona do iframe à vista (para o resumo no computador).
        if (rect.bottom > 0 && rect.top < window.innerHeight) send(entry, { type: 'sp-embed-viewport', top: Math.round(offsetOf(entry) - rect.top), height: window.innerHeight });
        placeBar(entry);
      }
    });
  }

  function cleanBar(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var str = function (v, max) { return typeof v === 'string' ? v.slice(0, max) : ''; };
    var num = function (v) { v = Number(v); return isFinite(v) ? v : 0; };
    return {
      mobile: raw.mobile === true, visible: raw.visible === true, enabled: raw.enabled === true, back: raw.back === true,
      total: str(raw.total, 60), label: str(raw.label, 80), button: str(raw.button, 40), error: str(raw.error, 200),
      barTop: num(raw.barTop), barHeight: num(raw.barHeight), theme: raw.theme === 'dark' ? 'dark' : 'light',
      accent: str(raw.accent, 7), onAccent: str(raw.onAccent, 7), surface: str(raw.surface, 7), square: raw.square === true, upper: raw.upper === true,
    };
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
      update();
    } else if (data.type === 'sp-embed-step' || data.type === 'sp-embed-scroll') {
      reveal(entry);
      update();
    } else if (data.type === 'sp-embed-bar') {
      entry.state = cleanBar(data.bar);
      update();
    }
  });
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);

  // Construtores de páginas (Elementor) podem acrescentar o bloco depois.
  window.SantaPacienciaReservas = { montar: mountAll, detetarEstilo: detectStyle };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountAll);
  else mountAll();
})();
