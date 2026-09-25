// Estado privado; interface partilhada em AppModules.hospedes.
(() => {
AppModules.define('hospedes', {
  closeGuestModal: { get: () => closeGuestModal },
  deleteGuest: { get: () => deleteGuest },
  openGuestEdit: { get: () => openGuestEdit },
  saveGuestEdit: { get: () => saveGuestEdit },
  showHospedeDetail: { get: () => showHospedeDetail },
});

// ── DETAIL MODAL ──
// A ficha do hóspede é agora uma página completa (view-hospede-detalhe) —
// mantida como alias para os pontos de entrada existentes (cards, lista).
function showHospedeDetail(id) {
  return openGuestEdit(id);
}

function renderGuestReservationsHistory(g) {
  const wrap = document.getElementById('gedit-reservas-historico');
  if (!wrap) return;
  const reservations = g.reservations || [];
  if (!reservations.length) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = `
    <div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--cinza);margin-bottom:10px;">
      Histórico de reservas (${reservations.length})
    </div>
    ${reservations.map(r => `
      <div ${AppActions.attrs("click", "detalhe-show-detail-3d67b14", [String((r.id) ?? '')])} style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:10px 12px;background:var(--cinza-claro);border-radius:8px;margin-bottom:6px;cursor:pointer;transition:background .15s;" data-on-mouseover="detalhe-var-511bff6" data-on-mouseout="detalhe-var-72edc58">
        <div>
          <span style="font-size:12px;color:var(--azul-claro);font-family:monospace;">${AppModules.core.escapeHtml(r.id)}</span>
          <span style="font-size:13px;color:var(--texto);margin-left:8px;">${AppModules.core.escapeHtml(r.accommodation_name)}</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:12px;color:var(--cinza);">${AppModules.core.formatDate(r.check_in)} → ${AppModules.core.formatDate(r.check_out)}</span>
          <b>€${Number(r.total_amount||0).toFixed(2)}</b>
          ${AppModules.core.badgeEstado(r.status)}
        </div>
      </div>`).join('')}`;
}

// ── EDIT MODAL ──
function populateGuestEditSelects() {
  // Country dropdown
  const countrySel = document.getElementById('gedit-country');
  if (countrySel) {
    countrySel.innerHTML = '<option value="">— Sem país —</option>' +
      AppModules.hospedes.COUNTRIES.map(c => `<option value="${c.name}" data-flag="${c.code}">${c.name}</option>`).join('');
  }
  // Phone prefix dropdown — built from DIAL_COUNTRIES defined in reserva-wizard.js
  const prefixSel = document.getElementById('gedit-tel-prefix');
  if (prefixSel && typeof AppModules.reservas.DIAL_COUNTRIES !== 'undefined') {
    prefixSel.innerHTML = AppModules.reservas.DIAL_COUNTRIES.map(c =>
      `<option value="${c.dial}" data-flag="${c.code.toLowerCase()}">${c.dial}</option>`
    ).join('');
  }
  if (window.AppUI) {
    AppUI.enhanceSelect(countrySel, { placeholder: 'País' });
    AppUI.enhanceSelect(prefixSel, { placeholder: '+351' });
    AppUI.enhanceSelect(document.getElementById('gedit-doc-type'), { placeholder: 'Tipo de documento' });
  }
}

async function openGuestEdit(id) {
  try {
    const data = await AppModules.core.apiGet(`/api/guests/${id}`);
    const g = data.data;
    AppModules.hospedes.editingGuestId = id;

    populateGuestEditSelects();

    const parts = (g.name || '').trim().split(' ');
    document.getElementById('gedit-first-name').value  = g.first_name || parts[0] || '';
    document.getElementById('gedit-last-name').value   = g.last_name  || parts.slice(1).join(' ') || '';
    document.getElementById('gedit-email').value        = AppModules.core.realEmail(g.email) || '';
    document.getElementById('gedit-email-personal').value = g.email_personal || '';
    document.getElementById('gedit-birth-date').value  = AppModules.core.formatDateForStandardInput(g.birth_date || '');
    document.getElementById('gedit-nif').value          = g.nif || '';
    document.getElementById('gedit-address').value      = g.address || '';
    document.getElementById('gedit-postal-code').value  = g.postal_code || '';
    document.getElementById('gedit-city').value         = g.city || '';
    const companyEl = document.getElementById('gedit-company');
    if (companyEl) companyEl.value = g.company || '';
    document.getElementById('gedit-favorito').checked   = !!g.is_favorite;
    document.getElementById('gedit-vip').checked        = !!g.is_vip;
    document.getElementById('gedit-nao-desejado').checked = !!g.is_unwanted;

    // Document fields
    const docType = document.getElementById('gedit-doc-type');
    if (docType) docType.value = g.document_type || '';
    const docNum = document.getElementById('gedit-doc-number');
    if (docNum) docNum.value = g.document_number || '';

    // Country
    const countrySel = document.getElementById('gedit-country');
    if (countrySel) countrySel.value = g.country || g.nationality || '';

    // Phone: split into prefix + number
    const rawPhone = g.phone || '';
    const prefixSel = document.getElementById('gedit-tel-prefix');
    const numInput  = document.getElementById('gedit-phone');
    if (prefixSel && typeof AppModules.reservas.DIAL_COUNTRIES !== 'undefined') {
      const mc = AppModules.reservas.DIAL_COUNTRIES.find(c => rawPhone.startsWith(c.dial));
      prefixSel.value = mc ? mc.dial : '+351';
      numInput.value  = mc ? rawPhone.slice(mc.dial.length).trim() : rawPhone;
    } else if (numInput) {
      numInput.value = rawPhone;
    }

    const pageTitle = document.getElementById('gedit-page-title');
    if (pageTitle) pageTitle.textContent = g.name || 'Ficha de hóspede';
    renderGuestReservationsHistory(g);
    const delBtn = document.getElementById('gedit-delete-btn');
    if (delBtn) delBtn.onclick = async () => {
      await deleteGuest(g.id, g.name);
      if (!AppModules.hospedes.hospedes.find(h => h.id === g.id)) AppModules.core.showView('hospedes');
    };

    // Página completa em vez de modal
    AppModules.core.showView('hospede-detalhe');
    if (window.lucide) lucide.createIcons();
    AppUI.refreshDropdowns(document.getElementById('view-hospede-detalhe'));
  } catch (e) {
    AppModules.core.toast('❌ Erro ao carregar hóspede.', 'error');
  }
}

function closeGuestModal() {
  AppModules.hospedes.editingGuestId = null;
  AppModules.core.showView('hospedes');
}

// ── DELETE ──
async function deleteGuest(id, name) {
  if (!confirm(`Tem a certeza que quer remover o hóspede "${name}"?\n\nEsta ação não pode ser desfeita.`)) return;
  try {
    await AppModules.core.apiDelete(`/api/guests/${id}`);
    AppModules.core.toast('🗑 Hóspede removido.', 'info');
    await AppModules.hospedes.loadHospedes();
  } catch (e) {
    const msg = e?.payload?.error || e?.message || 'Erro de ligação ao servidor.';
    AppModules.core.toast('❌ ' + msg, 'error');
  }
}

async function saveGuestEdit() {
  const firstName = document.getElementById('gedit-first-name').value.trim();
  const lastName  = document.getElementById('gedit-last-name').value.trim();
  const telPrefix = document.getElementById('gedit-tel-prefix')?.value || '';
  const telNum    = document.getElementById('gedit-phone').value.trim();
  // Sem número, não gravar o prefixo sozinho (ex.: "+351")
  const phone     = telNum ? telPrefix + telNum.replace(/\s/g, '') : null;
  const email     = document.getElementById('gedit-email').value.trim();
  const country   = document.getElementById('gedit-country').value;

  const btn = document.getElementById('btn-guardar-hospede');
  AppUI.setButtonLoading(btn, true, 'A guardar...');

  try {
    const body = {
      // vazio → null → backend mantém o valor existente
      first_name: firstName || null,
      last_name: lastName || null,
      email: email || null, // vazio → backend mantém o email existente

      email_personal: document.getElementById('gedit-email-personal').value.trim() || null,
      phone,
      birth_date:      AppModules.core.normalizeIsoDateValue(document.getElementById('gedit-birth-date').value) || null,
      nif:             document.getElementById('gedit-nif').value.trim()  || null,
      document_type:   document.getElementById('gedit-doc-type')?.value   || null,
      document_number: document.getElementById('gedit-doc-number')?.value.trim() || null,
      nationality: country || null,
      country: country || null,
      address:         document.getElementById('gedit-address').value.trim()     || null,
      postal_code:     document.getElementById('gedit-postal-code').value.trim() || null,
      city:            document.getElementById('gedit-city').value.trim()        || null,
      company:         document.getElementById('gedit-company')?.value.trim() || null,
      is_favorite:     document.getElementById('gedit-favorito').checked,
      is_vip:          document.getElementById('gedit-vip').checked,
      is_unwanted:     document.getElementById('gedit-nao-desejado').checked,
    };

    const res = await AppModules.core.apiPut(`/api/guests/${AppModules.hospedes.editingGuestId}`, body);
    if (res.success) {
      AppModules.core.toast('✅ Hóspede guardado!', 'success');
      closeGuestModal();
      await AppModules.hospedes.loadHospedes();
    } else {
      AppModules.core.toast('❌ ' + (res.error || 'Erro ao guardar.'), 'error');
    }
  } catch (e) {
    AppModules.core.toast('❌ Erro de ligação ao servidor.', 'error');
  } finally {
    AppUI.setButtonLoading(btn, false);
  }
}

AppActions.register({
  "detalhe-show-detail-3d67b14": (el, event, args) => { AppModules.reservas.showDetail(args[0]) },
}, "click");

AppActions.register({
  "detalhe-var-511bff6": (el, event, args) => { el.style.background='var(--creme)' },
}, "mouseover");

AppActions.register({
  "detalhe-var-72edc58": (el, event, args) => { el.style.background='var(--cinza-claro)' },
}, "mouseout");

})();
