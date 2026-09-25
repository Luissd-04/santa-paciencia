// Estado privado; interface partilhada em AppModules.reservas.
(() => {
AppModules.define('reservas', {
  closeModal: { get: () => closeModal },
  openEditModal: { get: () => openEditModal },
  openEditPage: { get: () => openEditPage },
  openModal: { get: () => openModal },
  openModalFromCalendar: { get: () => openModalFromCalendar },
});

function openModal(config = {}) {
  AppModules.core.editingId = null;
  AppModules.reservas._editingPriceInfo = null;
  AppModules.reservas._wizardPageMode = false;
  AppModules.reservas._returnToDetailId = null;
  AppModules.reservas._wizMultiSuite = false;
  AppModules.reservas._wizExtraRooms = [];
  AppModules.reservas._wizHadMultiSuiteOnLoad = false;
  AppModules.reservas._wizResetExtraRoomsPanel();
  document.getElementById('modal-bg')?.classList.remove('resf-page-mode');
  const titleEl = document.getElementById('modal-title');
  if (titleEl) titleEl.textContent = 'Nova Reserva';
  const saveBtn = document.getElementById('btn-guardar');
  if (saveBtn) saveBtn.innerHTML = '<i data-lucide="save" style="width:14px;height:14px;"></i> Guardar Reserva';
  AppModules.reservas.buildCountrySelects();
  AppModules.reservas._resetGuestFields();
  document.getElementById('f-checkin').value = AppModules.core.formatDateForStandardInput(config.checkIn || '');
  document.getElementById('f-checkout').value = AppModules.core.formatDateForStandardInput(config.checkOut || '');
  const adultosEl = document.getElementById('f-num-adultos'); if (adultosEl) adultosEl.value = 2;
  const criancasEl = document.getElementById('f-num-criancas'); if (criancasEl) criancasEl.value = 0;
  AppModules.reservas.updateNumHospedes();
  document.getElementById('f-breakfast').value = 'false';
  document.getElementById('f-canal').value = 'direto';
  document.getElementById('f-estado').value = 'confirmada';
  document.getElementById('f-payment-status').value = 'pendente';
  document.getElementById('pagamento-metodo-wrap').style.display = 'none';
  document.getElementById('f-pagamento').value = 'transferencia';
  const amtPaidEl = document.getElementById('f-amount-paid'); if (amtPaidEl) amtPaidEl.value = '';
  const payDateEl = document.getElementById('f-payment-date'); if (payDateEl) payDateEl.value = '';
  const remWrap = document.getElementById('payment-remaining-wrap'); if (remWrap) remWrap.style.display = 'none';
  document.getElementById('f-noites').value = '';
  document.getElementById('f-total').value = '';
  AppModules.reservas.resetFormDiscount();
  AppModules.reservas.resetNightlyState();
  const alojSelect = document.getElementById('f-aloj');
  if (alojSelect) alojSelect.value = config.accommodationId || '';
  const rgpdWrap = document.getElementById('wiz-rgpd-wrap');
  if (rgpdWrap) rgpdWrap.style.display = '';
  const voucherWrap = document.getElementById('resf-voucher-wrap');
  if (voucherWrap) voucherWrap.style.display = '';
  const searchEl = document.getElementById('wiz-guest-search');
  if (searchEl) searchEl.value = '';
  AppModules.reservas.renderExtraGuests();

  // Restaurar rascunho (só Nova Reserva). Config explícita (ex.: clique no
  // calendário) tem prioridade sobre os valores guardados.
  const notice = document.getElementById('resf-draft-notice');
  if (notice) notice.style.display = 'none';
  if (!AppModules.reservas._suppressDraftSave) {
    const draft = AppModules.reservas.loadReservaDraft();
    if (draft) {
      AppModules.reservas.applyReservaDraft(draft);
      if (config.checkIn)  document.getElementById('f-checkin').value  = AppModules.core.formatDateForStandardInput(config.checkIn);
      if (config.checkOut) document.getElementById('f-checkout').value = AppModules.core.formatDateForStandardInput(config.checkOut);
      if (config.accommodationId) { const a = document.getElementById('f-aloj'); if (a) a.value = config.accommodationId; }
    }
  }

  const hasDates = !!(document.getElementById('f-checkin').value && document.getElementById('f-checkout').value);
  if (hasDates) {
    AppModules.reservas._availTimer && clearTimeout(AppModules.reservas._availTimer);
    AppModules.reservas._availTimer = setTimeout(AppModules.reservas.fetchSuiteAvailability, 0);
  } else {
    AppModules.reservas._unavailableSuites = new Set();
  }
  AppModules.reservas.renderSuiteCards();
  AppModules.reservas.calcTotal();
  AppModules.reservas.updateWizSummary();
  AppUI.refreshDropdowns(document.getElementById('modal-bg'));
  AppUI.openModal('modal-bg');
}

function openModalFromCalendar(checkIn, accommodationId = '') {
  if (!checkIn) return;
  openModal({
    checkIn,
    checkOut: AppModules.reservas.addDaysToIsoDate(checkIn, 1),
    accommodationId,
    step: 1
  });
}

// Abre o formulário de edição como página completa (a partir do detalhe da reserva).
async function openEditPage(id) {
  AppModules.reservas._wizardPageMode = true;
  AppModules.reservas._returnToDetailId = id;
  await openEditModal(id);
  if (!AppModules.reservas.reservaModalIsOpen()) { AppModules.reservas._wizardPageMode = false; AppModules.reservas._returnToDetailId = null; }
}

async function openEditModal(id) {
  try {
    const data = await AppModules.core.apiGet(`/api/reservations/${id}`);
    const r = data.data;
    let guestFull = {};
    try { const gd = await AppModules.core.apiGet(`/api/guests/${r.guest_id}`); guestFull = gd.data || {}; } catch {}

    AppModules.core.editingId = id;
    AppModules.reservas._editingPriceInfo = { price_edited_at: r.price_edited_at, price_edited_by_name: r.price_edited_by_name };
    AppModules.reservas._wizExtraRooms = [];
    AppModules.reservas._wizResetExtraRoomsPanel();
    document.getElementById('modal-title').textContent = 'Editar Reserva — ' + id;
    document.getElementById('btn-guardar').textContent = 'Atualizar Reserva';
    AppModules.reservas.buildCountrySelects();
    AppModules.reservas._resetGuestFields();

    // Preço por noite guardado → overrides (para editar noite a noite).
    AppModules.reservas.resetNightlyState();
    const storedNightly = typeof r.nightly_prices === 'string'
      ? (() => { try { return JSON.parse(r.nightly_prices || '[]'); } catch { return []; } })()
      : (r.nightly_prices || []);
    (storedNightly || []).forEach(n => {
      if (n && n.date != null && n.price != null) AppModules.reservas._nightlyOverrides[n.date] = Math.max(0, Number(n.price));
    });

    const nameParts = (r.guest_name || '').trim().split(' ');
    const nomeFull = [guestFull.first_name || nameParts[0], guestFull.last_name || nameParts.slice(1).join(' ')].filter(Boolean).join(' ');
    document.getElementById('f-nome-completo').value = nomeFull || r.guest_name || '';
    document.getElementById('f-email').value          = AppModules.core.realEmail(r.guest_email) || '';
    // Split stored phone into prefix + number
    const rawPhone = r.guest_phone || guestFull.phone || '';
    const matchedCountry = AppModules.reservas.DIAL_COUNTRIES.find(c => rawPhone.startsWith(c.dial));
    if (matchedCountry) {
      document.getElementById('f-tel-prefix').value = matchedCountry.dial;
      document.getElementById('f-tel-num').value = rawPhone.slice(matchedCountry.dial.length).trim();
    } else {
      document.getElementById('f-tel-num').value = rawPhone;
    }
    const countryName = guestFull.country || guestFull.nationality || '';
    document.getElementById('f-pais').value           = countryName;
    document.getElementById('f-doc-tipo').value          = guestFull.document_type || '';
    document.getElementById('f-doc-num').value           = guestFull.document_number || '';
    document.getElementById('f-doc-emissor').value       = guestFull.document_issuer_country || '';
    document.getElementById('f-nascimento').value        = AppModules.reservas.formatDateForBirthInput(guestFull.birth_date || '');
    document.getElementById('f-local-nascimento').value  = guestFull.birth_city || '';
    AppModules.reservas.updateForeignRequirements();
    document.getElementById('f-nif').value            = guestFull.nif || '';
    document.getElementById('f-empresa').value        = guestFull.company || '';
    document.getElementById('f-morada').value         = guestFull.address || '';
    document.getElementById('f-cp').value             = guestFull.postal_code || '';
    document.getElementById('f-cidade').value         = guestFull.city || '';

    document.getElementById('f-checkin').value       = AppModules.core.formatDateForStandardInput(r.check_in || '');
    document.getElementById('f-checkout').value      = AppModules.core.formatDateForStandardInput(r.check_out || '');
    const adEl = document.getElementById('f-num-adultos');
    const crEl = document.getElementById('f-num-criancas');
    if (adEl) adEl.value = r.num_adults ?? r.num_guests ?? 2;
    if (crEl) crEl.value = r.num_children ?? 0;
    AppModules.reservas.updateNumHospedes();
    document.getElementById('f-breakfast').value     = r.breakfast_included ? 'true' : 'false';
    document.getElementById('f-canal').value         = r.channel || 'direto';
    document.getElementById('f-estado').value        = r.status || 'confirmada';
    const ps = r.payment_status === 'pago' ? 'confirmado' : (r.payment_status || 'pendente');
    document.getElementById('f-payment-status').value = ps;
    document.getElementById('pagamento-metodo-wrap').style.display = (ps === 'confirmado' || ps === 'parcial') ? '' : 'none';
    document.getElementById('f-pagamento').value     = r.payment_method || 'transferencia';
    const amtPaidEl2 = document.getElementById('f-amount-paid');
    if (amtPaidEl2) amtPaidEl2.value = r.amount_paid > 0 ? Number(r.amount_paid).toFixed(2) : '';
    const payDateEl2 = document.getElementById('f-payment-date');
    if (payDateEl2) payDateEl2.value = AppModules.core.formatDateForStandardInput(r.payment_date || '');
    const remWrap2 = document.getElementById('payment-remaining-wrap');
    const remVal2  = document.getElementById('payment-remaining-val');
    if (ps === 'parcial' && r.amount_paid > 0 && r.total_amount > r.amount_paid) {
      if (remWrap2) remWrap2.style.display = '';
      if (remVal2) remVal2.textContent = '€' + (r.total_amount - r.amount_paid).toFixed(2);
    } else {
      if (remWrap2) remWrap2.style.display = 'none';
    }
    document.getElementById('f-notas').value         = r.notes || '';
    document.getElementById('f-noites').value        = r.nights || '';
    document.getElementById('f-total').value         = Number(r.total_amount || 0).toFixed(2);
    const resfBadge = document.getElementById('resf-total-badge');
    if (resfBadge) resfBadge.textContent = `€${Number(r.total_amount || 0).toFixed(2)}`;

    const rgpd = document.getElementById('f-rgpd-check');
    if (rgpd) { rgpd.checked = true; rgpd.closest('.rgpd-box')?.classList.add('rgpd-accepted'); }

    const alojSelect = document.getElementById('f-aloj');
    if (alojSelect) alojSelect.value = r.accommodation_id;

    AppModules.reservas.renderExtraGuests();
    const guestsData = typeof r.guests_data === 'string' ? JSON.parse(r.guests_data || '[]') : (r.guests_data || []);
    guestsData.forEach((g, idx) => {
      const rows = document.querySelectorAll('.extra-guest-row');
      if (!rows[idx]) return;
      const row = rows[idx];
      const setVal = (field, val) => { const el = row.querySelector(`[data-field="${field}"]`); if (el) el.value = val || ''; };
      setVal('nome_completo', [g.first_name, g.last_name].filter(Boolean).join(' ') || g.name || '');
      setVal('email',      g.email);
      const rawP = g.phone || '';
      const mc = AppModules.reservas.DIAL_COUNTRIES.find(c => rawP.startsWith(c.dial));
      setVal('tel_prefix', mc ? mc.dial : '+351');
      setVal('tel_num', mc ? rawP.slice(mc.dial.length).trim() : rawP);
      setVal('country',        g.country || g.nationality);
      setVal('birth_date',     AppModules.reservas.formatDateForBirthInput(g.birth_date));
      setVal('birth_city',     g.birth_city);
      setVal('doc_type',       g.document_type);
      setVal('doc_number',     g.document_number);
      setVal('doc_emissor',    g.document_issuer_country);
      setVal('nif',            g.nif);
    });
    // Idades das crianças derivadas das datas de nascimento agora preenchidas
    AppModules.reservas.renderWizChildAges();

    const rgpdWrap = document.getElementById('wiz-rgpd-wrap');
    if (rgpdWrap) rgpdWrap.style.display = 'none';
    const voucherWrap = document.getElementById('resf-voucher-wrap');
    if (voucherWrap) voucherWrap.style.display = 'none';
    const searchEl = document.getElementById('wiz-guest-search');
    if (searchEl) searchEl.value = '';
    const titleEl = document.getElementById('modal-title');
    if (titleEl) titleEl.textContent = 'Editar Reserva — ' + id;
    const saveBtn = document.getElementById('btn-guardar');
    if (saveBtn) saveBtn.innerHTML = '<i data-lucide="save" style="width:14px;height:14px;"></i> Atualizar Reserva';
    await AppModules.reservas.calcTotal();
    // Preservar o total efetivamente cobrado: se diferir do recalculado a partir das
    // noites + extras (ex.: desconto ou ajuste manual antigo), distribuí-lo pelas
    // noites para a ficha abrir já uniforme. Multi-suite mantém o total fixo — as
    // noites da grelha só refletem a suite principal e distribuir inflava-as.
    const storedTotal = Number(r.total_amount);
    const recomputed = parseFloat(document.getElementById('f-total')?.value);
    const accsData = typeof r.accommodations_data === 'string'
      ? (() => { try { return JSON.parse(r.accommodations_data || '[]'); } catch { return []; } })()
      : (r.accommodations_data || []);
    AppModules.reservas._wizMultiSuite = Array.isArray(accsData) && accsData.length > 1;
    AppModules.reservas._wizHadMultiSuiteOnLoad = AppModules.reservas._wizMultiSuite;
    // Suites adicionais (além da principal) — preenchem o painel "Adicionar outro
    // quarto" para poderem ser vistas/editadas também a partir do wizard.
    AppModules.reservas._wizExtraRooms = (Array.isArray(accsData) ? accsData : [])
      .filter(item => item.accommodation_id !== r.accommodation_id)
      .map(item => ({
        accommodation_id: item.accommodation_id,
        name: item.name || '',
        price_per_night: Number(item.price_per_night || 0),
        subtotal: Number(item.subtotal || 0),
      }));
    if (!isNaN(storedTotal) && !isNaN(recomputed) && Math.abs(storedTotal - recomputed) > 0.01) {
      if (AppModules.reservas._wizMultiSuite) {
        AppModules.reservas._manualTotalOverride = storedTotal;
      } else {
        AppModules.reservas._manualDistribWeights = null;
        AppModules.reservas.distributeManualTotal(storedTotal);
      }
    }
    await AppModules.reservas.calcTotal();
    if (AppModules.reservas._wizExtraRooms.length > 0) {
      const extraPanel = document.getElementById('wiz-extra-rooms-panel');
      const extraLabel = document.getElementById('wiz-extra-rooms-toggle-label');
      if (extraPanel) extraPanel.style.display = '';
      if (extraLabel) extraLabel.textContent = 'Esconder quartos extra';
      AppModules.reservas.renderWizExtraRooms();
    }
    AppModules.reservas.renderSuiteCards();
    AppModules.reservas.updateWizSummary();
    AppUI.refreshDropdowns(document.getElementById('modal-bg'));
    document.getElementById('modal-bg').classList.toggle('resf-page-mode', AppModules.reservas._wizardPageMode);
    AppUI.openModal('modal-bg');
  } catch (e) {
    AppModules.core.toast('❌ Erro ao carregar reserva.', 'error');
  }
}

function closeModal() {
  const bg = document.getElementById('modal-bg');
  const modal = bg.querySelector('.modal');
  AppModules.reservas._wizardPageMode = false;
  AppModules.reservas._returnToDetailId = null;
  modal.classList.add('modal-closing');
  setTimeout(() => {
    AppUI.closeModal(bg);
    modal.classList.remove('modal-closing');
    bg.classList.remove('resf-page-mode');
    AppModules.core.editingId = null;
  }, 320);
}

// ── FECHO SEGURO + RASCUNHO (só para Nova Reserva) ──

})();
