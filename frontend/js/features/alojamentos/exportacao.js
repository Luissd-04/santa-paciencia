async function importAlojamentosXLS(input) {
  if (typeof XLSX === 'undefined') { toast('❌ Biblioteca XLSX não carregada.', 'error'); return; }
  const file = input.files[0];
  if (!file) return;
  input.value = '';
  showOperationProgress('A importar alojamentos', 'A ler ficheiro...', 8);

  const reader = new FileReader();
  reader.onload = async e => {
    try {
      updateOperationProgress(20, 'A interpretar Excel...');
      const wb   = XLSX.read(e.target.result, { type: 'array' });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      if (!rows.length) { toast('⚠️ Ficheiro vazio.', 'error'); hideOperationProgress(); return; }

      const pick = (row, ...keys) => { for (const k of keys) if (row[k] !== undefined && row[k] !== '') return String(row[k]); return ''; };

      let created = 0, skipped = 0;
      for (const [idx, row] of rows.entries()) {
        const nome = pick(row, 'Nome', 'name', 'Name');
        if (!nome) { skipped++; continue; }
        try {
          await apiPost('/api/accommodations', {
            name:          nome,
            type:          pick(row, 'Tipo', 'type') || 'suite',
            price_per_night: parseFloat(pick(row, 'Preço/noite', 'price_per_night')) || 100,
            max_guests:    parseInt(pick(row, 'Capacidade', 'max_guests')) || 2,
            license_number:pick(row, 'Licença', 'license_number') || '00000/AL',
            address:       pick(row, 'Morada', 'address'),
            city:          pick(row, 'Cidade', 'city'),
            region:        pick(row, 'Região', 'region'),
            country:       pick(row, 'País', 'country') || 'Portugal',
            checkin_time:  pick(row, 'Check-in', 'checkin_time') || '15:00',
            checkout_time: pick(row, 'Check-out', 'checkout_time') || '11:00',
          });
          created++;
        } catch { skipped++; }
        updateOperationProgress(25 + ((idx + 1) / rows.length) * 65, `A importar ${idx + 1}/${rows.length} alojamentos...`);
      }
      updateOperationProgress(95, 'A atualizar lista...');
      toast(`✅ ${created} alojamentos importados${skipped ? `, ${skipped} ignorados` : ''}.`, 'success');
      await loadAccommodations();
      updateOperationProgress(100, 'Concluído.');
    } catch (err) {
      toast('❌ Erro ao ler ficheiro: ' + err.message, 'error');
    } finally {
      hideOperationProgress();
    }
  };
  reader.readAsArrayBuffer(file);
}

function absoluteAssetUrl(url) {
  if (!url) return '';
  try { return new URL(url, window.location.origin).href; } catch { return String(url); }
}

function getAlojamentoImageUrls(a) {
  const urls = [];
  const add = url => {
    const abs = absoluteAssetUrl(url);
    if (abs && !urls.includes(abs)) urls.push(abs);
  };
  add(a.cover_image);
  Object.values(a.own_images || a.images || {}).forEach(list => {
    if (Array.isArray(list)) list.forEach(add);
  });
  (a.common_area_images || []).forEach(add);
  return urls;
}

function getAlojamentoCoverUrl(a) {
  return absoluteAssetUrl(a.cover_image) || getAlojamentoImageUrls(a)[0] || '';
}

