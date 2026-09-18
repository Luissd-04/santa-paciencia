function _getFilteredReservasForExport() {
  const q  = (document.getElementById('search-input')?.value || '').toLowerCase();
  const fe = document.getElementById('filter-estado')?.value || '';
  const fs = document.getElementById('filter-suite')?.value || '';
  const fc = document.getElementById('filter-canal')?.value || '';
  const fp = document.getElementById('filter-pagamento')?.value || '';
  const fd = normalizeIsoDateValue(document.getElementById('filter-date-from')?.value || '');
  const ft = normalizeIsoDateValue(document.getElementById('filter-date-to')?.value || '');
  return reservas.filter(r => {
    const matchQ = !q  || (r.guest_name + ' ' + r.id + ' ' + (r.guest_email||'') + ' ' + r.accommodation_name).toLowerCase().includes(q);
    return matchQ &&
      (!fe || r.status === fe) &&
      (!fs || r.accommodation_id === fs) &&
      (!fc || r.channel === fc) &&
      (!fp || r.payment_status === fp) &&
      (!fd || r.check_in >= fd) &&
      (!ft || r.check_out <= ft);
  });
}

function exportReservasXLS() {
  if (typeof XLSX === 'undefined') { toast('❌ Biblioteca XLSX não carregada.', 'error'); return; }
  const data = _getFilteredReservasForExport();
  const rows = data.map(r => ({
    'ID':             r.id,
    'Hóspede':        r.guest_name,
    'Email':          r.guest_email || '',
    'Alojamento':     r.accommodation_name,
    'Check-in':       r.check_in,
    'Check-out':      r.check_out,
    'Noites':         r.nights,
    'Hóspedes':       r.num_guests,
    'Canal':          r.channel,
    'Estado':         r.status,
    'Pagamento':      r.payment_status,
    'Total (€)':      r.total_amount,
    'Pago (€)':       r.amount_paid,
    'Em falta (€)':   Math.max(0, r.total_amount - r.amount_paid),
    'Notas':          r.notes || '',
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Reservas');
  XLSX.writeFile(wb, `reservas_${new Date().toISOString().slice(0,10)}.xlsx`);
  toast('📊 Excel exportado!', 'success');
}

async function importReservasXLS(input) {
  if (typeof XLSX === 'undefined') { toast('❌ Biblioteca XLSX não carregada.', 'error'); return; }
  const file = input.files[0];
  if (!file) return;
  input.value = '';

  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      if (!rows.length) { toast('⚠️ Ficheiro vazio.', 'error'); return; }

      const pick = (row, ...keys) => {
        for (const k of keys) {
          if (row[k] !== undefined && row[k] !== '') return String(row[k]).trim();
        }
        return '';
      };
      const normalizeStatus = value => {
        const v = String(value || '').toLowerCase();
        if (v.includes('cancel')) return 'cancelada';
        if (v.includes('pre')) return 'pre_checkin';
        if (v.includes('pagamento')) return 'aguardar_pagamento';
        if (v.includes('pend')) return 'pendente';
        return 'confirmada';
      };
      const normalizePayment = value => {
        const v = String(value || '').toLowerCase();
        if (v.includes('confirm') || v.includes('pago') || v.includes('completo')) return 'confirmado';
        if (v.includes('parc')) return 'parcial';
        return 'pendente';
      };
      const normalizeImportDate = value => {
        const iso = normalizeIsoDateValue(value);
        if (iso) return iso;
        const serial = Number(value);
        const parsed = Number.isFinite(serial) && serial > 20000 ? XLSX.SSF?.parse_date_code?.(serial) : null;
        if (!parsed) return '';
        return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
      };
      const asAmount = value => parseFloat(String(value || '').replace(',', '.')) || 0;

      let created = 0, skipped = 0;
      for (const row of rows) {
        const guestName = pick(row, 'Hóspede', 'Hospede', 'guest_name', 'Nome');
        const guestEmail = pick(row, 'Email', 'guest_email') || `reserva_${Date.now()}_${created}@sem-email.local`;
        const checkIn = normalizeImportDate(pick(row, 'Check-in', 'check_in'));
        const checkOut = normalizeImportDate(pick(row, 'Check-out', 'check_out'));
        const accKey = pick(row, 'Alojamento', 'accommodation_name', 'accommodation_id');
        const acc = accommodations.find(a => a.id === accKey || a.name === accKey);
        if (!guestName || !checkIn || !checkOut || !acc) { skipped++; continue; }

        const parts = guestName.split(' ');
        const amountPaid = asAmount(pick(row, 'Pago (€)', 'Pago', 'amount_paid'));
        try {
          await apiPost('/api/reservations', {
            guest: {
              name: guestName,
              first_name: parts[0] || guestName,
              last_name: parts.slice(1).join(' '),
              email: guestEmail,
              phone: pick(row, 'Telefone', 'Phone', 'phone') || null,
              country: pick(row, 'País', 'Pais', 'country') || null,
              nationality: pick(row, 'País', 'Pais', 'country') || null,
            },
            accommodation_id: acc.id,
            check_in: checkIn,
            check_out: checkOut,
            num_guests: parseInt(pick(row, 'Hóspedes', 'Hospedes', 'num_guests'), 10) || 1,
            breakfast_included: false,
            channel: pick(row, 'Canal', 'channel') || 'direto',
            status: normalizeStatus(pick(row, 'Estado', 'status')),
            payment_status: normalizePayment(pick(row, 'Pagamento', 'payment_status')),
            payment_method: pick(row, 'Método pagamento', 'Metodo pagamento', 'payment_method') || null,
            amount_paid: amountPaid,
            notes: pick(row, 'Notas', 'notes'),
            rgpd_consent: true,
            guests_data: [],
          });
          created++;
        } catch {
          skipped++;
        }
      }
      toast(`✅ ${created} reservas importadas${skipped ? `, ${skipped} ignoradas` : ''}.`, 'success');
      await loadReservas();
      if (typeof renderCalView === 'function') renderCalView();
      if (typeof renderDashboard === 'function') renderDashboard();
    } catch (err) {
      toast('❌ Erro ao ler ficheiro: ' + err.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

function exportReservasPDF() {
  if (typeof window.jspdf === 'undefined') { toast('❌ Biblioteca jsPDF não carregada.', 'error'); return; }
  const { jsPDF } = window.jspdf;
  const doc  = new jsPDF({ orientation: 'landscape' });
  const data = _getFilteredReservasForExport();
  doc.setFontSize(16); doc.text('Reservas — Santa Paciência', 14, 18);
  doc.setFontSize(10); doc.text(`Exportado em ${new Date().toLocaleDateString('pt-PT')} · ${data.length} reserva${data.length !== 1 ? 's' : ''}`, 14, 26);
  doc.autoTable({
    startY: 32,
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [132, 52, 36], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [252, 250, 248] },
    head: [['ID','Hóspede','Alojamento','Check-in','Check-out','Noites','Canal','Estado','Total']],
    body: data.map(r => [
      r.id, r.guest_name, r.accommodation_name,
      r.check_in, r.check_out, r.nights, r.channel, r.status,
      '€' + Number(r.total_amount).toFixed(2),
    ]),
  });
  doc.save(`reservas_${new Date().toISOString().slice(0,10)}.pdf`);
  toast('📄 PDF exportado!', 'success');
}

