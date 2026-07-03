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
