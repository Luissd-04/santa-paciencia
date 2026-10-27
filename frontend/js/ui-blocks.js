// Estado privado; interface partilhada em AppModules.core.
(() => {
AppModules.define('core', {
  emptyStateHtml: { get: () => emptyStateHtml },
  monthAgendaHtml: { get: () => monthAgendaHtml },
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
 * Mês do telemóvel com o dia escolhido por baixo — o mesmo no Calendário e
 * nos Eventos. Um botão por dia com o número e pontos; tocar escolhe o dia
 * (`dayAttrs(date)` dá a ação de cada vista). Por baixo: título do dia, resumo em três
 * números e a lista desse dia.
 *
 * @param {{days: string[], selected: string, dayAttrs: (date: string) => string,
 *   info: (date: string) => {label: string, dots: string[]},
 *   summary: [string, number][], listHtml: string, emptyText: string}} opts
 *   `dots` é uma lista de cores (até 3); 'currentColor' é o ponto simples.
 * @returns {string} HTML
 */
function monthAgendaHtml({ days, selected, dayAttrs, info, summary, listHtml, emptyText }) {
  const esc = AppModules.core.escapeHtml;
  const today = window.ReservationDates.localIso(new Date());
  const firstWeekday = new Date(`${days[0]}T12:00:00`).getDay();
  const dateLabel = new Date(`${selected}T12:00:00`).toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' });
  const dotsHtml = dots => dots.length
    ? `<span class="agenda-date-dots" aria-hidden="true">${dots.slice(0, 3).map(color => `<span class="agenda-date-dot has-reservations" style="background:${esc(color)}"></span>`).join('')}</span>`
    : '<span class="agenda-date-dot" aria-hidden="true"></span>';
  return `
    <div class="agenda-month" role="group" aria-label="Selecionar dia do mês">
      <div class="agenda-month-weekdays" aria-hidden="true">${['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => `<span>${day}</span>`).join('')}</div>
      <div class="agenda-month-days">
        ${'<span aria-hidden="true"></span>'.repeat(firstWeekday)}
        ${days.map(date => {
          const day = info(date);
          return `<button type="button" class="agenda-date${date === today ? ' is-today' : ''}" data-agenda-date="${date}"
            aria-pressed="${date === selected}" ${date === today ? 'aria-current="date"' : ''}
            aria-label="${esc(day.label)}" ${dayAttrs(date)}>
            <span>${Number(date.slice(-2))}</span>${dotsHtml(day.dots)}
          </button>`;
        }).join('')}
      </div>
    </div>
    <div class="agenda-selected-heading">
      <h4>${esc(dateLabel)}</h4>
    </div>
    <div class="agenda-day-results" aria-live="polite" aria-atomic="true">
      <div class="agenda-day-summary">${summary.map(([label, count]) => `<div><span>${esc(label)}</span><strong>${count}</strong></div>`).join('')}</div>
      <div class="agenda-reservation-list">${listHtml || `<p class="agenda-day-empty">${esc(emptyText)}</p>`}</div>
    </div>`;
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
