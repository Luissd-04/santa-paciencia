// Páginas públicas: a versão nova é a única (19/11/2026). O atributo
// data-layout continua a ligar o CSS da versão nova (public-novo.css) e o
// código que a desenha (PublicLayout.isNew). Carregado no <head>, antes de a
// página ser desenhada, para não piscar.
(() => {
  document.documentElement.dataset.layout = 'novo';
  window.PublicLayout = Object.freeze({ name: 'novo', isNew: true });
})();
