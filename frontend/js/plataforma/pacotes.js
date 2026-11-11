// Consola da plataforma: Pacotes e limites.
(() => {
AppModules.define('consola', {
  pacotes: { get: () => page },
});

const page = {
  async render(ctx) {
    ctx.host.innerHTML = '<div class="pl-page"><div class="v2-card v2-dense"><div class="v2-empty">Em construção.</div></div></div>';
  },
};
})();
