// Dados do portal do hóspede (/reserva/:token) além do estado da reserva:
// marca do alojamento (logótipo, cor), primeiro nome, horas, como chegar,
// como entrar, saída, avaliação e, perto da chegada, o código da porta e o
// Wi-Fi. Só campos pensados para o hóspede: nada de notas internas, dados de
// outros hóspedes ou campos da equipa.
//
// Código da porta, Wi-Fi e instruções de entrada seguem a regra do email
// «Tudo para a sua chegada» (coordenadas): reserva confirmada e paga na
// totalidade (emailEligibility.canSendTemplate, a mesma condição dos códigos
// nos emails) e só da véspera da entrada até ao dia da saída (o email sai
// 1 dia antes do check-in). Fora disso, o servidor nem os envia.
const { db } = require('../config/database');
const { withInheritedFields } = require('./accommodationInheritance');
const { canSendTemplate } = require('./emailEligibility');
const { localDay, addDays, daysBetween } = require('./dates');

const DEFAULT_COLOR = '#843424';
const CONFIRMED = ['confirmada', 'check_in', 'checkin', 'checked_in'];
const text = value => (typeof value === 'string' ? value.trim() : '');
const hexColor = value => (/^#[0-9a-f]{6}$/i.test(text(value)) ? text(value).toLowerCase() : '');

// Janela dos dados sensíveis: da véspera da entrada ao dia da saída, com a
// reserva confirmada e integralmente paga.
function accessWindow(reservation, today = localDay()) {
  const opensOn = reservation?.check_in ? addDays(reservation.check_in, -1) : '';
  const closesOn = reservation?.check_out || '';
  const inWindow = Boolean(opensOn && closesOn && today >= opensOn && today <= closesOn);
  const paid = canSendTemplate({ slug: 'codigo_porta' }, reservation);
  return { opensOn, closesOn, inWindow, paid, open: inWindow && paid };
}

function firstName(reservation) {
  const guest = db.prepare('SELECT first_name, name FROM guests WHERE id = ? AND organization_id = ?')
    .get(reservation.guest_id, reservation.organization_id);
  return text(guest?.first_name) || text(guest?.name).split(/\s+/)[0] || '';
}

function mapsUrl(address) {
  return address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : '';
}

function build(reservation, { now = new Date(), mediaUrl = value => value } = {}) {
  const today = localDay(now);
  const row = db.prepare('SELECT * FROM accommodations WHERE id = ? AND organization_id = ?')
    .get(reservation.accommodation_id, reservation.organization_id);
  if (!row) return null;
  const a = withInheritedFields(row, reservation.organization_id) || row;
  const parent = row.parent_id
    ? db.prepare('SELECT color, cover_image FROM accommodations WHERE id = ? AND organization_id = ?').get(row.parent_id, reservation.organization_id)
    : null;
  const settings = require('./emailService').getEmailSettings(row, reservation.organization_id);
  const status = reservation.status;
  const confirmed = CONFIRMED.includes(status);
  const stayInfo = confirmed || status === 'check_out';
  const window = accessWindow(reservation, today);
  const address = settings.property_address || '';
  const wifiConfigured = !settings.no_wifi && Boolean(text(a.wifi_password) || text(a.wifi_name));
  const codesConfigured = Boolean(text(a.door_code)) || wifiConfigured || Boolean(text(a.entry_instructions));

  const portal = {
    today,
    guest_first_name: firstName(reservation),
    // Cor da marca: a do alojamento principal (num quarto), senão a da unidade.
    color: hexColor(parent?.color) || hexColor(row.color) || DEFAULT_COLOR,
    logo_url: a.logo_url ? mediaUrl(a.logo_url) : '',
    // Capa: a da unidade, senão a do alojamento principal.
    cover_image: row.cover_image || parent?.cover_image ? mediaUrl(row.cover_image || parent.cover_image) : '',
    checkin_time: settings.checkin_time || '',
    checkout_time: settings.checkout_time || '',
    nights: Number(reservation.nights) || (reservation.check_in && reservation.check_out ? daysBetween(reservation.check_in, reservation.check_out) : 0),
    arrival_time: reservation.arrival_time || '',
    booking_url: settings.booking_url || '',
    review_url: status === 'check_out' || (reservation.check_out && today > reservation.check_out && status !== 'cancelada')
      ? settings.review_url || '' : '',
    no_wifi: Boolean(settings.no_wifi),
    // Como chegar e o dia da saída: só depois de a reserva estar confirmada.
    arrival: stayInfo ? {
      address,
      maps_url: mapsUrl(address),
      instructions: settings.arrival_instructions || '',
    } : null,
    checkout_steps: stayInfo
      ? String(settings.checkout_instructions || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean)
      : [],
    // Código da porta, Wi-Fi e como entrar: só dentro da janela.
    access: window.open ? {
      door_code: text(a.door_code) || '',
      entry_instructions: settings.entry_instructions || '',
      wifi_name: settings.no_wifi ? '' : text(a.wifi_name),
      wifi_password: settings.no_wifi ? '' : text(a.wifi_password),
    } : null,
    // Quando aparecem (sem os valores): para o hóspede saber o que esperar.
    access_opens_on: confirmed && !window.open && codesConfigured && today < window.opensOn ? window.opensOn : '',
  };
  return portal;
}

module.exports = { build, accessWindow, DEFAULT_COLOR };
