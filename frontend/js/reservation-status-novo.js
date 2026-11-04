// Versão nova da página da reserva (?layout=novo; ver js/domain/public-layout.js).
// Só desenha a partir do que reservation-status.js já carregou: o pagamento,
// o cancelamento e o pré-check-in continuam a ser tratados por esse ficheiro.
(() => {
  if (!window.PublicLayout?.isNew) return;
  const $ = id => document.getElementById(id);
  const money = value => window.ReservationMoney.format(value);
  const day = (value, options) => window.ReservationDates.formatDayLabel(value, options);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const CONFIRMED = ['confirmada', 'check_in'];
  let calendarUrl = '';

  function safePath(path) {
    return typeof path === 'string' && /^\/pre-checkin\/[A-Za-z0-9_-]+$/.test(path) ? path : '';
  }

  // Lista de passos: feito, agora ou depois.
  function stepsFor(r) {
    const payment = r.online_payment || {};
    const plan = payment.policy;
    const paid = Number(r.amount_paid) || 0;
    const total = Number(r.total_amount) || 0;
    const missing = Math.max(0, total - paid);
    const precheckin = r.precheckin;
    const due = plan?.dueAt ? day(plan.dueAt.slice(0, 10)) : '';
    const steps = [];
    if (r.status === 'pendente') {
      steps.push({ state: 'done', title: 'Pedido enviado', text: 'Recebemos o seu pedido de reserva.' });
      steps.push({ state: 'now', title: 'Confirmação do alojamento', text: 'Respondemos o mais depressa possível, por email.' });
    }
    if (paid > 0) {
      steps.push({ state: 'done', title: missing > 0 ? 'Sinal pago' : 'Pagamento feito', text: `${money(paid)} recebidos` });
    } else if (payment.available) {
      steps.push({ state: 'now', title: `Sinal de ${money(payment.amount_due)}`, text: 'Agora, para confirmar a reserva' });
    }
    const path = safePath(precheckin?.path);
    steps.push({
      state: precheckin?.submitted ? 'done' : (path && CONFIRMED.includes(r.status) ? 'now' : 'later'),
      title: 'Pré-check-in',
      text: precheckin?.submitted ? 'Recebido. Pode corrigir até ao dia de chegada.' : '2 minutos: documentos e hora de chegada. Poupa tempo à chegada.',
      action: path ? { href: path, label: precheckin.submitted ? 'Rever o pré-check-in' : 'Fazer o pré-check-in' } : null,
    });
    if (missing > 0 && paid > 0) {
      steps.push({ state: 'later', title: `Restante de ${money(missing)}`, text: due ? `Até ${due}` : 'Antes da chegada' });
    }
    steps.push({ state: 'later', title: 'Informações de chegada', text: 'Código da porta e Wi-Fi, por email antes da chegada' });
    return steps;
  }

  function stepsHtml(steps) {
    return `<ol class="pn-timeline">${steps.map((s, i) => `<li class="${s.state}">
      <span class="pn-dot" aria-hidden="true">${s.state === 'done' ? '✓' : i + 1}</span>
      <div><strong>${esc(s.title)}</strong><span>${esc(s.text)}</span>
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

  function render(r) {
    const payment = r.online_payment || {};
    const plan = payment.policy;
    const total = Number(r.total_amount) || 0;
    const paid = Number(r.amount_paid) || 0;
    const confirmed = CONFIRMED.includes(r.status);
    document.body.dataset.reservationStatus = r.status;
    $('pn-rs-ref').textContent = `Reserva ${r.id}`;

    // Confirmada: foto e a data de chegada em grande.
    const hero = $('pn-rs-hero');
    hero.hidden = !confirmed;
    $('pn-rs-hero-title').textContent = r.status === 'check_in' ? 'Boa estadia!' : `Até ${day(r.check_in, { long: true })}`;
    const photo = $('rs-bg').style.backgroundImage;
    if (photo) hero.style.backgroundImage = photo;
    hero.classList.toggle('no-photo', !photo);

    // Por pagar: o valor e o botão no topo.
    const due = Number(payment.amount_due) || 0;
    const balance = plan?.balanceCents ? plan.balanceCents / 100 : 0;
    $('pn-rs-due').innerHTML = payment.available && due > 0 ? `
      <span class="pn-pill wait">${paid > 0 ? 'Falta o restante' : 'Falta o sinal'}</span>
      <h2>${paid > 0 ? 'Pague o restante da estadia' : 'Pague o sinal para garantir as datas'}</h2>
      <strong class="pn-due-amount">${money(due)}</strong>
      ${plan && paid === 0 && balance > 0 ? `<small>${plan.depositPercent}% de ${money(total)} · o restante (${money(balance)}) fica para ${esc(day(plan.dueAt.slice(0, 10)))}</small>` : ''}` : '';

    $('pn-rs-stay').innerHTML = `
      <div class="pn-trip">
        <div><small>Entrada</small><strong>${esc(day(r.check_in))}</strong></div>
        <span aria-hidden="true">→</span>
        <div><small>Saída</small><strong>${esc(day(r.check_out))}</strong></div>
      </div>
      <p class="pn-note">${esc(r.accommodation_name)} · ${r.num_guests} hóspede${Number(r.num_guests) === 1 ? '' : 's'}</p>
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
        <div><dt>Falta</dt><dd>${money(Math.max(0, total - paid))}</dd></div>
        <div><dt>Total</dt><dd>${money(total)}</dd></div>
      </dl>`;
  }

  window.ReservationStatusNovo = Object.freeze({ render });
})();
