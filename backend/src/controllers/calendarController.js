const { isAuthenticated } = require('../config/google');
const { db } = require('../config/database');

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

  res.json({
    success: true,
    data: {
      connected,
      inCalendar: inCalendar.count,
      removed: removed.count,
      lastSync: connected ? new Date().toISOString() : null
    }
  });
}

module.exports = { getStatus };