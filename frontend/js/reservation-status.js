(() => {
  const $ = id => document.getElementById(id);
  const token = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '');
  const fmtDate = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-PT', {
    day: '2-digit', month: 'short', year: 'numeric',
  }) : '—';
  const fmtMoney = ReservationMoney.format;
  const returnState = new URLSearchParams(location.search).get('payment');
  let refreshTimer;
  let refreshCount = 0;
  let openingCheckout = false;
  let currentPolicy = null;
  let currentPaid = 0;
  let cancelling = false;
  const fmtDeadline = value => window.ReservationDates.formatDateTime(value);
  function renderPolicy(payment) {
    const p = payment.policy;
    currentPolicy = p;
    $('gp-policy').hidden = !p;
    $('rs-consent-label').hidden = !p || p.accepted || !payment.available;
    $('rs-auto-label').hidden = !p || p.accepted || !payment.available || !p.policy.automaticCharge || !p.balanceCents;
    $('rs-cancellation').hidden = !p?.canCancel;
    if (!p) return;
    const rules = p.policy.refundRules.map(r => `<tr><td>${r.minDays}${r.maxDays === null ? ' ou mais' : ` a ${r.maxDays}`} dias</td><td>${r.percent}% do valor pago</td></tr>`).join('');
    $('rs-policy').innerHTML = `<h3>Pagamentos e cancelamentos</h3>
      <p>Pagamento inicial: <strong>${fmtMoney(p.depositCents / 100)}</strong> (${p.depositPercent}% do total${p.depositAdjusted ? ', ajustado ao mínimo de 0,50 € por pagamento' : ''}).</p>
      ${p.balanceCents ? `<p>Restante previsto: <strong>${fmtMoney(p.balanceCents / 100)}</strong>, com vencimento em <strong>${fmtDeadline(p.dueAt)}</strong> (Lisboa).</p>
      <p>${p.policy.automaticCharge ? 'Com cartão autorizado, tentaremos cobrar automaticamente nessa data. ' : ''}Se for necessário concluir o pagamento, receberá um link e terá ${p.policy.graceHours} horas após o aviso. Depois do prazo, a reserva será cancelada sem devolução do valor já pago.</p>` : '<p>Pagamento integral para confirmar esta reserva.</p>'}
      ${p.accepted && p.balanceCents ? `<p>Cobrança automática por cartão: ${p.automatic ? 'autorizada, quando o cartão for elegível' : 'não autorizada; pagamento por link'}.</p>` : ''}
      ${p.balanceNoticeSent && payment.available ? `<p><strong>Conclua o pagamento até ${fmtDeadline(p.deadline)} (Lisboa).</strong></p>` : ''}
      <p>O reembolso é calculado pela antecedência entre <strong>${p.refundBasis === 'booking' ? 'a criação da reserva' : 'o pedido de cancelamento'}</strong> e o check-in. Após o dia de check-in, contacte o alojamento.</p>
      <table><thead><tr><th>Antecedência</th><th>Reembolso</th></tr></thead><tbody>${rules}</tbody></table>
      ${p.cancellation ? `<p>Cancelamento registado. Reembolso previsto: <strong>${fmtMoney(p.cancellation.amount)}</strong>. ${p.cancellation.state === 'complete' ? 'Processamento concluído.' : p.cancellation.state === 'manual_review' ? 'O alojamento está a verificar o reembolso.' : 'Reembolso em processamento.'}</p>` : ''}`;
    $('rs-refund-quote').textContent = !currentPaid
      ? 'Ainda não pagou nada: se cancelar agora, as datas ficam livres e não há valores a devolver.'
      : `Se cancelar agora, o reembolso previsto é ${fmtMoney(p.refundCents / 100)} (${p.refundPercent}% do valor já pago).`;
  }


  function renderPayment(reservation, phase) {
    const payment = reservation.online_payment || {};
    currentPaid = Number(reservation.amount_paid) || 0;
    renderPolicy(payment);
    const button = $('rs-pay');
    const awaitingWebhook = returnState === 'return' && ['pending', 'processing'].includes(payment.status)
      && reservation.payment_status !== 'confirmado';
    // O painel aparece com o pagamento disponível, à espera da confirmação ou
    // com um aviso que o hóspede precisa de ler (no regresso da Stripe ou um
    // pagamento por verificar/reembolsado). Uma reserva cancelada não o mostra.
    const notice = ['review_required', 'partially_refunded', 'refunded'].includes(payment.status)
      || (returnState && payment.status);
    $('rs-payment-panel').hidden = phase === 'cancelada' || (!payment.available && !payment.processing && !awaitingWebhook && !notice);
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

  // Capa do topo: miniaturas de 1024 e 1600 px, conforme o ecrã. Com recortes
  // (portal.cover): a faixa 3:1 no computador e a paisagem 16:9 no telemóvel
  // e tablet (o topo é mais alto do que largo em proporção), com o ponto
  // principal no que fica à vista.
  function heroImage(value, cover) {
    let position = '';
    if (cover?.variants) {
      const format = matchMedia('(max-width: 959px)').matches ? 'landscape' : 'banner';
      value = cover.variants[format] || value;
      position = cover.position?.[format] || '';
    }
    const src = mediaThumb(value, 1600);
    if (!src) return null;
    const small = mediaThumb(value, 1024);
    return { src, srcset: small !== src ? `${small} 1024w, ${src} 1600w` : '', position };
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
      // Topo, próximo passo, passos e lateral (reservation-status-novo.js);
      // depois o pagamento online, que vive dentro do cartão «Próximo passo».
      const cover = reservation.portal?.cover_image || reservation.cover_image || reservation.images?.[0];
      const view = window.ReservationStatusNovo.render(reservation, heroImage(cover, reservation.portal?.cover || reservation.cover));
      renderPayment(reservation, view.phase);
      window.ReservationStatusNovo.setSticky(view.phase, !$('rs-payment-panel').hidden && !$('rs-pay').hidden);
      $('rs-loading').hidden = true;
      $('rs-content').hidden = false;
      $('rs-error').hidden = true;
    } catch (error) {
      $('rs-loading').hidden = true;
      $('rs-error').textContent = error.message;
      $('rs-error').hidden = false;
    }
  }

  $('rs-pay').addEventListener('click', async () => {
    if (openingCheckout) return;
    if (currentPolicy && !currentPolicy.accepted && !$('rs-consent').checked) {
      $('rs-error').textContent = 'Aceite as condições antes de continuar.'; $('rs-error').hidden = false; $('rs-consent').focus();
      $('rs-consent-label').scrollIntoView({ block: 'center' }); return;
    }
    openingCheckout = true;
    $('rs-pay').disabled = true;
    $('rs-pay').textContent = 'A abrir pagamento…';
    $('rs-error').hidden = true;
    try {
      const response = await fetch(`/api/public/reservation/${encodeURIComponent(token)}/checkout`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ consent: { accepted: $('rs-consent').checked, automatic: $('rs-auto').checked, key: currentPolicy?.consentKey } }),
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
  $('rs-cancel').addEventListener('click', async () => {
    if (cancelling || !currentPolicy?.canCancel) return;
    if (!confirm(`Cancelar a reserva? Reembolso previsto: ${fmtMoney(currentPolicy.refundCents / 100)}. Esta ação liberta as datas da estadia.`)) return;
    cancelling = true; $('rs-cancel').disabled = true;
    try {
      const response = await fetch(`/api/public/reservation/${encodeURIComponent(token)}/cancel`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true, key: currentPolicy.consentKey, refundCents: currentPolicy.refundCents }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Não foi possível cancelar.');
      await load();
    } catch (error) {
      await load(); $('rs-error').textContent = error.message; $('rs-error').hidden = false;
    } finally { cancelling = false; $('rs-cancel').disabled = false; }
  });
  $('rs-refresh').addEventListener('click', () => { refreshCount = 0; load(); });

  load();
})();
