const { getAuthenticatedClient, isAuthenticated } = require('../config/google');
const { db } = require('../config/database');

const CAL_BASE = 'https://www.googleapis.com/calendar/v3/calendars';

function calUrl(calendarId, ...parts) {
  return `${CAL_BASE}/${encodeURIComponent(calendarId)}/events${parts.length ? '/' + parts.join('/') : ''}`;
}

async function createCalendarEvent(reservation, calendarUser = {}) {
  const userId = calendarUser.userId || reservation.google_calendar_user_id;
  const organizationId = calendarUser.organizationId || reservation.organization_id;
  if (!isAuthenticated(userId, organizationId)) return null;

  try {
    const auth = getAuthenticatedClient(userId, organizationId);

    const guest = db.prepare('SELECT * FROM guests WHERE id = ?').get(reservation.guest_id);
    const accommodation = db.prepare('SELECT * FROM accommodations WHERE id = ?').get(reservation.accommodation_id);

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
      start: { date: reservation.check_in, timeZone: 'Europe/Lisbon' },
      end: { date: reservation.check_out, timeZone: 'Europe/Lisbon' },
      colorId: getColorForAccommodation(reservation.accommodation_id),
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 60 },
        ],
      },
    };

    const calendarId = accommodation.google_calendar_id || 'primary';
    const response = await auth.request({ url: calUrl(calendarId), method: 'POST', data: event });
    console.log(`📅 Evento criado no Google Calendar: ${response.data.id}`);
    return response.data.id;
  } catch (err) {
    console.error('Erro ao criar evento no Google Calendar:', err.message);
    return null;
  }
}

async function updateCalendarEvent(reservation, calendarUser = {}) {
  const userId = calendarUser.userId || reservation.google_calendar_user_id;
  const organizationId = calendarUser.organizationId || reservation.organization_id;
  if (!isAuthenticated(userId, organizationId) || !reservation.google_event_id) return;

  try {
    const auth = getAuthenticatedClient(userId, organizationId);
    const guest = db.prepare('SELECT * FROM guests WHERE id = ?').get(reservation.guest_id);
    const accommodation = db.prepare('SELECT * FROM accommodations WHERE id = ?').get(reservation.accommodation_id);
    const calendarId = accommodation.google_calendar_id || 'primary';

    await auth.request({
      url: calUrl(calendarId, reservation.google_event_id),
      method: 'PUT',
      data: {
        summary: `🏨 ${accommodation.name} — ${guest.name}`,
        description: `Reserva atualizada\nHóspede: ${guest.name}\nTotal: €${reservation.total_amount}`,
        start: { date: reservation.check_in, timeZone: 'Europe/Lisbon' },
        end: { date: reservation.check_out, timeZone: 'Europe/Lisbon' },
      },
    });
    console.log(`📅 Evento atualizado: ${reservation.google_event_id}`);
  } catch (err) {
    console.error('Erro ao atualizar evento:', err.message);
  }
}

async function deleteCalendarEvent(reservation, calendarUser = {}) {
  const userId = calendarUser.userId || reservation.google_calendar_user_id;
  const organizationId = calendarUser.organizationId || reservation.organization_id;
  if (!isAuthenticated(userId, organizationId) || !reservation.google_event_id) return;

  try {
    const auth = getAuthenticatedClient(userId, organizationId);
    const accommodation = db.prepare('SELECT * FROM accommodations WHERE id = ?').get(reservation.accommodation_id);
    const calendarId = accommodation.google_calendar_id || 'primary';

    await auth.request({ url: calUrl(calendarId, reservation.google_event_id), method: 'DELETE' });
    console.log(`🗑️  Evento removido do Google Calendar: ${reservation.google_event_id}`);
  } catch (err) {
    console.error('Erro ao remover evento:', err.message);
  }
}

