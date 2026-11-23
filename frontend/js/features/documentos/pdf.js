// PDF dos documentos da reserva, desenhado a partir do modelo de
// documentos/dados.js: cabeçalho com o logótipo e os dados do alojamento,
// título, estado, blocos, tabelas, condições e rodapé «Página X de Y».
// A fonte (Instrument Sans, OFL) vem da própria app: a fonte base do jsPDF
// não tem «→», «−» nem «•» e trocava-os por lixo («!'»).
(() => {
AppModules.define('reservas', {
  docPdf: { get: () => gerarPdf },
});

const FONTE = 'InstrumentSans';
const FICHEIROS = {
  normal: '/css/vendor/fonts/instrument-sans-1.000-regular.ttf',
  bold: '/css/vendor/fonts/instrument-sans-1.000-bold.ttf',
};
const COR = {
  marca: [132, 52, 36], texto: [43, 33, 27], suave: [120, 108, 100], linha: [226, 218, 210], fundo: [248, 246, 243],
  ok: [46, 125, 82], erro: [176, 48, 48], aviso: [176, 104, 0], neutro: [120, 108, 100],
};
const FUNDO_TOM = { ok: [231, 243, 235], erro: [250, 233, 231], aviso: [252, 241, 222], neutro: [240, 236, 232] };
const M = 16;            // margem lateral (mm)
const TOPO = 16;
const RODAPE = 18;       // espaço reservado ao rodapé

let fontes = null;       // Promise com o TTF em base64 (pedido uma vez por sessão)
function carregarFontes() {
  if (!fontes) {
    fontes = Promise.all(Object.entries(FICHEIROS).map(async ([estilo, url]) => {
      const res = await fetch(url, { credentials: 'same-origin' });
      if (!res.ok) throw new Error('Não foi possível carregar a fonte do PDF.');
      const bytes = new Uint8Array(await res.arrayBuffer());
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return [estilo, btoa(bin)];
    })).then(Object.fromEntries).catch(error => { fontes = null; throw error; });
  }
  return fontes;
}

// Logótipo em PNG (aceita WebP/JPEG/SVG do servidor) e as dimensões.
async function logoPng(url) {
  if (!url) return null;
  try {
    const src = /^(https?:|data:)/.test(url) ? url : (AppModules.core.API_BASE || '') + url;
    const img = new Image();
    if (/^https?:/.test(src) && !src.startsWith(location.origin)) img.crossOrigin = 'anonymous';
    img.src = src;
    await img.decode();
    const w = img.naturalWidth || 300, h = img.naturalHeight || 150;
    const k = Math.min(1, 600 / w, 300 / h);
    const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(w * k), height: Math.round(h * k) });
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return { data: canvas.toDataURL('image/png'), w: canvas.width, h: canvas.height };
  } catch {
    return null;
  }
}

// Espaços que a fonte não tem (o Intl usa U+202F/U+00A0) e o sinal menos tipográfico.
const txt = value => String(value ?? '').replace(/[   ]/g, ' ');
const eurPdf = value => txt(ReservationMoney.format(value)).replace(/^-/, '−');
function celula(tipo, value) {
  const raw = value && typeof value === 'object' ? value.v : value;
  if (raw === '' || raw === null || raw === undefined) return '—';
  if (tipo === 'eur') return eurPdf(raw);
  if (tipo === 'data') return AppModules.reservas.docDados.dataCurta(raw);
  return txt(raw);
}

