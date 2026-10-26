// Estado privado; interface partilhada em AppModules.reservas.
(() => {
AppModules.define('reservas', {
  deletePaymentEntry: { get: () => deletePaymentEntry },
  invoiceMethodLabel: { get: () => invoiceMethodLabel },
  openAddGuestForm: { get: () => openAddGuestForm },
  openInvoiceFormFromBtn: { get: () => openInvoiceFormFromBtn },
  openPaymentForm: { get: () => openPaymentForm },
});

const pendingPaymentKey = id => `sp-payment:${AppModules.core.currentUser?.organization_id}:${AppModules.core.currentUser?.id}:${id}`;
function readPendingPayment(id) {
  try { return JSON.parse(sessionStorage.getItem(pendingPaymentKey(id)) || 'null'); } catch { return null; }
}
function openPaymentForm(reservationId, currentPaid, total) {
  const remaining = Math.max(0, total - currentPaid).toFixed(2);
  AppUI.openDialog({
    id: 'rdv2-pay-form',
    title: 'Registar pagamento',
    body: `
      <div class="form-group">
        <label class="form-label" for="pf-amount">Valor (€)</label>
        <input id="pf-amount" class="form-control" type="number" inputmode="decimal" min="0" step="0.01" value="${remaining}" autocomplete="off">
      </div>
      <div class="form-group">
        <label class="form-label" for="pf-method">Método</label>
        <select id="pf-method" class="form-control">
          <option value="transferencia">Transferência</option>
          <option value="mbway">MBWay</option>
          <option value="numerario">Numerário</option>
          <option value="cartao">Cartão</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label" for="pf-date">Data</label>
        <input id="pf-date" class="form-control" type="date" value="${window.ReservationDates.localIso()}" autocomplete="off">
      </div>`,
    footer: `
      <button type="button" class="btn btn-ghost" data-dialog-close>Cancelar</button>
      <button type="button" class="btn btn-primary" id="pf-save-btn" ${AppActions.attrs("click", "detalhe-formularios-save-payment-form-7b64f33", [String((reservationId) ?? '')])}>Guardar</button>`,
  });
  const pending = readPendingPayment(reservationId);
  if (pending) {
    document.getElementById('pf-amount').value = pending.payload.amount;
    document.getElementById('pf-method').value = pending.payload.method;
    document.getElementById('pf-date').value = pending.payload.payment_date || '';
    AppModules.core.toast('Existe um pagamento por confirmar. Repita Guardar para verificar o resultado sem duplicar.', 'info');
  }
  document.getElementById('pf-amount')?.focus();
}

async function savePaymentForm(reservationId) {
  const amount = parseFloat(document.getElementById('pf-amount')?.value);
  const method = document.getElementById('pf-method')?.value;
  const date = document.getElementById('pf-date')?.value;
  if (isNaN(amount) || amount <= 0) { AppModules.core.toast('⚠️ Valor inválido', 'error'); return; }
  const btn = document.getElementById('pf-save-btn');
  if (btn) btn.disabled = true;
  try {
    const payload = { amount, method, payment_date: date || null };
    let pending = readPendingPayment(reservationId);
    if (pending && JSON.stringify(pending.payload) !== JSON.stringify(payload)) {
      AppModules.core.toast('Confirme primeiro o pagamento anterior com os mesmos dados. O resultado pode já estar guardado.', 'error');
      if (btn) btn.disabled = false;
      return;
    }
    if (!pending) pending = { key: crypto.randomUUID(), payload };
    sessionStorage.setItem(pendingPaymentKey(reservationId), JSON.stringify(pending));
    const res = await AppModules.core.apiPost(`/api/reservations/${reservationId}/payments`, { ...payload, idempotency_key: pending.key });
    if (res.success) {
      sessionStorage.removeItem(pendingPaymentKey(reservationId));
      AppUI.closeDialog('rdv2-pay-form');
      AppModules.core.toast('✅ Pagamento registado', 'success');
      await AppModules.reservas.loadReservas();
      AppModules.reservas.showDetail(reservationId);
    } else {
      AppModules.core.toast('❌ ' + (res.error || 'Erro'), 'error');
      if (btn) btn.disabled = false;
    }
  } catch (e) {
    if ([400, 401, 403, 404].includes(e.status)) sessionStorage.removeItem(pendingPaymentKey(reservationId));
    AppModules.core.toast('❌ ' + (e.status ? e.message : 'Não foi possível confirmar o pagamento. Repita Guardar com os mesmos dados.'), 'error');
    if (btn) btn.disabled = false;
  }
}

function openAddGuestForm(reservationId) {
  AppUI.openDialog({
    id: 'rdv2-addguest-form',
    title: 'Adicionar hóspede',
    body: `
      <div class="form-group">
        <label class="form-label" for="ag-name">Nome *</label>
        <input id="ag-name" class="form-control" type="text" autocomplete="off">
      </div>
      <div class="form-group">
        <label class="form-label" for="ag-email">Email (opcional)</label>
        <input id="ag-email" class="form-control" type="email" autocomplete="off">
      </div>
      <div class="form-group">
        <label class="form-label" for="ag-phone">Telefone (opcional)</label>
        <input id="ag-phone" class="form-control" type="tel" autocomplete="off">
      </div>`,
    footer: `
      <button type="button" class="btn btn-ghost" data-dialog-close>Cancelar</button>
      <button type="button" class="btn btn-primary" id="ag-save-btn" ${AppActions.attrs("click", "detalhe-formularios-save-add-guest-form-daaa6ec", [String((reservationId) ?? '')])}>Guardar</button>`,
  });
  document.getElementById('ag-name')?.focus();
}

async function saveAddGuestForm(reservationId) {
  const name = document.getElementById('ag-name')?.value.trim();
  const email = document.getElementById('ag-email')?.value.trim();
  const phone = document.getElementById('ag-phone')?.value.trim();
  if (!name) { AppModules.core.toast('⚠️ Indique o nome do hóspede', 'error'); return; }
  const btn = document.getElementById('ag-save-btn');
  if (btn) btn.disabled = true;
  try {
    const current = await AppModules.core.apiGet(`/api/reservations/${reservationId}`);
    if (!current.success) { AppModules.core.toast('❌ Erro ao carregar reserva', 'error'); if (btn) btn.disabled = false; return; }
    const r = current.data;
    const guestsData = typeof r.guests_data === 'string' ? JSON.parse(r.guests_data || '[]') : (r.guests_data || []);
    guestsData.push({ name, email: email || undefined, phone: phone || undefined });
    const res = await AppModules.core.apiPut(`/api/reservations/${reservationId}`, {
      guests_data: guestsData,
      num_guests: (r.num_guests || 1) + 1,
      num_adults: (r.num_adults || 1) + 1,
    });
    if (res.success) {
      AppUI.closeDialog('rdv2-addguest-form');
      AppModules.core.toast('✅ Hóspede adicionado', 'success');
      await AppModules.reservas.loadReservas();
      AppModules.reservas.showDetail(reservationId);
    } else {
      AppModules.core.toast('❌ ' + (res.error || 'Erro'), 'error');
      if (btn) btn.disabled = false;
    }
  } catch (e) {
    AppModules.core.toast('❌ Erro de ligação', 'error');
    if (btn) btn.disabled = false;
  }
}

function invoiceMethodLabel(m) {
  return { whatsapp: 'WhatsApp', email: 'Email', winmax: 'Winmax', outro: 'Outro' }[m] || m;
}

function openInvoiceFormFromBtn(reservationId, btn) {
  let inv = {};
  try { inv = JSON.parse(btn.getAttribute('data-inv') || '{}'); } catch {}
  openInvoiceForm(reservationId, inv);
}

function openInvoiceForm(reservationId, inv = {}) {
  const methods = [['whatsapp', 'WhatsApp'], ['email', 'Email'], ['winmax', 'Winmax'], ['outro', 'Outro']];
  const opts = methods.map(([v, l]) => `<option value="${v}"${inv.m === v ? ' selected' : ''}>${l}</option>`).join('');
  AppUI.openDialog({
    id: 'rdv2-inv-form',
    title: 'Registar fatura',
    body: `
      <div class="form-group">
        <label class="form-label" for="if-number">Nº fatura</label>
        <input id="if-number" class="form-control" type="text" value="${AppModules.core.escapeHtml(inv.n || '')}" placeholder="Ex.: FT 2026/123" autocomplete="off">
      </div>
      <div class="form-grid">
        <div class="form-group">
          <label class="form-label" for="if-date">Data fatura</label>
          <input id="if-date" class="form-control" type="date" value="${inv.d || ''}" autocomplete="off">
        </div>
        <div class="form-group">
          <label class="form-label" for="if-sent-date">Data envio</label>
          <input id="if-sent-date" class="form-control" type="date" value="${inv.sd || ''}" autocomplete="off">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label" for="if-method">Método de envio</label>
        <select id="if-method" class="form-control">${opts}</select>
      </div>`,
    footer: `
      <button type="button" class="btn btn-ghost" data-dialog-close>Cancelar</button>
      <button type="button" class="btn btn-primary" id="if-save-btn" ${AppActions.attrs("click", "detalhe-formularios-save-invoice-form-a8900b2", [String((reservationId) ?? '')])}>Guardar</button>`,
  });
  document.getElementById('if-number')?.focus();
}

async function saveInvoiceForm(reservationId) {
  const invoice_number      = document.getElementById('if-number')?.value.trim() || null;
  const invoice_date        = document.getElementById('if-date')?.value || null;
  const invoice_sent_date   = document.getElementById('if-sent-date')?.value || null;
  const invoice_sent_method = document.getElementById('if-method')?.value || null;
  const btn = document.getElementById('if-save-btn');
  if (btn) btn.disabled = true;
  try {
    const res = await AppModules.core.apiPut(`/api/reservations/${reservationId}/invoice`, {
      invoice_number, invoice_date, invoice_sent_date, invoice_sent_method,
    });
    if (res.success) {
      AppUI.closeDialog('rdv2-inv-form');
      AppModules.core.toast('✅ Fatura registada', 'success');
      await AppModules.reservas.loadReservas();
      AppModules.reservas.showDetail(reservationId);
    } else {
      AppModules.core.toast('❌ ' + (res.error || 'Erro'), 'error');
      if (btn) btn.disabled = false;
    }
  } catch (e) {
    AppModules.core.toast('❌ Erro de ligação', 'error');
    if (btn) btn.disabled = false;
  }
}

async function deletePaymentEntry(reservationId, paymentId) {
  if (!confirm('Remover este pagamento?')) return;
  try {
    const res = await AppModules.core.apiDelete(`/api/reservations/${reservationId}/payments/${paymentId}`);
    if (res.success) {
      AppModules.core.toast('✅ Pagamento removido', 'success');
      await AppModules.reservas.loadReservas();
      AppModules.reservas.showDetail(reservationId);
    } else {
      AppModules.core.toast('❌ ' + (res.error || 'Erro'), 'error');
    }
  } catch {
    AppModules.core.toast('❌ Erro de ligação', 'error');
  }
}


AppActions.register({
  "detalhe-formularios-save-invoice-form-a8900b2": (el, event, args) => { saveInvoiceForm(args[0]) },
  "detalhe-formularios-save-add-guest-form-daaa6ec": (el, event, args) => { saveAddGuestForm(args[0]) },
  "detalhe-formularios-save-payment-form-7b64f33": (el, event, args) => { savePaymentForm(args[0]) },
}, "click");

})();
