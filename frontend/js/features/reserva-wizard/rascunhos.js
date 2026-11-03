// Estado privado; interface partilhada em AppModules.reservas.
(() => {
AppModules.define('reservas', {
  _suppressDraftSave: { get: () => _suppressDraftSave, set: value => { _suppressDraftSave = value; } },
  applyReservaDraft: { get: () => applyReservaDraft },
  clearReservaDraft: { get: () => clearReservaDraft },
  flushReservaDraft: { get: () => flushReservaDraft },
  discardReservaDraft: { get: () => discardReservaDraft },
  loadReservaDraft: { get: () => loadReservaDraft },
  restoreEditDraft: { get: () => restoreEditDraft },
  captureReservaEditBaseline: { get: () => captureReservaEditBaseline },
  requestCloseReservaModal: { get: () => requestCloseReservaModal },
  reservaModalIsOpen: { get: () => reservaModalIsOpen },
});

const RESERVA_DRAFT_KEY = 'sp_reserva_draft_v2';
try { localStorage.removeItem('sp_reserva_draft_v1'); } catch {}
function reservaDraftKey() { return `${RESERVA_DRAFT_KEY}:${AppModules.core.currentUser?.id || ''}:${AppModules.core.currentUser?.organization_id || ''}`; }
let _draftSaveTimer = null;
let _suppressDraftSave = false;
let editBaseline = '';
// Campos que a app calcula (noites, total, total devolvido pelo servidor): a
// cotação chega depois de abrir e não é uma alteração. Um total escrito à mão
// fica em _manualTotalOverride ou nos preços por noite, que contam.
const DERIVED_FIELDS = new Set(['f-noites', 'f-total', 'f-total-manual', 'resf-breakfast-switch']);
function editSnapshot() {
  const fields = Array.from(document.querySelectorAll('#modal-bg input, #modal-bg select, #modal-bg textarea'))
    .filter(el => !el.closest('.app-select-search') && !el.classList.contains('app-select-search') && !DERIVED_FIELDS.has(el.id))
    .map(el => [el.id || el.name || el.dataset.field || '', el.value, el.type === 'checkbox' ? el.checked : null]);
  return JSON.stringify({ fields, rooms: AppModules.reservas._wizExtraRooms, nightly: AppModules.reservas._nightlyOverrides, total: AppModules.reservas._manualTotalOverride });
}
function captureReservaEditBaseline() { editBaseline = editSnapshot(); }
function editIsDirty() { return Boolean(AppModules.core.editingId && editBaseline && editBaseline !== editSnapshot()); }
window.addEventListener('beforeunload', event => {
  if (!reservaModalIsOpen() || !editIsDirty()) return;
  event.preventDefault(); event.returnValue = '';
});

function reservaModalIsOpen() {
  return document.getElementById('modal-bg')?.classList.contains('open');
}

// Campos de topo cujo valor guardamos/restauramos no rascunho.
const RESERVA_DRAFT_FIELDS = [
  'f-checkin', 'f-checkout', 'f-num-adultos', 'f-num-criancas', 'f-breakfast',
  'f-canal', 'f-aloj', 'f-nome-completo', 'f-email', 'f-tel-prefix', 'f-tel-num',
  'f-pais', 'f-doc-tipo', 'f-doc-num', 'f-doc-emissor', 'f-nascimento',
  'f-local-nascimento', 'f-nif', 'f-cidade', 'f-notas',
  'f-estado',
  'f-discount-type', 'f-discount-val', 'f-total', 'f-noites',
];

// True se o formulário tiver dados que valha a pena preservar/confirmar antes de fechar.
function reservaFormHasData() {
  const val = id => (document.getElementById(id)?.value || '').trim();
  if (val('f-nome-completo') || val('f-email') || val('f-tel-num') ||
      val('f-notas') || val('f-aloj') || val('f-discount-val') ||
      val('f-doc-num') || val('f-nif') || val('f-cidade')) {
    return true;
  }
  const extras = AppModules.reservas.collectExtraGuests();
  return extras.length > 0;
}

function requestCloseReservaModal() {
  if (AppModules.core.editingId) {
    if (editIsDirty() && !window.confirm('Descartar as alterações desta reserva?\n\nAs alterações ainda não foram guardadas.')) return false;
    // Uma gravação automática ainda pendente voltaria a criar o rascunho.
    clearTimeout(_draftSaveTimer);
    AppModules.core.clearEditDraft(AppModules.core.editingId);
    AppModules.reservas.closeModal();
    return true;
  }
  if (reservaFormHasData()) {
    saveReservaDraft(); // garante que o estado atual fica guardado
    const ok = window.confirm('Fechar e guardar como rascunho?\n\nOs dados ficam guardados e podes continuar da próxima vez que abrires "Nova Reserva".');
    if (!ok) return;
  } else {
    // Formulário vazio: nada a preservar.
    clearReservaDraft();
  }
  AppModules.reservas.closeModal();
}
// Hook global para o handler de Escape partilhado (ui.js).


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
    extraGuests: AppModules.reservas.collectExtraGuests(),
    nightlyOverrides: AppModules.reservas._nightlyOverrides,
    manualTotal: AppModules.reservas._manualTotalOverride,
    extraRooms: AppModules.reservas._wizExtraRooms,
  };
}

