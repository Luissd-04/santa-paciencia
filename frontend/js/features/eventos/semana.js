// Eventos na V2: vista Semana da maqueta. Faixa com os sete dias (pontos com
// a cor de cada tipo), a lista por hora do dia escolhido até ao fim da semana
// (tipo, responsável e caixa para marcar feito) e, ao lado, o mês pequeno e o
// resumo «Esta semana» por tipo. Os dados vêm do mesmo intervalo do
// calendário (eventos.js); na V1 esta vista não existe.
(() => {
AppModules.define('eventos', {
  moveSemana: { get: () => moveSemana },
  renderSemana: { get: () => renderSemana },
  semanaPeriod: { get: () => semanaPeriod },
});

const D = () => window.ReservationDates;
const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const WEEKDAYS_LONG = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
let selected = null;

const today = () => D().localIso(new Date());
const parts = iso => iso.split('-').map(Number);
const weekday = iso => { const [y, m, d] = parts(iso); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };

function selectedDay() {
  if (!selected) selected = today();
  return selected;
}

// Semana de segunda a domingo.
function weekDays(iso = selectedDay()) {
  const monday = D().addDays(iso, -((weekday(iso) + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => D().addDays(monday, i));
}

function monthGrid(iso = selectedDay()) {
  const [y, m] = parts(iso);
  const first = `${y}-${String(m).padStart(2, '0')}-01`;
  const start = D().addDays(first, -((weekday(first) + 6) % 7));
  const daysInMonth = new Date(y, m, 0).getDate();
  const cells = Math.ceil(((weekday(first) + 6) % 7 + daysInMonth) / 7) * 7;
  return Array.from({ length: cells }, (_, i) => D().addDays(start, i));
}

// Intervalo a carregar: a semana e o mês do dia escolhido.
function semanaPeriod() {
  const all = [...weekDays(), ...monthGrid()].sort();
  return { from: all[0], to: all[all.length - 1] };
}

function moveSemana(days) {
  selected = days ? D().addDays(selectedDay(), days) : today();
}

function dayTitle(iso) {
  const [, m, d] = parts(iso);
  const label = `${WEEKDAYS_LONG[weekday(iso)]}, ${d} ${MONTHS[m - 1].slice(0, 3)}`;
  if (iso === today()) return `Hoje · ${label}`;
  if (iso === D().addDays(today(), 1)) return `Amanhã · ${label}`;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function dotsHtml(list) {
  const colors = [...new Set(list.map(e => AppModules.eventos.eventoType(e.type).color))].slice(0, 3);
  return `<i class="ev2-dots" aria-hidden="true">${colors.map(c => `<s style="background:${c}"></s>`).join('')}</i>`;
}

function rowHtml(evento) {
  const core = AppModules.core;
  const esc = core.escapeHtml;
  const type = AppModules.eventos.eventoType(evento.type);
  const done = evento.status === 'concluido';
  const time = AppModules.eventos.eventoTime(evento).split(' - ')[0] || 'Dia todo';
  const sub = [evento.accommodation_name, evento.notes].filter(Boolean).map(esc).join(' · ');
  return `<div class="ev2-row${done ? ' is-done' : ''}" role="button" tabindex="0" ${core.KEY_ACTIVATE} ${AppActions.attrs('click', 'eventos-open-evento-modal-a2a7fbb', [String(evento.id)])}>
      <span class="ev2-time">${esc(time)}</span>
      <span class="ev2-type" style="--type:${type.color}" title="${esc(type.singular)}">${core.lcIcon(type.icon, 16)}</span>
      <span class="ev2-text"><b>${esc(evento.title)}</b>${sub ? `<small>${sub}</small>` : ''}</span>
      ${evento.responsible ? `<span class="v2-av ev2-who" title="${esc(evento.responsible)}">${esc(core.initials(evento.responsible))}</span>` : ''}
      <button type="button" class="ev2-check" role="checkbox" aria-checked="${done}" aria-label="${done ? 'Marcar por fazer' : 'Marcar feito'}"
        ${AppActions.attrs('click', 'eventos-v2-check', [String(evento.id)])}>${done ? core.lcIcon('check', 14) : ''}</button>
    </div>`;
}

function renderSemana() {
  const events = AppModules.eventos.eventosRows();
  const byDay = day => events.filter(e => e.date === day).sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
  const week = weekDays();
  const day = selectedDay();
  const [y, m] = parts(day);
  const now = today();

  const label = document.getElementById('ev2-label');
  if (label) {
    const [, m1, d1] = parts(week[0]);
    const [y2, m2, d2] = parts(week[6]);
    label.textContent = m1 === m2 ? `${d1} – ${d2} ${MONTHS[m2 - 1].slice(0, 3)} ${y2}` : `${d1} ${MONTHS[m1 - 1].slice(0, 3)} – ${d2} ${MONTHS[m2 - 1].slice(0, 3)} ${y2}`;
  }

  const strip = document.getElementById('ev2-week');
  if (strip) strip.innerHTML = week.map(iso => `<button type="button" class="ev2-wd${iso === day ? ' is-on' : ''}${iso === now ? ' is-today' : ''}"
      aria-pressed="${iso === day}" ${AppActions.attrs('click', 'eventos-v2-day', [iso])}>
      <span>${WEEKDAYS[weekday(iso)]}</span><b>${parts(iso)[2]}</b>${dotsHtml(byDay(iso))}</button>`).join('');

  const list = document.getElementById('ev2-days');
  if (list) {
    const days = week.slice(week.indexOf(day));
    list.innerHTML = days.map(iso => {
      const rows = byDay(iso);
      if (!rows.length && iso !== day) return '';
      return `<section class="ev2-day"><h4>${dayTitle(iso)}</h4>${rows.length ? rows.map(rowHtml).join('') : '<p class="ev2-empty">Sem tarefas neste dia.</p>'}</section>`;
    }).join('');
  }

  const month = document.getElementById('ev2-month');
  if (month) {
    month.innerHTML = `<div class="ev2-card-h"><h3>${MONTHS[m - 1].charAt(0).toUpperCase() + MONTHS[m - 1].slice(1)}</h3>
        <span><button type="button" class="ev2-nav" aria-label="Mês anterior" ${AppActions.attrs('click', 'eventos-v2-month', ['-1'])}>${AppModules.core.lcIcon('chevron-left', 15)}</button><button type="button" class="ev2-nav" aria-label="Mês seguinte" ${AppActions.attrs('click', 'eventos-v2-month', ['1'])}>${AppModules.core.lcIcon('chevron-right', 15)}</button></span></div>
      <div class="ev2-mini">${['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map(w => `<span class="ev2-mini-h">${w}</span>`).join('')}
        ${monthGrid().map(iso => `<button type="button" class="ev2-md${parts(iso)[1] !== m ? ' is-out' : ''}${iso === day ? ' is-on' : ''}${iso === now ? ' is-today' : ''}${byDay(iso).length ? ' has-ev' : ''}"
          ${AppActions.attrs('click', 'eventos-v2-day', [iso])} aria-label="${parts(iso)[2]} de ${MONTHS[parts(iso)[1] - 1]}">${parts(iso)[2]}</button>`).join('')}</div>`;
  }

  const summary = document.getElementById('ev2-summary');
  const weekEvents = events.filter(e => week.includes(e.date));
  if (summary) {
    const counts = AppModules.core.EVENT_TYPES.map(t => [t, weekEvents.filter(e => e.type === t.id).length]).filter(([, n]) => n);
    const max = Math.max(1, ...counts.map(([, n]) => n));
    const done = weekEvents.filter(e => e.status === 'concluido').length;
    summary.innerHTML = `<div class="ev2-card-h"><h3>Esta semana</h3><small>${done}/${weekEvents.length} feitas</small></div>
      ${counts.length ? counts.map(([t, n]) => `<div class="ev2-bar"><span><i style="background:${t.color}"></i>${t.label}</span><b>${n}</b><em><s style="width:${Math.round(n / max * 100)}%;background:${t.color}"></s></em></div>`).join('') : '<p class="ev2-empty">Sem tarefas esta semana.</p>'}`;
  }

  // Tipos de evento com o número desta semana (os mesmos filtros da V1).
  AppModules.eventos.renderEventosTypeChips(Object.fromEntries(AppModules.core.EVENT_TYPES.map(t => [t.id, weekEvents.filter(e => e.type === t.id).length])));
  if (window.lucide) lucide.createIcons();
}

AppActions.register({
  'eventos-v2-semana': () => { AppModules.eventos.setEventosView('semana') },
  // Voltar a desenhar pelo eventos.js: só pede ao servidor se o intervalo mudar.
  'eventos-v2-day': (el, event, args) => { selected = args[0]; AppModules.eventos.setEventosView('semana') },
  'eventos-v2-month': (el, event, args) => {
    const [y, m] = parts(selectedDay());
    const next = new Date(Date.UTC(y, m - 1 + Number(args[0]), 1));
    selected = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-01`;
    AppModules.eventos.setEventosView('semana');
  },
  'eventos-v2-check': (el, event, args) => { event.stopPropagation(); AppModules.eventos.toggleEventoStatus(args[0]) },
}, 'click');

AppModules.onReset('features/eventos/semana.js', () => { selected = null; });

})();
