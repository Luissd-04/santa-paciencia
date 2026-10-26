const { db } = require('../config/database');
// Emails pela estadia (ex.: 1 dia antes do check-in). Este agendador só decide
// quando estão na hora e emite «email.due»; o envio, as novas tentativas e a
// espera pela janela de envio do modelo são da fila de acontecimentos.
const { getEmailSettings, resolveAccommodationInheritance } = require('./emailService');
const { canSendTemplate } = require('./emailEligibility');
const { withSchedulerLease } = require('./schedulerLease');
const { localDateIso } = require('./reservationRules');
const reservationEvents = require('./reservationEvents');
const { zonedDateTime } = require('./dates');

function getSendTime(reservation, template, settings) {
  const { timing_offset, timing_unit, timing_direction, timing_event } = template;
  // Hora do check-in/check-out no fuso do alojamento, não no do servidor.
  let base;
  if (timing_event === 'checkin') base = zonedDateTime(reservation.check_in, settings.checkin_time || '15:00');
  else if (timing_event === 'checkout') base = zonedDateTime(reservation.check_out, settings.checkout_time || '11:00');
  else return null;
  const ms = (timing_offset || 0) * (timing_unit === 'days' ? 86400000 : 3600000);
  return new Date(timing_direction === 'before' ? base.getTime() - ms : base.getTime() + ms);
}

let running = false;
let timer = null;
async function runScheduler() {
  if (running) return;
  running = true;
  if (process.env.EMAIL_ENABLED === 'false') { running = false; return; }
  try {
    await withSchedulerLease(db, 'email', async ensureLease => {
    const orgs = db.prepare('SELECT id FROM organizations').all();
    const from = localDateIso(new Date(), -8);
    const to   = localDateIso(new Date(), 31);
    const now = new Date();

    for (const org of orgs) {
      const templates = db.prepare(
        "SELECT * FROM organization_email_templates WHERE organization_id=? AND active=1 AND timing_event IN ('checkin','checkout')"
      ).all(org.id);
      if (!templates.length) continue;

      const reservations = db.prepare(`
        SELECT r.*, g.name as guest_name, g.email as guest_email, g.first_name,
               a.name as accommodation_name, a.wifi_name, a.wifi_password, a.door_code, a.parent_id as accommodation_parent_id,
               a.social_facebook, a.social_instagram, a.social_website, a.logo_url
        FROM reservations r
        JOIN guests g ON r.guest_id = g.id
        JOIN accommodations a ON r.accommodation_id = a.id
        WHERE r.organization_id = ? AND r.status NOT IN ('cancelada')
          AND ((r.check_in >= ? AND r.check_in <= ?) OR (r.check_out >= ? AND r.check_out <= ?))
      `).all(org.id, from, to, from, to);

      for (const res of reservations) {
        if (!res.guest_email) continue;
        const effectiveAccommodation = resolveAccommodationInheritance(db.prepare('SELECT * FROM accommodations WHERE id=? AND organization_id=?').get(res.accommodation_id, org.id), org.id);
        const settings = getEmailSettings(effectiveAccommodation, org.id);
        for (const tpl of templates) {
          ensureLease();
          // A janela aplica-se à data de referência do modelo: uma estadia longa
          // entra pela saída, mas não deve receber um email de chegada antigo.
          const anchor = tpl.timing_event === 'checkin' ? res.check_in : res.check_out;
          if (anchor < from || anchor > to) continue;
          if (!canSendTemplate(tpl, res)) continue;
          const sendTime = getSendTime(res, tpl, settings);
          if (!sendTime || sendTime > now) continue;
          const already = db.prepare('SELECT 1 FROM organization_email_log WHERE organization_id=? AND template_slug=? AND reservation_id=?').get(org.id, tpl.slug, res.id);
          if (already) continue;
          // Uma vez por modelo e estadia: mudar as datas pede outro envio.
          reservationEvents.emitOnce('email.due', { organizationId: org.id, reservationId: res.id, payload: { slug: tpl.slug } },
            `${tpl.slug}:${res.check_in}:${res.check_out}`);
        }
      }
    }

    await reservationEvents.dispatchPending();
    });
    require('./opsStatus').beat('email');
  } catch (e) {
    require('./opsStatus').beat('email', e);
    console.warn('⚠️ Erro email scheduler:', e.message);
  } finally { running = false; }
}

function startScheduler() {
  if (timer) return;
  console.log('📅 Email scheduler iniciado (verifica de hora em hora)');
  runScheduler();
  timer = setInterval(runScheduler, 60 * 60 * 1000);
  timer.unref?.();
}

function stopScheduler() { clearInterval(timer); timer = null; }
module.exports = { startScheduler, stopScheduler, runScheduler, getSendTime };
