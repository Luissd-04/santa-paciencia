let emailTemplates = [];
let emailSettings  = {};
let selectedTemplateSlug = null;
let emailLang = 'pt';

const LANGS = [
  { code: 'pt', label: 'Português',  flag: '🇵🇹' },
  { code: 'en', label: 'Inglês',     flag: '🇬🇧' },
  { code: 'fr', label: 'Francês',    flag: '🇫🇷' },
  { code: 'es', label: 'Espanhol',   flag: '🇪🇸' },
  { code: 'de', label: 'Alemão',     flag: '🇩🇪' },
  { code: 'it', label: 'Italiano',   flag: '🇮🇹' },
  { code: 'nl', label: 'Neerlandês', flag: '🇳🇱' },
];

const TEMPLATE_META = {
  confirmacao:    { icon: '✅', label: 'Agradecimento pela reserva', eventLabel: 'Imediatamente após a reserva' },
  cancelamento:   { icon: '❌', label: 'Cancelamento da reserva',    eventLabel: 'Imediatamente ao cancelar' },
  apos_checkin:   { icon: '🏡', label: 'Após check-in',              eventLabel: 'Após check-in' },
  antes_checkout: { icon: '🌅', label: 'Antes do check-out',         eventLabel: 'Antes do check-out' },
  obrigado:       { icon: '⭐', label: 'Obrigado pela estadia',       eventLabel: 'Após check-out' },
  coordenadas:    { icon: '🗺️', label: 'Envio das coordenadas',       eventLabel: 'Antes do check-in' },
};

const TEMPLATE_VAR_CATS = [
  {
    label: 'Hóspede',
    vars: [
      { key: 'primeiro_nome', label: 'Primeiro nome' },
      { key: 'nome_hospede',  label: 'Nome completo' },
    ]
  },
  {
    label: 'Alojamento',
    vars: [
      { key: 'alojamento',    label: 'Nome do alojamento' },
      { key: 'wifi_nome',     label: 'Wi-Fi — nome da rede' },
      { key: 'wifi_password', label: 'Wi-Fi — senha' },
    ]
  },
  {
    label: 'Reserva',
    vars: [
      { key: 'referencia',    label: 'Referência' },
      { key: 'data_checkin',  label: 'Data de check-in' },
      { key: 'hora_checkin',  label: 'Hora de check-in' },
      { key: 'data_checkout', label: 'Data de check-out' },
      { key: 'hora_checkout', label: 'Hora de check-out' },
      { key: 'noites',        label: 'Noites' },
      { key: 'num_hospedes',  label: 'Nº de hóspedes' },
      { key: 'total',         label: 'Total (€)' },
    ]
  },
];

const FIXED_TIMING_EVENTS = ['booking', 'cancellation'];

function langField(lang, field) {
  return lang === 'pt' ? field : `${field}_${lang}`;
}

document.addEventListener('click', e => {
  if (!e.target.closest('.codes-dropdown-wrap')) {
    document.querySelectorAll('.codes-dropdown').forEach(d => d.style.display = 'none');
  }
});

// ── LOAD ──
async function loadEmailTemplates() {
  try {
    const data = await apiGet('/api/email-templates');
    emailTemplates = data.data || [];
    emailSettings  = data.settings || {};
    renderTemplateList();
    renderEmailSettings();
    if (emailTemplates.length > 0 && !selectedTemplateSlug) {
      selectTemplate(emailTemplates[0].slug);
    } else if (selectedTemplateSlug) {
      selectTemplate(selectedTemplateSlug);
    }
  } catch (e) {
    toast('❌ Erro ao carregar templates de email.', 'error');
  }
}

