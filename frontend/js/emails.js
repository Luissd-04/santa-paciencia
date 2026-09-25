// Estado privado; interface partilhada em AppModules.definicoes.
// Divisão: emails.js (estado, lista e definições) · features/emails/codes.js
// (menu de códigos) · features/emails/editor.js (edição do modelo
// selecionado) · features/emails/preview.js (pré-visualização e envio de
// teste, com a mesma composição do servidor).
(() => {
AppModules.define('definicoes', {
  LANGS: { get: () => LANGS },
  TEMPLATE_META: { get: () => TEMPLATE_META },
  FIXED_TIMING_EVENTS: { get: () => FIXED_TIMING_EVENTS },
  langField: { get: () => langField },
  emailTemplates: { get: () => emailTemplates, set: value => { emailTemplates = value; } },
  emailSettings: { get: () => emailSettings, set: value => { emailSettings = value; } },
  selectedTemplateSlug: { get: () => selectedTemplateSlug, set: value => { selectedTemplateSlug = value; } },
  emailLang: { get: () => emailLang, set: value => { emailLang = value; } },
  loadEmailTemplates: { get: () => loadEmailTemplates },
  renderTemplateList: { get: () => renderTemplateList },
  toggleTemplateActive: { get: () => toggleTemplateActive },
  saveTemplate: { get: () => saveTemplate },
  renderEmailSettings: { get: () => renderEmailSettings },
});

let emailTemplates = [];
let emailSettings  = {};
let selectedTemplateSlug = AppModules.core.SS.get('email:slug', null);
let emailLang = AppModules.core.SS.get('email:lang', 'pt');

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
  coordenadas:    { icon: '🗺️', label: 'Informações e código de acesso', eventLabel: 'Antes do check-in' },
  apos_checkin:   { icon: '🏡', label: 'Após check-in',                eventLabel: 'Após check-in' },
  antes_checkout: { icon: '🌅', label: 'Antes do check-out',           eventLabel: 'Antes do check-out' },
  obrigado:       { icon: '⭐', label: 'Obrigado pela estadia',        eventLabel: 'Após check-out' },
  cancelamento:   { icon: '❌', label: 'Cancelamento da reserva',      eventLabel: 'Imediatamente ao cancelar' },
};

const FIXED_TIMING_EVENTS = ['booking', 'cancellation', 'approval'];

function langField(lang, field) {
  return lang === 'pt' ? field : `${field}_${lang}`;
}

// ── LOAD ──
async function loadEmailTemplates() {
  try {
    const data = await AppModules.core.apiGet('/api/email-templates');
    emailTemplates = data.data || [];
    emailSettings  = data.settings || {};
    renderTemplateList();
    renderEmailSettings();
    if (emailTemplates.length > 0 && !selectedTemplateSlug) {
      AppModules.definicoes.selectTemplate(emailTemplates[0].slug);
    } else if (selectedTemplateSlug) {
      AppModules.definicoes.selectTemplate(selectedTemplateSlug);
    }
  } catch (e) {
    AppModules.core.toast('❌ Erro ao carregar templates de email.', 'error');
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
      <div class="template-item ${selectedTemplateSlug === t.slug ? 'active' : ''}" ${AppActions.attrs("click", "emails-select-template-5b7ac72", [String((t.slug) ?? '')])}>
        <div class="template-item-top">
          <span class="template-item-num">${String(i + 1).padStart(2, '0')}</span>
          <span class="template-item-name">${meta.label || t.name}</span>
          <span class="template-item-dot ${t.active ? 'on' : 'off'}"></span>
        </div>
        <div class="template-item-timing">${timingLabel}</div>
      </div>`;
  }).join('');
}

// ── TOGGLE ACTIVE (auto-save) ──
async function toggleTemplateActive(slug) {
  const active = document.getElementById('et-active')?.checked ?? true;
  try {
    await AppModules.core.apiPut(`/api/email-templates/${slug}`, { active });
    const t = emailTemplates.find(x => x.slug === slug);
    if (t) t.active = active;
    renderTemplateList();
    AppModules.core.toast(active ? '✅ Email ativado' : '⭕ Email desativado', 'info');
  } catch (e) {
    AppModules.core.toast('❌ Erro ao guardar.', 'error');
  }
}

// ── SAVE TEMPLATE ──
async function saveTemplate(slug) {
  AppModules.definicoes.syncEditorToTemplate();
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
    const res = await AppModules.core.apiPut(`/api/email-templates/${slug}`, body);
    if (res.success) {
      AppModules.core.toast('✅ Template guardado!', 'success');
      await loadEmailTemplates();
    } else {
      AppModules.core.toast('❌ ' + (res.error || 'Erro ao guardar.'), 'error');
    }
  } catch (e) {
    AppModules.core.toast('❌ Erro de ligação ao servidor.', 'error');
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
      <button class="btn btn-ghost btn-sm" style="width:100%;" data-on-click="emails-show-view-4899013">
        ${AppModules.core.lcIcon('building-2', 13)} Ir para configurações de alojamento
      </button>
    </div>`;
  if (window.lucide) lucide.createIcons();
}

AppActions.register({
  "emails-show-view-4899013": (el, event, args) => { AppModules.core.showView('alojamentos') },
  "emails-save-template-a1efa8c": (el, event, args) => { saveTemplate(args[0]) },
}, "click");

AppActions.register({
  "emails-toggle-template-active-6f0ecde": (el, event, args) => { toggleTemplateActive(args[0]) },
}, "change");

// Limpeza da funcionalidade ao sair ou trocar de organização.
AppModules.onReset('emails.js', () => {
  emailTemplates = [];
  emailSettings = {};
});

})();
