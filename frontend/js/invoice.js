// Estado privado; interface partilhada em AppModules.invoice.
(() => {
AppModules.define('invoice', {
  _invoiceActiveEmail: { get: () => _invoiceActiveEmail, set: value => { _invoiceActiveEmail = value; } },
  _invoiceActiveThread: { get: () => _invoiceActiveThread, set: value => { _invoiceActiveThread = value; } },
  _invoiceArchivedKeys: { get: () => _invoiceArchivedKeys, set: value => { _invoiceArchivedKeys = value; } },
  _invoiceConversas: { get: () => _invoiceConversas, set: value => { _invoiceConversas = value; } },
  _invoiceCurrentMessages: { get: () => _invoiceCurrentMessages, set: value => { _invoiceCurrentMessages = value; } },
  _invoicePaging: { get: () => _invoicePaging, set: value => { _invoicePaging = value; } },
  _invoiceReplyTarget: { get: () => _invoiceReplyTarget, set: value => { _invoiceReplyTarget = value; } },
  _invoiceTab: { get: () => _invoiceTab, set: value => { _invoiceTab = value; } },
  _sendEmail: { get: () => _sendEmail },
  _snippet: { get: () => _snippet },
  _startInvoicePoll: { get: () => _startInvoicePoll },
  _stopInvoicePoll: { get: () => _stopInvoicePoll },
  getInvoiceThreadQuery: { get: () => getInvoiceThreadQuery },
  invoiceArquivoPaged: { get: () => invoiceArquivoPaged },
  invoiceConversasPaged: { get: () => invoiceConversasPaged },
  loadInvoiceConversas: { get: () => loadInvoiceConversas },
  loadInvoiceView: { get: () => loadInvoiceView },
  renderInvoiceArchive: { get: () => renderInvoiceArchive },
  switchInvoiceTab: { get: () => switchInvoiceTab },
});

/* ═══════════════════════════════════════════════════════════════
   Santa Paciência — Invoice & Conversas
═══════════════════════════════════════════════════════════════ */

'use strict';

let _invoiceConversas = [];
let _invoiceActiveThread = null;
let _invoiceActiveEmail = null;
let _invoiceTab = 'conversas';
let _invoicePollTimer = null;
let _invoiceArchivedKeys = new Set();
let _invoiceCurrentMessages = [];
let _invoiceReplyTarget = null; // { gmailThreadId, messageIdHeader, subject } — só existe após clique explícito em "responder"
let _invoicePaging = {}; // por thread.id: { dbCursor, dbDone, gmailPageToken, gmailDone, loading }

/* ── Envio de email (fora do API_BASE /api) ── */
async function _sendEmail(to, subject, html, to_name, reservation_id, replyTarget) {
  const res = await fetch('/auth/email/send', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to, subject, html, to_name: to_name || null, reservation_id: reservation_id || null,
      thread_id: replyTarget?.gmailThreadId || null,
      in_reply_to_message_id: replyTarget?.messageIdHeader || null,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

/* ── Entrada principal ── */
function loadInvoiceView() {
  _stopInvoicePoll();
  AppModules.invoice._markInvoiceRead();
  switchInvoiceTab(_invoiceTab, false);
  if (_invoiceTab === 'conversas') loadInvoiceConversas();
}

function _stopInvoicePoll() {
  if (_invoicePollTimer) { clearInterval(_invoicePollTimer); _invoicePollTimer = null; }
}

function _startInvoicePoll(thread) {
  _stopInvoicePoll();
  _invoicePollTimer = setInterval(() => AppModules.invoice.loadThreadMessages(thread, { silent: true }), 30000);
}

/* ── Tabs ── */
function switchInvoiceTab(tab, load = true) {
  _invoiceTab = tab;
  document.querySelectorAll('.inv-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.getElementById('invoice-tab-conversas').style.display = tab === 'conversas' ? '' : 'none';
  document.getElementById('invoice-tab-arquivo').style.display   = tab === 'arquivo'   ? '' : 'none';
  document.getElementById('invoice-tab-faturas').style.display   = tab === 'faturas'   ? '' : 'none';

  const btnNova = document.getElementById('btn-nova-conversa');
  if (btnNova) btnNova.style.display = tab === 'conversas' ? '' : 'none';

  const searchBox = document.querySelector('.invoice-toolbar .search-box');
  if (searchBox) searchBox.style.display = tab === 'faturas' ? 'none' : '';

  if (load && tab === 'conversas') loadInvoiceConversas();
  if (load && tab === 'arquivo')   renderInvoiceArchive();
  if (window.lucide) lucide.createIcons();
}

/* ── Carregar conversas ──
   As conversas vêm prontas do servidor (GET /api/email/threads), paginadas.
   Antes, esta vista carregava TODAS as reservas e TODOS os hóspedes por
   páginas e cruzava-os em memória — numa base grande isso eram centenas de
   pedidos antes de a lista aparecer. O servidor faz agora esse cruzamento.  */
const invoiceConversasPaged = AppModules.core.createPagedCollection('/auth/email/threads',
  () => renderInvoiceThreadState('conversas'));
const invoiceArquivoPaged = AppModules.core.createPagedCollection('/auth/email/threads',
  () => renderInvoiceThreadState('arquivo'));

function getInvoiceThreadQuery(archived) {
  const query = { archived: archived ? '1' : '0' };
  const search = (document.getElementById('invoice-search')?.value || '').trim();
  if (search) query.search = search;
  return query;
}

// O servidor devolve colunas da base; a vista usa os nomes que já tinha.
function _threadFromRow(row) {
  const activeStatuses = new Set(['confirmed', 'checked_in']);
  const alojNome = row.alojamento || '';
  return {
    id: row.id,
    guestName: row.guest_name || '—',
    guestEmail: row.guest_email || '',
    checkin: row.check_in,
    checkout: row.check_out,
    status: row.status,
    alojamento: alojNome,
    total: row.total_amount,
    _standalone: !!row.standalone,
    _alojInitials: activeStatuses.has(row.status) && alojNome
      ? alojNome.split(' ').filter(w => w.length > 2).map(w => w[0].toUpperCase()).join('').slice(0, 3)
      : null,
    _lastDate: row.last_sent_at || null,
    _lastSnippet: row.last_snippet || null,
  };
}

// Carregamento, erro e lista vazia são estados distintos: uma falha de rede
// não pode aparecer como "sem conversas".
function renderInvoiceThreadState(tab) {
  const arquivo = tab === 'arquivo';
  const paged = arquivo ? invoiceArquivoPaged : invoiceConversasPaged;
  const state = paged.state;
  const ids = arquivo
    ? { list: 'invoice-archive-list', empty: 'invoice-archive-empty', loading: 'invoice-archive-loading',
        error: 'invoice-archive-error', errorDetail: 'invoice-archive-error-detail',
        pagination: 'invoice-archive-pagination', detail: 'invoice-archive-detail' }
    : { list: 'invoice-thread-list', empty: 'invoice-thread-empty', loading: 'invoice-thread-loading',
        error: 'invoice-thread-error', errorDetail: 'invoice-thread-error-detail',
        pagination: 'invoice-thread-pagination', detail: 'invoice-thread-detail' };

  const show = (id, visible, text) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = visible ? '' : 'none';
    if (text !== undefined) el.textContent = text;
  };

  show(ids.loading, state.loading && !state.rows.length);
  show(ids.error, !!state.error);
  show(ids.errorDetail, !!state.error, state.error || '');
  show(ids.empty, !state.loading && !state.error && !state.rows.length);

  AppModules.core.renderPagination(ids.pagination, state, page => paged.load(getInvoiceThreadQuery(arquivo), { page }));

  const list = document.getElementById(ids.list);
  if (list) list.querySelectorAll('.invoice-thread-item').forEach(el => el.remove());
  if (state.error) return;

  const threads = state.rows.map(_threadFromRow);
  if (!arquivo) _invoiceConversas = threads;
  renderInvoiceThreadList(threads, { listId: ids.list, emptyId: ids.empty, detailId: ids.detail });
  if (!arquivo) {
    AppModules.invoice._updateInvoiceBadge();
    AppModules.invoice._restoreLastOpenInvoiceThread();
  }
}

async function loadInvoiceConversas() {
  // O servidor filtra o arquivo; as chaves arquivadas continuam a ser lidas
  // porque o botao Arquivar/Restaurar do detalhe depende delas. E uma tabela
  // pequena (so as chaves), nao a coleccao de reservas.
  try {
    const archives = await fetch('/auth/email/archives', { credentials: 'include' }).then(r => r.json());
    _invoiceArchivedKeys = new Set((archives?.data || []).map(a => a.thread_key));
  } catch { /* sem a lista, o botao mostra "Arquivar" por omissao */ }
  await invoiceConversasPaged.load(getInvoiceThreadQuery(false), { force: true });
}

async function renderInvoiceArchive() {
  await invoiceArquivoPaged.load(getInvoiceThreadQuery(true), { force: true });
}

function _snippet(subject, html) {
  if (!html) return subject || '';
  // Mensagens nossas vêm embrulhadas no template de marca (_stripEmailChrome
  // tira o logótipo/redes sociais/rodapé quando presente, sem efeito nas
  // mensagens do hóspede); e sem remover o conteúdo de <style> antes das
  // tags, o resumo mostrava o CSS/comentários lá dentro em vez do texto real.
  const cleaned = AppModules.invoice._stripEmailChrome(html)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ');
  const text = cleaned.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > 80 ? text.slice(0, 80) + '…' : text;
}

/* ── Render lista de threads ── */
function renderInvoiceThreadList(threads, opts = {}) {
  const { listId = 'invoice-thread-list', emptyId = 'invoice-thread-empty', detailId = 'invoice-thread-detail' } = opts;
  const list  = document.getElementById(listId);
  const empty = document.getElementById(emptyId);
  if (!list) return;

  // Sem filtro local: a pesquisa e feita pelo servidor e abrange todas as
  // paginas, nao apenas as conversas desta.
  const filtered = threads;

  list.querySelectorAll('.invoice-thread-item').forEach(el => el.remove());

  if (!filtered.length) {
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';

  filtered.forEach(t => {
    const isActive  = _invoiceActiveThread === t.id;
    const hasMsg    = !!t._lastDate;
    const el = document.createElement('div');
    el.className = 'invoice-thread-item' + (isActive ? ' active' : '');
    el.dataset.id = t.id;
    el.innerHTML = `
      <div class="itt-avatar">${AppModules.invoice.initials(t.guestName)}</div>
      <div class="itt-body">
        <div class="itt-top">
          <span class="itt-name">
            ${AppModules.invoice.esc(t.guestName)}${t._alojInitials ? ` <span class="itt-aloj-init">${AppModules.invoice.esc(t._alojInitials)}</span>` : ''}
          </span>
          <span class="itt-date">${hasMsg ? AppModules.invoice.fmtDateTime(t._lastDate) : AppModules.invoice.fmtDate(t.checkin)}</span>
        </div>
        ${t._lastSnippet
          ? `<div class="itt-snippet">${AppModules.invoice.esc(t._lastSnippet)}</div>`
          : `<div class="itt-sub">${AppModules.invoice.esc(t.guestEmail)}</div>`}
        <div class="itt-meta">
          ${t.alojamento ? `<span class="itt-aloj">${AppModules.invoice.esc(t.alojamento)}</span>` : ''}
          ${t.total ? `<span class="itt-total">${AppModules.invoice.formatMoney(t.total)}</span>` : ''}
          ${t.status ? `<span class="itt-status status-${t.status}">${AppModules.invoice.labelStatus(t.status)}</span>` : ''}
        </div>
      </div>
    `;
    el.addEventListener('click', () => AppModules.invoice.openInvoiceThread(t, detailId));
    list.appendChild(el);
  });

  if (window.lucide) lucide.createIcons();
}

/* ── Abrir detalhe de uma thread ── */

// Limpeza da funcionalidade ao sair ou trocar de organização.
AppModules.onReset('invoice.js', () => {
  _invoiceConversas = [];
  _invoiceActiveThread = null;
  _invoiceActiveEmail = null;
  clearTimeout(_invoicePollTimer); clearInterval(_invoicePollTimer); _invoicePollTimer = null;
  _invoiceArchivedKeys = new Set();
  _invoiceCurrentMessages = [];
  _invoiceReplyTarget = null;
  _invoicePaging = {};
  invoiceConversasPaged.reset();
  invoiceArquivoPaged.reset();
});

})();
