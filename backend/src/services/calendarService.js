const crypto = require('crypto');
const { getAuthenticatedClient, isAuthenticated } = require('../config/google');
const { db } = require('../config/database');
const { isTasksAuthenticated, syncOrganizationTasksToGoogleTasks } = require('../config/googleTasks');

const CAL_BASE = 'https://www.googleapis.com/calendar/v3/calendars';

function calUrl(calendarId, ...parts) {
  return `${CAL_BASE}/${encodeURIComponent(calendarId)}/events${parts.length ? '/' + parts.join('/') : ''}`;
}
const googleStatus = err => Number(err?.response?.status || err?.status || err?.code) || 0;
// Só o utilizador que ligou o seu Calendar: sem utilizador, config/google
// recorreria ao token legado de instância.
const hasCalendar = (userId, organizationId) => !!(userId && organizationId && isAuthenticated(userId, organizationId));

// ID de evento determinístico (o Google aceita 0-9 e a-v; hexadecimal serve).
// Repetir uma criação cuja resposta se perdeu devolve 409 em vez de duplicar.
function appEventId(kind, organizationId, entityId) {
  return 'sp' + crypto.createHash('sha256').update(`${kind}:${organizationId}:${entityId}`).digest('hex').slice(0, 40);
}

// Cria o evento com o ID da aplicação; se já existir (resposta anterior
// perdida, ou evento apagado que volta a ser necessário), atualiza-o e reativa-o.
async function insertOrAdopt(auth, calendarId, eventId, body) {
  try {
    await auth.request({ url: calUrl(calendarId), method: 'POST', data: { ...body, id: eventId } });
    return 'created';
  } catch (err) {
    if (googleStatus(err) !== 409) throw err;
    await auth.request({ url: calUrl(calendarId, eventId), method: 'PUT', data: { ...body, status: 'confirmed' } });
    return 'adopted';
  }
}

