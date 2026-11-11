// Consola da plataforma: Suporte. A caixa de entrada (/plataforma/suporte) e o
// pedido (/plataforma/suporte/<id>) com a conversa, a resposta com anexos, a
// mudança de estado e o contexto técnico. Todo o texto da API passa por esc().
(() => {
AppModules.define('consola', {
  suporte: { get: () => inbox },
  pedido: { get: () => ticketPage },
});

const fmt = AppModules.consola.fmt;
const api = AppModules.consola.api;
const { esc } = fmt;

const MAX_FILES = 3;
const MAX_BYTES = 10 * 1024 * 1024;
const MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'];
const STATUS_ORDER = ['open', 'in_review', 'needs_customer', 'resolved'];
const STATUS_PILLS = [['all', 'Todos'], ['open', 'Abertos'], ['in_review', 'Em análise'], ['needs_customer', 'Precisa do cliente'], ['resolved', 'Resolvidos']];
const TYPE_PILLS = [['', 'Todos os tipos'], ['problem', 'Problema'], ['improvement', 'Melhoria'], ['question', 'Pergunta']];

const filter = { status: 'all', type: '', q: '' };
const inboxState = { tickets: [], counts: {} };
// Rascunho da resposta (texto e nomes dos anexos) por pedido, para não se perder
// quando a consola bloqueia ou a página recarrega. Os ficheiros em si não ficam.
const draftKey = id => `pl-sup-rascunho:${id}`;
function loadDraft(id) {
  try {
    const raw = JSON.parse(sessionStorage.getItem(draftKey(id)) || 'null');
    return { text: typeof raw?.text === 'string' ? raw.text : '', names: Array.isArray(raw?.names) ? raw.names.map(String) : [] };
  } catch { return { text: '', names: [] }; }
}
function saveDraft() {
  if (!cur.id) return;
  const text = document.getElementById('pl-resp')?.value || '';
  const names = cur.files.map(f => f.name);
  try {
    if (!text && !names.length) sessionStorage.removeItem(draftKey(cur.id));
    else sessionStorage.setItem(draftKey(cur.id), JSON.stringify({ text, names }));
  } catch { /* sem armazenamento: só não guarda */ }
}
function clearDraft() { try { sessionStorage.removeItem(draftKey(cur.id)); } catch { /* nada */ } }

const cur = { ctx: null, id: '', data: null, files: [], lost: [], error: '', busy: false };

const statusInfo = status => fmt.TICKET_STATUS[status] || { label: String(status || '—'), tone: 'neutral' };
const statusChip = status => fmt.chip(statusInfo(status).tone, statusInfo(status).label);
const typeInfo = type => fmt.TICKET_TYPE[type] || { label: String(type || 'Pedido'), icon: 'message-square' };
const ticketHref = id => `/plataforma/suporte/${encodeURIComponent(id)}`;
const ts = value => fmt.parseDate(value)?.getTime() || 0;
const num = value => (Number(value) || 0).toLocaleString('pt-PT');

function setBadge(tickets) {
  AppModules.consola.contadorSuporte?.(tickets.filter(t => t.unread).length);
}

function unavailable(ctx, text = 'O Suporte ainda não está disponível neste servidor.') {
  ctx.host.innerHTML = `<div class="pl-page"><div class="v2-card pl-notice"><h3>Suporte</h3>
    <p class="v2-empty">${fmt.icon('inbox', 16)}<span>${esc(text)}</span></p></div></div>`;
}

function locked(error) {
  if (error?.status === 423 && error.payload?.locked === true) { AppModules.consola.mostrarBloqueio(); return true; }
  return false;
}

// ═══ Caixa de entrada ═══
function visible() {
  const term = filter.q.trim().toLowerCase();
  return inboxState.tickets
    .filter(t => (filter.status === 'all' || t.status === filter.status)
      && (!filter.type || t.type === filter.type)
      && (!term || `${t.subject || ''} ${t.number || ''}`.toLowerCase().includes(term)))
    .sort((a, b) => (Number(!!b.unread) - Number(!!a.unread)) || (ts(b.last_message_at || b.created_at) - ts(a.last_message_at || a.created_at)));
}

function rowHtml(t) {
  const type = typeInfo(t.type);
  const org = t.organization;
  const orgHtml = org?.id != null
    ? fmt.link(fmt.orgHref(org.id), esc(org.name || 'Organização'), 'pl-org-link v2-link')
    : `<span class="pl-muted">${esc(org?.name || '—')}</span>`;
  const when = fmt.relativo(t.last_message_at || t.created_at, 'sem data');
  return `<div class="v2-row pl-row pl-tk${t.unread ? ' is-unread' : ''}">
    <span class="v2-ic pl-tk-ic" title="${esc(type.label)}" aria-hidden="true">${fmt.icon(type.icon, 16)}</span>
    <span class="v2-row-text pl-tk-main">${fmt.link(ticketHref(t.id), `<b>${esc(t.subject)}</b>`, 'pl-tk-link')}<span>${esc(t.number)} · ${esc(type.label)}</span></span>
    <span class="pl-tk-meta">
      <span class="pl-tk-org">${orgHtml}</span>
      <span class="pl-tk-author pl-muted">${esc(t.author?.name || '—')}</span>
      <span class="pl-tk-when pl-muted">${t.unread ? '<span class="pl-unread" title="Mensagem por ler"></span><span class="pl-vh">Por ler. </span>' : ''}${esc(when)}</span>
    </span>
    <span class="pl-tk-chip">${statusChip(t.status)}</span></div>`;
}

function listHtml() {
  const rows = visible();
  if (!rows.length) {
    return fmt.empty(inboxState.tickets.length ? 'Nenhum pedido corresponde aos filtros.' : 'Ainda sem pedidos de suporte.', 'inbox');
  }
  return `<div class="pl-table"><div class="pl-th pl-tk"><span></span><span>Pedido</span><span class="pl-tk-meta"><span>Organização</span><span>Autor</span><span>Última mensagem</span></span><span>Estado</span></div>
    ${rows.map(rowHtml).join('')}</div>`;
}

function statusPills() {
  const counts = inboxState.counts;
  const countOf = key => (counts[key] != null ? Number(counts[key]) : inboxState.tickets.filter(t => key === 'all' || t.status === key).length);
  return STATUS_PILLS.map(([key, label]) => `<button type="button" aria-pressed="${filter.status === key}" ${AppActions.attrs('click', 'pl-sup-estado-filtro', [key])}>${esc(label)} <em>${num(countOf(key))}</em></button>`).join('');
}
function typePills() {
  return TYPE_PILLS.map(([key, label]) => `<button type="button" aria-pressed="${filter.type === key}" ${AppActions.attrs('click', 'pl-sup-tipo-filtro', [key])}>${esc(label)}</button>`).join('');
}

function refreshInbox() {
  const list = document.getElementById('pl-lista');
  if (list) list.innerHTML = listHtml();
  const s = document.getElementById('pl-filtros');
  if (s) s.innerHTML = statusPills();
  const t = document.getElementById('pl-filtros-tipo');
  if (t) t.innerHTML = typePills();
  if (window.lucide) lucide.createIcons();
}

const inbox = {
  async render(ctx) {
    const [data, retention, stats] = await Promise.all([api.supportTickets(), AppModules.core.apiGet('/api/platform/support/retention').then(r => r.data), api.supportStats()]);
    if (ctx.stale()) return;
    if (!data) { unavailable(ctx); return; }
    inboxState.tickets = data.tickets;
    inboxState.counts = data.counts;
    setBadge(data.tickets);
    ctx.host.innerHTML = `<div class="pl-page">
      <p class="pl-note">Conservação: ${retention.days ? `pedidos resolvidos sem alterações há ${num(retention.days)} dias são eliminados automaticamente, com os anexos.` : 'limpeza automática desligada. A Administração pode apagar pedidos e anexos individualmente.'}</p>
      ${AppModules.consola.canManage ? `<form class="v2-card v2-dense" ${AppActions.attrs('submit','pl-sup-conservacao')}><label class="pl-label" for="pl-retencao">Prazo de conservação dos pedidos resolvidos (dias)</label><input class="form-control" id="pl-retencao" type="number" min="0" max="3650" step="1" value="${retention.days}" required><p class="pl-note">0 desliga a limpeza. Entre 30 e 3650 dias, elimina definitivamente os pedidos resolvidos sem alterações nesse prazo e os anexos. Os pedidos em aberto são conservados.</p><button type="submit" class="btn btn-ghost">Guardar prazo</button><p role="status" id="pl-retencao-estado"></p></form>` : ''}
      <p class="pl-note">Primeira resposta (30 dias): ${stats?.avg_first_response_hours == null ? 'ainda sem dados' : `${num(stats.avg_first_response_hours)} horas em média · ${num(stats.answered_30d)} pedidos respondidos`}.</p>
      <div class="pl-toolbar">
        <div class="search-box pl-search"><i data-lucide="search"></i>
          <input type="search" id="pl-pesquisa" value="${esc(filter.q)}" placeholder="Pesquisar assunto ou número…" autocomplete="off" aria-label="Pesquisar por assunto ou número" ${AppActions.attrs('input', 'pl-sup-pesquisa')}></div>
        <div class="pl-pills" id="pl-filtros-tipo" role="group" aria-label="Filtrar por tipo">${typePills()}</div>
      </div>
      <div class="pl-pills" id="pl-filtros" role="group" aria-label="Filtrar por estado">${statusPills()}</div>
      <div class="v2-card v2-dense" id="pl-lista">${listHtml()}</div></div>`;
  },
};

// ═══ Pedido ═══
const kv = (label, value) => `<div class="pl-kv"><span>${esc(label)}</span><b>${value}</b></div>`;

function pick(obj, ...keys) {
  for (const key of keys) {
    const value = obj?.[key];
    if (value == null || value === '') continue;
    if (typeof value === 'object') {
      const text = [value.name, value.version].filter(Boolean).join(' ') || (value.width ? `${value.width}${value.height ? ` × ${value.height}` : ''}` : '');
      if (text) return text;
      continue;
    }
    return String(value);
  }
  return '';
}

function contextCard(context) {
  if (!context || typeof context !== 'object' || !Object.keys(context).length) {
    return `<section class="v2-card v2-dense"><div class="v2-card-h"><h3>Contexto técnico</h3></div>${fmt.empty('O cliente não partilhou o contexto técnico.')}</section>`;
  }
  const page = pick(context, 'page', 'view', 'path');
  const device = pick(context, 'device', 'device_type');
  const display = pick(context, 'display_mode', 'display');
  const width = pick(context, 'viewport', 'screen_width', 'width');
  const rows = [
    ['Página', page ? esc(/^[a-z-]+$/i.test(page) ? fmt.viewName(page) : page) : ''],
    ['Versão', esc(pick(context, 'app_build', 'version', 'build'))],
    ['Browser', esc(pick(context, 'browser'))],
    ['Sistema', esc(pick(context, 'os', 'system'))],
    ['Dispositivo', esc(fmt.DEVICES[device] || device)],
    ['Modo', esc(fmt.DISPLAY[display] || display)],
    ['Largura', width ? `${esc(width)}${/^\d+$/.test(width) ? ' px' : ''}` : ''],
  ].filter(([, value]) => value);
  return `<section class="v2-card v2-dense"><div class="v2-card-h"><h3>Contexto técnico</h3></div>${rows.length ? rows.map(([l, v]) => kv(l, v)).join('') : fmt.empty('Sem detalhes.')}</section>`;
}

function attachmentHtml(a) {
  const url = String(a?.url || '');
  const name = esc(a?.name || 'anexo');
  const size = a?.size != null ? ` <span class="pl-sub">${esc(fmt.bytes(a.size))}</span>` : '';
  const inner = `${fmt.icon(a?.mime === 'application/pdf' ? 'file-text' : 'image', 16)}<span class="pl-att-name">${name}</span>${size}`;
  return url.startsWith('/')
    ? `<a class="pl-att" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${inner}</a>`
    : `<span class="pl-att">${inner}</span>`;
}

function messageHtml(m) {
  const platform = m.side === 'platform';
  const author = m.author_name || (platform ? 'Plataforma' : 'Cliente');
  const files = Array.isArray(m.attachments) ? m.attachments : [];
  return `<article class="pl-bubble${platform ? ' is-platform' : ''}">
    <header><b>${esc(author)}</b><span class="pl-sub">${platform ? 'Plataforma' : 'Cliente'} · ${esc(fmt.dateTime(m.created_at))}</span></header>
    <p class="pl-bubble-body">${esc(m.body)}</p>
    ${files.length ? `<div class="pl-atts">${files.map(a => attachmentHtml(a) + (AppModules.consola.canManage ? `<button type="button" class="btn btn-ghost btn-sm" ${AppActions.attrs('click','pl-sup-apagar-anexo',[a.id])}>Apagar anexo</button>` : '')).join('')}</div>` : ''}</article>`;
}

function filesHtml() {
  const lost = cur.lost.length ? `<p class="pl-sub pl-lost">Rascunho anterior com anexos (volte a anexar): ${esc(cur.lost.join(', '))}</p>` : '';
  return lost + cur.files.map((f, i) => `<span class="pl-file">${fmt.icon('paperclip', 14)}<span class="pl-att-name">${esc(f.name)}</span><span class="pl-sub">${esc(fmt.bytes(f.size))}</span>
    <button type="button" class="pl-file-x" aria-label="Remover ${esc(f.name)}" ${AppActions.attrs('click', 'pl-sup-anexo-remover', [i])}>${fmt.icon('x', 14)}</button></span>`).join('');
}

let savedReplies = [];
let selectedReply = '';
let deleteConfirm = '';
const supportToolsUrl = '/api/platform/support';
function savedRepliesHtml() {
  return `<details><summary>Respostas guardadas</summary><label class="pl-label" for="pl-saved-reply">Escolher resposta</label>
    <select class="form-control" id="pl-saved-reply" ${AppActions.attrs('change','pl-sup-modelo')}><option value="">Nova resposta guardada</option>${savedReplies.map(r => `<option value="${esc(r.id)}"${selectedReply === r.id ? ' selected' : ''}>${esc(r.title)}</option>`).join('')}</select>
    <label class="pl-label" for="pl-saved-title">Título da resposta guardada</label><input class="form-control" id="pl-saved-title" maxlength="80" value="${esc(savedReplies.find(r => r.id === selectedReply)?.title || '')}">
    <p class="pl-note">Reveja a mensagem antes de enviar. Guardar usa o texto atual da mensagem.</p>
    <button type="button" class="btn btn-ghost btn-sm" ${AppActions.attrs('click','pl-sup-modelo-guardar')}>Guardar resposta</button>
    <button type="button" class="btn btn-ghost btn-sm" ${AppActions.attrs('click','pl-sup-modelo-apagar')}>Apagar resposta guardada</button></details>`;
}
async function saveReply(button) {
  const title = document.getElementById('pl-saved-title')?.value || '';
  const body = document.getElementById('pl-resp')?.value || '';
  button.disabled = true;
  try {
    const url = `${supportToolsUrl}/saved-replies`;
    const payload = selectedReply ? await AppModules.core.apiPut(`${url}/${encodeURIComponent(selectedReply)}`, { title, body }) : await AppModules.core.apiPost(url, { title, body });
    selectedReply = payload.data.id;
    savedReplies = (await AppModules.core.apiGet(url)).data;
    paint(); AppModules.core.toast('Resposta guardada.', 'success');
  } catch (error) { if (!locked(error)) showError(error?.payload?.error || 'Não foi possível guardar.'); }
  finally { button.disabled = false; }
}
async function removeItem(button, kind, id) {
  if (!id) return;
  const key = `${kind}:${id}`;
  if (deleteConfirm !== key) { deleteConfirm = key; button.textContent = 'Confirmar eliminação definitiva'; return; }
  button.disabled = true;
  try {
    await AppModules.core.apiDelete(`${supportToolsUrl}/${kind}/${encodeURIComponent(id)}`);
    deleteConfirm = '';
    if (kind === 'tickets') { location.assign('/plataforma/suporte'); return; }
    if (kind === 'saved-replies') { selectedReply = ''; savedReplies = (await AppModules.core.apiGet(`${supportToolsUrl}/saved-replies`)).data; paint(); }
    else await reload();
    AppModules.core.toast('Eliminado.', 'success');
  } catch (error) { if (!locked(error)) showError(error?.payload?.error || 'Não foi possível eliminar.'); }
  finally { button.disabled = false; }
}

function replyHtml(ticket, draft) {
  if (!AppModules.consola.canManage) return '<section class="v2-card v2-dense"><p>A resposta aos pedidos é da Administração.</p></section>';
  const options = STATUS_ORDER.map(key => `<option value="${key}">${esc(statusInfo(key).label)}</option>`).join('');
  return `<section class="v2-card v2-dense"><div class="v2-card-h"><h3>Responder</h3></div>
    ${savedRepliesHtml()}
    <button type="button" class="btn btn-ghost btn-sm" ${AppActions.attrs('click','pl-sup-apagar-pedido')}>Apagar pedido e anexos</button>
    <label class="pl-label" for="pl-resp">Mensagem para ${esc(ticket.author?.name || 'o cliente')}</label>
    <textarea class="form-control" id="pl-resp" rows="5" maxlength="5000" placeholder="Escreva a resposta…" ${AppActions.attrs('input', 'pl-sup-rascunho')}>${esc(draft.text)}</textarea>
    <div class="pl-files" id="pl-anexos">${filesHtml()}</div>
    <div class="pl-reply-bar">
      <label class="btn btn-ghost btn-sm pl-attach">${fmt.icon('paperclip', 14)}<span>Anexar</span>
        <input type="file" id="pl-ficheiro" multiple hidden accept="image/png,image/jpeg,image/webp,image/gif,application/pdf" ${AppActions.attrs('change', 'pl-sup-anexar')}></label>
      <label class="pl-after" for="pl-resp-estado"><span>e mudar estado para…</span>
        <select class="form-control" id="pl-resp-estado"><option value="">manter estado</option>${options}</select></label>
      <button type="button" class="btn btn-primary" id="pl-enviar" ${AppActions.attrs('click', 'pl-sup-enviar')}>Enviar</button>
    </div>
    <p class="pl-sub pl-hint">Até ${MAX_FILES} anexos, 10 MB cada (PNG, JPEG, WEBP, GIF ou PDF).</p>
    <p class="pl-error" id="pl-sup-erro" role="alert"${cur.error ? '' : ' hidden'}>${esc(cur.error)}</p></section>`;
}

function sideHtml(ticket, org, context) {
  const type = typeInfo(ticket.type);
  const options = STATUS_ORDER.map(key => `<option value="${key}"${ticket.status === key ? ' selected' : ''}>${esc(statusInfo(key).label)}</option>`).join('');
  const orgHtml = org?.id != null ? fmt.link(fmt.orgHref(org.id), esc(org.name || 'Organização'), 'v2-link') : esc(org?.name || '—');
  return `<aside class="pl-col pl-aside" aria-label="Detalhes do pedido">
    <section class="v2-card v2-dense"><div class="v2-card-h"><h3>Pedido</h3></div>
      <label class="pl-label" for="pl-estado-pedido">Estado</label>
      <select class="form-control" id="pl-estado-pedido"${AppModules.consola.canManage ? '' : ' disabled'} ${AppActions.attrs('change', 'pl-sup-mudar-estado')}>${options}</select>
      <p class="pl-error" id="pl-estado-erro" role="alert" hidden></p>
      <div class="pl-side-kv">
      ${kv('Tipo', esc(type.label))}
      ${kv('Organização', orgHtml)}
      ${kv('Autor', esc(ticket.author?.name || '—'))}
      ${kv('Criado', esc(fmt.dateTime(ticket.created_at)))}
      ${kv('Atualizado', esc(fmt.dateTime(ticket.updated_at)))}
      ${ticket.customer_confirmed_at ? kv('Confirmado pelo cliente', `${fmt.icon('check-circle', 14)} ${esc(fmt.dateTime(ticket.customer_confirmed_at))}`) : ''}
      </div>
      <div class="pl-save"><button type="button" class="btn btn-ghost btn-sm" id="pl-criar-tarefa" ${AppActions.attrs('click', 'pl-sup-tarefa')}>${fmt.icon('kanban-square', 14)}<span>Criar tarefa</span></button><button type="button" class="btn btn-ghost btn-sm" ${AppActions.attrs('click','pl-sup-produto')}>Registar bug ou sugestão</button></div>
      ${org?.id != null ? `<div class="pl-save">${fmt.link(fmt.orgHref(org.id), `${fmt.icon('building-2', 14)}<span>Ficha do cliente</span>`, 'btn btn-ghost btn-sm')}</div>` : ''}
    </section>
    ${contextCard(context)}</aside>`;
}

function ticketHtml(data, draft) {
  const { ticket } = data;
  const org = data.organization || ticket.organization;
  const messages = Array.isArray(data.messages) ? data.messages : [];
  return `<div class="pl-page">
    <div class="pl-crumb">${fmt.link('/plataforma/suporte', `${fmt.icon('arrow-left', 14)}<span>Suporte</span>`, 'pl-backlink')}</div>
    <header class="pl-org-head"><div><h2>${esc(ticket.subject)}</h2><span class="pl-muted">${esc(ticket.number)} · ${esc(typeInfo(ticket.type).label)}</span></div>
      <div class="pl-org-chips">${statusChip(ticket.status)}${ticket.customer_confirmed_at ? fmt.chip('ok', 'Confirmado pelo cliente') : ''}</div></header>
    <div class="pl-ticket">
      <div class="pl-col">
        <section class="v2-card v2-dense"><div class="v2-card-h"><h3>Conversa</h3></div>
          <div class="pl-thread">${messages.length ? messages.map(messageHtml).join('') : fmt.empty('Sem mensagens.')}</div></section>
        ${replyHtml(ticket, draft)}
      </div>
      ${sideHtml(ticket, org, data.context)}
    </div></div>`;
}

function notFound(ctx) {
  ctx.host.innerHTML = `<div class="pl-page"><div class="v2-card pl-notice"><h3>Pedido não encontrado</h3>
    <p class="v2-empty">Este pedido já não existe ou o endereço está errado.</p>${fmt.link('/plataforma/suporte', 'Ver todos os pedidos', 'btn btn-ghost btn-sm')}</div></div>`;
}

// Desenha o pedido, guardando o que estava escrito na resposta.
function paint(draft = null) {
  const host = cur.ctx.host;
  const keep = draft || { text: document.getElementById('pl-resp')?.value || '' };
  host.innerHTML = ticketHtml(cur.data, keep);
  if (window.lucide) lucide.createIcons();
}

async function reload(ctx = cur.ctx, draft = null) {
  const data = await api.supportTicket(cur.id);
  if (ctx.stale()) return false;
  if (!data?.ticket) { notFound(ctx); return false; }
  cur.data = data;
  paint(draft);
  api.supportTickets().then(list => { if (list && !ctx.stale()) setBadge(list.tickets); }).catch(() => {});
  return true;
}

const ticketPage = {
  async render(ctx) {
    Object.assign(cur, { ctx, id: ctx.route.id, files: [], lost: [], error: '', busy: false });
    const [data, replies] = await Promise.all([api.supportTicket(cur.id), AppModules.core.apiGet(`${supportToolsUrl}/saved-replies`).then(r => r.data)]);
    savedReplies = replies || []; selectedReply = ''; deleteConfirm = '';
    if (ctx.stale()) return;
    if (!data?.ticket) { notFound(ctx); return; }
    cur.data = data;
    const saved = loadDraft(cur.id);
    cur.lost = saved.names;
    paint({ text: saved.text });
    api.supportTickets().then(list => { if (list && !ctx.stale()) setBadge(list.tickets); }).catch(() => {});
  },
};

// ── Anexos ──
function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, size: file.size, data_base64: String(reader.result).split(',')[1] || '' });
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function showError(text) {
  cur.error = text;
  const el = document.getElementById('pl-sup-erro');
  if (!el) return;
  el.textContent = text;
  el.hidden = !text;
}

