// Estado privado; interface partilhada em AppModules.core.
(() => {
AppModules.define('core', {
  accomChip: { get: () => accomChip },
  exportDB: { get: () => exportDB },
  goToPendingPayments: { get: () => goToPendingPayments },
  goToTodayCheckins: { get: () => goToTodayCheckins },
  goToTodayCheckouts: { get: () => goToTodayCheckouts },
  importDB: { get: () => importDB },
  quickScanReceiptFromDashboard: { get: () => quickScanReceiptFromDashboard },
  renderDashboard: { get: () => renderDashboard },
});

// Ocupação por unidade no mês corrente, servida por /stats/dashboard.
// null = ainda não respondeu; [] = respondeu sem dados (ex.: backend antigo).
let _dashAvailability = null;

async function exportDB() {
  AppModules.core.showOperationProgress('A exportar base de dados', 'A preparar ZIP...', 8);
  try {
    const res = await fetch(AppModules.core.API_BASE + '/api/backup/export', { credentials: 'include' });
    if (!res.ok) {
      let message = `HTTP ${res.status}`;
      try {
        const payload = await res.json();
        message = payload?.error || message;
      } catch (_) {}
      throw new Error(message);
    }
    let blob;
    const total = Number(res.headers.get('content-length') || 0);
    if (res.body && total > 0) {
      const reader = res.body.getReader();
      const chunks = [];
      let received = 0;
      AppModules.core.updateOperationProgress(20, 'A receber ficheiro...');
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        AppModules.core.updateOperationProgress(20 + (received / total) * 70, 'A receber ficheiro...');
      }
      blob = new Blob(chunks, { type: res.headers.get('content-type') || 'application/zip' });
    } else {
      AppModules.core.updateOperationProgress(45, 'A receber ficheiro...');
      blob = await res.blob();
    }
    AppModules.core.updateOperationProgress(92, 'A iniciar download...');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `santa_paciencia_${new Date().toISOString().slice(0,10)}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    AppModules.core.updateOperationProgress(100, 'Concluído.');
    AppModules.core.toast('✅ Backup ZIP exportado com imagens!', 'success');
  } catch (e) {
    AppModules.core.toast('❌ Erro ao exportar backup ZIP: ' + (e.message || 'erro desconhecido'), 'error');
  } finally {
    AppModules.core.hideOperationProgress();
  }
}

async function importDB(input) {
  const file = input.files[0];
  if (!file) return;
  if (!/\.zip$/i.test(file.name)) {
    AppModules.core.toast('❌ Seleciona um ficheiro ZIP válido.', 'error');
    input.value = '';
    return;
  }
  if (!confirm('⚠️ Isto vai SUBSTITUIR os dados do cliente neste espaço pelos dados do ficheiro. Contas, equipa e acessos da plataforma não serão alterados. Tem a certeza?')) {
    input.value = '';
    return;
  }
  AppModules.core.showOperationProgress('A importar base de dados', 'A ler ficheiro ZIP...', 8);
  try {
    const bytes = await file.arrayBuffer();
    AppModules.core.updateOperationProgress(25, 'A preparar ficheiro...');
    let binary = '';
    const chunkSize = 0x8000;
    const uint8 = new Uint8Array(bytes);
    for (let i = 0; i < uint8.length; i += chunkSize) {
      const chunk = uint8.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
      AppModules.core.updateOperationProgress(25 + Math.min(35, (i / Math.max(uint8.length, 1)) * 35), 'A preparar ficheiro...');
    }
    const archiveBase64 = btoa(binary);

    AppModules.core.updateOperationProgress(65, 'A enviar e restaurar dados...');
    const res = await AppModules.core.apiPost('/api/backup/import', {
      filename: file.name,
      archiveBase64
    });
    if (res.success) {
      AppModules.core.updateOperationProgress(100, 'Concluído. A recarregar...');
      AppModules.core.toast('✅ Base de dados importada! A recarregar...', 'success');
      setTimeout(() => window.location.reload(), 1500);
    } else {
      AppModules.core.toast('❌ ' + (res.error || 'Erro ao importar.'), 'error');
    }
  } catch (e) {
    AppModules.core.toast('❌ Erro ao importar ZIP: ' + (e.message || 'erro desconhecido'), 'error');
  } finally {
    AppModules.core.hideOperationProgress();
  }
  input.value = '';
}

async function loadDashboardStats() {
  try {
    const data = await AppModules.core.apiGet('/api/reservations/stats/dashboard');
    if (data.success) {
      const s = data.data;
      if (!s || !Array.isArray(s.upcoming) || !s.today || !Number.isFinite(s.totalReserved)) {
        throw AppModules.core.serverUpdateRequiredError();
      }
      _dashAvailability = Array.isArray(s.availability) ? s.availability : [];
      document.getElementById('kpi-faturado').textContent = '€' + Number(s.totalReserved).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const money = value => Number(value || 0).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' });
      document.getElementById('kpi-financial-details').textContent = `Com fatura: ${money(s.totalInvoiced)} · Recebido: ${money(s.totalReceived)}`;
      document.getElementById('kpi-ativas').textContent = s.confirmedReservations;
      document.getElementById('kpi-noites').textContent = s.nightsThisMonth;
      document.getElementById('kpi-ocup').textContent = s.occupancyRate + '%';
      ['kpi-faturado','kpi-ativas','kpi-noites','kpi-ocup'].forEach(id => {
        const el = document.getElementById(id);
        el.classList.remove('kpi-animated');
        void el.offsetWidth;
        el.classList.add('kpi-animated');
      });
      return s;
    }
    throw new Error('Não foi possível carregar o painel.');
  } catch (e) {
    _dashAvailability = [];
    ['kpi-faturado','kpi-ativas','kpi-noites','kpi-ocup','kpi-financial-details'].forEach(id => {
      document.getElementById(id).textContent = '—';
    });
    throw e;
  }
}

function accomChip(r) {
  const a = AppModules.core.accommodations.find(x => x.id === r.accommodation_id);
  const color = a?.color || '#843424';
  return `<span style="display:inline-block;padding:2px 10px;border-radius:20px;font-size:12px;font-weight:600;background:${color}20;color:${color};border:1px solid ${color}40;">${AppModules.core.escapeHtml(r.accommodation_name)}</span>`;
}

function relativeArrivalLabel(dateStr, todayStr) {
  if (dateStr === todayStr) return 'Hoje';
  const tomorrow = new Date(todayStr + 'T00:00:00');
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (dateStr === tomorrow.toISOString().slice(0, 10)) return 'Amanhã';
  return AppModules.core.formatDate(dateStr);
}

function renderMobileDashboard(upcoming = [], counts = {}) {
  const today = new Date().toISOString().split('T')[0];
  const todayArrivals = counts.arrivals || 0;
  const todayDeps = counts.departures || 0;
  const pendingPay = counts.pendingPayments || 0;
  const nextArrival = upcoming.find(r => r.check_in === today);

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  // Arrivals card
  set('mac-count', todayArrivals);
  if (todayArrivals === 0) {
    set('mac-sub', 'Sem chegadas hoje');
  } else {
    const conf = counts.confirmedArrivals || 0;
    const pend = counts.pendingArrivals || 0;
    const parts = [];
    if (conf) parts.push(conf + ' confirmada' + (conf !== 1 ? 's' : ''));
    if (pend) parts.push(pend + ' pendente' + (pend !== 1 ? 's' : ''));
    set('mac-sub', parts.join(', ') || todayArrivals + ' chegadas');
  }
  const macNext = document.getElementById('mac-next');
  if (macNext) {
    if (nextArrival) {
      macNext.style.display = 'flex';
      set('mac-next-text', 'Próximo: ' + nextArrival.guest_name);
    } else {
      macNext.style.display = 'none';
    }
  }

  // Mirror desktop KPI values into mobile
  [['m-kpi-ativas','kpi-ativas'],
   ['m-kpi-noites','kpi-noites'],['m-kpi-ocup','kpi-ocup']].forEach(([mId, dId]) => {
    const mel = document.getElementById(mId);
    const del = document.getElementById(dId);
    if (mel && del) mel.textContent = del.textContent;
  });

  // Quick action counts
  set('qk-checkin',  todayArrivals + ' hóspede' + (todayArrivals !== 1 ? 's' : ''));
  set('qk-checkout', todayDeps     + ' hóspede' + (todayDeps     !== 1 ? 's' : ''));
  set('qk-payments', pendingPay    + ' pendente' + (pendingPay   !== 1 ? 's' : ''));

  // Próximas chegadas
  const list = document.getElementById('m-proximas-list');
  if (list) {
    if (upcoming.length === 0) {
      list.innerHTML = '<div class="m-arrival-row"><div class="m-arrival-copy"><div class="m-arrival-meta">Sem chegadas próximas</div></div></div>';
    } else {
      list.innerHTML = upcoming.map(r => {
        const dotColor = r.status === 'confirmada' ? 'var(--verde)' : 'var(--laranja)';
        return `<div class="m-arrival-row" ${AppActions.attrs("click", "dashboard-abrir-reserva-3bb1e04", [String((r.id) ?? '')])}>
          <span class="m-arrival-dot" style="background:${dotColor}"></span>
          <div class="m-arrival-copy">
            <div class="m-arrival-name">${AppModules.core.escapeHtml(r.guest_name)}</div>
            <div class="m-arrival-meta">${AppModules.core.escapeHtml(r.accommodation_name)} · ${r.nights} noite${r.nights !== 1 ? 's' : ''}</div>
          </div>
          <div class="m-arrival-date">${relativeArrivalLabel(r.check_in, today)}</div>
        </div>`;
      }).join('');
    }
  }
}

async function goToTodayCheckins() {
  const today = new Date().toISOString().split('T')[0];
  await AppModules.core.showView('reservas');
  AppModules.reservas.setResExactDateFilter('check_in', today);
}

async function goToTodayCheckouts() {
  const today = new Date().toISOString().split('T')[0];
  await AppModules.core.showView('reservas');
  AppModules.reservas.setResExactDateFilter('check_out', today);
}

async function quickScanReceiptFromDashboard() {
  await AppModules.core.showView('despesas');
  document.getElementById('receipt-file-input')?.click();
}

async function goToPendingPayments() {
  await AppModules.core.showView('reservas');
  setTimeout(() => {
    const fp = document.getElementById('filter-pagamento');
    if (fp) {
      fp.value = 'pendente';
      AppUI.refreshDropdowns(document.getElementById('view-reservas'));
    }
    AppModules.reservas.renderTabela();
    AppModules.reservas.renderMobileCards();
  }, 50);
}

async function renderDashboard() {
  let stats;
  try { stats = await loadDashboardStats(); }
  catch (error) {
    const message = error.code === 'API_UPDATE_REQUIRED' ? error.message : 'Não foi possível carregar as reservas. Tenta novamente.';
    for (const id of ['dash-proximas', 'm-proximas-list', 'dash-avail', 'mac-sub']) {
      const el = document.getElementById(id);
      if (el) el.textContent = message;
    }
    for (const id of ['mac-count', 'qk-checkin', 'qk-checkout', 'qk-payments', 'm-kpi-ativas', 'm-kpi-noites', 'm-kpi-ocup']) {
      const el = document.getElementById(id);
      if (el) el.textContent = '—';
    }
    const next = document.getElementById('mac-next');
    if (next) next.style.display = 'none';
    return;
  }
  const upcoming = stats.upcoming;

  const dp = document.getElementById('dash-proximas');
  if (upcoming.length === 0) {
    dp.innerHTML = '<div class="empty-state"><div class="es-icon">🌅</div><h3>Sem chegadas próximas</h3></div>';
  } else {
    dp.innerHTML = '<table><thead><tr><th>Hóspede</th><th>Suite</th><th>Check-in</th><th>Noites</th><th>Estado</th></tr></thead><tbody>' +
      upcoming.map(r => `<tr ${AppActions.attrs("click", "dashboard-abrir-reserva-3bb1e04", [String((r.id) ?? '')])}>
        <td><b>${AppModules.core.escapeHtml(r.guest_name)}</b></td>
        <td>${accomChip(r)}</td>
        <td>${AppModules.core.formatDate(r.check_in)}</td>
        <td>${r.nights}</td>
        <td>${AppModules.core.badgeEstado(r.status)}</td>
      </tr>`).join('') + '</tbody></table>';
  }

  renderMobileDashboard(upcoming, stats?.today);
  if (window.lucide) lucide.createIcons();

  renderDashAvailability();
}

// Ocupação por unidade no mês corrente — vem já calculada do backend (noites
// dentro do mês, reservas multi-suite e do alojamento inteiro incluídas).
function renderDashAvailability() {
  const da = document.getElementById('dash-avail');
  if (!da) return;
  if (_dashAvailability === null) {
    da.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    return;
  }
  if (!_dashAvailability.length) {
    da.innerHTML = '<div class="empty-state"><div class="es-icon">🛏️</div><h3>Sem dados de ocupação</h3></div>';
    return;
  }
  da.innerHTML = _dashAvailability.map(u => {
    const cor = u.color || '#843424';
    const pct = u.occupancy_rate;
    return `<div class="avail-suite" style="margin-bottom:12px;border-color:${cor}40;">
      <div class="avail-suite-name" style="display:flex;align-items:center;gap:8px;">
        <span style="width:10px;height:10px;border-radius:50%;background:${cor};flex-shrink:0;display:inline-block;"></span>
        ${AppModules.core.escapeHtml(u.name)}
      </div>
      <div class="avail-bar"><div class="avail-fill" style="--fill-pct:${pct}%;background:${cor}"></div></div>
      <div class="avail-info"><span>${pct}% ocupado · ${u.nights}/${u.days_in_month} noites</span><span>€${u.price_per_night}/noite</span></div>
    </div>`;
  }).join('');
}

AppActions.register({
  "dashboard-abrir-reserva-3bb1e04": (el, event, args) => { AppModules.core.abrirReserva(args[0]) },
}, "click");

// Limpeza da funcionalidade ao sair ou trocar de organização.
AppModules.onReset('dashboard.js', () => {
  _dashAvailability = null;
});

})();
