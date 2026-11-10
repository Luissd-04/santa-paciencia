// Fichas da mesma pessoa. O formulário público cria uma ficha por pedido (um
// email escrito num formulário não prova quem é a pessoa) e o pré-check-in
// pode criar cópias; aqui só se juntam para mostrar, sem tocar nos dados.
// Duas fichas são da mesma pessoa quando partilham um email real ou um
// telefone E o primeiro nome — um contacto partilhado (agência, família) não
// junta pessoas diferentes.
const { db } = require('../config/database');

const PLACEHOLDER = /@(reserva|sem-email)\.local$/i;

function firstName(guest) {
  const name = String(guest.first_name || guest.name || '').trim().split(/\s+/)[0] || '';
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function contactKeys(guest) {
  const keys = [];
  for (const email of [guest.email, guest.email_personal]) {
    const value = String(email || '').trim().toLowerCase();
    if (value && !PLACEHOLDER.test(value)) keys.push(`e:${value}`);
  }
  // Os últimos 9 dígitos: «+351 912 345 678» e «912345678» são o mesmo número.
  const digits = String(guest.phone || '').replace(/\D/g, '');
  if (digits.length >= 6) keys.push(`t:${digits.slice(-9)}`);
  return keys;
}

// { id → id do grupo } só para as fichas que têm outras da mesma pessoa.
function guestGroups(organizationId) {
  const rows = db.prepare(`SELECT id, name, first_name, email, email_personal, phone FROM guests
    WHERE organization_id = ? AND anonymized_at IS NULL`).all(organizationId);
  const parent = new Map(rows.map(r => [r.id, r.id]));
  const find = id => { while (parent.get(id) !== id) { parent.set(id, parent.get(parent.get(id))); id = parent.get(id); } return id; };
  const union = (a, b) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb); };
  const seen = new Map();
  for (const row of rows) {
    const name = firstName(row);
    if (!name) continue;
    for (const key of contactKeys(row)) {
      const bucket = `${key}|${name}`;
      if (seen.has(bucket)) union(seen.get(bucket), row.id);
      else seen.set(bucket, row.id);
    }
  }
  const size = new Map();
  for (const row of rows) { const root = find(row.id); size.set(root, (size.get(root) || 0) + 1); }
  const groups = new Map();
  for (const row of rows) { const root = find(row.id); if (size.get(root) > 1) groups.set(row.id, root); }
  return groups;
}

// Estadias (sem canceladas) e total de cada ficha, para as listas de fichas.
function guestSummaries(organizationId, ids) {
  if (!ids.length) return [];
  return db.prepare(`SELECT g.id, g.name, g.email, g.phone, COUNT(r.id) AS reservation_count, COALESCE(SUM(r.total_amount),0) AS total_spent, MAX(r.check_in) AS last_check_in
    FROM guests g LEFT JOIN reservations r ON r.guest_id = g.id AND r.organization_id = g.organization_id AND r.status != 'cancelada'
    WHERE g.organization_id = ? AND g.id IN (${ids.map(() => '?').join(',')})
    GROUP BY g.id ORDER BY reservation_count DESC, COALESCE(MAX(r.check_in), '') DESC, g.created_at DESC`).all(organizationId, ...ids);
}

// As outras fichas da mesma pessoa (para a ficha do hóspede).
function relatedGuests(organizationId, guestId) {
  const groups = guestGroups(organizationId);
  const group = groups.get(guestId);
  if (!group) return [];
  const ids = [...groups].filter(([id, root]) => root === group && id !== guestId).map(([id]) => id);
  return guestSummaries(organizationId, ids);
}

module.exports = { guestGroups, guestSummaries, relatedGuests, contactKeys, firstName };
