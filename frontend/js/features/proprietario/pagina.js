// Área do proprietário (/proprietario): só o proprietário da organização.
// Coluna de secções à esquerda no computador; no telemóvel a lista é a página
// inicial e cada secção abre no ecrã inteiro (as mesmas peças das Definições:
// .settings-shell, .settings-nav, .settings-tab, .settings-back). Este ficheiro
// tem a moldura, o Resumo, a Empresa e a Marca; seccoes.js tem Equipa, Plano, No teu site e
// Dados; gestao.js tem o Registo de atividade e a Propriedade e encerramento.
// Quem não é proprietário vê «Só o proprietário» (e, se houver, o pedido de
// transferência de propriedade que lhe foi feito). API em /api/owner.
(() => {
AppModules.define('proprietario', {
  render: { get: () => render },
  showSection: { get: () => showSection },
  defineSection: { get: () => defineSection },
  ui: { get: () => ui },
});

const core = () => AppModules.core;
const esc = value => core().escapeHtml(value ?? '');
const ic = (name, size = 16) => core().lcIcon(name, size);
const errText = (error, fallback) => error?.payload?.error || error?.message || fallback;

// [id, rótulo, descrição, ícone, grupo]
const SECTIONS = [
  ['resumo', 'Resumo', 'Plano, uso e o que falta', 'layout-dashboard', 'Organização'],
  ['empresa', 'Empresa', 'Nome, NIF e contactos', 'building-2', 'Organização'],
  ['marca', 'Marca', 'Logótipo e cor', 'palette', 'Organização'],
  ['site', 'No teu site', 'Reservas no WordPress', 'globe', 'Organização'],
  ['equipa', 'Equipa e permissões', 'Membros, papéis e convites', 'users-round', 'Gestão'],
  ['plano', 'Plano e faturação', 'Plano atual e faturas', 'receipt-text', 'Gestão'],
  ['dados', 'Dados e segurança', 'Cópias de segurança', 'database', 'Segurança'],
  ['registo', 'Registo de atividade', 'Quem fez o quê', 'history', 'Segurança'],
  ['propriedade', 'Propriedade e encerramento', 'Transferir ou encerrar', 'key-round', 'Segurança'],
];
const IDS = SECTIONS.map(s => s[0]);
const renderers = {};
let current = 'resumo';
let sectionOpen = false; // telemóvel: secção aberta em vez da lista
let renderSeq = 0;

const root = () => document.getElementById('prop-root');
const isOwner = () => core().currentUser?.role === 'owner';
const narrow = () => window.matchMedia('(max-width: 767px)').matches;

function defineSection(id, fn) { renderers[id] = fn; }

// ── Ajudas partilhadas com seccoes.js e gestao.js ──
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function dateShort(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : '';
}
// «hoje 10:14», «ontem 18:02», «20 nov» (o ano só se for outro).
function when(iso) {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const now = new Date();
  const day = d => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const time = then.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
  if (day(then) === day(now)) return `hoje ${time}`;
  if (day(then) === day(yesterday)) return `ontem ${time}`;
  return `${then.getDate()} ${MONTHS[then.getMonth()]}${then.getFullYear() === now.getFullYear() ? '' : ` ${then.getFullYear()}`}`;
}
// «há 12 dias», «hoje», «ontem».
function ago(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const days = Math.floor((Date.now() - t) / 86400000);
  if (days <= 0) return 'hoje';
  if (days === 1) return 'ontem';
  if (days < 60) return `há ${days} dias`;
  return `há ${Math.round(days / 30)} meses`;
}
const euros = cents => (Number.isInteger(cents) ? window.ReservationMoney.format(cents / 100) : '');
const ROLE_LABEL = { owner: 'Proprietário', manager: 'Gestor', staff: 'Funcionário' };

function head(title, text = '', extra = '') {
  return `<div class="prop-head"><div><h2>${esc(title)}</h2>${text ? `<p>${text}</p>` : ''}</div>${extra}</div>`;
}
function notice(tone, html, icon = 'info') {
  return `<div class="prop-notice is-${tone}">${ic(icon, 16)}<span>${html}</span></div>`;
}
const loading = () => '<div class="prop-loading" role="status">A carregar…</div>';
const failed = text => notice('bad', esc(text), 'circle-alert');
// O número do pedido de suporte abre a conversa em «Ajuda e feedback».
const ticketLink = ticket => ticket ? `<a href="/ajuda?pedido=${encodeURIComponent(ticket.id)}" ${AppActions.attrs('click', 'prop-ticket', [ticket.id])}>${esc(ticket.number)}</a>` : '';

const ui = Object.freeze({ esc, ic, errText, when, ago, dateShort, euros, head, notice, loading, failed, ticketLink, ROLE_LABEL, refresh: () => renderSection(current), go: id => showSection(id) });

// ── Moldura ──
function navHtml() {
  const groups = [];
  for (const [id, label, hint, icon, group] of SECTIONS) {
    let g = groups.find(x => x.name === group);
    if (!g) groups.push(g = { name: group, items: [] });
    g.items.push(`<button type="button" class="settings-tab${id === 'propriedade' ? ' prop-tab-danger' : ''}" data-prop-tab="${id}" ${AppActions.attrs('click', 'prop-tab', [id])}>
        ${ic(icon, 18)}
        <span class="settings-tab-text"><strong>${esc(label)}</strong><small>${esc(hint)}</small></span>
        <i data-lucide="chevron-right" class="settings-tab-chevron"></i>
      </button>`);
  }
  const org = core().currentUser?.organization_name || '';
  return `<nav class="settings-nav prop-nav" aria-label="Secções da Área do proprietário">
      <div class="prop-nav-head"><strong>Área do proprietário</strong><small>${esc(org)}</small></div>
      ${groups.map(g => `<div class="settings-nav-group"><span class="settings-nav-title">${esc(g.name)}</span>${g.items.join('')}</div>`).join('')}
    </nav>
    <button type="button" class="settings-back" ${AppActions.attrs('click', 'prop-index', [])}>${ic('chevron-left', 18)} Área do proprietário</button>
    ${IDS.map(id => `<div class="settings-panel prop-panel" id="prop-panel-${id}" data-prop-panel="${id}"></div>`).join('')}`;
}

function applyTab() {
  const el = root();
  if (!el) return;
  el.querySelectorAll('[data-prop-tab]').forEach(b => {
    const on = b.dataset.propTab === current;
    b.classList.toggle('active', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  el.querySelectorAll('[data-prop-panel]').forEach(p => p.classList.toggle('active', p.dataset.propPanel === current));
  el.classList.toggle('is-section-open', sectionOpen);
}

// Ponto de entrada (app.js → initView). `request` vem de
// AppModules.proprietario.open(section, { push, token }).
async function render(request = null) {
  const el = root();
  if (!el) return;
  const seq = ++renderSeq;
  if (!isOwner()) { renderNotOwner(el, request, seq); return; }
  el.classList.add('settings-shell');
  el.classList.remove('prop-denied');
  if (!el.querySelector('.prop-nav') || el.dataset.org !== core().currentUser?.organization_id) {
    el.innerHTML = navHtml();
    el.dataset.org = core().currentUser?.organization_id || '';
  }
  const section = IDS.includes(request?.section) ? request.section : null;
  current = section || (IDS.includes(current) ? current : 'resumo');
  sectionOpen = Boolean(section) || (!narrow() && sectionOpen);
  // Uma secção pedida (atalho, histórico) fica no histórico; a lista não.
  if (section && request?.push !== false) history.replaceState({ view: 'proprietario', propSection: section }, '', '/proprietario');
  applyTab();
  if (window.lucide) lucide.createIcons();
  await renderSection(current);
}

function showSection(id, { push = true } = {}) {
  if (!IDS.includes(id)) return;
  current = id;
  sectionOpen = true;
  applyTab();
  const state = history.state || {};
  if (push && (state.view !== 'proprietario' || state.propSection !== id)) history.pushState({ view: 'proprietario', propSection: id }, '', '/proprietario');
  if (narrow()) window.scrollTo({ top: 0, behavior: 'instant' });
  renderSection(id);
}

function openIndex() {
  if (history.state?.view === 'proprietario' && history.state.propSection) { history.back(); return; }
  sectionOpen = false;
  applyTab();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

async function renderSection(id) {
  const panel = root()?.querySelector(`[data-prop-panel="${id}"]`);
  const fn = renderers[id];
  if (!panel || !fn) return;
  if (!panel.children.length) panel.innerHTML = loading();
  try {
    await fn(panel);
  } catch (error) {
    panel.innerHTML = failed(errText(error, 'Não foi possível carregar esta secção.'));
  }
  AppUI.enhanceSelects(panel);
  AppUI.refreshDropdowns(panel);
  if (window.lucide) lucide.createIcons();
}

// ── Quem não é proprietário ──
async function renderNotOwner(el, request, seq) {
  el.classList.remove('settings-shell', 'is-section-open');
  el.classList.add('prop-denied');
  el.dataset.org = '';
  el.innerHTML = loading();
  let transfer = null;
  if (core().currentUser?.role === 'manager') {
    try { transfer = (await core().apiGet('/api/owner/incoming')).data?.transfer || null; } catch { transfer = null; }
  }
  if (seq !== renderSeq) return;
  const org = core().currentUser?.organization_name || 'esta organização';
  el.innerHTML = `<div class="card prop-only">
      <span class="prop-only-ic">${ic('lock-keyhole', 26)}</span>
      <h2>Só o proprietário</h2>
      <p>A Área do proprietário de <strong>${esc(org)}</strong> — empresa, marca, equipa, plano, cópias de segurança e registo de atividade — é só para o proprietário da organização.</p>
      <p class="prop-muted">Se precisa de alguma destas coisas, fale com o proprietário.</p>
      <button type="button" class="btn btn-ghost" ${AppActions.attrs('click', 'prop-home', [])}>${ic('arrow-left', 15)} Voltar ao início</button>
    </div>
    ${transfer ? transferOfferHtml(transfer, request?.token) : ''}`;
  if (window.lucide) lucide.createIcons();
}

function transferOfferHtml(t, token) {
  return `<div class="card prop-offer" data-transfer="${esc(t.id)}" data-token="${esc(token || '')}">
      <h3>${ic('key-round', 18)} Pedido para ser proprietário</h3>
      <p><strong>${esc(t.from.name || 'O proprietário')}</strong> pediu para lhe passar a propriedade de <strong>${esc(t.organization.name)}</strong>.
        Se aceitar, passa a gerir a empresa, a marca, a equipa, o plano e as cópias de segurança; quem lhe fez o pedido passa a gestor.</p>
      <p class="prop-muted">O pedido é válido até ${esc(dateShort(t.expires_at))}. Nada muda até aceitar.</p>
      <div class="prop-actions">
        <button type="button" class="btn btn-ghost" ${AppActions.attrs('click', 'prop-incoming', ['decline'])}>Recusar</button>
        <button type="button" class="btn btn-primary" ${AppActions.attrs('click', 'prop-incoming', ['accept'])}>${ic('check', 15)} Aceitar e passar a proprietário</button>
      </div>
    </div>`;
}

async function answerIncoming(el, choice) {
  const card = el.closest('[data-transfer]');
  if (!card) return;
  if (choice === 'accept' && !(await core().confirmar('Passa a ser o proprietário desta organização e quem lhe fez o pedido passa a gestor. Continuar?', { label: 'Aceitar' }))) return;
  card.querySelectorAll('button').forEach(b => { b.disabled = true; });
  try {
    await core().apiPost(`/api/owner/incoming/${choice === 'accept' ? 'accept' : 'decline'}`, { id: card.dataset.transfer, token: card.dataset.token || undefined });
    if (choice === 'accept') {
      core().toast('✅ Passou a ser o proprietário.', 'success');
      // O papel novo vale já no servidor; recarregar traz o menu e as permissões certos.
      setTimeout(() => location.assign('/proprietario'), 600);
    } else {
      core().toast('Pedido recusado.', 'info');
      card.remove();
      core().loadNotifications?.();
    }
  } catch (error) {
    core().toast(`❌ ${errText(error, 'Não foi possível responder ao pedido.')}`, 'error');
    card.querySelectorAll('button').forEach(b => { b.disabled = false; });
  }
}

// ── Resumo ──
function stat(label, value, extra = '') {
  return `<div class="card prop-stat"><span class="prop-stat-l">${esc(label)}</span><b>${value}</b>${extra}</div>`;
}
function bar(used, max) {
  if (max === null || max === undefined) return '<span class="prop-stat-s">Sem limite</span>';
  const pct = max > 0 ? Math.min(100, Math.round(used / max * 100)) : 100;
  return `<span class="prop-bar${pct >= 100 ? ' is-full' : pct >= 80 ? ' is-near' : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${used}"><i style="width:${pct}%"></i></span>`;
}

defineSection('resumo', async panel => {
  const { data } = await core().apiGet('/api/owner/summary');
  const plan = data.plan;
  const sub = data.subscription;
  const renew = sub?.next_date ? `Renova a ${dateShort(sub.next_date)}` : (plan ? 'Subscrição gerida pela plataforma' : 'Sem plano atribuído — sem limites');
  const usage = data.usage || {};
  const backup = data.last_backup_at;
  const todo = [...(data.todo || [])];
  // Reservas no site: disponível no plano mas ainda sem sites autorizados.
  try {
    const embed = (await core().apiGet('/api/embed/settings')).data;
    if (embed?.available && !(embed.origins || []).length && (embed.accommodations || []).length) {
      todo.push({ text: 'Autorize o seu site para mostrar as reservas nele.', section: 'site', key: 'origin', action: 'Autorizar' });
    }
  } catch { /* o Resumo não depende disto */ }
  const pending = [];
  if (data.transfer) pending.push(notice('info', `Transferência de propriedade para <strong>${esc(data.transfer.to.name)}</strong> à espera de resposta (até ${esc(dateShort(data.transfer.expires_at))}).`, 'key-round'));
  if (data.requests?.plan_change) pending.push(notice('info', `Pedido de mudança para o plano <strong>${esc(data.requests.plan_change.plan_name || '')}</strong> em análise (${ticketLink(data.requests.plan_change.ticket)}).`, 'receipt-text'));
  if (data.requests?.closure) pending.push(notice('warn', `Pedido de encerramento da conta em aberto (${ticketLink(data.requests.closure.ticket)}).`, 'triangle-alert'));
  panel.innerHTML = `${head('Resumo', 'O essencial da organização num só sítio.')}
    <section class="prop-stats">
      ${stat('Plano', esc(plan?.name || 'Sem plano'), `<span class="prop-stat-s">${esc(renew)}</span>`)}
      ${stat('Alojamentos', plan?.max_accommodations != null ? `${usage.accommodations ?? 0} de ${plan.max_accommodations}` : String(usage.accommodations ?? 0), bar(usage.accommodations ?? 0, plan?.max_accommodations))}
      ${stat('Equipa', plan?.max_members != null ? `${usage.members ?? 0} de ${plan.max_members}` : String(usage.members ?? 0), bar(usage.members ?? 0, plan?.max_members))}
      ${stat('Última cópia de segurança', backup ? esc(ago(backup)) : 'Nenhuma', `<span class="prop-stat-s${!backup || Date.now() - Date.parse(backup) > 31 * 86400000 ? ' is-warn' : ''}">${backup ? `${esc(dateShort(backup))} · recomendado: mensal` : 'Recomendado: mensal'}</span>`)}
    </section>
    ${pending.join('')}
    <section class="card prop-card prop-todo">
      <h3>Por completar</h3>
      ${todo.length ? todo.map(t => `<div class="prop-todo-row">${ic('circle-alert', 16)}<span>${esc(t.text)}</span>
          <button type="button" class="btn btn-ghost btn-sm" ${AppActions.attrs('click', 'prop-todo', [t.section, t.key])}>${esc(t.action)}</button></div>`).join('')
        : `<p class="prop-muted">${ic('circle-check', 15)} Está tudo preenchido.</p>`}
    </section>`;
});

// ── Empresa ──
const COUNTRIES = [['PT', 'Portugal'], ['ES', 'Espanha'], ['FR', 'França'], ['DE', 'Alemanha'], ['GB', 'Reino Unido'], ['IT', 'Itália'], ['NL', 'Países Baixos'], ['BE', 'Bélgica'], ['CH', 'Suíça'], ['BR', 'Brasil'], ['US', 'Estados Unidos']];

// Mesmo controlo do servidor (services/ownerArea.js): 9 algarismos, módulo 11.
function validNif(value) {
  const nif = String(value || '').toUpperCase().replace(/[\s.-]/g, '').replace(/^PT/, '');
  if (!/^\d{9}$/.test(nif) || nif[0] === '0' || (nif[0] === '4' && nif[1] !== '5')) return false;
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += Number(nif[i]) * (9 - i);
  const rest = sum % 11;
  return (rest < 2 ? 0 : 11 - rest) === Number(nif[8]);
}

function input(name, label, value, { type = 'text', placeholder = '', span = false, hint = '', auto = 'off', max = 200 } = {}) {
  return `<label class="form-group prop-field${span ? ' prop-span' : ''}"><span class="form-label">${esc(label)}</span>
      <input class="form-control" name="${name}" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="${auto}" maxlength="${max}">
      ${hint ? `<small class="prop-hint" data-hint="${name}">${hint}</small>` : `<small class="prop-hint" data-hint="${name}" hidden></small>`}</label>`;
}

defineSection('empresa', async panel => {
  const { data } = await core().apiGet('/api/owner/company');
  panel.innerHTML = `${head('Empresa', 'Usados nos documentos (fichas, conta corrente), nas condições e nos emails. Cada alojamento pode ter os seus; quando não tem, valem estes.')}
    <form class="card prop-card prop-form" id="prop-company" novalidate>
      <div class="prop-grid">
        ${input('name', 'Nome comercial', data.name, { span: true, max: 120, hint: 'É o nome da organização na aplicação, na barra lateral e nos emails.' })}
        ${input('legal_name', 'Denominação legal', data.legal_name, { placeholder: 'Empresa, Lda. ou nome do empresário', max: 160 })}
        <label class="form-group prop-field"><span class="form-label">País fiscal</span>
          <select class="form-control" name="tax_country" data-enhance-select data-app-select-class="app-select--filter">
            ${COUNTRIES.map(([code, name]) => `<option value="${code}" ${code === (data.tax_country || 'PT') ? 'selected' : ''}>${esc(name)}</option>`).join('')}
            ${COUNTRIES.some(([c]) => c === data.tax_country) ? '' : `<option value="${esc(data.tax_country)}" selected>${esc(data.tax_country)}</option>`}
          </select></label>
        ${input('tax_id', 'NIF', data.tax_id, { placeholder: '9 algarismos', max: 24 })}
        ${input('fiscal_address', 'Morada fiscal', data.fiscal_address, { placeholder: 'Rua, código postal, localidade', span: true, max: 300 })}
        ${input('billing_email', 'Email de faturação', data.billing_email, { type: 'email', placeholder: 'faturas@…', max: 160 })}
        ${input('phone', 'Telefone', data.phone, { type: 'tel', placeholder: '+351 …', max: 40 })}
        ${input('guest_email', 'Email de contacto para hóspedes (por omissão)', data.guest_email, { type: 'email', placeholder: 'reservas@…', span: true, max: 160, hint: 'Aparece nos emails aos hóspedes quando o alojamento não tem o seu.' })}
      </div>
      <p class="prop-error" role="alert" hidden></p>
      <div class="prop-actions"><button type="submit" class="btn btn-primary">${ic('save', 15)} Guardar</button></div>
    </form>`;
  const form = panel.querySelector('#prop-company');
  const nifHint = form.querySelector('[data-hint="tax_id"]');
  const checkNif = () => {
    const value = form.tax_id.value.trim();
    const bad = form.tax_country.value === 'PT' && value && !validNif(value);
    form.tax_id.classList.toggle('is-invalid', Boolean(bad));
    form.tax_id.setAttribute('aria-invalid', bad ? 'true' : 'false');
    nifHint.hidden = !bad;
    nifHint.textContent = bad ? 'NIF inválido: confirme os 9 algarismos.' : '';
    return !bad;
  };
  form.tax_id.addEventListener('input', checkNif);
  form.tax_country.addEventListener('change', checkNif);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const error = form.querySelector('.prop-error');
    error.hidden = true;
    if (!checkNif()) { form.tax_id.focus(); return; }
    const body = Object.fromEntries(['name', 'legal_name', 'tax_country', 'tax_id', 'fiscal_address', 'billing_email', 'phone', 'guest_email'].map(k => [k, form[k].value]));
    const button = form.querySelector('[type="submit"]');
    AppUI.setButtonLoading(button, true, 'A guardar…');
    try {
      const { data: saved } = await core().apiPut('/api/owner/company', body);
      const user = core().currentUser;
      if (user) {
        user.organization_name = saved.name;
        user.organization = { ...(user.organization || {}), name: saved.name, legal_name: saved.legal_name, nif: saved.tax_id, fiscal_address: saved.fiscal_address, phone: saved.phone };
      }
      core().renderSidebarBrand?.();
      root()?.querySelector('.prop-nav-head small')?.replaceChildren(document.createTextNode(saved.name));
      form.tax_id.value = saved.tax_id;
      core().toast('✅ Dados da empresa guardados.', 'success');
    } catch (e) {
      error.textContent = errText(e, 'Não foi possível guardar.');
      error.hidden = false;
    } finally {
      AppUI.setButtonLoading(button, false);
    }
  });
});

// ── Marca ──
let brand = null;
const media = url => (url ? ((/^(https?:|data:)/.test(url) ? '' : (core().API_BASE || '')) + url) : '');
function initials(name) {
  return String(name || '').split(/\s+/).filter(w => w.length > 2 || (/^[A-ZÀ-Ý]/.test(w) && w.length > 1)).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
}

function syncSessionBrand() {
  const user = core().currentUser;
  if (!user || !brand) return;
  user.organization = { ...(user.organization || {}), logo_url: brand.logo_url || '', logo_mark_url: brand.logo_mark_url || '', brand_color: brand.brand_color || '' };
  core().renderSidebarBrand?.();
}

defineSection('marca', async panel => {
  brand = (await core().apiGet('/api/owner/brand')).data;
  drawBrand(panel);
});

function drawBrand(panel) {
  const name = core().currentUser?.organization_name || '';
  const color = brand.brand_color || '';
  const logo = media(brand.logo_url);
  const mark = media(brand.logo_mark_url);
  const croppable = /^\/uploads\/[A-Za-z0-9_.-]+$/.test(brand.logo_original_url || brand.logo_url || '');
  panel.innerHTML = `${head('Marca', 'Barra lateral, emails, PDFs e portal do hóspede. Os alojamentos sem logótipo próprio herdam este.')}
    <section class="card prop-card">
      <h3>Logótipo</h3>
      <div class="prop-logo-row">
        <div class="prop-logo-box${logo ? '' : ' is-empty'}">${logo ? `<img src="${esc(logo)}" alt="Logótipo de ${esc(name)}">` : `<span>${esc(name || 'Sem logótipo')}</span>`}</div>
        <div class="prop-logo-tools">
          <label class="btn btn-ghost btn-sm prop-file">${ic('upload', 15)} ${logo ? 'Substituir logótipo' : 'Carregar logótipo'}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" data-prop-logo-file></label>
          ${logo && croppable ? `<button type="button" class="btn btn-ghost btn-sm" ${AppActions.attrs('click', 'prop-logo-crops', [])}>${ic('crop', 15)} Ajustar recortes</button>` : ''}
          ${logo ? `<button type="button" class="btn btn-ghost btn-sm prop-danger" ${AppActions.attrs('click', 'prop-logo-remove', [])}>${ic('trash-2', 15)} Remover</button>` : ''}
        </div>
      </div>
      <p class="prop-error" role="alert" hidden></p>
      <div class="prop-mark-row">
        <span class="prop-mark${mark ? ' has-img' : ''}" style="${color ? `background:${esc(color)}` : ''}">${mark ? `<img src="${esc(mark)}" alt="">` : esc(initials(name))}</span>
        <span class="prop-muted">Versão pequena (barra recolhida, ícone): o recorte quadrado do logótipo ou as iniciais. Defina-o em «Ajustar recortes».</span>
      </div>
    </section>
    <section class="card prop-card">
      <h3>Cor principal</h3>
      <div class="prop-color-row">
        <input type="color" value="${esc(color || '#843424')}" aria-label="Cor principal" data-prop-color>
        <code data-prop-color-hex>${esc(color || 'Sem cor (usa a dos alojamentos)')}</code>
        <button type="button" class="btn btn-primary btn-sm" ${AppActions.attrs('click', 'prop-color-save', [])}>Guardar cor</button>
        ${color ? `<button type="button" class="btn btn-ghost btn-sm" ${AppActions.attrs('click', 'prop-color-clear', [])}>Repor</button>` : ''}
      </div>
      <p class="prop-muted">Usada no portal do hóspede quando o alojamento não tem cor própria.</p>
      <div class="prop-uses" aria-label="Onde aparece a marca">
        <span>Barra lateral</span><span>Email</span><span>PDF</span><span class="is-on" style="${color ? `background:${esc(color)};color:#fff` : ''}" title="A cor aparece aqui">Portal</span>
      </div>
    </section>`;
  panel.querySelector('[data-prop-logo-file]').addEventListener('change', event => uploadLogo(panel, event.target));
  const picker = panel.querySelector('[data-prop-color]');
  picker.addEventListener('input', () => { panel.querySelector('[data-prop-color-hex]').textContent = picker.value; });
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Não foi possível ler o ficheiro.'));
    reader.readAsDataURL(file);
  });
}

async function uploadLogo(panel, inputEl) {
  const file = inputEl.files?.[0];
  inputEl.value = '';
  if (!file) return;
  const error = panel.querySelector('.prop-error');
  error.hidden = true;
  const { ok, errors } = core().checkImageFiles ? core().checkImageFiles([file]) : { ok: [file], errors: [] };
  if (!ok.length) { error.textContent = errors.join(' '); error.hidden = false; return; }
  const label = panel.querySelector('.prop-file');
  label.classList.add('is-busy');
  try {
    brand = (await core().apiPost('/api/owner/brand/logo', { image: await readAsDataUrl(file) })).data;
    syncSessionBrand();
    drawBrand(panel);
    if (window.lucide) lucide.createIcons();
    core().toast('✅ Logótipo guardado. Ajuste os recortes para tirar as margens.', 'success');
  } catch (e) {
    label.classList.remove('is-busy');
    error.textContent = `${file.name} — ${errText(e, 'erro ao guardar o logótipo')}`;
    error.hidden = false;
  }
}

async function removeLogo(panel) {
  if (!(await core().confirmar('Remover o logótipo da organização? Os alojamentos sem logótipo próprio deixam de o mostrar.', { label: 'Remover' }))) return;
  try {
    brand = (await core().apiDelete('/api/owner/brand/logo')).data;
    syncSessionBrand();
    drawBrand(panel);
    if (window.lucide) lucide.createIcons();
    core().toast('Logótipo removido.', 'info');
  } catch (e) {
    core().toast(`❌ ${errText(e, 'Não foi possível remover.')}`, 'error');
  }
}

// O mesmo «Ajustar logótipo» dos alojamentos (alojamentos/recortes.js), a
// gravar na organização.
async function openCrops(panel) {
  await core().featureAction('openLogoCrops', {
    id: 'organizacao',
    endpoint: '/api/owner/brand/logo',
    fields: brand,
    name: core().currentUser?.organization_name || '',
    onSaved: data => {
      brand = data;
      syncSessionBrand();
      drawBrand(panel);
      if (window.lucide) lucide.createIcons();
    },
  });
}

async function saveColor(panel, clear = false) {
  const value = clear ? null : panel.querySelector('[data-prop-color]').value;
  try {
    brand = (await core().apiPut('/api/owner/brand/color', { brand_color: value })).data;
    syncSessionBrand();
    drawBrand(panel);
    if (window.lucide) lucide.createIcons();
    core().toast(clear ? 'Cor reposta.' : '✅ Cor guardada.', 'success');
  } catch (e) {
    core().toast(`❌ ${errText(e, 'Não foi possível guardar a cor.')}`, 'error');
  }
}

const panelOf = el => el.closest('[data-prop-panel]');

AppActions.register({
  'prop-tab': (el, event, args) => { event.preventDefault(); showSection(args[0]); },
  'prop-index': () => openIndex(),
  'prop-home': () => core().showView('dashboard'),
  'prop-incoming': (el, event, args) => answerIncoming(el, args[0]),
  'prop-ticket': (el, event, args) => { event.preventDefault(); core().showView('ajuda').then(() => AppModules.ajuda.requestTicket?.(args[0])); },
  'prop-todo': async (el, event, args) => {
    // Capa pequena: abre a ficha do alojamento na secção Fotos.
    if (args[0] === 'alojamentos') {
      const id = String(args[1] || '').replace(/^cover:/, '');
      core().SS.set('aloj:sec', 'fotos');
      await core().showView('alojamentos');
      AppModules.alojamentos.openAlojamento?.(id, 'imagens');
      return;
    }
    showSection(args[0]);
    // Leva o cursor ao campo em falta (Empresa).
    setTimeout(() => root()?.querySelector(`[data-prop-panel="${args[0]}"] [name="${args[1]}"]`)?.focus(), 350);
  },
  'prop-logo-crops': el => openCrops(panelOf(el)),
  'prop-logo-remove': el => removeLogo(panelOf(el)),
  'prop-color-save': el => saveColor(panelOf(el)),
  'prop-color-clear': el => saveColor(panelOf(el), true),
}, 'click');

})();
