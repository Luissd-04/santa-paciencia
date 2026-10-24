// Estado privado; interface partilhada em AppModules.reservas.
(() => {
AppModules.define('reservas', {
  collectExtraGuests: { get: () => collectExtraGuests },
  resetWizQuote: { get: () => resetWizQuote },
  saveReserva: { get: () => saveReserva },
  scheduleWizQuote: { get: () => scheduleWizQuote },
  wizVoucherActive: { get: () => wizVoucherActive },
  verifyBackofficeVoucher: { get: () => verifyBackofficeVoucher },
});

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
      birth_date:               AppModules.reservas.getBirthDateValue(row.querySelector('[data-field="birth_date"]')) || '',
      birth_city:               row.querySelector('[data-field="birth_city"]')?.value    || '',
      document_type:            row.querySelector('[data-field="doc_type"]')?.value      || '',
      document_number:          row.querySelector('[data-field="doc_number"]')?.value    || '',
      document_issuer_country:  row.querySelector('[data-field="doc_emissor"]')?.value   || '',
      nif:                      row.querySelector('[data-field="nif"]')?.value           || '',
      // Ficha já gravada: sem o id, cada gravação criaria um novo acompanhante.
      ...(row.dataset.guestId ? { id: row.dataset.guestId } : {}),
    };
  }).filter(g => g.name || g.email);
}

function guestPayload() {
  const nomeCompleto = document.getElementById('f-nome-completo').value.trim();
  const nomeParts = nomeCompleto.split(' ');
  const telPrefix = document.getElementById('f-tel-prefix')?.value || '';
  const telNum = document.getElementById('f-tel-num')?.value.trim() || '';
  const pais = document.getElementById('f-pais').value.trim();
  return {
    name: nomeCompleto, first_name: nomeParts[0] || '', last_name: nomeParts.slice(1).join(' '),
    email: document.getElementById('f-email').value.trim(), phone: telPrefix + telNum.replace(/\s/g, ''),
    nationality: pais, country: pais,
    document_type:            document.getElementById('f-doc-tipo')?.value          || null,
    document_number:          document.getElementById('f-doc-num')?.value           || null,
    document_issuer_country:  document.getElementById('f-doc-emissor')?.value       || null,
    birth_date:               AppModules.reservas.getBirthDateValue(document.getElementById('f-nascimento')) || null,
    birth_city:               document.getElementById('f-local-nascimento')?.value  || null,
    nif:                      document.getElementById('f-nif')?.value               || null,
    company:                  document.getElementById('f-empresa')?.value           || null,
    address:                  document.getElementById('f-morada')?.value            || null,
    postal_code:              document.getElementById('f-cp')?.value                || null,
    city:                     document.getElementById('f-cidade')?.value            || null,
  };
}

// Voucher cujo desconto o servidor recalcula: o da reserva em edição (sem
// total editado à mão) ou o código introduzido numa reserva nova.
function wizVoucherActive() {
  if (AppModules.core.editingId) return !!AppModules.reservas._wizVoucherManaged;
  return !!(document.getElementById('f-voucher-code')?.value || '').trim();
}

