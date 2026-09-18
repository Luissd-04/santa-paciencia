async function aprovarReserva(id) {
  if (!confirm('Aprovar esta reserva e enviar o email de pre check-in ao hóspede?')) return;
  try {
    const res = await apiPost(`/api/reservations/${id}/approve`, {});
    if (res.success) {
      toast('✅ Reserva aprovada e pre check-in enviado.', 'success');
      await loadReservas();
      if (typeof renderCalView === 'function') renderCalView();
      if (typeof renderDashboard === 'function') renderDashboard();
      showDetail(id);
    } else {
      toast('❌ ' + (res.error || 'Erro ao aprovar reserva.'), 'error');
    }
  } catch (e) {
    toast('❌ ' + (e?.payload?.error || e?.message || 'Erro de ligação ao servidor.'), 'error');
  }
}

async function enviarLinkPrecheckin(id, send = true) {
  try {
    const res = await apiPost(`/api/reservations/${id}/send-precheckin`, { send });
    if (res.success) {
      if (!send) {
        toast('🔗 Link de pré-checkin gerado.', 'success');
      } else {
        toast(res.data?.email_sent ? '✅ Link de pré-checkin enviado por email.' : '🔗 Link de pré-checkin gerado — copia-o para enviar (o hóspede não tem email registado).', 'success');
      }
      await loadReservas();
      showDetail(id);
    } else {
      toast('❌ ' + (res.error || 'Erro ao enviar link de pré-checkin.'), 'error');
    }
  } catch (e) {
    toast('❌ ' + (e?.payload?.error || e?.message || 'Erro de ligação ao servidor.'), 'error');
  }
}

async function copyPreCheckinLink(token) {
  const url = preCheckinUrl(token);
  if (!url) return;
  try {
    await navigator.clipboard.writeText(url);
    toast('Link de pre check-in copiado.', 'success');
  } catch (_) {
    toast(url, 'info');
  }
}

async function cancelarReserva(id) {
  if (!confirm('Cancelar esta reserva? Será removida do Google Calendar.')) return;
  try {
    const res = await apiDelete(`/api/reservations/${id}`);
    if (res.success) {
      AppUI.closeModal('detail-bg');
      showReservasList();
      toast('❌ Reserva cancelada.', 'info');
      await loadReservas();
      if (typeof renderCalView === 'function') renderCalView();
      renderDashboard();
    } else {
      toast('❌ ' + (res.error || 'Erro ao cancelar.'), 'error');
    }
  } catch (e) {
    toast('❌ Erro de ligação ao servidor.', 'error');
  }
}

// Verifica se o utilizador tem pelo menos um determinado role na hierarquia
// owner > manager > staff. Usado para esconder ações destrutivas.
function hasRole(minRole) {
  const rank = { staff: 1, manager: 2, owner: 3 };
  const userRank = rank[currentUser?.role] || 0;
  return userRank >= (rank[minRole] || 0);
}

async function apagarReservaDefinitivo(id) {
  const r = (typeof reservas !== 'undefined' ? reservas : []).find(x => x.id === id);
  if (!confirm('⚠️ Esta reserva vai ser APAGADA e depois é IMPOSSÍVEL recuperar.\n\nOs pagamentos e tarefas operacionais associados também serão removidos. O hóspede e o histórico de emails são mantidos.')) return;
  if (!confirm('Confirmar eliminação definitiva? Esta ação NÃO pode ser desfeita.')) return;
  try {
    // O backend só apaga reservas já canceladas — cancelar primeiro se necessário.
    if (r && r.status !== 'cancelada') {
      const c = await apiDelete(`/api/reservations/${id}`);
      if (!c.success) { toast('❌ ' + (c.error || 'Erro ao apagar.'), 'error'); return; }
    }
    const res = await apiDelete(`/api/reservations/${id}/permanent`);
    if (res.success) {
      const detailBg = document.getElementById('detail-bg');
      if (detailBg?.classList.contains('open')) detailBg.classList.remove('open');
      showReservasList();
      toast('🗑 Reserva apagada definitivamente.', 'info');
      await loadReservas();
      if (typeof renderCalView === 'function') renderCalView();
      renderDashboard();
    } else {
      toast('❌ ' + (res.error || 'Erro ao apagar.'), 'error');
    }
  } catch (e) {
    toast('❌ Erro de ligação ao servidor.', 'error');
  }
}

async function reativarReserva(id) {
  if (!confirm('Reativar esta reserva? Vai restaurar os estados que existiam antes do cancelamento.')) return;
  try {
    const res = await apiPut(`/api/reservations/${id}`, { status: 'confirmada' });
    if (res.success) {
      const detailBg = document.getElementById('detail-bg');
      if (detailBg?.classList.contains('open')) detailBg.classList.remove('open');
      showReservasList();
      toast('✅ Reserva reativada!', 'success');
      await loadReservas();
      if (typeof renderCalView === 'function') renderCalView();
      renderDashboard();
    } else {
      toast('❌ ' + (res.error || 'Erro ao reativar.'), 'error');
    }
  } catch (e) {
    toast('❌ Erro de ligação ao servidor.', 'error');
  }
}

