// Nova reserva no computador, na V2: o resumo ao lado dos quatro passos
// (maquetas nr1–nr4). Lê o mesmo formulário e a última cotação do servidor
// (as linhas do total e o sinal); os botões avançam, recuam ou criam.
(() => {
AppModules.define('reservas', {
  renderDeskSummary: { get: () => renderDeskSummary },
});

// O botão diz para onde vai: «Continuar para o hóspede».
const NEXT = ['', 'o alojamento', 'o hóspede', 'o pagamento'];

function line(label, value, { soft = '', tone = '' } = {}) {
  const esc = AppModules.core.escapeHtml;
  return `<div class="resf-ds-line${tone ? ` is-${tone}` : ''}"><span>${esc(label)}${soft ? ` <small>${esc(soft)}</small>` : ''}</span><b>${esc(value)}</b></div>`;
}

function priceHtml(quote, nights) {
  const eur = ReservationMoney.format;
  const b = quote.breakdown || {};
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const total = Number(quote.total_amount) || 0;
  const deposit = Number(quote.deposit_amount) || 0;
  return `<div class="resf-ds-lines">
      ${line('Alojamento', eur(b.accommodation), { soft: nights ? plural(nights, 'noite', 'noites') : '' })}
      ${b.breakfast > 0 ? line('Pequeno-almoço', eur(b.breakfast)) : ''}
      ${b.extra_occupancy > 0 ? line('Ocupação extra', eur(b.extra_occupancy)) : ''}
      ${b.tourist_tax > 0 ? line('Taxa turística', eur(b.tourist_tax)) : ''}
      ${b.voucher > 0 ? line('Voucher', `−${eur(b.voucher)}`, { soft: quote.voucher?.code || '', tone: 'ok' }) : ''}
      ${b.adjustment ? line(b.adjustment < 0 ? 'Desconto' : 'Preço ajustado', `${b.adjustment < 0 ? '−' : '+'}${eur(Math.abs(b.adjustment))}`, { tone: b.adjustment < 0 ? 'ok' : '' }) : ''}
    </div>
    <div class="resf-ds-total"><span>Total</span><b>${eur(total)}</b></div>
    ${deposit > 0 && deposit < total ? `${line('Sinal', eur(deposit))}${line('Resto', eur(total - deposit))}` : ''}`;
}

function renderDeskSummary(step, names) {
  const box = document.getElementById('resf-dsummary');
  if (!box) return;
  const core = AppModules.core;
  const esc = core.escapeHtml;
  const D = window.ReservationDates;
  const value = id => (document.getElementById(id)?.value || '').trim();
  const ci = core.normalizeIsoDateValue(value('f-checkin'));
  const co = core.normalizeIsoDateValue(value('f-checkout'));
  const nights = ci && co && co > ci ? D.countNights(ci, co) : 0;
  const roomId = value('f-aloj');
  const room = core.accommodations.find(a => a.id === roomId);
  const adults = parseInt(value('f-num-adultos'), 10) || 0;
  const children = parseInt(value('f-num-criancas'), 10) || 0;
  const guest = value('f-nome-completo');
  const canal = document.getElementById('f-canal')?.selectedOptions[0]?.textContent || '';
  const busy = roomId && AppModules.reservas._unavailableSuites?.has(roomId);
  const quote = room && nights ? AppModules.reservas.wizQuote : null;
  // Sem cotação, o motivo que o servidor deu (ex.: hóspedes a mais para o quarto).
  const quoteLine = document.getElementById('resf-voucher-line');
  const issue = !quote && room && quoteLine && !quoteLine.hidden && quoteLine.dataset.tone === 'warn' ? quoteLine.textContent : '';
  const photo = room?.cover_image && core.safeMediaUrl(room.cover_image) ? core.mediaThumb(room.cover_image, 160) : '';
  const parent = room?.parent_id ? core.accommodations.find(a => a.id === room.parent_id) : null;
  const people = [`${adults} ${adults === 1 ? 'adulto' : 'adultos'}`, children ? `${children} ${children === 1 ? 'criança' : 'crianças'}` : ''].filter(Boolean).join(' · ');
  const keys = [
    ['Chegada', ci ? [D.formatDayLabel(ci), room?.checkin_time].filter(Boolean).join(' · ') : '—'],
    ['Saída', co ? [D.formatDayLabel(co), room?.checkout_time].filter(Boolean).join(' · ') : '—'],
    ['Noites', nights || '—'],
    ['Hóspedes', people],
    ['Canal', canal],
    guest ? ['Hóspede', guest] : null,
  ].filter(Boolean);
  const last = step === names.length;
  box.innerHTML = `<div class="card resf-ds-card">
      <div class="resf-ds-h"><h3>Resumo</h3>${room && nights ? `<span class="resf-ds-chip ${busy ? 'is-bad' : 'is-ok'}">${busy ? 'Ocupado' : 'Livre'}</span>` : ''}</div>
      ${room ? `<div class="resf-ds-room"><span class="resf-ds-ph" style="--acc:${esc(room.color || '#843424')}">${photo ? `<img src="${esc(photo)}" alt="" ${AppActions.attrs('error', 'reserva-foto-falhou')}>` : ''}</span>
          <span><b>${esc(AppModules.reservas.selectedRoomNames())}</b><small>${esc([parent?.name, room.city || parent?.city].filter(Boolean).join(' · '))}</small></span></div>` : ''}
      <div class="resf-ds-keys">${keys.map(([k, v]) => `<span>${esc(k)}</span><b>${esc(String(v))}</b>`).join('')}</div>
      ${quote ? priceHtml(quote, nights) : `<p class="resf-ds-empty${issue ? ' is-warn' : ''}">${esc(issue || (room ? 'A calcular o preço…' : 'O preço aparece quando escolheres o alojamento.'))}</p>`}
      <button type="button" class="btn btn-primary resf-ds-next" data-on-click="${last ? 'index-save-reserva-0326a52' : 'index-mobile-step-next'}">
        ${last ? `${core.lcIcon('check', 16)} Criar reserva` : `${esc(step === 1 && !room ? 'Escolher alojamento' : `Continuar para ${NEXT[step]}`)} ${core.lcIcon('arrow-right', 16)}`}</button>
      ${step > 1 ? '<button type="button" class="btn btn-ghost resf-ds-prev" data-on-click="index-mobile-step-prev">Voltar</button>' : ''}
      <p class="resf-ds-hint">O que preenches fica guardado como rascunho até criares a reserva.</p>
    </div>`;
  if (window.lucide) lucide.createIcons();
}

// Uma foto que já não existe sai (no resumo e nos cartões dos quartos).
AppActions.register({ 'reserva-foto-falhou': el => { el.remove() } }, 'error');

})();
