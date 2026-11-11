// «Ajuda e feedback» (V2): os pedidos do espaço ao dono da instância.
// Avisos de incidente, três atalhos para um novo pedido, a lista de pedidos
// com filtros e a conversa (à direita no computador; no telemóvel é uma
// página à parte com «Os meus pedidos» para voltar). API em /api/support
// (ver o contrato no plano). O novo pedido está em novo-pedido.js.
(() => {
AppModules.define('ajuda', {
  TYPES: { get: () => TYPES },
  FILE_ACCEPT: { get: () => FILE_ACCEPT },
  addFiles: { get: () => addFiles },
  fileChipsHtml: { get: () => fileChipsHtml },
  openPage: { get: () => openPage },
  requestTicket: { get: () => requestTicket },
  openTicket: { get: () => openTicket },
  pageLabel: { get: () => pageLabel },
  quando: { get: () => quando },
  readAttachments: { get: () => readAttachments },
  reloadAll: { get: () => reloadAll },
});

const core = () => AppModules.core;
const esc = value => core().escapeHtml(value);
const ic = (name, size = 16) => core().lcIcon(name, size);

// [rótulo, ícone] de cada tipo de pedido.
const TYPES = {
  problem: ['Problema', 'bug'],
  improvement: ['Melhoria', 'lightbulb'],
  question: ['Pergunta', 'circle-help'],
};
// [rótulo, tom do .v2-chip]
const STATUS = {
  open: ['Aberto', 'info'],
  in_review: ['Em análise', 'warn'],
  needs_customer: ['Precisa de si', 'violet'],
  resolved: ['Resolvido', 'ok'],
};
const FILTERS = [['all', 'Todos'], ['open', 'Abertos'], ['in_review', 'Em análise'], ['resolved', 'Resolvidos']];
const ACTIONS = [
  ['problem', 'Reportar um problema', 'Algo não está a funcionar como devia.'],
  ['improvement', 'Sugerir uma melhoria', 'Uma ideia para o Santa Paciência.'],
  ['question', 'Fazer uma pergunta', 'Dúvidas sobre como usar a plataforma.'],
];
// Páginas da app, para o «Enviado a partir de …» e o resumo técnico.
const PAGES = {
  dashboard: 'Dashboard', reservas: 'Reservas', calendario: 'Calendário', eventos: 'Eventos', hospedes: 'Hóspedes',
  notificacoes: 'Notificações', alojamentos: 'Alojamentos', invoice: 'Mensagens', despesas: 'Despesas',
  relatorios: 'Relatórios', vouchers: 'Vouchers', precos: 'Preços', definicoes: 'Definições', ajuda: 'Ajuda e feedback',
  'hospede-detalhe': 'Ficha de hóspede', 'alojamento-detalhe': 'Ficha do alojamento',
};

// Anexos: até 3 por mensagem, 10 MB cada, validados aqui e outra vez no servidor.
const MAX_FILES = 3;
const MAX_BYTES = 10 * 1024 * 1024;
const MIME_BY_EXT = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf' };
const ALLOWED = new Set(Object.values(MIME_BY_EXT));
const FILE_ACCEPT = '.png,.jpg,.jpeg,.webp,.gif,.pdf,image/png,image/jpeg,image/webp,image/gif,application/pdf';

let tickets = [];
let counts = { all: 0, open: 0, in_review: 0, resolved: 0 };
let summary = null;
let notices = [];
let filter = 'all';
let selectedId = null;
let detail = null; // { ticket, messages, context }
let listState = 'loading'; // loading | ready | error | off
let detailState = 'idle'; // idle | loading | ready | error
let detailSeq = 0;
let drafts = new Map(); // id do pedido → texto por enviar
let replyFiles = [];
let sending = false;

const pageLabel = page => PAGES[page] || (page ? String(page) : '');
const root = () => document.getElementById('ajv2-root');
const wide = () => window.matchMedia('(min-width: 961px)').matches;

function number(value) {
  return typeof value === 'number' ? `SP-${String(value).padStart(4, '0')}` : String(value ?? '');
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
// «Hoje, 10:24», «Ontem, 16:47», «22 out» (com a hora se `hora`).
function quando(iso, hora = true) {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const day = d => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const now = new Date();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const time = then.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
  if (day(then) === day(now)) return `Hoje, ${time}`;
  if (day(then) === day(yesterday)) return `Ontem, ${time}`;
  const date = `${then.getDate()} ${MONTHS[then.getMonth()]}${then.getFullYear() === now.getFullYear() ? '' : ` ${then.getFullYear()}`}`;
  return hora ? `${date}, ${time}` : date;
}

// «Criado hoje, 10:24» / «Criado a 22 out, 09:58».
function criadoEm(iso) {
  const text = quando(iso);
  return /^(Hoje|Ontem)/.test(text) ? `Criado ${text.charAt(0).toLowerCase()}${text.slice(1)}` : `Criado a ${text}`;
}

function sizeLabel(bytes) {
  const n = Number(bytes) || 0;
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

function errorText(error, fallback) {
  return error?.payload?.error || fallback;
}

// ── Anexos (partilhados com o novo pedido) ──
// Junta os ficheiros escolhidos a `list` (até 3) e devolve o que foi recusado.
function addFiles(list, picked) {
  const problems = [];
  for (const file of [...picked]) {
    const ext = String(file.name).split('.').pop().toLowerCase();
    if (!ALLOWED.has(file.type || MIME_BY_EXT[ext])) problems.push(`«${file.name}» não é um formato aceite (PNG, JPG, WEBP, GIF ou PDF).`);
    else if (file.size > MAX_BYTES) problems.push(`«${file.name}» tem mais de 10 MB.`);
    else if (!file.size) problems.push(`«${file.name}» está vazio.`);
    else if (list.length >= MAX_FILES) problems.push(`Só pode anexar até ${MAX_FILES} ficheiros.`);
    else list.push(file);
  }
  return [...new Set(problems)];
}

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(new Error(`Não foi possível ler «${file.name}».`));
    reader.readAsDataURL(file);
  });
}

async function readAttachments(files) {
  return Promise.all(files.map(async file => ({ name: file.name, data_base64: await toBase64(file) })));
}

// Ficheiros por enviar, cada um com o seu ✕ (`scope`: 'resposta' ou 'novo').
function fileChipsHtml(files, scope) {
  return files.map((file, index) => `<span class="ajv2-file is-pending">${ic('paperclip', 13)}<span class="ajv2-file-n">${esc(file.name)}</span><small>${sizeLabel(file.size)}</small>
      <button type="button" aria-label="Remover ${esc(file.name)}" ${scope === 'novo' ? AppActions.attrs('click', 'ajuda-novo-remover', [index]) : AppActions.attrs('click', 'ajuda-resp-remover', [index])}>${ic('x', 13)}</button></span>`).join('');
}

// ── Dados ──
// Comunicados da plataforma para «Ajuda e feedback» (show_help); falhar não estraga a página.
async function loadNotices() {
  try {
    const payload = await core().apiGet('/api/announcements', { skipAuthRedirect: true });
    notices = (Array.isArray(payload?.data) ? payload.data : []).filter(item => item.show_help);
  } catch { /* Fica o que já havia. */ }
}

async function loadSummary() {
  const [latest] = await Promise.all([core().refreshSupportSummary?.(), loadNotices()]);
  summary = latest || summary;
  renderAvisos();
}

async function loadList() {
  try {
    const payload = await core().apiGet('/api/support/tickets?status=all');
    tickets = payload?.data?.tickets || [];
    const c = payload?.data?.counts;
    counts = c || {
      all: tickets.length,
      open: tickets.filter(t => t.status === 'open' || t.status === 'needs_customer').length,
      in_review: tickets.filter(t => t.status === 'in_review').length,
      resolved: tickets.filter(t => t.status === 'resolved').length,
    };
    listState = 'ready';
  } catch (error) {
    tickets = [];
    listState = error?.status === 404 || error?.status === 501 ? 'off' : 'error';
  }
  renderList();
}

async function reloadAll() {
  await Promise.all([loadList(), loadSummary()]);
}

async function openTicket(id, { quiet = false } = {}) {
  selectedId = String(id);
  const seq = ++detailSeq;
  if (!quiet) {
    replyFiles = [];
    detailState = 'loading';
    renderLayout();
    renderList();
    renderDetail();
  }
  try {
    const payload = await core().apiGet(`/api/support/tickets/${encodeURIComponent(id)}`);
    if (seq !== detailSeq) return;
    detail = payload?.data || null;
    detailState = detail?.ticket ? 'ready' : 'error';
    // Abrir marca como lido: a lista e o contador acompanham.
    const row = tickets.find(t => String(t.id) === String(id));
    if (row && detail?.ticket) Object.assign(row, detail.ticket, { unread: false });
    core().refreshSupportSummary?.().then(() => { summary = core().supportSummary; renderAvisos(); });
  } catch (error) {
    if (seq !== detailSeq) return;
    detail = null;
    detailState = 'error';
  }
  renderList();
  renderDetail();
  if (!quiet && !wide()) window.scrollTo?.(0, 0);
}

// ── Desenho ──
function shell() {
  const el = root();
  if (!el || el.dataset.ready) return;
  el.dataset.ready = '1';
  el.innerHTML = `<header class="v2-head"><h2>Ajuda e feedback</h2>
      <span>Reporte problemas, sugira melhorias ou tire dúvidas. Respondemos normalmente em 1 dia útil.</span></header>
    <div id="ajv2-avisos"></div>
    <div class="ajv2-acoes">${ACTIONS.map(([type, title, sub]) => `<button type="button" class="ajv2-acao" ${AppActions.attrs('click', 'ajuda-novo', [type])}>
        <span class="ajv2-acao-ic">${ic(TYPES[type][1], 20)}</span>
        <span class="ajv2-acao-t"><b>${title}</b><small>${sub}</small></span>
        ${ic('arrow-right', 18)}</button>`).join('')}</div>
    <div class="ajv2-main" id="ajv2-main">
      <section class="v2-card ajv2-lista" aria-label="Os meus pedidos">
        <div class="ajv2-lista-h"><h3>Os meus pedidos</h3><div class="v2-pills ajv2-filtros" id="ajv2-filtros" role="group" aria-label="Filtrar pedidos"></div></div>
        <div id="ajv2-linhas" aria-live="polite"></div>
      </section>
      <section class="v2-card ajv2-conversa" id="ajv2-conversa" aria-label="Conversa do pedido"></section>
    </div>`;
  if (window.lucide) lucide.createIcons();
}

// [tom, ícone] dos comunicados, como na barra da app.
const NOTICE_KINDS = { maintenance: ['info', 'wrench'], incident: ['bad', 'triangle-alert'], news: ['ok', 'sparkles'], notice: ['warn', 'info'] };

function renderAvisos() {
  const box = document.getElementById('ajv2-avisos');
  if (!box) return;
  const incidents = Array.isArray(summary?.incidents) ? summary.incidents : [];
  const announcements = notices.map(item => {
    const [tone, icon] = NOTICE_KINDS[item.kind] || NOTICE_KINDS.notice;
    return `<div class="ajv2-aviso is-${tone}" role="status">${ic(icon, 18)}
      <span><b>${esc(item.title)}.</b> ${esc(item.body)}</span>
      ${item.starts_at ? `<time datetime="${esc(item.starts_at)}">Desde ${esc(quando(item.starts_at).replace(/^Hoje, /, 'hoje, ').replace(/^Ontem, /, 'ontem, '))}</time>` : ''}</div>`;
  });
  box.innerHTML = announcements.join('') + incidents.map(item => `<div class="ajv2-aviso" role="status">${ic('info', 18)}
      <span><b>${esc(item.title)}</b>${item.detail ? ` ${esc(item.detail)}` : ''}</span>
      ${item.since ? `<time datetime="${esc(item.since)}">Desde ${esc(quando(item.since).replace(/^Hoje, /, 'hoje, ').replace(/^Ontem, /, 'ontem, '))}</time>` : ''}</div>`).join('');
  box.hidden = !incidents.length && !announcements.length;
  if (window.lucide) lucide.createIcons();
}

const inFilter = (ticket, key) => key === 'all' || (key === 'open' ? ticket.status === 'open' || ticket.status === 'needs_customer' : ticket.status === key);

function renderLayout() {
  const main = document.getElementById('ajv2-main');
  if (!main) return;
  main.classList.toggle('is-detail', selectedId !== null);
  root()?.classList.toggle('is-detail', selectedId !== null);
  main.classList.toggle('is-solo', listState === 'ready' && !tickets.length);
}

function renderFiltros() {
  const box = document.getElementById('ajv2-filtros');
  if (!box) return;
  box.innerHTML = FILTERS.map(([key, label]) => `<button type="button" aria-pressed="${key === filter}" ${AppActions.attrs('click', 'ajuda-filtro', [key])}>${label} <em>${Number(counts[key]) || 0}</em></button>`).join('');
}

function renderList() {
  drawList();
  if (window.lucide) lucide.createIcons();
}
function drawList() {
  renderFiltros();
  renderLayout();
  const box = document.getElementById('ajv2-linhas');
  if (!box) return;
  if (listState === 'loading') { box.innerHTML = `<p class="v2-empty">${ic('loader', 16)} A carregar os pedidos…</p>`; return; }
  if (listState === 'off') { box.innerHTML = `<p class="v2-empty">${ic('info', 16)} Este serviço ainda não está disponível. Tente de novo mais tarde.</p>`; return; }
  if (listState === 'error') {
    box.innerHTML = `<p class="v2-empty">${ic('triangle-alert', 16)} Não foi possível carregar os pedidos. <button type="button" class="v2-link" ${AppActions.attrs('click', 'ajuda-recarregar')}>Tentar de novo</button></p>`;
    return;
  }
  if (!tickets.length) {
    box.innerHTML = `<p class="v2-empty">${ic('message-circle', 16)} Ainda não fez nenhum pedido. Quando precisar de ajuda, escolha uma das opções acima.</p>`;
    return;
  }
  const shown = tickets.filter(ticket => inFilter(ticket, filter));
  if (!shown.length) { box.innerHTML = `<p class="v2-empty">${ic('inbox', 16)} Sem pedidos neste filtro.</p>`; return; }
  box.innerHTML = shown.map(ticket => {
    const [typeLabel, typeIcon] = TYPES[ticket.type] || TYPES.question;
    const [statusLabel, tone] = STATUS[ticket.status] || STATUS.open;
    const selected = String(ticket.id) === selectedId;
    return `<button type="button" class="ajv2-row${selected ? ' is-on' : ''}${ticket.unread && !selected ? ' is-unread' : ''}" aria-pressed="${selected}" ${AppActions.attrs('click', 'ajuda-abrir', [ticket.id])}>
        <span class="ajv2-row-t">${ic(typeIcon, 16)}<span class="ajv2-row-x"><b>${esc(ticket.subject)}</b>${ticket.unread && !selected ? '<i class="ajv2-dot" role="img" aria-label="Resposta nova"></i>' : ''}<small>${esc(number(ticket.number))} · ${typeLabel}</small></span></span>
        <span class="v2-chip ${tone}">${statusLabel}</span>
        <span class="ajv2-when">${esc(quando(ticket.last_message_at || ticket.updated_at || ticket.created_at, false) || '')}</span>
      </button>`;
  }).join('');
}

function contextLine(context) {
  if (!context || typeof context !== 'object') return '';
  const agent = [context.browser, context.os].filter(Boolean).join(', ');
  const parts = [
    context.page ? `Enviado a partir de ${pageLabel(context.page)}` : '',
    agent ? (context.os && context.browser ? `${context.browser} (${context.os})` : agent) : '',
    context.app_build ? `versão ${String(context.app_build).slice(0, 8)}` : '',
  ].filter(Boolean);
  return parts.join(' · ');
}

function messageHtml(message, index, context) {
  const team = message.side === 'platform';
  const who = team ? 'Equipa Santa Paciência' : (message.author_name || 'Eu');
  const files = (message.attachments || []).map(file => {
    const url = core().safeMediaUrl(/^https?:/.test(file.url || '') ? file.url : (core().API_BASE || '') + (file.url || ''));
    const inner = `${ic('paperclip', 13)}<span class="ajv2-file-n">${esc(file.name)}</span><small>${sizeLabel(file.size)}</small>`;
    return url ? `<a class="ajv2-file" href="${esc(url)}" target="_blank" rel="noopener">${inner}</a>` : `<span class="ajv2-file">${inner}</span>`;
  }).join('');
  const line = !team && index === 0 ? contextLine(context) : '';
  return `<article class="ajv2-msg">
      <span class="ajv2-av${team ? ' is-team' : ''}" aria-hidden="true">${team ? 'SP' : esc(core().initials(who))}</span>
      <div class="ajv2-msg-b">
        <div class="ajv2-msg-h"><b>${esc(who)}</b><time datetime="${esc(message.created_at)}">${esc(quando(message.created_at))}</time></div>
        <p>${esc(message.body)}</p>
        ${line || files ? `<div class="ajv2-msg-x">${line ? `<span class="ajv2-ctx">${ic('monitor', 13)}${esc(line)}</span>` : ''}${files}</div>` : ''}
      </div>
    </article>`;
}

function replyHtml(ticket) {
  const answered = ticket.status === 'resolved' && ticket.customer_confirmed_at;
  return `<div class="ajv2-resp">
      <label for="ajv2-resposta">${answered ? 'Voltar a escrever' : 'Responder'}</label>
      <textarea class="form-control" id="ajv2-resposta" rows="3" maxlength="5000" placeholder="Escreva a sua resposta…" ${AppActions.attrs('input', 'ajuda-rascunho')}>${esc(drafts.get(String(ticket.id)) || '')}</textarea>
      ${answered ? '<small class="ajv2-nota">Se responder, o pedido volta a ficar aberto.</small>' : ''}
      <div class="ajv2-chips" id="ajv2-resp-ficheiros">${fileChipsHtml(replyFiles, 'resposta')}</div>
      <div class="ajv2-resp-b">
        <label class="ajv2-anexar">${ic('paperclip', 16)}<span>Anexar ficheiro <small>(até 10 MB)</small></span>
          <input type="file" class="ajv2-sr" id="ajv2-resp-input" multiple accept="${FILE_ACCEPT}" ${AppActions.attrs('change', 'ajuda-resp-ficheiros')}></label>
        <button type="button" class="btn btn-primary" id="ajv2-enviar" ${AppActions.attrs('click', 'ajuda-responder')}${sending ? ' disabled' : ''}>${ic('send', 16)} Enviar resposta</button>
      </div>
    </div>`;
}

function renderDetail() {
  drawDetail();
  if (window.lucide) lucide.createIcons();
}
function drawDetail() {
  const box = document.getElementById('ajv2-conversa');
  if (!box) return;
  if (selectedId === null) {
    box.innerHTML = tickets.length ? `<p class="v2-empty">${ic('messages-square', 16)} Escolha um pedido para ver a conversa.</p>` : '';
    return;
  }
  const back = `<button type="button" class="ajv2-voltar" ${AppActions.attrs('click', 'ajuda-voltar')}>${ic('chevron-left', 18)} Os meus pedidos</button>`;
  if (detailState === 'loading') { box.innerHTML = `${back}<p class="v2-empty">${ic('loader', 16)} A carregar a conversa…</p>`; return; }
  if (detailState === 'error' || !detail?.ticket) {
    box.innerHTML = `${back}<p class="v2-empty">${ic('triangle-alert', 16)} Não foi possível abrir este pedido. <button type="button" class="v2-link" ${AppActions.attrs('click', 'ajuda-abrir', [selectedId])}>Tentar de novo</button></p>`;
    return;
  }
  const { ticket, messages = [], context } = detail;
  const [typeLabel] = TYPES[ticket.type] || TYPES.question;
  const [statusLabel, tone] = STATUS[ticket.status] || STATUS.open;
  const resolved = ticket.status === 'resolved';
  const asking = resolved && !ticket.customer_confirmed_at;
  const feedbackText = ticket.type === 'problem' ? 'Isto resolveu o problema?' : 'Isto responde ao seu pedido?';
  box.innerHTML = `${back}
    <header class="ajv2-cab">
      <div class="ajv2-cab-t">
        <small>${esc(number(ticket.number))} · ${typeLabel}</small>
        <h3>${esc(ticket.subject)}</h3>
        <span>${esc(criadoEm(ticket.created_at))}${ticket.author?.name ? ` por ${esc(ticket.author.name)}` : ''} · Visível para os gestores</span>
      </div>
      <span class="v2-chip ${tone}">${statusLabel}</span>
    </header>
    ${ticket.status === 'needs_customer' ? '<div class="ajv2-precisa" role="status">A equipa precisa de uma resposta sua para continuar.</div>' : ''}
    <div class="ajv2-msgs">${messages.map((message, index) => messageHtml(message, index, context)).join('')}</div>
    ${asking ? `<div class="ajv2-resolveu" role="group" aria-label="${feedbackText}"><span>${feedbackText}</span>
        <button type="button" class="ajv2-sim" ${AppActions.attrs('click', 'ajuda-feedback', [true])}>Sim, obrigado</button>
        <button type="button" class="ajv2-nao" ${AppActions.attrs('click', 'ajuda-feedback', [false])}>Ainda não</button></div>` : ''}
    ${asking ? '' : replyHtml(ticket)}`;
}

function renderAll() {
  renderAvisos();
  renderList();
  renderDetail();
}

// Pedido a abrir vindo de /ajuda?pedido=<id> (email e push ao cliente). O
// endereço limpa-se logo, para recarregar a página não o reabrir.
let pendingTicket = null;
function requestTicket(id) { pendingTicket = id ? String(id) : null; }
function takeTicketFromUrl() {
  let id = pendingTicket;
  pendingTicket = null;
  try {
    const url = new URL(window.location.href);
    const param = url.searchParams.get('pedido');
    if (param !== null && url.pathname.replace(/\/+$/, '') === '/ajuda') {
      id = id || param;
      history.replaceState(history.state, '', '/ajuda');
    }
  } catch { /* sem endereço utilizável */ }
  return id && /^[\w-]{1,64}$/.test(id) ? id : null;
}

async function openPage() {
  const wanted = takeTicketFromUrl();
  shell();
  // Cada vez que se abre a página volta à lista (no telemóvel) e atualiza.
  if (!wide()) { selectedId = null; detail = null; detailState = 'idle'; }
  renderAll();
  renderAvisos();
  const wasSelected = selectedId;
  await Promise.all([loadList(), loadSummary()]);
  if (wanted) openTicket(wanted);
  else if (wasSelected !== null) openTicket(wasSelected, { quiet: true });
  else if (wide() && tickets.length) openTicket(tickets[0].id);
}

// ── Ações ──
async function send() {
  if (sending || !detail?.ticket) return;
  const area = document.getElementById('ajv2-resposta');
  const body = area?.value.trim();
  if (!body) { core().toast('Escreva a sua resposta antes de enviar.', 'info'); area?.focus(); return; }
  const id = String(detail.ticket.id);
  const button = document.getElementById('ajv2-enviar');
  sending = true;
  if (button) button.disabled = true;
  try {
    const attachments = replyFiles.length ? await readAttachments(replyFiles) : undefined;
    await core().apiPost(`/api/support/tickets/${encodeURIComponent(id)}/messages`, { body, ...(attachments ? { attachments } : {}) }, { timeoutMs: 120000 });
    drafts.delete(id);
    replyFiles = [];
    core().toast('Resposta enviada.', 'success');
    await Promise.all([openTicket(id, { quiet: true }), loadList(), loadSummary()]);
  } catch (error) {
    core().toast(errorText(error, 'Não foi possível enviar a resposta. Tente de novo.'), 'error');
  } finally {
    sending = false;
    const again = document.getElementById('ajv2-enviar');
    if (again) again.disabled = false;
  }
}

async function feedback(resolved) {
  if (!detail?.ticket) return;
  const id = String(detail.ticket.id);
  try {
    await core().apiPost(`/api/support/tickets/${encodeURIComponent(id)}/feedback`, { resolved });
    core().toast(resolved ? 'Obrigado pelo aviso.' : 'Pedido reaberto. A equipa vai voltar a vê-lo.', 'success');
    await Promise.all([openTicket(id, { quiet: true }), loadList(), loadSummary()]);
  } catch (error) {
    core().toast(errorText(error, 'Não foi possível registar a resposta. Tente de novo.'), 'error');
  }
}

AppActions.register({
  'ajuda-abrir': (el, event, args) => openTicket(args[0]),
  'ajuda-voltar': () => {
    selectedId = null;
    detailSeq++;
    renderList();
    renderDetail();
  },
  'ajuda-filtro': (el, event, args) => { filter = args[0]; renderList(); },
  'ajuda-recarregar': () => { listState = 'loading'; renderList(); return loadList(); },
  'ajuda-responder': () => send(),
  'ajuda-feedback': (el, event, args) => feedback(args[0] === true),
  'ajuda-resp-remover': (el, event, args) => {
    replyFiles.splice(Number(args[0]), 1);
    const box = document.getElementById('ajv2-resp-ficheiros');
    if (box) box.innerHTML = fileChipsHtml(replyFiles, 'resposta');
    if (window.lucide) lucide.createIcons();
  },
}, 'click');

AppActions.register({
  'ajuda-resp-ficheiros': el => {
    const problems = addFiles(replyFiles, el.files);
    el.value = '';
    if (problems.length) core().toast(problems.join(' '), 'error', 6000);
    const box = document.getElementById('ajv2-resp-ficheiros');
    if (box) box.innerHTML = fileChipsHtml(replyFiles, 'resposta');
    if (window.lucide) lucide.createIcons();
  },
}, 'change');

AppActions.register({
  'ajuda-rascunho': el => { if (detail?.ticket) drafts.set(String(detail.ticket.id), el.value); },
}, 'input');

AppModules.onReset('features/ajuda/pagina.js', () => {
  tickets = []; counts = { all: 0, open: 0, in_review: 0, resolved: 0 }; summary = null; filter = 'all';
  selectedId = null; detail = null; listState = 'loading'; detailState = 'idle'; detailSeq++;
  drafts = new Map(); replyFiles = []; sending = false;
  const el = root();
  if (el) { el.innerHTML = ''; delete el.dataset.ready; }
});

})();
