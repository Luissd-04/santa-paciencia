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

/* ── Envio de email (fora do API_BASE /api) ── */
async function _sendEmail(to, subject, html, to_name, reservation_id) {
  const res = await fetch('/auth/email/send', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, subject, html, to_name: to_name || null, reservation_id: reservation_id || null }),
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
  _invoicePollTimer = setInterval(() => loadThreadMessages(thread, true), 30000);
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
      apiGet('/reservations?limit=200'),
      apiGet('/guests?limit=200'),
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
          total:        r.total_price,
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
  } catch (err) {
    console.error('Invoice: erro ao carregar conversas', err);
    renderInvoiceThreadList([]);
  } finally {
    if (loading) loading.style.display = 'none';
  }
}

function _snippet(subject, html) {
  if (!html) return subject || '';
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > 80 ? text.slice(0, 80) + '…' : text;
}

/* ── Render lista de threads ── */
function renderInvoiceThreadList(threads) {
  const list  = document.getElementById('invoice-thread-list');
  const empty = document.getElementById('invoice-thread-empty');
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
    el.addEventListener('click', () => openInvoiceThread(t));
    list.appendChild(el);
  });

  if (window.lucide) lucide.createIcons();
}

/* ── Abrir detalhe de uma thread ── */
function openInvoiceThread(thread, detailId = 'invoice-thread-detail') {
  _invoiceActiveThread = thread.id;
  _invoiceActiveEmail  = thread.guestEmail;
  document.querySelectorAll('.invoice-thread-item').forEach(el => {
    el.classList.toggle('active', el.dataset.id === String(thread.id));
  });

  const detail = document.getElementById(detailId);
  if (!detail) return;

  detail.innerHTML = `
    <div class="invoice-detail-header">
      <div class="idh-avatar">${initials(thread.guestName)}</div>
      <div class="idh-info">
        <h2>${esc(thread.guestName)}</h2>
        <a href="mailto:${esc(thread.guestEmail)}" class="idh-email">${esc(thread.guestEmail)}</a>
        <div class="idh-meta">
          ${thread.alojamento ? `<span><i data-lucide="home" style="width:13px;height:13px;"></i> ${esc(thread.alojamento)}</span>` : ''}
          ${thread.checkin ? `<span><i data-lucide="calendar" style="width:13px;height:13px;"></i> ${fmtDate(thread.checkin)} → ${fmtDate(thread.checkout)}</span>` : ''}
          ${thread.total ? `<span><i data-lucide="euro" style="width:13px;height:13px;"></i> ${formatMoney(thread.total)}</span>` : ''}
        </div>
      </div>
      <div class="idh-actions">
        ${!thread._standalone ? `
          <button class="btn btn-ghost btn-sm" onclick="showView('reservas')">
            <i data-lucide="external-link"></i> Ver reserva
          </button>` : ''}
        ${_invoiceArchivedKeys.has(String(thread.id))
          ? `<button class="btn btn-ghost btn-sm" onclick="restoreInvoiceThread('${thread.id}')">
               <i data-lucide="inbox"></i> Restaurar
             </button>`
          : `<button class="btn btn-ghost btn-sm" onclick="archiveInvoiceThread('${thread.id}','${thread._standalone ? 'email' : 'reservation'}')">
               <i data-lucide="archive"></i> Arquivar
             </button>`}
      </div>
    </div>
    <div class="invoice-messages-area" id="invoice-messages-${thread.id}">
      <div style="display:flex;align-items:center;gap:8px;color:var(--cinza);font-size:13px;padding:20px;">
        <div class="spinner" style="width:16px;height:16px;"></div> A carregar...
      </div>
    </div>
    <div class="invoice-compose-area">
      <div class="ica-header">
        <span>Para: <strong>${esc(thread.guestEmail)}</strong></span>
        <button class="btn btn-ghost btn-xs ica-tpl-btn" onclick="openTemplatesPicker('ica-subject','ica-body')">
          <i data-lucide="layout-template"></i> Template
        </button>
      </div>
      <input class="form-control" type="text" id="ica-subject" placeholder="Assunto" style="margin-bottom:8px;">
      <textarea class="form-control" id="ica-body" rows="4" placeholder="Escreve a tua mensagem..."></textarea>
      <div class="ica-footer">
        <button class="btn btn-primary" id="ica-send-btn"
          onclick="sendInvoiceEmail('${esc(thread.guestEmail)}','${esc(thread.guestName)}','${thread.id}',${!!thread._standalone})">
          <i data-lucide="send"></i> Enviar
        </button>
      </div>
    </div>
  `;

  if (window.lucide) lucide.createIcons();
  loadThreadMessages(thread);
  _startInvoicePoll(thread);
}

