function collectExtraGuests() {
  return Array.from(document.querySelectorAll('.extra-guest-row')).map(row => {
    const nomeCompleto = (row.querySelector('[data-field="nome_completo"]')?.value || '').trim();
    const parts        = nomeCompleto.split(' ');
    const tel_prefix   = row.querySelector('[data-field="tel_prefix"]')?.value  || '';
    const tel_num      = row.querySelector('[data-field="tel_num"]')?.value     || '';
    return {
      name:                     nomeCompleto,
      first_name:               parts[0] || '',
      last_name:                parts.slice(1).join(' '),
      email:                    row.querySelector('[data-field="email"]')?.value          || '',
      phone:                    tel_prefix + tel_num.replace(/\s/g, ''),
      nationality:              row.querySelector('[data-field="country"]')?.value        || '',
      country:                  row.querySelector('[data-field="country"]')?.value        || '',
      birth_date:               getBirthDateValue(row.querySelector('[data-field="birth_date"]')) || '',
      birth_city:               row.querySelector('[data-field="birth_city"]')?.value    || '',
      document_type:            row.querySelector('[data-field="doc_type"]')?.value      || '',
      document_number:          row.querySelector('[data-field="doc_number"]')?.value    || '',
      document_issuer_country:  row.querySelector('[data-field="doc_emissor"]')?.value   || '',
      nif:                      row.querySelector('[data-field="nif"]')?.value           || '',
    };
  }).filter(g => g.name || g.email);
}

// Total padrão do calendário dinâmico para as escolhas atuais (sem overrides,
// sem desconto) — a referência que nunca é usada para cobrar, só para comparar.
async function wizStandardTotal() {
  const alojId = document.getElementById('f-aloj')?.value;
  const suite = accommodations.find(a => a.id === alojId);
  const ci = normalizeIsoDateValue(document.getElementById('f-checkin')?.value);
  const co = normalizeIsoDateValue(document.getElementById('f-checkout')?.value);
  if (!suite || !ci || !co) return null;
  try {
    const periods = await loadWizPricingPeriods(alojId);
    const totals = window.ReservationPricing.calculateReservationTotal(suite, servicosData, {
      check_in: ci,
      check_out: co,
      num_guests: parseInt(document.getElementById('f-num-hospedes')?.value) || 1,
      breakfast_included: document.getElementById('f-breakfast')?.value === 'true',
      birth_dates: wizEffectiveBirthDates(),
      pricing_periods: periods,
    });
    return totals.totalAmount;
  } catch {
    return null;
  }
}

