// Eventos declarativos: o HTML contém nomes de ações e argumentos JSON.
// Os handlers são funções registadas por cada módulo; nunca se avalia código
// vindo de atributos, dados de hóspedes ou conteúdo do servidor.
const AppActions = (() => {
  const handlers = new Map();
  const nonBubbling = new Set(['load', 'error', 'blur', 'focus', 'mouseenter', 'mouseleave']);
  const attribute = value => String(value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
  function report(error) {
    console.error('Não foi possível executar a ação.', error);
    if (typeof AppModules.core.toast === 'function') AppModules.core.toast('Não foi possível concluir a ação. Tenta novamente.', 'error');
  }
  function dispatch(event, type) {
    const path = nonBubbling.has(type) ? [event.target] : event.composedPath();
    for (const el of path) {
      if (!el?.getAttribute) continue;
      const name = el.getAttribute(`data-on-${type}`);
      const handler = handlers.get(type)?.get(name);
      if (handler) {
        try {
          const args = JSON.parse(el.getAttribute(`data-args-${type}`) || '[]');
          if (!Array.isArray(args)) throw new Error('Argumentos de ação inválidos.');
          // Handlers de arrasto e de calendário usam currentTarget para
          // encontrar o elemento da ação, não o listener no document.
          const scopedEvent = new Proxy(event, {
            get(target, key) {
              if (key === 'currentTarget') return el;
              const value = Reflect.get(target, key, target);
              return typeof value === 'function' ? value.bind(target) : value;
            },
          });
          const result = handler(el, scopedEvent, args);
          if (result === false) event.preventDefault();
          if (result?.catch) result.catch(report);
        } catch (error) { report(error); }
      }
      if (el.hasAttribute('data-stop')) event.stopPropagation();
      if (event.cancelBubble) break;
    }
  }
  function register(entries, type = 'click') {
    if (!handlers.has(type)) {
      handlers.set(type, new Map());
      document.addEventListener(type, event => dispatch(event, type), nonBubbling.has(type));
    }
    const bucket = handlers.get(type);
    for (const [name, handler] of Object.entries(entries)) {
      if (bucket.has(name)) throw new Error(`Ação duplicada: ${type}/${name}`);
      bucket.set(name, handler);
    }
  }
  function attrs(type, name, args = []) {
    return `data-on-${type}="${attribute(name)}" data-args-${type}="${attribute(JSON.stringify(args))}"`;
  }
  return Object.freeze({ register, attrs });
})();
