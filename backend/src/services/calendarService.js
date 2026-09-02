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
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 60 },
        ],
      },
    };

    const calendarId = await ensureAccommodationCalendar(auth, accommodation, organizationId);
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

// Garante que o alojamento tem um Google Calendar próprio (cria-o automaticamente
// à primeira sincronização) e que a cor desse calendário reflete accommodation.color.
// A Calendar API só aceita ~11 cores fixas por EVENTO, mas o calendário em si aceita
// qualquer hex via colorRgbFormat — por isso a cor é aplicada ao calendário, não ao evento.
async function ensureAccommodationCalendar(auth, accommodation, organizationId) {
  if (accommodation.google_calendar_id) {
    try {
      await auth.request({ url: `${CAL_BASE}/${encodeURIComponent(accommodation.google_calendar_id)}` });
      return accommodation.google_calendar_id;
    } catch { /* calendário apagado ou inacessível — recriar abaixo */ }
  }

  try {
    const { data } = await auth.request({
      url: CAL_BASE,
      method: 'POST',
      data: { summary: accommodation.name, timeZone: 'Europe/Lisbon' },
    });
    const calendarId = data.id;

    try {
      await auth.request({
        url: `https://www.googleapis.com/calendar/v3/users/me/calendarList/${encodeURIComponent(calendarId)}?colorRgbFormat=true`,
        method: 'PATCH',
        data: { backgroundColor: accommodation.color || '#843424', foregroundColor: '#ffffff' },
      });
    } catch (err) {
      console.error('Erro ao definir cor do calendário:', err.message);
    }

    db.prepare('UPDATE accommodations SET google_calendar_id = ? WHERE id = ? AND organization_id = ?')
      .run(calendarId, accommodation.id, organizationId);
    accommodation.google_calendar_id = calendarId;
    console.log(`📅 Calendário criado automaticamente para "${accommodation.name}": ${calendarId}`);
    return calendarId;
  } catch (err) {
    console.error('Erro ao criar calendário do alojamento:', err.message);
    return 'primary';
  }
}

// Recolore o calendário de um alojamento quando accommodation.color muda.
// Best-effort: usa qualquer ligação Google Calendar ativa da organização.
async function recolorAccommodationCalendar(accommodation) {
  if (!accommodation.google_calendar_id) return;
  const conn = db.prepare(
    'SELECT user_id FROM google_calendar_connections WHERE organization_id = ? LIMIT 1'
  ).get(accommodation.organization_id);
  if (!conn || !isAuthenticated(conn.user_id, accommodation.organization_id)) return;

  try {
    const auth = getAuthenticatedClient(conn.user_id, accommodation.organization_id);
    await auth.request({
      url: `https://www.googleapis.com/calendar/v3/users/me/calendarList/${encodeURIComponent(accommodation.google_calendar_id)}?colorRgbFormat=true`,
      method: 'PATCH',
      data: { backgroundColor: accommodation.color || '#843424', foregroundColor: '#ffffff' },
    });
  } catch (err) {
    console.error('Erro ao recolorir calendário do alojamento:', err.message);
  }
}

// Apaga do Google Calendar todos os eventos (reservas + tarefas) que este utilizador
// criou, e limpa as referências locais. Usado ao desligar a integração.
async function deleteAllSyncedEvents(userId, organizationId) {
  let deleted = 0;

  const reservations = db.prepare(`
    SELECT * FROM reservations
    WHERE organization_id = ? AND google_calendar_user_id = ? AND google_event_id IS NOT NULL
  `).all(organizationId, userId);
  for (const r of reservations) {
    await deleteCalendarEvent(r, { userId, organizationId });
    db.prepare('UPDATE reservations SET google_event_id = NULL, google_calendar_user_id = NULL WHERE id = ?').run(r.id);
    deleted++;
  }

  const tasks = db.prepare(`
    SELECT * FROM operational_events
    WHERE organization_id = ? AND google_calendar_user_id = ? AND google_event_id IS NOT NULL
  `).all(organizationId, userId);
  for (const t of tasks) {
    await deleteTaskCalendarEvent(t, { userId, organizationId });
    db.prepare('UPDATE operational_events SET google_event_id = NULL, google_calendar_user_id = NULL WHERE id = ?').run(t.id);
    deleted++;
  }

  return deleted;
}

