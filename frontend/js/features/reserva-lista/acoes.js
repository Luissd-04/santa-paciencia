// Estado privado; interface partilhada em AppModules.reservas.
(() => {
AppModules.define('reservas', {
  apagarReservaDefinitivo: { get: () => apagarReservaDefinitivo },
  aprovarReserva: { get: () => aprovarReserva },
  cancelarReserva: { get: () => cancelarReserva },
  editarHoraChegada: { get: () => editarHoraChegada },
  enviarLinkPrecheckin: { get: () => enviarLinkPrecheckin },
  hasRole: { get: () => hasRole },
  reabrirPrecheckin: { get: () => reabrirPrecheckin },
  reativarReserva: { get: () => reativarReserva },
});

async function aprovarReserva(id) {
  if (!confirm('Aprovar esta reserva e enviar o email de pre check-in ao hóspede?')) return;
  try {
    const res = await AppModules.core.apiPost(`/api/reservations/${id}/approve`, {});
    if (res.success) {
      AppModules.core.toast('✅ Reserva aprovada e pre check-in enviado.', 'success');
      await AppModules.reservas.loadReservas();
      if (typeof AppModules.calendario.renderCalView === 'function') AppModules.calendario.renderCalView();
      if (typeof AppModules.core.renderDashboard === 'function') AppModules.core.renderDashboard();
      AppModules.reservas.showDetail(id);
    } else {
      AppModules.core.toast('❌ ' + (res.error || 'Erro ao aprovar reserva.'), 'error');
    }
  } catch (e) {
    AppModules.core.toast('❌ ' + (e?.payload?.error || e?.message || 'Erro de ligação ao servidor.'), 'error');
  }
}

async function enviarLinkPrecheckin(id, send = true) {
  try {
    const res = await AppModules.core.apiPost(`/api/reservations/${id}/send-precheckin`, { send });
    if (res.success) {
      if (!send) {
        AppModules.core.toast('🔗 Link de pré-checkin gerado.', 'success');
      } else {
        AppModules.core.toast(res.data?.email_sent ? '✅ Link de pré-checkin enviado por email.' : '🔗 Link de pré-checkin gerado — copia-o para enviar (o hóspede não tem email registado).', 'success');
      }
      await AppModules.reservas.loadReservas();
      AppModules.reservas.showDetail(id);
    } else {
      AppModules.core.toast('❌ ' + (res.error || 'Erro ao enviar link de pré-checkin.'), 'error');
    }
  } catch (e) {
    AppModules.core.toast('❌ ' + (e?.payload?.error || e?.message || 'Erro de ligação ao servidor.'), 'error');
  }
}

async function reabrirPrecheckin(id) {
  if (!confirm('Reabrir o pré-checkin? O hóspede volta a poder editar os dados no mesmo link (já pré-preenchido) e a equipa recebe notificação quando ele reenviar.')) return;
  const send = confirm('Enviar também o email com o link ao hóspede?');
  try {
    const res = await AppModules.core.apiPost(`/api/reservations/${id}/reopen-precheckin`, { send });
    if (res.success) {
      AppModules.core.toast(res.data?.email_sent
        ? '🔓 Pré-checkin reaberto e link reenviado por email.'
        : '🔓 Pré-checkin reaberto — o hóspede já pode editar no link.', 'success');
      await AppModules.reservas.loadReservas();
      AppModules.reservas.showDetail(id);
    } else {
      AppModules.core.toast('❌ ' + (res.error || 'Erro ao reabrir o pré-checkin.'), 'error');
    }
  } catch (e) {
    AppModules.core.toast('❌ ' + (e?.payload?.error || e?.message || 'Erro de ligação ao servidor.'), 'error');
  }
}

// A hora de chegada não está limitada à hora de check-in do alojamento: há
// chegadas antecipadas (bagagem, por exemplo) que a equipa precisa de registar.
function editarHoraChegada(id, current) {
  const span = document.getElementById('rdv2-arrival-val');
  if (!span) return;
  const previous = span.textContent;
  const input = document.createElement('input');
  input.type = 'time';
  input.value = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(current || '')) ? current : '';
  input.style.cssText = 'width:86px;padding:2px 4px;border:1px solid var(--brand-shell);border-radius:6px;font-size:12px;font-weight:600;background:var(--surface-card);color:var(--text-main);';

  let saving = false;
  const save = async () => {
    if (saving) return;
    saving = true;
    const value = input.value;
    span.textContent = value || '—';
    input.replaceWith(span);
    try {
      const res = await AppModules.core.apiPut(`/api/reservations/${id}`, { arrival_time: value });
      if (res.success) {
        AppModules.core.toast('✅ Hora de chegada atualizada', 'success');
        await AppModules.reservas.loadReservas();
      } else {
        span.textContent = previous;
        AppModules.core.toast('❌ ' + (res.error || 'Erro ao atualizar a hora de chegada.'), 'error');
      }
    } catch (e) {
      span.textContent = previous;
      AppModules.core.toast('❌ Erro de ligação', 'error');
    }
  };

  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); save(); }
    if (event.key === 'Escape') { saving = true; input.replaceWith(span); }
  });
  input.addEventListener('blur', save);

  span.replaceWith(input);
  input.focus();
}

