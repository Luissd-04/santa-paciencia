// Consola da plataforma: Comunicados aos clientes. Lista com o estado (agendado,
// ativo, terminado), editor (tipo, título, mensagem, início e fim, público e onde
// aparece) com pré-visualização ao vivo da barra da app. API em
// /api/platform/announcements. Todo o texto vindo da API passa por esc().
(() => {
AppModules.define('consola', {
  comunicados: { get: () => page },
});

const core = () => AppModules.core;
const fmt = AppModules.consola.fmt;
const api = AppModules.consola.api;
const { esc } = fmt;
const BASE = '/api/platform/announcements';

// [rótulo, tom, ícone] de cada tipo. Os tons são os da barra da app.
const KINDS = {
  maintenance: ['Manutenção', 'info', 'wrench'],
  incident: ['Incidente', 'bad', 'triangle-alert'],
  news: ['Novidade', 'ok', 'sparkles'],
  notice: ['Aviso', 'warn', 'info'],
};
const STATUS = { active: ['Ativo', 'bad'], scheduled: ['Agendado', 'info'], ended: ['Terminado', 'neutral'] };
const AUDIENCES = [['all', 'Todos os clientes'], ['organizations', 'Escolher clientes'], ['plans', 'Por pacote']];
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const TITLE_MAX = 120;
const BODY_MAX = 1000;

const state = { items: [], orgs: [], plans: [], selected: null, draft: null, error: '', busy: false, confirmDelete: false };

const pad = n => String(n).padStart(2, '0');
function toLocalInput(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const fromLocalInput = value => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
};
const dayLabel = iso => {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function blankDraft() {
  return { id: null, kind: 'notice', title: '', body: '', starts: toLocalInput(new Date().toISOString()), ends: '',
    audience: 'all', ids: [], topbar: true, help: true, email: false, status: null };
}
function draftOf(item) {
  return { id: item.id, kind: item.kind, title: item.title, body: item.body, starts: toLocalInput(item.starts_at), ends: toLocalInput(item.ends_at),
    audience: item.audience, ids: (item.audience_ids || []).map(String), topbar: !!item.show_topbar, help: !!item.show_help, email: !!item.send_email, status: item.status };
}

function audienceLabel(item) {
  const n = (item.audience_ids || []).length;
  if (item.audience === 'organizations') return n === 1 ? '1 cliente' : `${n} clientes`;
  if (item.audience === 'plans') {
    const names = (item.audience_ids || []).map(id => state.plans.find(p => String(p.id) === String(id))?.name).filter(Boolean);
    return names.length ? `Pacote${names.length > 1 ? 's' : ''} ${names.join(', ')}` : (n === 1 ? '1 pacote' : `${n} pacotes`);
  }
  return 'Todos os clientes';
}
function whenLabel(item) {
  const from = dayLabel(item.starts_at);
  const until = item.ended_at && (!item.ends_at || new Date(item.ended_at) < new Date(item.ends_at)) ? item.ended_at : item.ends_at;
  if (item.status === 'active') return until ? `Desde ${from} até ${dayLabel(until)}` : `Desde ${from}`;
  return until ? `${from} – ${dayLabel(until)}` : from;
}

const ic = (name, size = 16) => fmt.icon(name, size);
const statusChip = status => `<span class="v2-chip ${STATUS[status][1]}">${STATUS[status][0]}</span>`;

function listHtml() {
  if (!state.items.length) return fmt.empty('Ainda não há comunicados.', 'megaphone');
  return `<div class="pl-com-items">${state.items.map(item => `<button type="button" class="pl-com-item" ${state.selected === item.id ? 'aria-current="true"' : ''}
      ${AppActions.attrs('click', 'pl-com-abrir', [item.id])}>
      <span class="pl-com-item-t"><strong>${esc(item.title)}</strong><span class="pl-muted">${esc(whenLabel(item))} · ${esc(audienceLabel(item))}</span></span>
      ${statusChip(item.status)}</button>`).join('')}</div>`;
}

function previewHtml(d) {
  const [label, tone, icon] = KINDS[d.kind] || KINDS.notice;
  const title = d.title.trim() || label;
  return `<div class="pl-com-prev is-${tone}" role="status">${ic(icon, 18)}
    <span class="pl-com-prev-t"><strong>${esc(title)}.</strong> ${esc(d.body.trim() || 'A mensagem aparece aqui.')}</span>
    <span class="pl-com-prev-x" aria-hidden="true">${ic('x', 16)}</span></div>
    ${d.topbar ? '' : '<p class="pl-muted pl-com-hint">A barra no topo está desligada: este comunicado só aparece onde marcou abaixo.</p>'}`;
}

function pickerHtml(d) {
  if (d.audience === 'all') return '';
  const options = d.audience === 'plans' ? state.plans : state.orgs;
  if (!options.length) {
    return `<p class="pl-muted">${d.audience === 'plans' ? 'Ainda não há pacotes para escolher.' : 'Ainda não há clientes para escolher.'}</p>`;
  }
  return `<div class="pl-com-pick" role="group" aria-label="${d.audience === 'plans' ? 'Pacotes' : 'Clientes'}">${options.map(o => `<label class="pl-com-check">
      <input type="checkbox" ${d.ids.includes(String(o.id)) ? 'checked' : ''} ${AppActions.attrs('change', 'pl-com-escolher', [String(o.id)])}><span>${esc(o.name)}</span></label>`).join('')}</div>`;
}

function editorHtml() {
  const d = state.draft;
  const ended = d.status === 'ended';
  const heading = d.id ? d.title || 'Comunicado' : 'Novo comunicado';
  const check = (field, checked, text, extra = '') => `<label class="pl-com-check"><input type="checkbox" ${checked ? 'checked' : ''} ${ended ? 'disabled' : ''}
      ${AppActions.attrs('change', 'pl-com-marcar', [field])}><span>${text}${extra}</span></label>`;
  return `<div class="pl-com-h"><h2>${esc(heading)}</h2>${d.status ? statusChip(d.status) : ''}</div>
    ${ended ? '<p class="pl-muted">Este comunicado já terminou e não pode ser editado. Use «Novo» para criar outro.</p>' : ''}
    <fieldset class="pl-com-set" ${ended ? 'disabled' : ''}><legend class="pl-label">Tipo</legend>
      <div class="pl-pills">${Object.entries(KINDS).map(([key, [label]]) => `<button type="button" aria-pressed="${d.kind === key}" ${AppActions.attrs('click', 'pl-com-tipo', [key])}>${label}</button>`).join('')}</div></fieldset>
    <div><label class="pl-label" for="pl-com-titulo">Título</label>
      <input class="form-control" id="pl-com-titulo" maxlength="${TITLE_MAX}" value="${esc(d.title)}" ${ended ? 'disabled' : ''} ${AppActions.attrs('input', 'pl-com-campo', ['title'])}></div>
    <div><label class="pl-label" for="pl-com-mensagem">Mensagem</label>
      <textarea class="form-control" id="pl-com-mensagem" rows="4" maxlength="${BODY_MAX}" ${ended ? 'disabled' : ''} ${AppActions.attrs('input', 'pl-com-campo', ['body'])}>${esc(d.body)}</textarea></div>
    <div class="pl-com-dates">
      <div><label class="pl-label" for="pl-com-inicio">Início</label>
        <input class="form-control" type="datetime-local" id="pl-com-inicio" value="${esc(d.starts)}" ${ended ? 'disabled' : ''} ${AppActions.attrs('input', 'pl-com-campo', ['starts'])}></div>
      <div><label class="pl-label" for="pl-com-fim">Fim <span class="pl-muted">(opcional)</span></label>
        <input class="form-control" type="datetime-local" id="pl-com-fim" value="${esc(d.ends)}" ${ended ? 'disabled' : ''} ${AppActions.attrs('input', 'pl-com-campo', ['ends'])}></div>
    </div>
    <fieldset class="pl-com-set" ${ended ? 'disabled' : ''}><legend class="pl-label">Para quem</legend>
      <div class="pl-pills">${AUDIENCES.map(([key, label]) => `<button type="button" aria-pressed="${d.audience === key}" ${AppActions.attrs('click', 'pl-com-publico', [key])}>${label}</button>`).join('')}</div>
      <div id="pl-com-escolha">${pickerHtml(d)}</div></fieldset>
    <fieldset class="pl-com-set" ${ended ? 'disabled' : ''}><legend class="pl-label">Onde aparece</legend>
      ${check('topbar', d.topbar, 'Barra no topo da app (pode ser fechada)')}
      ${check('help', d.help, 'Página «Ajuda e feedback»')}
      ${check('email', d.email, 'Enviar por email aos proprietários', ' <span class="pl-muted">(quando houver o email da empresa)</span>')}</fieldset>
    <div><span class="pl-label">Pré-visualização na app</span><div id="pl-com-prev">${previewHtml(d)}</div></div>
    <p class="pl-error" id="pl-com-erro" role="alert"${state.error ? '' : ' hidden'}>${esc(state.error)}</p>
    <div class="pl-com-actions">
      ${d.id ? `<button type="button" class="btn btn-ghost pl-com-del" ${AppActions.attrs('click', 'pl-com-apagar')}>${state.confirmDelete ? 'Confirmar: apagar' : 'Apagar'}</button>` : ''}
      <span class="pl-com-spacer"></span>
      ${d.id && !ended ? `<button type="button" class="btn btn-ghost" ${state.busy ? 'disabled' : ''} ${AppActions.attrs('click', 'pl-com-terminar')}>Terminar agora</button>` : ''}
      ${ended ? '' : `<button type="button" class="btn btn-primary" id="pl-com-guardar" ${state.busy ? 'disabled' : ''} ${AppActions.attrs('click', 'pl-com-guardar')}>Guardar</button>`}
    </div>`;
}

function shellHtml() {
  return `<div class="pl-page pl-com-page">
    <div class="pl-com-bar"><button type="button" class="btn btn-primary" ${AppActions.attrs('click', 'pl-com-novo')}>${ic('plus', 16)}<span>Novo comunicado</span></button></div>
    <div class="pl-com-grid">
      <section class="v2-card v2-dense pl-com-lista" aria-labelledby="pl-com-lista-t"><div class="v2-card-h"><h3 id="pl-com-lista-t">Todos</h3></div><div id="pl-com-lista">${listHtml()}</div></section>
      <section class="v2-card v2-dense pl-com-editor" id="pl-com-editor" aria-label="Editor do comunicado">${editorHtml()}</section>
    </div></div>`;
}

const q = id => document.getElementById(id);
function paint(part) {
  if (part !== 'editor' && q('pl-com-lista')) q('pl-com-lista').innerHTML = listHtml();
  if (part !== 'list' && q('pl-com-editor')) q('pl-com-editor').innerHTML = editorHtml();
  if (window.lucide) lucide.createIcons();
}
function paintPreview() {
  if (q('pl-com-prev')) q('pl-com-prev').innerHTML = previewHtml(state.draft);
  if (window.lucide) lucide.createIcons();
}
function showError(text) {
  state.error = text || '';
  const box = q('pl-com-erro');
  if (box) { box.textContent = state.error; box.hidden = !state.error; }
}

function locked(error) {
  if (error?.status === 423 && error.payload?.locked === true) { AppModules.consola.mostrarBloqueio(); return true; }
  return false;
}

async function load() {
  const [items, orgs, plans] = await Promise.all([
    core().apiGet(BASE).then(r => r?.data || []),
    api.orgs().catch(() => []),
    core().apiGet('/api/platform/plans').then(r => r?.data || []).catch(() => []),
  ]);
  state.items = Array.isArray(items) ? items : [];
  state.orgs = orgs.map(o => ({ id: o.id, name: o.name }));
  state.plans = Array.isArray(plans) ? plans : [];
}

const page = {
  async render(ctx) {
    let ok = true;
    try { await load(); } catch (error) { if (locked(error)) return; ok = false; }
    if (ctx.stale()) return;
    if (!ok) { ctx.host.innerHTML = `<div class="pl-page"><div class="v2-card v2-dense">${fmt.empty('Não foi possível carregar os comunicados.', 'triangle-alert')}</div></div>`; return; }
    const keep = state.selected && state.items.find(i => i.id === state.selected);
    state.draft = keep ? draftOf(keep) : (state.draft && !state.draft.id ? state.draft : blankDraft());
    if (!keep) state.selected = null;
    state.error = ''; state.confirmDelete = false;
    ctx.host.innerHTML = shellHtml();
    if (window.lucide) lucide.createIcons();
  },
};

function bodyOf(d) {
  const starts = fromLocalInput(d.starts);
  const ends = fromLocalInput(d.ends);
  if (starts === undefined || ends === undefined) return null;
  return { kind: d.kind, title: d.title, body: d.body, starts_at: starts, ends_at: ends, audience: d.audience,
    audience_ids: d.audience === 'all' ? [] : d.ids, show_topbar: d.topbar, show_help: d.help, send_email: d.email };
}

async function refreshList(selectId) {
  const payload = await core().apiGet(BASE);
  state.items = payload?.data || [];
  state.selected = selectId || null;
  const item = selectId && state.items.find(i => i.id === selectId);
  state.draft = item ? draftOf(item) : blankDraft();
}

async function run(action, success) {
  if (state.busy) return;
  state.busy = true; state.confirmDelete = false; showError('');
  paint('editor');
  try {
    const selectId = await action();
    await refreshList(selectId);
    core().toast(success, 'success');
  } catch (error) {
    if (!locked(error)) state.error = error?.payload?.error || 'Não foi possível concluir a ação.';
  } finally {
    state.busy = false;
    paint();
  }
}

function save() {
  const body = bodyOf(state.draft);
  if (!body) { showError('Verifique as datas de início e de fim.'); return; }
  const id = state.draft.id;
  return run(async () => {
    const payload = id ? await core().apiPut(`${BASE}/${encodeURIComponent(id)}`, body) : await core().apiPost(BASE, body);
    return payload?.data?.id || id;
  }, 'Comunicado guardado.');
}

AppActions.register({
  'pl-com-abrir': (el, event, [id]) => {
    const item = state.items.find(i => i.id === id);
    if (!item) return;
    state.selected = id; state.draft = draftOf(item); state.error = ''; state.confirmDelete = false;
    paint();
  },
  'pl-com-novo': () => { state.selected = null; state.draft = blankDraft(); state.error = ''; state.confirmDelete = false; paint(); q('pl-com-titulo')?.focus(); },
  'pl-com-tipo': (el, event, [key]) => { state.draft.kind = key; paint('editor'); },
  'pl-com-publico': (el, event, [key]) => { state.draft.audience = key; state.draft.ids = []; paint('editor'); },
  'pl-com-guardar': () => save(),
  'pl-com-terminar': () => {
    const id = state.draft.id;
    if (id) return run(async () => { await core().apiPost(`${BASE}/${encodeURIComponent(id)}/end`, {}); return id; }, 'Comunicado terminado.');
  },
  'pl-com-apagar': () => {
    const id = state.draft.id;
    if (!id) return;
    if (!state.confirmDelete) { state.confirmDelete = true; paint('editor'); return; }
    return run(async () => { await core().apiDelete(`${BASE}/${encodeURIComponent(id)}`); return null; }, 'Comunicado apagado.');
  },
}, 'click');

AppActions.register({
  'pl-com-campo': (el, event, [field]) => {
    state.draft[field] = el.value;
    if (field === 'title' || field === 'body') paintPreview();
  },
}, 'input');

AppActions.register({
  'pl-com-escolher': (el, event, [id]) => {
    const ids = new Set(state.draft.ids);
    if (el.checked) ids.add(id); else ids.delete(id);
    state.draft.ids = [...ids];
  },
  'pl-com-marcar': (el, event, [field]) => { state.draft[field] = el.checked; if (field === 'topbar') paintPreview(); },
}, 'change');
})();
