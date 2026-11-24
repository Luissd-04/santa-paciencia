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
  let currentReservation = null;
  let cancelTrigger = null;
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
      ${p.cancellation ? `<p>Cancelamento registado. ${p.cancellation.amount > 0 ? `Reembolso de <strong>${fmtMoney(p.cancellation.amount)}</strong>: ${p.cancellation.state === 'complete' ? 'enviado para o cartão usado no pagamento (costuma aparecer em 5 a 10 dias úteis, conforme o banco).' : p.cancellation.state === 'manual_review' ? 'o alojamento está a verificar o reembolso.' : 'em processamento.'}` : 'Sem reembolso, segundo as condições aceites.'}</p>` : ''}`;
    $('rs-refund-quote').textContent = !currentPaid
      ? 'Ainda não pagou nada: se cancelar agora, as datas ficam livres e não há valores a devolver.'
      : `Se cancelar agora, devolvemos ${fmtMoney(p.refundCents / 100)} (${p.refundPercent}% do valor já pago).`;
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
    // Restante depois do sinal: botão secundário «Pagar já» (o painel é então
    // o cartão discreto, ver reservation-status-novo.js).
    const later = $('rs-payment-panel').classList.contains('later');
    button.classList.toggle('gp-btn-2', later);
    button.textContent = openingCheckout ? 'A abrir pagamento…' : later ? 'Pagar já' : `Pagar ${fmtMoney(payment.amount_due)} online`;
    $('rs-test-note').hidden = !payment.test_mode || $('rs-payment-panel').hidden;
    // «Pagamento recebido» vai no topo do cartão principal (reservation-status-novo.js).
    const messages = {
      paid: '',
      failed: 'O pagamento não foi concluído. Pode tentar novamente.',
      expired: 'A sessão de pagamento expirou. Pode iniciar uma nova enquanto a reserva estiver disponível.',
      cancelled: 'O pagamento foi cancelado. Pode tentar novamente se a reserva continuar disponível.',
      refunded: 'O pagamento foi reembolsado.',
      partially_refunded: 'Foi registado um reembolso parcial. Contacte o alojamento para mais informações.',
      review_required: 'O pagamento foi recebido, mas a reserva precisa de verificação pelo alojamento. Contacte-nos antes de viajar.',
    };
    $('rs-payment-message').textContent = payment.processing || awaitingWebhook
      ? 'Estamos a aguardar a confirmação do pagamento. Esta página será atualizada automaticamente.'
      : payment.status === 'paid' ? '' : messages[payment.status] || (returnState === 'cancelled'
        ? 'Saiu do pagamento. Pode retomá-lo enquanto a reserva estiver disponível.'
        : later ? '' : 'Pague de forma segura na Stripe. Os métodos disponíveis são apresentados no passo seguinte.');
    $('rs-payment-message').hidden = !$('rs-payment-message').textContent;
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

  // Capa do topo: srcset de 480 a 2048 px (domain/responsive-image.js), só até
  // à largura do recorte. Com recortes (portal.cover): a faixa 3:1 no
  // computador e a paisagem 16:9 no telemóvel e tablet (o topo é mais alto do
  // que largo em proporção), com o ponto principal no que fica à vista.
  function heroImage(value, cover) {
    let position = '';
    let maxWidth = null;
    if (cover?.variants) {
      const format = matchMedia('(max-width: 959px)').matches ? 'landscape' : 'banner';
      value = cover.variants[format] || value;
      position = cover.position?.[format] || '';
      maxWidth = window.ResponsiveImage?.publicCoverWidth(cover, format) || null;
    }
    const safe = safeMediaUrl(value);
    if (!safe) return null;
    const RI = window.ResponsiveImage;
    if (!RI) { const src = mediaThumb(safe, 1600); return src ? { src, srcset: '', sizes: '100vw', position } : null; }
    const r = RI.build(safe, { maxWidth, sizes: '100vw' });
    return r.src ? { ...r, position } : null;
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
      currentReservation = reservation;
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

  function setConsentError(on) {
    const box = $('rs-consent');
    $('rs-consent-error').hidden = !on;
    $('rs-consent-label').classList.toggle('has-error', on);
    if (on) { box.setAttribute('aria-invalid', 'true'); box.setAttribute('aria-describedby', 'rs-consent-error'); }
    else { box.removeAttribute('aria-invalid'); box.removeAttribute('aria-describedby'); }
  }
  $('rs-consent').addEventListener('change', () => { if ($('rs-consent').checked) setConsentError(false); });

  $('rs-pay').addEventListener('click', async () => {
    if (openingCheckout) return;
    if (currentPolicy && !currentPolicy.accepted && !$('rs-consent').checked) {
      // O erro fica junto da caixa (não no topo da página, fora do ecrã).
      setConsentError(true);
      $('rs-consent-label').scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      $('rs-consent').focus({ preventScroll: true });
      return;
    }
    setConsentError(false);
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
  // ── Cancelar: janela própria com datas, valor pago e reembolso ───────────
  const dayLong = iso => `${window.ReservationDates.formatDayLabel(iso)}`;
  // Regra de reembolso em vigor, em palavras: «reembolso total até 30 dias antes da entrada».
  function refundRuleText(p) {
    const rule = p.policy.refundRules.find(r => p.refundDays >= r.minDays && (r.maxDays === null || p.refundDays <= r.maxDays))
      || p.policy.refundRules.find(r => r.percent === p.refundPercent);
    const basis = p.refundBasis === 'booking' ? ' (conta a antecedência com que fez a reserva)' : '';
    if (!rule) return 'Segundo as condições que aceitou.';
    const what = rule.percent >= 100 ? 'reembolso total' : rule.percent <= 0 ? 'sem reembolso' : `reembolso de ${rule.percent}%`;
    const when = rule.maxDays === null ? `até ${rule.minDays} dias antes da entrada`
      : rule.minDays <= 0 ? `a menos de ${rule.maxDays + 1} dias da entrada`
      : `de ${rule.minDays} a ${rule.maxDays} dias antes da entrada`;
    return `Segundo as condições que aceitou: ${what} ${when}${basis}.`;
  }
  function fillCancelDialog() {
    const p = currentPolicy;
    const r = currentReservation || {};
    const paid = currentPaid;
    $('rs-cancel-stay').textContent = [r.accommodation_name, r.check_in && r.check_out ? `${dayLong(r.check_in)} → ${dayLong(r.check_out)} ${String(r.check_out).slice(0, 4)}` : ''].filter(Boolean).join(' · ');
    const lines = $('rs-cancel-lines');
    lines.textContent = '';
    const row = (label, value) => {
      const div = document.createElement('div');
      const dt = document.createElement('dt'); dt.textContent = label;
      const dd = document.createElement('dd'); const b = document.createElement('strong'); b.textContent = value; dd.append(b);
      div.append(dt, dd); lines.append(div);
    };
    const confirm = $('rs-cancel-confirm');
    if (!paid) {
      $('rs-cancel-rule').textContent = 'Ainda não pagou nada: se cancelar agora, as datas ficam livres e não há valores a devolver.';
      confirm.textContent = 'Cancelar a reserva';
    } else {
      row('Pago até agora', fmtMoney(paid));
      row('Devolvemos', `${fmtMoney(p.refundCents / 100)} (${p.refundPercent} %)`);
      $('rs-cancel-rule').textContent = refundRuleText(p);
      confirm.textContent = p.refundCents > 0 ? 'Cancelar e pedir o reembolso' : 'Cancelar a reserva';
    }
    $('rs-cancel-error').hidden = true;
  }
  function closeCancelDialog() {
    const dialog = $('rs-cancel-dialog');
    if (dialog.open) dialog.close();
  }
  $('rs-cancel').addEventListener('click', () => {
    if (cancelling || !currentPolicy?.canCancel) return;
    cancelTrigger = $('rs-cancel');
    const dialog = $('rs-cancel-dialog');
    fillCancelDialog();
    if (typeof dialog.showModal !== 'function') {   // browsers antigos: confirmação simples
      if (confirm(`Cancelar a reserva? Devolvemos ${fmtMoney(currentPolicy.refundCents / 100)}. Esta ação liberta as datas da estadia.`)) doCancel();
      return;
    }
    dialog.showModal();
    $('rs-cancel-keep').focus();
  });
  $('rs-cancel-keep').addEventListener('click', closeCancelDialog);
  // Clicar fora da caixa (no fundo) também mantém a reserva.
  $('rs-cancel-dialog').addEventListener('click', event => { if (event.target === event.currentTarget) closeCancelDialog(); });
  $('rs-cancel-dialog').addEventListener('close', () => { if (!cancelling) cancelTrigger?.focus?.(); });
  $('rs-cancel-confirm').addEventListener('click', () => doCancel());
  async function doCancel() {
    if (cancelling || !currentPolicy?.canCancel) return;
    cancelling = true;
    const button = $('rs-cancel-confirm');
    const label = button.textContent;
    button.disabled = true; $('rs-cancel-keep').disabled = true; $('rs-cancel').disabled = true;
    button.textContent = 'A cancelar…';
    $('rs-cancel-error').hidden = true;
    try {
      const response = await fetch(`/api/public/reservation/${encodeURIComponent(token)}/cancel`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true, key: currentPolicy.consentKey, refundCents: currentPolicy.refundCents }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Não foi possível cancelar.');
      cancelling = false;
      await load();
      closeCancelDialog();
      // O foco passa ao novo estado da reserva.
      const title = $('gp-next-title');
      title.tabIndex = -1; title.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    } catch (error) {
      cancelling = false;
      await load();
      if (currentPolicy?.canCancel && $('rs-cancel-dialog').open) {
        fillCancelDialog();   // valores atualizados, se foi essa a causa
        $('rs-cancel-error').textContent = error.message;
        $('rs-cancel-error').hidden = false;
      } else { closeCancelDialog(); $('rs-error').textContent = error.message; $('rs-error').hidden = false; }
    } finally {
      cancelling = false;
      button.disabled = false; $('rs-cancel-keep').disabled = false; $('rs-cancel').disabled = false;
      if (button.textContent === 'A cancelar…') button.textContent = label;
    }
  }
  $('rs-refresh').addEventListener('click', () => { refreshCount = 0; load(); });

  load();
})();
