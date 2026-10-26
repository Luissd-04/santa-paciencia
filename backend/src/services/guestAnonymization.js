// Anonimização de um hóspede que não pode ser apagado (as reservas têm
// movimentos de pagamento e são registo financeiro). Remove os dados pessoais
// do hóspede e das suas reservas; conserva datas, alojamento, montantes,
// pagamentos, tentativas e referências Stripe, faturação e auditoria.
// Pré-visualização obrigatória: aplicar exige o número de reservas mostrado.
const { db } = require('../config/database');
const { localDateIso } = require('./reservationRules');
const { recordHistory } = require('./reservationHistoryService');
const { recordAudit } = require('./auditLog');
const { safeJson } = require('./reservationSupport');

const fail = (message, status = 409) => { throw require('./httpError').httpError(message, status); };
const REMOVED = '[removido por anonimização]';
// Campos do hóspede apagados. `country` fica para estatísticas por país
// (decisão do responsável pelo produto; ver docs/OPERACOES.md).
const GUEST_FIELDS = ['first_name', 'last_name', 'phone', 'birth_date', 'nif', 'document_type', 'document_number', 'id_type',
  'nationality', 'address', 'postal_code', 'city', 'rgpd_consent_ip', 'email_personal', 'email_canal', 'birth_city',
  'document_issuer_country', 'company', 'birth_country', 'residence_country', 'company_nif'];

function scope(organizationId, guestId) {
  const guest = db.prepare('SELECT * FROM guests WHERE id = ? AND organization_id = ?').get(guestId, organizationId);
  if (!guest) fail('Hóspede não encontrado.', 404);
  const reservations = db.prepare('SELECT * FROM reservations WHERE guest_id = ? AND organization_id = ?').all(guestId, organizationId);
  const ids = reservations.map(r => r.id);
  const marks = ids.map(() => '?').join(',') || "''";
  const today = localDateIso();
  const blockers = [];
  if (guest.anonymized_at) blockers.push('O hóspede já foi anonimizado.');
  const active = reservations.filter(r => r.status !== 'cancelada' && String(r.check_out) >= today);
  if (active.length) blockers.push(`Tem ${active.length} reserva(s) ativa(s) ou futura(s). Só estadias terminadas ou canceladas podem ser anonimizadas.`);
  if (ids.length && db.prepare(`SELECT 1 FROM stripe_payment_attempts WHERE organization_id = ? AND reservation_id IN (${marks})
      AND state IN ('creating', 'open', 'processing') LIMIT 1`).get(organizationId, ...ids)) {
    blockers.push('Há um pagamento online em curso. Aguarde a conclusão ou a reconciliação.');
  }
  // Acompanhantes com ficha própria: anonimizados só se não forem titulares
  // nem acompanhantes noutras reservas.
  const companionIds = new Set();
  for (const r of reservations) for (const g of safeJson(r.guests_data, [])) if (g?.id && g.id !== guestId) companionIds.add(g.id);
  const companions = [...companionIds].filter(id => {
    if (db.prepare('SELECT 1 FROM reservations WHERE guest_id = ? AND organization_id = ? LIMIT 1').get(id, organizationId)) return false;
    return !db.prepare(`SELECT 1 FROM reservations r, json_each(CASE WHEN json_valid(r.guests_data) THEN r.guests_data ELSE '[]' END) j
      WHERE r.organization_id = ? AND r.guest_id != ? AND json_extract(j.value, '$.id') = ? LIMIT 1`).get(organizationId, guestId, id);
  });
  const count = sql => ids.length ? db.prepare(sql.replace('IN (?)', `IN (${marks})`)).get(organizationId, ...ids).n : 0;
  return {
    guest, reservations, ids, blockers, companions,
    preview: {
      reservations: ids.length,
      with_payments: count('SELECT COUNT(DISTINCT reservation_id) AS n FROM reservation_payments WHERE organization_id = ? AND reservation_id IN (?)'),
      companions_anonymized: companions.length,
      companions_kept: companionIds.size - companions.length,
      messages: count('SELECT COUNT(*) AS n FROM invoice_messages WHERE organization_id = ? AND reservation_id IN (?)'),
      history_entries: count("SELECT COUNT(*) AS n FROM reservation_history WHERE organization_id = ? AND reservation_id IN (?) AND changes LIKE '%\"notes\"%'"),
      kept: ['datas e alojamento', 'montantes e pagamentos', 'tentativas e referências Stripe', 'número/data de fatura', 'país do hóspede', 'auditoria'],
      blockers,
    },
  };
}