// Pedido de gravação a partir do formulário — o mesmo serve à pré-visualização
// do total, para o servidor calcular exatamente o que vai gravar.
function buildReservaPayload() {
  const checkin  = AppModules.core.normalizeIsoDateValue(document.getElementById('f-checkin').value);
  const checkout = AppModules.core.normalizeIsoDateValue(document.getElementById('f-checkout').value);
  const alojId   = document.getElementById('f-aloj').value;
  if (!checkin || !checkout || !alojId || checkin >= checkout) return null;
  const selectedAccommodation = AppModules.core.accommodations.find(a => a.id === alojId);
  const numAdultos = parseInt(document.getElementById('f-num-adultos')?.value) || 1;
  const numCriancas = parseInt(document.getElementById('f-num-criancas')?.value) || 0;
  const discountVal = parseFloat(document.getElementById('f-discount-val')?.value) || 0;
  const computedTotal = parseFloat(document.getElementById('f-total')?.value);
  // Enviar total_amount fixo quando há desconto ou total manual (ambos já refletidos
  // em f-total). Na edição, preços por noite ajustados também fixam o total: o
  // editor distribui pelas noites o total guardado e o servidor voltaria a
  // aplicar descontos sobre esses preços. Com voucher gerido pelo servidor as
  // noites não levam o desconto: o servidor recalcula-o sobre elas.
  const forceTotal = (discountVal > 0 || AppModules.reservas._manualTotalOverride != null
    || (AppModules.core.editingId && !AppModules.reservas._wizVoucherManaged && Object.keys(AppModules.reservas._nightlyOverrides).length > 0))
    && !isNaN(computedTotal);
  const common = {
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
    payment_date: AppModules.core.normalizeIsoDateValue(document.getElementById('f-payment-date')?.value) || null,
    notes: document.getElementById('f-notas').value,
    guests_data: collectExtraGuests(),
    nightly_prices: Array.isArray(AppModules.reservas._nightlyPrices) ? AppModules.reservas._nightlyPrices : [],
    ...(forceTotal ? { total_amount: computedTotal } : {}),
    guest: guestPayload(),
  };
  if (AppModules.core.editingId) {
    return {
      id: AppModules.core.editingId,
      body: {
        ...common,
        ...((AppModules.reservas._wizExtraRooms.length > 0 || AppModules.reservas._wizHadMultiSuiteOnLoad)
          ? { accommodations_data: AppModules.reservas._wizExtraRooms.length > 0 ? AppModules.reservas._wizBuildAccommodationsData(alojId, selectedAccommodation?.name) : [] }
          : {}),
      },
    };
  }
  const body = {
    ...common,
    accommodation_id: alojId,
    voucher_code: document.getElementById('f-voucher-code')?.value.trim().toUpperCase() || null,
    rgpd_consent: true,
    ...(AppModules.reservas._createIntentKey ? { idempotency_key: AppModules.reservas._createIntentKey } : {}),
  };
  if (AppModules.reservas._wizExtraRooms.length) {
    body.accommodations_data = AppModules.reservas._wizBuildAccommodationsData(alojId, selectedAccommodation?.name);
    const combined = Number(document.getElementById('f-total')?.value);
    if (Number.isFinite(combined)) body.total_amount = combined;
  }
  return { id: null, body };
}

// ── Total calculado pelo servidor ──
// A grelha por noite é calculada no browser (resposta imediata), mas o total
// mostrado e gravado vem do servidor para o mesmo pedido, voucher incluído.
// Cada pedido tem um número de sequência: uma resposta que chegue depois de
// outra mais recente é descartada.
let quoteSeq = 0;
let quoteTimer = null;
let quoteController = null;
let lastQuote = null;      // { key, data }
let pendingQuote = null;   // { seq, key, promise }

const quoteKey = payload => JSON.stringify([payload.id, payload.body]);
const euro = value => `€${Number(value || 0).toFixed(2)}`;

function setQuoteLine(text, tone = 'info') {
  const line = document.getElementById('resf-voucher-line');
  if (!line) return;
  line.hidden = !text;
  line.textContent = text || '';
  line.dataset.tone = tone;
}

function describeQuote(data) {
  const voucher = data.voucher;
  if (!voucher) return null;
  const label = voucher.type ? window.ReservationPricing.voucherLabel(voucher) : '';
  if (voucher.issue?.code === 'manual_total') return { text: `Voucher ${voucher.code}: ${voucher.issue.message}`, tone: 'warn' };
  if (voucher.issue) {
    const after = voucher.issue.blocking ? '' : ` Sem o voucher, o total passa a ${euro(data.total_amount)}; ao guardar é pedida confirmação.`;
    return { text: `${voucher.issue.message}${after}`, tone: 'warn' };
  }
  if (voucher.applied) {
    const discount = Number(voucher.discount_amount) > 0 ? `: −${euro(voucher.discount_amount)}` : '';
    return { text: `Voucher ${voucher.code}${label ? ` (${label})` : ''} aplicado${discount}. Total calculado pelo servidor.`, tone: 'ok' };
  }
  return null;
}

function applyWizQuote(data) {
  const total = Number(data.total_amount);
  document.getElementById('f-total').value = total.toFixed(2);
  const badge = document.getElementById('resf-total-badge');
  if (badge) { badge.textContent = euro(total); badge.removeAttribute('aria-busy'); }
  const manual = document.getElementById('f-total-manual');
  if (manual) {
    manual.classList.remove('is-pending');
    if (document.activeElement !== manual) manual.value = total.toFixed(2);
  }
  const info = describeQuote(data);
  setQuoteLine(info?.text, info?.tone);
  AppModules.reservas.updateWizSummary();
}

function markQuotePending() {
  const badge = document.getElementById('resf-total-badge');
  if (badge) { badge.textContent = 'A calcular…'; badge.setAttribute('aria-busy', 'true'); }
  document.getElementById('f-total-manual')?.classList.add('is-pending');
}

