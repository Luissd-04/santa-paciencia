const { isAuthenticated } = require('../config/google');
const { db } = require('../config/database');
const { createCalendarEvent, updateCalendarEvent, cleanDuplicateAppEvents, syncOperationalEventsToGoogle,
        ensureAllAccommodationCalendars } = require('../services/calendarService');

const GCAL_SYNC_CALENDAR_KEY = 'gcal_sync_calendar';
const GCAL_SYNC_TASKS_KEY = 'gcal_sync_tasks';

function getOrgSetting(orgId, key) {
  const row = db.prepare('SELECT value FROM organization_settings WHERE organization_id = ? AND key = ?').get(orgId, key);
  return row?.value ?? null;
}

function setOrgSetting(orgId, key, value) {
  db.prepare(`
    INSERT OR REPLACE INTO organization_settings (organization_id, key, value, updated_at)
    VALUES (?, ?, ?, datetime('now'))
  `).run(orgId, key, value);
}

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
  res.json({ success: true });
}

function getStatus(req, res) {
  const connected = isAuthenticated(req.user.id, req.user.organization_id);
  const orgId = req.user.organization_id;

  const inCalendar = db.prepare(`
    SELECT COUNT(*) as count FROM reservations
    WHERE organization_id = ? AND google_calendar_user_id = ? AND google_event_id IS NOT NULL AND status != 'cancelada'
  `).get(orgId, req.user.id);

  const removed = db.prepare(`
    SELECT COUNT(*) as count FROM reservations
    WHERE organization_id = ? AND google_calendar_user_id = ? AND status = 'cancelada' AND google_event_id IS NOT NULL
  `).get(orgId, req.user.id);

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
      removed: removed.count,
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

  for (const r of reservations) {
    try {
      if (r.google_event_id && r.google_calendar_user_id === req.user.id) {
        const result = await updateCalendarEvent(r, { userId: req.user.id, organizationId: orgId });
        if (result === 'recreated') created++; else updated++;
      } else if (r.google_event_id && r.google_calendar_user_id && r.google_calendar_user_id !== req.user.id) {
        skipped++;
      } else {
        const eventId = await createCalendarEvent(r, { userId: req.user.id, organizationId: orgId });
        if (eventId) {
          db.prepare('UPDATE reservations SET google_event_id = ?, google_calendar_user_id = ? WHERE id = ? AND organization_id = ?')
            .run(eventId, req.user.id, r.id, orgId);
          created++;
        } else {
          errors++;
        }
      }
    } catch {
      errors++;
    }
  }

  const syncCalendar = getOrgSetting(orgId, GCAL_SYNC_CALENDAR_KEY) === '1';
  const syncTasks = getOrgSetting(orgId, GCAL_SYNC_TASKS_KEY) === '1';
  let taskCreated = 0, taskUpdated = 0, taskErrors = 0;

  if (syncCalendar || syncTasks) {
    const today = new Date().toISOString().slice(0, 10);
    const limit = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
    const tasks = db.prepare(`
      SELECT * FROM operational_events
      WHERE organization_id = ? AND date >= ? AND date <= ? AND status != 'concluido'
    `).all(orgId, today, limit);

    const result = await syncOperationalEventsToGoogle(tasks, { userId: req.user.id, organizationId: orgId });
    taskCreated = result.calendarCreated;
    taskUpdated = result.calendarUpdated;
    taskErrors = result.calendarErrors;
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
    const result = await cleanDuplicateAppEvents(req.user.id, orgId);
    if (result.error) return res.status(400).json({ error: result.error });
    res.json({ success: true, deleted: result.deleted });
  } catch (err) {
    next(err);
  }
}

module.exports = { getStatus, syncAll, getSettings, saveSettings, cleanDuplicates };
