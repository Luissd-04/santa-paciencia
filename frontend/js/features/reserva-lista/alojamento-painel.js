// Estado privado; interface partilhada em AppModules.reservas.
(() => {
AppModules.define('reservas', {
  startInlinePriceEdit: { get: () => startInlinePriceEdit },
});

function startInlinePriceEdit(id, currentTotal) {
  const placeholder = document.getElementById('rdv2-acc-subtot');
  const totalRowEl = document.querySelector('.rdv2-total-row .rdv2-amt');
  if (!placeholder) return;

  const input = document.createElement('input');
  input.type = 'number';
  input.step = '0.01';
  input.min = '0';
  input.value = Number(currentTotal).toFixed(2);
  input.style.cssText = 'width:90px;padding:3px 6px;border:1px solid var(--brand-shell);border-radius:6px;font-size:13px;font-weight:600;text-align:right;background:var(--surface-card);color:var(--text-main);';

  const restore = (val) => {
    const span = document.createElement('span');
    span.id = 'rdv2-acc-subtot';
    span.className = 'rdv2-amt';
    span.textContent = `${ReservationMoney.format(val)}`;
    input.replaceWith(span);
    return span;
  };

  let saving = false;
  const save = async () => {
    if (saving) return;
    saving = true;
    const newVal = parseFloat(input.value);
    if (isNaN(newVal) || newVal < 0) { saving = false; input.focus(); return; }
    const span = restore(newVal);
    // Confirmar alteração de valores contra o padrão do calendário dinâmico
    if (Math.abs(newVal - Number(currentTotal)) > 0.005
        && typeof AppModules.core.confirmPriceChange === 'function'
        && AppModules.reservas._rdv2Current?.standard_total != null) {
      const ok = await AppModules.core.confirmPriceChange({
        standardTotal: AppModules.reservas._rdv2Current.standard_total,
        newTotal: newVal,
        editedAt: AppModules.reservas._rdv2Current.price_edited_at,
        editedByName: AppModules.reservas._rdv2Current.price_edited_by_name,
      });
      if (!ok) {
        span.textContent = `${ReservationMoney.format(currentTotal)}`;
        saving = false;
        return;
      }
    }
    try {
      const res = await AppModules.core.apiPut(`/api/reservations/${id}`, { total_amount: newVal });
      if (res.success) {
        if (totalRowEl) totalRowEl.textContent = `${ReservationMoney.format(newVal)}`;
        AppModules.core.toast('✅ Preço atualizado', 'success');
        await AppModules.reservas.loadReservas();
      } else {
        span.textContent = `${ReservationMoney.format(currentTotal)}`;
        AppModules.core.toast('❌ ' + (res.error || 'Erro ao atualizar'), 'error');
      }
    } catch (e) {
      span.textContent = `${ReservationMoney.format(currentTotal)}`;
      AppModules.core.toast('❌ Erro de ligação', 'error');
    }
  };

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); save(); }
    if (e.key === 'Escape') { restore(currentTotal); }
  });
  input.addEventListener('blur', save);

  placeholder.replaceWith(input);
  input.select();
}



})();