function reservationEventBody(reservation, guest, accommodation) {
  return {
    summary: `🏨 ${accommodation.name} — ${guest.name}`,
    description: [
      `Reserva ID: ${reservation.id}`,
      `Hóspede: ${guest.name}`,
      `Email: ${guest.email}`,
      `Telemóvel: ${guest.phone || 'N/A'}`,
      `Hóspedes: ${reservation.num_guests}`,
      `Canal: ${reservation.channel}`,
      `Total: ${require('./money').formatEUR(reservation.total_amount)}`,
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
}

// ── Fila durável ──
// Cada alteração local grava aqui a intenção, na mesma transação. O trabalho
// remoto corre depois, é repetido com espera crescente (também após reinício)
// e remove a linha só quando o Google confirmou. Uma remoção guarda o ID e o
// calendário do evento antes de a linha local deixar de os ter.
function queueCalendarUpsert(organizationId, entityType, entityId, userId = null) {
  if (!organizationId || !entityId) return;
  db.prepare(`INSERT INTO google_calendar_queue (organization_id, action, entity_type, entity_id, user_id)
    VALUES (?, 'upsert', ?, ?, ?)
    ON CONFLICT(organization_id, entity_type, entity_id) WHERE action = 'upsert'
    DO UPDATE SET user_id = COALESCE(excluded.user_id, user_id), revision = revision + 1,
      next_attempt_at = datetime('now'), updated_at = datetime('now')`).run(organizationId, entityType, entityId, userId);
}
function queueCalendarDelete(organizationId, { entityType, entityId, userId, calendarId, eventId }) {
  if (!organizationId || !eventId) return;
  db.prepare(`INSERT INTO google_calendar_queue (organization_id, action, entity_type, entity_id, user_id, calendar_id, google_event_id)
    VALUES (?, 'delete', ?, ?, ?, ?, ?)
    ON CONFLICT(organization_id, calendar_id, google_event_id) WHERE action = 'delete' DO NOTHING`)
    .run(organizationId, entityType, entityId, userId || null, calendarId || 'primary', eventId);
}
function accommodationCalendar(organizationId, accommodationId) {
  if (!accommodationId) return null;
  return db.prepare('SELECT google_calendar_id FROM accommodations WHERE id = ? AND organization_id = ?')
    .get(accommodationId, organizationId)?.google_calendar_id || null;
}
// Chamar dentro da transação que cancela/apaga a reserva.
function detachReservationEvent(organizationId, reservationId) {
  const row = db.prepare(`SELECT id, accommodation_id, google_event_id, google_calendar_user_id, google_event_calendar_id
    FROM reservations WHERE id = ? AND organization_id = ?`).get(reservationId, organizationId);
  if (!row?.google_event_id) return false;
  queueCalendarDelete(organizationId, { entityType: 'reservation', entityId: row.id, userId: row.google_calendar_user_id,
    calendarId: row.google_event_calendar_id || accommodationCalendar(organizationId, row.accommodation_id) || 'primary', eventId: row.google_event_id });
  // O utilizador fica: reativar volta a criar o evento no mesmo Calendar.
  db.prepare('UPDATE reservations SET google_event_id = NULL, google_event_calendar_id = NULL WHERE id = ? AND organization_id = ?')
    .run(reservationId, organizationId);
  return true;
}
// Chamar dentro da transação que apaga o evento operacional local.
function detachOperationalEvent(row) {
  if (!row?.google_event_id) return false;
  queueCalendarDelete(row.organization_id, { entityType: 'event', entityId: row.id, userId: row.google_calendar_user_id,
    calendarId: row.google_event_calendar_id || accommodationCalendar(row.organization_id, row.accommodation_id) || 'primary', eventId: row.google_event_id });
  return true;
}

async function deleteQueuedEvent(job) {
  if (!hasCalendar(job.user_id, job.organization_id)) throw Object.assign(new Error('Google Calendar desligado para o utilizador que criou o evento.'), { blocked: true });
  const auth = getAuthenticatedClient(job.user_id, job.organization_id);
  try {
    await auth.request({ url: calUrl(job.calendar_id, job.google_event_id), method: 'DELETE' });
  } catch (err) {
    if (![404, 410].includes(googleStatus(err))) throw err;
  }
  return 'deleted';
}

async function upsertQueuedReservation(job) {
  const organizationId = job.organization_id;
  const reservation = db.prepare('SELECT * FROM reservations WHERE id = ? AND organization_id = ?').get(job.entity_id, organizationId);
  if (!reservation) return 'skipped';
  if (reservation.status === 'cancelada') {
    db.transaction(() => detachReservationEvent(organizationId, reservation.id))();
    return 'skipped';
  }
  const userId = reservation.google_event_id ? reservation.google_calendar_user_id : (job.user_id || reservation.google_calendar_user_id);
  if (!hasCalendar(userId, organizationId)) return 'skipped';
  const auth = getAuthenticatedClient(userId, organizationId);
  const guest = db.prepare('SELECT * FROM guests WHERE id = ? AND organization_id = ?').get(reservation.guest_id, organizationId);
  const accommodation = db.prepare('SELECT * FROM accommodations WHERE id = ? AND organization_id = ?').get(reservation.accommodation_id, organizationId);
  if (!guest || !accommodation) return 'skipped';
  const target = await ensureAccommodationCalendar(auth, accommodation, organizationId);
  const body = reservationEventBody(reservation, guest, accommodation);
  if (reservation.google_event_id) {
    const current = reservation.google_event_calendar_id || accommodation.google_calendar_id || 'primary';
    if (current === target) {
      try {
        await auth.request({ url: calUrl(target, reservation.google_event_id), method: 'PUT', data: body });
        if (!reservation.google_event_calendar_id) {
          db.prepare('UPDATE reservations SET google_event_calendar_id = ? WHERE id = ? AND organization_id = ?').run(target, reservation.id, organizationId);
        }
        return 'updated';
      } catch (err) {
        if (googleStatus(err) !== 404) throw err;
        // Apagado à mão no Google: volta a ser criado (sem duplicar, ID fixo).
      }
    } else {
      // Mudou de alojamento: o evento antigo sai do calendário anterior.
      db.transaction(() => detachReservationEvent(organizationId, reservation.id))();
    }
  }
  const eventId = appEventId('reservation', organizationId, reservation.id);
  const outcome = await insertOrAdopt(auth, target, eventId, body);
  const saved = db.prepare(`UPDATE reservations SET google_event_id = ?, google_calendar_user_id = ?, google_event_calendar_id = ?
    WHERE id = ? AND organization_id = ? AND status != 'cancelada'`).run(eventId, userId, target, reservation.id, organizationId);
  // Cancelada ou apagada durante o pedido: o evento acabado de criar sai também.
  if (!saved.changes) queueCalendarDelete(organizationId, { entityType: 'reservation', entityId: reservation.id, userId, calendarId: target, eventId });
  return outcome === 'created' ? 'created' : 'recreated';
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
    } catch (err) {
      // Só recriar quando o calendário já não existe mesmo (404). Qualquer outro
      // erro (rede, rate-limit, falha momentânea a seguir a reconectar) é
      // transitório — recriar aqui criava um calendário duplicado desnecessário.
      if (err?.response?.status !== 404) {
        console.error(`Erro a verificar calendário de "${accommodation.name}" (a manter o existente):`, err.message);
        return accommodation.google_calendar_id;
      }
    }
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

    db.prepare('UPDATE accommodations SET google_calendar_id = ?, google_calendar_manual = 0 WHERE id = ? AND organization_id = ?')
      .run(calendarId, accommodation.id, organizationId);
    accommodation.google_calendar_id = calendarId;
    accommodation.google_calendar_manual = 0;
    console.log(`📅 Calendário criado automaticamente para "${accommodation.name}": ${calendarId}`);
    return calendarId;
  } catch (err) {
    console.error('Erro ao criar calendário do alojamento:', err.message);
    return 'primary';
  }
}

