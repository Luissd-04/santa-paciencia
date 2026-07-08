const DIAL_COUNTRIES = [
  { code:'PT', name:'Portugal',         dial:'+351', flag:'🇵🇹' },
  { code:'ES', name:'Espanha',          dial:'+34',  flag:'🇪🇸' },
  { code:'FR', name:'França',           dial:'+33',  flag:'🇫🇷' },
  { code:'GB', name:'Reino Unido',      dial:'+44',  flag:'🇬🇧' },
  { code:'DE', name:'Alemanha',         dial:'+49',  flag:'🇩🇪' },
  { code:'IT', name:'Itália',           dial:'+39',  flag:'🇮🇹' },
  { code:'NL', name:'Países Baixos',    dial:'+31',  flag:'🇳🇱' },
  { code:'BE', name:'Bélgica',          dial:'+32',  flag:'🇧🇪' },
  { code:'CH', name:'Suíça',            dial:'+41',  flag:'🇨🇭' },
  { code:'AT', name:'Áustria',          dial:'+43',  flag:'🇦🇹' },
  { code:'SE', name:'Suécia',           dial:'+46',  flag:'🇸🇪' },
  { code:'NO', name:'Noruega',          dial:'+47',  flag:'🇳🇴' },
  { code:'DK', name:'Dinamarca',        dial:'+45',  flag:'🇩🇰' },
  { code:'FI', name:'Finlândia',        dial:'+358', flag:'🇫🇮' },
  { code:'IE', name:'Irlanda',          dial:'+353', flag:'🇮🇪' },
  { code:'PL', name:'Polónia',          dial:'+48',  flag:'🇵🇱' },
  { code:'CZ', name:'República Checa',  dial:'+420', flag:'🇨🇿' },
  { code:'HU', name:'Hungria',          dial:'+36',  flag:'🇭🇺' },
  { code:'RO', name:'Roménia',          dial:'+40',  flag:'🇷🇴' },
  { code:'GR', name:'Grécia',           dial:'+30',  flag:'🇬🇷' },
  { code:'US', name:'Estados Unidos',   dial:'+1',   flag:'🇺🇸' },
  { code:'CA', name:'Canadá',           dial:'+1',   flag:'🇨🇦' },
  { code:'MX', name:'México',           dial:'+52',  flag:'🇲🇽' },
  { code:'BR', name:'Brasil',           dial:'+55',  flag:'🇧🇷' },
  { code:'AR', name:'Argentina',        dial:'+54',  flag:'🇦🇷' },
  { code:'CL', name:'Chile',            dial:'+56',  flag:'🇨🇱' },
  { code:'CO', name:'Colômbia',         dial:'+57',  flag:'🇨🇴' },
  { code:'AO', name:'Angola',           dial:'+244', flag:'🇦🇴' },
  { code:'MZ', name:'Moçambique',       dial:'+258', flag:'🇲🇿' },
  { code:'CV', name:'Cabo Verde',       dial:'+238', flag:'🇨🇻' },
  { code:'GW', name:'Guiné-Bissau',     dial:'+245', flag:'🇬🇼' },
  { code:'ST', name:'São Tomé e Príncipe', dial:'+239', flag:'🇸🇹' },
  { code:'ZA', name:'África do Sul',    dial:'+27',  flag:'🇿🇦' },
  { code:'MA', name:'Marrocos',         dial:'+212', flag:'🇲🇦' },
  { code:'CN', name:'China',            dial:'+86',  flag:'🇨🇳' },
  { code:'JP', name:'Japão',            dial:'+81',  flag:'🇯🇵' },
  { code:'KR', name:'Coreia do Sul',    dial:'+82',  flag:'🇰🇷' },
  { code:'IN', name:'Índia',            dial:'+91',  flag:'🇮🇳' },
  { code:'AU', name:'Austrália',        dial:'+61',  flag:'🇦🇺' },
  { code:'NZ', name:'Nova Zelândia',    dial:'+64',  flag:'🇳🇿' },
  { code:'RU', name:'Rússia',           dial:'+7',   flag:'🇷🇺' },
  { code:'TR', name:'Turquia',          dial:'+90',  flag:'🇹🇷' },
  { code:'IL', name:'Israel',           dial:'+972', flag:'🇮🇱' },
  { code:'AE', name:'Emirados Árabes',  dial:'+971', flag:'🇦🇪' },
  { code:'LU', name:'Luxemburgo',       dial:'+352', flag:'🇱🇺' },
  { code:'SK', name:'Eslováquia',       dial:'+421', flag:'🇸🇰' },
  { code:'HR', name:'Croácia',          dial:'+385', flag:'🇭🇷' },
  { code:'UA', name:'Ucrânia',          dial:'+380', flag:'🇺🇦' },
];

function buildCountrySelects() {
  const prefixOpts = DIAL_COUNTRIES.map(c =>
    `<option value="${c.dial}" data-code="${c.code}">${c.flag} ${c.dial}</option>`
  ).join('');
  const countryOpts = '<option value="">— País —</option>' +
    DIAL_COUNTRIES.map(c => `<option value="${c.name}">${c.flag} ${c.name}</option>`).join('');

  document.querySelectorAll('.phone-prefix').forEach(el => { el.innerHTML = prefixOpts; });
  document.querySelectorAll('select#f-pais, select#f-doc-emissor, select.guest-country').forEach(el => { el.innerHTML = countryOpts; });
  enhanceReservationSelects();
}

function enhanceReservationSelects(root = document) {
  if (!window.AppUI) return;
  root.querySelectorAll('.phone-prefix').forEach(el => AppUI.enhanceSelect(el, { placeholder: '+351' }));
  root.querySelectorAll('select#f-pais, select#f-doc-emissor, select.guest-country, select[data-field="doc_emissor"]').forEach(el => {
    AppUI.enhanceSelect(el, { placeholder: 'País' });
  });
  root.querySelectorAll('select#f-doc-tipo, select[data-field="doc_type"], select[data-field="id_type"]').forEach(el => {
    AppUI.enhanceSelect(el, { placeholder: 'Tipo de documento' });
  });
}



function updateForeignRequirements() {
  const pais = document.getElementById('f-pais')?.value;
  const isForeign = pais && pais !== 'Portugal';
  document.querySelectorAll('.req-foreign').forEach(el => {
    el.style.display = isForeign ? '' : 'none';
  });
}

