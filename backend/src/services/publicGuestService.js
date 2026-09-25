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
  return db.transaction(() => {
    // Reserva atomicamente o primeiro envio. Uma segunda chamada concorrente
    // falha sem alterar a ficha do hóspede.
    const claimed = db.prepare(`UPDATE reservations
      SET precheckin_submitted_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ? AND organization_id = ? AND precheckin_submitted_at IS NULL`)
      .run(reservation.id, reservation.organization_id);
    if (claimed.changes !== 1) {
      const error = new Error('Este pré check-in já foi submetido. Contacte o alojamento para corrigir os dados.');
      error.code = 'PRECHECKIN_ALREADY_SUBMITTED';
      throw error;
    }

    // As reservas atuais já têm uma ficha isolada. Links antigos podem apontar
    // para uma ficha partilhada; só nesse caso é criada uma cópia nova.
    const snapshot = JSON.parse(reservation.guest_snapshot || '{}');
    const references = db.prepare(`SELECT COUNT(*) AS total FROM reservations
      WHERE guest_id = ? AND organization_id = ?`).get(reservation.guest_id, reservation.organization_id)?.total || 0;
    let isolated;
    if (references <= 1) {
      const fields = ['name', 'email', 'first_name', 'last_name', 'birth_date', 'nationality',
        'country', 'document_type', 'document_number', 'document_issuer_country'];
      db.prepare(`UPDATE guests SET ${fields.map(field => `${field} = ?`).join(', ')}
        WHERE id = ? AND organization_id = ?`)
        .run(...fields.map(field => guest[field] || null), reservation.guest_id, reservation.organization_id);
      isolated = db.prepare('SELECT * FROM guests WHERE id = ? AND organization_id = ?')
        .get(reservation.guest_id, reservation.organization_id);
    } else {
      isolated = createReservationGuest(reservation.organization_id, { ...guest, phone: snapshot.phone || null });
    }
    if (!isolated) throw new Error('Não foi possível guardar a ficha do hóspede.');

    db.prepare(`UPDATE reservations SET guest_id = ?, guest_snapshot = ?, guests_data = ?,
      arrival_time = ?, status = CASE WHEN status = 'pre_checkin' THEN 'aguardar_pagamento' ELSE status END, updated_at = datetime('now')
      WHERE id = ? AND organization_id = ?`)
      .run(isolated.id, JSON.stringify({ name: guest.name, email: guest.email, phone: isolated.phone }),
        JSON.stringify(extraGuests), arrivalTime, reservation.id, reservation.organization_id);
    return isolated;
  })();
}

module.exports = { createReservationGuest, savePrecheckin };
