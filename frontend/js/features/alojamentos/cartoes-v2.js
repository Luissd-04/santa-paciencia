// Alojamentos na V2: os cartões da maqueta. Por cada alojamento principal, um
// cabeçalho (nome, cidade, número de unidades) e um cartão por unidade com a
// foto, o tipo, capacidade, área, quartos, preço por noite e a ocupação deste
// mês, mais «Calendário» e «Editar». A pesquisa, os filtros e a ordem são os
// da V1 (alojamentos.js); na V1 continua a tabela.
(() => {
AppModules.define('alojamentos', {
  isAlojamentosV2: { get: () => isAlojamentosV2 },
  renderAlojamentosV2: { get: () => renderAlojamentosV2 },
});

let occupancy = null;      // { [id]: taxa do mês }
let occupancyAt = 0;

function isAlojamentosV2() {
  return Boolean(document.documentElement?.dataset?.look);
}

// Ocupação deste mês por unidade (a mesma do painel); guardada um minuto.
async function loadOccupancy() {
  if (occupancy && Date.now() - occupancyAt < 60000) return occupancy;
  try {
    const payload = await AppModules.core.apiGet('/api/reservations/stats/dashboard');
    occupancy = Object.fromEntries((payload?.data?.availability || []).map(u => [u.id, u.occupancy_rate]));
    occupancyAt = Date.now();
  } catch {
    occupancy = occupancy || {};
  }
  return occupancy;
}

function photoHtml(a) {
  const core = AppModules.core;
  const src = a.cover_image && core.safeMediaUrl(a.cover_image)
    ? core.mediaThumb(a.cover_image.startsWith('http') ? a.cover_image : core.API_BASE + a.cover_image, 640) : '';
  const color = a.color || '#843424';
  return `<div class="av2-photo" style="--acc:${core.escapeHtml(color)}">${src ? `<img src="${core.escapeHtml(src)}" alt="" loading="lazy" decoding="async">` : core.lcIcon('home', 28)}
    <span class="av2-type">${core.escapeHtml(a.type === 'alojamento' ? 'Alojamento' : (a.type || 'Unidade'))}</span></div>`;
}

function cardHtml(a, rates) {
  const core = AppModules.core;
  const esc = core.escapeHtml;
  const rate = rates[a.id];
  const month = new Date().toLocaleDateString('pt-PT', { month: 'long' });
  const facts = [
    ['users', `${Number(a.max_guests) || 0} hóspedes`],
    a.area ? ['ruler', `${a.area} m²`] : null,
    ['bed-double', `${Number(a.num_rooms) || 1} quarto${Number(a.num_rooms) > 1 ? 's' : ''}`],
  ].filter(Boolean);
  return `<article class="card av2-card" ${AppActions.attrs('click', 'alojamentos-open-alojamento-8027257', [String(a.id)])}>
      ${photoHtml(a)}
      <div class="av2-body">
        <h3>${esc(a.name)}</h3>
        <div class="av2-facts">${facts.map(([icon, text]) => `<span>${core.lcIcon(icon, 14)}${esc(text)}</span>`).join('')}</div>
        <div class="av2-price"><span><b>${ReservationMoney.formatShort(a.price_per_night)}</b> / noite</span>${rate != null ? `<small>${rate}% em ${esc(month)}</small>` : ''}</div>
        ${rate != null ? `<div class="av2-bar"><i style="width:${Math.min(100, rate)}%"></i></div>` : ''}
        <div class="av2-actions" data-on-click="alojamentos-stop-propagation-22499e1">
          <button type="button" class="btn btn-ghost btn-sm" ${AppActions.attrs('click', 'alojamentos-open-aloj-calendar-direct-309a014', [String(a.id), String(a.google_calendar_id || ''), String(a.name)])}>${core.lcIcon('calendar-days', 14)} Calendário</button>
          <button type="button" class="btn btn-ghost btn-sm" ${AppActions.attrs('click', 'alojamentos-open-alojamento-8027257', [String(a.id)])}>${core.lcIcon('pencil', 14)} Editar</button>
        </div>
      </div>
    </article>`;
}

// `ordered` é a lista já filtrada e ordenada pela V1 (pais seguidos dos filhos).
async function renderAlojamentosV2(ordered) {
  const box = document.getElementById('aloj-v2');
  if (!box) return;
  const core = AppModules.core;
  const esc = core.escapeHtml;
  const rates = await loadOccupancy();
  // Um alojamento com unidades é um grupo; sem unidades (casa inteira) é ele
  // próprio um cartão, com as unidades soltas.
  const parents = ordered.filter(a => a.type === 'alojamento' && ordered.some(u => u.parent_id === a.id));
  const groups = parents.map(p => [p, ordered.filter(a => a.parent_id === p.id)]);
  const loose = ordered.filter(a => !parents.includes(a) && !parents.some(p => p.id === a.parent_id));
  if (loose.length) groups.push([null, loose]);
  box.innerHTML = groups.map(([parent, units]) => `<section class="av2-group">
      <div class="av2-group-h">
        ${parent ? `<div><b>${esc(parent.name)}</b><span>${[parent.city, `${units.length} ${units.length === 1 ? 'unidade' : 'unidades'}`].filter(Boolean).map(esc).join(' · ')}</span></div>
          <button type="button" class="btn btn-ghost btn-sm" ${AppActions.attrs('click', 'alojamentos-open-alojamento-8027257', [String(parent.id)])}>${core.lcIcon('pencil', 14)} Editar alojamento</button>`
        : (groups.length > 1 ? '<div><b>Outros alojamentos</b></div>' : '')}
      </div>
      <div class="av2-rooms">${units.map(a => cardHtml(a, rates)).join('')}</div>
    </section>`).join('') || '<div class="empty-state"><div class="es-icon">🏠</div><h3>Sem alojamentos</h3><p>Nenhum alojamento com estes filtros.</p></div>';
  box.insertAdjacentHTML('beforeend', `<div class="av2-add"><button type="button" class="btn btn-primary btn-sm" data-on-click="index-add-alojamento-ff5f8f7">${core.lcIcon('plus', 15)} Adicionar alojamento</button></div>`);
  if (window.lucide) lucide.createIcons();
}

AppModules.onReset('features/alojamentos/cartoes-v2.js', () => { occupancy = null; occupancyAt = 0; });

})();
