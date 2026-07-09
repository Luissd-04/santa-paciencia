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

function isVoucherExpiringSoon(v) {
  if (v.status !== 'active' || !v.valid_until) return false;
  const today = new Date();
  const expiry = new Date(v.valid_until + 'T00:00:00Z');
  const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
  return diffDays >= 0 && diffDays <= 7;
}

function formatVoucherValue(v) {
  if (v.type === 'discount_pct')   return v.value + '%';
  if (v.type === 'discount_fixed') return '€' + Number(v.value).toFixed(2);
  if (v.type === 'credit_stay')    return Number(v.value) + (Number(v.value) === 1 ? ' noite' : ' noites');
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
    const expiringSoon = isVoucherExpiringSoon(v);
    const statusInfo = VOUCHER_STATUS_LABELS[status] || { label: status, class: '' };
    const typeInfo = VOUCHER_TYPE_LABELS[v.type] || { label: v.type, icon: 'ticket', color: '#843424' };
    const validRange = [v.valid_from, v.valid_until].filter(Boolean).join(' → ') || '—';
    const expiryWarning = expiringSoon
      ? `<span title="Expira em breve!" style="display:inline-flex;align-items:center;gap:3px;font-size:11px;font-weight:600;color:#e67e22;background:#e67e2220;border-radius:10px;padding:1px 7px;margin-left:4px;"><i data-lucide="clock" style="width:10px;height:10px;"></i> expira em breve</span>`
      : '';
    return `<tr${expiringSoon ? ' style="background:rgba(230,126,34,.04);"' : ''}>
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
      <td><span class="badge ${statusInfo.class}">${statusInfo.label}</span>${expiryWarning}</td>
      <td style="font-size:12px;">${v.used_in_reservation_id ? `<button class="btn btn-ghost btn-xs" style="display:inline-flex;align-items:center;gap:4px;font-size:12px;" onclick="showDetail('${v.used_in_reservation_id}')"><i data-lucide="external-link" style="width:12px;height:12px;"></i> Ver reserva</button>` : '<span style="color:var(--cinza);">—</span>'}</td>
      <td>
        <div style="display:flex;gap:6px;">
          ${status === 'active' ? `<button class="btn btn-ghost btn-xs" onclick="openVoucherModal('${v.id}')"><i data-lucide="pencil" style="width:13px;height:13px;"></i></button>` : ''}
          <button class="btn btn-ghost btn-xs" onclick="deleteVoucher('${v.id}')"><i data-lucide="trash-2" style="width:13px;height:13px;"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('');

  const mobileCards = vouchersData.map(v => {
    const status = getVoucherStatus(v);
    const expiringSoon = isVoucherExpiringSoon(v);
    const statusInfo = VOUCHER_STATUS_LABELS[status] || { label: status, class: '' };
    const typeInfo = VOUCHER_TYPE_LABELS[v.type] || { label: v.type, icon: 'ticket', color: '#843424' };
    const validRange = [v.valid_from, v.valid_until].filter(Boolean).join(' → ') || null;
    return `
      <div class="voucher-mobile-card"${expiringSoon ? ' style="border-color:#e67e22;"' : ''}>
        <div class="vmc-top">
          <div class="vmc-code-wrap">
            <span class="vmc-code">${escapeHtml(v.code)}</span>
            <button class="vmc-copy-btn" onclick="copyVoucherCode('${escapeHtml(v.code)}')" aria-label="Copiar código">
              <i data-lucide="copy"></i>
            </button>
          </div>
          <div style="display:flex;align-items:center;gap:5px;">
            <span class="badge ${statusInfo.class}">${statusInfo.label}</span>
            ${expiringSoon ? `<span style="font-size:10px;font-weight:600;color:#e67e22;"><i data-lucide="clock" style="width:9px;height:9px;"></i> expira em breve</span>` : ''}
          </div>
        </div>
        <div class="vmc-body">
          <div class="vmc-type" style="color:${typeInfo.color};">
            <i data-lucide="${typeInfo.icon}"></i> ${typeInfo.label}
          </div>
          <div class="vmc-value">${formatVoucherValue(v)}</div>
        </div>
        ${v.description ? `<div class="vmc-desc">${escapeHtml(v.description)}</div>` : ''}
        ${validRange ? `<div class="vmc-validity"><i data-lucide="calendar"></i> ${validRange}</div>` : ''}
        ${v.used_in_reservation_id ? `<button class="vmc-res" style="background:none;border:0;padding:0;cursor:pointer;color:var(--marca);font:inherit;display:inline-flex;align-items:center;gap:4px;" onclick="showDetail('${v.used_in_reservation_id}')"><i data-lucide="external-link"></i> Ver reserva</button>` : ''}
        <div class="vmc-actions">
          ${status === 'active' ? `<button class="vmc-btn" onclick="openVoucherModal('${v.id}')"><i data-lucide="pencil"></i> Editar</button>` : ''}
          <button class="vmc-btn vmc-btn-danger" onclick="deleteVoucher('${v.id}')"><i data-lucide="trash-2"></i> Eliminar</button>
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
  const input = document.getElementById('v-value');
  if (!label) return;
  if (type === 'discount_pct')  label.innerHTML = 'Valor (%) <span class="req-star">*</span>';
  else if (type === 'credit_stay') label.innerHTML = 'Noites <span class="req-star">*</span>';
  else                           label.innerHTML = 'Valor (€) <span class="req-star">*</span>';
  if (input) {
    input.step  = type === 'credit_stay' ? '1' : '0.01';
    input.min   = '1';
  }
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
  const rawValue = document.getElementById('v-value').value;
  const value = type === 'credit_stay' ? parseInt(rawValue) : parseFloat(rawValue);
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
  const msg = getVoucherStatus(v) === 'used'
    ? `⚠️ O voucher "${v.code}" já foi usado numa reserva. Eliminar mesmo assim?`
    : `Eliminar voucher "${v.code}"?`;
  if (!confirm(msg)) return;
  try {
    await apiDelete(`/api/vouchers/${id}`);
    toast('✅ Voucher eliminado.', 'success');
    await loadVouchers();
  } catch (err) {
    toast('❌ ' + (err?.payload?.error || 'Erro ao eliminar voucher.'), 'error');
  }
}