async function fetchWizQuote(seq, payload) {
  quoteController?.abort();
  const controller = quoteController = new AbortController();
  const key = quoteKey(payload);
  const url = payload.id ? `/api/reservations/${encodeURIComponent(payload.id)}/quote` : '/api/reservations/quote';
  try {
    const res = await AppModules.core.apiRequest(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload.body), signal: controller.signal,
    });
    if (seq !== quoteSeq) return null;          // resposta antiga
    lastQuote = { key, data: res.data };
    applyWizQuote(res.data);
    return res.data;
  } catch (error) {
    if (controller.signal.aborted || seq !== quoteSeq) return null;
    lastQuote = null;
    const badge = document.getElementById('resf-total-badge');
    if (badge) { badge.textContent = ''; badge.removeAttribute('aria-busy'); }
    setQuoteLine(error?.payload?.error || 'Não foi possível confirmar o total com o servidor.', 'warn');
    throw error;
  } finally {
    if (quoteController === controller) quoteController = null;
  }
}

// Chamado depois de cada recálculo local. Agrupa alterações rápidas (250 ms).
function scheduleWizQuote() {
  clearTimeout(quoteTimer);
  const payload = buildReservaPayload();
  const seq = ++quoteSeq;
  if (!payload) {
    quoteController?.abort();
    pendingQuote = null;
    lastQuote = null;
    setQuoteLine('');
    const badge = document.getElementById('resf-total-badge');
    badge?.removeAttribute('aria-busy');
    return;
  }
  const key = quoteKey(payload);
  if (lastQuote?.key === key && !pendingQuote) { applyWizQuote(lastQuote.data); return; }
  markQuotePending();
  const promise = new Promise((resolve, reject) => {
    quoteTimer = setTimeout(() => fetchWizQuote(seq, payload).then(resolve, reject), 250);
  });
  pendingQuote = { seq, key, promise };
  promise.catch(() => {}).finally(() => { if (pendingQuote?.seq === seq) pendingQuote = null; });
}

// Cotação do pedido exato que vai ser gravado (reutiliza a última se coincidir).
async function settleWizQuote(payload) {
  const key = quoteKey(payload);
  if (lastQuote?.key === key && !pendingQuote) return lastQuote.data;
  if (pendingQuote?.key === key) {
    clearTimeout(quoteTimer);
    const data = await fetchWizQuote(pendingQuote.seq, payload);
    if (data) return data;
  }
  clearTimeout(quoteTimer);
  const seq = ++quoteSeq;
  markQuotePending();
  return fetchWizQuote(seq, payload);
}

function resetWizQuote() {
  clearTimeout(quoteTimer);
  quoteSeq++;
  quoteController?.abort();
  lastQuote = null;
  pendingQuote = null;
  setQuoteLine('');
  document.getElementById('f-total-manual')?.classList.remove('is-pending');
}

