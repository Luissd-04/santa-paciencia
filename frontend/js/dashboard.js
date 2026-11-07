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
    a.download = `santa_paciencia_${window.ReservationDates.localIso()}.zip`;
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
      document.getElementById('kpi-faturado').textContent = ReservationMoney.format(s.totalReserved);
      document.getElementById('kpi-financial-details').textContent = `Com fatura: ${ReservationMoney.format(s.totalInvoiced)} · Recebido: ${ReservationMoney.format(s.totalReceived)}`;
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
  return `<span class="acc-chip" style="--acc:${color}">${AppModules.core.escapeHtml(r.accommodation_name)}</span>`;
}

function relativeArrivalLabel(dateStr, todayStr) {
  if (dateStr === todayStr) return 'Hoje';
  if (dateStr === window.ReservationDates.localIso(new Date(`${todayStr}T12:00:00`), 1)) return 'Amanhã';
  return AppModules.core.formatDate(dateStr);
}

function renderMobileDashboard(upcoming = [], counts = {}) {
  const today = window.ReservationDates.localIso();
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
  const today = window.ReservationDates.localIso();
  await AppModules.core.showView('reservas');
  AppModules.reservas.setResExactDateFilter('check_in', today);
}

async function goToTodayCheckouts() {
  const today = window.ReservationDates.localIso();
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
  renderPainelV2(stats);
  if (window.lucide) lucide.createIcons();

  renderDashAvailability();
}

// ── Painel da V2 (aspetos Clássico e Vidro; js/domain/appearance.js) ──
// Os dados vêm do mesmo /stats/dashboard (campo `painel`); a V1 não o usa.
// Linhas e números clicáveis também com Enter e Espaço (teclado).
const PAINEL_KEYS = AppActions.attrs('keydown', 'dashboard-painel-tecla');
const PAINEL_TONES = { confirmada: 'ok', pendente: 'violet', pre_reserva: 'violet', aguardar_pagamento: 'warn', check_in: 'info', check_out: 'neutral', cancelada: 'bad' };
const TASK_ICONS = { limpeza: 'sparkles', manutencao: 'wrench', compras: 'shopping-cart', lavandaria: 'shirt' };