function _resetGuestFields() {
  ['f-nome-completo','f-email','f-tel-num',
   'f-doc-num','f-local-nascimento','f-nascimento','f-nif','f-morada','f-cp','f-cidade','f-notas'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const docTipo = document.getElementById('f-doc-tipo'); if (docTipo) docTipo.value = '';
  const pais = document.getElementById('f-pais'); if (pais) pais.value = '';
  const docEmissor = document.getElementById('f-doc-emissor'); if (docEmissor) docEmissor.value = '';
  const prefix = document.getElementById('f-tel-prefix'); if (prefix) prefix.value = '+351';
  const rgpd = document.getElementById('f-rgpd-check'); if (rgpd) { rgpd.checked = false; rgpd.closest('.rgpd-box')?.classList.remove('rgpd-accepted'); }
  updateForeignRequirements();
}

function onPaymentStatusChange() {
  const ps = document.getElementById('f-payment-status').value;
  document.getElementById('pagamento-metodo-wrap').style.display =
    (ps === 'confirmado' || ps === 'parcial') ? '' : 'none';

  // Estado -> Valor pago (sentido inverso do onAmountPaidChange). Não chamar
  // onAmountPaidChange aqui para evitar recursão (ele chama-nos no fim).
  const paidEl  = document.getElementById('f-amount-paid');
  const remWrap = document.getElementById('payment-remaining-wrap');
  const remVal  = document.getElementById('payment-remaining-val');
  if (!paidEl) return;
  const total = parseFloat(document.getElementById('f-total').value) || 0;

  if (ps === 'confirmado') {
    if (total > 0) paidEl.value = total.toFixed(2);
    if (remWrap) remWrap.style.display = 'none';
  } else if (ps === 'pendente') {
    paidEl.value = '';
    if (remWrap) remWrap.style.display = 'none';
  } else if (ps === 'parcial') {
    // Montante parcial é escrito pelo utilizador; mostrar o que falta.
    const paid = parseFloat(paidEl.value) || 0;
    if (remWrap && total > 0 && paid > 0 && paid < total) {
      remWrap.style.display = '';
      if (remVal) remVal.textContent = '€' + (total - paid).toFixed(2);
    } else if (remWrap) {
      remWrap.style.display = 'none';
    }
  }
}

function onAmountPaidChange() {
  const paid = parseFloat(document.getElementById('f-amount-paid').value) || 0;
  const total = parseFloat(document.getElementById('f-total').value) || 0;
  const psEl = document.getElementById('f-payment-status');
  const remWrap = document.getElementById('payment-remaining-wrap');
  const remVal = document.getElementById('payment-remaining-val');

  if (paid > 0 && total > 0) {
    const statusEl = document.getElementById('f-estado');
    if (statusEl?.value === 'aguardar_pagamento') statusEl.value = 'confirmada';
    if (paid >= total) {
      psEl.value = 'confirmado';
      if (remWrap) remWrap.style.display = 'none';
    } else {
      psEl.value = 'parcial';
      const rem = total - paid;
      if (remWrap) remWrap.style.display = '';
      if (remVal) remVal.textContent = '€' + rem.toFixed(2);
    }
  } else {
    psEl.value = 'pendente';
    if (remWrap) remWrap.style.display = 'none';
  }
  onPaymentStatusChange();
}

// ── WIZARD STATE ──
let wizStep = 1;
let _cachedPricingPeriods = {};

// Preço por noite: overrides do utilizador (mapa data→preço) e total manual.
let _nightlyOverrides = {};
let _nightlyPrices = [];        // array atual [{date, price}] (calculado)
let _nightlyGridSig = '';       // assinatura das datas para saber quando reconstruir a grelha
let _manualTotalOverride = null;
let _standardNightlyByDate = {}; // preço padrão por noite (calendário dinâmico, sem overrides)
let _editingPriceInfo = null;    // { price_edited_at, price_edited_by_name } da reserva em edição

async function loadWizPricingPeriods(alojId) {
  if (!alojId) return [];
  if (_cachedPricingPeriods[alojId]) return _cachedPricingPeriods[alojId];
  try {
    const res = await apiGet(`/api/accommodations/${alojId}/pricing-periods`);
    _cachedPricingPeriods[alojId] = res.data || [];
    return _cachedPricingPeriods[alojId];
  } catch {
    return [];
  }
}

// Pré-carrega os períodos de preço de todos os alojamentos, para os cartões
// mostrarem o preço dinâmico correto. Re-renderiza os cartões quando termina.
async function preloadAllPricingPeriods() {
  const pending = accommodations
    .map(a => a.id)
    .filter(id => id && !_cachedPricingPeriods[id]);
  if (!pending.length) return;
  await Promise.all(pending.map(id => loadWizPricingPeriods(id)));
  renderSuiteCards();
}

function nightlyOverrideArray() {
  return Object.entries(_nightlyOverrides).map(([date, price]) => ({ date, price: Number(price) }));
}

function invalidateWizPricingCache(alojId) {
  if (alojId) delete _cachedPricingPeriods[alojId];
  else _cachedPricingPeriods = {};
}

function addDaysToIsoDate(dateStr, days = 1) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function updateNumHospedes() {
  const adults = parseInt(document.getElementById('f-num-adultos')?.value) || 1;
  const children = parseInt(document.getElementById('f-num-criancas')?.value) || 0;
  const hidden = document.getElementById('f-num-hospedes');
  if (hidden) hidden.value = adults + children;
  renderWizChildAges();
}

function openModal(config = {}) {
  editingId = null;
  _editingPriceInfo = null;
  const titleEl = document.getElementById('modal-title');
  if (titleEl) titleEl.textContent = 'Nova Reserva';
  const saveBtn = document.getElementById('btn-guardar');
  if (saveBtn) saveBtn.innerHTML = '<i data-lucide="save" style="width:14px;height:14px;"></i> Guardar Reserva';
  buildCountrySelects();
  _resetGuestFields();
  document.getElementById('f-checkin').value = formatDateForStandardInput(config.checkIn || '');
  document.getElementById('f-checkout').value = formatDateForStandardInput(config.checkOut || '');
  const adultosEl = document.getElementById('f-num-adultos'); if (adultosEl) adultosEl.value = 2;
  const criancasEl = document.getElementById('f-num-criancas'); if (criancasEl) criancasEl.value = 0;
  updateNumHospedes();
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
  resetFormDiscount();
  resetNightlyState();
  const alojSelect = document.getElementById('f-aloj');
  if (alojSelect) alojSelect.value = config.accommodationId || '';
  const rgpdWrap = document.getElementById('wiz-rgpd-wrap');
  if (rgpdWrap) rgpdWrap.style.display = '';
  const voucherWrap = document.getElementById('resf-voucher-wrap');
  if (voucherWrap) voucherWrap.style.display = '';
  const searchEl = document.getElementById('wiz-guest-search');
  if (searchEl) searchEl.value = '';
  renderExtraGuests();

  // Restaurar rascunho (só Nova Reserva). Config explícita (ex.: clique no
  // calendário) tem prioridade sobre os valores guardados.
  const notice = document.getElementById('resf-draft-notice');
  if (notice) notice.style.display = 'none';
  if (!_suppressDraftSave) {
    const draft = loadReservaDraft();
    if (draft) {
      applyReservaDraft(draft);
      if (config.checkIn)  document.getElementById('f-checkin').value  = formatDateForStandardInput(config.checkIn);
      if (config.checkOut) document.getElementById('f-checkout').value = formatDateForStandardInput(config.checkOut);
      if (config.accommodationId) { const a = document.getElementById('f-aloj'); if (a) a.value = config.accommodationId; }
    }
  }

  const hasDates = !!(document.getElementById('f-checkin').value && document.getElementById('f-checkout').value);
  if (hasDates) {
    _availTimer && clearTimeout(_availTimer);
    _availTimer = setTimeout(fetchSuiteAvailability, 0);
  } else {
    _unavailableSuites = new Set();
  }
  renderSuiteCards();
  calcTotal();
  updateWizSummary();
  AppUI.refreshDropdowns(document.getElementById('modal-bg'));
  AppUI.openModal('modal-bg');
}

function openModalFromCalendar(checkIn, accommodationId = '') {
  if (!checkIn) return;
  openModal({
    checkIn,
    checkOut: addDaysToIsoDate(checkIn, 1),
    accommodationId,
    step: 1
  });
}

async function openEditModal(id) {
  try {
    const data = await apiGet(`/api/reservations/${id}`);
    const r = data.data;
    let guestFull = {};
    try { const gd = await apiGet(`/api/guests/${r.guest_id}`); guestFull = gd.data || {}; } catch {}

    editingId = id;
    _editingPriceInfo = { price_edited_at: r.price_edited_at, price_edited_by_name: r.price_edited_by_name };
    document.getElementById('modal-title').textContent = 'Editar Reserva — ' + id;
    document.getElementById('btn-guardar').textContent = 'Atualizar Reserva';
    buildCountrySelects();
    _resetGuestFields();

    // Preço por noite guardado → overrides (para editar noite a noite).
    resetNightlyState();
    const storedNightly = typeof r.nightly_prices === 'string'
      ? (() => { try { return JSON.parse(r.nightly_prices || '[]'); } catch { return []; } })()
      : (r.nightly_prices || []);
    (storedNightly || []).forEach(n => {
      if (n && n.date != null && n.price != null) _nightlyOverrides[n.date] = Math.max(0, Number(n.price));
    });

    const nameParts = (r.guest_name || '').trim().split(' ');
    const nomeFull = [guestFull.first_name || nameParts[0], guestFull.last_name || nameParts.slice(1).join(' ')].filter(Boolean).join(' ');
    document.getElementById('f-nome-completo').value = nomeFull || r.guest_name || '';
    document.getElementById('f-email').value          = realEmail(r.guest_email) || '';
    // Split stored phone into prefix + number
    const rawPhone = r.guest_phone || guestFull.phone || '';
    const matchedCountry = DIAL_COUNTRIES.find(c => rawPhone.startsWith(c.dial));
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
    document.getElementById('f-nascimento').value        = formatDateForBirthInput(guestFull.birth_date || '');
    document.getElementById('f-local-nascimento').value  = guestFull.birth_city || '';
    updateForeignRequirements();
    document.getElementById('f-nif').value            = guestFull.nif || '';
    document.getElementById('f-morada').value         = guestFull.address || '';
    document.getElementById('f-cp').value             = guestFull.postal_code || '';
    document.getElementById('f-cidade').value         = guestFull.city || '';

    document.getElementById('f-checkin').value       = formatDateForStandardInput(r.check_in || '');
    document.getElementById('f-checkout').value      = formatDateForStandardInput(r.check_out || '');
    const adEl = document.getElementById('f-num-adultos');
    const crEl = document.getElementById('f-num-criancas');
    if (adEl) adEl.value = r.num_adults ?? r.num_guests ?? 2;
    if (crEl) crEl.value = r.num_children ?? 0;
    updateNumHospedes();
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
    if (payDateEl2) payDateEl2.value = formatDateForStandardInput(r.payment_date || '');
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

    renderExtraGuests();
    const guestsData = typeof r.guests_data === 'string' ? JSON.parse(r.guests_data || '[]') : (r.guests_data || []);
    guestsData.forEach((g, idx) => {
      const rows = document.querySelectorAll('.extra-guest-row');
      if (!rows[idx]) return;
      const row = rows[idx];
      const setVal = (field, val) => { const el = row.querySelector(`[data-field="${field}"]`); if (el) el.value = val || ''; };
      setVal('nome_completo', [g.first_name, g.last_name].filter(Boolean).join(' ') || g.name || '');
      setVal('email',      g.email);
      const rawP = g.phone || '';
      const mc = DIAL_COUNTRIES.find(c => rawP.startsWith(c.dial));
      setVal('tel_prefix', mc ? mc.dial : '+351');
      setVal('tel_num', mc ? rawP.slice(mc.dial.length).trim() : rawP);
      setVal('country',        g.country || g.nationality);
      setVal('birth_date',     formatDateForBirthInput(g.birth_date));
      setVal('birth_city',     g.birth_city);
      setVal('doc_type',       g.document_type);
      setVal('doc_number',     g.document_number);
      setVal('doc_emissor',    g.document_issuer_country);
      setVal('nif',            g.nif);
    });
    // Idades das crianças derivadas das datas de nascimento agora preenchidas
    renderWizChildAges();

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
    await calcTotal();
    // Preservar o total efetivamente cobrado: se diferir do recalculado a partir das
    // noites + extras (ex.: desconto ou ajuste manual antigo), fixá-lo como total manual.
    const storedTotal = Number(r.total_amount);
    const recomputed = parseFloat(document.getElementById('f-total')?.value);
    if (!isNaN(storedTotal) && !isNaN(recomputed) && Math.abs(storedTotal - recomputed) > 0.01) {
      _manualTotalOverride = storedTotal;
      await calcTotal();
    }
    renderSuiteCards();
    updateWizSummary();
    AppUI.refreshDropdowns(document.getElementById('modal-bg'));
    AppUI.openModal('modal-bg');
  } catch (e) {
    toast('❌ Erro ao carregar reserva.', 'error');
  }
}

function closeModal() {
  const bg = document.getElementById('modal-bg');
  const modal = bg.querySelector('.modal');
  modal.classList.add('modal-closing');
  setTimeout(() => { AppUI.closeModal(bg); modal.classList.remove('modal-closing'); editingId = null; }, 320);
}

// ── FECHO SEGURO + RASCUNHO (só para Nova Reserva) ──
const RESERVA_DRAFT_KEY = 'sp_reserva_draft_v1';
let _draftSaveTimer = null;
let _suppressDraftSave = false;

function reservaModalIsOpen() {
  return document.getElementById('modal-bg')?.classList.contains('open');
}

// Campos de topo cujo valor guardamos/restauramos no rascunho.
const RESERVA_DRAFT_FIELDS = [
  'f-checkin', 'f-checkout', 'f-num-adultos', 'f-num-criancas', 'f-breakfast',
  'f-canal', 'f-aloj', 'f-nome-completo', 'f-email', 'f-tel-prefix', 'f-tel-num',
  'f-pais', 'f-doc-tipo', 'f-doc-num', 'f-doc-emissor', 'f-nascimento',
  'f-local-nascimento', 'f-nif', 'f-morada', 'f-cp', 'f-cidade', 'f-notas',
  'f-estado', 'f-payment-status', 'f-pagamento', 'f-amount-paid', 'f-payment-date',
  'f-discount-type', 'f-discount-val', 'f-total', 'f-noites',
];

// True se o formulário tiver dados que valha a pena preservar/confirmar antes de fechar.
function reservaFormHasData() {
  const val = id => (document.getElementById(id)?.value || '').trim();
  if (val('f-nome-completo') || val('f-email') || val('f-tel-num') ||
      val('f-notas') || val('f-aloj') || val('f-amount-paid') || val('f-discount-val') ||
      val('f-doc-num') || val('f-nif') || val('f-morada')) {
    return true;
  }
  const extras = collectExtraGuests();
  return extras.length > 0;
}

function requestCloseReservaModal() {
  // Em edição não guardamos rascunho; fechar diretamente.
  if (editingId) { closeModal(); return; }
  if (reservaFormHasData()) {
    saveReservaDraft(); // garante que o estado atual fica guardado
    const ok = window.confirm('Fechar e guardar como rascunho?\n\nOs dados ficam guardados e podes continuar da próxima vez que abrires "Nova Reserva".');
    if (!ok) return;
  } else {
    // Formulário vazio: nada a preservar.
    clearReservaDraft();
  }
  closeModal();
}
// Hook global para o handler de Escape partilhado (ui.js).
window.requestCloseReservaModal = requestCloseReservaModal;

function serializeReservaForm() {
  const fields = {};
  RESERVA_DRAFT_FIELDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) fields[id] = el.value;
  });
  const discTypeBtn = document.querySelector('.resf-disc-type.active');
  return {
    v: 1,
    savedAt: Date.now(),
    fields,
    discountType: discTypeBtn?.dataset.type || 'pct',
    numHospedes: document.getElementById('f-num-hospedes')?.value || '',
    extraGuests: collectExtraGuests(),
    nightlyOverrides: _nightlyOverrides,
    manualTotal: _manualTotalOverride,
  };
}

