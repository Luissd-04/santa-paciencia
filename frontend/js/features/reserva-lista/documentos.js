// ── FICHA DE RESERVA (documento read-only com PDF/XLS) ──
// Estrutura dos dados do documento, partilhada entre o overlay e os exports.
function buildReservationSheetData(r) {
  const fmt = v => `€${Number(v).toFixed(2)}`;
  const sd = d => d ? new Date(d.slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
  const nightly = typeof r.nightly_prices === 'string' ? JSON.parse(r.nightly_prices || '[]') : (r.nightly_prices || []);
  const payments = r.payments || [];
  const total = Number(r.total_amount || 0);
  const paid = Number(r.amount_paid || 0);

  const baseAmount = nightly.reduce((s, n) => s + Number(n.price || 0), 0);
  const acc = accommodations.find(a => a.id === r.accommodation_id);
  const accsData = typeof r.accommodations_data === 'string' ? JSON.parse(r.accommodations_data || '[]') : (r.accommodations_data || []);
  const accRows = accsData.length > 0
    ? accsData
    : [{ accommodation_id: r.accommodation_id, name: r.accommodation_name || acc?.name || '—', price_per_night: Number(acc?.price_per_night || 0), nights: r.nights, subtotal: Number(acc?.price_per_night || 0) * r.nights }];
  const roomNames = accRows.map(row => row.name || row.accommodation_name || '—').join(', ');
  const guestsData = typeof r.guests_data === 'string' ? JSON.parse(r.guests_data || '[]') : (r.guests_data || []);
  const extraOcc = getExtraOccupancyCharge(acc, r.num_guests || 1, r.nights || 0, guestsData.map(g => g.birth_date).filter(Boolean), r.check_in);
  const bkfPrice = servicosData.find(s => s.id === 'breakfast')?.value ?? 19;
  const bkfTotal = r.breakfast_included ? (r.num_guests * r.nights * bkfPrice) : 0;
  const touristTax = Number(r.tourist_tax || 0);

  const extras = [];
  if (bkfTotal > 0) extras.push({ name: 'Pequeno-almoço', amount: bkfTotal });
  if (touristTax > 0) extras.push({ name: 'Taxa turística', amount: touristTax });
  if (extraOcc > 0) extras.push({ name: 'Ocupação extra', amount: extraOcc });

  // Diferença entre o total gravado e a soma das parcelas = ajuste manual/desconto
  const parcelsSum = baseAmount + extras.reduce((s, e) => s + e.amount, 0);
  const adjustment = total - parcelsSum;

  const standardTotal = Number(r.standard_total);
  const stdDiff = !isNaN(standardTotal) && standardTotal > 0 ? total - standardTotal : null;

  return { r, fmt, sd, nightly, payments, total, paid, remaining: total - paid, baseAmount, extras, adjustment, standardTotal, stdDiff, accRows, roomNames };
}

async function openReservationSheet(resId) {
  let r;
  try {
    const data = await apiGet(`/api/reservations/${resId}`);
    r = data.data;
  } catch {
    toast('❌ Erro ao carregar a ficha da reserva', 'error');
    return;
  }

  const d = buildReservationSheetData(r);
  const { fmt, sd } = d;

  const nightlyRows = d.nightly.length
    ? d.nightly.map(n => `
        <tr>
          <td>${sd(n.date)}</td>
          <td>Noite</td>
          <td style="text-align:right;font-weight:600;">${fmt(n.price)}</td>
        </tr>`).join('')
    : `<tr><td>${sd(r.check_in)} → ${sd(r.check_out)}</td><td>${r.nights} noite${r.nights !== 1 ? 's' : ''}</td><td style="text-align:right;font-weight:600;">${fmt(d.baseAmount || d.total)}</td></tr>`;

  const extraRows = d.extras.map(e => `
    <tr><td>—</td><td>${e.name}</td><td style="text-align:right;">${fmt(e.amount)}</td></tr>`).join('');

  const adjRow = Math.abs(d.adjustment) > 0.01
    ? `<tr><td>—</td><td style="color:${d.adjustment < 0 ? '#2e7d52' : '#e8710a'};">${d.adjustment < 0 ? 'Desconto / ajuste' : 'Ajuste manual'}</td><td style="text-align:right;color:${d.adjustment < 0 ? '#2e7d52' : '#e8710a'};">${fmt(d.adjustment)}</td></tr>`
    : '';

  const stdLine = d.stdDiff !== null && Math.abs(d.stdDiff) > 0.005
    ? `<div class="stmt-foot-row" style="font-size:12px;color:var(--cinza);">
        <span>${d.stdDiff < 0 ? 'Desconto face ao padrão do calendário dinâmico' : 'Acréscimo face ao padrão do calendário dinâmico'} (padrão ${fmt(d.standardTotal)})</span>
        <span style="font-weight:600;color:${d.stdDiff < 0 ? '#2e7d52' : '#e8710a'};">${fmt(d.stdDiff)}</span>
      </div>`
    : '';

  const payRows = d.payments.length
    ? d.payments.map(p => `
        <tr>
          <td>${p.payment_date ? sd(p.payment_date) : '—'}</td>
          <td>${p.method || '—'}</td>
          <td style="text-align:right;color:#2e7d52;font-weight:600;">${fmt(p.amount)}</td>
        </tr>`).join('')
    : `<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:12px;">Sem pagamentos registados</td></tr>`;

  const html = `
    <div id="sheet-overlay" style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1300;display:flex;align-items:center;justify-content:center;padding:16px;" onclick="if(event.target===this)this.remove()">
      <div class="stmt-modal" style="max-height:92vh;overflow:auto;">
        <div class="stmt-header">
          <div>
            <div class="stmt-title">Ficha de Reserva</div>
            <div class="stmt-subtitle">${escapeHtml(r.id)} · ${escapeHtml(r.guest_name)}</div>
          </div>
          <button onclick="document.getElementById('sheet-overlay').remove()" class="stmt-close">×</button>
        </div>

        <div class="stmt-summary">
          <div class="stmt-sum-row"><span>Hóspede</span><span>${escapeHtml(r.guest_name)}${r.guest_company ? ` · ${escapeHtml(r.guest_company)}` : ''}</span></div>
          ${realEmail(r.guest_email) ? `<div class="stmt-sum-row"><span>Email</span><span>${escapeHtml(realEmail(r.guest_email))}</span></div>` : ''}
          ${r.guest_phone ? `<div class="stmt-sum-row"><span>Telefone</span><span>${escapeHtml(r.guest_phone)}</span></div>` : ''}
          ${r.guest_nif ? `<div class="stmt-sum-row"><span>NIF</span><span>${escapeHtml(r.guest_nif)}</span></div>` : ''}
          <div class="stmt-sum-row"><span>${d.accRows.length > 1 ? 'Alojamentos' : 'Alojamento'}</span><span>${escapeHtml(d.roomNames || r.accommodation_name || '—')}</span></div>
          <div class="stmt-sum-row"><span>Estadia</span><span>${sd(r.check_in)} → ${sd(r.check_out)} · ${r.nights} noite${r.nights !== 1 ? 's' : ''}</span></div>
          <div class="stmt-sum-row"><span>Ocupação</span><span>${r.num_adults || r.num_guests || 1} adulto${(r.num_adults || r.num_guests || 1) !== 1 ? 's' : ''}${r.num_children ? ` · ${r.num_children} criança${r.num_children !== 1 ? 's' : ''}` : ''}</span></div>
          <div class="stmt-sum-row"><span>Canal · Estado</span><span>${escapeHtml(r.channel || '—')} · ${escapeHtml(r.status || '—')}</span></div>
        </div>

        <table class="stmt-table">
          <thead><tr><th>Data</th><th>Descrição</th><th style="text-align:right;">Valor</th></tr></thead>
          <tbody>
            ${nightlyRows}
            ${extraRows}
            ${adjRow}
          </tbody>
        </table>

        <div class="stmt-footer">
          <div class="stmt-foot-row"><span style="font-weight:700;">TOTAL</span><span style="font-weight:700;">${fmt(d.total)}</span></div>
          ${stdLine}
        </div>

        <table class="stmt-table" style="margin-top:8px;">
          <thead><tr><th>Pagamento</th><th>Método</th><th style="text-align:right;">Valor</th></tr></thead>
          <tbody>${payRows}</tbody>
        </table>

        <div class="stmt-footer">
          <div class="stmt-foot-row"><span>Total pago</span><span style="color:#2e7d52;font-weight:700;">${fmt(d.paid)}</span></div>
          ${d.remaining > 0.01
            ? `<div class="stmt-foot-row"><span>Em falta</span><span style="color:#b03030;font-weight:700;">${fmt(d.remaining)}</span></div>`
            : `<div class="stmt-foot-row"><span style="color:#2e7d52;">✓ Pago na totalidade</span><span></span></div>`}
        </div>

        <div class="stmt-actions">
          <button class="btn btn-ghost btn-sm" onclick="document.getElementById('sheet-overlay').remove()">Fechar</button>
          <button class="btn btn-outline btn-sm" onclick="downloadReservationSheetXls()">${lcIcon('file-spreadsheet', 13)} XLS</button>
          <button class="btn btn-primary btn-sm" onclick="downloadReservationSheetPdf()">${lcIcon('file-down', 13)} PDF</button>
        </div>
      </div>
    </div>`;

  document.getElementById('sheet-overlay')?.remove();
  document.body.insertAdjacentHTML('beforeend', html);
  if (window.lucide) lucide.createIcons();
  window._sheetData = d;
}

function reservationSheetRows(d) {
  const { r, sd } = d;
  const rows = [];
  d.nightly.forEach(n => rows.push([sd(n.date), 'Noite', Number(n.price).toFixed(2)]));
  if (!d.nightly.length) rows.push([`${sd(r.check_in)} → ${sd(r.check_out)}`, `${r.nights} noites`, Number(d.baseAmount || d.total).toFixed(2)]);
  d.extras.forEach(e => rows.push(['—', e.name, e.amount.toFixed(2)]));
  if (Math.abs(d.adjustment) > 0.01) rows.push(['—', d.adjustment < 0 ? 'Desconto / ajuste' : 'Ajuste manual', d.adjustment.toFixed(2)]);
  return rows;
}

function downloadReservationSheetPdf() {
  const d = window._sheetData;
  if (!d) return;
  if (typeof window.jspdf === 'undefined') { toast('❌ Biblioteca jsPDF não carregada.', 'error'); return; }
  const { r, sd } = d;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFontSize(16);
  doc.setTextColor(132, 52, 36);
  doc.text('Ficha de Reserva', 14, 16);
  doc.setFontSize(10);
  doc.setTextColor(80);
  doc.text(`${r.id} · emitida a ${new Date().toLocaleDateString('pt-PT')}`, 14, 22);

  const info = [
    ['Hóspede', `${r.guest_name}${r.guest_company ? ` · ${r.guest_company}` : ''}`],
    ...(realEmail(r.guest_email) ? [['Email', realEmail(r.guest_email)]] : []),
    ...(r.guest_phone ? [['Telefone', r.guest_phone]] : []),
    ...(r.guest_nif ? [['NIF', r.guest_nif]] : []),
    [d.accRows.length > 1 ? 'Alojamentos' : 'Alojamento', d.roomNames || r.accommodation_name || '—'],
    ['Estadia', `${sd(r.check_in)} → ${sd(r.check_out)} · ${r.nights} noite${r.nights !== 1 ? 's' : ''}`],
    ['Ocupação', `${r.num_adults || r.num_guests || 1} adultos${r.num_children ? ` · ${r.num_children} crianças` : ''}`],
    ['Canal · Estado', `${r.channel || '—'} · ${r.status || '—'}`],
  ];
  doc.autoTable({ body: info, startY: 28, theme: 'plain', styles: { fontSize: 9, cellPadding: 1.5 }, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 40 } } });

  doc.autoTable({
    head: [['Data', 'Descrição', 'Valor (€)']],
    body: reservationSheetRows(d),
    startY: doc.lastAutoTable.finalY + 4,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [132, 52, 36] },
    columnStyles: { 2: { halign: 'right' } },
  });

  const totals = [['TOTAL', d.total.toFixed(2)]];
  if (d.stdDiff !== null && Math.abs(d.stdDiff) > 0.005) {
    totals.push([`Padrão do calendário dinâmico: ${d.standardTotal.toFixed(2)}`, `${d.stdDiff < 0 ? 'Desconto' : 'Acréscimo'} ${Math.abs(d.stdDiff).toFixed(2)}`]);
  }
  doc.autoTable({ body: totals, startY: doc.lastAutoTable.finalY + 2, theme: 'plain', styles: { fontSize: 10, fontStyle: 'bold', cellPadding: 1.5 }, columnStyles: { 1: { halign: 'right' } } });

  doc.autoTable({
    head: [['Pagamento', 'Método', 'Valor (€)']],
    body: d.payments.length
      ? d.payments.map(p => [p.payment_date ? sd(p.payment_date) : '—', p.method || '—', Number(p.amount).toFixed(2)])
      : [['—', 'Sem pagamentos registados', '0.00']],
    startY: doc.lastAutoTable.finalY + 4,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [132, 52, 36] },
    columnStyles: { 2: { halign: 'right' } },
  });

  doc.autoTable({
    body: [['Total pago', d.paid.toFixed(2)], ['Em falta', Math.max(0, d.remaining).toFixed(2)]],
    startY: doc.lastAutoTable.finalY + 2,
    theme: 'plain',
    styles: { fontSize: 10, fontStyle: 'bold', cellPadding: 1.5 },
    columnStyles: { 1: { halign: 'right' } },
  });

  doc.save(`ficha-reserva-${r.id}.pdf`);
  toast('📄 PDF exportado!', 'success');
}

