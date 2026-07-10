let sortCol = SS.get('res:sort', 'check_in');
let sortAsc = SS.get('res:asc', true);
let reservasViewMode = SS.get('res:view', 'card');
let reservasDetailOpen = false;

// Os chips mobile são apenas UI sobre o dropdown filter-estado — fonte única
// de verdade. syncMobileChips() realinha o chip ativo com o valor do dropdown.
function setMobileChip(el, filter) {
  const fe = document.getElementById('filter-estado');
  if (fe) {
    fe.value = filter;
    AppUI.refreshDropdowns(document.getElementById('view-reservas'));
  }
  syncMobileChips(filter);
  renderTabela();
}

function syncMobileChips(filterValue) {
  document.querySelectorAll('.mobile-filter-chips .chip').forEach(chip => {
    const on = chip.getAttribute('onclick') || '';
    const match = on.match(/setMobileChip\(this,'([^']*)'\)/);
    chip.classList.toggle('active', !!match && match[1] === (filterValue || ''));
  });
}

// Filtro partilhado entre a tabela desktop e os cards mobile (fonte única).
function getFilteredReservas() {
  const searchEl = document.getElementById('search-input') || document.getElementById('mobile-search-input');
  const q  = (searchEl?.value || '').toLowerCase();
  const fe = document.getElementById('filter-estado')?.value || '';
  const fs = document.getElementById('filter-suite')?.value || '';
  const fc = document.getElementById('filter-canal')?.value || '';
  const fp = document.getElementById('filter-pagamento')?.value || '';
  const fd = normalizeIsoDateValue(document.getElementById('filter-date-from')?.value || '');
  const ft = normalizeIsoDateValue(document.getElementById('filter-date-to')?.value || '');
  return reservas.filter(r => {
    const matchQ = !q || (r.guest_name + ' ' + r.id + ' ' + (r.guest_email || '') + ' ' + r.accommodation_name).toLowerCase().includes(q);
    const matchE = !fe || r.status === fe;
    const matchS = !fs || r.accommodation_id === fs;
    const matchC = !fc || r.channel === fc;
    const matchP = !fp || r.payment_status === fp;
    const matchD = !fd || r.check_in >= fd;
    const matchT = !ft || r.check_out <= ft;
    return matchQ && matchE && matchS && matchC && matchP && matchD && matchT;
  });
}

const STATUS_COLORS = {
  pre_reserva: 'var(--roxo)',
  confirmada: 'var(--marca)',
  pendente:   'var(--laranja)',
  pre_checkin: 'var(--dourado)',
  aguardar_pagamento: 'var(--azul-claro)',
  cancelada:  'var(--vermelho)',
};

function preCheckinUrl(token) {
  return token ? `${window.location.origin}/pre-checkin/${encodeURIComponent(token)}` : '';
}

