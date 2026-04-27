let emailTemplates = [];
let emailSettings = {};
let selectedTemplateSlug = null;

const TEMPLATE_META = {
  confirmacao:    { icon: '✅', label: 'Agradecimento pela reserva', eventLabel: 'Imediatamente após a reserva' },
  cancelamento:   { icon: '❌', label: 'Cancelamento da reserva',    eventLabel: 'Imediatamente ao cancelar' },
  apos_checkin:   { icon: '🏡', label: 'Após check-in',              eventLabel: 'Após check-in' },
  antes_checkout: { icon: '🌅', label: 'Antes do check-out',         eventLabel: 'Antes do check-out' },
  obrigado:       { icon: '⭐', label: 'Obrigado pela estadia',       eventLabel: 'Após check-out' },
  coordenadas:    { icon: '🗺️', label: 'Envio das coordenadas',       eventLabel: 'Antes do check-in' },
};

// Categorised variable catalogue
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
      { key: 'referencia',   label: 'Referência' },
      { key: 'data_checkin', label: 'Data de check-in' },
      { key: 'hora_checkin', label: 'Hora de check-in' },
      { key: 'data_checkout',label: 'Data de check-out' },
      { key: 'hora_checkout',label: 'Hora de check-out' },
      { key: 'noites',       label: 'Noites' },
      { key: 'num_hospedes', label: 'Nº de hóspedes' },
      { key: 'total',        label: 'Total (€)' },
    ]
  },
];

const FIXED_TIMING_EVENTS = ['booking', 'cancellation'];

// Close codes dropdowns when clicking outside
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

