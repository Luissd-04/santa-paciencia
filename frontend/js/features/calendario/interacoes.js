// Estado privado; interface partilhada em AppModules.calendario.
(() => {
AppModules.define('calendario', {
  attachTimelinePan: { get: () => attachTimelinePan },
  tlPointerDown: { get: () => tlPointerDown },
});

function attachTimelinePan() {
  const wrap = document.getElementById('timeline-wrap');
  if (!wrap || wrap.dataset.panReady === '1') return;
  wrap.dataset.panReady = '1';
  wrap.addEventListener('pointerdown', tlPanPointerDown);
  wrap.addEventListener('click', tlPanClickCapture, true);
}

function tlPanPointerDown(e) {
  if (e.button !== 0 || AppModules.calendario.tlPointerDrag) return;
  if (e.target.closest('.tl-block, .tl-block-blocked, .tl-resize-handle, button, a, input, select, textarea')) return;
  e.preventDefault();

  const wrap = e.currentTarget;
  AppModules.calendario.tlPanDrag = {
    pointerId: e.pointerId,
    startX: e.clientX,
    startY: e.clientY,
    scrollLeft: wrap.scrollLeft,
    moved: false,
    suppressClick: false,
    wrap,
  };

  wrap.setPointerCapture?.(e.pointerId);
  wrap.classList.add('tl-panning');
  document.body.classList.add('tl-is-panning');
  window.getSelection?.()?.removeAllRanges?.();
  wrap.addEventListener('pointermove', tlPanPointerMove);
  wrap.addEventListener('pointerup', tlPanPointerUp);
  wrap.addEventListener('pointercancel', tlPanPointerCancel);
}

function tlPanPointerMove(e) {
  const d = AppModules.calendario.tlPanDrag;
  if (!d) return;
  const dx = e.clientX - d.startX;
  const dy = e.clientY - d.startY;
  if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
    d.moved = true;
    d.suppressClick = true;
  }
  if (!d.moved) return;
  e.preventDefault();
  window.getSelection?.()?.removeAllRanges?.();
  d.wrap.scrollLeft = d.scrollLeft - dx;
}

function tlPanPointerUp(e) {
  const d = AppModules.calendario.tlPanDrag;
  if (!d) return;
  const wasDrag = d.moved;
  cleanupTimelinePan(e);
  if (d.suppressClick) {
    d.wrap.dataset.suppressClick = '1';
    setTimeout(() => {
      if (d.wrap.dataset.suppressClick === '1') delete d.wrap.dataset.suppressClick;
    }, 0);
  } else if (!wasDrag) {
    // O preventDefault do pointerdown suprime o click nativo — se foi só um toque
    // (sem arrasto) numa célula vazia, disparamos a criação de reserva manualmente.
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const cell = el && el.closest && el.closest('.tl-cell');
    if (cell) cell.click();
  }
}

function tlPanPointerCancel(e) {
  cleanupTimelinePan(e);
}

function cleanupTimelinePan(e) {
  const d = AppModules.calendario.tlPanDrag;
  if (!d) return;
  d.wrap.releasePointerCapture?.(d.pointerId || e?.pointerId);
  d.wrap.classList.remove('tl-panning');
  document.body.classList.remove('tl-is-panning');
  d.wrap.removeEventListener('pointermove', tlPanPointerMove);
  d.wrap.removeEventListener('pointerup', tlPanPointerUp);
  d.wrap.removeEventListener('pointercancel', tlPanPointerCancel);
  AppModules.calendario.tlPanDrag = null;
}

function tlPanClickCapture(e) {
  if (e.currentTarget.dataset.suppressClick !== '1') return;
  e.preventDefault();
  e.stopPropagation();
  delete e.currentTarget.dataset.suppressClick;
}

// ── TIMELINE DRAG (pointer-based) ──
function tlPointerDown(e, resId, type) {
  if (e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();

  const r = AppModules.calendario.calendarReservas.find(x => x.id === resId);
  if (!r) return;
  const blockEl = type === 'move'
    ? e.currentTarget
    : e.currentTarget.closest('.tl-block');
  if (!blockEl) return;

  const tooltip = document.createElement('div');
  tooltip.className = 'tl-drag-tooltip';
  document.body.appendChild(tooltip);

  // Ghost: clone visual do bloco que segue o cursor (só para 'move')
  let ghost = null;
  if (type === 'move') {
    ghost = document.createElement('div');
    ghost.className = 'tl-drop-ghost';
    ghost.style.cssText = blockEl.style.cssText;
    ghost.style.pointerEvents = 'none';
  }

  AppModules.calendario.tlPointerDrag = {
    type, resId,
    startX:        e.clientX,
    origCheckIn:   r.check_in,
    origCheckOut:  r.check_out,
    origAccId:     r.accommodation_id,
    origLeft:      parseFloat(blockEl.style.left)  || 0,
    origWidth:     parseFloat(blockEl.style.width) || 100,
    blockEl, tooltip, ghost,
    dayW:          AppModules.calendario.getTimelineDayWidth(),
    moved:         false,
    newCheckIn:    null,
    newCheckOut:   null,
    targetAccId:   null,
    targetAccName: null
  };

  blockEl.classList.add('tl-dragging');
  document.addEventListener('pointermove',   tlOnPointerMove);
  document.addEventListener('pointerup',     tlOnPointerUp);
  document.addEventListener('pointercancel', tlCancelDrag);
}

function tlOnPointerMove(e) {
  const d = AppModules.calendario.tlPointerDrag;
  if (!d) return;

  const dx = e.clientX - d.startX;
  if (Math.abs(dx) > 4) d.moved = true;
  if (!d.moved) return;

  const dayDelta = Math.round(dx / d.dayW);
  const snapDx   = dayDelta * d.dayW;
  const origCi   = new Date(d.origCheckIn  + 'T12:00:00');
  const origCo   = new Date(d.origCheckOut + 'T12:00:00');

  let newCi, newCo;

  if (d.type === 'move') {
    newCi = tlAddDays(origCi, dayDelta);
    newCo = tlAddDays(origCo, dayDelta);
    const ghostLeft = Math.max(0, d.origLeft + snapDx);

    // Detectar row alvo (esconder bloco para não interferir com elementFromPoint)
    d.blockEl.style.pointerEvents = 'none';
    const below      = document.elementFromPoint(e.clientX, e.clientY);
    d.blockEl.style.pointerEvents = '';
    const targetRow  = below?.closest?.('.tl-row');
    const targetAccId = targetRow?.dataset?.accId;

    document.querySelectorAll('.tl-row.tl-drag-over').forEach(r => r.classList.remove('tl-drag-over'));
    d.targetAccId   = targetAccId && targetAccId !== d.origAccId ? targetAccId   : null;
    d.targetAccName = targetAccId && targetAccId !== d.origAccId ? targetRow.dataset.accName : null;
    if (d.targetAccId) targetRow.classList.add('tl-drag-over');

    // Mover ghost para a row alvo
    if (d.ghost) {
      const destRow   = d.targetAccId ? targetRow : d.blockEl.closest('.tl-row');
      const daysArea  = destRow?.querySelector('.tl-days-area');
      if (daysArea && d.ghost.parentNode !== daysArea) daysArea.appendChild(d.ghost);
      d.ghost.style.left  = ghostLeft + 'px';
      d.ghost.style.width = d.origWidth + 'px';
    }

  } else {
    // Resize: mover o próprio bloco
    const origNights = Math.round((origCo - origCi) / 86400000);
    let newLeft  = d.origLeft;
    let newWidth = d.origWidth;

    if (d.type === 'resize-left') {
      const clampedDelta = Math.min(dayDelta, origNights - 1);
      newLeft  = d.origLeft  + clampedDelta * d.dayW;
      newWidth = d.origWidth - clampedDelta * d.dayW;
      newCi    = tlAddDays(origCi, clampedDelta);
      newCo    = origCo;
    } else {
      const clampedDelta = Math.max(dayDelta, -(origNights - 1));
      newWidth = d.origWidth + clampedDelta * d.dayW;
      newCi    = origCi;
      newCo    = tlAddDays(origCo, clampedDelta);
    }

    d.blockEl.style.left  = Math.max(0, newLeft)  + 'px';
    d.blockEl.style.width = Math.max(d.dayW, newWidth) + 'px';
  }

  d.newCheckIn  = tlToDateStr(newCi);
  d.newCheckOut = tlToDateStr(newCo);

  // Detetar conflito para feedback visual imediato
  const checkAcc    = d.targetAccId || d.origAccId;
  const directConflict = AppModules.calendario.calendarReservas.some(r2 =>
    r2.id !== d.resId &&
    r2.accommodation_id === checkAcc &&
    r2.status !== 'cancelada' &&
    r2.check_in < d.newCheckOut &&
    r2.check_out > d.newCheckIn
  );
  const checkAccObj = AppModules.core.accommodations.find(a => a.id === checkAcc);
  const childConflict = checkAccObj?.type === 'alojamento' &&
    AppModules.core.accommodations.filter(a => a.parent_id === checkAcc).some(child =>
      AppModules.calendario.calendarReservas.some(r2 =>
        r2.id !== d.resId &&
        r2.accommodation_id === child.id &&
        r2.status !== 'cancelada' &&
        r2.check_in < d.newCheckOut &&
        r2.check_out > d.newCheckIn
      )
    );
  d.hasConflict = directConflict || childConflict;
  if (d.ghost) d.ghost.classList.toggle('tl-drop-ghost-conflict', d.hasConflict);

  const fmt = dt => `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}`;
  const label = d.targetAccId ? `${d.targetAccName} · ` : '';
  d.tooltip.textContent   = (d.hasConflict ? '⚠ ' : '') + label + `${fmt(newCi)} → ${fmt(newCo)}`;
  d.tooltip.style.left    = (e.clientX + 14) + 'px';
  d.tooltip.style.top     = (e.clientY - 38) + 'px';
  d.tooltip.style.display = 'block';
}

function tlOnPointerUp() {
  if (!AppModules.calendario.tlPointerDrag) return;
  document.removeEventListener('pointermove',   tlOnPointerMove);
  document.removeEventListener('pointerup',     tlOnPointerUp);
  document.removeEventListener('pointercancel', tlCancelDrag);
  document.querySelectorAll('.tl-row.tl-drag-over').forEach(r => r.classList.remove('tl-drag-over'));

  const { resId, origCheckIn, origCheckOut, origAccId, newCheckIn, newCheckOut,
          targetAccId, targetAccName, blockEl, tooltip, ghost, moved } = AppModules.calendario.tlPointerDrag;
  AppModules.calendario.tlPointerDrag = null;
  blockEl.classList.remove('tl-dragging');
  tooltip.remove();
  ghost?.remove();

  if (!moved) { AppModules.reservas.showDetail(resId); return; }

  const datesChanged = newCheckIn && (newCheckIn !== origCheckIn || newCheckOut !== origCheckOut);
  const roomChanged  = !!targetAccId;
  if (!datesChanged && !roomChanged) { AppModules.calendario.renderTimeline(false); return; }

  const r      = AppModules.calendario.calendarReservas.find(x => x.id === resId);
  const fmtStr = s => s.split('-').reverse().slice(0, 2).join('/');
  const updates = {};
  if (datesChanged) { updates.check_in = newCheckIn; updates.check_out = newCheckOut; }
  if (roomChanged)  { updates.accommodation_id = targetAccId; }

  // Overbooking check — direto no mesmo alojamento
  const checkAcc  = targetAccId || origAccId;
  const ciCheck   = newCheckOut || origCheckOut;
  const coCheck   = newCheckIn  || origCheckIn;
  const conflicts = AppModules.calendario.calendarReservas.filter(r2 =>
    r2.id !== resId &&
    r2.accommodation_id === checkAcc &&
    r2.status !== 'cancelada' &&
    r2.check_in < ciCheck &&
    r2.check_out > coCheck
  );

  // Se o alojamento destino é um "alojamento completo" (pai), verificar quartos filhos
  const destAcc       = AppModules.core.accommodations.find(a => a.id === checkAcc);
  const childUnits    = destAcc?.type === 'alojamento'
    ? AppModules.core.accommodations.filter(a => a.parent_id === checkAcc)
    : [];
  const childConflicts = childUnits.flatMap(child =>
    AppModules.calendario.calendarReservas
      .filter(r2 =>
        r2.id !== resId &&
        r2.accommodation_id === child.id &&
        r2.status !== 'cancelada' &&
        r2.check_in < ciCheck &&
        r2.check_out > coCheck
      )
      .map(r2 => ({ ...r2, _childName: child.name }))
  );

  const fromAcc = AppModules.core.accommodations.find(a => a.id === origAccId);
  let msgBody = `<b>${AppModules.core.escapeHtml(r?.guest_name || 'reserva')}</b>`;
  msgBody += `<table style="margin-top:12px;width:100%;font-size:13px;border-collapse:collapse;">`;
  if (roomChanged) {
    msgBody += `<tr>
      <td style="color:var(--cinza);padding:3px 8px 3px 0;white-space:nowrap;">Quarto</td>
      <td><span style="text-decoration:line-through;opacity:.55">${fromAcc?.name || origAccId}</span>
          &nbsp;→&nbsp;<b style="color:var(--azul)">${targetAccName}</b></td>
    </tr>`;
  }
  if (datesChanged) {
    msgBody += `<tr>
      <td style="color:var(--cinza);padding:3px 8px 3px 0;white-space:nowrap;">Datas</td>
      <td><span style="text-decoration:line-through;opacity:.55">${fmtStr(origCheckIn)} → ${fmtStr(origCheckOut)}</span>
          &nbsp;→&nbsp;<b style="color:var(--azul)">${fmtStr(newCheckIn)} → ${fmtStr(newCheckOut)}</b></td>
    </tr>`;
  }
  msgBody += `</table>`;

  if (conflicts.length > 0) {
    const names = conflicts.map(c => `<b>${AppModules.core.escapeHtml(c.guest_name)}</b>`).join(', ');
    msgBody += `<div style="margin-top:12px;padding:10px 12px;background:#fff3f3;border:1.5px solid #fbb;border-radius:8px;font-size:12.5px;color:#b91c1c;">
      ⚠️ Overbooking — ${names} já tem${conflicts.length > 1 ? 'm' : ''} reserva nestas datas neste quarto.
    </div>`;
  }

  if (childConflicts.length > 0) {
    const occupiedRooms = [...new Set(childConflicts.map(c => `<b>${c._childName}</b>`))].join(', ');
    msgBody += `<div style="margin-top:12px;padding:10px 12px;background:#fff3f3;border:1.5px solid #fbb;border-radius:8px;font-size:12.5px;color:#b91c1c;">
      ⚠️ Alojamento completo não disponível — ${occupiedRooms} já ${childConflicts.length > 1 ? 'têm' : 'tem'} reserva nestas datas.
    </div>`;
  }

  const hasBlocker = conflicts.length > 0 || childConflicts.length > 0;
  tlShowConfirm(
    msgBody,
    async () => {
      try {
        const res = await AppModules.core.apiPut(`/api/reservations/${resId}`, updates);
        if (res.success) {
          AppModules.core.toast('✅ Reserva atualizada!', 'success');
          await AppModules.reservas.loadReservas();
          AppModules.calendario.renderTimeline(false);
        } else { AppModules.core.toast('❌ ' + (res.error || 'Erro.'), 'error'); AppModules.calendario.renderTimeline(false); }
      } catch { AppModules.core.toast('❌ Erro de ligação.', 'error'); AppModules.calendario.renderTimeline(false); }
    },
    () => AppModules.calendario.renderTimeline(false),
    hasBlocker
  );
}

function tlCancelDrag() {
  document.removeEventListener('pointermove',   tlOnPointerMove);
  document.removeEventListener('pointerup',     tlOnPointerUp);
  document.removeEventListener('pointercancel', tlCancelDrag);
  document.querySelectorAll('.tl-row.tl-drag-over').forEach(r => r.classList.remove('tl-drag-over'));
  if (AppModules.calendario.tlPointerDrag) {
    AppModules.calendario.tlPointerDrag.blockEl.classList.remove('tl-dragging');
    AppModules.calendario.tlPointerDrag.tooltip.remove();
    AppModules.calendario.tlPointerDrag.ghost?.remove();
    AppModules.calendario.tlPointerDrag = null;
  }
  AppModules.calendario.renderTimeline(false);
}

// Recarrega o calendário quando as reservas mudam noutro sítio (loadReservas
// emite este evento). Guardado à vista ativa para não re-renderizar a timeline
// escondida e provocar saltos de scroll. Não substitui as chamadas diretas a
// renderCalView() espalhadas por blocks.js / reserva-wizard.js (mexem em
// bloqueios ou filtros sem passar por loadReservas).
if (window.PubSub) {
  PubSub.on('reservas:updated', () => {
    if (document.getElementById('view-calendario')?.classList.contains('active')
        && typeof AppModules.calendario.renderCalView === 'function') {
      AppModules.calendario.renderCalView();
    }
  });
}

function tlAddDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function tlToDateStr(d)  {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function tlShowConfirm(msgHtml, onConfirm, onCancel, isOverbooking = false) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:9999;';
  const actions = isOverbooking
    ? `<button class="btn btn-ghost btn-sm" id="_tl-cancel">Cancelar</button>`
    : `<button class="btn btn-ghost btn-sm" id="_tl-cancel">Cancelar</button>
       <button class="btn btn-primary btn-sm" id="_tl-confirm">Confirmar alteração</button>`;
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:14px;padding:28px 32px;max-width:420px;width:92%;box-shadow:0 8px 32px rgba(0,0,0,.18);">
      <div style="font-size:14.5px;color:var(--azul);line-height:1.6;margin-bottom:22px;">${msgHtml}</div>
      <div style="display:flex;gap:10px;justify-content:flex-end;">${actions}</div>
    </div>`;
  document.body.appendChild(overlay);
  const dismiss = cb => { overlay.remove(); cb?.(); };
  overlay.querySelector('#_tl-cancel').onclick  = () => dismiss(onCancel);
  overlay.querySelector('#_tl-confirm')?.addEventListener('click', () => { overlay.remove(); onConfirm(); });
  overlay.onclick = e => { if (e.target === overlay) dismiss(onCancel); };
}

})();
