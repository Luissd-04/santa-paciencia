// Estado privado; interface partilhada em AppModules.reservas.
(() => {
AppModules.define('reservas', {
  _cachedPricingPeriods: { get: () => _cachedPricingPeriods, set: value => { _cachedPricingPeriods = value; } },
  _editingPriceInfo: { get: () => _editingPriceInfo, set: value => { _editingPriceInfo = value; } },
  _lastExtrasTotal: { get: () => _lastExtrasTotal, set: value => { _lastExtrasTotal = value; } },
  _manualDistribWarned: { get: () => _manualDistribWarned, set: value => { _manualDistribWarned = value; } },
  _manualDistribWeights: { get: () => _manualDistribWeights, set: value => { _manualDistribWeights = value; } },
  _manualTotalOverride: { get: () => _manualTotalOverride, set: value => { _manualTotalOverride = value; } },
  _nightlyGridSig: { get: () => _nightlyGridSig, set: value => { _nightlyGridSig = value; } },
  _nightlyOverrides: { get: () => _nightlyOverrides, set: value => { _nightlyOverrides = value; } },
  _nightlyPrices: { get: () => _nightlyPrices, set: value => { _nightlyPrices = value; } },
  _resetGuestFields: { get: () => _resetGuestFields },
  _returnToDetailId: { get: () => _returnToDetailId, set: value => { _returnToDetailId = value; } },
  _standardNightlyByDate: { get: () => _standardNightlyByDate, set: value => { _standardNightlyByDate = value; } },
  _wizardPageMode: { get: () => _wizardPageMode, set: value => { _wizardPageMode = value; } },
  _wizExtraRooms: { get: () => _wizExtraRooms, set: value => { _wizExtraRooms = value; } },
  _wizHadMultiSuiteOnLoad: { get: () => _wizHadMultiSuiteOnLoad, set: value => { _wizHadMultiSuiteOnLoad = value; } },
  _wizMultiSuite: { get: () => _wizMultiSuite, set: value => { _wizMultiSuite = value; } },
  addDaysToIsoDate: { get: () => addDaysToIsoDate },
  buildCountrySelects: { get: () => buildCountrySelects },
  DIAL_COUNTRIES: { get: () => DIAL_COUNTRIES },
  enhanceReservationSelects: { get: () => enhanceReservationSelects },
  invalidateWizPricingCache: { get: () => invalidateWizPricingCache },
  loadWizPricingPeriods: { get: () => loadWizPricingPeriods },
  nightlyOverrideArray: { get: () => nightlyOverrideArray },
  onAmountPaidChange: { get: () => onAmountPaidChange },
  onPaymentStatusChange: { get: () => onPaymentStatusChange },
  preloadAllPricingPeriods: { get: () => preloadAllPricingPeriods },
  updateForeignRequirements: { get: () => updateForeignRequirements },
  updateNumHospedes: { get: () => updateNumHospedes },
  wizStep: { get: () => wizStep, set: value => { wizStep = value; } },
});

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
    `<option value="${c.dial}" data-code="${c.code}" data-flag="${c.code.toLowerCase()}">${c.dial}</option>`
  ).join('');
  const countryOpts = '<option value="">— País —</option>' +
    DIAL_COUNTRIES.map(c => `<option value="${c.name}" data-flag="${c.code.toLowerCase()}">${c.name}</option>`).join('');

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
   'f-doc-num','f-local-nascimento','f-nascimento','f-nif','f-empresa','f-morada','f-cp','f-cidade','f-notas'].forEach(id => {
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
let _lastExtrasTotal = 0;        // extras (taxa turística, PA, ocupação extra) do último calcTotal
let _manualDistribWeights = null; // pesos por noite fixados ao focar o campo de total manual
let _manualDistribWarned = false; // evita repetir o aviso "total < extras" a cada tecla
let _wizMultiSuite = false;      // reserva em edição tem >1 suites (grelha só mostra a principal)
let _wizExtraRooms = [];         // quartos extra escolhidos no wizard: [{accommodation_id, name, price_per_night, subtotal}]
let _wizHadMultiSuiteOnLoad = false; // reserva já era multi-suite ao abrir para edição (para poder limpar quartos extra)
let _standardNightlyByDate = {}; // preço padrão por noite (calendário dinâmico, sem overrides)
let _editingPriceInfo = null;    // { price_edited_at, price_edited_by_name } da reserva em edição
let _wizardPageMode = false;     // "Editar reserva" aberto como página completa (a partir do detalhe)
let _returnToDetailId = null;    // reserva cujo detalhe deve ser refrescado ao guardar em modo página

async function loadWizPricingPeriods(alojId) {
  if (!alojId) return [];
  if (_cachedPricingPeriods[alojId]) return _cachedPricingPeriods[alojId];
  try {
    const res = await AppModules.core.apiGet(`/api/accommodations/${alojId}/pricing-periods`);
    _cachedPricingPeriods[alojId] = res.data || [];
    return _cachedPricingPeriods[alojId];
  } catch {
    return [];
  }
}

// Pré-carrega os períodos de preço de todos os alojamentos, para os cartões
// mostrarem o preço dinâmico correto. Re-renderiza os cartões quando termina.
async function preloadAllPricingPeriods() {
  const pending = AppModules.core.accommodations
    .map(a => a.id)
    .filter(id => id && !_cachedPricingPeriods[id]);
  if (!pending.length) return;
  await Promise.all(pending.map(id => loadWizPricingPeriods(id)));
  AppModules.reservas.renderSuiteCards();
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
  AppModules.reservas.renderWizChildAges();
}


// Limpeza da funcionalidade ao sair ou trocar de organização.
AppModules.onReset('reserva-wizard.js', () => {
  _cachedPricingPeriods = {};
  _nightlyOverrides = {};
  _nightlyPrices = [];
  _manualTotalOverride = null;
  _manualDistribWeights = null;
  _wizExtraRooms = [];
  _standardNightlyByDate = {};
  _editingPriceInfo = null;
  _returnToDetailId = null;
});

})();
