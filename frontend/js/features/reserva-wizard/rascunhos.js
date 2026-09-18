const RESERVA_DRAFT_KEY = 'sp_reserva_draft_v2';
try { localStorage.removeItem('sp_reserva_draft_v1'); } catch {}
function reservaDraftKey() { return `${RESERVA_DRAFT_KEY}:${currentUser?.id || ''}:${currentUser?.organization_id || ''}`; }
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
  if (_suppressDraftSave || editingId || !currentUser) return;
  try {
    sessionStorage.setItem(reservaDraftKey(), JSON.stringify(serializeReservaForm()));
  } catch {}
}

function scheduleReservaDraftSave() {
  if (_suppressDraftSave || editingId || !currentUser) return;
  clearTimeout(_draftSaveTimer);
  _draftSaveTimer = setTimeout(saveReservaDraft, 400);
}

function clearReservaDraft() {
  clearTimeout(_draftSaveTimer);
  try { sessionStorage.removeItem(reservaDraftKey()); } catch {}
  const notice = document.getElementById('resf-draft-notice');
  if (notice) notice.style.display = 'none';
}

function loadReservaDraft() {
  try {
    const raw = sessionStorage.getItem(reservaDraftKey());
    if (!raw) return null;
    const draft = JSON.parse(raw);
    return draft && draft.fields && Date.now() - draft.savedAt < 4 * 60 * 60 * 1000 ? draft : null;
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

