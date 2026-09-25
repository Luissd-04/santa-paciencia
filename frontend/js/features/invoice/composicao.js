// Estado privado; interface partilhada em AppModules.invoice.
(() => {
AppModules.define('invoice', {
  _applyTemplateGating: { get: () => _applyTemplateGating },
  buildComposeToolbar: { get: () => buildComposeToolbar },
  openInvoiceForReservation: { get: () => openInvoiceForReservation },
  openNovaConversa: { get: () => openNovaConversa },
  openTemplatesPicker: { get: () => openTemplatesPicker },
  sendInvoiceEmail: { get: () => sendInvoiceEmail },
});

'use strict';
async function sendInvoiceEmail(toEmail, toName, reservationId, standalone) {
  const subject = document.getElementById('ica-subject')?.value?.trim();
  const bodyEl  = document.getElementById('ica-body');
  const body    = bodyEl?.innerHTML?.trim();

  if (!subject || !bodyEl?.textContent?.trim()) { AppModules.core.toast('Preenche o assunto e a mensagem.', 'warning'); return; }

  const missing = _unresolvedTemplateVars(subject, body);
  if (missing.length) {
    AppModules.core.toast(`Faltam dados por preencher antes de enviar: ${missing.join(', ')}`, 'error', 6000);
    return;
  }

  const btn = document.getElementById('ica-send-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> A enviar...'; if (window.lucide) lucide.createIcons(); }

  try {
    await AppModules.invoice._sendEmail(toEmail, subject, body, toName, standalone ? null : reservationId, AppModules.invoice._invoiceReplyTarget);
    AppModules.core.toast(`Email enviado para ${toName}`, 'success');
    document.getElementById('ica-subject').value    = '';
    document.getElementById('ica-body').innerHTML   = '';
    AppModules.invoice.cancelInvoiceReply();

    // Se a thread estava arquivada, restaurar automaticamente
    const threadKey = String(reservationId);
    if (AppModules.invoice._invoiceArchivedKeys.has(threadKey)) {
      await fetch(`/auth/email/archives/${encodeURIComponent(threadKey)}`, { method: 'DELETE', credentials: 'include' }).catch(() => {});
      AppModules.invoice._invoiceArchivedKeys.delete(threadKey);
      await AppModules.invoice.loadInvoiceConversas();
      AppModules.invoice.switchInvoiceTab('conversas', false);
      return;
    }

    const thread = AppModules.invoice._invoiceConversas.find(t => t.id === reservationId)
      || { id: reservationId, guestEmail: toEmail, guestName: toName, _standalone: standalone };
    AppModules.invoice.loadThreadMessages(thread);
  } catch (err) {
    if (err?.payload?.needs_reauth) {
      AppModules.core.toast('Gmail expirou — vai a Definições → Gmail e volta a ligar.', 'error', 6000);
    } else {
      AppModules.core.toast('Erro ao enviar: ' + (err?.payload?.error || err?.message || err), 'error');
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
        <button class="modal-close" data-on-click="composicao-close-invoice-modal-8a17ccf">
          <i data-lucide="x"></i>
        </button>
      </div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:12px;">
        <label class="form-label">Para (email)
          <input class="form-control" type="email" id="nc-to" placeholder="hospede@email.com" value="${prefillEmail || ''}" autocomplete="off">
        </label>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <label class="form-label" style="margin:0;flex:1;">Assunto
            <input class="form-control" type="text" id="nc-subject" placeholder="Assunto da mensagem" autocomplete="off">
          </label>
          <span class="ica-tpl-reason" id="nc-tpl-reason" style="margin-top:18px;"></span>
          <button class="btn btn-ghost btn-xs" id="nc-tpl-btn" style="margin-top:18px;flex-shrink:0;" data-on-click="composicao-open-templates-picker-90e5cbf">
            <i data-lucide="layout-template"></i> Template
          </button>
        </div>
        <label class="form-label">Mensagem</label>
        ${buildComposeToolbar()}
        <div class="email-body-editor compose-body-editor" id="nc-body" contenteditable="true" data-placeholder="Escreve a tua mensagem..."></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" data-on-click="composicao-close-invoice-modal-8a17ccf">Cancelar</button>
        <button class="btn btn-primary" id="nc-send-btn" data-on-click="composicao-send-nova-conversa-1a4eb0f">
          <i data-lucide="send"></i> Enviar
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);
  if (window.lucide) lucide.createIcons();
  const toField = document.getElementById('nc-to');
  toField?.addEventListener('blur', () => _applyTemplateGating('nc-tpl-btn', toField.value.trim()));
  _applyTemplateGating('nc-tpl-btn', prefillEmail);
  if (prefillEmail) document.getElementById('nc-subject')?.focus();
  else toField?.focus();
}

async function sendNovaConversa() {
  const to      = document.getElementById('nc-to')?.value?.trim();
  const subject = document.getElementById('nc-subject')?.value?.trim();
  const bodyEl  = document.getElementById('nc-body');
  const body    = bodyEl?.innerHTML?.trim();

  if (!to || !subject || !bodyEl?.textContent?.trim()) { AppModules.core.toast('Preenche todos os campos.', 'warning'); return; }

  const missing = _unresolvedTemplateVars(subject, body);
  if (missing.length) {
    AppModules.core.toast(`Faltam dados por preencher antes de enviar: ${missing.join(', ')}`, 'error', 6000);
    return;
  }

  const btn = document.getElementById('nc-send-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i data-lucide="loader-2"></i> A enviar...'; if (window.lucide) lucide.createIcons(); }

  try {
    await AppModules.invoice._sendEmail(to, subject, body, null, _novaConversaReservationId);
    _closeInvoiceModal('modal-nova-conversa');
    AppModules.core.toast('Email enviado com sucesso.', 'success');
  } catch (err) {
    if (err?.payload?.needs_reauth) {
      AppModules.core.toast('Gmail expirou — vai a Definições → Gmail e volta a ligar.', 'error', 6000);
    } else {
      AppModules.core.toast('Erro ao enviar email: ' + (err?.payload?.error || err?.message || err), 'error');
    }
    if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="send"></i> Enviar'; if (window.lucide) lucide.createIcons(); }
  }
}

/* ── Abrir invoice de uma reserva específica (chamado do detalhe de reserva) ── */
async function openInvoiceForReservation(reservationId, guestEmail, guestName) {
  await AppModules.core.showView('invoice');
  const open = () => {
    const thread = AppModules.invoice._invoiceConversas.find(t => t.id === reservationId);
    if (thread) { AppModules.invoice.openInvoiceThread(thread); return; }
    setTimeout(() => {
      const t2 = AppModules.invoice._invoiceConversas.find(t => t.id === reservationId);
      if (t2) { AppModules.invoice.openInvoiceThread(t2); return; }
      /* sem conversa anterior — abrir modal de nova mensagem pré-preenchido */
      openNovaConversa(guestEmail, guestName, reservationId);
    }, 800);
  };
  if (AppModules.invoice._invoiceConversas.length) open();
  else setTimeout(open, 600);
}

/* ── Formatação (compose rico, reply e nova mensagem) ── */
function buildComposeToolbar() {
  return "\n    <div class=\"email-fmt-toolbar compose-fmt-toolbar\">\n      <button class=\"fmt-btn\" type=\"button\" data-on-mousedown=\"composicao-prevent-default-b71b57c\" data-on-click=\"composicao-exec-command-c7ec81d\" title=\"Negrito\"><b>B</b></button>\n      <button class=\"fmt-btn\" type=\"button\" data-on-mousedown=\"composicao-prevent-default-b71b57c\" data-on-click=\"composicao-exec-command-5331e67\" title=\"Itálico\"><i>I</i></button>\n      <button class=\"fmt-btn\" type=\"button\" data-on-mousedown=\"composicao-prevent-default-b71b57c\" data-on-click=\"composicao-exec-command-2bf8db4\" title=\"Sublinhado\"><u>U</u></button>\n      <div class=\"fmt-btn-sep\"></div>\n      <button class=\"fmt-btn fmt-btn-wide\" type=\"button\" data-on-mousedown=\"composicao-prevent-default-b71b57c\" data-on-click=\"composicao-exec-command-52661d8\" title=\"Lista\">• Lista</button>\n    </div>";
}

/* ── Dados do destinatário para preencher templates ── */
// Nunca usar a conversa/thread que estava aberta atrás para preencher uma
// "Nova mensagem" — os dados vêm sempre do email para quem se está mesmo a
// escrever agora. Para uma resposta dentro de uma conversa, o email é o da
// própria thread.
function _currentComposeEmail(bodyId) {
  if (bodyId === 'nc-body') return document.getElementById('nc-to')?.value?.trim() || '';
  return _lastKnownComposeEmail || '';
}
let _lastKnownComposeEmail = '';

async function _fetchComposeContext(email) {
  const normalized = String(email || '').trim();
  const empty = { guest: null, reservation: null, active: false, eligible: false, eligible_reason: null, vars: {} };
  if (!normalized) return empty;
  try {
    const res  = await fetch(`/auth/email/lookup?to_email=${encodeURIComponent(normalized)}`, { credentials: 'include' });
    const data = await res.json();
    return data?.data || empty;
  } catch {
    return empty;
  }
}

/* ── Gating do botão Template: só faz sentido junto de uma reserva relevante
   (ativa agora, check-in nos próximos 7 dias, ou check-out nos últimos 7 dias) ── */
const TPL_GATING_TOOLTIP = 'Só disponível quando o hóspede tem uma estadia ativa, chega nos próximos 7 dias, ou saiu nos últimos 7 dias.';

// btnId/reasonId partilham o mesmo prefixo nos dois pontos onde isto é chamado
// ('ica-tpl-btn'/'ica-tpl-reason' e 'nc-tpl-btn'/'nc-tpl-reason').
async function _applyTemplateGating(btnId, email) {
  const btn      = document.getElementById(btnId);
  const reasonEl = document.getElementById(btnId.replace('-btn', '-reason'));
  if (!btn) return;
  btn.disabled = true; // estado seguro por defeito enquanto verifica
  btn.title = '';
  btn.classList.add('tpl-btn-disabled');
  if (reasonEl) reasonEl.textContent = '';
  if (!email) return;
  const ctx = await _fetchComposeContext(email);
  const eligible = !!ctx.eligible;
  btn.disabled = !eligible;
  btn.title = eligible ? '' : TPL_GATING_TOOLTIP;
  btn.classList.toggle('tpl-btn-disabled', !eligible);
  if (reasonEl) reasonEl.textContent = eligible ? '' : (ctx.guest ? '(sem estadia relevante)' : '(sem reserva associada)');
}

function _interpolateTemplate(text, vars) {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) =>
    vars[key] != null && vars[key] !== '' ? vars[key] : match
  );
}

function _unresolvedTemplateVars(...texts) {
  const found = new Set();
  for (const text of texts) {
    for (const m of String(text || '').matchAll(/\{\{\s*(\w+)\s*\}\}/g)) found.add(m[1]);
  }
  return [...found];
}

/* ── Templates picker ── */
let _invoiceTemplatesCache = null;
let _tplPickerContext = { guest: null, reservation: null, active: false, vars: {} };

async function openTemplatesPicker(subjectId, bodyId, forEmail) {
  if (forEmail) _lastKnownComposeEmail = forEmail;
  if (!_invoiceTemplatesCache) {
    try {
      const data = await AppModules.core.apiGet('/api/email-templates');
      _invoiceTemplatesCache = (data?.data || []).filter(t => t.subject && t.body);
    } catch { _invoiceTemplatesCache = []; }
  }

  document.getElementById('modal-tpl-picker')?.remove();

  if (!_invoiceTemplatesCache.length) {
    AppModules.core.toast('Sem templates configurados. Vai a Definições → Templates.', 'info');
    return;
  }

  const email = _currentComposeEmail(bodyId);
  _tplPickerContext = await _fetchComposeContext(email);

  const wrap = document.createElement('div');
  wrap.className = 'modal-bg open';
  wrap.id = 'modal-tpl-picker';
  wrap.addEventListener('click', e => { if (e.target === wrap) wrap.remove(); });
  wrap.innerHTML = `
    <div class="modal" style="max-width:440px;">
      <div class="modal-header">
        <h3><i data-lucide="layout-template" style="width:16px;height:16px;vertical-align:-2px;margin-right:4px;"></i>Escolher template</h3>
        <button class="modal-close" data-on-click="composicao-get-element-by-id-12671d3"><i data-lucide="x"></i></button>
      </div>
      ${!_tplPickerContext.guest
        ? `<div class="tpl-picker-warning">⚠️ Sem hóspede associado a este email — os campos da reserva vão ficar por preencher.</div>`
        : !_tplPickerContext.eligible
          ? `<div class="tpl-picker-warning">⚠️ ${AppModules.invoice.esc(_tplPickerContext.guest.name || '')} não tem estadia ativa, nem chegada nos próximos 7 dias, nem saída nos últimos 7 dias — os campos da reserva vão ficar por preencher.</div>`
          : ''}
      <div class="modal-body" style="padding:8px 0;">
        ${_invoiceTemplatesCache.map((t, i) => `
          <button class="tpl-picker-item" ${AppActions.attrs("click", "composicao-apply-template-0af418a", [i, String((subjectId) ?? ''), String((bodyId) ?? '')])}>
            <span class="tpl-picker-name">${AppModules.invoice.esc(t.name || t.slug)}</span>
            <span class="tpl-picker-sub">${AppModules.invoice.esc(t.subject)}</span>
          </button>`).join('')}
      </div>
    </div>
  `;
  document.body.appendChild(wrap);
  if (window.lucide) lucide.createIcons();
}

function _applyTemplate(index, subjectId, bodyId) {
  const tpl = _invoiceTemplatesCache[index];
  if (!tpl) return;

  const vars = _tplPickerContext.vars || {};
  const subEl  = document.getElementById(subjectId);
  const bodyEl = document.getElementById(bodyId);
  if (subEl)  subEl.value    = _interpolateTemplate(tpl.subject, vars);
  if (bodyEl) bodyEl.innerHTML = _interpolateTemplate(tpl.body, vars);
  document.getElementById('modal-tpl-picker')?.remove();
}

/* ── Manter a conversa aberta ao recarregar a página ── */

AppActions.register({
  "composicao-get-element-by-id-12671d3": (el, event, args) => { document.getElementById('modal-tpl-picker').remove() },
  "composicao-exec-command-c7ec81d": (el, event, args) => { document.execCommand('bold') },
  "composicao-exec-command-5331e67": (el, event, args) => { document.execCommand('italic') },
  "composicao-exec-command-2bf8db4": (el, event, args) => { document.execCommand('underline') },
  "composicao-exec-command-52661d8": (el, event, args) => { document.execCommand('insertUnorderedList') },
  "composicao-close-invoice-modal-8a17ccf": (el, event, args) => { _closeInvoiceModal('modal-nova-conversa') },
  "composicao-open-templates-picker-90e5cbf": (el, event, args) => { openTemplatesPicker('nc-subject','nc-body') },
  "composicao-send-nova-conversa-1a4eb0f": (el, event, args) => { sendNovaConversa() },
}, "click");

AppActions.register({
  "composicao-prevent-default-b71b57c": (el, event, args) => { event.preventDefault() },
}, "mousedown");

AppActions.register({
  "composicao-apply-template-0af418a": (el, event, args) => { _applyTemplate(args[0],args[1],args[2]) },
}, "click");

// Limpeza da funcionalidade ao sair ou trocar de organização.
AppModules.onReset('features/invoice/composicao.js', () => {
  _novaConversaReservationId = null;
  _invoiceTemplatesCache = null;
  _tplPickerContext = { guest: null, reservation: null, active: false, vars: {} };
});

})();
