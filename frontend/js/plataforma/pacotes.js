// Consola da plataforma: Pacotes e limites. Cartões dos pacotes (limites e
// funcionalidades), formulário para criar e editar, e a tabela «Perto do limite».
// Todo o texto vindo da API passa por esc().
(() => {
AppModules.define('consola', {
  pacotes: { get: () => page },
});

const fmt = AppModules.consola.fmt;
const { esc, num } = fmt;
const core = () => AppModules.core;
const BASE = '/api/platform/plans';

const PAYMENTS = [[false, 'Não'], [true, 'Sim']];
const REPORTS = [['basic', 'Básicos'], ['full', 'Completos'], ['full_pdf', 'Completos + PDF']];
const MARKETING = [[false, 'Não'], ['optional', 'Opcional'], ['included', 'Incluído']];

const state = { plans: [], near: [], draft: null, error: '', busy: false, confirmDelete: null };

const q = id => document.getElementById(id);
const label = (options, value) => (options.find(([key]) => key === value)?.[1]) ?? (value == null || value === false ? 'Não' : String(value));
const limitText = value => (value == null ? 'Sem limite' : `até ${num(value)}`);

function locked(error) {
  if (error?.status === 401) { location.replace('/'); return true; }
  if (error?.status === 423 && error.payload?.locked === true) { AppModules.consola.mostrarBloqueio(); return true; }
  return false;
}

// ── Cartões ──
function planCard(plan) {
  const f = plan.features || {};
  const n = Number(plan.organizations) || 0;
  const row = (name, value) => `<div class="pl-kv"><span>${esc(name)}</span><b>${esc(value)}</b></div>`;
  const confirming = state.confirmDelete === plan.id;
  const del = n === 0
    ? `<button type="button" class="btn btn-ghost btn-sm" ${AppActions.attrs('click', 'pl-pac-apagar', [plan.id])}>${confirming ? 'Confirmar: apagar' : 'Apagar'}</button>`
    : '';
  return `<section class="v2-card v2-dense pl-pac-card" aria-label="${esc(plan.name)}">
    <div class="pl-pac-top"><h3>${esc(plan.name)}</h3>${fmt.chip(n ? 'info' : 'neutral', `${num(n)} ${n === 1 ? 'cliente' : 'clientes'}`)}</div>
    <div>${row('Alojamentos', limitText(plan.max_accommodations))}${row('Pessoas na equipa', limitText(plan.max_members))}
      ${row('Pagamentos online', f.payments ? 'Sim' : '—')}${row('Relatórios e exportação', f.reports ? label(REPORTS, f.reports) : '—')}
      ${row('Serviço de marketing', f.marketing ? label(MARKETING, f.marketing) : '—')}</div>
    <div class="pl-pac-actions"><button type="button" class="btn btn-ghost btn-sm" ${AppActions.attrs('click', 'pl-pac-editar', [plan.id])}>Editar</button>${del}</div>
    ${confirming ? `<p class="pl-note">Apagar «${esc(plan.name)}» não pode ser desfeito.</p>` : ''}
  </section>`;
}

// ── Formulário ──
const opts = (options, current) => options.map(([key, text]) => `<option value="${esc(String(key))}"${String(current) === String(key) ? ' selected' : ''}>${esc(text)}</option>`).join('');

function limitField(id, text, field, d) {
  const none = d[`${field}_none`];
  return `<div class="pl-pac-limit"><label class="pl-label" for="${id}">${esc(text)}</label>
    <input class="form-control" id="${id}" type="number" min="0" max="100000" inputmode="numeric" value="${esc(d[field])}" ${none ? 'disabled' : ''}
      ${AppActions.attrs('input', 'pl-pac-campo', [field])}>
    <label class="pl-pac-check"><input type="checkbox" ${none ? 'checked' : ''} ${AppActions.attrs('change', 'pl-pac-semlimite', [field])}><span>Sem limite</span></label></div>`;
}

function formHtml() {
  const d = state.draft;
  return `<section class="v2-card v2-dense pl-pac-form" id="pl-pac-form" aria-labelledby="pl-pac-form-t">
    <div class="v2-card-h"><h3 id="pl-pac-form-t">${d.id ? `Editar «${esc(d.original)}»` : 'Novo pacote'}</h3></div>
    <div class="pl-pac-grid">
      <div><label class="pl-label" for="pl-pac-nome">Nome</label>
        <input class="form-control" id="pl-pac-nome" maxlength="60" value="${esc(d.name)}" ${AppActions.attrs('input', 'pl-pac-campo', ['name'])}></div>
      <div><label class="pl-label" for="pl-pac-ordem">Ordem</label>
        <input class="form-control" id="pl-pac-ordem" type="number" step="1" inputmode="numeric" value="${esc(d.sort)}" ${AppActions.attrs('input', 'pl-pac-campo', ['sort'])}></div>
      ${limitField('pl-pac-aloj', 'Alojamentos', 'max_accommodations', d)}
      ${limitField('pl-pac-equipa', 'Pessoas na equipa', 'max_members', d)}
      <div><label class="pl-label" for="pl-pac-pag">Pagamentos online</label>
        <select class="form-control" id="pl-pac-pag" ${AppActions.attrs('change', 'pl-pac-campo', ['payments'])}>${opts(PAYMENTS, d.payments)}</select></div>
      <div><label class="pl-label" for="pl-pac-rel">Relatórios e exportação</label>
        <select class="form-control" id="pl-pac-rel" ${AppActions.attrs('change', 'pl-pac-campo', ['reports'])}>${opts(REPORTS, d.reports)}</select></div>
      <div><label class="pl-label" for="pl-pac-mkt">Serviço de marketing</label>
        <select class="form-control" id="pl-pac-mkt" ${AppActions.attrs('change', 'pl-pac-campo', ['marketing'])}>${opts(MARKETING, d.marketing)}</select></div>
    </div>
    <p class="pl-error" id="pl-pac-erro" role="alert"${state.error ? '' : ' hidden'}>${esc(state.error)}</p>
    <div class="pl-pac-actions"><button type="button" class="btn btn-primary" id="pl-pac-guardar" ${state.busy ? 'disabled' : ''} ${AppActions.attrs('click', 'pl-pac-guardar')}>Guardar</button>
      <button type="button" class="btn btn-ghost" ${AppActions.attrs('click', 'pl-pac-cancelar')}>Cancelar</button></div>
  </section>`;
}

function draftOf(plan) {
  const f = plan?.features || {};
  const limit = value => ({ value: value == null ? '' : String(value), none: !plan ? false : value == null });
  const a = limit(plan?.max_accommodations);
  const m = limit(plan?.max_members);
  return {
    id: plan?.id || null, original: plan?.name || '', name: plan?.name || '',
    sort: String(plan?.sort ?? (state.plans.length ? Math.max(...state.plans.map(p => Number(p.sort) || 0)) + 1 : 1)),
    max_accommodations: a.value, max_accommodations_none: a.none, max_members: m.value, max_members_none: m.none,
    payments: f.payments === true, reports: f.reports ?? 'basic', marketing: f.marketing ?? false,
    extra: Object.fromEntries(Object.entries(f).filter(([key]) => !['payments', 'reports', 'marketing'].includes(key))),
  };
}

function bodyOf(d) {
  const name = d.name.trim();
  if (!name) return { error: 'Indique o nome do pacote.' };
  const limit = (field, text) => {
    if (d[`${field}_none`]) return { value: null };
    const raw = String(d[field]).trim();
    if (!/^\d+$/.test(raw)) return { error: `Indique o limite de ${text} ou marque «Sem limite».` };
    return { value: Number(raw) };
  };
  const acc = limit('max_accommodations', 'alojamentos');
  if (acc.error) return acc;
  const members = limit('max_members', 'pessoas na equipa');
  if (members.error) return members;
  const sort = Number(String(d.sort).trim());
  if (!Number.isInteger(sort)) return { error: 'A ordem tem de ser um número inteiro.' };
  const bool = value => value === true || value === 'true';
  const off = value => (value === false || value === 'false' ? false : value);
  return { body: { name, max_accommodations: acc.value, max_members: members.value, sort,
    features: { ...d.extra, payments: bool(d.payments), reports: d.reports, marketing: off(d.marketing) } } };
}

// ── Perto do limite ──
function meterCell(use) {
  if (!use || use.max == null) return `<span class="pl-muted">${num(use?.used)} · sem limite</span>`;
  const pct = use.max === 0 ? 100 : Math.min(100, Math.round((use.used / use.max) * 100));
  const tone = pct >= 100 ? 'high' : pct >= 80 ? 'medium' : '';
  return `<span class="pl-meter-wrap"><progress class="pl-meter ${tone ? `pl-${tone}` : ''}" max="100" value="${pct}" aria-label="${num(use.used)} de ${num(use.max)}"></progress><b class="pl-num">${num(use.used)}/${num(use.max)}</b></span>`;
}

function nearHtml() {
  const body = state.near.length
    ? `<div class="pl-table"><div class="pl-th pl-pac-near"><span>Cliente</span><span>Pacote</span><span>Alojamentos</span><span>Equipa</span><span></span></div>
      ${state.near.map(r => `<div class="v2-row pl-row pl-pac-near"><span><b>${esc(r.organization?.name)}</b></span><span>${esc(r.plan?.name || '')}</span>
        <span><i class="pl-pac-lbl">Alojamentos</i>${meterCell(r.accommodations)}</span><span><i class="pl-pac-lbl">Equipa</i>${meterCell(r.members)}</span>
        <span>${fmt.link(fmt.orgHref(r.organization?.id), 'Mudar pacote', 'btn btn-ghost btn-sm')}</span></div>`).join('')}</div>`
    : fmt.empty('Nenhum cliente perto do limite.', 'check-circle');
  return `<section class="v2-card v2-dense" aria-labelledby="pl-pac-near-t"><div class="v2-card-h"><h3 id="pl-pac-near-t">Perto do limite</h3>
    <span class="pl-muted">Bons candidatos a subir de pacote</span></div>${body}</section>`;
}

function pageHtml() {
  return `<div class="pl-page pl-pac-page">
    <div class="pl-pac-intro"><p class="pl-lead">Cada cliente tem um pacote. Os limites aplicam-se quando o cliente cria alojamentos ou convida pessoas; nada é apagado se baixar de pacote.</p>
      <button type="button" class="btn btn-primary" ${AppActions.attrs('click', 'pl-pac-novo')}>${fmt.icon('plus', 16)}<span>Novo pacote</span></button></div>
    <div id="pl-pac-editor">${state.draft ? formHtml() : ''}</div>
    <div class="pl-pac-cards" id="pl-pac-cards">${state.plans.length ? state.plans.map(planCard).join('') : `<div class="v2-card v2-dense">${fmt.empty('Ainda sem pacotes.', 'package')}</div>`}</div>
    <div id="pl-pac-near">${nearHtml()}</div>
  </div>`;
}

function paint() {
  const host = q('pl-pac-cards');
  if (!host) return;
  q('pl-pac-editor').innerHTML = state.draft ? formHtml() : '';
  host.innerHTML = state.plans.length ? state.plans.map(planCard).join('') : `<div class="v2-card v2-dense">${fmt.empty('Ainda sem pacotes.', 'package')}</div>`;
  q('pl-pac-near').innerHTML = nearHtml();
  if (window.lucide) lucide.createIcons();
}

function showError(text) {
  state.error = text || '';
  const box = q('pl-pac-erro');
  if (box) { box.textContent = state.error; box.hidden = !state.error; }
}

async function reload() {
  const [plans, near] = await Promise.all([
    core().apiGet(BASE).then(r => r?.data || []),
    core().apiGet(`${BASE}/near-limit`).then(r => r?.data || []).catch(error => { if (locked(error)) throw error; return []; }),
  ]);
  state.plans = Array.isArray(plans) ? plans : [];
  state.near = Array.isArray(near) ? near : [];
  AppModules.consola.api.reset();
}

const page = {
  async render(ctx) {
    state.error = ''; state.busy = false; state.confirmDelete = null;
    try { await reload(); } catch (error) {
      if (ctx.stale() || locked(error)) return;
      ctx.host.innerHTML = `<div class="pl-page"><div class="v2-card v2-dense">${fmt.empty('Não foi possível carregar os pacotes.', 'triangle-alert')}</div></div>`;
      return;
    }
    if (ctx.stale()) return;
    ctx.host.innerHTML = pageHtml();
    if (window.lucide) lucide.createIcons();
  },
};

async function save() {
  if (state.busy || !state.draft) return;
  const { body, error } = bodyOf(state.draft);
  if (error) { showError(error); return; }
  state.busy = true; showError('');
  const button = q('pl-pac-guardar');
  if (button) button.disabled = true;
  try {
    const id = state.draft.id;
    if (id) await core().apiPut(`${BASE}/${encodeURIComponent(id)}`, body); else await core().apiPost(BASE, body);
    state.draft = null;
    await reload();
    core().toast('Pacote guardado.', 'success');
    paint();
  } catch (err) {
    if (!locked(err)) showError(err?.payload?.error || 'Não foi possível guardar o pacote.');
  } finally {
    state.busy = false;
    const again = q('pl-pac-guardar');
    if (again) again.disabled = false;
  }
}

async function remove(id) {
  const plan = state.plans.find(p => p.id === id);
  if (!plan || Number(plan.organizations) > 0 || state.busy) return;
  if (state.confirmDelete !== id) { state.confirmDelete = id; paint(); return; }
  state.busy = true;
  try {
    await core().apiDelete(`${BASE}/${encodeURIComponent(id)}`);
    state.confirmDelete = null;
    if (state.draft?.id === id) state.draft = null;
    await reload();
    core().toast('Pacote apagado.', 'success');
  } catch (err) {
    state.confirmDelete = null;
    if (!locked(err)) core().toast(err?.payload?.error || 'Não foi possível apagar o pacote.', 'error');
  } finally {
    state.busy = false;
    paint();
  }
}

AppActions.register({
  'pl-pac-novo': () => { state.draft = draftOf(null); state.error = ''; state.confirmDelete = null; paint(); q('pl-pac-nome')?.focus(); },
  'pl-pac-editar': (el, event, [id]) => {
    const plan = state.plans.find(p => p.id === id);
    if (!plan) return;
    state.draft = draftOf(plan); state.error = ''; state.confirmDelete = null; paint();
    q('pl-pac-form')?.scrollIntoView({ block: 'nearest' });
    q('pl-pac-nome')?.focus();
  },
  'pl-pac-cancelar': () => { state.draft = null; state.error = ''; paint(); },
  'pl-pac-guardar': () => save(),
  'pl-pac-apagar': (el, event, [id]) => remove(id),
}, 'click');

AppActions.register({
  'pl-pac-campo': (el, event, [field]) => { if (state.draft) state.draft[field] = el.value; },
}, 'input');

AppActions.register({
  'pl-pac-campo': (el, event, [field]) => { if (state.draft) state.draft[field] = el.value; },
  'pl-pac-semlimite': (el, event, [field]) => {
    if (!state.draft) return;
    state.draft[`${field}_none`] = el.checked;
    const input = el.closest('.pl-pac-limit')?.querySelector('input[type="number"]');
    if (input) { input.disabled = el.checked; if (!el.checked) input.focus(); }
  },
}, 'change');
})();