async function saveReserva() {
  const nomeCompleto = document.getElementById('f-nome-completo').value.trim();
  const checkin  = AppModules.core.normalizeIsoDateValue(document.getElementById('f-checkin').value);
  const checkout = AppModules.core.normalizeIsoDateValue(document.getElementById('f-checkout').value);
  const alojId   = document.getElementById('f-aloj').value;

  if (!nomeCompleto) { AppModules.core.toast('Por favor insira o nome do hóspede.', 'error'); return; }
  if (!checkin || !checkout) { AppModules.core.toast('Por favor selecione as datas.', 'error'); return; }
  if (checkin >= checkout) { AppModules.core.toast('O check-out deve ser depois do check-in.', 'error'); return; }
  const selectedAccommodation = AppModules.core.accommodations.find(a => a.id === alojId);
  const requestedGuests = parseInt(document.getElementById('f-num-hospedes').value) || 1;
  if (selectedAccommodation?.max_guests && requestedGuests > selectedAccommodation.max_guests) {
    AppModules.core.toast(`Este alojamento permite no máximo ${selectedAccommodation.max_guests} hóspede${selectedAccommodation.max_guests !== 1 ? 's' : ''}.`, 'error');
    return;
  }

  const btn = document.getElementById('btn-guardar');
  AppUI.setButtonLoading(btn, true, 'A guardar...');
  try {
    const payload = buildReservaPayload();
    if (!payload) { AppModules.core.toast('Selecione o alojamento e as datas.', 'error'); return; }
    let quote;
    try {
      quote = await settleWizQuote(payload);
    } catch (error) {
      AppModules.core.toast('❌ ' + (error?.payload?.error || 'Não foi possível confirmar o total com o servidor.'), 'error');
      return;
    }
    if (!quote) return;   // substituída por uma alteração mais recente
    if (quote.voucher?.issue?.blocking) { AppModules.core.toast('❌ ' + quote.voucher.issue.message, 'error'); return; }

    let confirmed = false;
    if (quote.confirmation && typeof AppModules.core.confirmPriceChange === 'function') {
      // A nova estadia deixa de cumprir o voucher (ou o total foi editado à
      // mão): o operador confirma explicitamente o total calculado.
      const ok = await AppModules.core.confirmPriceChange({
        title: 'Confirmar o novo total?',
        intro: quote.confirmation.message,
        standardLabel: 'Total atual', standardTotal: Number(AppModules.reservas._editingStoredTotal ?? quote.total_amount),
        newTotal: quote.total_amount,
        editedAt: AppModules.reservas._editingPriceInfo?.price_edited_at || null,
        editedByName: AppModules.reservas._editingPriceInfo?.price_edited_by_name || null,
      });
      if (!ok) return;
      payload.body.total_amount = quote.total_amount;
      confirmed = true;
    }

    // Confirmação quando os valores da estadia foram alterados face ao padrão
    // do calendário dinâmico (overrides por noite, total manual ou desconto).
    const hasValueEdits = AppModules.reservas._manualTotalOverride != null
      || Object.keys(AppModules.reservas._nightlyOverrides).length > 0
      || (parseFloat(document.getElementById('f-discount-val')?.value) || 0) > 0;
    if (!confirmed && hasValueEdits && quote.standard_total != null && typeof AppModules.core.confirmPriceChange === 'function'
      && Math.abs(Number(quote.total_amount) - Number(quote.standard_total)) > 0.005) {
      const ok = await AppModules.core.confirmPriceChange({
        standardTotal: quote.standard_total,
        newTotal: quote.total_amount,
        editedAt: AppModules.reservas._editingPriceInfo?.price_edited_at || null,
        editedByName: AppModules.reservas._editingPriceInfo?.price_edited_by_name || null,
      });
      if (!ok) return;
    }
    // O servidor recusa (409) se calcular um total diferente do mostrado.
    payload.body.expected_total = quote.total_amount;

    let res;
    try {
      res = payload.id
        ? await AppModules.core.apiPut(`/api/reservations/${payload.id}`, payload.body)
        : await AppModules.core.apiPost('/api/reservations', payload.body);
    } catch (error) {
      if (error?.payload?.code === 'total_changed') { lastQuote = null; scheduleWizQuote(); }
      throw error;
    }
    if (!res.success) {
      AppModules.core.toast('❌ ' + (res.error || (payload.id ? 'Erro ao atualizar reserva.' : 'Erro ao criar reserva.')), 'error');
      return;
    }
    resetWizQuote();
    if (payload.id) {
      AppModules.core.toast('✅ Reserva atualizada!', 'success');
      const wasPage = AppModules.reservas._wizardPageMode;
      const retId = AppModules.reservas._returnToDetailId;
      AppModules.reservas.closeModal();
      await AppModules.reservas.loadReservas();
      // Em modo página viemos do detalhe — reabri-lo com os dados atualizados.
      if (wasPage && retId && typeof AppModules.reservas.showDetail === 'function') AppModules.reservas.showDetail(retId);
    } else {
      // replayed: a primeira tentativa já tinha criado a reserva (resposta perdida).
      AppModules.core.toast(res.replayed ? '✅ A reserva já tinha sido criada; não foi duplicada.' : '✅ Reserva criada com sucesso!', 'success');
      AppModules.reservas._createIntentKey = null;
      AppModules.reservas.clearReservaDraft();
      AppModules.reservas.closeModal();
      await AppModules.reservas.loadReservas();
    }
    if (typeof AppModules.calendario.renderCalView === 'function') AppModules.calendario.renderCalView();
    AppModules.core.renderDashboard();
    if (typeof AppModules.core.loadNotifications === 'function') AppModules.core.loadNotifications();
  } catch (e) {
    AppModules.core.toast('❌ ' + (e?.payload?.error || e?.message || 'Erro de ligação ao servidor.'), 'error');
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
    const res = await AppModules.core.apiGet(`/api/vouchers/validate?code=${encodeURIComponent(code)}`);
    const voucher = res.data;
    const disc = window.ReservationPricing.voucherLabel(voucher);
    statusEl.style.background = '#f0faf4';
    statusEl.style.color = '#2d6a4f';
    statusEl.textContent = `✓ ${voucher.description ? voucher.description + ' · ' : ''}${disc}`;
  } catch (err) {
    statusEl.style.background = '#fef0f0';
    statusEl.style.color = '#c0392b';
    statusEl.textContent = err?.payload?.error || 'Voucher inválido ou já utilizado';
  }
  AppModules.reservas.calcTotal();
}

})();