function painelGreeting(name) {
  const hour = Number(new Date().toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Europe/Lisbon' }));
  const first = String(name || '').trim().split(/\s+/)[0];
  return `${hour < 12 ? 'Bom dia' : hour < 20 ? 'Boa tarde' : 'Boa noite'}${first ? `, ${first}` : ''}`;
}

function painelTodayLabel(iso) {
  const label = window.ReservationDates.formatDayLabel(iso, { long: true });
  const weekday = new Date(`${iso}T12:00:00`).toLocaleDateString('pt-PT', { weekday: 'long' });
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${label}`;
}

function painelChip(tone, label) {
  return `<span class="v2-chip ${tone}">${AppModules.core.escapeHtml(label)}</span>`;
}

function painelRowAttrs(item) {
  return item.kind === 'task' ? '' : `role="button" tabindex="0" ${PAINEL_KEYS} ${AppActions.attrs('click', 'dashboard-abrir-reserva-3bb1e04', [String(item.id)])}`;
}

function painelTodayItem(item) {
  const esc = AppModules.core.escapeHtml;
  const money = ReservationMoney.format;
  if (item.kind === 'task') {
    return `<div class="v2-row">
      <span class="v2-time">${esc(item.time || '—')}</span><span class="v2-ic">${AppModules.core.lcIcon(TASK_ICONS[item.type] || 'list-checks', 16)}</span>
      <div class="v2-row-text"><b>${esc(item.title)}</b><span>${esc([item.accommodation_name, item.responsible].filter(Boolean).join(' · ') || 'Tarefa')}</span></div>
      ${painelChip(item.done ? 'ok' : 'neutral', item.done ? 'Feita' : 'Planeada')}</div>`;
  }
  const label = item.kind === 'checkin' ? 'Check-in' : 'Check-out';
  const owed = item.missing > 0.005 ? `faltam ${money(item.missing)}` : 'pago';
  const action = item.done
    ? painelChip('ok', 'Feito')
    : `<button type="button" class="v2-btn sm" ${AppActions.attrs('click', 'dashboard-painel-marcar-feito', [String(item.id), item.kind])}>Marcar feito</button>`;
  return `<div class="v2-row v2-row-link" ${painelRowAttrs(item)}>
    <span class="v2-time">${esc(item.time || '—')}</span><span class="v2-ic">${AppModules.core.lcIcon(item.kind === 'checkin' ? 'log-in' : 'log-out', 16)}</span>
    <div class="v2-row-text"><b>${label} · ${esc(item.guest_name)}</b><span>${esc(item.accommodation_name)} · <em class="${item.missing > 0.005 ? 'v2-owed' : ''}">${owed}</em></span></div>
    ${action}</div>`;
}

function painelAttention(painel) {
  const esc = AppModules.core.escapeHtml;
  const names = list => `${esc(list[0].guest_name)}${list.length > 1 ? ` e mais ${list.length - 1}` : ''}`;
  const groups = [
    ['pendingApproval', 'inbox', 'violet', list => list.length === 1 ? 'Pedido por aprovar' : `${list.length} pedidos por aprovar`,
      list => `${names(list)} · chega ${window.ReservationDates.formatDayLabel(list[0].check_in, { weekday: false })}`],
    ['awaitingDeposit', 'credit-card', 'warn', list => list.length === 1 ? 'Falta o sinal' : `Falta o sinal em ${list.length} reservas`,
      list => `${names(list)} · ${ReservationMoney.format(list.reduce((sum, r) => sum + r.missing, 0))} em falta`],
    ['precheckinMissing', 'send', 'info', () => 'Pré-check-in em falta',
      list => `${list.length} reserva${list.length === 1 ? '' : 's'} nos próximos 7 dias`],
  ].filter(([key]) => painel.attention[key].length);
  const count = groups.reduce((sum, [key]) => sum + painel.attention[key].length, 0);
  const rows = groups.map(([key, icon, tone, title, text]) => {
    const list = painel.attention[key];
    return `<div class="v2-row v2-row-link" role="button" tabindex="0" ${PAINEL_KEYS} ${AppActions.attrs('click', 'dashboard-abrir-reserva-3bb1e04', [String(list[0].id)])}>
      <span class="v2-ic ${tone}">${AppModules.core.lcIcon(icon, 16)}</span>
      <div class="v2-row-text"><b>${title(list)}</b><span>${text(list)}</span></div>
      <span class="v2-btn sm">Ver</span></div>`;
  }).join('');
  return `<div class="v2-card v2-c-atencao"><div class="v2-card-h"><h3>Precisa de atenção</h3>${count ? painelChip('bad', String(count)) : ''}</div>
    ${rows || `<p class="v2-empty">${AppModules.core.lcIcon('check-circle', 16)} Tudo em dia.</p>`}</div>`;
}

function renderPainelV2(stats) {
  const root = document.getElementById('v2-painel');
  if (!root || !stats?.painel) return;
  const esc = AppModules.core.escapeHtml;
  const painel = stats.painel;
  const today = window.ReservationDates.localIso();
  const arrivals = painel.today.filter(i => i.kind === 'checkin');
  const departures = painel.today.filter(i => i.kind === 'checkout');
  const first = list => list[0] ? `${esc(list[0].guest_name)}${list[0].time ? ` · ${esc(list[0].time)}` : ''}${list.length > 1 ? ` e mais ${list.length - 1}` : ''}` : 'Nenhuma';
  const monthName = new Date(`${today}T12:00:00`).toLocaleDateString('pt-PT', { month: 'long' });
  const prevName = new Date(new Date(`${today.slice(0, 8)}01T12:00:00`).getTime() - 86400000).toLocaleDateString('pt-PT', { month: 'long' });
  const diff = Number(stats.occupancyRate) - Number(painel.previousOccupancyRate);
  const diffText = diff === 0 ? `igual a ${prevName}` : `<b class="${diff > 0 ? 'v2-up' : 'v2-down'}">${diff > 0 ? '+' : '−'}${Math.abs(diff)} pts</b> face a ${prevName}`;
  const kpi = (icon, label, value, sub, action) => `<div class="v2-card v2-kpi" role="button" tabindex="0" ${PAINEL_KEYS} ${AppActions.attrs('click', 'dashboard-painel-ir', [action])}>
    <small><span class="v2-ic">${AppModules.core.lcIcon(icon, 16)}</span>${label}</small><strong>${value}</strong><span>${sub}</span></div>`;
  const color = id => AppModules.core.accommodations.find(a => a.id === id)?.color || 'var(--v2-accent)';

  root.innerHTML = `
    <header class="v2-head"><h2>${esc(painelGreeting(AppModules.core.currentUser?.name))}</h2><span>${esc(painelTodayLabel(today))}</span></header>
    <div class="v2-kpis">
      ${kpi('log-in', 'Chegadas hoje', arrivals.length, first(arrivals), 'checkins')}
      ${kpi('log-out', 'Saídas hoje', departures.length, first(departures), 'checkouts')}
      ${kpi('bed-double', `Ocupação de ${monthName}`, `${stats.occupancyRate}%`, diffText, 'calendario')}
      ${kpi('wallet', 'Por receber', ReservationMoney.format(painel.receivable.amount), `em ${painel.receivable.count} reserva${painel.receivable.count === 1 ? '' : 's'}`, 'pagamentos')}
    </div>
    <div class="v2-grid">
      <div class="v2-col">
        <div class="v2-card v2-dense v2-c-hoje"><div class="v2-card-h"><h3>Hoje</h3><span class="v2-link">${esc(window.ReservationDates.formatDayLabel(today))}</span></div>
          ${painel.today.length ? painel.today.map(painelTodayItem).join('') : '<p class="v2-empty">Nada marcado para hoje.</p>'}</div>
        <div class="v2-card v2-dense v2-c-proximas"><div class="v2-card-h"><h3>Próximas chegadas</h3><button type="button" class="v2-link" ${AppActions.attrs('click', 'dashboard-painel-ir', ['reservas'])}>Ver todas</button></div>
          ${stats.upcoming.length ? stats.upcoming.map(r => `<div class="v2-row v2-row-link" role="button" tabindex="0" ${PAINEL_KEYS} ${AppActions.attrs('click', 'dashboard-abrir-reserva-3bb1e04', [String(r.id)])}>
            <span class="v2-av">${esc(String(r.guest_name || '?').split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase())}</span>
            <div class="v2-row-text"><b>${esc(r.guest_name)}</b><span><i class="v2-dot" style="background:${esc(color(r.accommodation_id))}"></i>${esc(r.accommodation_name)} · ${r.nights} noite${r.nights === 1 ? '' : 's'}</span></div>
            ${painelChip(PAINEL_TONES[r.status] || 'neutral', window.ReservationStatus.label(r.status))}
            <span class="v2-when">${r.check_in === today ? 'Hoje' : esc(window.ReservationDates.formatDayLabel(r.check_in))}</span></div>`).join('') : '<p class="v2-empty">Sem chegadas marcadas.</p>'}</div>
      </div>
      <div class="v2-col">
        ${painelAttention(painel)}
        <div class="v2-card v2-c-ocupacao"><div class="v2-card-h"><h3>Ocupação · ${esc(monthName)}</h3></div>
          ${(stats.availability || []).length ? `<div class="v2-occ">${stats.availability.map(u => `<div><span><span><i class="v2-dot" style="background:${esc(u.color || 'var(--v2-accent)')}"></i>${esc(u.name)}</span><b>${u.occupancy_rate}%</b></span>
            <div class="v2-bar"><i style="width:${Math.min(100, u.occupancy_rate)}%;background:${esc(u.color || 'var(--v2-accent)')}"></i></div></div>`).join('')}</div>` : '<p class="v2-empty">Sem dados de ocupação.</p>'}</div>
      </div>
    </div>`;
}

async function painelMarcarFeito(reservationId, kind) {
  try {
    await AppModules.core.apiPost(`/api/reservations/${reservationId}/task-status`, { kind, done: true });
    AppModules.core.toast('✅ Marcado como feito.', 'success');
    await renderDashboard();
  } catch (err) {
    AppModules.core.toast('❌ ' + (err?.payload?.error || 'Não foi possível marcar.'), 'error');
  }
}

const PAINEL_DESTINOS = {
  checkins: () => goToTodayCheckins(),
  checkouts: () => goToTodayCheckouts(),
  pagamentos: () => goToPendingPayments(),
  calendario: () => AppModules.core.showView('calendario'),
  reservas: () => AppModules.core.showView('reservas'),
};

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
      <div class="avail-info"><span>${pct}% ocupado · ${u.nights}/${u.days_in_month} noites</span><span>${ReservationMoney.formatShort(u.price_per_night)}/noite</span></div>
    </div>`;
  }).join('');
}

AppActions.register({
  "dashboard-abrir-reserva-3bb1e04": (el, event, args) => { AppModules.core.abrirReserva(args[0]) },
  "dashboard-painel-ir": (el, event, args) => { PAINEL_DESTINOS[args[0]]?.() },
  "dashboard-painel-marcar-feito": (el, event, args) => { event.stopPropagation(); return painelMarcarFeito(args[0], args[1]) },
}, "click");

AppActions.register({
  "dashboard-painel-tecla": (el, event) => {
    if ((event.key !== 'Enter' && event.key !== ' ') || event.target !== el) return;
    event.preventDefault();
    el.click();
  },
}, "keydown");

// Limpeza da funcionalidade ao sair ou trocar de organização.
AppModules.onReset('dashboard.js', () => {
  _dashAvailability = null;
});

})();
