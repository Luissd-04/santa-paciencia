const { isAuthenticated } = require('../config/google');
const { db } = require('../config/database');
const { createCalendarEvent, updateCalendarEvent } = require('../services/calendarService');

function getStatus(req, res) {
  const connected = isAuthenticated();

  const inCalendar = db.prepare(`
    SELECT COUNT(*) as count FROM reservations
    WHERE google_event_id IS NOT NULL AND status != 'cancelada'
  `).get();

  const removed = db.prepare(`
    SELECT COUNT(*) as count FROM reservations
    WHERE status = 'cancelada' AND google_event_id IS NOT NULL
  `).get();

  const total = db.prepare(`
    SELECT COUNT(*) as count FROM reservations WHERE status != 'cancelada'
  `).get();

  res.json({
    success: true,
    data: {
      connected,
      inCalendar: inCalendar.count,
      removed: removed.count,
      total: total.count,
      lastSync: connected ? new Date().toISOString() : null
    }
  });
}

async function syncAll(req, res) {
  if (!isAuthenticated()) {
    return res.status(400).json({ success: false, error: 'Google Calendar não está ligado.' });
  }

  const reservations = db.prepare(`
    SELECT * FROM reservations WHERE status != 'cancelada'
  `).all();

  let created = 0;
  let updated = 0;
  let errors  = 0;

  for (const r of reservations) {
    try {
      if (r.google_event_id) {
        await updateCalendarEvent(r);
        updated++;
      } else {
        const eventId = await createCalendarEvent(r);
        if (eventId) {
          db.prepare('UPDATE reservations SET google_event_id = ? WHERE id = ?').run(eventId, r.id);
          created++;
        } else {
          errors++;
        }
      }
    } catch (e) {
      errors++;
    }
  }

  res.json({ success: true, data: { created, updated, errors, total: reservations.length } });
}

module.exports = { getStatus, syncAll };