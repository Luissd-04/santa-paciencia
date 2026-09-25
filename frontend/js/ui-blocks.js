// Estado privado; interface partilhada em AppModules.core.
(() => {
AppModules.define('core', {
  emptyStateHtml: { get: () => emptyStateHtml },
  togglePageFilters: { get: () => togglePageFilters },
});

/* ═══════════════════════════════════════════════════════════════
   SANTA PACIÊNCIA — blocos de UI partilhados entre views
   Uma só implementação de cada peça de layout (drawer de filtros,
   ...) para todas as páginas ficarem uniformes. Ver o padrão de
   referência em #view-reservas.
═══════════════════════════════════════════════════════════════ */

/**
 * Abre/fecha o drawer de filtros avançados de uma view no desktop.
 * O mesmo painel funciona como bottom-sheet (.m-sheet) no mobile, aberto
 * pelo botão "Filtros" da barra mobile — este toggle só alterna a classe
 * .is-open, que só tem efeito visual em ≥601px.
 *
 * @param {string} panelId  id do elemento .page-filters
 * @param {HTMLElement} [btn]  o botão que disparou (para sincronizar aria-expanded)
 */
function togglePageFilters(panelId, btn) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  const open = !panel.classList.contains('is-open');
  panel.classList.toggle('is-open', open);
  const trigger = btn || document.querySelector('[aria-controls="' + panelId + '"]');
  if (trigger) trigger.setAttribute('aria-expanded', String(open));
  if (window.lucide) lucide.createIcons();
}

/**
 * Bloco de estado vazio uniforme — usa o componente partilhado .empty-state
 * (styles.css). Passar { inline: true } para a variante compacta usada dentro
 * de cartões/grelhas (.empty-state-inline).
 *
 * @param {string} icon   emoji/ícone
 * @param {string} title  título (fica em <h3>)
 * @param {string} [text] linha de apoio opcional (fica em <p>)
 * @param {{inline?: boolean}} [opts]
 * @returns {string} HTML
 */
function emptyStateHtml(icon, title, text, opts) {
  const cls = 'empty-state' + (opts && opts.inline ? ' empty-state-inline' : '');
  return `<div class="${cls}"><div class="es-icon">${icon}</div><h3>${title}</h3>${text ? `<p>${text}</p>` : ''}</div>`;
}

})();
