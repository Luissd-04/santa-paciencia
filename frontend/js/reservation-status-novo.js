// Portal do hóspede: versão nova da página da reserva (?layout=novo; ver
// js/domain/public-layout.js). Um só sítio para acompanhar o pedido, pagar,
// fazer o pré-check-in e pedir ajuda ou cancelar.
// Só desenha a partir do que reservation-status.js já carregou: o pagamento e
// o cancelamento continuam a ser tratados por esse ficheiro.
(() => {
  if (!window.PublicLayout?.isNew) return;
  const $ = id => document.getElementById(id);
  const money = value => window.ReservationMoney.format(value);
  const day = (value, options) => window.ReservationDates.formatDayLabel(value, options);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const CONFIRMED = ['confirmada', 'check_in'];
  const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const PLATFORMS = { airbnb: 'Airbnb', booking: 'Booking.com', expedia: 'Expedia', vrbo: 'Vrbo' };
  const CHECK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Feito"><path d="M5 12l5 5L20 7"/></svg>';
  let calendarUrl = '';

  // Regresso do pré-check-in (?feito=dados|alteracoes): mostra a confirmação
  // aqui, uma vez, em vez de uma página à parte.
  const DONE = {
    dados: '<strong>Pré-check-in recebido.</strong> Pode corrigir os dados até ao dia de chegada.',
    alteracoes: '<strong>Alterações guardadas.</strong> O alojamento foi avisado.',
  };
  const params = new URLSearchParams(location.search);
  const done = DONE[params.get('feito')] || '';
  if (params.has('feito')) {
    params.delete('feito');
    const query = params.toString();
    history.replaceState(null, '', location.pathname + (query ? `?${query}` : '') + location.hash);
  }

  function safePath(path) {
    return typeof path === 'string' && /^\/pre-checkin\/[A-Za-z0-9_-]+$/.test(path) ? path : '';
  }

  // Vista de ajuda e cancelamento (#ajuda), na mesma página.
  function applyView() {
    const help = location.hash === '#ajuda';
    if (document.body.dataset.portalView === (help ? 'ajuda' : 'reserva')) return;
    document.body.dataset.portalView = help ? 'ajuda' : 'reserva';
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', applyView);
  applyView();

  // Lista de passos: feito, agora ou depois. Só o título, com uma linha de
  // apoio quando acrescenta informação (valor recebido, prazo).
  function stepsFor(r) {
    const payment = r.online_payment || {};
    const plan = payment.policy;
    const paid = Number(r.amount_paid) || 0;
    const total = Number(r.total_amount) || 0;
    const missing = Math.max(0, total - paid);
    const precheckin = r.precheckin;
    const due = plan?.dueAt ? day(plan.dueAt.slice(0, 10), { long: true }) : '';
    const steps = [];
    if (r.status === 'pendente') {
      steps.push({ state: 'done', title: 'Pedido enviado' });
      steps.push({ state: 'now', title: 'Confirmação do alojamento' });
    }
    if (paid > 0) {
      steps.push({ state: 'done', title: missing > 0 ? 'Sinal pago' : 'Pagamento feito', text: `${money(paid)} recebidos.` });
    } else if (payment.available) {
      steps.push({ state: r.status === 'pendente' ? 'later' : 'now', title: `Sinal de ${money(payment.amount_due)}` });
    }
    const path = safePath(precheckin?.path);
    const precheckinNow = !precheckin?.submitted && path && CONFIRMED.includes(r.status);
    steps.push({
      state: precheckin?.submitted ? 'done' : (precheckinNow ? 'now' : 'later'),
      title: 'Pré-check-in',
      text: precheckin?.submitted ? 'Recebido. Pode corrigir até ao dia de chegada.' : '',
      action: path ? { href: path, label: precheckin.submitted ? 'Rever o pré-check-in' : 'Fazer o pré-check-in' } : null,
    });
    if (missing > 0 && paid > 0) {
      steps.push({ state: 'later', title: `Restante de ${money(missing)}`, text: due ? `Até ${due}.` : '' });
    }
    const ready = CONFIRMED.includes(r.status) && precheckin?.submitted && missing <= 0;
    steps.push({ state: ready ? 'now' : 'later', title: 'Informações de chegada',
      text: ready ? 'Código da porta e Wi-Fi chegam por email antes da chegada.' : '' });
    return steps;
  }

  function stepsHtml(steps) {
    return `<ol class="pn-timeline">${steps.map((s, i) => `<li class="${s.state}">
      <span class="pn-dot">${s.state === 'done' ? CHECK : i + 1}</span>
      <div><strong>${esc(s.title)}</strong>${s.text ? `<span>${esc(s.text)}</span>` : ''}
      ${s.action ? `<a class="primary-btn pn-step-action" href="${esc(s.action.href)}">${esc(s.action.label)}</a>` : ''}</div>
    </li>`).join('')}</ol>`;
  }

  function calendarFile(r) {
    const d = value => value.replaceAll('-', '');
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Santa Paciencia//Reserva//PT', 'BEGIN:VEVENT',
      `UID:${r.id}@santa-paciencia`, `DTSTART;VALUE=DATE:${d(r.check_in)}`, `DTEND;VALUE=DATE:${d(r.check_out)}`,
      `SUMMARY:Estadia — ${String(r.accommodation_name || '').replace(/[,;\\\n]/g, ' ')}`, `DESCRIPTION:Reserva ${r.id}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    if (calendarUrl) URL.revokeObjectURL(calendarUrl);
    calendarUrl = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    return calendarUrl;
  }

  // Cabeçalho para os estados sem foto nem pagamento no topo.
  function headHtml(r, showsPayment) {
    if (CONFIRMED.includes(r.status) || showsPayment) return '';
    if (r.status === 'pendente') {
      return `<span class="pn-pill wait">A aguardar confirmação</span><h1>Recebemos o seu pedido</h1>
        <p>O alojamento responde por email o mais depressa possível. Guarde este link: é aqui que acompanha a reserva, do pagamento à chegada.</p>`;
    }
    if (r.status === 'cancelada') return '<span class="pn-pill off">Reserva cancelada</span><h1>Esta reserva foi cancelada</h1>';
    if (r.status === 'check_out') return '<span class="pn-pill ok">Estadia concluída</span><h1>Obrigado pela visita</h1>';
    return `<h1>${esc(window.ReservationStatus.guestLabel(r.status))}</h1>`;
  }

  // Dias entre hoje e o check-in, para assinalar a linha da tabela que vale hoje.
  function daysUntil(checkIn) {
    const [y, m, d] = String(checkIn).split('-').map(Number);
    const now = new Date();
    return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  }

  // Ajuda e cancelamento: contacto, condições (com a linha de hoje) e o valor
  // do reembolso. O botão e o pedido são os de reservation-status.js.
  function renderHelp(r) {
    const plan = r.online_payment?.policy;
    const platform = PLATFORMS[r.platform] || '';
    const email = /^[^\s@<>"']+@[^\s@<>"']+$/.test(r.contact?.email || '') ? r.contact.email : '';
    const text = platform
      ? `Esta reserva foi feita na ${platform}. Alterações, cancelamentos e pagamentos tratam-se lá, na sua conta. Para dúvidas sobre a estadia ou a chegada, fale connosco.`
      : r.status === 'cancelada' ? 'Para qualquer dúvida sobre esta reserva, fale connosco.'
      : plan?.canCancel ? 'Para alterar datas, hóspedes ou tirar dúvidas sobre a estadia.'
      : 'Esta reserva não pode ser cancelada online. Fale com o alojamento e tratamos do pedido consigo.';
    $('pn-rs-contact').innerHTML = `<h3>Fale com o alojamento</h3><p class="pn-note">${esc(text)}</p>
      ${email ? `<a class="${plan?.canCancel ? 'ghost-btn' : 'primary-btn'} pn-contact-btn" href="mailto:${esc(email)}?subject=${encodeURIComponent(`Reserva ${r.id}`)}">Enviar email</a>
      <small>${esc(email)}</small>` : '<small>Responda a um dos emails que recebeu sobre esta reserva.</small>'}`;

    if (!plan) return;
    if (plan.canCancel) {
      const days = plan.refundBasis === 'booking' ? plan.leadDays : daysUntil(r.check_in);
      const rules = plan.policy.refundRules;
      const index = rules.findIndex(rule => days >= rule.minDays && (rule.maxDays === null || days <= rule.maxDays));
      const row = $('rs-policy').querySelectorAll('tbody tr')[index];
      if (row) {
        row.classList.add('pn-today');
        row.cells[0].insertAdjacentHTML('beforeend', ' <span class="pn-pill wait">hoje</span>');
      }
      const paid = Number(r.amount_paid) || 0;
      $('rs-refund-quote').innerHTML = `<small>Se cancelar hoje, recebe</small><strong>${esc(money(plan.refundCents / 100))}</strong>
        <small>${paid > 0 ? `${plan.refundPercent}% dos ${esc(money(paid))} já pagos` : 'Ainda não há pagamentos nesta reserva'}</small>`;
    }
  }

  // As condições abrem na vista de ajuda: o consentimento aponta para lá.
  function linkConsent() {
    const label = $('rs-consent-label');
    if (label.dataset.novo) return;
    label.dataset.novo = '1';
    label.lastChild.remove();
    const link = document.createElement('a');
    link.href = '#ajuda';
    link.textContent = 'condições de pagamento e cancelamento';
    const text = document.createElement('span');
    text.append('Li e aceito as ', link, '.');
    label.append(text);
  }

  function render(r) {
    const payment = r.online_payment || {};
    const plan = payment.policy;
    const total = Number(r.total_amount) || 0;
    const paid = Number(r.amount_paid) || 0;
    const confirmed = CONFIRMED.includes(r.status);
    const missing = Math.max(0, total - paid);
    document.body.dataset.reservationStatus = r.status;
    $('pn-rs-ref').textContent = `Reserva ${r.id}`;
    linkConsent();

    // Confirmada: foto e a data de chegada em grande.
    const hero = $('pn-rs-hero');
    hero.hidden = !confirmed;
    const [y, m, d] = String(r.check_in).split('-').map(Number);
    const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
    $('pn-rs-hero-title').textContent = r.status === 'check_in' ? 'Boa estadia!' : `Até ${weekday}, ${day(r.check_in, { long: true })}`;
    $('pn-rs-hero-pill').textContent = r.status === 'confirmada' && r.precheckin?.submitted && missing <= 0 ? 'Tudo pronto' : 'Reserva confirmada';
    const photo = $('rs-bg').style.backgroundImage;
    if (photo) hero.style.backgroundImage = photo;
    hero.classList.toggle('no-photo', !photo);

    // Por pagar: o valor e o botão no topo.
    const due = Number(payment.amount_due) || 0;
    const balance = plan?.balanceCents ? plan.balanceCents / 100 : 0;
    const showsPayment = Boolean(payment.available && due > 0);
    $('pn-rs-due').innerHTML = showsPayment ? `
      <span class="pn-pill wait">${paid > 0 ? 'Falta o restante' : 'Falta o sinal'}</span>
      <h2>${paid > 0 ? 'Pague o restante da estadia' : 'Pague o sinal para garantir as datas'}</h2>
      <strong class="pn-due-amount">${money(due)}</strong>
      ${plan && paid === 0 && balance > 0 ? `<small>${plan.depositPercent}% de ${money(total)} · o restante (${money(balance)}) fica para ${esc(day(plan.dueAt.slice(0, 10), { long: true }))}</small>` : ''}` : '';
    $('pn-rs-head').innerHTML = headHtml(r, showsPayment);
    // O aviso genérico sobre a Stripe sai; ficam os avisos de estado do pagamento.
    const message = $('rs-payment-message');
    if (message.textContent.startsWith('Pague de forma segura')) message.textContent = '';

    const nights = window.ReservationDates.countNights(r.check_in, r.check_out);
    $('pn-rs-stay').innerHTML = `
      <div class="pn-trip">
        <div><small>Entrada</small><strong>${esc(day(r.check_in))}</strong></div>
        <span aria-hidden="true">→</span>
        <div><small>Saída</small><strong>${esc(day(r.check_out))}</strong></div>
      </div>
      <p class="pn-stay-line"><span>${r.num_guests} hóspede${Number(r.num_guests) === 1 ? '' : 's'} · ${nights} noite${nights === 1 ? '' : 's'}</span>${total > 0 ? `<strong>${money(total)}</strong>` : ''}</p>
      ${r.status !== 'cancelada' ? `<a class="ghost-btn pn-calendar" download="reserva-${esc(r.id)}.ics" href="${calendarFile(r)}">Adicionar ao calendário</a>` : ''}`;

    const steps = r.status === 'cancelada' || r.status === 'check_out' ? [] : stepsFor(r);
    $('pn-rs-steps').hidden = !steps.length;
    $('pn-rs-steps').innerHTML = steps.length ? `<h3>${confirmed ? 'Próximos passos' : 'O que falta'}</h3>${stepsHtml(steps)}` : '';

    const percent = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
    $('pn-rs-payments').hidden = total <= 0;
    $('pn-rs-payments').innerHTML = `<h3>Pagamentos</h3>
      <div class="pn-progress" role="img" aria-label="Pago ${percent}%"><i style="width:${percent}%"></i></div>
      <dl class="pn-lines">
        <div><dt>Pago</dt><dd><strong>${money(paid)}</strong></dd></div>
        <div><dt>Falta</dt><dd>${money(missing)}</dd></div>
        <div><dt>Total</dt><dd>${money(total)}</dd></div>
      </dl>`;

    $('pn-rs-help-link').firstChild.textContent = plan ? 'Condições, ajuda e cancelamento' : 'Ajuda e cancelamento';
    $('pn-rs-done').hidden = !done;
    $('pn-rs-done').innerHTML = done ? `<span class="pn-done-mark" aria-hidden="true">${CHECK}</span><span>${done}</span>` : '';
    renderHelp(r);
  }

  window.ReservationStatusNovo = Object.freeze({ render });
})();