function getColorForAccommodation(accommodationId) {
  const colors = {
    'suite-mezzanine-deluxe': '1',
    'suite-familiar-deluxe': '2',
    'suite-king-deluxe': '4',
    'suite-queen-deluxe': '6'
  };
  return colors[accommodationId] || '1';
}

function addOneHour(time) {
  const [h, m] = time.split(':').map(Number);
  return `${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const TASK_TYPE_ICONS = {
  limpeza: '🧹',
  reuniao: '👥',
  pequeno_almoco: '☕',
  checkin: '🏨',
  checkout: '🔑',
  manutencao: '🔧',
  outro: '📋',
};

async function createTaskCalendarEvent(task, calendarUser = {}) {
  const { userId, organizationId } = calendarUser;
  if (!isAuthenticated(userId, organizationId)) return null;

  try {
    const auth = getAuthenticatedClient(userId, organizationId);
    const accommodation = task.accommodation_id
      ? db.prepare('SELECT * FROM accommodations WHERE id = ?').get(task.accommodation_id)
      : null;

    const icon = TASK_TYPE_ICONS[task.type] || '📋';
    const summary = `${icon} ${task.title}${accommodation ? ' — ' + accommodation.name : ''}`;

    let startEvt, endEvt;
    if (task.start_time) {
      const endTime = task.end_time || addOneHour(task.start_time);
      startEvt = { dateTime: `${task.date}T${task.start_time}:00`, timeZone: 'Europe/Lisbon' };
      endEvt   = { dateTime: `${task.date}T${endTime}:00`,         timeZone: 'Europe/Lisbon' };
    } else {
      const nextDay = new Date(task.date + 'T12:00:00');
      nextDay.setDate(nextDay.getDate() + 1);
      startEvt = { date: task.date };
      endEvt   = { date: nextDay.toISOString().slice(0, 10) };
    }

    const calendarId = accommodation?.google_calendar_id || 'primary';
    const response = await auth.request({
      url: calUrl(calendarId),
      method: 'POST',
      data: {
        summary,
        description: [task.notes, task.responsible ? `Responsável: ${task.responsible}` : null].filter(Boolean).join('\n'),
        start: startEvt,
        end: endEvt,
      },
    });
    return response.data.id;
  } catch (err) {
    console.error('Erro ao criar evento de tarefa no Google Calendar:', err.message);
    return null;
  }
}

async function updateTaskCalendarEvent(task, calendarUser = {}) {
  const { userId, organizationId } = calendarUser;
  if (!isAuthenticated(userId, organizationId) || !task.google_event_id) return;

  try {
    const auth = getAuthenticatedClient(userId, organizationId);
    const accommodation = task.accommodation_id
      ? db.prepare('SELECT * FROM accommodations WHERE id = ?').get(task.accommodation_id)
      : null;

    const icon = TASK_TYPE_ICONS[task.type] || '📋';
    const summary = `${icon} ${task.title}${accommodation ? ' — ' + accommodation.name : ''}`;

    let startEvt, endEvt;
    if (task.start_time) {
      const endTime = task.end_time || addOneHour(task.start_time);
      startEvt = { dateTime: `${task.date}T${task.start_time}:00`, timeZone: 'Europe/Lisbon' };
      endEvt   = { dateTime: `${task.date}T${endTime}:00`,         timeZone: 'Europe/Lisbon' };
    } else {
      const nextDay = new Date(task.date + 'T12:00:00');
      nextDay.setDate(nextDay.getDate() + 1);
      startEvt = { date: task.date };
      endEvt   = { date: nextDay.toISOString().slice(0, 10) };
    }

    const calendarId = accommodation?.google_calendar_id || 'primary';
    await auth.request({
      url: calUrl(calendarId, task.google_event_id),
      method: 'PUT',
      data: { summary, start: startEvt, end: endEvt },
    });
  } catch (err) {
    console.error('Erro ao atualizar evento de tarefa:', err.message);
  }
}

module.exports = { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent, createTaskCalendarEvent, updateTaskCalendarEvent };
