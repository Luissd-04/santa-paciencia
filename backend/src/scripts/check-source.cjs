const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
const frontend = path.join(root, 'frontend');
let checked = 0;
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', 'vendor', 'data', '.git'].includes(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.(?:js|cjs)$/.test(file)) {
      const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
      if (result.status) throw new Error(result.stderr);
      checked++;
    }
  }
}
walk(path.join(root, 'backend/src')); walk(frontend);

// ── Registo de funcionalidades ────────────────────────────────────────────
// js/domain/features.js só declara dados e funções: corre num contexto
// isolado para o registo ser lido daqui sem duplicar a lista.
const registry = fs.readFileSync(path.join(frontend, 'js/domain/features.js'), 'utf8');
const acorn = require('acorn');
const walkAst = require('acorn-walk');
const registryValues = {};
walkAst.simple(acorn.parse(registry, { ecmaVersion: 'latest' }), {
  VariableDeclarator(node) {
    if (['FEATURE_MODULES', 'VIEW_FEATURE', 'VIEW_MARKUP'].includes(node.id.name)) {
      registryValues[node.id.name] = vm.runInNewContext('(' + registry.slice(node.init.start, node.init.end) + ')');
    }
  },
});
const { FEATURE_MODULES, VIEW_FEATURE, VIEW_MARKUP } = registryValues;

// Ordem real de execução de uma funcionalidade: dependências primeiro.
function featureScripts(name, stack = []) {
  const feature = FEATURE_MODULES[name];
  if (!feature) throw new Error(`Funcionalidade desconhecida no registo: ${name}`);
  if (stack.includes(name)) throw new Error(`Dependências em ciclo: ${[...stack, name].join(' → ')}`);
  const order = [];
  for (const dep of feature.deps || []) order.push(...featureScripts(dep, [...stack, name]));
  order.push(...feature.scripts);
  return order;
}

const registryScripts = new Set();
for (const name of Object.keys(FEATURE_MODULES)) {
  for (const source of featureScripts(name)) {
    if (!fs.existsSync(path.join(frontend, source))) {
      throw new Error(`${name}: módulo inexistente ${source}`);
    }
    registryScripts.add(source);
  }
}

// ── Páginas ───────────────────────────────────────────────────────────────
const pageScripts = new Map();
for (const page of fs.readdirSync(frontend).filter(name => name.endsWith('.html'))) {
  const html = fs.readFileSync(path.join(frontend, page), 'utf8');
  const scripts = [];
  for (const match of html.matchAll(/<(script|link)\b[^>]*?(?:src|href)="([^"]+)"[^>]*>/g)) {
    const url = match[2];
    if (/^(?:https?:|data:|#)/.test(url)) continue;
    const source = url.replace(/^\//, '').split('?')[0];
    if (!fs.existsSync(path.join(frontend, source))) throw new Error(`${page}: recurso inexistente ${url}`);
    if (match[1] === 'script') scripts.push(source);
  }
  pageScripts.set(page, scripts);
  // Um módulo carregado pela vista não pode estar também no HTML: correria
  // duas vezes e a segunda rebentaria nas declarações `const`.
  if (page === 'index.html') {
    const duplicated = scripts.filter(source => registryScripts.has(source));
    if (duplicated.length) throw new Error(`index.html carrega módulos que já são carregados por vista: ${duplicated.join(', ')}`);
  }
  // Todos os scripts clássicos partilham o mesmo âmbito lexical no browser.
  // Em index.html isso inclui os módulos carregados a pedido, por isso são
  // verificados no mesmo âmbito: nomes repetidos entre eles dariam erro.
  const shared = page === 'index.html' ? [...scripts, ...registryScripts] : scripts;
  new vm.Script(shared.map(source => fs.readFileSync(path.join(frontend, source), 'utf8')).join('\n;\n'), { filename: page });
}

// Nenhum ficheiro do frontend pode ficar órfão: ou está numa página, ou está
// no registo de funcionalidades.
const referenced = new Set([...registryScripts, ...[...pageScripts.values()].flat()]);
function collectJs(directory) {
  const out = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'vendor') continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) out.push(...collectJs(file));
    else if (entry.name.endsWith('.js')) out.push(path.relative(frontend, file));
  }
  return out;
}
const orphans = collectJs(path.join(frontend, 'js')).filter(source => !referenced.has(source));
if (orphans.length) throw new Error(`Ficheiros sem quem os carregue: ${orphans.join(', ')}`);

