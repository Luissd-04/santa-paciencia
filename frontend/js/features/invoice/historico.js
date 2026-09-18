'use strict';
function openInvoiceThread(thread, detailId = 'invoice-thread-detail') {
  _invoiceActiveThread = thread.id;
  _invoiceActiveEmail  = thread.guestEmail;
  document.querySelectorAll('.invoice-thread-item').forEach(el => {
    el.classList.toggle('active', el.dataset.id === String(thread.id));
  });

  // Lembrar a conversa aberta (só a normal, não o arquivo) para a repor
  // automaticamente depois de um refresh da página — sem isto, um simples
  // F5 para ver se chegou resposta obrigava a reabrir a conversa à mão.
  if (detailId === 'invoice-thread-detail') {
    try { localStorage.setItem(_INVOICE_OPEN_THREAD_KEY, String(thread.id)); } catch {}
  }

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
             </button>
             <button class="btn btn-ghost btn-sm btn-danger-ghost" onclick="deleteInvoiceThreadHistory('${thread.id}','${esc(thread.guestEmail)}',${thread._standalone ? 'null' : `'${thread.id}'`})">
               <i data-lucide="trash-2"></i> Eliminar histórico
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
        <span class="ica-tpl-reason" id="ica-tpl-reason"></span>
        <button class="btn btn-ghost btn-xs ica-tpl-btn" id="ica-tpl-btn" onclick="openTemplatesPicker('ica-subject','ica-body','${esc(thread.guestEmail)}')">
          <i data-lucide="layout-template"></i> Template
        </button>
      </div>
      <div class="ica-reply-context" id="ica-reply-context" style="display:none;">
        <i data-lucide="corner-up-left" style="width:13px;height:13px;"></i>
        <span id="ica-reply-snippet"></span>
        <button type="button" title="Cancelar resposta" onclick="cancelInvoiceReply()"><i data-lucide="x" style="width:13px;height:13px;"></i></button>
      </div>
      <input class="form-control" type="text" id="ica-subject" placeholder="Assunto" style="margin-bottom:8px;" autocomplete="off">
      ${buildComposeToolbar()}
      <div class="email-body-editor compose-body-editor" id="ica-body" contenteditable="true" data-placeholder="Escreve a tua mensagem..."></div>
      <div class="ica-footer">
        <button class="btn btn-primary" id="ica-send-btn"
          onclick="sendInvoiceEmail('${esc(thread.guestEmail)}','${esc(thread.guestName)}','${thread.id}',${!!thread._standalone})">
          <i data-lucide="send"></i> Enviar
        </button>
      </div>
    </div>
  `;

  if (window.lucide) lucide.createIcons();

  // Nunca herdar o alvo de resposta de uma thread aberta anteriormente.
  _invoiceReplyTarget = null;
  _invoicePaging[thread.id] = { dbCursor: null, dbDone: false, gmailPageToken: null, gmailDone: false, loading: false };

  _applyTemplateGating('ica-tpl-btn', thread.guestEmail);
  loadThreadMessages(thread);
  _startInvoicePoll(thread);

  const area = document.getElementById('invoice-messages-' + thread.id);
  if (area) {
    area.addEventListener('scroll', () => {
      const st = _invoicePaging[thread.id];
      if (area.scrollTop < 80 && st && !st.loading && (!st.dbDone || !st.gmailDone)) {
        loadThreadMessages(thread, { loadMore: true });
      }
    });
  }
}

/* Junta mensagens novas ao estado da thread aberta, sem duplicar por id */
function _mergeInvoiceMessages(newMsgs) {
  const map = new Map(_invoiceCurrentMessages.map(m => [m.id, m]));
  newMsgs.forEach(m => map.set(m.id, m));
  _invoiceCurrentMessages = _dedupInvoiceMessages(
    [...map.values()].sort((a, b) => new Date(a.date) - new Date(b.date))
  );
}

/* Remove duplicados: a mesma mensagem enviada pela app aparece também na
   pesquisa Gmail (from:/to:) — se já sabemos o gmail_message_id exato (guardado
   ao enviar), comparamos por id em vez de adivinhar. Registos antigos, sem esse
   id guardado, caem no fallback por assunto normalizado + dia. */
function _dedupInvoiceMessages(msgs) {
  const dbGmailIds = new Set(msgs.filter(m => m.id.startsWith('m-') && m.gmailMessageId).map(m => m.gmailMessageId));
  const seenLegacyKey = new Set();
  const out = [];
  for (const m of msgs) {
    if (m.id.startsWith('g-') && m.gmailMessageId && dbGmailIds.has(m.gmailMessageId)) continue;
    if (m.id.startsWith('m-') && !m.gmailMessageId) {
      const key = (m.subject || '').trim().toLowerCase() + '|' + new Date(m.date).toISOString().slice(0, 10);
      if (seenLegacyKey.has(key)) continue;
      seenLegacyKey.add(key);
    }
    out.push(m);
  }
  return out;
}

// Mensagens enviadas pela app (manuais ou de templates automáticos) vão
// sempre embrulhadas no template de marca (logótipo + redes sociais no
// rodapé, via baseTemplate()) — ótimo no email real, mas só dificulta a
// leitura rápida no histórico. Extrai só a célula de conteúdo (marcada com a
// classe email-body-bg) quando presente; mensagens do hóspede nunca têm essa
// classe, por isso ficam sempre como vieram.
// Nota: baseTemplate() usa "email-body-bg" tanto na <table> exterior (o
// cartão todo, com logótipo/rodapé) como na <td> de conteúdo lá dentro — sem
// o seletor "td.", o querySelector apanha sempre a tabela exterior primeiro
// (é a que aparece primeiro no HTML) e devolve o cartão completo em vez de só
// o texto da mensagem.
function _stripEmailChrome(html) {
  if (!html || !html.includes('email-body-bg')) return html;
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const contentCell = doc.querySelector('td.email-body-bg');
    if (contentCell) return contentCell.innerHTML;
  } catch {}
  return html;
}

function _renderInvoiceMessages(area, needsReauth) {
  if (!_invoiceCurrentMessages.length) {
    area.innerHTML = `
      <div class="invoice-msgs-empty">
        <i data-lucide="mail-open" style="width:32px;height:32px;opacity:.25;"></i>
        <p>Sem mensagens ainda.</p>
        ${needsReauth ? `<p class="imb-reauth">Para ver os emails recebidos, <a href="#" onclick="event.preventDefault();reconnectGmailForInbox()">re-autoriza o Gmail</a> com permissão de leitura.</p>` : ''}
      </div>`;
    return;
  }

  area.innerHTML = _invoiceCurrentMessages.map((m, i) => `
    <div class="invoice-bubble invoice-bubble--${m.direction}">
      <div class="ib-row">
        <div class="ib-content">
          <div class="ib-meta">
            <span class="ib-author">${esc(m.author)}</span>
            <span class="ib-date">${fmtDateTime(m.date)}</span>
          </div>
          <div class="ib-subject">${esc(m.subject)}</div>
          <div class="ib-body">${renderEmailBodySandboxed(m.direction === 'sent' ? _stripEmailChrome(m.body) : m.body)}</div>
          ${m.attachments?.length ? renderInvoiceAttachments(m.attachments, m.gmailMessageId) : ''}
        </div>
        ${m.messageIdHeader ? `<button class="ib-reply-btn" type="button" title="Responder a esta mensagem" onclick="replyToInvoiceMessage(${i})"><i data-lucide="corner-up-left" style="width:13px;height:13px;"></i></button>` : ''}
      </div>
    </div>
  `).join('');

  if (needsReauth) {
    area.insertAdjacentHTML('afterbegin', `
      <div class="imb-reauth-banner">
        <i data-lucide="alert-circle" style="width:14px;height:14px;"></i>
        Para ver os emails recebidos, <a href="#" onclick="event.preventDefault();reconnectGmailForInbox()">re-autoriza o Gmail</a> com permissão de leitura.
      </div>`);
  }
}

function renderInvoiceAttachments(atts, gmailMessageId) {
  if (!gmailMessageId) return '';
  return `<div class="ib-attachments">${atts.map(a => `
    <a class="ib-attachment" href="/auth/email/attachment?message_id=${encodeURIComponent(gmailMessageId)}&attachment_id=${encodeURIComponent(a.attachmentId)}&filename=${encodeURIComponent(a.filename)}" target="_blank" rel="noopener">
      <i data-lucide="paperclip" style="width:12px;height:12px;"></i><span>${esc(a.filename)}</span><span class="ib-att-size">${_formatBytes(a.size)}</span>
    </a>`).join('')}</div>`;
}

function _formatBytes(n) {
  if (!n) return '';
  const kb = n / 1024;
  return kb < 1024 ? `${kb.toFixed(0)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}

/* ── Responder a uma mensagem específica (threading real) ── */
function replyToInvoiceMessage(idx) {
  const m = _invoiceCurrentMessages[idx];
  if (!m || !m.messageIdHeader) return;
  _invoiceReplyTarget = { gmailThreadId: m.gmailThreadId, messageIdHeader: m.messageIdHeader, subject: m.subject };

  const subjInput = document.getElementById('ica-subject');
  if (subjInput && !/^re:/i.test(subjInput.value.trim())) subjInput.value = `Re: ${m.subject || ''}`;

  const ctx = document.getElementById('ica-reply-context');
  const snippetEl = document.getElementById('ica-reply-snippet');
  if (snippetEl) snippetEl.textContent = `A responder a: ${_snippet('', m.body).slice(0, 60)}`;
  if (ctx) ctx.style.display = '';
  document.getElementById('ica-body')?.focus();
}

function cancelInvoiceReply() {
  _invoiceReplyTarget = null;
  const ctx = document.getElementById('ica-reply-context');
  if (ctx) ctx.style.display = 'none';
}

/* ── Carregar e combinar mensagens (enviadas + recebidas Gmail), com paginação ── */
async function loadThreadMessages(thread, opts = {}) {
  const { silent = false, loadMore = false } = opts;
  const area = document.getElementById('invoice-messages-' + thread.id);
  if (!area) return;

  const paging = _invoicePaging[thread.id]
    || (_invoicePaging[thread.id] = { dbCursor: null, dbDone: false, gmailPageToken: null, gmailDone: false, loading: false });
  if (paging.loading) return; // evita pedidos concorrentes (poll a meio de um "carregar mais", ou vice-versa)
  paging.loading = true;

  if (!silent && !loadMore) {
    area.innerHTML = `<div style="display:flex;align-items:center;gap:8px;color:var(--cinza);font-size:13px;padding:20px;">
      <div class="spinner" style="width:16px;height:16px;"></div> A carregar...
    </div>`;
  }

  const prevScrollHeight = area.scrollHeight;
  const prevScrollTop    = area.scrollTop;

  try {
    const emailParam = encodeURIComponent(thread.guestEmail);
    const sentBase = thread._standalone
      ? `to_email=${emailParam}`
      : `reservation_id=${encodeURIComponent(thread.id)}&to_email=${emailParam}`;

    // Em "carregar mais", só volta a pedir à fonte que ainda não esgotou.
    const fetchSent  = !loadMore || !paging.dbDone;
    const fetchGmail = !loadMore || !paging.gmailDone;

    const [sentRes, inboxRes] = await Promise.all([
      fetchSent
        ? fetch(`/auth/email/messages?${sentBase}${paging.dbCursor ? `&before=${encodeURIComponent(paging.dbCursor)}` : ''}`, { credentials: 'include' }).then(r => r.json())
        : Promise.resolve({ data: { messages: [], next_cursor: null } }),
      fetchGmail
        ? fetch(`/auth/email/inbox?to_email=${emailParam}${paging.gmailPageToken ? `&page_token=${encodeURIComponent(paging.gmailPageToken)}` : ''}`, { credentials: 'include' }).then(r => r.json()).catch(() => ({}))
        : Promise.resolve({ data: { messages: [], next_page_token: null } }),
    ]);

    const sentData = sentRes?.data || {};
    const sentMsgs = (sentData.messages || []).map(m => ({
      id:              'm-' + m.id,
      date:            m.sent_at,
      subject:         m.subject,
      body:            m.body_html,
      direction:       'sent',
      author:          m.sent_by_name || 'Tu',
      gmailMessageId:  m.gmail_message_id  || null,
      gmailThreadId:   m.gmail_thread_id   || null,
      messageIdHeader: m.message_id_header || null,
      attachments:     [],
    }));
    if (fetchSent) { paging.dbCursor = sentData.next_cursor || null; paging.dbDone = !sentData.next_cursor; }

    const inboxData   = inboxRes?.data || {};
    const needsReauth = inboxData.needs_reauth;
    const gmailMsgs    = (inboxData.messages || []).map(m => ({
      id:              'g-' + m.id,
      date:            m.date,
      subject:         m.subject,
      body:            m.body || `<span style="opacity:.6">${esc(m.snippet)}</span>`,
      direction:       m.direction,
      author:          m.direction === 'received' ? thread.guestName : 'Tu',
      gmailMessageId:  m.id,
      gmailThreadId:   m.threadId,
      messageIdHeader: m.messageIdHeader || null,
      attachments:     m.attachments || [],
    }));
    if (fetchGmail) { paging.gmailPageToken = inboxData.next_page_token || null; paging.gmailDone = !inboxData.next_page_token; }

    if (!loadMore && !silent) _invoiceCurrentMessages = []; // (re)abertura da thread do zero
    _mergeInvoiceMessages([...sentMsgs, ...gmailMsgs]);
    _renderInvoiceMessages(area, needsReauth);

    if (!loadMore) {
      // Abertura inicial da thread desce sempre; um poll silencioso só desce
      // se já estávamos perto do fundo — senão, tira quem estava a ler
      // histórico mais antigo do sítio onde estava.
      const wasNearBottom = (prevScrollHeight - prevScrollTop - area.clientHeight) < 150;
      if (!silent || wasNearBottom) {
        requestAnimationFrame(() => { area.scrollTop = area.scrollHeight; });
      }
    } else {
      requestAnimationFrame(() => { area.scrollTop = prevScrollTop + (area.scrollHeight - prevScrollHeight); });
    }
  } catch {
    if (!silent && !loadMore && !_invoiceCurrentMessages.length) {
      area.innerHTML = `<div class="invoice-msgs-empty"><p>Erro ao carregar mensagens.</p></div>`;
    }
  } finally {
    paging.loading = false;
  }
  if (window.lucide) lucide.createIcons();
}

function reconnectGmailForInbox() {
  showView('definicoes');
  switchSettingsTab('gcal');
  setTimeout(() => toast('Desliga e volta a ligar o Gmail para adicionar a permissão de leitura.', 'info'), 300);
}

