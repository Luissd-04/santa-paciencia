// Estado privado; interface partilhada em AppModules.definicoes.
// Edição do modelo selecionado: painel completo, idiomas e barra de
// formatação. O estado da lista de modelos vive em emails.js.
(() => {
AppModules.define('definicoes', {
  selectTemplate: { get: () => selectTemplate },
  switchEmailLang: { get: () => switchEmailLang },
  syncEditorToTemplate: { get: () => syncEditorToTemplate },
  toggleEmailWindow: { get: () => toggleEmailWindow },
});

function escapeAttr(s) {
  return (s || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── FORMATTING TOOLBAR ──
// data-on-mousedown="emails-keep-body-focus-*" em todos os botões: são fora
// do contenteditable, e o browser tira-lhe o foco/seleção ao premir o rato
// num botão — sem isto, o comando aplicava-se ao sítio errado (ou a lado
// nenhum), tal como acontecia no menu de códigos.
function buildFmtToolbar() {
  const mk = (action, title, label) =>
    `<button class="fmt-btn" type="button" data-on-click="${action}" data-on-mousedown="emails-keep-body-focus-2f8d6b1" title="${title}">${label}</button>`;
  const mkWide = (action, title, label) =>
    `<button class="fmt-btn fmt-btn-wide" type="button" data-on-click="${action}" data-on-mousedown="emails-keep-body-focus-2f8d6b1" title="${title}">${label}</button>`;
  return `
    <div class="email-fmt-toolbar">
      ${mk('emails-exec-command-7a0a29c', 'Negrito', '<b>B</b>')}
      ${mk('emails-exec-command-94eb21d', 'Itálico', '<i>I</i>')}
      ${mk('emails-exec-command-e628d3d', 'Sublinhado', '<u>U</u>')}
      <div class="fmt-btn-sep"></div>
      ${mkWide('emails-fmt-wrap-93235a9', 'Título', 'H2')}
      ${mkWide('emails-fmt-wrap-078e552', 'Subtítulo', 'H3')}
      ${mkWide('emails-fmt-wrap-fa605ad', 'Parágrafo', 'P')}
      <div class="fmt-btn-sep"></div>
      ${mk('emails-exec-command-1c9d4a7', 'Alinhar à esquerda', AppModules.core.lcIcon('align-left', 14))}
      ${mk('emails-exec-command-6b2e9f3', 'Centrar', AppModules.core.lcIcon('align-center', 14))}
      ${mk('emails-exec-command-d5a83c0', 'Alinhar à direita', AppModules.core.lcIcon('align-right', 14))}
      ${mk('emails-exec-command-4e71b6a', 'Justificar', AppModules.core.lcIcon('align-justify', 14))}
      <div class="fmt-btn-sep"></div>
      ${mkWide('emails-fmt-insert-4fccc2e', 'Lista', '• Lista')}
      ${mkWide('emails-fmt-insert-0ecf494', 'Lista numerada', '1. Lista')}
      <div class="fmt-btn-sep"></div>
      ${mkWide('emails-fmt-insert-bf3077d', 'Separador', '—')}
    </div>`;
}

function fmtWrap(open, close) {
  const editor = document.getElementById('et-body');
  if (!editor) return;
  editor.focus();
  const sel = window.getSelection();
  const selText = (sel?.rangeCount > 0 ? sel.getRangeAt(0).toString() : '') || 'texto aqui';
  document.execCommand('insertHTML', false, open + selText + close);
  AppModules.definicoes.emailBodyChanged();
}

function fmtInsert(html) {
  const editor = document.getElementById('et-body');
  if (!editor) return;
  editor.focus();
  document.execCommand('insertHTML', false, html);
  AppModules.definicoes.emailBodyChanged();
}

// ── LANGUAGE TABS ──
function buildLangTabs(slug) {
  return `<div class="email-lang-tabs">
    ${AppModules.definicoes.LANGS.map(l => `
      <button class="lang-tab${AppModules.definicoes.emailLang === l.code ? ' active' : ''}"
              data-lang="${l.code}"
              ${AppActions.attrs("click", "emails-switch-email-lang-8e428f1", [String((l.code) ?? ''), String((slug) ?? '')])}>
        ${AppModules.core.flagHtml(l.cc, { size: 16 })} ${l.label}
      </button>`).join('')}
  </div>`;
}

function switchEmailLang(lang, slug) {
  syncEditorToTemplate();
  AppModules.definicoes.emailLang = lang;
  AppModules.core.SS.set('email:lang', lang);
  document.querySelectorAll('.lang-tab').forEach(b => b.classList.toggle('active', b.dataset.lang === lang));
  const t = AppModules.definicoes.emailTemplates.find(x => x.slug === slug);
  const subj = document.getElementById('et-subject');
  const body = document.getElementById('et-body');
  if (subj) subj.value = t?.[AppModules.definicoes.langField(lang, 'subject')] || '';
  if (body) { body.innerHTML = t?.[AppModules.definicoes.langField(lang, 'body')] || ''; AppModules.definicoes.updateEmailPreview(); }
}

function syncEditorToTemplate() {
  const t = AppModules.definicoes.emailTemplates.find(x => x.slug === AppModules.definicoes.selectedTemplateSlug);
  if (!t) return;
  const subjEl = document.getElementById('et-subject');
  const bodyEl = document.getElementById('et-body');
  const lang = AppModules.definicoes.emailLang;
  if (subjEl) t[AppModules.definicoes.langField(lang, 'subject')] = subjEl.value;
  if (bodyEl) t[AppModules.definicoes.langField(lang, 'body')]    = bodyEl.innerHTML;
}

// ── SELECT TEMPLATE ──
function selectTemplate(slug) {
  syncEditorToTemplate();
  AppModules.definicoes.selectedTemplateSlug = slug;
  AppModules.definicoes.emailLang = 'pt';
  AppModules.core.SS.set('email:slug', slug);
  AppModules.core.SS.set('email:lang', 'pt');
  AppModules.definicoes.renderTemplateList();
  const t = AppModules.definicoes.emailTemplates.find(x => x.slug === slug);
  if (!t) return;
  const panel = document.getElementById('email-editor-panel');
  const meta  = AppModules.definicoes.TEMPLATE_META[slug] || {};
  const isFixed = AppModules.definicoes.FIXED_TIMING_EVENTS.includes(t.timing_event);

  const timingHtml = isFixed
    ? `<div class="email-timing-fixed">${meta.eventLabel}</div>`
    : `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <input type="number" class="form-control" id="et-offset" value="${t.timing_offset}" min="0" style="width:70px;" autocomplete="off">
        <select class="form-control" id="et-unit" style="width:auto;">
          <option value="hours" ${t.timing_unit==='hours'?'selected':''}>horas</option>
          <option value="days"  ${t.timing_unit==='days' ?'selected':''}>dias</option>
        </select>
        <select class="form-control" id="et-direction" style="width:auto;">
          <option value="after"  ${t.timing_direction==='after' ?'selected':''}>após</option>
          <option value="before" ${t.timing_direction==='before'?'selected':''}>antes de</option>
        </select>
        <span style="color:var(--cinza);font-size:13px;">${t.timing_event === 'checkin' ? 'check-in' : 'check-out'}</span>
      </div>`;

  panel.innerHTML = `
    <div class="emed-header">
      <div class="emed-template-name">${meta.label || t.name}</div>
      <label class="email-active-toggle">
        <input type="checkbox" id="et-active" ${t.active ? 'checked' : ''}
               ${AppActions.attrs("change", "emails-toggle-template-active-6f0ecde", [String((slug) ?? '')])}>
        <span class="gtt-switch"></span>
        <span class="gtt-label">Ativo</span>
      </label>
    </div>

    <div class="emed-top-grid">
      <div class="emed-envelope-fields">
        <div class="emed-env-row">
          <span class="emed-env-label">De</span>
          <span class="emed-env-value">Santa Paciência</span>
        </div>
        <div class="emed-env-row">
          <span class="emed-env-label">Para</span>
          <span class="emed-env-value">{{nome_hospede}}</span>
        </div>
        <div class="emed-env-row">
          <span class="emed-env-label">Bcc</span>
          <input class="form-control emed-env-input" id="et-bcc" placeholder="email@opcional.com (cópia oculta)" value="${escapeAttr(t.bcc || '')}" autocomplete="off">
        </div>
      </div>

      <div class="emed-timing-card">
        <div class="emed-section-label">${AppModules.core.lcIcon('clock-3', 13)} Momento de envio</div>
        ${timingHtml}
        <label class="email-active-toggle" style="margin-top:4px;">
          <input type="checkbox" id="et-window-toggle" ${t.window_start ? 'checked' : ''} data-on-change="emails-toggle-email-window-90fd802">
          <span class="gtt-switch"></span>
          <span class="gtt-label">Restringir a uma janela horária</span>
        </label>
        <div id="et-window-fields" class="email-window-fields" style="display:${t.window_start ? 'flex' : 'none'};">
          <span>Entre as</span>
          <input type="time" class="form-control" id="et-window-start" value="${t.window_start || '09:00'}">
          <span>e as</span>
          <input type="time" class="form-control" id="et-window-end" value="${t.window_end || '20:00'}">
        </div>
      </div>
    </div>

    <div class="emed-body-wrap">
      ${buildLangTabs(slug)}

      <div class="emed-section">
        <div class="emed-section-label">Assunto</div>
        <div class="emed-subject-row">
          <input class="form-control" id="et-subject" placeholder="Assunto do email" value="${escapeAttr(t.subject || '')}" autocomplete="off">
          ${AppModules.definicoes.buildCodesDropdown('et-subject')}
        </div>
      </div>

      <div class="emed-section">
        <div class="emed-section-label">Mensagem</div>
        <div class="emed-body-section">
          ${buildFmtToolbar()}
          <div class="email-body-editor" id="et-body" contenteditable="true" data-on-input="emails-email-body-changed-90a5e82"></div>
          <div class="emed-body-footer">
            ${AppModules.definicoes.buildCodesDropdown('et-body')}
            <div class="emed-body-actions">
              <button class="btn btn-ghost btn-sm" ${AppActions.attrs("click", "emails-preview-email-b9e13c6", [String((slug) ?? '')])}>
                ${AppModules.core.lcIcon('send', 13)} Enviar preview
              </button>
              <button class="btn btn-primary btn-sm" ${AppActions.attrs("click", "emails-save-template-a1efa8c", [String((slug) ?? '')])}>
                ${AppModules.core.lcIcon('save', 14)} Guardar
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="emed-section">
        <div class="emed-section-label">${AppModules.core.lcIcon('eye', 13)} Pré-visualização</div>
        <div class="emed-preview-controls">
          <label>Estado da reserva
            <select class="form-control" id="et-preview-status" data-on-change="emails-update-email-preview-34d4f1c">
              <option value="confirmada">Confirmada</option>
              <option value="pendente">Pendente</option>
              <option value="aguardar_pagamento">A aguardar pagamento</option>
              <option value="cancelada">Cancelada</option>
            </select>
          </label>
          <label>Alojamento
            <select class="form-control" id="et-preview-accommodation" data-on-change="emails-update-email-preview-34d4f1c">
              <option value="">Definições da organização</option>
            </select>
          </label>
        </div>
        <div id="et-preview-notice" class="emed-preview-notice" style="display:none;"></div>
        <iframe id="et-preview-frame" class="email-preview-frame" sandbox="allow-same-origin"
                title="Pré-visualização do email"></iframe>
      </div>
    </div>`;

  if (window.lucide) lucide.createIcons();

  const editor = document.getElementById('et-body');
  if (editor) {
    editor.innerHTML = t[AppModules.definicoes.langField(AppModules.definicoes.emailLang, 'body')] || t.body || '';
    fillPreviewAccommodations();
    AppModules.definicoes.updateEmailPreview();
  }
}

// Contexto de alojamento da pré-visualização: logótipo, Wi-Fi, horários e redes
// sociais variam por alojamento (as suítes herdam do principal). O servidor
// volta a validar que o id pertence à organização autenticada.
async function fillPreviewAccommodations() {
  const sel = document.getElementById('et-preview-accommodation');
  if (!sel) return;
  try {
    const res = await AppModules.core.apiGet('/api/accommodations');
    const list = res?.data || [];
    sel.innerHTML = '<option value="">Definições da organização</option>' +
      list.map(a => `<option value="${escapeAttr(a.id)}">${escapeAttr(a.name || a.id)}</option>`).join('');
  } catch (e) {
    /* sem lista, fica só a opção da organização */
  }
}

// ── TOGGLE ENVIO WINDOW ──
function toggleEmailWindow() {
  const on = document.getElementById('et-window-toggle')?.checked;
  const el = document.getElementById('et-window-fields');
  if (el) el.style.display = on ? 'flex' : 'none';
}

AppActions.register({
  "emails-exec-command-7a0a29c": (el, event, args) => { document.execCommand('bold');AppModules.definicoes.emailBodyChanged() },
  "emails-exec-command-94eb21d": (el, event, args) => { document.execCommand('italic');AppModules.definicoes.emailBodyChanged() },
  "emails-exec-command-e628d3d": (el, event, args) => { document.execCommand('underline');AppModules.definicoes.emailBodyChanged() },
  "emails-exec-command-1c9d4a7": (el, event, args) => { document.execCommand('justifyLeft');AppModules.definicoes.emailBodyChanged() },
  "emails-exec-command-6b2e9f3": (el, event, args) => { document.execCommand('justifyCenter');AppModules.definicoes.emailBodyChanged() },
  "emails-exec-command-d5a83c0": (el, event, args) => { document.execCommand('justifyRight');AppModules.definicoes.emailBodyChanged() },
  "emails-exec-command-4e71b6a": (el, event, args) => { document.execCommand('justifyFull');AppModules.definicoes.emailBodyChanged() },
  "emails-fmt-wrap-93235a9": (el, event, args) => { fmtWrap('<h2 style="font-family:Georgia,serif;font-size:26px;color:#2f2a25;margin:0 0 12px">','</h2>') },
  "emails-fmt-wrap-078e552": (el, event, args) => { fmtWrap('<h3 style="font-family:Georgia,serif;font-size:19px;color:#2f2a25;margin:0 0 10px">','</h3>') },
  "emails-fmt-wrap-fa605ad": (el, event, args) => { fmtWrap('<p style="font-family:Georgia,serif;font-size:16px;line-height:1.7;color:#5d554c;margin:0 0 14px">','</p>') },
  "emails-fmt-insert-4fccc2e": (el, event, args) => { fmtInsert('<ul><li>Item 1</li><li>Item 2</li></ul>') },
  "emails-fmt-insert-0ecf494": (el, event, args) => { fmtInsert('<ol><li>Item 1</li><li>Item 2</li></ol>') },
  "emails-fmt-insert-bf3077d": (el, event, args) => { fmtInsert('<hr style="border:none;border-top:1px solid #e0d5c4;margin:24px 0">') },
  "emails-switch-email-lang-8e428f1": (el, event, args) => { switchEmailLang(args[0],args[1]) },
  "emails-select-template-5b7ac72": (el, event, args) => { selectTemplate(args[0]) },
}, "click");

AppActions.register({
  "emails-toggle-email-window-90fd802": (el, event, args) => { toggleEmailWindow() },
}, "change");

// Botões da barra de formatação são fora do contenteditable: sem isto, o
// browser tirava o foco/seleção do corpo ao clicar num botão, e o comando
// aplicava-se ao sítio errado (o mesmo bug corrigido no menu de códigos).
AppActions.register({
  "emails-keep-body-focus-2f8d6b1": () => false,
}, "mousedown");

})();
