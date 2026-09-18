// Reavaliar também à saída da fila: a reserva pode ter sido cancelada entretanto.
function canSendTemplate(template, reservation) {
  if (!reservation) return false;
  if (reservation.status === 'cancelada') return template.slug === 'cancelamento';
  const sensitive = template.slug === 'codigo_porta' ||
    /\{\{\s*(codigo_porta|door_code|wifi_password|password_wifi)\s*\}\}/i.test(`${template.subject || ''} ${template.body || ''}`);
  if (!sensitive) return true;
  return ['confirmada', 'check_in', 'checkin', 'checked_in'].includes(reservation.status) &&
    Number(reservation.amount_paid || 0) >= Number(reservation.total_amount || 0);
}

module.exports = { canSendTemplate };
