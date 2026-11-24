// Página de reservas dentro do site do cliente (iframe criado por /embed.js).
// O servidor marca <html data-embed="1"> só quando a organização pode
// incorporar a página; sem essa marca este módulo não faz nada.
//
// Mensagens para a página que contém o iframe (sem dados pessoais):
//  - { type: 'sp-embed-height', height }  altura do conteúdo, para o iframe
//    não ter barra de deslocamento própria;
//  - { type: 'sp-embed-step', step }      mudou de passo: a página de fora
//    leva o topo do iframe à vista;
//  - { type: 'sp-embed-scroll' }          abriu uma janela (fotos, quarto) ou
//    a confirmação: idem;
//  - { type: 'sp-embed-bar', bar }        no telemóvel, o total e o botão
//    «Continuar» para a barra fixa que o carregador desenha na página de fora
//    (uma barra fixa dentro de um iframe alto ficava no fim do iframe, longe
//    do ecrã).
//
// Mensagens da página de fora (só de window.parent):
//  - { type: 'sp-embed-action', action: 'next' | 'prev' }  botões da barra;
//  - { type: 'sp-embed-viewport', top, height }  zona do iframe à vista, para
//    manter o resumo «A sua reserva» à vista no computador (position: sticky
//    não funciona: o iframe não tem deslocamento próprio).
(() => {
const active = document.documentElement.dataset.embed === '1' && window.parent !== window;
const marked = document.documentElement.dataset.embed === '1';

AppModules.define('booking', {
  embed: { get: () => Object.freeze({ active: marked, showConfirmation }) },
});

// Origem de quem incorpora: o frame-ancestors do servidor já garante que é um
// site autorizado. Sem forma de a saber (Firefox sem referrer), '*' — as
// mensagens só levam a altura e o passo.
function parentOrigin() {
  try {
    const ancestor = location.ancestorOrigins?.[0];
    if (ancestor && ancestor !== 'null') return ancestor;
    if (document.referrer) return new URL(document.referrer).origin;
  } catch { /* sem origem conhecida */ }
  return '*';
}
const target = active ? parentOrigin() : '*';

function post(message) {
  if (!active) return;
  try { window.parent.postMessage({ source: 'santa-paciencia', ...message }, target); } catch { /* sem página de fora */ }
}

let lastHeight = 0;
let timer = null;
let frame = 0;
function contentHeight() {
  // A altura do conteúdo, não a do documento: com 100vh dentro do iframe a
  // altura do documento só crescia (o iframe cresce, o 100vh também).
  const page = document.querySelector('.booking-page') || document.body;
  let bottom = page.getBoundingClientRect().bottom;
  // Calendário aberto perto do fim: o iframe cresce para não o cortar.
  document.querySelectorAll('.date-pop').forEach(pop => { bottom = Math.max(bottom, pop.getBoundingClientRect().bottom + 8); });
  return Math.ceil(bottom + window.scrollY);
}
function sendHeight() {
  timer = null;
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    const height = contentHeight();
    if (Math.abs(height - lastHeight) < 2) return;
    lastHeight = height;
    post({ type: 'sp-embed-height', height });
    sendBar();
    placeSummary();
  });
}
// No máximo uma mensagem a cada 100 ms.
function scheduleHeight() {
  if (timer) return;
  timer = setTimeout(sendHeight, 100);
}

