// Consola da plataforma: Comunicados aos clientes.
(() => {
AppModules.define('consola', {
  comunicados: { get: () => page },
});

const page = {
  async render(ctx) {
    ctx.host.innerHTML = '<div class="pl-page"><div class="v2-card v2-dense"><div class="v2-empty">Em construção.</div></div></div>';
  },
};
})();
