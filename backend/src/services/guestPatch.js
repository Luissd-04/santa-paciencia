const { db } = require('../config/database');
const { normalizeDateValue } = require('./reservationRules');
const fields = ['name', 'first_name', 'last_name', 'email', 'email_personal', 'phone', 'birth_date', 'birth_city', 'birth_country', 'nif', 'nationality', 'country', 'document_type', 'document_number', 'document_issuer_country', 'address', 'postal_code', 'city', 'residence_country', 'company', 'company_nif', 'is_favorite', 'is_vip', 'is_unwanted'];
function updateGuest(id, organizationId, patch) {
  const existing = db.prepare('SELECT * FROM guests WHERE id=? AND organization_id=?').get(id, organizationId);
  if (!existing) throw Object.assign(new Error('Hóspede não encontrado'), { status: 404 });
  const values = {};
  for (const key of fields) {
    if (patch[key] === undefined) continue;
    if (key.startsWith('is_')) {
      if (![true, false, 0, 1].includes(patch[key])) throw Object.assign(new Error('Classificação inválida'), { status: 400 });
      values[key] = patch[key] ? 1 : 0;
    } else {
      if (patch[key] !== null && typeof patch[key] !== 'string') throw Object.assign(new Error('Dados de hóspede inválidos'), { status: 400 });
      values[key] = patch[key]?.trim() || null;
      if (values[key]?.length > 2000) throw Object.assign(new Error('Dados demasiado longos'), { status: 400 });
    }
  }
  if ('first_name' in values || 'last_name' in values) {
    const merged = { ...existing, ...values };
    values.name = `${merged.first_name || ''} ${merged.last_name || ''}`.trim();
  }
  if ('name' in values && !values.name) throw Object.assign(new Error('Nome é obrigatório'), { status: 400 });
  if ('email' in values && !values.email) values.email = `guest_${id}@sem-email.local`;
  for (const key of ['email', 'email_personal']) if (values[key] && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(values[key])) throw Object.assign(new Error('Email inválido'), { status: 400 });
  if (values.birth_date && !normalizeDateValue(values.birth_date)) throw Object.assign(new Error('Data de nascimento inválida'), { status: 400 });
  const keys = Object.keys(values);
  if (keys.length) db.prepare(`UPDATE guests SET ${keys.map(key => key + '=?').join(',')}, updated_at=datetime('now') WHERE id=? AND organization_id=?`).run(...keys.map(key => values[key]), id, organizationId);
  return db.prepare('SELECT * FROM guests WHERE id=? AND organization_id=?').get(id, organizationId);
}
module.exports = { updateGuest };