async function copyPreCheckinLink(token) {
  const url = AppModules.reservas.preCheckinUrl(token);
  if (!url) return;
  try {
    await navigator.clipboard.writeText(url);
    AppModules.core.toast('Link de pre check-in copiado.', 'success');
  } catch (_) {
    AppModules.core.toast(url, 'info');
  }
}

async function cancelarReserva(id) {
  if (!confirm('Cancelar esta reserva? Será removida do Google Calendar.')) return;
  try {
    const res = await AppModules.core.apiDelete(`/api/reservations/${id}`);
    if (res.success) {
      AppUI.closeModal('detail-bg');
      AppModules.reservas.showReservasList();
      AppModules.core.toast('❌ Reserva cancelada.', 'info');
      await AppModules.reservas.loadReservas();
      if (typeof AppModules.calendario.renderCalView === 'function') AppModules.calendario.renderCalView();
      AppModules.core.renderDashboard();
    } else {
      AppModules.core.toast('❌ ' + (res.error || 'Erro ao cancelar.'), 'error');
    }
  } catch (e) {
    AppModules.core.toast('❌ Erro de ligação ao servidor.', 'error');
  }
}

// Verifica se o utilizador tem pelo menos um determinado role na hierarquia
// owner > manager > staff. Usado para esconder ações destrutivas.
function hasRole(minRole) {
  const rank = { staff: 1, manager: 2, owner: 3 };
  const userRank = rank[AppModules.core.currentUser?.role] || 0;
  return userRank >= (rank[minRole] || 0);
}

async function apagarReservaDefinitivo(id) {
  if (!confirm('⚠️ Esta reserva vai ser APAGADA e depois é IMPOSSÍVEL recuperar.\n\nOs pagamentos e tarefas operacionais associados também serão removidos. O hóspede e o histórico de emails são mantidos.')) return;
  if (!confirm('Confirmar eliminação definitiva? Esta ação NÃO pode ser desfeita.')) return;
  try {
    const { data: r } = await AppModules.core.apiGet(`/api/reservations/${id}`);
    // O backend só apaga reservas já canceladas — cancelar primeiro se necessário.
    if (r && r.status !== 'cancelada') {
      const c = await AppModules.core.apiDelete(`/api/reservations/${id}`);
      if (!c.success) { AppModules.core.toast('❌ ' + (c.error || 'Erro ao apagar.'), 'error'); return; }
    }
    const res = await AppModules.core.apiDelete(`/api/reservations/${id}/permanent`);
    if (res.success) {
      const detailBg = document.getElementById('detail-bg');
      if (detailBg?.classList.contains('open')) detailBg.classList.remove('open');
      AppModules.reservas.showReservasList();
      AppModules.core.toast('🗑 Reserva apagada definitivamente.', 'info');
      await AppModules.reservas.loadReservas();
      if (typeof AppModules.calendario.renderCalView === 'function') AppModules.calendario.renderCalView();
      AppModules.core.renderDashboard();
    } else {
      AppModules.core.toast('❌ ' + (res.error || 'Erro ao apagar.'), 'error');
    }
  } catch (e) {
    AppModules.core.toast('❌ Erro de ligação ao servidor.', 'error');
  }
}

async function reativarReserva(id) {
  if (!confirm('Reativar esta reserva? Vai restaurar os estados que existiam antes do cancelamento.')) return;
  try {
    const res = await AppModules.core.apiPut(`/api/reservations/${id}`, { status: 'confirmada' });
    if (res.success) {
      const detailBg = document.getElementById('detail-bg');
      if (detailBg?.classList.contains('open')) detailBg.classList.remove('open');
      AppModules.reservas.showReservasList();
      AppModules.core.toast('✅ Reserva reativada!', 'success');
      await AppModules.reservas.loadReservas();
      if (typeof AppModules.calendario.renderCalView === 'function') AppModules.calendario.renderCalView();
      AppModules.core.renderDashboard();
    } else {
      AppModules.core.toast('❌ ' + (res.error || 'Erro ao reativar.'), 'error');
    }
  } catch (e) {
    AppModules.core.toast('❌ Erro de ligação ao servidor.', 'error');
  }
}


})();
