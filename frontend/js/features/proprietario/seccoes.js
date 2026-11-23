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


// ── No teu site (reservas dentro do site do cliente; API em /api/embed) ──
const site = { data: null, origins: [], style: null };
const SITE_STEPS = [
  'No WordPress, crie uma <strong>Página nova</strong> (por exemplo «Reservas»).',
  'Acrescente o bloco <strong>HTML personalizado</strong> (no Elementor, o widget <strong>HTML</strong>).',
  'Cole o código do alojamento que quer mostrar.',
  'Publique a página e abra-a no site para confirmar (o editor pode não mostrar o formulário).',
  'Ligue o botão «Reservar» do menu do site a essa página.',
];
const bookingLink = slug => `${location.origin}/reservar/${encodeURIComponent(slug)}`;

// Mesmas regras do servidor (services/bookingEmbed.js normalizeOrigin).
function normalizeSiteOrigin(raw) {
  let value = String(raw ?? '').trim();
  if (!value) throw new Error('Indique o endereço do site.');
  if (value.length > 200) throw new Error('Endereço do site demasiado longo.');
  if (value.includes('*')) throw new Error('Não são aceites curingas (*): indique cada site com o endereço completo, por exemplo https://www.exemplo.pt.');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = `https://${value}`;
  let url;
  try { url = new URL(value); } catch { throw new Error(`Endereço inválido: ${String(raw).trim()}`); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) throw new Error('O site tem de usar https:// (http:// só para testes em localhost).');
  if (url.username || url.password) throw new Error('O endereço do site não pode ter utilizador nem palavra-passe.');
  if ((url.pathname && url.pathname !== '/') || url.search || url.hash) throw new Error('Indique só o endereço do site, sem páginas nem parâmetros (por exemplo https://www.exemplo.pt).');
  if (!local && !url.hostname.includes('.')) throw new Error(`Endereço inválido: ${String(raw).trim()}`);
  return url.origin;
}

async function copyText(text, button) {
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(area);
    area.select();
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    area.remove();
  }
  if (!ok) { core().toast('❌ Não foi possível copiar. Selecione o texto e copie à mão.', 'error'); return; }
  core().toast('Copiado.', 'success');
  if (button) {
    const label = button.querySelector('span');
    if (label) { label.textContent = 'Copiado'; setTimeout(() => { label.textContent = 'Copiar'; }, 2000); }
  }
}

const copyBtn = (text, what) => `<button type="button" class="btn btn-ghost btn-sm" data-copy="${u().esc(text)}" aria-label="Copiar ${u().esc(what)}" ${AppActions.attrs('click', 'prop-site-copy', [])}>${u().ic('copy', 14)} <span>Copiar</span></button>`;

function linkRows(accs) {
  const { esc } = u();
  if (!accs.length) return '<p class="prop-muted">Ainda não há alojamentos com página de reservas.</p>';
  return accs.map(a => {
    const link = bookingLink(a.slug);
    return `<div class="prop-site-link"><div class="prop-row-main"><b>${esc(a.name)}</b><small>${esc(link)}</small></div>${copyBtn(link, `o link de ${a.name}`)}</div>`;
  }).join('');
}

// ── Aspeto da página incorporada (só no site do cliente) ──
// Cada opção tem «Automático (do site)»: o carregador (/embed.js) lê o estilo
// do site e o servidor usa-o nos campos que estiverem em automático.
const FONT_LABEL = { auto: 'Automático (do site)', platform: 'A da plataforma (Inter e Playfair Display)' };
const DEFAULT_LOOK = { theme: 'auto', font: 'auto', corners: 'auto', accent: 'auto', uppercaseLabels: 'auto', startAtDates: false };
const HEX6 = /^#[0-9a-f]{6}$/i;

function lookOf() {
  return { ...DEFAULT_LOOK, ...(site.style || site.data?.style || {}) };
}

