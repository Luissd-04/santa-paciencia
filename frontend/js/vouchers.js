let vouchersData = [];
let voucherEditingId = null;

const VOUCHER_TYPE_LABELS = {
  discount_pct:   { label: 'Desconto %',         icon: 'percent',       color: '#4f8f6b' },
  discount_fixed: { label: 'Desconto €',          icon: 'tag',           color: '#4a7fa5' },
  credit_stay:    { label: 'Crédito de estadia',  icon: 'gift',          color: '#c9a84c' },
};

const VOUCHER_STATUS_LABELS = {
  active:    { label: 'Ativo',      class: 'badge-green'  },
  used:      { label: 'Utilizado',  class: 'badge-cinza'  },
  expired:   { label: 'Expirado',   class: 'badge-orange' },
  cancelled: { label: 'Cancelado',  class: 'badge-red'    },
};

async function loadVouchers() {
  try {
    const payload = await apiGet('/api/vouchers');
    vouchersData = payload.data || [];
  } catch {
    toast('❌ Erro ao carregar vouchers.', 'error');
    vouchersData = [];
  }
  renderVouchersList();
}

function getVoucherStatus(v) {
  if (v.status !== 'active') return v.status;
  const today = new Date().toISOString().slice(0, 10);
  if (v.valid_until && v.valid_until < today) return 'expired';
  return 'active';
}

function formatVoucherValue(v) {
  if (v.type === 'discount_pct')   return v.value + '%';
  if (v.type === 'discount_fixed') return '€' + Number(v.value).toFixed(2);
  if (v.type === 'credit_stay')    return '€' + Number(v.value).toFixed(2) + ' crédito';
  return v.value;
}

function renderVouchersList() {
  const wrap = document.getElementById('vouchers-list-wrap');
  if (!wrap) return;

  if (vouchersData.length === 0) {
    wrap.innerHTML = `
      <div class="empty-state">
        <div class="es-icon"><i data-lucide="ticket" style="width:40px;height:40px;opacity:.3;"></i></div>
        <h3>Sem vouchers</h3>
        <p>Cria o primeiro voucher para oferecer descontos ou créditos de estadia aos teus hóspedes.</p>
        <button class="btn btn-primary btn-sm" onclick="openVoucherModal()"><i data-lucide="plus"></i> Criar voucher</button>
      </div>`;
    if (window.lucide) lucide.createIcons();
    return;
  }

  const rows = vouchersData.map(v => {
    const status = getVoucherStatus(v);
    const statusInfo = VOUCHER_STATUS_LABELS[status] || { label: status, class: '' };
    const typeInfo = VOUCHER_TYPE_LABELS[v.type] || { label: v.type, icon: 'ticket', color: '#843424' };
    const validRange = [v.valid_from, v.valid_until].filter(Boolean).join(' → ') || '—';
    return `<tr>
      <td>
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-family:monospace;font-weight:700;font-size:13px;letter-spacing:1px;background:var(--cinza-claro);padding:3px 8px;border-radius:6px;">${escapeHtml(v.code)}</span>
          <button class="btn btn-ghost btn-xs" title="Copiar código" onclick="copyVoucherCode('${escapeHtml(v.code)}')">
            <i data-lucide="copy" style="width:12px;height:12px;"></i>
          </button>
        </div>
        ${v.description ? `<div style="font-size:11px;color:var(--cinza);margin-top:3px;">${escapeHtml(v.description)}</div>` : ''}
      </td>
      <td>
        <span style="display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;color:${typeInfo.color};">
          <i data-lucide="${typeInfo.icon}" style="width:13px;height:13px;"></i> ${typeInfo.label}
        </span>
      </td>
      <td style="font-weight:700;font-size:15px;">${formatVoucherValue(v)}</td>
      <td style="font-size:12px;color:var(--cinza);">${validRange}</td>
      <td><span class="badge ${statusInfo.class}">${statusInfo.label}</span></td>
      <td style="font-size:12px;color:var(--cinza);">${v.used_in_reservation_id ? v.used_in_reservation_id : '—'}</td>
      <td>
        <div style="display:flex;gap:6px;">
          ${status === 'active' ? `<button class="btn btn-ghost btn-xs" onclick="openVoucherModal('${v.id}')"><i data-lucide="pencil" style="width:13px;height:13px;"></i></button>` : ''}
          ${status !== 'used' ? `<button class="btn btn-ghost btn-xs" onclick="deleteVoucher('${v.id}')"><i data-lucide="trash-2" style="width:13px;height:13px;"></i></button>` : ''}
        </div>
      </td>
    </tr>`;
  }).join('');

  const mobileCards = vouchersData.map(v => {
    const status = getVoucherStatus(v);
    const statusInfo = VOUCHER_STATUS_LABELS[status] || { label: status, class: '' };
    const typeInfo = VOUCHER_TYPE_LABELS[v.type] || { label: v.type, icon: 'ticket', color: '#843424' };
    const validRange = [v.valid_from, v.valid_until].filter(Boolean).join(' → ') || null;
    return `
      <div class="voucher-mobile-card">
        <div class="vmc-top">
          <div class="vmc-code-wrap">
            <span class="vmc-code">${escapeHtml(v.code)}</span>
            <button class="vmc-copy-btn" onclick="copyVoucherCode('${escapeHtml(v.code)}')" aria-label="Copiar código">
              <i data-lucide="copy"></i>
            </button>
          </div>
          <span class="badge ${statusInfo.class}">${statusInfo.label}</span>
        </div>
        <div class="vmc-body">
          <div class="vmc-type" style="color:${typeInfo.color};">
            <i data-lucide="${typeInfo.icon}"></i> ${typeInfo.label}
          </div>
          <div class="vmc-value">${formatVoucherValue(v)}</div>
        </div>
        ${v.description ? `<div class="vmc-desc">${escapeHtml(v.description)}</div>` : ''}
        ${validRange ? `<div class="vmc-validity"><i data-lucide="calendar"></i> ${validRange}</div>` : ''}
        ${v.used_in_reservation_id ? `<div class="vmc-res"><i data-lucide="link"></i> Reserva: ${v.used_in_reservation_id}</div>` : ''}
        <div class="vmc-actions">
          ${status === 'active' ? `<button class="vmc-btn" onclick="openVoucherModal('${v.id}')"><i data-lucide="pencil"></i> Editar</button>` : ''}
          ${status !== 'used' ? `<button class="vmc-btn vmc-btn-danger" onclick="deleteVoucher('${v.id}')"><i data-lucide="trash-2"></i> Eliminar</button>` : ''}
        </div>
      </div>`;
  }).join('');

  wrap.innerHTML = `
    <div class="vouchers-desktop">
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Tipo</th>
              <th>Valor</th>
              <th>Validade</th>
              <th>Estado</th>
              <th>Reserva</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
    <div class="vouchers-mobile">${mobileCards}</div>`;
  if (window.lucide) lucide.createIcons();
}

