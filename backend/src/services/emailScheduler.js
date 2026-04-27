const { db } = require('../config/database');
const { sendTemplatedEmail, getEmailSettings } = require('./emailService');
const crypto = require('crypto');

function getSendTime(reservation, template, settings) {
  const { timing_offset, timing_unit, timing_direction, timing_event } = template;
  let base;
  if (timing_event === 'checkin') {
    const [h = '15', m = '00'] = (settings.checkin_time || '15:00').split(':');
    base = new Date(`${reservation.check_in}T${h.padStart(2,'0')}:${m.padStart(2,'0')}:00`);
  } else if (timing_event === 'checkout') {
    const [h = '11', m = '00'] = (settings.checkout_time || '11:00').split(':');
    base = new Date(`${reservation.check_out}T${h.padStart(2,'0')}:${m.padStart(2,'0')}:00`);
  } else {
    return null;
  }
  const ms = (timing_offset || 0) * (timing_unit === 'days' ? 86400000 : 3600000);
  return new Date(timing_direction === 'before' ? base.getTime() - ms : base.getTime() + ms);
}

async function runScheduler() {
  if (process.env.EMAIL_ENABLED === 'false') return;
  try {
    const settings = getEmailSettings();
    const templates = db.prepare(
      "SELECT * FROM email_templates WHERE active=1 AND timing_event IN ('checkin','checkout')"
    ).all();
    if (!templates.length) return;

    const from = new Date(Date.now() - 8 * 86400000).toISOString().slice(0, 10);
    const to   = new Date(Date.now() + 31 * 86400000).toISOString().slice(0, 10);
    const reservations = db.prepare(`
      SELECT r.*, g.name as guest_name, g.email as guest_email, g.first_name,
             a.name as accommodation_name, a.wifi_name, a.wifi_password
      FROM reservations r
      JOIN guests g ON r.guest_id = g.id
      JOIN accommodations a ON r.accommodation_id = a.id
      WHERE r.status NOT IN ('cancelada') AND r.check_in >= ? AND r.check_out <= ?
    `).all(from, to);

    const now = new Date();
    for (const res of reservations) {
      if (!res.guest_email) continue;
      for (const tpl of templates) {
        const sendTime = getSendTime(res, tpl, settings);
        if (!sendTime || sendTime > now) continue;
        const already = db.prepare('SELECT 1 FROM email_log WHERE template_slug=? AND reservation_id=?').get(tpl.slug, res.id);
        if (already) continue;
        try {
          const guest = { name: res.guest_name, email: res.guest_email, first_name: res.first_name };
          const accom = { name: res.accommodation_name, wifi_name: res.wifi_name, wifi_password: res.wifi_password };
          await sendTemplatedEmail(tpl.slug, guest, res, accom);
          db.prepare('INSERT OR IGNORE INTO email_log (id,template_slug,reservation_id) VALUES (?,?,?)')
            .run(crypto.randomUUID(), tpl.slug, res.id);
          console.log(`📧 Email ${tpl.slug} → reserva ${res.id}`);
        } catch (e) {
          console.warn(`⚠️ Falha email ${tpl.slug} → ${res.id}:`, e.message);
        }
      }
    }
  } catch (e) {
    console.warn('⚠️ Erro email scheduler:', e.message);
  }
}

function startScheduler() {
  console.log('📅 Email scheduler iniciado (verifica de hora em hora)');
  runScheduler();
  setInterval(runScheduler, 60 * 60 * 1000);
}

module.exports = { startScheduler, runScheduler };
