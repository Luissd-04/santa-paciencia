// Estado privado; interface partilhada em AppModules.core.
// Alterações por guardar na edição de reservas (decisão de 03/11/2026): ficam
// num rascunho por reserva, neste aparelho, para o mesmo utilizador e a mesma
// organização. Sobrevivem à sessão expirada e a fechar a app; o logout e a
// troca de organização apagam-nas (auth.js). Ao voltar, uma faixa no topo diz
// que reservas têm alterações por guardar.
(() => {
AppModules.define('core', {
  listEditDrafts: { get: () => listEditDrafts },
  loadEditDraft: { get: () => loadEditDraft },
  saveEditDraft: { get: () => saveEditDraft },
  clearEditDraft: { get: () => clearEditDraft },
  clearUserEditDrafts: { get: () => clearUserEditDrafts },
  EDIT_DRAFTS_PREFIX: { get: () => PREFIX },
  renderEditDraftsBanner: { get: () => renderEditDraftsBanner },
});

const PREFIX = 'sp_reserva_edit_drafts_v1:';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const key = () => `${PREFIX}${AppModules.core.currentUser?.id || ''}:${AppModules.core.currentUser?.organization_id || ''}`;

function readAll() {
  if (!AppModules.core.currentUser) return {};
  try {
    const all = JSON.parse(localStorage.getItem(key()) || '{}');
    return Object.fromEntries(Object.entries(all).filter(([, d]) => d?.form && Date.now() - d.savedAt < MAX_AGE_MS));
  } catch { return {}; }
}
function writeAll(all) {
  try {
    if (Object.keys(all).length) localStorage.setItem(key(), JSON.stringify(all));
    else localStorage.removeItem(key());
  } catch {}
  renderEditDraftsBanner();
}

// { id, savedAt, label: { guest, checkIn, checkOut }, form } mais recente primeiro.
function listEditDrafts() {
  return Object.entries(readAll()).map(([id, d]) => ({ id, ...d })).sort((a, b) => b.savedAt - a.savedAt);
}
function loadEditDraft(id) { return readAll()[id] || null; }
function saveEditDraft(id, { label, form }) {
  if (!id || !AppModules.core.currentUser) return;
  const all = readAll();
  all[id] = { savedAt: Date.now(), label, form };
  writeAll(all);
}
function clearEditDraft(id) {
  const all = readAll();
  if (!(id in all)) return;
  delete all[id];
  writeAll(all);
}

// Todas as do utilizador nesta organização (troca de organização).
function clearUserEditDrafts() {
  try { localStorage.removeItem(key()); } catch {}
}

// Faixa no topo do conteúdo: uma linha por reserva, com «Continuar».
function renderEditDraftsBanner() {
  const banner = document.getElementById('edit-drafts-banner');
  if (!banner) return;
  const drafts = AppModules.core.currentUser ? listEditDrafts() : [];
  banner.hidden = !drafts.length;
  if (!drafts.length) { banner.innerHTML = ''; return; }
  const esc = AppModules.core.escapeHtml;
  const range = d => [d.label?.checkIn, d.label?.checkOut].every(Boolean)
    ? ` · ${esc(window.ReservationDates.formatShortPtDate(d.label.checkIn))} → ${esc(window.ReservationDates.formatShortPtDate(d.label.checkOut))}` : '';
  banner.innerHTML = `
    <div class="edit-drafts-title">${AppModules.core.lcIcon('history', 16)}
      <strong>${drafts.length === 1 ? 'Há uma reserva com alterações por guardar' : `Há ${drafts.length} reservas com alterações por guardar`}</strong></div>
    <ul class="edit-drafts-list">${drafts.map(d => `
      <li><span>${esc(d.label?.guest || d.id)}${range(d)} <small>· ${esc(window.ReservationDates.formatDateTime(new Date(d.savedAt), 'compact'))}</small></span>
        <button type="button" class="btn btn-primary btn-xs" ${AppActions.attrs('click', 'edit-drafts-continue', [d.id])}>Continuar</button></li>`).join('')}
    </ul>`;
  if (window.lucide) lucide.createIcons();
}

AppActions.register({
  'edit-drafts-continue': async (el, event, args) => {
    if (await AppModules.core.ensureFeature('reservas')) AppModules.reservas.openEditPage(args[0]);
  },
}, 'click');

})();
