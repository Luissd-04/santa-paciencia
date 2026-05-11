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

// ── FORMAT ──
function formatDate(s) {
  return window.ReservationDates?.formatShortPtDate(s) || '—';
}

function badgeEstado(e) {
  const map = {
    'confirmada': 'badge-confirmada', 'pendente': 'badge-pendente', 'cancelada': 'badge-cancelada'
  };
  const label = e ? e.charAt(0).toUpperCase() + e.slice(1) : e;
  return `<span class="badge ${map[e] || ''}">${label}</span>`;
}

function badgePagamento(p) {
  const map = { 'confirmado': 'badge-pago', 'pago': 'badge-pago', 'parcial': 'badge-parcial', 'pendente': 'badge-pendpag' };
  const labels = { 'confirmado': 'Confirmado', 'pago': 'Confirmado', 'parcial': 'Parcial', 'pendente': 'Pendente' };
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