function addOneHour(time) {
  const [h, m] = time.split(':').map(Number);
  return `${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const { EVENT_TYPE_EMOJIS: TASK_TYPE_ICONS, EVENT_TYPE_COLORS } = require('../config/eventTypes');

// Paleta fixa de cores de EVENTO da Calendar API (colorId 1-11) — não aceita hex livre,
// ao contrário da cor do calendário em si (ver ensureAccommodationCalendar acima).
const GOOGLE_EVENT_COLORS = {
  '1': '7986cb', '2': '33b679', '3': '8e24aa', '4': 'e67c73', '5': 'f6bf26',
  '6': 'f4511e', '7': '039be5', '8': '616161', '9': '3f51b5', '10': '0b8043', '11': 'd50000',
};

function hexToRgb(hex) {
  const clean = String(hex || '').replace('#', '');
  const n = parseInt(clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Aproxima uma cor hex arbitrária (ex.: a cor do tipo de evento na app) à cor de
// evento fixa mais próxima da Calendar API, para eventos sem alojamento associado
// (que ficam no calendário 'primary', partilhado — não têm calendário próprio a colorir).
function nearestGoogleColorId(hex) {
  const [r, g, b] = hexToRgb(hex);
  let best = '8', bestDist = Infinity;
  for (const [id, gHex] of Object.entries(GOOGLE_EVENT_COLORS)) {
    const [gr, gg, gb] = hexToRgb(gHex);
    const dist = (r - gr) ** 2 + (g - gg) ** 2 + (b - gb) ** 2;
    if (dist < bestDist) { bestDist = dist; best = id; }
  }
  return best;
}

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

    const calendarId = accommodation
      ? await ensureAccommodationCalendar(auth, accommodation, organizationId)
      : 'primary';
    // Sem alojamento não há calendário próprio a colorir — aproxima a cor do tipo
    // de evento (já usada na app) à cor de evento fixa mais próxima da API.
    const colorId = accommodation ? undefined : nearestGoogleColorId(EVENT_TYPE_COLORS[task.type]);
    const response = await auth.request({
      url: calUrl(calendarId),
      method: 'POST',
      data: {
        summary,
        description: [task.notes, task.responsible ? `Responsável: ${task.responsible}` : null].filter(Boolean).join('\n'),
        start: startEvt,
        end: endEvt,
        colorId,
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
    const colorId = accommodation ? undefined : nearestGoogleColorId(EVENT_TYPE_COLORS[task.type]);
    await auth.request({
      url: calUrl(calendarId, task.google_event_id),
      method: 'PUT',
      data: { summary, start: startEvt, end: endEvt, colorId },
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

async function deleteTaskCalendarEvent(task, calendarUser = {}) {
  const userId = calendarUser.userId || task.google_calendar_user_id;
  const organizationId = calendarUser.organizationId;
  if (!isAuthenticated(userId, organizationId) || !task.google_event_id) return;

  try {
    const auth = getAuthenticatedClient(userId, organizationId);
    const accommodation = task.accommodation_id
      ? db.prepare('SELECT * FROM accommodations WHERE id = ? AND organization_id = ?').get(task.accommodation_id, organizationId)
      : null;
    const calendarId = accommodation?.google_calendar_id || 'primary';

    await auth.request({ url: calUrl(calendarId, task.google_event_id), method: 'DELETE' });
    console.log(`🗑️  Evento de tarefa removido do Google Calendar: ${task.google_event_id}`);
  } catch (err) {
    console.error('Erro ao remover evento de tarefa:', err.message);
  }
}

module.exports = {
  createCalendarEvent, updateCalendarEvent, deleteCalendarEvent,
  createTaskCalendarEvent, updateTaskCalendarEvent, deleteTaskCalendarEvent,
  cleanDuplicateAppEvents,
  ensureAccommodationCalendar, recolorAccommodationCalendar, deleteAllSyncedEvents,
};
