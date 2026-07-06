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

    const guest = db.prepare('SELECT * FROM guests WHERE id = ? AND organization_id = ?').get(reservation.guest_id, organizationId);
    const accommodation = db.prepare('SELECT * FROM accommodations WHERE id = ? AND organization_id = ?').get(reservation.accommodation_id, organizationId);

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
    const guest = db.prepare('SELECT * FROM guests WHERE id = ? AND organization_id = ?').get(reservation.guest_id, organizationId);
    const accommodation = db.prepare('SELECT * FROM accommodations WHERE id = ? AND organization_id = ?').get(reservation.accommodation_id, organizationId);
    const calendarId = accommodation.google_calendar_id || 'primary';

    await auth.request({
      url: calUrl(calendarId, reservation.google_event_id),
      method: 'PUT',
      data: {
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
    const accommodation = db.prepare('SELECT * FROM accommodations WHERE id = ? AND organization_id = ?').get(reservation.accommodation_id, organizationId);
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
  agenda_local: '🎉',
  outro: '📋',
};

async function createTaskCalendarEvent(task, calendarUser = {}) {
  const { userId, organizationId } = calendarUser;
  if (!isAuthenticated(userId, organizationId)) return null;

  try {
    const auth = getAuthenticatedClient(userId, organizationId);
    const accommodation = task.accommodation_id
      ? db.prepare('SELECT * FROM accommodations WHERE id = ? AND organization_id = ?').get(task.accommodation_id, organizationId)
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
      ? db.prepare('SELECT * FROM accommodations WHERE id = ? AND organization_id = ?').get(task.accommodation_id, organizationId)
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

// Remove eventos duplicados criados pela app (mesmo título + início), mantendo um.
// Usado pela ação manual "Limpar duplicados" para corrigir os órfãos deixados pelo
// bug antigo (apagar+recriar). Seguro: só toca em eventos com prefixo de ícone da app
// e só apaga duplicados EXATOS, preferindo manter o que está ligado localmente.
async function cleanDuplicateAppEvents(userId, organizationId) {
  if (!isAuthenticated(userId, organizationId)) {
    return { deleted: 0, error: 'Google Calendar não está ligado.' };
  }
  const auth = getAuthenticatedClient(userId, organizationId);
  const APP_ICONS = Object.values(TASK_TYPE_ICONS).concat(['🏨']); // ícones de tarefas + reserva

  const accCals = db.prepare(`
    SELECT DISTINCT google_calendar_id FROM accommodations
    WHERE organization_id = ? AND google_calendar_id IS NOT NULL AND google_calendar_id != ''
  `).all(organizationId).map(r => r.google_calendar_id);
  const calendars = [...new Set(['primary', ...accCals])];

  // Ids de eventos ainda referenciados localmente (para preferir mantê-los).
  const localIds = new Set(
    db.prepare(`
      SELECT google_event_id AS gid FROM operational_events WHERE organization_id = ? AND google_event_id IS NOT NULL
      UNION
      SELECT google_event_id AS gid FROM reservations WHERE organization_id = ? AND google_event_id IS NOT NULL
    `).all(organizationId, organizationId).map(r => r.gid)
  );

  const timeMin = new Date(Date.now() - 120 * 86400000).toISOString();
  const timeMax = new Date(Date.now() + 400 * 86400000).toISOString();
  let deleted = 0;

  for (const calendarId of calendars) {
    const groups = new Map(); // "summary|start" -> [event,...]
    let pageToken = null;
    try {
      do {
        let url = `${calUrl(calendarId)}?singleEvents=true&maxResults=2500`
          + `&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`;
        if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
        const resp = await auth.request({ url, method: 'GET' });
        for (const ev of (resp.data.items || [])) {
          const summary = ev.summary || '';
          if (!APP_ICONS.some(ic => summary.startsWith(ic))) continue;
          const start = ev.start?.dateTime || ev.start?.date || '';
          const key = `${summary}|${start}`;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(ev);
        }
        pageToken = resp.data.nextPageToken || null;
      } while (pageToken);
    } catch (err) {
      console.error(`Erro a listar eventos (${calendarId}):`, err.message);
      continue;
    }

    for (const evs of groups.values()) {
      if (evs.length < 2) continue;
      let keepIdx = evs.findIndex(e => localIds.has(e.id));
      if (keepIdx < 0) keepIdx = 0;
      for (let i = 0; i < evs.length; i++) {
        if (i === keepIdx) continue;
        try {
          await auth.request({ url: calUrl(calendarId, evs[i].id), method: 'DELETE' });
          deleted++;
        } catch (err) {
          console.error('Erro a apagar duplicado:', err.message);
        }
      }
    }
  }
  return { deleted };
}

module.exports = { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent, createTaskCalendarEvent, updateTaskCalendarEvent, cleanDuplicateAppEvents };