/* ── Carregar e combinar mensagens (enviadas + recebidas Gmail) ── */
async function loadThreadMessages(thread, silent = false) {
  const area = document.getElementById('invoice-messages-' + thread.id);
  if (!area) return;

  if (!silent) {
    area.innerHTML = `<div style="display:flex;align-items:center;gap:8px;color:var(--cinza);font-size:13px;padding:20px;">
      <div class="spinner" style="width:16px;height:16px;"></div> A carregar...
    </div>`;
  }

  try {
    const emailParam = encodeURIComponent(thread.guestEmail);
    const sentParams = thread._standalone
      ? `to_email=${emailParam}`
      : `reservation_id=${encodeURIComponent(thread.id)}&to_email=${emailParam}`;

    const [sentRes, inboxRes] = await Promise.all([
      fetch(`/auth/email/messages?${sentParams}`, { credentials: 'include' }).then(r => r.json()),
      fetch(`/auth/email/inbox?to_email=${emailParam}`, { credentials: 'include' }).then(r => r.json()).catch(() => ({})),
    ]);

    const sentMsgs = (sentRes?.data?.messages || []).map(m => ({
      id:        'm-' + m.id,
      date:      m.sent_at,
      subject:   m.subject,
      body:      m.body_html,
      direction: 'sent',
      author:    m.sent_by_name || 'Tu',
    }));

    const inboxData    = inboxRes?.data || {};
    const needsReauth  = inboxData.needs_reauth;
    const gmailMsgs    = (inboxData.messages || []).map(m => ({
      id:        'g-' + m.id,
      date:      m.date,
      subject:   m.subject,
      body:      m.body || `<span style="opacity:.6">${esc(m.snippet)}</span>`,
      direction: m.direction,
      author:    m.direction === 'received' ? thread.guestName : 'Tu',
    }));

    /* Juntar e ordenar por data */
    const allMsgs = [...sentMsgs, ...gmailMsgs]
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    /* Remover duplicados — mesma mensagem pode vir da BD (UTC) e do Gmail (hora local).
       Chave: assunto normalizado + dia. Tolerante a diferenças de timezone. */
    const seen = new Set();
    const deduped = allMsgs.filter(m => {
      const normSubj = (m.subject || '').trim().toLowerCase();
      const dayKey   = new Date(m.date).toISOString().slice(0, 10); // YYYY-MM-DD
      const key      = normSubj + '|' + dayKey;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (!deduped.length) {
      area.innerHTML = `
        <div class="invoice-msgs-empty">
          <i data-lucide="mail-open" style="width:32px;height:32px;opacity:.25;"></i>
          <p>Sem mensagens ainda.</p>
          ${needsReauth ? `<p class="imb-reauth">Para ver os emails recebidos, <a href="#" onclick="event.preventDefault();reconnectGmailForInbox()">re-autoriza o Gmail</a> com permissão de leitura.</p>` : ''}
        </div>`;
    } else {
      area.innerHTML = deduped.map(m => `
        <div class="invoice-bubble invoice-bubble--${m.direction}">
          <div class="ib-meta">
            <span class="ib-author">${esc(m.author)}</span>
            <span class="ib-date">${fmtDateTime(m.date)}</span>
          </div>
          <div class="ib-subject">${esc(m.subject)}</div>
          <div class="ib-body">${m.body}</div>
        </div>
      `).join('');

      if (needsReauth) {
        area.insertAdjacentHTML('afterbegin', `
          <div class="imb-reauth-banner">
            <i data-lucide="alert-circle" style="width:14px;height:14px;"></i>
            Para ver os emails recebidos, <a href="#" onclick="event.preventDefault();reconnectGmailForInbox()">re-autoriza o Gmail</a> com permissão de leitura.
          </div>`);
      }

      /* Scroll para o fim — após o browser calcular o layout */
      requestAnimationFrame(() => { area.scrollTop = area.scrollHeight; });
    }
  } catch {
    if (!silent) area.innerHTML = `<div class="invoice-msgs-empty"><p>Erro ao carregar mensagens.</p></div>`;
  }
  if (window.lucide) lucide.createIcons();
}

function reconnectGmailForInbox() {
  showView('definicoes');
  switchSettingsTab('gcal');
  setTimeout(() => toast('Desliga e volta a ligar o Gmail para adicionar a permissão de leitura.', 'info'), 300);
}

async function archiveInvoiceThread(threadId, keyType = 'reservation') {
  try {
    await fetch('/auth/email/archives', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ thread_key: String(threadId), key_type: keyType }),
    });
    _invoiceArchivedKeys.add(String(threadId));
    toast('Conversa arquivada.', 'info');
    document.getElementById('invoice-thread-detail').innerHTML = `
      <div class="invoice-detail-empty">
        <i data-lucide="archive" style="width:48px;height:48px;opacity:.2;"></i>
        <p>Conversa arquivada.</p>
      </div>`;
    if (window.lucide) lucide.createIcons();
    _invoiceConversas = _invoiceConversas.filter(t => String(t.id) !== String(threadId));
    renderInvoiceThreadList(_invoiceConversas);
  } catch { toast('❌ Erro ao arquivar.', 'error'); }
}

