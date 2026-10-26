// Estado privado; interface partilhada em AppModules.definicoes.
(() => {
AppModules.define('definicoes', {
  inviteTeamMember: { get: () => inviteTeamMember },
  loadTeamOverview: { get: () => loadTeamOverview },
  loadSystemStatus: { get: () => loadSystemStatus },
});

// ── Estado do sistema (proprietário): tarefas automáticas e envios pendentes ──
const formatWhen = value => (value ? new Date(value).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const every = ms => (ms >= 3600000 ? `${Math.round(ms / 3600000)} h` : `${Math.round(ms / 60000)} min`);
async function loadSystemStatus() {
  const box = document.getElementById('system-status');
  if (!box) return;
  try {
    const { data } = await AppModules.core.apiGet('/api/ops/status');
    const esc = AppModules.core.escapeHtml;
    const rows = (data.tasks || []).map(task => {
      const failed = task.last_error_at && (!task.last_ok_at || task.last_error_at > task.last_ok_at);
      const result = task.running ? 'A correr' : failed ? `Falhou: ${esc(task.last_error || '')}` : task.last_ok_at ? 'OK' : '—';
      return `<tr><td>${esc(task.label)}</td><td>cada ${every(task.interval_ms)}</td><td>${formatWhen(task.last_finished_at)}</td>
        <td style="color:${failed ? 'var(--vermelho)' : 'inherit'};">${result}</td><td>${formatWhen(task.next_run_at)}</td></tr>`;
    }).join('');
    const queue = data.email?.queue?.n ?? 0, failedNotices = data.email?.failed ?? 0;
    box.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Tarefa</th><th>Intervalo</th><th>Última execução</th><th>Resultado</th><th>Próxima</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
      <p style="margin:12px 0 0;">Envios ao hóspede por fazer: <strong>${queue}</strong> · Avisos que falharam: <strong style="color:${failedNotices ? 'var(--vermelho)' : 'inherit'};">${failedNotices}</strong></p>`;
  } catch {
    box.innerHTML = '<div style="color:var(--vermelho);">Não foi possível carregar o estado do sistema.</div>';
  }
}

async function loadTeamOverview() {
  try {
    const payload = await AppModules.core.apiGet('/api/team');
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
    <div class="guest-row team-row" style="display:grid;grid-template-columns:1.5fr 1fr auto;gap:12px;align-items:center;">
      <div>
        <div style="font-weight:600;color:var(--azul);">${AppModules.core.escapeHtml(member.name)}</div>
        <div style="font-size:12px;color:var(--cinza);">${AppModules.core.escapeHtml(member.email)}</div>
      </div>
      ${member.role === 'owner' ? `
        <div><span class="badge badge-confirmada">Proprietário</span></div>
      ` : `
        <select class="form-control" data-enhance-select data-app-select-class="app-select--filter" ${AppActions.attrs("change", "team-update-team-role-1918006", [String((member.id) ?? '')])}>
          <option value="manager" ${member.role === 'manager' ? 'selected' : ''}>Gestor</option>
          <option value="staff" ${member.role === 'staff' ? 'selected' : ''}>Funcionário</option>
        </select>
      `}
      ${member.role === 'owner' ? '<div></div>' : `
        <button class="btn btn-ghost btn-sm" ${AppActions.attrs("click", "team-remove-team-member-167095f", [String((member.id) ?? '')])}>
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
    <div class="guest-row team-row" style="display:grid;grid-template-columns:1.5fr 1fr auto;gap:12px;align-items:center;">
      <div>
        <div style="font-weight:600;color:var(--azul);">${AppModules.core.escapeHtml(invite.email)}</div>
        <div style="font-size:12px;color:var(--cinza);">Expira em ${AppModules.core.formatDate(invite.expires_at.slice(0, 10))}</div>
      </div>
      <div><span class="badge badge-pendente">${invite.role === 'manager' ? 'Gestor' : 'Funcionário'}</span></div>
      <button class="btn btn-ghost btn-sm" ${AppActions.attrs("click", "team-remove-team-invitation-89e6362", [String((invite.id) ?? '')])}>
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
    const payload = await AppModules.core.apiPost('/api/team/invitations', { email, role });
    const invite = payload?.data?.invitation;
    if (feedback) {
      if (invite?.email_sent) {
        feedback.textContent = 'Convite enviado por email com sucesso.';
      } else {
        feedback.innerHTML = `Convite criado. Link direto: <a href="${AppModules.core.escapeHtml(invite.invite_url)}" target="_blank">${AppModules.core.escapeHtml(invite.invite_url)}</a>`;
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
    await AppModules.core.apiRequest(`/api/team/members/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role })
    });
    AppModules.core.toast('Papel atualizado.', 'success');
    await loadTeamOverview();
  } catch (err) {
    AppModules.core.toast(err?.payload?.error || 'Não foi possível atualizar o papel.', 'error');
  }
}

async function removeTeamMember(id) {
  try {
    await AppModules.core.apiDelete(`/api/team/members/${id}`);
    AppModules.core.toast('Membro removido.', 'success');
    await loadTeamOverview();
  } catch (err) {
    AppModules.core.toast(err?.payload?.error || 'Não foi possível remover o membro.', 'error');
  }
}

async function removeTeamInvitation(id) {
  try {
    await AppModules.core.apiDelete(`/api/team/invitations/${id}`);
    AppModules.core.toast('Convite cancelado.', 'success');
    await loadTeamOverview();
  } catch (err) {
    AppModules.core.toast(err?.payload?.error || 'Não foi possível cancelar o convite.', 'error');
  }
}

AppActions.register({
  "team-remove-team-invitation-89e6362": (el, event, args) => { removeTeamInvitation(args[0]) },
  "team-remove-team-member-167095f": (el, event, args) => { removeTeamMember(args[0]) },
}, "click");

AppActions.register({
  "team-update-team-role-1918006": (el, event, args) => { updateTeamRole(args[0], el.value) },
}, "change");

AppActions.register({
  "team-load-system-status": () => { loadSystemStatus(); },
}, "click");

})();
