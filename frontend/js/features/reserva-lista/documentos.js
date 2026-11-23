// Documentos da reserva (cartão «Documentos» da ficha): ficha de reserva,
// ficha de hóspede, conta corrente e registo de fatura. Os dados vêm de
// documentos/dados.js; aqui ficam as janelas e os botões de descarga.
// Estado privado; interface partilhada em AppModules.reservas.
(() => {
AppModules.define('reservas', {
  openAccountStatement: { get: () => openAccountStatement },
  openGuestCard: { get: () => openGuestCard },
  openReservationSheet: { get: () => openReservationSheet },
  downloadInvoiceRecordPdf: { get: () => downloadInvoiceRecordPdf },
});

const dados = () => AppModules.reservas.docDados;
// Último documento aberto em cada janela (os botões PDF/XLS/CSV usam-no).
let sheetDoc = null;
let statementDoc = null;
let guestCtx = null;
// Um documento de cada vez: sem isto, um duplo clique (ou um segundo clique
// enquanto o jsPDF ainda carrega) gerava dois ficheiros iguais.
const emCurso = new Set();

async function carregarReserva(resId, erro) {
  try {
    return (await AppModules.core.apiGet(`/api/reservations/${encodeURIComponent(resId)}`)).data;
  } catch {
    AppModules.core.toast(`❌ ${erro}`, 'error');
    return null;
  }
}

function botoes(acoes) {
  const ic = AppModules.core.lcIcon;
  return `<button type="button" class="btn btn-ghost btn-sm" data-dialog-close>Fechar</button>
          ${acoes.csv ? `<button type="button" class="btn btn-outline btn-sm" data-on-click="${acoes.csv}">CSV</button>` : ''}
          ${acoes.xls ? `<button type="button" class="btn btn-outline btn-sm" data-on-click="${acoes.xls}">${ic('file-spreadsheet', 13)} Excel</button>` : ''}
          <button type="button" class="btn btn-primary btn-sm" data-on-click="${acoes.pdf}">${ic('file-down', 13)} PDF</button>`;
}

function abrirJanela(id, doc, acoes, extra = '') {
  const esc = AppModules.core.escapeHtml;
  AppUI.openDialog({
    id,
    className: 'stmt-dialog doc-dialog',
    title: `${esc(doc.titulo)}<span class="stmt-subtitle">${esc(doc.cabecalho.nome)}</span>`,
    body: dados().htmlPrevia(doc) + extra,
    footer: botoes(acoes),
  });
}

// Gera e descarrega; o botão fica desativado até acabar.
async function descarregar(chave, el, gerar) {
  if (emCurso.has(chave)) return;
  emCurso.add(chave);
  if (el) el.disabled = true;
  try {
    await gerar();
  } catch (error) {
    console.error(error);
    AppModules.core.toast(`❌ Não foi possível gerar o documento: ${error.message}`, 'error');
  } finally {
    emCurso.delete(chave);
    if (el) el.disabled = false;
  }
}

async function pdf(doc, el) {
  if (!doc) return;
  await descarregar(`pdf:${doc.tipo}`, el, async () => {
    if (!await AppModules.core.ensureLibrary('pdf')) return;
    const file = await AppModules.reservas.docPdf(doc);
    file.save(`${doc.ficheiro}.pdf`);
    AppModules.core.toast('📄 PDF exportado!', 'success');
  });
}

async function xlsx(doc, el) {
  if (!doc) return;
  await descarregar(`xlsx:${doc.tipo}`, el, async () => {
    if (!await AppModules.core.ensureLibrary('xlsx')) return;
    dados().baixar(AppModules.reservas.docXlsx(doc), `${doc.ficheiro}.xlsx`);
    AppModules.core.toast('📊 Excel exportado!', 'success');
  });
}

// ── Ficha de reserva ──
async function openReservationSheet(resId) {
  const r = await carregarReserva(resId, 'Erro ao carregar a ficha da reserva');
  if (!r) return;
  sheetDoc = dados().fichaReserva(r);
  abrirJanela('sheet-overlay', sheetDoc, {
    xls: 'documentos-download-reservation-sheet-xls-dd4a6e6',
    pdf: 'documentos-download-reservation-sheet-pdf-abf137c',
  });
}

// ── Conta corrente ──
async function openAccountStatement(resId) {
  const r = await carregarReserva(resId, 'Erro ao carregar extrato');
  if (!r) return;
  statementDoc = dados().contaCorrente(r);
  abrirJanela('stmt-overlay', statementDoc, {
    csv: 'documentos-download-statement-csv-b298717',
    xls: 'documentos-download-statement-xls-6ad222b',
    pdf: 'documentos-download-statement-pdf-c84c920',
  });
}

// CSV da conta corrente: valores com ponto decimal (para importar noutros
// programas) e todo o texto neutralizado contra fórmulas.
function downloadStatementCsv() {
  const doc = statementDoc;
  if (!doc) return;
  const { neutralizar, isoDia } = dados();
  const esc = v => `"${(typeof v === 'number' ? v.toFixed(2) : neutralizar(v)).replace(/"/g, '""')}"`;
  const num = v => (v && typeof v === 'object' ? v.v : v);
  const total = doc.resumo[0].valor, pago = doc.resumo[1].valor, falta = doc.resumo[2].valor;
  const campo = rotulo => doc.campos.find(c => c.rotulo === rotulo)?.valor ?? '';
  const t = doc.tabelas[0];
  const lines = [
    ['Reserva', 'Hóspede', 'Check-in', 'Check-out', 'Total'].map(esc).join(','),
    [doc.codigo, campo('Hóspede'), isoDia(campo('Entrada')), isoDia(campo('Saída')), total].map(esc).join(','),
    '',
    t.colunas.map(c => esc(c.rotulo)).join(','),
    ...t.linhas.map(l => t.colunas.map(c => {
      const v = num(l.c[c.chave]);
      return esc(c.tipo === 'eur' && v !== '' && v != null ? Number(v) : v ?? '');
    }).join(',')),
    '',
    ['', '', 'Total pago', pago].map(esc).join(','),
    ['', '', 'Em falta', falta].map(esc).join(','),
  ];
  dados().baixar(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' }), `extrato-${doc.codigo}.csv`);
}

// ── Ficha de hóspede ──
// Abre o documento com a opção de mostrar o número do documento completo
// (por omissão sai parcialmente oculto) e o atalho para a ficha no ecrã.
async function openGuestCard(guestId, reservationId) {
  if (!guestId) {
    AppModules.core.toast('⚠️ Hóspede não encontrado na base de dados', 'info');
    return;
  }
  const [r, guest] = await Promise.all([
    carregarReserva(reservationId, 'Erro ao carregar a reserva'),
    AppModules.core.apiGet(`/api/guests/${encodeURIComponent(guestId)}`).then(res => res.data).catch(() => null),
  ]);
  if (!r) return;
  if (!guest) { AppModules.core.toast('❌ Erro ao carregar o hóspede', 'error'); return; }
  guestCtx = { guest, r, guestId, reservationId };
  const doc = dados().fichaHospede(guest, r);
  const ic = AppModules.core.lcIcon;
  const extra = `<div class="doc-opcoes">
      ${guest.document_number ? `<label class="doc-opcao"><input type="checkbox" id="guest-doc-full-id" ${AppActions.attrs('change', 'documentos-guest-full-id')}> Mostrar o número completo do documento</label>` : ''}
      <button type="button" class="btn btn-ghost btn-sm" data-on-click="documentos-open-guest-page">${ic('external-link', 13)} Abrir ficha do hóspede</button>
    </div>`;
  abrirJanela('guest-doc-overlay', doc, { xls: 'documentos-download-guest-xls', pdf: 'documentos-download-guest-pdf' }, extra);
}

function guestDoc() {
  if (!guestCtx) return null;
  const completo = Boolean(document.getElementById('guest-doc-full-id')?.checked);
  return dados().fichaHospede(guestCtx.guest, guestCtx.r, { documentoCompleto: completo });
}

function refreshGuestPreview() {
  const doc = guestDoc();
  const box = document.querySelector('#guest-doc-overlay .doc-previa');
  if (doc && box) box.outerHTML = dados().htmlPrevia(doc);
}

async function openGuestPage() {
  if (!guestCtx) return;
  const { guestId, reservationId } = guestCtx;
  AppUI.closeDialog('guest-doc-overlay');
  await AppModules.core.showView('hospedes');
  if (typeof AppModules.hospedes.showHospedeDetail === 'function') AppModules.hospedes.showHospedeDetail(guestId, { fromReservationId: reservationId });
}

// ── Registo de fatura (botão PDF no formulário «Registar fatura») ──
async function downloadInvoiceRecordPdf(reservationId, el) {
  const r = await carregarReserva(reservationId, 'Erro ao carregar a reserva');
  if (!r) return;
  await pdf(dados().registoFatura(r), el);
}

AppActions.register({
  "documentos-download-statement-csv-b298717": () => { downloadStatementCsv() },
  "documentos-download-statement-xls-6ad222b": el => xlsx(statementDoc, el),
  "documentos-download-statement-pdf-c84c920": el => pdf(statementDoc, el),
  "documentos-download-reservation-sheet-xls-dd4a6e6": el => xlsx(sheetDoc, el),
  "documentos-download-reservation-sheet-pdf-abf137c": el => pdf(sheetDoc, el),
  "documentos-download-guest-xls": el => xlsx(guestDoc(), el),
  "documentos-download-guest-pdf": el => pdf(guestDoc(), el),
  "documentos-open-guest-page": () => openGuestPage(),
  "documentos-download-invoice-pdf": (el, event, args) => downloadInvoiceRecordPdf(args[0], el),
}, "click");
AppActions.register({
  "documentos-guest-full-id": () => refreshGuestPreview(),
}, "change");

// Limpeza da funcionalidade ao sair ou trocar de organização.
AppModules.onReset('features/reserva-lista/documentos.js', () => {
  sheetDoc = null;
  statementDoc = null;
  guestCtx = null;
  emCurso.clear();
});

})();