// ── TEMPLATE LIST ──
function renderTemplateList() {
  const el = document.getElementById('email-template-list');
  if (!el) return;
  el.innerHTML = emailTemplates.map(t => {
    const meta = TEMPLATE_META[t.slug] || {};
    const isFixed = FIXED_TIMING_EVENTS.includes(t.timing_event);
    const timingLabel = isFixed
      ? meta.eventLabel
      : `${t.timing_offset} ${t.timing_unit === 'days' ? 'dia(s)' : 'hora(s)'} ${t.timing_direction === 'before' ? 'antes' : 'após'} ${t.timing_event === 'checkin' ? 'check-in' : 'check-out'}`;
    return `
      <div class="template-item ${selectedTemplateSlug === t.slug ? 'active' : ''}" onclick="selectTemplate('${t.slug}')">
        <div class="template-item-top">
          <span class="template-item-icon">${meta.icon || '📧'}</span>
          <span class="template-item-name">${meta.label || t.name}</span>
          <span class="template-item-status ${t.active ? 'on' : 'off'}">${t.active ? 'Ativo' : 'Inativo'}</span>
        </div>
        <div class="template-item-timing">${timingLabel}</div>
      </div>`;
  }).join('');
}

// ── CODES DROPDOWN ──
function buildCodesDropdown(fieldId) {
  const cats = TEMPLATE_VAR_CATS.map((cat, i) => `
    ${i > 0 ? '<div class="codes-cat-divider"></div>' : ''}
    <div class="codes-cat-title">${cat.label}</div>
    ${cat.vars.map(v => `
      <div class="codes-item" onclick="insertVarInField('${fieldId}','${v.key}');event.stopPropagation();">${v.label}</div>
    `).join('')}
  `).join('');
  return `
    <div class="codes-dropdown-wrap">
      <button class="codes-btn" type="button" onclick="toggleCodesDropdown('${fieldId}');event.stopPropagation();">
        ⚙ Códigos <span style="font-size:9px;opacity:.7;">▾</span>
      </button>
      <div class="codes-dropdown" id="codes-dropdown-${fieldId}" style="display:none;">
        ${cats}
      </div>
    </div>`;
}

// ── FORMATTING TOOLBAR ──
function buildFmtToolbar() {
  return `
    <div class="email-fmt-toolbar">
      <button class="fmt-btn" type="button" onclick="document.execCommand('bold');emailBodyChanged()" title="Negrito"><b>B</b></button>
      <button class="fmt-btn" type="button" onclick="document.execCommand('italic');emailBodyChanged()" title="Itálico"><i>I</i></button>
      <button class="fmt-btn" type="button" onclick="document.execCommand('underline');emailBodyChanged()" title="Sublinhado"><u>U</u></button>
      <div class="fmt-btn-sep"></div>
      <button class="fmt-btn fmt-btn-wide" type="button" onclick="fmtWrap('<h2 style=\\"color:#843424;margin:0 0 10px\\">','</h2>')" title="Título">H2</button>
      <button class="fmt-btn fmt-btn-wide" type="button" onclick="fmtWrap('<h3 style=\\"color:#843424;margin:0 0 8px\\">','</h3>')" title="Subtítulo">H3</button>
      <button class="fmt-btn fmt-btn-wide" type="button" onclick="fmtWrap('<p style=\\"color:#555;line-height:1.6\\">','</p>')" title="Parágrafo">P</button>
      <div class="fmt-btn-sep"></div>
      <button class="fmt-btn fmt-btn-wide" type="button" onclick="fmtInsert('<ul><li>Item 1</li><li>Item 2</li></ul>')" title="Lista">• Lista</button>
      <button class="fmt-btn fmt-btn-wide" type="button" onclick="fmtInsert('<ol><li>Item 1</li><li>Item 2</li></ol>')" title="Lista numerada">1. Lista</button>
      <div class="fmt-btn-sep"></div>
      <button class="fmt-btn fmt-btn-wide" type="button" onclick="fmtInsert('<hr style=\\"border:none;border-top:1px solid #eee;margin:20px 0\\">')" title="Separador">—</button>
    </div>`;
}

function fmtWrap(open, close) {
  const editor = document.getElementById('et-body');
  if (!editor) return;
  editor.focus();
  const sel = window.getSelection();
  const selText = (sel?.rangeCount > 0 ? sel.getRangeAt(0).toString() : '') || 'texto aqui';
  document.execCommand('insertHTML', false, open + selText + close);
  emailBodyChanged();
}

function fmtInsert(html) {
  const editor = document.getElementById('et-body');
  if (!editor) return;
  editor.focus();
  document.execCommand('insertHTML', false, html);
  emailBodyChanged();
}

