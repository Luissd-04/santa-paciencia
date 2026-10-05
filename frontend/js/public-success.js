(() => {
  const kind = new URLSearchParams(location.search).get('tipo');
  const messages = {
    reserva: ['Pedido enviado com sucesso!', 'Recebemos o seu pedido de reserva. A reserva fica pendente de confirmação pelo alojamento.'],
    dados: ['Dados guardados com sucesso!', 'O pré check-in foi enviado com sucesso. Se precisar de corrigir algum dado, pode voltar ao link do pré check-in até ao dia de chegada.'],
    alteracoes: ['Alterações guardadas com sucesso!', 'Os dados do pré check-in foram atualizados. O alojamento foi avisado das alterações.'],
  };
  if (!Object.hasOwn(messages, kind)) return;
  const $ = id => document.getElementById(id);
  const [title, message] = messages[kind];
  document.title = `${title} — Santa Paciência`;
  $('confirmation-title').textContent = title;
  $('confirmation-message').textContent = message;
  $('confirmation-close').hidden = false;
  let receipt;
  try { receipt = JSON.parse(sessionStorage.getItem('public-flow-receipt')); } catch { /* Detalhes opcionais. */ }
  if (receipt?.kind === kind) {
    for (const field of ['reference', 'total']) {
      if (!receipt[field]) continue;
      $(`confirmation-${field}`).textContent = receipt[field];
      $(`confirmation-${field}-row`).hidden = false;
      $('confirmation-details').hidden = false;
    }
    if (kind !== 'reserva' && /^\/pre-checkin\/[^/?#]+$/.test(receipt.returnPath || '')) {
      $('confirmation-return').href = receipt.returnPath;
      $('confirmation-return').hidden = false;
    }
    if (kind !== 'reserva' && /^\/reserva\/[a-f0-9]{64}$/i.test(receipt.paymentPath || '')) {
      $('confirmation-payment').href = receipt.paymentPath;
      $('confirmation-payment').hidden = false;
      $('confirmation-close').hidden = true;
    }
  }
  $('confirmation-title').focus({ preventScroll: true });
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
})();