function saveReservaDraft() {
  if (_suppressDraftSave || editingId) return;
  try {
    localStorage.setItem(RESERVA_DRAFT_KEY, JSON.stringify(serializeReservaForm()));
  } catch {}
}

function scheduleReservaDraftSave() {
  if (_suppressDraftSave || editingId) return;
  clearTimeout(_draftSaveTimer);
  _draftSaveTimer = setTimeout(saveReservaDraft, 400);
}

function clearReservaDraft() {
  try { localStorage.removeItem(RESERVA_DRAFT_KEY); } catch {}
  const notice = document.getElementById('resf-draft-notice');
  if (notice) notice.style.display = 'none';
}

function loadReservaDraft() {
  try {
    const raw = localStorage.getItem(RESERVA_DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    return draft && draft.fields ? draft : null;
  } catch { return null; }
}

// Aplica um rascunho aos campos do modal. Assume modal já em estado "Nova Reserva".
function applyReservaDraft(draft) {
  _suppressDraftSave = true;
  try {
    Object.entries(draft.fields || {}).forEach(([id, value]) => {
      const el = document.getElementById(id);
      if (el) el.value = value;
    });
    updateNumHospedes();
    if (draft.discountType) setFormDiscountType(draft.discountType);
    const discVal = document.getElementById('f-discount-val');
    if (discVal && draft.fields?.['f-discount-val']) {
      discVal.value = draft.fields['f-discount-val'];
      const wrap = document.getElementById('resf-discount-wrap');
      if (wrap) wrap.style.display = '';
    }

    // Preço por noite / total manual guardados no rascunho.
    _nightlyOverrides = draft.nightlyOverrides && typeof draft.nightlyOverrides === 'object' ? { ...draft.nightlyOverrides } : {};
    _manualTotalOverride = (draft.manualTotal == null || isNaN(Number(draft.manualTotal))) ? null : Number(draft.manualTotal);
    _nightlyGridSig = '';

    renderExtraGuests();
    (draft.extraGuests || []).forEach((g, idx) => {
      const rows = document.querySelectorAll('.extra-guest-row');
      const row = rows[idx];
      if (!row) return;
      const setVal = (field, v) => { const el = row.querySelector(`[data-field="${field}"]`); if (el) el.value = v || ''; };
      setVal('nome_completo', [g.first_name, g.last_name].filter(Boolean).join(' ') || g.name || '');
      setVal('email', g.email);
      const rawP = g.phone || '';
      const mc = DIAL_COUNTRIES.find(c => rawP.startsWith(c.dial));
      setVal('tel_prefix', mc ? mc.dial : '+351');
      setVal('tel_num', mc ? rawP.slice(mc.dial.length).trim() : rawP);
      setVal('country', g.country || g.nationality);
      setVal('birth_date', formatDateForBirthInput(g.birth_date));
      setVal('birth_city', g.birth_city);
      setVal('doc_type', g.document_type);
      setVal('doc_number', g.document_number);
      setVal('doc_emissor', g.document_issuer_country);
      setVal('nif', g.nif);
    });

    const notice = document.getElementById('resf-draft-notice');
    if (notice) notice.style.display = '';
  } finally {
    _suppressDraftSave = false;
  }
}

function discardReservaDraft() {
  clearReservaDraft();
  _suppressDraftSave = true;
  try {
    openModal(); // reabre limpo (openModal repõe defaults e não encontra rascunho)
  } finally {
    _suppressDraftSave = false;
  }
}

// Autosave: qualquer alteração dentro do modal atualiza o rascunho (só Nova Reserva).
function _wireReservaDraftAutosave() {
  const bg = document.getElementById('modal-bg');
  if (!bg || bg.dataset.draftWired) return;
  bg.dataset.draftWired = '1';
  const onChange = () => scheduleReservaDraftSave();
  bg.addEventListener('input', onChange);
  bg.addEventListener('change', onChange);
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _wireReservaDraftAutosave);
} else {
  _wireReservaDraftAutosave();
}

async function calcTotal() {
  const ci = normalizeIsoDateValue(document.getElementById('f-checkin').value);
  const co = normalizeIsoDateValue(document.getElementById('f-checkout').value);
  const numHospedes = parseInt(document.getElementById('f-num-hospedes').value) || 1;
  const breakfast = document.getElementById('f-breakfast')?.value === 'true';
  const alojId = document.getElementById('f-aloj').value;
  const suite = accommodations.find(a => a.id === alojId);

  // Update nights badge from dates alone (no suite needed)
  const badge = document.getElementById('wiz-nights-badge-wrap');
  const valEl = document.getElementById('wiz-nights-val');
  if (ci && co) {
    const noitesOnly = window.ReservationDates?.countNights(ci, co) || 0;
    if (badge) badge.style.display = noitesOnly > 0 ? '' : 'none';
    if (valEl) valEl.textContent = noitesOnly;
    // Trigger availability check (debounced)
    clearTimeout(_availTimer);
    _availTimer = setTimeout(fetchSuiteAvailability, 300);
    // Períodos de todos os alojamentos para os cartões mostrarem preço dinâmico.
    preloadAllPricingPeriods();
  } else {
    if (badge) badge.style.display = 'none';
    _unavailableSuites = new Set();
    renderSuiteCards();
  }

  if (ci && co && suite) {
    const pricingPeriods = await loadWizPricingPeriods(alojId);
    const totals = window.ReservationPricing.calculateReservationTotal(suite, servicosData, {
      check_in: ci,
      check_out: co,
      num_guests: numHospedes,
      breakfast_included: breakfast,
      birth_dates: wizEffectiveBirthDates(),
      pricing_periods: pricingPeriods,
      nightly_prices: nightlyOverrideArray(),
    });
    _nightlyPrices = totals.nightlyPrices || [];
    // Padrão por noite (sem overrides) para referência em cinzento na grelha
    const stdNightly = window.ReservationPricing.buildNightlyPrices(Number(suite.price_per_night || 0), ci, co, pricingPeriods);
    _standardNightlyByDate = Object.fromEntries(stdNightly.map(n => [n.date, n.price]));
    renderNightlyGrid();

    const discVal = parseFloat(document.getElementById('f-discount-val')?.value) || 0;
    const discType = document.getElementById('f-discount-type')?.value || 'pct';
    let finalTotal = totals.totalAmount;
    if (discVal > 0) {
      finalTotal = discType === 'pct'
        ? totals.totalAmount * (1 - Math.min(discVal, 100) / 100)
        : Math.max(0, totals.totalAmount - discVal);
    }
    // Total manual sobrepõe-se a tudo (mas coexiste com o desconto, que continua visível).
    if (_manualTotalOverride != null) finalTotal = _manualTotalOverride;

    document.getElementById('f-noites').value = totals.nights;
    document.getElementById('f-total').value = finalTotal.toFixed(2);
    const badge2 = document.getElementById('resf-total-badge');
    if (badge2) badge2.textContent = `€${finalTotal.toFixed(2)}`;

    // Breakdown + campo de total editável
    const extras = (totals.extraOccupancyCost || 0) + (totals.touristTax || 0) + (totals.breakfastCost || 0);
    const baseEl = document.getElementById('resf-nightly-base');
    if (baseEl) baseEl.textContent = `€${(totals.baseAmount || 0).toFixed(2)}`;
    const extrasEl = document.getElementById('resf-nightly-extras');
    const extrasWrap = document.getElementById('resf-nightly-extras-wrap');
    if (extrasEl) extrasEl.textContent = `€${extras.toFixed(2)}`;
    if (extrasWrap) extrasWrap.style.display = extras > 0.005 ? '' : 'none';
    updateNightlyTotalField(finalTotal);

    const discWrap = document.getElementById('resf-discount-wrap');
    if (discWrap) discWrap.style.display = '';
    const discPreview = document.getElementById('f-discount-preview');
    if (discPreview) {
      const saving = totals.totalAmount - (_manualTotalOverride != null ? _manualTotalOverride : finalTotal);
      discPreview.textContent = discVal > 0 && saving > 0.005 ? `Poupança: €${saving.toFixed(2)}` : '';
    }
  } else {
    if (!suite) {
      document.getElementById('f-total').value = '';
      const b = document.getElementById('resf-total-badge'); if (b) b.textContent = '';
      const discWrap = document.getElementById('resf-discount-wrap'); if (discWrap) discWrap.style.display = 'none';
    }
    _nightlyPrices = [];
    renderNightlyGrid();
    if (!ci || !co) document.getElementById('f-noites').value = '';
  }
  updateWizSummary();
  updateSpecialRateHints();
}

// ── PREÇO POR NOITE (grelha editável) ──
function nightlyGridSignature() {
  return _nightlyPrices.map(n => n.date).join('|');
}