async function addFiles(input) {
  const picked = [...(input.files || [])];
  input.value = '';
  showError('');
  for (const file of picked) {
    if (cur.files.length >= MAX_FILES) { showError(`No máximo ${MAX_FILES} anexos por mensagem.`); break; }
    if (!MIMES.includes(file.type)) { showError(`«${file.name}»: só PNG, JPEG, WEBP, GIF ou PDF.`); continue; }
    if (file.size > MAX_BYTES) { showError(`«${file.name}» tem mais de 10 MB.`); continue; }
    try { cur.files.push(await readFile(file)); cur.lost = []; }
    catch { showError(`Não foi possível ler «${file.name}».`); }
  }
  const box = document.getElementById('pl-anexos');
  if (box) { box.innerHTML = filesHtml(); if (window.lucide) lucide.createIcons(); }
  saveDraft();
}

async function send(button) {
  if (cur.busy) return;
  const text = document.getElementById('pl-resp')?.value.trim() || '';
  const status = document.getElementById('pl-resp-estado')?.value || '';
  if (!text) { showError('Escreva a mensagem.'); return; }
  cur.busy = true;
  button.disabled = true;
  showError('');
  const body = { body: text };
  if (cur.files.length) body.attachments = cur.files.map(f => ({ name: f.name, data_base64: f.data_base64 }));
  if (status) body.status = status;
  const ctx = cur.ctx;
  try {
    await api.supportReply(cur.id, body);
    cur.files = [];
    cur.lost = [];
    clearDraft();
    AppModules.core.toast('Resposta enviada.', 'success');
    await reload(ctx, { text: '' });
  } catch (error) {
    if (locked(error)) return;
    showError(error?.payload?.error || 'Não foi possível enviar. Tente novamente.');
  } finally {
    cur.busy = false;
    const b = document.getElementById('pl-enviar');
    if (b) b.disabled = false;
  }
}

