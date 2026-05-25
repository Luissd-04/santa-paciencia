let sortCol = SS.get('res:sort', 'check_in');
let sortAsc = SS.get('res:asc', true);
let mobileChipFilter = SS.get('res:chip', '');
let reservasViewMode = SS.get('res:view', 'card');
let reservasDetailOpen = false;

function setMobileChip(el, filter) {
  mobileChipFilter = filter;
  SS.set('res:chip', filter);
  document.querySelectorAll('.mobile-filter-chips .chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderMobileCards();
}

const STATUS_COLORS = {
  confirmada: 'var(--marca)',
  pendente:   'var(--laranja)',
  cancelada:  'var(--vermelho)',
};

function renderResCardHeader(r) {
  return `<div class="mrc-top">
      <div>
        <div class="mrc-name">${r.guest_name}</div>
        <div class="mrc-id">${r.id} · ${r.accommodation_name}</div>
      </div>
      ${badgeEstado(r.status)}
    </div>`;
}

function renderResCardMeta(r) {
  return `<div class="mrc-meta">
      <div class="mrc-meta-item"><i data-lucide="calendar"></i> ${formatDate(r.check_in)}</div>
      <div class="mrc-meta-item"><i data-lucide="moon"></i> ${r.nights} noite${r.nights !== 1 ? 's' : ''}</div>
    </div>`;
}

function renderResCardTotal(r) {
  const paid  = Number(r.amount_paid  || 0);
  const total = Number(r.total_amount || 0);
  const rem   = total - paid;
  const remHtml = paid > 0 && rem > 0.01
    ? `<span style="font-size:11px;color:var(--vermelho);display:block;">falta €${rem.toFixed(2)}</span>`
    : '';
  return `<div class="mrc-total">
      <span class="mrc-channel">${r.channel || '—'} · ${badgePagamento(r.payment_status)}</span>
      <span class="mrc-price">€${total.toFixed(2)}${remHtml}</span>
    </div>`;
}

function renderResCardActions(r) {
  return `<div class="mrc-actions" onclick="event.stopPropagation()">
      <button class="m-card-btn primary" onclick="showDetail('${r.id}')">
        <i data-lucide="eye"></i> Ver
      </button>
      <button class="m-card-btn" onclick="openEditModal('${r.id}')">
        <i data-lucide="pencil"></i> Editar
      </button>
    </div>`;
}

function renderResCard(r) {
  const bc = STATUS_COLORS[r.status] || 'var(--marca)';
  return `<div class="m-res-card" style="border-left-color:${bc}" onclick="showDetail('${r.id}')">
    ${renderResCardHeader(r)}
    ${renderResCardMeta(r)}
    ${renderResCardTotal(r)}
    ${renderResCardActions(r)}
  </div>`;
}

function renderMobileCards() {
  const container = document.getElementById('mobile-res-cards');
  if (!container) return;

  const searchEl = document.getElementById('search-input') || document.getElementById('mobile-search-input');
  const q = (searchEl?.value || '').toLowerCase();
  const fe = document.getElementById('filter-estado')?.value || '';
  const fs = document.getElementById('filter-suite')?.value || '';
  const fc = document.getElementById('filter-canal')?.value || '';
  const fp = document.getElementById('filter-pagamento')?.value || '';
  const fd = normalizeIsoDateValue(document.getElementById('filter-date-from')?.value || '');
  const ft = normalizeIsoDateValue(document.getElementById('filter-date-to')?.value || '');
  const filtered = reservas.filter(r => {
    const matchQ = !q || (r.guest_name + ' ' + r.id + ' ' + (r.guest_email || '') + ' ' + r.accommodation_name).toLowerCase().includes(q);
    const matchE = !fe || r.status === fe;
    const matchS = !fs || r.accommodation_id === fs;
    const matchC = !fc || r.channel === fc;
    const matchP = !fp || r.payment_status === fp;
    const matchD = !fd || r.check_in >= fd;
    const matchT = !ft || r.check_out <= ft;
    return matchQ && matchE && matchS && matchC && matchP && matchD && matchT;
  }).sort((a, b) => new Date(b.check_in) - new Date(a.check_in));
  updateReservasSummary(filtered.length, filtered.length === 1 ? 'reserva visível' : 'resultados visíveis');

  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="es-icon">📭</div><h3>Sem reservas</h3><p>Nenhuma reserva encontrada.</p></div>';
    return;
  }

  container.innerHTML = filtered.map(renderResCard).join('');
  if (window.lucide) lucide.createIcons();
}

