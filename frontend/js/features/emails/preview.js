// Estado privado; interface partilhada em AppModules.definicoes.
// Pré-visualização do rascunho atual e envio do email de teste — a mesma
// composição usada no envio real (backend/src/services/emailComposer.js).
(() => {
AppModules.define('definicoes', {
  emailBodyChanged: { get: () => emailBodyChanged },
  fillPreviewContext: { get: () => fillPreviewContext },
  previewAccommodation: { get: () => previewAccommodation },
  emailReadiness: { get: () => emailReadiness },
  previewEmail: { get: () => previewEmail },
  sendAllSamples: { get: () => sendAllSamples },
  updateEmailPreview: { get: () => updateEmailPreview },
});

// O HTML vem do backend (POST .../preview-html), da MESMA função que compõe o
// email enviado. Antes havia aqui um buildEmailPreviewHtml() que recriava o
// layout no cliente, e divergia do que o hóspede recebia.
let _emailPreviewTimer = null;
let _emailPreviewSeq = 0;

function emailBodyChanged() {
  _emailPreviewSeq++;
  clearTimeout(_emailPreviewTimer);
  _emailPreviewTimer = setTimeout(updateEmailPreview, 350);
}

// Contexto da pré-visualização: um alojamento da organização e uma reserva
// real dele, ou um exemplo num dado estado. O que falta a cada email (para o
// estado na lista e os avisos do editor) vem do mesmo alojamento.
let previewAccommodation = null;
let emailReadiness = {};
const EXAMPLES = [['confirmada', 'Confirmada'], ['aguardar_pagamento', 'Aguarda o sinal'], ['pendente', 'Pedido por aprovar'],
  ['pre_reserva', 'Pré-reserva'], ['cancelada', 'Cancelada']];
const esc = value => AppModules.core.escapeHtml(value ?? '');

async function fillPreviewContext() {
  const accSel = document.getElementById('et-preview-accommodation');
  if (!accSel) return;
  let list = [];
  try { list = (await AppModules.core.apiGet('/api/accommodations'))?.data || []; } catch { list = []; }
  const roots = list.filter(a => !a.parent_id);
  const ordered = [...roots, ...list.filter(a => a.parent_id)];
  const saved = AppModules.core.SS.get('email:acc', '');
  const chosen = ordered.find(a => a.id === saved) || roots[0] || ordered[0] || null;
  accSel.innerHTML = ordered.length
    ? ordered.map(a => `<option value="${esc(a.id)}" ${a.id === chosen?.id ? 'selected' : ''}>${esc(a.parent_id ? `— ${a.name}` : a.name)}</option>`).join('')
    : '<option value="">Sem alojamentos</option>';
  await onAccommodationChange(false);
}

async function onAccommodationChange(refresh = true) {
  const accSel = document.getElementById('et-preview-accommodation');
  const id = accSel?.value || '';
  AppModules.core.SS.set('email:acc', id);
  previewAccommodation = id ? { id, name: accSel.selectedOptions[0]?.textContent.replace(/^— /, '') || '' } : null;
  const resSel = document.getElementById('et-preview-reservation');
  let reservations = [];
  if (id) {
    try { reservations = (await AppModules.core.apiGet(`/api/email-templates/preview-reservations?accommodation_id=${encodeURIComponent(id)}`))?.data || []; } catch { reservations = []; }
  }
  if (resSel) {
    const day = value => window.ReservationDates.formatDayLabel(value, { weekday: false });
    const label = r => `${r.guest_name} · ${day(r.check_in)} → ${day(r.check_out)}`;
    resSel.innerHTML = `${reservations.length ? `<optgroup label="Reservas reais">${reservations.map(r => `<option value="res:${esc(r.id)}">${esc(label(r))}</option>`).join('')}</optgroup>` : ''}
      <optgroup label="Exemplo">${EXAMPLES.map(([v, l]) => `<option value="ex:${v}">Exemplo · ${esc(l)}</option>`).join('')}</optgroup>`;
  }
  await loadReadiness(id);
  if (refresh) updateEmailPreview();
}

async function loadReadiness(id) {
  emailReadiness = {};
  if (id) {
    try {
      const data = (await AppModules.core.apiGet(`/api/accommodations/${encodeURIComponent(id)}/email-readiness`))?.data;
      for (const e of data?.emails || []) emailReadiness[e.slug] = e;
    } catch { emailReadiness = {}; }
  }
  AppModules.definicoes.renderTemplateList();
  AppModules.definicoes.renderEditorStatus();
}

function _previewDraft() {
  const { subject, body } = AppModules.definicoes.editorDraft();
  const draft = { subject, body, lang: AppModules.definicoes.emailLang };
  const choice = document.getElementById('et-preview-reservation')?.value || 'ex:confirmada';
  if (choice.startsWith('res:')) draft.reservation_id = choice.slice(4);
  else draft.status = choice.slice(3) || 'confirmada';
  const accommodationId = document.getElementById('et-preview-accommodation')?.value || '';
  if (accommodationId) draft.accommodation_id = accommodationId;
  return draft;
}

function _setPreviewNotice(text) {
  const el = document.getElementById('et-preview-notice');
  if (!el) return;
  el.textContent = text || '';
  el.style.display = text ? 'block' : 'none';
}

async function updateEmailPreview() {
  const frame = document.getElementById('et-preview-frame');
  if (!frame || !AppModules.definicoes.selectedTemplateSlug) return;

  // Respostas atrasadas de um rascunho anterior não podem sobrepor-se a uma
  // mais recente: cada pedido leva um número de ordem e só o último escreve.
  const seq = ++_emailPreviewSeq;
  try {
    const res = await AppModules.core.apiPost(`/api/email-templates/${AppModules.definicoes.selectedTemplateSlug}/preview-html`, _previewDraft());
    if (seq !== _emailPreviewSeq) return;
    if (!res?.success) { _setPreviewNotice('Não foi possível gerar a pré-visualização.'); return; }
    frame.srcdoc = res.html;
    const sender = AppModules.definicoes.emailSender || {};
    const from = sender.name || previewAccommodation?.name || '';
    const fromEl = document.getElementById('et-preview-from');
    if (fromEl) fromEl.textContent = from;
    const avatar = document.getElementById('et-preview-avatar');
    if (avatar) avatar.textContent = from.trim().charAt(0).toUpperCase();
    const subjectEl = document.getElementById('et-preview-subject');
    if (subjectEl) subjectEl.textContent = res.subject || '';
    const notices = [];
    if (res.missing?.length) notices.push(`Com estes dados, este email não saía: falta ${res.missing.map(m => m.label).join(', ')}.`);
    if (res.missing_translation) notices.push('Sem tradução guardada para esta língua: a pré-visualização mostra o texto em português.');
    _setPreviewNotice(notices.join(' '));
  } catch (e) {
    if (seq !== _emailPreviewSeq) return;
    _setPreviewNotice('Não foi possível gerar a pré-visualização (sem ligação ao servidor).');
  }
}

// ── PREVIEW ──
// Envio de teste: usa o MESMO rascunho e a MESMA composição da
// pré-visualização. Antes enviava o conteúdo gravado, ignorando o que estava
// no editor — o email de teste não correspondia ao que se estava a ver.
async function previewEmail(slug) {
  try {
    const data = await AppModules.core.apiPost(`/api/email-templates/${slug}/preview`, _previewDraft());
    if (data.success) {
      AppModules.core.toast(`📧 ${data.message}`, 'success');
      if (data.missing_translation) AppModules.core.toast('Sem tradução guardada: foi enviado o texto em português.', 'info');
    } else {
      AppModules.core.toast('❌ ' + (data.error || 'Erro ao enviar preview.'), 'error');
    }
  } catch (e) {
    AppModules.core.toast('❌ Erro de ligação ao servidor.', 'error');
  }
}

// Um exemplo de cada email da plataforma para o endereço indicado (o servidor
// compõe tudo com dados fictícios; ver services/emailSamples.js).
async function sendAllSamples() {
  const input = document.getElementById('email-samples-to');
  const btn = document.getElementById('email-samples-btn');
  const result = document.getElementById('email-samples-result');
  const to = input?.value.trim() || '';
  if (!to || !input.checkValidity()) {
    AppModules.core.toast('Indique um endereço de email válido.', 'warning');
    input?.focus();
    return;
  }
  const label = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `${AppModules.core.lcIcon('loader-2', 13)} A enviar…`;
  if (result) result.textContent = 'A enviar os exemplos, um de cada vez. Pode demorar até um minuto.';
  try {
    const data = await AppModules.core.apiPost('/api/email-templates/send-samples', { to }, { timeoutMs: 180000 });
    if (data?.success) {
      const failed = data.failed?.length ? ` Não foi possível enviar: ${data.failed.join(', ')}.` : '';
      if (result) result.textContent = `Enviados ${data.sent} de ${data.total} emails para ${data.to}.${failed}`;
      AppModules.core.toast(`📧 ${data.sent} emails enviados para ${data.to}`, failed ? 'warning' : 'success');
    } else {
      if (result) result.textContent = '';
      AppModules.core.toast('❌ ' + (data?.error || 'Não foi possível enviar os exemplos.'), 'error');
    }
  } catch (e) {
    if (result) result.textContent = '';
    AppModules.core.toast('❌ ' + (e?.message || 'Erro de ligação ao servidor.'), 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = label;
    if (window.lucide) lucide.createIcons();
  }
}

AppActions.register({
  "emails-preview-email-b9e13c6": (el, event, args) => { previewEmail(args[0]) },
}, "click");

AppActions.register({
  "emails-send-all-samples": (el, event) => { event.preventDefault(); sendAllSamples() },
}, "submit");

AppActions.register({
  "emails-update-email-preview-34d4f1c": (el, event, args) => { updateEmailPreview() },
  "emails-preview-accommodation-changed": () => { onAccommodationChange() },
}, "change");


// Limpeza da funcionalidade ao sair ou trocar de organização.
AppModules.onReset('features/emails/preview.js', () => {
  clearTimeout(_emailPreviewTimer); clearInterval(_emailPreviewTimer); _emailPreviewTimer = null;
  _emailPreviewSeq++;
});

})();
