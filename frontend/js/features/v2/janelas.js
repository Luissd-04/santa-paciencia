// V2: as janelas pequenas e os avisos (maquetas 12 a 16).
// · confirmar(): pergunta dentro da app (em vez do aviso do sistema) com o
//   título, o texto e o botão do que vai acontecer (a vermelho ao apagar).
// · Janelas e formulários (.v2-janela): o aspeto novo também no computador,
//   com o ícone no título; Bloquear datas com os alojamentos em pílulas e
//   as noites bloqueadas; «A minha conta» junta perfil, palavra-passe e
//   sessões com separadores.
// · Avisos (toast): cartão com ícone em vez do emoji.
(() => {
AppModules.define('v2', {
  confirmar: { get: () => confirmar },
});
const core = () => AppModules.core;

// ── Confirmar ──
const DANGER = /\b(apagar|eliminar|remover|anonimizar|cancelar a reserva|substituir)\b/i;

// «Título? Resto do texto» → [título, texto]. O emoji de aviso sai (vai para o ícone).
function partes(message) {
  const text = String(message).replace(/^[⚠️❗]+\s*/u, '').trim();
  const cut = text.search(/[?]\s/);
  if (cut > 0 && cut < 140) return [text.slice(0, cut + 1), text.slice(cut + 1).trim()];
  const [first, ...rest] = text.split(/\n\n/);
  return [first, rest.join('\n\n')];
}

function confirmar(message, opts = {}) {
  const [title, text] = partes(message);
  const danger = opts.danger ?? DANGER.test(title);
  const verb = title.match(DANGER)?.[1];
  const label = opts.label || (danger && verb ? verb.charAt(0).toUpperCase() + verb.slice(1).split(' ')[0] : 'Confirmar');
  const esc = core().escapeHtml;
  return new Promise(resolve => {
    let answer = false;
    const overlay = AppUI.openDialog({
      title: esc(title),
      body: text ? `<p class="v2-confirmar-texto">${esc(text).replace(/\n/g, '<br>')}</p>` : '',
      footer: `<button type="button" class="btn btn-ghost" data-dialog-close>Cancelar</button>
        <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-v2-sim>${danger ? core().lcIcon('trash-2', 15) : ''} ${esc(label)}</button>`,
      className: 'v2-confirmar',
      onClose: () => resolve(answer),
    });
    overlay.dataset.v2Icone = danger ? 'trash-2|bad' : 'circle-help|info';
    overlay.querySelector('[data-v2-sim]').addEventListener('click', () => { answer = true; AppUI.closeDialog(overlay); });
    overlay.querySelector('[data-v2-sim]').focus();
    decorar(overlay);
  });
}

// ── Janelas e formulários ──
// [ícone, tom] no título de cada janela.
const ICONES = {
  'modal-bg': 'calendar-plus|info', 'receipt-modal-bg': 'scan-line|ok', 'despesa-modal-bg': 'receipt|warn', 'evento-modal-bg': 'list-checks|violet', 'voucher-modal-bg': 'ticket|bad',
  'manual-notification-modal-bg': 'alarm-clock|info', 'precos-period-modal-bg': 'tag|ok',
};
const CONTA = ['profile-modal', 'change-password-modal', 'sessions-modal'];
// Formulários grandes: só o aspeto (os campos ficam como estão).
const GRANDES = ['modal-bg', 'receipt-modal-bg'];
const JANELAS = [...Object.keys(ICONES), ...CONTA, ...GRANDES];

function decorar(modal) {
  modal.classList.add('v2-janela');
  const icone = modal.dataset.v2Icone || ICONES[modal.id] || (modal.querySelector('#blk-acc') ? 'ban|bad' : '');
  const header = modal.querySelector('.modal-header');
  if (icone && header && !header.querySelector('.v2-bigic')) {
    const [name, tone] = icone.split('|');
    header.insertAdjacentHTML('afterbegin', `<span class="v2-bigic is-${tone}" aria-hidden="true">${core().lcIcon(name, 22)}</span>`);
  }
  if (modal.querySelector('#blk-acc')) bloquear(modal);
  if (!GRANDES.includes(modal.id)) AppModules.v2.marcarCampos(modal);
  if (CONTA.includes(modal.id)) conta(modal);
  if (window.lucide) lucide.createIcons();
}

// Bloquear datas: as noites que ficam bloqueadas, enquanto se escolhe.
function bloquear(modal) {
  const body = modal.querySelector('.modal-body');
  if (!body.querySelector('.v2-noites')) {
    body.insertAdjacentHTML('beforeend', `<span class="chip neutral v2-noites">${core().lcIcon('moon', 14)}<b></b></span>`);
    body.addEventListener('change', () => noites(modal));
    body.addEventListener('input', () => noites(modal));
  }
  noites(modal);
}
function noites(modal) {
  const start = modal.querySelector('#blk-start')?.value;
  const end = modal.querySelector('#blk-end')?.value;
  const n = start && end && end >= start ? window.ReservationDates.countNights(start, end) + 1 : 0;
  modal.querySelector('.v2-noites').hidden = !n;
  modal.querySelector('.v2-noites b').textContent = `${n} ${n === 1 ? 'noite bloqueada' : 'noites bloqueadas'}`;
}

// A minha conta: perfil, palavra-passe e sessões com separadores.
const SEPARADORES = [['profile-modal', 'user-round', 'Perfil', 'openProfileModal'], ['change-password-modal', 'key-round', 'Palavra-passe', 'openChangePasswordModal'], ['sessions-modal', 'monitor-smartphone', 'Sessões ativas', 'openSessionsModal']];
function conta(modal) {
  const box = modal.querySelector('.modal');
  box.classList.add('v2-conta');
  box.querySelector('.v2-conta-tabs')?.remove();
  box.querySelector('.v2-conta-h')?.remove();
  const user = core().currentUser || {};
  const esc = core().escapeHtml;
  box.insertAdjacentHTML('afterbegin', `<div class="v2-conta-h"><span class="v2-av">${esc(core().initials(user.name || '?'))}</span>
      <div><b>A minha conta</b><small>${esc([user.name, user.organization_name].filter(Boolean).join(' · '))}</small></div></div>
    <nav class="v2-conta-tabs" aria-label="A minha conta">${SEPARADORES.map(([id, icon, label]) =>
      `<button type="button" aria-current="${id === modal.id ? 'page' : 'false'}" ${AppActions.attrs('click', 'v2-conta-separador', [id])}>${core().lcIcon(icon, 17)}<span>${label}</span></button>`).join('')}</nav>`);
}
function separador(id) {
  const [, , , open] = SEPARADORES.find(([key]) => key === id);
  const current = CONTA.find(key => document.getElementById(key)?.classList.contains('open'));
  if (current === id) return;
  if (current) AppUI.closeModal(current);
  core()[open]();
}

document.addEventListener('app:modal', event => {
  const modal = event.detail;
  if (!document.documentElement.dataset.look || !modal?.classList?.contains('modal-bg')) return;
  if (JANELAS.includes(modal.id) || modal.hasAttribute('data-dialog')) decorar(modal);
});

// ── Avisos ──
// [classe do aviso, ícone]; o emoji do início da mensagem sai.
const AVISOS = { success: 'check', error: 'circle-alert', warning: 'triangle-alert', info: 'info' };
new MutationObserver(records => {
  if (!document.documentElement.dataset.look) return;
  for (const record of records) for (const toast of record.addedNodes) {
    if (!toast.classList?.contains('toast') || toast.querySelector('.v2-aviso-ic')) continue;
    const type = Object.keys(AVISOS).find(key => toast.classList.contains(key)) || 'info';
    const msg = toast.querySelector('.toast-msg');
    if (!msg) continue;
    const text = msg.textContent.replace(/^[\p{Extended_Pictographic}️\s]+/u, '');
    msg.remove();
    toast.insertAdjacentHTML('afterbegin', `<span class="v2-aviso-ic is-${type}">${core().lcIcon(AVISOS[type], 16)}</span><span class="v2-aviso-t"></span>`);
    toast.querySelector('.v2-aviso-t').textContent = text;
    if (window.lucide) lucide.createIcons();
  }
}).observe(document.getElementById('toast-container') || document.body, { childList: true });

AppActions.register({
  'v2-conta-separador': (el, event, args) => { separador(args[0]) },
}, 'click');

})();
