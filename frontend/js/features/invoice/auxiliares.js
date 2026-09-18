'use strict';
const _INVOICE_OPEN_THREAD_KEY = 'sp-invoice-open-thread';

function _restoreLastOpenInvoiceThread() {
  if (_invoiceActiveThread) return; // já há uma thread aberta nesta sessão (troca de separador, não reload)
  let lastId;
  try { lastId = localStorage.getItem(_INVOICE_OPEN_THREAD_KEY); } catch { return; }
  if (!lastId) return;
  const thread = _invoiceConversas.find(t => String(t.id) === lastId);
  if (thread) openInvoiceThread(thread);
}

/* ── Badge de não lido no sidebar ── */
const _INVOICE_LAST_CHECK_KEY = 'sp-invoice-last-check';

function _updateInvoiceBadge() {
  const badge = document.getElementById('nav-badge-invoice');
  if (!badge) return;
  const lastCheck = localStorage.getItem(_INVOICE_LAST_CHECK_KEY);
  if (!lastCheck) { badge.style.display = 'none'; return; }
  const cutoff = new Date(lastCheck);
  const newCount = _invoiceConversas.filter(t => t._lastDate && new Date(t._lastDate) > cutoff).length;
  if (newCount > 0) {
    badge.textContent = newCount > 9 ? '9+' : newCount;
    badge.style.display = '';
  } else {
    badge.style.display = 'none';
  }
}

function _markInvoiceRead() {
  localStorage.setItem(_INVOICE_LAST_CHECK_KEY, new Date().toISOString());
  const badge = document.getElementById('nav-badge-invoice');
  if (badge) badge.style.display = 'none';
}

/* ── Filtro ── */
function filterInvoiceConversas() {
  if (_invoiceTab === 'arquivo') renderInvoiceArchive();
  else renderInvoiceThreadList(_invoiceConversas);
}

/* ── Helpers ── */
function initials(name) {
  return (name || '?').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* Renderiza o HTML de um email recebido dentro de um iframe sandbox (S11).
   Sem `allow-scripts`, nenhum JS do email executa; `allow-same-origin` serve
   apenas para o onload conseguir medir a altura; `allow-popups` deixa os
   links (target=_blank via <base>) abrirem em nova aba. */
function renderEmailBodySandboxed(body) {
  const doc = `<base target="_blank">` +
    `<style>body{margin:8px;font-family:'DM Sans',Helvetica,Arial,sans-serif;font-size:13px;color:#2b211b;word-break:break-word;}img{max-width:100%;height:auto;}</style>` +
    String(body || '');
  // O iframe só sabe a altura real do email depois de carregar (onload), o que
  // acontece DEPOIS do scroll inicial para o fundo do histórico — sem isto, o
  // histórico fica "quase" no fundo mas não exatamente, porque o resize destes
  // iframes empurra o conteúdo para baixo a seguir ao scroll já ter corrido.
  // _invoiceStickBottom reavalia se ainda estamos perto do fundo e reajusta.
  return `<iframe class="ib-body-frame" sandbox="allow-same-origin allow-popups" srcdoc="${esc(doc)}"
    onload="var ar=this.closest('.invoice-messages-area');var wasNear=ar&&(ar.scrollHeight-ar.scrollTop-ar.clientHeight<150);try{this.style.height=Math.min(this.contentDocument.body.scrollHeight+20,900)+'px'}catch(e){this.style.height='120px'}if(wasNear&&ar)ar.scrollTop=ar.scrollHeight;"></iframe>`;
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' });
}

function fmtDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('pt-PT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function formatMoney(v) {
  if (v == null) return '';
  return Number(v).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' });
}

function labelStatus(s) {
  const m = { confirmed:'Confirmada', pending:'Pendente', cancelled:'Cancelada', checked_in:'Check-in', checked_out:'Check-out' };
  return m[s] || s || '—';
}
