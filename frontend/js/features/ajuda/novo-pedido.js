// «Novo pedido» de Ajuda e feedback (V2): janela com o tipo, o assunto, a
// descrição, anexos e o resumo da informação técnica que segue com o pedido.
// No telemóvel abre como folha (a mesma moldura das outras janelas V2).
// POST /api/support/tickets; no fim abre o pedido criado.
(() => {
AppModules.define('ajuda', {
  openNew: { get: () => openNew },
});

const core = () => AppModules.core;
const esc = value => core().escapeHtml(value);
const ic = (name, size = 16) => core().lcIcon(name, size);
const ajuda = () => AppModules.ajuda;

const PLACEHOLDERS = {
  problem: 'Ex.: o email de confirmação não chega aos hóspedes',
  improvement: 'Ex.: mostrar o NIF no relatório mensal',
  question: 'Ex.: como ligo o calendário do Airbnb?',
};
const HINTS = {
  problem: 'O que aconteceu, o que esperava que acontecesse e, se souber, os passos para repetir.',
  improvement: 'Que problema resolveria e como imagina que funcionaria.',
  question: 'Conte-nos o que quer fazer.',
};
// «Talvez ajude» (só na pergunta) fica de fora: ainda não há ajuda escrita na app.

let type = 'problem';
let files = [];
let sending = false;
let dialog = null;

function displayMode() {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true ? 'standalone' : 'browser';
  } catch { return 'browser'; }
}

// O que segue com o pedido (nunca dados de hóspedes).
function technical() {
  const build = core().appBuild || null;
  return {
    page: document.body.dataset.previousView || 'dashboard',
    app_build: build,
    display_mode: displayMode(),
    viewport: { width: Math.round(window.innerWidth), height: Math.round(window.innerHeight) },
  };
}

function contextSummary(context) {
  return [`Página: ${ajuda().pageLabel(context.page)}`,
    context.app_build ? `Versão: ${String(context.app_build).slice(0, 8)}` : '',
    `Modo: ${context.display_mode === 'standalone' ? 'app instalada' : 'browser'}`,
    `Largura: ${context.viewport.width} px`].filter(Boolean).join(' · ');
}

function bodyHtml() {
  const context = technical();
  return `<p class="ajv2-sub">Respondemos normalmente em 1 dia útil.</p>
    <div class="v2-bloco">
      <span class="form-label" id="ajv2-tipo-l">Tipo de pedido</span>
      <div class="v2-pills is-seg" role="radiogroup" aria-labelledby="ajv2-tipo-l">${Object.entries(ajuda().TYPES).map(([key, [label, icon]]) =>
        `<button type="button" role="radio" aria-checked="${key === type}" data-tipo="${key}" ${AppActions.attrs('click', 'ajuda-tipo', [key])}>${ic(icon, 15)}${label}</button>`).join('')}</div>
    </div>
    <div class="v2-bloco">
      <label class="form-label" for="ajv2-assunto">Assunto</label>
      <input type="text" class="form-control" id="ajv2-assunto" maxlength="120" autocomplete="off" placeholder="${esc(PLACEHOLDERS[type])}">
    </div>
    <div class="v2-bloco">
      <label class="form-label" for="ajv2-descricao">Descrição</label>
      <textarea class="form-control" id="ajv2-descricao" rows="5" maxlength="5000" placeholder="${esc(HINTS[type])}"></textarea>
    </div>
    <div class="v2-bloco">
      <label class="ajv2-drop">${ic('paperclip', 18)}<span>Anexar capturas ou ficheiros <small>· PNG, JPG, WEBP, GIF ou PDF, até 10 MB (máx. 3)</small></span>
        <input type="file" class="ajv2-sr" id="ajv2-novo-input" multiple accept="${ajuda().FILE_ACCEPT}" ${AppActions.attrs('change', 'ajuda-novo-ficheiros')}></label>
      <div class="ajv2-chips" id="ajv2-novo-ficheiros"></div>
    </div>
    <div class="ajv2-tec">
      <label class="ajv2-check"><input type="checkbox" id="ajv2-ctx" checked ${AppActions.attrs('change', 'ajuda-ctx')}><span>Incluir informação técnica</span></label>
      <p><span id="ajv2-ctx-resumo">${esc(contextSummary(context))}<br></span>Ajuda-nos a perceber o problema sem perguntas extra. Nunca inclui dados de hóspedes.</p>
    </div>`;
}

function openNew(initial = 'problem') {
  if (!document.documentElement.dataset.look) return;
  type = ajuda().TYPES[initial] ? initial : 'problem';
  files = [];
  sending = false;
  dialog = AppUI.openDialog({
    id: 'ajv2-novo',
    title: 'Novo pedido',
    body: bodyHtml(),
    footer: `<button type="button" class="btn btn-ghost" data-dialog-close>Cancelar</button>
      <button type="button" class="btn btn-primary" id="ajv2-novo-enviar" ${AppActions.attrs('click', 'ajuda-novo-enviar')}>${ic('send', 16)} Enviar pedido</button>`,
    className: 'ajv2-novo',
    onClose: () => { dialog = null; files = []; },
  });
  // Mesma moldura das outras janelas V2 (janelas.js): ícone no título.
  dialog.classList.add('v2-janela');
  dialog.querySelector('.modal-header')?.insertAdjacentHTML('afterbegin', `<span class="v2-bigic is-info" aria-hidden="true">${ic('life-buoy', 22)}</span>`);
  if (window.lucide) lucide.createIcons();
  dialog.querySelector('#ajv2-assunto')?.focus({ preventScroll: true });
}

function chooseType(next) {
  if (!dialog || !ajuda().TYPES[next]) return;
  type = next;
  dialog.querySelectorAll('[data-tipo]').forEach(button => button.setAttribute('aria-checked', String(button.dataset.tipo === next)));
  dialog.querySelector('#ajv2-assunto').placeholder = PLACEHOLDERS[next];
  dialog.querySelector('#ajv2-descricao').placeholder = HINTS[next];
}

function renderFiles() {
  const box = dialog?.querySelector('#ajv2-novo-ficheiros');
  if (box) box.innerHTML = ajuda().fileChipsHtml(files, 'novo');
  if (window.lucide) lucide.createIcons();
}

async function submit() {
  if (sending || !dialog) return;
  const subject = dialog.querySelector('#ajv2-assunto').value.trim();
  const body = dialog.querySelector('#ajv2-descricao').value.trim();
  if (!subject) { core().toast('Escreva o assunto do pedido.', 'info'); dialog.querySelector('#ajv2-assunto').focus(); return; }
  if (!body) { core().toast('Descreva o pedido para o podermos ajudar.', 'info'); dialog.querySelector('#ajv2-descricao').focus(); return; }
  const button = dialog.querySelector('#ajv2-novo-enviar');
  sending = true;
  button.disabled = true;
  try {
    const payload = { type, subject, body };
    if (dialog.querySelector('#ajv2-ctx').checked) payload.context = technical();
    if (files.length) payload.attachments = await ajuda().readAttachments(files);
    const created = (await core().apiPost('/api/support/tickets', payload, { timeoutMs: 120000 }))?.data;
    AppUI.closeDialog(dialog);
    core().toast(`Pedido${created?.number ? ` ${created.number}` : ''} enviado. Respondemos normalmente em 1 dia útil.`, 'success', 5000);
    await ajuda().reloadAll();
    if (created?.id != null) await ajuda().openTicket(created.id);
  } catch (error) {
    core().toast(error?.payload?.error || 'Não foi possível enviar o pedido. Tente de novo.', 'error');
    sending = false;
    if (button.isConnected) button.disabled = false;
  }
}

AppActions.register({
  'ajuda-novo': (el, event, args) => { openNew(args[0]); },
  'ajuda-tipo': (el, event, args) => chooseType(args[0]),
  'ajuda-novo-enviar': () => submit(),
  'ajuda-novo-remover': (el, event, args) => { files.splice(Number(args[0]), 1); renderFiles(); },
}, 'click');

AppActions.register({
  'ajuda-novo-ficheiros': el => {
    const problems = ajuda().addFiles(files, el.files);
    el.value = '';
    if (problems.length) core().toast(problems.join(' '), 'error', 6000);
    renderFiles();
  },
  'ajuda-ctx': el => {
    const resumo = dialog?.querySelector('#ajv2-ctx-resumo');
    if (resumo) resumo.hidden = !el.checked;
  },
}, 'change');

AppModules.onReset('features/ajuda/novo-pedido.js', () => {
  if (dialog) AppUI.closeDialog(dialog);
  dialog = null; files = []; sending = false;
});

})();
