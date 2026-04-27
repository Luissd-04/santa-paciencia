const { google } = require('googleapis');
const { getAuthenticatedClient, isAuthenticated } = require('../config/google');
const { db } = require('../config/database');

async function createCalendarEvent(reservation) {
  if (!isAuthenticated()) return null;

  try {
    const auth = getAuthenticatedClient();
    const calendar = google.calendar({ version: 'v3', auth });

    // Buscar dados do hóspede e alojamento
    const guest = db.prepare('SELECT * FROM guests WHERE id = ?').get(reservation.guest_id);
    const accommodation = db.prepare('SELECT * FROM accommodations WHERE id = ?')
      .get(reservation.accommodation_id);

    const event = {
      summary: `🏨 ${accommodation.name} — ${guest.name}`,
      description: [
        `Reserva ID: ${reservation.id}`,
        `Hóspede: ${guest.name}`,
        `Email: ${guest.email}`,
        `Telemóvel: ${guest.phone || 'N/A'}`,
        `Hóspedes: ${reservation.num_guests}`,
        `Canal: ${reservation.channel}`,
        `Total: €${reservation.total_amount}`,
        `Pagamento: ${reservation.payment_status}`,
        reservation.notes ? `Notas: ${reservation.notes}` : ''
      ].filter(Boolean).join('\n'),
      start: {
        date: reservation.check_in,
        timeZone: 'Europe/Lisbon'
      },
      end: {
        date: reservation.check_out,
        timeZone: 'Europe/Lisbon'
      },
      colorId: getColorForAccommodation(reservation.accommodation_id),
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 }, // 1 dia antes
          { method: 'popup', minutes: 60 }
        ]
      }
    };

    // Usar calendarId específico da suite (se configurado) ou 'primary'
    const calendarId = accommodation.google_calendar_id || 'primary';

    const response = await calendar.events.insert({
      calendarId,
      resource: event
    });

    console.log(`📅 Evento criado no Google Calendar: ${response.data.id}`);
    return response.data.id;

  } catch (err) {
    console.error('Erro ao criar evento no Google Calendar:', err.message);
    return null;
  }
}

async function updateCalendarEvent(reservation) {
  if (!isAuthenticated() || !reservation.google_event_id) return;

  try {
    const auth = getAuthenticatedClient();
    const calendar = google.calendar({ version: 'v3', auth });

    const guest = db.prepare('SELECT * FROM guests WHERE id = ?').get(reservation.guest_id);
    const accommodation = db.prepare('SELECT * FROM accommodations WHERE id = ?')
      .get(reservation.accommodation_id);

    const calendarId = accommodation.google_calendar_id || 'primary';

    await calendar.events.update({
      calendarId,
      eventId: reservation.google_event_id,
      resource: {
        summary: `🏨 ${accommodation.name} — ${guest.name}`,
        description: `Reserva atualizada\nHóspede: ${guest.name}\nTotal: €${reservation.total_amount}`,
        start: { date: reservation.check_in, timeZone: 'Europe/Lisbon' },
        end: { date: reservation.check_out, timeZone: 'Europe/Lisbon' }
      }
    });

    console.log(`📅 Evento atualizado: ${reservation.google_event_id}`);
  } catch (err) {
    console.error('Erro ao atualizar evento:', err.message);
  }
}

async function deleteCalendarEvent(reservation) {
  if (!isAuthenticated() || !reservation.google_event_id) return;

  try {
    const auth = getAuthenticatedClient();
    const calendar = google.calendar({ version: 'v3', auth });

    const accommodation = db.prepare('SELECT * FROM accommodations WHERE id = ?')
      .get(reservation.accommodation_id);

    const calendarId = accommodation.google_calendar_id || 'primary';

    await calendar.events.delete({
      calendarId,
      eventId: reservation.google_event_id
    });

    console.log(`🗑️  Evento removido do Google Calendar: ${reservation.google_event_id}`);
  } catch (err) {
    console.error('Erro ao remover evento:', err.message);
  }
}

function getColorForAccommodation(accommodationId) {
  const colors = {
    'suite-mezzanine-deluxe': '1',  // Lavanda
    'suite-familiar-deluxe': '2',   // Sage
    'suite-king-deluxe': '4',       // Flamingo
    'suite-queen-deluxe': '6'       // Tangerine
  };
  return colors[accommodationId] || '1';
}

module.exports = { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent };