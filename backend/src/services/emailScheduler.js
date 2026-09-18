const { db } = require('../config/database');
const { sendTemplatedEmail, getEmailSettings } = require('./emailService');
const crypto = require('crypto');
const { canSendTemplate } = require('./emailEligibility');

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

let running = false;
let timer = null;
async function runScheduler() {
  if (running) return;
  running = true;
  if (process.env.EMAIL_ENABLED === 'false') { running = false; return; }
  try {
    const orgs = db.prepare('SELECT id FROM organizations').all();
    const from = new Date(Date.now() - 8 * 86400000).toISOString().slice(0, 10);
    const to   = new Date(Date.now() + 31 * 86400000).toISOString().slice(0, 10);
    const now = new Date();

    for (const org of orgs) {
      const templates = db.prepare(
        "SELECT * FROM organization_email_templates WHERE organization_id=? AND active=1 AND timing_event IN ('checkin','checkout')"
      ).all(org.id);
      if (!templates.length) continue;

      const settings = getEmailSettings(null, org.id);
      const reservations = db.prepare(`
        SELECT r.*, g.name as guest_name, g.email as guest_email, g.first_name,
               a.name as accommodation_name, a.wifi_name, a.wifi_password, a.door_code, a.parent_id as accommodation_parent_id,
               a.social_facebook, a.social_instagram, a.social_website
        FROM reservations r
        JOIN guests g ON r.guest_id = g.id
        JOIN accommodations a ON r.accommodation_id = a.id
        WHERE r.organization_id = ? AND r.status NOT IN ('cancelada') AND r.check_in >= ? AND r.check_out <= ?
      `).all(org.id, from, to);

      for (const res of reservations) {
        if (!res.guest_email) continue;
        for (const tpl of templates) {
          if (!canSendTemplate(tpl, res)) continue;
          const sendTime = getSendTime(res, tpl, settings);
          if (!sendTime || sendTime > now) continue;
          const already = db.prepare('SELECT 1 FROM organization_email_log WHERE organization_id=? AND template_slug=? AND reservation_id=?').get(org.id, tpl.slug, res.id);
          if (already) continue;
          try {
            const guest = { name: res.guest_name, email: res.guest_email, first_name: res.first_name };
            const accom = {
              name: res.accommodation_name, wifi_name: res.wifi_name, wifi_password: res.wifi_password, door_code: res.door_code,
              social_facebook: res.social_facebook, social_instagram: res.social_instagram, social_website: res.social_website,
              parent_id: res.accommodation_parent_id, organization_id: org.id,
            };
            const result = await sendTemplatedEmail(tpl.slug, guest, res, accom);
            if (!result || result.queued) continue; // adiado para a janela de envio — organization_email_queue trata do reenvio
            db.prepare('INSERT OR IGNORE INTO organization_email_log (id,organization_id,template_slug,reservation_id) VALUES (?,?,?,?)')
              .run(crypto.randomUUID(), org.id, tpl.slug, res.id);
            console.log(`📧 Email ${tpl.slug} → reserva ${res.id} (org ${org.id})`);
          } catch (e) {
            console.warn(`⚠️ Falha email ${tpl.slug} → ${res.id}:`, e.message);
          }
        }
      }
    }

    await flushQueuedEmails();
  } catch (e) {
    console.warn('⚠️ Erro email scheduler:', e.message);
  } finally { running = false; }
}

// Reenvia emails adiados por estarem fora da janela horária configurada,
// assim que a janela do respetivo template voltar a estar aberta.
async function flushQueuedEmails() {
  const pending = db.prepare('SELECT * FROM organization_email_queue').all();
  for (const q of pending) {
    try {
      const res = db.prepare(`
        SELECT r.*, g.name as guest_name, g.email as guest_email, g.first_name,
               a.name as accommodation_name, a.wifi_name, a.wifi_password, a.door_code, a.parent_id as accommodation_parent_id,
               a.social_facebook, a.social_instagram, a.social_website
        FROM reservations r
        JOIN guests g ON r.guest_id = g.id
        JOIN accommodations a ON r.accommodation_id = a.id
        WHERE r.id = ? AND r.organization_id = ?
      `).get(q.reservation_id, q.organization_id);

      if (!res || !res.guest_email || (res.status === 'cancelada' && q.template_slug !== 'cancelamento')) {
        db.prepare('DELETE FROM organization_email_queue WHERE id=?').run(q.id);
        continue;
      }

      const guest = { name: res.guest_name, email: res.guest_email, first_name: res.first_name };
      const accom = {
        name: res.accommodation_name, wifi_name: res.wifi_name, wifi_password: res.wifi_password, door_code: res.door_code,
        social_facebook: res.social_facebook, social_instagram: res.social_instagram, social_website: res.social_website,
        parent_id: res.accommodation_parent_id, organization_id: q.organization_id,
      };
      const tpl = db.prepare('SELECT * FROM organization_email_templates WHERE organization_id=? AND slug=? AND active=1').get(q.organization_id, q.template_slug);
      if (!tpl || !canSendTemplate(tpl, res)) continue;
      const result = await sendTemplatedEmail(q.template_slug, guest, res, accom);
      if (result && !result.queued) {
        db.prepare('DELETE FROM organization_email_queue WHERE id=?').run(q.id);
        if (result) console.log(`📧 Email ${q.template_slug} → reserva ${res.id} (fila, org ${q.organization_id})`);
      }
    } catch (e) {
      console.warn(`⚠️ Falha ao esvaziar fila de email ${q.template_slug} → ${q.reservation_id}:`, e.message);
    }
  }
}

function startScheduler() {
  if (timer) return;
  console.log('📅 Email scheduler iniciado (verifica de hora em hora)');
  runScheduler();
  timer = setInterval(runScheduler, 60 * 60 * 1000);
  timer.unref?.();
}

function stopScheduler() { clearInterval(timer); timer = null; }
module.exports = { startScheduler, stopScheduler, runScheduler };
