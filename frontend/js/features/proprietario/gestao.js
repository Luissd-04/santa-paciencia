// Área do proprietário: Registo de atividade (/api/owner/audit, com filtros
// por pessoa e tipo, «Mostrar mais» e exportação CSV feita no servidor) e
// Propriedade e encerramento (transferir a propriedade a um gestor; pedir o
// encerramento da conta à plataforma, com a cópia de segurança primeiro).
(() => {
const P = () => AppModules.proprietario;
const core = () => AppModules.core;
const u = () => P().ui;

// ── Registo de atividade ──
const log = { user: '', type: '', events: [], next: null, people: [], types: {} };

function eventRow(e) {
  const { esc, when } = u();
  const actor = e.actor ? `<b>${esc(e.actor.name)}</b> ` : '';
  return `<div class="prop-row prop-log-row"><time datetime="${esc(e.created_at)}" title="${esc(new Date(e.created_at).toLocaleString('pt-PT'))}">${esc(when(e.created_at))}</time>
      <span>${actor}${esc(e.text)}</span><span class="prop-chip">${esc(e.type_label)}</span></div>`;
}

function query(extra = {}) {
  const params = new URLSearchParams();
  if (log.user) params.set('user', log.user);
  if (log.type) params.set('type', log.type);
  for (const [k, v] of Object.entries(extra)) if (v) params.set(k, v);
  const text = params.toString();
  return text ? `?${text}` : '';
}

async function loadLog(more = false) {
  const { data } = await core().apiGet(`/api/owner/audit${query(more ? { before: log.next } : {})}`);
  log.events = more ? [...log.events, ...data.events] : data.events;
  log.next = data.next;
  if (data.people) log.people = data.people;
  if (data.types) log.types = data.types;
}

function drawLog(panel) {
  const { esc, ic, head } = u();
  panel.innerHTML = `${head('Registo de atividade', 'Ações sensíveis da organização: equipa, cópias de segurança, eliminações, ligações e propriedade.')}
    <section class="card prop-card">
      <div class="prop-filters">
        <label class="form-group prop-field"><span class="form-label">Pessoa</span>
          <select class="form-control" data-prop-log="user" data-enhance-select data-app-select-class="app-select--filter">
            <option value="">Todas</option>${log.people.map(p => `<option value="${esc(p.id)}" ${p.id === log.user ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
          </select></label>
        <label class="form-group prop-field"><span class="form-label">Tipo</span>
          <select class="form-control" data-prop-log="type" data-enhance-select data-app-select-class="app-select--filter">
            <option value="">Todos</option>${Object.entries(log.types).map(([k, v]) => `<option value="${esc(k)}" ${k === log.type ? 'selected' : ''}>${esc(v)}</option>`).join('')}
          </select></label>
        <a class="btn btn-ghost btn-sm prop-csv" href="${esc(`${core().API_BASE || ''}/api/owner/audit.csv${query()}`)}" download>${ic('download', 15)} Exportar CSV</a>
      </div>
      <div class="prop-rows prop-log">${log.events.map(eventRow).join('') || `<div class="prop-empty">${ic('history', 22)}<p>Sem atividade${log.user || log.type ? ' com estes filtros' : ' registada'}.</p></div>`}</div>
      ${log.next ? `<div class="prop-actions prop-center"><button type="button" class="btn btn-ghost btn-sm" ${AppActions.attrs('click', 'prop-log-more', [])}>Mostrar mais</button></div>` : ''}
    </section>`;
  panel.querySelectorAll('[data-prop-log]').forEach(select => select.addEventListener('change', async () => {
    log[select.dataset.propLog] = select.value;
    await loadLog();
    drawLog(panel);
    AppUI.enhanceSelects(panel);
    AppUI.refreshDropdowns(panel);
    if (window.lucide) lucide.createIcons();
  }));
}

P().defineSection('registo', async panel => {
  await loadLog();
  drawLog(panel);
});

async function more(el) {
  const panel = el.closest('[data-prop-panel]');
  el.disabled = true;
  try {
    await loadLog(true);
    drawLog(panel);
    AppUI.enhanceSelects(panel);
    AppUI.refreshDropdowns(panel);
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    el.disabled = false;
    core().toast(`❌ ${u().errText(e, 'Não foi possível carregar mais.')}`, 'error');
  }
}

// ── Propriedade e encerramento ──
P().defineSection('propriedade', async panel => {
  const { esc, ic, head, notice, dateShort, ago, ticketLink } = u();
  const [transferRes, closureRes] = await Promise.all([core().apiGet('/api/owner/transfer'), core().apiGet('/api/owner/closure')]);
  const { transfer, candidates } = transferRes.data;
  const closure = closureRes.data;
  const transferBody = transfer
    ? `${notice('info', `À espera de <strong>${esc(transfer.to.name)}</strong> (${esc(transfer.to.email)}) até ${esc(dateShort(transfer.expires_at))}. Até aceitar, nada muda.`, 'hourglass')}
       <div class="prop-actions prop-start"><button type="button" class="btn btn-ghost btn-sm" ${AppActions.attrs('click', 'prop-transfer-cancel', [])}>Cancelar a transferência</button></div>`
    : candidates.length
      ? `<form class="prop-transfer" id="prop-transfer" novalidate>
          <label class="form-group prop-field"><span class="form-label">Novo proprietário</span>
            <select class="form-control" name="membership_id" data-enhance-select data-app-select-class="app-select--filter">
              ${candidates.map(c => `<option value="${esc(c.membership_id)}">${esc(c.name)} · ${esc(c.email)}</option>`).join('')}
            </select></label>
          <button type="submit" class="btn btn-ghost">${ic('key-round', 15)} Transferir…</button>
        </form>`
      : `<p class="prop-muted">Ainda não há nenhum gestor ativo. Em <a href="/proprietario" ${AppActions.attrs('click', 'prop-tab', ['equipa'])}>Equipa e permissões</a>, mude o papel da pessoa para Gestor.</p>`;
  const fresh = closure.backup_fresh;
  const closureBody = closure.request
    ? notice('warn', `Pedido de encerramento enviado (${ticketLink(closure.request.ticket)}). A equipa da plataforma responde em Ajuda e feedback; nada é apagado sem ela confirmar consigo.`, 'triangle-alert')
    : `<div class="prop-step${fresh ? ' is-done' : ''}">
          ${ic(fresh ? 'circle-check' : 'download', 16)}
          <span>${fresh ? `Cópia de segurança descarregada ${esc(ago(closure.last_backup_at))}.` : '1. Descarregue a cópia de segurança completa (nas últimas 24 horas).'}</span>
          ${fresh ? '' : `<button type="button" class="btn btn-ghost btn-sm" ${AppActions.attrs('click', 'prop-closure-backup', [])}>Descarregar</button>`}
        </div>
        <form class="prop-closure" id="prop-closure" novalidate>
          ${fresh ? '' : '<label class="prop-check"><input type="checkbox" name="confirm_without_backup"> Não quero descarregar a cópia: sei que os dados não se recuperam depois de apagados.</label>'}
          <label class="form-group prop-field"><span class="form-label">Motivo (opcional)</span>
            <textarea class="form-control" name="reason" rows="2" maxlength="2000"></textarea></label>
          <p class="prop-error" role="alert" hidden></p>
          <button type="submit" class="btn btn-ghost prop-danger">${ic('octagon-x', 15)} Pedir encerramento…</button>
        </form>`;
  panel.innerHTML = `${head('Propriedade e encerramento')}
    <section class="prop-danger-zone card prop-card">
      <div class="prop-split">
        <div class="prop-split-col">
          <h3>Transferir a propriedade</h3>
          <p>Escolha um gestor para passar a ser o proprietário. Recebe um aviso no sino (e um email, com o Gmail ligado) e tem de aceitar; até lá nada muda. Depois, passa a gestor. O pedido expira ao fim de 7 dias.</p>
          ${transferBody}
        </div>
        <div class="prop-split-col">
          <h3 class="prop-bad">Encerrar a conta</h3>
          <p>Pede o encerramento à equipa da plataforma: primeiro descarrega a cópia completa; depois a equipa confirma consigo e trata do resto. Nada é apagado automaticamente (e o que a lei obriga a conservar fica).</p>
          ${closureBody}
        </div>
      </div>
    </section>`;
  panel.querySelector('#prop-transfer')?.addEventListener('submit', event => { event.preventDefault(); startTransfer(panel); });
  panel.querySelector('#prop-closure')?.addEventListener('submit', event => { event.preventDefault(); requestClosure(panel); });
});

async function startTransfer(panel) {
  const form = panel.querySelector('#prop-transfer');
  const option = form.membership_id.selectedOptions[0];
  const name = option?.textContent.split(' · ')[0] || '';
  if (!(await core().confirmar(`Pedir a ${name} que passe a ser o proprietário?\n\nQuando aceitar, ${name} fica proprietário e você passa a gestor.`, { label: 'Enviar pedido' }))) return;
  try {
    const { data } = await core().apiPost('/api/owner/transfer', { membership_id: form.membership_id.value });
    core().toast(data.email_sent ? '✅ Pedido enviado por email e no sino.' : '✅ Pedido enviado: aparece no sino da pessoa.', 'success');
  } catch (e) {
    core().toast(`❌ ${u().errText(e, 'Não foi possível pedir a transferência.')}`, 'error');
  }
  P().ui.refresh();
}

async function cancelTransfer() {
  if (!(await core().confirmar('Cancelar o pedido de transferência de propriedade?', { label: 'Cancelar pedido' }))) return;
  try {
    await core().apiDelete('/api/owner/transfer');
    core().toast('Transferência cancelada.', 'info');
  } catch (e) {
    core().toast(`❌ ${u().errText(e, 'Não foi possível cancelar.')}`, 'error');
  }
  P().ui.refresh();
}

async function requestClosure(panel) {
  const form = panel.querySelector('#prop-closure');
  const error = form.querySelector('.prop-error');
  error.hidden = true;
  const confirmWithout = Boolean(form.confirm_without_backup?.checked);
  if (form.confirm_without_backup && !confirmWithout) {
    error.textContent = 'Descarregue primeiro a cópia de segurança, ou confirme que não a quer.';
    error.hidden = false;
    return;
  }
  if (!(await core().confirmar('Pedir o encerramento da conta?\n\nO pedido vai para a equipa da plataforma, que confirma consigo antes de apagar o que quer que seja.', { label: 'Pedir encerramento', danger: true }))) return;
  try {
    await core().apiPost('/api/owner/closure', { reason: form.reason.value, confirm_without_backup: confirmWithout });
    core().toast('Pedido de encerramento enviado.', 'success');
    P().ui.refresh();
  } catch (e) {
    error.textContent = u().errText(e, 'Não foi possível enviar o pedido.');
    error.hidden = false;
  }
}

AppActions.register({
  'prop-log-more': el => more(el),
  'prop-transfer-cancel': () => cancelTransfer(),
  'prop-closure-backup': async () => { await core().exportDB(); P().ui.refresh(); },
}, 'click');

})();
