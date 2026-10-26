// Estado privado; interface partilhada em AppModules.definicoes.
// Pré-visualização do rascunho atual e envio do email de teste — a mesma
// composição usada no envio real (backend/src/services/emailComposer.js).
(() => {
AppModules.define('definicoes', {
  emailBodyChanged: { get: () => emailBodyChanged },
  previewEmail: { get: () => previewEmail },
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

function _previewDraft() {
  const subject = document.getElementById('et-subject')?.value ?? '';
  const body = document.getElementById('et-body')?.innerHTML ?? '';
  const status = document.getElementById('et-preview-status')?.value || 'confirmada';
  const accommodationId = document.getElementById('et-preview-accommodation')?.value || '';
  const draft = { subject, body, lang: AppModules.definicoes.emailLang, status };
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
    _setPreviewNotice(res.missing_translation
      ? `Sem tradução guardada para este idioma — a pré-visualização mostra o texto em português.`
      : '');
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

AppActions.register({
  "emails-preview-email-b9e13c6": (el, event, args) => { previewEmail(args[0]) },
}, "click");

AppActions.register({
  "emails-update-email-preview-34d4f1c": (el, event, args) => { updateEmailPreview() },
}, "change");

AppActions.register({
  "emails-email-body-changed-90a5e82": (el, event, args) => { emailBodyChanged() },
}, "input");

// Limpeza da funcionalidade ao sair ou trocar de organização.
AppModules.onReset('features/emails/preview.js', () => {
  clearTimeout(_emailPreviewTimer); clearInterval(_emailPreviewTimer); _emailPreviewTimer = null;
  _emailPreviewSeq++;
});

})();
