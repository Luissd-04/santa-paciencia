// Estado privado; interface partilhada em AppModules.definicoes.
// Menu de códigos ({{variável}}) usado no assunto e no corpo do editor.
(() => {
AppModules.define('definicoes', {
  buildCodesDropdown: { get: () => buildCodesDropdown },
  closeCodesDropdown: { get: () => closeCodesDropdown },
  insertVarInField: { get: () => insertVarInField },
  toggleCodesDropdown: { get: () => toggleCodesDropdown },
});

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
  {
    // Blocos: HTML montado pelo servidor a partir das definições e do estado
    // real da reserva. Garantem o desenho dos modelos de referência mesmo
    // depois de editar o texto à volta.
    label: 'Blocos',
    vars: [
      { key: 'titulo_boas_vindas',       label: 'Título de boas-vindas' },
      { key: 'titulo_reserva',           label: 'Título segundo o estado da reserva' },
      { key: 'mensagem_estado',          label: 'Mensagem segundo o estado da reserva' },
      { key: 'titulo_estado',            label: 'Estado da reserva (texto, para o assunto)' },
      { key: 'cartao_reserva',           label: 'Cartão de detalhes com total' },
      { key: 'cartao_reserva_sem_total', label: 'Cartão de detalhes sem total' },
      { key: 'botao_alojamento',         label: 'Botão — conhecer o alojamento' },
      { key: 'acompanhe_nos',            label: 'Redes sociais — acompanhe-nos' },
      { key: 'localidade',               label: 'Localidade do alojamento' },
    ]
  },
];

document.addEventListener('click', e => {
  if (!e.target.closest('.codes-dropdown-wrap') && !e.target.closest('.codes-dropdown')) {
    closeCodesDropdown();
  }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCodesDropdown(); });

// ── CODES DROPDOWN ──
// O painel vive em document.body (não dentro do editor): os contentores
// .emails-editor e .emed-body-section têm overflow hidden/auto e recortavam
// a lista, pelo que o botão parecia não fazer nada.
function buildCodesDropdown(fieldId) {
  return `
    <div class="codes-dropdown-wrap">
      <button class="codes-btn" type="button"
              ${AppActions.attrs("click", "emails-toggle-codes-dropdown-d422067", [String((fieldId) ?? '')])}
              ${AppActions.attrs("mousedown", "emails-keep-field-focus-3a7c1e2", [])}>
        ${AppModules.core.lcIcon('settings-2', 12)} Códigos
      </button>
    </div>`;
}

let _codesField = null;

function _codesEl() {
  let el = document.getElementById('codes-dropdown-global');
  if (!el) {
    el = document.createElement('div');
    el.id = 'codes-dropdown-global';
    el.className = 'codes-dropdown';
    el.style.display = 'none';
    // SEM stopPropagation aqui: o "fechar se for fora" logo abaixo já ignora
    // cliques dentro do painel via closest('.codes-dropdown'). Um
    // stopPropagation neste nível impedia o clique de alguma vez chegar ao
    // despacho central do AppActions (em document) — nenhum código era
    // inserido, por mais que se clicasse.
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

// Ignora scroll nos primeiros instantes depois de abrir: abrir o menu perto
// da borda do ecrã pode por si só disparar um scroll-into-view (do próprio
// botão a ganhar foco/clique), o que fechava o painel na mesma fração de
// segundo em que abria, antes de o utilizador conseguir ver os códigos.
let _openedAt = 0;

function toggleCodesDropdown(fieldId, btn) {
  const el = _codesEl();
  if (_codesField === fieldId && el.style.display !== 'none') { closeCodesDropdown(); return; }
  el.innerHTML = TEMPLATE_VAR_CATS.map((cat, i) => `
    ${i > 0 ? '<div class="codes-cat-divider"></div>' : ''}
    <div class="codes-cat-title">${cat.label}</div>
    ${cat.vars.map(v => `
      <div class="codes-item"
           ${AppActions.attrs("click", "emails-insert-var-in-field-8f5fdae", [String((fieldId) ?? ''), String((v.key) ?? '')])}
           ${AppActions.attrs("mousedown", "emails-keep-field-focus-3a7c1e2", [])}>${v.label}</div>
    `).join('')}
  `).join('');
  _codesField = fieldId;
  el.style.display = 'block';
  _openedAt = Date.now();
  _positionCodesDropdown(btn || document.querySelector(`.codes-btn[onclick*="${fieldId}"]`));
}

// Reposicionar/fechar quando a página se move por baixo do painel.
window.addEventListener('resize', closeCodesDropdown);
window.addEventListener('scroll', e => {
  // não fechar quando o scroll é dentro da própria lista (closest, não só o
  // alvo exato: um clique/scroll num item interno tem esse item como alvo).
  if (e.target?.closest?.('#codes-dropdown-global')) return;
  if (Date.now() - _openedAt < 200) return;
  closeCodesDropdown();
}, true);

function insertVarInField(fieldId, key) {
  const el = document.getElementById(fieldId);
  if (!el) return;
  const v = `{{${key}}}`;
  if (el.isContentEditable) {
    el.focus();
    document.execCommand('insertText', false, v);
    AppModules.definicoes.emailBodyChanged();
  } else {
    const start = el.selectionStart ?? el.value.length;
    const end   = el.selectionEnd   ?? el.value.length;
    el.value = el.value.slice(0, start) + v + el.value.slice(end);
    el.selectionStart = el.selectionEnd = start + v.length;
    el.focus();
  }
  closeCodesDropdown();
}

AppActions.register({
  "emails-insert-var-in-field-8f5fdae": (el, event, args) => { insertVarInField(args[0],args[1]);event.stopPropagation(); },
  "emails-toggle-codes-dropdown-d422067": (el, event, args) => { toggleCodesDropdown(args[0], el);event.stopPropagation(); },
}, "click");

// O botão "Códigos" e cada item são fora do campo de texto (botão/div, não
// focáveis por default, mas o browser ainda tira o foco/seleção do campo ao
// premir o rato neles). Sem isto, ao clicar num código o cursor já não
// estava onde o hóspede via, e insertVarInField() não inseria em lado
// nenhum. Impedir aqui preserva a seleção do campo do início ao fim.
AppActions.register({
  "emails-keep-field-focus-3a7c1e2": () => false,
}, "mousedown");

// Limpeza da funcionalidade ao sair ou trocar de organização.
AppModules.onReset('features/emails/codes.js', () => {
  _codesField = null;
});

})();