// Garante um calendário para TODOS os alojamentos da organização, incluindo os
// que ainda não têm reservas. ensureAccommodationCalendar() é lazy (só corre ao
// sincronizar um evento), pelo que o alojamento-pai — que também pode ser
// arrendado por inteiro — ficava sem calendário até à primeira reserva.
async function ensureAllAccommodationCalendars(userId, organizationId) {
  if (!isAuthenticated(userId, organizationId)) return { created: 0, errors: 0 };

  const rows = db.prepare(`
    SELECT * FROM accommodations
    WHERE organization_id = ?
      AND (google_calendar_id IS NULL OR google_calendar_id = '')
      AND (google_calendar_manual IS NULL OR google_calendar_manual = 0)
  `).all(organizationId);
  if (!rows.length) return { created: 0, errors: 0 };

  const auth = getAuthenticatedClient(userId, organizationId);
  let created = 0, errors = 0;
  for (const acc of rows) {
    try {
      const calendarId = await ensureAccommodationCalendar(auth, acc, organizationId);
      if (calendarId && calendarId !== 'primary') created++; else errors++;
    } catch (err) {
      console.error(`Erro a criar calendário de "${acc.name}":`, err.message);
      errors++;
    }
  }
  return { created, errors };
}

// Recolore o calendário de um alojamento quando accommodation.color muda.
// Best-effort: usa qualquer ligação Google Calendar ativa da organização.
// Não mexe em calendários ligados manualmente (google_calendar_manual) — o
// utilizador pode querer afinar a cor diretamente no Google Calendar.
async function recolorAccommodationCalendar(accommodation) {
  if (!accommodation.google_calendar_id || accommodation.google_calendar_manual) return;
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

// Ao desligar: apaga do Google Calendar os eventos (reservas + tarefas) deste
// utilizador, incluindo remoções pendentes na fila. Só esquece um ID local
// depois de o Google confirmar; se algo falhar, devolve `failed` e quem chama
// mantém a ligação para se poder repetir (nada fica órfão sem referência).
async function deleteAllSyncedEvents(userId, organizationId) {
  await processCalendarQueue(organizationId);
  let deleted = 0, failed = 0;
  const remove = async (calendarId, eventId) => {
    try { await deleteQueuedEvent({ user_id: userId, organization_id: organizationId, calendar_id: calendarId, google_event_id: eventId }); deleted++; return true; }
    catch (err) { failed++; console.error('Erro ao remover evento ao desligar o Google Calendar:', googleStatus(err) || err.message); return false; }
  };
  for (const r of db.prepare(`SELECT * FROM reservations WHERE organization_id = ? AND google_calendar_user_id = ? AND google_event_id IS NOT NULL`).all(organizationId, userId)) {
    const calendarId = r.google_event_calendar_id || accommodationCalendar(organizationId, r.accommodation_id) || 'primary';
    if (await remove(calendarId, r.google_event_id)) {
      db.prepare('UPDATE reservations SET google_event_id = NULL, google_calendar_user_id = NULL, google_event_calendar_id = NULL WHERE id = ? AND organization_id = ?').run(r.id, organizationId);
    }
  }
  for (const t of db.prepare(`SELECT * FROM operational_events WHERE organization_id = ? AND google_calendar_user_id = ? AND google_event_id IS NOT NULL`).all(organizationId, userId)) {
    const calendarId = t.google_event_calendar_id || accommodationCalendar(organizationId, t.accommodation_id) || 'primary';
    if (await remove(calendarId, t.google_event_id)) {
      db.prepare('UPDATE operational_events SET google_event_id = NULL, google_calendar_user_id = NULL, google_event_calendar_id = NULL WHERE id = ? AND organization_id = ?').run(t.id, organizationId);
    }
  }
  failed += db.prepare("SELECT COUNT(*) AS n FROM google_calendar_queue WHERE organization_id = ? AND user_id = ? AND action = 'delete'").get(organizationId, userId).n;
  if (!failed) db.prepare("DELETE FROM google_calendar_queue WHERE organization_id = ? AND user_id = ? AND action = 'upsert'").run(organizationId, userId);
  return { deleted, failed };
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

function taskEventBody(task, accommodation) {
  const icon = TASK_TYPE_ICONS[task.type] || '📋';
  let start, end;
  if (task.start_time) {
    const endTime = task.end_time || addOneHour(task.start_time);
    start = { dateTime: `${task.date}T${task.start_time}:00`, timeZone: 'Europe/Lisbon' };
    end   = { dateTime: `${task.date}T${endTime}:00`,         timeZone: 'Europe/Lisbon' };
  } else {
    const nextDay = new Date(task.date + 'T12:00:00');
    nextDay.setDate(nextDay.getDate() + 1);
    start = { date: task.date };
    end   = { date: nextDay.toISOString().slice(0, 10) };
  }
  return {
    summary: `${icon} ${task.title}${accommodation ? ' — ' + accommodation.name : ''}`,
    description: [task.notes, task.responsible ? `Responsável: ${task.responsible}` : null].filter(Boolean).join('\n'),
    start, end,
    // Sem alojamento não há calendário próprio a colorir — aproxima a cor do tipo
    // de evento (já usada na app) à cor de evento fixa mais próxima da API.
    colorId: accommodation ? undefined : nearestGoogleColorId(EVENT_TYPE_COLORS[task.type]),
  };
}

async function upsertQueuedOperationalEvent(job) {
  const organizationId = job.organization_id;
  const task = db.prepare('SELECT * FROM operational_events WHERE id = ? AND organization_id = ?').get(job.entity_id, organizationId);
  if (!task || !getOrgSyncSetting(organizationId, GCAL_SYNC_CALENDAR_KEY)) return 'skipped';
  const userId = task.google_event_id ? task.google_calendar_user_id : job.user_id;
  if (!hasCalendar(userId, organizationId)) return 'skipped';
  const auth = getAuthenticatedClient(userId, organizationId);
  const accommodation = task.accommodation_id
    ? db.prepare('SELECT * FROM accommodations WHERE id = ? AND organization_id = ?').get(task.accommodation_id, organizationId)
    : null;
  const target = accommodation ? await ensureAccommodationCalendar(auth, accommodation, organizationId) : 'primary';
  const body = taskEventBody(task, accommodation);
  if (task.google_event_id) {
    const current = task.google_event_calendar_id || accommodation?.google_calendar_id || 'primary';
    if (current === target) {
      try {
        await auth.request({ url: calUrl(target, task.google_event_id), method: 'PUT', data: body });
        if (!task.google_event_calendar_id) {
          db.prepare('UPDATE operational_events SET google_event_calendar_id = ? WHERE id = ? AND organization_id = ?').run(target, task.id, organizationId);
        }
        return 'updated';
      } catch (err) {
        if (googleStatus(err) !== 404) throw err;
      }
    } else {
      db.transaction(() => {
        detachOperationalEvent(task);
        db.prepare('UPDATE operational_events SET google_event_id = NULL, google_event_calendar_id = NULL WHERE id = ? AND organization_id = ?').run(task.id, organizationId);
      })();
    }
  }
  const eventId = appEventId('event', organizationId, task.id);
  const outcome = await insertOrAdopt(auth, target, eventId, body);
  const saved = db.prepare(`UPDATE operational_events SET google_event_id = ?, google_calendar_user_id = ?, google_event_calendar_id = ?
    WHERE id = ? AND organization_id = ?`).run(eventId, userId, target, task.id, organizationId);
  if (!saved.changes) queueCalendarDelete(organizationId, { entityType: 'event', entityId: task.id, userId, calendarId: target, eventId });
  return outcome === 'created' ? 'created' : 'recreated';
}

const BACKOFF_MAX_MINUTES = 360;
const queueRuns = new Map();

async function runCalendarQueue(organizationId) {
  const results = [];
  for (let batch = 0; batch < 20; batch++) {
    const jobs = db.prepare(`SELECT * FROM google_calendar_queue
      WHERE organization_id = ? AND next_attempt_at <= datetime('now') AND id NOT IN (${results.map(() => '?').join(',') || "''"})
      ORDER BY CASE action WHEN 'delete' THEN 0 ELSE 1 END, id LIMIT 25`).all(organizationId, ...results.map(r => r.id));
    if (!jobs.length) break;
    for (const job of jobs) {
      try {
        const outcome = job.action === 'delete' ? await deleteQueuedEvent(job)
          : job.entity_type === 'reservation' ? await upsertQueuedReservation(job) : await upsertQueuedOperationalEvent(job);
        // Uma alteração local feita durante o pedido incrementa a revisão: fica para a próxima passagem.
        db.prepare('DELETE FROM google_calendar_queue WHERE id = ? AND revision = ?').run(job.id, job.revision);
        results.push({ id: job.id, action: job.action, entity_type: job.entity_type, entity_id: job.entity_id, outcome });
      } catch (err) {
        const status = googleStatus(err);
        const message = (status ? `HTTP ${status}` : String(err.message || err.code || 'erro')).slice(0, 200);
        const minutes = err.blocked ? BACKOFF_MAX_MINUTES : Math.min(BACKOFF_MAX_MINUTES, 2 ** Math.min(job.attempts, 9));
        db.prepare(`UPDATE google_calendar_queue SET attempts = attempts + 1, last_error = ?,
          next_attempt_at = datetime('now', ?), updated_at = datetime('now') WHERE id = ?`).run(message, `+${minutes} minutes`, job.id);
        console.error(`Google Calendar: ${job.action} de ${job.entity_type} adiado (${message}); nova tentativa em ${minutes} min.`);
        results.push({ id: job.id, action: job.action, entity_type: job.entity_type, entity_id: job.entity_id, outcome: 'error', error: message });
      }
    }
  }
  return results;
}

// Execuções da mesma organização são sequenciais; um pedido feito durante uma
// passagem encadeia outra (pode ter entrado trabalho depois da leitura).
function processCalendarQueue(organizationId) {
  if (!organizationId) return Promise.resolve([]);
  if (queueRuns.has(organizationId)) return queueRuns.get(organizationId).then(() => processCalendarQueue(organizationId));
  const run = runCalendarQueue(organizationId).finally(() => queueRuns.delete(organizationId));
  queueRuns.set(organizationId, run);
  return run;
}
// Depois de gravar localmente: não bloqueia a resposta; a fila garante a repetição.
function kickCalendarQueue(organizationId) {
  Promise.resolve().then(() => processCalendarQueue(organizationId))
    .catch(err => console.error('Erro ao processar a fila do Google Calendar:', err.message));
}
async function processAllCalendarQueues() {
  const orgs = db.prepare("SELECT DISTINCT organization_id FROM google_calendar_queue WHERE next_attempt_at <= datetime('now')").all();
  const totals = { done: 0, errors: 0 };
  for (const { organization_id: organizationId } of orgs) {
    for (const result of await processCalendarQueue(organizationId)) result.outcome === 'error' ? totals.errors++ : totals.done++;
  }
  return totals;
}
function calendarQueueStatus(organizationId) {
  return db.prepare(`SELECT COUNT(*) AS pending, SUM(CASE WHEN attempts > 0 THEN 1 ELSE 0 END) AS failing,
    SUM(CASE WHEN action = 'delete' THEN 1 ELSE 0 END) AS deletions, MIN(created_at) AS oldest
    FROM google_calendar_queue WHERE organization_id = ?`).get(organizationId);
}

// Remove eventos duplicados criados pela app (mesmo título + início), mantendo um.
// Usado pela ação manual "Limpar duplicados" para corrigir os órfãos deixados pelo
// bug antigo (apagar+recriar). Seguro: só toca em eventos com prefixo de ícone da app
// e só apaga duplicados EXATOS, preferindo manter o que está ligado localmente.
// Pré-visualização obrigatória: `preview` só lista; apagar exige `expected` igual
// ao número de duplicados encontrados nesse momento (senão nada é apagado).
async function cleanDuplicateAppEvents(userId, organizationId, { preview = true, expected = null } = {}) {
  if (!hasCalendar(userId, organizationId)) {
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
  const candidates = [];

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
      // Sem a lista completa não é seguro decidir o que é duplicado.
      return { deleted: 0, error: `Não foi possível listar um calendário (${googleStatus(err) || 'erro de ligação'}). Nada foi apagado.` };
    }

    for (const evs of groups.values()) {
      if (evs.length < 2) continue;
      let keepIdx = evs.findIndex(e => localIds.has(e.id));
      if (keepIdx < 0) keepIdx = 0;
      evs.forEach((ev, i) => {
        if (i !== keepIdx && !localIds.has(ev.id)) {
          candidates.push({ calendarId, id: ev.id, summary: ev.summary || '', start: ev.start?.dateTime || ev.start?.date || '' });
        }
      });
    }
  }
  const sample = candidates.slice(0, 20).map(({ summary, start }) => ({ summary, start }));
  if (preview) return { preview: true, count: candidates.length, sample };
  if (expected === null || Number(expected) !== candidates.length) {
    return { deleted: 0, count: candidates.length, sample, error: 'Os duplicados mudaram desde a pré-visualização. Reveja a lista antes de apagar.' };
  }
  let deleted = 0, failed = 0;
  for (const ev of candidates) {
    try {
      await auth.request({ url: calUrl(ev.calendarId, ev.id), method: 'DELETE' });
      deleted++;
    } catch (err) {
      if ([404, 410].includes(googleStatus(err))) { deleted++; continue; }
      failed++;
      console.error('Erro a apagar duplicado:', googleStatus(err) || err.message);
    }
  }
  return { deleted, failed };
}

const GCAL_SYNC_CALENDAR_KEY = 'gcal_sync_calendar';
const GCAL_SYNC_TASKS_KEY = 'gcal_sync_tasks';

function getOrgSyncSetting(organizationId, key) {
  return require('./settingsService').get(organizationId, key) === '1';
}

// Sincroniza eventos operacionais (check-in/check-out/limpeza/tarefas — qualquer
// tipo, ver eventTypes.js) com o Google Calendar e/ou o Google Tasks, cada um gated
// pela sua própria definição de organização. Ponto único partilhado por
// eventController.js (create/update de um evento), reservationController.js (tarefas
// auto-geradas de uma reserva) e calendarController.js (botão "Sincronizar agora"),
// que antes duplicavam esta lógica com o mesmo par de flags — e o de "Sincronizar
// agora" nunca chegava a acionar o Google Tasks. As reservas em si (o evento da
// estadia) não passam por aqui — continuam sempre automáticas, à parte destas duas
// definições.
async function syncOperationalEventsToGoogle(tasks, { userId, organizationId }) {
  const list = Array.isArray(tasks) ? tasks.filter(Boolean) : [tasks].filter(Boolean);

  let calendarCreated = 0, calendarUpdated = 0, calendarErrors = 0;

  if (getOrgSyncSetting(organizationId, GCAL_SYNC_CALENDAR_KEY) && hasCalendar(userId, organizationId)) {
    // Eventos ligados ao Calendar de outro utilizador ficam com esse utilizador.
    const ids = new Set();
    db.transaction(() => {
      for (const task of list) {
        if (task.google_event_id && task.google_calendar_user_id !== userId) continue;
        queueCalendarUpsert(organizationId, 'event', task.id, userId);
        ids.add(task.id);
      }
    })();
    if (ids.size) {
      for (const result of await processCalendarQueue(organizationId)) {
        if (result.entity_type !== 'event' || result.action !== 'upsert' || !ids.has(result.entity_id)) continue;
        if (result.outcome === 'error') calendarErrors++;
        else if (result.outcome === 'updated') calendarUpdated++;
        else if (result.outcome !== 'skipped') calendarCreated++;
      }
    }
  }

  let tasksCreated = 0, tasksUpdated = 0, tasksErrors = 0;
  if (getOrgSyncSetting(organizationId, GCAL_SYNC_TASKS_KEY) && isTasksAuthenticated(organizationId)) {
    try {
      const result = await syncOrganizationTasksToGoogleTasks(organizationId);
      tasksCreated = result.created;
      tasksUpdated = result.updated;
      tasksErrors = result.errors;
    } catch (err) {
      tasksErrors++;
      console.error('Erro ao sincronizar com o Google Tasks:', err.message);
    }
  }

  return { calendarCreated, calendarUpdated, calendarErrors, tasksCreated, tasksUpdated, tasksErrors };
}

module.exports = {
  queueCalendarUpsert, queueCalendarDelete, detachReservationEvent, detachOperationalEvent,
  processCalendarQueue, kickCalendarQueue, processAllCalendarQueues, calendarQueueStatus, appEventId,
  cleanDuplicateAppEvents, syncOperationalEventsToGoogle,
  ensureAccommodationCalendar, ensureAllAccommodationCalendars,
  recolorAccommodationCalendar, deleteAllSyncedEvents,
};