async function copyVoucherCode(code) {
  try {
    await navigator.clipboard.writeText(code);
    toast('✅ Código copiado!', 'success');
  } catch {
    toast(code, 'info');
  }
}

function updateVoucherValueLabel() {
  const type = document.getElementById('v-type')?.value;
  const label = document.getElementById('v-value-label');
  if (!label) return;
  if (type === 'discount_pct')   label.innerHTML = 'Valor (%) <span class="req-star">*</span>';
  else                            label.innerHTML = 'Valor (€) <span class="req-star">*</span>';
}

function populateVoucherAccommodations() {
  const sel = document.getElementById('v-accommodation');
  if (!sel) return;
  const current = sel.value;
  const opts = (accommodations || []).map(a =>
    `<option value="${a.id}">${escapeHtml(a.name)}</option>`
  ).join('');
  sel.innerHTML = `<option value="">Todos os alojamentos</option>${opts}`;
  sel.value = current;
}

function openVoucherModal(id = null) {
  voucherEditingId = id;
  const v = id ? vouchersData.find(x => x.id === id) : null;
  document.getElementById('voucher-modal-title').textContent = v ? 'Editar Voucher' : 'Novo Voucher';
  document.getElementById('v-code').value        = v?.code        || '';
  document.getElementById('v-code').readOnly     = !!v;
  document.getElementById('v-type').value        = v?.type        || 'discount_pct';
  document.getElementById('v-value').value       = v?.value       || '';
  document.getElementById('v-description').value = v?.description || '';
  document.getElementById('v-valid-from').value  = v?.valid_from  || '';
  document.getElementById('v-valid-until').value = v?.valid_until || '';
  document.getElementById('v-min-nights').value  = v?.min_nights  ?? 1;
  document.getElementById('v-notes').value       = v?.notes       || '';
  populateVoucherAccommodations();
  document.getElementById('v-accommodation').value = v?.accommodation_id || '';
  updateVoucherValueLabel();
  AppUI.openModal('voucher-modal-bg');
  if (window.lucide) lucide.createIcons();
}

function closeVoucherModal() {
  AppUI.closeModal('voucher-modal-bg');
  voucherEditingId = null;
}

async function saveVoucher() {
  const btn = document.getElementById('v-save-btn');
  const type  = document.getElementById('v-type').value;
  const value = parseFloat(document.getElementById('v-value').value);
  if (!type || isNaN(value) || value <= 0) {
    toast('⚠️ Tipo e valor são obrigatórios.', 'error');
    return;
  }

  const body = {
    code:             document.getElementById('v-code').value.trim() || undefined,
    type,
    value,
    description:      document.getElementById('v-description').value.trim() || null,
    valid_from:       document.getElementById('v-valid-from').value  || null,
    valid_until:      document.getElementById('v-valid-until').value || null,
    min_nights:       parseInt(document.getElementById('v-min-nights').value) || 1,
    accommodation_id: document.getElementById('v-accommodation').value || null,
    notes:            document.getElementById('v-notes').value.trim() || null,
  };

  AppUI.setButtonLoading(btn, true, 'A guardar...');
  try {
    if (voucherEditingId) {
      await apiPut(`/api/vouchers/${voucherEditingId}`, body);
      toast('✅ Voucher atualizado.', 'success');
    } else {
      await apiPost('/api/vouchers', body);
      toast('✅ Voucher criado.', 'success');
    }
    closeVoucherModal();
    await loadVouchers();
  } catch (err) {
    toast('❌ ' + (err?.payload?.error || 'Erro ao guardar voucher.'), 'error');
  } finally {
    AppUI.setButtonLoading(btn, false);
  }
}

async function deleteVoucher(id) {
  const v = vouchersData.find(x => x.id === id);
  if (!v) return;
  if (!confirm(`Eliminar voucher "${v.code}"?`)) return;
  try {
    await apiDelete(`/api/vouchers/${id}`);
    toast('✅ Voucher eliminado.', 'success');
    await loadVouchers();
  } catch (err) {
    toast('❌ ' + (err?.payload?.error || 'Erro ao eliminar voucher.'), 'error');
  }
}