// ── Barra do telemóvel na página de fora ──────────────────────────────────
const mobileQuery = window.matchMedia('(max-width: 900px)');
const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
let lastBar = '';
let barFrame = 0;
function barState() {
  const slot = document.querySelector('.flow-mobile-slot');
  const next = document.getElementById('next-btn');
  const prev = document.getElementById('prev-btn');
  const done = Boolean(document.querySelector('.sp-embed-done'));
  const error = document.getElementById('step-error');
  const rect = slot?.getBoundingClientRect();
  const step = Number(document.body.dataset.bookingStep) || 1;
  return {
    mobile: mobileQuery.matches,
    visible: Boolean(slot && next && !done && rect && rect.height > 0),
    total: (document.getElementById('pn-bar-total')?.textContent || '').trim().slice(0, 60),
    label: (document.getElementById('pn-bar-sub')?.textContent || '').trim().slice(0, 80),
    button: (next?.textContent || 'Continuar').trim().slice(0, 40),
    enabled: Boolean(next && !next.disabled),
    back: Boolean(prev && step > 1 && !prev.disabled),
    error: error && error.style.display !== 'none' ? (error.textContent || '').trim().slice(0, 200) : '',
    barTop: rect ? Math.round(rect.top + window.scrollY) : 0,
    barHeight: rect ? Math.round(rect.height) : 0,
    theme: document.documentElement.dataset.spTheme === 'dark' ? 'dark' : 'light',
    accent: cssVar('--sp-accent'),
    onAccent: cssVar('--sp-on-accent'),
    surface: cssVar('--sp-surface'),
    square: document.documentElement.dataset.spCorners === 'square',
    upper: document.documentElement.dataset.spUpper === '1',
  };
}
function sendBar() {
  cancelAnimationFrame(barFrame);
  barFrame = requestAnimationFrame(() => {
    const bar = barState();
    const key = JSON.stringify(bar);
    if (key === lastBar) return;
    lastBar = key;
    post({ type: 'sp-embed-bar', bar });
  });
}

// ── Resumo à vista no computador ──────────────────────────────────────────
let summaryFrame = 0;
let viewport = null;
function placeSummary() {
  cancelAnimationFrame(summaryFrame);
  summaryFrame = requestAnimationFrame(() => {
    const panel = document.querySelector('.summary-panel');
    const grid = panel?.parentElement;
    if (!panel || !grid) return;
    if (!viewport || mobileQuery.matches) { panel.style.transform = ''; return; }
    const gridTop = grid.getBoundingClientRect().top + window.scrollY;
    const room = grid.offsetHeight - panel.offsetHeight;
    const wanted = viewport.top + 16 - gridTop;
    const y = Math.max(0, Math.min(room, wanted));
    panel.style.transform = y > 0 ? `translateY(${Math.round(y)}px)` : '';
  });
}

function onParentMessage(event) {
  if (event.source !== window.parent) return;
  if (target !== '*' && event.origin !== target) return;
  const data = event.data;
  if (!data || typeof data !== 'object' || data.source !== 'santa-paciencia-host') return;
  if (data.type === 'sp-embed-action') {
    const button = document.getElementById(data.action === 'prev' ? 'prev-btn' : data.action === 'next' ? 'next-btn' : '');
    if (button && !button.disabled) button.click();
  } else if (data.type === 'sp-embed-viewport') {
    const top = Number(data.top);
    const height = Number(data.height);
    if (!Number.isFinite(top) || !Number.isFinite(height)) return;
    viewport = { top, height };
    placeSummary();
  } else if (data.type === 'sp-embed-hello') {
    lastBar = '';
    sendBar();
  }
}

// Textos próprios da página incorporada.
const SHORT_STEPS = { 1: 'Datas', 2: 'Dados', 3: 'Confirmar' };
function embedTexts() {
  const kicker = document.querySelector('.summary-kicker');
  if (kicker) kicker.textContent = 'A sua reserva';
  // Nome curto dos passos para o telemóvel (o CSS escolhe qual se vê).
  document.querySelectorAll('.pn-steps li[data-step-dot]').forEach(li => {
    const short = SHORT_STEPS[li.dataset.stepDot];
    if (!short || li.querySelector('.sp-long')) return;
    const long = document.createElement('span');
    long.className = 'sp-long';
    long.textContent = li.textContent;
    const brief = document.createElement('span');
    brief.className = 'sp-short';
    brief.textContent = short;
    li.replaceChildren(long, brief);
  });
}