function updateReservasViewToggle() {
  document.querySelectorAll('[data-res-view]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.resView === reservasViewMode);
  });
  moveReservasViewPill();
}

function moveReservasViewPill() {
  const pill = document.getElementById('reservas-view-pill');
  const toggle = document.getElementById('reservas-view-toggle');
  if (!pill || !toggle) return;
  const activeBtn = toggle.querySelector(`.cal-mode-btn[data-res-view="${reservasViewMode}"]`);
  if (!activeBtn) return;
  const toggleRect = toggle.getBoundingClientRect();
  const btnRect = activeBtn.getBoundingClientRect();
  pill.style.left = (btnRect.left - toggleRect.left) + 'px';
  pill.style.width = btnRect.width + 'px';
}

function applyReservasViewMode() {
  if (reservasDetailOpen) return;
  const cards = document.getElementById('reservas-mobile');
  const list = document.getElementById('reservas-desktop');
  if (cards) cards.style.setProperty('display', reservasViewMode === 'card' ? 'block' : 'none', 'important');
  if (list) list.style.setProperty('display', reservasViewMode === 'list' ? 'block' : 'none', 'important');
  updateReservasViewToggle();
}

function setReservasViewMode(mode) {
  reservasViewMode = mode === 'list' ? 'list' : 'card';
  SS.set('res:view', reservasViewMode);
  renderTabela();
  requestAnimationFrame(moveReservasViewPill);
}


async function loadReservas() {
  // Restore persisted filters
  const sv = (id, key) => { const el = document.getElementById(id); if (el && !el.value) el.value = SS.get(key, ''); };
  sv('search-input', 'res:q'); sv('filter-estado', 'res:fe'); sv('filter-suite', 'res:fs');
  sv('filter-canal', 'res:fc'); sv('filter-pagamento', 'res:fp');
  sv('filter-date-from', 'res:fd'); sv('filter-date-to', 'res:ft');
  AppUI.refreshDropdowns(document.getElementById('view-reservas'));
  // Restore sort icon
  document.querySelectorAll('.sort-icon').forEach(el => { el.textContent = '↕'; el.style.opacity = '0.25'; });
  const sIcon = document.getElementById('sort-' + sortCol);
  if (sIcon) { sIcon.textContent = sortAsc ? '↑' : '↓'; sIcon.style.opacity = '1'; }

  document.getElementById('tabela-loading').style.display = 'flex';
  document.getElementById('tabela-body').innerHTML = '';
  document.getElementById('tabela-empty').style.display = 'none';
  try {
    const data = await apiGet('/api/reservations');
    reservas = data.data || [];
    if (window.PubSub) PubSub.emit('reservas:updated', reservas);
    renderTabela();
  } catch (e) {
    toast('❌ Erro ao carregar reservas. Backend ligado?', 'error');
    document.getElementById('tabela-loading').style.display = 'none';
  }
}

function sortTabela(col) {
  if (sortCol === col) {
    sortAsc = !sortAsc;
  } else {
    sortCol = col;
    sortAsc = true;
  }
  SS.set('res:sort', sortCol);
  SS.set('res:asc', sortAsc);
  document.querySelectorAll('.sort-icon').forEach(el => { el.textContent = '↕'; el.style.opacity = '0.25'; });
  const icon = document.getElementById('sort-' + col);
  if (icon) { icon.textContent = sortAsc ? '↑' : '↓'; icon.style.opacity = '1'; }
  renderTabela();
}