function renderResCardHeader(r) {
  return `<div class="mrc-top">
      <div>
        <div class="mrc-name">${escapeHtml(r.guest_name)}</div>
        <div class="mrc-id">${escapeHtml(r.id)} · ${escapeHtml(r.accommodation_name)}</div>
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

  const filtered = getFilteredReservas().sort((a, b) => new Date(b.check_in) - new Date(a.check_in));
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
  const fe = document.getElementById('filter-estado')?.value || '';
  SS.set('res:q', document.getElementById('search-input')?.value || '');
  SS.set('res:fe', fe);
  SS.set('res:fs', document.getElementById('filter-suite')?.value || '');
  SS.set('res:fc', document.getElementById('filter-canal')?.value || '');
  SS.set('res:fp', document.getElementById('filter-pagamento')?.value || '');
  SS.set('res:fd', normalizeIsoDateValue(document.getElementById('filter-date-from')?.value || ''));
  SS.set('res:ft', normalizeIsoDateValue(document.getElementById('filter-date-to')?.value || ''));
  syncMobileChips(fe);

  let data = getFilteredReservas().sort((a, b) => {
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
      <td><b>${escapeHtml(r.guest_name)}</b><br><span style="font-size:11.5px;color:var(--cinza)">${escapeHtml(r.guest_email || '')}</span></td>
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
      <td onclick="event.stopPropagation()" style="white-space:nowrap"><div class="res-actions">
        ${r.status === 'pendente'
          ? `<button class="btn btn-sm" style="background:rgba(46,125,82,.12);color:#2e7d52" onclick="aprovarReserva('${r.id}')" title="Aprovar e enviar pre check-in">
               ${lcIcon('check', 13)}
             </button>`
          : ''}
        <button class="btn btn-ghost btn-sm" onclick="openEditModal('${r.id}')" title="Editar">
          ${lcIcon('pencil', 13)}
        </button>
        ${r.status === 'cancelada'
          ? `<button class="btn btn-sm" style="background:rgba(46,125,82,.12);color:#2e7d52" onclick="reativarReserva('${r.id}')" title="Reativar reserva">
               ${lcIcon('refresh-cw', 13)}
             </button>
             ${hasRole('manager') ? `<button class="btn btn-sm" style="background:rgba(176,48,48,.18);color:var(--vermelho)" onclick="apagarReservaDefinitivo('${r.id}')" title="Apagar definitivamente">
               ${lcIcon('trash-2', 13)}
             </button>` : ''}`
          : `<button class="btn btn-sm" style="background:rgba(176,48,48,.1);color:var(--vermelho)" onclick="cancelarReserva('${r.id}')" title="Cancelar reserva">
               ${lcIcon('x-circle', 13)}
             </button>`}
      </div></td>
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
  // Detalhe aberto com entrada própria no history: voltar atrás — o popstate
  // volta a chamar esta função já sem `reservaDetail` e fecha via DOM.
  if (history.state?.reservaDetail) { history.back(); return; }
  setReservasDetailMode(false);
  AppUI.closeModal('detail-bg');
  if (window.innerWidth <= 600) renderMobileCards();
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
  AppUI.refreshDropdowns(document.getElementById('view-reservas'));
  renderTabela(); // renderTabela chama syncMobileChips com o valor limpo
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

// Reserva atualmente aberta na ficha (para confirmação de edição de valores, etc.)
let _rdv2Current = null;

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
      showView('reservas');
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
            <button class="rdv2-action-link" onclick="openPaymentForm('${r.id}', ${paid}, ${total})">${lcIcon('credit-card', 12)} Registar pagamento</button>
            <button class="rdv2-action-link" data-inv='${JSON.stringify({ n: r.invoice_number || '', d: r.invoice_date || '', sd: r.invoice_sent_date || '', m: r.invoice_sent_method || '' }).replace(/'/g, "&#39;")}' onclick="openInvoiceFormFromBtn('${r.id}', this)">${lcIcon('file-text', 12)} Registar fatura</button>
            ${r.guest_email ? `<button class="rdv2-action-link" onclick="openInvoiceForReservation('${r.id}',decodeURIComponent('${guestEmail}'),decodeURIComponent('${guestName}'))">${lcIcon('mail', 12)} Enviar email</button>` : ''}
            ${r.status === 'cancelada'
              ? `<button class="rdv2-action-link rdv2-action-success" onclick="reativarReserva('${r.id}')">${lcIcon('refresh-cw', 12)} Reativar reserva</button>
                 ${hasRole('manager') ? `<button class="rdv2-action-link rdv2-action-danger" onclick="apagarReservaDefinitivo('${r.id}')">${lcIcon('trash-2', 12)} Apagar definitivamente</button>` : ''}`
              : `<button class="rdv2-action-link rdv2-action-danger" onclick="cancelarReserva('${r.id}')">${lcIcon('x-circle', 12)} Cancelar reserva</button>
                 ${hasRole('manager') ? `<button class="rdv2-action-link rdv2-action-danger" onclick="apagarReservaDefinitivo('${r.id}')">${lcIcon('trash-2', 12)} Apagar reserva</button>` : ''}`}
          </div>

          ${preCheckinUrl ? `
          <!-- Concierge -->
          <div class="rdv2-widget">
            <div class="rdv2-widget-title">Concierge</div>
            <div class="rdv2-concierge-url">
              <span class="rdv2-url-text">${preCheckinUrl}</span>
              <button class="rdv2-icon-btn" onclick="navigator.clipboard.writeText('${preCheckinUrl}');toast('🔗 Link copiado','success')" title="Copiar">${lcIcon('copy', 12)}</button>
            </div>
            <div class="rdv2-concierge-btns">
              <button class="rdv2-cta-btn" onclick="window.open('${preCheckinUrl}','_blank')" title="Abrir pre check-in">${lcIcon('arrow-right', 13)}</button>
              ${r.guest_email ? `<button class="rdv2-cta-btn" onclick="openInvoiceForReservation('${r.id}',decodeURIComponent('${guestEmail}'),decodeURIComponent('${guestName}'))" title="Enviar email">${lcIcon('mail', 13)}</button>` : ''}
            </div>
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

function openPaymentForm(reservationId, currentPaid, total) {
  const remaining = Math.max(0, total - currentPaid).toFixed(2);
  const html = `
    <div id="rdv2-pay-form" style="position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1200;display:flex;align-items:center;justify-content:center;" onclick="if(event.target===this)this.remove()">
      <div style="background:var(--surface-card);border-radius:16px;padding:24px;width:min(360px,92vw);box-shadow:0 8px 40px rgba(0,0,0,.22);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;">
          <span style="font-size:15px;font-weight:700;color:var(--text-main);">Registar Pagamento</span>
          <button onclick="document.getElementById('rdv2-pay-form').remove()" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:18px;">×</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px;">
          <div>
            <label style="font-size:11.5px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:4px;">Valor (€)</label>
            <input id="pf-amount" type="number" min="0" step="0.01" value="${remaining}" style="width:100%;padding:8px 10px;border:1px solid var(--border-soft);border-radius:8px;font-size:14px;background:var(--surface-muted);color:var(--text-main);" autocomplete="off">
          </div>
          <div>
            <label style="font-size:11.5px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:4px;">Método</label>
            <select id="pf-method" style="width:100%;padding:8px 10px;border:1px solid var(--border-soft);border-radius:8px;font-size:14px;background:var(--surface-muted);color:var(--text-main);">
              <option value="transferencia">Transferência</option>
              <option value="mbway">MBWay</option>
              <option value="numerario">Numerário</option>
              <option value="cartao">Cartão</option>
            </select>
          </div>
          <div>
            <label style="font-size:11.5px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:4px;">Data</label>
            <input id="pf-date" type="date" value="${new Date().toISOString().slice(0,10)}" style="width:100%;padding:8px 10px;border:1px solid var(--border-soft);border-radius:8px;font-size:14px;background:var(--surface-muted);color:var(--text-main);" autocomplete="off">
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:20px;justify-content:flex-end;">
          <button onclick="document.getElementById('rdv2-pay-form').remove()" style="padding:8px 16px;border:1px solid var(--border-soft);border-radius:8px;background:none;color:var(--text-muted);cursor:pointer;font-size:13px;">Cancelar</button>
          <button id="pf-save-btn" onclick="savePaymentForm('${reservationId}')" style="padding:8px 18px;border:none;border-radius:8px;background:var(--brand-shell);color:#fff;cursor:pointer;font-size:13px;font-weight:600;">Guardar</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  document.getElementById('pf-amount')?.focus();
}

async function savePaymentForm(reservationId) {
  const amount = parseFloat(document.getElementById('pf-amount')?.value);
  const method = document.getElementById('pf-method')?.value;
  const date = document.getElementById('pf-date')?.value;
  if (isNaN(amount) || amount <= 0) { toast('⚠️ Valor inválido', 'error'); return; }
  const btn = document.getElementById('pf-save-btn');
  if (btn) btn.disabled = true;
  try {
    const res = await apiPost(`/api/reservations/${reservationId}/payments`, {
      amount, method, payment_date: date || null,
    });
    if (res.success) {
      document.getElementById('rdv2-pay-form')?.remove();
      toast('✅ Pagamento registado', 'success');
      await loadReservas();
      showDetail(reservationId);
    } else {
      toast('❌ ' + (res.error || 'Erro'), 'error');
      if (btn) btn.disabled = false;
    }
  } catch (e) {
    toast('❌ Erro de ligação', 'error');
    if (btn) btn.disabled = false;
  }
}

function invoiceMethodLabel(m) {
  return { whatsapp: 'WhatsApp', email: 'Email', winmax: 'Winmax', outro: 'Outro' }[m] || m;
}

function openInvoiceFormFromBtn(reservationId, btn) {
  let inv = {};
  try { inv = JSON.parse(btn.getAttribute('data-inv') || '{}'); } catch {}
  openInvoiceForm(reservationId, inv);
}

function openInvoiceForm(reservationId, inv = {}) {
  const inp = 'width:100%;padding:8px 10px;border:1px solid var(--border-soft);border-radius:8px;font-size:14px;background:var(--surface-muted);color:var(--text-main);';
  const lbl = 'font-size:11.5px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:4px;';
  const methods = [['whatsapp', 'WhatsApp'], ['email', 'Email'], ['winmax', 'Winmax'], ['outro', 'Outro']];
  const opts = methods.map(([v, l]) => `<option value="${v}"${inv.m === v ? ' selected' : ''}>${l}</option>`).join('');
  const html = `
    <div id="rdv2-inv-form" style="position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1200;display:flex;align-items:center;justify-content:center;" onclick="if(event.target===this)this.remove()">
      <div style="background:var(--surface-card);border-radius:16px;padding:24px;width:min(380px,92vw);box-shadow:0 8px 40px rgba(0,0,0,.22);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;">
          <span style="font-size:15px;font-weight:700;color:var(--text-main);">Registar Fatura</span>
          <button onclick="document.getElementById('rdv2-inv-form').remove()" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:18px;">×</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px;">
          <div>
            <label style="${lbl}">Nº Fatura</label>
            <input id="if-number" type="text" value="${escapeHtml(inv.n || '')}" placeholder="Ex.: FT 2026/123" style="${inp}" autocomplete="off">
          </div>
          <div style="display:flex;gap:10px;">
            <div style="flex:1;">
              <label style="${lbl}">Data Fatura</label>
              <input id="if-date" type="date" value="${inv.d || ''}" style="${inp}" autocomplete="off">
            </div>
            <div style="flex:1;">
              <label style="${lbl}">Data Envio</label>
              <input id="if-sent-date" type="date" value="${inv.sd || ''}" style="${inp}" autocomplete="off">
            </div>
          </div>
          <div>
            <label style="${lbl}">Método de Envio</label>
            <select id="if-method" style="${inp}">${opts}</select>
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:20px;justify-content:flex-end;">
          <button onclick="document.getElementById('rdv2-inv-form').remove()" style="padding:8px 16px;border:1px solid var(--border-soft);border-radius:8px;background:none;color:var(--text-muted);cursor:pointer;font-size:13px;">Cancelar</button>
          <button id="if-save-btn" onclick="saveInvoiceForm('${reservationId}')" style="padding:8px 18px;border:none;border-radius:8px;background:var(--brand-shell);color:#fff;cursor:pointer;font-size:13px;font-weight:600;">Guardar</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  document.getElementById('if-number')?.focus();
}

async function saveInvoiceForm(reservationId) {
  const invoice_number      = document.getElementById('if-number')?.value.trim() || null;
  const invoice_date        = document.getElementById('if-date')?.value || null;
  const invoice_sent_date   = document.getElementById('if-sent-date')?.value || null;
  const invoice_sent_method = document.getElementById('if-method')?.value || null;
  const btn = document.getElementById('if-save-btn');
  if (btn) btn.disabled = true;
  try {
    const res = await apiPut(`/api/reservations/${reservationId}/invoice`, {
      invoice_number, invoice_date, invoice_sent_date, invoice_sent_method,
    });
    if (res.success) {
      document.getElementById('rdv2-inv-form')?.remove();
      toast('✅ Fatura registada', 'success');
      await loadReservas();
      showDetail(reservationId);
    } else {
      toast('❌ ' + (res.error || 'Erro'), 'error');
      if (btn) btn.disabled = false;
    }
  } catch (e) {
    toast('❌ Erro de ligação', 'error');
    if (btn) btn.disabled = false;
  }
}

async function deletePaymentEntry(reservationId, paymentId) {
  if (!confirm('Remover este pagamento?')) return;
  try {
    const res = await apiDelete(`/api/reservations/${reservationId}/payments/${paymentId}`);
    if (res.success) {
      toast('✅ Pagamento removido', 'success');
      await loadReservas();
      showDetail(reservationId);
    } else {
      toast('❌ ' + (res.error || 'Erro'), 'error');
    }
  } catch {
    toast('❌ Erro de ligação', 'error');
  }
}

// ── FICHA DE RESERVA (documento read-only com PDF/XLS) ──
// Estrutura dos dados do documento, partilhada entre o overlay e os exports.
function buildReservationSheetData(r) {
  const fmt = v => `€${Number(v).toFixed(2)}`;
  const sd = d => d ? new Date(d.slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
  const nightly = typeof r.nightly_prices === 'string' ? JSON.parse(r.nightly_prices || '[]') : (r.nightly_prices || []);
  const payments = r.payments || [];
  const total = Number(r.total_amount || 0);
  const paid = Number(r.amount_paid || 0);

  const baseAmount = nightly.reduce((s, n) => s + Number(n.price || 0), 0);
  const acc = accommodations.find(a => a.id === r.accommodation_id);
  const guestsData = typeof r.guests_data === 'string' ? JSON.parse(r.guests_data || '[]') : (r.guests_data || []);
  const extraOcc = getExtraOccupancyCharge(acc, r.num_guests || 1, r.nights || 0, guestsData.map(g => g.birth_date).filter(Boolean), r.check_in);
  const bkfPrice = servicosData.find(s => s.id === 'breakfast')?.value ?? 19;
  const bkfTotal = r.breakfast_included ? (r.num_guests * r.nights * bkfPrice) : 0;
  const touristTax = Number(r.tourist_tax || 0);

  const extras = [];
  if (bkfTotal > 0) extras.push({ name: 'Pequeno-almoço', amount: bkfTotal });
  if (touristTax > 0) extras.push({ name: 'Taxa turística', amount: touristTax });
  if (extraOcc > 0) extras.push({ name: 'Ocupação extra', amount: extraOcc });

  // Diferença entre o total gravado e a soma das parcelas = ajuste manual/desconto
  const parcelsSum = baseAmount + extras.reduce((s, e) => s + e.amount, 0);
  const adjustment = total - parcelsSum;

  const standardTotal = Number(r.standard_total);
  const stdDiff = !isNaN(standardTotal) && standardTotal > 0 ? total - standardTotal : null;

  return { r, fmt, sd, nightly, payments, total, paid, remaining: total - paid, baseAmount, extras, adjustment, standardTotal, stdDiff };
}

async function openReservationSheet(resId) {
  let r;
  try {
    const data = await apiGet(`/api/reservations/${resId}`);
    r = data.data;
  } catch {
    toast('❌ Erro ao carregar a ficha da reserva', 'error');
    return;
  }

  const d = buildReservationSheetData(r);
  const { fmt, sd } = d;

  const nightlyRows = d.nightly.length
    ? d.nightly.map(n => `
        <tr>
          <td>${sd(n.date)}</td>
          <td>Noite</td>
          <td style="text-align:right;font-weight:600;">${fmt(n.price)}</td>
        </tr>`).join('')
    : `<tr><td>${sd(r.check_in)} → ${sd(r.check_out)}</td><td>${r.nights} noite${r.nights !== 1 ? 's' : ''}</td><td style="text-align:right;font-weight:600;">${fmt(d.baseAmount || d.total)}</td></tr>`;

  const extraRows = d.extras.map(e => `
    <tr><td>—</td><td>${e.name}</td><td style="text-align:right;">${fmt(e.amount)}</td></tr>`).join('');

  const adjRow = Math.abs(d.adjustment) > 0.01
    ? `<tr><td>—</td><td style="color:${d.adjustment < 0 ? '#2e7d52' : '#e8710a'};">${d.adjustment < 0 ? 'Desconto / ajuste' : 'Ajuste manual'}</td><td style="text-align:right;color:${d.adjustment < 0 ? '#2e7d52' : '#e8710a'};">${fmt(d.adjustment)}</td></tr>`
    : '';

  const stdLine = d.stdDiff !== null && Math.abs(d.stdDiff) > 0.005
    ? `<div class="stmt-foot-row" style="font-size:12px;color:var(--cinza);">
        <span>${d.stdDiff < 0 ? 'Desconto face ao padrão do calendário dinâmico' : 'Acréscimo face ao padrão do calendário dinâmico'} (padrão ${fmt(d.standardTotal)})</span>
        <span style="font-weight:600;color:${d.stdDiff < 0 ? '#2e7d52' : '#e8710a'};">${fmt(d.stdDiff)}</span>
      </div>`
    : '';

  const payRows = d.payments.length
    ? d.payments.map(p => `
        <tr>
          <td>${p.payment_date ? sd(p.payment_date) : '—'}</td>
          <td>${p.method || '—'}</td>
          <td style="text-align:right;color:#2e7d52;font-weight:600;">${fmt(p.amount)}</td>
        </tr>`).join('')
    : `<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:12px;">Sem pagamentos registados</td></tr>`;

  const html = `
    <div id="sheet-overlay" style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1300;display:flex;align-items:center;justify-content:center;padding:16px;" onclick="if(event.target===this)this.remove()">
      <div class="stmt-modal" style="max-height:92vh;overflow:auto;">
        <div class="stmt-header">
          <div>
            <div class="stmt-title">Ficha de Reserva</div>
            <div class="stmt-subtitle">${escapeHtml(r.id)} · ${escapeHtml(r.guest_name)}</div>
          </div>
          <button onclick="document.getElementById('sheet-overlay').remove()" class="stmt-close">×</button>
        </div>

        <div class="stmt-summary">
          <div class="stmt-sum-row"><span>Hóspede</span><span>${escapeHtml(r.guest_name)}${r.guest_company ? ` · ${escapeHtml(r.guest_company)}` : ''}</span></div>
          ${realEmail(r.guest_email) ? `<div class="stmt-sum-row"><span>Email</span><span>${escapeHtml(realEmail(r.guest_email))}</span></div>` : ''}
          ${r.guest_phone ? `<div class="stmt-sum-row"><span>Telefone</span><span>${escapeHtml(r.guest_phone)}</span></div>` : ''}
          ${r.guest_nif ? `<div class="stmt-sum-row"><span>NIF</span><span>${escapeHtml(r.guest_nif)}</span></div>` : ''}
          <div class="stmt-sum-row"><span>Alojamento</span><span>${escapeHtml(r.accommodation_name || '—')}</span></div>
          <div class="stmt-sum-row"><span>Estadia</span><span>${sd(r.check_in)} → ${sd(r.check_out)} · ${r.nights} noite${r.nights !== 1 ? 's' : ''}</span></div>
          <div class="stmt-sum-row"><span>Ocupação</span><span>${r.num_adults || r.num_guests || 1} adulto${(r.num_adults || r.num_guests || 1) !== 1 ? 's' : ''}${r.num_children ? ` · ${r.num_children} criança${r.num_children !== 1 ? 's' : ''}` : ''}</span></div>
          <div class="stmt-sum-row"><span>Canal · Estado</span><span>${escapeHtml(r.channel || '—')} · ${escapeHtml(r.status || '—')}</span></div>
        </div>

        <table class="stmt-table">
          <thead><tr><th>Data</th><th>Descrição</th><th style="text-align:right;">Valor</th></tr></thead>
          <tbody>
            ${nightlyRows}
            ${extraRows}
            ${adjRow}
          </tbody>
        </table>

        <div class="stmt-footer">
          <div class="stmt-foot-row"><span style="font-weight:700;">TOTAL</span><span style="font-weight:700;">${fmt(d.total)}</span></div>
          ${stdLine}
        </div>

        <table class="stmt-table" style="margin-top:8px;">
          <thead><tr><th>Pagamento</th><th>Método</th><th style="text-align:right;">Valor</th></tr></thead>
          <tbody>${payRows}</tbody>
        </table>

        <div class="stmt-footer">
          <div class="stmt-foot-row"><span>Total pago</span><span style="color:#2e7d52;font-weight:700;">${fmt(d.paid)}</span></div>
          ${d.remaining > 0.01
            ? `<div class="stmt-foot-row"><span>Em falta</span><span style="color:#b03030;font-weight:700;">${fmt(d.remaining)}</span></div>`
            : `<div class="stmt-foot-row"><span style="color:#2e7d52;">✓ Pago na totalidade</span><span></span></div>`}
        </div>

        <div class="stmt-actions">
          <button class="btn btn-ghost btn-sm" onclick="document.getElementById('sheet-overlay').remove()">Fechar</button>
          <button class="btn btn-outline btn-sm" onclick="downloadReservationSheetXls()">${lcIcon('file-spreadsheet', 13)} XLS</button>
          <button class="btn btn-primary btn-sm" onclick="downloadReservationSheetPdf()">${lcIcon('file-down', 13)} PDF</button>
        </div>
      </div>
    </div>`;

  document.getElementById('sheet-overlay')?.remove();
  document.body.insertAdjacentHTML('beforeend', html);
  if (window.lucide) lucide.createIcons();
  window._sheetData = d;
}

function reservationSheetRows(d) {
  const { r, sd } = d;
  const rows = [];
  d.nightly.forEach(n => rows.push([sd(n.date), 'Noite', Number(n.price).toFixed(2)]));
  if (!d.nightly.length) rows.push([`${sd(r.check_in)} → ${sd(r.check_out)}`, `${r.nights} noites`, Number(d.baseAmount || d.total).toFixed(2)]);
  d.extras.forEach(e => rows.push(['—', e.name, e.amount.toFixed(2)]));
  if (Math.abs(d.adjustment) > 0.01) rows.push(['—', d.adjustment < 0 ? 'Desconto / ajuste' : 'Ajuste manual', d.adjustment.toFixed(2)]);
  return rows;
}

function downloadReservationSheetPdf() {
  const d = window._sheetData;
  if (!d) return;
  if (typeof window.jspdf === 'undefined') { toast('❌ Biblioteca jsPDF não carregada.', 'error'); return; }
  const { r, sd } = d;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFontSize(16);
  doc.setTextColor(132, 52, 36);
  doc.text('Ficha de Reserva', 14, 16);
  doc.setFontSize(10);
  doc.setTextColor(80);
  doc.text(`${r.id} · emitida a ${new Date().toLocaleDateString('pt-PT')}`, 14, 22);

  const info = [
    ['Hóspede', `${r.guest_name}${r.guest_company ? ` · ${r.guest_company}` : ''}`],
    ...(realEmail(r.guest_email) ? [['Email', realEmail(r.guest_email)]] : []),
    ...(r.guest_phone ? [['Telefone', r.guest_phone]] : []),
    ...(r.guest_nif ? [['NIF', r.guest_nif]] : []),
    ['Alojamento', r.accommodation_name || '—'],
    ['Estadia', `${sd(r.check_in)} → ${sd(r.check_out)} · ${r.nights} noite${r.nights !== 1 ? 's' : ''}`],
    ['Ocupação', `${r.num_adults || r.num_guests || 1} adultos${r.num_children ? ` · ${r.num_children} crianças` : ''}`],
    ['Canal · Estado', `${r.channel || '—'} · ${r.status || '—'}`],
  ];
  doc.autoTable({ body: info, startY: 28, theme: 'plain', styles: { fontSize: 9, cellPadding: 1.5 }, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 40 } } });

  doc.autoTable({
    head: [['Data', 'Descrição', 'Valor (€)']],
    body: reservationSheetRows(d),
    startY: doc.lastAutoTable.finalY + 4,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [132, 52, 36] },
    columnStyles: { 2: { halign: 'right' } },
  });

  const totals = [['TOTAL', d.total.toFixed(2)]];
  if (d.stdDiff !== null && Math.abs(d.stdDiff) > 0.005) {
    totals.push([`Padrão do calendário dinâmico: ${d.standardTotal.toFixed(2)}`, `${d.stdDiff < 0 ? 'Desconto' : 'Acréscimo'} ${Math.abs(d.stdDiff).toFixed(2)}`]);
  }
  doc.autoTable({ body: totals, startY: doc.lastAutoTable.finalY + 2, theme: 'plain', styles: { fontSize: 10, fontStyle: 'bold', cellPadding: 1.5 }, columnStyles: { 1: { halign: 'right' } } });

  doc.autoTable({
    head: [['Pagamento', 'Método', 'Valor (€)']],
    body: d.payments.length
      ? d.payments.map(p => [p.payment_date ? sd(p.payment_date) : '—', p.method || '—', Number(p.amount).toFixed(2)])
      : [['—', 'Sem pagamentos registados', '0.00']],
    startY: doc.lastAutoTable.finalY + 4,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [132, 52, 36] },
    columnStyles: { 2: { halign: 'right' } },
  });

  doc.autoTable({
    body: [['Total pago', d.paid.toFixed(2)], ['Em falta', Math.max(0, d.remaining).toFixed(2)]],
    startY: doc.lastAutoTable.finalY + 2,
    theme: 'plain',
    styles: { fontSize: 10, fontStyle: 'bold', cellPadding: 1.5 },
    columnStyles: { 1: { halign: 'right' } },
  });

  doc.save(`ficha-reserva-${r.id}.pdf`);
  toast('📄 PDF exportado!', 'success');
}

