// Nomes dos canais de reserva no backend (descrições do Google Calendar).
// Espelha CHANNELS em frontend/js/domain/channels.js; o teste
// test/channels.test.cjs falha se as duas listas se afastarem.
const CHANNEL_LABELS = {
  direto: 'Direto',
  booking: 'Booking.com',
  airbnb: 'Airbnb',
  longaventura: 'Longaventura',
  secretplaces: 'SecretPlaces',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  expedia: 'Expedia',
  vrbo: 'VRBO',
  website: 'Site',
  outro: 'Outro',
};
const channelLabel = id => CHANNEL_LABELS[id] || id || '';

module.exports = { CHANNEL_LABELS, channelLabel };
