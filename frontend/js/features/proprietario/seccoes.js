// Área do proprietário: Equipa e permissões (antes nas Definições → Equipa),
// Plano e faturação, e Dados e segurança (cópia de segurança completa,
// restauro, lembrete e estado do sistema, antes nas Definições → Dados).
// A moldura e as ajudas comuns estão em pagina.js.
(() => {
const P = () => AppModules.proprietario;
const core = () => AppModules.core;
const u = () => P().ui;

// ── Equipa e permissões ──
const ROLE_INFO = [
  ['Proprietário', 'Tudo o que o gestor faz e ainda esta Área: empresa e marca, equipa e papéis, plano, cópias de segurança, registo de atividade, transferência e encerramento da conta. Há sempre um só.'],
  ['Gestor', 'Reservas, hóspedes, pagamentos, alojamentos e preços, despesas, mensagens, vouchers e as definições do negócio (emails, pagamentos e cancelamentos, Google).'],
  ['Funcionário', 'Consulta das reservas, do calendário e dos hóspedes, e os eventos e tarefas do dia a dia. Não vê valores de relatórios nem mexe nas definições.'],
];

function memberRow(m) {
  const { esc, ROLE_LABEL } = u();
  const me = m.user_id === core().currentUser?.id;
  const role = m.role === 'owner'
    ? `<span class="prop-chip is-accent">${ROLE_LABEL.owner}</span>`
    : `<select class="form-control" aria-label="Papel de ${esc(m.name)}" data-enhance-select data-app-select-class="app-select--filter" ${AppActions.attrs('change', 'prop-team-role', [m.id])}>
        <option value="manager" ${m.role === 'manager' ? 'selected' : ''}>Gestor</option>
        <option value="staff" ${m.role === 'staff' ? 'selected' : ''}>Funcionário</option>
      </select>`;
  return `<div class="prop-row prop-team-row">
      <div class="prop-row-main"><b>${esc(m.name)}</b><small>${esc(m.email)}${me ? ' · tu' : ''}</small></div>
      <div class="prop-row-role">${role}</div>
      ${m.role === 'owner' ? '<span></span>' : `<button type="button" class="btn btn-ghost btn-sm prop-icon-btn prop-danger" title="Remover da equipa" aria-label="Remover ${esc(m.name)} da equipa" ${AppActions.attrs('click', 'prop-team-remove', [m.id, m.name])}>${u().ic('user-minus', 16)}</button>`}
    </div>`;
}

function inviteRow(i) {
  const { esc, ROLE_LABEL, dateShort } = u();
  const days = Math.ceil((Date.parse(i.expires_at) - Date.now()) / 86400000);
  const expiry = days > 0 ? `Convite pendente · expira ${days === 1 ? 'amanhã' : `em ${days} dias`}` : 'Convite expirado';
  return `<div class="prop-row prop-team-row">
      <div class="prop-row-main"><b class="prop-muted">${esc(i.email)}</b><small class="${days > 0 ? 'prop-warn' : 'prop-bad'}" title="${esc(dateShort(i.expires_at))}">${expiry}</small></div>
      <div class="prop-row-role"><span class="prop-muted">${esc(ROLE_LABEL[i.role] || i.role)}</span></div>
      <button type="button" class="btn btn-ghost btn-sm prop-icon-btn prop-danger" title="Cancelar convite" aria-label="Cancelar o convite de ${esc(i.email)}" ${AppActions.attrs('click', 'prop-team-revoke', [i.id])}>${u().ic('x', 16)}</button>
    </div>`;
}

P().defineSection('equipa', async panel => {
  const { esc, ic, head } = u();
  const { data } = await core().apiGet('/api/team');
  const members = data.members || [];
  const invites = data.invitations || [];
  panel.innerHTML = `${head('Equipa e permissões', 'Só o proprietário gere a equipa: convites, papéis e quem sai.')}
    <section class="card prop-card">
      <h3>Convidar</h3>
      <form class="prop-invite" id="prop-invite" novalidate>
        <label class="form-group prop-field"><span class="form-label">Email</span>
          <input class="form-control" name="email" type="email" placeholder="colaborador@empresa.com" autocomplete="off" required></label>
        <label class="form-group prop-field"><span class="form-label">Papel</span>
          <select class="form-control" name="role" data-enhance-select data-app-select-class="app-select--filter">
            <option value="staff">Funcionário</option><option value="manager">Gestor</option>
          </select></label>
        <button type="submit" class="btn btn-primary">${ic('send', 15)} Enviar convite</button>
      </form>
      <p class="prop-feedback" role="status" hidden></p>
    </section>
    <section class="card prop-card">
      <h3>Membros <span class="prop-count">${members.length}</span></h3>
      <div class="prop-rows">${members.map(memberRow).join('') || '<p class="prop-muted">Ainda não há membros.</p>'}</div>
      ${invites.length ? `<h3 class="prop-sub">Convites pendentes <span class="prop-count">${invites.length}</span></h3><div class="prop-rows">${invites.map(inviteRow).join('')}</div>` : ''}
    </section>
    <details class="card prop-card prop-roles">
      <summary>${ic('shield-check', 16)} O que cada papel pode fazer</summary>
      <dl>${ROLE_INFO.map(([role, text]) => `<div><dt>${esc(role)}</dt><dd>${esc(text)}</dd></div>`).join('')}</dl>
      <p class="prop-muted">Para passar a propriedade a outra pessoa, use <a href="/proprietario" ${AppActions.attrs('click', 'prop-tab', ['propriedade'])}>Propriedade e encerramento</a>: a pessoa tem de ser gestor e aceitar.</p>
    </details>`;
  panel.querySelector('#prop-invite').addEventListener('submit', event => { event.preventDefault(); invite(panel); });
});

async function invite(panel) {
  const form = panel.querySelector('#prop-invite');
  const feedback = panel.querySelector('.prop-feedback');
  const button = form.querySelector('[type="submit"]');
  feedback.hidden = true;
  AppUI.setButtonLoading(button, true, 'A enviar…');
  try {
    const { data } = await core().apiPost('/api/team/invitations', { email: form.email.value, role: form.role.value });
    const inv = data?.invitation;
    await P().ui.refresh();
    const fresh = panel.querySelector('.prop-feedback');
    fresh.innerHTML = inv?.email_sent ? 'Convite enviado por email.'
      : `Convite criado (o email não saiu: o Gmail não está ligado). Envie este link: <a href="${u().esc(inv.invite_url)}" target="_blank" rel="noopener">${u().esc(inv.invite_url)}</a>`;
    fresh.hidden = false;
  } catch (e) {
    feedback.textContent = u().errText(e, 'Não foi possível enviar o convite.');
    feedback.hidden = false;
    AppUI.setButtonLoading(button, false);
  }
}

async function changeRole(id, role) {
  try {
    await core().apiRequest(`/api/team/members/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }) });
    core().toast('Papel atualizado.', 'success');
  } catch (e) {
    core().toast(`❌ ${u().errText(e, 'Não foi possível atualizar o papel.')}`, 'error');
  }
  P().ui.refresh();
}

async function removeMember(id, name) {
  if (!(await core().confirmar(`Remover ${name} da equipa?\n\nDeixa de ter acesso a esta organização; as sessões abertas terminam.`))) return;
  try {
    await core().apiDelete(`/api/team/members/${encodeURIComponent(id)}`);
    core().toast('Membro removido.', 'success');
  } catch (e) {
    core().toast(`❌ ${u().errText(e, 'Não foi possível remover o membro.')}`, 'error');
  }
  P().ui.refresh();
}

async function revokeInvite(id) {
  try {
    await core().apiDelete(`/api/team/invitations/${encodeURIComponent(id)}`);
    core().toast('Convite cancelado.', 'success');
  } catch (e) {
    core().toast(`❌ ${u().errText(e, 'Não foi possível cancelar o convite.')}`, 'error');
  }
  P().ui.refresh();
}

// ── Plano e faturação ──
function limits(p) {
  const acc = p.max_accommodations == null ? 'alojamentos sem limite' : `até ${p.max_accommodations} ${p.max_accommodations === 1 ? 'alojamento' : 'alojamentos'}`;
  const team = p.max_members == null ? 'equipa sem limite' : `${p.max_members} ${p.max_members === 1 ? 'pessoa' : 'pessoas'}`;
  return `${acc} · ${team}`;
}
let changing = false;

P().defineSection('plano', async panel => {
  const { esc, ic, head, notice, euros, dateShort, ticketLink } = u();
  const [{ data }, invoicesRes] = await Promise.all([core().apiGet('/api/owner/plans'), core().apiGet('/api/owner/invoices')]);
  const plans = data.plans || [];
  const currentPlan = plans.find(p => p.current) || null;
  const sub = data.subscription;
  const price = sub?.amount_cents != null ? `${euros(sub.amount_cents)} / ${sub.billing === 'yearly' ? 'ano' : 'mês'}` : '';
  const renew = sub?.next_date ? `renova a ${dateShort(sub.next_date)}` : '';
  const request = data.request;
  const invoices = invoicesRes.data?.invoices || [];
  const options = plans.filter(p => !p.current);
  panel.innerHTML = `${head('Plano e faturação')}
    <section class="card prop-card">
      <div class="prop-plan-now">
        <div><b>${esc(currentPlan?.name || 'Sem plano atribuído')}</b>
          <small>${esc([price, renew].filter(Boolean).join(' · ') || (currentPlan ? limits(currentPlan) : 'Sem limites de alojamentos nem de equipa'))}</small></div>
        ${request ? '' : `<button type="button" class="btn btn-ghost btn-sm" ${AppActions.attrs('click', 'prop-plan-change', [])} aria-expanded="${changing}">${ic('arrow-left-right', 15)} Mudar de plano</button>`}
      </div>
      ${request ? notice('info', `Pedido de mudança para <strong>${esc(request.plan_name || '')}</strong> enviado à equipa da plataforma (${ticketLink(request.ticket)}). Responde-lhe lá; quando o pedido for resolvido pode fazer outro.`, 'send') : ''}
      <div class="prop-plans">
        ${plans.map(p => `<div class="prop-plan${p.current ? ' is-current' : ''}"><b>${esc(p.name)}</b><small>${esc(limits(p))}</small>${p.current ? '<em>Atual</em>' : ''}</div>`).join('')}
      </div>
      <form class="prop-plan-form" id="prop-plan-form" ${changing && !request ? '' : 'hidden'} novalidate>
        <label class="form-group prop-field"><span class="form-label">Plano pretendido</span>
          <select class="form-control" name="plan_id" data-enhance-select data-app-select-class="app-select--filter">
            ${options.map(p => `<option value="${esc(p.id)}">${esc(p.name)} — ${esc(limits(p))}</option>`).join('')}
          </select></label>
        <label class="form-group prop-field"><span class="form-label">Nota para a equipa da plataforma (opcional)</span>
          <textarea class="form-control" name="note" rows="3" maxlength="1000" placeholder="Ex.: vamos abrir mais duas casas em março."></textarea></label>
        <p class="prop-error" role="alert" hidden></p>
        <div class="prop-actions">
          <button type="button" class="btn btn-ghost" ${AppActions.attrs('click', 'prop-plan-change', [])}>Cancelar</button>
          <button type="submit" class="btn btn-primary">${ic('send', 15)} Enviar pedido</button>
        </div>
      </form>
    </section>
    <section class="card prop-card">
      <h3>Faturas da subscrição</h3>
      ${invoices.length ? `<div class="prop-rows">${invoices.map(i => `<div class="prop-row prop-invoice"><span>${esc(dateShort(i.date))}</span><b>${esc(euros(i.amount_cents))}</b>
          <span class="prop-chip ${i.status === 'paid' ? 'is-ok' : 'is-warn'}">${i.status === 'paid' ? `Paga${i.paid_date ? ` a ${esc(dateShort(i.paid_date))}` : ''}` : 'Por pagar'}</span></div>`).join('')}</div>`
        : `<div class="prop-empty">${ic('receipt-text', 22)}<p>As faturas aparecem aqui quando forem emitidas.</p></div>`}
      <p class="prop-muted prop-small">Hoje a subscrição é gerida pela equipa da plataforma. «Mudar de plano» envia-lhe um pedido (aparece em Ajuda e feedback); o pagamento automático da subscrição ainda não existe.</p>
    </section>`;
  panel.querySelector('#prop-plan-form').addEventListener('submit', event => { event.preventDefault(); requestPlan(panel); });
});

async function requestPlan(panel) {
  const form = panel.querySelector('#prop-plan-form');
  const error = form.querySelector('.prop-error');
  const button = form.querySelector('[type="submit"]');
  error.hidden = true;
  AppUI.setButtonLoading(button, true, 'A enviar…');
  try {
    await core().apiPost('/api/owner/plan-request', { plan_id: form.plan_id.value, note: form.note.value });
    changing = false;
    core().toast('✅ Pedido enviado à equipa da plataforma.', 'success');
    P().ui.refresh();
  } catch (e) {
    error.textContent = u().errText(e, 'Não foi possível enviar o pedido.');
    error.hidden = false;
    AppUI.setButtonLoading(button, false);
  }
}

// ── Dados e segurança ──
const every = ms => (ms >= 3600000 ? `${Math.round(ms / 3600000)} h` : `${Math.round(ms / 60000)} min`);
const formatWhen = value => (value ? window.ReservationDates.formatDateTime(value) : '—');

P().defineSection('dados', async panel => {
  const { ic, head, esc, ago, dateShort } = u();
  const { data } = await core().apiGet('/api/owner/closure');
  const last = data.last_backup_at;
  panel.innerHTML = `${head('Dados e segurança', 'A exportação das listas (Excel e PDF) continua nas Definições → Dados.')}
    <section class="card prop-card">
      <div class="prop-line">
        <div><b>Cópia de segurança completa</b><small>ZIP com reservas, hóspedes, alojamentos, fotografias, mensagens e definições. ${last ? `Última: ${esc(ago(last))} (${esc(dateShort(last))}).` : 'Ainda não descarregou nenhuma.'}</small></div>
        <button type="button" class="btn btn-primary btn-sm" ${AppActions.attrs('click', 'prop-backup-export', [])}>${ic('download', 15)} Descarregar</button>
      </div>
      <div class="prop-line">
        <div><b>Restaurar uma cópia</b><small>Substitui os dados atuais pelos do ficheiro (pede confirmação). Contas, equipa e acessos não mudam.</small></div>
        <label class="btn btn-ghost btn-sm prop-file">${ic('upload', 15)} Escolher ficheiro
          <input type="file" accept=".zip,application/zip" data-on-change="index-import-d-b-d60a8a8"></label>
      </div>
      <div class="prop-line">
        <div><b>Lembrete de cópia</b><small>Aviso no sino quando passar o prazo.</small></div>
        <select class="form-control prop-narrow" aria-label="Frequência do lembrete" data-enhance-select data-app-select-class="app-select--filter" data-export-reminder="cliente_zip" data-on-change="index-set-export-reminder-69d5a9c">
          <option value="">Desligado</option><option value="7">7 dias</option><option value="15">15 dias</option><option value="30">1 mês</option>
        </select>
      </div>
    </section>
    <section class="card prop-card">
      <div class="prop-card-h"><h3>Estado do sistema</h3><button type="button" class="btn btn-ghost btn-sm" ${AppActions.attrs('click', 'prop-system-status', [])}>${ic('refresh-cw', 15)} Atualizar</button></div>
      <div id="prop-system-status" class="prop-muted">A carregar…</div>
    </section>`;
  core().initExportReminderControls?.();
  loadSystemStatus(panel);
});

// Tarefas automáticas e envios pendentes (/api/ops/status).
async function loadSystemStatus(panel) {
  const box = panel.querySelector('#prop-system-status');
  if (!box) return;
  const esc = u().esc;
  try {
    const { data } = await core().apiGet('/api/ops/status');
    const rows = (data.tasks || []).map(task => {
      const failed = task.last_error_at && (!task.last_ok_at || task.last_error_at > task.last_ok_at);
      const result = task.running ? 'A correr' : failed ? `Falhou: ${esc(task.last_error || '')}` : task.last_ok_at ? 'OK' : '—';
      return `<tr><td>${esc(task.label)}</td><td>cada ${every(task.interval_ms)}</td><td>${formatWhen(task.last_finished_at)}</td>
        <td class="${failed ? 'prop-bad' : ''}">${result}</td><td>${formatWhen(task.next_run_at)}</td></tr>`;
    }).join('');
    const queue = data.email?.queue?.n ?? 0, failedNotices = data.email?.failed ?? 0;
    box.classList.remove('prop-muted');
    box.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Tarefa</th><th>Intervalo</th><th>Última execução</th><th>Resultado</th><th>Próxima</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
      <p class="prop-small">Envios ao hóspede por fazer: <strong>${queue}</strong> · Avisos que falharam: <strong class="${failedNotices ? 'prop-bad' : ''}">${failedNotices}</strong></p>`;
  } catch {
    box.innerHTML = u().failed('Não foi possível carregar o estado do sistema.');
  }
}

// A exportação é a mesma do núcleo (dashboard.js); no fim, a data da última
// cópia volta a ser lida (o servidor regista-a no registo de atividade).
async function exportBackup() {
  await core().exportDB();
  P().ui.refresh();
}

const panelOf = el => el.closest('[data-prop-panel]');

AppActions.register({
  'prop-team-remove': (el, event, args) => removeMember(args[0], args[1]),
  'prop-team-revoke': (el, event, args) => revokeInvite(args[0]),
  'prop-plan-change': () => { changing = !changing; P().ui.refresh(); },
  'prop-backup-export': () => exportBackup(),
  'prop-system-status': el => loadSystemStatus(panelOf(el)),
}, 'click');

AppActions.register({
  'prop-team-role': (el, event, args) => changeRole(args[0], el.value),
}, 'change');

})();