async function restoreInvoiceThread(threadId) {
  try {
    await fetch(`/auth/email/archives/${encodeURIComponent(threadId)}`, { method: 'DELETE', credentials: 'include' });
    _invoiceArchivedKeys.delete(String(threadId));
    toast('Conversa restaurada.', 'success');
    await loadInvoiceConversas();
    switchInvoiceTab('conversas', false);
  } catch { toast('❌ Erro ao restaurar.', 'error'); }
}

async function renderInvoiceArchive() {
  const list    = document.getElementById('invoice-archive-list');
  const loading = document.getElementById('invoice-archive-loading');
  const empty   = document.getElementById('invoice-archive-empty');
  if (!list) return;

  if (loading) loading.style.display = '';
  if (empty)   empty.style.display   = 'none';

  try {
    const [resData, hosData, msgRes, archRes] = await Promise.all([
      apiGet('/reservations?limit=200'),
      apiGet('/guests?limit=200'),
      fetch('/auth/email/messages?limit=200', { credentials: 'include' }).then(r => r.json()).catch(() => ({})),
      fetch('/auth/email/archives', { credentials: 'include' }).then(r => r.json()).catch(() => ({})),
    ]);

    const reservas = resData?.data?.reservations || resData?.data || [];
    const hospedes = hosData?.data?.guests        || hosData?.data || [];
    const allMsgs  = msgRes?.data?.messages || [];
    const archived = new Set((archRes?.data || []).map(a => a.thread_key));

    const hospedeMap = {};
    hospedes.forEach(h => { hospedeMap[h.id] = h; });
    const msgByEmail = {};
    allMsgs.forEach(m => {
      const key = m.to_email.toLowerCase();
      if (!msgByEmail[key] || new Date(m.sent_at) > new Date(msgByEmail[key].sent_at)) msgByEmail[key] = m;
    });

    const threads = reservas
      .filter(r => archived.has(String(r.id)))
      .map(r => {
        const hospede = hospedeMap[r.guest_id] || {};
        const email   = (realEmail(r.guest_email) || hospede.email || '').toLowerCase();
        const lastMsg = msgByEmail[email];
        return {
          id: r.id, guestName: hospede.name || r.guest_name || '—',
          guestEmail: realEmail(r.guest_email) || hospede.email || '',
          alojamento: r.accommodation_name || '', checkin: r.check_in, checkout: r.check_out,
          status: r.status, total: r.total_price, _standalone: false,
          _lastDate: lastMsg?.sent_at || null,
          _lastSnippet: lastMsg ? _snippet(lastMsg.subject, lastMsg.body_html) : null,
        };
      });

    allMsgs.filter(m => !m.reservation_id && archived.has('standalone-' + m.to_email.toLowerCase())).forEach(m => {
      const key = 'standalone-' + m.to_email.toLowerCase();
      if (!threads.find(t => t.id === key)) {
        const hospedeByEmail = {};
        hospedes.forEach(h => { if (realEmail(h.email)) hospedeByEmail[h.email.toLowerCase()] = h; });
        const matched = hospedeByEmail[m.to_email.toLowerCase()];
        threads.push({
          id: key, guestName: matched?.name || m.to_name || m.to_email,
          guestEmail: m.to_email, alojamento: '', checkin: null, checkout: null,
          status: null, total: null, _standalone: true,
          _lastDate: m.sent_at, _lastSnippet: _snippet(m.subject, m.body_html),
        });
      }
    });

    const query = (document.getElementById('invoice-search')?.value || '').toLowerCase();
    const filtered = query
      ? threads.filter(t => t.guestName.toLowerCase().includes(query) || t.guestEmail.toLowerCase().includes(query))
      : threads;

    list.querySelectorAll('.invoice-thread-item').forEach(el => el.remove());
    if (loading) loading.style.display = 'none';

    if (!filtered.length) { if (empty) empty.style.display = ''; return; }

    filtered.forEach(t => {
      const el = document.createElement('div');
      el.className = 'invoice-thread-item';
      el.dataset.id = t.id;
      el.innerHTML = `
        <div class="itt-avatar">${initials(t.guestName)}</div>
        <div class="itt-body">
          <div class="itt-top">
            <span class="itt-name">${esc(t.guestName)}</span>
            <span class="itt-date">${t._lastDate ? fmtDateTime(t._lastDate) : ''}</span>
          </div>
          ${t._lastSnippet ? `<div class="itt-snippet">${esc(t._lastSnippet)}</div>` : `<div class="itt-sub">${esc(t.guestEmail)}</div>`}
          <div class="itt-meta">${t.alojamento ? `<span class="itt-aloj">${esc(t.alojamento)}</span>` : ''}</div>
        </div>`;
      el.addEventListener('click', () => openInvoiceThread(t, 'invoice-archive-detail'));
      list.appendChild(el);
    });
    if (window.lucide) lucide.createIcons();
  } catch (err) {
    console.error('Archive load error', err);
    if (loading) loading.style.display = 'none';
  }
}

