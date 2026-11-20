// Estado privado; interface partilhada em AppModules.invoice.
(() => {
AppModules.define('invoice', {
  _stripEmailChrome: { get: () => _stripEmailChrome },
  mailText: { get: () => mailText },
  cancelInvoiceReply: { get: () => cancelInvoiceReply },
  loadThreadMessages: { get: () => loadThreadMessages },
  openInvoiceThread: { get: () => openInvoiceThread },
});

'use strict';
function openInvoiceThread(thread, detailId = 'invoice-thread-detail') {
  AppModules.invoice._invoiceActiveThread = thread.id;
  AppModules.invoice._invoiceActiveEmail  = thread.guestEmail;
  document.querySelectorAll('.invoice-thread-item').forEach(el => {
    el.classList.toggle('active', el.dataset.id === String(thread.id));
  });

  // Lembrar a conversa aberta (só a normal, não o arquivo) para a repor
  // automaticamente depois de um refresh da página — sem isto, um simples
  // F5 para ver se chegou resposta obrigava a reabrir a conversa à mão.
  if (detailId === 'invoice-thread-detail') {
    try { localStorage.setItem(AppModules.invoice._INVOICE_OPEN_THREAD_KEY, String(thread.id)); } catch {}
  }

  const detail = document.getElementById(detailId);
  if (!detail) return;

  detail.innerHTML = `
    <div class="invoice-detail-header">
      <div class="idh-avatar">${AppModules.invoice.initials(thread.guestName)}</div>
      <div class="idh-info">
        <h2>${AppModules.invoice.esc(thread.guestName)}</h2>
        <a href="mailto:${AppModules.invoice.esc(thread.guestEmail)}" class="idh-email">${AppModules.invoice.esc(thread.guestEmail)}</a>
        <div class="idh-meta">
          ${thread.alojamento ? `<span><i data-lucide="home" style="width:13px;height:13px;"></i> ${AppModules.invoice.esc(thread.alojamento)}</span>` : ''}
          ${thread.checkin ? `<span><i data-lucide="calendar" style="width:13px;height:13px;"></i> ${AppModules.invoice.fmtDate(thread.checkin)} → ${AppModules.invoice.fmtDate(thread.checkout)}</span>` : ''}
          ${thread.total ? `<span><i data-lucide="euro" style="width:13px;height:13px;"></i> ${AppModules.invoice.formatMoney(thread.total)}</span>` : ''}
        </div>
      </div>
      <div class="idh-actions">
        ${!thread._standalone ? "\n          <button class=\"btn btn-ghost btn-sm\" data-on-click=\"historico-show-view-3d0e569\">\n            <i data-lucide=\"external-link\"></i> Ver reserva\n          </button>" : ''}
        ${AppModules.invoice._invoiceArchivedKeys.has(String(thread.id))
          ? `<button class="btn btn-ghost btn-sm" ${AppActions.attrs("click", "historico-restore-invoice-thread-adcb894", [String((thread.id) ?? '')])}>
               <i data-lucide="inbox"></i> Restaurar
             </button>
             <button class="btn btn-ghost btn-sm btn-danger-ghost" ${AppActions.attrs("click", "historico-delete-invoice-thread-history-917ed4c", [String((thread.id) ?? ''), String((thread.guestEmail) ?? ''), thread._standalone ? null : String(thread.id)])}>
               <i data-lucide="trash-2"></i> Eliminar histórico
             </button>`
          : `<button class="btn btn-ghost btn-sm" ${AppActions.attrs("click", "historico-archive-invoice-thread-cdd75e1", [String((thread.id) ?? ''), String((thread._standalone ? 'email' : 'reservation') ?? '')])}>
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
        <span>Para: <strong>${AppModules.invoice.esc(thread.guestEmail)}</strong></span>
        <span class="ica-tpl-reason" id="ica-tpl-reason"></span>
        <button class="btn btn-ghost btn-xs ica-tpl-btn" id="ica-tpl-btn" ${AppActions.attrs("click", "historico-open-templates-picker-854f770", [String((thread.guestEmail) ?? '')])}>
          <i data-lucide="layout-template"></i> Template
        </button>
      </div>
      <div class="ica-reply-context" id="ica-reply-context" style="display:none;">
        <i data-lucide="corner-up-left" style="width:13px;height:13px;"></i>
        <span id="ica-reply-snippet"></span>
        <button type="button" title="Cancelar resposta" data-on-click="historico-cancel-invoice-reply-7bdb026"><i data-lucide="x" style="width:13px;height:13px;"></i></button>
      </div>
      <input class="form-control" type="text" id="ica-subject" placeholder="Assunto" style="margin-bottom:8px;" autocomplete="off">
      ${AppModules.invoice.buildComposeToolbar()}
      <div class="email-body-editor compose-body-editor" id="ica-body" contenteditable="true" data-placeholder="Escreve a tua mensagem..."></div>
      <div class="ica-footer">
        <button class="btn btn-primary" id="ica-send-btn"
          ${AppActions.attrs("click", "historico-send-invoice-email-a50410f", [String((thread.guestEmail) ?? ''), String((thread.guestName) ?? ''), String((thread.id) ?? ''), !!thread._standalone])}>
          <i data-lucide="send"></i> Enviar
        </button>
      </div>
    </div>
    ${AppModules.invoice.threadContextV2?.(thread) || ''}
  `;

  if (window.lucide) lucide.createIcons();

  // Nunca herdar o alvo de resposta de uma thread aberta anteriormente.
  AppModules.invoice._invoiceReplyTarget = null;
  AppModules.invoice._invoicePaging[thread.id] = { dbCursor: null, dbDone: false, gmailPageToken: null, gmailDone: false, loading: false };

  AppModules.invoice._applyTemplateGating('ica-tpl-btn', thread.guestEmail);
  loadThreadMessages(thread);
  AppModules.invoice._startInvoicePoll(thread);

  const area = document.getElementById('invoice-messages-' + thread.id);
  if (area) {
    area.addEventListener('scroll', () => {
      const st = AppModules.invoice._invoicePaging[thread.id];
      if (area.scrollTop < 80 && st && !st.loading && (!st.dbDone || !st.gmailDone)) {
        loadThreadMessages(thread, { loadMore: true });
      }
    });
  }
}

/* Junta mensagens novas ao estado da thread aberta, sem duplicar por id */
function _mergeInvoiceMessages(newMsgs) {
  const map = new Map(AppModules.invoice._invoiceCurrentMessages.map(m => [m.id, m]));
  newMsgs.forEach(m => map.set(m.id, m));
  AppModules.invoice._invoiceCurrentMessages = _dedupInvoiceMessages(
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
  if (!html) return html;
  // Marcadores explícitos postos pelo compositor (emailComposer.js): exatos e
  // independentes da estrutura da tabela.
  const start = html.indexOf('<!--sp:body-->');
  const end = html.lastIndexOf('<!--/sp:body-->');
  if (start !== -1 && end > start) return html.slice(start + '<!--sp:body-->'.length, end);
  // Mensagens enviadas antes dos marcadores continuam a ser reconhecidas pela
  // classe da célula de conteúdo.
  if (!html.includes('email-body-bg')) return html;
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const contentCell = doc.querySelector('td.email-body-bg');
    if (contentCell) return contentCell.innerHTML;
  } catch {}
  return html;
}

let _invoiceNeedsReauth = false;
function _renderInvoiceMessages(area, needsReauth) {
  _invoiceNeedsReauth = !!needsReauth;
  if (!AppModules.invoice._invoiceCurrentMessages.length) {
    area.innerHTML = `
      <div class="invoice-msgs-empty">
        <i data-lucide="mail-open" style="width:32px;height:32px;opacity:.25;"></i>
        <p>Sem mensagens ainda.</p>
        ${needsReauth ? "<p class=\"imb-reauth\">Para ver os emails recebidos, <a href=\"#\" data-on-click=\"historico-prevent-default-e0d5cd5\">re-autoriza o Gmail</a> com permissão de leitura.</p>" : ''}
      </div>`;
    return;
  }

  // Histórico em conversa: uma linha do tempo à esquerda com os dias e, em
  // cada dia, os emails recebidos à esquerda e os enviados à direita. Só o
  // texto (sem o desenho do email); o assunto aparece quando muda.
  const esc = AppModules.invoice.esc;
  const msgs = AppModules.invoice._invoiceCurrentMessages;
  const dayKey = d => { const x = new Date(d); return isNaN(x) ? '' : `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`; };
  const subjectKey = sub => String(sub || '').replace(/^\s*((re|fw|fwd|enc|res)\s*:\s*)+/i, '').trim().toLowerCase();
  const groups = [];
  msgs.forEach((m, i) => {
    const key = dayKey(m.date);
    if (!groups.length || groups[groups.length - 1].key !== key) groups.push({ key, date: m.date, items: [] });
    groups[groups.length - 1].items.push({ m, i });
  });
  area.innerHTML = groups.map(g => {
    const d = new Date(g.date);
    const valid = !isNaN(d);
    const thisYear = valid && d.getFullYear() === new Date().getFullYear();
    return `
    <section class="im-day" aria-label="${valid ? d.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : ''}">
      <div class="im-day-mark" aria-hidden="true">
        <span class="im-day-dot"></span>
        ${valid ? `<b>${d.getDate()}</b><span>${d.toLocaleDateString('pt-PT', { month: 'short' }).replace('.', '')}${thisYear ? '' : ' ' + d.getFullYear()}</span><small>${d.toLocaleDateString('pt-PT', { weekday: 'short' }).replace('.', '')}</small>` : ''}
      </div>
      <div class="im-day-msgs">${g.items.map(({ m, i }) => {
        const sent = m.direction === 'sent';
        const body = sent ? _stripEmailChrome(m.body) : m.body;
        const text = mailText(body);
        const prev = msgs[i - 1];
        const showSubject = m.subject && (!prev || subjectKey(prev.subject) !== subjectKey(m.subject));
        const original = _invoiceOriginalOpen.has(m.id);
        const time = valid ? new Date(m.date).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }) : '';
        return `
        <article class="im-msg im-msg--${sent ? 'sent' : 'received'}">
          <div class="im-bubble">
            ${showSubject ? `<div class="im-subject">${esc(m.subject)}</div>` : ''}
            <div class="im-text">${text || '<p class="im-text-empty">Email sem texto.</p>'}</div>
            ${m.attachments?.length ? renderInvoiceAttachments(m.attachments, m.gmailMessageId) : ''}
          </div>
          <div class="im-foot">
            <span>${esc(m.author)}${time ? ' · ' + time : ''}</span>
            ${m.messageIdHeader ? `<button class="im-link" type="button" ${AppActions.attrs("click", "historico-reply-to-invoice-message-171e160", [i])}>Responder</button>` : ''}
            ${!text && body ? `<button type="button" class="im-link" aria-expanded="${original}" ${AppActions.attrs("click", "historico-toggle-original", [i])}>${original ? 'Esconder original' : 'Ver original'}</button>` : ''}
          </div>
          ${original && !text ? `<div class="im-original">${AppModules.invoice.renderEmailBodySandboxed(body)}</div>` : ''}
        </article>`;
      }).join('')}</div>
    </section>`;
  }).join('');

  if (needsReauth) {
    area.insertAdjacentHTML('afterbegin', "\n      <div class=\"imb-reauth-banner\">\n        <i data-lucide=\"alert-circle\" style=\"width:14px;height:14px;\"></i>\n        Para ver os emails recebidos, <a href=\"#\" data-on-click=\"historico-prevent-default-e0d5cd5\">re-autoriza o Gmail</a> com permissão de leitura.\n      </div>");
  }
}

// Emails cujo original (HTML completo) está aberto; sobrevive aos refrescos
// silenciosos da conversa, que voltam a desenhar a lista.
const _invoiceOriginalOpen = new Set();

// Texto legível de um email em HTML: parágrafos, quebras de linha, listas e
// links (só http(s)/mailto). Sem imagens (também não carrega píxeis de
// rastreio), estilos nem scripts — tudo o resto é escapado. As citações das
// respostas (o email anterior repetido em baixo) saem, porque esse email já
// aparece na conversa.
const _MAIL_BLOCKS = new Set(['P', 'DIV', 'TABLE', 'TR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'BLOCKQUOTE',
  'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'CENTER', 'PRE', 'HR', 'ADDRESS', 'DL', 'FIGURE']);
function mailText(html) {
  if (!html) return '';
  const esc = AppModules.invoice.esc;
  let doc;
  try { doc = new DOMParser().parseFromString(String(html), 'text/html'); } catch { return ''; }
  doc.querySelectorAll('style, script, noscript, template, head, title, img, svg, picture, video, audio, iframe, object, '
    + '.gmail_quote, .gmail_attr, blockquote[type="cite"], .yahoo_quoted, #appendonsend, #divRplyFwdMsg, [style*="display:none"], [style*="display: none"]')
    .forEach(node => node.remove());
  let out = '';
  const walk = parent => {
    for (const node of parent.childNodes) {
      if (node.nodeType === 3) { out += esc(node.nodeValue.replace(/\s+/g, ' ')); continue; }
      if (node.nodeType !== 1) continue;
      const tag = node.tagName;
      if (tag === 'BR') { out += '\n'; continue; }
      if (tag === 'A') {
        const href = (node.getAttribute('href') || '').trim();
        const label = node.textContent.replace(/\s+/g, ' ').trim();
        if (label && /^(https?:|mailto:)/i.test(href)) {
          out += `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
          continue;
        }
      }
      if (tag === 'LI') { out += '\n• '; walk(node); continue; }
      const block = _MAIL_BLOCKS.has(tag);
      if (block) out += '\n\n';
      walk(node);
      if (block) out += '\n\n';
      else if (tag === 'TD' || tag === 'TH') out += ' ';
    }
  };
  walk(doc.body || doc.documentElement);
  return out.split(/\n{2,}/)
    .map(par => par.split('\n').map(line => line.trim()).filter(Boolean).join('<br>'))
    .filter(Boolean)
    .map(par => `<p>${par}</p>`)
    .join('');
}

