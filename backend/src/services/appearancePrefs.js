// Aspeto da aplicação escolhido por cada pessoa (Definições → Aparência):
// «atual» (V1), «classico» ou «vidro»; o vidro tem claro, escuro ou automático
// (segue o sistema). Guardado na conta, por isso acompanha a pessoa em todos os
// aparelhos e organizações.
const { db } = require('../config/database');
const { httpError } = require('./httpError');

const LOOKS = ['atual', 'classico', 'vidro'];
const MODES = ['auto', 'claro', 'escuro'];
const DEFAULT = Object.freeze({ look: 'atual', mode: 'auto' });

function normalize(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw httpError('Aparência inválida.', 400);
  const look = input.look ?? DEFAULT.look;
  const mode = input.mode ?? DEFAULT.mode;
  if (!LOOKS.includes(look)) throw httpError('Aspeto inválido.', 400);
  if (!MODES.includes(mode)) throw httpError('Modo inválido.', 400);
  return { look, mode };
}

function get(userId) {
  const row = db.prepare('SELECT appearance FROM users WHERE id = ?').get(userId);
  if (!row?.appearance) return { ...DEFAULT };
  try { return normalize(JSON.parse(row.appearance)); } catch { return { ...DEFAULT }; }
}

function save(userId, input) {
  const prefs = normalize(input);
  db.prepare("UPDATE users SET appearance = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(prefs), userId);
  return prefs;
}

module.exports = { get, save, normalize, LOOKS, MODES, DEFAULT };
