// Hóspede na V2 (maqueta inter-02): por cima do formulário, o resumo — quem
// é (iniciais, VIP, país, email, telefone, repetente), quatro números
// (estadias, total gasto, última visita e próxima estadia), as reservas e os
// dados pessoais. O formulário da V1 fica escondido até «Editar». Os dados
// são os que a ficha já carrega (/api/guests/:id); na V1 nada muda.
(() => {
AppModules.define('hospedes', {
  renderFichaV2: { get: () => renderFichaV2 },
});

const ATIVA = r => !['cancelada', 'rejeitada'].includes(r.status);

function kpi(icon, label, value, sub) {
  return `<div class="card kpi-card hf2-kpi"><div class="kpi-label">${AppModules.core.lcIcon(icon, 15)} ${label}</div><div class="kpi-value">${value}</div><div class="kpi-sub">${sub}</div></div>`;
}

function renderFichaV2(g) {
  const view = document.getElementById('view-hospede-detalhe');
  if (!view) return;
  let box = document.getElementById('hf2-ficha');
  if (!document.documentElement.dataset.look) { box?.remove(); view.classList.remove('hf2-on', 'hf2-a-editar'); return; }
  if (!box) { view.insertAdjacentHTML('afterbegin', '<div id="hf2-ficha" class="hf2"></div>'); box = document.getElementById('hf2-ficha'); }
  view.classList.add('hf2-on');
  view.classList.remove('hf2-a-editar');

  const core = AppModules.core;
  const esc = core.escapeHtml;
  const D = window.ReservationDates;
  const eur = ReservationMoney.format;
  const today = D.localIso(new Date());
  const reservas = (g.reservations || []).slice().sort((a, b) => String(b.check_in).localeCompare(String(a.check_in)));
  const ativas = reservas.filter(ATIVA);
  const noites = ativas.reduce((sum, r) => sum + (Number(r.nights) || D.countNights(r.check_in, r.check_out)), 0);
  const total = ativas.reduce((sum, r) => sum + Number(r.total_amount || 0), 0);
  const passadas = ativas.filter(r => r.check_in <= today);
  const ultima = passadas[0];
  const proxima = ativas.filter(r => r.check_in > today).at(-1);
  const dia = iso => D.formatDayLabel(iso);
  const email = core.realEmail(g.email);
  const nome = g.name || [g.first_name, g.last_name].filter(Boolean).join(' ') || 'Hóspede';
  const pessoais = [
    ['Documento', [g.document_type, g.document_number].filter(Boolean).join(' ')],
    ['Nascimento', g.birth_date ? D.formatPtDate(g.birth_date) : ''],
    ['País', g.country || g.nationality],
    ['Localidade', g.city],
    ['NIF', g.nif],
    ['Empresa', g.company],
  ].filter(([, v]) => v);

  box.innerHTML = `
    <div class="card hf2-head">
      <button type="button" class="btn btn-ghost btn-sm" data-on-click="index-close-guest-modal-6f28c13">${core.lcIcon('arrow-left', 15)} Voltar</button>
      <span class="v2-av hf2-av">${esc(core.initials(nome))}</span>
      <div class="hf2-who"><h2>${esc(nome)}${g.is_vip ? ' <span class="badge badge-warning">VIP</span>' : ''}</h2>
        <div class="hf2-meta">${[g.country || g.nationality, email, g.phone].filter(Boolean).map(v => `<span>${esc(v)}</span>`).join('')}
          ${ativas.length > 1 ? `<span class="badge badge-info">Repetente · ${ativas.length} estadias</span>` : ''}</div></div>
      <div class="hf2-actions">
        ${email ? `<a class="btn btn-ghost btn-sm" href="mailto:${esc(email)}">${core.lcIcon('mail', 15)} Email</a>` : ''}
        <button type="button" class="btn btn-ghost btn-sm" data-on-click="hospedes-v2-editar">${core.lcIcon('pencil', 15)} Editar</button>
        <button type="button" class="btn btn-primary btn-sm" data-on-click="index-nova-reserva-87b11c0">${core.lcIcon('plus', 15)} Nova reserva</button>
      </div>
    </div>
    <div class="hf2-kpis">
      ${kpi('bed-double', 'Estadias', ativas.length, `${noites} ${noites === 1 ? 'noite' : 'noites'} no total`)}
      ${kpi('wallet', 'Total gasto', eur(total), ativas.length ? `média ${eur(total / ativas.length)} / estadia` : 'ainda sem estadias')}
      ${kpi('calendar', 'Última visita', ultima ? esc(dia(ultima.check_in)) : '—', ultima ? esc(ultima.accommodation_name || '') : 'ainda não veio')}
      ${kpi('calendar-clock', 'Próxima estadia', proxima ? esc(dia(proxima.check_in)) : '—', proxima ? esc(proxima.accommodation_name || '') : 'nada marcado')}
    </div>
    <div class="hf2-grid">
      <div class="card hf2-card"><div class="hf2-card-h"><h3>Reservas</h3><span>${reservas.length}</span></div>
        ${reservas.length ? reservas.map(r => `<div class="hf2-res" role="button" tabindex="0" ${core.KEY_ACTIVATE} ${AppActions.attrs('click', 'detalhe-show-detail-3d67b14', [String(r.id)])}>
            <span class="hf2-ic">${core.lcIcon('calendar-check', 16)}</span>
            <span class="hf2-res-t"><b>${esc(dia(r.check_in))} → ${esc(dia(r.check_out))}</b><small>${esc([r.accommodation_name, r.id].filter(Boolean).join(' · '))}</small></span>
            ${core.badgeEstado(r.status)}<b class="hf2-res-v">${eur(r.total_amount || 0)}</b></div>`).join('')
          : '<p class="hf2-empty">Ainda sem reservas.</p>'}</div>
      <div class="card hf2-card"><div class="hf2-card-h"><h3>Dados pessoais</h3></div>
        ${pessoais.length ? pessoais.map(([k, v]) => `<div class="hf2-row"><span>${k}</span><b>${esc(v)}</b></div>`).join('') : '<p class="hf2-empty">Sem dados pessoais.</p>'}</div>
    </div>`;
  if (window.lucide) lucide.createIcons();
}

AppActions.register({
  'hospedes-v2-editar': () => {
    const view = document.getElementById('view-hospede-detalhe');
    view?.classList.add('hf2-a-editar');
    view?.querySelector('section.card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },
}, 'click');

})();
