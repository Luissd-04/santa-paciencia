(() => {
  const $ = id => document.getElementById(id);
  const token = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '');
  const fmtDate = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-PT', {
    day: '2-digit', month: 'short', year: 'numeric',
  }) : '—';
  const fmtMoney = value => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(Number(value || 0));
  const statusLabels = {
    pre_reserva: 'Pré-reserva', pendente: 'Pedido pendente', confirmada: 'Reserva confirmada',
    pre_checkin: 'Pré-check-in pendente', aguardar_pagamento: 'A aguardar pagamento',
    check_in: 'Estadia em curso', check_out: 'Estadia concluída', cancelada: 'Reserva cancelada',
  };
  const paymentLabels = { pendente: 'Pagamento pendente', parcial: 'Pagamento parcial', confirmado: 'Pago', pago: 'Pago', reembolsado: 'Reembolsado' };
  const returnState = new URLSearchParams(location.search).get('payment');
  let refreshTimer;
  let refreshCount = 0;
  let openingCheckout = false;

  function renderPayment(reservation) {
    const payment = reservation.online_payment || {};
    const button = $('rs-pay');
    const awaitingWebhook = returnState === 'return' && ['pending', 'processing'].includes(payment.status)
      && reservation.payment_status !== 'confirmado';
    $('rs-payment-panel').hidden = !payment.available && !payment.status && !awaitingWebhook;
    button.hidden = !payment.available || payment.processing || awaitingWebhook || payment.status === 'review_required';
    button.disabled = openingCheckout;
    button.textContent = openingCheckout ? 'A abrir pagamento…' : `Pagar ${fmtMoney(payment.amount_due)} online`;
    $('rs-test-note').hidden = !payment.test_mode || $('rs-payment-panel').hidden;
    const messages = {
      paid: 'Pagamento recebido. Obrigado!',
      failed: 'O pagamento não foi concluído. Pode tentar novamente.',
      expired: 'A sessão de pagamento expirou. Pode iniciar uma nova enquanto a reserva estiver disponível.',
      cancelled: 'O pagamento foi cancelado. Pode tentar novamente se a reserva continuar disponível.',
      refunded: 'O pagamento foi reembolsado.',
      partially_refunded: 'Foi registado um reembolso parcial. Contacte o alojamento para mais informações.',
      review_required: 'O pagamento foi recebido, mas a reserva precisa de verificação pelo alojamento. Contacte-nos antes de viajar.',
    };
    $('rs-payment-message').textContent = payment.processing || awaitingWebhook
      ? 'Estamos a aguardar a confirmação do pagamento. Esta página será atualizada automaticamente.'
      : messages[payment.status] || (returnState === 'cancelled'
        ? 'Saiu do pagamento. Pode retomá-lo enquanto a reserva estiver disponível.'
        : 'Pague de forma segura na Stripe. Os métodos disponíveis são apresentados no passo seguinte.');
    if ((payment.processing || awaitingWebhook) && refreshCount < 12) {
      refreshTimer = setTimeout(() => { refreshCount++; load(); }, 5000);
    } else if ((payment.processing || awaitingWebhook) && refreshCount >= 12) {
      $('rs-payment-message').textContent = 'A confirmação ainda não chegou. Pode atualizar o estado mais tarde; não repita o pagamento enquanto estiver em processamento.';
    }
  }

  // Pede ao servidor uma miniatura (`?w=`) em vez da foto original, que pode
  // ter vários MB. Só para fotos carregadas na própria aplicação; URLs externos
  // e de outras origens ficam como estão.
  function mediaThumb(value, width) {
    const safe = safeMediaUrl(value);
    if (!safe) return '';
    try {
      const parsed = new URL(safe, location.origin);
      if (parsed.origin !== location.origin || !/^\/uploads\/[^/]+$/.test(parsed.pathname)) return safe;
      parsed.searchParams.set('w', String(width));
      return safe.startsWith('/') ? `${parsed.pathname}${parsed.search}` : parsed.href;
    } catch { return safe; }
  }

  function safeMediaUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      const parsed = new URL(raw, location.origin);
      return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
    } catch { return ''; }
  }

  async function load() {
    clearTimeout(refreshTimer);
    try {
      const response = await fetch(`/api/public/reservation/${encodeURIComponent(token)}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.success === false) throw new Error(payload.error || 'Não foi possível consultar a reserva.');
      const reservation = payload.data;
      $('rs-reference').textContent = `Reserva ${reservation.id}`;
      $('rs-title').textContent = statusLabels[reservation.status] || 'Estado da reserva';
      $('rs-status').textContent = statusLabels[reservation.status] || reservation.status;
      $('rs-payment').textContent = paymentLabels[reservation.payment_status] || reservation.payment_status || 'Pagamento pendente';
      $('rs-accommodation').textContent = reservation.accommodation_name;
      $('rs-checkin').textContent = fmtDate(reservation.check_in);
      $('rs-checkout').textContent = fmtDate(reservation.check_out);
      $('rs-guests').textContent = String(reservation.num_guests || '—');
      $('rs-total').textContent = fmtMoney(reservation.total_amount);
      $('rs-paid').textContent = fmtMoney(reservation.amount_paid);
      renderPayment(reservation);
      const image = mediaThumb(reservation.cover_image || reservation.images?.[0], 1600);
      if (image) $('rs-bg').style.backgroundImage = `url(${JSON.stringify(image)})`;
      $('rs-loading').hidden = true;
      $('rs-content').hidden = false;
      $('rs-error').hidden = true;
    } catch (error) {
      $('rs-loading').hidden = true;
      $('rs-error').textContent = error.message;
      $('rs-error').hidden = false;
      $('rs-title').textContent = 'Não foi possível abrir a reserva';
    }
  }

  $('rs-pay').addEventListener('click', async () => {
    if (openingCheckout) return;
    openingCheckout = true;
    $('rs-pay').disabled = true;
    $('rs-pay').textContent = 'A abrir pagamento…';
    $('rs-error').hidden = true;
    try {
      const response = await fetch(`/api/public/reservation/${encodeURIComponent(token)}/checkout`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Não foi possível abrir o pagamento.');
      const url = new URL(payload.data.url);
      if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com') throw new Error('Endereço de pagamento inválido.');
      location.assign(url.href);
    } catch (error) {
      openingCheckout = false;
      await load();
      $('rs-error').textContent = error.message;
      $('rs-error').hidden = false;
    }
  });
  $('rs-refresh').addEventListener('click', () => { refreshCount = 0; load(); });

  load();
})();
