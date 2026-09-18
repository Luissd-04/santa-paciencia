let emailTemplates = [];
let emailSettings  = {};
let selectedTemplateSlug = SS.get('email:slug', null);
let emailLang = SS.get('email:lang', 'pt');

const LANGS = [
  { code: 'pt', label: 'Português',  cc: 'pt' },
  { code: 'en', label: 'Inglês',     cc: 'gb' },
  { code: 'fr', label: 'Francês',    cc: 'fr' },
  { code: 'es', label: 'Espanhol',   cc: 'es' },
  { code: 'de', label: 'Alemão',     cc: 'de' },
  { code: 'it', label: 'Italiano',   cc: 'it' },
  { code: 'nl', label: 'Neerlandês', cc: 'nl' },
];

const TEMPLATE_META = {
  confirmacao:    { icon: '✅', label: 'Agradecimento pela reserva',   eventLabel: 'Imediatamente após a reserva' },
  pre_checkin:    { icon: '📝', label: 'Preenchimento do formulário', eventLabel: 'Imediatamente após aprovação' },
  coordenadas:    { icon: '🗺️', label: 'Envio das coordenadas',        eventLabel: 'Antes do check-in' },
  codigo_porta:   { icon: '🔑', label: 'Código de abertura de portas', eventLabel: 'Antes do check-in' },
  apos_checkin:   { icon: '🏡', label: 'Após check-in',                eventLabel: 'Após check-in' },
  antes_checkout: { icon: '🌅', label: 'Antes do check-out',           eventLabel: 'Antes do check-out' },
  obrigado:       { icon: '⭐', label: 'Obrigado pela estadia',        eventLabel: 'Após check-out' },
  cancelamento:   { icon: '❌', label: 'Cancelamento da reserva',      eventLabel: 'Imediatamente ao cancelar' },
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
      { key: 'codigo_porta',  label: 'Código de abertura de portas' },
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
  {
    label: 'Ligações',
    vars: [
      { key: 'link_pre_checkin', label: 'Botão — completar pré check-in' },
    ]
  },
];

const FIXED_TIMING_EVENTS = ['booking', 'cancellation', 'approval'];

function langField(lang, field) {
  return lang === 'pt' ? field : `${field}_${lang}`;
}

document.addEventListener('click', e => {
  if (!e.target.closest('.codes-dropdown-wrap') && !e.target.closest('.codes-dropdown')) {
    closeCodesDropdown();
  }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCodesDropdown(); });

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
  el.innerHTML = emailTemplates.map((t, i) => {
    const meta = TEMPLATE_META[t.slug] || {};
    const isFixed = FIXED_TIMING_EVENTS.includes(t.timing_event);
    const timingLabel = isFixed
      ? meta.eventLabel
      : `${t.timing_offset} ${t.timing_unit === 'days' ? 'dia(s)' : 'hora(s)'} ${t.timing_direction === 'before' ? 'antes' : 'após'} ${t.timing_event === 'checkin' ? 'check-in' : 'check-out'}`;
    return `
      <div class="template-item ${selectedTemplateSlug === t.slug ? 'active' : ''}" onclick="selectTemplate('${t.slug}')">
        <div class="template-item-top">
          <span class="template-item-num">${String(i + 1).padStart(2, '0')}</span>
          <span class="template-item-name">${meta.label || t.name}</span>
          <span class="template-item-dot ${t.active ? 'on' : 'off'}"></span>
        </div>
        <div class="template-item-timing">${timingLabel}</div>
      </div>`;
  }).join('');
}

// ── CODES DROPDOWN ──
// O painel vive em document.body (não dentro do editor): os contentores
// .emails-editor e .emed-body-section têm overflow hidden/auto e recortavam
// a lista, pelo que o botão parecia não fazer nada.
function buildCodesDropdown(fieldId) {
  return `
    <div class="codes-dropdown-wrap">
      <button class="codes-btn" type="button" onclick="toggleCodesDropdown('${fieldId}', this);event.stopPropagation();">
        ${lcIcon('settings-2', 12)} Códigos
      </button>
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

  // Sem SVG/imagens aqui — a Gmail app remove <svg> do corpo do email (ficava
  // um círculo vazio), por isso o template real (emailService.js) passou a
  // usar emoji; o preview segue o mesmo desenho para não divergir do que o
  // hóspede recebe.
  const socialBtns = [
    fb  ? `<a href="${fb}"  style="display:inline-flex;align-items:center;gap:6px;margin:0 4px;padding:8px 16px;background:#1877f2;color:#fff;border-radius:8px;text-decoration:none;font-size:12px;font-weight:600;">📘 Facebook</a>` : '',
    ig  ? `<a href="${ig}"  style="display:inline-flex;align-items:center;gap:6px;margin:0 4px;padding:8px 16px;background:#e1306c;color:#fff;border-radius:8px;text-decoration:none;font-size:12px;font-weight:600;">📷 Instagram</a>` : '',
    web ? `<a href="${web}" style="display:inline-flex;align-items:center;gap:6px;margin:0 4px;padding:8px 16px;background:#843424;color:#fff;border-radius:8px;text-decoration:none;font-size:12px;font-weight:600;">🌐 Website</a>` : '',
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
    ${s.logo_url ? `<img src="${s.logo_url}" alt="Logótipo" style="max-width:150px;max-height:50px;object-fit:contain;margin-bottom:6px;">` : `<p style="color:rgba(255,255,255,.95);margin:0;font-family:Georgia,serif;font-size:20px;font-weight:bold;">Santa Paciência</p>`}
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
        ${flagHtml(l.cc, { size: 16 })} ${l.label}
      </button>`).join('')}
  </div>`;
}

function switchEmailLang(lang, slug) {
  _saveEditorToTemplate();
  emailLang = lang;
  SS.set('email:lang', lang);
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
  SS.set('email:slug', slug);
  SS.set('email:lang', 'pt');
  renderTemplateList();
  const t = emailTemplates.find(x => x.slug === slug);
  if (!t) return;
  const panel = document.getElementById('email-editor-panel');
  const meta  = TEMPLATE_META[slug] || {};
  const isFixed = FIXED_TIMING_EVENTS.includes(t.timing_event);

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
               onchange="toggleTemplateActive('${slug}')">
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
        <div class="emed-section-label">${lcIcon('clock-3', 13)} Momento de envio</div>
        ${timingHtml}
        <label class="email-active-toggle" style="margin-top:4px;">
          <input type="checkbox" id="et-window-toggle" ${t.window_start ? 'checked' : ''} onchange="toggleEmailWindow()">
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
          ${buildCodesDropdown('et-subject')}
        </div>
      </div>

      <div class="emed-section">
        <div class="emed-section-label">Mensagem</div>
        <div class="emed-body-section">
          ${buildFmtToolbar()}
          <div class="email-body-editor" id="et-body" contenteditable="true" oninput="emailBodyChanged()"></div>
          <div class="emed-body-footer">
            ${buildCodesDropdown('et-body')}
            <div class="emed-body-actions">
              <button class="btn btn-ghost btn-sm" onclick="previewEmail('${slug}')">
                ${lcIcon('send', 13)} Enviar preview
              </button>
              <button class="btn btn-primary btn-sm" onclick="saveTemplate('${slug}')">
                ${lcIcon('save', 14)} Guardar
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="emed-section">
        <div class="emed-section-label">${lcIcon('eye', 13)} Pré-visualização</div>
        <iframe id="et-preview-frame" class="email-preview-frame" sandbox="allow-same-origin"></iframe>
      </div>
    </div>`;

  if (window.lucide) lucide.createIcons();

  const editor = document.getElementById('et-body');
  if (editor) {
    editor.innerHTML = t.body || '';
    updateEmailPreview();
  }
}