// Cada vista declarada tem de existir no HTML e apontar para uma funcionalidade real.
const indexHtml = fs.readFileSync(path.join(frontend, 'index.html'), 'utf8');
for (const [view, feature] of Object.entries(VIEW_FEATURE)) {
  if (!FEATURE_MODULES[feature]) throw new Error(`Vista ${view} aponta para funcionalidade inexistente: ${feature}`);
  if (!indexHtml.includes(`id="view-${view}"`)) throw new Error(`Vista declarada sem marcação: view-${view}`);
}

// ── Handlers inline ───────────────────────────────────────────────────────
// Um onclick="algumaCoisa()" no HTML — ou gerado por um módulo — só funciona
// se a função já existir quando o utilizador carrega. Com carregamento por
// vista isso deixou de ser garantido: esta verificação percorre todos os
// handlers e confirma que cada função chamada pertence ao núcleo, à
// funcionalidade onde o handler vive, ou a uma dependência dela. Tudo o resto
// tem de passar por featureAction(), que carrega o módulo antes de chamar.

// Dono de cada nome global declarado ao nível de topo.
const symbolOwner = new Map();
function claimSymbols(source, tag) {
  const text = fs.readFileSync(path.join(frontend, source), 'utf8');
  for (const match of text.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)) {
    if (!symbolOwner.has(match[1])) symbolOwner.set(match[1], tag);
  }
  for (const match of text.matchAll(/^(?:let|const|var)\s+([A-Za-z_$][\w$]*)/gm)) {
    if (!symbolOwner.has(match[1])) symbolOwner.set(match[1], tag);
  }
}
const coreScripts = pageScripts.get('index.html');
coreScripts.forEach(source => claimSymbols(source, null));
for (const [name, feature] of Object.entries(FEATURE_MODULES)) {
  feature.scripts.forEach(source => claimSymbols(source, name));
}

// Cada ação declarada tem mesmo de existir na funcionalidade que a declara.
for (const [name, feature] of Object.entries(FEATURE_MODULES)) {
  for (const action of feature.actions || []) {
    if (symbolOwner.get(action) !== name) {
      throw new Error(`${name}: a ação declarada "${action}" não está definida nos scripts dessa funcionalidade`);
    }
  }
}

// Funcionalidades garantidamente carregadas quando `name` está carregada.
const loadedWith = new Map();
for (const name of Object.keys(FEATURE_MODULES)) {
  const closure = new Set();
  (function walk(current) {
    if (closure.has(current)) return;
    closure.add(current);
    (FEATURE_MODULES[current].deps || []).forEach(walk);
  })(name);
  loadedWith.set(name, closure);
}

function callsIn(handler) {
  return [...handler.matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)].map(match => match[1]);
}
function checkHandler(handler, context, where) {
  for (const called of callsIn(handler)) {
    const feature = symbolOwner.get(called);
    if (!feature) continue;                       // núcleo, global do browser ou local
    if (context && loadedWith.get(context).has(feature)) continue;
    throw new Error(
      `${where}: ${called}() pertence a "${feature}", que pode não estar carregada aqui` +
      `${context ? ` (contexto: "${context}")` : ' (contexto: núcleo)'}` +
      ` — usar featureAction('${called}', …) ou um atalho do núcleo`);
  }
}

// HTML: o contexto de um handler é a funcionalidade da vista (ou do modal com
// data-feature) em que está, tendo em conta o aninhamento real dos elementos.
const VOID_ELEMENTS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const HANDLER = /\son[a-z]+\s*=\s*("([^"]*)"|'([^']*)')/gi;
function checkInlineHandlers(html, page) {
  const stack = [];
  const tag = /<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  for (const match of html.matchAll(tag)) {
    const [, closing, rawName, attributes, selfClosing] = match;
    const name = rawName.toLowerCase();
    if (closing) {
      const at = stack.map(entry => entry.tag).lastIndexOf(name);
      if (at !== -1) stack.length = at;
      continue;
    }
    const viewId = /\bid\s*=\s*"view-([\w-]+)"/.exec(attributes)?.[1];
    const marked = /\bdata-feature\s*=\s*"([\w-]+)"/.exec(attributes)?.[1];
    const own = marked || (viewId ? VIEW_FEATURE[viewId] : undefined);
    if (marked && !FEATURE_MODULES[marked]) throw new Error(`${page}: data-feature desconhecido "${marked}"`);
    const context = own || stack[stack.length - 1]?.context || null;
    const line = html.slice(0, match.index).split('\n').length;
    for (const handler of attributes.matchAll(HANDLER)) {
      checkHandler(handler[2] ?? handler[3], context, `${page}:${line}`);
    }
    if (!VOID_ELEMENTS.has(name) && !selfClosing) stack.push({ tag: name, context });
  }
}
checkInlineHandlers(indexHtml, 'index.html');