function hexToRgb(hex, fallback = [132, 52, 36]) {
  const clean = String(hex || '').replace('#', '').trim();
  if (!/^[0-9a-f]{6}$/i.test(clean)) return fallback;
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

const ALOJAMENTOS_EXPORT_COLUMNS = [
  { key: 'name',            label: 'Nome',               default: true, get: a => a.name },
  { key: 'type',             label: 'Tipo',                default: true, get: a => a.type || '' },
  { key: 'color',            label: 'Cor',                 default: true, get: a => a.color || '' },
  { key: 'cover_image',      label: 'Imagem capa',         default: true, get: a => getAlojamentoCoverUrl(a) },
  { key: 'images',           label: 'Imagens',             default: true, get: a => getAlojamentoImageUrls(a).join('\n') },
  { key: 'price_per_night',  label: 'Preço/noite',         default: true, get: a => String(a.price_per_night || 0) },
  { key: 'max_guests',       label: 'Capacidade',          default: true, get: a => String(a.max_guests || '') },
  { key: 'base_guests_included', label: 'Hóspedes incluídos', default: true, get: a => String(a.base_guests_included || Math.min(a.max_guests || 2, 2)) },
  { key: 'baby_age_limit',   label: 'Bebé até (incl.)',    default: true, get: a => String(a.baby_age_limit ?? 2) },
  { key: 'baby_price',       label: 'Preço bebé',          default: true, get: a => String(a.baby_price ?? 0) },
  { key: 'child_age_limit',  label: 'Crianças abaixo de',  default: true, get: a => String(a.child_age_limit ?? 12) },
  { key: 'child_price',      label: 'Preço criança',       default: true, get: a => String(a.child_price ?? 0) },
  { key: 'extra_occupancy',  label: 'Ocupação adicional',  default: true, get: a => normalizeExtraOccupancyOptions(a).length ? 'Sim' : 'Não' },
  { key: 'extras',           label: 'Extras',              default: true, get: a => normalizeExtraOccupancyOptions(a).map(extra => `${extra.type === 'outro' ? (extra.custom_name || 'Outro') : extra.type} (${extra.capacity} hósp., €${extra.price})`).join('; ') },
  { key: 'num_rooms',        label: 'Quartos',             default: true, get: a => String(a.num_rooms || '') },
  { key: 'num_bathrooms',    label: 'Casas de banho',      default: true, get: a => String(a.num_bathrooms || '') },
  { key: 'area',             label: 'Área (m²)',           default: true, get: a => String(a.area || '') },
  { key: 'license_number',   label: 'Licença',             default: true, get: a => a.license_number || '' },
  { key: 'address',          label: 'Morada',              default: true, get: a => a.address || '' },
  { key: 'city',             label: 'Cidade',              default: true, get: a => a.city || '' },
  { key: 'region',           label: 'Região',              default: true, get: a => a.region || '' },
  { key: 'country',          label: 'País',                default: true, get: a => a.country || '' },
  { key: 'checkin_time',     label: 'Check-in',            default: true, get: a => a.checkin_time || '' },
  { key: 'checkout_time',    label: 'Check-out',           default: true, get: a => a.checkout_time || '' },
  { key: 'wifi_name',        label: 'Wi-Fi',               default: true, get: a => a.wifi_name || '' },
  { key: 'airbnb_ical_url',  label: 'Airbnb iCal',         default: true, get: a => a.airbnb_ical_url || '' },
  { key: 'booking_ical_url', label: 'Booking iCal',        default: true, get: a => a.booking_ical_url || '' },
];

function exportAlojamentosXLS() {
  if (typeof XLSX === 'undefined') { toast('❌ Biblioteca XLSX não carregada.', 'error'); return; }
  openExportColumnPicker('alojamentos', 'Alojamentos', ALOJAMENTOS_EXPORT_COLUMNS, selectedKeys => _doExportAlojamentosXLS(selectedKeys));
}

function _doExportAlojamentosXLS(selectedKeys) {
  showOperationProgress('A exportar alojamentos XLS', 'A preparar dados...', 15);
  const cols = ALOJAMENTOS_EXPORT_COLUMNS.filter(c => selectedKeys.includes(c.key));
  const rows = buildExportRowsXlsx(accommodations, ALOJAMENTOS_EXPORT_COLUMNS, selectedKeys);
  updateOperationProgress(55, 'A gerar Excel...');
  const ws = XLSX.utils.json_to_sheet(rows);
  const range = XLSX.utils.decode_range(ws['!ref']);
  // Colunas com hiperligação (capa/galeria) — a posição depende de quais
  // colunas foram selecionadas, por isso calcula-se aqui em vez de fixa D/E.
  const linkColLetters = cols
    .map((c, i) => (c.key === 'cover_image' || c.key === 'images') ? XLSX.utils.encode_col(i) : null)
    .filter(Boolean);
  if (linkColLetters.length) {
    for (let r = 1; r <= range.e.r; r++) {
      linkColLetters.forEach(col => {
        const cell = ws[`${col}${r + 1}`];
        if (cell?.v) cell.l = { Target: String(cell.v).split('\n')[0], Tooltip: 'Abrir imagem' };
      });
    }
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Alojamentos');
  updateOperationProgress(90, 'A iniciar download...');
  XLSX.writeFile(wb, `alojamentos_${new Date().toISOString().slice(0,10)}.xlsx`);
  updateOperationProgress(100, 'Concluído.');
  hideOperationProgress();
  toast('📊 Excel exportado!', 'success');
}

// Colunas do PDF: subconjunto tabular do catálogo completo (imagens/URLs/
// extras ficam de fora da tabela — a capa já aparece na secção de imagens
// a seguir, e os restantes campos fariam a tabela não caber em landscape).
const ALOJAMENTOS_PDF_TABLE_KEYS = new Set([
  'name', 'type', 'color', 'price_per_night', 'max_guests',
  'license_number', 'city', 'checkin_time', 'checkout_time',
]);

function exportAlojamentosPDF() {
  if (typeof window.jspdf === 'undefined') { toast('❌ Biblioteca jsPDF não carregada.', 'error'); return; }
  const pdfColumns = ALOJAMENTOS_EXPORT_COLUMNS.filter(c => ALOJAMENTOS_PDF_TABLE_KEYS.has(c.key));
  openExportColumnPicker('alojamentos-pdf', 'Alojamentos (PDF)', pdfColumns, selectedKeys => _doExportAlojamentosPDF(selectedKeys));
}

async function _doExportAlojamentosPDF(selectedKeys) {
  showOperationProgress('A exportar alojamentos PDF', 'A preparar documento...', 10);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape' });
  const startY = await drawPdfBrandHeader(doc, 'Alojamentos — Santa Paciência');

  const pdfColumns = ALOJAMENTOS_EXPORT_COLUMNS.filter(c => ALOJAMENTOS_PDF_TABLE_KEYS.has(c.key));
  const { head, body } = buildExportTablePdf(accommodations, pdfColumns, selectedKeys);

  doc.autoTable({ head, body, startY, styles: { fontSize: 9 }, headStyles: { fillColor: [132, 52, 36] } });
  let y = doc.lastAutoTable.finalY + 12;
  doc.setFontSize(13);
  doc.text('Imagens dos alojamentos', 14, y);
  y += 8;

  for (const [idx, a] of accommodations.entries()) {
    if (y > 178) { doc.addPage(); y = 18; }
    const color = a.color || '#843424';
    doc.setFontSize(10);
    doc.setTextColor(40);
    doc.text(a.name || 'Alojamento', 14, y + 6);
    doc.setFillColor(...hexToRgb(color));
    doc.rect(72, y + 1, 12, 7, 'F');
    doc.setTextColor(95);
    doc.text(color, 88, y + 6);

    const cover = getAlojamentoCoverUrl(a);
    const imageData = await imageUrlToDataUrl(cover);
    if (imageData) {
      try { doc.addImage(imageData, 'JPEG', 130, y, 32, 22); }
      catch {
        try { doc.addImage(imageData, 'PNG', 130, y, 32, 22); } catch {}
      }
    } else {
      doc.setTextColor(120);
      doc.text('Sem imagem', 130, y + 6);
    }
    const galleryCount = getAlojamentoImageUrls(a).length;
    doc.setTextColor(95);
    doc.text(`${galleryCount} imagem${galleryCount !== 1 ? 's' : ''}`, 170, y + 6);
    y += 28;
    updateOperationProgress(25 + ((idx + 1) / Math.max(accommodations.length, 1)) * 60, `A inserir imagens ${idx + 1}/${accommodations.length}...`);
  }
  doc.setTextColor(40);
  updateOperationProgress(92, 'A iniciar download...');
  doc.save(`alojamentos_${new Date().toISOString().slice(0,10)}.pdf`);
  updateOperationProgress(100, 'Concluído.');
  hideOperationProgress();
  toast('📄 PDF exportado!', 'success');
}

// ── CALENDÁRIO DO ALOJAMENTO ──