async function changeStatus(select) {
  const status = select.value;
  const err = document.getElementById('pl-estado-erro');
  if (err) err.hidden = true;
  select.disabled = true;
  const ctx = cur.ctx;
  try {
    await api.supportStatus(cur.id, status);
    AppModules.core.toast('Estado atualizado.', 'success');
    await reload(ctx);
  } catch (error) {
    select.disabled = false;
    select.value = cur.data?.ticket?.status || select.value;
    if (locked(error)) return;
    if (err) { err.textContent = error?.payload?.error || 'Não foi possível mudar o estado.'; err.hidden = false; }
  }
}

AppActions.register({
  'pl-sup-modelo-guardar': el => saveReply(el),
  'pl-sup-modelo-apagar': el => removeItem(el, 'saved-replies', selectedReply),
  'pl-sup-apagar-pedido': el => removeItem(el, 'tickets', cur.id),
  'pl-sup-apagar-anexo': (el, event, [id]) => removeItem(el, 'attachments', id),
  'pl-sup-estado-filtro': (el, event, [key]) => { filter.status = key; refreshInbox(); },
  'pl-sup-tipo-filtro': (el, event, [key]) => { filter.type = key; refreshInbox(); },
  'pl-sup-anexo-remover': (el, event, [index]) => {
    cur.files.splice(Number(index), 1);
    const box = document.getElementById('pl-anexos');
    if (box) { box.innerHTML = filesHtml(); if (window.lucide) lucide.createIcons(); }
    saveDraft();
  },
  'pl-sup-produto': () => { const t=cur.data?.ticket;if(!t)return;sessionStorage.setItem('pl-product-prefill',JSON.stringify({title:t.subject,ticket_id:t.id,organization_id:(cur.data.organization||t.organization)?.id||'',description:'Pedido de suporte '+t.number}));history.pushState({},'', '/plataforma/produto/pedidos');window.dispatchEvent(new PopStateEvent('popstate')); },
  'pl-sup-tarefa': () => createTask(),
  'pl-sup-enviar': el => send(el),
}, 'click');
// Abre a nova tarefa já ligada a este pedido e ao cliente.
function createTask() {
  const ticket = cur.data?.ticket;
  if (!ticket) return;
  const org = cur.data.organization || ticket.organization;
  const prefill = { title: `Pedido ${ticket.number}: ${ticket.subject}`.slice(0, 140), ticket_id: ticket.id, ticket_number: ticket.number,
    organization_id: org?.id != null ? String(org.id) : '', type: ticket.type === 'problem' ? 'bug' : 'improvement' };
  try { sessionStorage.setItem('pl-tarefa-prefill', JSON.stringify(prefill)); } catch { /* sem armazenamento */ }
  history.pushState({}, '', '/plataforma/tarefas');
  window.dispatchEvent(new PopStateEvent('popstate'));
}

