// Definições de cada organização (tabela organization_settings). Todos os
// módulos leem e gravam por aqui: os valores por omissão e a leitura de JSON
// ficam num só sítio.
const { db } = require('../config/database');
const { safeJson } = require('./json');

function get(organizationId, key, fallback = null) {
  const row = db.prepare('SELECT value FROM organization_settings WHERE organization_id = ? AND key = ?').get(organizationId, key);
  return row ? row.value : fallback;
}

// Valor JSON; um valor ausente ou ilegível devolve `fallback`.
function getJson(organizationId, key, fallback = null) {
  return safeJson(get(organizationId, key), fallback);
}

// Várias chaves de uma vez: { chave: valor } só com as que existem.
function getMany(organizationId, keys) {
  if (!keys.length) return {};
  const rows = db.prepare(`SELECT key, value FROM organization_settings WHERE organization_id = ? AND key IN (${keys.map(() => '?').join(',')})`)
    .all(organizationId, ...keys);
  return Object.fromEntries(rows.map(row => [row.key, row.value]));
}

// Objetos e listas são gravados como JSON.
function set(organizationId, key, value) {
  const stored = value !== null && typeof value === 'object' ? JSON.stringify(value) : value;
  db.prepare(`INSERT OR REPLACE INTO organization_settings (organization_id, key, value, updated_at)
    VALUES (?, ?, ?, datetime('now'))`).run(organizationId, key, stored);
  return value;
}

// Serviços extra (taxa turística, pequeno-almoço, ...), usados nos preços.
const services = organizationId => getJson(organizationId, 'services', []);

module.exports = { get, getJson, getMany, set, services };
