// Estado privado; interface partilhada em AppModules.core.
(() => {
AppModules.define('core', {
  FEATURE_MODULES: { get: () => FEATURE_MODULES },
  clearFeatureLoadError: { get: () => clearFeatureLoadError },
  ensureFeature: { get: () => ensureFeature },
  ensureViewMarkup: { get: () => ensureViewMarkup },
  featureAction: { get: () => featureAction },
  showFeatureLoadError: { get: () => showFeatureLoadError },
  VIEW_FEATURE: { get: () => VIEW_FEATURE },
  VIEW_MARKUP: { get: () => VIEW_MARKUP },
});

/* ═══════════════════════════════════════════════════════════════
   SANTA PACIÊNCIA — carregamento de funcionalidades por vista

   O núcleo (estado, helpers, UI, autenticação, navegação, dashboard e
   notificações) vem no index.html. Tudo o resto chega quando a vista
   respetiva é aberta pela primeira vez.

   Este registo é a fonte única de verdade: o verificador de recursos
   (backend/src/scripts/check-source.cjs) lê-o para confirmar que os
   ficheiros existem e que a ordem declarada é a ordem de execução, e o
   service worker usa a mesma lista para guardar os módulos em cache.

   Regras:
     · `scripts` corre por esta ordem. Cada ficheiro tem estado privado e usa
       AppModules para aceder às interfaces dos que vêm antes dele.
     · `actions` são as funções desta funcionalidade que outras partes da
       aplicação chamam de fora — do shell, de outra vista, ou de um handler
       inline no HTML. Só estas podem ser invocadas por featureAction(), e o
       check-source.cjs confirma que existem e que nenhum handler inline
       chama código de uma vista que ainda possa não estar carregada.
     · `deps` são funcionalidades que têm de estar carregadas ANTES,
       porque o módulo lê símbolos delas ao correr ou ao desenhar a vista.
       Chamadas pontuais entre vistas (abrir a ficha de uma reserva a
       partir do calendário, por exemplo) não são dependências: passam
       por ensureFeature() no momento do clique.
═══════════════════════════════════════════════════════════════ */

const FEATURE_MODULES = {
  reservas: {
    actions: ['openModal', 'showDetail', 'exportReservasXLS', 'exportReservasPDF', 'importReservasXLS'],
    scripts: [
      'js/reserva-wizard.js',
      'js/features/reserva-wizard/editor.js',
      'js/features/reserva-wizard/rascunhos.js',
      'js/features/reserva-wizard/precos.js',
      'js/features/reserva-wizard/datas-hospedes.js',
      'js/features/reserva-wizard/disponibilidade.js',
      'js/features/reserva-wizard/passos.js',
      'js/features/reserva-wizard/guardar.js',
      'js/reserva-lista.js',
      'js/features/reserva-lista/lista-dados.js',
      'js/features/reserva-lista/lista-colunas.js',
      'js/features/reserva-lista/lista-render.js',
      'js/features/reserva-lista/detalhe.js',
      'js/features/reserva-lista/detalhe-formularios.js',
      'js/features/reserva-lista/documentos.js',
      'js/features/reserva-lista/alojamento-painel.js',
      'js/features/reserva-lista/acoes.js',
      'js/features/reserva-lista/exportacao.js',
      'js/reserva-detalhe-tabs.js',
    ],
  },
  // Bloqueios de datas: desenhados sobre o calendário e editados na ficha
  // do alojamento; não têm vista própria.
  bloqueios: {
    scripts: ['js/blocks.js'],
  },
  calendario: {
    // O calendário desenha reservas (bandas, ficha, criação rápida) e
    // bloqueios: ambos são lidos enquanto a grelha é construída.
    deps: ['reservas', 'bloqueios'],
    scripts: [
      'js/calendario.js',
      'js/features/calendario/dados.js',
      'js/features/calendario/mes-agenda.js',
      'js/features/calendario/paisagem.js',
      'js/features/calendario/timeline.js',
      'js/features/calendario/interacoes.js',
    ],
  },
  eventos: {
    scripts: ['js/eventos.js'],
  },
  hospedes: {
    actions: ['showHospedeDetail', 'exportHospedesXLS', 'exportHospedesPDF', 'importHospedesXLS'],
    // A ficha do hóspede lista as reservas e reutiliza o editor de datas e
    // os indicativos telefónicos do assistente de reservas.
    deps: ['reservas'],
    scripts: [
      'js/hospedes.js',
      'js/features/hospedes/paises.js',
      'js/features/hospedes/lista.js',
      'js/features/hospedes/detalhe.js',
      'js/features/hospedes/exportacao.js',
    ],
  },
  alojamentos: {
    actions: ['exportAlojamentosXLS', 'exportAlojamentosPDF', 'importAlojamentosXLS'],
    deps: ['bloqueios'],
    scripts: [
      'js/alojamentos.js',
      'js/features/alojamentos/galeria.js',
      'js/features/alojamentos/servicos-heranca.js',
      'js/features/alojamentos/exportacao.js',
      'js/features/alojamentos/configuracao.js',
    ],
  },
  despesas: {
    scripts: ['js/despesas.js'],
  },
  relatorios: {
    // Os gráficos de despesas usam as categorias e cores de despesas.js,
    // lidas quando relatorios.js corre.
    deps: ['despesas'],
    scripts: ['js/relatorios.js'],
  },
  vouchers: {
    // Cada voucher usado abre a ficha da reserva onde foi aplicado.
    deps: ['reservas'],
    scripts: ['js/vouchers.js'],
  },
  precos: {
    scripts: ['js/precos.js'],
  },
  invoice: {
    actions: ['openInvoiceForReservation'],
    scripts: [
      'js/invoice.js',
      'js/features/invoice/historico.js',
      'js/features/invoice/arquivo.js',
      'js/features/invoice/composicao.js',
      'js/features/invoice/auxiliares.js',
    ],
  },
  definicoes: {
    scripts: [
      'js/emails.js',
      'js/features/emails/codes.js',
      'js/features/emails/editor.js',
      'js/features/emails/preview.js',
      'js/fornecedores.js',
      'js/team.js',
      'js/push.js',
    ],
  },
};

// Vista (id sem o prefixo "view-") → funcionalidade que a serve.
// As vistas que faltam são servidas pelo núcleo.
const VIEW_FEATURE = {
  reservas: 'reservas',
  calendario: 'calendario',
  eventos: 'eventos',
  hospedes: 'hospedes',
  'hospede-detalhe': 'hospedes',
  alojamentos: 'alojamentos',
  'alojamento-detalhe': 'alojamentos',
  despesas: 'despesas',
  relatorios: 'relatorios',
  vouchers: 'vouchers',
  precos: 'precos',
  invoice: 'invoice',
  definicoes: 'definicoes',
};

// Vista → marcação HTML carregada em runtime (mesma ideia do ensureFeature,
// mas para o esqueleto): reduz o index.html às vistas nucleares (dashboard,
// notificações) e ao resto do esqueleto. dashboard/notificacoes ficam de
// fora — são a vista inicial e têm de estar visíveis sem pedido de rede.
const VIEW_MARKUP = {
  reservas: 'views/reservas.html',
  calendario: 'views/calendario.html',
  eventos: 'views/eventos.html',
  alojamentos: 'views/alojamentos.html',
  'alojamento-detalhe': 'views/alojamento-detalhe.html',
  hospedes: 'views/hospedes.html',
  'hospede-detalhe': 'views/hospede-detalhe.html',
  invoice: 'views/invoice.html',
  despesas: 'views/despesas.html',
  relatorios: 'views/relatorios.html',
  vouchers: 'views/vouchers.html',
  precos: 'views/precos.html',
  definicoes: 'views/definicoes.html',
};

// Função exportada → funcionalidade que a define.
const FEATURE_ACTIONS = {};
for (const [name, feature] of Object.entries(FEATURE_MODULES)) {
  for (const action of feature.actions || []) FEATURE_ACTIONS[action] = name;
}

const featureScriptRequests = new Map();  // src → promessa (apagada se falhar)
const featureRequests = new Map();        // funcionalidade → promessa em curso

// O preload traz os ficheiros em paralelo; a execução a seguir é sequencial
// e sai da cache do browser, sem cascata de latências.
function preloadFeatureScript(src) {
  if (document.querySelector(`link[rel="preload"][href="${src}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'script';
  link.href = src;
  document.head.appendChild(link);
}

// Um ficheiro que falhou nunca chegou a correr: sai do registo para que a
// tentativa seguinte o volte a pedir. Os que já correram ficam como estão —
// repetir um script clássico voltaria a registar interfaces e eventos.
function runFeatureScript(src) {
  const existing = featureScriptRequests.get(src);
  if (existing) return existing;
  const request = new Promise((resolve, reject) => {
    const element = document.createElement('script');
    element.src = src;
    element.async = false;
    const timer = setTimeout(() => fail(), 30000);
    const done = () => { clearTimeout(timer); element.onload = null; element.onerror = null; };
    const fail = () => {
      done();
      element.remove();
      featureScriptRequests.delete(src);
      reject(new Error(src));
    };
    element.onload = () => { done(); resolve(); };
    element.onerror = fail;
    document.head.appendChild(element);
  });
  featureScriptRequests.set(src, request);
  return request;
}

function loadFeature(name) {
  const feature = FEATURE_MODULES[name];
  if (!feature) return Promise.reject(new Error(`Funcionalidade desconhecida: ${name}`));
  const pending = featureRequests.get(name);
  if (pending) return pending;
  const request = (async () => {
    for (const dep of feature.deps || []) await loadFeature(dep);
    feature.scripts.forEach(preloadFeatureScript);
    for (const src of feature.scripts) await runFeatureScript(src);
  })();
  featureRequests.set(name, request);
  // Uma falha não fica registada: o próximo pedido repete os ficheiros que
  // faltam, sem voltar a correr os que já passaram.
  request.catch(() => featureRequests.delete(name));
  return request;
}

// Devolve true quando o código já está disponível. Em caso de falha avisa e
// devolve false — quem chama decide se mostra o painel de repetição ou se
// simplesmente não faz nada.
async function ensureFeature(name) {
  if (!name) return true;
  try {
    await loadFeature(name);
    return true;
  } catch (error) {
    if (typeof AppModules.core.toast === 'function') {
      AppModules.core.toast('❌ Não foi possível carregar esta secção. Verifica a ligação e tenta novamente.', 'error');
    }
    return false;
  }
}

const viewMarkupRequests = new Map();  // funcionalidade → promessa (apagada se falhar)

// Vistas com marcação em runtime que pertencem a uma funcionalidade (ordem
// irrelevante: cada uma tem o seu próprio contentor).
function markupViewsOf(feature) {
  return Object.keys(VIEW_FEATURE).filter(v => VIEW_FEATURE[v] === feature && VIEW_MARKUP[v]);
}

// Traz e injeta a marcação de TODAS as vistas da funcionalidade na primeira
// abertura de qualquer uma delas — não só a que está a abrir. `alojamentos`
// e `hospedes`, por exemplo, têm lista e ficha de detalhe na mesma
// funcionalidade, e o código de uma mexe na marcação da outra sem passar por
// showView() (ex.: mudar de separador dentro da ficha aberta). Carregar por
// vista isolada deixava essa marcação por chegar. Cada contentor
// (`#view-<id>`) já existe no index.html, vazio; fica marcado com
// data-markup-ready para não pedir outra vez. Corre em paralelo com
// ensureFeature() em showView().
function ensureViewMarkup(feature) {
  if (!feature) return Promise.resolve(true);
  const views = markupViewsOf(feature);
  if (!views.length) return Promise.resolve(true);
  // O pedido em cache é a promessa "crua" (resolve para undefined); embrulhar
  // em true/false acontece sempre aqui, tanto na primeira vez como quando já
  // está em cache — devolver o pedido em cache diretamente perdia o valor
  // booleano e era tratado como falha por showView(), reabrindo o aviso.
  let request = viewMarkupRequests.get(feature);
  if (!request) {
    request = Promise.all(views.map(async v => {
      const container = document.getElementById('view-' + v);
      if (!container || container.dataset.markupReady) return;
      const res = await fetch('/' + VIEW_MARKUP[v]);
      if (!res.ok) throw new Error(VIEW_MARKUP[v]);
      container.innerHTML = await res.text();
      container.dataset.markupReady = '1';
      // AppUI.enhanceSelects(document) só corre uma vez, no arranque — antes
      // deste fragmento existir. Sem isto, os <select data-enhance-select>
      // da vista ficavam por transformar (largura nativa, sem o dropdown
      // customizado) até algo mais os voltar a tocar.
      if (window.AppUI) AppUI.enhanceSelects(container);
    })).then(() => { if (window.lucide) lucide.createIcons(); });
    viewMarkupRequests.set(feature, request);
    // Uma falha não fica registada: o próximo pedido repete os fragmentos.
    request.catch(() => viewMarkupRequests.delete(feature));
  }
  return request.then(() => true).catch(() => {
    if (typeof AppModules.core.toast === 'function') {
      AppModules.core.toast('❌ Não foi possível carregar esta secção. Verifica a ligação e tenta novamente.', 'error');
    }
    return false;
  });
}

// Chama uma ação de outra funcionalidade, carregando-a primeiro. É o que
// permite ter no HTML botões que apontam para código que ainda não chegou —
// os atalhos de importação/exportação em Definições, por exemplo.
async function featureAction(name, ...args) {
  const feature = FEATURE_ACTIONS[name];
  if (!feature) throw new Error(`Ação não declarada no registo: ${name}`);
  // Um atalho pode chamar uma ação de uma funcionalidade cuja vista nunca foi
  // aberta (abrir a ficha de um hóspede a partir do dashboard, por exemplo):
  // garantir também a marcação, não só o código.
  const [featureOk, markupOk] = await Promise.all([ensureFeature(feature), ensureViewMarkup(feature)]);
  if (!featureOk || !markupOk) return undefined;
  return AppModules[feature][name](...args);
}

// Painel dentro da própria vista, com repetição explícita. É acrescentado ao
// lado do conteúdo (escondido por CSS) em vez de o substituir: trocar o
// innerHTML deitaria fora ouvintes que o núcleo já tinha ligado a campos
// dentro da vista.
function showFeatureLoadError(viewId, featureName, retry) {
  const view = document.getElementById('view-' + viewId);
  if (!view || view.querySelector(':scope > .feature-load-error')) return;
  const panel = document.createElement('div');
  panel.className = 'empty-state feature-load-error';
  panel.innerHTML = `
    <div class="es-icon">📡</div>
    <h3>Esta secção não carregou</h3>
    <p>Falhou o download do código de <strong>${featureName}</strong>. Verifica a ligação.</p>
    <button type="button" class="btn btn-primary" data-feature-retry>Tentar novamente</button>`;
  panel.querySelector('[data-feature-retry]').addEventListener('click', () => {
    clearFeatureLoadError(viewId);
    retry();
  });
  view.appendChild(panel);
  view.classList.add('view-module-failed');
}

function clearFeatureLoadError(viewId) {
  const view = document.getElementById('view-' + viewId);
  if (!view) return;
  view.querySelector(':scope > .feature-load-error')?.remove();
  view.classList.remove('view-module-failed');
}

})();
