// Estado privado; interface partilhada em AppModules.definicoes.
// Edição do modelo selecionado: quando sai, o assunto e o conteúdo em blocos
// (parágrafos de texto e blocos automáticos com nomes legíveis), ao lado da
// pré-visualização com um alojamento e uma reserva reais. O corpo continua a
// ser guardado como HTML com marcadores {{…}} (ver features/emails/blocos.js).
(() => {
AppModules.define('definicoes', {
  selectTemplate: { get: () => selectTemplate },
  switchEmailLang: { get: () => switchEmailLang },
  syncEditorToTemplate: { get: () => syncEditorToTemplate },
  toggleEmailWindow: { get: () => toggleEmailWindow },
  editorDirty: { get: () => dirty, set: value => setDirty(value) },
  renderEditorStatus: { get: () => renderEditorStatus },
  editorDraft: { get: () => editorDraft },
});

let segments = [];
let dirty = false;
let addOpen = false;

const D = () => AppModules.definicoes;
const core = () => AppModules.core;
const esc = value => core().escapeHtml(value ?? '');
const ic = (name, size = 14) => core().lcIcon(name, size);
const current = () => D().emailTemplates.find(x => x.slug === D().selectedTemplateSlug);

function setDirty(value) {
  dirty = Boolean(value);
  const el = document.getElementById('et-dirty');
  if (el) el.hidden = !dirty;
}

// ── Quando sai ──
function whenHtml(t, meta) {
  if (D().FIXED_TIMING_EVENTS.includes(t.timing_event)) {
    return `<p class="emed2-when-text">${ic('zap', 14)} ${esc(meta.eventLabel || '')}</p>`;
  }
  const anchor = t.timing_event === 'checkin' ? 'da entrada (check-in)' : 'da saída (check-out)';
  const windowOn = Boolean(t.window_start);
  return `<p class="emed2-when-text">${ic('clock-3', 14)} Enviar
      <input type="number" class="form-control emed2-inline" id="et-offset" value="${esc(t.timing_offset)}" min="0" autocomplete="off" aria-label="Quanto tempo">
      <select class="form-control emed2-inline" id="et-unit" aria-label="Unidade">
        <option value="hours" ${t.timing_unit === 'hours' ? 'selected' : ''}>horas</option>
        <option value="days" ${t.timing_unit === 'days' ? 'selected' : ''}>dias</option>
      </select>
      <select class="form-control emed2-inline" id="et-direction" aria-label="Antes ou depois">
        <option value="before" ${t.timing_direction === 'before' ? 'selected' : ''}>antes</option>
        <option value="after" ${t.timing_direction === 'after' ? 'selected' : ''}>depois</option>
      </select>
      ${anchor}.</p>
    <label class="emed2-window" id="et-window-fields">
      <input type="checkbox" id="et-window-toggle" ${windowOn ? 'checked' : ''} data-on-change="emails-toggle-email-window-90fd802">
      Só entre as
      <input type="time" class="form-control emed2-inline" id="et-window-start" value="${esc(t.window_start || '09:00')}" ${windowOn ? '' : 'disabled'}>
      e as
      <input type="time" class="form-control emed2-inline" id="et-window-end" value="${esc(t.window_end || '20:00')}" ${windowOn ? '' : 'disabled'}>
    </label>`;
}

function toggleEmailWindow() {
  const on = document.getElementById('et-window-toggle')?.checked;
  for (const id of ['et-window-start', 'et-window-end']) {
    const el = document.getElementById(id);
    if (el) el.disabled = !on;
  }
  setDirty(true);
}

// ── Conteúdo em blocos ──
function moveButtons(i) {
  return `<span class="emb-move">
    <button type="button" class="emb-icon" title="Subir" aria-label="Subir" ${i === 0 ? 'disabled' : ''} ${AppActions.attrs('click', 'emails-segment-move', [String(i), '-1'])}>${ic('arrow-up', 14)}</button>
    <button type="button" class="emb-icon" title="Descer" aria-label="Descer" ${i === segments.length - 1 ? 'disabled' : ''} ${AppActions.attrs('click', 'emails-segment-move', [String(i), '1'])}>${ic('arrow-down', 14)}</button>
    <button type="button" class="emb-icon" title="Tirar do email" aria-label="Tirar do email" ${AppActions.attrs('click', 'emails-segment-remove', [String(i)])}>${ic('x', 14)}</button>
  </span>`;
}

function missingFields() {
  const r = D().emailReadiness?.[D().selectedTemplateSlug];
  return r ? r.missing : [];
}

function segmentHtml(seg, i) {
  if (seg.type === 'text') {
    return `<div class="emb emb-text" data-i="${i}">
      <div class="emb-tools">
        <button type="button" class="emb-icon" title="Negrito" data-on-mousedown="emails-keep-body-focus-2f8d6b1" ${AppActions.attrs('click', 'emails-segment-format', ['bold'])}><b>B</b></button>
        <button type="button" class="emb-icon" title="Itálico" data-on-mousedown="emails-keep-body-focus-2f8d6b1" ${AppActions.attrs('click', 'emails-segment-format', ['italic'])}><i>I</i></button>
        <button type="button" class="emb-icon" title="Sublinhado" data-on-mousedown="emails-keep-body-focus-2f8d6b1" ${AppActions.attrs('click', 'emails-segment-format', ['underline'])}><u>U</u></button>
        ${D().buildCodesDropdown(`et-text-${i}`)}
        <span class="emb-kind">Texto</span>
        ${moveButtons(i)}
      </div>
      <div class="emb-text-body" id="et-text-${i}" contenteditable="true" data-i="${i}" data-on-input="emails-segment-input">${D().textSegmentHtml(seg.html)}</div>
    </div>`;
  }
  const info = D().blockInfo(seg.key);
  const missing = missingFields().filter(m => info.fields.includes(m.field));
  return `<div class="emb emb-block${missing.length ? ' is-missing' : ''}" data-i="${i}">
    <span class="emb-block-icon" aria-hidden="true">${ic('blocks', 16)}</span>
    <div class="emb-block-copy"><b>${esc(info.name)}</b><small>${missing.length ? `Falta no alojamento: ${esc(missing.map(m => m.label).join(', '))}` : esc(info.desc)}</small></div>
    <span class="emb-tag${missing.length ? ' is-missing' : ''}">${missing.length ? 'Em falta' : 'Automático'}</span>
    ${moveButtons(i)}
  </div>`;
}

function renderSegments() {
  const list = document.getElementById('et-blocks');
  if (!list) return;
  list.innerHTML = segments.length ? segments.map(segmentHtml).join('')
    : '<p class="emb-empty">Este email está vazio. Acrescente um texto ou um bloco.</p>';
  renderAddMenu();
  if (window.lucide) lucide.createIcons();
}

function renderAddMenu() {
  const menu = document.getElementById('et-add-menu');
  if (!menu) return;
  menu.hidden = !addOpen;
  if (!addOpen) return;
  const used = new Set(segments.filter(s => s.type === 'block').map(s => s.key));
  const { top, rest } = D().suggestedBlocks(D().selectedTemplateSlug, D().emailBlockNames);
  const item = key => {
    const info = D().blockInfo(key);
    return `<button type="button" class="emb-add-item" ${AppActions.attrs('click', 'emails-segment-add', [key])}>
      <b>${esc(info.name)}</b><small>${esc(info.desc)}${used.has(key) ? ' · já está no email' : ''}</small></button>`;
  };
  menu.innerHTML = `
    <button type="button" class="emb-add-item is-text" ${AppActions.attrs('click', 'emails-segment-add', ['__text'])}>
      <b>${ic('type', 14)} Parágrafo de texto</b><small>Texto escrito por si, com dados do hóspede e da reserva</small></button>
    ${top.length ? `<div class="emb-add-group">Blocos para este email</div>${top.map(item).join('')}` : ''}
    <details class="emb-add-more"><summary>Outros blocos</summary>${rest.map(item).join('')}</details>`;
}

function readSegmentsFromDom() {
  document.querySelectorAll('#et-blocks .emb-text-body').forEach(el => {
    const i = Number(el.dataset.i);
    if (segments[i]?.type === 'text') segments[i].html = el.innerHTML;
  });
}

function segmentInput(el) {
  const i = Number(el.dataset.i);
  if (segments[i]?.type === 'text') segments[i].html = el.innerHTML;
  setDirty(true);
  D().emailBodyChanged();
}

function moveSegment(i, step) {
  readSegmentsFromDom();
  const j = i + step;
  if (j < 0 || j >= segments.length) return;
  [segments[i], segments[j]] = [segments[j], segments[i]];
  changed();
}

function removeSegment(i) {
  readSegmentsFromDom();
  segments.splice(i, 1);
  changed();
}

function addSegment(key) {
  readSegmentsFromDom();
  segments.push(key === '__text' ? { type: 'text', html: '<p>Escreva aqui o seu texto.</p>' } : { type: 'block', key });
  addOpen = false;
  changed();
  const last = document.querySelector(`#et-blocks .emb[data-i="${segments.length - 1}"]`);
  last?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  if (key === '__text') last?.querySelector('.emb-text-body')?.focus();
}

function changed() {
  setDirty(true);
  renderSegments();
  D().emailBodyChanged();
}

function toggleAddMenu() {
  addOpen = !addOpen;
  renderAddMenu();
}

// ── Línguas ──
// As traduções ainda não são usadas no envio: os hóspedes recebem sempre o
// texto em português. A nota diz isso enquanto não houver envio por língua.
function langSelectHtml() {
  return `<label class="emed2-lang">${ic('languages', 14)}
    <select class="form-control emed2-inline" id="et-lang" data-on-change="emails-switch-email-lang-select" aria-label="Língua do texto">
      ${D().LANGS.map(l => `<option value="${l.code}" ${D().emailLang === l.code ? 'selected' : ''}>${esc(l.label)}</option>`).join('')}
    </select></label>`;
}

function switchEmailLang(lang) {
  syncEditorToTemplate();
  D().emailLang = lang;
  core().SS.set('email:lang', lang);
  loadSegments();
  const t = current();
  const subj = document.getElementById('et-subject');
  if (subj) subj.value = t?.[D().langField(lang, 'subject')] || '';
  const note = document.getElementById('et-lang-note');
  if (note) note.hidden = lang === 'pt';
  D().updateEmailPreview();
}

function loadSegments() {
  const t = current();
  const lang = D().emailLang;
  const body = t?.[D().langField(lang, 'body')] || (lang === 'pt' ? t?.body : '') || '';
  segments = D().parseEmailBody(body, D().emailBlockNames);
  renderSegments();
}

// Rascunho aberto (para a pré-visualização e o envio de teste), sem gravar.
function editorDraft() {
  readSegmentsFromDom();
  return { subject: document.getElementById('et-subject')?.value ?? '', body: D().serializeEmailBody(segments) };
}

function syncEditorToTemplate() {
  const t = current();
  if (!t || !document.getElementById('et-blocks')) return;
  readSegmentsFromDom();
  const lang = D().emailLang;
  const subjEl = document.getElementById('et-subject');
  if (subjEl) t[D().langField(lang, 'subject')] = subjEl.value;
  t[D().langField(lang, 'body')] = D().serializeEmailBody(segments);
}

// ── O que falta no alojamento (dados de todos os emails) ──
function renderEditorStatus() {
  const box = document.getElementById('et-missing');
  if (!box) return;
  const blockFields = new Set(Object.values(D().BLOCK_FIELDS).flat());
  const shared = missingFields().filter(m => !blockFields.has(m.field) || !segments.some(s => s.type === 'block' && D().blockInfo(s.key).fields.includes(m.field)));
  const acc = D().previewAccommodation;
  box.hidden = !shared.length;
  box.innerHTML = shared.length ? `${ic('circle-alert', 16)}
    <div><b>Este email fica retido em ${esc(acc?.name || 'este alojamento')}</b>
      <span>Falta: ${esc(shared.map(m => m.label).join(', '))}.</span></div>
    ${acc ? `<button type="button" class="btn btn-ghost btn-sm" ${AppActions.attrs('click', 'emails-open-accommodation', [String(acc.id)])}>Completar o alojamento</button>` : ''}` : '';
  renderSegments();
}

// ── Seleção do modelo ──
async function selectTemplate(slug) {
  if (dirty && slug !== D().selectedTemplateSlug
    && !(await core().confirmar('Há alterações por guardar neste email. Sair sem guardar?'))) return;
  syncEditorToTemplate();
  setDirty(false);
  addOpen = false;
  D().selectedTemplateSlug = slug;
  D().emailLang = 'pt';
  core().SS.set('email:slug', slug);
  core().SS.set('email:lang', 'pt');
  D().renderTemplateList();
  const t = current();
  if (!t) return;
  const panel = document.getElementById('email-editor-panel');
  const meta = D().TEMPLATE_META[slug] || {};
  const sender = D().emailSender || {};

  panel.innerHTML = `
    <div class="emed2" id="emed2">
      <div class="emed2-main">
        <header class="emed2-head">
          <div class="emed2-title">
            <h3>${esc(meta.label || t.name)}</h3>
            <small>${t.customized ? 'Texto personalizado' : 'Texto original'}</small>
          </div>
          <span class="emed2-dirty" id="et-dirty" hidden>Alterações por guardar</span>
          <label class="email-active-toggle">
            <input type="checkbox" id="et-active" ${t.active ? 'checked' : ''} ${AppActions.attrs('change', 'emails-toggle-template-active-6f0ecde', [slug])}>
            <span class="gtt-switch"></span>
            <span class="gtt-label">${t.active ? 'Ligado' : 'Desligado'}</span>
          </label>
        </header>

        <div class="emed2-panes" role="tablist" aria-label="Ver">
          <button type="button" class="is-on" data-pane="edit" ${AppActions.attrs('click', 'emails-editor-pane', ['edit'])}>Texto</button>
          <button type="button" data-pane="preview" ${AppActions.attrs('click', 'emails-editor-pane', ['preview'])}>Pré-visualização</button>
        </div>

        <section class="emed2-when" data-on-change="emails-editor-changed">${whenHtml(t, meta)}</section>

        <div class="emed2-missing" id="et-missing" hidden></div>

        <section class="emed2-section">
          <label class="emed2-label" for="et-subject">Assunto</label>
          <div class="emed2-subject">
            <input class="form-control" id="et-subject" value="${esc(t.subject || '')}" autocomplete="off" data-on-input="emails-subject-input">
            ${D().buildCodesDropdown('et-subject')}
          </div>
        </section>

        <section class="emed2-section">
          <div class="emed2-label-row"><span class="emed2-label">Conteúdo</span>${langSelectHtml()}</div>
          <p class="emed2-note" id="et-lang-note" hidden>As traduções ainda não são usadas no envio: os hóspedes recebem sempre o texto em português.</p>
          <div class="emb-list" id="et-blocks"></div>
          <div class="emb-add">
            <button type="button" class="emb-add-btn" ${AppActions.attrs('click', 'emails-segment-add-menu', [])}>${ic('plus', 15)} Acrescentar texto ou bloco</button>
            <div class="emb-add-menu" id="et-add-menu" hidden></div>
          </div>
        </section>

        <details class="emed2-more">
          <summary>Mais opções</summary>
          <div class="emed2-env">
            <span>De</span><b>${esc(sender.name || 'O nome do alojamento')}${sender.email ? ` &lt;${esc(sender.email)}&gt;` : ''}</b>
            <span>Para</span><b>O hóspede da reserva</b>
            <label for="et-bcc">Cópia oculta</label>
            <input class="form-control" id="et-bcc" type="email" placeholder="email@exemplo.pt (opcional)" value="${esc(t.bcc || '')}" autocomplete="off" data-on-input="emails-editor-changed">
          </div>
        </details>

        <footer class="emed2-foot">
          <button type="button" class="btn btn-ghost btn-sm" ${t.has_default ? '' : 'disabled'} ${AppActions.attrs('click', 'emails-reset-template', [slug])}>${ic('rotate-ccw', 14)} Repor o texto original</button>
          <span class="emed2-foot-end">
            <button type="button" class="btn btn-ghost btn-sm" ${AppActions.attrs('click', 'emails-preview-email-b9e13c6', [slug])}>${ic('send', 14)} Enviar um teste</button>
            <button type="button" class="btn btn-primary btn-sm" ${AppActions.attrs('click', 'emails-save-template-a1efa8c', [slug])}>${ic('save', 14)} Guardar</button>
          </span>
        </footer>
      </div>

      <aside class="emed2-preview">
        <div class="emed2-label">Pré-visualização</div>
        <div class="emed2-preview-controls">
          <label>Alojamento
            <select class="form-control" id="et-preview-accommodation" data-on-change="emails-preview-accommodation-changed"></select>
          </label>
          <label>Reserva
            <select class="form-control" id="et-preview-reservation" data-on-change="emails-update-email-preview-34d4f1c"></select>
          </label>
        </div>
        <div id="et-preview-notice" class="emed-preview-notice" style="display:none;"></div>
        <div class="emed2-inbox"><span class="emed2-avatar" id="et-preview-avatar"></span><div><b id="et-preview-from"></b><span id="et-preview-subject"></span></div></div>
        <iframe id="et-preview-frame" class="email-preview-frame" sandbox="allow-same-origin" title="Pré-visualização do email"></iframe>
      </aside>
    </div>`;

  loadSegments();
  if (window.lucide) lucide.createIcons();
  await D().fillPreviewContext();
  renderEditorStatus();
  D().updateEmailPreview();
}

function showPane(pane) {
  const root = document.getElementById('emed2');
  if (!root) return;
  root.classList.toggle('show-preview', pane === 'preview');
  root.querySelectorAll('.emed2-panes button').forEach(b => b.classList.toggle('is-on', b.dataset.pane === pane));
  if (pane === 'preview') D().updateEmailPreview();
}

async function resetTemplate(slug) {
  if (!(await core().confirmar('Repor o assunto e o texto originais deste email? A versão atual fica guardada numa cópia de segurança.'))) return;
  try {
    const res = await core().apiPost(`/api/email-templates/${encodeURIComponent(slug)}/reset`, {});
    const t = D().emailTemplates.find(x => x.slug === slug);
    if (t && res?.data) Object.assign(t, res.data, { customized: false });
    setDirty(false);
    core().toast('Texto original reposto.', 'success');
    const keep = D().selectedTemplateSlug;
    D().selectedTemplateSlug = null;
    await selectTemplate(keep);
  } catch (err) {
    core().toast('❌ ' + (err?.payload?.error || 'Não foi possível repor o texto.'), 'error');
  }
}

async function openAccommodation(id) {
  if (dirty && !(await core().confirmar('Há alterações por guardar neste email. Sair sem guardar?'))) return;
  setDirty(false);
  await core().showView('alojamentos');
  AppModules.alojamentos.openAlojamento(id, 'info');
}

AppActions.register({
  "emails-select-template-5b7ac72": async (el, event, args) => {
    await selectTemplate(args[0]);
    // Num ecrã estreito o editor fica por baixo da lista: levar até ele.
    if (window.innerWidth < 900) document.getElementById('email-editor-panel')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  },
  "emails-segment-move": (el, event, args) => { moveSegment(Number(args[0]), Number(args[1])) },
  "emails-segment-remove": (el, event, args) => { removeSegment(Number(args[0])) },
  "emails-segment-add": (el, event, args) => { addSegment(args[0]) },
  "emails-segment-add-menu": () => { toggleAddMenu() },
  "emails-segment-format": (el, event, args) => { document.execCommand(args[0]); const body = el.closest('.emb')?.querySelector('.emb-text-body'); if (body) segmentInput(body); },
  "emails-editor-pane": (el, event, args) => { showPane(args[0]) },
  "emails-reset-template": (el, event, args) => { resetTemplate(args[0]) },
  "emails-open-accommodation": (el, event, args) => { openAccommodation(args[0]) },
}, "click");

AppActions.register({
  "emails-segment-input": el => { segmentInput(el) },
  "emails-subject-input": () => { setDirty(true); D().emailBodyChanged() },
  "emails-editor-changed": () => { setDirty(true) },
}, "input");

AppActions.register({
  "emails-toggle-email-window-90fd802": () => { toggleEmailWindow() },
  "emails-switch-email-lang-select": el => { switchEmailLang(el.value) },
  "emails-editor-changed": () => { setDirty(true) },
}, "change");

// Os botões de formatação ficam fora do texto: sem isto, o browser tirava o
// foco e a seleção ao premir o rato, e o comando aplicava-se a lado nenhum.
AppActions.register({
  "emails-keep-body-focus-2f8d6b1": () => false,
}, "mousedown");

AppModules.onReset('features/emails/editor.js', () => {
  segments = []; dirty = false; addOpen = false;
});
})();
