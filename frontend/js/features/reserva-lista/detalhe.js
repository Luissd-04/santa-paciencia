// ── Check-in/Check-out feitos na ficha (liga às tarefas operacionais) ──

function rdv2TaskBtnHtml(resId, kind, done) {
  const label = kind === 'checkin' ? 'Check-in' : 'Check-out';
  const icon = kind === 'checkin' ? 'log-in' : 'log-out';
  return done
    ? `<button class="btn btn-ghost btn-sm" style="color:#0f9d58;border:1px solid #0f9d5844;background:#0f9d580f;"
         onclick="toggleReservationTask('${resId}', '${kind}', false)" title="Clique para repor como por fazer">
         ${lcIcon('check-circle', 13)} ${label} feito</button>`
    : `<button class="btn btn-ghost btn-sm"
         onclick="toggleReservationTask('${resId}', '${kind}', true)">
         ${lcIcon(icon, 13)} Marcar ${label.toLowerCase()} feito</button>`;
}

async function toggleReservationTask(resId, kind, done) {
  try {
    const res = await apiPost(`/api/reservations/${resId}/task-status`, { kind, done });
    const ts = res.data || {};
    const wrap = document.getElementById('rdv2-task-bar');
    if (wrap) {
      wrap.innerHTML = rdv2TaskBtnHtml(resId, 'checkin', !!ts.checkin_done)
        + rdv2TaskBtnHtml(resId, 'checkout', !!ts.checkout_done);
      if (window.lucide) lucide.createIcons();
    }
    toast(done ? '✅ Marcado como feito.' : '↩️ Reposto como por fazer.', 'success');
    if (typeof rdv2InvalidateTarefas === 'function') rdv2InvalidateTarefas();
    if (typeof loadNotifications === 'function') loadNotifications();
  } catch (err) {
    toast('❌ ' + (err?.payload?.error || 'Erro ao atualizar.'), 'error');
  }
}