// Edição: o rascunho é o formulário inteiro enquanto houver alterações por
// guardar (core/edit-drafts.js); sem alterações, deixa de existir.
function saveEditDraftNow() {
  const id = AppModules.core.editingId;
  if (_suppressDraftSave || !id || !AppModules.core.currentUser || !reservaModalIsOpen()) return;
  if (!editIsDirty()) { AppModules.core.clearEditDraft(id); return; }
  const value = fieldId => document.getElementById(fieldId)?.value || '';
  AppModules.core.saveEditDraft(id, {
    label: { guest: value('f-nome-completo'), checkIn: window.ReservationDates.normalizeIsoDate(value('f-checkin')), checkOut: window.ReservationDates.normalizeIsoDate(value('f-checkout')) },
    form: serializeReservaForm(),
  });
}

function saveReservaDraft() {
  if (_suppressDraftSave || AppModules.core.editingId || !AppModules.core.currentUser) return;
  try {
    sessionStorage.setItem(reservaDraftKey(), JSON.stringify(serializeReservaForm()));
  } catch {}
}

function scheduleReservaDraftSave() {
  if (_suppressDraftSave || !AppModules.core.currentUser) return;
  clearTimeout(_draftSaveTimer);
  _draftSaveTimer = setTimeout(AppModules.core.editingId ? saveEditDraftNow : saveReservaDraft, 400);
}

