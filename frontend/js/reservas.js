let sortCol = 'check_in';
let sortAsc = true;

async function loadReservas() {
  document.getElementById('tabela-loading').style.display = 'flex';
  document.getElementById('tabela-body').innerHTML = '';
  document.getElementById('tabela-empty').style.display = 'none';
  try {
    const data = await apiGet('/api/reservations');
    reservas = data.data || [];
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
  document.querySelectorAll('.sort-icon').forEach(el => el.textContent = '');
  const icon = document.getElementById('sort-' + col);
  if (icon) icon.textContent = sortAsc ? '↑' : '↓';
  renderTabela();
}

function renderTabela() {
  const q  = (document.getElementById('search-input')    || { value: '' }).value.toLowerCase();
  const fe = (document.getElementById('filter-estado')   || { value: '' }).value;
  const fs = (document.getElementById('filter-suite')    || { value: '' }).value;
  const fc = (document.getElementById('filter-canal')    || { value: '' }).value;
  const fp = (document.getElementById('filter-pagamento')|| { value: '' }).value;
  const fd = (document.getElementById('filter-date-from')|| { value: '' }).value;
  const ft = (document.getElementById('filter-date-to')  || { value: '' }).value;

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

  if (data.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  tbody.innerHTML = data.map(r => `
    <tr onclick="showDetail('${r.id}')">
      <td><code style="font-size:11.5px;color:var(--azul-claro)">${r.id}</code></td>
      <td><b>${r.guest_name}</b><br><span style="font-size:11.5px;color:var(--cinza)">${r.guest_email || ''}</span></td>
      <td><span class="chip-aloj chip-${r.accommodation_id}">${r.accommodation_name}</span></td>
      <td>${formatDate(r.check_in)}</td>
      <td>${formatDate(r.check_out)}</td>
      <td>${r.nights}</td>
      <td><b>€${Number(r.total_amount || 0).toFixed(2)}</b></td>
      <td><span style="font-size:12px;color:var(--cinza)">${r.channel}</span></td>
      <td>${badgeEstado(r.status)}</td>
      <td>${badgePagamento(r.payment_status)}</td>
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
}

function toggleGuestExtra(btn) {
  const wrap = document.getElementById('guest-extra-fields');
  if (!wrap) return;
  const open = wrap.classList.toggle('open');
  wrap.style.display = open ? '' : 'none';
  const icon = btn.querySelector('i[data-lucide]');
  if (icon) { icon.setAttribute('data-lucide', open ? 'chevron-up' : 'chevron-down'); if (window.lucide) lucide.createIcons(); }
}

function _resetGuestFields() {
  ['f-primeiro-nome','f-apelido','f-email','f-tel','f-nacionalidade','f-pais',
   'f-doc-num','f-nascimento','f-nif','f-morada','f-cp','f-cidade','f-notas'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const docTipo = document.getElementById('f-doc-tipo'); if (docTipo) docTipo.value = '';
  const rgpd = document.getElementById('f-rgpd-check'); if (rgpd) { rgpd.checked = false; rgpd.closest('.rgpd-box')?.classList.remove('rgpd-accepted'); }
  const extra = document.getElementById('guest-extra-fields');
  if (extra) { extra.classList.remove('open'); extra.style.display = 'none'; }
}

function openModal() {
  editingId = null;
  document.getElementById('modal-title').textContent = 'Nova Reserva';
  document.getElementById('btn-guardar').textContent = 'Guardar Reserva';
  _resetGuestFields();
  document.getElementById('f-checkin').value = '';
  document.getElementById('f-checkout').value = '';
  document.getElementById('f-num-hospedes').value = 2;
  document.getElementById('f-breakfast').value = 'false';
  document.getElementById('f-canal').value = 'direto';
  document.getElementById('f-pagamento').value = 'transferencia';
  document.getElementById('f-noites').value = '';
  document.getElementById('f-total').value = '';
  renderExtraGuests();
  document.getElementById('modal-bg').classList.add('open');
}

async function openEditModal(id) {
  try {
    const data = await apiGet(`/api/reservations/${id}`);
    const r = data.data;
    let guestFull = {};
    try { const gd = await apiGet(`/api/guests/${r.guest_id}`); guestFull = gd.data || {}; } catch {}

    editingId = id;
    document.getElementById('modal-title').textContent = 'Editar Reserva — ' + id;
    document.getElementById('btn-guardar').textContent = 'Atualizar Reserva';
    _resetGuestFields();

    const nameParts = (r.guest_name || '').trim().split(' ');
    document.getElementById('f-primeiro-nome').value = guestFull.first_name || nameParts[0] || '';
    document.getElementById('f-apelido').value        = guestFull.last_name  || nameParts.slice(1).join(' ') || '';
    document.getElementById('f-email').value          = r.guest_email || '';
    document.getElementById('f-tel').value            = r.guest_phone || '';
    document.getElementById('f-nacionalidade').value  = guestFull.nationality || '';
    document.getElementById('f-pais').value           = guestFull.country || '';
    document.getElementById('f-doc-tipo').value       = guestFull.document_type || '';
    document.getElementById('f-doc-num').value        = guestFull.document_number || '';
    document.getElementById('f-nascimento').value     = guestFull.birth_date || '';
    document.getElementById('f-nif').value            = guestFull.nif || '';
    document.getElementById('f-morada').value         = guestFull.address || '';
    document.getElementById('f-cp').value             = guestFull.postal_code || '';
    document.getElementById('f-cidade').value         = guestFull.city || '';

    if (guestFull.document_type || guestFull.document_number || guestFull.birth_date || guestFull.nif || guestFull.address) {
      const extra = document.getElementById('guest-extra-fields');
      if (extra) { extra.classList.add('open'); extra.style.display = ''; }
    }

    document.getElementById('f-checkin').value       = r.check_in || '';
    document.getElementById('f-checkout').value      = r.check_out || '';
    document.getElementById('f-num-hospedes').value  = r.num_guests || 2;
    document.getElementById('f-breakfast').value     = r.breakfast_included ? 'true' : 'false';
    document.getElementById('f-canal').value         = r.channel || 'direto';
    document.getElementById('f-pagamento').value     = r.payment_method || 'transferencia';
    document.getElementById('f-notas').value         = r.notes || '';
    document.getElementById('f-noites').value        = r.nights || '';
    document.getElementById('f-total').value         = Number(r.total_amount || 0).toFixed(2);

    const rgpd = document.getElementById('f-rgpd-check');
    if (rgpd) { rgpd.checked = true; rgpd.closest('.rgpd-box')?.classList.add('rgpd-accepted'); }

    const alojSelect = document.getElementById('f-aloj');
    if (alojSelect) alojSelect.value = r.accommodation_id;

    renderExtraGuests();
    const guestsData = typeof r.guests_data === 'string' ? JSON.parse(r.guests_data || '[]') : (r.guests_data || []);
    guestsData.forEach((g, idx) => {
      const rows = document.querySelectorAll('.extra-guest-row');
      if (!rows[idx]) return;
      rows[idx].querySelector('[data-field="name"]').value        = g.name        || '';
      rows[idx].querySelector('[data-field="email"]').value       = g.email       || '';
      rows[idx].querySelector('[data-field="phone"]').value       = g.phone       || '';
      rows[idx].querySelector('[data-field="nationality"]').value = g.nationality || '';
    });
    document.getElementById('modal-bg').classList.add('open');
  } catch (e) {
    toast('❌ Erro ao carregar reserva.', 'error');
  }
}

function closeModal() {
  document.getElementById('modal-bg').classList.remove('open');
  editingId = null;
}

function calcTotal() {
  const ci = document.getElementById('f-checkin').value;
  const co = document.getElementById('f-checkout').value;
  const numHospedes = parseInt(document.getElementById('f-num-hospedes').value) || 1;
  const breakfast = document.getElementById('f-breakfast')?.value === 'true';
  const alojId = document.getElementById('f-aloj').value;
  const suite = accommodations.find(a => a.id === alojId);

  if (ci && co && suite) {
    const noites = Math.max(0, Math.round((new Date(co) - new Date(ci)) / (1000 * 60 * 60 * 24)));
    document.getElementById('f-noites').value = noites;
    const taxRate = servicosData.find(s => s.id === 'tourist_tax')?.value ?? 3;
    const bkfRate = servicosData.find(s => s.id === 'breakfast')?.value ?? 19;
    const bkfCost = breakfast ? bkfRate * numHospedes * noites : 0;
    document.getElementById('f-total').value = ((suite.price_per_night * noites) + (taxRate * numHospedes * noites) + bkfCost).toFixed(2);
  }
}

function renderExtraGuests() {
  const n = parseInt(document.getElementById('f-num-hospedes').value) || 1;
  const wrap = document.getElementById('extra-guests-wrap');
  const container = document.getElementById('extra-guests-container');
  if (!wrap || !container) return;
  if (n <= 1) { wrap.style.display = 'none'; container.innerHTML = ''; return; }
  wrap.style.display = '';
  // Preserve existing values before re-render
  const existing = Array.from(container.querySelectorAll('.extra-guest-row')).map(row => ({
    name: row.querySelector('[data-field="name"]')?.value || '',
    email: row.querySelector('[data-field="email"]')?.value || '',
    phone: row.querySelector('[data-field="phone"]')?.value || '',
    nationality: row.querySelector('[data-field="nationality"]')?.value || '',
  }));
  container.innerHTML = '';
  for (let i = 2; i <= n; i++) {
    const prev = existing[i - 2] || {};
    container.innerHTML += `
      <div class="extra-guest-row" style="background:var(--cinza-claro);border-radius:10px;padding:14px;margin-bottom:12px;">
        <div style="font-size:12px;font-weight:700;color:var(--cinza);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;">Hóspede ${i}</div>
        <div class="form-grid" style="margin:0;">
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">Nome</label>
            <input class="form-control" data-field="name" placeholder="Nome completo" value="${prev.name || ''}">
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">Email</label>
            <input class="form-control" data-field="email" type="email" placeholder="email@exemplo.com" value="${prev.email || ''}">
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">Telefone</label>
            <input class="form-control" data-field="phone" placeholder="+351..." value="${prev.phone || ''}">
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">Nacionalidade</label>
            <input class="form-control" data-field="nationality" placeholder="Portuguesa" value="${prev.nationality || ''}">
          </div>
        </div>
      </div>`;
  }
  if (window.lucide) lucide.createIcons();
}

function collectExtraGuests() {
  return Array.from(document.querySelectorAll('.extra-guest-row')).map(row => ({
    name:        row.querySelector('[data-field="name"]')?.value        || '',
    email:       row.querySelector('[data-field="email"]')?.value       || '',
    phone:       row.querySelector('[data-field="phone"]')?.value       || '',
    nationality: row.querySelector('[data-field="nationality"]')?.value || '',
  })).filter(g => g.name || g.email);
}

async function saveReserva() {
  const primeiroNome = document.getElementById('f-primeiro-nome').value.trim();
  const apelido      = document.getElementById('f-apelido').value.trim();
  const email        = document.getElementById('f-email').value.trim();
  const tel          = document.getElementById('f-tel').value.trim();
  const nacionalidade = document.getElementById('f-nacionalidade').value.trim();
  const checkin  = document.getElementById('f-checkin').value;
  const checkout = document.getElementById('f-checkout').value;
  const alojId   = document.getElementById('f-aloj').value;
  const rgpdCheck = document.getElementById('f-rgpd-check');

  if (!primeiroNome) { toast('Por favor insira o nome do hóspede.', 'error'); return; }
  if (!apelido)      { toast('Por favor insira o apelido do hóspede.', 'error'); return; }
  if (!email)        { toast('Por favor insira o email do hóspede.', 'error'); return; }
  if (!tel)          { toast('Por favor insira o telefone do hóspede.', 'error'); return; }
  if (!nacionalidade){ toast('Por favor insira a nacionalidade do hóspede.', 'error'); return; }
  if (!checkin || !checkout) { toast('Por favor selecione as datas.', 'error'); return; }
  if (checkin >= checkout) { toast('O check-out deve ser depois do check-in.', 'error'); return; }
  if (rgpdCheck && !rgpdCheck.checked) {
    toast('O hóspede tem de aceitar o tratamento de dados (RGPD) para continuar.', 'error');
    rgpdCheck.closest('.rgpd-box')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  const nomeFull = (primeiroNome + ' ' + apelido).trim();
  const btn = document.getElementById('btn-guardar');
  btn.disabled = true;
  btn.textContent = '⏳ A guardar...';

  try {
    if (editingId) {
      const body = {
        check_in: checkin,
        check_out: checkout,
        num_guests: parseInt(document.getElementById('f-num-hospedes').value) || 1,
        breakfast_included: document.getElementById('f-breakfast')?.value === 'true',
        channel: document.getElementById('f-canal').value,
        payment_method: document.getElementById('f-pagamento').value,
        notes: document.getElementById('f-notas').value,
        guests_data: collectExtraGuests(),
        guest: {
          name: nomeFull, first_name: primeiroNome, last_name: apelido,
          email, phone: tel, nationality: nacionalidade,
          country:        document.getElementById('f-pais')?.value        || null,
          document_type:  document.getElementById('f-doc-tipo')?.value    || null,
          document_number:document.getElementById('f-doc-num')?.value     || null,
          birth_date:     document.getElementById('f-nascimento')?.value  || null,
          nif:            document.getElementById('f-nif')?.value         || null,
          address:        document.getElementById('f-morada')?.value      || null,
          postal_code:    document.getElementById('f-cp')?.value          || null,
          city:           document.getElementById('f-cidade')?.value      || null,
        },
      };
      const res = await apiPut(`/api/reservations/${editingId}`, body);
      if (res.success) {
        toast('✅ Reserva atualizada!', 'success');
        closeModal();
        await loadReservas();
        renderDashboard();
      } else {
        toast('❌ ' + (res.error || 'Erro ao atualizar reserva.'), 'error');
      }
    } else {
      const body = {
        guest: {
          name: nomeFull, first_name: primeiroNome, last_name: apelido,
          email, phone: tel, nationality: nacionalidade,
          country:        document.getElementById('f-pais')?.value        || null,
          document_type:  document.getElementById('f-doc-tipo')?.value    || null,
          document_number:document.getElementById('f-doc-num')?.value     || null,
          birth_date:     document.getElementById('f-nascimento')?.value  || null,
          nif:            document.getElementById('f-nif')?.value         || null,
          address:        document.getElementById('f-morada')?.value      || null,
          postal_code:    document.getElementById('f-cp')?.value          || null,
          city:           document.getElementById('f-cidade')?.value      || null,
        },
        accommodation_id: alojId,
        check_in: checkin,
        check_out: checkout,
        num_guests: parseInt(document.getElementById('f-num-hospedes').value) || 1,
        breakfast_included: document.getElementById('f-breakfast')?.value === 'true',
        channel: document.getElementById('f-canal').value,
        payment_method: document.getElementById('f-pagamento').value,
        notes: document.getElementById('f-notas').value,
        rgpd_consent: true,
        guests_data: collectExtraGuests(),
      };
      const res = await apiPost('/api/reservations', body);
      if (res.success) {
        toast('✅ Reserva criada com sucesso!', 'success');
        closeModal();
        await loadReservas();
        renderDashboard();
      } else {
        toast('❌ ' + (res.error || 'Erro ao criar reserva.'), 'error');
      }
    }
  } catch (e) {
    toast('❌ Erro de ligação ao servidor.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = editingId ? 'Atualizar Reserva' : 'Guardar Reserva';
  }
}

async function deleteReserva(id) {
  if (!confirm('Tem a certeza que quer eliminar esta reserva?')) return;
  try {
    const res = await apiDelete(`/api/reservations/${id}`);
    if (res.success) {
      toast('🗑 Reserva cancelada.', 'info');
      await loadReservas();
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
    const data = await apiGet(`/api/reservations/${id}`);
    const r = data.data;
    document.getElementById('detail-title').textContent = r.id + ' — ' + r.guest_name;
    document.getElementById('detail-body').innerHTML = `
      <div class="detail-grid">
        <div class="detail-row"><div class="detail-label">Hóspede</div><div class="detail-val"><b>${r.guest_name}</b></div></div>
        <div class="detail-row"><div class="detail-label">Email</div><div class="detail-val">${r.guest_email || '—'}</div></div>
        <div class="detail-row"><div class="detail-label">Telefone</div><div class="detail-val">${r.guest_phone || '—'}</div></div>
        <div class="detail-row"><div class="detail-label">Alojamento</div><div class="detail-val"><span class="chip-aloj chip-${r.accommodation_id}">${r.accommodation_name}</span></div></div>
        <div class="detail-row"><div class="detail-label">Canal</div><div class="detail-val">${r.channel}</div></div>
        <div class="detail-row"><div class="detail-label">Hóspedes</div><div class="detail-val">${r.num_guests}</div></div>
        <div class="detail-row"><div class="detail-label">Check-in</div><div class="detail-val">${formatDate(r.check_in)}</div></div>
        <div class="detail-row"><div class="detail-label">Check-out</div><div class="detail-val">${formatDate(r.check_out)}</div></div>
        <div class="detail-row"><div class="detail-label">Noites</div><div class="detail-val">${r.nights}</div></div>
        <div class="detail-row"><div class="detail-label">Estado</div><div class="detail-val">${badgeEstado(r.status)}</div></div>
        <div class="detail-row"><div class="detail-label">Pagamento</div><div class="detail-val">${badgePagamento(r.payment_status)}</div></div>
      </div>
      ${(() => {
        const gd = typeof r.guests_data === 'string' ? JSON.parse(r.guests_data || '[]') : (r.guests_data || []);
        if (!gd.length) return '';
        return `<div style="margin-top:16px;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--cinza);margin-bottom:8px;">Hóspedes Adicionais</div>
          ${gd.map((g, i) => `<div style="background:var(--cinza-claro);border-radius:8px;padding:10px 14px;margin-bottom:6px;font-size:13px;">
            <b>Hóspede ${i + 2}</b> — ${g.name || '—'}
            ${g.email ? `· ${g.email}` : ''}${g.phone ? ` · ${g.phone}` : ''}${g.nationality ? ` · ${g.nationality}` : ''}
          </div>`).join('')}
        </div>`;
      })()}
      <div style="margin-top:20px;display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;">
        ${[['Alojamento', (accommodations.find(a => a.id === r.accommodation_id)?.price_per_night || 0) * r.nights],
           ['Taxa Turística', r.tourist_tax || 0],
           ['Pequeno-almoço', r.num_guests * r.nights * (servicosData.find(s => s.id === 'breakfast')?.value ?? 19)],
           ['Total', r.total_amount || 0]].map(([l, v]) => `
          <div style="background:var(--cinza-claro);border-radius:10px;padding:14px;text-align:center;">
            <div style="font-size:11px;color:var(--cinza);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">${l}</div>
            <div style="font-family:'Playfair Display',serif;font-size:22px;color:var(--azul);">€${Number(v).toFixed(2)}</div>
          </div>`).join('')}
      </div>
      ${r.notes ? `<div style="margin-top:16px;background:rgba(201,168,76,.1);border-left:3px solid var(--dourado);padding:12px 16px;border-radius:6px;font-size:13.5px;color:var(--texto);">📝 ${r.notes}</div>` : ''}
      <div style="margin-top:12px;font-size:12px;color:${r.google_event_id ? 'var(--verde)' : 'var(--cinza)'};">
        ${lcIcon('calendar', 12)} ${r.google_event_id ? 'Sincronizado com Google Calendar' : 'Não sincronizado com Google Calendar'}
      </div>
    `;
    document.getElementById('detail-footer').innerHTML = `
      <button class="btn btn-ghost" onclick="document.getElementById('detail-bg').classList.remove('open')">Fechar</button>
      <button class="btn btn-primary" onclick="document.getElementById('detail-bg').classList.remove('open');openEditModal('${r.id}')">
        ${lcIcon('pencil', 13)} Editar
      </button>
      ${r.status === 'cancelada'
        ? `<button class="btn btn-success" onclick="reativarReserva('${r.id}')">
            ${lcIcon('refresh-cw', 13)} Reativar Reserva
           </button>`
        : `<button class="btn btn-danger" onclick="cancelarReserva('${r.id}')">
            ${lcIcon('x-circle', 13)} Cancelar Reserva
           </button>`}
    `;
    if (window.lucide) lucide.createIcons();
    document.getElementById('detail-bg').classList.add('open');
  } catch (e) {
    toast('❌ Erro ao carregar detalhe.', 'error');
  }
}

async function cancelarReserva(id) {
  if (!confirm('Cancelar esta reserva? Será removida do Google Calendar.')) return;
  try {
    const res = await apiDelete(`/api/reservations/${id}`);
    if (res.success) {
      document.getElementById('detail-bg').classList.remove('open');
      toast('❌ Reserva cancelada.', 'info');
      await loadReservas();
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
      toast('✅ Reserva reativada!', 'success');
      await loadReservas();
      renderDashboard();
    } else {
      toast('❌ ' + (res.error || 'Erro ao reativar.'), 'error');
    }
  } catch (e) {
    toast('❌ Erro de ligação ao servidor.', 'error');
  }
}
