// Fonte única dos tipos de evento operacional no backend.
// Espelha EVENT_TYPES em frontend/js/eventos.js — ao adicionar um tipo novo,
// atualizar AQUI + eventos.js + o <select id="evento-type"> no index.html.
const EVENT_TYPES = [
  { id: 'limpeza',        label: 'Limpeza',        emoji: '🧹', color: '#8B3A24' },
  { id: 'reuniao',        label: 'Compromisso',    emoji: '👥', color: '#4a7fa5' },
  { id: 'pequeno_almoco', label: 'Pequeno-almoço', emoji: '☕', color: '#c9a84c' },
  { id: 'checkin',        label: 'Check-in',       emoji: '🏨', color: '#4f8f6b' },
  { id: 'checkout',       label: 'Check-out',      emoji: '🔑', color: '#6f6bb3' },
  { id: 'manutencao',     label: 'Manutenção',     emoji: '🔧', color: '#c46a2d' },
  { id: 'agenda_local',   label: 'Agenda Local',   emoji: '🎉', color: '#b0468a' },
  { id: 'outro',          label: 'Outro',          emoji: '📋', color: '#8a8278' },
];

const VALID_EVENT_TYPES = new Set(EVENT_TYPES.map(t => t.id));

const EVENT_TYPE_LABELS = Object.fromEntries(EVENT_TYPES.map(t => [t.id, t.label]));

const EVENT_TYPE_EMOJIS = Object.fromEntries(EVENT_TYPES.map(t => [t.id, t.emoji]));

const EVENT_TYPE_COLORS = Object.fromEntries(EVENT_TYPES.map(t => [t.id, t.color]));

module.exports = { EVENT_TYPES, VALID_EVENT_TYPES, EVENT_TYPE_LABELS, EVENT_TYPE_EMOJIS, EVENT_TYPE_COLORS };
