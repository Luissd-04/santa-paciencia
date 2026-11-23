// Portal do hóspede: topo, cartão «Próximo passo», passos, informações de
// chegada e coluna lateral. Desenha a partir do que reservation-status.js
// carregou; o pagamento online e o cancelamento continuam nesse ficheiro.
(() => {
  const $ = id => document.getElementById(id);
  const money = value => window.ReservationMoney.format(value);
  const day = (value, options) => window.ReservationDates.formatDayLabel(value, options);
  const addDays = (iso, n) => window.ReservationDates.addDays(iso, n);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const plural = (n, one, many) => `${n} ${Number(n) === 1 ? one : many}`;
  const DEFAULT_COLOR = '#843424';
  // «sáb, 21 nov, às 10:30» (hora de Lisboa).
  const deadline = iso => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const opts = { timeZone: 'Europe/Lisbon' };
    return `${day(date.toLocaleDateString('en-CA', opts))}, às ${date.toLocaleTimeString('pt-PT', { ...opts, hour: '2-digit', minute: '2-digit' })}`;
  };
  let calendarUrl = '';

  const safePath = path => (typeof path === 'string' && /^\/pre-checkin\/[A-Za-z0-9_-]+$/.test(path) ? path : '');
  function safeUrl(value) {
    if (!String(value || '').trim()) return '';
    try {
      const url = new URL(String(value || ''), location.origin);
      return url.protocol === 'https:' || (url.protocol === 'http:' && url.origin === location.origin) ? url.href : '';
    } catch { return ''; }
  }

  // Cor de destaque: a do alojamento, se o texto branco tiver contraste de
  // pelo menos 4,5:1 sobre ela; senão o terracota por omissão.
  function contrastWithWhite(hex) {
    const rgb = hex.slice(1).match(/../g).map(h => parseInt(h, 16) / 255)
      .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    const lum = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    return 1.05 / (lum + 0.05);
  }
  function accent(color) {
    return /^#[0-9a-f]{6}$/i.test(color || '') && contrastWithWhite(color) >= 4.5 ? color : DEFAULT_COLOR;
  }

  // Fase da reserva, pela ordem do percurso.
  function phaseOf(r) {
    const p = r.portal || {};
    const today = p.today || new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Lisbon' });
    const missing = Math.max(0, (Number(r.total_amount) || 0) - (Number(r.amount_paid) || 0));
    if (r.status === 'cancelada') return 'cancelada';
    if (['pendente', 'pre_reserva'].includes(r.status)) return 'pedido';
    if (r.status === 'check_out' || (r.check_out && today > r.check_out)) return 'depois';
    if (r.status === 'aguardar_pagamento') return 'sinal';
    if (r.status === 'check_in' || (r.check_in && today >= r.check_in)) return 'estadia';
    if (r.precheckin && !r.precheckin.submitted && safePath(r.precheckin.path)) return 'pre_checkin';
    if (missing > 0.004) return 'restante';
    return 'chegada';
  }

  // «hoje», «amanhã» ou «qua, 25 nov».
  function relativeDay(iso, today) {
    if (iso === today) return 'hoje';
    if (today && iso === addDays(today, 1)) return 'amanhã';
    return day(iso);
  }

  function stepsFor(r, phase, brand) {
    const payment = r.online_payment || {};
    const plan = payment.policy;
    const paid = Number(r.amount_paid) || 0;
    const missing = Math.max(0, (Number(r.total_amount) || 0) - paid);
    const precheckin = r.precheckin;
    const due = plan?.dueAt ? day(plan.dueAt.slice(0, 10)) : '';
    const steps = [];
    if (phase === 'pedido') {
      steps.push({ state: 'done', title: 'Pedido enviado', text: 'Recebemos o seu pedido de reserva.' });
      steps.push({ state: 'now', title: 'Aceitação do alojamento', text: 'Confirmamos a disponibilidade e respondemos por email.' });
      steps.push({ state: 'later', title: 'Sinal', text: 'Depois de aceite, tem 48 horas para o pagar online.' });
    } else {
      steps.push({ state: 'done', title: 'Pedido aceite', text: `${brand || 'O alojamento'} confirmou a disponibilidade.` });
    }
    if (paid > 0) {
      steps.push({ state: 'done', title: missing > 0 ? 'Sinal pago' : 'Pagamento feito', text: `${money(paid)} recebidos.` });
    } else if (phase === 'sinal') {
      const amount = Number(payment.amount_due) || 0;
      steps.push({ state: 'now', title: amount > 0 ? `Sinal de ${money(amount)}` : 'Sinal', text: r.deposit_deadline ? `Até ${deadline(r.deposit_deadline)}, para confirmar a reserva.` : 'Para confirmar a reserva.' });
    }
    const path = safePath(precheckin?.path);
    steps.push({
      state: precheckin?.submitted ? 'done' : (phase === 'pre_checkin' ? 'now' : 'later'),
      title: 'Pré-check-in',
      text: precheckin?.submitted ? 'Recebido. Pode corrigir até ao dia de chegada.' : 'Documentos e hora de chegada. Poupa tempo à chegada.',
      action: path ? { href: path, label: precheckin.submitted ? 'Rever o pré-check-in' : 'Fazer o pré-check-in' } : null,
    });
    if (missing > 0 && paid > 0) {
      steps.push({ state: phase === 'restante' ? 'now' : 'later', title: `Restante de ${money(missing)}`, text: due ? `Até ${due}.` : 'Antes da chegada.' });
    }
    steps.push({ state: 'later', title: 'Tudo para a sua chegada', text: 'Como chegar, como entrar e Wi-Fi — aparecem aqui antes da chegada.' });
    return steps;
  }

  function stepsHtml(steps) {
    const labels = { done: 'Feito', now: 'Agora', later: '' };
    return `<ol class="gp-steps">${steps.map((s, i) => `<li class="${s.state}"${s.state === 'now' ? ' aria-current="step"' : ''}>
      <span class="gp-dot" aria-hidden="true">${s.state === 'done' ? '✓' : i + 1}</span>
      <div><strong>${esc(s.title)}</strong><span>${esc(s.text)}${s.action ? ` <a class="pn-step-action" href="${esc(s.action.href)}">${esc(s.action.label)}</a>` : ''}</span></div>
      <span class="gp-step-state">${labels[s.state] ? `<span class="gp-sr">Estado: </span>${labels[s.state]}` : ''}</span>
    </li>`).join('')}</ol>`;
  }

  function calendarFile(r, brand) {
    const d = value => value.replaceAll('-', '');
    const clean = value => String(value || '').replace(/[,;\\\n]/g, ' ');
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Reservas//Reserva//PT', 'BEGIN:VEVENT',
      `UID:${r.id}@reservas`, `DTSTART;VALUE=DATE:${d(r.check_in)}`, `DTEND;VALUE=DATE:${d(r.check_out)}`,
      `SUMMARY:Estadia — ${clean(r.accommodation_name)}${brand && brand !== r.accommodation_name ? ` (${clean(brand)})` : ''}`,
      `DESCRIPTION:Reserva ${r.id}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    if (calendarUrl) URL.revokeObjectURL(calendarUrl);
    calendarUrl = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    return calendarUrl;
  }

  function renderHero(r, p, phase, image, brand) {
    const hero = $('pn-rs-hero');
    const img = $('gp-hero-img');
    if (image) {
      if (img.getAttribute('src') !== image.src) {
        img.src = image.src;
        if (image.srcset) img.srcset = image.srcset; else img.removeAttribute('srcset');
        img.sizes = '100vw';
      }
      img.style.objectPosition = image.position || '';
      img.hidden = false;
      img.onerror = () => { img.hidden = true; hero.classList.remove('has-photo'); };
    } else img.hidden = true;
    hero.classList.toggle('has-photo', Boolean(image));

    // Logótipo do alojamento (herdado do principal); sem ele, o nome da marca.
    const logo = safeUrl(p.logo_url);
    const logoImg = $('gp-logo-img');
    $('pn-brand').textContent = brand;
    if (logo) { logoImg.src = logo; logoImg.alt = brand; logoImg.hidden = false; }
    logoImg.onerror = () => { logoImg.hidden = true; $('gp-logo').classList.remove('has-logo'); };
    $('gp-logo').classList.toggle('has-logo', Boolean(logo));
    // Sem logótipo e com a marca igual à unidade, o nome aparece só no título.
    $('gp-logo').hidden = !brand || (!logo && brand === r.accommodation_name);

    $('pn-rs-ref').textContent = `Reserva ${r.id}`;
    $('pn-rs-ref').hidden = false;
    const name = p.guest_first_name;
    const eve = p.today && r.check_in === addDays(p.today, 1) && !['cancelada', 'pedido'].includes(phase);
    $('gp-hello').textContent = name ? `Olá, ${name}${eve ? ' — até amanhã!' : ''}` : (eve ? 'Até amanhã!' : '');
    $('gp-hello').hidden = !$('gp-hello').textContent;
    $('rs-accommodation').textContent = r.accommodation_name || 'A sua reserva';
    const nights = Number(p.nights) || window.ReservationDates.countNights(r.check_in, r.check_out);
    $('gp-hero-dates').textContent = [`${day(r.check_in)} → ${day(r.check_out)}`, nights ? plural(nights, 'noite', 'noites') : '',
      plural(r.num_guests, 'hóspede', 'hóspedes')].filter(Boolean).join(' · ');
  }

  function tile(label, value, note = '', cls = '') {
    return `<div class="gp-tile"><small>${esc(label)}</small><b class="${cls}">${esc(value)}</b>${note ? `<span>${note}</span>` : ''}</div>`;
  }

  // Cartão «Próximo passo»: etiqueta única, título, conteúdo e ação principal.
  function nextCard(r, p, phase, brand) {
    const payment = r.online_payment || {};
    const plan = payment.policy;
    const paid = Number(r.amount_paid) || 0;
    const total = Number(r.total_amount) || 0;
    const missing = Math.max(0, total - paid);
    const access = p.access || null;
    const precheckinPath = safePath(r.precheckin?.path);
    const booking = safeUrl(p.booking_url);
    const review = safeUrl(p.review_url);
    const checkinAt = p.checkin_time ? `a partir das ${esc(p.checkin_time)}` : '';
    const checkoutAt = p.checkout_time ? `até às ${esc(p.checkout_time)}` : '';
    const codeTile = access?.door_code
      ? tile('Código da porta', access.door_code, p.checkin_time && phase !== 'estadia' ? `Válido a partir das ${esc(p.checkin_time)} do dia da entrada` : '', 'gp-code') : '';
    const pendingTile = p.access_opens_on
      ? tile('Código da porta e Wi-Fi', `a partir de ${day(p.access_opens_on)}`, missing > 0 ? 'Com a reserva paga na totalidade.' : 'Aparecem aqui, na véspera da chegada.') : '';
    const arrivalNote = p.arrival_time
      ? `Chegada indicada: ${esc(p.arrival_time)}${precheckinPath ? ` · <a href="${esc(precheckinPath)}">alterar</a>` : ''}` : '';
    const card = { tone: 'ok', pill: 'Reserva confirmada', title: '', body: '', actions: [] };

    switch (phase) {
      case 'pedido':
        Object.assign(card, { tone: 'wait', pill: 'A aguardar aceitação', title: 'Recebemos o seu pedido',
          body: `<p class="gp-text">${esc(brand || 'O alojamento')} confirma a disponibilidade e responde por email. Hoje não paga nada: depois de aceite, tem 48 horas para pagar o sinal.</p>` });
        break;
      case 'sinal':
        Object.assign(card, { tone: 'wait', pill: 'Próximo passo · Falta o sinal', title: 'Pague o sinal para garantir as datas',
          body: payment.available ? '' : `<p class="gp-text">O alojamento vai indicar-lhe como pagar o sinal${r.deposit_deadline ? ` até ${esc(deadline(r.deposit_deadline))}. Depois desse prazo, as datas voltam a ficar livres` : ''}. Se tiver dúvidas, fale connosco.</p>` });
        break;
      case 'pre_checkin':
        Object.assign(card, { pill: missing > 0 ? 'Reserva confirmada' : 'Reserva confirmada e paga', title: 'Faça o pré-check-in',
          body: `<p class="gp-text">Hora de chegada e documento de cada hóspede (a lei obriga ao registo). Leva poucos minutos e poupa tempo à chegada.</p>`,
          actions: [`<a class="gp-btn" href="${esc(precheckinPath)}">Fazer o pré-check-in</a>`] });
        break;
      case 'restante': {
        const due = plan?.dueAt ? day(plan.dueAt.slice(0, 10)) : '';
        Object.assign(card, { tone: 'wait', pill: paid > 0 ? 'Próximo passo · Falta o restante' : 'Próximo passo · Pagamento',
          title: paid > 0 ? 'Pague o restante da estadia' : 'Pague a estadia',
          body: payment.available ? '' : `<div class="gp-due"><div class="gp-due-line"><span class="gp-due-amount">${money(missing)}</span>${due ? `<span class="gp-due-when">até ${esc(due)}</span>` : ''}</div>
            <p>${plan?.automatic ? 'Será cobrado automaticamente no cartão autorizado.' : 'Antes da data, recebe por email o link para pagar.'}</p></div>` });
        break;
      }
      case 'chegada':
        Object.assign(card, { pill: 'Reserva confirmada e paga', title: 'Tudo para a sua chegada',
          body: `<div class="gp-tiles">${tile('Check-in', `${relativeDay(r.check_in, p.today)}${checkinAt ? `, ${checkinAt}` : ''}`, arrivalNote)}${codeTile || pendingTile}</div>` });
        break;
      case 'estadia':
        Object.assign(card, { pill: 'Estadia em curso', title: p.guest_first_name ? `Boa estadia, ${p.guest_first_name}!` : 'Boa estadia!',
          body: `<div class="gp-tiles">${codeTile}${tile('Saída', `${relativeDay(r.check_out, p.today)}${checkoutAt ? `, ${checkoutAt}` : ''}`)}</div>` });
        break;
      case 'depois':
        Object.assign(card, { tone: 'off', pill: 'Estadia concluída', title: p.guest_first_name ? `Obrigado pela visita, ${p.guest_first_name}` : 'Obrigado pela visita',
          body: `<p class="gp-text">Esperamos que tenha gostado${brand ? ` de ${esc(brand)}` : ''}. ${review ? 'A sua avaliação ajuda outros hóspedes e ajuda-nos a melhorar.' : 'Será um prazer recebê-lo de novo.'}</p>`,
          actions: [
            review ? `<a class="gp-btn" href="${esc(review)}" target="_blank" rel="noopener noreferrer">Deixar uma avaliação</a>` : '',
            booking ? `<a class="${review ? 'gp-btn-ghost' : 'gp-btn'}" href="${esc(booking)}">Voltar a reservar</a>` : '',
          ].filter(Boolean) });
        break;
      case 'cancelada': {
        const c = plan?.cancellation;
        Object.assign(card, { tone: 'off', pill: 'Reserva cancelada', title: 'Esta reserva foi cancelada',
          body: `<p class="gp-text">${c ? `Reembolso previsto: <strong>${money(c.amount)}</strong>. ${c.state === 'complete' ? 'Processamento concluído.' : c.state === 'manual_review' ? 'O alojamento está a verificar o reembolso.' : 'Reembolso em processamento.'}`
            : 'As datas ficaram livres. Se tiver alguma dúvida, fale connosco.'}</p>`,
          actions: booking ? [`<a class="gp-btn" href="${esc(booking)}">Fazer um novo pedido</a>`] : [] });
        break;
      }
      default: break;
    }
    const pill = $('rs-status');
    pill.textContent = card.pill;
    pill.dataset.tone = card.tone;
    $('gp-next-title').textContent = card.title;
    $('gp-next-body').innerHTML = card.body;
    $('gp-next-action').innerHTML = card.actions.join('');
  }

  // Valor por pagar, dentro do painel do pagamento online.
  function dueHtml(r, phase) {
    const payment = r.online_payment || {};
    const plan = payment.policy;
    const paid = Number(r.amount_paid) || 0;
    const total = Number(r.total_amount) || 0;
    const due = Number(payment.amount_due) || 0;
    if (!payment.available || due <= 0) return '';
    const balance = plan?.balanceCents ? plan.balanceCents / 100 : 0;
    const when = paid === 0 && r.deposit_deadline ? `até ${esc(deadline(r.deposit_deadline))}`
      : plan?.dueAt && paid > 0 ? `até ${esc(day(plan.dueAt.slice(0, 10)))}` : '';
    const secondary = !['sinal', 'restante'].includes(phase);
    return `${secondary ? `<h3>${paid > 0 ? 'Falta o restante' : 'Falta o sinal'}</h3>` : ''}
      <div class="gp-due-line"><span class="gp-due-amount">${money(due)}</span>${when ? `<span class="gp-due-when">${when}</span>` : ''}</div>
      ${paid === 0 && r.deposit_deadline ? '<p>Depois desse prazo, as datas voltam a ficar livres.</p>' : ''}
      ${plan && paid === 0 && balance > 0 ? `<p class="gp-note">Sinal de ${plan.depositPercent}% de ${money(total)} · o restante (${money(balance)}) fica para ${esc(day(plan.dueAt.slice(0, 10)))}.</p>` : ''}`;
  }

  // Como chegar, como entrar e o dia da saída (reserva confirmada).
  function concierge(r, p, phase) {
    if (!['pre_checkin', 'restante', 'chegada', 'estadia'].includes(phase)) return '';
    const sections = [];
    const a = p.arrival || {};
    const maps = safeUrl(a.maps_url);
    if (phase !== 'estadia' && (a.address || a.instructions)) {
      sections.push(`<section class="gp-card gp-section" aria-labelledby="gp-arrive-title"><h3 id="gp-arrive-title">Como chegar</h3>
        ${a.address ? `<div class="gp-address"><span>${esc(a.address)}</span>${maps ? `<a class="gp-btn-ghost gp-btn-small" href="${esc(maps)}" target="_blank" rel="noopener noreferrer">Abrir no Google Maps <span aria-hidden="true">↗</span></a>` : ''}</div>` : ''}
        ${a.instructions ? `<p class="gp-text">${esc(a.instructions)}</p>` : ''}</section>`);
    }
    if (p.access?.entry_instructions) {
      sections.push(`<section class="gp-card gp-section" aria-labelledby="gp-enter-title"><h3 id="gp-enter-title">Como entrar</h3>
        <p class="gp-text">${esc(p.access.entry_instructions)}</p></section>`);
    } else if (p.access_opens_on && phase !== 'chegada') {
      sections.push(`<section class="gp-card gp-section" aria-labelledby="gp-enter-title"><h3 id="gp-enter-title">Como entrar</h3>
        <p class="gp-text">As instruções de entrada, o código da porta e o Wi-Fi aparecem aqui a partir de ${esc(day(p.access_opens_on))}${Number(r.amount_paid) < Number(r.total_amount) ? ', com a reserva paga na totalidade' : ''}.</p></section>`);
    }
    const steps = p.checkout_steps || [];
    if (steps.length || p.checkout_time) {
      sections.push(`<section class="gp-card gp-section" aria-labelledby="gp-leave-title"><h3 id="gp-leave-title">No dia da saída</h3>
        <span class="gp-text">${esc(day(r.check_out))}${p.checkout_time ? `, até às ${esc(p.checkout_time)}` : ''}</span>
        ${steps.length ? `<ol class="gp-checklist">${steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}</section>`);
    }
    return sections.join('');
  }

  function sidebar(r, p, phase, brand) {
    const paid = Number(r.amount_paid) || 0;
    const total = Number(r.total_amount) || 0;
    const missing = Math.max(0, total - paid);

    // Wi-Fi: só chega do servidor dentro da janela (véspera → saída, paga).
    const wifi = p.access && !p.no_wifi && (p.access.wifi_name || p.access.wifi_password) ? p.access : null;
    $('gp-wifi').hidden = !wifi;
    $('gp-wifi').innerHTML = wifi ? `<h3 id="gp-wifi-title">Wi-Fi</h3><dl class="gp-lines">
      ${wifi.wifi_name ? `<div class="gp-wifi-row"><dt>Rede</dt><dd>${esc(wifi.wifi_name)}</dd></div>` : ''}
      ${wifi.wifi_password ? `<div class="gp-wifi-row"><dt>Palavra-passe</dt><dd><span id="gp-wifi-pass">${esc(wifi.wifi_password)}</span>
        <button type="button" class="gp-copy" id="gp-wifi-copy" aria-label="Copiar a palavra-passe do Wi-Fi">Copiar</button></dd></div>` : ''}
      </dl>` : '';

    // Pré-check-in na lateral quando os passos não aparecem.
    const path = safePath(r.precheckin?.path);
    const showPc = path && ['chegada', 'estadia'].includes(phase);
    $('gp-precheckin').hidden = !showPc;
    $('gp-precheckin').innerHTML = showPc ? `<div class="gp-head"><h3 id="gp-precheckin-title">Pré-check-in</h3>
      <span class="gp-pill" data-tone="${r.precheckin.submitted ? 'ok' : 'wait'}">${r.precheckin.submitted ? 'Feito' : 'Em falta'}</span></div>
      <p class="gp-note">${r.precheckin.submitted ? 'Pode corrigir os dados até à chegada.' : 'Documentos e hora de chegada de cada hóspede.'}
      <a href="${esc(path)}">${r.precheckin.submitted ? 'Rever' : 'Fazer agora'}</a></p>` : '';

    // Resumo da estadia.
    const nights = Number(p.nights) || window.ReservationDates.countNights(r.check_in, r.check_out);
    $('pn-rs-stay').innerHTML = `<div class="gp-stay-dates">
        <div><small>Entrada</small><b>${esc(day(r.check_in))}</b>${p.checkin_time ? `<span>a partir das ${esc(p.checkin_time)}</span>` : ''}</div>
        <div><small>Saída</small><b>${esc(day(r.check_out))}</b>${p.checkout_time ? `<span>até às ${esc(p.checkout_time)}</span>` : ''}</div>
      </div>
      <dl class="gp-lines"><div><dt>Estadia</dt><dd>${[nights ? plural(nights, 'noite', 'noites') : '', plural(r.num_guests, 'hóspede', 'hóspedes')].filter(Boolean).join(' · ')}</dd></div>
      ${r.accommodation_name ? `<div><dt>Unidade</dt><dd>${esc(r.accommodation_name)}</dd></div>` : ''}</dl>
      ${!['cancelada', 'depois'].includes(phase) ? `<a class="gp-btn-ghost pn-calendar" download="reserva-${esc(r.id)}.ics" href="${calendarFile(r, brand)}">Adicionar ao calendário</a>` : ''}`;

    // Pagamentos.
    const percent = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
    const showPay = total > 0 && !(phase === 'cancelada' && paid <= 0);
    $('pn-rs-payments').hidden = !showPay;
    $('pn-rs-payments').innerHTML = showPay ? `<h3 id="gp-payments-title">Pagamentos</h3>
      <div class="gp-progress${percent >= 100 ? ' full' : ''}" role="progressbar" aria-label="Pago" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}" aria-valuetext="${percent}% pago"><i style="width:${percent}%"></i></div>
      <dl class="gp-lines">
        <div><dt>Pago</dt><dd><strong>${money(paid)}</strong></dd></div>
        <div><dt>Falta</dt><dd>${money(missing)}</dd></div>
        <div class="gp-total"><dt>Total</dt><dd>${money(total)}</dd></div>
      </dl>
      ${r.online_payment?.policy ? '<a href="#gp-policy" class="gp-note" id="gp-policy-link">Ver as condições de pagamento e cancelamento</a>' : ''}` : '';

    // Contacto do alojamento (o da organização, em falta).
    const phone = String(r.contact?.phone || '').trim();
    const email = String(r.contact?.email || '').trim();
    let digits = phone.replace(/[^\d+]/g, '');
    if (digits.startsWith('00')) digits = `+${digits.slice(2)}`;
    const wa = digits.startsWith('+') ? digits.slice(1) : (digits.length === 9 && /^[29]/.test(digits) ? `351${digits}` : '');
    const links = [
      wa && (!wa.startsWith('351') || wa.startsWith('3519')) ? `<a href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener noreferrer"><b>WhatsApp</b><span class="gp-contact-value">· ${esc(phone)}</span></a>` : '',
      phone ? `<a href="tel:${esc(digits)}"><b>Ligar</b><span class="gp-contact-value">· ${esc(phone)}</span></a>` : '',
      email ? `<a href="mailto:${esc(email)}"><b>Email</b><span class="gp-contact-value">· ${esc(email)}</span></a>` : '',
    ].filter(Boolean);
    $('gp-contact').hidden = !links.length;
    $('gp-contact').innerHTML = links.length ? `<h3 id="gp-contact-title">${['chegada', 'estadia'].includes(phase) ? 'Precisa de ajuda?' : 'Dúvidas?'}</h3>
      <p class="gp-note">Fale diretamente com ${esc(brand || 'o alojamento')}.</p><div class="gp-contact">${links.join('')}</div>` : '';
  }

  function render(r, image = null) {
    const p = r.portal || {};
    const phase = phaseOf(r);
    const brand = String(r.brand_name || r.accommodation_name || '').trim();
    document.body.dataset.reservationStatus = r.status;
    document.body.dataset.phase = phase;
    document.documentElement.style.setProperty('--brand', accent(p.color));
    if (brand) document.title = `A sua reserva — ${brand}`;

    renderHero(r, p, phase, image, brand);
    nextCard(r, p, phase, brand);
    $('pn-rs-due').innerHTML = dueHtml(r, phase);
    $('rs-payment-panel').classList.toggle('secondary', !['sinal', 'restante'].includes(phase));

    const steps = ['pedido', 'sinal', 'pre_checkin', 'restante'].includes(phase) ? stepsFor(r, phase, brand) : [];
    $('pn-rs-steps').hidden = !steps.length;
    $('pn-rs-steps').innerHTML = steps.length ? `<h3 id="gp-steps-title">A sua estadia, passo a passo</h3>${stepsHtml(steps)}` : '';
    $('gp-concierge').innerHTML = concierge(r, p, phase);
    sidebar(r, p, phase, brand);
    return { phase };
  }

  // Ação principal fixa em baixo no telemóvel: o pagamento, se estiver à
  // vista no cartão, senão a ação do cartão «Próximo passo».
  function setSticky(phase, payVisible) {
    const sticky = payVisible && ['sinal', 'restante'].includes(phase) ? 'pay'
      : $('gp-next-action').children.length && !payVisible ? 'action' : '';
    if (sticky) document.body.dataset.sticky = sticky; else delete document.body.dataset.sticky;
  }

  // Abrir as condições a partir dos links «condições…».
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href="#gp-policy"]');
    if (link) {
      const details = $('gp-policy');
      if (details.hidden) return;
      event.preventDefault();
      details.open = true;
      details.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      details.querySelector('summary').focus({ preventScroll: true });
      return;
    }
    if (event.target.id === 'gp-wifi-copy') {
      const button = event.target;
      const value = $('gp-wifi-pass')?.textContent || '';
      Promise.resolve(navigator.clipboard?.writeText(value)).then(() => { button.textContent = 'Copiado'; })
        .catch(() => { button.textContent = 'Copie à mão'; })
        .finally(() => setTimeout(() => { button.textContent = 'Copiar'; }, 2500));
    }
  });

  window.ReservationStatusNovo = Object.freeze({ render, setSticky, phaseOf, accent });
})();
