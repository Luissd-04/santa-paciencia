// Endereços de marcador criados quando o hóspede não tem email (reservas do
// backoffice e acompanhantes): nunca recebem mensagens, que seriam devolvidas
// à caixa do alojamento.
const PLACEHOLDER_EMAIL = /@(reserva|sem-email)\.local$/i;
function isPlaceholderEmail(email) {
  return PLACEHOLDER_EMAIL.test(String(email || '').trim());
}
function isDeliverableEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && !isPlaceholderEmail(email);
}
module.exports = { isPlaceholderEmail, isDeliverableEmail };