// Grava já o que estiver por gravar (ao guardar a reserva): se a sessão
// expirar nesse pedido, a limpeza cancela o temporizador e o rascunho tem de
// ter tudo o que foi escrito até ao clique.
function flushReservaDraft() {
  clearTimeout(_draftSaveTimer);
  if (AppModules.core.editingId) saveEditDraftNow();
  else saveReservaDraft();
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
      // As opções do estado chegam com a cotação; até lá fica o valor do rascunho.
      if (id === 'f-estado') window.ReservationStatus.fillSelect(el, [value], value);
      else if (el) el.value = value;
    });
    AppModules.reservas.updateNumHospedes();
    if (draft.discountType) AppModules.reservas.setFormDiscountType(draft.discountType);
    const discVal = document.getElementById('f-discount-val');
    if (discVal && draft.fields?.['f-discount-val']) {
      discVal.value = draft.fields['f-discount-val'];
      const wrap = document.getElementById('resf-discount-wrap');
      if (wrap) wrap.style.display = '';
    }

    // Preço por noite / total manual guardados no rascunho.
    AppModules.reservas._nightlyOverrides = draft.nightlyOverrides && typeof draft.nightlyOverrides === 'object' ? { ...draft.nightlyOverrides } : {};
    AppModules.reservas._manualTotalOverride = (draft.manualTotal == null || isNaN(Number(draft.manualTotal))) ? null : Number(draft.manualTotal);
    AppModules.reservas._nightlyGridSig = '';
    if (Array.isArray(draft.extraRooms)) AppModules.reservas._wizExtraRooms = draft.extraRooms.map(room => ({ ...room }));

    AppModules.reservas.renderExtraGuests();
    (draft.extraGuests || []).forEach((g, idx) => {
      const rows = document.querySelectorAll('.extra-guest-row');
      const row = rows[idx];
      if (!row) return;
      const setVal = (field, v) => { const el = row.querySelector(`[data-field="${field}"]`); if (el) el.value = v || ''; };
      row.dataset.guestId = g.id || '';
      setVal('nome_completo', [g.first_name, g.last_name].filter(Boolean).join(' ') || g.name || '');
      setVal('email', g.email);
      const rawP = g.phone || '';
      const mc = AppModules.reservas.DIAL_COUNTRIES.find(c => rawP.startsWith(c.dial));
      setVal('tel_prefix', mc ? mc.dial : '+351');
      setVal('tel_num', mc ? rawP.slice(mc.dial.length).trim() : rawP);
      setVal('country', g.country || g.nationality);
      setVal('birth_date', AppModules.reservas.formatDateForBirthInput(g.birth_date));
      setVal('birth_city', g.birth_city);
      setVal('doc_type', g.document_type);
      setVal('doc_number', g.document_number);
      setVal('doc_emissor', g.document_issuer_country);
      setVal('nif', g.nif);
    });

    const notice = document.getElementById('resf-draft-notice');
    if (notice) {
      // Texto da nova reserva; a edição troca-o em restoreEditDraft.
      const text = notice.querySelector('span');
      if (text) { text.dataset.defaultText ??= text.textContent; text.textContent = text.dataset.defaultText; }
      notice.style.display = '';
    }
  } finally {
    _suppressDraftSave = false;
  }
}

// Depois de a edição abrir com os dados do servidor (e a linha de base
// captada): aplica as alterações por guardar, se as houver.
async function restoreEditDraft(id) {
  const draft = AppModules.core.loadEditDraft(id);
  if (!draft) return false;
  applyReservaDraft(draft.form);
  const notice = document.getElementById('resf-draft-notice');
  const text = notice?.querySelector('span');
  if (text) text.textContent = `Alterações por guardar recuperadas (${window.ReservationDates.formatDateTime(new Date(draft.savedAt), 'compact')}). Reveja e carregue em «Atualizar Reserva».`;
  await AppModules.reservas.calcTotal();
  AppModules.reservas.renderSuiteCards();
  AppModules.reservas.updateWizSummary();
  return true;
}

function discardReservaDraft() {
  const editingId = AppModules.core.editingId;
  if (editingId) {
    // Volta à reserva como está no servidor.
    clearTimeout(_draftSaveTimer);
    AppModules.core.clearEditDraft(editingId);
    AppModules.reservas.closeModal();
    const reopen = AppModules.reservas._wizardPageMode ? AppModules.reservas.openEditPage : AppModules.reservas.openEditModal;
    return reopen(editingId);
  }
  clearReservaDraft();
  _suppressDraftSave = true;
  try {
    AppModules.reservas.openModal(); // reabre limpo (openModal repõe defaults e não encontra rascunho)
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


// Limpeza da funcionalidade ao sair, trocar de organização ou perder a sessão.
// O rascunho não é apagado aqui: com a sessão expirada, o utilizador volta a
// entrar e continua a reserva (a chave inclui utilizador e organização).
// Logout e troca de organização apagam-no explicitamente (auth.js).
AppModules.onReset('features/reserva-wizard/rascunhos.js', () => {
  clearTimeout(_draftSaveTimer); clearInterval(_draftSaveTimer); _draftSaveTimer = null;
});

})();
