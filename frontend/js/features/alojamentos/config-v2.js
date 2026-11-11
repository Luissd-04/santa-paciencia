// Configurações do alojamento na V2 (maquetas ap, as1–as3). O formulário é o
// da V1; aqui ganha um cabeçalho com a capa, um menu de secções à esquerda
// (em vez dos separadores), o painel «Vem de …» nas unidades, a «Visão geral»
// com as unidades no alojamento principal e a barra «Alterações por guardar».
// Cada cartão do separador Informação diz a sua secção (data-acfg).
(() => {
AppModules.define('alojamentos', {
  renderConfigV2: { get: () => renderConfigV2 },
});

// [id, ícone, nome, descrição, separador da V1]
const SECOES = [
  ['Alojamento', [
    ['visao', 'layout-grid', 'Visão geral', 'Unidades e o que partilham', 'info'],
    ['geral', 'info', 'Geral', 'Nome, cor, licença, morada e descrição', 'info'],
    ['capacidade', 'users', 'Capacidade e preço', 'Hóspedes, noites, crianças', 'info'],
    ['fotos', 'image', 'Fotos', 'Capa e galeria', 'imagens'],
    ['comodidades', 'sparkles', 'Comodidades', 'O que a unidade tem', 'comodidades'],
    ['localizacao', 'map-pin', 'Localização', 'Mapa', 'info'],
  ]],
  ['Funcionamento', [
    ['acesso', 'key-round', 'Horários e acesso', 'Check-in, Wi-Fi, porta', 'info'],
    ['ligacoes', 'link', 'Ligações', 'Google, Airbnb, Booking', 'info'],
    ['bloqueios', 'ban', 'Bloqueios', 'Datas fechadas', 'bloqueios'],
    ['precos', 'tag', 'Preços', 'Épocas e períodos', 'precos'],
  ]],
  ['Hóspedes', [
    ['marca', 'at-sign', 'Logótipo e redes', 'Nos emails e na página', 'info'],
    ['rgpd', 'shield-check', 'RGPD', 'Texto do consentimento', 'rgpd'],
  ]],
];
const TODAS = SECOES.flatMap(([, items]) => items);

let atual = null;   // { id, sec }
let porGuardar = false;

const isV2 = () => Boolean(document.documentElement.dataset.look);
const view = () => document.getElementById('view-alojamento-detalhe');

function filhos(a) {
  return (AppModules.core.accommodations || []).filter(u => u.parent_id === a.id);
}

function capa(a, width) {
  const core = AppModules.core;
  return a?.cover_image && core.safeMediaUrl(a.cover_image) ? core.mediaThumb(a.cover_image, width) : '';
}

function fotoHtml(a, cls, width) {
  const core = AppModules.core;
  const src = capa(a, width);
  return `<span class="${cls}" style="--acc:${core.escapeHtml(a?.color || '#843424')}">${src ? `<img src="${core.escapeHtml(src)}" alt="" loading="lazy" ${AppActions.attrs('error', 'acfg-foto-falhou')}>` : ''}</span>`;
}

// O que as unidades recebem do alojamento principal (só os valores, a
// palavra-passe e o código ficam escondidos).
function partilhado(p) {
  const esc = AppModules.core.escapeHtml;
  const esconder = v => v ? `•••• ${String(v).slice(-2)}` : '';
  const redes = ['social_facebook', 'social_instagram', 'social_website', 'social_tripadvisor'].filter(k => p[k]).length;
  const linhas = [
    ['map-pin', 'Morada', [p.address, p.city].filter(Boolean).join(', ')],
    ['clock', 'Check-in / saída', [p.checkin_time, p.checkout_time].filter(Boolean).join(' · ')],
    ['wifi', 'Wi-Fi', p.wifi_name],
    ['key-round', 'Código da porta', esconder(p.door_code)],
    ['shield-check', 'RGPD', p.rgpd_text ? 'Texto próprio' : ''],
    ['at-sign', 'Redes sociais', redes ? `${redes} ${redes === 1 ? 'ligada' : 'ligadas'}` : ''],
  ];
  return linhas.map(([icon, k, v]) => `<div class="acfg-lock">${AppModules.core.lcIcon(icon, 15)}<span>${k}</span><b>${esc(v || '—')}</b></div>`).join('');
}

function cabecalhoHtml(a) {
  const core = AppModules.core;
  const esc = core.escapeHtml;
  const parent = a._parent;
  const unidades = filhos(a).length;
  const meta = parent || !unidades
    ? [`${a.type === 'alojamento' ? 'Alojamento' : (a.type || 'Unidade')}`, `${Number(a.max_guests) || 0} hóspedes`, a.area ? `${a.area} m²` : '', a.price_per_night ? `${ReservationMoney.formatShort(a.price_per_night)} / noite` : '']
    : [[a.city, a.region].filter(Boolean).join(' · '), `${unidades} ${unidades === 1 ? 'unidade' : 'unidades'}`, a.license_number ? `Licença ${a.license_number}` : ''];
  return `<div class="card acfg-head">
      ${fotoHtml(a, 'acfg-cover', 480)}
      <div class="acfg-who">
        <div class="acfg-crumb"><button type="button" data-on-click="index-show-view-4899013">${core.lcIcon('arrow-left', 14)} Alojamentos</button>${parent ? `${core.lcIcon('chevron-right', 14)}<button type="button" ${AppActions.attrs('click', 'alojamentos-open-alojamento-8027257', [String(parent.id)])}>${esc(parent.name)}</button>` : ''}</div>
        <h2>${esc(a.name)}</h2>
        <div class="acfg-meta">${meta.filter(Boolean).map(v => `<span>${esc(v)}</span>`).join('')}
          ${a.public_slug ? `<span class="acfg-chip is-ok">${core.lcIcon('globe', 13)} Na página de reservas</span>` : ''}
          ${parent ? `<span class="acfg-chip is-info">${core.lcIcon('link', 13)} Herda de ${esc(parent.name)}</span>` : ''}</div>
      </div>
      <div class="acfg-acts">
        <button type="button" class="btn btn-ghost btn-sm" data-on-click="index-open-public-booking-preview-4afe448">${core.lcIcon('external-link', 15)} Página pública</button>
        <button type="button" class="btn btn-ghost btn-sm" data-on-click="index-open-aloj-calendar-c518ff2">${core.lcIcon('calendar-days', 15)} Calendário</button>
        <button type="button" class="btn btn-ghost btn-sm acfg-apagar" data-on-click="index-delete-alojamento-3dd9b10">${core.lcIcon('trash-2', 15)} Apagar</button>
        <button type="button" class="btn btn-primary btn-sm" data-on-click="index-save-alojamento-ffd34a4">${core.lcIcon('check', 15)} Guardar</button>
      </div>
    </div>`;
}

function menuHtml(principal) {
  const core = AppModules.core;
  return `<nav class="card acfg-nav" aria-label="Secções do alojamento">${SECOES.map(([grupo, items]) => {
    const visiveis = items.filter(([id]) => id !== 'visao' || principal);
    return `<div class="acfg-g">${grupo}</div>${visiveis.map(([id, icon, nome, sub]) => `<button type="button" class="acfg-i" data-acfg-sec="${id}" ${AppActions.attrs('click', 'acfg-secao', [id])}>
        ${core.lcIcon(icon, 17)}<span>${nome}<small>${sub}</small></span></button>`).join('')}`;
  }).join('')}</nav>`;
}

function visaoHtml(a) {
  const core = AppModules.core;
  const esc = core.escapeHtml;
  const unidades = filhos(a);
  return `<div class="card acfg-card"><div class="acfg-card-h"><h3>Unidades</h3><button type="button" class="btn btn-primary btn-sm" data-on-click="acfg-nova-unidade">${core.lcIcon('plus', 15)} Nova unidade</button></div>
      ${unidades.length ? `<div class="acfg-units">${unidades.map(u => `<div class="acfg-unit">${fotoHtml(u, 'acfg-unit-ph', 160)}
          <span><b>${esc(u.name)}</b><small>${esc([`${Number(u.max_guests) || 0} hóspedes`, u.price_per_night ? `${ReservationMoney.formatShort(u.price_per_night)} / noite` : ''].filter(Boolean).join(' · '))}</small></span>
          <button type="button" class="btn btn-ghost btn-sm" ${AppActions.attrs('click', 'alojamentos-open-alojamento-8027257', [String(u.id)])}>${core.lcIcon('pencil', 14)} Editar</button></div>`).join('')}</div>`
        : '<p class="acfg-empty">Ainda sem unidades. Uma casa inteira pode ficar assim; para quartos ou suites, cria uma unidade.</p>'}</div>
    <div class="card acfg-card"><div class="acfg-card-h"><h3>Partilhado com as unidades</h3></div>
      <p class="acfg-empty">O que mudares aqui vale para ${unidades.length ? `as ${unidades.length} unidades` : 'as unidades'}, a não ser que uma tenha valor próprio.</p>${partilhado(a)}</div>`;
}

function herdadoHtml(a) {
  const core = AppModules.core;
  const p = a._parent;
  return `<aside class="card acfg-card acfg-side"><div class="acfg-card-h"><h3>Vem de ${core.escapeHtml(p.name)}</h3></div>
      <p class="acfg-empty">Igual em todas as unidades. Muda-se no alojamento principal.</p>${partilhado(p)}
      <button type="button" class="btn btn-ghost btn-sm" ${AppActions.attrs('click', 'alojamentos-open-alojamento-8027257', [String(p.id)])}>${core.lcIcon('building-2', 15)} Abrir ${core.escapeHtml(p.name)}</button></aside>`;
}

function mostrar(sec) {
  const v = view();
  const item = TODAS.find(([id]) => id === sec);
  if (!v || !item) return;
  atual.sec = sec;
  AppModules.core.SS.set('aloj:sec', sec);
  v.dataset.acfgSec = sec;
  v.querySelectorAll('.acfg-i').forEach(btn => btn.setAttribute('aria-current', String(btn.dataset.acfgSec === sec)));
  const tab = item[4];
  if (AppModules.alojamentos.getActiveAlojTab() !== tab) AppModules.alojamentos.showAlojTab(tab);
}

function renderConfigV2(a) {
  const v = view();
  if (!v) return;
  const on = isV2();
  v.classList.toggle('acfg-on', on);
  v.querySelectorAll('.acfg-built').forEach(el => el.remove());
  if (!on) { delete v.dataset.acfgSec; v.classList.remove('acfg-grid'); return; }
  const principal = !a.parent_id && (a.type === 'alojamento' || filhos(a).length > 0);
  v.classList.toggle('acfg-unidade', Boolean(a._parent));
  const content = v.querySelector('#aloj-tab-info')?.parentElement;
  if (!content) return;
  content.classList.add('acfg-grid');
  content.insertAdjacentHTML('afterbegin', `<div class="acfg-built acfg-top">${cabecalhoHtml(a)}</div>`);
  content.insertAdjacentHTML('beforeend', `<div class="acfg-built acfg-visao">${principal ? visaoHtml(a) : ''}</div>
    <div class="acfg-built acfg-save" hidden><span>${AppModules.core.lcIcon('circle-dot', 15)} Alterações por guardar</span>
      <button type="button" class="btn btn-ghost btn-sm" data-on-click="acfg-descartar">Descartar</button>
      <button type="button" class="btn btn-primary btn-sm" data-on-click="index-save-alojamento-ffd34a4">${AppModules.core.lcIcon('check', 15)} Guardar</button></div>`);
  content.insertAdjacentHTML('afterbegin', `<div class="acfg-built acfg-nav-wrap">${menuHtml(principal)}</div>`);
  if (a._parent) content.insertAdjacentHTML('beforeend', `<div class="acfg-built acfg-side-wrap">${herdadoHtml(a)}</div>`);
  porGuardar = false;
  // Ao gravar, a ficha volta a abrir: fica na mesma secção.
  const anterior = atual?.id === a.id ? atual.sec : AppModules.core.SS.get('aloj:sec');
  atual = { id: a.id, sec: null };
  const valida = TODAS.some(([id]) => id === anterior) && (anterior !== 'visao' || principal);
  mostrar(valida ? anterior : (principal ? 'visao' : 'geral'));
  if (window.lucide) lucide.createIcons();
}

// Qualquer alteração no formulário mostra a barra «Alterações por guardar».
document.addEventListener('input', marcar, true);
document.addEventListener('change', marcar, true);
function marcar(event) {
  const v = view();
  if (!atual || porGuardar || !v?.classList.contains('acfg-on') || !v.contains(event.target)) return;
  if (!event.target.matches?.('input, textarea, select') || event.target.closest('.acfg-built, #amenities-search')) return;
  porGuardar = true;
  v.querySelector('.acfg-save')?.removeAttribute('hidden');
}

AppActions.register({
  'acfg-secao': (el, event, [sec]) => mostrar(sec),
  'acfg-nova-unidade': () => { if (atual) AppModules.alojamentos.addAlojamento({ type: 'suite', parentId: atual.id }); },
  'acfg-descartar': () => { if (atual) AppModules.alojamentos.openAlojamento(atual.id); },
}, 'click');
AppActions.register({ 'acfg-foto-falhou': el => { el.remove() } }, 'error');

})();