async function saveReserva() {
  const nomeCompleto = document.getElementById('f-nome-completo').value.trim();
  const nomeParts    = nomeCompleto.split(' ');
  const primeiroNome = nomeParts[0] || '';
  const apelido      = nomeParts.slice(1).join(' ');
  const email        = document.getElementById('f-email').value.trim();
  const telPrefix    = document.getElementById('f-tel-prefix')?.value || '';
  const telNum       = document.getElementById('f-tel-num')?.value.trim() || '';
  const tel          = telPrefix + telNum.replace(/\s/g, '');
  const pais         = document.getElementById('f-pais').value.trim();
  const checkin  = normalizeIsoDateValue(document.getElementById('f-checkin').value);
  const checkout = normalizeIsoDateValue(document.getElementById('f-checkout').value);
  const alojId   = document.getElementById('f-aloj').value;

  const birthDate = getBirthDateValue(document.getElementById('f-nascimento'));
  if (!nomeCompleto) { toast('Por favor insira o nome do hóspede.', 'error'); return; }
  if (!checkin || !checkout) { toast('Por favor selecione as datas.', 'error'); return; }
  if (checkin >= checkout) { toast('O check-out deve ser depois do check-in.', 'error'); return; }
  const selectedAccommodation = accommodations.find(a => a.id === alojId);
  const requestedGuests = parseInt(document.getElementById('f-num-hospedes').value) || 1;
  if (selectedAccommodation?.max_guests && requestedGuests > selectedAccommodation.max_guests) {
    toast(`Este alojamento permite no máximo ${selectedAccommodation.max_guests} hóspede${selectedAccommodation.max_guests !== 1 ? 's' : ''}.`, 'error');
    return;
  }

  // Confirmação quando os valores da estadia foram alterados face ao padrão
  // do calendário dinâmico (overrides por noite, total manual ou desconto).
  const hasValueEdits = _manualTotalOverride != null
    || Object.keys(_nightlyOverrides).length > 0
    || (parseFloat(document.getElementById('f-discount-val')?.value) || 0) > 0;
  if (hasValueEdits && typeof confirmPriceChange === 'function') {
    const standardTotal = await wizStandardTotal();
    const newTotal = parseFloat(document.getElementById('f-total')?.value);
    if (standardTotal != null && !isNaN(newTotal) && Math.abs(newTotal - standardTotal) > 0.005) {
      const ok = await confirmPriceChange({
        standardTotal,
        newTotal,
        editedAt: _editingPriceInfo?.price_edited_at || null,
        editedByName: _editingPriceInfo?.price_edited_by_name || null,
      });
      if (!ok) return;
    }
  }

  const nomeFull = nomeCompleto;
  const btn = document.getElementById('btn-guardar');
  AppUI.setButtonLoading(btn, true, 'A guardar...');

  try {
    const numAdultos = parseInt(document.getElementById('f-num-adultos')?.value) || 1;
    const numCriancas = parseInt(document.getElementById('f-num-criancas')?.value) || 0;

    const discountVal = parseFloat(document.getElementById('f-discount-val')?.value) || 0;
    const computedTotal = parseFloat(document.getElementById('f-total')?.value);
    // Enviar total_amount fixo quando há desconto ou total manual (ambos já refletidos
    // em f-total). Caso contrário, o servidor recalcula a partir de nightly_prices + extras.
    const forceTotal = (discountVal > 0 || _manualTotalOverride != null) && !isNaN(computedTotal);
    const manualTotalOverride = forceTotal ? computedTotal : undefined;
    const nightlyPricesPayload = Array.isArray(_nightlyPrices) ? _nightlyPrices : [];

    if (editingId) {
      const body = {
        check_in: checkin,
        check_out: checkout,
        num_adults: numAdultos,
        num_children: numCriancas,
        num_guests: numAdultos + numCriancas,
        breakfast_included: document.getElementById('f-breakfast')?.value === 'true',
        channel: document.getElementById('f-canal').value,
        status: document.getElementById('f-estado').value,
        payment_status: document.getElementById('f-payment-status').value,
        payment_method: document.getElementById('f-pagamento').value,
        amount_paid: parseFloat(document.getElementById('f-amount-paid')?.value) || 0,
        payment_date: normalizeIsoDateValue(document.getElementById('f-payment-date')?.value) || null,
        notes: document.getElementById('f-notas').value,
        guests_data: collectExtraGuests(),
        nightly_prices: nightlyPricesPayload,
        ...(manualTotalOverride !== undefined ? { total_amount: manualTotalOverride } : {}),
        ...((_wizExtraRooms.length > 0 || _wizHadMultiSuiteOnLoad)
          ? { accommodations_data: _wizExtraRooms.length > 0 ? _wizBuildAccommodationsData(alojId, selectedAccommodation?.name) : [] }
          : {}),
        guest: {
          name: nomeFull, first_name: primeiroNome, last_name: apelido,
          email, phone: tel, nationality: pais, country: pais,
          document_type:            document.getElementById('f-doc-tipo')?.value          || null,
          document_number:          document.getElementById('f-doc-num')?.value           || null,
          document_issuer_country:  document.getElementById('f-doc-emissor')?.value       || null,
          birth_date:               birthDate || null,
          birth_city:               document.getElementById('f-local-nascimento')?.value  || null,
          nif:                      document.getElementById('f-nif')?.value               || null,
          company:                  document.getElementById('f-empresa')?.value           || null,
          address:                  document.getElementById('f-morada')?.value            || null,
          postal_code:              document.getElementById('f-cp')?.value                || null,
          city:                     document.getElementById('f-cidade')?.value            || null,
        },
      };
      const res = await apiPut(`/api/reservations/${editingId}`, body);
      if (res.success) {
        toast('✅ Reserva atualizada!', 'success');
        const wasPage = _wizardPageMode;
        const retId = _returnToDetailId;
        closeModal();
        await loadReservas();
        // Em modo página viemos do detalhe — reabri-lo com os dados atualizados.
        if (wasPage && retId && typeof showDetail === 'function') showDetail(retId);
        if (typeof renderCalView === 'function') renderCalView();
        renderDashboard();
        if (typeof loadNotifications === 'function') loadNotifications();
      } else {
        toast('❌ ' + (res.error || 'Erro ao atualizar reserva.'), 'error');
      }
    } else {
      const body = {
        guest: {
          name: nomeFull, first_name: primeiroNome, last_name: apelido,
          email, phone: tel, nationality: pais, country: pais,
          document_type:            document.getElementById('f-doc-tipo')?.value          || null,
          document_number:          document.getElementById('f-doc-num')?.value           || null,
          document_issuer_country:  document.getElementById('f-doc-emissor')?.value       || null,
          birth_date:               birthDate || null,
          birth_city:               document.getElementById('f-local-nascimento')?.value  || null,
          nif:                      document.getElementById('f-nif')?.value               || null,
          company:                  document.getElementById('f-empresa')?.value           || null,
          address:                  document.getElementById('f-morada')?.value            || null,
          postal_code:              document.getElementById('f-cp')?.value                || null,
          city:                     document.getElementById('f-cidade')?.value            || null,
        },
        accommodation_id: alojId,
        check_in: checkin,
        check_out: checkout,
        num_adults: numAdultos,
        num_children: numCriancas,
        num_guests: numAdultos + numCriancas,
        breakfast_included: document.getElementById('f-breakfast')?.value === 'true',
        channel: document.getElementById('f-canal').value,
        status: document.getElementById('f-estado').value,
        payment_status: document.getElementById('f-payment-status').value,
        payment_method: document.getElementById('f-pagamento').value,
        amount_paid: parseFloat(document.getElementById('f-amount-paid')?.value) || 0,
        payment_date: normalizeIsoDateValue(document.getElementById('f-payment-date')?.value) || null,
        notes: document.getElementById('f-notas').value,
        voucher_code: document.getElementById('f-voucher-code')?.value.trim().toUpperCase() || null,
        rgpd_consent: true,
        guests_data: collectExtraGuests(),
        nightly_prices: nightlyPricesPayload,
        ...(manualTotalOverride !== undefined ? { total_amount: manualTotalOverride } : {}),
      };
      if (_wizExtraRooms.length) {
        body.accommodations_data = _wizBuildAccommodationsData(alojId, selectedAccommodation?.name);
        const combined = Number(document.getElementById('f-total')?.value);
        if (Number.isFinite(combined)) body.total_amount = combined;
      }
      const res = await apiPost('/api/reservations', body);
      if (res.success) {
        const extraRoomsWarning = '';
        if (extraRoomsWarning) {
          toast(`⚠️ Reserva criada, mas os quartos extra não foram associados (${extraRoomsWarning}). Usa "Editar alojamento" no detalhe da reserva para os adicionar.`, 'error');
        } else {
          toast('✅ Reserva criada com sucesso!', 'success');
        }
        clearReservaDraft();
        closeModal();
        await loadReservas();
        if (typeof renderCalView === 'function') renderCalView();
        renderDashboard();
        if (typeof loadNotifications === 'function') loadNotifications();
      } else {
        toast('❌ ' + (res.error || 'Erro ao criar reserva.'), 'error');
      }
    }
  } catch (e) {
    toast('❌ ' + (e?.payload?.error || e?.message || 'Erro de ligação ao servidor.'), 'error');
  } finally {
    AppUI.setButtonLoading(btn, false);
  }
}

