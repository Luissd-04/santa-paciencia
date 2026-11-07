// Mensagens na V2: o painel da reserva ao lado da conversa, como na maqueta
// (referência, alojamento, estadia, estado, total, o que falta e «Abrir
// reserva»). Só nas conversas de uma reserva; na V1 não aparece.
(() => {
AppModules.define('invoice', {
  threadContextV2: { get: () => threadContextV2 },
});

function threadContextV2(thread) {
  if (!document.documentElement?.dataset?.look || thread._standalone) return '';
  const I = AppModules.invoice;
  const esc = I.esc;
  const total = Number(thread.total || 0);
  const missing = Math.max(0, total - Number(thread.paid || 0));
  const row = (label, value, cls = '') => `<div class="iv2-kv"><span>${label}</span><b class="${cls}">${value}</b></div>`;
  return `<aside class="iv2-ctx" aria-label="Reserva desta conversa">
      <h3>Reserva</h3>
      ${row('Referência', esc(thread.id))}
      ${thread.alojamento ? row('Alojamento', esc(thread.alojamento)) : ''}
      ${thread.checkin ? row('Estadia', `${I.fmtDate(thread.checkin)} → ${I.fmtDate(thread.checkout)}`) : ''}
      ${thread.status ? row('Estado', esc(I.labelStatus(thread.status))) : ''}
      ${row('Total', I.formatMoney(total))}
      ${row('Em falta', I.formatMoney(missing), missing > 0.01 ? 'iv2-owed' : '')}
      <button type="button" class="btn btn-ghost btn-sm" ${AppActions.attrs('click', 'mensagens-v2-abrir-reserva', [String(thread.id)])}>${AppModules.core.lcIcon('external-link', 14)} Abrir reserva</button>
    </aside>`;
}

AppActions.register({
  'mensagens-v2-abrir-reserva': (el, event, args) => { AppModules.core.abrirReserva(args[0]) },
}, 'click');

})();