/* ── Enviar a partir do compose da thread ── */
async function sendInvoiceEmail(toEmail, toName, reservationId, standalone) {
  const subject = document.getElementById('ica-subject')?.value?.trim();
  const body    = document.getElementById('ica-body')?.value?.trim();

  if (!subject || !body) { toast('Preenche o assunto e a mensagem.', 'warning'); return; }

  const btn = document.getElementById('ica-send-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> A enviar...'; if (window.lucide) lucide.createIcons(); }

  try {
    await _sendEmail(toEmail, subject, body.replace(/\n/g, '<br>'), toName, standalone ? null : reservationId);
    toast(`Email enviado para ${toName}`, 'success');
    document.getElementById('ica-subject').value = '';
    document.getElementById('ica-body').value    = '';

    // Se a thread estava arquivada, restaurar automaticamente
    const threadKey = String(reservationId);
    if (_invoiceArchivedKeys.has(threadKey)) {
      await fetch(`/auth/email/archives/${encodeURIComponent(threadKey)}`, { method: 'DELETE', credentials: 'include' }).catch(() => {});
      _invoiceArchivedKeys.delete(threadKey);
      await loadInvoiceConversas();
      switchInvoiceTab('conversas', false);
      return;
    }

    const thread = _invoiceConversas.find(t => t.id === reservationId)
      || { id: reservationId, guestEmail: toEmail, guestName: toName, _standalone: standalone };
    loadThreadMessages(thread);
  } catch (err) {
    if (err?.payload?.needs_reauth) {
      toast('Gmail expirou — vai a Definições → Gmail e volta a ligar.', 'error', 6000);
    } else {
      toast('Erro ao enviar: ' + (err?.payload?.error || err?.message || err), 'error');
    }
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="send"></i> Enviar'; if (window.lucide) lucide.createIcons(); }
  }
}

