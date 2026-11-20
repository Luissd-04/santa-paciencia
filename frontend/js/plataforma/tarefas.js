// Consola da plataforma: Tarefas internas da equipa. Quadro com quatro colunas
// (Ideias, A fazer, Em curso, Feito), filtros por pessoa e tipo, pesquisa,
// painel de detalhe com edição e comentários. Mover entre colunas faz-se com o
// select «Mover para…» (teclado e telemóvel). Todo o texto da API passa por esc().
(() => {
AppModules.define('consola', {
  tarefas: { get: () => page },
});

const fmt = AppModules.consola.fmt;
const api = AppModules.consola.api;
const { esc } = fmt;
const core = () => AppModules.core;
const BASE = '/api/platform/tasks';
const PREFILL_KEY = 'pl-tarefa-prefill';

const DEPARTMENTS={sales:'Comercial',clients:'Clientes',support:'Suporte',marketing:'Marketing',finance:'Finanças',product:'Produto',operations:'Operações',administration:'Administração'};
const COLUMNS = [['ideas', 'Ideias'], ['todo', 'A fazer'], ['doing', 'Em curso'], ['done', 'Feito']];
const TYPES = { idea: ['Ideia', 'violet'], bug: ['Bug', 'bad'], improvement: ['Melhoria', 'info'], marketing: ['Marketing', 'warn'], client: ['Cliente', 'ok'] };
const colName = key => COLUMNS.find(c => c[0] === key)?.[1] || key;

const st = {
  ctx: null, me: null, tasks: [], people: [], orgs: [],
  department: '', recordFilter:'', orgFilter:'', person: 'all', type: 'all', q: '', col: 'todo',
  selected: null, detail: null, mode: 'none', draft: null, error: '', busy: false, confirmDelete: false,
};

// ── Auxiliares ──
const personName = id => st.people.find(p => p.id === id)?.name || '';
const inits = name => core().initials(name || '?');
function dueText(t) {
  if (t.status === 'done' && t.done_at) return `feito ${fmt.weekLabel(t.done_at.slice(0, 10))}`;
  return t.due_date ? `até ${fmt.weekLabel(t.due_date)}` : 'Sem prazo';
}
const isLate = t => t.status !== 'done' && t.due_date && t.due_date < new Date().toLocaleDateString('sv-SE');
function linkText(t) {
  const parts = [];
  if (t.ticket?.number) parts.push(t.ticket.number);
  if (t.organization?.name) parts.push(t.organization.name);
  if(t.record?.title)parts.push(t.record.title);
  if(t.department)parts.push(DEPARTMENTS[t.department]||'');
  return parts.join(' · ');
}
const typeChip = type => { const [label, tone] = TYPES[type] || [String(type), 'neutral']; return fmt.chip(tone, label); };

function locked(error) {
  if (error?.status === 401) { location.replace('/'); return true; }
  if (error?.status === 423 && error.payload?.locked === true) { AppModules.consola.mostrarBloqueio(); return true; }
  return false;
}
const fail = error => error?.payload?.error || 'Não foi possível concluir. Tente novamente.';

async function refreshBadge() {
  try {
    const payload = await core().apiGet(`${BASE}/summary`);
    AppModules.consola.contadorTarefas?.(payload?.data?.mine_open || 0);
  } catch { /* o contador só não aparece */ }
}

function visible() {
  const term = st.q.trim().toLowerCase();
  return st.tasks.filter(t => (st.person === 'all' || (st.person === 'me' ? t.assignee?.id === st.me : t.assignee?.id === st.person))
    && (st.type === 'all' || t.type === st.type)
    && (!st.department || t.department===st.department) && (!st.orgFilter || t.organization?.id===st.orgFilter) && (!st.recordFilter || t.record?.id===st.recordFilter)
    && (!term || `${t.title} ${t.description || ''} ${t.ticket?.number || ''} ${t.organization?.name || ''}`.toLowerCase().includes(term)));
}

// ── Peças ──
const pillsPessoa = () => `<div class="pl-pills" role="group" aria-label="Pessoa">${personItems().map(([key, text]) =>
  `<button type="button" aria-pressed="${st.person === key}" ${AppActions.attrs('click', 'tk-pessoa', [key])}>${esc(text)}</button>`).join('')}</div>`;
const pillsTipo = () => `<div class="pl-pills" role="group" aria-label="Tipo">${typeItems().map(([key, text]) =>
  `<button type="button" aria-pressed="${st.type === key}" ${AppActions.attrs('click', 'tk-tipo', [key])}>${esc(text)}</button>`).join('')}</div>`;
const personItems = () => [['all', 'Todos'], ['me', 'As minhas'], ...st.people.filter(p => p.id !== st.me).map(p => [p.id, p.name])];
const typeItems = () => [['all', 'Todos os tipos'], ...Object.entries(TYPES).map(([k, v]) => [k, v[0]])];

function cardHtml(t) {
  const link = linkText(t);
  return `<button type="button" class="tk-card${t.id === st.selected ? ' is-on' : ''}" aria-pressed="${t.id === st.selected}" ${AppActions.attrs('click', 'tk-abrir', [t.id])}>
    <span class="tk-chips">${typeChip(t.type)}${t.priority === 'urgent' ? fmt.chip('bad', 'Urgente') : ''}</span>
    <strong class="tk-title">${esc(t.title)}</strong>
    ${link ? `<span class="pl-muted tk-link">${fmt.icon('corner-down-right', 12)}<span>${esc(link)}</span></span>` : ''}
    <span class="tk-foot">
      ${t.assignee ? `<span class="tk-av" title="${esc(t.assignee.name)}" aria-hidden="true">${esc(inits(t.assignee.name))}</span><span class="pl-vh">${esc(t.assignee.name)}. </span>` : '<span class="pl-muted">Sem responsável</span>'}
      <span class="pl-muted tk-due${isLate(t) ? ' is-late' : ''}">${esc(dueText(t))}</span>
      <span class="pl-muted tk-n" title="Comentários">${fmt.icon('message-square', 12)}<span>${t.comments || 0}</span><span class="pl-vh"> comentários</span></span>
    </span></button>`;
}

function boardHtml() {
  const rows = visible();
  return `<div class="tk-tabs" role="tablist" aria-label="Colunas">${COLUMNS.map(([key, name]) =>
    `<button type="button" role="tab" aria-selected="${st.col === key}" ${AppActions.attrs('click', 'tk-coluna', [key])}>${esc(name)} <em>${rows.filter(t => t.status === key).length}</em></button>`).join('')}</div>
    <div class="tk-cols">${COLUMNS.map(([key, name]) => {
    const cards = rows.filter(t => t.status === key);
    return `<section class="tk-col${st.col === key ? ' is-on' : ''}" aria-label="${esc(name)}">
      <div class="tk-col-h"><h3>${esc(name)}</h3><span class="v2-chip neutral">${cards.length}</span></div>
      ${cards.map(cardHtml).join('') || '<p class="pl-muted tk-none">Nada por aqui.</p>'}
      <button type="button" class="btn btn-ghost btn-sm tk-add" ${AppActions.attrs('click', 'tk-nova', [key])}>+ Adicionar</button></section>`;
  }).join('')}</div>`;
}

function field(label, id, control) { return `<div class="tk-field"><label class="pl-label" for="${id}">${esc(label)}</label>${control}</div>`; }

function formHtml() {
  const d = st.draft;
  const sel = (id, name, options, value) => `<select class="form-control" id="${id}" name="${name}">${options.map(([k, t]) =>
    `<option value="${esc(k)}"${k === (value ?? '') ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  const link = d.ticket_number ? `<p class="pl-muted tk-ligacao">${fmt.icon('link', 14)}<span>Ligada ao pedido ${esc(d.ticket_number)}</span></p>` : '';
  return `<form class="tk-form" novalidate ${AppActions.attrs('submit', 'tk-guardar')}>
    <h2>${st.mode === 'new' ? 'Nova tarefa' : 'Editar tarefa'}</h2>
    ${field('Título', 'tk-f-title', `<input class="form-control" id="tk-f-title" name="title" maxlength="140" required value="${esc(d.title)}">`)}
    ${field('Descrição', 'tk-f-desc', `<textarea class="form-control" id="tk-f-desc" name="description" rows="4" maxlength="4000">${esc(d.description)}</textarea>`)}
    <div class="tk-two">
      ${field('Área', 'tk-f-department', sel('tk-f-department','department',Object.entries(DEPARTMENTS).filter(([k])=>AppModules.consola.canManage||!['finance','administration'].includes(k)),d.department))}
      ${field('Tipo', 'tk-f-type', sel('tk-f-type', 'type', Object.entries(TYPES).map(([k, v]) => [k, v[0]]), d.type))}
      ${field('Prioridade', 'tk-f-prio', sel('tk-f-prio', 'priority', [['normal', 'Normal'], ['urgent', 'Urgente']], d.priority))}
      ${field('Coluna', 'tk-f-status', sel('tk-f-status', 'status', COLUMNS, d.status))}
      ${field('Responsável', 'tk-f-assignee', sel('tk-f-assignee', 'assignee_user_id', [['', 'Sem responsável'], ...st.people.map(p => [p.id, p.name])], d.assignee_user_id))}
      ${field('Prazo', 'tk-f-due', `<input class="form-control" type="date" id="tk-f-due" name="due_date" value="${esc(d.due_date || '')}">`)}
      ${field('Cliente', 'tk-f-org', sel('tk-f-org', 'organization_id', [['', 'Nenhum'], ...st.orgs.map(o => [o.id, o.name])], d.organization_id))}
    </div>
    ${link}
    <p class="pl-error" role="alert"${st.error ? '' : ' hidden'}>${esc(st.error)}</p>
    <div class="tk-actions"><button type="button" class="btn btn-ghost btn-sm" ${AppActions.attrs('click', 'tk-cancelar')}>Cancelar</button>
      <button type="submit" class="btn btn-primary btn-sm"${st.busy ? ' disabled' : ''}>${st.mode === 'new' ? 'Criar tarefa' : 'Guardar'}</button></div></form>`;
}

function commentHtml(c) {
  return `<div class="tk-comment"><span class="tk-av" aria-hidden="true">${esc(inits(c.author?.name))}</span>
    <div><b>${esc(c.author?.name || '—')}</b> <span class="pl-muted">${esc(fmt.relativo(c.created_at, ''))}</span><p>${esc(c.body)}</p></div></div>`;
}

function detailHtml() {
  const t = st.detail;
  const moves = COLUMNS.filter(([k]) => k !== t.status);
  const ticket = t.ticket ? fmt.link(`/plataforma/suporte/${encodeURIComponent(t.ticket.id)}`, esc(t.ticket.number || 'Pedido'), 'v2-link') : '';
  const org = t.organization ? fmt.link(fmt.orgHref(t.organization.id), esc(t.organization.name), 'v2-link') : '';
  const record=t.record?fmt.link(AppModules.consola.areas.recordHref(t.record.kind,t.record.id),esc(t.record.title),'v2-link'):'';
  const linked = [ticket, org, record].filter(Boolean).join(' · ') || '—';
  return `<div class="tk-chips">${typeChip(t.type)}${t.priority === 'urgent' ? fmt.chip('bad', 'Urgente') : ''}${fmt.chip('neutral', colName(t.status))}</div>
    <h2>${esc(t.title)}</h2>
    <p class="tk-desc">${t.description ? esc(t.description) : '<span class="pl-muted">Sem descrição.</span>'}</p>
    <dl class="tk-kv">
      <dt>Responsável</dt><dd>${t.assignee ? `<span class="tk-av" aria-hidden="true">${esc(inits(t.assignee.name))}</span>${esc(t.assignee.name)}` : '—'}</dd>
      <dt>Prazo</dt><dd class="${isLate(t) ? 'is-late' : ''}">${t.due_date ? esc(fmt.dateLong(t.due_date)) : 'Sem prazo'}</dd>
      <dt>Ligada a</dt><dd>${linked}</dd>
      <dt>Criada por</dt><dd>${esc(t.created_by?.name || '—')} · ${esc(fmt.dateTime(t.created_at))}</dd>
    </dl>
    <div class="tk-actions">
      <button type="button" class="btn btn-ghost btn-sm" ${AppActions.attrs('click', 'tk-editar')}>Editar</button>
      ${st.confirmDelete
    ? `<button type="button" class="btn btn-danger btn-sm" ${AppActions.attrs('click', 'tk-apagar')}>Confirmar: apagar</button><button type="button" class="btn btn-ghost btn-sm" ${AppActions.attrs('click', 'tk-apagar-nao')}>Não apagar</button>`
    : `<button type="button" class="btn btn-ghost btn-sm" ${AppActions.attrs('click', 'tk-apagar-pedir')}>Apagar</button>`}
    </div>
    <p class="pl-error" role="alert"${st.error ? '' : ' hidden'}>${esc(st.error)}</p>
    <div class="tk-comments">
      <span class="pl-label">Comentários</span>
      ${t.comments.length ? t.comments.map(commentHtml).join('') : '<p class="pl-muted">Ainda sem comentários.</p>'}
      <label class="pl-label" for="tk-cm">Escrever comentário</label>
      <textarea class="form-control" id="tk-cm" rows="2" maxlength="2000" placeholder="Escreva um comentário…"></textarea>
      <div class="tk-actions">
        <label class="pl-vh" for="tk-mover">Mover para</label>
        <select class="form-control tk-move" id="tk-mover" ${AppActions.attrs('change', 'tk-mover')}><option value="">Mover para…</option>${moves.map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join('')}</select>
        <button type="button" class="btn btn-primary btn-sm" ${AppActions.attrs('click', 'tk-comentar')}>Comentar</button>
      </div></div>`;
}

function panelHtml() {
  if (st.mode === 'new' || st.mode === 'edit') return formHtml();
  if (st.mode === 'view' && st.detail) return detailHtml();
  return `<p class="v2-empty">${fmt.icon('kanban-square', 16)}<span>Escolha uma tarefa para ver o detalhe ou crie uma nova.</span></p>`;
}

function paintBoard() {
  const el = document.getElementById('tk-board');
  if (el) { el.innerHTML = boardHtml(); if (window.lucide) lucide.createIcons(); }
}
function paintPanel({ focus = false } = {}) {
  const el = document.getElementById('tk-panel');
  if (!el) return;
  el.innerHTML = panelHtml();
  if (window.lucide) lucide.createIcons();
  if (focus) el.querySelector('input, h2')?.focus?.({ preventScroll: false });
}
function paintFilters() {
  const p = document.getElementById('tk-f-pessoa'); if (p) p.innerHTML = pillsPessoa();
  const t = document.getElementById('tk-f-tipo'); if (t) t.innerHTML = pillsTipo();
}

// ── Página ──
const page = {
  async render(ctx) {
    st.ctx = ctx;
    const query=new URLSearchParams(location.search);st.department=query.get('department')||'';st.orgFilter=query.get('organization_id')||'';st.recordFilter=query.get('record_id')||'';if(ctx.route.key==='minhas')st.person='me';
    Object.assign(st, { selected: null, detail: null, mode: 'none', draft: null, error: '', busy: false, confirmDelete: false });
    const [me, data, orgs] = await Promise.all([api.me(), core().apiGet(BASE), api.orgs().catch(() => [])]);
    if (ctx.stale()) return;
    st.me = me?.id || null;
    st.tasks = data?.data?.tasks || [];
    st.people = data?.data?.people || [];
    st.orgs = orgs;
    if (st.person !== 'all' && st.person !== 'me' && !st.people.some(p => p.id === st.person)) st.person = 'all';
    ctx.host.innerHTML = `<div class="pl-page tk-page">
      <div class="pl-toolbar tk-toolbar">
        <label class="pl-label" for="tk-area">Área</label><select class="form-control" id="tk-area" ${AppActions.attrs('change','tk-area')}><option value="">Todas as áreas</option>${Object.entries(DEPARTMENTS).filter(([k])=>AppModules.consola.canManage||!['finance','administration'].includes(k)).map(([k,v])=>`<option value="${k}"${st.department===k?' selected':''}>${esc(v)}</option>`).join('')}</select>
        <div id="tk-f-pessoa">${pillsPessoa()}</div>
        <div id="tk-f-tipo">${pillsTipo()}</div>
        <div class="search-box pl-search"><i data-lucide="search"></i>
          <input type="search" id="tk-pesquisa" value="${esc(st.q)}" placeholder="Pesquisar tarefas…" autocomplete="off" aria-label="Pesquisar tarefas" ${AppActions.attrs('input', 'tk-pesquisa')}></div>
        <button type="button" class="btn btn-primary btn-sm" id="tk-nova" ${AppActions.attrs('click', 'tk-nova', ['todo'])}>+ Nova tarefa</button>
      </div>
      <div class="tk-layout">
        <div id="tk-board" class="tk-board">${boardHtml()}</div>
        <aside class="v2-card tk-panel" id="tk-panel" aria-label="Detalhe da tarefa">${panelHtml()}</aside>
      </div></div>`;
    refreshBadge();
    consumePrefill();
    if(query.get('task'))await open(query.get('task'));
  },
};

// O botão «Criar tarefa» do Suporte deixa aqui o que preencher.
function consumePrefill() {
  let raw = null;
  try { raw = sessionStorage.getItem(PREFILL_KEY); sessionStorage.removeItem(PREFILL_KEY); } catch { /* sem armazenamento */ }
  if (!raw) return;
  try { openNew('todo', JSON.parse(raw)); } catch { /* ignora lixo */ }
}

function blankDraft(status, extra = {}) {
  return { department:st.department||'product',record_id:'',record_title:'', title: '', description: '', type: 'improvement', priority: 'normal', status, assignee_user_id: st.me || '', due_date: '', organization_id: '', ticket_id: '', ticket_number: '', ...extra };
}
function openNew(status, extra = {}) {
  st.selected = null; st.detail = null; st.mode = 'new'; st.error = ''; st.confirmDelete = false;
  st.draft = blankDraft(status, extra);
  st.col = status;
  paintBoard(); paintPanel({ focus: true });
  document.getElementById('tk-panel')?.scrollIntoView?.({ block: 'nearest' });
}

async function open(id) {
  st.selected = id; st.mode = 'view'; st.error = ''; st.confirmDelete = false;
  const found = st.tasks.find(t => t.id === id);
  if (found) st.col = found.status;
  paintBoard();
  try {
    const payload = await core().apiGet(`${BASE}/${encodeURIComponent(id)}`);
    if (st.selected !== id) return;
    st.detail = payload.data;
    paintPanel();
    document.getElementById('tk-panel')?.scrollIntoView?.({ block: 'nearest' });
  } catch (error) {
    if (locked(error)) return;
    if (error?.status === 404) { await reloadList(); st.selected = null; st.mode = 'none'; paintBoard(); paintPanel(); return; }
    st.error = fail(error); paintPanel();
  }
}

async function reloadList() {
  const data = await core().apiGet(BASE);
  st.tasks = data?.data?.tasks || [];
  st.people = data?.data?.people || st.people;
}

async function save(form) {
  if (st.busy) return;
  const f = new FormData(form);
  const body = {
    title: String(f.get('title') || '').trim(), description: String(f.get('description') || ''), type: f.get('type'), priority: f.get('priority'),
    status: f.get('status'), assignee_user_id: f.get('assignee_user_id') || null, due_date: f.get('due_date') || null,
    organization_id: f.get('organization_id') || null, department:f.get('department'), record_id:st.draft.record_id||null,
  };
  if (!body.title) { st.draft = { ...st.draft, ...body, due_date: body.due_date || '', assignee_user_id: body.assignee_user_id || '', organization_id: body.organization_id || '' }; st.error = 'Escreva o título da tarefa.'; paintPanel(); return; }
  if (st.mode === 'new' && st.draft.ticket_id) body.ticket_id = st.draft.ticket_id;
  st.busy = true;
  try {
    const payload = st.mode === 'new'
      ? await core().apiPost(BASE, body)
      : await core().apiPut(`${BASE}/${encodeURIComponent(st.selected)}`, body);
    st.busy = false; st.error = '';
    await reloadList();
    st.selected = payload.data.id; st.mode = 'view'; st.detail = payload.data; st.col = payload.data.status;
    core().toast('Tarefa guardada.', 'success');
    paintBoard(); paintPanel(); refreshBadge();
  } catch (error) {
    st.busy = false;
    if (locked(error)) return;
    st.draft = { ...st.draft, ...body, due_date: body.due_date || '', assignee_user_id: body.assignee_user_id || '', organization_id: body.organization_id || '' };
    st.error = fail(error); paintPanel();
  }
}

async function move(select) {
  const status = select.value;
  if (!status || !st.selected) return;
  select.disabled = true;
  try {
    const payload = await core().apiPut(`${BASE}/${encodeURIComponent(st.selected)}`, { status });
    await reloadList();
    st.detail = { ...payload.data, comments: st.detail.comments }; st.col = status; st.error = '';
    paintBoard(); paintPanel(); refreshBadge();
    document.getElementById('tk-mover')?.focus();
  } catch (error) {
    select.disabled = false; select.value = '';
    if (locked(error)) return;
    st.error = fail(error); paintPanel();
  }
}

async function comment(button) {
  const box = document.getElementById('tk-cm');
  const text = box?.value.trim() || '';
  if (!text) { st.error = 'Escreva o comentário.'; paintPanel(); return; }
  button.disabled = true;
  try {
    const payload = await core().apiPost(`${BASE}/${encodeURIComponent(st.selected)}/comments`, { body: text });
    st.detail.comments.push(payload.data);
    const row = st.tasks.find(t => t.id === st.selected); if (row) row.comments = st.detail.comments.length;
    st.error = ''; paintBoard(); paintPanel();
    document.getElementById('tk-cm')?.focus();
  } catch (error) {
    button.disabled = false;
    if (locked(error)) return;
    st.error = fail(error); paintPanel();
  }
}

async function remove() {
  try {
    await core().apiDelete(`${BASE}/${encodeURIComponent(st.selected)}`);
    st.tasks = st.tasks.filter(t => t.id !== st.selected);
    st.selected = null; st.detail = null; st.mode = 'none'; st.confirmDelete = false; st.error = '';
    core().toast('Tarefa apagada.', 'success');
    paintBoard(); paintPanel(); refreshBadge();
  } catch (error) {
    if (locked(error)) return;
    st.confirmDelete = false; st.error = fail(error); paintPanel();
  }
}

function edit() {
  const t = st.detail;
  st.draft = { department:t.department||'product',record_id:t.record?.id||'',record_title:t.record?.title||'', title: t.title, description: t.description || '', type: t.type, priority: t.priority, status: t.status,
    assignee_user_id: t.assignee?.id || '', due_date: t.due_date || '', organization_id: t.organization?.id || '', ticket_id: t.ticket?.id || '', ticket_number: t.ticket?.number || '' };
  st.mode = 'edit'; st.error = '';
  paintPanel({ focus: true });
}

function cancel() {
  st.error = '';
  st.mode = st.selected && st.detail ? 'view' : 'none';
  paintPanel();
}

AppActions.register({
  'tk-pessoa': (el, event, [key]) => { st.person = key; paintFilters(); paintBoard(); },
  'tk-tipo': (el, event, [key]) => { st.type = key; paintFilters(); paintBoard(); },
  'tk-coluna': (el, event, [key]) => { st.col = key; paintBoard(); },
  'tk-abrir': (el, event, [id]) => open(id),
  'tk-nova': (el, event, [status]) => openNew(status),
  'tk-editar': () => edit(),
  'tk-cancelar': () => cancel(),
  'tk-comentar': el => comment(el),
  'tk-apagar-pedir': () => { st.confirmDelete = true; paintPanel(); },
  'tk-apagar-nao': () => { st.confirmDelete = false; paintPanel(); },
  'tk-apagar': () => remove(),
}, 'click');
AppActions.register({ 'tk-pesquisa': el => { st.q = el.value; paintBoard(); } }, 'input');
AppActions.register({ 'tk-mover': el => move(el), 'tk-area':el=>{st.department=el.value;paintBoard();} }, 'change');
AppActions.register({ 'tk-guardar': (el, event) => { event.preventDefault(); return save(el); } }, 'submit');
})();
