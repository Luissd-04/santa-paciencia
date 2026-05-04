async function exportDB() {
  try {
    const res = await fetch(API_BASE + '/api/backup/export');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `santa_paciencia_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('✅ Base de dados exportada!', 'success');
  } catch (e) {
    toast('❌ Erro ao exportar base de dados.', 'error');
  }
}

async function importDB(input) {
  const file = input.files[0];
  if (!file) return;
  if (!confirm('⚠️ Isto vai SUBSTITUIR toda a base de dados atual pelos dados do ficheiro. Tem a certeza?')) {
    input.value = '';
    return;
  }
  try {
    const text = await file.text();
    const json = JSON.parse(text);
    if (!json.tables) { toast('❌ Ficheiro inválido.', 'error'); input.value = ''; return; }
    const res = await apiPost('/api/backup/import', json);
    if (res.success) {
      toast('✅ Base de dados importada! A recarregar...', 'success');
      setTimeout(() => window.location.reload(), 1500);
    } else {
      toast('❌ ' + (res.error || 'Erro ao importar.'), 'error');
    }
  } catch (e) {
    toast('❌ Ficheiro inválido ou erro de ligação.', 'error');
  }
  input.value = '';
}

async function loadDashboardStats() {
  try {
    const data = await apiGet('/api/reservations/stats/dashboard');
    if (data.success) {
      const s = data.data;
      document.getElementById('kpi-faturado').textContent = '€' + Number(s.totalBilled).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      document.getElementById('kpi-ativas').textContent = s.confirmedReservations;
      document.getElementById('kpi-noites').textContent = s.nightsThisMonth;
      document.getElementById('kpi-ocup').textContent = s.occupancyRate + '%';
      ['kpi-faturado','kpi-ativas','kpi-noites','kpi-ocup'].forEach(id => {
        const el = document.getElementById(id);
        el.classList.remove('kpi-animated');
        void el.offsetWidth;
        el.classList.add('kpi-animated');
      });
    }
  } catch (e) {
    ['kpi-faturado','kpi-ativas','kpi-noites','kpi-ocup'].forEach(id => {
      document.getElementById(id).textContent = '—';
    });
  }
}

function accomChip(r) {
  const a = accommodations.find(x => x.id === r.accommodation_id);
  const color = a?.color || '#843424';
  return `<span style="display:inline-block;padding:2px 10px;border-radius:20px;font-size:12px;font-weight:600;background:${color}20;color:${color};border:1px solid ${color}40;">${r.accommodation_name}</span>`;
}

function renderMobileDashboard() {
  const today = new Date().toISOString().split('T')[0];
  const todayArrivals = reservas.filter(r => r.check_in === today && r.status !== 'cancelada');
  const todayDeps     = reservas.filter(r => r.check_out === today && r.status !== 'cancelada');
  const pendingPay    = reservas.filter(r => r.payment_status === 'pendente' && r.status !== 'cancelada');

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  // Arrivals card
  set('mac-count', todayArrivals.length);
  if (todayArrivals.length === 0) {
    set('mac-sub', 'Sem chegadas hoje');
  } else {
    const conf = todayArrivals.filter(r => r.status === 'confirmada').length;
    const pend = todayArrivals.filter(r => r.status === 'pendente').length;
    const parts = [];
    if (conf) parts.push(conf + ' confirmada' + (conf !== 1 ? 's' : ''));
    if (pend) parts.push(pend + ' pendente' + (pend !== 1 ? 's' : ''));
    set('mac-sub', parts.join(', ') || todayArrivals.length + ' chegadas');
  }
  const macNext = document.getElementById('mac-next');
  if (macNext) {
    if (todayArrivals.length > 0) {
      macNext.style.display = 'flex';
      set('mac-next-text', 'Próximo: ' + todayArrivals[0].guest_name);
    } else {
      macNext.style.display = 'none';
    }
  }

  // Mirror desktop KPI values into mobile
  [['m-kpi-faturado','kpi-faturado'],['m-kpi-ativas','kpi-ativas'],
   ['m-kpi-noites','kpi-noites'],['m-kpi-ocup','kpi-ocup']].forEach(([mId, dId]) => {
    const mel = document.getElementById(mId);
    const del = document.getElementById(dId);
    if (mel && del) mel.textContent = del.textContent;
  });

  // Quick action counts
  set('qk-checkin',  todayArrivals.length + ' hóspede' + (todayArrivals.length !== 1 ? 's' : ''));
  set('qk-checkout', todayDeps.length     + ' hóspede' + (todayDeps.length     !== 1 ? 's' : ''));
  set('qk-payments', pendingPay.length    + ' pendente' + (pendingPay.length   !== 1 ? 's' : ''));
}

function goToTodayCheckins() {
  const today = new Date().toISOString().split('T')[0];
  showView('reservas');
  setTimeout(() => {
    const fd = document.getElementById('filter-date-from');
    const ft = document.getElementById('filter-date-to');
    if (fd) fd.value = today;
    if (ft) ft.value = today;
    renderTabela();
    renderMobileCards();
  }, 50);
}

function goToTodayCheckouts() {
  showView('reservas');
}

function goToPendingPayments() {
  if (typeof mobileChipFilter !== 'undefined') {
    mobileChipFilter = 'pendente';
    document.querySelectorAll('.mobile-filter-chips .chip').forEach(c => c.classList.remove('active'));
    const pendChip = document.querySelector('.mobile-filter-chips .chip[onclick*="pendente"]');
    if (pendChip) pendChip.classList.add('active');
  }
  showView('reservas');
  setTimeout(renderMobileCards, 50);
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
        <td>${accomChip(r)}</td>
        <td>${formatDate(r.check_in)}</td>
        <td>${r.nights}</td>
        <td>${badgeEstado(r.status)}</td>
      </tr>`).join('') + '</tbody></table>';
  }

  renderMobileDashboard();
  if (window.lucide) lucide.createIcons();

  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const da = document.getElementById('dash-avail');
  if (accommodations.length === 0) {
    da.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    return;
  }
  da.innerHTML = accommodations.map(a => {
    const cor = a.color || '#843424';
    const ocupadas = reservas.filter(r => r.accommodation_id === a.id && r.status !== 'cancelada')
      .reduce((s, r) => s + (r.nights || 0), 0);
    const pct = Math.min(100, Math.round((ocupadas / daysInMonth) * 100));
    return `<div class="avail-suite" style="margin-bottom:12px;border-color:${cor}40;">
      <div class="avail-suite-name" style="display:flex;align-items:center;gap:8px;">
        <span style="width:10px;height:10px;border-radius:50%;background:${cor};flex-shrink:0;display:inline-block;"></span>
        ${a.name}
      </div>
      <div class="avail-bar"><div class="avail-fill" style="--fill-pct:${pct}%;background:${cor}"></div></div>
      <div class="avail-info"><span>${pct}% ocupado</span><span>€${a.price_per_night}/noite</span></div>
    </div>`;
  }).join('');
}
