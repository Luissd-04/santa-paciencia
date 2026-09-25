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
    checkin: 'Estadia em curso', concluida: 'Estadia concluída', cancelada: 'Reserva cancelada',
  };
  const paymentLabels = { pendente: 'Pagamento pendente', parcial: 'Pagamento parcial', pago: 'Pago', reembolsado: 'Reembolsado' };

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
      const image = mediaThumb(reservation.cover_image || reservation.images?.[0], 1600);
      if (image) $('rs-bg').style.backgroundImage = `url(${JSON.stringify(image)})`;
      $('rs-loading').hidden = true;
      $('rs-content').hidden = false;
    } catch (error) {
      $('rs-loading').hidden = true;
      $('rs-error').textContent = error.message;
      $('rs-error').hidden = false;
      $('rs-title').textContent = 'Não foi possível abrir a reserva';
    }
  }

  load();
})();
