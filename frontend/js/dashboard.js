async function loadDashboardStats() {
  try {
    const data = await apiGet('/api/reservations/stats/dashboard');
    if (data.success) {
      const s = data.data;
      document.getElementById('kpi-faturado').textContent = '€' + Number(s.totalBilled).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      document.getElementById('kpi-ativas').textContent = s.confirmedReservations;
      document.getElementById('kpi-noites').textContent = s.nightsThisMonth;
      document.getElementById('kpi-ocup').textContent = s.occupancyRate + '%';
    }
  } catch (e) {
    ['kpi-faturado','kpi-ativas','kpi-noites','kpi-ocup'].forEach(id => {
      document.getElementById(id).textContent = '—';
    });
  }
}

async function renderDashboard() {
  await Promise.all([loadDashboardStats(), loadReservas()]);

  const upcoming = reservas
    .filter(r => r.status !== 'cancelada' && r.status !== 'check-out')
    .sort((a, b) => new Date(a.check_in) - new Date(b.check_in))
    .slice(0, 5);

  const dp = document.getElementById('dash-proximas');
  if (upcoming.length === 0) {
    dp.innerHTML = '<div class="empty-state"><div class="es-icon">🌅</div><h3>Sem chegadas próximas</h3></div>';
  } else {
    dp.innerHTML = '<table><thead><tr><th>Hóspede</th><th>Suite</th><th>Check-in</th><th>Noites</th><th>Estado</th></tr></thead><tbody>' +
      upcoming.map(r => `<tr onclick="showDetail('${r.id}')">
        <td><b>${r.guest_name}</b></td>
        <td><span class="chip-aloj chip-${r.accommodation_id}">${r.accommodation_name}</span></td>
        <td>${formatDate(r.check_in)}</td>
        <td>${r.nights}</td>
        <td>${badgeEstado(r.status)}</td>
      </tr>`).join('') + '</tbody></table>';
  }

  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const da = document.getElementById('dash-avail');
  if (accommodations.length === 0) {
    da.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    return;
  }
  const colors = ['#4a7fa5', '#2e7d52', '#c9a84c', '#5a4a8a'];
  da.innerHTML = accommodations.map((a, i) => {
    const ocupadas = reservas.filter(r => r.accommodation_id === a.id && r.status !== 'cancelada')
      .reduce((s, r) => s + (r.nights || 0), 0);
    const pct = Math.min(100, Math.round((ocupadas / daysInMonth) * 100));
    const cor = colors[i % colors.length];
    return `<div class="avail-suite" style="margin-bottom:12px;border-color:${cor}">
      <div class="avail-suite-name">${a.name}</div>
      <div class="avail-bar"><div class="avail-fill" style="width:${pct}%;background:${cor}"></div></div>
      <div class="avail-info"><span>${pct}% ocupado</span><span>€${a.price_per_night}/noite</span></div>
    </div>`;
  }).join('');
}
