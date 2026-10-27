// Menu do telemóvel escolhido por cada pessoa: ordem dos itens, os que estão
// escondidos e os atalhos da barra de baixo. Os itens existem no frontend
// (js/menu.js); aqui só se garante a forma e o tamanho, e o
// frontend ignora ids que já não conheça.
const { db } = require('../config/database');
const { httpError } = require('./httpError');

const ID = /^[a-z][a-z0-9_-]{0,39}$/;
const MAX_ITEMS = 40;
const BAR_SIZE = 5;

function idList(value, label, max) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > max) throw httpError(`${label}: lista inválida.`, 400);
  const seen = new Set();
  for (const id of value) {
    if (typeof id !== 'string' || !ID.test(id) || seen.has(id)) throw httpError(`${label}: item inválido.`, 400);
    seen.add(id);
  }
  return [...seen];
}

function normalize(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw httpError('Menu inválido.', 400);
  return {
    order: idList(input.order, 'Ordem', MAX_ITEMS),
    hidden: idList(input.hidden, 'Escondidos', MAX_ITEMS),
    bar: idList(input.bar, 'Barra de baixo', BAR_SIZE),
  };
}

// null = menu original (nunca editado ou reposto).
function get(userId, organizationId) {
  const row = db.prepare('SELECT menu_prefs FROM memberships WHERE user_id = ? AND organization_id = ? AND active = 1').get(userId, organizationId);
  if (!row?.menu_prefs) return null;
  try { return normalize(JSON.parse(row.menu_prefs)); } catch { return null; }
}

function save(userId, organizationId, input) {
  const prefs = input === null ? null : normalize(input);
  const result = db.prepare("UPDATE memberships SET menu_prefs = ?, updated_at = datetime('now') WHERE user_id = ? AND organization_id = ? AND active = 1")
    .run(prefs ? JSON.stringify(prefs) : null, userId, organizationId);
  if (!result.changes) throw httpError('Conta sem acesso a esta organização.', 403);
  return prefs;
}

module.exports = { get, save, normalize, BAR_SIZE };