function previewAnonymization(organizationId, guestId) {
  return scope(organizationId, guestId).preview;
}

function anonymizeGuest(organizationId, guestId, userId, expectedReservations) {
  return db.transaction(() => {
    const { guest, reservations, ids, blockers, companions, preview } = scope(organizationId, guestId);
    if (blockers.length) fail(blockers.join(' '));
    if (Number(expectedReservations) !== ids.length) fail('As reservas do hóspede mudaram desde a pré-visualização. Reveja antes de anonimizar.');
    const now = new Date().toISOString();
    const placeholder = id => `anonimizado-${id}@sem-email.local`;
    const wipeGuest = (id, name) => db.prepare(`UPDATE guests SET name = ?, email = ?, ${GUEST_FIELDS.map(f => `${f} = NULL`).join(', ')},
      is_favorite = 0, is_vip = 0, is_unwanted = 0, anonymized_at = ?, updated_at = datetime('now')
      WHERE id = ? AND organization_id = ?`).run(name, placeholder(id), now, id, organizationId);
    wipeGuest(guest.id, 'Hóspede anonimizado');
    for (const id of companions) wipeGuest(id, 'Acompanhante anonimizado');

    for (const r of reservations) {
      const guestsData = safeJson(r.guests_data, []).map(g => (g?.id ? { id: g.id, name: 'Acompanhante anonimizado' } : { name: 'Acompanhante anonimizado' }));
      // Notas são texto livre (podem ter dados pessoais); as ligações públicas
      // deixam de abrir a reserva.
      db.prepare(`UPDATE reservations SET notes = NULL, guests_data = ?, guest_snapshot = NULL, public_token = NULL,
        precheckin_token = NULL, precheckin_token_expires_at = NULL, updated_at = datetime('now')
        WHERE id = ? AND organization_id = ?`).run(JSON.stringify(guestsData), r.id, organizationId);
      for (const entry of db.prepare("SELECT id, changes FROM reservation_history WHERE organization_id = ? AND reservation_id = ? AND changes IS NOT NULL").all(organizationId, r.id)) {
        const changes = safeJson(entry.changes, []);
        if (!Array.isArray(changes) || !changes.some(c => c?.field === 'notes')) continue;
        const scrubbed = changes.map(c => (c?.field === 'notes' ? { ...c, from: c.from ? REMOVED : c.from, to: c.to ? REMOVED : c.to } : c));
        db.prepare('UPDATE reservation_history SET changes = ? WHERE id = ?').run(JSON.stringify(scrubbed), entry.id);
      }
      recordHistory({ organizationId, reservationId: r.id, userId, action: 'guest_anonymized' });
    }
    if (ids.length) {
      const marks = ids.map(() => '?').join(',');
      // Mensagens enviadas: fica o registo (data, identificadores Gmail), sai o conteúdo.
      db.prepare(`UPDATE invoice_messages SET to_email = ?, to_name = NULL, subject = ?, body_html = ?
        WHERE organization_id = ? AND reservation_id IN (${marks})`).run(placeholder(guest.id), REMOVED, `<p>${REMOVED}</p>`, organizationId, ...ids);
      // Tentativas Stripe terminadas: o email do pedido sai; montantes e IDs ficam.
      for (const attempt of db.prepare(`SELECT id, request_json FROM stripe_payment_attempts WHERE organization_id = ? AND reservation_id IN (${marks})`).all(organizationId, ...ids)) {
        const request = safeJson(attempt.request_json, null);
        if (!request || typeof request !== 'object' || !('customer_email' in request)) continue;
        delete request.customer_email;
        db.prepare('UPDATE stripe_payment_attempts SET request_json = ? WHERE id = ?').run(JSON.stringify(request), attempt.id);
      }
    }
    recordAudit({ organizationId, userId, action: 'guest.anonymized', targetType: 'guest', targetId: guest.id,
      meta: { reservations: preview.reservations, with_payments: preview.with_payments, companions: companions.length, messages: preview.messages } });
    return preview;
  }).immediate();
}

module.exports = { previewAnonymization, anonymizeGuest };