function renderTabela() {
  const q  = (document.getElementById('search-input')    || { value: '' }).value.toLowerCase();
  const fe = (document.getElementById('filter-estado')   || { value: '' }).value;
  const fs = (document.getElementById('filter-suite')    || { value: '' }).value;
  const fc = (document.getElementById('filter-canal')    || { value: '' }).value;
  const fp = (document.getElementById('filter-pagamento')|| { value: '' }).value;
  const fd = normalizeIsoDateValue((document.getElementById('filter-date-from')|| { value: '' }).value);
  const ft = normalizeIsoDateValue((document.getElementById('filter-date-to')  || { value: '' }).value);
  SS.set('res:q', document.getElementById('search-input')?.value || '');
  SS.set('res:fe', fe); SS.set('res:fs', fs); SS.set('res:fc', fc);
  SS.set('res:fp', fp); SS.set('res:fd', fd); SS.set('res:ft', ft);

  let data = reservas.filter(r => {
    const matchQ = !q || (r.guest_name + ' ' + r.id + ' ' + (r.guest_email || '') + ' ' + r.accommodation_name).toLowerCase().includes(q);
    const matchE = !fe || r.status === fe;
    const matchS = !fs || r.accommodation_id === fs;
    const matchC = !fc || r.channel === fc;
    const matchP = !fp || r.payment_status === fp;
    const matchD = !fd || r.check_in >= fd;
    const matchT = !ft || r.check_out <= ft;
    return matchQ && matchE && matchS && matchC && matchP && matchD && matchT;
  }).sort((a, b) => {
    let va = a[sortCol] ?? '';
    let vb = b[sortCol] ?? '';
    if (sortCol === 'check_in' || sortCol === 'check_out') {
      va = new Date(va); vb = new Date(vb);
    } else if (sortCol === 'total_amount' || sortCol === 'nights') {
      va = Number(va); vb = Number(vb);
    } else {
      va = String(va).toLowerCase(); vb = String(vb).toLowerCase();
    }
    if (va < vb) return sortAsc ? -1 : 1;
    if (va > vb) return sortAsc ? 1 : -1;
    return 0;
  });

  const tbody = document.getElementById('tabela-body');
  const empty = document.getElementById('tabela-empty');
  const loading = document.getElementById('tabela-loading');

  loading.style.display = 'none';
  updateReservasSummary(data.length, data.length === 1 ? 'reserva visível' : 'resultados visíveis');

  if (data.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    renderMobileCards();
    applyReservasViewMode();
    return;
  }
  empty.style.display = 'none';
  renderMobileCards();
  tbody.innerHTML = data.map(r => `
    <tr onclick="showDetail('${r.id}')">
      <td><code style="font-size:11.5px;color:var(--azul-claro)">${r.id}</code></td>
      <td><b>${r.guest_name}</b><br><span style="font-size:11.5px;color:var(--cinza)">${r.guest_email || ''}</span></td>
      <td>${accomChip(r)}</td>
      <td>${formatDate(r.check_in)}</td>
      <td>${formatDate(r.check_out)}</td>
      <td>${r.nights}</td>
      <td>${renderGuestsCell(r)}</td>
      <td><b>€${Number(r.total_amount || 0).toFixed(2)}</b></td>
      <td><span style="font-size:12px;color:var(--cinza)">${r.channel}</span></td>
      <td>${badgeEstado(r.status)}</td>
      <td>${badgePagamento(r.payment_status)}${(() => {
        const paid = Number(r.amount_paid || 0);
        const total = Number(r.total_amount || 0);
        if (paid <= 0) return '';
        const rem = total - paid;
        if (rem > 0.01) return `<br><span style="font-size:11px;color:var(--vermelho);">€${paid.toFixed(2)} / falta €${rem.toFixed(2)}</span>`;
        return `<br><span style="font-size:11px;color:var(--cinza);">€${paid.toFixed(2)}</span>`;
      })()}</td>
      <td onclick="event.stopPropagation()" style="white-space:nowrap">
        <button class="btn btn-ghost btn-sm" onclick="openEditModal('${r.id}')" title="Editar">
          ${lcIcon('pencil', 13)}
        </button>
        ${r.status === 'cancelada'
          ? `<button class="btn btn-sm" style="background:rgba(46,125,82,.12);color:#2e7d52" onclick="reativarReserva('${r.id}')" title="Reativar reserva">
               ${lcIcon('refresh-cw', 13)}
             </button>`
          : `<button class="btn btn-sm" style="background:rgba(176,48,48,.1);color:var(--vermelho)" onclick="deleteReserva('${r.id}')" title="Cancelar reserva">
               ${lcIcon('trash-2', 13)}
             </button>`}
      </td>
    </tr>`).join('');
  if (window.lucide) lucide.createIcons();
  applyReservasViewMode();
}

