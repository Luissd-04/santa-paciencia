// Fonte única dos tipos de evento operacional no backend.
// Espelha EVENT_TYPES em frontend/js/eventos.js — ao adicionar um tipo novo,
// atualizar AQUI + eventos.js + o <select id="evento-type"> no index.html.
const EVENT_TYPES = [
  { id: 'limpeza',        label: 'Limpeza',        emoji: '🧹' },
  { id: 'reuniao',        label: 'Compromisso',    emoji: '👥' },
  { id: 'pequeno_almoco', label: 'Pequeno-almoço', emoji: '☕' },
  { id: 'checkin',        label: 'Check-in',       emoji: '🏨' },
  { id: 'checkout',       label: 'Check-out',      emoji: '🔑' },
  { id: 'manutencao',     label: 'Manutenção',     emoji: '🔧' },
  { id: 'agenda_local',   label: 'Agenda Local',   emoji: '🎉' },
  { id: 'outro',          label: 'Outro',          emoji: '📋' },
];

const VALID_EVENT_TYPES = new Set(EVENT_TYPES.map(t => t.id));

const EVENT_TYPE_LABELS = Object.fromEntries(EVENT_TYPES.map(t => [t.id, t.label]));

const EVENT_TYPE_EMOJIS = Object.fromEntries(EVENT_TYPES.map(t => [t.id, t.emoji]));

module.exports = { EVENT_TYPES, VALID_EVENT_TYPES, EVENT_TYPE_LABELS, EVENT_TYPE_EMOJIS };