function formatNightLabel(iso) {
  const d = new Date(`${iso}T12:00:00`);
  const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${days[d.getDay()]}, ${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]}`;
}

function renderNightlyGrid() {
  const wrap = document.getElementById('resf-nightly-wrap');
  const grid = document.getElementById('resf-nightly-grid');
  if (!wrap || !grid) return;
  if (!_nightlyPrices.length) {
    wrap.style.display = 'none';
    grid.innerHTML = '';
    _nightlyGridSig = '';
    return;
  }
  wrap.style.display = '';
  const sig = nightlyGridSignature();
  if (sig === _nightlyGridSig) {
    // Mesma estrutura de datas: não reconstruir (preserva foco); só atualizar destaque.
    document.querySelectorAll('#resf-nightly-grid .resf-nightly-row').forEach(row => {
      row.classList.toggle('edited', _nightlyOverrides[row.dataset.date] != null);
    });
    return;
  }
  _nightlyGridSig = sig;
  grid.innerHTML = _nightlyPrices.map(n => {
    const edited = _nightlyOverrides[n.date] != null;
    const std = _standardNightlyByDate[n.date];
    return `<div class="resf-nightly-row${edited ? ' edited' : ''}" data-date="${n.date}">
      <span class="resf-nightly-date">${formatNightLabel(n.date)}${edited ? '<span class="resf-nightly-tag">editado</span>' : ''}${std != null ? `<span class="resf-nightly-std">padrão €${Number(std).toFixed(2)}</span>` : ''}</span>
      <div class="resf-nightly-input">
        <span>€</span>
        <input type="number" min="0" step="0.01" value="${Number(n.price).toFixed(2)}"
          oninput="onNightlyPriceInput('${n.date}', this.value)" autocomplete="off">
      </div>
    </div>`;
  }).join('');
}

function onNightlyPriceInput(date, value) {
  const v = value === '' ? null : Number(value);
  if (v == null || isNaN(v)) delete _nightlyOverrides[date];
  else _nightlyOverrides[date] = Math.max(0, v);
  // Alterar preços por noite recalcula o total a partir das noites.
  _manualTotalOverride = null;
  calcTotal();
}

function applyNightlyToAll() {
  const raw = document.getElementById('resf-nightly-all-val')?.value;
  const v = raw === '' ? null : Number(raw);
  if (v == null || isNaN(v) || v < 0) { toast('Introduz um preço válido para aplicar a todas as noites.', 'error'); return; }
  _nightlyPrices.forEach(n => { _nightlyOverrides[n.date] = v; });
  _manualTotalOverride = null;
  _nightlyGridSig = ''; // forçar reconstrução para refletir os novos valores nos inputs
  calcTotal();
}

function resetNightlyOverrides() {
  _nightlyOverrides = {};
  _manualTotalOverride = null;
  _nightlyGridSig = '';
  const allInp = document.getElementById('resf-nightly-all-val'); if (allInp) allInp.value = '';
  calcTotal();
}

function updateNightlyTotalField(finalTotal) {
  const inp = document.getElementById('f-total-manual');
  const resetBtn = document.getElementById('resf-total-reset');
  if (!inp) return;
  if (resetBtn) resetBtn.style.display = _manualTotalOverride != null ? '' : 'none';
  // Reflete sempre o total atual, exceto enquanto o utilizador está a escrever no campo.
  if (document.activeElement !== inp) inp.value = finalTotal.toFixed(2);
}

function onManualTotalInput(value) {
  const v = value === '' ? null : Number(value);
  _manualTotalOverride = (v == null || isNaN(v)) ? null : Math.max(0, v);
  calcTotal();
}

function resetManualTotal() {
  _manualTotalOverride = null;
  calcTotal();
}

function resetNightlyState() {
  _nightlyOverrides = {};
  _nightlyPrices = [];
  _nightlyGridSig = '';
  _manualTotalOverride = null;
  const allInp = document.getElementById('resf-nightly-all-val'); if (allInp) allInp.value = '';
}

function setFormDiscountType(type) {
  const el = document.getElementById('f-discount-type');
  if (el) el.value = type;
  document.querySelectorAll('.resf-disc-type').forEach(b => b.classList.toggle('active', b.dataset.type === type));
  const inp = document.getElementById('f-discount-val');
  if (inp) { inp.value = ''; inp.placeholder = type === 'pct' ? '0' : '0.00'; }
  calcTotal();
}

function resetFormDiscount() {
  const el = document.getElementById('f-discount-type'); if (el) el.value = 'pct';
  const inp = document.getElementById('f-discount-val'); if (inp) inp.value = '';
  const prev = document.getElementById('f-discount-preview'); if (prev) prev.textContent = '';
  document.querySelectorAll('.resf-disc-type').forEach(b => b.classList.toggle('active', b.dataset.type === 'pct'));
  const wrap = document.getElementById('resf-discount-wrap'); if (wrap) wrap.style.display = 'none';
}

function getExtraOccupancyCharge(suite, numGuests, nights, birthDates = [], checkIn = null) {
  return window.ReservationPricing?.getExtraOccupancyCharge(suite, numGuests, nights, birthDates, checkIn) || 0;
}

function normalizeExtraOccupancyOptionsForPrice(suite) {
  return window.ReservationPricing?.normalizeExtraOccupancyOptions(suite) || [];
}

function getGuestBirthDatesFromUi() {
  return [
    getBirthDateValue(document.getElementById('f-nascimento')),
    ...Array.from(document.querySelectorAll('.extra-guest-row [data-field="birth_date"]')).map(el => getBirthDateValue(el))
  ].filter(Boolean);
}

// ── Idades das crianças (seleção rápida, como no formulário público) ──

function wizChildRowBirthDates() {
  return Array.from(document.querySelectorAll('.extra-guest-row[data-is-child="true"] [data-field="birth_date"]'))
    .map(el => getBirthDateValue(el) || null);
}

function renderWizChildAges() {
  const wrap = document.getElementById('resf-child-ages');
  if (!wrap) return;
  const count = parseInt(document.getElementById('f-num-criancas')?.value) || 0;
  if (count <= 0) { wrap.style.display = 'none'; wrap.innerHTML = ''; return; }

  const ci = normalizeIsoDateValue(document.getElementById('f-checkin')?.value) || new Date().toISOString().slice(0, 10);
  const prev = Array.from(wrap.querySelectorAll('select')).map(s => s.value);
  const rowAges = wizChildRowBirthDates().map(d => (d ? getAgeAtDate(d, ci) : null));

  let html = '<label class="form-label">Idade das crianças</label><div style="display:flex;flex-wrap:wrap;gap:8px;">';
  for (let i = 0; i < count; i++) {
    // Preferência: valor já escolhido → idade derivada da ficha da criança → vazio
    const sel = prev[i] || (rowAges[i] != null && rowAges[i] >= 0 ? String(Math.min(rowAges[i], 17)) : '');
    let opts = '<option value="">Idade</option>';
    for (let a = 0; a <= 17; a++) opts += `<option value="${a}"${String(a) === sel ? ' selected' : ''}>${a} ano${a !== 1 ? 's' : ''}</option>`;
    html += `<label style="flex:1;min-width:110px;display:flex;flex-direction:column;gap:3px;">
      <select class="form-control" data-wiz-child-age="${i}" onchange="onWizChildAgeChange()">${opts}</select>
      <small class="wiz-child-age-hint" style="font-size:11px;color:var(--cinza);min-height:14px;"></small>
    </label>`;
  }
  html += '</div>';
  wrap.innerHTML = html;
  wrap.style.display = '';
  updateWizChildAgeHints();
}

function onWizChildAgeChange() {
  updateWizChildAgeHints();
  calcTotal();
}

function updateWizChildAgeHints() {
  const suite = accommodations.find(a => a.id === document.getElementById('f-aloj')?.value);
  const babyLimit = Number(suite?.baby_age_limit ?? 2);
  const childLimit = Number(suite?.child_age_limit ?? 12);
  const babyPrice = Number(suite?.baby_price ?? 0);
  const childPrice = Number(suite?.child_price ?? 0);
  document.querySelectorAll('#resf-child-ages [data-wiz-child-age]').forEach(sel => {
    const hint = sel.parentElement?.querySelector('.wiz-child-age-hint');
    if (!hint) return;
    if (sel.value === '' || !suite) { hint.textContent = ''; return; }
    const age = Number(sel.value);
    if (age < babyLimit) hint.textContent = babyPrice > 0 ? `Bebé · €${babyPrice.toFixed(2)}/noite` : 'Bebé · sem custo';
    else if (age < childLimit) hint.textContent = childPrice > 0 ? `Criança · €${childPrice.toFixed(2)}/noite` : 'Criança · sem custo';
    else hint.textContent = 'Preço de adulto';
  });
}

// Converte cada idade escolhida numa data de nascimento aproximada alinhada ao
// check-in (idade-ao-check-in = idade escolhida), como no formulário público.
function wizChildAgeBirthDates() {
  const ci = normalizeIsoDateValue(document.getElementById('f-checkin')?.value) || new Date().toISOString().slice(0, 10);
  const year = Number(ci.slice(0, 4));
  const monthDay = ci.slice(4); // "-MM-DD"
  return Array.from(document.querySelectorAll('#resf-child-ages [data-wiz-child-age]')).map(s =>
    s.value === '' ? null : `${year - Number(s.value)}${monthDay}`
  );
}

// Datas de nascimento efetivas para o cálculo: adultos primeiro (posições sem
// desconto), depois as crianças — data explícita da ficha da criança quando
// preenchida, senão a derivada da idade escolhida.
function wizEffectiveBirthDates() {
  const adults = parseInt(document.getElementById('f-num-adultos')?.value) || 1;
  const children = parseInt(document.getElementById('f-num-criancas')?.value) || 0;
  if (!children) return getGuestBirthDatesFromUi();
  const rowDates = wizChildRowBirthDates();
  const ageDates = wizChildAgeBirthDates();
  const childDates = [];
  for (let i = 0; i < children; i++) childDates.push(rowDates[i] || ageDates[i] || null);
  return [...Array(adults).fill(null), ...childDates];
}

function formatDateForBirthInput(value) {
  return window.ReservationDates?.formatPtDate(value) || value || '';
}

function normalizeBirthDateValue(value) {
  return window.ReservationDates?.normalizeIsoDate(value, {
    minYear: 1900,
    maxYear: new Date().getFullYear()
  }) || '';
}

function isValidDateParts(year, month, day) {
  return window.ReservationDates?.isValidDateParts(year, month, day, {
    minYear: 1900,
    maxYear: new Date().getFullYear()
  }) || false;
}

function getBirthDateValue(input) {
  return normalizeBirthDateValue(input?.value || '');
}

function handleBirthDateInput(input) {
  const digits = String(input.value || '').replace(/\D/g, '');
  if (digits.length === 8) normalizeBirthDateInput(input);
}

function normalizeBirthDateInput(input) {
  if (!input) return;
  const iso = normalizeBirthDateValue(input.value);
  if (iso) input.value = formatDateForBirthInput(iso);
  calcTotal();
  updateSpecialRateHints();
}

function normalizeIsoDateValue(value) {
  return window.ReservationDates?.normalizeIsoDate(value) || '';
}

function formatDateForStandardInput(value) {
  return window.ReservationDates?.formatPtDate(value) || value || '';
}

function getAgeSpecialRates(suite, birthDates = [], checkIn = null) {
  return window.ReservationPricing?.getAgeSpecialRates(suite, birthDates, checkIn) || [];
}

function getAgeSpecialRateInfo(suite, birthDate, checkIn = null) {
  if (!suite || !birthDate || !checkIn) return null;
  const age = getAgeAtDate(birthDate, checkIn);
  if (age === null) return null;
  const babyLimit = Number(suite.baby_age_limit ?? 2);
  const childLimit = Number(suite.child_age_limit ?? 12);
  if (age <= babyLimit) {
    return { type: 'bebé', label: 'Preço de bebé aplicado', price: Number(suite.baby_price ?? 0), age };
  }
  if (age > babyLimit && age < childLimit) {
    return { type: 'criança', label: 'Preço de criança aplicado', price: Number(suite.child_price ?? 0), age };
  }
  return null;
}

function updateSpecialRateHints() {
  const suite = accommodations.find(a => a.id === document.getElementById('f-aloj')?.value);
  const checkIn = document.getElementById('f-checkin')?.value || new Date().toISOString().slice(0, 10);
  const included = Math.max(1, Math.min(
    Number(suite?.base_guests_included) || Math.min(Number(suite?.max_guests) || 2, 2),
    Number(suite?.max_guests) || 20
  ));
  const setHint = (el, birthDate, guestIndex = 0) => {
    if (!el) return;
    const info = getAgeSpecialRateInfo(suite, birthDate, checkIn);
    el.style.display = info ? '' : 'none';
    if (!info) {
      el.textContent = '';
      return;
    }
    const applied = guestIndex >= included;
    el.textContent = `${info.label}${applied ? '' : ' se for hóspede adicional'} · €${info.price.toFixed(2)}/noite`;
  };

  setHint(
    document.getElementById('f-nascimento-rate-hint'),
    getBirthDateValue(document.getElementById('f-nascimento')),
    0
  );
  document.querySelectorAll('.extra-guest-row').forEach((row, idx) => {
    setHint(
      row.querySelector('.guest-rate-hint'),
      getBirthDateValue(row.querySelector('[data-field="birth_date"]')),
      idx + 1
    );
  });
}

function getAgeAtDate(birthDate, refDate) {
  return window.ReservationDates?.ageAtDate(birthDate, refDate) ?? null;
}

function renderExtraGuests() {
  const n = parseInt(document.getElementById('f-num-hospedes').value) || 1;
  const wrap = document.getElementById('extra-guests-wrap');
  const container = document.getElementById('extra-guests-container');
  if (!wrap || !container) return;
  if (n <= 1) { wrap.style.display = 'none'; container.innerHTML = ''; return; }
  wrap.style.display = '';

  const existing = Array.from(container.querySelectorAll('.extra-guest-row')).map(row => ({
    nome_completo:   row.querySelector('[data-field="nome_completo"]')?.value   || '',
    email:           row.querySelector('[data-field="email"]')?.value           || '',
    tel_prefix:      row.querySelector('[data-field="tel_prefix"]')?.value      || '+351',
    tel_num:         row.querySelector('[data-field="tel_num"]')?.value         || '',
    country:         row.querySelector('[data-field="country"]')?.value         || '',
    birth_date:      formatDateForBirthInput(row.querySelector('[data-field="birth_date"]')?.value || ''),
    birth_city:      row.querySelector('[data-field="birth_city"]')?.value      || '',
    doc_type:        row.querySelector('[data-field="doc_type"]')?.value        || '',
    doc_number:      row.querySelector('[data-field="doc_number"]')?.value      || '',
    doc_emissor:     row.querySelector('[data-field="doc_emissor"]')?.value     || '',
    nif:             row.querySelector('[data-field="nif"]')?.value             || '',
  }));

  const prefixOpts = DIAL_COUNTRIES.map(c =>
    `<option value="${c.dial}">${c.flag} ${c.dial}</option>`
  ).join('');
  const countryOpts = '<option value="">— País —</option>' +
    DIAL_COUNTRIES.map(c => `<option value="${c.name}">${c.flag} ${c.name}</option>`).join('');

  const numAdultos = parseInt(document.getElementById('f-num-adultos')?.value) || 1;
  const parts = [];
  for (let i = 2; i <= n; i++) {
    const idx = i - 2;
    const p = existing[idx] || {};
    const isChild = i > numAdultos;
    const rowLabel = isChild ? `Hóspede ${i} — criança` : `Hóspede ${i}`;
    parts.push(`
      <div class="extra-guest-row" data-extra-idx="${idx}" data-is-child="${isChild}" style="background:var(--cinza-claro);border-radius:10px;padding:14px;margin-bottom:12px;">
        <div style="font-size:12px;font-weight:700;color:var(--cinza);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;">${rowLabel}</div>
        ${!isChild ? `<div class="form-group form-full" style="margin-bottom:12px;">
          <label class="form-label">Pesquisa rápida (hóspede existente)</label>
          <div class="guest-search-wrap">
            <input class="form-control extra-guest-search-input" placeholder="Nome, email ou telefone…" autocomplete="off"
              oninput="extraGuestSearch(this.value,${idx})">
            <div class="guest-drop" id="extra-guest-drop-${idx}"></div>
          </div>
        </div>` : ''}
        <div class="form-grid" style="margin:0;gap:12px;">
          <div class="form-group form-full" style="margin-bottom:0;">
            <label class="form-label">Nome Completo <span class="req-star">*</span></label>
            <input class="form-control" data-field="nome_completo" placeholder="Nome completo" value="${p.nome_completo || ''}" autocomplete="off">
          </div>
          ${!isChild ? `<div class="form-group" style="margin-bottom:0;">
            <label class="form-label">Email</label>
            <input class="form-control" data-field="email" type="email" placeholder="email@exemplo.com" value="${p.email || ''}" autocomplete="off">
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">Telefone</label>
            <div class="phone-group">
              <select class="form-control phone-prefix" data-field="tel_prefix">${prefixOpts}</select>
              <input class="form-control phone-number" data-field="tel_num" type="tel" placeholder="912 345 678" value="${p.tel_num || ''}" autocomplete="off">
            </div>
          </div>` : ''}
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">País <span class="req-star">*</span></label>
            <select class="form-control guest-country" data-field="country"
              onchange="updateExtraForeignReqs(this.closest('.extra-guest-row'))">${countryOpts}</select>
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">Data de Nascimento <span class="req-star">*</span></label>
            <div class="birth-date-control">
              <input class="form-control birth-date-input" data-field="birth_date" type="text" inputmode="numeric" maxlength="10" placeholder="dd-mm-aaaa" data-date-format="pt" value="${formatDateForBirthInput(p.birth_date || '')}" oninput="handleBirthDateInput(this)" onblur="normalizeBirthDateInput(this);calcTotal();updateSpecialRateHints()" autocomplete="off">
              <button class="birth-date-picker-btn" type="button" onclick="AppDatePicker.open(this.closest('.birth-date-control').querySelector('.birth-date-input'),{isBirthDate:true})" aria-label="Abrir calendário">
                <i data-lucide="calendar-days"></i>
              </button>
            </div>
            <div class="guest-rate-hint"></div>
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">Local de Nascimento <span class="req-foreign-extra" style="display:none;color:var(--vermelho)">*</span></label>
            <input class="form-control" data-field="birth_city" placeholder="Cidade de nascimento" value="${p.birth_city || ''}" autocomplete="off">
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">Tipo de Documento <span class="req-foreign-extra" style="display:none;color:var(--vermelho)">*</span></label>
            <select class="form-control" data-field="doc_type">
              <option value="">— Selecionar —</option>
              <option value="cc">Cartão de Cidadão</option>
              <option value="bi">Bilhete de Identidade</option>
              <option value="passaporte">Passaporte</option>
              <option value="nie">NIE</option>
              <option value="outro">Outro</option>
            </select>
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">Nº de Documento <span class="req-foreign-extra" style="display:none;color:var(--vermelho)">*</span></label>
            <input class="form-control" data-field="doc_number" placeholder="XX000000" value="${p.doc_number || ''}" autocomplete="off">
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">País Emissor do Documento <span class="req-foreign-extra" style="display:none;color:var(--vermelho)">*</span></label>
            <select class="form-control" data-field="doc_emissor">${countryOpts}</select>
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">NIF</label>
            <input class="form-control" data-field="nif" placeholder="000 000 000" value="${p.nif || ''}" autocomplete="off">
          </div>
        </div>
      </div>`);
  }
  container.innerHTML = parts.join('');

  // Attach date pickers to newly inserted birth date inputs
  if (window.AppDatePicker) {
    container.querySelectorAll('.birth-date-input').forEach(input =>
      AppDatePicker.attach(input, { isBirthDate: true })
    );
  }

  // Restore select values + update foreign requirements after DOM insertion
  container.querySelectorAll('.extra-guest-row').forEach((row, idx) => {
    const p = existing[idx] || {};
    const prefixSel = row.querySelector('[data-field="tel_prefix"]');
    if (prefixSel && p.tel_prefix) prefixSel.value = p.tel_prefix;
    const countrySel = row.querySelector('[data-field="country"]');
    if (countrySel && p.country) countrySel.value = p.country;
    const docSel = row.querySelector('[data-field="doc_type"]');
    if (docSel && p.doc_type) docSel.value = p.doc_type;
    const emissorSel = row.querySelector('[data-field="doc_emissor"]');
    if (emissorSel && p.doc_emissor) emissorSel.value = p.doc_emissor;
    updateExtraForeignReqs(row);
  });

  enhanceReservationSelects(container);
  AppUI.refreshDropdowns(container);
  if (window.lucide) lucide.createIcons();
  updateSpecialRateHints();
}

function updateExtraForeignReqs(row) {
  const isForeign = (row.querySelector('[data-field="country"]')?.value || '') !== 'Portugal'
    && row.querySelector('[data-field="country"]')?.value !== '';
  row.querySelectorAll('.req-foreign-extra').forEach(el => {
    el.style.display = isForeign ? '' : 'none';
  });
}

// ── EXTRA GUEST SEARCH ──
const _extraSearchTimers = {};
const _extraSearchResultsMap = {};

async function extraGuestSearch(q, idx) {
  const drop = document.getElementById(`extra-guest-drop-${idx}`);
  if (!drop) return;
  if (!q || q.length < 2) {
    _extraSearchResultsMap[idx] = [];
    drop.innerHTML = '';
    drop.classList.remove('open');
    return;
  }
  clearTimeout(_extraSearchTimers[idx]);
  _extraSearchTimers[idx] = setTimeout(async () => {
    try {
      const data = await apiGet(`/api/guests?search=${encodeURIComponent(q)}`);
      _extraSearchResultsMap[idx] = (data.data || []).slice(0, 8);
      if (!_extraSearchResultsMap[idx].length) {
        drop.innerHTML = '<div style="padding:10px 14px;font-size:12px;color:var(--cinza);">Sem resultados</div>';
        drop.classList.add('open');
        return;
      }
      drop.innerHTML = _extraSearchResultsMap[idx].map((g, gIdx) => {
        const name = [g.first_name, g.last_name].filter(Boolean).join(' ') || g.name || '—';
        const meta = [g.email, g.phone].filter(Boolean).join(' · ');
        return `<div class="guest-drop-item" onclick="extraGuestSelect(${idx},${gIdx})">
          <div class="gdi-name">${name.replace(/</g,'&lt;')}</div>
          <div class="gdi-meta">${meta.replace(/</g,'&lt;')}</div>
        </div>`;
      }).join('');
      drop.classList.add('open');
    } catch (e) { drop.classList.remove('open'); }
  }, 280);
}

function extraGuestSelect(idx, gIdx) {
  const g = (_extraSearchResultsMap[idx] || [])[gIdx];
  if (!g) return;
  const row = document.querySelector(`.extra-guest-row[data-extra-idx="${idx}"]`);
  if (!row) return;
  const setVal = (field, val) => { const el = row.querySelector(`[data-field="${field}"]`); if (el) el.value = val || ''; };
  setVal('nome_completo', [g.first_name, g.last_name].filter(Boolean).join(' ') || g.name || '');
  setVal('email',       g.email);
  const rawPhone = g.phone || '';
  const mc = DIAL_COUNTRIES.find(c => rawPhone.startsWith(c.dial));
  setVal('tel_prefix',  mc ? mc.dial : '+351');
  setVal('tel_num',     mc ? rawPhone.slice(mc.dial.length).trim() : rawPhone);
  setVal('country',     g.country || g.nationality);
  setVal('birth_date',  formatDateForBirthInput(g.birth_date));
  setVal('birth_city',  g.birth_city);
  setVal('doc_type',    g.document_type);
  setVal('doc_number',  g.document_number);
  setVal('doc_emissor', g.document_issuer_country);
  setVal('nif',         g.nif);
  updateExtraForeignReqs(row);
  AppUI.refreshDropdowns(row);
  calcTotal();
  const drop = document.getElementById(`extra-guest-drop-${idx}`);
  if (drop) { drop.innerHTML = ''; drop.classList.remove('open'); }
  const si = row.querySelector('.extra-guest-search-input');
  if (si) si.value = '';
  toast('✅ Dados preenchidos.', 'success');
}

// ── WIZARD FUNCTIONS ──

let _unavailableSuites = new Set();
let _availTimer = null;

async function fetchSuiteAvailability() {
  const ci = normalizeIsoDateValue(document.getElementById('f-checkin')?.value);
  const co = normalizeIsoDateValue(document.getElementById('f-checkout')?.value);
  if (!ci || !co || new Date(co) <= new Date(ci)) {
    _unavailableSuites = new Set();
    renderSuiteCards();
    return;
  }
  try {
    const excludeParam = editingId ? `&exclude_id=${encodeURIComponent(editingId)}` : '';
    const data = await apiGet(`/api/reservations/availability?check_in=${ci}&check_out=${co}${excludeParam}`);
    _unavailableSuites = new Set(data.data?.unavailable || []);
  } catch (e) {
    _unavailableSuites = new Set();
  }
  renderSuiteCards();
  // If currently selected suite became unavailable, deselect it
  const selEl = document.getElementById('f-aloj');
  if (selEl?.value && _unavailableSuites.has(selEl.value)) {
    selEl.value = '';
    updateWizSummary();
    calcTotal();
  }
}

function updateWizUI() {
  const total = 3;
  for (let i = 1; i <= total; i++) {
    const item = document.getElementById('ws-' + i);
    if (item) {
      item.classList.remove('wiz-active', 'wiz-done');
      if (i === wizStep) item.classList.add('wiz-active');
      else if (i < wizStep) item.classList.add('wiz-done');
    }
    const panel = document.getElementById('wiz-panel-' + i);
    if (panel) panel.classList.toggle('active', i === wizStep);
  }
  const counter = document.getElementById('wiz-step-counter');
  if (counter) counter.textContent = `Passo ${wizStep} de ${total}`;
  const numEl = document.getElementById('wiz-step-num');
  if (numEl) numEl.textContent = wizStep;

  const prev = document.getElementById('btn-wiz-prev');
  const next = document.getElementById('btn-wiz-next');
  const save = document.getElementById('btn-guardar');
  if (prev) prev.style.display = wizStep > 1 ? '' : 'none';
  if (next) next.style.display = wizStep < total ? '' : 'none';
  if (save) {
    save.style.display = wizStep === total ? '' : 'none';
    save.innerHTML = (editingId
      ? `<i data-lucide="save" style="width:14px;height:14px;"></i> Atualizar Reserva`
      : `<i data-lucide="save" style="width:14px;height:14px;"></i> Guardar Reserva`);
  }
  if (wizStep === 1) { renderSuiteCards(); calcTotal(); }
  if (wizStep === 3) buildWizConfirm();
  if (window.lucide) lucide.createIcons();
}

function validateWizStep(step) {
  if (step === 1) {
    const ci = normalizeIsoDateValue(document.getElementById('f-checkin').value);
    const co = normalizeIsoDateValue(document.getElementById('f-checkout').value);
    if (!ci) { toast('⚠️ Seleciona a data de check-in.', 'error'); return false; }
    if (!co) { toast('⚠️ Seleciona a data de check-out.', 'error'); return false; }
    if (new Date(co) <= new Date(ci)) { toast('⚠️ O check-out deve ser depois do check-in.', 'error'); return false; }
    const alojVal = document.getElementById('f-aloj').value;
    if (!alojVal) { toast('⚠️ Seleciona um alojamento.', 'error'); return false; }
    if (_unavailableSuites.has(alojVal)) { toast('⚠️ Este alojamento está ocupado nas datas selecionadas.', 'error'); return false; }
    const suite = accommodations.find(a => a.id === alojVal);
    const requestedGuests = parseInt(document.getElementById('f-num-hospedes')?.value, 10) || 1;
    const maxGuests = Number(suite?.max_guests) || 0;
    if (maxGuests > 0 && requestedGuests > maxGuests) {
      toast(`⚠️ Capacidade máxima: ${maxGuests} hóspede${maxGuests !== 1 ? 's' : ''}.`, 'error');
      return false;
    }
    return true;
  }
  if (step === 2) {
    if (!document.getElementById('f-nome-completo').value.trim())
      { toast('⚠️ Introduz o nome completo do hóspede.', 'error'); return false; }
    return true;
  }
  return true;
}

function wizNext() {
  if (!validateWizStep(wizStep)) return;
  if (wizStep < 3) {
    wizStep++;
    updateWizUI();
    const body = document.querySelector('.modal-wizard .modal-body');
    if (body) body.scrollTop = 0;
  }
}

function wizPrev() {
  if (wizStep > 1) {
    wizStep--;
    updateWizUI();
    const body = document.querySelector('.modal-wizard .modal-body');
    if (body) body.scrollTop = 0;
  }
}

function updateWizSummary() {
  const nome = (document.getElementById('f-nome-completo')?.value || '').trim();
  const apelido = '';
  const alojId = document.getElementById('f-aloj')?.value;
  const suite = accommodations.find(a => a.id === alojId);
  const ci = normalizeIsoDateValue(document.getElementById('f-checkin')?.value);
  const co = normalizeIsoDateValue(document.getElementById('f-checkout')?.value);
  const nights = ci && co ? Math.max(0, Math.round((new Date(co) - new Date(ci)) / 86400000)) : 0;
  const total = document.getElementById('f-total')?.value;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('ws-guest', [nome, apelido].filter(Boolean).join(' ') || '—');
  set('ws-suite', suite?.name || '—');
  set('ws-checkin', ci ? formatDate(ci) : '—');
  set('ws-nights', nights > 0 ? nights + ' noite' + (nights !== 1 ? 's' : '') : '—');
  set('ws-total', total && Number(total) > 0 ? '€' + Number(total).toLocaleString('pt-PT', { minimumFractionDigits: 2 }) : '—');
}

function renderSuiteCards() {
  const grid = document.getElementById('suite-cards-grid');
  if (!grid) return;
  const alojEl = document.getElementById('f-aloj');
  let currentAlojId = alojEl?.value;
  const ci = normalizeIsoDateValue(document.getElementById('f-checkin')?.value);
  const co = normalizeIsoDateValue(document.getElementById('f-checkout')?.value);
  const requestedGuests = parseInt(document.getElementById('f-num-hospedes')?.value, 10) || 1;
  const datesSet = !!(ci && co && new Date(co) > new Date(ci));
  if (!accommodations.length) {
    grid.innerHTML = '<p style="font-size:13px;color:var(--cinza);">Nenhum alojamento disponível.</p>';
    return;
  }
  const currentSuite = accommodations.find(a => a.id === currentAlojId);
  const currentMaxGuests = Number(currentSuite?.max_guests) || 0;
  if (currentMaxGuests > 0 && requestedGuests > currentMaxGuests) {
    if (alojEl) alojEl.value = '';
    currentAlojId = '';
    updateWizSummary();
  }
  grid.innerHTML = accommodations.map(a => {
    const cor = a.color || 'var(--marca)';
    const maxGuests = Number(a.max_guests) || 0;
    const unavail = datesSet && _unavailableSuites.has(a.id);
    const overCapacity = maxGuests > 0 && requestedGuests > maxGuests;
    const blocked = unavail || overCapacity;
    const sel = !blocked && currentAlojId === a.id ? 'selected' : '';
    const cls = `suite-card-opt${sel ? ' selected' : ''}${blocked ? ' unavailable' : ''}${overCapacity ? ' capacity-blocked' : ''}`;
    const click = blocked ? '' : `onclick="selectSuiteCard('${a.id}')"`;
    const title = overCapacity
      ? `Capacidade máxima: ${maxGuests} hóspede${maxGuests !== 1 ? 's' : ''}`
      : (unavail ? 'Indisponível nas datas selecionadas' : a.name);
    const coverUrl = a.cover_image ? (a.cover_image.startsWith('http') ? a.cover_image : API_BASE + a.cover_image) : '';
    return `<div class="${cls}" ${click} title="${title}">
      <div class="suite-check"><i data-lucide="check" style="width:10px;height:10px;color:#fff;"></i></div>
      ${coverUrl
        ? `<img src="${coverUrl}" class="suite-card-cover" alt="${a.name}">`
        : blocked
          ? `<div style="font-size:16px;margin-bottom:6px;">🔒</div>`
          : `<div style="width:10px;height:10px;border-radius:50%;background:${cor};margin-bottom:8px;"></div>`}
      ${blocked ? `<div class="suite-card-lock">🔒</div>` : ''}
      <div class="suite-card-name">${a.name}</div>
      ${blocked
        ? `${unavail ? `<div class="suite-card-unavail-lbl">Indisponível</div>` : ''}
           ${overCapacity ? `<div class="suite-card-capacity-lbl">Capacidade máxima: ${maxGuests} hóspede${maxGuests !== 1 ? 's' : ''}</div>` : ''}`
        : suiteCardPriceHtml(a, ci, co)}
    </div>`;
  }).join('');
  if (window.lucide) lucide.createIcons();
}

// Preço do cartão: dinâmico (média/noite + total + ocupação extra) quando há datas,
// tal como no frontoffice; senão, o preço-base estático.
function suiteCardPriceHtml(a, ci, co) {
  const datesOk = ci && co && new Date(co) > new Date(ci);
  const fallback = `<div class="suite-card-price">€${a.price_per_night}<span class="suite-card-sub"> / noite</span></div>`;
  if (!datesOk || !window.ReservationPricing) return fallback;
  const numHospedes = parseInt(document.getElementById('f-num-hospedes')?.value, 10) || 1;
  const totals = window.ReservationPricing.calculateReservationTotal(a, [], {
    check_in: ci,
    check_out: co,
    num_guests: numHospedes,
    birth_dates: wizEffectiveBirthDates(),
    pricing_periods: _cachedPricingPeriods[a.id] || [],
  });
  if (!totals || !totals.baseAmount || !totals.nights) return fallback;
  const avg = totals.baseAmount / totals.nights;
  const grand = totals.baseAmount + (totals.extraOccupancyCost || 0);
  const extra = totals.extraOccupancyCost > 0
    ? `<div class="suite-card-extra">+ €${totals.extraOccupancyCost.toFixed(2)} ocupação extra</div>`
    : '';
  return `<div class="suite-card-price">€${avg.toFixed(2)}<span class="suite-card-sub"> / noite</span>
    <div class="suite-card-total">€${grand.toFixed(2)} total</div>${extra}</div>`;
}

function selectSuiteCard(id) {
  if (_unavailableSuites.has(id)) return;
  const suite = accommodations.find(a => a.id === id);
  const requestedGuests = parseInt(document.getElementById('f-num-hospedes')?.value, 10) || 1;
  const maxGuests = Number(suite?.max_guests) || 0;
  if (maxGuests > 0 && requestedGuests > maxGuests) return;
  const sel = document.getElementById('f-aloj');
  const previous = sel?.value;
  if (sel) sel.value = id;
  delete _cachedPricingPeriods[id]; // force refresh on next calcTotal
  // Trocar de alojamento parte de preços novos (os overrides eram do anterior).
  if (previous !== id) {
    _nightlyOverrides = {};
    _manualTotalOverride = null;
    _nightlyGridSig = '';
    const allInp = document.getElementById('resf-nightly-all-val'); if (allInp) allInp.value = '';
  }
  renderSuiteCards();
  calcTotal();
}

function buildWizConfirm() {
  calcTotal();
  const nome = (document.getElementById('f-nome-completo')?.value || '').trim();
  const apelido = '';
  const email = document.getElementById('f-email')?.value || '';
  const prefix = document.getElementById('f-tel-prefix')?.value || '';
  const telNum = document.getElementById('f-tel-num')?.value || '';
  const pais = document.getElementById('f-pais')?.value || '';
  const alojId = document.getElementById('f-aloj')?.value;
  const suite = accommodations.find(a => a.id === alojId);
  const cor = suite?.color || 'var(--marca)';
  const ci = normalizeIsoDateValue(document.getElementById('f-checkin')?.value);
  const co = normalizeIsoDateValue(document.getElementById('f-checkout')?.value);
  const nights = ci && co ? Math.max(0, Math.round((new Date(co) - new Date(ci)) / 86400000)) : 0;
  const canal = document.getElementById('f-canal')?.value || '';
  const numH = parseInt(document.getElementById('f-num-hospedes')?.value) || 1;
  const bkf = document.getElementById('f-breakfast')?.value === 'true';
  const total = parseFloat(document.getElementById('f-total')?.value) || 0;
  const extraOccupancyCost = getExtraOccupancyCharge(suite, numH, nights, wizEffectiveBirthDates(), ci);
  const hasPeriods = (_cachedPricingPeriods[alojId] || []).length > 0;
  const hasNightlyEdits = Object.keys(_nightlyOverrides).length > 0;
  const priceLabel = hasNightlyEdits ? 'Preço por noite personalizado' : (hasPeriods ? 'Preço dinâmico' : `€${suite?.price_per_night || 0}/noite`);
  const card = document.getElementById('wiz-conf-card');
  if (!card) return;
  card.innerHTML = `<div class="wiz-conf-grid">
    <div class="wiz-conf-cell">
      <div class="wiz-conf-lbl">Hóspede</div>
      <div class="wiz-conf-val">${[nome, apelido].filter(Boolean).join(' ') || '—'}</div>
      <div class="wiz-conf-sub">${email}</div>
      <div class="wiz-conf-sub">${(prefix + ' ' + telNum).trim()} · ${pais}</div>
    </div>
    <div class="wiz-conf-cell">
      <div class="wiz-conf-lbl">Alojamento</div>
      <div class="wiz-conf-val" style="display:flex;align-items:center;gap:6px;">
        <span style="width:8px;height:8px;border-radius:50%;background:${cor};flex-shrink:0;display:inline-block;"></span>
        ${suite?.name || '—'}
      </div>
      <div class="wiz-conf-sub">${canal} · ${numH} hóspede${numH !== 1 ? 's' : ''}</div>
      <div class="wiz-conf-sub">${bkf ? '🥐 Pequeno-almoço incl.' : 'Sem pequeno-almoço'}</div>
    </div>
    <div class="wiz-conf-cell">
      <div class="wiz-conf-lbl">Datas</div>
      <div class="wiz-conf-val">${ci ? formatDate(ci) : '—'} → ${co ? formatDate(co) : '—'}</div>
      <div class="wiz-conf-sub">${nights} noite${nights !== 1 ? 's' : ''}</div>
    </div>
    <div class="wiz-conf-cell accent">
      <div class="wiz-conf-lbl">Total</div>
      <div class="wiz-conf-val">€${total.toLocaleString('pt-PT', { minimumFractionDigits: 2 })}</div>
      <div class="wiz-conf-sub">${priceLabel} × ${nights} noites${extraOccupancyCost ? ` · extra €${extraOccupancyCost.toFixed(2)}` : ''}</div>
    </div>
  </div>`;
}

// ── GUEST SEARCH AUTOCOMPLETE ──
let _guestSearchTimer = null;
let _guestSearchResults = [];

async function wizGuestSearch(q) {
  const drop = document.getElementById('wiz-guest-drop');
  if (!drop) return;
  if (!q || q.length < 2) { _guestSearchResults = []; drop.innerHTML = ''; drop.classList.remove('open'); return; }
  clearTimeout(_guestSearchTimer);
  _guestSearchTimer = setTimeout(async () => {
    try {
      const data = await apiGet(`/api/guests?search=${encodeURIComponent(q)}`);
      _guestSearchResults = (data.data || []).slice(0, 8);
      if (!_guestSearchResults.length) {
        drop.innerHTML = '<div style="padding:10px 14px;font-size:12px;color:var(--cinza);">Sem resultados</div>';
        drop.classList.add('open');
        return;
      }
      drop.innerHTML = _guestSearchResults.map((g, idx) => {
        const name = [g.first_name, g.last_name].filter(Boolean).join(' ') || g.name || '—';
        const meta = [g.email, g.phone].filter(Boolean).join(' · ');
        return `<div class="guest-drop-item" onclick="wizSelectGuest(${idx})">
          <div class="gdi-name">${name.replace(/</g, '&lt;')}</div>
          <div class="gdi-meta">${meta.replace(/</g, '&lt;')}</div>
        </div>`;
      }).join('');
      drop.classList.add('open');
    } catch (e) { drop.classList.remove('open'); }
  }, 280);
}

function wizSelectGuest(idx) {
  const g = _guestSearchResults[idx];
  if (!g) return;
  document.getElementById('f-nome-completo').value = [g.first_name, g.last_name].filter(Boolean).join(' ') || g.name || '';
  document.getElementById('f-email').value = g.email || '';
  const rawPhone = g.phone || '';
  const mc = DIAL_COUNTRIES.find(c => rawPhone.startsWith(c.dial));
  if (mc) {
    document.getElementById('f-tel-prefix').value = mc.dial;
    document.getElementById('f-tel-num').value = rawPhone.slice(mc.dial.length).trim();
  } else {
    document.getElementById('f-tel-num').value = rawPhone;
  }
  document.getElementById('f-pais').value = g.country || g.nationality || '';
  document.getElementById('f-doc-tipo').value = g.document_type || '';
  document.getElementById('f-doc-num').value = g.document_number || '';
  document.getElementById('f-doc-emissor').value = g.document_issuer_country || '';
  document.getElementById('f-nascimento').value = formatDateForBirthInput(g.birth_date || '');
  document.getElementById('f-local-nascimento').value = g.birth_city || '';
  document.getElementById('f-nif').value = g.nif || '';
  document.getElementById('f-morada').value = g.address || '';
  document.getElementById('f-cp').value = g.postal_code || '';
  document.getElementById('f-cidade').value = g.city || '';
  updateForeignRequirements();
  calcTotal();
  updateWizSummary();
  const drop = document.getElementById('wiz-guest-drop');
  if (drop) { drop.innerHTML = ''; drop.classList.remove('open'); }
  const si = document.getElementById('wiz-guest-search');
  if (si) si.value = '';
  toast('✅ Dados do hóspede preenchidos.', 'success');
}

// Close guest dropdowns when clicking outside
document.addEventListener('click', function(e) {
  const birthPop = document.getElementById('birth-date-calendar-pop');
  if (birthPop && !birthPop.contains(e.target) && !e.target.closest('.birth-date-control')) {
    closeBirthDateCalendar();
  }
  const mainDrop = document.getElementById('wiz-guest-drop');
  const mainWrap = document.getElementById('wiz-guest-search')?.closest('.guest-search-wrap');
  if (mainDrop && mainWrap && !mainWrap.contains(e.target)) mainDrop.classList.remove('open');
  document.querySelectorAll('.extra-guest-row').forEach(row => {
    const wrap = row.querySelector('.guest-search-wrap');
    const idx = row.dataset.extraIdx;
    const drop = document.getElementById(`extra-guest-drop-${idx}`);
    if (drop && wrap && !wrap.contains(e.target)) drop.classList.remove('open');
  });
});

function collectExtraGuests() {
  return Array.from(document.querySelectorAll('.extra-guest-row')).map(row => {
    const nomeCompleto = (row.querySelector('[data-field="nome_completo"]')?.value || '').trim();
    const parts        = nomeCompleto.split(' ');
    const tel_prefix   = row.querySelector('[data-field="tel_prefix"]')?.value  || '';
    const tel_num      = row.querySelector('[data-field="tel_num"]')?.value     || '';
    return {
      name:                     nomeCompleto,
      first_name:               parts[0] || '',
      last_name:                parts.slice(1).join(' '),
      email:                    row.querySelector('[data-field="email"]')?.value          || '',
      phone:                    tel_prefix + tel_num.replace(/\s/g, ''),
      nationality:              row.querySelector('[data-field="country"]')?.value        || '',
      country:                  row.querySelector('[data-field="country"]')?.value        || '',
      birth_date:               getBirthDateValue(row.querySelector('[data-field="birth_date"]')) || '',
      birth_city:               row.querySelector('[data-field="birth_city"]')?.value    || '',
      document_type:            row.querySelector('[data-field="doc_type"]')?.value      || '',
      document_number:          row.querySelector('[data-field="doc_number"]')?.value    || '',
      document_issuer_country:  row.querySelector('[data-field="doc_emissor"]')?.value   || '',
      nif:                      row.querySelector('[data-field="nif"]')?.value           || '',
    };
  }).filter(g => g.name || g.email);
}

// Total padrão do calendário dinâmico para as escolhas atuais (sem overrides,
// sem desconto) — a referência que nunca é usada para cobrar, só para comparar.
async function wizStandardTotal() {
  const alojId = document.getElementById('f-aloj')?.value;
  const suite = accommodations.find(a => a.id === alojId);
  const ci = normalizeIsoDateValue(document.getElementById('f-checkin')?.value);
  const co = normalizeIsoDateValue(document.getElementById('f-checkout')?.value);
  if (!suite || !ci || !co) return null;
  try {
    const periods = await loadWizPricingPeriods(alojId);
    const totals = window.ReservationPricing.calculateReservationTotal(suite, servicosData, {
      check_in: ci,
      check_out: co,
      num_guests: parseInt(document.getElementById('f-num-hospedes')?.value) || 1,
      breakfast_included: document.getElementById('f-breakfast')?.value === 'true',
      birth_dates: wizEffectiveBirthDates(),
      pricing_periods: periods,
    });
    return totals.totalAmount;
  } catch {
    return null;
  }
}

async function saveReserva() {
  const nomeCompleto = document.getElementById('f-nome-completo').value.trim();
  const nomeParts    = nomeCompleto.split(' ');
  const primeiroNome = nomeParts[0] || '';
  const apelido      = nomeParts.slice(1).join(' ');
  const email        = document.getElementById('f-email').value.trim();
  const telPrefix    = document.getElementById('f-tel-prefix')?.value || '';
  const telNum       = document.getElementById('f-tel-num')?.value.trim() || '';
  const tel          = telPrefix + telNum.replace(/\s/g, '');
  const pais         = document.getElementById('f-pais').value.trim();
  const checkin  = normalizeIsoDateValue(document.getElementById('f-checkin').value);
  const checkout = normalizeIsoDateValue(document.getElementById('f-checkout').value);
  const alojId   = document.getElementById('f-aloj').value;

  const birthDate = getBirthDateValue(document.getElementById('f-nascimento'));
  if (!nomeCompleto) { toast('Por favor insira o nome do hóspede.', 'error'); return; }
  if (!checkin || !checkout) { toast('Por favor selecione as datas.', 'error'); return; }
  if (checkin >= checkout) { toast('O check-out deve ser depois do check-in.', 'error'); return; }
  const selectedAccommodation = accommodations.find(a => a.id === alojId);
  const requestedGuests = parseInt(document.getElementById('f-num-hospedes').value) || 1;
  if (selectedAccommodation?.max_guests && requestedGuests > selectedAccommodation.max_guests) {
    toast(`Este alojamento permite no máximo ${selectedAccommodation.max_guests} hóspede${selectedAccommodation.max_guests !== 1 ? 's' : ''}.`, 'error');
    return;
  }

  // Confirmação quando os valores da estadia foram alterados face ao padrão
  // do calendário dinâmico (overrides por noite, total manual ou desconto).
  const hasValueEdits = _manualTotalOverride != null
    || Object.keys(_nightlyOverrides).length > 0
    || (parseFloat(document.getElementById('f-discount-val')?.value) || 0) > 0;
  if (hasValueEdits && typeof confirmPriceChange === 'function') {
    const standardTotal = await wizStandardTotal();
    const newTotal = parseFloat(document.getElementById('f-total')?.value);
    if (standardTotal != null && !isNaN(newTotal) && Math.abs(newTotal - standardTotal) > 0.005) {
      const ok = await confirmPriceChange({
        standardTotal,
        newTotal,
        editedAt: _editingPriceInfo?.price_edited_at || null,
        editedByName: _editingPriceInfo?.price_edited_by_name || null,
      });
      if (!ok) return;
    }
  }

  const nomeFull = nomeCompleto;
  const btn = document.getElementById('btn-guardar');
  AppUI.setButtonLoading(btn, true, 'A guardar...');

  try {
    const numAdultos = parseInt(document.getElementById('f-num-adultos')?.value) || 1;
    const numCriancas = parseInt(document.getElementById('f-num-criancas')?.value) || 0;

    const discountVal = parseFloat(document.getElementById('f-discount-val')?.value) || 0;
    const computedTotal = parseFloat(document.getElementById('f-total')?.value);
    // Enviar total_amount fixo quando há desconto ou total manual (ambos já refletidos
    // em f-total). Caso contrário, o servidor recalcula a partir de nightly_prices + extras.
    const forceTotal = (discountVal > 0 || _manualTotalOverride != null) && !isNaN(computedTotal);
    const manualTotalOverride = forceTotal ? computedTotal : undefined;
    const nightlyPricesPayload = Array.isArray(_nightlyPrices) ? _nightlyPrices : [];

    if (editingId) {
      const body = {
        check_in: checkin,
        check_out: checkout,
        num_adults: numAdultos,
        num_children: numCriancas,
        num_guests: numAdultos + numCriancas,
        breakfast_included: document.getElementById('f-breakfast')?.value === 'true',
        channel: document.getElementById('f-canal').value,
        status: document.getElementById('f-estado').value,
        payment_status: document.getElementById('f-payment-status').value,
        payment_method: document.getElementById('f-pagamento').value,
        amount_paid: parseFloat(document.getElementById('f-amount-paid')?.value) || 0,
        payment_date: normalizeIsoDateValue(document.getElementById('f-payment-date')?.value) || null,
        notes: document.getElementById('f-notas').value,
        guests_data: collectExtraGuests(),
        nightly_prices: nightlyPricesPayload,
        ...(manualTotalOverride !== undefined ? { total_amount: manualTotalOverride } : {}),
        guest: {
          name: nomeFull, first_name: primeiroNome, last_name: apelido,
          email, phone: tel, nationality: pais, country: pais,
          document_type:            document.getElementById('f-doc-tipo')?.value          || null,
          document_number:          document.getElementById('f-doc-num')?.value           || null,
          document_issuer_country:  document.getElementById('f-doc-emissor')?.value       || null,
          birth_date:               birthDate || null,
          birth_city:               document.getElementById('f-local-nascimento')?.value  || null,
          nif:                      document.getElementById('f-nif')?.value               || null,
          address:                  document.getElementById('f-morada')?.value            || null,
          postal_code:              document.getElementById('f-cp')?.value                || null,
          city:                     document.getElementById('f-cidade')?.value            || null,
        },
      };
      const res = await apiPut(`/api/reservations/${editingId}`, body);
      if (res.success) {
        toast('✅ Reserva atualizada!', 'success');
        closeModal();
        await loadReservas();
        if (typeof renderCalView === 'function') renderCalView();
        renderDashboard();
        if (typeof loadNotifications === 'function') loadNotifications();
      } else {
        toast('❌ ' + (res.error || 'Erro ao atualizar reserva.'), 'error');
      }
    } else {
      const body = {
        guest: {
          name: nomeFull, first_name: primeiroNome, last_name: apelido,
          email, phone: tel, nationality: pais, country: pais,
          document_type:            document.getElementById('f-doc-tipo')?.value          || null,
          document_number:          document.getElementById('f-doc-num')?.value           || null,
          document_issuer_country:  document.getElementById('f-doc-emissor')?.value       || null,
          birth_date:               birthDate || null,
          birth_city:               document.getElementById('f-local-nascimento')?.value  || null,
          nif:                      document.getElementById('f-nif')?.value               || null,
          address:                  document.getElementById('f-morada')?.value            || null,
          postal_code:              document.getElementById('f-cp')?.value                || null,
          city:                     document.getElementById('f-cidade')?.value            || null,
        },
        accommodation_id: alojId,
        check_in: checkin,
        check_out: checkout,
        num_adults: numAdultos,
        num_children: numCriancas,
        num_guests: numAdultos + numCriancas,
        breakfast_included: document.getElementById('f-breakfast')?.value === 'true',
        channel: document.getElementById('f-canal').value,
        status: document.getElementById('f-estado').value,
        payment_status: document.getElementById('f-payment-status').value,
        payment_method: document.getElementById('f-pagamento').value,
        amount_paid: parseFloat(document.getElementById('f-amount-paid')?.value) || 0,
        payment_date: normalizeIsoDateValue(document.getElementById('f-payment-date')?.value) || null,
        notes: document.getElementById('f-notas').value,
        voucher_code: document.getElementById('f-voucher-code')?.value.trim().toUpperCase() || null,
        rgpd_consent: true,
        guests_data: collectExtraGuests(),
        nightly_prices: nightlyPricesPayload,
        ...(manualTotalOverride !== undefined ? { total_amount: manualTotalOverride } : {}),
      };
      const res = await apiPost('/api/reservations', body);
      if (res.success) {
        toast('✅ Reserva criada com sucesso!', 'success');
        clearReservaDraft();
        closeModal();
        await loadReservas();
        if (typeof renderCalView === 'function') renderCalView();
        renderDashboard();
        if (typeof loadNotifications === 'function') loadNotifications();
      } else {
        toast('❌ ' + (res.error || 'Erro ao criar reserva.'), 'error');
      }
    }
  } catch (e) {
    toast('❌ ' + (e?.payload?.error || e?.message || 'Erro de ligação ao servidor.'), 'error');
  } finally {
    AppUI.setButtonLoading(btn, false);
  }
}

// Pré-validação do voucher no formulário de reserva manual (botão "Verificar").
// O código é sempre revalidado no backend ao submeter; isto é só feedback imediato.
async function verifyBackofficeVoucher() {
  const code = (document.getElementById('f-voucher-code')?.value || '').trim().toUpperCase();
  const statusEl = document.getElementById('f-voucher-status');
  if (!statusEl) return;

  statusEl.style.display = 'block';

  if (!code) {
    statusEl.style.background = '#f5f5f5';
    statusEl.style.color = '#888';
    statusEl.textContent = 'Introduza um código de voucher.';
    return;
  }

  statusEl.style.background = '#f5f5f5';
  statusEl.style.color = '#666';
  statusEl.textContent = 'A verificar...';
  try {
    const res = await apiGet(`/api/vouchers/validate?code=${encodeURIComponent(code)}`);
    const voucher = res.data;
    const disc = voucher.type === 'discount_pct'
      ? `${voucher.value}% de desconto`
      : `€${Number(voucher.value).toFixed(2)} de desconto`;
    statusEl.style.background = '#f0faf4';
    statusEl.style.color = '#2d6a4f';
    statusEl.textContent = `✓ ${voucher.description ? voucher.description + ' · ' : ''}${disc}`;
  } catch (err) {
    statusEl.style.background = '#fef0f0';
    statusEl.style.color = '#c0392b';
    statusEl.textContent = err?.payload?.error || 'Voucher inválido ou já utilizado';
  }
}