function renderGuestsCell(r) {
  const adults   = r.num_adults != null ? Number(r.num_adults) : Number(r.num_guests || 0);
  const children = Number(r.num_children || 0);
  const svg = (sz, col) =>
    `<svg width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="none" stroke="${col}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;flex-shrink:0"><circle cx="12" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/></svg>`;
  const parts = [];
  if (adults   > 0) parts.push(`<span style="display:inline-flex;align-items:center;gap:3px;font-size:12px;color:var(--azul)">${adults}${svg(13,'currentColor')}</span>`);
  if (children > 0) parts.push(`<span style="display:inline-flex;align-items:center;gap:3px;font-size:12px;color:var(--azul-claro)">${children}${svg(10,'currentColor')}</span>`);
  return parts.length
    ? `<span style="display:inline-flex;align-items:center;gap:6px">${parts.join('')}</span>`
    : '—';
}

function updateReservasSummary(total, detailText) {
  const totalEl = document.getElementById('reservas-results-total');
  const detailEl = document.getElementById('reservas-results-detail');
  if (totalEl) totalEl.textContent = String(total ?? 0);
  if (detailEl) detailEl.textContent = detailText || 'resultados visíveis';
}

function setReservasDetailMode(isDetail) {
  reservasDetailOpen = isDetail;
  document.querySelectorAll('.view-toolbar-reservas, .reservas-filter-panel, #reservas-mobile, #reservas-desktop').forEach(el => {
    el.style.setProperty('display', isDetail ? 'none' : '', isDetail ? 'important' : '');
  });
  const detailPage = document.getElementById('reserva-detail-page');
  if (detailPage) detailPage.style.display = isDetail ? 'block' : 'none';
  if (!isDetail) applyReservasViewMode();
}

function showReservasList() {
  setReservasDetailMode(false);
  AppUI.closeModal('detail-bg');
  if (window.innerWidth <= 700) renderMobileCards();
}

