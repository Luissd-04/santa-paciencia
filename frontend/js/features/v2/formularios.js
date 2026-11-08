// V2 no telemóvel (maquetas tel-04 a tel-08): os formulários de criar abrem
// como folhas. O aspeto é CSS (css/v2/telemovel.css); aqui ficam as peças
// que a maqueta acrescenta, montadas de cada vez que um formulário abre
// (evento app:modal de ui.js): listas de escolha em pílulas, o talão pela
// câmara e o valor em grande na despesa, o bilhete ao vivo e «Gerar» no
// voucher e as horas rápidas do lembrete. Os campos e o guardar são os de
// sempre; as pílulas só mudam o valor da lista escondida.
(() => {
const core = () => AppModules.core;
const PHONE = '(max-width: 767px), (max-height: 500px) and (orientation: landscape)';

// Classe no <html> que liga o aspeto de folha (componentes.css e telemovel.css).
const phone = window.matchMedia(PHONE);
const syncPhone = () => document.documentElement.classList.toggle('v2-tel', phone.matches);
syncPhone();
phone.addEventListener?.('change', syncPhone);

// [lista] → como mostrar cada opção. `seg`: botões lado a lado.
const PILLS = {
  'despesa-category': { icon: value => AppModules.despesas?.EXPENSE_CATS?.[value]?.icon },
  'despesa-payment': { seg: true },
  'evento-type': { dot: value => core().EVENT_TYPES.find(t => t.id === value)?.color },
  'evento-responsible': { avatar: true },
  'v-type': { seg: true, labels: { discount_pct: 'Percentagem', discount_fixed: 'Valor fixo', credit_stay: 'Crédito estadia' } },
};

function pillsHtml(select, cfg) {
  const esc = core().escapeHtml;
  return [...select.options].map(option => {
    const value = option.value;
    const label = cfg.labels?.[value] || option.textContent.trim();
    const icon = cfg.icon?.(value);
    const dot = cfg.dot?.(value);
    const lead = icon ? core().lcIcon(icon, 15)
      : dot ? `<i class="v2-dot" style="background:${esc(dot)}"></i>`
      : cfg.avatar && value ? `<span class="v2-av">${esc(core().initials(label))}</span>` : '';
    return `<button type="button" role="radio" aria-checked="${value === select.value}" ${AppActions.attrs('click', 'v2-pilula', [select.id, value])}>${lead}${esc(label)}</button>`;
  }).join('');
}

function renderPills(select) {
  const cfg = PILLS[select.id];
  const group = select.closest('.form-group');
  if (!cfg || !group) return;
  let box = group.querySelector('.v2-pills');
  if (!box) {
    group.insertAdjacentHTML('beforeend', `<div class="v2-pills${cfg.seg ? ' is-seg' : ''}" role="radiogroup" aria-label="${core().escapeHtml(group.querySelector('label')?.textContent.trim() || '')}"></div>`);
    box = group.querySelector('.v2-pills');
    group.classList.add('v2-has-pills');
  }
  box.innerHTML = pillsHtml(select, cfg);
  if (window.lucide) lucide.createIcons();
}

function choose(id, value) {
  const select = document.getElementById(id);
  if (!select) return;
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
  AppUI.refreshDropdowns?.(select.closest('.modal') || document);
  renderPills(select);
}

// ── Despesa: talão pela câmara (só numa nova) ──
function prepararDespesa(modal) {
  const body = modal.querySelector('.modal-body');
  if (!body.querySelector('.v2-cam')) {
    body.insertAdjacentHTML('afterbegin', `<label class="v2-cam"><span class="v2-cam-ic">${core().lcIcon('scan-line', 22)}</span>
      <span><b>Ler talão com a câmara</b><small>A IA preenche tudo por ti</small></span>${core().lcIcon('chevron-right', 16)}
      <input type="file" accept="image/*" capture="environment" hidden data-on-change="v2-despesa-talao"></label>`);
  }
  body.querySelector('.v2-cam').hidden = document.getElementById('despesa-modal-title')?.textContent.trim() !== 'Nova Despesa';
}

// ── Voucher: o bilhete enquanto se escreve, e «Gerar» ──
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function prepararVoucher(modal) {
  const body = modal.querySelector('.modal-body');
  if (!body.querySelector('.v2-ticket')) {
    body.insertAdjacentHTML('afterbegin', '<div class="v2-ticket" aria-hidden="true"><div><b class="v2-ticket-code"></b><small class="v2-ticket-desc"></small></div><strong class="v2-ticket-val"></strong><small class="v2-ticket-ft"></small></div>');
    document.getElementById('v-code')?.insertAdjacentHTML('afterend', `<button type="button" class="btn btn-ghost btn-sm v2-gerar" data-on-click="v2-voucher-gerar">Gerar</button>`);
    body.addEventListener('input', () => bilhete(modal));
    body.addEventListener('change', () => bilhete(modal));
  }
  bilhete(modal);
}

function bilhete(modal) {
  const val = id => document.getElementById(id)?.value?.trim() || '';
  const type = val('v-type');
  const value = Number(val('v-value')) || 0;
  const until = val('v-valid-until');
  const uses = Number(val('v-max-uses')) || 1;
  modal.querySelector('.v2-ticket-code').textContent = val('v-code').toUpperCase() || 'NOVO VOUCHER';
  modal.querySelector('.v2-ticket-desc').textContent = val('v-description') || 'Sem descrição';
  modal.querySelector('.v2-ticket-val').textContent = !value ? '—' : type === 'discount_pct' ? `${value} %` : ReservationMoney.formatShort(value);
  modal.querySelector('.v2-ticket-ft').textContent = [until ? `válido até ${window.ReservationDates.formatPtDate(until)}` : 'sem validade', `${uses} ${uses === 1 ? 'utilização' : 'utilizações'}`].join(' · ');
}

function gerarCodigo() {
  const input = document.getElementById('v-code');
  if (!input) return;
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  input.value = `SP${[...bytes].map(b => CODE_CHARS[b % CODE_CHARS.length]).join('')}`;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

// ── Lembrete: horas rápidas ──
function prepararLembrete(modal) {
  const body = modal.querySelector('.modal-body');
  if (body.querySelector('.v2-quando')) return;
  const group = document.getElementById('manual-notification-date')?.closest('.form-group');
  group?.insertAdjacentHTML('beforebegin', `<div class="v2-pills v2-quando" role="group" aria-label="Quando">
    <button type="button" ${AppActions.attrs('click', 'v2-lembrete-quando', ['1h'])}>Daqui a 1 h</button>
    <button type="button" ${AppActions.attrs('click', 'v2-lembrete-quando', ['18h'])}>Hoje às 18:00</button>
    <button type="button" ${AppActions.attrs('click', 'v2-lembrete-quando', ['amanha'])}>Amanhã às 9:00</button></div>`);
}

function quando(which) {
  const D = window.ReservationDates;
  const now = new Date();
  const at = which === '1h' ? new Date(now.getTime() + 3600000)
    : which === '18h' ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18)
    : new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9);
  document.getElementById('manual-notification-date').value = D.localIso(at);
  document.getElementById('manual-notification-time').value = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  document.querySelectorAll('.v2-quando button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.argsClick?.includes(which))));
}

// Campos com um só valor ficam em linha (etiqueta à esquerda, valor à
// direita); os outros são blocos. Os campos em grande ficam fora da lista.
const SOLTOS = ['despesa-amount', 'evento-title', 'manual-notification-title'];
const COM_LISTA = ['despesa-modal-bg', 'evento-modal-bg', 'voucher-modal-bg', 'manual-notification-modal-bg'];
function marcarCampos(modal) {
  modal.querySelectorAll('.form-grid > .form-group').forEach(group => {
    // Sem contar a pesquisa interna das listas de escolha (.app-select).
    const fields = [...group.querySelectorAll('input:not([type="hidden"]):not([type="file"]), select, textarea')].filter(field => !field.closest('.app-select-menu'));
    const linha = fields.length === 1 && !group.querySelector('textarea, small, .v2-pills') && !SOLTOS.includes(fields[0].id);
    group.classList.toggle('v2-linha', linha);
    group.classList.toggle('v2-bloco', !linha);
  });
}

const PREPARAR = {
  'despesa-modal-bg': prepararDespesa,
  'voucher-modal-bg': prepararVoucher,
  'manual-notification-modal-bg': prepararLembrete,
};

document.addEventListener('app:modal', event => {
  const modal = event.detail;
  if (!document.documentElement.dataset.look || !modal?.id) return;
  modal.querySelectorAll('select').forEach(select => { if (PILLS[select.id]) renderPills(select); });
  PREPARAR[modal.id]?.(modal);
  if (COM_LISTA.includes(modal.id)) marcarCampos(modal);
  if (window.lucide) lucide.createIcons();
});
// Valores mudados pelo próprio formulário (ex.: ao escolher um hóspede).
document.addEventListener('change', event => {
  if (PILLS[event.target?.id] && event.target.closest('.modal-bg')) renderPills(event.target);
});

AppActions.register({
  'v2-pilula': (el, event, args) => { choose(args[0], args[1]) },
  'v2-voucher-gerar': () => { gerarCodigo() },
  'v2-lembrete-quando': (el, event, args) => { quando(args[0]) },
}, 'click');
AppActions.register({
  'v2-despesa-talao': el => {
    if (!el.files?.[0]) return;
    AppUI.closeModal('despesa-modal-bg');
    AppModules.despesas.onReceiptSelected(el);
  },
}, 'change');

})();