AppActions.register({
  'pl-sup-rascunho': () => saveDraft(),
  'pl-sup-pesquisa': el => {
    filter.q = el.value;
    const list = document.getElementById('pl-lista');
    if (list) list.innerHTML = listHtml();
    if (window.lucide) lucide.createIcons();
  },
}, 'input');
AppActions.register({
  'pl-sup-anexar': el => addFiles(el),
  'pl-sup-mudar-estado': el => changeStatus(el),
  'pl-sup-modelo': el => { selectedReply = el.value; const reply = savedReplies.find(r => r.id === selectedReply); if (reply) { const area = document.getElementById('pl-resp'); area.value = reply.body; saveDraft(); } const title = document.getElementById('pl-saved-title'); if (title) title.value = reply?.title || ''; },
}, 'change');
AppActions.register({ 'pl-sup-conservacao': async (form, event) => {
  event.preventDefault(); const button = form.querySelector('button'); button.disabled = true;
  try { const days = Number(document.getElementById('pl-retencao').value); await AppModules.core.apiPut(`${supportToolsUrl}/retention`, { days }); document.getElementById('pl-retencao-estado').textContent = days ? 'Prazo guardado. A limpeza corre de hora a hora.' : 'Limpeza automática desligada.'; }
  catch (error) { if (!locked(error)) document.getElementById('pl-retencao-estado').textContent = error?.payload?.error || 'Não foi possível guardar.'; }
  finally { button.disabled = false; }
} }, 'submit');
})();