async function gerarPdf(doc) {
  const [fonte, logo] = await Promise.all([carregarFontes(), logoPng(doc.cabecalho.logo)]);
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  pdf.addFileToVFS('InstrumentSans-Regular.ttf', fonte.normal);
  pdf.addFont('InstrumentSans-Regular.ttf', FONTE, 'normal');
  pdf.addFileToVFS('InstrumentSans-Bold.ttf', fonte.bold);
  pdf.addFont('InstrumentSans-Bold.ttf', FONTE, 'bold');
  pdf.setProperties({ title: `${doc.titulo} ${doc.codigo}`, creator: doc.cabecalho.nome });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const largura = W - 2 * M;
  const set = (size, estilo = 'normal', cor = COR.texto) => { pdf.setFont(FONTE, estilo); pdf.setFontSize(size); pdf.setTextColor(...cor); };
  let y = TOPO;
  const espaco = h => { if (y + h > H - RODAPE) { pdf.addPage(); y = TOPO; } };

  // ── Cabeçalho: logótipo (ou nome da organização) e dados do alojamento ──
  const cab = doc.cabecalho;
  let x = M;
  if (logo) {
    let h = 16, w = (logo.w / logo.h) * h;
    if (w > 42) { w = 42; h = 42 * logo.h / logo.w; }
    pdf.addImage(logo.data, 'PNG', M, y, w, h, undefined, 'FAST');
    x = M + w + 6;
  } else if (cab.marca) {
    set(13, 'bold', COR.marca);
    const linhas = pdf.splitTextToSize(txt(cab.marca), 44);
    pdf.text(linhas, M, y + 5);
    x = M + Math.min(44, Math.max(...linhas.map(l => pdf.getTextWidth(l)))) + 6;
  }
  set(13, 'bold');
  pdf.text(txt(cab.nome), x, y + 5);
  set(8.5, 'normal', COR.suave);
  cab.linhas.forEach((linha, i) => pdf.text(pdf.splitTextToSize(txt(linha), W - M - x)[0], x, y + 10 + i * 4));
  y += Math.max(logo ? 18 : 10, 8 + cab.linhas.length * 4) + 3;
  pdf.setDrawColor(...COR.linha);
  pdf.setLineWidth(0.3);
  pdf.line(M, y, W - M, y);
  y += 9;

  // ── Título, código, data e estado ──
  set(18, 'bold', COR.marca);
  pdf.text(txt(doc.titulo), M, y);
  const emitido = AppModules.reservas.docDados.dataCurta(window.ReservationDates.localIso(doc.emitidoEm));
  set(9.5, 'normal', COR.suave);
  pdf.text(txt([doc.codigo, doc.extra, `emitido a ${emitido}`].filter(Boolean).join(' · ')), M, y + 6);
  if (doc.estado) {
    set(9, 'bold', COR[doc.estado.tom] || COR.neutro);
    const tw = pdf.getTextWidth(txt(doc.estado.texto)) + 8;
    pdf.setFillColor(...(FUNDO_TOM[doc.estado.tom] || FUNDO_TOM.neutro));
    pdf.roundedRect(W - M - tw, y - 5.5, tw, 7.5, 3.7, 3.7, 'F');
    pdf.text(txt(doc.estado.texto), W - M - tw / 2, y - 0.5, { align: 'center' });
  }
  y += 14;

  // ── Caixas de resumo ──
  if (doc.resumo.length) {
    const gap = 4, bw = (largura - gap * (doc.resumo.length - 1)) / doc.resumo.length;
    doc.resumo.forEach((b, i) => {
      const bx = M + i * (bw + gap);
      pdf.setFillColor(...(b.tom ? FUNDO_TOM[b.tom] : COR.fundo));
      pdf.roundedRect(bx, y, bw, 17, 2, 2, 'F');
      set(8, 'normal', COR.suave);
      pdf.text(txt(b.rotulo).toUpperCase(), bx + 4, y + 6);
      set(14, 'bold', b.tom ? COR[b.tom] : COR.texto);
      pdf.text(b.tipo === 'int' ? String(b.valor) : eurPdf(b.valor), bx + 4, y + 13.5);
    });
    y += 23;
  }
  if (doc.contexto) {
    set(9.5, 'normal', COR.suave);
    pdf.text(pdf.splitTextToSize(txt(doc.contexto), largura), M, y);
    y += 8;
  }

  // ── Blocos (duas colunas) ──
  if (doc.blocos.length) {
    const cw = (largura - 8) / 2;
    let alto = 0;
    doc.blocos.forEach((b, i) => {
      const bx = M + i * (cw + 8);
      let by = y;
      set(8, 'bold', COR.suave);
      pdf.text(txt(b.titulo).toUpperCase(), bx, by);
      by += 5.5;
      for (const l of b.linhas) {
        set(l.forte ? 11 : 9.5, l.forte ? 'bold' : 'normal', l.tom ? (COR[l.tom] || COR.texto) : COR.texto);
        const linhas = pdf.splitTextToSize(txt(l.texto), cw);
        pdf.text(linhas, bx, by);
        by += linhas.length * (l.forte ? 5.2 : 4.6);
      }
      alto = Math.max(alto, by - y);
    });
    y += alto + 4;
  }

  // ── Tabelas ──
  for (const t of doc.tabelas) {
    const cols = t.colunas.filter(c => c.so !== 'xlsx');
    const num = c => c.tipo === 'eur' || c.alinhar === 'right';
    espaco(24);
    if (t.titulo) { set(8, 'bold', COR.suave); pdf.text(txt(t.titulo).toUpperCase(), M, y + 2); y += 4; }
    const body = t.linhas.length
      ? t.linhas.map(l => cols.map(c => ({ content: celula(c.tipo, l.c[c.chave]), styles: l.tom && (c.chave === 'valor' || l.tom === 'suave') ? { textColor: COR[l.tom] || COR.texto } : {} })))
      : [[{ content: txt(t.vazio || 'Sem linhas'), colSpan: cols.length, styles: { halign: 'center', textColor: COR.suave } }]];
    const foot = (t.totais || []).map(x => [
      { content: txt(x.rotulo), colSpan: cols.length - 1, styles: { halign: 'right' } },
      { content: eurPdf(x.valor), styles: { halign: 'right', textColor: x.tom ? COR[x.tom] : COR.texto } },
    ]);
    const columnStyles = {};
    cols.forEach((c, i) => {
      columnStyles[i] = { halign: num(c) ? 'right' : 'left' };
      if (c.tipo === 'eur') columnStyles[i].cellWidth = 30;
      else if (c.tipo === 'data') columnStyles[i].cellWidth = 26;
      else if (c.alinhar === 'right') columnStyles[i].cellWidth = c.largura || 24;
    });
    pdf.autoTable({
      startY: y + 1,
      head: [cols.map((c, i) => ({ content: txt(c.rotulo).toUpperCase(), styles: { halign: columnStyles[i].halign } }))],
      body, foot, columnStyles,
      showFoot: 'lastPage',
      margin: { left: M, right: M, top: TOPO, bottom: RODAPE + 2 },
      theme: 'plain',
      styles: { font: FONTE, fontSize: 9.5, textColor: COR.texto, cellPadding: { top: 2.6, bottom: 2.6, left: 2, right: 2 }, lineColor: COR.linha },
      headStyles: { font: FONTE, fontStyle: 'bold', fontSize: 7.5, textColor: COR.suave, fillColor: COR.fundo },
      footStyles: { font: FONTE, fontStyle: 'bold', fontSize: 10.5, textColor: COR.texto, fillColor: false },
      bodyStyles: { lineWidth: { bottom: 0.2 } },
      didDrawCell: data => {
        if (data.section === 'foot' && data.row.index === 0) {
          pdf.setDrawColor(...COR.texto); pdf.setLineWidth(0.4);
          pdf.line(data.cell.x, data.cell.y, data.cell.x + data.cell.width, data.cell.y);
        }
      },
    });
    y = pdf.lastAutoTable.finalY + 7;
  }

  // ── Condições e notas ──
  if (doc.condicoes.length) {
    set(9, 'normal');
    const pad = 4, tw = largura - 2 * pad;
    const partes = doc.condicoes.map(c => ({ c, linhas: pdf.splitTextToSize(txt(`${c.rotulo} — ${c.texto}`), tw) }));
    const alto = partes.reduce((s, p) => s + p.linhas.length * 4.4 + 1.5, 0) + 2 * pad - 1.5;
    espaco(Math.min(alto, 60));
    if (alto <= H - RODAPE - y) {
      pdf.setFillColor(...COR.fundo);
      pdf.roundedRect(M, y, largura, alto, 2, 2, 'F');
    }
    let cy = y + pad + 3;
    for (const p of partes) {
      p.linhas.forEach((linha, i) => {
        if (cy > H - RODAPE) { pdf.addPage(); cy = TOPO + 3; }
        if (i === 0) {
          set(9, 'bold');
          const rot = txt(p.c.rotulo);
          pdf.text(rot, M + pad, cy);
          const dx = pdf.getTextWidth(rot);
          set(9, 'normal');
          pdf.text(linha.slice(rot.length).trimStart(), M + pad + dx + pdf.getTextWidth(' '), cy);
        } else {
          set(9, 'normal');
          pdf.text(linha, M + pad, cy);
        }
        cy += 4.4;
      });
      cy += 1.5;
    }
    y = cy;
  }

  // ── Rodapé em todas as páginas ──
  const total = pdf.getNumberOfPages();
  const quem = `${txt(doc.nota)}${doc.emitidoPor ? ` · emitido por ${txt(doc.emitidoPor)}` : ''}`;
  for (let i = 1; i <= total; i++) {
    pdf.setPage(i);
    pdf.setDrawColor(...COR.linha); pdf.setLineWidth(0.3);
    pdf.line(M, H - 12, W - M, H - 12);
    set(8, 'normal', COR.suave);
    pdf.text(quem, M, H - 7.5);
    pdf.text(`Página ${i} de ${total}`, W - M, H - 7.5, { align: 'right' });
  }
  return pdf;
}

})();
