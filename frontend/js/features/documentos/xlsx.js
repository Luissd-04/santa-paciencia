// Excel dos documentos da reserva, a partir do mesmo modelo do PDF
// (documentos/dados.js): datas como datas, valores como números com formato
// «€», larguras de coluna, linha de cabeçalho fixa e totais com fórmula.
// O texto vindo de formulários continua protegido contra fórmulas.
(() => {
AppModules.define('reservas', {
  docXlsx: { get: () => gerarXlsx },
});

const FMT_EUR = '#,##0.00 "€";-#,##0.00 "€"';
const FMT_DATA = 'dd/mm/yyyy';
const coluna = i => XLSX.utils.encode_col(i);

// Número de série do Excel para uma data AAAA-MM-DD (sem fuso).
function serial(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
}

function celula(tipo, value) {
  const formula = value && typeof value === 'object' ? value : null;
  const raw = formula ? formula.v : value;
  if (raw === '' || raw === null || raw === undefined) return null;
  if (tipo === 'eur') return { t: 'n', v: Number(raw), z: FMT_EUR };
  if (tipo === 'int') return Number.isFinite(Number(raw)) ? { t: 'n', v: Number(raw), z: '0' } : { t: 's', v: String(raw) };
  if (tipo === 'data') return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? { t: 'n', v: serial(raw), z: FMT_DATA } : null;
  return { t: 's', v: AppModules.reservas.docDados.neutralizar(raw, { estrito: false }) };
}

function folha(doc, def) {
  const dados = AppModules.reservas.docDados;
  const ws = {};
  const larguras = [];
  let linha = 0;
  const por = (r, c, cell) => {
    if (!cell) return;
    ws[XLSX.utils.encode_cell({ r, c })] = cell;
    const len = cell.t === 's' ? String(cell.v).length + 2 : cell.z === FMT_EUR ? 14 : 12;
    larguras[c] = Math.max(larguras[c] || 10, Math.min(48, len));
  };
  const texto = v => ({ t: 's', v: dados.neutralizar(v, { estrito: false }) });

  if (def.titulo) {
    por(0, 0, texto(`${doc.titulo} · ${doc.codigo}`));
    larguras[0] = 14; // o título pode transbordar para as colunas ao lado
    por(0, 3, texto(doc.cabecalho.nome));
    por(1, 0, texto('Emitido em'));
    por(1, 1, { t: 'n', v: serial(window.ReservationDates.localIso(doc.emitidoEm)), z: FMT_DATA });
    if (doc.estado) { por(1, 2, texto('Estado')); por(1, 3, texto(doc.estado.texto)); }
    linha = 3;
  }
  if (def.campos && doc.campos.length) {
    doc.campos.forEach((campo, i) => {
      const r = linha + Math.floor(i / 2), c = (i % 2) * 2;
      por(r, c, texto(campo.rotulo));
      por(r, c + 1, celula(campo.tipo || 'texto', campo.valor) || texto('—'));
    });
    linha += Math.ceil(doc.campos.length / 2) + 1;
  }

  const t = doc.tabelas.find(x => x.id === def.tabela);
  let fixas = 0;
  if (t) {
    const cols = t.colunas.filter(c => c.so !== 'pdf');
    const head = linha;
    cols.forEach((c, i) => por(head, i, texto(c.rotulo)));
    fixas = head + 1;
    const first = head + 1;
    t.linhas.forEach((l, k) => {
      const r = first + k;
      const endereco = (chave, delta = 0) => `${coluna(cols.findIndex(c => c.chave === chave))}${r + 1 + delta}`;
      cols.forEach((c, i) => {
        const value = l.c[c.chave];
        const cell = celula(c.tipo, value);
        if (cell && value && typeof value === 'object' && typeof value.f === 'function') cell.f = value.f(endereco);
        por(r, i, cell);
      });
    });
    if (!t.linhas.length) por(first, 0, texto(t.vazio || 'Sem linhas'));
    const last = first + Math.max(t.linhas.length, 1) - 1;
    let r = last + 2;
    const ref = {};
    for (const total of t.totais || []) {
      const c = total.soma ? cols.findIndex(x => x.chave === total.soma) : cols.length - 1;
      const letter = coluna(c);
      por(r, Math.max(0, c - 1), texto(total.rotulo));
      const cell = { t: 'n', v: Number(total.valor), z: FMT_EUR };
      if (total.soma) cell.f = t.linhas.length ? `SUM(${letter}${first + 1}:${letter}${last + 1})` : '0';
      else if (total.formula) cell.f = total.formula(ref);
      por(r, c, cell);
      ref[total.id] = `${letter}${r + 1}`;
      r++;
    }
    cols.forEach((c, i) => { if (c.largura) larguras[i] = Math.max(larguras[i] || 0, c.largura); });
  }
  const maxRow = Math.max(0, ...Object.keys(ws).map(k => XLSX.utils.decode_cell(k).r));
  const maxCol = Math.max(0, larguras.length - 1);
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow, c: maxCol } });
  ws['!cols'] = larguras.map(wch => ({ wch: wch || 10 }));
  return { ws, fixas };
}

// O SheetJS Community não escreve painéis fixos: acrescenta-se o <pane> ao
// XML de cada folha no .xlsx já gerado.
function fixarCabecalhos(bytes, fixas) {
  const cfb = XLSX.CFB.read(bytes, { type: 'array' });
  fixas.forEach((rows, i) => {
    if (!rows) return;
    const index = cfb.FullPaths.findIndex(p => p.endsWith(`/xl/worksheets/sheet${i + 1}.xml`));
    if (index < 0) return;
    const entry = cfb.FileIndex[index];
    const xml = new TextDecoder().decode(entry.content);
    const pane = `<sheetView workbookViewId="0"><pane ySplit="${rows}" topLeftCell="A${rows + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${rows + 1}" sqref="A${rows + 1}"/></sheetView>`;
    const next = xml.replace(/<sheetView workbookViewId="0"\s*\/>/, pane);
    if (next === xml) return;
    entry.content = new TextEncoder().encode(next);
    entry.size = entry.content.length;
  });
  return XLSX.CFB.write(cfb, { fileType: 'zip', type: 'array' });
}

function gerarXlsx(doc) {
  const wb = XLSX.utils.book_new();
  const fixas = [];
  for (const def of doc.folhas) {
    const { ws, fixas: rows } = folha(doc, def);
    XLSX.utils.book_append_sheet(wb, ws, def.nome.slice(0, 31));
    fixas.push(rows);
  }
  wb.Props = { Title: `${doc.titulo} ${doc.codigo}`, Author: doc.emitidoPor || doc.cabecalho.nome };
  const bytes = XLSX.write(wb, { bookType: 'xlsx', type: 'array', compression: true });
  const out = fixarCabecalhos(new Uint8Array(bytes), fixas);
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

})();
