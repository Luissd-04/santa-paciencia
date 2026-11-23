// Vistas predefinidas de cada pessoa (Definições → Vistas predefinidas): como
// abre cada ecrã, separado para computador e telemóvel. Guardado na conta
// (users.view_prefs), por isso acompanha a pessoa em todos os aparelhos.
// Forma: { ecrã: { desktop?, mobile? } }; só ficam as chaves definidas, o que
// falta usa o comportamento de origem da aplicação.
// Calendário usa «mes» ou «linha:7|14|30».
const { db } = require('../config/database');
const { httpError } = require('./httpError');

const DEVICES = ['desktop', 'mobile'];
const OPTIONS = Object.freeze({
  eventos: ['calendar', 'semana', 'list'],
  calendario: ['calendar', 'timeline:7', 'timeline:14', 'timeline:30'],
  reservas: ['operational', 'past'],
  hospedes: ['list', 'cards'],
  relatorios: ['faturamento', 'despesas', 'lucro'],
  inicio: ['dashboard', 'calendario', 'reservas', 'eventos'],
});
const DEFAULT = Object.freeze({});

function isPlain(value) { return value && typeof value === 'object' && !Array.isArray(value); }

function normalize(input) {
  if (!isPlain(input)) throw httpError('Vistas inválidas.', 400);
  const out = {};
  for (const [screen, devices] of Object.entries(input)) {
    if (!Object.hasOwn(OPTIONS, screen)) throw httpError('Ecrã inválido.', 400);
    if (!isPlain(devices)) throw httpError('Vistas inválidas.', 400);
    const clean = {};
    for (const [device, value] of Object.entries(devices)) {
      if (!DEVICES.includes(device)) throw httpError('Dispositivo inválido.', 400);
      if (value === null || value === undefined) continue;
      if (typeof value !== 'string' || !OPTIONS[screen].includes(value)) throw httpError('Vista inválida.', 400);
      clean[device] = value;
    }
    if (Object.keys(clean).length) out[screen] = clean;
  }
  return out;
}

function get(userId) {
  const row = db.prepare('SELECT view_prefs FROM users WHERE id = ?').get(userId);
  if (!row?.view_prefs) return {};
  try { return normalize(JSON.parse(row.view_prefs)); } catch { return {}; }
}

function save(userId, input) {
  const prefs = normalize(input);
  db.prepare("UPDATE users SET view_prefs = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(prefs), userId);
  return prefs;
}

module.exports = { get, save, normalize, OPTIONS, DEVICES, DEFAULT };