let _emailPreviewTimer = null;
function emailBodyChanged() {
  clearTimeout(_emailPreviewTimer);
  _emailPreviewTimer = setTimeout(updateEmailPreview, 300);
}

function updateEmailPreview() {
  const editor = document.getElementById('et-body');
  const frame  = document.getElementById('et-preview-frame');
  if (!editor || !frame) return;
  frame.srcdoc = buildEmailPreviewHtml(editor.innerHTML);
}

function buildEmailPreviewHtml(bodyHtml) {
  const s = emailSettings;
  const fb  = s.social_facebook  || s.facebook  || '';
  const ig  = s.social_instagram || s.instagram || '';
  const web = s.social_website   || s.website   || '';

  const socialBtns = [
    fb  ? `<a href="${fb}"  style="display:inline-flex;align-items:center;gap:6px;margin:0 4px;padding:8px 16px;background:#1877f2;color:#fff;border-radius:8px;text-decoration:none;font-size:12px;font-weight:600;">
             <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg> Facebook</a>` : '',
    ig  ? `<a href="${ig}"  style="display:inline-flex;align-items:center;gap:6px;margin:0 4px;padding:8px 16px;background:#e1306c;color:#fff;border-radius:8px;text-decoration:none;font-size:12px;font-weight:600;">
             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="#fff" stroke="none"/></svg> Instagram</a>` : '',
    web ? `<a href="${web}" style="display:inline-flex;align-items:center;gap:6px;margin:0 4px;padding:8px 16px;background:#843424;color:#fff;border-radius:8px;text-decoration:none;font-size:12px;font-weight:600;">
             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> Website</a>` : '',
  ].filter(Boolean).join('');

  return `<!DOCTYPE html>
<html lang="pt"><head><meta charset="UTF-8">
<style>*{box-sizing:border-box;}body{margin:0;padding:12px;background:#f4f4f4;font-family:Georgia,serif;}
h2{color:#843424;margin:0 0 10px;}h3{color:#843424;margin:0 0 8px;}
p{color:#555;line-height:1.6;margin:0 0 10px;}ul,ol{color:#555;line-height:1.7;}
table{width:100%;border-collapse:collapse;}td{padding:6px 8px;}
strong{font-weight:700;}a{color:#843424;}hr{border:none;border-top:1px solid #eee;margin:16px 0;}
</style>
</head><body>
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1);">
  <tr><td style="background:#843424;padding:24px 32px;text-align:center;">
    <p style="color:rgba(255,255,255,.95);margin:0;font-family:Georgia,serif;font-size:20px;font-weight:bold;">Santa Paciência</p>
    <p style="color:rgba(255,255,255,.55);margin:4px 0 0;font-size:11px;letter-spacing:1.5px;font-family:sans-serif;">ALOJAMENTO LOCAL</p>
  </td></tr>
  <tr><td style="padding:28px 32px;font-family:Georgia,serif;">${bodyHtml}</td></tr>
  ${socialBtns ? `<tr><td style="background:#843424;padding:18px 32px;text-align:center;">
    <p style="color:rgba(255,255,255,.6);font-size:11px;margin:0 0 12px;letter-spacing:.5px;text-transform:uppercase;font-family:sans-serif;">Siga-nos</p>
    <div>${socialBtns}</div>
  </td></tr>` : ''}
  <tr><td style="background:#f8f8f8;padding:14px;border-top:1px solid #eee;text-align:center;">
    <p style="color:#999;font-size:11px;margin:0;font-family:sans-serif;">Santa Paciência · Alojamento Local</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

// ── LANGUAGE TABS ──
function buildLangTabs(slug) {
  return `<div class="email-lang-tabs">
    ${LANGS.map(l => `
      <button class="lang-tab${emailLang === l.code ? ' active' : ''}"
              data-lang="${l.code}"
              onclick="switchEmailLang('${l.code}','${slug}')">
        <span>${l.flag}</span> ${l.label}
      </button>`).join('')}
  </div>`;
}

function switchEmailLang(lang, slug) {
  _saveEditorToTemplate();
  emailLang = lang;
  document.querySelectorAll('.lang-tab').forEach(b => b.classList.toggle('active', b.dataset.lang === lang));
  const t = emailTemplates.find(x => x.slug === slug);
  const subj = document.getElementById('et-subject');
  const body = document.getElementById('et-body');
  if (subj) subj.value = t?.[langField(lang, 'subject')] || '';
  if (body) { body.innerHTML = t?.[langField(lang, 'body')] || ''; updateEmailPreview(); }
}

function _saveEditorToTemplate() {
  const t = emailTemplates.find(x => x.slug === selectedTemplateSlug);
  if (!t) return;
  const subjEl = document.getElementById('et-subject');
  const bodyEl = document.getElementById('et-body');
  if (subjEl) t[langField(emailLang, 'subject')] = subjEl.value;
  if (bodyEl) t[langField(emailLang, 'body')]    = bodyEl.innerHTML;
}

// ── SELECT TEMPLATE ──
function selectTemplate(slug) {
  _saveEditorToTemplate();
  selectedTemplateSlug = slug;
  emailLang = 'pt';
  renderTemplateList();
  const t = emailTemplates.find(x => x.slug === slug);
  if (!t) return;
  const panel = document.getElementById('email-editor-panel');
  const meta  = TEMPLATE_META[slug] || {};
  const isFixed = FIXED_TIMING_EVENTS.includes(t.timing_event);

  const timingHtml = isFixed
    ? `<div class="email-timing-fixed">${meta.eventLabel}</div>`
    : `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <input type="number" class="form-control" id="et-offset" value="${t.timing_offset}" min="0" style="width:70px;">
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
    <div class="email-editor-header">
      <span style="font-size:22px;">${meta.icon || '📧'}</span>
      <div>
        <div style="font-family:'Playfair Display',serif;font-size:18px;font-weight:600;color:var(--azul);">${meta.label || t.name}</div>
      </div>
      <label class="email-active-toggle" style="margin-left:auto;">
        <input type="checkbox" id="et-active" ${t.active ? 'checked' : ''}
               onchange="toggleTemplateActive('${slug}')">
        <span class="gtt-switch"></span>
        <span class="gtt-label" style="font-size:13px;">Ativo</span>
      </label>
    </div>

    <div class="email-editor-body">
      <div class="form-group">
        <label class="form-label">Quando é enviado</label>
        ${timingHtml}
      </div>

      ${buildLangTabs(slug)}

      <div class="form-group">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
          <label class="form-label" style="margin:0;">Assunto</label>
          ${buildCodesDropdown('et-subject')}
        </div>
        <input class="form-control" id="et-subject" value="${escapeAttr(t.subject)}">
      </div>

      <div class="form-group">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
          <label class="form-label" style="margin:0;">Mensagem</label>
          ${buildCodesDropdown('et-body')}
        </div>
        ${buildFmtToolbar()}
        <div class="email-body-editor" id="et-body" contenteditable="true" oninput="emailBodyChanged()"></div>
        <div style="margin-top:5px;font-size:11.5px;color:var(--cinza);">
          💡 Os códigos <code>{{variavel}}</code> são substituídos automaticamente no envio.
        </div>
      </div>

      <div class="form-group">
        <div style="font-size:11.5px;font-weight:600;color:var(--cinza);text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px;">Pré-visualização</div>
        <iframe id="et-preview-frame" class="email-preview-frame" sandbox="allow-same-origin"></iframe>
      </div>

      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:4px;">
        <button class="btn btn-ghost btn-sm" onclick="previewEmail('${slug}')">
          ${lcIcon('send', 13)} Enviar preview para mim
        </button>
        <button class="btn btn-primary" onclick="saveTemplate('${slug}')">
          ${lcIcon('save', 14)} Guardar
        </button>
      </div>
    </div>`;

  if (window.lucide) lucide.createIcons();

  const editor = document.getElementById('et-body');
  if (editor) {
    editor.innerHTML = t.body || '';
    updateEmailPreview();
  }
}

// ── TOGGLE ACTIVE (auto-save) ──
async function toggleTemplateActive(slug) {
  const active = document.getElementById('et-active')?.checked ?? true;
  try {
    await apiPut(`/api/email-templates/${slug}`, { active });
    const t = emailTemplates.find(x => x.slug === slug);
    if (t) t.active = active;
    renderTemplateList();
    toast(active ? '✅ Email ativado' : '⭕ Email desativado', 'info');
  } catch (e) {
    toast('❌ Erro ao guardar.', 'error');
  }
}

// ── CODES DROPDOWN LOGIC ──
function toggleCodesDropdown(fieldId) {
  const el = document.getElementById('codes-dropdown-' + fieldId);
  if (!el) return;
  const open = el.style.display !== 'none';
  document.querySelectorAll('.codes-dropdown').forEach(d => d.style.display = 'none');
  if (!open) el.style.display = 'block';
}

function insertVarInField(fieldId, key) {
  const el = document.getElementById(fieldId);
  if (!el) return;
  const v = `{{${key}}}`;
  if (el.isContentEditable) {
    el.focus();
    document.execCommand('insertText', false, v);
    emailBodyChanged();
  } else {
    const start = el.selectionStart ?? el.value.length;
    const end   = el.selectionEnd   ?? el.value.length;
    el.value = el.value.slice(0, start) + v + el.value.slice(end);
    el.selectionStart = el.selectionEnd = start + v.length;
    el.focus();
  }
  document.querySelectorAll('.codes-dropdown').forEach(d => d.style.display = 'none');
}

function escapeAttr(s) {
  return (s || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── SAVE TEMPLATE ──
async function saveTemplate(slug) {
  _saveEditorToTemplate();
  const t = emailTemplates.find(x => x.slug === slug);
  if (!t) return;
  const isFixed = FIXED_TIMING_EVENTS.includes(t.timing_event);
  const body = {
    subject: t.subject || '',
    body:    t.body    || '',
    active:  document.getElementById('et-active')?.checked ?? !!t.active,
  };
  // All language variants
  for (const l of LANGS.filter(x => x.code !== 'pt')) {
    body[langField(l.code, 'subject')] = t[langField(l.code, 'subject')] || '';
    body[langField(l.code, 'body')]    = t[langField(l.code, 'body')]    || '';
  }
  if (!isFixed) {
    body.timing_offset    = parseInt(document.getElementById('et-offset')?.value || 0);
    body.timing_unit      = document.getElementById('et-unit')?.value      || t.timing_unit;
    body.timing_direction = document.getElementById('et-direction')?.value || t.timing_direction;
  }
  try {
    const res = await apiPut(`/api/email-templates/${slug}`, body);
    if (res.success) {
      toast('✅ Template guardado!', 'success');
      await loadEmailTemplates();
    } else {
      toast('❌ ' + (res.error || 'Erro ao guardar.'), 'error');
    }
  } catch (e) {
    toast('❌ Erro de ligação ao servidor.', 'error');
  }
}

// ── PREVIEW ──
async function previewEmail(slug) {
  try {
    const res = await fetch(`${API_BASE}/api/email-templates/${slug}/preview`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({})
    });
    const data = await res.json();
    if (data.success) toast(`📧 ${data.message}`, 'success');
    else toast('❌ ' + (data.error || 'Erro ao enviar preview.'), 'error');
  } catch (e) {
    toast('❌ Erro de ligação ao servidor.', 'error');
  }
}

// ── EMAIL SETTINGS (only sender info now — social/checkin moved to accommodation) ──
function renderEmailSettings() {
  const el = document.getElementById('email-settings-panel');
  if (!el) return;
  el.innerHTML = `
    <div style="padding:0 12px 12px;">
      <div style="font-size:11px;color:var(--cinza);line-height:1.5;background:var(--cinza-claro);border-radius:8px;padding:10px 12px;margin-bottom:12px;">
        💡 Os horários de check-in/out e as redes sociais são configurados em cada alojamento individualmente.
      </div>
      <button class="btn btn-ghost btn-sm" style="width:100%;" onclick="showView('alojamentos')">
        ${lcIcon('building-2', 13)} Ir para configurações de alojamento
      </button>
    </div>`;
  if (window.lucide) lucide.createIcons();
}