// ── CODES DROPDOWN HTML ──
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
      <button class="fmt-btn" type="button" onclick="fmtWrap('et-body','<strong>','</strong>')" title="Negrito"><b>B</b></button>
      <button class="fmt-btn" type="button" onclick="fmtWrap('et-body','<em>','</em>')" title="Itálico"><i>I</i></button>
      <button class="fmt-btn" type="button" onclick="fmtWrap('et-body','<u>','</u>')" title="Sublinhado"><u>U</u></button>
      <div class="fmt-btn-sep"></div>
      <button class="fmt-btn fmt-btn-wide" type="button" onclick="fmtWrap('et-body','<h2 style=\\"color:#843424;margin:0 0 10px\\">','</h2>')" title="Título">H2</button>
      <button class="fmt-btn fmt-btn-wide" type="button" onclick="fmtWrap('et-body','<h3 style=\\"color:#843424;margin:0 0 8px\\">','</h3>')" title="Subtítulo">H3</button>
      <button class="fmt-btn fmt-btn-wide" type="button" onclick="fmtWrap('et-body','<p style=\\"color:#555;line-height:1.6\\">','</p>')" title="Parágrafo">P</button>
      <div class="fmt-btn-sep"></div>
      <button class="fmt-btn fmt-btn-wide" type="button" onclick="fmtInsertList('et-body','ul')" title="Lista">• Lista</button>
      <button class="fmt-btn fmt-btn-wide" type="button" onclick="fmtInsertList('et-body','ol')" title="Lista numerada">1. Lista</button>
      <div class="fmt-btn-sep"></div>
      <button class="fmt-btn fmt-btn-wide" type="button" onclick="fmtInsert('et-body','<hr style=\\"border:none;border-top:1px solid #eee;margin:20px 0\\">')" title="Separador">—</button>
      <button class="fmt-btn fmt-btn-wide" type="button" onclick="fmtInsert('et-body','<br>')" title="Quebra de linha">↵ BR</button>
      <div class="fmt-btn-sep"></div>
      <button class="fmt-btn fmt-btn-wide" type="button" onclick="toggleEmailBodyPreview()" title="Pré-visualização" id="fmt-preview-btn">👁 Preview</button>
    </div>`;
}

function fmtWrap(fieldId, open, close) {
  const ta = document.getElementById(fieldId);
  if (!ta) return;
  const start = ta.selectionStart ?? ta.value.length;
  const end   = ta.selectionEnd   ?? ta.value.length;
  const sel   = ta.value.slice(start, end) || 'texto aqui';
  const ins   = open + sel + close;
  ta.value    = ta.value.slice(0, start) + ins + ta.value.slice(end);
  ta.selectionStart = start + open.length;
  ta.selectionEnd   = start + open.length + sel.length;
  ta.focus();
}

function fmtInsert(fieldId, html) {
  const ta = document.getElementById(fieldId);
  if (!ta) return;
  const pos = ta.selectionStart ?? ta.value.length;
  ta.value  = ta.value.slice(0, pos) + html + ta.value.slice(pos);
  ta.selectionStart = ta.selectionEnd = pos + html.length;
  ta.focus();
}

function fmtInsertList(fieldId, tag) {
  const ta = document.getElementById(fieldId);
  if (!ta) return;
  const pos = ta.selectionStart ?? ta.value.length;
  const ins = `<${tag}>\n  <li>Item 1</li>\n  <li>Item 2</li>\n</${tag}>`;
  ta.value  = ta.value.slice(0, pos) + ins + ta.value.slice(pos);
  ta.selectionStart = ta.selectionEnd = pos + ins.length;
  ta.focus();
}

function toggleEmailBodyPreview() {
  const ta      = document.getElementById('et-body');
  const preview = document.getElementById('et-body-preview');
  const btn     = document.getElementById('fmt-preview-btn');
  if (!ta || !preview) return;
  const isPreview = preview.style.display !== 'none';
  if (isPreview) {
    preview.style.display = 'none';
    ta.style.display = '';
    if (btn) btn.textContent = '👁 Preview';
  } else {
    preview.innerHTML = ta.value;
    preview.style.display = 'block';
    ta.style.display = 'none';
    if (btn) btn.textContent = '✏️ Editar';
  }
}

// ── SELECT TEMPLATE ──
function selectTemplate(slug) {
  selectedTemplateSlug = slug;
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
      <label class="email-active-toggle">
        <input type="checkbox" id="et-active" ${t.active ? 'checked' : ''}>
        <span class="gtt-switch"></span>
        <span class="gtt-label" style="font-size:13px;">Ativo</span>
      </label>
    </div>

    <div class="email-editor-body">
      <div class="form-group">
        <label class="form-label">Quando é enviado</label>
        ${timingHtml}
      </div>

      <div class="form-group">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
          <label class="form-label" style="margin:0;">Assunto</label>
          ${buildCodesDropdown('et-subject')}
        </div>
        <input class="form-control" id="et-subject" value="${escapeAttr(t.subject)}">
      </div>

      <div class="form-group">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
          <label class="form-label" style="margin:0;">Corpo do email</label>
          ${buildCodesDropdown('et-body')}
        </div>
        ${buildFmtToolbar()}
        <textarea class="form-control email-body-textarea with-toolbar" id="et-body" rows="18">${escapeHtml(t.body)}</textarea>
        <div class="email-preview" id="et-body-preview" style="display:none;border-radius:0 0 8px 8px;"></div>
        <div style="margin-top:6px;font-size:11.5px;color:var(--cinza);">
          💡 Use os botões acima para formatar. Os códigos <code>{{variavel}}</code> são substituídos automaticamente.
        </div>
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
}

// ── CODES DROPDOWN LOGIC ──
function toggleCodesDropdown(fieldId) {
  const id  = 'codes-dropdown-' + fieldId;
  const el  = document.getElementById(id);
  if (!el) return;
  const open = el.style.display !== 'none';
  document.querySelectorAll('.codes-dropdown').forEach(d => d.style.display = 'none');
  if (!open) el.style.display = 'block';
}

function insertVarInField(fieldId, key) {
  const el = document.getElementById(fieldId);
  if (!el) return;
  const v     = `{{${key}}}`;
  const start = el.selectionStart ?? el.value.length;
  const end   = el.selectionEnd   ?? el.value.length;
  el.value = el.value.slice(0, start) + v + el.value.slice(end);
  el.selectionStart = el.selectionEnd = start + v.length;
  el.focus();
  document.querySelectorAll('.codes-dropdown').forEach(d => d.style.display = 'none');
}

function escapeAttr(s) {
  return (s || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function escapeHtml(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── SAVE TEMPLATE ──
async function saveTemplate(slug) {
  const t = emailTemplates.find(x => x.slug === slug);
  if (!t) return;
  const isFixed = FIXED_TIMING_EVENTS.includes(t.timing_event);
  const body = {
    subject: document.getElementById('et-subject')?.value ?? t.subject,
    body:    document.getElementById('et-body')?.value    ?? t.body,
    active:  document.getElementById('et-active')?.checked ?? !!t.active,
  };
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

// ── EMAIL SETTINGS ──
function renderEmailSettings() {
  const el = document.getElementById('email-settings-panel');
  if (!el) return;
  const s = emailSettings;
  el.innerHTML = `
    <div style="padding:0 12px 12px;">
      <div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--cinza);margin-bottom:12px;">Horários</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
        <div class="form-group" style="margin:0;">
          <label class="form-label" style="font-size:11.5px;">Check-in</label>
          <input class="form-control" id="es-checkin-time" type="time" value="${s.checkin_time || '15:00'}" style="font-size:13px;padding:7px 10px;">
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label" style="font-size:11.5px;">Check-out</label>
          <input class="form-control" id="es-checkout-time" type="time" value="${s.checkout_time || '11:00'}" style="font-size:13px;padding:7px 10px;">
        </div>
      </div>
      <div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--cinza);margin-bottom:12px;">Redes Sociais</div>
      <div class="form-group" style="margin-bottom:8px;">
        <label class="form-label" style="font-size:11.5px;">Facebook</label>
        <input class="form-control" id="es-facebook" placeholder="https://facebook.com/..." value="${s.social_facebook || s.facebook || ''}" style="font-size:13px;padding:7px 10px;">
      </div>
      <div class="form-group" style="margin-bottom:8px;">
        <label class="form-label" style="font-size:11.5px;">Instagram</label>
        <input class="form-control" id="es-instagram" placeholder="https://instagram.com/..." value="${s.social_instagram || s.instagram || ''}" style="font-size:13px;padding:7px 10px;">
      </div>
      <div class="form-group" style="margin-bottom:12px;">
        <label class="form-label" style="font-size:11.5px;">Website</label>
        <input class="form-control" id="es-website" placeholder="https://..." value="${s.social_website || s.website || ''}" style="font-size:13px;padding:7px 10px;">
      </div>
      <button class="btn btn-primary btn-sm" style="width:100%;" onclick="saveEmailSettings()">
        Guardar configurações
      </button>
    </div>`;
}

async function saveEmailSettings() {
  const body = {
    checkin_time:     document.getElementById('es-checkin-time')?.value  || '15:00',
    checkout_time:    document.getElementById('es-checkout-time')?.value || '11:00',
    social_facebook:  document.getElementById('es-facebook')?.value  || '',
    social_instagram: document.getElementById('es-instagram')?.value || '',
    social_website:   document.getElementById('es-website')?.value   || '',
  };
  try {
    const res = await apiPut('/api/email-templates/email-settings', body);
    if (res.success) {
      toast('✅ Configurações guardadas!', 'success');
      emailSettings = { ...emailSettings, ...body };
    } else {
      toast('❌ Erro ao guardar configurações.', 'error');
    }
  } catch (e) {
    toast('❌ Erro de ligação ao servidor.', 'error');
  }
}
