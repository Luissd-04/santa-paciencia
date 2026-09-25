// Estado privado; interface partilhada em AppModules.invoice.
(() => {
AppModules.define('invoice', {
  archiveInvoiceThread: { get: () => archiveInvoiceThread },
  deleteInvoiceThreadHistory: { get: () => deleteInvoiceThreadHistory },
  restoreInvoiceThread: { get: () => restoreInvoiceThread },
});

'use strict';
async function archiveInvoiceThread(threadId, keyType = 'reservation') {
  try {
    await fetch('/auth/email/archives', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ thread_key: String(threadId), key_type: keyType }),
    });
    AppModules.invoice._invoiceArchivedKeys.add(String(threadId));
    AppModules.core.toast('Conversa arquivada.', 'info');
    document.getElementById('invoice-thread-detail').innerHTML = `
      <div class="invoice-detail-empty">
        <i data-lucide="archive" style="width:48px;height:48px;opacity:.2;"></i>
        <p>Conversa arquivada.</p>
      </div>`;
    if (window.lucide) lucide.createIcons();
    // O arquivo e filtrado pelo servidor: recarregar a pagina atual garante
    // que a conversa sai da lista e que a contagem fica certa.
    await AppModules.invoice.loadInvoiceConversas();
  } catch { AppModules.core.toast('❌ Erro ao arquivar.', 'error'); }
}

async function restoreInvoiceThread(threadId) {
  try {
    await fetch(`/auth/email/archives/${encodeURIComponent(threadId)}`, { method: 'DELETE', credentials: 'include' });
    AppModules.invoice._invoiceArchivedKeys.delete(String(threadId));
    AppModules.core.toast('Conversa restaurada.', 'success');
    await AppModules.invoice.loadInvoiceConversas();
    AppModules.invoice.switchInvoiceTab('conversas', false);
  } catch { AppModules.core.toast('❌ Erro ao restaurar.', 'error'); }
}

/* Apaga só a nossa cópia local (invoice_messages) desta conversa — o correio
   real fica no Gmail, por isso se voltares a falar com a mesma pessoa a
   conversa reaparece normalmente, com o histórico novo a partir daí. */
async function deleteInvoiceThreadHistory(threadId, toEmail, reservationId) {
  if (!confirm('Eliminar o histórico local desta conversa? Os emails continuam no Gmail, mas deixam de aparecer aqui — se voltares a falar com esta pessoa, a conversa reaparece normalmente.')) return;
  try {
    const params = new URLSearchParams({ to_email: toEmail });
    if (reservationId) params.set('reservation_id', reservationId);
    await fetch(`/auth/email/messages?${params}`, { method: 'DELETE', credentials: 'include' });
    AppModules.core.toast('Histórico local eliminado.', 'success');
    document.getElementById('invoice-archive-detail').innerHTML = `
      <div class="invoice-detail-empty">
        <i data-lucide="trash-2" style="width:48px;height:48px;opacity:.2;"></i>
        <p>Histórico eliminado.</p>
      </div>`;
    if (window.lucide) lucide.createIcons();
    AppModules.invoice.renderInvoiceArchive();
  } catch { AppModules.core.toast('❌ Erro ao eliminar histórico.', 'error'); }
}

// renderInvoiceArchive() vive agora em invoice.js: o arquivo usa a mesma
// coleccao paginada das conversas (GET /api/email/threads?archived=1), em vez
// de carregar todas as reservas e hospedes para filtrar em memoria.

})();
