const fs = require('node:fs');
const path = require('node:path');
const acorn = require('acorn');
const walk = require('acorn-walk');
const scope = require('eslint-scope');
function checkFrontendModules(frontend) {
  const files = [];
  function collect(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'vendor') continue;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) collect(file);
      else if (file.endsWith('.js')) files.push(file);
    }
  }
  collect(path.join(frontend, 'js'));
  const exports = new Set(), imports = [], actions = new Map(), references = [], globals = new Set(), unresolved = [];
  const eventAttribute = /(?:^|\s)on(?:click|change|input|blur|focus|keydown|keyup|keypress|submit|dblclick|dragstart|dragend|dragover|dragleave|drop|pointerdown|mouseover|mouseout|load|error|mousedown|mouseenter|mouseleave)\s*=/i;
  function checkMarkup(text, where) {
    if (eventAttribute.test(text)) throw new Error(`${where}: evento HTML inline proibido`);
    for (const m of text.matchAll(/data-on-([a-z]+)=["']([\w-]+)["']/g)) references.push({ key: `${m[1]}/${m[2]}`, where });
  }
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8'), where = path.relative(frontend, file);
    const ast = acorn.parse(source, { ecmaVersion: 'latest', ranges: true });
    for (const node of ast.body) {
      if (['FunctionDeclaration', 'ClassDeclaration'].includes(node.type) ||
        (node.type === 'VariableDeclaration' && !node.declarations.every(d => ['AppActions', 'AppModules'].includes(d.id.name)))) {
        throw new Error(`${where}: estado/função fora do módulo`);
      }
    }
    for (const node of ast.body[0]?.expression?.callee?.body?.body || []) {
      if (node.type === 'FunctionDeclaration') globals.add(node.id.name);
      if (node.type === 'VariableDeclaration') for (const d of node.declarations) if (d.id.type === 'Identifier') globals.add(d.id.name);
    }
    const manager = scope.analyze(ast, { ecmaVersion: 2024, sourceType: 'script', optimistic: true, ignoreEval: true });
    for (const ref of manager.globalScope.through) unresolved.push({ name: ref.identifier.name, where });
    walk.simple(ast, {
      Literal(node) { if (typeof node.value === 'string') checkMarkup(node.value, where); },
      TemplateLiteral(node) { for (const q of node.quasis) checkMarkup(q.value.cooked || '', where); },
      MemberExpression(node) {
        if (node.object.type === 'MemberExpression' && node.object.object.name === 'AppModules' && !node.computed && !node.object.computed) {
          imports.push({ key: `${node.object.property.name}.${node.property.name}`, where });
        }
      },
      CallExpression(node) {
        if (node.callee.name === 'eval' || node.callee.name === 'Function') throw new Error(`${where}: execução dinâmica proibida`);
        if (node.callee.object?.name === 'AppModules' && node.callee.property.name === 'define') {
          for (const prop of node.arguments[1].properties) {
            const key = `${node.arguments[0].value}.${prop.key.name || prop.key.value}`;
            if (exports.has(key)) throw new Error(`${where}: exportação duplicada ${key}`);
            exports.add(key);
          }
        }
        if (node.callee.object?.name !== 'AppActions') return;
        if (node.callee.property.name === 'register') {
          for (const prop of node.arguments[0].properties) {
            const key = `${node.arguments[1]?.value || 'click'}/${prop.key.value || prop.key.name}`;
            if (actions.has(key)) throw new Error(`${where}: ação duplicada ${key}`);
            actions.set(key, where);
          }
        }
        if (node.callee.property.name === 'attrs') references.push({ key: `${node.arguments[0].value}/${node.arguments[1].value}`, where });
      },
      NewExpression(node) { if (node.callee.name === 'Function') throw new Error(`${where}: execução dinâmica proibida`); },
    });
  }
  for (const page of fs.readdirSync(frontend).filter(name => name.endsWith('.html'))) {
    const source = fs.readFileSync(path.join(frontend, page), 'utf8');
    checkMarkup(source, page);
    if (/<script\b(?![^>]*\bsrc=)[^>]*>\s*\S/i.test(source)) throw new Error(`${page}: script inline proibido`);
  }
  for (const ref of imports) if (!exports.has(ref.key)) throw new Error(`${ref.where}: interface inexistente ${ref.key}`);
  for (const ref of references) if (!actions.has(ref.key)) throw new Error(`${ref.where}: ação sem handler ${ref.key}`);
  // Um identificador conhecido da app não pode continuar a depender do global.
  for (const ref of unresolved) if (globals.has(ref.name) && !['AppActions', 'AppModules'].includes(ref.name)) {
    throw new Error(`${ref.where}: referência global à aplicação ${ref.name}`);
  }
  return { files: files.length, actions: actions.size, exports: exports.size };
}
module.exports = { checkFrontendModules };
if (require.main === module) console.log(checkFrontendModules(path.resolve(__dirname, '../../../frontend')));