function toggleInvoiceOriginal(el, idx) {
  const m = AppModules.invoice._invoiceCurrentMessages[idx];
  const area = el.closest('.invoice-messages-area');
  if (!m || !area) return;
  if (_invoiceOriginalOpen.has(m.id)) _invoiceOriginalOpen.delete(m.id); else _invoiceOriginalOpen.add(m.id);
  const top = area.scrollTop;
  _renderInvoiceMessages(area, _invoiceNeedsReauth);
  area.scrollTop = top;
  if (window.lucide) lucide.createIcons();
}

function renderInvoiceAttachments(atts, gmailMessageId) {
  if (!gmailMessageId) return '';
  return `<div class="ib-attachments">${atts.map(a => `
    <a class="ib-attachment" href="/auth/email/attachment?message_id=${encodeURIComponent(gmailMessageId)}&attachment_id=${encodeURIComponent(a.attachmentId)}&filename=${encodeURIComponent(a.filename)}" target="_blank" rel="noopener">
      <i data-lucide="paperclip" style="width:12px;height:12px;"></i><span>${AppModules.invoice.esc(a.filename)}</span><span class="ib-att-size">${_formatBytes(a.size)}</span>
    </a>`).join('')}</div>`;
}

function _formatBytes(n) {
  if (!n) return '';
  const kb = n / 1024;
  return kb < 1024 ? `${kb.toFixed(0)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}

/* ── Responder a uma mensagem específica (threading real) ── */
function replyToInvoiceMessage(idx) {
  const m = AppModules.invoice._invoiceCurrentMessages[idx];
  if (!m || !m.messageIdHeader) return;
  AppModules.invoice._invoiceReplyTarget = { gmailThreadId: m.gmailThreadId, messageIdHeader: m.messageIdHeader, subject: m.subject };

  const subjInput = document.getElementById('ica-subject');
  if (subjInput && !/^re:/i.test(subjInput.value.trim())) subjInput.value = `Re: ${m.subject || ''}`;

  const ctx = document.getElementById('ica-reply-context');
  const snippetEl = document.getElementById('ica-reply-snippet');
  if (snippetEl) snippetEl.textContent = `A responder a: ${AppModules.invoice._snippet('', m.body).slice(0, 60)}`;
  if (ctx) ctx.style.display = '';
  document.getElementById('ica-body')?.focus();
}

function cancelInvoiceReply() {
  AppModules.invoice._invoiceReplyTarget = null;
  const ctx = document.getElementById('ica-reply-context');
  if (ctx) ctx.style.display = 'none';
}

/* ── Carregar e combinar mensagens (enviadas + recebidas Gmail), com paginação ── */
async function loadThreadMessages(thread, opts = {}) {
  const { silent = false, loadMore = false } = opts;
  const area = document.getElementById('invoice-messages-' + thread.id);
  if (!area) return;

  const paging = AppModules.invoice._invoicePaging[thread.id]
    || (AppModules.invoice._invoicePaging[thread.id] = { dbCursor: null, dbDone: false, gmailPageToken: null, gmailDone: false, loading: false });
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
      body:            m.body || `<span style="opacity:.6">${AppModules.invoice.esc(m.snippet)}</span>`,
      direction:       m.direction,
      author:          m.direction === 'received' ? thread.guestName : 'Tu',
      gmailMessageId:  m.id,
      gmailThreadId:   m.threadId,
      messageIdHeader: m.messageIdHeader || null,
      attachments:     m.attachments || [],
    }));
    if (fetchGmail) { paging.gmailPageToken = inboxData.next_page_token || null; paging.gmailDone = !inboxData.next_page_token; }

    if (!loadMore && !silent) AppModules.invoice._invoiceCurrentMessages = []; // (re)abertura da thread do zero
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
    if (!silent && !loadMore && !AppModules.invoice._invoiceCurrentMessages.length) {
      area.innerHTML = `<div class="invoice-msgs-empty"><p>Erro ao carregar mensagens.</p></div>`;
    }
  } finally {
    paging.loading = false;
  }
  if (window.lucide) lucide.createIcons();
}

async function reconnectGmailForInbox() {
  await AppModules.core.showView('definicoes');
  AppModules.core.switchSettingsTab('gcal');
  setTimeout(() => AppModules.core.toast('Desliga e volta a ligar o Gmail para adicionar a permissão de leitura.', 'info'), 300);
}


AppActions.register({
  "historico-prevent-default-e0d5cd5": (el, event, args) => { event.preventDefault();reconnectGmailForInbox() },
  "historico-show-view-3d0e569": (el, event, args) => { AppModules.core.showView('reservas') },
  "historico-open-templates-picker-854f770": (el, event, args) => { AppModules.invoice.openTemplatesPicker('ica-subject','ica-body',args[0]) },
  "historico-cancel-invoice-reply-7bdb026": (el, event, args) => { cancelInvoiceReply() },
  "historico-send-invoice-email-a50410f": (el, event, args) => { AppModules.invoice.sendInvoiceEmail(args[0],args[1],args[2],args[3]) },
}, "click");

AppActions.register({
  "historico-reply-to-invoice-message-171e160": (el, event, args) => { replyToInvoiceMessage(args[0]) },
  "historico-toggle-original": (el, event, args) => { toggleInvoiceOriginal(el, args[0]) },
  "historico-archive-invoice-thread-cdd75e1": (el, event, args) => { AppModules.invoice.archiveInvoiceThread(args[0],args[1]) },
  "historico-restore-invoice-thread-adcb894": (el, event, args) => { AppModules.invoice.restoreInvoiceThread(args[0]) },
  "historico-delete-invoice-thread-history-917ed4c": (el, event, args) => { AppModules.invoice.deleteInvoiceThreadHistory(args[0],args[1],args[2]) },
}, "click");

})();
