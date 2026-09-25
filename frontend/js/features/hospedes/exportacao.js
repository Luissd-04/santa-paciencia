// Estado privado; interface partilhada em AppModules.hospedes.
(() => {
AppModules.define('hospedes', {
  exportHospedesPDF: { get: () => exportHospedesPDF },
  exportHospedesXLS: { get: () => exportHospedesXLS },
  importHospedesXLS: { get: () => importHospedesXLS },
});

// ── EXPORT ──
const HOSPEDES_EXPORT_COLUMNS = [
  { key: 'name',              label: 'Nome',            default: true,  get: g => g.name || '' },
  { key: 'email',              label: 'Email (canal)',   default: true,  get: g => AppModules.core.realEmail(g.email) || '' },
  { key: 'email_personal',     label: 'Email (pessoal)', default: true,  get: g => g.email_personal || '' },
  { key: 'phone',               label: 'Telefone',        default: true,  get: g => g.phone || '' },
  { key: 'country',            label: 'País',            default: true,  get: g => g.country || g.nationality || '' },
  { key: 'nif',                 label: 'NIF',              default: true,  get: g => g.nif || '' },
  { key: 'address',            label: 'Morada',          default: true,  get: g => g.address || '' },
  { key: 'postal_code',        label: 'CP',               default: true,  get: g => g.postal_code || '' },
  { key: 'city',                label: 'Localidade',      default: true,  get: g => g.city || '' },
  { key: 'reservation_count',  label: 'Reservas',         default: true,  get: g => String(g.reservation_count || 0) },
  { key: 'last_check_in',      label: 'Última visita',    default: true,  get: g => g.last_check_in ? new Date(g.last_check_in + 'T12:00:00').toLocaleDateString('pt-PT') : '' },
  { key: 'is_favorite',        label: 'Favorito',         default: true,  get: g => g.is_favorite ? 'Sim' : 'Não' },
  { key: 'is_vip',              label: 'VIP',               default: true,  get: g => g.is_vip ? 'Sim' : 'Não' },
  { key: 'is_unwanted',        label: 'Não desejado',     default: true,  get: g => g.is_unwanted ? 'Sim' : 'Não' },
];

async function exportHospedesXLS() {
  if (!await AppModules.core.ensureLibrary('xlsx')) return;
  AppModules.core.openExportColumnPicker('hospedes', 'Hóspedes', HOSPEDES_EXPORT_COLUMNS, selectedKeys => _doExportHospedesXLS(selectedKeys));
}

async function _doExportHospedesXLS(selectedKeys) {
  AppModules.core.showOperationProgress('A exportar hóspedes XLS', 'A preparar dados...', 15);
  try {
    const { data } = await AppModules.core.apiGetAllPages('/api/guests', AppModules.hospedes.getHospedesQuery());
    const rows = AppModules.core.buildExportRowsXlsx(data, HOSPEDES_EXPORT_COLUMNS, selectedKeys);
    AppModules.core.updateOperationProgress(60, 'A gerar Excel...');
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Hóspedes');
    AppModules.core.updateOperationProgress(90, 'A iniciar download...');
    XLSX.writeFile(wb, `hospedes_${new Date().toISOString().slice(0,10)}.xlsx`);
    AppModules.core.updateOperationProgress(100, 'Concluído.');
    AppModules.core.toast('📊 Excel exportado!', 'success');
  } catch (error) {
    AppModules.core.toast('❌ Não foi possível exportar: ' + error.message, 'error');
  } finally { AppModules.core.hideOperationProgress(); }
}

async function importHospedesXLS(input) {
  if (!await AppModules.core.ensureLibrary('xlsx')) return;
  const file = input.files[0];
  if (!file) return;
  input.value = '';
  AppModules.core.showOperationProgress('A importar hóspedes', 'A ler ficheiro...', 8);

  const reader = new FileReader();
  reader.onload = async e => {
    try {
      AppModules.core.updateOperationProgress(20, 'A interpretar Excel...');
      const wb  = XLSX.read(e.target.result, { type: 'array' });
      const ws  = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      if (!rows.length) { AppModules.core.toast('⚠️ Ficheiro vazio.', 'error'); AppModules.core.hideOperationProgress(); return; }

      const COL = {
        nome:      ['Nome', 'Name', 'nome'],
        email:     ['Email', 'email', 'E-mail'],
        telefone:  ['Telefone', 'Phone', 'telefone'],
        pais:      ['País', 'Pais', 'Country', 'Nationality'],
        nif:       ['NIF', 'nif'],
        morada:    ['Morada', 'Address', 'morada'],
        cp:        ['CP', 'Postal Code', 'postal_code'],
        cidade:    ['Localidade', 'City', 'cidade'],
      };
      const pick = (row, keys) => { for (const k of keys) if (row[k] !== undefined && row[k] !== '') return String(row[k]); return ''; };

      let created = 0, skipped = 0;
      for (const [idx, row] of rows.entries()) {
        const nome  = pick(row, COL.nome);
        const email = pick(row, COL.email);
        if (!nome) { skipped++; continue; }
        try {
          const parts = nome.trim().split(' ');
          await AppModules.core.apiPost('/api/guests', {
            name:       nome,
            first_name: parts[0] || '',
            last_name:  parts.slice(1).join(' ') || '',
            email:      email || `importado_${Date.now()}@sem-email.local`,
            phone:      pick(row, COL.telefone),
            country:    pick(row, COL.pais),
            nif:        pick(row, COL.nif),
            address:    pick(row, COL.morada),
            postal_code:pick(row, COL.cp),
            city:       pick(row, COL.cidade),
          });
          created++;
        } catch { skipped++; }
        AppModules.core.updateOperationProgress(25 + ((idx + 1) / rows.length) * 65, `A importar ${idx + 1}/${rows.length} hóspedes...`);
      }
      AppModules.core.updateOperationProgress(95, 'A atualizar lista...');
      AppModules.core.toast(`✅ ${created} hóspedes importados${skipped ? `, ${skipped} ignorados` : ''}.`, 'success');
      await AppModules.hospedes.loadHospedes();
      AppModules.core.updateOperationProgress(100, 'Concluído.');
    } catch (err) {
      AppModules.core.toast('❌ Erro ao ler ficheiro: ' + err.message, 'error');
    } finally {
      AppModules.core.hideOperationProgress();
    }
  };
  reader.readAsArrayBuffer(file);
}

async function exportHospedesPDF() {
  if (!await AppModules.core.ensureLibrary('pdf')) return;
  AppModules.core.openExportColumnPicker('hospedes', 'Hóspedes', HOSPEDES_EXPORT_COLUMNS, selectedKeys => _doExportHospedesPDF(selectedKeys));
}

async function _doExportHospedesPDF(selectedKeys) {
  AppModules.core.showOperationProgress('A exportar hóspedes PDF', 'A preparar documento...', 15);
  try {
    const { data } = await AppModules.core.apiGetAllPages('/api/guests', AppModules.hospedes.getHospedesQuery());
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape' });
    const startY = await AppModules.core.drawPdfBrandHeader(doc, 'Hóspedes — Santa Paciência');

    const { head, body } = AppModules.core.buildExportTablePdf(data, HOSPEDES_EXPORT_COLUMNS, selectedKeys);

    AppModules.core.updateOperationProgress(70, 'A gerar PDF...');
    doc.autoTable({ head, body, startY, styles: { fontSize: 9 }, headStyles: { fillColor: [132, 52, 36] } });
    AppModules.core.updateOperationProgress(90, 'A iniciar download...');
    doc.save(`hospedes_${new Date().toISOString().slice(0,10)}.pdf`);
    AppModules.core.updateOperationProgress(100, 'Concluído.');
    AppModules.core.toast('📄 PDF exportado!', 'success');
  } catch (error) {
    AppModules.core.toast('❌ Não foi possível exportar: ' + error.message, 'error');
  } finally { AppModules.core.hideOperationProgress(); }
}


})();