// O que a página vai mostrar: o escolhido, senão o detetado, senão o da plataforma.
function effectiveLook() {
  const s = lookOf();
  const seen = site.data?.detected?.values || {};
  const theme = s.theme !== 'auto' ? s.theme : seen.theme || 'light';
  const lum = hex => { const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const bgFits = HEX6.test(seen.bg || '') && (theme === 'dark' ? lum(seen.bg) < 0.2 : lum(seen.bg) > 0.6);
  const family = s.font !== 'auto' ? (s.font === 'platform' ? '' : s.font) : seen.font?.family || '';
  const generic = s.font !== 'auto' ? '' : (!seen.font?.family && seen.font?.generic) || '';
  return {
    theme,
    bg: bgFits ? seen.bg : theme === 'dark' ? '#151719' : '#fffdf9',
    accent: s.accent !== 'auto' && HEX6.test(s.accent) ? s.accent : HEX6.test(seen.accent || '') ? seen.accent : site.data?.default_accent || '#843424',
    family, generic,
    square: s.corners !== 'auto' ? s.corners === 'square' : Number.isInteger(seen.radius) ? seen.radius <= 1 : false,
    upper: s.uppercaseLabels !== 'auto' ? s.uppercaseLabels === true : seen.uppercase === true,
  };
}

function detectedText() {
  const d = site.data?.detected;
  if (!d?.values) return '';
  const v = d.values;
  const parts = [];
  if (v.theme) parts.push(v.theme === 'dark' ? 'fundo escuro' : 'fundo claro');
  if (v.font) parts.push(`letra ${v.font.family || (v.font.generic === 'serif' ? 'com serifa' : 'sem serifa')}`);
  if (v.accent) parts.push(`cor ${v.accent.toUpperCase()}`);
  if (Number.isInteger(v.radius)) parts.push(v.radius <= 1 ? 'cantos retos' : 'cantos arredondados');
  if (v.uppercase !== undefined) parts.push(v.uppercase ? 'maiúsculas' : 'sem maiúsculas');
  return parts.length ? `${parts.join(' · ')} (${d.origin})` : '';
}

function seg(field, options, value) {
  const { esc } = u();
  return `<div class="prop-seg" role="group">${options.map(([v, label]) => `<button type="button" class="prop-seg-btn" aria-pressed="${String(v) === String(value)}" ${AppActions.attrs('click', 'prop-aspeto-set', [field, String(v)])}>${esc(label)}</button>`).join('')}</div>`;
}

function aspetoCard() {
  const { esc } = u();
  const s = lookOf();
  const fonts = ['auto', 'platform', ...(site.data.style_options?.fonts || [])];
  const accent = HEX6.test(s.accent) ? s.accent : effectiveLook().accent;
  const seen = detectedText();
  return `<section class="card prop-card prop-aspeto" data-prop-aspeto>
      <h3>Aspeto</h3>
      <p class="prop-muted">Muda só a página dentro do seu site, não a página normal de reservas. Em «Automático», copia o estilo do site onde o código está colado.</p>
      <div class="prop-aspeto-grid">
        <div class="prop-aspeto-form">
          <div class="prop-aspeto-row"><span class="form-label">Tema</span>${seg('theme', [['auto', 'Automático (do site)'], ['light', 'Claro'], ['dark', 'Escuro']], s.theme)}</div>
          <label class="form-group prop-field prop-aspeto-row"><span class="form-label">Letra</span>
            <select class="form-control" name="aspeto-font" ${AppActions.attrs('change', 'prop-aspeto-font', [])}>${fonts.map(f => `<option value="${esc(f)}" ${f === s.font ? 'selected' : ''}>${esc(FONT_LABEL[f] || f)}</option>`).join('')}</select></label>
          <div class="prop-aspeto-row"><span class="form-label">Cantos</span>${seg('corners', [['auto', 'Automático (do site)'], ['rounded', 'Arredondados'], ['square', 'Retos']], s.corners)}</div>
          <div class="prop-aspeto-row"><span class="form-label">Cor de destaque</span>
            ${seg('accent', [['auto', 'Automático (do site)'], ['custom', 'Escolher']], s.accent === 'auto' ? 'auto' : 'custom')}
            <div class="prop-color-row prop-aspeto-color" ${s.accent === 'auto' ? 'hidden' : ''}>
              <input type="color" value="${esc(accent)}" aria-label="Cor de destaque" data-aspeto-color ${AppActions.attrs('input', 'prop-aspeto-accent', [])}>
              <input class="form-control prop-aspeto-hex" value="${esc(accent.toUpperCase())}" maxlength="7" spellcheck="false" autocomplete="off" aria-label="Cor de destaque em hexadecimal" data-aspeto-hex ${AppActions.attrs('input', 'prop-aspeto-accent', [])}>
            </div>
            <small class="prop-hint">Use a cor dos botões do seu site. Sem escolha, a cor principal da conta.</small></div>
          <div class="prop-aspeto-row"><span class="form-label">Etiquetas e botões em maiúsculas espaçadas</span>${seg('uppercaseLabels', [['auto', 'Automático (do site)'], ['true', 'Sim'], ['false', 'Não']], s.uppercaseLabels)}</div>
          <label class="prop-check"><input type="checkbox" ${s.startAtDates ? 'checked' : ''} ${AppActions.attrs('change', 'prop-aspeto-start', [])}> Começar logo nas datas (sem a fotografia de topo)</label>
          <p class="prop-error" role="alert" data-aspeto-error hidden></p>
          <div class="prop-actions prop-start"><button type="button" class="btn btn-primary" ${AppActions.attrs('click', 'prop-aspeto-save', [])}>${u().ic('save', 15)} Guardar aspeto</button></div>
        </div>
        <div class="prop-aspeto-side">
          <span class="prop-aspeto-kicker">Pré-visualização</span>
          <div class="prop-aspeto-preview" data-aspeto-preview aria-hidden="true">
            <div class="pv-h">Quando quer vir?</div>
            <div class="pv-dates"><div><span class="pv-l">Entrada</span>25 nov</div><div><span class="pv-l">Saída</span>28 nov</div></div>
            <div class="pv-room"><span>Casa inteira</span><span>1 650 €</span></div>
            <div class="pv-btn">Continuar</div>
          </div>
          <p class="prop-hint" data-aspeto-seen>${seen ? `Detetado no seu site: ${esc(seen)}` : 'Ainda não foi detetado o estilo do seu site: aparece aqui depois de alguém abrir a página com o código colado.'}</p>
        </div>
      </div>
    </section>`;
}

// Carrega a letra da lista no Google Fonts para a pré-visualização.
function loadPreviewFont(name) {
  if (!name || !(site.data.style_options?.fonts || []).concat(site.data?.detected?.values?.font?.family || []).includes(name)) return;
  const id = `prop-aspeto-font-${name.replace(/[^a-z0-9]/gi, '-')}`;
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(/%20/g, '+')}&display=swap`;
  document.head.append(link);
}

function paintPreview(panel) {
  const box = panel.querySelector('[data-aspeto-preview]');
  if (!box) return;
  const look = effectiveLook();
  loadPreviewFont(look.family);
  const dark = look.theme === 'dark';
  const ink = dark ? '#ffffff' : '#23313b';
  const muted = dark ? 'rgba(255,255,255,.66)' : '#6f665d';
  const line = dark ? 'rgba(255,255,255,.22)' : '#e4d9c9';
  const font = look.family ? `'${look.family}', ${look.generic === 'serif' ? 'Georgia, serif' : 'system-ui, sans-serif'}`
    : look.generic === 'serif' ? 'Georgia, serif' : look.generic ? 'system-ui, sans-serif' : 'Inter, system-ui, sans-serif';
  const radius = look.square ? '0' : '10px';
  const rgb = [1, 3, 5].map(i => parseInt(look.accent.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const onAccent = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) > 0.18 ? '#111111' : '#ffffff';
  Object.assign(box.style, { background: look.bg, color: ink, fontFamily: font, borderColor: line });
  const heading = box.querySelector('.pv-h');
  heading.style.fontFamily = look.family || look.generic ? font : '"Playfair Display", Georgia, serif';
  heading.style.fontWeight = look.family || look.generic ? '400' : '700';
  box.querySelectorAll('.pv-l').forEach(el => Object.assign(el.style, { color: muted, textTransform: look.upper ? 'uppercase' : 'none', letterSpacing: look.upper ? '.12em' : '0' }));
  Object.assign(box.querySelector('.pv-dates').style, { borderColor: line, borderRadius: radius });
  box.querySelector('.pv-dates > div').style.borderColor = line;
  Object.assign(box.querySelector('.pv-room').style, { borderColor: look.accent, borderRadius: radius });
  Object.assign(box.querySelector('.pv-btn').style, { background: look.accent, color: onAccent, borderRadius: radius,
    textTransform: look.upper ? 'uppercase' : 'none', letterSpacing: look.upper ? '.08em' : '0' });
}

function setLook(panel, patch, redraw = true) {
  site.style = { ...lookOf(), ...patch };
  if (redraw) {
    const card = panel.querySelector('[data-prop-aspeto]');
    if (card) {
      card.outerHTML = aspetoCard();
      if (window.lucide) lucide.createIcons();
    }
  }
  paintPreview(panel);
}

async function saveLook(el) {
  const panel = el.closest('[data-prop-panel]');
  const error = panel.querySelector('[data-aspeto-error]');
  error.hidden = true;
  const look = lookOf();
  if (look.accent !== 'auto' && !HEX6.test(look.accent)) {
    error.textContent = 'A cor de destaque tem de estar no formato #RRGGBB.';
    error.hidden = false;
    return;
  }
  AppUI.setButtonLoading(el, true, 'A guardar…');
  try {
    site.data = (await core().apiPut('/api/embed/settings', { style: look })).data;
    site.style = { ...site.data.style };
    drawSite(panel);
    paintPreview(panel);
    if (window.lucide) lucide.createIcons();
    core().toast('✅ Aspeto guardado.', 'success');
  } catch (e) {
    AppUI.setButtonLoading(el, false);
    error.textContent = u().errText(e, 'Não foi possível guardar.');
    error.hidden = false;
  }
}

function drawSite(panel) {
  const { esc, ic, head, notice } = u();
  const d = site.data;
  const accs = d.accommodations || [];
  if (!d.available) {
    panel.innerHTML = `${head('No teu site', 'Mostre as reservas dentro do seu site (WordPress, Elementor e outros).')}
      <section class="card prop-card">
        <span class="prop-chip is-accent">${esc(d.plan || 'O seu plano')}</span>
        <h3 class="prop-site-title">Disponível no plano Premium</h3>
        <p>Mostrar o formulário de reservas dentro do seu site está incluído no plano Premium. O plano atual não o inclui.</p>
        <div class="prop-actions prop-start"><button type="button" class="btn btn-primary" ${AppActions.attrs('click', 'prop-site-plan', [])}>${ic('receipt-text', 15)} Ver Plano e faturação</button></div>
      </section>
      <section class="card prop-card">
        <h3>${ic('link', 16)} Link direto de reservas</h3>
        <p class="prop-muted">Funciona em todos os planos: ponha este link num botão ou numa mensagem e o hóspede reserva na nossa página.</p>
        ${linkRows(accs)}
      </section>`;
    return;
  }
  const full = site.origins.length >= d.max_origins;
  const chips = site.origins.length
    ? site.origins.map((o, i) => `<span class="prop-origin"><code>${esc(o)}</code><button type="button" aria-label="Remover ${esc(o)}" ${AppActions.attrs('click', 'prop-site-remove', [String(i)])}>${ic('x', 14)}</button></span>`).join('')
    : '<span class="prop-muted">Nenhum site autorizado.</span>';
  const snippets = accs.length ? accs.map(a => `<div class="prop-snip">
      <div class="prop-snip-head"><b>${esc(a.name)}</b>${copyBtn(a.snippet.script, `o código de ${a.name}`)}</div>
      <pre class="prop-code" tabindex="0"><code>${esc(a.snippet.script)}</code></pre>
      <details class="prop-fallback"><summary>Se o site não aceitar scripts</summary>
        <p class="prop-muted">Use esta versão simples (iframe). A altura é fixa e pode aparecer uma barra de deslocamento.</p>
        <pre class="prop-code" tabindex="0"><code>${esc(a.snippet.iframe)}</code></pre>
        <div class="prop-actions prop-start">${copyBtn(a.snippet.iframe, `o iframe de ${a.name}`)}</div>
      </details>
    </div>`).join('') : '<p class="prop-muted">Ainda não há alojamentos com página de reservas.</p>';
  panel.innerHTML = `${head('No teu site', 'Mostre o formulário de reservas dentro do seu site (WordPress, Elementor e outros).')}
    <section class="card prop-card">
      <h3>Domínios autorizados</h3>
      <p class="prop-muted">Só os sites desta lista podem mostrar as reservas. Inclua as duas formas, com e sem www.</p>
      <div class="prop-origins" aria-live="polite">${chips}</div>
      <form class="prop-origin-form" id="prop-origin-form" novalidate>
        <label class="form-group prop-field"><span class="form-label">Acrescentar site</span>
          <input class="form-control" name="origin" placeholder="www.oseusite.pt" autocomplete="off" inputmode="url" maxlength="200" ${full ? 'disabled' : ''}></label>
        <button type="submit" class="btn btn-ghost" ${full ? 'disabled' : ''}>${ic('plus', 15)} Acrescentar</button>
      </form>
      ${full ? `<p class="prop-hint">Máximo de ${d.max_origins} sites.</p>` : ''}
      <p class="prop-error" role="alert" hidden></p>
      <div class="prop-actions"><button type="button" class="btn btn-primary" ${AppActions.attrs('click', 'prop-site-save', [])}>${ic('save', 15)} Guardar</button></div>
    </section>
    ${aspetoCard()}
    <section class="card prop-card">
      <h3>${ic('code-xml', 16)} Código para colar</h3>
      <p class="prop-muted">Um por alojamento. Cole-o num bloco que aceite HTML.</p>
      ${snippets}
    </section>
    <section class="card prop-card">
      <h3>${ic('link', 16)} Também pode usar só o link</h3>
      <p class="prop-muted">Sem nada para instalar: ponha este link num botão ou numa mensagem.</p>
      ${linkRows(accs)}
    </section>
    <section class="card prop-card">
      <h3>${ic('list-checks', 16)} Passo a passo no WordPress</h3>
      <ol class="prop-steps">${SITE_STEPS.map(s => `<li>${s}</li>`).join('')}</ol>
      <div class="prop-site-notes">${notice('info', 'Escolha um modelo de página sem barra lateral (por exemplo «Largura total» ou «Elementor — tela inteira») e apague os blocos de exemplo do tema (pesquisa, comentários recentes, arquivo), para o formulário ocupar a largura toda.', 'info')}
        ${notice('info', 'O pagamento abre numa página nossa, num separador novo.', 'info')}
        ${notice('info', 'O conteúdo das reservas não conta para o SEO do seu site (o Google lê-o como parte da nossa página).', 'info')}</div>
    </section>`;
}

P().defineSection('site', async panel => {
  site.data = (await core().apiGet('/api/embed/settings')).data;
  site.origins = [...(site.data.origins || [])];
  site.style = site.data.style ? { ...site.data.style } : null;
  drawSite(panel);
  paintPreview(panel);
});

function addOrigin(form) {
  const panel = form.closest('[data-prop-panel]');
  const error = panel.querySelector('.prop-error');
  error.hidden = true;
  if (!form.origin.value.trim()) return;
  try {
    const origin = normalizeSiteOrigin(form.origin.value);
    if (!site.origins.includes(origin)) site.origins.push(origin);
    if (site.origins.length > site.data.max_origins) { site.origins.pop(); throw new Error(`No máximo ${site.data.max_origins} sites autorizados.`); }
    drawSite(panel);
    paintPreview(panel);
    if (window.lucide) lucide.createIcons();
    panel.querySelector('[name="origin"]')?.focus();
  } catch (e) {
    error.textContent = e.message;
    error.hidden = false;
  }
}

async function saveOrigins(el) {
  const panel = el.closest('[data-prop-panel]');
  const error = panel.querySelector('.prop-error');
  error.hidden = true;
  const pending = panel.querySelector('[name="origin"]');
  if (pending?.value.trim()) addOrigin(pending.form);
  if (!error.hidden) return;
  AppUI.setButtonLoading(el, true, 'A guardar…');
  try {
    site.data = (await core().apiPut('/api/embed/settings', { origins: site.origins })).data;
    site.origins = [...site.data.origins];
    drawSite(panel);
    paintPreview(panel);
    if (window.lucide) lucide.createIcons();
    core().toast('✅ Sites autorizados guardados.', 'success');
  } catch (e) {
    AppUI.setButtonLoading(el, false);
    error.textContent = u().errText(e, 'Não foi possível guardar.');
    error.hidden = false;
  }
}

document.addEventListener('submit', event => {
  const form = event.target.closest?.('#prop-origin-form');
  if (form) { event.preventDefault(); addOrigin(form); }
});

AppActions.register({
  'prop-site-copy': el => copyText(el.dataset.copy || '', el),
  'prop-site-remove': (el, event, args) => {
    const panel = el.closest('[data-prop-panel]');
    site.origins.splice(Number(args[0]), 1);
    drawSite(panel);
    paintPreview(panel);
    if (window.lucide) lucide.createIcons();
  },
  'prop-site-save': el => saveOrigins(el),
  'prop-site-plan': () => P().showSection('plano'),
  'prop-aspeto-set': (el, event, args) => {
    const panel = el.closest('[data-prop-panel]');
    const [field, value] = args;
    if (field === 'accent') {
      const current = lookOf().accent;
      setLook(panel, { accent: value === 'auto' ? 'auto' : HEX6.test(current) ? current : effectiveLook().accent });
    } else if (field === 'uppercaseLabels') {
      setLook(panel, { uppercaseLabels: value === 'auto' ? 'auto' : value === 'true' });
    } else if (['theme', 'corners'].includes(field)) {
      setLook(panel, { [field]: value });
    }
  },
  'prop-aspeto-save': el => saveLook(el),
}, 'click');

AppActions.register({
  'prop-aspeto-font': el => setLook(el.closest('[data-prop-panel]'), { font: el.value }, false),
  'prop-aspeto-start': el => setLook(el.closest('[data-prop-panel]'), { startAtDates: el.checked }, false),
}, 'change');

AppActions.register({
  // Seletor de cor e campo #RRGGBB acertam-se um ao outro.
  'prop-aspeto-accent': el => {
    const panel = el.closest('[data-prop-panel]');
    let value = el.value.trim();
    if (el.matches('[data-aspeto-hex]') && /^[0-9a-f]{6}$/i.test(value)) value = `#${value}`;
    const valid = HEX6.test(value);
    el.classList.toggle('is-invalid', !valid);
    if (el.matches('[data-aspeto-hex]')) {
      if (valid) panel.querySelector('[data-aspeto-color]').value = value.toLowerCase();
    } else {
      const hex = panel.querySelector('[data-aspeto-hex]');
      hex.value = value.toUpperCase();
      hex.classList.remove('is-invalid');
    }
    setLook(panel, { accent: valid ? value.toLowerCase() : value }, false);
  },
}, 'input');

})();
