// Dados do alojamento que só servem os emails e as páginas do hóspede:
// contactos, como chegar e entrar, o que fazer à saída e o link de avaliação.
// Gravam-se à parte do resto da ficha (accommodationController) e as suites
// herdam-nos do alojamento principal (accommodationInheritance).
const { db } = require('../config/database');
const { httpError } = require('./httpError');

const TEXT_LIMITS = Object.freeze({
  contact_email: 254, contact_phone: 40,
  arrival_instructions: 2000, entry_instructions: 2000, checkout_instructions: 2000,
  review_url: 2048,
});
const FIELDS = [...Object.keys(TEXT_LIMITS), 'no_wifi'];
const CONTROLS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

function normalize(body) {
  const out = {};
  for (const [field, max] of Object.entries(TEXT_LIMITS)) {
    if (body[field] === undefined) continue;
    const value = body[field] === null ? '' : body[field];
    if (typeof value !== 'string') throw httpError(`O campo ${field} tem de ser texto.`, 400);
    const trimmed = value.trim();
    if (trimmed.length > max) throw httpError(`O campo ${field} excede o limite de ${max} caracteres.`, 400);
    if (CONTROLS.test(trimmed)) throw httpError(`O campo ${field} contém caracteres inválidos.`, 400);
    out[field] = trimmed || null;
  }
  if (out.contact_email && !require('./authService').isValidEmail(out.contact_email)) throw httpError('O email de contacto não é válido.', 400);
  if (out.review_url && !/^https:\/\/[^\s]+$/i.test(out.review_url)) throw httpError('O link de avaliação tem de começar por https://', 400);
  if (body.no_wifi !== undefined) out.no_wifi = body.no_wifi ? 1 : 0;
  return out;
}

// Grava só os campos enviados. Uma unidade com alojamento principal herda-os:
// não os grava (como os restantes campos herdados).
function save(organizationId, id, body, { hasParent = false } = {}) {
  if (hasParent) return;
  const values = normalize(body || {});
  const fields = Object.keys(values);
  if (!fields.length) return;
  db.prepare(`UPDATE accommodations SET ${fields.map(f => `${f} = ?`).join(', ')} WHERE id = ? AND organization_id = ?`)
    .run(...fields.map(f => values[f]), id, organizationId);
}

module.exports = { FIELDS, TEXT_LIMITS, normalize, save };
