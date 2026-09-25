// Estado privado; interface partilhada em AppModules.core.
(() => {
AppModules.define('core', {
  EVENT_TYPES: { get: () => EVENT_TYPES },
});

// Tipos de evento operacional — fonte única no frontend.
// Vive no núcleo (e não em eventos.js) porque o detalhe da reserva também
// desenha o separador de tarefas a partir daqui, sem carregar a vista Eventos.
const EVENT_TYPES = [
  { id: 'limpeza', label: 'Limpezas', singular: 'Limpeza', icon: 'brush-cleaning', color: '#8B3A24' },
  { id: 'reuniao', label: 'Compromissos', singular: 'Compromisso', icon: 'calendar-check', color: '#4a7fa5' },
  { id: 'pequeno_almoco', label: 'Pequenos-almoços', singular: 'Pequeno-almoço', icon: 'coffee', color: '#c9a84c' },
  { id: 'checkin', label: 'Check-ins', singular: 'Check-in', icon: 'log-in', color: '#4f8f6b' },
  { id: 'checkout', label: 'Check-outs', singular: 'Check-out', icon: 'log-out', color: '#6f6bb3' },
  { id: 'manutencao', label: 'Manutenção', singular: 'Manutenção', icon: 'wrench', color: '#c46a2d' },
  { id: 'agenda_local', label: 'Agenda Local', singular: 'Evento local', icon: 'party-popper', color: '#b0468a' },
  { id: 'outro', label: 'Outros', singular: 'Outro', icon: 'circle-dot', color: '#8a8278' },
];

})();