function watch() {
  embedTexts();
  if (!active) return;
  window.addEventListener('message', onParentMessage);
  const slot = document.querySelector('.flow-mobile-slot');
  if (slot) new MutationObserver(sendBar).observe(slot, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['style', 'disabled'] });
  if (mobileQuery.addEventListener) mobileQuery.addEventListener('change', () => { sendBar(); placeSummary(); });
  if (window.ResizeObserver) {
    const observer = new ResizeObserver(scheduleHeight);
    observer.observe(document.body);
    const page = document.querySelector('.booking-page');
    if (page) observer.observe(page);
  }
  window.addEventListener('load', scheduleHeight);
  window.addEventListener('resize', scheduleHeight);
  let step = document.body.dataset.bookingStep || '';
  new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes' && record.attributeName === 'data-booking-step') {
        const next = document.body.dataset.bookingStep || '';
        if (next && step && next !== step) post({ type: 'sp-embed-step', step: Number(next) });
        step = next;
        sendBar();
        placeSummary();
      }
      if (record.type === 'childList') {
        if ([...record.addedNodes].some(node => node.nodeType === 1 && node.matches('dialog'))) post({ type: 'sp-embed-scroll' });
        scheduleHeight();
      }
    }
  }).observe(document.body, { attributes: true, attributeFilter: ['data-booking-step'], childList: true });
  scheduleHeight();
}

// Ligações: dentro do iframe só continua a página de reservas (com embed=1);
// tudo o resto (página do pedido, sites externos) abre num separador novo,
// fora do site do cliente — o pagamento (Stripe) não funciona num iframe.
function onClick(event) {
  const link = event.target.closest?.('a[href]');
  if (!link || link.target === '_blank') return;
  let url;
  try { url = new URL(link.href, location.href); } catch { return; }
  if (!['http:', 'https:'].includes(url.protocol)) return;
  if (url.origin === location.origin && /^\/reservar\/[^/]+\/?$/.test(url.pathname)) {
    if (url.searchParams.get('embed') !== '1') { url.searchParams.set('embed', '1'); link.href = url.href; }
    return;
  }
  link.target = '_blank';
  link.rel = 'noopener';
}

// Pedido enviado: fica tudo dentro do iframe, com a ligação para a página do
// pedido num separador novo (é lá que o hóspede acompanha e, depois de aceite,
// paga). Abrir automaticamente seria bloqueado como janela não pedida.
function showConfirmation({ token, reference, brand, total }) {
  const esc = AppModules.booking.escapeHtml;
  const card = document.querySelector('.booking-card');
  if (!card) return;
  const href = /^[a-f0-9]{64}$/i.test(token || '') ? `/reserva/${token}` : '';
  card.innerHTML = `<section class="sp-embed-done" role="status" aria-live="polite">
    <span class="sp-embed-done-mark" aria-hidden="true">✓</span>
    <h2 tabindex="-1">Pedido enviado</h2>
    <p>${brand ? `Obrigado! O pedido chegou a <b>${esc(brand)}</b>.` : 'Obrigado! O pedido foi recebido.'} Hoje não paga nada: o alojamento confirma a disponibilidade e responde por email.</p>
    ${total ? `<p class="sp-embed-done-total">Total estimado: <b>${esc(total)}</b></p>` : ''}
    ${reference && !href ? `<p class="sp-embed-done-ref">Referência: <b>${esc(reference)}</b></p>` : ''}
    ${href ? `<a class="primary-btn sp-embed-done-link" href="${esc(href)}" target="_blank" rel="noopener">Ver o meu pedido <span aria-hidden="true">↗</span></a>
    <p class="sp-embed-done-note">Abre num separador novo, onde acompanha o pedido e, depois de aceite, faz o pagamento.</p>` : ''}
  </section>`;
  card.querySelector('h2')?.focus({ preventScroll: true });
  post({ type: 'sp-embed-scroll' });
  scheduleHeight();
  sendBar();
}

if (marked) {
  document.addEventListener('click', onClick, true);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch, { once: true });
  else watch();
}
})();
