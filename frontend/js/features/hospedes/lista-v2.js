// Hóspedes na V2: a página da maqueta. Quatro números (hóspedes, repetentes,
// países e VIP), filtros rápidos (Todos, Repetentes, VIP, Estrangeiros) e a
// lista com iniciais, etiqueta, email, país, telefone, estadias, última
// visita e total gasto (cartões no telemóvel). Os dados, a pesquisa, a ordem e
// a paginação são os da V1 (hospedes.js, lista.js); o segmento vai ao servidor.
// As fichas da mesma pessoa (mesmo email ou telefone e nome) ficam numa linha,
// com as estadias e o total somados; «N fichas» abre a lista delas.
(() => {
AppModules.define('hospedes', {
  hospedesSegment: { get: () => () => (isV2() ? segment : '') },
  hospedesGrouped: { get: () => isV2 },
  renderHospedesV2: { get: () => renderHospedesV2 },
});

let segment = '';
const abertas = new Set();   // pessoas com as fichas à vista
const isV2 = () => Boolean(document.documentElement?.dataset?.look);
const SEGMENTS = [['', 'Todos'], ['repeat', 'Repetentes'], ['vip', 'VIP'], ['foreign', 'Estrangeiros']];
// [coluna da ordem, título]
const HEAD = [['name', 'Hóspede'], ['country', 'País'], ['phone', 'Telefone'], ['reservation_count', 'Estadias'], ['last_check_in', 'Última'], ['total_spent', 'Total gasto']];

function kpisHtml(summary, loading) {
  const core = AppModules.core;
  const n = key => (loading ? '…' : String(summary[key] || 0));
  const pct = (part, whole) => (whole ? Math.round(part / whole * 100) : 0);
  const top = summary.top_country;
  const kpi = (icon, label, value, sub) => `<div class="kpi-card hv2-kpi"><div class="kpi-label">${core.lcIcon(icon, 15)} ${label}</div><div class="kpi-value">${value}</div><div class="kpi-sub">${sub}</div></div>`;
  return [
    kpi('users', 'Hóspedes', n('total'), 'pessoas; fichas repetidas contam uma vez'),
    kpi('repeat', 'Repetentes', n('repeat'), `${pct(summary.repeat, summary.total)}% do total`),
    kpi('globe', 'Países', n('countries'), top ? `${core.escapeHtml(top.country)} ${top.share}%` : 'sem país indicado'),
    kpi('star', 'VIP', n('vip'), 'VIP e favoritos'),
  ].join('');
}

function chipsHtml(summary) {
  const counts = { repeat: summary.repeat, vip: summary.vip, foreign: summary.foreign_count };
  return SEGMENTS.map(([key, label]) => `<button type="button" class="rv2-chip${key === segment ? ' is-on' : ''}" aria-pressed="${key === segment}"
    ${AppActions.attrs('click', 'hospedes-v2-segmento', [key])}>${label}${key && counts[key] ? ` <em>${counts[key]}</em>` : ''}</button>`).join('');
}

function tagHtml(g) {
  if (Number(g.is_vip) || Number(g.is_favorite)) return '<span class="hv2-tag warn">VIP</span>';
  if (Number(g.reservation_count) > 1) return '<span class="hv2-tag info">Repetente</span>';
  return '';
}

function rowHtml(g) {
  const core = AppModules.core;
  const esc = core.escapeHtml;
  const H = AppModules.hospedes;
  const email = core.realEmail(g.email) || g.email_personal || '';
  const stays = Number(g.reservation_count) || 0;
  const fichas = Number(g.record_count) || 1;
  const aberta = abertas.has(g.group_id);
  return `<div class="hv2-row${aberta ? ' is-open' : ''}" role="button" tabindex="0" ${core.KEY_ACTIVATE} ${AppActions.attrs('click', 'lista-show-hospede-detail-4ac247d', [String(g.id)])}>
      <span class="hv2-who"><span class="v2-av">${esc(core.initials(g.name))}</span><span class="hv2-who-text"><b>${esc(g.name)} ${tagHtml(g)}${fichas > 1 ? ` <button type="button" class="hv2-fichas" aria-expanded="${aberta}" title="Fichas da mesma pessoa: mesmo email ou telefone" ${AppActions.attrs('click', 'hospedes-v2-fichas', [String(g.group_id)])}>${fichas} fichas ${core.lcIcon(aberta ? 'chevron-up' : 'chevron-down', 13)}</button>` : ''}</b><small>${esc(email || '—')}</small></span></span>
      <span class="hv2-country">${H.flagImg(g, 20)}<span>${esc(g.country_label || '—')}</span></span>
      <span class="hv2-muted">${esc(g.phone || '—')}</span>
      <span>${stays}</span>
      <span class="hv2-muted">${g.last_check_in ? H.formatShortDate(g.last_check_in) : '—'}</span>
      <span class="hv2-total">${ReservationMoney.format(g.total_spent || 0)}</span>
      <span class="hv2-sub">${H.flagImg(g, 16)} ${esc(g.country_label || 'Sem país')} · ${stays} estadia${stays === 1 ? '' : 's'}</span>
    </div>${aberta ? fichasHtml(g.records || []) : ''}`;
}

// As fichas de uma pessoa: tocar numa abre-a.
function fichasHtml(records) {
  const core = AppModules.core;
  const esc = core.escapeHtml;
  return `<div class="hv2-fichas-list">${records.map(r => {
    const n = Number(r.reservation_count) || 0;
    return `<div class="hv2-ficha" role="button" tabindex="0" ${core.KEY_ACTIVATE} ${AppActions.attrs('click', 'lista-show-hospede-detail-4ac247d', [String(r.id)])}>
      <b>${esc(r.name)}</b><span>${esc([core.realEmail(r.email), r.phone].filter(Boolean).join(' · ') || 'sem contacto')}</span>
      <span>${n} estadia${n === 1 ? '' : 's'} · ${ReservationMoney.format(r.total_spent || 0)}</span></div>`;
  }).join('')}</div>`;
}

function renderHospedesV2() {
  const box = document.getElementById('hospedes-v2');
  if (!box) return false;
  box.hidden = !isV2();
  if (!isV2()) return false;
  const state = AppModules.hospedes.hospedesPaged.state;
  const summary = state.summary || {};
  document.getElementById('hv2-kpis').innerHTML = kpisHtml(summary, state.loading);
  document.getElementById('hv2-chips').innerHTML = chipsHtml(summary);
  const list = document.getElementById('hv2-list');
  const sortCol = AppModules.hospedes.hospedesSortCol;
  const arrow = AppModules.hospedes.hospedesSortAsc ? '↑' : '↓';
  if (state.loading && !state.rows.length) list.innerHTML = '<div class="loading">A carregar hóspedes…</div>';
  else if (state.error) list.innerHTML = '<div class="empty-state">Não foi possível carregar os hóspedes. Tenta novamente.</div>';
  else if (!state.rows.length) list.innerHTML = AppModules.core.emptyStateHtml('👥', 'Sem hóspedes', segment ? 'Nenhum hóspede neste filtro.' : 'Ainda não existem hóspedes registados.');
  else {
    list.innerHTML = `<div class="hv2-head">${HEAD.map(([col, label]) => `<button type="button" ${AppActions.attrs('click', 'hospedes-v2-ordem', [col])}>${label}${col === sortCol ? ` ${arrow}` : ''}</button>`).join('')}</div>${state.rows.map(rowHtml).join('')}`;
  }
  if (window.lucide) lucide.createIcons();
  return true;
}

AppActions.register({
  'hospedes-v2-segmento': (el, event, args) => { segment = args[0]; AppModules.hospedes.renderHospedes() },
  'hospedes-v2-ordem': (el, event, args) => { AppModules.hospedes.sortHospedes(args[0]) },
  // Abrir as fichas não abre a ficha da linha.
  'hospedes-v2-fichas': (el, event, [id]) => { event.stopPropagation(); if (!abertas.delete(id)) abertas.add(id); renderHospedesV2(); },
}, 'click');

AppModules.onReset('features/hospedes/lista-v2.js', () => { segment = ''; abertas.clear(); });

})();
