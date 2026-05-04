// ── API ──
async function apiGet(path) {
  const res = await fetch(API_BASE + path);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(API_BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return res.json();
}

async function apiPut(path, body) {
  const res = await fetch(API_BASE + path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return res.json();
}

async function apiDelete(path) {
  const res = await fetch(API_BASE + path, { method: 'DELETE' });
  return res.json();
}

// ── FORMAT ──
function formatDate(s) {
  if (!s) return '—';
  const d = new Date(s + 'T12:00:00');
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });
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
