// Estado privado; interface partilhada em AppModules.reservas.
(() => {
AppModules.define('reservas', {
  rdv2InvalidateTarefas: { get: () => rdv2InvalidateTarefas },
  rdv2ShowTab: { get: () => rdv2ShowTab },
});

// ── Tabs da ficha de reserva: Tarefas e Timeline ──
// A tab "Reserva" é renderizada em showDetail (reserva-lista.js); estas duas
// são carregadas sob demanda na primeira abertura de cada ficha.

let _rdv2TarefasData = [];

function rdv2ShowTab(tab) {
  ['reserva', 'tarefas', 'timeline'].forEach(t => {
    const btn = document.getElementById('rdv2-tab-btn-' + t);
    const panel = document.getElementById('rdv2-panel-' + t);
    if (btn) btn.classList.toggle('rdv2-tab-active', t === tab);
    if (panel) panel.style.display = t === tab ? '' : 'none';
  });
  const resId = AppModules.reservas._rdv2Current?.id;
  if (!resId) return;
  const panel = document.getElementById('rdv2-panel-' + tab);
  if (tab === 'tarefas' && panel && panel.dataset.loaded !== '1') rdv2LoadTarefas(resId);
  // A timeline recarrega sempre — ações feitas na própria ficha (estado,
  // pagamentos, fatura) geram novas entradas sem re-renderizar o detalhe.
  if (tab === 'timeline') rdv2LoadTimeline(resId);
}

// Data curta usada em ambas as tabs.
function rdv2ShortDate(d) {
  return d ? new Date(d.slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
}

// ══ TAREFAS ══

async function rdv2LoadTarefas(resId) {
  const panel = document.getElementById('rdv2-panel-tarefas');
  if (!panel) return;
  panel.dataset.loaded = '1';
  panel.innerHTML = '<div class="rdv2-tab-empty">A carregar tarefas…</div>';
  try {
    // Limite explícito: as tarefas de uma reserva cabem folgadamente numa
    // página, mas sem o limite ficavam pelos 50 por omissão da listagem.
    const res = await AppModules.core.apiGet(`/api/events?reservation_id=${encodeURIComponent(resId)}&limit=500`);
    _rdv2TarefasData = res.data || [];
    rdv2RenderTarefas(resId);
  } catch {
    panel.dataset.loaded = '';
    panel.innerHTML = '<div class="rdv2-tab-empty">❌ Erro ao carregar tarefas.</div>';
  }
}

// A barra de check-in/check-out da tab Reserva deriva das mesmas tarefas —
// invalidar/recarregar quando o estado muda num dos lados.
function rdv2InvalidateTarefas() {
  const panel = document.getElementById('rdv2-panel-tarefas');
  if (!panel || panel.dataset.loaded !== '1') return;
  if (panel.style.display !== 'none') rdv2LoadTarefas(AppModules.reservas._rdv2Current?.id);
  else panel.dataset.loaded = '';
}

async function rdv2RefreshTaskBar(resId) {
  try {
    const data = await AppModules.core.apiGet(`/api/reservations/${resId}`);
    const ts = data.data?.task_status || {};
    const wrap = document.getElementById('rdv2-task-bar');
    if (wrap) {
      wrap.innerHTML = AppModules.reservas.rdv2TaskBtnHtml(resId, 'checkin', !!ts.checkin_done)
        + AppModules.reservas.rdv2TaskBtnHtml(resId, 'checkout', !!ts.checkout_done);
      if (window.lucide) lucide.createIcons();
    }
  } catch {}
}

function rdv2RenderTarefas(resId) {
  const panel = document.getElementById('rdv2-panel-tarefas');
  if (!panel) return;
  const typeInfo = id => AppModules.core.EVENT_TYPES.find(t => t.id === id) || AppModules.core.EVENT_TYPES.find(t => t.id === 'outro');

  const rows = _rdv2TarefasData.map(ev => {
    const t = typeInfo(ev.type);
    const done = ev.status === 'concluido';
    const isAuto = Number(ev.auto_generated) === 1;
    return `
      <div class="rdv2-tarefa-row${done ? ' rdv2-tarefa-done' : ''}">
        <button class="rdv2-tarefa-check" ${AppActions.attrs("click", "reserva-detalhe-tabs-rdv2-toggle-tarefa-1af36e2", [String((resId) ?? ''), String((ev.id) ?? '')])}
          title="${done ? 'Repor como planeada' : 'Marcar como concluída'}">
          ${AppModules.core.lcIcon(done ? 'check-circle' : 'circle', 16)}
        </button>
        <div class="rdv2-tarefa-info">
          <span class="rdv2-tarefa-title">${AppModules.core.escapeHtml(ev.title || '—')}</span>
          <span class="rdv2-tarefa-meta">
            <span class="rdv2-tarefa-type" style="color:${t.color};border-color:${t.color}44;background:${t.color}12;">${AppModules.core.lcIcon(t.icon, 10)} ${t.singular}</span>
            ${AppModules.core.lcIcon('calendar', 10)} ${rdv2ShortDate(ev.date)}${ev.start_time ? ` · ${ev.start_time}${ev.end_time ? '–' + ev.end_time : ''}` : ''}
            ${ev.responsible ? ` · ${AppModules.core.lcIcon('user', 10)} ${AppModules.core.escapeHtml(ev.responsible)}` : ''}
            ${isAuto ? ' · <span class="rdv2-tarefa-auto">automática</span>' : ''}
          </span>
          ${ev.notes ? `<span class="rdv2-tarefa-notes">${AppModules.core.escapeHtml(ev.notes)}</span>` : ''}
        </div>
        ${isAuto ? '' : `<button class="rdv2-icon-btn" ${AppActions.attrs("click", "reserva-detalhe-tabs-rdv2-delete-tarefa-faf05c1", [String((resId) ?? ''), String((ev.id) ?? '')])} title="Eliminar tarefa">${AppModules.core.lcIcon('trash-2', 12)}</button>`}
      </div>`;
  }).join('');

  const today = new Date().toISOString().slice(0, 10);
  const defaultDate = (AppModules.reservas._rdv2Current?.check_in && AppModules.reservas._rdv2Current.check_in >= today) ? AppModules.reservas._rdv2Current.check_in : today;

  panel.innerHTML = `
    <div class="rdv2-main rdv2-tarefas-card">
      <div class="rdv2-tarefas-head">
        <span class="rdv2-widget-title">${AppModules.core.lcIcon('list-checks', 12)} Tarefas desta reserva</span>
      </div>
      <div class="rdv2-tarefas-add">
        <input type="text" id="rdv2-nova-tarefa-titulo" class="form-control" placeholder="Nova tarefa…" maxlength="120">
        <input type="date" id="rdv2-nova-tarefa-data" class="form-control" value="${defaultDate}">
        <select id="rdv2-nova-tarefa-tipo" class="form-control">
          ${AppModules.core.EVENT_TYPES.map(t => `<option value="${t.id}"${t.id === 'outro' ? ' selected' : ''}>${t.singular}</option>`).join('')}
        </select>
        <button class="btn btn-primary btn-sm" ${AppActions.attrs("click", "reserva-detalhe-tabs-rdv2-add-tarefa-57578aa", [String((resId) ?? '')])}>${AppModules.core.lcIcon('plus', 13)} Adicionar</button>
      </div>
      <div class="rdv2-tarefas-list">
        ${rows || '<div class="rdv2-tab-empty">Sem tarefas associadas a esta reserva.</div>'}
      </div>
    </div>`;
  if (window.lucide) lucide.createIcons();
}

async function rdv2AddTarefa(resId) {
  const title = document.getElementById('rdv2-nova-tarefa-titulo')?.value.trim();
  const date = document.getElementById('rdv2-nova-tarefa-data')?.value;
  const type = document.getElementById('rdv2-nova-tarefa-tipo')?.value || 'outro';
  if (!title) { AppModules.core.toast('⚠️ Indica o título da tarefa.', 'error'); return; }
  if (!date) { AppModules.core.toast('⚠️ Indica a data da tarefa.', 'error'); return; }
  try {
    await AppModules.core.apiPost('/api/events', {
      title, date, type,
      reservation_id: resId,
      accommodation_id: AppModules.reservas._rdv2Current?.accommodation_id || null,
      responsible: AppModules.core.currentUser?.name || null,
    });
    AppModules.core.toast('✅ Tarefa criada.', 'success');
    await rdv2LoadTarefas(resId);
  } catch (err) {
    AppModules.core.toast('❌ ' + (err?.payload?.error || 'Erro ao criar tarefa.'), 'error');
  }
}

async function rdv2ToggleTarefa(resId, id) {
  const ev = _rdv2TarefasData.find(e => e.id === id);
  if (!ev) return;
  try {
    await AppModules.core.apiPut(`/api/events/${id}`, { ...ev, status: ev.status === 'concluido' ? 'planeado' : 'concluido' });
    await rdv2LoadTarefas(resId);
    // Check-in/check-out automáticos refletem-se na barra da tab Reserva.
    if (ev.auto_kind === 'checkin' || ev.auto_kind === 'checkout') rdv2RefreshTaskBar(resId);
    if (typeof AppModules.core.loadNotifications === 'function') AppModules.core.loadNotifications();
  } catch (err) {
    AppModules.core.toast('❌ ' + (err?.payload?.error || 'Não foi possível atualizar.'), 'error');
  }
}

async function rdv2DeleteTarefa(resId, id) {
  if (!confirm('Eliminar esta tarefa?')) return;
  try {
    await AppModules.core.apiDelete(`/api/events/${id}`);
    AppModules.core.toast('Tarefa eliminada.', 'info');
    await rdv2LoadTarefas(resId);
  } catch (err) {
    AppModules.core.toast('❌ ' + (err?.payload?.error || 'Não foi possível eliminar.'), 'error');
  }
}

// ══ TIMELINE ══

const RDV2_ACTION_META = {
  created:         { icon: 'plus-circle',  label: 'Reserva criada' },
  updated:         { icon: 'pencil',       label: 'Reserva alterada' },
  approved:        { icon: 'check-circle', label: 'Reserva aprovada — pre check-in enviado' },
  cancelled:       { icon: 'x-circle',     label: 'Reserva cancelada' },
  payment_added:   { icon: 'credit-card',  label: 'Pagamento registado' },
  payment_deleted: { icon: 'trash-2',      label: 'Pagamento removido' },
  invoice_saved:   { icon: 'file-text',    label: 'Fatura registada' },
  task_status:     { icon: 'list-checks',  label: 'Tarefa atualizada' },
};

const RDV2_FIELD_LABELS = {
  accommodation_id: 'Alojamento',
  check_in: 'Check-in',
  check_out: 'Check-out',
  nights: 'Noites',
  num_adults: 'Adultos',
  num_children: 'Crianças',
  num_guests: 'Hóspedes',
  total_amount: 'Valor total',
  amount_paid: 'Valor pago',
  status: 'Estado',
  payment_status: 'Pagamento',
  payment_method: 'Método de pagamento',
  channel: 'Canal',
  breakfast_included: 'Pequeno-almoço',
  notes: 'Notas',
  payment_date: 'Data de pagamento',
};

const RDV2_STATUS_LABELS = {
  pre_reserva: 'Pré-reserva', confirmada: 'Confirmada', pendente: 'Pendente',
  pre_checkin: 'Pre Check-in', aguardar_pagamento: 'Aguardar Pagamento', cancelada: 'Cancelada',
  parcial: 'Parcial', confirmado: 'Completo', pago: 'Completo',
};

function rdv2FormatFieldValue(field, value) {
  if (value === null || value === undefined || value === '') return '—';
  if (field === 'accommodation_id') {
    return AppModules.core.escapeHtml(AppModules.core.accommodations.find(a => a.id === value)?.name || String(value));
  }
  if (field === 'check_in' || field === 'check_out' || field === 'payment_date') return rdv2ShortDate(String(value));
  if (field === 'total_amount' || field === 'amount_paid') return `€${Number(value).toFixed(2)}`;
  if (field === 'breakfast_included') return Number(value) ? 'Sim' : 'Não';
  if (field === 'status' || field === 'payment_status') return RDV2_STATUS_LABELS[value] || AppModules.core.escapeHtml(String(value));
  return AppModules.core.escapeHtml(String(value));
}

function rdv2TimelineMetaLine(action, meta) {
  if (!meta) return '';
  try { meta = typeof meta === 'string' ? JSON.parse(meta) : meta; } catch { return ''; }
  if (!meta || typeof meta !== 'object') return '';
  const bits = [];
  if (action === 'payment_added' || action === 'payment_deleted') {
    if (meta.amount != null) bits.push(`€${Number(meta.amount).toFixed(2)}`);
    if (meta.method) bits.push(AppModules.core.escapeHtml(String(meta.method)));
    if (meta.payment_date) bits.push(rdv2ShortDate(String(meta.payment_date)));
  } else if (action === 'invoice_saved') {
    if (meta.invoice_number) bits.push(`Nº ${AppModules.core.escapeHtml(String(meta.invoice_number))}`);
  } else if (action === 'task_status') {
    const kind = meta.kind === 'checkin' ? 'Check-in' : meta.kind === 'checkout' ? 'Check-out' : AppModules.core.escapeHtml(String(meta.kind || ''));
    bits.push(`${kind} ${meta.done ? 'marcado como feito' : 'reposto como por fazer'}`);
  } else if (action === 'created') {
    if (meta.check_in && meta.check_out) bits.push(`${rdv2ShortDate(String(meta.check_in))} → ${rdv2ShortDate(String(meta.check_out))}`);
    if (meta.total_amount != null) bits.push(`€${Number(meta.total_amount).toFixed(2)}`);
    if (meta.source === 'public') bits.push('via página de reservas online');
  }
  return bits.length ? `<span class="rdv2-tl-meta">${bits.join(' · ')}</span>` : '';
}

async function rdv2LoadTimeline(resId) {
  const panel = document.getElementById('rdv2-panel-timeline');
  if (!panel) return;
  panel.dataset.loaded = '1';
  panel.innerHTML = '<div class="rdv2-tab-empty">A carregar histórico…</div>';
  try {
    const res = await AppModules.core.apiGet(`/api/reservations/${resId}/history`);
    rdv2RenderTimeline(res.data || []);
  } catch {
    panel.dataset.loaded = '';
    panel.innerHTML = '<div class="rdv2-tab-empty">❌ Erro ao carregar o histórico.</div>';
  }
}

function rdv2RenderTimeline(entries) {
  const panel = document.getElementById('rdv2-panel-timeline');
  if (!panel) return;

  const fmtWhen = iso => {
    if (!iso) return '—';
    // created_at vem em UTC ("YYYY-MM-DD HH:MM:SS") — apresentar em hora local.
    const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
    return isNaN(d) ? iso : d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' })
      + ' ' + d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
  };

  const items = entries.map(h => {
    const meta = RDV2_ACTION_META[h.action] || { icon: 'circle-dot', label: AppModules.core.escapeHtml(h.action || '—') };
    let changes = [];
    try { changes = typeof h.changes === 'string' ? JSON.parse(h.changes || '[]') : (h.changes || []); } catch {}
    const changesHtml = (changes || []).map(c => `
      <div class="rdv2-tl-change">
        <span class="rdv2-tl-field">${RDV2_FIELD_LABELS[c.field] || AppModules.core.escapeHtml(c.field)}</span>
        <span>${rdv2FormatFieldValue(c.field, c.from)} → <b>${rdv2FormatFieldValue(c.field, c.to)}</b></span>
      </div>`).join('');
    const who = h.user_name ? AppModules.core.escapeHtml(h.user_name) : 'Sistema';
    return `
      <div class="rdv2-tl-entry">
        <div class="rdv2-tl-dot">${AppModules.core.lcIcon(meta.icon, 13)}</div>
        <div class="rdv2-tl-body">
          <div class="rdv2-tl-head">
            <span class="rdv2-tl-action">${meta.label}</span>
            <span class="rdv2-tl-when">${fmtWhen(h.created_at)} · ${AppModules.core.lcIcon('user', 10)} ${who}</span>
          </div>
          ${rdv2TimelineMetaLine(h.action, h.meta)}
          ${changesHtml}
        </div>
      </div>`;
  }).join('');

  panel.innerHTML = `
    <div class="rdv2-main rdv2-timeline-card">
      <div class="rdv2-tarefas-head">
        <span class="rdv2-widget-title">${AppModules.core.lcIcon('git-branch', 12)} Histórico da reserva</span>
      </div>
      <div class="rdv2-tl-list">
        ${items || '<div class="rdv2-tab-empty">Ainda sem registos para esta reserva.</div>'}
      </div>
      <div class="rdv2-tl-footnote">O histórico é registado a partir da ativação desta funcionalidade — alterações anteriores não estão disponíveis.</div>
    </div>`;
  if (window.lucide) lucide.createIcons();
}

AppActions.register({
  "reserva-detalhe-tabs-rdv2-add-tarefa-57578aa": (el, event, args) => { rdv2AddTarefa(args[0]) },
  "reserva-detalhe-tabs-rdv2-delete-tarefa-faf05c1": (el, event, args) => { rdv2DeleteTarefa(args[0],args[1]) },
  "reserva-detalhe-tabs-rdv2-toggle-tarefa-1af36e2": (el, event, args) => { rdv2ToggleTarefa(args[0],args[1]) },
}, "click");

// Limpeza da funcionalidade ao sair ou trocar de organização.
AppModules.onReset('reserva-detalhe-tabs.js', () => {
  _rdv2TarefasData = [];
});

})();
