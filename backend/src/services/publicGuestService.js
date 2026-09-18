const { randomUUID } = require('crypto');
const { db } = require('../config/database');

// Um email declarado num formulário público não comprova a identidade.
// A ficha criada por este fluxo pertence apenas à reserva em causa.
function createReservationGuest(organizationId, guest) {
  const id = randomUUID();
  const fields = ['name', 'email', 'phone', 'first_name', 'last_name', 'birth_date',
    'nationality', 'country', 'document_type', 'document_number', 'document_issuer_country'];
  db.prepare(`INSERT INTO guests (id, organization_id, ${fields.join(',')})
    VALUES (?, ?, ${fields.map(() => '?').join(',')})`)
    .run(id, organizationId, ...fields.map(field => guest[field] || null));
  return db.prepare('SELECT * FROM guests WHERE id = ? AND organization_id = ?').get(id, organizationId);
}

function savePrecheckin(reservation, guest, extraGuests, arrivalTime) {
  db.transaction(() => {
    // Também isola links antigos que ainda apontam para uma ficha partilhada.
    const snapshot = JSON.parse(reservation.guest_snapshot || '{}');
    const isolated = createReservationGuest(reservation.organization_id, { ...guest, phone: snapshot.phone || null });
    db.prepare(`UPDATE reservations SET guest_id = ?, guest_snapshot = ?, guests_data = ?,
      arrival_time = ?, status = CASE WHEN status = 'pre_checkin' THEN 'aguardar_pagamento' ELSE status END, precheckin_submitted_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ? AND organization_id = ?`)
      .run(isolated.id, JSON.stringify({ name: guest.name, email: guest.email, phone: isolated.phone }),
        JSON.stringify(extraGuests), arrivalTime, reservation.id, reservation.organization_id);
  })();
}

module.exports = { createReservationGuest, savePrecheckin };
