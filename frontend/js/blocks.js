// Estado privado; interface partilhada em AppModules.bloqueios.
(() => {
AppModules.define('bloqueios', {
  blockBandsHtml: { get: () => blockBandsHtml },
  ensureBlocksLoaded: { get: () => ensureBlocksLoaded },
  isDateBlockedAnywhere: { get: () => isDateBlockedAnywhere },
  isDateBlockedForAccommodation: { get: () => isDateBlockedForAccommodation },
  openBlockFromCalendar: { get: () => openBlockFromCalendar },
  openBlockModal: { get: () => openBlockModal },
  renderAccommodationBlocks: { get: () => renderAccommodationBlocks },
});

// ── Bloqueios de datas dos alojamentos (manutenção, uso pessoal, etc.) ──
// A API usa datas inclusivas (start_date..end_date, ambos bloqueados).
// O backend impede reservas nessas datas; aqui tratamos da visualização/gestão.

let accommodationBlocks = [];
let blocksLoaded = false;

async function loadBlocks() {
  try {
    const res = await AppModules.core.apiGet('/api/accommodations/blocks');
    accommodationBlocks = res.data || [];
  } catch (e) {
    accommodationBlocks = [];
  }
  blocksLoaded = true;
  return accommodationBlocks;
}

// Os bloqueios chegam com a primeira vista que os desenha (calendário ou ficha
// do alojamento) e ficam em memória até ao fim da sessão.
async function ensureBlocksLoaded() {
  if (blocksLoaded) return accommodationBlocks;
  return loadBlocks();
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

// Bloqueios diretos de um alojamento (para a ficha do alojamento).
function blocksForAccommodation(accId) {
  return accommodationBlocks
    .filter(b => b.accommodation_id === accId)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
}

// Scope de um alojamento: ele próprio + pai (se for suite) ou + filhas (se for
// 'alojamento'). Espelha getAccommodationScope do backend.
function accommodationScope(accId) {
  const list = typeof AppModules.core.accommodations !== 'undefined' ? AppModules.core.accommodations : [];
  const acc = list.find(a => a.id === accId);
  if (!acc) return [accId];
  const ids = new Set([accId]);
  if (acc.parent_id) ids.add(acc.parent_id);
  else if (acc.type === 'alojamento') list.filter(a => a.parent_id === accId).forEach(a => ids.add(a.id));
  return [...ids];
}

// Bloqueios que se aplicam (visualmente) a este alojamento: um bloqueio aplica-se
// a X se X estiver no scope da sua origem (mesma regra da disponibilidade).
function effectiveBlocksForAccommodation(accId) {
  return accommodationBlocks
    .filter(b => accommodationScope(b.accommodation_id).includes(accId))
    .map(b => ({ ...b, inherited: b.accommodation_id !== accId }))
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
}

// True se existe algum bloqueio efetivo a cobrir 'iso' (end_date inclusivo).
function isDateBlockedForAccommodation(accId, iso) {
  return effectiveBlocksForAccommodation(accId).some(b => b.start_date <= iso && b.end_date >= iso);
}

// True se existe algum bloqueio (qualquer unidade) a cobrir 'iso'.
function isDateBlockedAnywhere(iso) {
  return accommodationBlocks.some(b => b.start_date <= iso && b.end_date >= iso);
}

// ── Timeline: faixas cinza por bloqueio numa linha de alojamento (com cascata) ──
// Devolve HTML absoluto (mesma matemática dos blocos de reserva na timeline).
function blockBandsHtml(accId, yearStart, totalDays, dayW) {
  const totalWidth = totalDays * dayW;
  return effectiveBlocksForAccommodation(accId).map(b => {
    const start = new Date(b.start_date + 'T00:00:00');
    const endExclusive = new Date(blkAddDays(b.end_date, 1) + 'T00:00:00');
    const offset = Math.round((start - yearStart) / 86400000);
    const days = Math.round((endExclusive - start) / 86400000);
    const left = Math.max(0, offset * dayW);
    const right = Math.min(totalWidth, (offset + days) * dayW);
    const width = right - left;
    if (right <= 0 || left >= totalWidth || width <= 0) return '';
    const label = b.inherited
      ? AppModules.core.escapeHtml(b.accommodation_name || 'Alojamento inteiro')
      : (b.reason ? AppModules.core.escapeHtml(b.reason) : 'Bloqueado');
    const title = b.inherited
      ? `🔒 Bloqueado via ${AppModules.core.escapeHtml(b.accommodation_name || 'alojamento')}: ${blkFmt(b.start_date)} → ${blkFmt(b.end_date)}${b.reason ? ' · ' + AppModules.core.escapeHtml(b.reason) : ''}`
      : `🔒 Bloqueado: ${blkFmt(b.start_date)} → ${blkFmt(b.end_date)}${b.reason ? ' · ' + AppModules.core.escapeHtml(b.reason) : ''}`;
    return `<div class="tl-block-blocked${b.inherited ? ' tl-block-blocked--inherited' : ''}" style="left:${left}px;width:${width}px;"
                 title="${title}"
                 ${AppActions.attrs("click", "blocks-stop-propagation-85e9e28", [String((b.id) ?? '')])}>
      <span class="tl-block-blocked-label">🔒 ${label}</span>
    </div>`;
  }).join('');
}

// Abrir o bloqueio que cobre uma data (clique num dia bloqueado do calendário).
// Com filtro de suite ativa usa os bloqueios efetivos dessa suite; senão, qualquer um.
function openBlockFromCalendar(iso, accId = '') {
  const candidates = (accId ? effectiveBlocksForAccommodation(accId) : accommodationBlocks)
    .filter(b => b.start_date <= iso && b.end_date >= iso);
  if (candidates.length) openBlockEditModal(candidates[0].id);
}

// ── Modal de criação de bloqueio (programático, self-contained) ──
function openBlockModal(prefillAccId = '', prefillStart = '') {
  const opts = (typeof AppModules.core.accommodations !== 'undefined' ? AppModules.core.accommodations : [])
    .map(a => `<option value="${a.id}"${a.id === prefillAccId ? ' selected' : ''}>${AppModules.core.escapeHtml(a.name)}</option>`)
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
    if (!accId || !start || !end) { AppModules.core.toast('Escolhe alojamento e datas.', 'error'); return; }
    if (end < start) { AppModules.core.toast('A data de fim não pode ser anterior à de início.', 'error'); return; }
    try {
      const res = await AppModules.core.apiPost(`/api/accommodations/${accId}/blocks`, { start_date: start, end_date: end, reason });
      if (res.success) {
        AppModules.core.toast('🔒 Datas bloqueadas.', 'success');
        close();
        await loadBlocks();
        if (typeof AppModules.calendario.renderCalView === 'function') AppModules.calendario.renderCalView();
        const editingId = document.getElementById('aloj-editing-id')?.value;
        if (editingId) renderAccommodationBlocks(editingId);
      } else {
        AppModules.core.toast('❌ ' + (res.error || 'Erro ao bloquear.'), 'error');
      }
    } catch (e) {
      AppModules.core.toast('❌ ' + (e?.payload?.error || 'Erro de ligação.'), 'error');
    }
  };
}

// ── Modal de edição de bloqueio (datas/motivo) com botão Eliminar ──
function openBlockEditModal(blockId) {
  const b = accommodationBlocks.find(x => x.id === blockId);
  if (!b) return;
  const accName = b.accommodation_name
    || (typeof AppModules.core.accommodations !== 'undefined' ? AppModules.core.accommodations.find(a => a.id === b.accommodation_id)?.name : '')
    || 'Alojamento';

  const overlay = document.createElement('div');
  overlay.className = 'modal-bg open';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:9999;';
  overlay.innerHTML = `
    <div class="modal" style="background:#fff;border-radius:14px;padding:26px 28px;max-width:460px;width:94%;box-shadow:0 8px 32px rgba(0,0,0,.18);">
      <h3 style="margin:0 0 6px;font-size:18px;color:var(--azul);display:flex;align-items:center;gap:8px;"><i data-lucide="lock"></i> Editar bloqueio</h3>
      <p style="margin:0 0 16px;font-size:13px;color:var(--cinza);">${AppModules.core.escapeHtml(accName)}</p>
      <div style="display:flex;gap:12px;">
        <div style="flex:1;">
          <label class="form-label">De</label>
          <input type="date" class="form-control" id="blk-edit-start" value="${b.start_date}" autocomplete="off">
        </div>
        <div style="flex:1;">
          <label class="form-label">Até (inclusive)</label>
          <input type="date" class="form-control" id="blk-edit-end" value="${b.end_date}" autocomplete="off">
        </div>
      </div>
      <label class="form-label" style="margin-top:14px;">Motivo (opcional)</label>
      <input type="text" class="form-control" id="blk-edit-reason" value="${AppModules.core.escapeHtml(b.reason || '')}" placeholder="Ex.: manutenção, uso pessoal" autocomplete="off" maxlength="120">
      <div style="display:flex;gap:10px;justify-content:space-between;align-items:center;margin-top:22px;">
        <button class="btn btn-ghost btn-sm" id="blk-edit-delete" style="color:var(--vermelho);"><i data-lucide="trash-2"></i> Eliminar</button>
        <div style="display:flex;gap:10px;">
          <button class="btn btn-ghost btn-sm" id="blk-edit-cancel">Cancelar</button>
          <button class="btn btn-primary btn-sm" id="blk-edit-save">Guardar</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  if (window.lucide) lucide.createIcons();

  const close = () => overlay.remove();
  overlay.querySelector('#blk-edit-cancel').onclick = close;
  overlay.onclick = e => { if (e.target === overlay) close(); };
  overlay.querySelector('#blk-edit-delete').onclick = () => { close(); confirmDeleteBlock(blockId); };
  overlay.querySelector('#blk-edit-save').onclick = async () => {
    const start = overlay.querySelector('#blk-edit-start').value;
    const end = overlay.querySelector('#blk-edit-end').value;
    const reason = overlay.querySelector('#blk-edit-reason').value.trim();
    if (!start || !end) { AppModules.core.toast('Escolhe as datas.', 'error'); return; }
    if (end < start) { AppModules.core.toast('A data de fim não pode ser anterior à de início.', 'error'); return; }
    try {
      const res = await AppModules.core.apiPut(`/api/accommodations/blocks/${blockId}`, { start_date: start, end_date: end, reason });
      if (res.success) {
        AppModules.core.toast('🔒 Bloqueio atualizado.', 'success');
        close();
        await loadBlocks();
        if (typeof AppModules.calendario.renderCalView === 'function') AppModules.calendario.renderCalView();
        const editingId = document.getElementById('aloj-editing-id')?.value;
        if (editingId) renderAccommodationBlocks(editingId);
      } else {
        AppModules.core.toast('❌ ' + (res.error || 'Erro ao guardar.'), 'error');
      }
    } catch (e) {
      AppModules.core.toast('❌ ' + (e?.payload?.error || 'Erro de ligação.'), 'error');
    }
  };
}

async function confirmDeleteBlock(blockId) {
  const b = accommodationBlocks.find(x => x.id === blockId);
  if (!b) return;
  if (!confirm(`Remover o bloqueio de ${blkFmt(b.start_date)} a ${blkFmt(b.end_date)}?`)) return;
  try {
    const res = await AppModules.core.apiDelete(`/api/accommodations/blocks/${blockId}`);
    if (res.success) {
      AppModules.core.toast('🔓 Bloqueio removido.', 'info');
      await loadBlocks();
      if (typeof AppModules.calendario.renderCalView === 'function') AppModules.calendario.renderCalView();
      const editingId = document.getElementById('aloj-editing-id')?.value;
      if (editingId) renderAccommodationBlocks(editingId);
    } else {
      AppModules.core.toast('❌ ' + (res.error || 'Erro ao remover.'), 'error');
    }
  } catch (e) {
    AppModules.core.toast('❌ Erro de ligação.', 'error');
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
          <div style="cursor:pointer;" ${AppActions.attrs("click", "blocks-open-block-edit-modal-f1c3b14", [String((b.id) ?? '')])} title="Editar bloqueio">
            <div class="aloj-block-dates">${blkFmt(b.start_date)} → ${blkFmt(b.end_date)}</div>
            ${b.reason ? `<div class="aloj-block-reason">${AppModules.core.escapeHtml(b.reason)}</div>` : ''}
          </div>
          <button class="btn btn-ghost btn-sm" ${AppActions.attrs("click", "blocks-confirm-delete-block-5fabfb9", [String((b.id) ?? '')])} title="Remover">
            <i data-lucide="trash-2"></i>
          </button>
        </div>`).join('')
    : `<div class="aloj-block-empty">Sem datas bloqueadas.</div>`;
  wrap.innerHTML = rows;
  if (window.lucide) lucide.createIcons();
}

AppActions.register({
  "blocks-open-block-edit-modal-f1c3b14": (el, event, args) => { openBlockEditModal(args[0]) },
  "blocks-confirm-delete-block-5fabfb9": (el, event, args) => { confirmDeleteBlock(args[0]) },
  "blocks-stop-propagation-85e9e28": (el, event, args) => { event.stopPropagation();openBlockEditModal(args[0]) },
}, "click");

// Limpeza da funcionalidade ao sair ou trocar de organização.
AppModules.onReset('blocks.js', () => {
  accommodationBlocks = [];
  blocksLoaded = false;
});

})();