async function showDetail(id, opts = {}) {
  try {
    if (!document.getElementById('view-reservas')?.classList.contains('active')) {
      window.__openingReservationDetail = true;
      showView('reservas', false);
      window.__openingReservationDetail = false;
    }
    setReservasDetailMode(true);
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

    const data = await apiGet(`/api/reservations/${id}`);
    const r = data.data;
    _rdv2Current = r;
    const guestsData = typeof r.guests_data === 'string' ? JSON.parse(r.guests_data || '[]') : (r.guests_data || []);
    const accsData = typeof r.accommodations_data === 'string' ? JSON.parse(r.accommodations_data || '[]') : (r.accommodations_data || []);
    const acc = accommodations.find(a => a.id === r.accommodation_id);
    const paid = Number(r.amount_paid || 0);
    const total = Number(r.total_amount || 0);
    const remaining = total - paid;

    // Accommodation rows: multi-accommodation or single
    const accRows = accsData.length > 0
      ? accsData
      : [{ accommodation_id: r.accommodation_id, name: r.accommodation_name || acc?.name || '—', price_per_night: Number(acc?.price_per_night || 0), nights: r.nights, subtotal: Number(acc?.price_per_night || 0) * r.nights }];

    const extraOcc = getExtraOccupancyCharge(acc, r.num_guests || 1, r.nights || 0, guestsData.map(g => g.birth_date).filter(Boolean), r.check_in);
    const bkfPrice = servicosData.find(s => s.id === 'breakfast')?.value ?? 19;
    const bkfTotal = r.breakfast_included ? (r.num_guests * r.nights * bkfPrice) : 0;
    const touristTax = Number(r.tourist_tax || 0);

    const services = [];
    if (r.breakfast_included) services.push({ name: 'Pequeno-almoço', formula: `(${r.num_guests}👤 × ${r.nights}🌙 × €${Number(bkfPrice).toFixed(2)})`, total: bkfTotal });
    if (extraOcc > 0) services.push({ name: 'Ocupação extra', formula: `${r.nights}🌙`, total: extraOcc });

    const taxes = [];
    if (touristTax > 0) taxes.push({ name: 'Taxa turística', total: touristTax });

    const fmt = v => `€${Number(v).toFixed(2)}`;
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
        ? ` · editada manualmente em ${sd(r.price_edited_at.slice(0, 10))}${r.price_edited_by_name ? ` por ${escapeHtml(r.price_edited_by_name)}` : ''}`
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
    const guestEmail = encodeURIComponent(r.guest_email || '');
    const guestName = encodeURIComponent(r.guest_name || '');

    const statusOptions = [
      { v: 'pre_reserva', l: 'Pré-reserva' },
      { v: 'confirmada', l: 'Confirmada' },
      { v: 'pendente', l: 'Pendente' },
      { v: 'pre_checkin', l: 'Pre Check-in' },
      { v: 'aguardar_pagamento', l: 'Aguardar Pagamento' },
      { v: 'cancelada', l: 'Cancelada' },
    ];
    const payOptions = [
      { v: 'pendente', l: 'Não pago' },
      { v: 'parcial', l: 'Parcial' },
      { v: 'confirmado', l: 'Completo' },
    ];

    if (detailLoading) detailLoading.style.display = 'none';

    detailContent.innerHTML = `
      <!-- Header -->
      <div class="rdv2-header">
        <button class="btn btn-ghost btn-sm" onclick="showReservasList()">${lcIcon('arrow-left', 13)} Voltar</button>
        <div class="rdv2-title-area">
          <span class="rdv2-subtitle">Editar reserva</span>
          <span class="rdv2-id-pill">${r.id}</span>
        </div>
        <div class="rdv2-tabs">
          <button class="rdv2-tab rdv2-tab-active" id="rdv2-tab-btn-reserva" onclick="rdv2ShowTab('reserva')">${lcIcon('clipboard', 12)} Reserva</button>
          <button class="rdv2-tab" id="rdv2-tab-btn-tarefas" onclick="rdv2ShowTab('tarefas')">${lcIcon('list-checks', 12)} Tarefas</button>
          <button class="rdv2-tab" id="rdv2-tab-btn-timeline" onclick="rdv2ShowTab('timeline')">${lcIcon('git-branch', 12)} Timeline</button>
        </div>
      </div>

      <!-- Body -->
      <div class="rdv2-body" id="rdv2-panel-reserva">

        <!-- Main card -->
        <div class="rdv2-main">

          <!-- Info bar -->
          <div class="rdv2-info-bar">
            <div class="rdv2-info-field">
              <span class="rdv2-if-label">Hóspede</span>
              <span class="rdv2-if-val">${escapeHtml(r.guest_name)}</span>
            </div>
            <div class="rdv2-info-field">
              <span class="rdv2-if-label">Noites</span>
              <span class="rdv2-if-val">${lcIcon('moon', 11)} ${r.nights}</span>
            </div>
            <div class="rdv2-info-field">
              <span class="rdv2-if-label">Datas</span>
              <span class="rdv2-if-val">${lcIcon('calendar', 11)} ${sd(r.check_in)} → ${sd(r.check_out)}</span>
            </div>
            <div class="rdv2-info-field">
              <span class="rdv2-if-label">Adultos</span>
              <span class="rdv2-if-val">${r.num_adults || r.num_guests || 0} ${lcIcon('user', 11)}</span>
            </div>
            <div class="rdv2-info-field">
              <span class="rdv2-if-label">Crianças</span>
              <span class="rdv2-if-val">${r.num_children || 0} ${lcIcon('baby', 11)}</span>
              ${childAges.length ? `<span style="font-size:10.5px;color:var(--text-muted);">${childAges.join(' · ')}</span>` : ''}
            </div>
            ${r.arrival_time ? `<div class="rdv2-info-field">
              <span class="rdv2-if-label">Hora chegada</span>
              <span class="rdv2-if-val">${lcIcon('clock', 11)} ${r.arrival_time}</span>
            </div>` : ''}
          </div>

          ${r.status !== 'cancelada' ? `
          <!-- Check-in / Check-out feitos (sincronizado com as tarefas de Eventos) -->
          <div id="rdv2-task-bar" style="display:flex;gap:8px;flex-wrap:wrap;padding:10px 0;border-bottom:1px solid var(--borda);">
            ${rdv2TaskBtnHtml(r.id, 'checkin', !!r.task_status?.checkin_done)}
            ${rdv2TaskBtnHtml(r.id, 'checkout', !!r.task_status?.checkout_done)}
          </div>` : ''}

          <!-- Canal -->
          <div class="rdv2-canal-bar">
            <div class="rdv2-info-field">
              <span class="rdv2-if-label">Canal</span>
              <span class="rdv2-if-val">${escapeHtml(r.channel || '—')}</span>
            </div>
            ${r.guest_email ? `<div class="rdv2-info-field">
              <span class="rdv2-if-label">Email</span>
              <span class="rdv2-if-val">${escapeHtml(r.guest_email)}</span>
            </div>` : ''}
            ${r.guest_phone ? `<div class="rdv2-info-field">
              <span class="rdv2-if-label">Telefone</span>
              <span class="rdv2-if-val">${escapeHtml(r.guest_phone)}</span>
            </div>` : ''}
          </div>

          <!-- Divisor zona alojamento -->
          <div class="rdv2-zone-divider">${lcIcon('home', 10)} Alojamento e Preços</div>

          <!-- Alojamentos -->
          <div class="rdv2-section">
            <div class="rdv2-section-head">
              <span>${lcIcon('home', 12)} Alojamentos</span>
              <span>Subtotal</span>
            </div>
            ${accRows.map(row => `
            <div class="rdv2-section-row">
              <span>${row.name || row.accommodation_name || '—'} <span class="rdv2-formula">€${Number(row.price_per_night || 0).toFixed(0)}/noite × ${row.nights || r.nights}🌙</span></span>
              <span class="rdv2-amt">${fmt(row.subtotal || (Number(row.price_per_night || 0) * (row.nights || r.nights)))}</span>
            </div>`).join('')}
            <div class="rdv2-section-subtot">
              <button class="rdv2-edit-btn" onclick="startInlinePriceEdit('${r.id}', ${total})" title="Editar preço total">${lcIcon('pencil', 11)}</button>
              <span class="rdv2-amt" id="rdv2-acc-subtot">${fmt(accRows.reduce((s, row) => s + Number(row.subtotal || (Number(row.price_per_night || 0) * (row.nights || r.nights))), 0) + extraOcc)}</span>
            </div>
          </div>

          ${services.length ? `
          <!-- Serviços -->
          <div class="rdv2-section">
            <div class="rdv2-section-head">
              <span>${lcIcon('plus-square', 12)} Serviços</span>
              <span>Subtotal</span>
            </div>
            ${services.map(s => `<div class="rdv2-section-row">
              <span>${s.name} <span class="rdv2-formula">${s.formula}</span></span>
              <span class="rdv2-amt">${fmt(s.total)}</span>
            </div>`).join('')}
            <div class="rdv2-section-subtot">
              <span class="rdv2-amt">${fmt(services.reduce((a, s) => a + s.total, 0))}</span>
            </div>
          </div>` : ''}

          ${taxes.length ? `
          <!-- Taxas -->
          <div class="rdv2-section">
            <div class="rdv2-section-head">
              <span>${lcIcon('landmark', 12)} Taxas</span>
              <span>Subtotal</span>
            </div>
            ${taxes.map(t => `<div class="rdv2-section-row">
              <span>${t.name}</span>
              <span class="rdv2-amt">${fmt(t.total)}</span>
            </div>`).join('')}
            <div class="rdv2-section-subtot">
              <span class="rdv2-amt">${fmt(taxes.reduce((a, t) => a + t.total, 0))}</span>
            </div>
          </div>` : ''}

          <!-- Total -->
          <div class="rdv2-total-row">
            <span>TOTAL</span>
            <span class="rdv2-amt">${fmt(total)}</span>
          </div>
          ${priceCompareLine}

          <!-- Divisor zona pagamentos -->
          <div class="rdv2-zone-divider">${lcIcon('credit-card', 10)} Pagamentos</div>

          <!-- Pagamentos -->
          <div class="rdv2-pay-section" id="rdv2-pay-section">
            ${(r.payments || []).length > 0 ? `
              <div class="rdv2-pay-list" id="rdv2-pay-list">
                ${(r.payments || []).map(p => `
                  <div class="rdv2-pay-entry" data-pid="${p.id}">
                    <div class="rdv2-pay-entry-info">
                      <span class="rdv2-green rdv2-pay-entry-amt">${fmt(p.amount)}</span>
                      ${p.method ? `<span class="rdv2-pay-entry-method">${p.method}</span>` : ''}
                    </div>
                    <div class="rdv2-pay-entry-right">
                      ${p.payment_date ? `<span class="rdv2-pay-entry-date">${sd(p.payment_date)}</span>` : '<span class="rdv2-pay-entry-date">—</span>'}
                      <button class="rdv2-icon-btn rdv2-pay-del" onclick="deletePaymentEntry('${r.id}','${p.id}')" title="Remover pagamento">${lcIcon('trash-2', 11)}</button>
                    </div>
                  </div>`).join('')}
              </div>
              <div class="rdv2-pay-summary">
                <div class="rdv2-pay-row">
                  <span>Total pago</span>
                  <span class="rdv2-green" id="rdv2-total-paid">${fmt(paid)}</span>
                </div>
                ${remaining > 0.01 ? `<div class="rdv2-pay-row">
                  <span>Em falta</span>
                  <span class="rdv2-red" id="rdv2-remaining">${fmt(remaining)}</span>
                </div>` : ''}
              </div>` : `
              <div class="rdv2-pay-empty">Sem pagamentos registados</div>
              `}
          </div>

          ${r.invoice_number || r.invoice_date || r.invoice_sent_date ? `
          <div class="rdv2-zone-divider">${lcIcon('file-text', 10)} Fatura</div>
          <div style="background:var(--surface-muted);border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:6px;">
            <div style="display:flex;justify-content:space-between;font-size:12.5px;"><span style="color:var(--text-muted);">Nº</span><b style="color:var(--text-main);">${escapeHtml(r.invoice_number || '—')}</b></div>
            <div style="display:flex;justify-content:space-between;font-size:12.5px;"><span style="color:var(--text-muted);">Data</span><b style="color:var(--text-main);">${r.invoice_date ? sd(r.invoice_date) : '—'}</b></div>
            <div style="display:flex;justify-content:space-between;font-size:12.5px;"><span style="color:var(--text-muted);">Enviada</span><b style="color:var(--text-main);">${r.invoice_sent_date ? sd(r.invoice_sent_date) : '—'}${r.invoice_sent_method ? ' · ' + invoiceMethodLabel(r.invoice_sent_method) : ''}</b></div>
          </div>` : ''}

          ${r.notes ? `<div class="rdv2-notes">${lcIcon('file-text', 12)} ${escapeHtml(r.notes)}</div>` : ''}

          ${guestsData.length ? `<div class="rdv2-guests">
            <div class="rdv2-guests-title">Hóspedes adicionais</div>
            ${guestsData.map((g, i) => `<div class="rdv2-guest-row">
              <span class="rdv2-guest-num">Hóspede ${i + 2}</span>
              <span>${g.id
                ? `<a class="rdv2-guest-link" onclick="showHospedeDetail('${g.id}')">${escapeHtml(g.name || '—')}</a>`
                : escapeHtml(g.name || '—')}${g.email ? ` · ${escapeHtml(g.email)}` : ''}${g.phone ? ` · ${escapeHtml(g.phone)}` : ''}</span>
            </div>`).join('')}
          </div>` : ''}

          <div class="rdv2-sync ${r.google_event_id ? 'rdv2-sync-ok' : ''}">
            ${lcIcon('calendar', 11)} ${r.google_event_id ? 'Sincronizado com Google Calendar' : 'Não sincronizado com Google Calendar'}
          </div>
        </div>

        <!-- Sidebar -->
        <div class="rdv2-sidebar">

          <!-- Estado -->
          <div class="rdv2-widget">
            <div class="rdv2-widget-title">Estado</div>
            <div class="rdv2-status-row">
              <span class="rdv2-status-label">Reserva</span>
              <select class="rdv2-status-select" onchange="updateDetailStatus('${r.id}','status',this.value)">
                ${statusOptions.map(o => `<option value="${o.v}"${r.status === o.v ? ' selected' : ''}>${o.l}</option>`).join('')}
              </select>
            </div>
            <div class="rdv2-status-row">
              <span class="rdv2-status-label">Pagamento</span>
              <select class="rdv2-status-select" onchange="updateDetailStatus('${r.id}','payment_status',this.value)">
                ${payOptions.map(o => `<option value="${o.v}"${r.payment_status === o.v ? ' selected' : ''}>${o.l}</option>`).join('')}
              </select>
            </div>
          </div>

          <!-- Ações -->
          <div class="rdv2-widget">
            <div class="rdv2-widget-title">Reserva</div>
            ${r.status === 'pendente' ? `<button class="rdv2-action-link rdv2-action-success" onclick="aprovarReserva('${r.id}')">${lcIcon('check', 12)} Aprovar e enviar pre check-in</button>` : ''}
            <button class="rdv2-action-link" data-accs="${(JSON.stringify(accsData)).replace(/"/g,'&quot;')}" data-res='{"id":"${r.id}","accId":"${r.accommodation_id}","ci":"${r.check_in}","co":"${r.check_out}","ng":${r.num_guests||1},"na":${r.num_adults||1},"nc":${r.num_children||0},"bkf":${r.breakfast_included?true:false},"nights":${r.nights||1}}' onclick="openAccommodationPanelFromBtn(this)">${lcIcon('home', 12)} Editar alojamento</button>
            <button class="rdv2-action-link" onclick="openEditPage('${r.id}')">${lcIcon('pencil', 12)} Editar reserva</button>
            <button class="rdv2-action-link" onclick="openAddGuestForm('${r.id}')">${lcIcon('user-plus', 12)} Adicionar hóspede</button>
            <button class="rdv2-action-link" onclick="openPaymentForm('${r.id}', ${paid}, ${total})">${lcIcon('credit-card', 12)} Registar pagamento</button>
            <button class="rdv2-action-link" data-inv='${JSON.stringify({ n: r.invoice_number || '', d: r.invoice_date || '', sd: r.invoice_sent_date || '', m: r.invoice_sent_method || '' }).replace(/'/g, "&#39;")}' onclick="openInvoiceFormFromBtn('${r.id}', this)">${lcIcon('file-text', 12)} Registar fatura</button>
            ${r.guest_email ? `<button class="rdv2-action-link" onclick="openInvoiceForReservation('${r.id}',decodeURIComponent('${guestEmail}'),decodeURIComponent('${guestName}'))">${lcIcon('mail', 12)} Enviar email</button>` : ''}
            ${r.status === 'cancelada'
              ? `<button class="rdv2-action-link rdv2-action-success" onclick="reativarReserva('${r.id}')">${lcIcon('refresh-cw', 12)} Reativar reserva</button>
                 ${hasRole('manager') ? `<button class="rdv2-action-link rdv2-action-danger" onclick="apagarReservaDefinitivo('${r.id}')">${lcIcon('trash-2', 12)} Apagar definitivamente</button>` : ''}`
              : `<button class="rdv2-action-link rdv2-action-danger" onclick="cancelarReserva('${r.id}')">${lcIcon('x-circle', 12)} Cancelar reserva</button>
                 ${hasRole('manager') ? `<button class="rdv2-action-link rdv2-action-danger" onclick="apagarReservaDefinitivo('${r.id}')">${lcIcon('trash-2', 12)} Apagar reserva</button>` : ''}`}
          </div>

          ${r.status !== 'pendente' && r.status !== 'cancelada' ? `
          <!-- Concierge -->
          <div class="rdv2-widget">
            <div class="rdv2-widget-title">Concierge</div>
            ${preCheckinUrl ? `
            <div class="rdv2-concierge-url">
              <span class="rdv2-url-text">${preCheckinUrl}</span>
              <button class="rdv2-icon-btn" onclick="navigator.clipboard.writeText('${preCheckinUrl}');toast('🔗 Link copiado','success')" title="Copiar">${lcIcon('copy', 12)}</button>
            </div>
            <div class="rdv2-concierge-btns">
              <button class="rdv2-cta-btn" onclick="window.open('${preCheckinUrl}','_blank')" title="Abrir pre check-in">${lcIcon('arrow-right', 13)} Abrir</button>
              <button class="rdv2-cta-btn" onclick="enviarLinkPrecheckin('${r.id}')" title="Enviar link de pré-checkin">${lcIcon('send', 13)} Enviar pré-checkin</button>
              ${r.guest_email ? `<button class="rdv2-cta-btn" onclick="openInvoiceForReservation('${r.id}',decodeURIComponent('${guestEmail}'),decodeURIComponent('${guestName}'))" title="Enviar email">${lcIcon('mail', 13)} Email</button>` : ''}
            </div>` : `
            <div class="rdv2-concierge-btns">
              <button class="rdv2-cta-btn" onclick="enviarLinkPrecheckin('${r.id}', false)" title="Gerar link de pré-checkin">${lcIcon('link', 13)} Gerar pré-checkin</button>
            </div>`}
          </div>` : ''}

          <!-- Documentos -->
          <div class="rdv2-widget rdv2-widget-docs">
            <div class="rdv2-widget-title">Documentos</div>
            <button class="rdv2-doc-link" onclick="openReservationSheet('${r.id}')">${lcIcon('clipboard', 12)} Ficha de reserva</button>
            <button class="rdv2-doc-link" onclick="openGuestCard('${r.guest_id}','${r.id}')">${lcIcon('user', 12)} Ficha de hóspede</button>
            <button class="rdv2-doc-link" onclick="openAccountStatement('${r.id}')">${lcIcon('credit-card', 12)} Conta corrente</button>
          </div>

        </div>
      </div>

      <!-- Painéis Tarefas / Timeline (carregados ao abrir a tab) -->
      <div id="rdv2-panel-tarefas" style="display:none;"></div>
      <div id="rdv2-panel-timeline" style="display:none;"></div>
    `;
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    toast('❌ Erro ao carregar detalhe.', 'error');
    showReservasList();
  }
}

async function updateDetailStatus(id, field, value) {
  try {
    const res = await apiPut(`/api/reservations/${id}`, { [field]: value });
    if (res.success) {
      toast('✅ Estado atualizado', 'success');
      await loadReservas();
    } else {
      toast('❌ ' + (res.error || 'Erro ao atualizar'), 'error');
    }
  } catch (e) {
    toast('❌ Erro de ligação', 'error');
  }
}

