// Interfaces explícitas entre funcionalidades. Cada ficheiro conserva o seu
// estado numa closure; só publica os membros usados por outros módulos.
const AppModules = (() => {
  const modules = Object.fromEntries([
    'core', 'reservas', 'calendario', 'eventos', 'hospedes', 'alojamentos',
    'bloqueios', 'despesas', 'relatorios', 'precos', 'invoice', 'definicoes',
    'vouchers', 'booking', 'precheckin', 'demo',
  ].map(name => [name, Object.create(null)]));
  const resets = new Map();
  let sessionVersion = 0;
  Object.defineProperties(modules, {
    define: { value(name, members) {
      if (!Object.hasOwn(modules, name)) throw new Error(`Módulo desconhecido: ${name}`);
      Object.defineProperties(modules[name], members);
    } },
    onReset: { value(name, reset) { resets.set(name, reset); } },
    resetPrivateState: { value() {
      sessionVersion++;
      for (const reset of resets.values()) reset();
    } },
    sessionVersion: { get: () => sessionVersion },
  });
  return Object.freeze(modules);
})();
