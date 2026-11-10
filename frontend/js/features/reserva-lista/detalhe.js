// Estado privado; interface partilhada em AppModules.reservas.
(() => {
AppModules.define('reservas', {
  rdv2TaskBtnHtml: { get: () => rdv2TaskBtnHtml },
  showDetail: { get: () => showDetail },
});

// ── Check-in/Check-out feitos na ficha (liga às tarefas operacionais) ──

function rdv2TaskBtnHtml(resId, kind, done) {
  const label = kind === 'checkin' ? 'Check-in' : 'Check-out';
  const hint = done ? 'feito · tocar para repor' : (kind === 'checkin' ? 'marcar no dia da chegada' : 'marcar no dia da saída');
  return `<button type="button" class="rf-op${done ? ' done' : ''}" aria-pressed="${done}" aria-label="${done ? `${label} feito: repor como por fazer` : `Marcar ${label.toLowerCase()} feito`}"
      ${done
        ? AppActions.attrs('click', 'detalhe-toggle-reservation-task-7c3386e', [String(resId ?? ''), String(kind ?? '')])
        : AppActions.attrs('click', 'detalhe-toggle-reservation-task-bf7e72a', [String(resId ?? ''), String(kind ?? '')])}>
      <span class="rf-op-box" aria-hidden="true">${done ? AppModules.core.lcIcon('check', 14) : ''}</span>
      <span><strong>${label} feito</strong><small>${hint}</small></span></button>`;
}

async function toggleReservationTask(resId, kind, done) {
  try {
    const res = await AppModules.core.apiPost(`/api/reservations/${resId}/task-status`, { kind, done });
    const ts = res.data || {};
    const wrap = document.getElementById('rdv2-task-bar');
    if (wrap) {
      wrap.innerHTML = rdv2TaskBtnHtml(resId, 'checkin', !!ts.checkin_done)
        + rdv2TaskBtnHtml(resId, 'checkout', !!ts.checkout_done);
      if (window.lucide) lucide.createIcons();
    }
    // O «Próximo passo» depende do check-in/check-out: volta a desenhar a ficha.
    if (document.querySelector('.rf-next')) AppModules.reservas.showDetail(resId, { fromHistory: true });
    AppModules.core.toast(done ? '✅ Marcado como feito.' : '↩️ Reposto como por fazer.', 'success');
    if (typeof AppModules.reservas.rdv2InvalidateTarefas === 'function') AppModules.reservas.rdv2InvalidateTarefas();
    if (typeof AppModules.core.loadNotifications === 'function') AppModules.core.loadNotifications();
  } catch (err) {
    AppModules.core.toast('❌ ' + (err?.payload?.error || 'Erro ao atualizar.'), 'error');
  }
}

async function showDetail(id, opts = {}) {
  try {
    if (!document.getElementById('view-reservas')?.classList.contains('active')) {
      AppModules.core.openingReservationDetail = true;
      try { await AppModules.core.showView('reservas', false); } finally { AppModules.core.openingReservationDetail = false; }
    }
    AppModules.reservas.setReservasDetailMode(true);
    // Entrada no history para o back do browser/telemóvel fechar o detalhe.
    // Detalhe→detalhe substitui a entrada para não empilhar "backs mortos".
    if (!opts.fromHistory) {
      const url = `/reservas?reserva=${encodeURIComponent(id)}`;
      const st = { view: 'reservas', reservaDetail: id };
      if (history.state?.reservaDetail) history.replaceState(st, '', url);
      else history.pushState(st, '', url);
    }
    const detailContent = document.getElementById('reserva-detail-content');
    const detailLoading = document.querySelector('#reserva-detail-page .reserva-detail-loading');
    if (detailContent) detailContent.innerHTML = '';
    if (detailLoading) detailLoading.style.display = 'flex';

    const data = await AppModules.core.apiGet(`/api/reservations/${id}`);
    const r = data.data;
    AppModules.reservas._rdv2Current = r;
    const guestsData = typeof r.guests_data === 'string' ? JSON.parse(r.guests_data || '[]') : (r.guests_data || []);
    const accsData = typeof r.accommodations_data === 'string' ? JSON.parse(r.accommodations_data || '[]') : (r.accommodations_data || []);
    const acc = AppModules.core.accommodations.find(a => a.id === r.accommodation_id);
    const paid = Number(r.amount_paid || 0);
    const total = Number(r.total_amount || 0);
    const remaining = total - paid;

    // Accommodation rows: multi-accommodation or single
    const accRows = accsData.length > 0
      ? accsData
      : [{ accommodation_id: r.accommodation_id, name: r.accommodation_name || acc?.name || '—', price_per_night: Number(acc?.price_per_night || 0), nights: r.nights, subtotal: Number(acc?.price_per_night || 0) * r.nights }];

    const extraOcc = AppModules.reservas.getExtraOccupancyCharge(acc, r.num_guests || 1, r.nights || 0, guestsData.map(g => g.birth_date).filter(Boolean), r.check_in);
    const bkfPrice = AppModules.core.servicosData.find(s => s.id === 'breakfast')?.value ?? 19;
    const bkfTotal = r.breakfast_included ? (r.num_guests * r.nights * bkfPrice) : 0;
    const touristTax = Number(r.tourist_tax || 0);

    const services = [];
    if (r.breakfast_included) services.push({ name: 'Pequeno-almoço', formula: `(${r.num_guests}👤 × ${r.nights}🌙 × ${ReservationMoney.format(bkfPrice)})`, total: bkfTotal });
    if (extraOcc > 0) services.push({ name: 'Ocupação extra', formula: `${r.nights}🌙`, total: extraOcc });

    const taxes = [];
    if (touristTax > 0) taxes.push({ name: 'Taxa turística', total: touristTax });

    const fmt = v => `${ReservationMoney.format(v)}`;
    const sd = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
    const calcAge = (birth, ref) => {
      if (!birth || !ref) return null;
      const b = new Date(birth + 'T00:00:00'), r2 = new Date(ref + 'T00:00:00');
      let age = r2.getFullYear() - b.getFullYear();
      const m = r2.getMonth() - b.getMonth();
      if (m < 0 || (m === 0 && r2.getDate() < b.getDate())) age--;
      return age >= 0 ? age : null;
    };
    const numAdultsVal = Number(r.num_adults || r.num_guests || 1);
    const childGuests = guestsData.slice(numAdultsVal - 1);
    const childAges = childGuests.map(g => {
      const age = calcAge(g.birth_date, r.check_in);
      return age !== null ? (age === 0 ? '< 1 ano' : `${age} ${age === 1 ? 'ano' : 'anos'}`) : null;
    }).filter(Boolean);

    // Comparação com o padrão do calendário dinâmico (nunca usado para cobrar,
    // apenas referência): linha de desconto/acréscimo abaixo do total.
    const standardTotal = Number(r.standard_total);
    let priceCompareLine = '';
    if (!isNaN(standardTotal) && standardTotal > 0) {
      const priceDiff = total - standardTotal;
      const editedNote = r.price_edited_at
        ? ` · editada manualmente em ${window.ReservationDates.formatDateTime(r.price_edited_at, 'date')}${r.price_edited_by_name ? ` por ${AppModules.core.escapeHtml(r.price_edited_by_name)}` : ''}`
        : '';
      if (Math.abs(priceDiff) > 0.005) {
        priceCompareLine = `
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:6px 0 0;font-size:12.5px;">
            <span style="font-weight:600;color:${priceDiff < 0 ? '#0f9d58' : '#e8710a'};">
              ${priceDiff < 0 ? `🏷️ Desconto de ${fmt(Math.abs(priceDiff))} face ao padrão` : `↗️ Acréscimo de ${fmt(priceDiff)} face ao padrão`}
            </span>
            <span style="color:var(--cinza);font-size:12px;">Padrão (calendário dinâmico): ${fmt(standardTotal)}${editedNote}</span>
          </div>`;
      } else if (r.price_edited_at) {
        priceCompareLine = `<div style="padding:6px 0 0;font-size:12px;color:var(--cinza);">Valores${editedNote}</div>`;
      }
    }

    const preCheckinToken = r.precheckin_token || r.public_token;
    const preCheckinUrl = preCheckinToken ? `${window.location.origin}/pre-checkin/${preCheckinToken}` : null;
    const paymentPageUrl = r.public_token ? `${window.location.origin}/reserva/${r.public_token}` : null;
    const canOpenOnlinePayment = paymentPageUrl && r.can_pay_online;
    const guestEmail = encodeURIComponent(r.guest_email || '');
    const guestName = encodeURIComponent(r.guest_name || '');
    const invoiceData = JSON.stringify({ n: r.invoice_number || '', d: r.invoice_date || '', sd: r.invoice_sent_date || '', m: r.invoice_sent_method || '' }).replace(/'/g, '&#39;');


    // Ações da reserva (menu «Mais»): as mesmas em todos os ecrãs. As mais
    // usadas também aparecem no cartão a que dizem respeito.
    const ic = (name, size = 14) => AppModules.core.lcIcon(name, size);
    const esc = AppModules.core.escapeHtml;
    const reservationActionsHtml = `
            ${r.status === 'pendente' ? `<button class="rdv2-action-link rdv2-action-success" ${AppActions.attrs('click', 'detalhe-aprovar-reserva-0f31ccd', [String(r.id)])}>${ic('check', 12)} Aprovar e enviar pre check-in</button>` : ''}
            <button class="rdv2-action-link" ${AppActions.attrs('click', 'detalhe-open-edit-page-8b67124', [String(r.id)])}>${ic('pencil', 12)} Editar reserva</button>
            <button class="rdv2-action-link" ${AppActions.attrs('click', 'detalhe-open-edit-page-8b67124', [String(r.id)])}>${ic('home', 12)} Editar alojamento</button>
            <button class="rdv2-action-link" ${AppActions.attrs('click', 'detalhe-open-add-guest-form-2a832ca', [String(r.id)])}>${ic('user-plus', 12)} Adicionar hóspede</button>
            <button class="rdv2-action-link" ${AppActions.attrs('click', 'detalhe-open-payment-form-74a29ac', [String(r.id), paid, total])}>${ic('credit-card', 12)} Registar pagamento</button>
            ${canOpenOnlinePayment ? `<button class="rdv2-action-link" ${AppActions.attrs('click', 'detalhe-open-7fd73a2', [String(paymentPageUrl)])}>${ic('external-link', 12)} Abrir pagamento online</button>` : ''}
            <button class="rdv2-action-link" data-inv='${invoiceData}' ${AppActions.attrs('click', 'detalhe-open-invoice-form-from-btn-ddace26', [String(r.id)])}>${ic('file-text', 12)} Registar fatura</button>
            ${r.guest_email ? `<button class="rdv2-action-link" ${AppActions.attrs('click', 'detalhe-abrir-mensagens-da-reserva-8cd7ba1', [String(r.id), guestEmail, guestName])}>${ic('mail', 12)} Enviar email</button>` : ''}
            <div class="rf-menu-sep" role="separator"></div>
            ${r.status === 'cancelada'
              ? `${!r.payment_policy?.cancellation ? `<button class="rdv2-action-link rdv2-action-success" ${AppActions.attrs('click', 'detalhe-reativar-reserva-9888cf4', [String(r.id)])}>${ic('refresh-cw', 12)} Reativar reserva</button>` : ''}
                 ${AppModules.reservas.hasRole('manager') ? `<button class="rdv2-action-link rdv2-action-danger" ${AppActions.attrs('click', 'detalhe-apagar-reserva-definitivo-727881f', [String(r.id)])}>${ic('trash-2', 12)} Apagar definitivamente</button>` : ''}`
              : `<button class="rdv2-action-link rdv2-action-danger" ${AppActions.attrs('click', 'detalhe-cancelar-reserva-2d9df9b', [String(r.id)])}>${ic('x-circle', 12)} Cancelar reserva</button>
                 ${AppModules.reservas.hasRole('manager') ? `<button class="rdv2-action-link rdv2-action-danger" ${AppActions.attrs('click', 'detalhe-apagar-reserva-definitivo-727881f', [String(r.id)])}>${ic('trash-2', 12)} Apagar reserva</button>` : ''}`}
    `;

    // Datas por extenso («sáb, 21 nov 2026») e quantos dias faltam.
    const D = window.ReservationDates;
    const longDay = d => d ? `${D.formatDayLabel(d)} ${String(d).slice(0, 4)}` : '—';
    const today = D.localIso();
    const daysToArrival = r.check_in ? D.countNights(today, r.check_in) : 0;
    const arrivalText = !r.check_in || r.check_in < today ? '' : daysToArrival === 0 ? 'chegada hoje' : daysToArrival === 1 ? 'chegada amanhã' : `chegada daqui a ${daysToArrival} dias`;
    const nAdults = Number(r.num_adults || r.num_guests || 0);
    const nChildren = Number(r.num_children || 0);
    const guestsText = `${nAdults} adulto${nAdults === 1 ? '' : 's'} · ${nChildren} criança${nChildren === 1 ? '' : 's'}`;
    const accNames = accRows.map(row => row.name || row.accommodation_name).filter(Boolean).join(', ') || '—';
    const channel = AppModules.core.channelLabel(r.channel) || '—';
    const onlineLabels = {
      pending: 'A aguardar', processing: 'Em processamento', paid: 'Pago', failed: 'Falhou',
      cancelled: 'Cancelado', expired: 'Sessão expirada', refunded: 'Reembolsado',
      partially_refunded: 'Reembolso parcial', review_required: 'Requer verificação',
    };
    const onlineStatus = r.online_payment_status ? (onlineLabels[r.online_payment_status] || r.online_payment_status) : '';
    const tasks = r.task_status || {};
    const initials = name => String(name || '?').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?';
    const paidPercent = total > 0 ? Math.min(100, Math.max(0, Math.round((paid / total) * 100))) : 0;

    // Próximo passo: o que a equipa tem de fazer agora nesta reserva.
    const nextStep = (() => {
      if (r.status === 'cancelada') return null;
      const copyPay = canOpenOnlinePayment ? `<button class="btn btn-ghost btn-sm" ${AppActions.attrs('click', 'detalhe-write-text-8f51584', [String(paymentPageUrl)])}>${ic('copy', 13)} Copiar link de pagamento</button>` : '';
      const payBtn = `<button class="btn btn-primary btn-sm" ${AppActions.attrs('click', 'detalhe-open-payment-form-74a29ac', [String(r.id), paid, total])}>${ic('credit-card', 13)} Registar pagamento</button>`;
      if (r.status === 'pendente') return { icon: 'inbox', title: 'Pedido por aprovar', text: [arrivalText, 'o hóspede aguarda resposta'].filter(Boolean).join(' · '),
        actions: `<button class="btn btn-primary btn-sm" ${AppActions.attrs('click', 'detalhe-aprovar-reserva-0f31ccd', [String(r.id)])}>${ic('check', 13)} Aprovar e enviar pré-check-in</button>` };
      if (r.status === 'confirmada' && r.check_in && r.check_in <= today && !tasks.checkin_done) return { icon: 'log-in', title: 'Chegada hoje', text: r.arrival_time ? `hora prevista ${r.arrival_time}` : 'sem hora de chegada indicada',
        actions: `<button class="btn btn-primary btn-sm" ${AppActions.attrs('click', 'detalhe-toggle-reservation-task-bf7e72a', [String(r.id), 'checkin'])}>${ic('log-in', 13)} Marcar check-in feito</button>` };
      if (r.status === 'check_in' && r.check_out && r.check_out <= today && !tasks.checkout_done) return { icon: 'log-out', title: 'Saída hoje', text: remaining > 0.01 ? `faltam ${fmt(remaining)} por receber` : 'estadia paga',
        actions: `${remaining > 0.01 ? payBtn.replace('btn-primary', 'btn-ghost') : ''}<button class="btn btn-primary btn-sm" ${AppActions.attrs('click', 'detalhe-toggle-reservation-task-bf7e72a', [String(r.id), 'checkout'])}>${ic('log-out', 13)} Marcar check-out feito</button>` };
      if (['pre_reserva', 'aguardar_pagamento'].includes(r.status) && remaining > 0.01) return { icon: 'credit-card', title: paid > 0 ? 'Receber o restante do sinal' : 'Receber o sinal',
        text: [`faltam ${fmt(remaining)}`, onlineStatus ? `pagamento online: ${onlineStatus.toLowerCase()}` : '', arrivalText].filter(Boolean).join(' · '), actions: copyPay + payBtn };
      if (['confirmada', 'check_in'].includes(r.status) && r.precheckin_state !== 'preenchido') return { icon: 'send', title: 'Pedir o pré-check-in',
        text: [r.precheckin_state === 'enviado' ? 'link enviado, a aguardar o hóspede' : 'ainda não foi enviado', arrivalText].filter(Boolean).join(' · '),
        actions: `<button class="btn btn-primary btn-sm" ${AppActions.attrs('click', 'detalhe-enviar-link-precheckin-ae74bc8', [String(r.id)])}>${ic('send', 13)} ${r.precheckin_state === 'enviado' ? 'Reenviar pré-check-in' : 'Enviar pré-check-in'}</button>` };
      if (['confirmada', 'check_in'].includes(r.status) && remaining > 0.01) return { icon: 'credit-card', title: 'Receber o restante',
        text: [`faltam ${fmt(remaining)}`, r.payment_policy?.balanceCents ? `vence ${D.formatDateTime(r.payment_policy.dueAt, 'date')}` : '', arrivalText].filter(Boolean).join(' · '), actions: copyPay + payBtn };
      return null;
    })();

    const accLines = accRows.map(row => `
              <div class="rf-line"><span>${esc(row.name || row.accommodation_name || '—')}<span class="rf-formula">${ReservationMoney.formatShort(Math.round(Number(row.price_per_night || 0)))}/noite × ${row.nights || r.nights} noites</span></span>
                <span class="rdv2-amt">${fmt(row.subtotal || (Number(row.price_per_night || 0) * (row.nights || r.nights)))}</span></div>`).join('');
    const otherLines = [...services, ...taxes].map(s => `
              <div class="rf-line"><span>${esc(s.name)}${s.formula ? `<span class="rf-formula">${esc(s.formula)}</span>` : ''}</span><span class="rdv2-amt">${fmt(s.total)}</span></div>`).join('');
    const policy = r.payment_policy;
    const invoiceText = r.invoice_number
      ? `nº ${esc(r.invoice_number)}${r.invoice_sent_date ? ` · enviada ${sd(r.invoice_sent_date)}` : r.invoice_date ? ` · ${sd(r.invoice_date)}` : ''}`
      : 'por registar';

    if (detailLoading) detailLoading.style.display = 'none';

    detailContent.innerHTML = `
      <!-- Cabeçalho: hóspede, referência e os três estados -->
      <div class="rdv2-header rf-head">
        <button class="btn btn-ghost btn-sm rf-back" data-on-click="detalhe-show-reservas-list-3f01da3">${ic('arrow-left', 13)} Voltar</button>
        <div class="rf-who">
          <h2 class="rf-guest-name">${esc(r.guest_name || '—')}</h2>
          <div class="rf-sub">
            <span class="rdv2-id-pill">${esc(r.id)}</span>
            <span class="rf-sub-text">${esc(accNames)} · ${esc(channel)}</span>
            <span class="rf-chips">${AppModules.core.badgeEstado(r.status)}${AppModules.core.badgePagamento(r.payment_status)}${r.status !== 'cancelada' ? `<span class="badge-label">Pré-check-in</span>${AppModules.core.badgePrecheckin(r.precheckin_state)}` : ''}</span>
          </div>
        </div>
        <div class="rf-head-actions">
          <div class="rdv2-tabs" role="tablist">
            <button class="rdv2-tab rdv2-tab-active" id="rdv2-tab-btn-reserva" data-on-click="detalhe-rdv2-show-tab-b77b54f">${ic('clipboard', 12)} Reserva</button>
            <button class="rdv2-tab" id="rdv2-tab-btn-tarefas" data-on-click="detalhe-rdv2-show-tab-c86cc3e">${ic('list-checks', 12)} Tarefas</button>
            <button class="rdv2-tab" id="rdv2-tab-btn-timeline" data-on-click="detalhe-rdv2-show-tab-5aa1943">${ic('git-branch', 12)} Timeline</button>
          </div>
          <button type="button" class="btn btn-ghost btn-sm rf-edit" aria-label="Editar reserva" title="Editar reserva" ${AppActions.attrs('click', 'detalhe-open-edit-page-8b67124', [String(r.id)])}>${ic('pencil', 14)}<span class="rf-label"> Editar</span></button>
          <button type="button" class="btn btn-ghost btn-sm rf-more" id="rdv2-actions-trigger" aria-label="Mais ações da reserva" title="Mais ações" aria-haspopup="dialog" aria-expanded="false" aria-controls="rdv2-actions-menu" popovertarget="rdv2-actions-menu">${ic('ellipsis', 14)}<span class="rf-label"> Mais</span></button>
        </div>
        <div id="rdv2-actions-menu" class="rdv2-actions-menu" popover="auto" role="dialog" aria-labelledby="rdv2-actions-title">
          <div class="rdv2-actions-menu-heading">
            <div class="rdv2-widget-title" id="rdv2-actions-title">Ações da reserva</div>
            <button type="button" class="rdv2-icon-btn" aria-label="Fechar ações da reserva" popovertarget="rdv2-actions-menu" popovertargetaction="hide">${ic('x', 18)}</button>
          </div>
          ${reservationActionsHtml}
        </div>
      </div>

      <div class="rdv2-body rf-body" id="rdv2-panel-reserva">
        ${nextStep ? `<div class="rf-next" role="status">
          <span class="rf-next-icon">${ic(nextStep.icon, 18)}</span>
          <div class="rf-next-text"><strong>Próximo passo: ${esc(nextStep.title.charAt(0).toLowerCase() + nextStep.title.slice(1))}</strong><span>${esc(nextStep.text)}</span></div>
          <div class="rf-next-actions">${nextStep.actions}</div>
        </div>` : ''}

        <div class="rf-main">
          <!-- Estadia -->
          <section class="rf-card" aria-labelledby="rf-stay-title">
            <div class="rf-card-head"><h3 id="rf-stay-title">Estadia</h3>
              <button class="btn btn-ghost btn-sm" ${AppActions.attrs('click', 'detalhe-open-edit-page-8b67124', [String(r.id)])}>${ic('pencil', 12)} Alterar</button></div>
            <div class="rf-dates">
              <div class="rf-date"><span class="rf-kicker">Check-in</span><strong>${esc(longDay(r.check_in))}</strong>${acc?.checkin_time ? `<small>a partir das ${esc(acc.checkin_time)}</small>` : ''}</div>
              <span class="rf-arrow" aria-hidden="true">${ic('arrow-right', 16)}</span>
              <div class="rf-date"><span class="rf-kicker">Check-out</span><strong>${esc(longDay(r.check_out))}</strong>${acc?.checkout_time ? `<small>até às ${esc(acc.checkout_time)}</small>` : ''}</div>
              <div class="rf-nights"><strong>${r.nights}</strong><small>${Number(r.nights) === 1 ? 'noite' : 'noites'}</small></div>
            </div>
            <dl class="rf-facts">
              <div><dt>Alojamento</dt><dd>${esc(accNames)}</dd></div>
              <div><dt>Hóspedes</dt><dd>${guestsText}${childAges.length ? `<small>${esc(childAges.join(' · '))}</small>` : ''}</dd></div>
              <div><dt>Hora de chegada</dt><dd><span id="rdv2-arrival-val">${esc(r.arrival_time || '—')}</span>
                <button class="rdv2-edit-btn" ${AppActions.attrs('click', 'detalhe-editar-hora-chegada-5c1a9e2', [String(r.id), String(r.arrival_time ?? '')])} title="Editar hora de chegada" aria-label="Editar hora de chegada">${ic('pencil', 11)}</button></dd></div>
              <div><dt>Canal</dt><dd>${esc(channel)}</dd></div>
            </dl>
            ${r.status !== 'cancelada' ? `<div class="rf-ops" id="rdv2-task-bar">
              ${rdv2TaskBtnHtml(r.id, 'checkin', !!tasks.checkin_done)}${rdv2TaskBtnHtml(r.id, 'checkout', !!tasks.checkout_done)}
            </div>` : ''}
          </section>

          <!-- Hóspedes -->
          <section class="rf-card" aria-labelledby="rf-guests-title">
            <div class="rf-card-head"><h3 id="rf-guests-title">Hóspedes</h3>
              <button class="btn btn-ghost btn-sm" ${AppActions.attrs('click', 'detalhe-open-add-guest-form-2a832ca', [String(r.id)])}>${ic('user-plus', 12)} Adicionar hóspede</button></div>
            <div class="rf-guest">
              <span class="rf-avatar" aria-hidden="true">${esc(initials(r.guest_name))}</span>
              <div class="rf-guest-info"><strong>${esc(r.guest_name || '—')} <span class="rf-tag">principal</span></strong>
                <span>${[r.guest_email, r.guest_phone].filter(Boolean).map(esc).join(' · ') || 'sem contactos'}</span></div>
              <div class="rf-guest-actions">
                ${r.guest_email ? `<button class="btn btn-ghost btn-sm" ${AppActions.attrs('click', 'detalhe-abrir-mensagens-da-reserva-8cd7ba1', [String(r.id), guestEmail, guestName])}>${ic('mail', 12)} Email</button>` : ''}
                ${r.guest_phone ? `<a class="btn btn-ghost btn-sm" href="tel:${esc(String(r.guest_phone).replace(/[^+\d]/g, ''))}">${ic('phone', 12)} Ligar</a>` : ''}
                ${r.guest_id ? `<button class="btn btn-ghost btn-sm" ${AppActions.attrs('click', 'detalhe-open-guest-card-621ccbd', [String(r.guest_id), String(r.id)])}>Ficha</button>` : ''}
              </div>
            </div>
            ${guestsData.map((g, i) => `<div class="rf-guest">
              <span class="rf-avatar" aria-hidden="true">${esc(initials(g.name))}</span>
              <div class="rf-guest-info"><strong>${esc(g.name || '—')}</strong>
                <span>hóspede ${i + 2}${[g.email, g.phone].filter(Boolean).length ? ` · ${[g.email, g.phone].filter(Boolean).map(esc).join(' · ')}` : ''}</span></div>
              <div class="rf-guest-actions">${g.id ? `<button class="btn btn-ghost btn-sm" ${AppActions.attrs('click', 'detalhe-abrir-hospede-b15454b', [String(g.id)])}>Ficha</button>` : ''}</div>
            </div>`).join('')}
          </section>

          <!-- Valores e pagamentos -->
          <section class="rf-card" aria-labelledby="rf-money-title">
            <div class="rf-card-head"><h3 id="rf-money-title">Valores e pagamentos</h3>
              <button class="btn btn-ghost btn-sm" ${AppActions.attrs('click', 'detalhe-open-payment-form-74a29ac', [String(r.id), paid, total])}>${ic('credit-card', 12)} Registar pagamento</button></div>
            <div class="rf-lines">
              ${accLines}${otherLines}
              <div class="rf-line rf-total rdv2-total-row"><span>Total
                <button class="rdv2-edit-btn" ${AppActions.attrs('click', 'detalhe-start-inline-price-edit-700b5d7', [String(r.id), total])} title="Editar preço total" aria-label="Editar preço total">${ic('pencil', 11)}</button></span>
                <span class="rdv2-amt" id="rdv2-acc-subtot">${fmt(total)}</span></div>
              ${priceCompareLine}
            </div>
            <div class="rf-progress" role="img" aria-label="Pago ${paidPercent}% do total"><i style="width:${paidPercent}%"></i></div>
            <div class="rf-paysum">
              <div><small>Pago</small><strong class="rdv2-green" id="rdv2-total-paid">${fmt(paid)}</strong></div>
              <div><small>Em falta</small><strong class="${remaining > 0.01 ? 'rdv2-red' : ''}" id="rdv2-remaining">${fmt(Math.max(0, remaining))}</strong></div>
              <div><small>Total</small><strong>${fmt(total)}</strong></div>
            </div>
            ${(r.payments || []).length ? `<div class="rdv2-pay-list" id="rdv2-pay-list">
              ${(r.payments || []).map(p => `
                <div class="rdv2-pay-entry" data-pid="${esc(p.id)}">
                  <div class="rdv2-pay-entry-info">
                    <span class="rdv2-green rdv2-pay-entry-amt">${fmt(p.amount)}</span>
                    ${p.method ? `<span class="rdv2-pay-entry-method">${esc(p.method)}</span>` : ''}
                  </div>
                  <div class="rdv2-pay-entry-right">
                    <span class="rdv2-pay-entry-date">${p.payment_date ? sd(p.payment_date) : '—'}</span>
                    ${String(p.id).startsWith('stripe-') ? '' : `<button class="rdv2-icon-btn rdv2-pay-del" ${AppActions.attrs('click', 'detalhe-delete-payment-entry-6f2ae81', [String(r.id), String(p.id)])} title="Remover pagamento" aria-label="Remover pagamento">${ic('trash-2', 11)}</button>`}
                  </div>
                </div>`).join('')}
            </div>` : '<div class="rdv2-pay-empty">Sem pagamentos registados</div>'}
            ${policy ? `<div class="rf-policy">
              Política: inicial <strong>${fmt(policy.depositCents / 100)}</strong>${policy.balanceCents ? ` · restante <strong>${fmt(policy.balanceCents / 100)}</strong> até <strong>${esc(D.formatDateTime(policy.dueAt))}</strong>` : ''}
              · ${policy.accepted ? 'condições aceites pelo hóspede' : 'condições ainda não aceites pelo hóspede'}
              · ${policy.cancellation ? `reembolso previsto no cancelamento: <strong>${fmt(policy.cancellation.amount)}</strong> (${policy.cancellation.state === 'complete' ? 'concluído' : policy.cancellation.state === 'manual_review' ? 'precisa de revisão manual' : 'em processamento'})` : `reembolso se cancelar agora: <strong>${fmt(policy.refundCents / 100)} (${policy.refundPercent}%)</strong>`}
              ${r.balance_deadline ? ` · prazo adicional: ${esc(D.formatDateTime(r.balance_deadline))}` : ''}
              ${paymentPageUrl ? `<button class="rf-link-btn" ${AppActions.attrs('click', 'detalhe-write-text-8f51584', [paymentPageUrl])}>${ic('copy', 12)} Copiar link da reserva e pagamento</button>` : ''}
            </div>` : ''}
          </section>

          ${r.notes ? `<section class="rf-card"><div class="rf-card-head"><h3>Notas</h3></div><p class="rf-notes">${esc(r.notes)}</p></section>` : ''}
          ${r.guest_notes ? `<section class="rf-card"><div class="rf-card-head"><h3>Notas do hóspede</h3></div><p class="rf-notes">${esc(r.guest_notes)}</p></section>` : ''}
        </div>

        <aside class="rf-side">
          <!-- Estado -->
          <section class="rf-card">
            <div class="rf-card-head"><h3>Estado</h3></div>
            <div class="rdv2-status-row">
              <span class="rdv2-status-label">Reserva</span>
              <select class="rdv2-status-select" id="rdv2-status-select" aria-label="Estado da reserva" ${AppActions.attrs('change', 'detalhe-update-detail-status-05d2970', [String(r.id)])}></select>
            </div>
            <div class="rdv2-status-row"><span class="rdv2-status-label">Pagamento</span><span>${AppModules.core.badgePagamento(r.payment_status)}</span></div>
            ${onlineStatus ? `<div class="rdv2-status-row"><span class="rdv2-status-label">Pagamento online</span><span class="badge">${esc(onlineStatus)}</span></div>` : ''}
            <div class="rdv2-status-row"><span class="rdv2-status-label">Pré-check-in</span><span>${AppModules.core.badgePrecheckin(r.precheckin_state)}</span></div>
          </section>

          ${r.status !== 'pendente' && r.status !== 'cancelada' ? `
          <!-- Pré-check-in -->
          <section class="rf-card">
            <div class="rf-card-head"><h3>Pré-check-in</h3></div>
            ${preCheckinUrl ? `
            <div class="rdv2-concierge-url">
              <span class="rdv2-url-text" title="${esc(preCheckinUrl)}">${esc(preCheckinUrl)}</span>
              <button class="rdv2-icon-btn" ${AppActions.attrs('click', 'detalhe-write-text-8f51584', [String(preCheckinUrl)])} title="Copiar" aria-label="Copiar link do pré-check-in">${ic('copy', 12)}</button>
            </div>
            <div class="rf-stack">
              <button class="btn btn-primary btn-sm" ${AppActions.attrs('click', 'detalhe-enviar-link-precheckin-ae74bc8', [String(r.id)])}>${ic('send', 13)} ${r.precheckin_state === 'nao_enviado' || !r.precheckin_state ? 'Enviar link ao hóspede' : 'Reenviar link ao hóspede'}</button>
              <div class="rf-two">
                <button class="btn btn-ghost btn-sm" ${AppActions.attrs('click', 'detalhe-open-7fd73a2', [String(preCheckinUrl)])} title="Abrir o formulário do pré-check-in para o preencher com o hóspede">${ic('arrow-right', 13)} ${r.precheckin_state === 'preenchido' ? 'Abrir' : 'Preencher agora'}</button>
                <button class="btn btn-ghost btn-sm" ${AppActions.attrs('click', 'detalhe-write-text-8f51584', [String(preCheckinUrl)])}>${ic('copy', 13)} Copiar link</button>
              </div>
            </div>
            <p class="rf-foot">${r.precheckin_submitted_at
              ? `Submetido a ${sd(String(r.precheckin_submitted_at).slice(0, 10))}${r.precheckin_updated_at && r.precheckin_updated_at !== r.precheckin_submitted_at ? ` · alterado a ${sd(String(r.precheckin_updated_at).slice(0, 10))}` : ''} · o hóspede pode corrigir até ao check-in`
              : 'A aguardar submissão do hóspede'}</p>` : `
            <button class="btn btn-ghost btn-sm" ${AppActions.attrs('click', 'detalhe-enviar-link-precheckin-1ddc760', [String(r.id)])}>${ic('link', 13)} Gerar pré-check-in</button>`}
          </section>` : ''}

          <!-- Documentos -->
          <section class="rf-card">
            <div class="rf-card-head"><h3>Documentos</h3></div>
            <button class="rf-doc" ${AppActions.attrs('click', 'detalhe-open-reservation-sheet-d1319da', [String(r.id)])}><span class="rf-doc-icon">${ic('clipboard', 14)}</span>Ficha de reserva</button>
            <button class="rf-doc" ${AppActions.attrs('click', 'detalhe-open-guest-card-621ccbd', [String(r.guest_id ?? ''), String(r.id)])}><span class="rf-doc-icon">${ic('user', 14)}</span>Ficha de hóspede</button>
            <button class="rf-doc" ${AppActions.attrs('click', 'detalhe-open-account-statement-dbfcf1c', [String(r.id)])}><span class="rf-doc-icon">${ic('credit-card', 14)}</span>Conta corrente</button>
            <button class="rf-doc" data-inv='${invoiceData}' ${AppActions.attrs('click', 'detalhe-open-invoice-form-from-btn-ddace26', [String(r.id)])}><span class="rf-doc-icon">${ic('file-text', 14)}</span>Fatura<small>${invoiceText}</small></button>
          </section>
          <p class="rf-sync ${r.google_event_id ? 'rf-sync-ok' : ''}">${ic('calendar', 12)} ${r.google_event_id ? 'Sincronizado com Google Calendar' : 'Não sincronizado com Google Calendar'}</p>
        </aside>
      </div>

      <!-- Painéis Tarefas / Timeline (carregados ao abrir a tab) -->
      <div id="rdv2-panel-tarefas" style="display:none;"></div>
      <div id="rdv2-panel-timeline" style="display:none;"></div>
    `;
    window.ReservationStatus.fillSelect(document.getElementById('rdv2-status-select'), r.status_options, r.status, r.status_undo);
    const actionsMenu = document.getElementById('rdv2-actions-menu');
    const actionsTrigger = document.getElementById('rdv2-actions-trigger');
    actionsMenu.addEventListener('toggle', event => {
      const open = event.newState === 'open';
      actionsTrigger.setAttribute('aria-expanded', String(open));
      if (open) actionsMenu.querySelector('.rdv2-action-link')?.focus({ preventScroll: true });
    });
    // Fecha antes de a ação delegada abrir o formulário ou mudar de página.
    actionsMenu.addEventListener('click', event => {
      if (event.target.closest('.rdv2-action-link')) actionsMenu.hidePopover();
    });
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    AppModules.core.toast('❌ Erro ao carregar detalhe.', 'error');
    AppModules.reservas.showReservasList();
  }
}

// O servidor valida o passo (ex.: check-in sem sinal ou sem pré-check-in) e
// explica a recusa; a ficha volta a mostrar o estado e as opções atuais.
async function updateDetailStatus(id, field, value) {
  try {
    const res = await AppModules.core.apiPut(`/api/reservations/${id}`, { [field]: value });
    if (res.success) {
      AppModules.core.toast('✅ Estado atualizado', 'success');
      await AppModules.reservas.loadReservas();
    } else {
      AppModules.core.toast('❌ ' + (res.error || 'Erro ao atualizar'), 'error');
    }
  } catch (e) {
    AppModules.core.toast('❌ ' + (e?.payload?.error || 'Erro de ligação'), 'error');
  }
  AppModules.reservas.showDetail(id);
}


AppActions.register({
  "detalhe-show-reservas-list-3f01da3": (el, event, args) => { AppModules.reservas.showReservasList() },
  "detalhe-rdv2-show-tab-b77b54f": (el, event, args) => { AppModules.reservas.rdv2ShowTab('reserva') },
  "detalhe-rdv2-show-tab-c86cc3e": (el, event, args) => { AppModules.reservas.rdv2ShowTab('tarefas') },
  "detalhe-rdv2-show-tab-5aa1943": (el, event, args) => { AppModules.reservas.rdv2ShowTab('timeline') },
  "detalhe-start-inline-price-edit-700b5d7": (el, event, args) => { AppModules.reservas.startInlinePriceEdit(args[0], args[1]) },
  "detalhe-open-edit-page-8b67124": (el, event, args) => { AppModules.reservas.openEditPage(args[0]) },
  "detalhe-open-add-guest-form-2a832ca": (el, event, args) => { AppModules.reservas.openAddGuestForm(args[0]) },
  "detalhe-open-payment-form-74a29ac": (el, event, args) => { AppModules.reservas.openPaymentForm(args[0], args[1], args[2]) },
  "detalhe-open-invoice-form-from-btn-ddace26": (el, event, args) => { AppModules.reservas.openInvoiceFormFromBtn(args[0], el) },
  "detalhe-open-reservation-sheet-d1319da": (el, event, args) => { AppModules.reservas.openReservationSheet(args[0]) },
  "detalhe-open-guest-card-621ccbd": (el, event, args) => { AppModules.reservas.openGuestCard(args[0],args[1]) },
  "detalhe-open-account-statement-dbfcf1c": (el, event, args) => { AppModules.reservas.openAccountStatement(args[0]) },
}, "click");

AppActions.register({
  "detalhe-update-detail-status-05d2970": (el, event, args) => { updateDetailStatus(args[0],'status',el.value) },
}, "change");

AppActions.register({
  "detalhe-enviar-link-precheckin-1ddc760": (el, event, args) => { AppModules.reservas.enviarLinkPrecheckin(args[0], false) },
  "detalhe-abrir-mensagens-da-reserva-8cd7ba1": (el, event, args) => { AppModules.core.abrirMensagensDaReserva(args[0],decodeURIComponent(args[1]),decodeURIComponent(args[2])) },
  "detalhe-write-text-8f51584": (el, event, args) => { navigator.clipboard.writeText(args[0]);AppModules.core.toast('🔗 Link copiado','success') },
  "detalhe-open-7fd73a2": (el, event, args) => { window.open(args[0],'_blank') },
  "detalhe-enviar-link-precheckin-ae74bc8": (el, event, args) => { AppModules.reservas.enviarLinkPrecheckin(args[0]) },
  "detalhe-editar-hora-chegada-5c1a9e2": (el, event, args) => { AppModules.reservas.editarHoraChegada(args[0], args[1]) },
  "detalhe-apagar-reserva-definitivo-727881f": (el, event, args) => { AppModules.reservas.apagarReservaDefinitivo(args[0]) },
  "detalhe-cancelar-reserva-2d9df9b": (el, event, args) => { AppModules.reservas.cancelarReserva(args[0]) },
  "detalhe-reativar-reserva-9888cf4": (el, event, args) => { AppModules.reservas.reativarReserva(args[0]) },
  "detalhe-aprovar-reserva-0f31ccd": (el, event, args) => { AppModules.reservas.aprovarReserva(args[0]) },
  "detalhe-abrir-hospede-b15454b": (el, event, args) => { AppModules.core.abrirHospede(args[0]) },
  "detalhe-delete-payment-entry-6f2ae81": (el, event, args) => { AppModules.reservas.deletePaymentEntry(args[0],args[1]) },
  "detalhe-toggle-reservation-task-bf7e72a": (el, event, args) => { toggleReservationTask(args[0], args[1], true) },
  "detalhe-toggle-reservation-task-7c3386e": (el, event, args) => { toggleReservationTask(args[0], args[1], false) },
}, "click");

})();
