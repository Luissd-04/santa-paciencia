// «Novo alojamento»: janela da app (no lugar do prompt() do browser, que
// alguns browsers e apps instaladas bloqueiam sem avisar). Pede o nome e o
// tipo (alojamento principal ou unidade) e, nas unidades, o alojamento a que
// pertencem. POST /api/accommodations; o erro do servidor (incluindo o limite
// do pacote) aparece sempre na própria janela. No fim abre a configuração do
// que foi criado.
(() => {
AppModules.define('alojamentos', {
  addAlojamento: { get: () => addAlojamento },
});

const core = () => AppModules.core;
const esc = value => core().escapeHtml(value);

const TIPOS = [
  ['alojamento', 'Alojamento (casa ou edifício)', 'building-2'],
  ['suite', 'Unidade (quarto ou suite)', 'door-open'],
];

let dialog = null;
let tipo = 'alojamento';
let sending = false;

function principais() {
  return (core().accommodations || []).filter(a => a.type === 'alojamento' && !a.parent_id);
}

function parentOptions(selected) {
  return `<option value="">Nenhum</option>${principais().map(a =>
    `<option value="${esc(a.id)}"${a.id === selected ? ' selected' : ''}>${esc(a.name)}</option>`).join('')}`;
}

function bodyHtml(parentId) {
  return `<div class="v2-bloco anv-bloco">
      <label class="form-label" for="anv-nome">Nome</label>
      <input type="text" class="form-control" id="anv-nome" maxlength="120" required autocomplete="off" placeholder="Ex.: Casa da Praia" ${AppActions.attrs('keydown', 'aloj-novo-tecla')}>
    </div>
    <div class="v2-bloco anv-bloco">
      <span class="form-label" id="anv-tipo-l">Tipo</span>
      <div class="anv-seg" role="radiogroup" aria-labelledby="anv-tipo-l">${TIPOS.map(([key, label, icon]) =>
        `<button type="button" role="radio" aria-checked="${key === tipo}" data-tipo="${key}" ${AppActions.attrs('click', 'aloj-novo-tipo', [key])}>${core().lcIcon(icon, 16)}<span>${label}</span></button>`).join('')}</div>
    </div>
    <div class="v2-bloco anv-bloco" id="anv-parent-wrap"${tipo === 'suite' ? '' : ' hidden'}>
      <label class="form-label" for="anv-parent">Pertence a</label>
      <select class="form-control" id="anv-parent">${parentOptions(parentId)}</select>
      <p class="anv-dica">Uma unidade herda a morada, o Wi-Fi e as comodidades do alojamento a que pertence.</p>
    </div>
    <p class="anv-erro" id="anv-erro" role="alert" hidden></p>`;
}

// opções: { type: 'alojamento' | 'suite', parentId }
function addAlojamento(options) {
  const opts = options && typeof options === 'object' && !('target' in options) ? options : {};
  tipo = opts.type === 'suite' ? 'suite' : 'alojamento';
  sending = false;
  const parentId = tipo === 'suite' && principais().some(a => a.id === opts.parentId) ? opts.parentId : '';
  const v2 = Boolean(document.documentElement.dataset.look);
  dialog = AppUI.openDialog({
    id: 'anv-janela',
    title: tipo === 'suite' && opts.parentId ? 'Nova unidade' : 'Novo alojamento',
    body: bodyHtml(parentId),
    footer: `<button type="button" class="btn btn-ghost" data-dialog-close>Cancelar</button>
      <button type="button" class="btn btn-primary" id="anv-criar" ${AppActions.attrs('click', 'aloj-novo-criar')}>${core().lcIcon('plus', 16)} Criar</button>`,
    className: 'anv',
    onClose: () => { dialog = null; sending = false; },
  });
  if (v2) {
    // Mesma moldura das outras janelas V2 (janelas.js): ícone no título.
    dialog.classList.add('v2-janela');
    dialog.querySelector('.modal-header')?.insertAdjacentHTML('afterbegin', `<span class="v2-bigic is-info" aria-hidden="true">${core().lcIcon('building-2', 22)}</span>`);
    if (window.lucide) lucide.createIcons();
  }
  dialog.querySelector('#anv-nome')?.focus({ preventScroll: true });
}

function chooseTipo(next) {
  if (!dialog || !TIPOS.some(([key]) => key === next)) return;
  tipo = next;
  dialog.querySelectorAll('[data-tipo]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.tipo === next)));
  dialog.querySelector('#anv-parent-wrap').hidden = next !== 'suite';
}

function showError(message) {
  const box = dialog?.querySelector('#anv-erro');
  if (!box) { core().toast(message, 'error'); return; }
  box.textContent = message;
  box.hidden = false;
}

async function submit() {
  if (sending || !dialog) return;
  const input = dialog.querySelector('#anv-nome');
  const name = input.value.trim();
  dialog.querySelector('#anv-erro').hidden = true;
  if (!name) { showError('Escreva o nome.'); input.focus(); return; }
  if (name.length > 120) { showError('O nome pode ter no máximo 120 caracteres.'); input.focus(); return; }
  const payload = { name, type: tipo };
  if (tipo === 'suite') {
    const parent = dialog.querySelector('#anv-parent').value;
    if (parent) payload.parent_id = parent;
  }
  const button = dialog.querySelector('#anv-criar');
  sending = true;
  button.disabled = true;
  try {
    const res = await core().apiPost('/api/accommodations', payload);
    if (!res?.success) throw Object.assign(new Error(res?.error || 'Não foi possível criar.'), { payload: res });
    const created = res.data;
    AppUI.closeDialog(dialog);
    core().toast(tipo === 'suite' ? '✅ Unidade criada.' : '✅ Alojamento criado.', 'success');
    await core().loadAccommodations();
    if (created?.id) await AppModules.alojamentos.openAlojamento(created.id);
  } catch (error) {
    // Mensagem do servidor tal como vem (inclui os limites do pacote).
    const message = error?.payload?.error || (error?.status ? error.message : '') || 'Erro de ligação ao servidor. Tente de novo.';
    sending = false;
    if (dialog) {
      showError(message);
      if (button.isConnected) button.disabled = false;
    } else {
      core().toast(message, 'error');
    }
  }
}

AppActions.register({
  'aloj-novo-tipo': (el, event, args) => chooseTipo(args[0]),
  'aloj-novo-criar': () => submit(),
}, 'click');

AppActions.register({
  'aloj-novo-tecla': (el, event) => {
    if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); submit(); }
  },
}, 'keydown');

AppModules.onReset('features/alojamentos/novo-alojamento.js', () => {
  if (dialog) AppUI.closeDialog(dialog);
  dialog = null; sending = false;
});

})();
