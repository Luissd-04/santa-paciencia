// Estado privado; interface partilhada em AppModules.core.
(() => {
AppModules.define('core', {
  _exportColsSelectAll: { get: () => _exportColsSelectAll },
  buildExportRowsXlsx: { get: () => buildExportRowsXlsx },
  buildExportTablePdf: { get: () => buildExportTablePdf },
  closeExportColumnPicker: { get: () => closeExportColumnPicker },
  confirmExportColumnPicker: { get: () => confirmExportColumnPicker },
  drawPdfBrandHeader: { get: () => drawPdfBrandHeader },
  openExportColumnPicker: { get: () => openExportColumnPicker },
});

/* ═══════════════════════════════════════════════════════════════
   SANTA PACIÊNCIA — seleção de colunas para exports (XLS/PDF)
   Um único picker partilhado (modal #export-cols-modal-bg em index.html)
   entre hóspedes/despesas/alojamentos. Cada entidade define um catálogo
   de colunas; a seleção do utilizador fica guardada em localStorage e é
   reaplicada em exports seguintes sem precisar reabrir o picker.

   Uso:
     const HOSPEDES_EXPORT_COLUMNS = [
       { key: 'name', label: 'Nome', default: true, get: g => g.name || '' },
       ...
     ];
     openExportColumnPicker('hospedes', 'Hóspedes', HOSPEDES_EXPORT_COLUMNS,
       selectedKeys => doExport(selectedKeys));
═══════════════════════════════════════════════════════════════ */

function _exportColsStorageKey(entityId) {
  return 'sp:exportcols:' + entityId;
}

function getExportColumnSelection(entityId, columns) {
  const allKeys = columns.map(c => c.key);
  try {
    const saved = JSON.parse(localStorage.getItem(_exportColsStorageKey(entityId)) || 'null');
    if (Array.isArray(saved)) return saved.filter(k => allKeys.includes(k));
  } catch (_) {}
  return columns.filter(c => c.default !== false).map(c => c.key);
}

function _saveExportColumnSelection(entityId, keys) {
  try { localStorage.setItem(_exportColsStorageKey(entityId), JSON.stringify(keys)); } catch (_) {}
}

let _exportColsPickerState = null;

function openExportColumnPicker(entityId, title, columns, onConfirm) {
  const bg = document.getElementById('export-cols-modal-bg');
  const body = document.getElementById('export-cols-modal-body');
  const titleEl = document.getElementById('export-cols-modal-title');
  if (!bg || !body || !titleEl) { onConfirm(columns.map(c => c.key)); return; }

  const selected = new Set(getExportColumnSelection(entityId, columns));
  _exportColsPickerState = { entityId, columns, onConfirm };

  titleEl.textContent = `Colunas a exportar — ${title}`;
  body.innerHTML = columns.map(c => `
    <label class="export-col-item">
      <input type="checkbox" value="${c.key}" ${selected.has(c.key) ? 'checked' : ''}>
      <span>${c.label}</span>
    </label>`).join('');

  AppUI.openModal(bg);
}

function closeExportColumnPicker() {
  const bg = document.getElementById('export-cols-modal-bg');
  if (bg) AppUI.closeModal(bg);
  _exportColsPickerState = null;
}

function confirmExportColumnPicker() {
  if (!_exportColsPickerState) return;
  const { entityId, onConfirm } = _exportColsPickerState;
  const body = document.getElementById('export-cols-modal-body');
  const keys = Array.from(body.querySelectorAll('input[type="checkbox"]:checked')).map(el => el.value);
  if (!keys.length) { AppModules.core.toast('Seleciona pelo menos uma coluna.', 'error'); return; }
  _saveExportColumnSelection(entityId, keys);
  closeExportColumnPicker();
  onConfirm(keys);
}

function _exportColsSelectAll(checked) {
  const body = document.getElementById('export-cols-modal-body');
  if (!body) return;
  body.querySelectorAll('input[type="checkbox"]').forEach(el => { el.checked = checked; });
}

// Constrói as linhas para XLSX.utils.json_to_sheet(...) — respeita a ordem
// do catálogo (não a ordem em que o utilizador marcou as checkboxes).
function buildExportRowsXlsx(rows, columns, selectedKeys) {
  const cols = columns.filter(c => selectedKeys.includes(c.key));
  return rows.map(row => {
    const out = {};
    cols.forEach(c => { out[c.label] = c.get(row); });
    return out;
  });
}

// Constrói { head, body } para doc.autoTable(...).
function buildExportTablePdf(rows, columns, selectedKeys) {
  const cols = columns.filter(c => selectedKeys.includes(c.key));
  return {
    head: [cols.map(c => c.label)],
    body: rows.map(row => cols.map(c => c.get(row) || '—')),
  };
}

// ── Logótipo da organização nos PDFs exportados (mesmo logótipo dos emails) ──
// Cache em memória (undefined = ainda não pedido) — evita um pedido de rede
// por cada export enquanto a página não recarrega.
let _orgLogoDataUrlCache;

async function getOrgLogoDataUrl() {
  if (_orgLogoDataUrlCache !== undefined) return _orgLogoDataUrlCache;
  try {
    const res = await AppModules.core.apiGet('/api/email-templates');
    const url = res?.settings?.logo_url || null;
    _orgLogoDataUrlCache = url ? await AppModules.core.imageUrlToDataUrl(url) : null;
  } catch (_) {
    _orgLogoDataUrlCache = null;
  }
  return _orgLogoDataUrlCache;
}

// Desenha o cabeçalho de marca (logótipo se configurado, senão só o título em
// texto) no topo de um PDF gerado com jsPDF. Devolve o Y onde o conteúdo deve
// começar a seguir.
async function drawPdfBrandHeader(doc, title) {
  const logo = await getOrgLogoDataUrl();
  if (logo) {
    try {
      const type = logo.match(/^data:image\/(\w+);/)?.[1]?.toUpperCase() || 'PNG';
      const props = doc.getImageProperties(logo);
      const h = 14;
      const w = props.width && props.height ? (props.width / props.height) * h : h * 3;
      doc.addImage(logo, type, 14, 10, w, h, undefined, 'FAST');
    } catch (_) {
      doc.setFontSize(16);
      doc.text(title, 14, 18);
    }
  } else {
    doc.setFontSize(16);
    doc.text(title, 14, 18);
  }
  doc.setFontSize(10);
  doc.text(`Exportado em ${new Date().toLocaleDateString('pt-PT')}`, 14, 30);
  return 36;
}

// Limpeza da funcionalidade ao sair ou trocar de organização.
AppModules.onReset('domain/export-columns.js', () => {
  _exportColsPickerState = null;
  _orgLogoDataUrlCache = undefined;
});

})();