function downloadReservationSheetXls() {
  const d = window._sheetData;
  if (!d) return;
  if (typeof XLSX === 'undefined') { toast('❌ Biblioteca XLSX não carregada.', 'error'); return; }
  const { r, sd } = d;
  const aoa = [
    ['Ficha de Reserva', r.id],
    ['Hóspede', `${r.guest_name}${r.guest_company ? ` · ${r.guest_company}` : ''}`],
    ['Email', realEmail(r.guest_email) || '—'],
    ['Telefone', r.guest_phone || '—'],
    ['NIF', r.guest_nif || '—'],
    ['Alojamento', r.accommodation_name || '—'],
    ['Estadia', `${sd(r.check_in)} → ${sd(r.check_out)}`],
    ['Noites', r.nights],
    ['Ocupação', `${r.num_adults || r.num_guests || 1} adultos · ${r.num_children || 0} crianças`],
    [],
    ['Data', 'Descrição', 'Valor (€)'],
    ...reservationSheetRows(d).map(row => [row[0], row[1], Number(row[2])]),
    ['', 'TOTAL', d.total],
    ...(d.stdDiff !== null && Math.abs(d.stdDiff) > 0.005
      ? [['', `Padrão do calendário dinâmico`, d.standardTotal], ['', d.stdDiff < 0 ? 'Desconto face ao padrão' : 'Acréscimo face ao padrão', d.stdDiff]]
      : []),
    [],
    ['Pagamento', 'Método', 'Valor (€)'],
    ...(d.payments.length
      ? d.payments.map(p => [p.payment_date ? sd(p.payment_date) : '—', p.method || '—', Number(p.amount)])
      : [['—', 'Sem pagamentos', 0]]),
    ['', 'Total pago', d.paid],
    ['', 'Em falta', Math.max(0, d.remaining)],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 24 }, { wch: 34 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Ficha');
  XLSX.writeFile(wb, `ficha-reserva-${r.id}.xlsx`);
  toast('📊 XLS exportado!', 'success');
}

async function openAccountStatement(resId) {
  let r;
  try {
    const data = await apiGet(`/api/reservations/${resId}`);
    r = data.data;
  } catch {
    toast('❌ Erro ao carregar extrato', 'error');
    return;
  }

  const payments = r.payments || [];
  const total = Number(r.total_amount || 0);
  const paid = Number(r.amount_paid || 0);
  const remaining = total - paid;
  const fmt = v => `€${Number(v).toFixed(2)}`;
  const sd = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
  const methodLabel = { transferencia: 'Transferência', mbway: 'MBWay', numerario: 'Numerário', cartao: 'Cartão' };

  // Saldo corrente linha a linha (extrato bancário)
  let running = total;
  const rows = payments.length
    ? payments.map(p => {
        running -= Number(p.amount || 0);
        return `
        <tr>
          <td>${p.payment_date ? sd(p.payment_date) : '—'}</td>
          <td>${methodLabel[p.method] || p.method || '—'}</td>
          <td>${p.notes || '—'}</td>
          <td style="text-align:right;font-weight:600;color:#2e7d52;">${fmt(p.amount)}</td>
          <td style="text-align:right;color:${running > 0.01 ? '#b03030' : '#2e7d52'};">${fmt(Math.max(0, running))}</td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:16px;">Sem pagamentos registados</td></tr>`;

  const html = `
    <div id="stmt-overlay" style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1300;display:flex;align-items:center;justify-content:center;padding:16px;" onclick="if(event.target===this)this.remove()">
      <div class="stmt-modal">
        <div class="stmt-header">
          <div>
            <div class="stmt-title">Conta Corrente</div>
            <div class="stmt-subtitle">${escapeHtml(r.id)} · ${escapeHtml(r.guest_name)}</div>
          </div>
          <button onclick="document.getElementById('stmt-overlay').remove()" class="stmt-close">×</button>
        </div>

        <div class="stmt-summary">
          <div class="stmt-sum-row">
            <span>Alojamento</span><span>${escapeHtml(r.accommodation_name || '—')}</span>
          </div>
          <div class="stmt-sum-row">
            <span>Check-in</span><span>${sd(r.check_in)}</span>
          </div>
          <div class="stmt-sum-row">
            <span>Check-out</span><span>${sd(r.check_out)}</span>
          </div>
          <div class="stmt-sum-row">
            <span>Noites</span><span>${r.nights}</span>
          </div>
          <div class="stmt-sum-row stmt-sum-total">
            <span>Total da reserva</span><span>${fmt(total)}</span>
          </div>
        </div>

        <table class="stmt-table">
          <thead>
            <tr>
              <th>Data</th><th>Método</th><th>Notas</th><th style="text-align:right;">Valor</th><th style="text-align:right;">Saldo</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>

        <div class="stmt-footer">
          <div class="stmt-foot-row">
            <span>Total pago</span>
            <span style="color:#2e7d52;font-weight:700;">${fmt(paid)}</span>
          </div>
          ${remaining > 0.01 ? `<div class="stmt-foot-row">
            <span>Em falta</span>
            <span style="color:#b03030;font-weight:700;">${fmt(remaining)}</span>
          </div>` : `<div class="stmt-foot-row"><span style="color:#2e7d52;">✓ Pago na totalidade</span><span></span></div>`}
        </div>

        <div class="stmt-actions">
          <button class="btn btn-ghost btn-sm" onclick="document.getElementById('stmt-overlay').remove()">Fechar</button>
          <button class="btn btn-outline btn-sm" onclick="downloadStatementCsv('${resId}')">CSV</button>
          <button class="btn btn-outline btn-sm" onclick="downloadStatementXls()">${lcIcon('file-spreadsheet', 13)} XLS</button>
          <button class="btn btn-primary btn-sm" onclick="downloadStatementPdf()">${lcIcon('file-down', 13)} PDF</button>
        </div>
      </div>
    </div>`;

  document.getElementById('stmt-overlay')?.remove();
  document.body.insertAdjacentHTML('beforeend', html);
  if (window.lucide) lucide.createIcons();

  // Store data for CSV/XLS/PDF download
  window._stmtData = { r, payments };
}

function downloadStatementPdf() {
  const { r, payments } = window._stmtData || {};
  if (!r) return;
  if (typeof window.jspdf === 'undefined') { toast('❌ Biblioteca jsPDF não carregada.', 'error'); return; }
  const sd = d => d ? new Date(d.slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
  const total = Number(r.total_amount || 0);
  const paid = Number(r.amount_paid || 0);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFontSize(16);
  doc.setTextColor(132, 52, 36);
  doc.text('Conta Corrente', 14, 16);
  doc.setFontSize(10);
  doc.setTextColor(80);
  doc.text(`${r.id} · ${r.guest_name} · emitida a ${new Date().toLocaleDateString('pt-PT')}`, 14, 22);

  doc.autoTable({
    body: [
      ['Alojamento', r.accommodation_name || '—'],
      ['Estadia', `${sd(r.check_in)} → ${sd(r.check_out)} · ${r.nights} noite${r.nights !== 1 ? 's' : ''}`],
      ['Total da reserva', `€${total.toFixed(2)}`],
    ],
    startY: 28, theme: 'plain', styles: { fontSize: 9, cellPadding: 1.5 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 40 } },
  });

  let running = total;
  doc.autoTable({
    head: [['Data', 'Método', 'Notas', 'Valor (€)', 'Saldo (€)']],
    body: (payments || []).length
      ? payments.map(p => {
          running -= Number(p.amount || 0);
          return [p.payment_date ? sd(p.payment_date) : '—', p.method || '—', p.notes || '—', Number(p.amount).toFixed(2), Math.max(0, running).toFixed(2)];
        })
      : [['—', '—', 'Sem pagamentos registados', '0.00', total.toFixed(2)]],
    startY: doc.lastAutoTable.finalY + 4,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [132, 52, 36] },
    columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' } },
  });

  doc.autoTable({
    body: [['Total pago', `€${paid.toFixed(2)}`], ['Em falta', `€${Math.max(0, total - paid).toFixed(2)}`]],
    startY: doc.lastAutoTable.finalY + 2, theme: 'plain',
    styles: { fontSize: 10, fontStyle: 'bold', cellPadding: 1.5 },
    columnStyles: { 1: { halign: 'right' } },
  });

  doc.save(`conta-corrente-${r.id}.pdf`);
  toast('📄 PDF exportado!', 'success');
}

function downloadStatementXls() {
  const { r, payments } = window._stmtData || {};
  if (!r) return;
  if (typeof XLSX === 'undefined') { toast('❌ Biblioteca XLSX não carregada.', 'error'); return; }
  const sd = d => d ? new Date(d.slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
  const total = Number(r.total_amount || 0);
  const paid = Number(r.amount_paid || 0);
  let running = total;
  const aoa = [
    ['Conta Corrente', r.id],
    ['Hóspede', r.guest_name],
    ['Alojamento', r.accommodation_name || '—'],
    ['Estadia', `${sd(r.check_in)} → ${sd(r.check_out)}`],
    ['Total da reserva', total],
    [],
    ['Data', 'Método', 'Notas', 'Valor (€)', 'Saldo (€)'],
    ...((payments || []).length
      ? payments.map(p => {
          running -= Number(p.amount || 0);
          return [p.payment_date ? sd(p.payment_date) : '—', p.method || '—', p.notes || '—', Number(p.amount), Math.max(0, running)];
        })
      : [['—', '—', 'Sem pagamentos', 0, total]]),
    ['', '', 'Total pago', paid, ''],
    ['', '', 'Em falta', Math.max(0, total - paid), ''],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 14 }, { wch: 16 }, { wch: 30 }, { wch: 12 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Conta Corrente');
  XLSX.writeFile(wb, `conta-corrente-${r.id}.xlsx`);
  toast('📊 XLS exportado!', 'success');
}

function downloadStatementCsv(resId) {
  const { r, payments } = window._stmtData || {};
  if (!r) return;
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [
    ['Reserva', 'Hóspede', 'Check-in', 'Check-out', 'Noites', 'Total'].map(esc).join(','),
    [r.id, r.guest_name, r.check_in, r.check_out, r.nights, Number(r.total_amount).toFixed(2)].map(esc).join(','),
    '',
    ['Data pagamento', 'Método', 'Notas', 'Valor'].map(esc).join(','),
    ...(payments.length
      ? payments.map(p => [p.payment_date || '', p.method || '', p.notes || '', Number(p.amount).toFixed(2)].map(esc).join(','))
      : [['"—"', '"—"', '"—"', '"0.00"'].join(',')]),
    '',
    ['', '', 'Total pago', Number(r.amount_paid).toFixed(2)].map(esc).join(','),
    ['', '', 'Em falta', Math.max(0, Number(r.total_amount) - Number(r.amount_paid)).toFixed(2)].map(esc).join(','),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `extrato-${resId}.csv` });
  a.click();
  URL.revokeObjectURL(a.href);
}

async function openGuestCard(guestId, reservationId) {
  if (!guestId) {
    toast('⚠️ Hóspede não encontrado na base de dados', 'info');
    return;
  }
  showView('hospedes');
  await new Promise(r => setTimeout(r, 150));
  if (typeof showHospedeDetail === 'function') {
    showHospedeDetail(guestId);
  }
}

/* ─── Accommodation panel ─── */

function openAccommodationPanelFromBtn(btn) {
  const r = JSON.parse(btn.dataset.res);
  const accs = JSON.parse(btn.dataset.accs || '[]');
  openAccommodationPanel(r.id, r.accId, r.ci, r.co, r.ng, r.na, r.nc, r.bkf, r.nights, accs);
}

async function openAccommodationPanel(resId, currentAccId, checkIn, checkOut, numGuests, numAdults, numChildren, breakfast, nights, initAccsData) {
  const mainCard = document.querySelector('.rdv2-main');
  if (!mainCard) return;
  mainCard.querySelector('.rdv2-acc-panel')?.remove();
  mainCard.style.position = 'relative';

  const panel = document.createElement('div');
  panel.className = 'rdv2-acc-panel';
  panel.innerHTML = `
    <div class="rdv2-acc-panel-head">
      <span>${lcIcon('home', 13)} Editar Alojamento</span>
      <button class="rdv2-icon-btn" onclick="this.closest('.rdv2-acc-panel').remove()">${lcIcon('x', 13)}</button>
    </div>
    <div class="rdv2-acc-panel-body" id="rdv2-acc-panel-body">
      <div class="rdv2-acc-loading">A calcular preços…</div>
    </div>
    <div class="rdv2-acc-discount" id="rdv2-acc-discount" style="display:none;">
      <div class="rdv2-acc-discount-head">${lcIcon('tag', 11)} Desconto</div>
      <div class="rdv2-acc-discount-row">
        <div class="rdv2-disc-toggle">
          <button type="button" class="rdv2-disc-type active" data-type="pct" onclick="setAccDiscountType('pct')">%</button>
          <button type="button" class="rdv2-disc-type" data-type="eur" onclick="setAccDiscountType('eur')">€</button>
        </div>
        <input type="number" class="rdv2-disc-input" id="rdv2-disc-val" min="0" step="0.01" placeholder="0" oninput="updateAccPanelTotal()" autocomplete="off">
        <div class="rdv2-acc-final-price">Total: <strong id="rdv2-acc-final-total">—</strong></div>
      </div>
    </div>
    <div class="rdv2-acc-panel-foot">
      <button class="btn btn-ghost btn-sm" onclick="this.closest('.rdv2-acc-panel').remove()">Cancelar</button>
      <button class="btn btn-primary btn-sm" id="rdv2-acc-save-btn" onclick="saveAccommodationChange('${resId}')">Guardar</button>
    </div>
  `;
  mainCard.appendChild(panel);
  if (window.lucide) lucide.createIcons({ nodes: [panel] });

  panel._discType = 'pct';
  panel._rows = [];
  panel._selectedId = currentAccId;
  panel._baseTotal = 0;
  panel._nights = Number(nights) || 1;
  panel._initAccsData = Array.isArray(initAccsData) ? initAccsData : (typeof initAccsData === 'string' ? JSON.parse(initAccsData || '[]') : []);

  try {
    const availData = await apiGet(`/api/reservations/availability?check_in=${checkIn}&check_out=${checkOut}&exclude_id=${encodeURIComponent(resId)}`);
    const unavailable = new Set(availData.data?.unavailable || []);
    const numG = Number(numGuests) || 1;
    const bkf = breakfast === true || breakfast === 'true' || breakfast === 1;

    const rows = await Promise.all(accommodations.map(async (a) => {
      const periods = typeof loadWizPricingPeriods === 'function' ? await loadWizPricingPeriods(a.id) : [];
      let calc = null;
      try {
        if (window.ReservationPricing?.calculateReservationTotal) {
          calc = window.ReservationPricing.calculateReservationTotal(a, servicosData, {
            check_in: checkIn, check_out: checkOut,
            num_guests: numG, breakfast_included: bkf,
            birth_dates: [], pricing_periods: periods,
          });
        }
      } catch {}
      return { acc: a, unavail: unavailable.has(a.id), calc };
    }));

    panel._rows = rows;

    const body = document.getElementById('rdv2-acc-panel-body');
    if (!body) return;

    // Initial selection: use existing accommodations_data if available
    const initSelected = new Map();
    if (panel._initAccsData && panel._initAccsData.length > 0) {
      for (const row of panel._initAccsData) initSelected.set(row.accommodation_id, Number(row.price_per_night || 0));
    } else {
      const curRow = rows.find(r => r.acc.id === currentAccId);
      initSelected.set(currentAccId, Number(curRow?.acc?.price_per_night || 0));
    }

    body.innerHTML = rows.map(({ acc, unavail, calc }) => {
      const isCurrent = acc.id === currentAccId;
      const isChecked = initSelected.has(acc.id);
      const customPrice = initSelected.has(acc.id) ? initSelected.get(acc.id) : Number(acc.price_per_night || 0);
      return `
        <div class="rdv2-acc-option${unavail && !isChecked ? ' rdv2-acc-unavail' : ''}${isChecked ? ' rdv2-acc-selected' : ''}" data-id="${acc.id}">
          <label class="rdv2-acc-check-wrap">
            <input type="checkbox" class="rdv2-acc-cb" value="${acc.id}" ${isChecked ? 'checked' : ''} ${unavail && !isChecked ? 'disabled' : ''} onchange="onAccCheckChange(this)">
          </label>
          <div class="rdv2-acc-opt-info">
            <div class="rdv2-acc-opt-name">${acc.name}${isCurrent ? ' <span class="rdv2-badge-current">atual</span>' : ''}${unavail ? ' <span class="rdv2-badge-unavail">ocupado</span>' : ''}</div>
            <div class="rdv2-acc-opt-meta">${acc.max_guests ? `max ${acc.max_guests} hósp. · ` : ''}Base: €${Number(acc.price_per_night||0).toFixed(0)}/noite</div>
          </div>
          <div class="rdv2-acc-price-edit">
            <input type="number" class="rdv2-acc-priceinput" data-accid="${acc.id}" min="0" step="0.01" value="${customPrice.toFixed(2)}" oninput="updateAccPanelTotal()" autocomplete="off">
            <span class="rdv2-acc-priceinput-label">€/noite</span>
          </div>
        </div>`;
    }).join('');

    const discSection = document.getElementById('rdv2-acc-discount');
    if (discSection) discSection.style.display = '';
    updateAccPanelTotal();

  } catch {
    const body = document.getElementById('rdv2-acc-panel-body');
    if (body) body.innerHTML = '<div style="padding:16px;color:var(--vermelho,#b03030);font-size:13px;">Erro ao carregar alojamentos.</div>';
  }
}

function setAccDiscountType(type) {
  const panel = document.querySelector('.rdv2-acc-panel');
  if (!panel) return;
  panel._discType = type;
  panel.querySelectorAll('.rdv2-disc-type').forEach(b => b.classList.toggle('active', b.dataset.type === type));
  const inp = document.getElementById('rdv2-disc-val');
  if (inp) { inp.value = ''; inp.placeholder = type === 'pct' ? '0' : '0.00'; }
  updateAccPanelTotal();
}

function onAccCheckChange(cb) {
  const row = cb.closest('.rdv2-acc-option');
  if (row) row.classList.toggle('rdv2-acc-selected', cb.checked);
  updateAccPanelTotal();
}

function updateAccPanelTotal() {
  const panel = document.querySelector('.rdv2-acc-panel');
  if (!panel) return;
  const nights = panel._nights || 1;

  // Sum all checked accommodations: price_per_night × nights
  let base = 0;
  panel.querySelectorAll('.rdv2-acc-cb:checked').forEach(cb => {
    const accId = cb.value;
    const priceInput = panel.querySelector(`.rdv2-acc-priceinput[data-accid="${accId}"]`);
    const pricePerNight = parseFloat(priceInput?.value) || 0;
    base += pricePerNight * nights;
  });

  const discVal = parseFloat(document.getElementById('rdv2-disc-val')?.value) || 0;
  const discType = panel._discType || 'pct';
  let final = base;
  if (discVal > 0) {
    final = discType === 'pct'
      ? base * (1 - Math.min(discVal, 100) / 100)
      : Math.max(0, base - discVal);
  }
  const el = document.getElementById('rdv2-acc-final-total');
  if (el) el.textContent = `€${final.toFixed(2)}`;
  panel._baseTotal = base;
  panel._finalTotal = final;
}

async function saveAccommodationChange(resId) {
  const panel = document.querySelector('.rdv2-acc-panel');
  if (!panel) return;

  const nights = panel._nights || 1;
  const checkedItems = [];
  panel.querySelectorAll('.rdv2-acc-cb:checked').forEach(cb => {
    const accId = cb.value;
    const acc = accommodations.find(a => a.id === accId);
    const priceInput = panel.querySelector(`.rdv2-acc-priceinput[data-accid="${accId}"]`);
    const pricePerNight = parseFloat(priceInput?.value) || Number(acc?.price_per_night || 0);
    checkedItems.push({
      accommodation_id: accId,
      name: acc?.name || '',
      price_per_night: pricePerNight,
      nights,
      subtotal: pricePerNight * nights,
    });
  });

  if (checkedItems.length === 0) { toast('⚠️ Seleciona pelo menos um alojamento', 'error'); return; }

  const finalTotal = panel._finalTotal !== undefined ? panel._finalTotal : panel._baseTotal;
  const primaryAccId = checkedItems[0].accommodation_id;

  const saveBtn = document.getElementById('rdv2-acc-save-btn');
  if (saveBtn) saveBtn.disabled = true;
  try {
    const res = await apiPut(`/api/reservations/${resId}`, {
      accommodation_id: primaryAccId,
      accommodations_data: checkedItems,
      total_amount: finalTotal,
    });
    if (res.success) {
      toast('✅ Alojamento atualizado', 'success');
      panel.remove();
      await loadReservas();
      showDetail(resId);
    } else {
      toast('❌ ' + (res.error || 'Erro ao guardar'), 'error');
      if (saveBtn) saveBtn.disabled = false;
    }
  } catch {
    toast('❌ Erro de ligação', 'error');
    if (saveBtn) saveBtn.disabled = false;
  }
}

function startInlinePriceEdit(id, currentTotal) {
  const placeholder = document.getElementById('rdv2-acc-subtot');
  const totalRowEl = document.querySelector('.rdv2-total-row .rdv2-amt');
  if (!placeholder) return;

  const input = document.createElement('input');
  input.type = 'number';
  input.step = '0.01';
  input.min = '0';
  input.value = Number(currentTotal).toFixed(2);
  input.style.cssText = 'width:90px;padding:3px 6px;border:1px solid var(--brand-shell);border-radius:6px;font-size:13px;font-weight:600;text-align:right;background:var(--surface-card);color:var(--text-main);';

  const restore = (val) => {
    const span = document.createElement('span');
    span.id = 'rdv2-acc-subtot';
    span.className = 'rdv2-amt';
    span.textContent = `€${Number(val).toFixed(2)}`;
    input.replaceWith(span);
    return span;
  };

  let saving = false;
  const save = async () => {
    if (saving) return;
    saving = true;
    const newVal = parseFloat(input.value);
    if (isNaN(newVal) || newVal < 0) { saving = false; input.focus(); return; }
    const span = restore(newVal);
    // Confirmar alteração de valores contra o padrão do calendário dinâmico
    if (Math.abs(newVal - Number(currentTotal)) > 0.005
        && typeof confirmPriceChange === 'function'
        && _rdv2Current?.standard_total != null) {
      const ok = await confirmPriceChange({
        standardTotal: _rdv2Current.standard_total,
        newTotal: newVal,
        editedAt: _rdv2Current.price_edited_at,
        editedByName: _rdv2Current.price_edited_by_name,
      });
      if (!ok) {
        span.textContent = `€${Number(currentTotal).toFixed(2)}`;
        saving = false;
        return;
      }
    }
    try {
      const res = await apiPut(`/api/reservations/${id}`, { total_amount: newVal });
      if (res.success) {
        if (totalRowEl) totalRowEl.textContent = `€${newVal.toFixed(2)}`;
        toast('✅ Preço atualizado', 'success');
        await loadReservas();
      } else {
        span.textContent = `€${Number(currentTotal).toFixed(2)}`;
        toast('❌ ' + (res.error || 'Erro ao atualizar'), 'error');
      }
    } catch (e) {
      span.textContent = `€${Number(currentTotal).toFixed(2)}`;
      toast('❌ Erro de ligação', 'error');
    }
  };

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); save(); }
    if (e.key === 'Escape') { restore(currentTotal); }
  });
  input.addEventListener('blur', save);

  placeholder.replaceWith(input);
  input.select();
}

