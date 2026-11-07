// Vouchers na V2: a página da maqueta. Quatro números (ativos, utilizações,
// valor em circulação e expirados/esgotados), filtros por estado e um
// bilhete por voucher (código, descrição, valor, validade, estado,
// utilizações e «Copiar»). Tocar num bilhete abre a edição. Os dados e as
// ações são os de vouchers.js; na V1 continua a tabela.
(() => {
AppModules.define('vouchers', {
  renderVouchersV2: { get: () => renderVouchersV2 },
});

let filter = 'active';
let current = [];
const V = () => AppModules.vouchers;

function kpisHtml(list) {
  const core = AppModules.core;
  const status = v => V().voucherStatus(v);
  const active = list.filter(v => status(v) === 'active');
  const soon = active.filter(v => V().voucherExpiringSoon(v)).length;
  const uses = list.reduce((total, v) => total + Number(v.used_count || 0), 0);
  // Valor por usar: vouchers de valor fixo ativos × utilizações que faltam.
  const open = active.filter(v => v.type === 'discount_fixed')
    .reduce((total, v) => total + Number(v.value || 0) * Math.max(0, Number(v.max_uses || 1) - Number(v.used_count || 0)), 0);
  const gone = list.filter(v => ['used', 'expired'].includes(status(v))).length;
  const kpi = (icon, label, value, sub) => `<div class="card kpi-card vv2-kpi"><div class="kpi-label">${core.lcIcon(icon, 15)} ${label}</div><div class="kpi-value">${value}</div><div class="kpi-sub">${sub}</div></div>`;
  return `<div class="kpi-grid vv2-kpis">
    ${kpi('ticket', 'Ativos', active.length, soon ? `${soon} expira${soon === 1 ? '' : 'm'} em breve` : 'nenhum a expirar')}
    ${kpi('check-check', 'Utilizações', uses, 'em todas as reservas')}
    ${kpi('wallet', 'Em circulação', ReservationMoney.format(open), 'valor fixo por usar')}
    ${kpi('archive', 'Esgotados ou expirados', gone, `de ${list.length} no total`)}
  </div>`;
}

function chipsHtml(list) {
  const counts = {};
  for (const v of list) counts[V().voucherStatus(v)] = (counts[V().voucherStatus(v)] || 0) + 1;
  const labels = V().VOUCHER_STATUS_LABELS;
  const chips = [...Object.keys(labels).map(key => [key, labels[key].label, counts[key] || 0]), ['', 'Todos', list.length]];
  return `<div class="vv2-toolbar"><div class="vv2-chips" role="group" aria-label="Estado dos vouchers">${chips
    .filter(([key, , n]) => !key || n || key === filter)
    .map(([key, label, n]) => `<button type="button" class="rv2-chip${key === filter ? ' is-on' : ''}" aria-pressed="${key === filter}" ${AppActions.attrs('click', 'vouchers-v2-filtro', [key])}>${label}${key ? ` <em>${n}</em>` : ''}</button>`).join('')}</div>
    <button class="btn btn-primary btn-sm" data-on-click="index-open-voucher-modal-d7741bd">${AppModules.core.lcIcon('plus', 15)} Novo voucher</button></div>`;
}

function ticketHtml(v) {
  const core = AppModules.core;
  const esc = core.escapeHtml;
  const status = V().voucherStatus(v);
  const soon = V().voucherExpiringSoon(v);
  const type = V().VOUCHER_TYPE_LABELS[v.type] || { label: v.type, icon: 'ticket' };
  const tone = soon ? 'warn' : { active: 'ok', used: 'neutral', expired: 'warn', cancelled: 'bad' }[status] || 'neutral';
  const label = soon ? 'Expira em breve' : (V().VOUCHER_STATUS_LABELS[status]?.label || status);
  const until = v.valid_until ? `até ${window.ReservationDates.formatDayLabel(v.valid_until, { weekday: false })} ${v.valid_until.slice(0, 4)}` : 'sem fim';
  const used = Number(v.used_count || 0);
  const edit = status !== 'cancelled' ? AppActions.attrs('click', 'vouchers-open-voucher-modal-36eda97', [String(v.id)]) : '';
  return `<article class="card vv2-ticket${status === 'active' ? '' : ' is-off'}" ${edit}>
      <div class="vv2-top"><div><div class="vv2-code">${esc(v.code)}</div><span class="vv2-desc">${core.lcIcon(type.icon, 13)} ${esc(v.description || type.label)}</span></div>
        <div class="vv2-val">${esc(V().voucherValue(v))}</div></div>
      <div class="vv2-cut" aria-hidden="true"></div>
      <div class="vv2-ft"><span>${core.lcIcon('calendar', 14)} ${esc(until)}</span><span class="vv2-chip ${tone}">${esc(label)}</span></div>
      <div class="vv2-ft" data-on-click="index-stop-propagation-22499e1"><span>${used ? `Usado ${used} de ${Number(v.max_uses || 1)}` : 'Por usar'}</span>
        <span class="vv2-acts">${used ? `<button type="button" class="btn btn-ghost btn-sm" ${AppActions.attrs('click', 'vouchers-open-history', [String(v.id)])}>${core.lcIcon('external-link', 14)} Reservas</button>` : ''}
        <button type="button" class="btn btn-ghost btn-sm" ${AppActions.attrs('click', 'vouchers-copy-voucher-code-37fe980', [String(v.code)])}>${core.lcIcon('copy', 14)} Copiar</button></span></div>
    </article>`;
}

function renderVouchersV2(list) {
  if (!document.documentElement?.dataset?.look) return false;
  const wrap = document.getElementById('vouchers-list-wrap');
  if (!wrap) return true;
  current = list;
  const shown = filter ? list.filter(v => V().voucherStatus(v) === filter) : list;
  wrap.innerHTML = `${kpisHtml(list)}${chipsHtml(list)}${shown.length
    ? `<div class="vv2-tickets">${shown.map(ticketHtml).join('')}</div>`
    : AppModules.core.emptyStateHtml('🎟️', list.length ? 'Nenhum voucher neste estado' : 'Sem vouchers', list.length ? '' : 'Cria o primeiro voucher para oferecer descontos ou créditos de estadia aos teus hóspedes.')}`;
  if (window.lucide) lucide.createIcons();
  return true;
}

AppActions.register({
  'vouchers-v2-filtro': (el, event, args) => { filter = args[0]; renderVouchersV2(current) },
}, 'click');

})();
