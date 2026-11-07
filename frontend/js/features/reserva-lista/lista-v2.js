// Reservas na V2 (aspetos Clássico e Vidro): filtros rápidos por estado com
// contagens e a lista desenhada na maqueta (iniciais, alojamento com a cor
// dele, estadia, canal, estado, pagamento e total). No telemóvel a mesma
// lista passa a cartões. Os dados, a paginação e os filtros são os da V1
// (lista-dados.js); na V1 nada disto aparece.
(() => {
AppModules.define('reservas', {
  isReservasV2: { get: () => isReservasV2 },
  renderReservasV2: { get: () => renderReservasV2 },
});

// [estado, etiqueta]: '' é «Todas».
const QUICK_STATUS = [
  ['', 'Todas'],
  ['pendente', 'Por aprovar'],
  ['aguardar_pagamento', 'Aguarda sinal'],
  ['confirmada', 'Confirmadas'],
  ['check_in', 'Em estadia'],
];

function isReservasV2() {
  return Boolean(document.documentElement.dataset.look);
}

function renderStatusChips(byStatus = {}) {
  const box = document.getElementById('reservas-v2-chips');
  if (!box) return;
  const active = document.getElementById('filter-estado')?.value || '';
  box.innerHTML = QUICK_STATUS
    .filter(([status]) => !status || status === active || byStatus[status])
    .map(([status, label]) => `<button type="button" class="rv2-chip${status === active ? ' is-on' : ''}" aria-pressed="${status === active}"
      ${AppActions.attrs('click', 'reservas-v2-status', [status])}>${label}${status && byStatus[status] ? ` <em>${byStatus[status]}</em>` : ''}</button>`)
    .join('');
}

function setQuickStatus(status) {
  const select = document.getElementById('filter-estado');
  if (!select) return;
  select.value = select.value === status ? '' : status;
  AppModules.core.SS.set('res:fe', select.value);
  AppUI.refreshDropdowns(document.getElementById('view-reservas'));
  AppModules.reservas.clearResExactDateFilter();
  AppModules.reservas.renderTabela();
}

function stayHtml(r) {
  const day = value => window.ReservationDates.formatDayLabel(value);
  const nights = Number(r.nights) || 0;
  return `${day(r.check_in)} → ${day(r.check_out)}<small>${nights} noite${nights === 1 ? '' : 's'}</small>`;
}

function totalHtml(r) {
  const total = Number(r.total_amount || 0);
  const missing = total - Number(r.amount_paid || 0);
  return `${ReservationMoney.format(total)}${missing > 0.01 && Number(r.amount_paid) > 0 ? `<small class="rv2-owed">falta ${ReservationMoney.format(missing)}</small>` : ''}`;
}

function rowHtml(r) {
  const core = AppModules.core;
  const esc = core.escapeHtml;
  const open = AppActions.attrs('click', 'reservas-v2-open', [String(r.id)]);
  const who = `<span class="v2-av">${esc(core.initials(r.guest_name))}</span><span class="rv2-who-text"><b>${esc(r.guest_name || 'Reserva')}</b><small>${esc(r.id)}</small></span>`;
  const channel = esc(core.channelLabel(r.channel) || '—');
  return `<div class="rv2-row" role="button" tabindex="0" ${core.KEY_ACTIVATE} ${open}>
      <span class="rv2-who">${who}</span>
      <span class="rv2-room">${core.accomChip(r)}</span>
      <span class="rv2-stay">${stayHtml(r)}</span>
      <span class="rv2-chan">${channel}</span>
      <span class="rv2-state">${core.badgeEstado(r.status)}</span>
      <span class="rv2-pay">${core.badgePagamento(r.payment_status)}</span>
      <span class="rv2-total">${totalHtml(r)}</span>
      <span class="rv2-sub">${core.accomChip(r)}<span>· ${channel}</span></span>
    </div>`;
}

function renderReservasV2(state) {
  const list = document.getElementById('reservas-v2-list');
  if (!list) return;
  renderStatusChips(state.summary?.by_status);
  if (state.loading) { list.innerHTML = '<div class="loading">A carregar reservas…</div>'; return; }
  if (state.error) { list.innerHTML = '<div class="empty-state">Não foi possível carregar as reservas. Tenta novamente.</div>'; return; }
  list.innerHTML = state.rows.length
    ? `<div class="rv2-head" aria-hidden="true"><span>Hóspede</span><span>Alojamento</span><span>Estadia</span><span>Canal</span><span>Estado</span><span>Pagamento</span><span>Total</span></div>${state.rows.map(rowHtml).join('')}`
    : '<div class="empty-state"><div class="es-icon">📭</div><h3>Sem reservas</h3><p>Nenhuma reserva com estes filtros.</p></div>';
}

AppActions.register({
  'reservas-v2-status': (el, event, args) => { setQuickStatus(args[0]) },
  'reservas-v2-open': (el, event, args) => { AppModules.reservas.showDetail(args[0]) },
}, 'click');

})();
