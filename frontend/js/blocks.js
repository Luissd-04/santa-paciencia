// ── Bloqueios de datas dos alojamentos (manutenção, uso pessoal, etc.) ──
// A API usa datas inclusivas (start_date..end_date, ambos bloqueados).
// O backend impede reservas nessas datas; aqui tratamos da visualização/gestão.

let accommodationBlocks = [];

async function loadBlocks() {
  try {
    const res = await apiGet('/api/accommodations/blocks');
    accommodationBlocks = res.data || [];
  } catch (e) {
    accommodationBlocks = [];
  }
  return accommodationBlocks;
}

function blkAddDays(iso, n) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function blkFmt(iso) {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Bloqueios diretos de um alojamento (para a ficha e para a timeline).
function blocksForAccommodation(accId) {
  return accommodationBlocks
    .filter(b => b.accommodation_id === accId)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
}

// ── Timeline: faixas cinza por bloqueio numa linha de alojamento ──
// Devolve HTML absoluto (mesma matemática dos blocos de reserva na timeline).
function blockBandsHtml(accId, yearStart, totalDays, dayW) {
  const totalWidth = totalDays * dayW;
  return blocksForAccommodation(accId).map(b => {
    const start = new Date(b.start_date + 'T00:00:00');
    const endExclusive = new Date(blkAddDays(b.end_date, 1) + 'T00:00:00');
    const offset = Math.round((start - yearStart) / 86400000);
    const days = Math.round((endExclusive - start) / 86400000);
    const left = Math.max(0, offset * dayW);
    const right = Math.min(totalWidth, (offset + days) * dayW);
    const width = right - left;
    if (right <= 0 || left >= totalWidth || width <= 0) return '';
    const label = b.reason ? escapeHtml(b.reason) : 'Bloqueado';
    return `<div class="tl-block-blocked" style="left:${left}px;width:${width}px;"
                 title="🔒 Bloqueado: ${blkFmt(b.start_date)} → ${blkFmt(b.end_date)}${b.reason ? ' · ' + escapeHtml(b.reason) : ''}"
                 onclick="event.stopPropagation();confirmDeleteBlock('${b.id}')">
      <span class="tl-block-blocked-label">🔒 ${label}</span>
    </div>`;
  }).join('');
}

// ── Modal de criação de bloqueio (programático, self-contained) ──
function openBlockModal(prefillAccId = '', prefillStart = '') {
  const opts = (typeof accommodations !== 'undefined' ? accommodations : [])
    .map(a => `<option value="${a.id}"${a.id === prefillAccId ? ' selected' : ''}>${escapeHtml(a.name)}</option>`)
    .join('');

  const overlay = document.createElement('div');
  overlay.className = 'modal-bg open';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:9999;';
  overlay.innerHTML = `
    <div class="modal" style="background:#fff;border-radius:14px;padding:26px 28px;max-width:460px;width:94%;box-shadow:0 8px 32px rgba(0,0,0,.18);">
      <h3 style="margin:0 0 6px;font-size:18px;color:var(--azul);display:flex;align-items:center;gap:8px;"><i data-lucide="lock"></i> Bloquear datas</h3>
      <p style="margin:0 0 18px;font-size:13px;color:var(--cinza);">Nenhuma reserva poderá ser criada nestas datas para o alojamento escolhido.</p>
      <label class="form-label">Alojamento</label>
      <select class="form-control" id="blk-acc">${opts}</select>
      <div style="display:flex;gap:12px;margin-top:14px;">
        <div style="flex:1;">
          <label class="form-label">De</label>
          <input type="date" class="form-control" id="blk-start" value="${prefillStart}" autocomplete="off">
        </div>
        <div style="flex:1;">
          <label class="form-label">Até (inclusive)</label>
          <input type="date" class="form-control" id="blk-end" value="${prefillStart}" autocomplete="off">
        </div>
      </div>
      <label class="form-label" style="margin-top:14px;">Motivo (opcional)</label>
      <input type="text" class="form-control" id="blk-reason" placeholder="Ex.: manutenção, uso pessoal" autocomplete="off" maxlength="120">
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:22px;">
        <button class="btn btn-ghost btn-sm" id="blk-cancel">Cancelar</button>
        <button class="btn btn-primary btn-sm" id="blk-save">Bloquear</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  if (window.lucide) lucide.createIcons();

  const close = () => overlay.remove();
  overlay.querySelector('#blk-cancel').onclick = close;
  overlay.onclick = e => { if (e.target === overlay) close(); };
  overlay.querySelector('#blk-save').onclick = async () => {
    const accId = overlay.querySelector('#blk-acc').value;
    const start = overlay.querySelector('#blk-start').value;
    const end = overlay.querySelector('#blk-end').value;
    const reason = overlay.querySelector('#blk-reason').value.trim();
    if (!accId || !start || !end) { toast('Escolhe alojamento e datas.', 'error'); return; }
    if (end < start) { toast('A data de fim não pode ser anterior à de início.', 'error'); return; }
    try {
      const res = await apiPost(`/api/accommodations/${accId}/blocks`, { start_date: start, end_date: end, reason });
      if (res.success) {
        toast('🔒 Datas bloqueadas.', 'success');
        close();
        await loadBlocks();
        if (typeof renderCalView === 'function') renderCalView();
        const editingId = document.getElementById('aloj-editing-id')?.value;
        if (editingId) renderAccommodationBlocks(editingId);
      } else {
        toast('❌ ' + (res.error || 'Erro ao bloquear.'), 'error');
      }
    } catch (e) {
      toast('❌ ' + (e?.payload?.error || 'Erro de ligação.'), 'error');
    }
  };
}

async function confirmDeleteBlock(blockId) {
  const b = accommodationBlocks.find(x => x.id === blockId);
  if (!b) return;
  if (!confirm(`Remover o bloqueio de ${blkFmt(b.start_date)} a ${blkFmt(b.end_date)}?`)) return;
  try {
    const res = await apiDelete(`/api/accommodations/blocks/${blockId}`);
    if (res.success) {
      toast('🔓 Bloqueio removido.', 'info');
      await loadBlocks();
      if (typeof renderCalView === 'function') renderCalView();
      const editingId = document.getElementById('aloj-editing-id')?.value;
      if (editingId) renderAccommodationBlocks(editingId);
    } else {
      toast('❌ ' + (res.error || 'Erro ao remover.'), 'error');
    }
  } catch (e) {
    toast('❌ Erro de ligação.', 'error');
  }
}

// ── Ficha do alojamento: lista + adicionar + remover ──
function renderAccommodationBlocks(accId) {
  const wrap = document.getElementById('aloj-blocks-list');
  if (!wrap) return;
  const list = blocksForAccommodation(accId);
  const rows = list.length
    ? list.map(b => `
        <div class="aloj-block-row">
          <div>
            <div class="aloj-block-dates">${blkFmt(b.start_date)} → ${blkFmt(b.end_date)}</div>
            ${b.reason ? `<div class="aloj-block-reason">${escapeHtml(b.reason)}</div>` : ''}
          </div>
          <button class="btn btn-ghost btn-sm" onclick="confirmDeleteBlock('${b.id}')" title="Remover">
            <i data-lucide="trash-2"></i>
          </button>
        </div>`).join('')
    : `<div class="aloj-block-empty">Sem datas bloqueadas.</div>`;
  wrap.innerHTML = rows;
  if (window.lucide) lucide.createIcons();
}
