async function loadTeamOverview() {
  try {
    const payload = await apiGet('/api/team');
    renderTeamMembers(payload?.data?.members || []);
    renderTeamInvitations(payload?.data?.invitations || []);
  } catch (err) {
    const members = document.getElementById('team-members-list');
    const invites = document.getElementById('team-invitations-list');
    if (members) members.innerHTML = '<div style="color:var(--vermelho);font-size:13px;">Não foi possível carregar a equipa.</div>';
    if (invites) invites.innerHTML = '<div style="color:var(--vermelho);font-size:13px;">Não foi possível carregar os convites.</div>';
  }
}

function renderTeamMembers(members) {
  const container = document.getElementById('team-members-list');
  if (!container) return;
  if (!members.length) {
    container.innerHTML = '<div style="color:var(--cinza);font-size:13px;">Ainda não existem membros adicionais.</div>';
    return;
  }

  container.innerHTML = members.map(member => `
    <div class="guest-row" style="display:grid;grid-template-columns:1.5fr 1fr auto;gap:12px;align-items:center;">
      <div>
        <div style="font-weight:600;color:var(--azul);">${escapeHtml(member.name)}</div>
        <div style="font-size:12px;color:var(--cinza);">${escapeHtml(member.email)}</div>
      </div>
      ${member.role === 'owner' ? `
        <div><span class="badge badge-confirmada">Proprietário</span></div>
      ` : `
        <select class="form-control" data-enhance-select data-app-select-class="app-select--filter" onchange="updateTeamRole('${escapeHtml(member.id)}', this.value)">
          <option value="manager" ${member.role === 'manager' ? 'selected' : ''}>Gestor</option>
          <option value="staff" ${member.role === 'staff' ? 'selected' : ''}>Funcionário</option>
        </select>
      `}
      ${member.role === 'owner' ? '<div></div>' : `
        <button class="btn btn-ghost btn-sm" onclick="removeTeamMember('${escapeHtml(member.id)}')">
          <i data-lucide="user-minus"></i> Remover
        </button>
      `}
    </div>
  `).join('');
  AppUI.enhanceSelects(container);
  AppUI.refreshDropdowns(container);
  if (window.lucide) lucide.createIcons();
}

function renderTeamInvitations(invitations) {
  const container = document.getElementById('team-invitations-list');
  if (!container) return;
  if (!invitations.length) {
    container.innerHTML = '<div style="color:var(--cinza);font-size:13px;">Sem convites pendentes.</div>';
    return;
  }

  container.innerHTML = invitations.map(invite => `
    <div class="guest-row" style="display:grid;grid-template-columns:1.5fr 1fr auto;gap:12px;align-items:center;">
      <div>
        <div style="font-weight:600;color:var(--azul);">${escapeHtml(invite.email)}</div>
        <div style="font-size:12px;color:var(--cinza);">Expira em ${formatDate(invite.expires_at.slice(0, 10))}</div>
      </div>
      <div><span class="badge badge-pendente">${invite.role === 'manager' ? 'Gestor' : 'Funcionário'}</span></div>
      <button class="btn btn-ghost btn-sm" onclick="removeTeamInvitation('${escapeHtml(invite.id)}')">
        <i data-lucide="trash-2"></i> Cancelar
      </button>
    </div>
  `).join('');
  if (window.lucide) lucide.createIcons();
}

async function inviteTeamMember() {
  const email = document.getElementById('team-invite-email')?.value || '';
  const role = document.getElementById('team-invite-role')?.value || 'staff';
  const feedback = document.getElementById('team-invite-feedback');

  try {
    const payload = await apiPost('/api/team/invitations', { email, role });
    const invite = payload?.data?.invitation;
    if (feedback) {
      if (invite?.email_sent) {
        feedback.textContent = 'Convite enviado por email com sucesso.';
      } else {
        feedback.innerHTML = `Convite criado. Link direto: <a href="${escapeHtml(invite.invite_url)}" target="_blank">${escapeHtml(invite.invite_url)}</a>`;
      }
    }
    document.getElementById('team-invite-email').value = '';
    await loadTeamOverview();
  } catch (err) {
    if (feedback) feedback.textContent = err?.payload?.error || err.message || 'Não foi possível enviar o convite.';
  }
}

async function updateTeamRole(id, role) {
  try {
    await apiRequest(`/api/team/members/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role })
    });
    toast('Papel atualizado.', 'success');
    await loadTeamOverview();
  } catch (err) {
    toast(err?.payload?.error || 'Não foi possível atualizar o papel.', 'error');
  }
}

async function removeTeamMember(id) {
  try {
    await apiDelete(`/api/team/members/${id}`);
    toast('Membro removido.', 'success');
    await loadTeamOverview();
  } catch (err) {
    toast(err?.payload?.error || 'Não foi possível remover o membro.', 'error');
  }
}

async function removeTeamInvitation(id) {
  try {
    await apiDelete(`/api/team/invitations/${id}`);
    toast('Convite cancelado.', 'success');
    await loadTeamOverview();
  } catch (err) {
    toast(err?.payload?.error || 'Não foi possível cancelar o convite.', 'error');
  }
}
