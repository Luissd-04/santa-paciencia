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
  _markInvoiceRead();
  switchInvoiceTab(_invoiceTab, false);
  if (_invoiceTab === 'conversas') loadInvoiceConversas();
}

function _stopInvoicePoll() {
  if (_invoicePollTimer) { clearInterval(_invoicePollTimer); _invoicePollTimer = null; }
}

function _startInvoicePoll(thread) {
  _stopInvoicePoll();
  _invoicePollTimer = setInterval(() => loadThreadMessages(thread, { silent: true }), 30000);
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

/* ── Carregar conversas (reservas + emails avulsos) ── */
async function loadInvoiceConversas() {
  const loading = document.getElementById('invoice-thread-loading');
  const empty   = document.getElementById('invoice-thread-empty');
  if (loading) loading.style.display = '';
  if (empty)   empty.style.display   = 'none';

  try {
    const [resData, hosData, msgRes, archRes] = await Promise.all([
      apiGet('/api/reservations?limit=200'),
      apiGet('/api/guests?limit=200'),
      fetch('/auth/email/messages?limit=200', { credentials: 'include' }).then(r => r.json()).catch(() => ({})),
      fetch('/auth/email/archives', { credentials: 'include' }).then(r => r.json()).catch(() => ({})),
    ]);
    _invoiceArchivedKeys = new Set((archRes?.data || []).map(a => a.thread_key));

    const reservas  = resData?.data?.reservations || resData?.data || [];
    const hospedes  = hosData?.data?.guests        || hosData?.data || [];
    const allMsgs   = msgRes?.data?.messages || [];

    const hospedeMap = {};
    hospedes.forEach(h => { hospedeMap[h.id] = h; });

    /* Agrupar mensagens por email para preview */
    const msgByEmail = {};
    allMsgs.forEach(m => {
      const key = m.to_email.toLowerCase();
      if (!msgByEmail[key] || new Date(m.sent_at) > new Date(msgByEmail[key].sent_at)) {
        msgByEmail[key] = m;
      }
    });

    /* Índice de hóspedes por email para lookup rápido */
    const hospedeByEmail = {};
    hospedes.forEach(h => {
      if (realEmail(h.email))    hospedeByEmail[h.email.toLowerCase()]          = h;
      if (h.email_personal)      hospedeByEmail[h.email_personal.toLowerCase()]  = h;
    });

    /* Threads de reservas */
    const activeStatuses = new Set(['confirmed', 'checked_in']);
    const threads = reservas
      .filter(r => realEmail(r.guest_email) || hospedeMap[r.guest_id]?.email)
      .map(r => {
        const hospede  = hospedeMap[r.guest_id] || {};
        const email    = (realEmail(r.guest_email) || hospede.email || '').toLowerCase();
        const lastMsg  = msgByEmail[email];
        const name     = hospede.name || r.guest_name || '—';
        const alojNome = r.accommodation_name || '';
        const alojInit = activeStatuses.has(r.status) && alojNome
          ? alojNome.split(' ').filter(w => w.length > 2).map(w => w[0].toUpperCase()).join('').slice(0, 3)
          : null;
        return {
          id:           r.id,
          guestName:    name,
          guestEmail:   r.guest_email || hospede.email || '',
          checkin:      r.check_in,
          checkout:     r.check_out,
          status:       r.status,
          alojamento:   alojNome,
          total:        r.total_amount,
          _alojInitials: alojInit,
          _lastDate:    lastMsg?.sent_at || null,
          _lastSnippet: lastMsg ? _snippet(lastMsg.subject, lastMsg.body_html) : null,
        };
      });

    /* Threads avulsas — emails sem reserva, agrupados por to_email */
    const reservaEmails = new Set(threads.map(t => t.guestEmail.toLowerCase()));
    const standaloneMap = {};
    allMsgs
      .filter(m => !m.reservation_id)
      .forEach(m => {
        const key = m.to_email.toLowerCase();
        const matchedGuest = hospedeByEmail[key];
        if (!standaloneMap[key]) {
          standaloneMap[key] = {
            id:          'standalone-' + key,
            guestName:   matchedGuest?.name || m.to_name || m.to_email,
            guestEmail:  m.to_email,
            checkin:     null,
            checkout:    null,
            status:      null,
            alojamento:  '',
            total:       null,
            _standalone: true,
            _lastDate:   m.sent_at,
            _lastSnippet: _snippet(m.subject, m.body_html),
          };
        }
      });

    /* Juntar avulsos que não estão já numa reserva */
    const standaloneThreads = Object.values(standaloneMap)
      .filter(t => !reservaEmails.has(t.guestEmail.toLowerCase()));

    /* Ordenar por data do último email (mais recente primeiro) */
    const allThreads = [...threads, ...standaloneThreads].sort((a, b) => {
      if (!a._lastDate && !b._lastDate) return 0;
      if (!a._lastDate) return 1;
      if (!b._lastDate) return -1;
      return new Date(b._lastDate) - new Date(a._lastDate);
    });

    _invoiceConversas = allThreads.filter(t => !_invoiceArchivedKeys.has(String(t.id)));
    renderInvoiceThreadList(_invoiceConversas);
    _updateInvoiceBadge();
    _restoreLastOpenInvoiceThread();
  } catch (err) {
    console.error('Invoice: erro ao carregar conversas', err);
    renderInvoiceThreadList([]);
  } finally {
    if (loading) loading.style.display = 'none';
  }
}

function _snippet(subject, html) {
  if (!html) return subject || '';
  // Mensagens nossas vêm embrulhadas no template de marca (_stripEmailChrome
  // tira o logótipo/redes sociais/rodapé quando presente, sem efeito nas
  // mensagens do hóspede); e sem remover o conteúdo de <style> antes das
  // tags, o resumo mostrava o CSS/comentários lá dentro em vez do texto real.
  const cleaned = _stripEmailChrome(html)
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

  const query = (document.getElementById('invoice-search')?.value || '').toLowerCase();
  const filtered = query
    ? threads.filter(t =>
        t.guestName.toLowerCase().includes(query) ||
        t.guestEmail.toLowerCase().includes(query) ||
        (t.alojamento || '').toLowerCase().includes(query)
      )
    : threads;

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
      <div class="itt-avatar">${initials(t.guestName)}</div>
      <div class="itt-body">
        <div class="itt-top">
          <span class="itt-name">
            ${esc(t.guestName)}${t._alojInitials ? ` <span class="itt-aloj-init">${esc(t._alojInitials)}</span>` : ''}
          </span>
          <span class="itt-date">${hasMsg ? fmtDateTime(t._lastDate) : fmtDate(t.checkin)}</span>
        </div>
        ${t._lastSnippet
          ? `<div class="itt-snippet">${esc(t._lastSnippet)}</div>`
          : `<div class="itt-sub">${esc(t.guestEmail)}</div>`}
        <div class="itt-meta">
          ${t.alojamento ? `<span class="itt-aloj">${esc(t.alojamento)}</span>` : ''}
          ${t.total ? `<span class="itt-total">${formatMoney(t.total)}</span>` : ''}
          ${t.status ? `<span class="itt-status status-${t.status}">${labelStatus(t.status)}</span>` : ''}
        </div>
      </div>
    `;
    el.addEventListener('click', () => openInvoiceThread(t, detailId));
    list.appendChild(el);
  });

  if (window.lucide) lucide.createIcons();
}

/* ── Abrir detalhe de uma thread ── */