// Pré-validação do voucher no formulário de reserva manual (botão "Verificar").
// O código é sempre revalidado no backend ao submeter; isto é só feedback imediato.
async function verifyBackofficeVoucher() {
  const code = (document.getElementById('f-voucher-code')?.value || '').trim().toUpperCase();
  const statusEl = document.getElementById('f-voucher-status');
  if (!statusEl) return;

  statusEl.style.display = 'block';

  if (!code) {
    statusEl.style.background = '#f5f5f5';
    statusEl.style.color = '#888';
    statusEl.textContent = 'Introduza um código de voucher.';
    return;
  }

  statusEl.style.background = '#f5f5f5';
  statusEl.style.color = '#666';
  statusEl.textContent = 'A verificar...';
  try {
    const res = await apiGet(`/api/vouchers/validate?code=${encodeURIComponent(code)}`);
    const voucher = res.data;
    const disc = voucher.type === 'discount_pct'
      ? `${voucher.value}% de desconto`
      : `€${Number(voucher.value).toFixed(2)} de desconto`;
    statusEl.style.background = '#f0faf4';
    statusEl.style.color = '#2d6a4f';
    statusEl.textContent = `✓ ${voucher.description ? voucher.description + ' · ' : ''}${disc}`;
  } catch (err) {
    statusEl.style.background = '#fef0f0';
    statusEl.style.color = '#c0392b';
    statusEl.textContent = err?.payload?.error || 'Voucher inválido ou já utilizado';
  }
}