function downloadReservationSheetXls() {
  const d = window._sheetData;
  if (!d) return;
  if (typeof XLSX === 'undefined') { toast('❌ Biblioteca XLSX não carregada.', 'error'); return; }
  const { r, sd } = d;
  const aoa = [
    ['Ficha de Reserva', r.id],
    ['Hóspede', `${r.guest_name}${r.guest_company ? ` · ${r.guest_company}` : ''}`],
    ['Email', realEmail(r.guest_email) || '—'],
    ['Telefone', r.guest_phone || '—'],
    ['NIF', r.guest_nif || '—'],
    [d.accRows.length > 1 ? 'Alojamentos' : 'Alojamento', d.roomNames || r.accommodation_name || '—'],
    ['Estadia', `${sd(r.check_in)} → ${sd(r.check_out)}`],
    ['Noites', r.nights],
    ['Ocupação', `${r.num_adults || r.num_guests || 1} adultos · ${r.num_children || 0} crianças`],
    [],
    ['Data', 'Descrição', 'Valor (€)'],
    ...reservationSheetRows(d).map(row => [row[0], row[1], Number(row[2])]),
    ['', 'TOTAL', d.total],
    ...(d.stdDiff !== null && Math.abs(d.stdDiff) > 0.005
      ? [['', `Padrão do calendário dinâmico`, d.standardTotal], ['', d.stdDiff < 0 ? 'Desconto face ao padrão' : 'Acréscimo face ao padrão', d.stdDiff]]
      : []),
    [],
    ['Pagamento', 'Método', 'Valor (€)'],
    ...(d.payments.length
      ? d.payments.map(p => [p.payment_date ? sd(p.payment_date) : '—', p.method || '—', Number(p.amount)])
      : [['—', 'Sem pagamentos', 0]]),
    ['', 'Total pago', d.paid],
    ['', 'Em falta', Math.max(0, d.remaining)],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 24 }, { wch: 34 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Ficha');
  XLSX.writeFile(wb, `ficha-reserva-${r.id}.xlsx`);
  toast('📊 XLS exportado!', 'success');
}

async function openAccountStatement(resId) {
  let r;
  try {
    const data = await apiGet(`/api/reservations/${resId}`);
    r = data.data;
  } catch {
    toast('❌ Erro ao carregar extrato', 'error');
    return;
  }

  const payments = r.payments || [];
  const total = Number(r.total_amount || 0);
  const paid = Number(r.amount_paid || 0);
  const remaining = total - paid;
  const fmt = v => `€${Number(v).toFixed(2)}`;
  const sd = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
  const methodLabel = { transferencia: 'Transferência', mbway: 'MBWay', numerario: 'Numerário', cartao: 'Cartão' };

  // Saldo corrente linha a linha (extrato bancário)
  let running = total;
  const rows = payments.length
    ? payments.map(p => {
        running -= Number(p.amount || 0);
        return `
        <tr>
          <td>${p.payment_date ? sd(p.payment_date) : '—'}</td>
          <td>${methodLabel[p.method] || p.method || '—'}</td>
          <td>${p.notes || '—'}</td>
          <td style="text-align:right;font-weight:600;color:#2e7d52;">${fmt(p.amount)}</td>
          <td style="text-align:right;color:${running > 0.01 ? '#b03030' : '#2e7d52'};">${fmt(Math.max(0, running))}</td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:16px;">Sem pagamentos registados</td></tr>`;

  const html = `
    <div id="stmt-overlay" style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1300;display:flex;align-items:center;justify-content:center;padding:16px;" onclick="if(event.target===this)this.remove()">
      <div class="stmt-modal">
        <div class="stmt-header">
          <div>
            <div class="stmt-title">Conta Corrente</div>
            <div class="stmt-subtitle">${escapeHtml(r.id)} · ${escapeHtml(r.guest_name)}</div>
          </div>
          <button onclick="document.getElementById('stmt-overlay').remove()" class="stmt-close">×</button>
        </div>

        <div class="stmt-summary">
          <div class="stmt-sum-row">
            <span>Alojamento</span><span>${escapeHtml(r.accommodation_name || '—')}</span>
          </div>
          <div class="stmt-sum-row">
            <span>Check-in</span><span>${sd(r.check_in)}</span>
          </div>
          <div class="stmt-sum-row">
            <span>Check-out</span><span>${sd(r.check_out)}</span>
          </div>
          <div class="stmt-sum-row">
            <span>Noites</span><span>${r.nights}</span>
          </div>
          <div class="stmt-sum-row stmt-sum-total">
            <span>Total da reserva</span><span>${fmt(total)}</span>
          </div>
        </div>

        <table class="stmt-table">
          <thead>
            <tr>
              <th>Data</th><th>Método</th><th>Notas</th><th style="text-align:right;">Valor</th><th style="text-align:right;">Saldo</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>

        <div class="stmt-footer">
          <div class="stmt-foot-row">
            <span>Total pago</span>
            <span style="color:#2e7d52;font-weight:700;">${fmt(paid)}</span>
          </div>
          ${remaining > 0.01 ? `<div class="stmt-foot-row">
            <span>Em falta</span>
            <span style="color:#b03030;font-weight:700;">${fmt(remaining)}</span>
          </div>` : `<div class="stmt-foot-row"><span style="color:#2e7d52;">✓ Pago na totalidade</span><span></span></div>`}
        </div>

        <div class="stmt-actions">
          <button class="btn btn-ghost btn-sm" onclick="document.getElementById('stmt-overlay').remove()">Fechar</button>
          <button class="btn btn-outline btn-sm" onclick="downloadStatementCsv('${resId}')">CSV</button>
          <button class="btn btn-outline btn-sm" onclick="downloadStatementXls()">${lcIcon('file-spreadsheet', 13)} XLS</button>
          <button class="btn btn-primary btn-sm" onclick="downloadStatementPdf()">${lcIcon('file-down', 13)} PDF</button>
        </div>
      </div>
    </div>`;

  document.getElementById('stmt-overlay')?.remove();
  document.body.insertAdjacentHTML('beforeend', html);
  if (window.lucide) lucide.createIcons();

  // Store data for CSV/XLS/PDF download
  window._stmtData = { r, payments };
}

function downloadStatementPdf() {
  const { r, payments } = window._stmtData || {};
  if (!r) return;
  if (typeof window.jspdf === 'undefined') { toast('❌ Biblioteca jsPDF não carregada.', 'error'); return; }
  const sd = d => d ? new Date(d.slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
  const total = Number(r.total_amount || 0);
  const paid = Number(r.amount_paid || 0);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFontSize(16);
  doc.setTextColor(132, 52, 36);
  doc.text('Conta Corrente', 14, 16);
  doc.setFontSize(10);
  doc.setTextColor(80);
  doc.text(`${r.id} · ${r.guest_name} · emitida a ${new Date().toLocaleDateString('pt-PT')}`, 14, 22);

  doc.autoTable({
    body: [
      ['Alojamento', r.accommodation_name || '—'],
      ['Estadia', `${sd(r.check_in)} → ${sd(r.check_out)} · ${r.nights} noite${r.nights !== 1 ? 's' : ''}`],
      ['Total da reserva', `€${total.toFixed(2)}`],
    ],
    startY: 28, theme: 'plain', styles: { fontSize: 9, cellPadding: 1.5 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 40 } },
  });

  let running = total;
  doc.autoTable({
    head: [['Data', 'Método', 'Notas', 'Valor (€)', 'Saldo (€)']],
    body: (payments || []).length
      ? payments.map(p => {
          running -= Number(p.amount || 0);
          return [p.payment_date ? sd(p.payment_date) : '—', p.method || '—', p.notes || '—', Number(p.amount).toFixed(2), Math.max(0, running).toFixed(2)];
        })
      : [['—', '—', 'Sem pagamentos registados', '0.00', total.toFixed(2)]],
    startY: doc.lastAutoTable.finalY + 4,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [132, 52, 36] },
    columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' } },
  });

  doc.autoTable({
    body: [['Total pago', `€${paid.toFixed(2)}`], ['Em falta', `€${Math.max(0, total - paid).toFixed(2)}`]],
    startY: doc.lastAutoTable.finalY + 2, theme: 'plain',
    styles: { fontSize: 10, fontStyle: 'bold', cellPadding: 1.5 },
    columnStyles: { 1: { halign: 'right' } },
  });

  doc.save(`conta-corrente-${r.id}.pdf`);
  toast('📄 PDF exportado!', 'success');
}

function downloadStatementXls() {
  const { r, payments } = window._stmtData || {};
  if (!r) return;
  if (typeof XLSX === 'undefined') { toast('❌ Biblioteca XLSX não carregada.', 'error'); return; }
  const sd = d => d ? new Date(d.slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
  const total = Number(r.total_amount || 0);
  const paid = Number(r.amount_paid || 0);
  let running = total;
  const aoa = [
    ['Conta Corrente', r.id],
    ['Hóspede', r.guest_name],
    ['Alojamento', r.accommodation_name || '—'],
    ['Estadia', `${sd(r.check_in)} → ${sd(r.check_out)}`],
    ['Total da reserva', total],
    [],
    ['Data', 'Método', 'Notas', 'Valor (€)', 'Saldo (€)'],
    ...((payments || []).length
      ? payments.map(p => {
          running -= Number(p.amount || 0);
          return [p.payment_date ? sd(p.payment_date) : '—', p.method || '—', p.notes || '—', Number(p.amount), Math.max(0, running)];
        })
      : [['—', '—', 'Sem pagamentos', 0, total]]),
    ['', '', 'Total pago', paid, ''],
    ['', '', 'Em falta', Math.max(0, total - paid), ''],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 14 }, { wch: 16 }, { wch: 30 }, { wch: 12 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Conta Corrente');
  XLSX.writeFile(wb, `conta-corrente-${r.id}.xlsx`);
  toast('📊 XLS exportado!', 'success');
}

function downloadStatementCsv(resId) {
  const { r, payments } = window._stmtData || {};
  if (!r) return;
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [
    ['Reserva', 'Hóspede', 'Check-in', 'Check-out', 'Noites', 'Total'].map(esc).join(','),
    [r.id, r.guest_name, r.check_in, r.check_out, r.nights, Number(r.total_amount).toFixed(2)].map(esc).join(','),
    '',
    ['Data pagamento', 'Método', 'Notas', 'Valor'].map(esc).join(','),
    ...(payments.length
      ? payments.map(p => [p.payment_date || '', p.method || '', p.notes || '', Number(p.amount).toFixed(2)].map(esc).join(','))
      : [['"—"', '"—"', '"—"', '"0.00"'].join(',')]),
    '',
    ['', '', 'Total pago', Number(r.amount_paid).toFixed(2)].map(esc).join(','),
    ['', '', 'Em falta', Math.max(0, Number(r.total_amount) - Number(r.amount_paid)).toFixed(2)].map(esc).join(','),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `extrato-${resId}.csv` });
  a.click();
  URL.revokeObjectURL(a.href);
}

async function openGuestCard(guestId, reservationId) {
  if (!guestId) {
    toast('⚠️ Hóspede não encontrado na base de dados', 'info');
    return;
  }
  showView('hospedes');
  await new Promise(r => setTimeout(r, 150));
  if (typeof showHospedeDetail === 'function') {
    showHospedeDetail(guestId);
  }
}

