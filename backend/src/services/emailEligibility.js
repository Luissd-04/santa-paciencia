// Reavaliar também à saída da fila: a reserva pode ter sido cancelada entretanto.
// Mensagens agendadas pela estadia (chegada/saída) só fazem sentido para
// reservas aceites: um pedido por aprovar ou à espera do sinal não as recebe.
const STAY_STATUSES = ['confirmada', 'pre_checkin', 'check_in', 'check_out', 'checkin', 'checked_in'];
// Modelos que só fazem sentido para uma reserva cancelada.
const CANCELLATION_TEMPLATES = ['cancelamento', 'cancelamento_politica'];
function canSendTemplate(template, reservation) {
  if (!reservation) return false;
  if (CANCELLATION_TEMPLATES.includes(template.slug)) return reservation.status === 'cancelada';
  if (reservation.status === 'cancelada') return false;
  if (['checkin', 'checkout'].includes(template.timing_event) && !STAY_STATUSES.includes(reservation.status)) return false;
  const sensitive = template.slug === 'codigo_porta' ||
    /\{\{\s*(codigo_porta|door_code|wifi_password|password_wifi)\s*\}\}/i.test(`${template.subject || ''} ${template.body || ''}`);
  if (!sensitive) return true;
  return ['confirmada', 'check_in', 'checkin', 'checked_in'].includes(reservation.status) &&
    Math.round(Number(reservation.amount_paid || 0) * 100) >= Math.round(Number(reservation.total_amount || 0) * 100);
}

module.exports = { canSendTemplate, STAY_STATUSES, CANCELLATION_TEMPLATES };