// ── Marcação de vista carregada em runtime ──────────────────────────────
// O contentor #view-<id> fica vazio no index.html; o fragmento em
// frontend/views/<id>.html é pedido e injetado por ensureViewMarkup() na
// primeira abertura. Sem o elemento a envolvê-lo no HTML estático, o
// contexto de cada handler é imposto aqui (a funcionalidade da própria
// vista), reaproveitando checkInlineHandlers com um invólucro sintético.
for (const [viewId, relPath] of Object.entries(VIEW_MARKUP)) {
  if (!indexHtml.includes(`id="view-${viewId}"`)) throw new Error(`VIEW_MARKUP: vista sem marcação em index.html: ${viewId}`);
  const feature = VIEW_FEATURE[viewId];
  if (!feature) throw new Error(`VIEW_MARKUP: vista sem funcionalidade correspondente: ${viewId}`);
  const filePath = path.join(frontend, relPath);
  if (!fs.existsSync(filePath)) throw new Error(`VIEW_MARKUP: fragmento inexistente ${relPath}`);
  const fragment = fs.readFileSync(filePath, 'utf8');
  checkInlineHandlers(`<div data-feature="${feature}">${fragment}</div>`, relPath);
}

// JavaScript: o contexto é a funcionalidade dona do ficheiro que gera o handler.
for (const [source, feature] of [
  ...coreScripts.map(name => [name, null]),
  ...Object.entries(FEATURE_MODULES).flatMap(([name, f]) => f.scripts.map(script => [script, name])),
]) {
  const text = fs.readFileSync(path.join(frontend, source), 'utf8');
  for (const handler of text.matchAll(HANDLER)) {
    const line = text.slice(0, handler.index).split('\n').length;
    checkHandler(handler[2] ?? handler[3], feature, `${source}:${line}`);
  }
}

// ── Bibliotecas opcionais ─────────────────────────────────────────────────
const libraries = fs.readFileSync(path.join(frontend, 'js/domain/libraries.js'), 'utf8');
for (const match of libraries.matchAll(/"url": "(\/[^"?#]+)"/g)) {
  if (!fs.existsSync(path.join(frontend, match[1]))) throw new Error(`Recurso opcional inexistente: ${match[1]}`);
}

// ── Bibliotecas externas ──────────────────────────────────────────────────
// frontend/package.json não instala nada: declara as versões que a app carrega
// por CDN para o `npm audit` as cobrir. Só serve para alguma coisa se
// continuar a corresponder aos URLs do código.
const declared = JSON.parse(fs.readFileSync(path.join(frontend, 'package.json'), 'utf8')).dependencies;
const cdnPatterns = [
  /cdn\.jsdelivr\.net\/npm\/([a-z0-9.@\/-]+?)@(\d[\w.-]*)\//g,
  /unpkg\.com\/([a-z0-9.@\/-]+?)@(\d[\w.-]*)\//g,
  /cdnjs\.cloudflare\.com\/ajax\/libs\/([a-z0-9.-]+)\/(\d[\w.-]*)\//g,
];
const seenLibraries = new Set();
function checkLibraryVersions(source, label) {
  for (const pattern of cdnPatterns) {
    for (const match of source.matchAll(pattern)) {
      const [, name, version] = match;
      if (!(name in declared)) continue;
      seenLibraries.add(name);
      if (declared[name] !== version) {
        throw new Error(`${label}: ${name}@${version} não corresponde a frontend/package.json (${declared[name]})`);
      }
    }
  }
}
function collectFiles(directory, extensions) {
  const out = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) out.push(...collectFiles(file, extensions));
    else if (extensions.some(extension => entry.name.endsWith(extension))) out.push(file);
  }
  return out;
}
for (const file of [...collectFiles(frontend, ['.html']), ...collectFiles(path.join(frontend, 'js'), ['.js'])]) {
  if (file.includes(`${path.sep}vendor${path.sep}`)) continue;
  checkLibraryVersions(fs.readFileSync(file, 'utf8'), path.relative(frontend, file));
}
const unused = Object.keys(declared).filter(name => !seenLibraries.has(name));
if (unused.length) throw new Error(`frontend/package.json declara bibliotecas que o código já não carrega: ${unused.join(', ')}`);