// ── TOGGLE ENVIO WINDOW ──
function toggleEmailWindow() {
  const on = document.getElementById('et-window-toggle')?.checked;
  const el = document.getElementById('et-window-fields');
  if (el) el.style.display = on ? 'flex' : 'none';
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
let _codesField = null;

function _codesEl() {
  let el = document.getElementById('codes-dropdown-global');
  if (!el) {
    el = document.createElement('div');
    el.id = 'codes-dropdown-global';
    el.className = 'codes-dropdown';
    el.style.display = 'none';
    el.addEventListener('click', e => e.stopPropagation());
    document.body.appendChild(el);
  }
  return el;
}

function closeCodesDropdown() {
  const el = document.getElementById('codes-dropdown-global');
  if (el) el.style.display = 'none';
  _codesField = null;
}

function _positionCodesDropdown(btn) {
  if (!btn) return;
  const el = _codesEl();
  const r  = btn.getBoundingClientRect();
  const w  = el.offsetWidth || 220;
  const h  = el.offsetHeight;
  let left = r.right - w;
  left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
  let top = r.bottom + 5;
  if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 5);
  el.style.left = left + 'px';
  el.style.top  = top + 'px';
}

function toggleCodesDropdown(fieldId, btn) {
  const el = _codesEl();
  if (_codesField === fieldId && el.style.display !== 'none') { closeCodesDropdown(); return; }
  el.innerHTML = TEMPLATE_VAR_CATS.map((cat, i) => `
    ${i > 0 ? '<div class="codes-cat-divider"></div>' : ''}
    <div class="codes-cat-title">${cat.label}</div>
    ${cat.vars.map(v => `
      <div class="codes-item" onclick="insertVarInField('${fieldId}','${v.key}');event.stopPropagation();">${v.label}</div>
    `).join('')}
  `).join('');
  _codesField = fieldId;
  el.style.display = 'block';
  _positionCodesDropdown(btn || document.querySelector(`.codes-btn[onclick*="${fieldId}"]`));
}

// Reposicionar/fechar quando a página se move por baixo do painel.
window.addEventListener('resize', closeCodesDropdown);
window.addEventListener('scroll', e => {
  // não fechar quando o scroll é dentro da própria lista
  if (e.target?.id === 'codes-dropdown-global') return;
  closeCodesDropdown();
}, true);

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
  closeCodesDropdown();
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
  const windowOn = document.getElementById('et-window-toggle')?.checked;
  const body = {
    subject: t.subject || '',
    body:    t.body    || '',
    active:  document.getElementById('et-active')?.checked ?? !!t.active,
    bcc:     document.getElementById('et-bcc')?.value.trim() || '',
    window_start: windowOn ? (document.getElementById('et-window-start')?.value || '09:00') : '',
    window_end:   windowOn ? (document.getElementById('et-window-end')?.value   || '20:00') : '',
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

// ── EMAIL SETTINGS (info: logótipo/social/checkin configuram-se no alojamento) ──
function renderEmailSettings() {
  const el = document.getElementById('email-settings-panel');
  if (!el) return;
  el.innerHTML = `
    <div style="padding:0 12px 12px;">
      <div style="font-size:11px;color:var(--cinza);line-height:1.5;background:var(--cinza-claro);border-radius:8px;padding:10px 12px;margin-bottom:12px;">
        💡 O logótipo, os horários de check-in/out e as redes sociais são configurados em cada alojamento individualmente.
      </div>
      <button class="btn btn-ghost btn-sm" style="width:100%;" onclick="showView('alojamentos')">
        ${lcIcon('building-2', 13)} Ir para configurações de alojamento
      </button>
    </div>`;
  if (window.lucide) lucide.createIcons();
}
