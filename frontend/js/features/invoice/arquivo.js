'use strict';
async function archiveInvoiceThread(threadId, keyType = 'reservation') {
  try {
    await fetch('/auth/email/archives', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ thread_key: String(threadId), key_type: keyType }),
    });
    _invoiceArchivedKeys.add(String(threadId));
    toast('Conversa arquivada.', 'info');
    document.getElementById('invoice-thread-detail').innerHTML = `
      <div class="invoice-detail-empty">
        <i data-lucide="archive" style="width:48px;height:48px;opacity:.2;"></i>
        <p>Conversa arquivada.</p>
      </div>`;
    if (window.lucide) lucide.createIcons();
    _invoiceConversas = _invoiceConversas.filter(t => String(t.id) !== String(threadId));
    renderInvoiceThreadList(_invoiceConversas);
  } catch { toast('❌ Erro ao arquivar.', 'error'); }
}

async function restoreInvoiceThread(threadId) {
  try {
    await fetch(`/auth/email/archives/${encodeURIComponent(threadId)}`, { method: 'DELETE', credentials: 'include' });
    _invoiceArchivedKeys.delete(String(threadId));
    toast('Conversa restaurada.', 'success');
    await loadInvoiceConversas();
    switchInvoiceTab('conversas', false);
  } catch { toast('❌ Erro ao restaurar.', 'error'); }
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
    toast('Histórico local eliminado.', 'success');
    document.getElementById('invoice-archive-detail').innerHTML = `
      <div class="invoice-detail-empty">
        <i data-lucide="trash-2" style="width:48px;height:48px;opacity:.2;"></i>
        <p>Histórico eliminado.</p>
      </div>`;
    if (window.lucide) lucide.createIcons();
    renderInvoiceArchive();
  } catch { toast('❌ Erro ao eliminar histórico.', 'error'); }
}

async function renderInvoiceArchive() {
  const list    = document.getElementById('invoice-archive-list');
  const loading = document.getElementById('invoice-archive-loading');
  const empty   = document.getElementById('invoice-archive-empty');
  if (!list) return;

  if (loading) loading.style.display = '';
  if (empty)   empty.style.display   = 'none';

  try {
    const [resData, hosData, msgRes, archRes] = await Promise.all([
      apiGet('/api/reservations?limit=200'),
      apiGet('/api/guests?limit=200'),
      fetch('/auth/email/messages?limit=200', { credentials: 'include' }).then(r => r.json()).catch(() => ({})),
      fetch('/auth/email/archives', { credentials: 'include' }).then(r => r.json()).catch(() => ({})),
    ]);

    const reservas = resData?.data?.reservations || resData?.data || [];
    const hospedes = hosData?.data?.guests        || hosData?.data || [];
    const allMsgs  = msgRes?.data?.messages || [];
    const archived = new Set((archRes?.data || []).map(a => a.thread_key));

    const hospedeMap = {};
    hospedes.forEach(h => { hospedeMap[h.id] = h; });
    const msgByEmail = {};
    allMsgs.forEach(m => {
      const key = m.to_email.toLowerCase();
      if (!msgByEmail[key] || new Date(m.sent_at) > new Date(msgByEmail[key].sent_at)) msgByEmail[key] = m;
    });

    // Mesmo formato de thread usado na lista normal (loadInvoiceConversas),
    // para o arquivo ter exatamente a mesma formatação/badges/restrições —
    // sem isto, ficava uma versão simplificada e desatualizada em duplicado.
    const activeStatuses = new Set(['confirmed', 'checked_in']);
    const threads = reservas
      .filter(r => archived.has(String(r.id)))
      .map(r => {
        const hospede  = hospedeMap[r.guest_id] || {};
        const email    = (realEmail(r.guest_email) || hospede.email || '').toLowerCase();
        const lastMsg  = msgByEmail[email];
        const alojNome = r.accommodation_name || '';
        const alojInit = activeStatuses.has(r.status) && alojNome
          ? alojNome.split(' ').filter(w => w.length > 2).map(w => w[0].toUpperCase()).join('').slice(0, 3)
          : null;
        return {
          id: r.id, guestName: hospede.name || r.guest_name || '—',
          guestEmail: realEmail(r.guest_email) || hospede.email || '',
          alojamento: alojNome, checkin: r.check_in, checkout: r.check_out,
          status: r.status, total: r.total_amount, _standalone: false, _alojInitials: alojInit,
          _lastDate: lastMsg?.sent_at || null,
          _lastSnippet: lastMsg ? _snippet(lastMsg.subject, lastMsg.body_html) : null,
        };
      });

    allMsgs.filter(m => !m.reservation_id && archived.has('standalone-' + m.to_email.toLowerCase())).forEach(m => {
      const key = 'standalone-' + m.to_email.toLowerCase();
      if (!threads.find(t => t.id === key)) {
        const hospedeByEmail = {};
        hospedes.forEach(h => { if (realEmail(h.email)) hospedeByEmail[h.email.toLowerCase()] = h; });
        const matched = hospedeByEmail[m.to_email.toLowerCase()];
        threads.push({
          id: key, guestName: matched?.name || m.to_name || m.to_email,
          guestEmail: m.to_email, alojamento: '', checkin: null, checkout: null,
          status: null, total: null, _standalone: true,
          _lastDate: m.sent_at, _lastSnippet: _snippet(m.subject, m.body_html),
        });
      }
    });

    if (loading) loading.style.display = 'none';
    renderInvoiceThreadList(threads, { listId: 'invoice-archive-list', emptyId: 'invoice-archive-empty', detailId: 'invoice-archive-detail' });
  } catch (err) {
    console.error('Archive load error', err);
    if (loading) loading.style.display = 'none';
  }
}

/* ── Enviar a partir do compose da thread ── */
