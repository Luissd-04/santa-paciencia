// Fichas de hóspede: criar, reencontrar, atualizar e acompanhantes. O
// backoffice, a reserva pública, o pré-check-in e a página de hóspedes usam
// estas funções em vez de escrever na tabela guests cada um à sua maneira.
const { randomUUID } = require('crypto');
const { httpError } = require('./httpError');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../config/database');
const { normalizeDateValue } = require('./reservationRules');

const GUEST_FIELDS = ['name', 'email', 'email_personal', 'phone', 'first_name', 'last_name', 'birth_date',
  'nationality', 'country', 'document_type', 'document_number', 'document_issuer_country',
  'birth_city', 'birth_country', 'address', 'postal_code', 'city', 'residence_country',
  'nif', 'company', 'company_nif'];

// Hóspede sem email: um marcador que nunca recebe mensagens (emailAddress
// reconhece também o formato antigo @reserva.local).
const placeholderEmail = (id = randomUUID()) => `guest_${id}@sem-email.local`;

const load = (organizationId, id) => db.prepare('SELECT * FROM guests WHERE id = ? AND organization_id = ?').get(id, organizationId);

// Ficha nova, só desta reserva (um email num formulário público não comprova
// a identidade de quem já está na base).
function insertGuest(organizationId, guest) {
  const id = randomUUID();
  db.prepare(`INSERT INTO guests (id, organization_id, ${GUEST_FIELDS.join(',')})
    VALUES (?, ?, ${GUEST_FIELDS.map(() => '?').join(',')})`)
    .run(id, organizationId, ...GUEST_FIELDS.map(field => guest[field] || null));
  return load(organizationId, id);
}

// Backoffice: reencontra a ficha pelo email e completa-a sem apagar dados
// (campos vazios não substituem os guardados).
function upsertByEmail(organizationId, guest = {}) {
  const email = guest.email?.trim() || placeholderEmail();
  const existing = db.prepare('SELECT * FROM guests WHERE email = ? AND organization_id = ?').get(email, organizationId);
  if (!existing) return insertGuest(organizationId, { ...guest, name: guest.name?.trim() || 'Hóspede', email });
  const fields = GUEST_FIELDS.filter(field => !['email', 'email_personal'].includes(field));
  db.prepare(`UPDATE guests SET ${fields.map(field => `${field} = COALESCE(?, ${field})`).join(', ')}
    WHERE id = ? AND organization_id = ?`).run(...fields.map(field => guest[field] || null), existing.id, organizationId);
  return load(organizationId, existing.id);
}

const PATCH_FIELDS = ['name', 'first_name', 'last_name', 'email', 'email_personal', 'phone', 'birth_date', 'birth_city', 'birth_country', 'nif', 'nationality', 'country', 'document_type', 'document_number', 'document_issuer_country', 'address', 'postal_code', 'city', 'residence_country', 'company', 'company_nif', 'is_favorite', 'is_vip', 'is_unwanted'];
function updateGuest(id, organizationId, patch) {
  const existing = db.prepare('SELECT * FROM guests WHERE id=? AND organization_id=?').get(id, organizationId);
  if (!existing) throw httpError('Hóspede não encontrado', 404);
  const values = {};
  for (const key of PATCH_FIELDS) {
    if (patch[key] === undefined) continue;
    if (key.startsWith('is_')) {
      if (![true, false, 0, 1].includes(patch[key])) throw httpError('Classificação inválida', 400);
      values[key] = patch[key] ? 1 : 0;
    } else {
      if (patch[key] !== null && typeof patch[key] !== 'string') throw httpError('Dados de hóspede inválidos', 400);
      values[key] = patch[key]?.trim() || null;
      if (values[key]?.length > 2000) throw httpError('Dados demasiado longos', 400);
    }
  }
  if ('first_name' in values || 'last_name' in values) {
    const merged = { ...existing, ...values };
    values.name = `${merged.first_name || ''} ${merged.last_name || ''}`.trim();
  }
  if ('name' in values && !values.name) throw httpError('Nome é obrigatório', 400);
  if ('email' in values && !values.email) values.email = placeholderEmail(id);
  for (const key of ['email', 'email_personal']) if (values[key] && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(values[key])) throw httpError('Email inválido', 400);
  if (values.birth_date && !normalizeDateValue(values.birth_date)) throw httpError('Data de nascimento inválida', 400);
  const keys = Object.keys(values);
  if (keys.length) db.prepare(`UPDATE guests SET ${keys.map(key => key + '=?').join(',')}, updated_at=datetime('now') WHERE id=? AND organization_id=?`).run(...keys.map(key => values[key]), id, organizationId);
  return db.prepare('SELECT * FROM guests WHERE id=? AND organization_id=?').get(id, organizationId);
}
// Acompanhantes: a ficha é reencontrada pelo id devolvido na gravação anterior
// e, só depois, por um email real. O email do hóspede principal (comum em
// famílias) nunca identifica um acompanhante — atualizá-lo renomearia o titular.
function upsertAdditionalGuests(guestsData, organizationId, mainGuestId = null) {
  if (!Array.isArray(guestsData) || !guestsData.length) return guestsData || [];
  return guestsData.map(g => {
    if (!g?.name) return g;
    const realEmail = g.email?.trim() || null;
    let existing = g.id && g.id !== mainGuestId
      ? db.prepare('SELECT id FROM guests WHERE id = ? AND organization_id = ?').get(g.id, organizationId)
      : null;
    if (!existing && realEmail) {
      existing = db.prepare('SELECT id FROM guests WHERE email = ? AND organization_id = ? AND id != ?').get(realEmail, organizationId, mainGuestId || '');
    }
    const email = realEmail || placeholderEmail();
    if (existing) {
      db.prepare(`UPDATE guests SET
        name = COALESCE(?, name), phone = COALESCE(?, phone),
        nationality = COALESCE(?, nationality), country = COALESCE(?, country),
        birth_date = COALESCE(?, birth_date), birth_city = COALESCE(?, birth_city),
        document_type = COALESCE(?, document_type), document_number = COALESCE(?, document_number),
        document_issuer_country = COALESCE(?, document_issuer_country),
        nif = COALESCE(?, nif), updated_at = datetime('now')
        WHERE id = ? AND organization_id = ?
      `).run(g.name || null, g.phone || null, g.nationality || null, g.country || null,
             g.birth_date || null, g.birth_city || null, g.document_type || null,
             g.document_number || null, g.document_issuer_country || null, g.nif || null,
             existing.id, organizationId);
      return { ...g, id: existing.id };
    }
    const newId = uuidv4();
    const nameParts = (g.name || '').split(/\s+/);
    db.prepare(`INSERT INTO guests
      (id, organization_id, name, first_name, last_name, email, phone,
       nationality, country, birth_date, birth_city,
       document_type, document_number, document_issuer_country, nif)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(newId, organizationId, g.name,
           g.first_name || nameParts[0] || '', g.last_name || nameParts.slice(1).join(' ') || '',
           email, g.phone || null,
           g.nationality || null, g.country || null, g.birth_date || null, g.birth_city || null,
           g.document_type || null, g.document_number || null, g.document_issuer_country || null,
           g.nif || null);
    return { ...g, id: newId };
  });
}

module.exports = { GUEST_FIELDS, placeholderEmail, insertGuest, upsertByEmail, updateGuest, upsertAdditionalGuests };