async function aprovarReserva(id) {
  if (!confirm('Aprovar esta reserva e enviar o email de pre check-in ao hóspede?')) return;
  try {
    const res = await apiPost(`/api/reservations/${id}/approve`, {});
    if (res.success) {
      toast('✅ Reserva aprovada e pre check-in enviado.', 'success');
      await loadReservas();
      if (typeof renderCalView === 'function') renderCalView();
      if (typeof renderDashboard === 'function') renderDashboard();
      showDetail(id);
    } else {
      toast('❌ ' + (res.error || 'Erro ao aprovar reserva.'), 'error');
    }
  } catch (e) {
    toast('❌ ' + (e?.payload?.error || e?.message || 'Erro de ligação ao servidor.'), 'error');
  }
}

async function copyPreCheckinLink(token) {
  const url = preCheckinUrl(token);
  if (!url) return;
  try {
    await navigator.clipboard.writeText(url);
    toast('Link de pre check-in copiado.', 'success');
  } catch (_) {
    toast(url, 'info');
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

// Verifica se o utilizador tem pelo menos um determinado role na hierarquia
// owner > manager > staff. Usado para esconder ações destrutivas.
function hasRole(minRole) {
  const rank = { staff: 1, manager: 2, owner: 3 };
  const userRank = rank[currentUser?.role] || 0;
  return userRank >= (rank[minRole] || 0);
}

async function apagarReservaDefinitivo(id) {
  const r = (typeof reservas !== 'undefined' ? reservas : []).find(x => x.id === id);
  if (!confirm('⚠️ Esta reserva vai ser APAGADA e depois é IMPOSSÍVEL recuperar.\n\nOs pagamentos e tarefas operacionais associados também serão removidos. O hóspede e o histórico de emails são mantidos.')) return;
  if (!confirm('Confirmar eliminação definitiva? Esta ação NÃO pode ser desfeita.')) return;
  try {
    // O backend só apaga reservas já canceladas — cancelar primeiro se necessário.
    if (r && r.status !== 'cancelada') {
      const c = await apiDelete(`/api/reservations/${id}`);
      if (!c.success) { toast('❌ ' + (c.error || 'Erro ao apagar.'), 'error'); return; }
    }
    const res = await apiDelete(`/api/reservations/${id}/permanent`);
    if (res.success) {
      const detailBg = document.getElementById('detail-bg');
      if (detailBg?.classList.contains('open')) detailBg.classList.remove('open');
      showReservasList();
      toast('🗑 Reserva apagada definitivamente.', 'info');
      await loadReservas();
      if (typeof renderCalView === 'function') renderCalView();
      renderDashboard();
    } else {
      toast('❌ ' + (res.error || 'Erro ao apagar.'), 'error');
    }
  } catch (e) {
    toast('❌ Erro de ligação ao servidor.', 'error');
  }
}

async function reativarReserva(id) {
  if (!confirm('Reativar esta reserva? Vai restaurar os estados que existiam antes do cancelamento.')) return;
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
        if (v.includes('pre')) return 'pre_checkin';
        if (v.includes('pagamento')) return 'aguardar_pagamento';
        if (v.includes('pend')) return 'pendente';
        return 'confirmada';
      };
      const normalizePayment = value => {
        const v = String(value || '').toLowerCase();
        if (v.includes('confirm') || v.includes('pago') || v.includes('completo')) return 'confirmado';
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

// Ao escolher "check-in a partir de", abre automaticamente o date-picker do "até".
function _openDateTo() {
  const to = document.getElementById('filter-date-to');
  if (!to || to.value) return;
  if (window.AppDatePicker) setTimeout(() => AppDatePicker.open(to), 80);
}