// ── Manifesto dos módulos divididos ───────────────────────────────────────
// A ordem registada tem de ser a ordem real de execução: no HTML para as
// páginas que ainda carregam tudo de uma vez, no registo para as restantes.
const manifest = JSON.parse(fs.readFileSync(path.join(frontend, 'js/features/manifest.json'), 'utf8'));
for (const [entry, feature] of Object.entries(manifest)) {
  const order = feature.page
    ? pageScripts.get(feature.page)
    : featureScripts(Object.keys(FEATURE_MODULES).find(name => FEATURE_MODULES[name].scripts.includes(entry)));
  if (!order) throw new Error(`Manifesto: ${entry} não é carregado por nenhuma página nem funcionalidade`);
  let previous = -1;
  for (const source of feature.scripts) {
    const index = order.indexOf(source);
    if (index <= previous) throw new Error(`Ordem de scripts inválida: ${source}`);
    previous = index;
  }
}

// ── Service worker ────────────────────────────────────────────────────────
// O pré-cache do arranque é só o núcleo; os módulos por vista entram em cache
// quando forem pedidos pela primeira vez (network-first no fetch).
const worker = fs.readFileSync(path.join(frontend, 'service-worker.js'), 'utf8');
const precached = new Set(
  [...worker.slice(worker.indexOf('const STATIC_ASSETS'), worker.indexOf('const FEATURE_ASSETS')).matchAll(/'(\/[^']+)'/g)]
    .map(match => match[1].replace(/^\//, ''))
);
const featureAssets = new Set(
  [...worker.slice(worker.indexOf('const FEATURE_ASSETS'), worker.indexOf('const VIEW_ASSETS')).matchAll(/'(\/js\/[^']+)'/g)]
    .map(match => match[1].replace(/^\//, ''))
);
const viewAssets = new Set(
  [...worker.slice(worker.indexOf('const VIEW_ASSETS')).matchAll(/'(\/views\/[^']+)'/g)]
    .map(match => match[1].replace(/^\//, ''))
);
for (const source of pageScripts.get('index.html')) {
  if (!precached.has(source)) throw new Error(`Service worker: falta o núcleo no pré-cache — ${source}`);
}
for (const source of registryScripts) {
  if (precached.has(source)) throw new Error(`Service worker: módulo por vista no pré-cache do arranque — ${source}`);
  if (!featureAssets.has(source)) throw new Error(`Service worker: módulo por vista fora de FEATURE_ASSETS — ${source}`);
}
for (const source of featureAssets) {
  if (!registryScripts.has(source)) throw new Error(`Service worker: FEATURE_ASSETS lista um ficheiro que já não é carregado por vista — ${source}`);
}
const viewMarkupPaths = new Set(Object.values(VIEW_MARKUP));
for (const relPath of viewMarkupPaths) {
  if (precached.has(relPath)) throw new Error(`Service worker: fragmento de vista no pré-cache do arranque — ${relPath}`);
  if (!viewAssets.has(relPath)) throw new Error(`Service worker: fragmento de vista fora de VIEW_ASSETS — ${relPath}`);
}
for (const relPath of viewAssets) {
  if (!viewMarkupPaths.has(relPath)) throw new Error(`Service worker: VIEW_ASSETS lista um fragmento que já não está em VIEW_MARKUP — ${relPath}`);
}

require('./check-frontend-modules.cjs').checkFrontendModules(frontend);

console.log(`${checked} ficheiros JavaScript: sintaxe válida; recursos HTML, registo de funcionalidades (${Object.keys(FEATURE_MODULES).length}), ordem dos módulos, ações registadas, listas do service worker e versões das bibliotecas externas verificados.`);
