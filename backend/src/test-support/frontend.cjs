// Testes unitários de funções com dependências substituídas. Expõe apenas no
// VM de teste as variáveis da closure, para permitir os stubs dos testes
// anteriores. O navegador e os testes de módulos usam as interfaces reais.
const vm = require('node:vm');
const acorn = require('acorn');
function runFrontend(source, context) {
  if (!context.AppModules) {
    const interfaces = new Map();
    const namespace = name => {
      if (!interfaces.has(name)) interfaces.set(name, new Proxy({}, {
        get(target, key) { return key in target ? target[key] : context[key]; },
        set(target, key, value) { if (key in target) target[key] = value; else context[key] = value; return true; },
      }));
      return interfaces.get(name);
    };
    context.AppModules = new Proxy({
      define(name, members) {
        for (const descriptor of Object.values(members)) descriptor.configurable = true;
        Object.defineProperties(namespace(name), members);
      },
      onReset() {},
    }, { get(target, key) { return key in target ? target[key] : namespace(key); } });
    context.AppActions ??= {
      register() {},
      attrs(type, name, args) {
        const esc = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
        return `data-on-${type}="${esc(name)}" data-args-${type}="${esc(JSON.stringify(args))}"`;
      },
    };
    context.__exposeUnit = members => {
      for (const descriptor of Object.values(members)) descriptor.configurable = true;
      Object.defineProperties(context, members);
    };
  }
  if (!source.startsWith('// Estado privado;')) return vm.runInContext(source, context);
  const ast = acorn.parse(source, { ecmaVersion: 'latest' });
  const wrapper = ast.body[0].expression.callee;
  const members = [];
  for (const node of wrapper.body.body) {
    if (node.type === 'FunctionDeclaration') members.push(`${node.id.name}: {get:()=>${node.id.name},set:v=>${node.id.name}=v}`);
    if (node.type === 'VariableDeclaration') for (const d of node.declarations) if (d.id.type === 'Identifier') {
      members.push(`${d.id.name}: {get:()=>${d.id.name}${node.kind === 'const' ? '' : `,set:v=>${d.id.name}=v`}}`);
    }
  }
  const at = wrapper.body.start + 1;
  source = source.slice(0, at) + `\n__exposeUnit({${members.join(',')}});\n` + source.slice(at);
  return vm.runInContext(source, context);
}
module.exports = { runFrontend };
