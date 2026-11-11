// Consola da plataforma: registo das ações feitas na consola (data, ação, alvo),
// mais recentes primeiro, com «Carregar mais».
(() => {
AppModules.define('consola', {
  registo: { get: () => page },
});

const fmt = AppModules.consola.fmt;
const api = AppModules.consola.api;
const { esc } = fmt;
const LIMIT = 50;
const ACTIONS = {
  'platform.unlock': 'Consola desbloqueada',
  'platform.unlock_failed': 'Tentativa de desbloqueio falhada',
  'organization.update': 'Cliente atualizado',
  'support.status': 'Estado do pedido alterado',
  'plan.create': 'Pacote criado',
  'plan.update': 'Pacote alterado',
  'plan.delete': 'Pacote apagado',
  'task.create': 'Tarefa criada',
  'task.update': 'Tarefa alterada',
  'task.delete': 'Tarefa apagada',
  'task.comment': 'Comentário numa tarefa',
  'announcement.create': 'Comunicado criado',
  'announcement.update': 'Comunicado alterado',
  'announcement.end': 'Comunicado terminado',
  'announcement.delete': 'Comunicado apagado',
};
const TARGETS = { organization: 'Cliente', user: 'Utilizador', support_ticket: 'Pedido', plan: 'Pacote', platform_task: 'Tarefa', task: 'Tarefa', announcement: 'Comunicado' };
const state = { rows: [], orgs: new Map(), more: false, busy: false };

function actionLabel(action) {
  if (ACTIONS[action]) return ACTIONS[action];
  const text = String(action || '').replace(/[._]+/g, ' ').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : 'Ação';
}

function detailsOf(row) {
  let details = row.details;
  if (typeof details === 'string') { try { details = JSON.parse(details); } catch { details = null; } }
  if (!details || typeof details !== 'object') return '';
  const parts = [];
  if (details.status) {
    const labels = row.target_type === 'support_ticket' ? fmt.TICKET_STATUS : fmt.STATUS;
    const taskLabel = { ideas: 'Ideias', todo: 'A fazer', doing: 'Em curso', done: 'Feito' }[details.status];
    parts.push(`Estado: ${(row.target_type === 'platform_task' ? taskLabel : labels[details.status]?.label) || details.status}`);
  }
  if (details.notes_changed) parts.push('Notas alteradas');
  return parts.join(' · ');
}

// Nome do alvo, quando a ação o guardou nos detalhes (pacote, tarefa, comunicado).
function targetName(row) {
  let details = row.details;
  if (typeof details === 'string') { try { details = JSON.parse(details); } catch { details = null; } }
  const name = details && typeof details === 'object' ? (details.name || details.title) : '';
  return typeof name === 'string' ? name : '';
}

function targetHtml(row) {
  if (!row.target_type && !row.target_id) return '<span class="pl-muted">—</span>';
  const kind = TARGETS[row.target_type] || (row.target_type ? String(row.target_type) : '');
  if (row.target_type === 'organization' && row.target_id != null) {
    const name = state.orgs.get(String(row.target_id));
    return fmt.link(fmt.orgHref(row.target_id), esc(name || `${kind} ${row.target_id}`), 'pl-target');
  }
  if (row.target_type === 'support_ticket' && row.target_id != null) {
    return fmt.link(`/plataforma/suporte/${encodeURIComponent(row.target_id)}`, esc(`${kind} ${String(row.target_id).slice(0, 8)}`), 'pl-target');
  }
  const PAGES = { platform_task: ['/plataforma/tarefas', 'Tarefa'], task: ['/plataforma/tarefas', 'Tarefa'], announcement: ['/plataforma/comunicados', 'Comunicado'], plan: ['/plataforma/pacotes', 'Pacote'] };
  if (PAGES[row.target_type]) {
    const name = targetName(row);
    return fmt.link(PAGES[row.target_type][0], esc(name || PAGES[row.target_type][1]), 'pl-target');
  }
  return `<span>${esc([kind, row.target_id].filter(v => v !== '' && v != null).join(' '))}</span>`;
}

function rowHtml(row) {
  const detail = detailsOf(row);
  return `<div class="v2-row pl-row pl-log">
    <span class="pl-when" title="${esc(fmt.relativo(row.created_at, ''))}">${esc(fmt.dateTime(row.created_at))}</span>
    <span class="v2-row-text"><b>${esc(actionLabel(row.action))}</b>${detail ? `<span>${esc(detail)}</span>` : ''}</span>
    <span class="pl-who">${targetHtml(row)}</span></div>`;
}

function tableHtml() {
  if (!state.rows.length) return fmt.empty('Ainda sem registos.', 'history');
  return `<div class="pl-table"><div class="pl-th pl-log"><span>Data</span><span>Ação</span><span>Alvo</span></div>${state.rows.map(rowHtml).join('')}</div>
    ${state.more ? `<div class="pl-more"><button type="button" class="btn btn-ghost" id="pl-reg-mais" ${AppActions.attrs('click', 'pl-reg-mais')}>Carregar mais</button></div>` : ''}`;
}

const page = {
  async render(ctx) {
    const [rows, orgs] = await Promise.all([api.audit({ limit: LIMIT }), api.orgs().catch(() => [])]);
    if (ctx.stale()) return;
    state.orgs = new Map(orgs.map(o => [String(o.id), o.name]));
    if (!rows) {
      ctx.host.innerHTML = `<div class="pl-page"><div class="v2-card v2-dense">${fmt.empty('O registo ainda não está disponível.', 'history')}</div></div>`;
      return;
    }
    state.rows = rows;
    state.more = rows.length >= LIMIT;
    ctx.host.innerHTML = `<div class="pl-page"><div class="v2-card v2-dense" id="pl-registo">${tableHtml()}</div></div>`;
  },
};

async function more(button) {
  if (state.busy || !state.rows.length) return;
  state.busy = true;
  button.disabled = true;
  try {
    const rows = await api.audit({ limit: LIMIT, before: state.rows[state.rows.length - 1].id });
    state.rows = state.rows.concat(rows || []);
    state.more = (rows || []).length >= LIMIT;
    const box = document.getElementById('pl-registo');
    if (box) box.innerHTML = tableHtml();
  } catch (error) {
    if (error?.status === 423 && error.payload?.locked === true) AppModules.consola.mostrarBloqueio();
    else throw error;
  } finally {
    state.busy = false;
    button.disabled = false;
  }
}

AppActions.register({
  'pl-reg-mais': el => more(el),
}, 'click');
})();
