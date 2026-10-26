const { isAuthenticated } = require('../config/google');
const { db } = require('../config/database');
const { localDateIso } = require('../services/reservationRules');
const { queueCalendarUpsert, processCalendarQueue, calendarQueueStatus, cleanDuplicateAppEvents, syncOperationalEventsToGoogle,
        ensureAllAccommodationCalendars } = require('../services/calendarService');

const GCAL_SYNC_CALENDAR_KEY = 'gcal_sync_calendar';
const GCAL_SYNC_TASKS_KEY = 'gcal_sync_tasks';

const getOrgSetting = (orgId, key) => require('../services/settingsService').get(orgId, key);
const setOrgSetting = (orgId, key, value) => require('../services/settingsService').set(orgId, key, value);

function getSettings(req, res) {
  const orgId = req.user.organization_id;
  const syncCalendar = getOrgSetting(orgId, GCAL_SYNC_CALENDAR_KEY) === '1';
  const syncTasks = getOrgSetting(orgId, GCAL_SYNC_TASKS_KEY) === '1';
  res.json({ success: true, data: { syncCalendar, syncTasks } });
}

function saveSettings(req, res) {
  const orgId = req.user.organization_id;
  if (req.body.syncCalendar !== undefined) {
    setOrgSetting(orgId, GCAL_SYNC_CALENDAR_KEY, req.body.syncCalendar ? '1' : '0');
  }
  if (req.body.syncTasks !== undefined) {
    setOrgSetting(orgId, GCAL_SYNC_TASKS_KEY, req.body.syncTasks ? '1' : '0');
  }
  syncOperationalEventsToGoogle([], { userId: req.user.id, organizationId: orgId })
    .catch(err => console.error('Erro ao aplicar definições de sincronização:', err.message));
  res.json({ success: true });
}

function getStatus(req, res) {
  const connected = isAuthenticated(req.user.id, req.user.organization_id);
  const orgId = req.user.organization_id;

  const inCalendar = db.prepare(`
    SELECT COUNT(*) as count FROM reservations
    WHERE organization_id = ? AND google_calendar_user_id = ? AND google_event_id IS NOT NULL AND status != 'cancelada'
  `).get(orgId, req.user.id);

  // Remoções pedidas (reservas canceladas/apagadas) que o Google ainda não confirmou.
  const queue = calendarQueueStatus(orgId);

  const total = db.prepare(`
    SELECT COUNT(*) as count FROM reservations WHERE organization_id = ? AND status != 'cancelada'
  `).get(orgId);

  const syncCalendar = getOrgSetting(orgId, GCAL_SYNC_CALENDAR_KEY) === '1';
  const syncTasks = getOrgSetting(orgId, GCAL_SYNC_TASKS_KEY) === '1';

  const tasksInCalendar = syncCalendar ? db.prepare(`
    SELECT COUNT(*) as count FROM operational_events
    WHERE organization_id = ? AND google_event_id IS NOT NULL AND status != 'concluido'
  `).get(orgId).count : null;

  res.json({
    success: true,
    data: {
      connected,
      inCalendar: inCalendar.count,
      removed: queue.deletions || 0,
      queue: { pending: queue.pending || 0, failing: queue.failing || 0, oldest: queue.oldest || null },
      total: total.count,
      lastSync: connected ? new Date().toISOString() : null,
      syncCalendar,
      syncTasks,
      tasksInCalendar,
    }
  });
}

async function syncAll(req, res) {
  if (!isAuthenticated(req.user.id, req.user.organization_id)) {
    return res.status(400).json({ success: false, error: 'Google Calendar não está ligado.' });
  }

  const orgId = req.user.organization_id;

  // Criar calendários em falta ANTES de sincronizar eventos: assim também os
  // alojamentos ainda sem reservas (p.ex. o alojamento completo) ficam visíveis
  // no Google Calendar e prontos a receber reservas.
  let calendarsCreated = 0;
  try {
    const r = await ensureAllAccommodationCalendars(req.user.id, orgId);
    calendarsCreated = r.created;
  } catch (err) {
    console.error('Erro a criar calendários em falta:', err.message);
  }

  const reservations = db.prepare(`
    SELECT * FROM reservations WHERE organization_id = ? AND status != 'cancelada'
  `).all(orgId);

  let created = 0, updated = 0, skipped = 0, errors = 0;

  // Tudo passa pela fila durável: o que falhar agora é repetido mais tarde.
  const queued = new Set();
  db.transaction(() => {
    for (const r of reservations) {
      if (r.google_event_id && r.google_calendar_user_id && r.google_calendar_user_id !== req.user.id) { skipped++; continue; }
      queueCalendarUpsert(orgId, 'reservation', r.id, req.user.id);
      queued.add(r.id);
    }
  })();
  for (const result of await processCalendarQueue(orgId)) {
    if (result.entity_type !== 'reservation' || result.action !== 'upsert' || !queued.has(result.entity_id)) continue;
    if (result.outcome === 'error') errors++;
    else if (result.outcome === 'updated') updated++;
    else if (result.outcome === 'skipped') skipped++;
    else created++;
  }

  const syncCalendar = getOrgSetting(orgId, GCAL_SYNC_CALENDAR_KEY) === '1';
  const syncTasks = getOrgSetting(orgId, GCAL_SYNC_TASKS_KEY) === '1';
  let taskCreated = 0, taskUpdated = 0, taskErrors = 0;

  if (syncCalendar || syncTasks) {
    const today = localDateIso();
    const limit = localDateIso(new Date(), 60);
    const tasks = db.prepare(`
      SELECT * FROM operational_events
      WHERE organization_id = ? AND date >= ? AND date <= ?
    `).all(orgId, today, limit);

    const result = await syncOperationalEventsToGoogle(tasks, { userId: req.user.id, organizationId: orgId });
    taskCreated = result.calendarCreated + result.tasksCreated;
    taskUpdated = result.calendarUpdated + result.tasksUpdated;
    taskErrors = result.calendarErrors + result.tasksErrors;
  }

  res.json({
    success: true,
    data: { created, updated, skipped, errors, total: reservations.length, calendarsCreated, taskCreated, taskUpdated, taskErrors, syncCalendar, syncTasks }
  });
}

// POST /api/calendar/clean-duplicates — remove eventos duplicados do Google (órfãos antigos).
async function cleanDuplicates(req, res, next) {
  try {
    const orgId = req.user.organization_id;
    if (!isAuthenticated(req.user.id, orgId)) {
      return res.status(400).json({ error: 'Google Calendar não está ligado.' });
    }
    // Primeiro pré-visualização; apagar exige confirmar o número mostrado.
    const confirm = req.body?.confirm === true;
    const result = await cleanDuplicateAppEvents(req.user.id, orgId, { preview: !confirm, expected: confirm ? req.body.expected : null });
    if (result.error) return res.status(confirm && result.count !== undefined ? 409 : 400).json({ error: result.error, count: result.count, sample: result.sample });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

module.exports = { getStatus, syncAll, getSettings, saveSettings, cleanDuplicates };