function clearReservasFilters() {
  ['search-input', 'filter-date-from', 'filter-date-to', 'mobile-search-input'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  ['filter-estado', 'filter-suite', 'filter-canal', 'filter-pagamento'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  ['res:q', 'res:fe', 'res:fs', 'res:fc', 'res:fp', 'res:fd', 'res:ft', 'res:chip'].forEach(key => SS.set(key, ''));
  mobileChipFilter = '';
  document.querySelectorAll('.mobile-filter-chips .chip').forEach((chip, index) => {
    chip.classList.toggle('active', index === 0);
  });
  AppUI.refreshDropdowns(document.getElementById('view-reservas'));
  renderTabela();
}

async function deleteReserva(id) {
  if (!confirm('Tem a certeza que quer eliminar esta reserva?')) return;
  try {
    const res = await apiDelete(`/api/reservations/${id}`);
    if (res.success) {
      toast('🗑 Reserva cancelada.', 'info');
      await loadReservas();
      if (typeof renderCalView === 'function') renderCalView();
      renderDashboard();
    } else {
      toast('❌ ' + (res.error || 'Erro ao cancelar.'), 'error');
    }
  } catch (e) {
    toast('❌ Erro de ligação ao servidor.', 'error');
  }
}

async function showDetail(id) {
  try {
    if (!document.getElementById('view-reservas')?.classList.contains('active')) {
      window.__openingReservationDetail = true;
      showView('reservas');
      window.__openingReservationDetail = false;
    }
    setReservasDetailMode(true);
    const detailContent = document.getElementById('reserva-detail-content');
    const detailLoading = document.querySelector('#reserva-detail-page .reserva-detail-loading');
    if (detailContent) detailContent.innerHTML = '';
    if (detailLoading) detailLoading.style.display = 'flex';
    const data = await apiGet(`/api/reservations/${id}`);
    const r = data.data;
    const guestsData = typeof r.guests_data === 'string' ? JSON.parse(r.guests_data || '[]') : (r.guests_data || []);
    const acc = accommodations.find(a => a.id === r.accommodation_id);
    const paid = Number(r.amount_paid || 0);
    const total = Number(r.total_amount || 0);
    const remaining = total - paid;
    if (detailLoading) detailLoading.style.display = 'none';
    detailContent.innerHTML = `
      <div class="reserva-detail-hero">
        <button class="btn btn-ghost btn-sm" onclick="showReservasList()">
          ${lcIcon('arrow-left', 14)} Voltar
        </button>
        <div class="reserva-detail-title">
          <span>${r.id}</span>
          <h2>${r.guest_name}</h2>
        </div>
        <div class="reserva-detail-actions">
          <button class="btn btn-primary" onclick="openEditModal('${r.id}')">
            ${lcIcon('pencil', 13)} Editar
          </button>
          ${realEmail(r.guest_email) ? `<button class="btn btn-ghost" onclick="openInvoiceForReservation('${r.id}','${realEmail(r.guest_email)}','${(r.guest_name||'').replace(/'/g,"\\'")}')">
            ${lcIcon('mail', 13)} Email
          </button>` : ''}
          ${r.status === 'cancelada'
            ? `<button class="btn btn-success" onclick="reativarReserva('${r.id}')">
                ${lcIcon('refresh-cw', 13)} Reativar Reserva
               </button>`
            : `<button class="btn btn-danger" onclick="cancelarReserva('${r.id}')">
                ${lcIcon('x-circle', 13)} Cancelar Reserva
               </button>`}
        </div>
      </div>
      <div class="detail-grid">
        <div class="detail-row"><div class="detail-label">Hóspede</div><div class="detail-val"><b>${r.guest_name}</b></div></div>
        ${realEmail(r.guest_email) ? `<div class="detail-row"><div class="detail-label">Email</div><div class="detail-val">${realEmail(r.guest_email)}</div></div>` : ''}
        <div class="detail-row"><div class="detail-label">Telefone</div><div class="detail-val">${r.guest_phone || '—'}</div></div>
        <div class="detail-row"><div class="detail-label">Alojamento</div><div class="detail-val">${accomChip(r)}</div></div>
        <div class="detail-row"><div class="detail-label">Canal</div><div class="detail-val">${r.channel}</div></div>
        <div class="detail-row"><div class="detail-label">Hóspedes</div><div class="detail-val">${
          r.num_adults != null
            ? r.num_adults + ' adulto' + (r.num_adults !== 1 ? 's' : '') + (r.num_children > 0 ? ' + ' + r.num_children + ' criança' + (r.num_children !== 1 ? 's' : '') : '')
            : r.num_guests
        }</div></div>
        <div class="detail-row"><div class="detail-label">Check-in</div><div class="detail-val">${formatDate(r.check_in)}</div></div>
        <div class="detail-row"><div class="detail-label">Check-out</div><div class="detail-val">${formatDate(r.check_out)}</div></div>
        <div class="detail-row"><div class="detail-label">Noites</div><div class="detail-val">${r.nights}</div></div>
        <div class="detail-row"><div class="detail-label">Estado</div><div class="detail-val">${badgeEstado(r.status)}</div></div>
        <div class="detail-row"><div class="detail-label">Pagamento</div><div class="detail-val">${badgePagamento(r.payment_status)}</div></div>
        ${r.payment_date ? `<div class="detail-row"><div class="detail-label">Data Pagamento</div><div class="detail-val">${formatDate(r.payment_date)}</div></div>` : ''}
      </div>
      ${(() => {
        if (!guestsData.length) return '';
        return `<div style="margin-top:16px;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--cinza);margin-bottom:8px;">Hóspedes Adicionais</div>
          ${guestsData.map((g, i) => `<div style="background:var(--cinza-claro);border-radius:8px;padding:10px 14px;margin-bottom:6px;font-size:13px;">
            <b>Hóspede ${i + 2}</b> — ${g.name || '—'}
            ${g.email ? `· ${g.email}` : ''}${g.phone ? ` · ${g.phone}` : ''}${g.nationality ? ` · ${g.nationality}` : ''}
          </div>`).join('')}
        </div>`;
      })()}
      <div style="margin-top:20px;display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;">
        ${(() => {
          return [['Alojamento', (acc?.price_per_night || 0) * r.nights, false],
           ['Ocupação extra', getExtraOccupancyCharge(acc, r.num_guests || 1, r.nights || 0, guestsData.map(g => g.birth_date).filter(Boolean), r.check_in), false],
           ['Taxa Turística', r.tourist_tax || 0, false],
           ['Pequeno-almoço', r.breakfast_included ? r.num_guests * r.nights * (servicosData.find(s => s.id === 'breakfast')?.value ?? 19) : 0, false],
           ['Total', r.total_amount || 0, false]];
        })().map(([l, v, _]) => `
          <div style="background:var(--cinza-claro);border-radius:10px;padding:14px;text-align:center;">
            <div style="font-size:11px;color:var(--cinza);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">${l}</div>
            <div style="font-family:'Playfair Display',serif;font-size:22px;color:var(--azul);">€${Number(v).toFixed(2)}</div>
          </div>`).join('')}
        ${(() => {
          if (paid <= 0) return '';
          return `
          <div style="background:rgba(46,125,82,.08);border-radius:10px;padding:14px;text-align:center;border:1px solid rgba(46,125,82,.2);">
            <div style="font-size:11px;color:var(--cinza);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Valor Pago</div>
            <div style="font-family:'Playfair Display',serif;font-size:22px;color:#2e7d52;">€${paid.toFixed(2)}</div>
          </div>
          ${remaining > 0.01 ? `
          <div style="background:rgba(176,48,48,.08);border-radius:10px;padding:14px;text-align:center;border:1px solid rgba(176,48,48,.2);">
            <div style="font-size:11px;color:var(--cinza);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Em Falta</div>
            <div style="font-family:'Playfair Display',serif;font-size:22px;color:var(--vermelho);">€${remaining.toFixed(2)}</div>
          </div>` : ''}`;
        })()}
      </div>
      ${r.notes ? `<div style="margin-top:16px;background:rgba(201,168,76,.1);border-left:3px solid var(--dourado);padding:12px 16px;border-radius:6px;font-size:13.5px;color:var(--texto);">📝 ${r.notes}</div>` : ''}
      <div style="margin-top:12px;font-size:12px;color:${r.google_event_id ? 'var(--verde)' : 'var(--cinza)'};">
        ${lcIcon('calendar', 12)} ${r.google_event_id ? 'Sincronizado com Google Calendar' : 'Não sincronizado com Google Calendar'}
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    toast('❌ Erro ao carregar detalhe.', 'error');
    showReservasList();
  }
}

async function cancelarReserva(id) {
  if (!confirm('Cancelar esta reserva? Será removida do Google Calendar.')) return;
  try {
    const res = await apiDelete(`/api/reservations/${id}`);
    if (res.success) {
      AppUI.closeModal('detail-bg');
      showReservasList();
      toast('❌ Reserva cancelada.', 'info');
      await loadReservas();
      if (typeof renderCalView === 'function') renderCalView();
      renderDashboard();
    } else {
      toast('❌ ' + (res.error || 'Erro ao cancelar.'), 'error');
    }
  } catch (e) {
    toast('❌ Erro de ligação ao servidor.', 'error');
  }
}

async function reativarReserva(id) {
  if (!confirm('Reativar esta reserva? Será marcada como confirmada.')) return;
  try {
    const res = await apiPut(`/api/reservations/${id}`, { status: 'confirmada' });
    if (res.success) {
      const detailBg = document.getElementById('detail-bg');
      if (detailBg?.classList.contains('open')) detailBg.classList.remove('open');
      showReservasList();
      toast('✅ Reserva reativada!', 'success');
      await loadReservas();
      if (typeof renderCalView === 'function') renderCalView();
      renderDashboard();
    } else {
      toast('❌ ' + (res.error || 'Erro ao reativar.'), 'error');
    }
  } catch (e) {
    toast('❌ Erro de ligação ao servidor.', 'error');
  }
}

function _getFilteredReservasForExport() {
  const q  = (document.getElementById('search-input')?.value || '').toLowerCase();
  const fe = document.getElementById('filter-estado')?.value || '';
  const fs = document.getElementById('filter-suite')?.value || '';
  const fc = document.getElementById('filter-canal')?.value || '';
  const fp = document.getElementById('filter-pagamento')?.value || '';
  const fd = normalizeIsoDateValue(document.getElementById('filter-date-from')?.value || '');
  const ft = normalizeIsoDateValue(document.getElementById('filter-date-to')?.value || '');
  return reservas.filter(r => {
    const matchQ = !q  || (r.guest_name + ' ' + r.id + ' ' + (r.guest_email||'') + ' ' + r.accommodation_name).toLowerCase().includes(q);
    return matchQ &&
      (!fe || r.status === fe) &&
      (!fs || r.accommodation_id === fs) &&
      (!fc || r.channel === fc) &&
      (!fp || r.payment_status === fp) &&
      (!fd || r.check_in >= fd) &&
      (!ft || r.check_out <= ft);
  });
}

function exportReservasXLS() {
  if (typeof XLSX === 'undefined') { toast('❌ Biblioteca XLSX não carregada.', 'error'); return; }
  const data = _getFilteredReservasForExport();
  const rows = data.map(r => ({
    'ID':             r.id,
    'Hóspede':        r.guest_name,
    'Email':          r.guest_email || '',
    'Alojamento':     r.accommodation_name,
    'Check-in':       r.check_in,
    'Check-out':      r.check_out,
    'Noites':         r.nights,
    'Hóspedes':       r.num_guests,
    'Canal':          r.channel,
    'Estado':         r.status,
    'Pagamento':      r.payment_status,
    'Total (€)':      r.total_amount,
    'Pago (€)':       r.amount_paid,
    'Em falta (€)':   Math.max(0, r.total_amount - r.amount_paid),
    'Notas':          r.notes || '',
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Reservas');
  XLSX.writeFile(wb, `reservas_${new Date().toISOString().slice(0,10)}.xlsx`);
  toast('📊 Excel exportado!', 'success');
}

async function importReservasXLS(input) {
  if (typeof XLSX === 'undefined') { toast('❌ Biblioteca XLSX não carregada.', 'error'); return; }
  const file = input.files[0];
  if (!file) return;
  input.value = '';

  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      if (!rows.length) { toast('⚠️ Ficheiro vazio.', 'error'); return; }

      const pick = (row, ...keys) => {
        for (const k of keys) {
          if (row[k] !== undefined && row[k] !== '') return String(row[k]).trim();
        }
        return '';
      };
      const normalizeStatus = value => {
        const v = String(value || '').toLowerCase();
        if (v.includes('cancel')) return 'cancelada';
        if (v.includes('pend')) return 'pendente';
        return 'confirmada';
      };
      const normalizePayment = value => {
        const v = String(value || '').toLowerCase();
        if (v.includes('confirm') || v.includes('pago')) return 'confirmado';
        if (v.includes('parc')) return 'parcial';
        return 'pendente';
      };
      const normalizeImportDate = value => {
        const iso = normalizeIsoDateValue(value);
        if (iso) return iso;
        const serial = Number(value);
        const parsed = Number.isFinite(serial) && serial > 20000 ? XLSX.SSF?.parse_date_code?.(serial) : null;
        if (!parsed) return '';
        return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
      };
      const asAmount = value => parseFloat(String(value || '').replace(',', '.')) || 0;

      let created = 0, skipped = 0;
      for (const row of rows) {
        const guestName = pick(row, 'Hóspede', 'Hospede', 'guest_name', 'Nome');
        const guestEmail = pick(row, 'Email', 'guest_email') || `reserva_${Date.now()}_${created}@sem-email.local`;
        const checkIn = normalizeImportDate(pick(row, 'Check-in', 'check_in'));
        const checkOut = normalizeImportDate(pick(row, 'Check-out', 'check_out'));
        const accKey = pick(row, 'Alojamento', 'accommodation_name', 'accommodation_id');
        const acc = accommodations.find(a => a.id === accKey || a.name === accKey);
        if (!guestName || !checkIn || !checkOut || !acc) { skipped++; continue; }

        const parts = guestName.split(' ');
        const amountPaid = asAmount(pick(row, 'Pago (€)', 'Pago', 'amount_paid'));
        try {
          await apiPost('/api/reservations', {
            guest: {
              name: guestName,
              first_name: parts[0] || guestName,
              last_name: parts.slice(1).join(' '),
              email: guestEmail,
              phone: pick(row, 'Telefone', 'Phone', 'phone') || null,
              country: pick(row, 'País', 'Pais', 'country') || null,
              nationality: pick(row, 'País', 'Pais', 'country') || null,
            },
            accommodation_id: acc.id,
            check_in: checkIn,
            check_out: checkOut,
            num_guests: parseInt(pick(row, 'Hóspedes', 'Hospedes', 'num_guests'), 10) || 1,
            breakfast_included: false,
            channel: pick(row, 'Canal', 'channel') || 'direto',
            status: normalizeStatus(pick(row, 'Estado', 'status')),
            payment_status: normalizePayment(pick(row, 'Pagamento', 'payment_status')),
            payment_method: pick(row, 'Método pagamento', 'Metodo pagamento', 'payment_method') || null,
            amount_paid: amountPaid,
            notes: pick(row, 'Notas', 'notes'),
            rgpd_consent: true,
            guests_data: [],
          });
          created++;
        } catch {
          skipped++;
        }
      }
      toast(`✅ ${created} reservas importadas${skipped ? `, ${skipped} ignoradas` : ''}.`, 'success');
      await loadReservas();
      if (typeof renderCalView === 'function') renderCalView();
      if (typeof renderDashboard === 'function') renderDashboard();
    } catch (err) {
      toast('❌ Erro ao ler ficheiro: ' + err.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

function exportReservasPDF() {
  if (typeof window.jspdf === 'undefined') { toast('❌ Biblioteca jsPDF não carregada.', 'error'); return; }
  const { jsPDF } = window.jspdf;
  const doc  = new jsPDF({ orientation: 'landscape' });
  const data = _getFilteredReservasForExport();
  doc.setFontSize(16); doc.text('Reservas — Santa Paciência', 14, 18);
  doc.setFontSize(10); doc.text(`Exportado em ${new Date().toLocaleDateString('pt-PT')} · ${data.length} reserva${data.length !== 1 ? 's' : ''}`, 14, 26);
  doc.autoTable({
    startY: 32,
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [132, 52, 36], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [252, 250, 248] },
    head: [['ID','Hóspede','Alojamento','Check-in','Check-out','Noites','Canal','Estado','Total']],
    body: data.map(r => [
      r.id, r.guest_name, r.accommodation_name,
      r.check_in, r.check_out, r.nights, r.channel, r.status,
      '€' + Number(r.total_amount).toFixed(2),
    ]),
  });
  doc.save(`reservas_${new Date().toISOString().slice(0,10)}.pdf`);
  toast('📄 PDF exportado!', 'success');
}
