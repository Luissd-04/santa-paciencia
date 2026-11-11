// Consola da plataforma: página de um cliente (/plataforma/clientes/<id>).
// Estado, notas e primeiros passos; integrações e problemas; equipa;
// browsers, dispositivos e páginas mais usadas; reservas por semana.
(() => {
AppModules.define('consola', {
  cliente: { get: () => page },
});

const fmt = AppModules.consola.fmt;
const api = AppModules.consola.api;
const charts = AppModules.consola.charts;
const { esc, num } = fmt;

const STEPS = [['google', 'Google ligado'], ['accommodation', 'Alojamento criado'], ['reservation', 'Primeira reserva']];

const kv = (label, value) => `<div class="pl-kv"><span>${esc(label)}</span><b>${value}</b></div>`;
const card = (title, body, cls = '') => `<section class="v2-card v2-dense ${cls}"><div class="v2-card-h"><h3>${esc(title)}</h3></div>${body}</section>`;
const pairs = (obj, labels) => Object.entries(labels).map(([key, label]) => ({ label, value: Number(obj?.[key]) || 0 }));

function statusCard(org) {
  return card('Estado e notas', `<label class="pl-label" for="pl-estado">Estado</label>
    <select class="form-control" id="pl-estado">${Object.entries(fmt.STATUS).map(([key, s]) => `<option value="${key}"${org.status === key ? ' selected' : ''}>${esc(s.label)}</option>`).join('')}</select>
    <label class="pl-label" for="pl-notas">Notas internas</label>
    <textarea class="form-control" id="pl-notas" rows="5" maxlength="5000" placeholder="Só visível para a plataforma.">${esc(org.notes || '')}</textarea>
    <div class="pl-save"><button type="button" class="btn btn-primary" id="pl-guardar" ${AppActions.attrs('click', 'pl-org-guardar', [String(org.id)])}>Guardar</button>
      <span class="pl-msg" id="pl-msg" role="status"></span></div>`);
}

function stepsCard(org) {
  const done = org.onboarding || {};
  return card('Primeiros passos', STEPS.map(([key, label]) => `<div class="pl-step${done[key] ? ' is-done' : ''}">${fmt.icon(done[key] ? 'check-circle' : 'circle', 18)}<span>${esc(label)}</span></div>`).join(''));
}

function integrationsCard(org) {
  const problems = Array.isArray(org.problems) ? org.problems : [];
  const rows = fmt.INTEGRATIONS.map(([key, label]) => {
    const [tone, text] = fmt.INTEGRATION_STATE[org.integrations?.[key]] || fmt.INTEGRATION_STATE.off;
    return kv(label, `<i class="v2-dot pl-${tone}"></i>${esc(text.charAt(0).toUpperCase() + text.slice(1))}`);
  }).join('');
  const list = problems.length
    ? problems.map(p => `<div class="v2-row"><span class="v2-row-text"><b>${esc(p.title)}</b>${p.detail ? `<span>${esc(p.detail)}</span>` : ''}</span></div>`).join('')
    : fmt.empty('Sem problemas abertos.', 'check-circle');
  return card('Integrações e problemas', `${rows}<h4 class="pl-h4">Problemas abertos</h4>${list}`);
}

function teamCard(org) {
  const team = org.team;
  if (!team) return card('Equipa', `${kv('Membros', num(org.members))}${fmt.empty('Sem mais dados da equipa.')}`);
  const roles = pairs(team.roles, { owner: 'Proprietários', manager: 'Gestores', staff: 'Equipa' });
  return card('Equipa', `${kv('Membros', num(team.members ?? org.members))}${kv('Ativos nos últimos 7 dias', num(team.active_7d))}
    <div class="pl-chips">${roles.map(r => fmt.chip(r.value ? 'info' : 'neutral', `${r.label}: ${num(r.value)}`)).join('')}</div>`);
}

function usageCards(org) {
  const usage = org.usage;
  if (!usage) return card('Utilização', fmt.empty('Ainda sem dados de utilização.', 'bar-chart-2'));
  const browsers = charts.topN(usage.browsers, 'sessions', 5);
  const devices = pairs(usage.devices, fmt.DEVICES).filter(d => d.value > 0);
  const display = pairs(usage.display, fmt.DISPLAY).filter(d => d.value > 0);
  const views = (Array.isArray(usage.views) ? usage.views : []).filter(v => Number(v.count) > 0).slice(0, 8);
  return `<div class="pl-pair">
      ${charts.card({ title: 'Browsers', sub: 'sessões, 30 dias', kind: 'donut', height: 210, labels: browsers.map(b => b.name), datasets: [{ label: 'Sessões', data: browsers.map(b => b.value) }], emptyText: 'Ainda sem sessões.' })}
      ${charts.card({ title: 'Dispositivos', sub: 'sessões, 30 dias', kind: 'donut', height: 210, labels: devices.map(d => d.label), datasets: [{ label: 'Sessões', data: devices.map(d => d.value) }], emptyText: 'Ainda sem sessões.' })}
    </div>
    ${display.length ? `<div class="pl-chips pl-display">${display.map(d => fmt.chip('neutral', `${d.label}: ${num(d.value)}`)).join('')}</div>` : ''}
    ${charts.card({ title: 'Páginas mais usadas', sub: 'visitas, 30 dias', kind: 'hbar', height: Math.max(140, views.length * 32 + 40), labels: views.map(v => fmt.viewName(v.view)), datasets: [{ label: 'Visitas', data: views.map(v => Number(v.count) || 0) }], emptyText: 'Ainda sem visitas.' })}`;
}

function trendCard(org) {
  const trend = org.trend;
  return charts.card({ title: 'Reservas por semana', sub: 'Últimas 12 semanas', kind: 'bar', height: 220,
    labels: (trend?.weeks || []).map(fmt.weekLabel), datasets: [{ label: 'Reservas criadas', data: Array.isArray(trend?.reservations_created) ? trend.reservations_created : [], tone: 'primary' }],
    emptyText: trend ? 'Sem reservas nas últimas 12 semanas.' : 'Ainda sem dados.' });
}

function headHtml(org) {
  return `<div class="pl-crumb">${fmt.link('/plataforma/clientes', `${fmt.icon('arrow-left', 15)} Clientes`, 'pl-backlink')}</div>
    <header class="pl-org-head"><div><h2>${esc(org.name)}</h2><span class="pl-muted">${esc(org.slug || '')}</span></div>
      <div class="pl-org-chips">${fmt.stateHtml(org)}${fmt.planHtml(org)}<span class="pl-muted">Último acesso: ${esc(fmt.relativo(org.last_activity_at))}</span></div></header>`;
}

const page = {
  async render(ctx) {
    const org = await api.org(ctx.route.id);
    if (ctx.stale()) return;
    if (!org) {
      ctx.host.innerHTML = `<div class="pl-page"><div class="v2-card pl-notice"><h3>Cliente não encontrado</h3>
        <p class="v2-empty">Esta organização já não existe ou o endereço está errado.</p>${fmt.link('/plataforma/clientes', 'Ver todos os clientes', 'btn btn-ghost btn-sm')}</div></div>`;
      return;
    }
    ctx.host.innerHTML = `<div class="pl-page">${headHtml(org)}
      <div class="pl-detail">
        <div class="pl-col">${statusCard(org)}${stepsCard(org)}${integrationsCard(org)}${teamCard(org)}</div>
        <div class="pl-col">${trendCard(org)}${usageCards(org)}</div>
      </div></div>`;
    charts.flush(ctx.host);
  },
};

async function save(id, button) {
  const status = document.getElementById('pl-estado')?.value;
  const notes = document.getElementById('pl-notas')?.value ?? '';
  const msg = document.getElementById('pl-msg');
  if (button) button.disabled = true;
  if (msg) { msg.textContent = 'A guardar…'; msg.className = 'pl-msg'; }
  try {
    await api.saveOrg(id, { status, notes });
    if (msg) { msg.textContent = 'Guardado.'; msg.className = 'pl-msg is-ok'; }
    AppModules.core.toast('Cliente guardado.', 'success');
  } catch (error) {
    if (error?.status === 423 && error.payload?.locked === true) { AppModules.consola.mostrarBloqueio(); return; }
    const text = error?.payload?.error || 'Não foi possível guardar.';
    if (msg) { msg.textContent = text; msg.className = 'pl-msg is-bad'; }
  } finally {
    if (button) button.disabled = false;
  }
}

AppActions.register({
  'pl-org-guardar': (el, event, [id]) => save(id, el),
}, 'click');
})();
