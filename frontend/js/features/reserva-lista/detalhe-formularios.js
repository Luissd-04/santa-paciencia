// Estado privado; interface partilhada em AppModules.reservas.
(() => {
AppModules.define('reservas', {
  deletePaymentEntry: { get: () => deletePaymentEntry },
  invoiceMethodLabel: { get: () => invoiceMethodLabel },
  openAddGuestForm: { get: () => openAddGuestForm },
  openInvoiceFormFromBtn: { get: () => openInvoiceFormFromBtn },
  openPaymentForm: { get: () => openPaymentForm },
});

function openPaymentForm(reservationId, currentPaid, total) {
  const remaining = Math.max(0, total - currentPaid).toFixed(2);
  const html = `
    <div id="rdv2-pay-form" style="position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1200;display:flex;align-items:center;justify-content:center;" data-on-click="detalhe-formularios-if-ba44ff2">
      <div style="background:var(--surface-card);border-radius:16px;padding:24px;width:min(360px,92vw);box-shadow:0 8px 40px rgba(0,0,0,.22);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;">
          <span style="font-size:15px;font-weight:700;color:var(--text-main);">Registar Pagamento</span>
          <button data-on-click="detalhe-formularios-get-element-by-id-15c078a" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:18px;">×</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px;">
          <div>
            <label style="font-size:11.5px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:4px;">Valor (€)</label>
            <input id="pf-amount" type="number" min="0" step="0.01" value="${remaining}" style="width:100%;padding:8px 10px;border:1px solid var(--border-soft);border-radius:8px;font-size:14px;background:var(--surface-muted);color:var(--text-main);" autocomplete="off">
          </div>
          <div>
            <label style="font-size:11.5px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:4px;">Método</label>
            <select id="pf-method" style="width:100%;padding:8px 10px;border:1px solid var(--border-soft);border-radius:8px;font-size:14px;background:var(--surface-muted);color:var(--text-main);">
              <option value="transferencia">Transferência</option>
              <option value="mbway">MBWay</option>
              <option value="numerario">Numerário</option>
              <option value="cartao">Cartão</option>
            </select>
          </div>
          <div>
            <label style="font-size:11.5px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:4px;">Data</label>
            <input id="pf-date" type="date" value="${new Date().toISOString().slice(0,10)}" style="width:100%;padding:8px 10px;border:1px solid var(--border-soft);border-radius:8px;font-size:14px;background:var(--surface-muted);color:var(--text-main);" autocomplete="off">
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:20px;justify-content:flex-end;">
          <button data-on-click="detalhe-formularios-get-element-by-id-15c078a" style="padding:8px 16px;border:1px solid var(--border-soft);border-radius:8px;background:none;color:var(--text-muted);cursor:pointer;font-size:13px;">Cancelar</button>
          <button id="pf-save-btn" ${AppActions.attrs("click", "detalhe-formularios-save-payment-form-7b64f33", [String((reservationId) ?? '')])} style="padding:8px 18px;border:none;border-radius:8px;background:var(--brand-shell);color:#fff;cursor:pointer;font-size:13px;font-weight:600;">Guardar</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
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
    const res = await AppModules.core.apiPost(`/api/reservations/${reservationId}/payments`, {
      amount, method, payment_date: date || null,
    });
    if (res.success) {
      document.getElementById('rdv2-pay-form')?.remove();
      AppModules.core.toast('✅ Pagamento registado', 'success');
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

function openAddGuestForm(reservationId) {
  const html = `
    <div id="rdv2-addguest-form" style="position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1200;display:flex;align-items:center;justify-content:center;" data-on-click="detalhe-formularios-if-ba44ff2">
      <div style="background:var(--surface-card);border-radius:16px;padding:24px;width:min(360px,92vw);box-shadow:0 8px 40px rgba(0,0,0,.22);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;">
          <span style="font-size:15px;font-weight:700;color:var(--text-main);">Adicionar Hóspede</span>
          <button data-on-click="detalhe-formularios-get-element-by-id-58a19ae" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:18px;">×</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px;">
          <div>
            <label style="font-size:11.5px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:4px;">Nome *</label>
            <input id="ag-name" type="text" style="width:100%;padding:8px 10px;border:1px solid var(--border-soft);border-radius:8px;font-size:14px;background:var(--surface-muted);color:var(--text-main);" autocomplete="off">
          </div>
          <div>
            <label style="font-size:11.5px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:4px;">Email (opcional)</label>
            <input id="ag-email" type="email" style="width:100%;padding:8px 10px;border:1px solid var(--border-soft);border-radius:8px;font-size:14px;background:var(--surface-muted);color:var(--text-main);" autocomplete="off">
          </div>
          <div>
            <label style="font-size:11.5px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:4px;">Telefone (opcional)</label>
            <input id="ag-phone" type="text" style="width:100%;padding:8px 10px;border:1px solid var(--border-soft);border-radius:8px;font-size:14px;background:var(--surface-muted);color:var(--text-main);" autocomplete="off">
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:20px;justify-content:flex-end;">
          <button data-on-click="detalhe-formularios-get-element-by-id-58a19ae" style="padding:8px 16px;border:1px solid var(--border-soft);border-radius:8px;background:none;color:var(--text-muted);cursor:pointer;font-size:13px;">Cancelar</button>
          <button id="ag-save-btn" ${AppActions.attrs("click", "detalhe-formularios-save-add-guest-form-daaa6ec", [String((reservationId) ?? '')])} style="padding:8px 18px;border:none;border-radius:8px;background:var(--brand-shell);color:#fff;cursor:pointer;font-size:13px;font-weight:600;">Guardar</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
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
      document.getElementById('rdv2-addguest-form')?.remove();
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
  const inp = 'width:100%;padding:8px 10px;border:1px solid var(--border-soft);border-radius:8px;font-size:14px;background:var(--surface-muted);color:var(--text-main);';
  const lbl = 'font-size:11.5px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:4px;';
  const methods = [['whatsapp', 'WhatsApp'], ['email', 'Email'], ['winmax', 'Winmax'], ['outro', 'Outro']];
  const opts = methods.map(([v, l]) => `<option value="${v}"${inv.m === v ? ' selected' : ''}>${l}</option>`).join('');
  const html = `
    <div id="rdv2-inv-form" style="position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1200;display:flex;align-items:center;justify-content:center;" data-on-click="detalhe-formularios-if-ba44ff2">
      <div style="background:var(--surface-card);border-radius:16px;padding:24px;width:min(380px,92vw);box-shadow:0 8px 40px rgba(0,0,0,.22);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;">
          <span style="font-size:15px;font-weight:700;color:var(--text-main);">Registar Fatura</span>
          <button data-on-click="detalhe-formularios-get-element-by-id-588783e" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:18px;">×</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px;">
          <div>
            <label style="${lbl}">Nº Fatura</label>
            <input id="if-number" type="text" value="${AppModules.core.escapeHtml(inv.n || '')}" placeholder="Ex.: FT 2026/123" style="${inp}" autocomplete="off">
          </div>
          <div style="display:flex;gap:10px;">
            <div style="flex:1;">
              <label style="${lbl}">Data Fatura</label>
              <input id="if-date" type="date" value="${inv.d || ''}" style="${inp}" autocomplete="off">
            </div>
            <div style="flex:1;">
              <label style="${lbl}">Data Envio</label>
              <input id="if-sent-date" type="date" value="${inv.sd || ''}" style="${inp}" autocomplete="off">
            </div>
          </div>
          <div>
            <label style="${lbl}">Método de Envio</label>
            <select id="if-method" style="${inp}">${opts}</select>
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:20px;justify-content:flex-end;">
          <button data-on-click="detalhe-formularios-get-element-by-id-588783e" style="padding:8px 16px;border:1px solid var(--border-soft);border-radius:8px;background:none;color:var(--text-muted);cursor:pointer;font-size:13px;">Cancelar</button>
          <button id="if-save-btn" ${AppActions.attrs("click", "detalhe-formularios-save-invoice-form-a8900b2", [String((reservationId) ?? '')])} style="padding:8px 18px;border:none;border-radius:8px;background:var(--brand-shell);color:#fff;cursor:pointer;font-size:13px;font-weight:600;">Guardar</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
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
      document.getElementById('rdv2-inv-form')?.remove();
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
  "detalhe-formularios-if-ba44ff2": (el, event, args) => { if(event.target===el)el.remove() },
  "detalhe-formularios-get-element-by-id-588783e": (el, event, args) => { document.getElementById('rdv2-inv-form').remove() },
  "detalhe-formularios-save-invoice-form-a8900b2": (el, event, args) => { saveInvoiceForm(args[0]) },
  "detalhe-formularios-get-element-by-id-58a19ae": (el, event, args) => { document.getElementById('rdv2-addguest-form').remove() },
  "detalhe-formularios-save-add-guest-form-daaa6ec": (el, event, args) => { saveAddGuestForm(args[0]) },
  "detalhe-formularios-get-element-by-id-15c078a": (el, event, args) => { document.getElementById('rdv2-pay-form').remove() },
  "detalhe-formularios-save-payment-form-7b64f33": (el, event, args) => { savePaymentForm(args[0]) },
}, "click");

})();
