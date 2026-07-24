async function exportDB() {
  showOperationProgress('A exportar base de dados', 'A preparar ZIP...', 8);
  try {
    const res = await fetch(API_BASE + '/api/backup/export', { credentials: 'include' });
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
      updateOperationProgress(20, 'A receber ficheiro...');
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        updateOperationProgress(20 + (received / total) * 70, 'A receber ficheiro...');
      }
      blob = new Blob(chunks, { type: res.headers.get('content-type') || 'application/zip' });
    } else {
      updateOperationProgress(45, 'A receber ficheiro...');
      blob = await res.blob();
    }
    updateOperationProgress(92, 'A iniciar download...');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `santa_paciencia_${new Date().toISOString().slice(0,10)}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    updateOperationProgress(100, 'Concluído.');
    toast('✅ Backup ZIP exportado com imagens!', 'success');
  } catch (e) {
    toast('❌ Erro ao exportar backup ZIP: ' + (e.message || 'erro desconhecido'), 'error');
  } finally {
    hideOperationProgress();
  }
}

async function importDB(input) {
  const file = input.files[0];
  if (!file) return;
  if (!/\.zip$/i.test(file.name)) {
    toast('❌ Seleciona um ficheiro ZIP válido.', 'error');
    input.value = '';
    return;
  }
  if (!confirm('⚠️ Isto vai SUBSTITUIR os dados do cliente neste espaço pelos dados do ficheiro. Contas, equipa e acessos da plataforma não serão alterados. Tem a certeza?')) {
    input.value = '';
    return;
  }
  showOperationProgress('A importar base de dados', 'A ler ficheiro ZIP...', 8);
  try {
    const bytes = await file.arrayBuffer();
    updateOperationProgress(25, 'A preparar ficheiro...');
    let binary = '';
    const chunkSize = 0x8000;
    const uint8 = new Uint8Array(bytes);
    for (let i = 0; i < uint8.length; i += chunkSize) {
      const chunk = uint8.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
      updateOperationProgress(25 + Math.min(35, (i / Math.max(uint8.length, 1)) * 35), 'A preparar ficheiro...');
    }
    const archiveBase64 = btoa(binary);

    updateOperationProgress(65, 'A enviar e restaurar dados...');
    const res = await apiPost('/api/backup/import', {
      filename: file.name,
      archiveBase64
    });
    if (res.success) {
      updateOperationProgress(100, 'Concluído. A recarregar...');
      toast('✅ Base de dados importada! A recarregar...', 'success');
      setTimeout(() => window.location.reload(), 1500);
    } else {
      toast('❌ ' + (res.error || 'Erro ao importar.'), 'error');
    }
  } catch (e) {
    toast('❌ ZIP inválido ou erro de ligação.', 'error');
  } finally {
    hideOperationProgress();
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
  return `<span style="display:inline-block;padding:2px 10px;border-radius:20px;font-size:12px;font-weight:600;background:${color}20;color:${color};border:1px solid ${color}40;">${escapeHtml(r.accommodation_name)}</span>`;
}

function relativeArrivalLabel(dateStr, todayStr) {
  if (dateStr === todayStr) return 'Hoje';
  const tomorrow = new Date(todayStr + 'T00:00:00');
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (dateStr === tomorrow.toISOString().slice(0, 10)) return 'Amanhã';
  return formatDate(dateStr);
}

function renderMobileDashboard(upcoming = []) {
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

  // Próximas chegadas
  const list = document.getElementById('m-proximas-list');
  if (list) {
    if (upcoming.length === 0) {
      list.innerHTML = '<div class="m-arrival-row"><div class="m-arrival-copy"><div class="m-arrival-meta">Sem chegadas próximas</div></div></div>';
    } else {
      list.innerHTML = upcoming.map(r => {
        const dotColor = r.status === 'confirmada' ? 'var(--verde)' : 'var(--laranja)';
        return `<div class="m-arrival-row" onclick="showDetail('${r.id}')">
          <span class="m-arrival-dot" style="background:${dotColor}"></span>
          <div class="m-arrival-copy">
            <div class="m-arrival-name">${escapeHtml(r.guest_name)}</div>
            <div class="m-arrival-meta">${escapeHtml(r.accommodation_name)} · ${r.nights} noite${r.nights !== 1 ? 's' : ''}</div>
          </div>
          <div class="m-arrival-date">${relativeArrivalLabel(r.check_in, today)}</div>
        </div>`;
      }).join('');
    }
  }
}

function goToTodayCheckins() {
  const today = new Date().toISOString().split('T')[0];
  showView('reservas');
  setTimeout(() => {
    setResExactDateFilter('check_in', today);
  }, 50);
}

function goToTodayCheckouts() {
  const today = new Date().toISOString().split('T')[0];
  showView('reservas');
  setTimeout(() => {
    setResExactDateFilter('check_out', today);
  }, 50);
}

function quickScanReceiptFromDashboard() {
  showView('despesas');
  setTimeout(() => document.getElementById('receipt-file-input')?.click(), 200);
}

function goToPendingPayments() {
  showView('reservas');
  setTimeout(() => {
    const fp = document.getElementById('filter-pagamento');
    if (fp) {
      fp.value = 'pendente';
      AppUI.refreshDropdowns(document.getElementById('view-reservas'));
    }
    renderTabela();
    renderMobileCards();
  }, 50);
}

async function renderDashboard() {
  await Promise.all([loadDashboardStats(), loadReservas()]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const upcoming = reservas
    .filter(r => r.status !== 'cancelada' && r.status !== 'check-out' && r.check_in >= todayStr)
    .sort((a, b) => new Date(a.check_in) - new Date(b.check_in))
    .slice(0, 5);

  const dp = document.getElementById('dash-proximas');
  if (upcoming.length === 0) {
    dp.innerHTML = '<div class="empty-state"><div class="es-icon">🌅</div><h3>Sem chegadas próximas</h3></div>';
  } else {
    dp.innerHTML = '<table><thead><tr><th>Hóspede</th><th>Suite</th><th>Check-in</th><th>Noites</th><th>Estado</th></tr></thead><tbody>' +
      upcoming.map(r => `<tr onclick="showDetail('${r.id}')">
        <td><b>${escapeHtml(r.guest_name)}</b></td>
        <td>${accomChip(r)}</td>
        <td>${formatDate(r.check_in)}</td>
        <td>${r.nights}</td>
        <td>${badgeEstado(r.status)}</td>
      </tr>`).join('') + '</tbody></table>';
  }

  renderMobileDashboard(upcoming);
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
