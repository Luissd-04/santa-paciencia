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
  const resId = _rdv2Current?.id;
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
    const res = await apiGet(`/api/events?reservation_id=${encodeURIComponent(resId)}`);
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
  if (panel.style.display !== 'none') rdv2LoadTarefas(_rdv2Current?.id);
  else panel.dataset.loaded = '';
}

async function rdv2RefreshTaskBar(resId) {
  try {
    const data = await apiGet(`/api/reservations/${resId}`);
    const ts = data.data?.task_status || {};
    const wrap = document.getElementById('rdv2-task-bar');
    if (wrap) {
      wrap.innerHTML = rdv2TaskBtnHtml(resId, 'checkin', !!ts.checkin_done)
        + rdv2TaskBtnHtml(resId, 'checkout', !!ts.checkout_done);
      if (window.lucide) lucide.createIcons();
    }
  } catch {}
}

function rdv2RenderTarefas(resId) {
  const panel = document.getElementById('rdv2-panel-tarefas');
  if (!panel) return;
  const typeInfo = id => EVENT_TYPES.find(t => t.id === id) || EVENT_TYPES.find(t => t.id === 'outro');

  const rows = _rdv2TarefasData.map(ev => {
    const t = typeInfo(ev.type);
    const done = ev.status === 'concluido';
    const isAuto = Number(ev.auto_generated) === 1;
    return `
      <div class="rdv2-tarefa-row${done ? ' rdv2-tarefa-done' : ''}">
        <button class="rdv2-tarefa-check" onclick="rdv2ToggleTarefa('${resId}','${ev.id}')"
          title="${done ? 'Repor como planeada' : 'Marcar como concluída'}">
          ${lcIcon(done ? 'check-circle' : 'circle', 16)}
        </button>
        <div class="rdv2-tarefa-info">
          <span class="rdv2-tarefa-title">${escapeHtml(ev.title || '—')}</span>
          <span class="rdv2-tarefa-meta">
            <span class="rdv2-tarefa-type" style="color:${t.color};border-color:${t.color}44;background:${t.color}12;">${lcIcon(t.icon, 10)} ${t.singular}</span>
            ${lcIcon('calendar', 10)} ${rdv2ShortDate(ev.date)}${ev.start_time ? ` · ${ev.start_time}${ev.end_time ? '–' + ev.end_time : ''}` : ''}
            ${ev.responsible ? ` · ${lcIcon('user', 10)} ${escapeHtml(ev.responsible)}` : ''}
            ${isAuto ? ' · <span class="rdv2-tarefa-auto">automática</span>' : ''}
          </span>
          ${ev.notes ? `<span class="rdv2-tarefa-notes">${escapeHtml(ev.notes)}</span>` : ''}
        </div>
        ${isAuto ? '' : `<button class="rdv2-icon-btn" onclick="rdv2DeleteTarefa('${resId}','${ev.id}')" title="Eliminar tarefa">${lcIcon('trash-2', 12)}</button>`}
      </div>`;
  }).join('');

  const today = new Date().toISOString().slice(0, 10);
  const defaultDate = (_rdv2Current?.check_in && _rdv2Current.check_in >= today) ? _rdv2Current.check_in : today;

  panel.innerHTML = `
    <div class="rdv2-main rdv2-tarefas-card">
      <div class="rdv2-tarefas-head">
        <span class="rdv2-widget-title">${lcIcon('list-checks', 12)} Tarefas desta reserva</span>
      </div>
      <div class="rdv2-tarefas-add">
        <input type="text" id="rdv2-nova-tarefa-titulo" class="form-control" placeholder="Nova tarefa…" maxlength="120">
        <input type="date" id="rdv2-nova-tarefa-data" class="form-control" value="${defaultDate}">
        <select id="rdv2-nova-tarefa-tipo" class="form-control">
          ${EVENT_TYPES.map(t => `<option value="${t.id}"${t.id === 'outro' ? ' selected' : ''}>${t.singular}</option>`).join('')}
        </select>
        <button class="btn btn-primary btn-sm" onclick="rdv2AddTarefa('${resId}')">${lcIcon('plus', 13)} Adicionar</button>
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
  if (!title) { toast('⚠️ Indica o título da tarefa.', 'error'); return; }
  if (!date) { toast('⚠️ Indica a data da tarefa.', 'error'); return; }
  try {
    await apiPost('/api/events', {
      title, date, type,
      reservation_id: resId,
      accommodation_id: _rdv2Current?.accommodation_id || null,
      responsible: currentUser?.name || null,
    });
    toast('✅ Tarefa criada.', 'success');
    await rdv2LoadTarefas(resId);
  } catch (err) {
    toast('❌ ' + (err?.payload?.error || 'Erro ao criar tarefa.'), 'error');
  }
}

async function rdv2ToggleTarefa(resId, id) {
  const ev = _rdv2TarefasData.find(e => e.id === id);
  if (!ev) return;
  try {
    await apiPut(`/api/events/${id}`, { ...ev, status: ev.status === 'concluido' ? 'planeado' : 'concluido' });
    await rdv2LoadTarefas(resId);
    // Check-in/check-out automáticos refletem-se na barra da tab Reserva.
    if (ev.auto_kind === 'checkin' || ev.auto_kind === 'checkout') rdv2RefreshTaskBar(resId);
    if (typeof loadNotifications === 'function') loadNotifications();
  } catch (err) {
    toast('❌ ' + (err?.payload?.error || 'Não foi possível atualizar.'), 'error');
  }
}

async function rdv2DeleteTarefa(resId, id) {
  if (!confirm('Eliminar esta tarefa?')) return;
  try {
    await apiDelete(`/api/events/${id}`);
    toast('Tarefa eliminada.', 'info');
    await rdv2LoadTarefas(resId);
  } catch (err) {
    toast('❌ ' + (err?.payload?.error || 'Não foi possível eliminar.'), 'error');
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
    return escapeHtml(accommodations.find(a => a.id === value)?.name || String(value));
  }
  if (field === 'check_in' || field === 'check_out' || field === 'payment_date') return rdv2ShortDate(String(value));
  if (field === 'total_amount' || field === 'amount_paid') return `€${Number(value).toFixed(2)}`;
  if (field === 'breakfast_included') return Number(value) ? 'Sim' : 'Não';
  if (field === 'status' || field === 'payment_status') return RDV2_STATUS_LABELS[value] || escapeHtml(String(value));
  return escapeHtml(String(value));
}

function rdv2TimelineMetaLine(action, meta) {
  if (!meta) return '';
  try { meta = typeof meta === 'string' ? JSON.parse(meta) : meta; } catch { return ''; }
  if (!meta || typeof meta !== 'object') return '';
  const bits = [];
  if (action === 'payment_added' || action === 'payment_deleted') {
    if (meta.amount != null) bits.push(`€${Number(meta.amount).toFixed(2)}`);
    if (meta.method) bits.push(escapeHtml(String(meta.method)));
    if (meta.payment_date) bits.push(rdv2ShortDate(String(meta.payment_date)));
  } else if (action === 'invoice_saved') {
    if (meta.invoice_number) bits.push(`Nº ${escapeHtml(String(meta.invoice_number))}`);
  } else if (action === 'task_status') {
    const kind = meta.kind === 'checkin' ? 'Check-in' : meta.kind === 'checkout' ? 'Check-out' : escapeHtml(String(meta.kind || ''));
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
    const res = await apiGet(`/api/reservations/${resId}/history`);
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
    const meta = RDV2_ACTION_META[h.action] || { icon: 'circle-dot', label: escapeHtml(h.action || '—') };
    let changes = [];
    try { changes = typeof h.changes === 'string' ? JSON.parse(h.changes || '[]') : (h.changes || []); } catch {}
    const changesHtml = (changes || []).map(c => `
      <div class="rdv2-tl-change">
        <span class="rdv2-tl-field">${RDV2_FIELD_LABELS[c.field] || escapeHtml(c.field)}</span>
        <span>${rdv2FormatFieldValue(c.field, c.from)} → <b>${rdv2FormatFieldValue(c.field, c.to)}</b></span>
      </div>`).join('');
    const who = h.user_name ? escapeHtml(h.user_name) : 'Sistema';
    return `
      <div class="rdv2-tl-entry">
        <div class="rdv2-tl-dot">${lcIcon(meta.icon, 13)}</div>
        <div class="rdv2-tl-body">
          <div class="rdv2-tl-head">
            <span class="rdv2-tl-action">${meta.label}</span>
            <span class="rdv2-tl-when">${fmtWhen(h.created_at)} · ${lcIcon('user', 10)} ${who}</span>
          </div>
          ${rdv2TimelineMetaLine(h.action, h.meta)}
          ${changesHtml}
        </div>
      </div>`;
  }).join('');

  panel.innerHTML = `
    <div class="rdv2-main rdv2-timeline-card">
      <div class="rdv2-tarefas-head">
        <span class="rdv2-widget-title">${lcIcon('git-branch', 12)} Histórico da reserva</span>
      </div>
      <div class="rdv2-tl-list">
        ${items || '<div class="rdv2-tab-empty">Ainda sem registos para esta reserva.</div>'}
      </div>
      <div class="rdv2-tl-footnote">O histórico é registado a partir da ativação desta funcionalidade — alterações anteriores não estão disponíveis.</div>
    </div>`;
  if (window.lucide) lucide.createIcons();
}
