// ── API ──
async function apiRequest(path, options = {}, config = {}) {
  const headers = { ...(options.headers || {}) };
  const request = {
    credentials: 'include',
    ...options,
    headers
  };

  const res = await fetch(API_BASE + path, request);
  let payload = null;
  try { payload = await res.json(); } catch (_) {}

  if (res.status === 401 && !config.skipAuthRedirect && typeof handleUnauthorized === 'function') {
    handleUnauthorized();
  }

  if (!res.ok) {
    const err = new Error(payload?.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.payload = payload;
    throw err;
  }

  return payload;
}

async function apiGet(path, config) {
  return apiRequest(path, {}, config);
}

async function apiPost(path, body, config) {
  return apiRequest(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }, config);
}

async function apiPut(path, body, config) {
  return apiRequest(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }, config);
}

async function apiDelete(path, config) {
  return apiRequest(path, { method: 'DELETE' }, config);
}

// ── Confirmação de alteração de valores da estadia ──
// Mostra o padrão do calendário dinâmico vs o novo valor, e avisa se a reserva
// já tinha sido editada manualmente. Devolve Promise<boolean>.
function confirmPriceChange({ standardTotal, newTotal, editedAt = null, editedByName = null }) {
  return new Promise(resolve => {
    const fmt = v => `€${Number(v).toFixed(2)}`;
    const diff = Number(newTotal) - Number(standardTotal);
    const diffLine = Math.abs(diff) > 0.005
      ? (diff < 0
        ? `<span style="color:#0f9d58;font-weight:600;">Desconto de ${fmt(Math.abs(diff))} face ao padrão</span>`
        : `<span style="color:#e8710a;font-weight:600;">Acréscimo de ${fmt(diff)} face ao padrão</span>`)
      : '';
    const editedWarn = editedAt ? `
      <div style="background:#fdf3e2;border:1px solid #f0d9a8;border-radius:8px;padding:10px 12px;font-size:12.5px;color:#8a6d1d;margin-top:12px;">
        ⚠️ Esta reserva já foi editada manualmente em ${new Date(editedAt).toLocaleDateString('pt-PT')}${editedByName ? ` por ${editedByName}` : ''}.
      </div>` : '';

    const overlay = document.createElement('div');
    overlay.className = 'modal-bg open';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:10000;';
    overlay.innerHTML = `
      <div class="modal" style="background:#fff;border-radius:14px;padding:26px 28px;max-width:440px;width:94%;box-shadow:0 8px 32px rgba(0,0,0,.18);">
        <h3 style="margin:0 0 6px;font-size:17px;color:var(--azul);">Alterar valores da estadia?</h3>
        <p style="margin:0 0 16px;font-size:13px;color:var(--cinza);">O novo valor difere do preço padrão do calendário dinâmico.</p>
        <div style="display:flex;flex-direction:column;gap:8px;font-size:13.5px;">
          <div style="display:flex;justify-content:space-between;color:var(--cinza);">
            <span>Padrão (calendário dinâmico)</span><span style="font-size:12.5px;">${fmt(standardTotal)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-weight:700;color:var(--azul);">
            <span>Novo total</span><span>${fmt(newTotal)}</span>
          </div>
          ${diffLine ? `<div style="font-size:12.5px;">${diffLine}</div>` : ''}
        </div>
        ${editedWarn}
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;">
          <button class="btn btn-ghost btn-sm" data-pc-cancel>Cancelar</button>
          <button class="btn btn-primary btn-sm" data-pc-confirm>Confirmar alteração</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const close = ok => { overlay.remove(); resolve(ok); };
    overlay.querySelector('[data-pc-cancel]').onclick = () => close(false);
    overlay.querySelector('[data-pc-confirm]').onclick = () => close(true);
    overlay.onclick = e => { if (e.target === overlay) close(false); };
  });
}

// Returns the email only if it's a real one (not an internal placeholder)
function realEmail(e) {
  if (!e) return null;
  return e.includes('@reserva.local') ? null : e;
}

// ── FORMAT ──
function formatDate(s) {
  return window.ReservationDates?.formatShortPtDate(s) || '—';
}

function badgeEstado(e) {
  const map = {
    'pre_reserva': 'badge-prereserva',
    'confirmada': 'badge-confirmada',
    'pendente': 'badge-pendente',
    'pre_checkin': 'badge-pendente',
    'aguardar_pagamento': 'badge-parcial',
    'cancelada': 'badge-cancelada'
  };
  const labels = {
    pre_reserva: 'Pré-reserva',
    confirmada: 'Confirmada',
    pendente: 'Pendente',
    pre_checkin: 'Pre Check-in',
    aguardar_pagamento: 'Aguardar Pagamento',
    cancelada: 'Cancelada'
  };
  const label = labels[e] || (e ? e.charAt(0).toUpperCase() + e.slice(1) : e);
  return `<span class="badge ${map[e] || ''}">${label}</span>`;
}

function badgePagamento(p) {
  const map = { 'confirmado': 'badge-pago', 'pago': 'badge-pago', 'parcial': 'badge-parcial', 'pendente': 'badge-pendpag' };
  const labels = { 'confirmado': 'Completo', 'pago': 'Completo', 'parcial': 'Parcial', 'pendente': 'Não pago' };
  return `<span class="badge ${map[p] || ''}">${labels[p] || (p ? p.charAt(0).toUpperCase() + p.slice(1) : '—')}</span>`;
}

function toast(msg, type = 'info', dur = 3500) {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateX(60px)';
    t.style.transition = 'all .3s';
    setTimeout(() => t.remove(), 300);
  }, dur);
}

function lcIcon(name, size = 14) {
  return `<i data-lucide="${name}" style="width:${size}px;height:${size}px;"></i>`;
}

function showOperationProgress(title = 'A processar...', detail = 'A preparar...', percent = 5) {
  const wrap = document.getElementById('operation-progress');
  if (!wrap) return;
  wrap.hidden = false;
  updateOperationProgress(percent, detail, title);
}

function updateOperationProgress(percent = 0, detail = '', title = '') {
  const wrap = document.getElementById('operation-progress');
  if (!wrap) return;
  const pct = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  const titleEl = document.getElementById('operation-progress-title');
  const percentEl = document.getElementById('operation-progress-percent');
  const detailEl = document.getElementById('operation-progress-detail');
  const bar = document.getElementById('operation-progress-bar');
  if (title && titleEl) titleEl.textContent = title;
  if (percentEl) percentEl.textContent = `${pct}%`;
  if (detailEl) detailEl.textContent = detail || '';
  if (bar) bar.style.width = `${pct}%`;
}

function hideOperationProgress(delay = 450) {
  const wrap = document.getElementById('operation-progress');
  if (!wrap) return;
  setTimeout(() => {
    wrap.hidden = true;
    updateOperationProgress(0, 'A preparar...');
  }, delay);
}

async function runWithOperationProgress(title, steps, work) {
  showOperationProgress(title, steps?.[0]?.detail || 'A preparar...', steps?.[0]?.percent || 5);
  try {
    const setProgress = (percent, detail) => updateOperationProgress(percent, detail, title);
    const result = await work(setProgress);
    updateOperationProgress(100, 'Concluído.', title);
    return result;
  } finally {
    hideOperationProgress();
  }
}


function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[ch]));
}