/* ── Modal helper ── */
function _closeInvoiceModal(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

/* ── Nova conversa (email avulso) ── */
let _novaConversaReservationId = null;

function openNovaConversa(prefillEmail = '', prefillName = '', reservationId = null) {
  _novaConversaReservationId = reservationId || null;
  document.getElementById('modal-nova-conversa')?.remove();

  const wrap = document.createElement('div');
  wrap.className = 'modal-bg open';
  wrap.id = 'modal-nova-conversa';
  wrap.addEventListener('click', e => { if (e.target === wrap) _closeInvoiceModal('modal-nova-conversa'); });
  wrap.innerHTML = `
    <div class="modal" style="max-width:480px;">
      <div class="modal-header">
        <h3>Nova mensagem${prefillName ? ` para ${prefillName.split(' ')[0]}` : ''}</h3>
        <button class="modal-close" onclick="_closeInvoiceModal('modal-nova-conversa')">
          <i data-lucide="x"></i>
        </button>
      </div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:12px;">
        <label class="form-label">Para (email)
          <input class="form-control" type="email" id="nc-to" placeholder="hospede@email.com" value="${prefillEmail || ''}">
        </label>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <label class="form-label" style="margin:0;flex:1;">Assunto
            <input class="form-control" type="text" id="nc-subject" placeholder="Assunto da mensagem">
          </label>
          <button class="btn btn-ghost btn-xs" style="margin-top:18px;flex-shrink:0;" onclick="openTemplatesPicker('nc-subject','nc-body')">
            <i data-lucide="layout-template"></i> Template
          </button>
        </div>
        <label class="form-label">Mensagem
          <textarea class="form-control" id="nc-body" rows="5" placeholder="Escreve a tua mensagem..."></textarea>
        </label>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="_closeInvoiceModal('modal-nova-conversa')">Cancelar</button>
        <button class="btn btn-primary" id="nc-send-btn" onclick="sendNovaConversa()">
          <i data-lucide="send"></i> Enviar
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);
  if (window.lucide) lucide.createIcons();
  const toField = document.getElementById('nc-to');
  if (prefillEmail) document.getElementById('nc-subject')?.focus();
  else toField?.focus();
}

async function sendNovaConversa() {
  const to      = document.getElementById('nc-to')?.value?.trim();
  const subject = document.getElementById('nc-subject')?.value?.trim();
  const body    = document.getElementById('nc-body')?.value?.trim();

  if (!to || !subject || !body) { toast('Preenche todos os campos.', 'warning'); return; }

  const btn = document.getElementById('nc-send-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i data-lucide="loader-2"></i> A enviar...'; if (window.lucide) lucide.createIcons(); }

  try {
    await _sendEmail(to, subject, body.replace(/\n/g, '<br>'), null, _novaConversaReservationId);
    _closeInvoiceModal('modal-nova-conversa');
    toast('Email enviado com sucesso.', 'success');
  } catch (err) {
    if (err?.payload?.needs_reauth) {
      toast('Gmail expirou — vai a Definições → Gmail e volta a ligar.', 'error', 6000);
    } else {
      toast('Erro ao enviar email: ' + (err?.payload?.error || err?.message || err), 'error');
    }
    if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="send"></i> Enviar'; if (window.lucide) lucide.createIcons(); }
  }
}

/* ── Abrir invoice de uma reserva específica (chamado do detalhe de reserva) ── */
function openInvoiceForReservation(reservationId, guestEmail, guestName) {
  showView('invoice');
  const open = () => {
    const thread = _invoiceConversas.find(t => t.id === reservationId);
    if (thread) { openInvoiceThread(thread); return; }
    setTimeout(() => {
      const t2 = _invoiceConversas.find(t => t.id === reservationId);
      if (t2) { openInvoiceThread(t2); return; }
      /* sem conversa anterior — abrir modal de nova mensagem pré-preenchido */
      openNovaConversa(guestEmail, guestName, reservationId);
    }, 800);
  };
  if (_invoiceConversas.length) open();
  else setTimeout(open, 600);
}

/* ── Templates picker ── */
let _invoiceTemplatesCache = null;

async function openTemplatesPicker(subjectId, bodyId) {
  if (!_invoiceTemplatesCache) {
    try {
      const data = await apiGet('/api/email-templates');
      _invoiceTemplatesCache = (data?.data || []).filter(t => t.subject && t.body);
    } catch { _invoiceTemplatesCache = []; }
  }

  document.getElementById('modal-tpl-picker')?.remove();

  if (!_invoiceTemplatesCache.length) {
    toast('Sem templates configurados. Vai a Definições → Templates.', 'info');
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'modal-bg open';
  wrap.id = 'modal-tpl-picker';
  wrap.addEventListener('click', e => { if (e.target === wrap) wrap.remove(); });
  wrap.innerHTML = `
    <div class="modal" style="max-width:440px;">
      <div class="modal-header">
        <h3><i data-lucide="layout-template" style="width:16px;height:16px;vertical-align:-2px;margin-right:4px;"></i>Escolher template</h3>
        <button class="modal-close" onclick="document.getElementById('modal-tpl-picker').remove()"><i data-lucide="x"></i></button>
      </div>
      <div class="modal-body" style="padding:8px 0;">
        ${_invoiceTemplatesCache.map((t, i) => `
          <button class="tpl-picker-item" onclick="_applyTemplate(${i},'${subjectId}','${bodyId}')">
            <span class="tpl-picker-name">${esc(t.name || t.slug)}</span>
            <span class="tpl-picker-sub">${esc(t.subject)}</span>
          </button>`).join('')}
      </div>
    </div>
  `;
  document.body.appendChild(wrap);
  if (window.lucide) lucide.createIcons();
}

function _buildTemplateVars(thread) {
  if (!thread) return {};
  const name   = thread.guestName || '';
  const nights = (thread.checkin && thread.checkout)
    ? Math.round((new Date(thread.checkout) - new Date(thread.checkin)) / 86400000)
    : '';
  const fmtFull = d => d
    ? new Date(d + 'T12:00:00').toLocaleDateString('pt-PT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : '';
  return {
    nome_hospede:    name,
    primeiro_nome:   name.split(' ')[0] || '',
    alojamento:      thread.alojamento || '',
    data_checkin:    fmtFull(thread.checkin),
    data_checkout:   fmtFull(thread.checkout),
    hora_checkin:    '15:00',
    hora_checkout:   '11:00',
    noites:          String(nights),
    referencia:      String(thread.id || ''),
    total:           thread.total != null ? `€${Number(thread.total).toFixed(2)}` : '',
  };
}

function _interpolateTemplate(text, vars) {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key) =>
    vars[key] != null ? vars[key] : match
  );
}

function _applyTemplate(index, subjectId, bodyId) {
  const tpl = _invoiceTemplatesCache[index];
  if (!tpl) return;

  const threadId = _invoiceActiveThread || _novaConversaReservationId;
  const thread   = threadId ? _invoiceConversas.find(t => t.id === threadId) : null;
  const vars     = _buildTemplateVars(thread);

  const rawBody = tpl.body.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');

  const subEl  = document.getElementById(subjectId);
  const bodyEl = document.getElementById(bodyId);
  if (subEl)  subEl.value  = _interpolateTemplate(tpl.subject, vars);
  if (bodyEl) bodyEl.value = _interpolateTemplate(rawBody, vars);
  document.getElementById('modal-tpl-picker')?.remove();
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
