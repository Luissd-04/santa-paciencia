// Páginas de gestão interna. Os esquemas vêm da API, os acessos são verificados no servidor.
// Regra das cargas assíncronas: a resposta fica numa variável local, só depois de
// confirmar que a navegação não mudou (ctx.stale()) é que passa para o estado partilhado.
// As ações do detalhe levam o id do registo apresentado e recusam agir se já não for o atual.
(() => {
const core = () => AppModules.core;
const fmt = AppModules.consola.fmt;
const { esc } = fmt;
const BASE = '/api/platform/workspace';

const st = {
  ctx: null, catalog: null, rows: [], total: 0, record: null, draft: null,
  error: '', busy: false, confirm: false, related: [], page: 0,
};

// ── Auxiliares ──
const money = cents => (Number(cents || 0) / 100).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' });
const href = (kind, id) => AppModules.consola.areas.recordHref(kind, id);
const link = (path, label, cls = 'v2-link') => fmt.link(path, label, cls);
const values = () => new URLSearchParams(location.search);
const kindOf = () => st.ctx.route.kind;

function navigate(path) {
  history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function fail(error) {
  if (error?.status === 401) { location.replace('/'); return true; }
  if (error?.status === 423) { AppModules.consola.mostrarBloqueio(); return true; }
  return false;
}

async function get(path) {
  return (await core().apiGet(BASE + path)).data;
}

function shell(html) {
  if (st.ctx?.stale()) return;
  st.ctx.host.innerHTML = `<div class="pl-page">${html}</div>`;
  if (window.lucide) lucide.createIcons();
}

// Devolve o registo apresentado se for o que a ação indicou; caso contrário recusa.
function currentRecord(id) {
  const r = st.record;
  if (r && !st.ctx?.stale() && String(r.id) === String(id)) return r;
  core().toast('A página mudou entretanto. Volte a abrir o registo.', 'error');
  return null;
}

// ── Componentes de formulário ──
function buttons() {
  return `<div class="ws-actions">
    <button class="btn btn-primary" type="submit"${st.busy ? ' disabled' : ''}>Guardar</button>
    <button class="btn btn-ghost" type="button" ${AppActions.attrs('click', 'ws-cancel')}>Cancelar</button>
  </div>`;
}

function field(label, id, control, full = false) {
  return `<div class="ws-field${full ? ' ws-full' : ''}">
    <label class="pl-label" for="${id}">${esc(label)}</label>${control}
  </div>`;
}

function select(name, label, items, value, required = false) {
  const options = items.map(([key, text]) => {
    const selected = String(value ?? '') === String(key) ? ' selected' : '';
    return `<option value="${esc(key)}"${selected}>${esc(text)}</option>`;
  }).join('');
  return field(label, 'ws-' + name,
    `<select class="form-control" id="ws-${name}" name="${name}"${required ? ' required' : ''}>${options}</select>`);
}

function input(name, label, value, type = 'text', required = false, max = 300) {
  const limit = type === 'text' || type === 'email' || type === 'url' ? ` maxlength="${max}"` : '';
  return field(label, 'ws-' + name,
    `<input class="form-control" id="ws-${name}" name="${name}" type="${type}" value="${esc(value ?? '')}"${required ? ' required' : ''}${limit}>`);
}

function errorHtml() {
  return `<p class="pl-error" id="ws-error" role="alert"${st.error ? '' : ' hidden'}>${esc(st.error)}</p>`;
}

function showError(message) {
  st.error = message;
  const el = document.getElementById('ws-error');
  if (el) { el.textContent = message; el.hidden = !message; }
  else core().toast(message, 'error');
}

// ── Lista ──
function recordRow(r) {
  const def = st.catalog.definitions[r.kind];
  const d = r.data;
  const due = d.publish_date || d.next_date || d.due_date || d.start_date || d.date;
  const brand = d.brand === 'platform' ? 'Santa Paciência' : d.brand === 'client' ? 'Marketing do cliente' : '';
  const meta = [r.organization?.name, r.assignee?.name, brand, d.next_action].filter(Boolean).map(esc).join(' · ');
  const done = ['done', 'paid', 'published', 'released', 'won', 'active', 'accepted'].includes(r.status);
  return `<div class="ws-row">
    <div class="ws-row-main">
      ${due ? `<span class="ws-calendar-date">${esc(fmt.dateLong(due))}</span>` : ''}
      ${link(href(r.kind, r.id), `<b>${esc(r.title)}</b>`)}
      <p class="pl-muted">${meta}</p>
    </div>
    ${d.amount_cents != null ? `<b class="ws-value">${esc(money(d.amount_cents))}</b>` : ''}
    ${fmt.chip(done ? 'ok' : 'neutral', def?.states[r.status] || r.status)}
  </div>`;
}

function filters() {
  const v = values();
  const kind = st.ctx.route.kind;
  const def = st.catalog.definitions[kind];
  const states = Object.entries(def.states)
    .map(([k, t]) => `<option value="${k}"${v.get('status') === k ? ' selected' : ''}>${esc(t)}</option>`).join('');
  const orgs = st.catalog.organizations
    .map(o => `<option value="${esc(o.id)}"${v.get('organization_id') === o.id ? ' selected' : ''}>${esc(o.name)}</option>`).join('');
  const brand = ['campaign', 'content', 'material'].includes(kind)
    ? `<select class="form-control" name="brand" aria-label="Marca">
        <option value="">Todas as marcas</option>
        <option value="platform"${v.get('brand') === 'platform' ? ' selected' : ''}>Santa Paciência</option>
        <option value="client"${v.get('brand') === 'client' ? ' selected' : ''}>Marketing dos clientes</option>
      </select>` : '';
  const month = kind === 'content'
    ? `<label class="pl-label" for="ws-month">Mês</label>
      <input class="form-control" id="ws-month" name="month" type="month" value="${esc(v.get('month') || '')}">` : '';
  const period = kind === 'entry'
    ? `<label class="pl-label" for="ws-from">Desde</label>
      <input class="form-control" id="ws-from" type="date" name="from" value="${esc(v.get('from') || '')}">
      <label class="pl-label" for="ws-to">Até</label>
      <input class="form-control" id="ws-to" type="date" name="to" value="${esc(v.get('to') || '')}">` : '';
  return `<form class="ws-toolbar" ${AppActions.attrs('submit', 'ws-filter')}>
    <div class="search-box">
      <input type="search" class="form-control" name="q" value="${esc(v.get('q') || '')}" placeholder="Pesquisar…" aria-label="Pesquisar registos">
    </div>
    <select class="form-control" name="status" aria-label="Estado"><option value="">Todos os estados</option>${states}</select>
    <select class="form-control" name="organization_id" aria-label="Cliente"><option value="">Todos os clientes</option>${orgs}</select>
    ${brand}${month}${period}
    <button class="btn btn-ghost" type="submit">Filtrar</button>
  </form>`;
}

function listHtml() {
  const def = st.catalog.definitions[st.ctx.route.kind];
  const rows = st.rows.length ? st.rows.map(recordRow).join('') : fmt.empty('Ainda sem registos para estes filtros.');
  const finance = st.ctx.route.area === 'finance'
    ? '<p class="ws-info">Controlo financeiro interno em euros. Os registos não emitem faturas nem executam cobranças.</p>' : '';
  return `<div class="ws-toolbar">
    <p class="pl-lead">${esc(def.label)} · ${fmt.num(st.total)} registos</p>
    ${def.writable ? `<button class="btn btn-primary" type="button" ${AppActions.attrs('click', 'ws-new')}>Novo registo</button>` : ''}
    <button class="btn btn-ghost" type="button" ${AppActions.attrs('click', 'ws-csv')}>Exportar página CSV</button>
  </div>
  ${finance}
  ${filters()}
  <div id="ws-editor"></div>
  <section class="v2-card v2-dense">${rows}
    <div class="ws-actions">
      <button class="btn btn-ghost" type="button"${st.page === 0 ? ' disabled' : ''} ${AppActions.attrs('click', 'ws-page', [-1])}>Anterior</button>
      <span>Página ${st.page + 1}</span>
      <button class="btn btn-ghost" type="button"${(st.page + 1) * 50 >= st.total ? ' disabled' : ''} ${AppActions.attrs('click', 'ws-page', [1])}>Seguinte</button>
    </div>
  </section>`;
}

// ── Formulário de criação/edição ──
function draftOf(r = null) {
  return {
    title: r?.title || '',
    status: r?.status || Object.keys(st.catalog.definitions[st.ctx.route.kind].states)[0],
    organization_id: r?.organization?.id || values().get('organization_id') || '',
    assignee_user_id: r?.assignee?.id || '',
    related_id: r?.related?.id || values().get('related_id') || '',
    ticket_id: r?.ticket?.id || '',
    revision: r?.revision,
    data: { ...r?.data },
  };
}

function dataField(f, value) {
  if (f.type === 'select') {
    return select('data_' + f.key, f.label, Object.entries(f.options), value ?? Object.keys(f.options)[0], f.required);
  }
  if (f.type === 'textarea') {
    return field(f.label, 'ws-data_' + f.key,
      `<textarea class="form-control" id="ws-data_${f.key}" name="data_${f.key}" rows="4" maxlength="${f.max || 5000}">${esc(value || '')}</textarea>`, true);
  }
  if (f.type === 'money') {
    const text = value == null ? '' : (value / 100).toFixed(2).replace('.', ',');
    return input('data_' + f.key, f.label, text, 'text', f.required);
  }
  return input('data_' + f.key, f.label, value, f.type, f.required, f.max);
}

function formHtml() {
  const d = st.draft;
  const kind = st.ctx.route.kind;
  const def = st.catalog.definitions[kind];
  const organizations = [['', 'Nenhum / Santa Paciência'], ...st.catalog.organizations.map(o => [o.id, o.name])];
  const people = [['', 'Sem responsável'], ...st.catalog.people.map(p => [p.id, p.name])];
  const related = def.related
    ? select('related_id', st.catalog.definitions[def.related]?.singular || 'Ligação',
      [['', 'Sem ligação'], ...st.related.map(r => [r.id, r.title])], d.related_id) : '';
  const ticket = kind === 'issue' ? input('ticket_id', 'Identificador do pedido de suporte (opcional)', d.ticket_id) : '';
  return `<form class="v2-card v2-dense ws-form" ${AppActions.attrs('submit', 'ws-save')}>
    <h3>${st.record ? 'Editar' : 'Criar'} ${esc(def.singular.toLowerCase())}</h3>
    <div class="ws-grid">
      ${input('title', 'Título', d.title, 'text', true, 140)}
      ${select('status', 'Estado', Object.entries(def.states), d.status)}
      ${select('organization_id', 'Cliente', organizations, d.organization_id, def.orgRequired)}
      ${select('assignee_user_id', 'Responsável', people, d.assignee_user_id)}
      ${related}${ticket}
      ${def.fields.map(f => dataField(f, d.data[f.key])).join('')}
    </div>
    ${errorHtml()}${buttons()}
  </form>`;
}

// O registo em edição vem de quem pediu (id da ação); nulo = criação.
async function openForm(recordId = null) {
  const ctx = st.ctx;
  const def = st.catalog.definitions[ctx.route.kind];
  if (!def.writable) return;
  const related = def.related ? (await get('/records/' + def.related + '?limit=500')).rows : [];
  if (ctx.stale() || st.ctx !== ctx) return;
  if (recordId !== null && String(st.record?.id) !== String(recordId)) return;
  st.related = related;
  st.draft = draftOf(recordId !== null ? st.record : null);
  if (ctx.route.preset && st.draft.data.direction === undefined) st.draft.data.direction = ctx.route.preset;
  // Pré-preenchimento vindo do suporte (pedido de produto).
  let prefill = null;
  try {
    if (kindOf() === 'issue') {
      prefill = JSON.parse(sessionStorage.getItem('pl-product-prefill') || 'null');
      sessionStorage.removeItem('pl-product-prefill');
    }
  } catch { /* sessionStorage indisponível */ }
  if (prefill) {
    st.draft = {
      ...st.draft,
      title: prefill.title,
      ticket_id: prefill.ticket_id,
      organization_id: prefill.organization_id,
      data: { ...st.draft.data, description: prefill.description },
    };
  }
  st.error = '';
  const editor = document.getElementById('ws-editor');
  if (editor) {
    editor.innerHTML = formHtml();
    editor.querySelector('input')?.focus();
  }
}

function parseMoney(raw) {
  const value = String(raw).trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) throw new Error('Indique um valor em euros com até duas casas decimais.');
  const [a, b = ''] = value.split('.');
  const n = Number(a) * 100 + Number(b.padEnd(2, '0'));
  if (!Number.isSafeInteger(n)) throw new Error('Valor demasiado elevado.');
  return n;
}

function readForm(form) {
  const f = new FormData(form);
  const def = st.catalog.definitions[st.ctx.route.kind];
  const data = {};
  for (const field of def.fields) {
    const raw = String(f.get('data_' + field.key) || '');
    data[field.key] = field.type === 'money' ? (raw.trim() ? parseMoney(raw) : null) : raw;
  }
  return {
    title: String(f.get('title') || ''),
    status: f.get('status'),
    organization_id: f.get('organization_id') || null,
    assignee_user_id: f.get('assignee_user_id') || null,
    related_id: f.get('related_id') || null,
    ticket_id: f.get('ticket_id') || null,
    revision: st.draft.revision,
    data,
  };
}

async function save(form) {
  if (st.busy) return;
  let body;
  try { body = readForm(form); } catch (e) { showError(e.message); return; }
  st.draft = body;
  st.busy = true;
  form.querySelector('button[type=submit]').disabled = true;
  // Tudo o que a gravação precisa fica fixado antes do primeiro await.
  const ctx = st.ctx;
  const record = st.record;
  try {
    const endpoint = BASE + '/records/' + ctx.route.kind + (record ? '/' + encodeURIComponent(record.id) : '');
    const r = record ? await core().apiPut(endpoint, body) : await core().apiPost(endpoint, body);
    AppModules.consola.api.reset();
    if (!ctx.stale()) {
      core().toast('Registo guardado.', 'success');
      navigate(href(ctx.route.kind, r.data.id));
    }
  } catch (error) {
    if (!ctx.stale() && !fail(error)) showError(error?.payload?.error || 'Não foi possível guardar.');
  } finally {
    if (st.ctx === ctx) st.busy = false;
    const b = form.querySelector('button[type=submit]');
    if (b) b.disabled = false;
  }
}

// ── Detalhe ──
function fieldDisplay(f, value) {
  if (f.type === 'money') return value == null ? '—' : money(value);
  if (f.type === 'select') return f.options[value] || '—';
  if (f.type === 'date') return value ? fmt.dateLong(value) : '—';
  return value || '—';
}

function detailFieldHtml(f, r) {
  const value = r.data[f.key];
  const text = f.type === 'url' && value
    ? `<a class="v2-link" href="${esc(value)}" target="_blank" rel="noopener noreferrer">${esc(value)}</a>`
    : esc(fieldDisplay(f, value));
  return `<div class="ws-field${f.type === 'textarea' ? ' ws-full' : ''}">
    <dt class="pl-muted">${esc(f.label)}</dt><dd class="ws-description">${text}</dd>
  </div>`;
}

function detailActions(r, def) {
  const id = [r.id];
  const writable = def.writable ? `
    <button type="button" class="btn btn-primary" ${AppActions.attrs('click', 'ws-edit', id)}>Editar</button>
    <button type="button" class="btn btn-ghost" ${AppActions.attrs('click', 'ws-task', id)}>Criar tarefa ligada</button>
    ${!['subscription', 'entry'].includes(r.kind)
      ? `<button type="button" class="btn btn-ghost" ${AppActions.attrs('click', 'ws-delete', id)}>${st.confirm ? 'Confirmar: apagar definitivamente' : 'Apagar'}</button>` : ''}` : '';
  const proposals = r.kind === 'lead'
    ? link('/plataforma/comercial/propostas?related_id=' + encodeURIComponent(r.id), 'Ver propostas', 'btn btn-ghost') : '';
  const payment = r.kind === 'subscription'
    ? link('/plataforma/financas/pagamentos?organization_id=' + encodeURIComponent(r.organization.id) + '&related_id=' + encodeURIComponent(r.id),
      'Registar recebimento', 'btn btn-ghost') : '';
  const trial = r.kind === 'lead'
    ? link('/plataforma/comercial/acessos?lead_id=' + encodeURIComponent(r.id), 'Criar demonstração ou teste', 'btn btn-ghost') : '';
  return `<div class="ws-actions">${writable}${proposals}${payment}${trial}</div>`;
}

function detailHtml() {
  const r = st.record;
  const def = st.catalog.definitions[r.kind];
  const back = link(st.ctx.route.path.slice(0, st.ctx.route.path.lastIndexOf('/')), '← ' + esc(def.label));
  const tabs = [
    r.organization ? link(fmt.orgHref(r.organization.id), esc(r.organization.name)) : '',
    r.related ? link(href(r.related.kind, r.related.id), esc(r.related.title)) : '',
    r.ticket ? link('/plataforma/suporte/' + encodeURIComponent(r.ticket.id), esc(r.ticket.number)) : '',
  ].join('');
  const related = r.links.length ? r.links.map(recordRow).join('') : fmt.empty('Sem registos relacionados.');
  const tasks = r.tasks.length
    ? r.tasks.map(t => `<p>${link('/plataforma/tarefas?task=' + encodeURIComponent(t.id), esc(t.title))} · ${esc(t.status === 'done' ? 'Feita' : 'Em aberto')}</p>`).join('')
    : fmt.empty('Sem tarefas ligadas.');
  const comments = r.comments.length
    ? r.comments.map(c => `<div class="ws-comment"><b>${esc(c.author || 'Equipa')}</b> <span class="pl-muted">${esc(fmt.dateTime(c.created_at))}</span>
        <p class="ws-description">${esc(c.body)}</p></div>`).join('')
    : fmt.empty('Ainda sem comentários.');
  const commentForm = def.writable
    ? `<form ${AppActions.attrs('submit', 'ws-comment', [r.id])}>
        <label class="pl-label" for="ws-comment">Comentário</label>
        <textarea class="form-control" id="ws-comment" name="body" required maxlength="3000" rows="3"></textarea>
        <div class="ws-actions"><button class="btn btn-ghost" type="submit">Adicionar comentário</button></div>
      </form>` : '';
  return `${back}
  <section class="v2-card v2-dense">
    <div class="ws-toolbar"><h2>${esc(r.title)}</h2>${fmt.chip('neutral', def.states[r.status])}</div>
    <p class="pl-muted">${r.assignee ? esc(r.assignee.name) : 'Sem responsável'} · Atualizado ${esc(fmt.dateTime(r.updated_at))}</p>
    <div class="ws-tabs">${tabs}</div>
    <dl class="ws-grid">${def.fields.map(f => detailFieldHtml(f, r)).join('')}</dl>
    ${detailActions(r, def)}
    ${errorHtml()}
  </section>
  <div id="ws-editor"></div>
  <section class="v2-card v2-dense">
    <h3>Registos relacionados</h3>${related}
    <h3>Tarefas ligadas</h3>${tasks}
  </section>
  <section class="v2-card v2-dense">
    <h3>Comentários internos</h3>${comments}${commentForm}
  </section>`;
}

// Prepara o estado da página. Só o catálogo (resposta assíncrona) espera pelo stale().
async function prepare(ctx) {
  st.ctx = ctx;
  st.error = '';
  st.record = null;
  st.draft = null;
  st.busy = false;
  st.confirm = false;
  const catalog = await get('/catalog');
  if (ctx.stale()) return false;
  st.catalog = catalog;
  return true;
}

const listPage = {
  async render(ctx) {
    if (!await prepare(ctx)) return;
    const query = values();
    const page = Math.max(0, Number(query.get('page')) || 0);
    query.set('limit', '50');
    query.set('offset', String(page * 50));
    if (ctx.route.preset) query.set('direction', ctx.route.preset);
    const data = await get('/records/' + ctx.route.kind + '?' + query);
    if (ctx.stale()) return;
    st.page = page;
    st.rows = data.rows;
    st.total = data.total;
    shell(listHtml());
    if (ctx.route.kind === 'issue' && sessionStorage.getItem('pl-product-prefill')) await openForm();
  },
};

const detailPage = {
  async render(ctx) {
    if (!await prepare(ctx)) return;
    // A resposta só passa para st.record se esta navegação ainda for a atual.
    const record = await get('/records/' + ctx.route.kind + '/' + encodeURIComponent(ctx.route.id));
    if (ctx.stale()) return;
    st.record = record;
    shell(detailHtml());
  },
};

// ── Resumo, operações, exportação ──
const kpi = (label, value) => `<div class="v2-card ws-kpi"><span class="pl-muted">${esc(label)}</span><strong>${esc(value)}</strong></div>`;

function financeSummaryHtml(f) {
  return `<form class="ws-toolbar" ${AppActions.attrs('submit', 'ws-filter')}>
    <label class="pl-label" for="ws-report-from">Movimentos desde</label>
    <input class="form-control" id="ws-report-from" name="from" type="date" value="${esc(values().get('from') || '')}">
    <label class="pl-label" for="ws-report-to">Até</label>
    <input class="form-control" id="ws-report-to" name="to" type="date" value="${esc(values().get('to') || '')}">
    <button class="btn btn-ghost" type="submit">Aplicar período</button>
  </form>
  <p class="ws-info">Controlo interno em euros, filtrado pela data do movimento; sem período, valores acumulados. Sem emissão de faturas ou cobrança automática. A receita mensal contratada é uma estimativa das subscrições ativas.</p>
  <div class="ws-kpis">
    ${kpi('Recebido', money(f.income_cents))}
    ${kpi('Despesas liquidadas', money(f.expense_cents))}
    ${kpi('Saldo', money(f.balance_cents))}
    ${kpi('Por receber', money(f.pending_cents))}
    ${kpi('Em atraso', money(f.overdue_cents))}
    ${kpi('Receita mensal contratada', money(f.mrr_cents))}
  </div>`;
}

function summaryHtml(data, area) {
  if (area === 'finance') return financeSummaryHtml(data.finance);
  const defs = Object.entries(st.catalog.definitions).filter(([, d]) => d.area === area);
  const kpis = defs.map(([kind, d]) =>
    link(AppModules.consola.areas.routes.find(r => r.kind === kind).path, kpi(d.label, fmt.num(data.counts[kind])))).join('');
  const next = data.next.filter(r => st.catalog.definitions[r.kind]?.area === area).map(recordRow).join('')
    || fmt.empty('Sem ações pendentes com data atingida.');
  return `<div class="ws-kpis">${kpis}</div>
  <section class="v2-card v2-dense"><h3>Ações com data atingida</h3>${next}</section>`;
}

const dashboard = {
  async render(ctx) {
    if (!await prepare(ctx)) return;
    const data = await get('/summary?' + values());
    if (ctx.stale()) return;
    shell(summaryHtml(data, ctx.route.area));
  },
};

function taskStatus(t) {
  const failed = t.last_error_at && (!t.last_ok_at || t.last_error_at > t.last_ok_at);
  const label = t.running ? 'Em execução' : failed ? 'Com falha' : t.last_ok_at ? 'Última execução concluída' : 'A aguardar';
  return fmt.chip(failed ? 'bad' : 'neutral', label);
}

const operations = {
  async render(ctx) {
    st.ctx = ctx;
    const data = await get('/operations');
    if (ctx.stale()) return;
    const tasks = data.tasks.map(t => `<div class="ws-row">
      <div class="ws-row-main"><b>${esc(t.label || t.name)}</b><p class="pl-muted">${esc(t.last_finished_at || t.last_run_at || 'Ainda sem execução registada')}</p></div>
      ${taskStatus(t)}
    </div>`).join('');
    shell(`<div class="ws-kpis">
      ${kpi('Tempo em funcionamento', fmt.duration(data.process.uptime_seconds))}
      ${kpi('Base de dados', fmt.bytes(data.storage.database_bytes))}
      ${kpi('Espaço livre', data.storage.disk ? fmt.bytes(data.storage.disk.free_bytes) : 'Sem informação')}
    </div>
    <section class="v2-card v2-dense"><h3>Tarefas automáticas do servidor</h3>${tasks}</section>
    <div class="ws-tabs">
      ${link('/plataforma/incidentes', 'Incidentes e integrações')}
      ${link('/plataforma/operacoes/manutencoes', 'Manutenções')}
      ${AppModules.consola.canManage ? link('/plataforma/operacoes/exportacoes', 'Exportação interna') : ''}
    </div>`);
  },
};

const exportPage = {
  async render(ctx) {
    st.ctx = ctx;
    shell(`<section class="v2-card v2-dense">
      <h3>Exportação da gestão interna</h3>
      <p>Descarregue os registos comerciais, marketing, finanças, produto, manutenções, tarefas e comentários internos em JSON.</p>
      <p class="pl-note">Esta exportação não substitui a cópia completa da instância: não inclui reservas, hóspedes, anexos, segredos nem ficheiros. A cópia e o restauro completos continuam no procedimento de operação do servidor.</p>
      <div class="ws-actions"><a class="btn btn-primary" href="${BASE}/export" download>Exportar gestão interna</a></div>
    </section>`);
  },
};

// ── Equipa: cada pessoa pode ter vários cargos (as permissões somam-se). ──
const ROLES = [
  ['admin', 'Administração', 'Todas as áreas, incluindo Finanças, Equipa, Configurações e registo.'],
  ['marketing', 'Marketing e comercial', 'Comercial, demonstrações, Marketing, acompanhamento, sugestões e comunicados.'],
  ['support', 'Suporte', 'Pedidos de suporte e anexos, respostas guardadas e sugestões.'],
];

function roleBoxes(p) {
  const own = p.platform_roles || [];
  const boxes = ROLES.map(([key, label, hint]) => `<label class="ws-role">
    <input type="checkbox" name="roles" value="${key}"${own.includes(key) ? ' checked' : ''}> <span><b>${label}</b><small>${hint}</small></span>
  </label>`).join('');
  return `<fieldset class="ws-roles"><legend class="pl-label">Cargos de ${esc(p.name)}</legend>${boxes}</fieldset>`;
}

const teamPage = {
  async render(ctx) {
    st.ctx = ctx;
    const rows = await get('/team');
    if (ctx.stale()) return;
    const people = rows.map(p => `<form class="ws-row ws-row-roles" ${AppActions.attrs('submit', 'ws-role', [p.id])}>
      <div class="ws-row-main"><b>${esc(p.name)}</b><p>${esc(p.email)}</p></div>
      ${roleBoxes(p)}
      <button class="btn btn-ghost" type="submit">Guardar cargos</button>
    </form>`).join('');
    shell(`<section class="v2-card v2-dense"><h3>Equipa e permissões</h3>
      <p>Acesso à consola: conta ativa, autorização no servidor e confirmação da palavra-passe. Cada pessoa pode ter mais do que um cargo; as permissões somam-se.</p>
      ${people}
      <p class="pl-note">Novos membros são autorizados pelo administrador do servidor, com uma conta e o email na lista de acesso à plataforma. Alterar os cargos fecha o desbloqueio anterior dessa pessoa.</p>
      <p role="status" id="ws-team-status"></p>
    </section>`);
  },
};

// ── Configurações e respostas guardadas ──
const settingsPage = {
  async render(ctx) {
    st.ctx = ctx;
    const data = await get('/settings');
    if (ctx.stale()) return;
    shell(`<form class="v2-card v2-dense" ${AppActions.attrs('submit', 'ws-settings')}>
      <h3>Dados internos da plataforma</h3>
      <div class="ws-grid">
        ${input('company_name', 'Nome da empresa / marca', data.company_name, 'text', true, 120)}
        ${input('contact_email', 'Email de contacto', data.contact_email, 'email', false, 254)}
        ${field('Notas internas', 'ws-notes', `<textarea class="form-control" id="ws-notes" name="notes" rows="5" maxlength="5000">${esc(data.notes)}</textarea>`, true)}
      </div>
      <p class="pl-note">O email é um contacto informativo. A caixa de correio da empresa e o envio de mensagens serão configurados separadamente.</p>
      ${errorHtml()}
      <div class="ws-actions"><button class="btn btn-primary" type="submit">Guardar configurações</button></div>
      <p role="status" id="ws-settings-status"></p>
    </form>`);
  },
};

function replyHtml(r) {
  const manage = AppModules.consola.canManage
    ? `<button type="button" class="btn btn-ghost" ${AppActions.attrs('click', 'ws-reply-edit', [r.id])}>Editar resposta</button>
       <button type="button" class="btn btn-ghost" ${AppActions.attrs('click', 'ws-reply-delete', [r.id])}>Apagar resposta</button>` : '';
  return `<details><summary>${esc(r.title)}</summary><p class="ws-description">${esc(r.body)}</p>${manage}</details>`;
}

const repliesPage = {
  async render(ctx) {
    st.ctx = ctx;
    const rows = (await core().apiGet('/api/platform/support/saved-replies')).data;
    if (ctx.stale()) return;
    const list = rows.map(replyHtml).join('') || fmt.empty('Ainda sem respostas guardadas.');
    const form = AppModules.consola.canManage
      ? `<form class="v2-card v2-dense" ${AppActions.attrs('submit', 'ws-reply-save')}>
          <h3 id="ws-reply-heading">Nova resposta</h3>
          <input type="hidden" name="id" id="ws-reply-id">
          ${input('reply_title', 'Título', '', 'text', true, 80)}
          ${field('Resposta', 'ws-reply-body', '<textarea class="form-control" id="ws-reply-body" name="body" maxlength="5000" required rows="5"></textarea>')}
          ${errorHtml()}
          <div class="ws-actions"><button type="submit" class="btn btn-primary">Guardar resposta</button></div>
        </form>` : '';
    shell(`<section class="v2-card v2-dense"><h3>Respostas guardadas</h3>${list}</section>${form}`);
    st.rows = rows;
  },
};

// ── Ações sobre o registo apresentado ──
function task(id) {
  const r = currentRecord(id);
  if (!r) return;
  const type = r.kind === 'issue' && r.data.type === 'bug' ? 'bug'
    : r.kind === 'campaign' || r.kind === 'content' ? 'marketing' : 'improvement';
  sessionStorage.setItem('pl-tarefa-prefill', JSON.stringify({
    title: r.title,
    department: st.catalog.definitions[r.kind].area,
    organization_id: r.organization?.id || '',
    record_id: r.id,
    record_title: r.title,
    record_kind: r.kind,
    ticket_id: r.ticket?.id || '',
    type,
  }));
  navigate('/plataforma/tarefas');
}

async function remove(el, id) {
  const r = currentRecord(id);
  if (!r) return;
  if (!st.confirm) {
    st.confirm = true;
    el.textContent = 'Confirmar: apagar definitivamente';
    return;
  }
  const ctx = st.ctx;
  el.disabled = true;
  try {
    await core().apiDelete(`${BASE}/records/${r.kind}/${encodeURIComponent(r.id)}`);
    navigate(AppModules.consola.areas.routes.find(route => route.kind === r.kind).path);
  } catch (e) {
    if (!fail(e) && !ctx.stale()) showError(e?.payload?.error || 'Não foi possível apagar.');
    el.disabled = false;
  }
}

async function comment(form, id) {
  const r = currentRecord(id);
  if (!r) return;
  const ctx = st.ctx;
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    const res = await core().apiPost(`${BASE}/records/${r.kind}/${encodeURIComponent(r.id)}/comments`, { body: new FormData(form).get('body') });
    // Só atualiza a página se continuar a ser o mesmo registo.
    if (!ctx.stale() && st.record === r) {
      st.record = res.data;
      shell(detailHtml());
    }
  } catch (e) {
    if (!fail(e) && !ctx.stale()) showError(e?.payload?.error || 'Não foi possível comentar.');
  } finally {
    button.disabled = false;
  }
}

function csv() {
  const head = ['Título', 'Estado', 'Cliente', 'Responsável', 'Valor EUR', 'Atualizado'];
  const rows = [head, ...st.rows.map(r => [
    r.title,
    st.catalog.definitions[r.kind].states[r.status],
    r.organization?.name || '',
    r.assignee?.name || '',
    r.data.amount_cents == null ? '' : (r.data.amount_cents / 100).toFixed(2),
    r.updated_at,
  ])];
  // Células que começam por = + - @ são prefixadas para não virarem fórmulas.
  const encode = value => {
    const s = String(value ?? '');
    return '"' + (/^(?:\s*[=+\-@]|[\t\r])/.test(s) ? "'" : '') + s.replaceAll('"', '""') + '"';
  };
  const text = '﻿' + rows.map(r => r.map(encode).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = st.ctx.route.kind + '-pagina-' + (st.page + 1) + '.csv';
  a.click();
  URL.revokeObjectURL(url);
}

AppModules.define('consola', {
  workspace: { get: () => listPage },
  workspaceRecord: { get: () => detailPage },
  workspaceDashboard: { get: () => dashboard },
  workspaceOperations: { get: () => operations },
  workspaceExport: { get: () => exportPage },
  workspaceTeam: { get: () => teamPage },
  workspaceSettings: { get: () => settingsPage },
  workspaceReplies: { get: () => repliesPage },
});

AppActions.register({
  'ws-new': () => { st.record = null; return openForm(); },
  'ws-edit': (el, event, [id]) => (currentRecord(id) ? openForm(id) : undefined),
  'ws-cancel': () => {
    st.draft = null;
    document.getElementById('ws-editor').innerHTML = '';
  },
  'ws-task': (el, event, [id]) => task(id),
  'ws-csv': () => csv(),
  'ws-page': (el, event, [delta]) => {
    const query = values();
    query.set('page', String(Math.max(0, st.page + Number(delta))));
    navigate(st.ctx.route.path + '?' + query);
  },
  'ws-delete': (el, event, [id]) => remove(el, id),
  'ws-reply-edit': (el, event, [id]) => {
    const r = st.rows.find(row => row.id === id);
    if (!r) return;
    document.getElementById('ws-reply-id').value = id;
    document.getElementById('ws-reply_title').value = r.title;
    document.getElementById('ws-reply-body').value = r.body;
    document.getElementById('ws-reply-heading').textContent = 'Editar resposta';
    document.getElementById('ws-reply_title').focus();
  },
  'ws-reply-delete': async (el, event, [id]) => {
    if (el.dataset.confirm !== id) {
      el.dataset.confirm = id;
      el.textContent = 'Confirmar: apagar';
      return;
    }
    try {
      await core().apiDelete('/api/platform/support/saved-replies/' + encodeURIComponent(id));
      navigate('/plataforma/suporte/respostas');
    } catch (e) {
      if (!fail(e)) core().toast(e?.payload?.error || 'Não foi possível apagar.', 'error');
    }
  },
}, 'click');

AppActions.register({
  'ws-save': (form, event) => { event.preventDefault(); return save(form); },
  'ws-filter': (form, event) => {
    event.preventDefault();
    const query = new URLSearchParams();
    for (const [k, v] of new FormData(form)) if (v) query.set(k, v);
    navigate(st.ctx.route.path + '?' + query);
  },
  'ws-comment': (form, event, [id]) => {
    event.preventDefault();
    return comment(form, id);
  },
  'ws-role': async (form, event, [id]) => {
    event.preventDefault();
    const status = document.getElementById('ws-team-status');
    try {
      await core().apiPut(`${BASE}/team/${encodeURIComponent(id)}`, { roles: new FormData(form).getAll('roles') });
      status.textContent = 'Papel guardado.';
    } catch (e) {
      if (!fail(e)) status.textContent = e?.payload?.error || 'Não foi possível guardar.';
    }
  },
  'ws-settings': async (form, event) => {
    event.preventDefault();
    try {
      await core().apiPut(BASE + '/settings', Object.fromEntries(new FormData(form)));
      document.getElementById('ws-settings-status').textContent = 'Configurações guardadas.';
    } catch (e) {
      if (!fail(e)) showError(e?.payload?.error || 'Não foi possível guardar.');
    }
  },
  'ws-reply-save': async (form, event) => {
    event.preventDefault();
    const f = new FormData(form);
    const id = f.get('id');
    const body = { title: f.get('reply_title'), body: f.get('body') };
    try {
      if (id) await core().apiPut('/api/platform/support/saved-replies/' + encodeURIComponent(id), body);
      else await core().apiPost('/api/platform/support/saved-replies', body);
      navigate('/plataforma/suporte/respostas');
    } catch (e) {
      if (!fail(e)) showError(e?.payload?.error || 'Não foi possível guardar.');
    }
  },
}, 'submit');
})();
